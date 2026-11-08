#include "pipeline/sql_dialect_profile.h"

#include "cbm.h"
#include "sql_dialect.h"

#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SQL_PROFILE_SCAN_MAX = 256 * 1024, SQL_PROFILE_DIALECT_MAX = 32 };

typedef struct {
    int file_index;
    char *dir;
    CBMSqlDialectCandidate candidates[CBM_SQL_DIALECT_CANDIDATE_MAX];
    int candidate_count;
} FileSignal;

typedef struct {
    char *path;
    const char *dialect;
} ScopeVote;

typedef struct {
    char *path;
    unsigned scores[SQL_PROFILE_DIALECT_MAX];
} LeafScore;

typedef struct {
    char *path;
    const char *dialect;
} ScopeRule;

struct CBMSqlDialectProfile {
    int file_count;
    const cbm_file_info_t *files; /* borrowed for the profile lifetime */
    const char **hints;
    const char **sources;
    const char **directories;
    ScopeRule *configs;
    int config_count;
    const char *ranked[SQL_PROFILE_DIALECT_MAX];
    int ranked_count;
    ScopeRule *rules;
    int rule_count;
};

static char *path_dir(const char *path) {
    const char *slash = path ? strrchr(path, '/') : NULL;
    size_t n = slash ? (size_t)(slash - path) : 0;
    char *out = malloc(n + 1);
    if (!out) return NULL;
    if (n) memcpy(out, path, n);
    out[n] = '\0';
    return out;
}

static char *scan_prefix(const char *path, size_t *len) {
    *len = 0;
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    char *buf = malloc(SQL_PROFILE_SCAN_MAX + 1);
    if (!buf) { fclose(f); return NULL; }
    *len = fread(buf, 1, SQL_PROFILE_SCAN_MAX, f);
    fclose(f);
    buf[*len] = '\0';
    return buf;
}

extern const TSLanguage *tree_sitter_json(void);
extern const TSLanguage *tree_sitter_yaml(void);
extern const TSLanguage *tree_sitter_toml(void);

static const char *canonical_dialect(const char *value) {
    static const char *names[] = {"spark", "databricks", "hive", "snowflake", "bigquery",
        "postgres", "redshift", "mysql", "oracle", "tsql", "duckdb", "sqlite",
        "trino", "presto", "clickhouse", "teradata", "doris", "starrocks"};
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++)
        if (!strcmp(value, names[i])) return names[i];
    if (!strcmp(value, "sqlserver") || !strcmp(value, "mssql")) return "tsql";
    if (!strcmp(value, "postgresql")) return "postgres";
    return NULL;
}

/* Exact scalar text only; never search adjacent properties or comment text. */
static bool scalar_text(const char *text, size_t len, char *out, size_t cap) {
    while (len && isspace((unsigned char)*text)) { text++; len--; }
    while (len && isspace((unsigned char)text[len - 1])) len--;
    if (len >= 2 && ((*text == '"' && text[len - 1] == '"') ||
                     (*text == '\'' && text[len - 1] == '\''))) { text++; len -= 2; }
    if (!len || len >= cap) return false;
    for (size_t i = 0; i < len; i++) out[i] = (char)tolower((unsigned char)text[i]);
    out[len] = '\0';
    return true;
}

static void accept_setting(const char *key, const char *value,
                           const char **winner, bool *conflict) {
    if (strcmp(key, "dialect") && strcmp(key, "sql_dialect") && strcmp(key, "sql-dialect")) return;
    const char *dialect = canonical_dialect(value);
    if (!dialect) return;
    if (*winner && strcmp(*winner, dialect)) *conflict = true;
    else *winner = dialect;
}

static const char *config_declared_dialect(const cbm_file_info_t *file) {
    if (!file->rel_path || !file->path) return NULL;
    const char *ext = strrchr(file->rel_path, '.');
    if (!ext) return NULL;
    const TSLanguage *language = !strcmp(ext, ".json") ? tree_sitter_json() :
        (!strcmp(ext, ".yml") || !strcmp(ext, ".yaml")) ? tree_sitter_yaml() :
        !strcmp(ext, ".toml") ? tree_sitter_toml() : NULL;
    bool simple = !strcmp(ext, ".ini") || !strcmp(ext, ".properties");
    if (!language && !simple) return NULL;
    size_t len = 0;
    char *text = scan_prefix(file->path, &len);
    if (!text) return NULL;
    const char *winner = NULL;
    bool conflict = false;
    if (language) {
        TSParser *parser = ts_parser_new();
        if (parser && ts_parser_set_language(parser, language)) {
            TSTree *tree = ts_parser_parse_string(parser, NULL, text, (uint32_t)len);
            if (tree && !ts_node_has_error(ts_tree_root_node(tree))) {
                TSTreeCursor cursor = ts_tree_cursor_new(ts_tree_root_node(tree));
                for (;;) {
                    TSNode node = ts_tree_cursor_current_node(&cursor);
                    TSNode key = (ts_node_child_by_field_name)(node, "key", 3);
                    TSNode value = (ts_node_child_by_field_name)(node, "value", 5);
                    /* The bundled TOML grammar names pair children but has
                     * no field IDs. Comments remain separate nodes. */
                    if (!strcmp(ext, ".toml") && !strcmp(ts_node_type(node), "pair")) {
                        key = ts_node_named_child(node, 0);
                        value = ts_node_named_child(node, 1);
                    }
                    char k[64], v[64];
                    if (!ts_node_is_null(key) && !ts_node_is_null(value) &&
                        scalar_text(text + ts_node_start_byte(key),
                            ts_node_end_byte(key) - ts_node_start_byte(key), k, sizeof(k)) &&
                        scalar_text(text + ts_node_start_byte(value),
                            ts_node_end_byte(value) - ts_node_start_byte(value), v, sizeof(v)))
                        accept_setting(k, v, &winner, &conflict);
                    if (ts_tree_cursor_goto_first_child(&cursor)) continue;
                    while (!ts_tree_cursor_goto_next_sibling(&cursor))
                        if (!ts_tree_cursor_goto_parent(&cursor)) goto walked;
                }
walked:
                ts_tree_cursor_delete(&cursor);
            }
            ts_tree_delete(tree);
        }
        ts_parser_delete(parser);
    } else {
        /* INI/properties: a setting occupies one line; comments are not values. */
        for (char *line = text; line && *line;) {
            char *next = strchr(line, '\n');
            if (next) *next++ = '\0';
            while (isspace((unsigned char)*line)) line++;
            if (*line && *line != '#' && *line != ';' && *line != '[') {
                char *eq = strchr(line, '=');
                if (!eq && simple) eq = strchr(line, ':');
                if (eq) {
                    char k[64], v[64], *end = eq + 1;
                    char quote = 0;
                    while (*end) {
                        if ((*end == '"' || *end == '\'') && (!quote || quote == *end))
                            quote = quote ? 0 : *end;
                        if (!quote && (*end == '#' || *end == ';')) break;
                        end++;
                    }
                    if (scalar_text(line, (size_t)(eq - line), k, sizeof(k)) &&
                        scalar_text(eq + 1, (size_t)(end - eq - 1), v, sizeof(v)))
                        accept_setting(k, v, &winner, &conflict);
                }
            }
            line = next;
        }
    }
    free(text);
    return conflict ? NULL : winner;
}

static const char *configured_for_path(const CBMSqlDialectProfile *p, const char *path) {
    const char *winner = NULL;
    size_t best = 0;
    bool found = false, conflict = false;
    for (int i = 0; i < p->config_count; i++) {
        size_t n = strlen(p->configs[i].path);
        if (n && (strncmp(path, p->configs[i].path, n) || path[n] != '/')) continue;
        if (!found || n > best) {
            winner = p->configs[i].dialect; best = n; conflict = false; found = true;
        } else if (n == best && strcmp(winner, p->configs[i].dialect)) conflict = true;
    }
    return conflict ? NULL : winner;
}

static int file_signal_cmp(const void *a, const void *b) {
    const FileSignal *x = a, *y = b;
    return strcmp(x->dir, y->dir);
}

static int scope_vote_cmp(const void *a, const void *b) {
    const ScopeVote *x = a, *y = b;
    int c = strcmp(x->path, y->path);
    return c ? c : strcmp(x->dialect, y->dialect);
}

static int rule_cmp(const void *a, const void *b) {
    const ScopeRule *x = a, *y = b;
    return strcmp(x->path, y->path);
}

static int dialect_slot(const char **names, int *count, const char *name) {
    for (int i = 0; i < *count; i++) if (strcmp(names[i], name) == 0) return i;
    if (*count >= SQL_PROFILE_DIALECT_MAX) return -1;
    names[*count] = name;
    return (*count)++;
}

static const char *pick_winner(const unsigned *scores, const char **names, int count,
                               const unsigned *global) {
    const char *best = NULL;
    unsigned best_score = 0, best_global = 0;
    for (int i = 0; i < count; i++) {
        if (!scores[i]) continue;
        if (!best || scores[i] > best_score ||
            (scores[i] == best_score && global && global[i] > best_global) ||
            (scores[i] == best_score && (!global || global[i] == best_global) &&
             strcmp(names[i], best) < 0)) {
            best = names[i];
            best_score = scores[i];
            best_global = global ? global[i] : 0;
        }
    }
    return best;
}

static const char *pick_unique_winner(const unsigned *scores, const char **names, int count) {
    const char *best = NULL;
    unsigned top = 0;
    int tied = 0;
    for (int i = 0; i < count; i++) {
        if (scores[i] > top) {
            top = scores[i];
            best = names[i];
            tied = 1;
        } else if (scores[i] && scores[i] == top) {
            tied++;
        }
    }
    return tied == 1 ? best : NULL;
}

static bool unique_file_signal(const FileSignal *s) {
    return s->candidate_count > 0 &&
           (s->candidate_count == 1 || s->candidates[0].score > s->candidates[1].score);
}

static const ScopeRule *find_rule(const CBMSqlDialectProfile *p, const char *dir) {
    ScopeRule key = {.path = (char *)dir};
    return bsearch(&key, p->rules, (size_t)p->rule_count, sizeof(*p->rules), rule_cmp);
}

CBMSqlDialectProfile *cbm_sql_dialect_profile_build(const cbm_file_info_t *files,
                                                    int file_count) {
    const char *override = getenv("CBM_SQL_DIALECT");
    if (!files || file_count <= 0 || (override && *override)) return NULL;
    CBMSqlDialectProfile *p = calloc(1, sizeof(*p));
    if (!p) return NULL;
    p->file_count = file_count;
    p->files = files;
    p->hints = calloc((size_t)file_count, sizeof(*p->hints));
    p->sources = calloc((size_t)file_count, sizeof(*p->sources));
    p->directories = calloc((size_t)file_count, sizeof(*p->directories));
    p->configs = calloc((size_t)file_count, sizeof(*p->configs));
    FileSignal *signals = calloc((size_t)file_count, sizeof(*signals));
    int signal_count = 0;
    if (!p->hints || !p->sources || !p->directories || !p->configs || !signals) goto fail;
    for (int i = 0; i < file_count; i++) {
        const char *dialect = config_declared_dialect(&files[i]);
        if (!dialect) continue;
        char *dir = path_dir(files[i].rel_path);
        if (dir) p->configs[p->config_count++] = (ScopeRule){dir, dialect};
    }

    const char *dialects[SQL_PROFILE_DIALECT_MAX] = {0};
    int dialect_count = 0;
    for (int i = 0; i < file_count; i++) {
        if (files[i].language != CBM_LANG_SQL) continue;
        FileSignal *s = &signals[signal_count++];
        s->file_index = i;
        s->dir = path_dir(files[i].rel_path);
        size_t len = 0;
        char *source = scan_prefix(files[i].path, &len);
        if (source) {
            s->candidate_count = cbm_sql_dialect_candidates(source, len, s->candidates);
            free(source);
        }
        const char *configured = configured_for_path(p, files[i].rel_path);
        if (configured) {
            s->candidate_count = 1;
            s->candidates[0] = (CBMSqlDialectCandidate){configured, 1};
        }
        for (int j = 0; j < s->candidate_count; j++)
            (void)dialect_slot(dialects, &dialect_count, s->candidates[j].name);
    }
    if (!signal_count || !dialect_count) goto done;
    qsort(signals, (size_t)signal_count, sizeof(*signals), file_signal_cmp);

    /* One leaf directory casts one project-level vote, regardless of how many
     * generated SQL files it contains. */
    unsigned global[SQL_PROFILE_DIALECT_MAX] = {0};
    LeafScore *leaf_scores = calloc((size_t)signal_count, sizeof(*leaf_scores));
    if (!leaf_scores) goto done;
    int leaf_count = 0;
    for (int begin = 0; begin < signal_count;) {
        int end = begin + 1;
        while (end < signal_count && strcmp(signals[begin].dir, signals[end].dir) == 0) end++;
        unsigned scores[SQL_PROFILE_DIALECT_MAX] = {0};
        for (int i = begin; i < end; i++) for (int j = 0; j < signals[i].candidate_count; j++) {
            int slot = dialect_slot(dialects, &dialect_count, signals[i].candidates[j].name);
            if (slot >= 0) scores[slot] += signals[i].candidates[j].score;
        }
        LeafScore *leaf = &leaf_scores[leaf_count++];
        leaf->path = strdup(signals[begin].dir);
        memcpy(leaf->scores, scores, sizeof(scores));
        const char *winner = pick_unique_winner(scores, dialects, dialect_count);
        if (winner) {
            int slot = dialect_slot(dialects, &dialect_count, winner);
            if (slot >= 0) global[slot]++;
        }
        begin = end;
    }

    /* Only unambiguous directory votes establish project popularity. */
    for (int i = 0; i < dialect_count; i++) {
        if (!global[i]) continue;
        int at = p->ranked_count;
        while (at > 0) {
            int prev = dialect_slot(dialects, &dialect_count, p->ranked[at - 1]);
            if (global[prev] > global[i] || (global[prev] == global[i] &&
                                           strcmp(p->ranked[at - 1], dialects[i]) < 0)) break;
            p->ranked[at] = p->ranked[at - 1]; at--;
        }
        p->ranked[at] = dialects[i]; p->ranked_count++;
    }
    ScopeVote *leaf = calloc((size_t)leaf_count, sizeof(*leaf));
    if (!leaf) {
        for (int i = 0; i < leaf_count; i++) free(leaf_scores[i].path);
        free(leaf_scores);
        goto done;
    }
    int voting_leaf_count = 0;
    for (int i = 0; i < leaf_count; i++) {
        const char *winner = pick_winner(leaf_scores[i].scores, dialects, dialect_count, global);
        if (winner)
            leaf[voting_leaf_count++] = (ScopeVote){leaf_scores[i].path, winner};
        else
            free(leaf_scores[i].path);
    }
    free(leaf_scores);
    leaf_count = voting_leaf_count;

    /* Expand each leaf vote to its ancestors, then reduce equal paths. */
    int vote_cap = leaf_count * 8 + 1, vote_count = 0;
    ScopeVote *votes = calloc((size_t)vote_cap, sizeof(*votes));
    if (!votes) {
        for (int i = 0; i < leaf_count; i++) free(leaf[i].path);
        free(leaf);
        goto done;
    }
    for (int i = 0; i < leaf_count; i++) {
        char *path = strdup(leaf[i].path);
        for (;;) {
            if (vote_count == vote_cap) {
                vote_cap *= 2;
                ScopeVote *grown = realloc(votes, (size_t)vote_cap * sizeof(*votes));
                if (!grown) { free(path); break; }
                votes = grown;
            }
            votes[vote_count++] = (ScopeVote){strdup(path), leaf[i].dialect};
            char *slash = strrchr(path, '/');
            if (!slash) {
                if (!path[0]) break;
                path[0] = '\0';
            } else {
                *slash = '\0';
            }
        }
        free(path);
        free(leaf[i].path);
    }
    free(leaf);
    qsort(votes, (size_t)vote_count, sizeof(*votes), scope_vote_cmp);
    p->rules = calloc((size_t)vote_count, sizeof(*p->rules));
    if (!p->rules) {
        for (int i = 0; i < vote_count; i++) free(votes[i].path);
        free(votes);
        goto done;
    }
    for (int begin = 0; begin < vote_count;) {
        int end = begin + 1;
        while (end < vote_count && strcmp(votes[begin].path, votes[end].path) == 0) end++;
        unsigned scores[SQL_PROFILE_DIALECT_MAX] = {0};
        for (int i = begin; i < end; i++) {
            int slot = dialect_slot(dialects, &dialect_count, votes[i].dialect);
            if (slot >= 0) scores[slot]++;
        }
        const char *winner = pick_winner(scores, dialects, dialect_count, global);
        p->rules[p->rule_count++] = (ScopeRule){strdup(votes[begin].path), winner};
        for (int i = begin; i < end; i++) free(votes[i].path);
        begin = end;
    }
    free(votes);
    qsort(p->rules, (size_t)p->rule_count, sizeof(*p->rules), rule_cmp);

    /* Keep only divergence points.  A child with the same winner as its
     * parent inherits that rule and does not need another path mapping. */
    bool *keep = calloc((size_t)p->rule_count, sizeof(*keep));
    if (keep) {
        for (int i = 0; i < p->rule_count; i++) {
            keep[i] = true;
            if (!p->rules[i].path[0]) continue;
            char *parent = path_dir(p->rules[i].path);
            const ScopeRule *parent_rule = parent ? find_rule(p, parent) : NULL;
            if (parent_rule && strcmp(parent_rule->dialect, p->rules[i].dialect) == 0)
                keep[i] = false;
            free(parent);
        }
        int out = 0;
        for (int i = 0; i < p->rule_count; i++) {
            if (keep[i]) p->rules[out++] = p->rules[i];
            else free(p->rules[i].path);
        }
        p->rule_count = out;
        free(keep);
    }

    for (int i = 0; i < signal_count; i++) {
        FileSignal *s = &signals[i];
        char *scope = strdup(s->dir);
        const ScopeRule *directory = NULL;
        while (scope && !(directory = find_rule(p, scope)) && scope[0]) {
            char *slash = strrchr(scope, '/');
            if (slash) *slash = '\0'; else scope[0] = '\0';
        }
        p->directories[s->file_index] = directory ? directory->dialect : NULL;
        free(scope);
        if (unique_file_signal(s)) {
            p->hints[s->file_index] = s->candidates[0].name;
            p->sources[s->file_index] = "syntax";
        } else {
            char *dir = strdup(s->dir);
            const ScopeRule *rule = NULL;
            while (dir && !(rule = find_rule(p, dir)) && dir[0]) {
                char *slash = strrchr(dir, '/');
                if (slash) *slash = '\0'; else dir[0] = '\0';
            }
            if (rule) {
                p->hints[s->file_index] = rule->dialect;
                p->sources[s->file_index] = "directory";
            } else if (s->candidate_count) {
                unsigned scores[SQL_PROFILE_DIALECT_MAX] = {0};
                for (int j = 0; j < s->candidate_count; j++) {
                    int slot = dialect_slot(dialects, &dialect_count, s->candidates[j].name);
                    if (slot >= 0) scores[slot] = s->candidates[j].score;
                }
                p->hints[s->file_index] = pick_winner(scores, dialects, dialect_count, global);
                p->sources[s->file_index] = "project-majority";
            }
            free(dir);
        }
    }

done:
    for (int i = 0; i < file_count; i++) {
        if (files[i].language != CBM_LANG_SQL) continue;
        const char *configured = configured_for_path(p, files[i].rel_path);
        if (configured) {
            p->hints[i] = configured;
            p->directories[i] = configured;
            p->sources[i] = "config";
        }
    }
    for (int i = 0; i < signal_count; i++) free(signals[i].dir);
    free(signals);
    return p;
fail:
    free(signals);
    cbm_sql_dialect_profile_free(p);
    return NULL;
}

const char *cbm_sql_dialect_profile_hint(const CBMSqlDialectProfile *profile, int file_index,
                                         const char **source) {
    if (source) *source = NULL;
    if (!profile || file_index < 0 || file_index >= profile->file_count) return NULL;
    if (source) *source = profile->sources[file_index];
    return profile->hints[file_index];
}

const char *cbm_sql_dialect_profile_hint_path(const CBMSqlDialectProfile *profile,
                                              const char *rel_path, const char **source) {
    if (source) *source = NULL;
    if (!profile || !rel_path) return NULL;
    for (int i = 0; i < profile->file_count; i++) {
        if (profile->files[i].rel_path && strcmp(profile->files[i].rel_path, rel_path) == 0)
            return cbm_sql_dialect_profile_hint(profile, i, source);
    }
    return NULL;
}

void cbm_sql_dialect_profile_free(CBMSqlDialectProfile *profile) {
    if (!profile) return;
    for (int i = 0; i < profile->rule_count; i++) free(profile->rules[i].path);
    free(profile->rules);
    free(profile->hints);
    free(profile->sources);
    free(profile->directories);
    for (int i = 0; i < profile->config_count; i++) free(profile->configs[i].path);
    free(profile->configs);
    free(profile);
}

void cbm_sql_dialect_profile_apply_path(const CBMSqlDialectProfile *profile, const char *rel_path) {
    cbm_sql_dialect_hint_set(NULL, NULL);
    if (!profile || !rel_path) return;
    for (int i = 0; i < profile->file_count; i++) {
        if (!profile->files[i].rel_path || strcmp(profile->files[i].rel_path, rel_path)) continue;
        cbm_sql_dialect_hint_set(profile->hints[i], profile->sources[i]);
        cbm_sql_dialect_preferences_set(profile->directories[i], profile->ranked, profile->ranked_count);
        return;
    }
}
