/*
 * pass_configlink.c — Config ↔ Code linking strategies (pre-dump pass).
 *
 * Three strategies link config files to code symbols:
 *   1. Key→Symbol: normalized config key matches code function/variable name
 *   2. Dep→Import: package manifest dependency matches IMPORTS edge target
 *   3. Config→file: path variants carry concrete caller contexts. Config uses
 *      get contextual bindings; SQL uses are resolved only on a query snapshot.
 *
 * Operates on the graph buffer before dump to .db file.
 */
#include "pipeline/pipeline.h"
#include "pipeline/pipeline_internal.h"
#include "graph_buffer/graph_buffer.h"
#include "foundation/hash_table.h"
#include "foundation/arena.h"
#include "foundation/log.h"
#include "foundation/compat.h"

#include <stdint.h>
#include <stdio.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include "foundation/platform.h" /* cbm_default_worker_count */
#include "pipeline/worker_pool.h"
#include "foundation/compat_regex.h"
#include "foundation/str_util.h"
#include "foundation/sha256.h"
#include "yyjson/yyjson.h"

/* ── Config link confidence scores ───────────────────────────────── */
/* Strategy 1: Key→Symbol matching */
#define CONF_KEY_EXACT 0.85
#define CONF_KEY_SUBSTRING 0.75
/* Strategy 2: Dep→Import matching */
#define CONF_DEP_EXACT 0.95
#define CONF_DEP_QN_SUBSTR 0.80

/* ── Manifest / dep section tables ──────────────────────────────── */

static bool is_manifest_file(const char *basename) {
    static const char *names[] = {"Cargo.toml",       "package.json",  "go.mod",
                                  "requirements.txt", "Gemfile",       "build.gradle",
                                  "pom.xml",          "composer.json", NULL};
    for (int i = 0; names[i]; i++) {
        if (strcmp(basename, names[i]) == 0) {
            return true;
        }
    }
    return false;
}

static bool is_dep_section(const char *s) {
    static const char *secs[] = {"dependencies",     "devdependencies",    "peerdependencies",
                                 "dev-dependencies", "build-dependencies", NULL};
    for (int i = 0; secs[i]; i++) {
        if (cbm_strcasestr(s, secs[i]) != NULL) {
            return true;
        }
    }
    return false;
}

/* ── Strategy 1: Config Key → Code Symbol ───────────────────────── */

/* Canonical candidate order (determinism). The label indexes the collectors
 * walk are gbuf insertion order = parallel-extraction merge order, which
 * varies run to run. Sorting by a pure content key first keeps the candidate
 * order -- and so the order edges are inserted in -- a function of the inputs
 * rather than of worker scheduling. (The collectors once stopped at a cap,
 * where this order also decided WHICH candidates survived; no cap cuts them
 * now.) Tie-breaks stay content-only: node ids are handed out in merge order,
 * so an id tie-break belongs in no canonical comparator. */
enum {
    CANON_CMP_LESS = -1,  /* qsort: left sorts before right */
    CANON_CMP_GREATER = 1 /* qsort: left sorts after right */
};

static int cmp_node_ptr_canonical(const void *pa, const void *pb) {
    const cbm_gbuf_node_t *a = *(const cbm_gbuf_node_t *const *)pa;
    const cbm_gbuf_node_t *b = *(const cbm_gbuf_node_t *const *)pb;
    const char *qa = a->qualified_name ? a->qualified_name : "";
    const char *qb = b->qualified_name ? b->qualified_name : "";
    int r = strcmp(qa, qb);
    if (r != 0) {
        return r;
    }
    const char *fa = a->file_path ? a->file_path : "";
    const char *fb = b->file_path ? b->file_path : "";
    r = strcmp(fa, fb);
    if (r != 0) {
        return r;
    }
    if (a->start_line != b->start_line) {
        return a->start_line < b->start_line ? CANON_CMP_LESS : CANON_CMP_GREATER;
    }
    const char *na = a->name ? a->name : "";
    const char *nb = b->name ? b->name : "";
    return strcmp(na, nb);
}

/* Heap copy of `nodes` sorted by cmp_node_ptr_canonical. Returns NULL (and
 * leaves the caller on the unsorted borrowed array) only on allocation
 * failure, which degrades determinism but never correctness. */
static const cbm_gbuf_node_t **canonical_node_copy(const cbm_gbuf_node_t *const *nodes, int count) {
    if (!nodes || count <= 0) {
        return NULL;
    }
    const cbm_gbuf_node_t **sorted = malloc((size_t)count * sizeof(*sorted));
    if (!sorted) {
        return NULL;
    }
    memcpy(sorted, nodes, (size_t)count * sizeof(*sorted));
    qsort(sorted, (size_t)count, sizeof(*sorted), cmp_node_ptr_canonical);
    return sorted;
}

/* Files whose key_symbol pairs link by exact name and only inside the config
 * file's component: infrastructure files -- YAML, JSON, HCL (Terraform,
 * OpenTofu, tfvars) -- (user decision 2026-10-10: in 17 infra repositories 4
 * of 40 sampled key_symbol edges were right, all of them exact and within one
 * directory tree; the rest were substring and cross-component coincidences),
 * and TOML and INI files (user decision 2026-10-14: all 72 of their substring
 * or cross-component edges in those repositories were coincidences, such as
 * `.gitleaks.toml useDefault` <- TestConfig_UseDefault). Other config formats
 * (.env, .properties) keep exact + substring matching. */
static bool cl_is_infra_path(const char *path) {
    static const char *const exts[] = {".yaml",   ".yml",  ".json", ".tf",  ".hcl",  ".tofu",
                                       ".tfvars", ".toml", ".ini",  ".cfg", ".conf", NULL};
    const char *dot = path ? strrchr(path, '.') : NULL;
    const char *slash = path ? strrchr(path, '/') : NULL;
    if (!dot || (slash && dot < slash)) {
        return false;
    }
    for (int i = 0; exts[i]; i++) {
        if (strcmp(dot, exts[i]) == 0) {
            return true;
        }
    }
    return false;
}

/* Length of the config file's component directory: its own directory, or the
 * one around it when that is a conventional config folder; 0 = the repo root. */
static size_t cl_component_len(const char *path) {
    static const char *const config_dirs[] = {"config", "configs", "conf", "settings", "etc", NULL};
    const char *slash = path ? strrchr(path, '/') : NULL;
    if (!slash) {
        return 0;
    }
    size_t dir_len = (size_t)(slash - path);
    const char *base = path;
    for (const char *p = path; p < slash; p++) {
        if (*p == '/') {
            base = p + SKIP_ONE;
        }
    }
    size_t base_len = (size_t)(slash - base);
    for (int i = 0; config_dirs[i]; i++) {
        if (base_len == strlen(config_dirs[i]) && strncmp(base, config_dirs[i], base_len) == 0) {
            return base == path ? 0 : (size_t)(base - path) - SKIP_ONE;
        }
    }
    return dir_len;
}

typedef struct {
    int64_t node_id;
    const char *file_path; /* borrowed from the graph buffer for the pass */
    const char *name;      /* borrowed */
    char *normalized;      /* in the strategy's arena */
    size_t len;
    size_t component_len; /* config entries: cl_component_len(file_path) */
    bool infra;
} cl_entry_t;

typedef struct {
    cl_entry_t *items;
    int count;
    int cap;
} cl_entries_t;

static bool cl_entries_push(cl_entries_t *entries, const cbm_gbuf_node_t *node, const char *norm,
                            CBMArena *arena) {
    if (entries->count == entries->cap) {
        int cap = entries->cap ? entries->cap * PAIR_LEN : CBM_SZ_1K;
        cl_entry_t *grown =
            cbm_realloc(CBM_MEM_CLASS_OTHER, entries->items, (size_t)cap * sizeof(*grown));
        if (!grown) {
            return false;
        }
        entries->items = grown;
        entries->cap = cap;
    }
    char *normalized = cbm_arena_strdup(arena, norm);
    if (!normalized) {
        return false;
    }
    entries->items[entries->count++] = (cl_entry_t){
        .node_id = node->id,
        .file_path = node->file_path ? node->file_path : "",
        .name = node->name ? node->name : "",
        .normalized = normalized,
        .len = strlen(normalized),
        .component_len = cl_component_len(node->file_path),
        .infra = cl_is_infra_path(node->file_path),
    };
    return true;
}

/* Collect config Variable nodes with ≥2 tokens, each ≥3 chars. */
static bool collect_config_entries(const cbm_gbuf_node_t *const *vars, int var_count,
                                   cl_entries_t *out, CBMArena *arena) {
    const cbm_gbuf_node_t **sorted = canonical_node_copy(vars, var_count);
    if (sorted) {
        vars = sorted;
    }
    bool ok = true;
    for (int i = 0; i < var_count && ok; i++) {
        if (!cbm_has_config_extension(vars[i]->file_path)) {
            continue;
        }

        char norm[CBM_SZ_256];
        int tokens = cbm_normalize_config_key(vars[i]->name, norm, sizeof(norm));
        if (tokens < PAIR_LEN) {
            continue;
        }

        /* Check all tokens ≥3 chars */
        bool all_long = true;
        const char *p = norm;
        while (*p) {
            const char *end = strchr(p, '_');
            size_t tlen = end ? (size_t)(end - p) : strlen(p);
            if (tlen < CBM_SZ_3) {
                all_long = false;
                break;
            }
            p = end ? end + SKIP_ONE : p + tlen;
        }
        if (all_long) {
            ok = cl_entries_push(out, vars[i], norm, arena);
        }
    }
    free((void *)sorted);
    return ok;
}

static bool cl_is_hcl_path(const char *path) {
    static const char *const exts[] = {".tf", ".hcl", ".tofu", ".tfvars", NULL};
    const char *dot = path ? strrchr(path, '.') : NULL;
    for (int i = 0; dot && exts[i]; i++) {
        if (strcmp(dot, exts[i]) == 0) {
            return true;
        }
    }
    return false;
}

/* The name an HCL symbol matches a config key by. A config value sets a
 * Terraform/OpenTofu `variable` block, whose Class is named `variable.<name>`:
 * it matches by <name>. Outputs, modules, resources and a .tfvars file's own
 * assignments are not what a config key sets; they take no part (NULL). */
static const char *cl_hcl_variable_name(const cbm_gbuf_node_t *node) {
    static const char prefix[] = "variable.";
    if (!node->label || strcmp(node->label, "Class") != 0 || !node->name ||
        strncmp(node->name, prefix, sizeof(prefix) - SKIP_ONE) != 0) {
        return NULL;
    }
    return node->name + sizeof(prefix) - SKIP_ONE;
}

/* Collect code nodes (Function/Variable/Class/Struct) not from config files. */
static bool collect_code_entries(cbm_gbuf_t *gb, cl_entries_t *out, CBMArena *arena) {
    /* "Struct" alongside "Class": a config key may name a Go/Rust/Swift/D struct
     * type, which is now labelled "Struct" — keep it linkable. */
    static const char *labels[] = {"Function", "Variable", "Class", "Struct", NULL};

    bool ok = true;
    for (int li = 0; labels[li] && ok; li++) {
        const cbm_gbuf_node_t **nodes = NULL;
        int count = 0;
        if (cbm_gbuf_find_by_label(gb, labels[li], &nodes, &count) != 0) {
            continue;
        }

        /* Canonical order -- see cmp_node_ptr_canonical. */
        const cbm_gbuf_node_t **sorted = canonical_node_copy(nodes, count);
        const cbm_gbuf_node_t *const *scan = sorted ? sorted : nodes;

        for (int i = 0; i < count && ok; i++) {
            if (cbm_has_config_extension(scan[i]->file_path)) {
                continue;
            }

            const char *match_name = scan[i]->name;
            if (cl_is_hcl_path(scan[i]->file_path)) {
                match_name = cl_hcl_variable_name(scan[i]);
                if (!match_name) {
                    continue;
                }
            }

            char norm[CBM_SZ_256];
            int tokens = cbm_normalize_config_key(match_name, norm, sizeof(norm));
            if (tokens == 0 || norm[0] == '\0') {
                continue;
            }
            ok = cl_entries_push(out, scan[i], norm, arena);
        }
        /* gbuf data is borrowed — only the sorted copy is owned */
        free((void *)sorted);
    }
    return ok;
}

/* Code entries (indices, ascending) under one index key. */
typedef struct {
    int *items;
    int count;
    int cap;
} cl_posting_t;

static bool cl_posting_add(CBMHashTable *index, const char *key, int idx) {
    cl_posting_t *posting = cbm_ht_get(index, key);
    if (!posting) {
        posting = cbm_calloc(CBM_MEM_CLASS_OTHER, sizeof(*posting));
        if (!posting) {
            return false;
        }
        cbm_ht_set(index, key, posting);
    }
    if (posting->count && posting->items[posting->count - 1] == idx) {
        return true; /* the same trigram twice in one name */
    }
    if (posting->count == posting->cap) {
        int cap = posting->cap ? posting->cap * PAIR_LEN : CBM_SZ_16;
        int *grown = cbm_realloc(CBM_MEM_CLASS_OTHER, posting->items, (size_t)cap * sizeof(*grown));
        if (!grown) {
            return false;
        }
        posting->items = grown;
        posting->cap = cap;
    }
    posting->items[posting->count++] = idx;
    return true;
}

static void cl_posting_free(const char *key, void *value, void *userdata) {
    (void)key;
    (void)userdata;
    cl_posting_t *posting = value;
    cbm_free(CBM_MEM_CLASS_OTHER, posting->items);
    cbm_free(CBM_MEM_CLASS_OTHER, posting);
}

enum { CL_TRIGRAM = 3 };

/* Exact index: normalized name -> code entries. Trigram index: every
 * 3-character run of a non-infra code entry's normalized name -> entries, so a
 * key's substring candidates are the entries holding its rarest trigram
 * instead of every code entry (cost follows the matches, no cap needed). */
static bool cl_build_indexes(const cl_entries_t *code, CBMHashTable *exact, CBMHashTable *trigrams,
                             CBMArena *arena) {
    for (int k = 0; k < code->count; k++) {
        const cl_entry_t *e = &code->items[k];
        if (!cl_posting_add(exact, e->normalized, k)) {
            return false;
        }
        if (e->infra) {
            continue; /* infra symbols link by exact name only */
        }
        for (size_t i = 0; i + CL_TRIGRAM <= e->len; i++) {
            char tri[CL_TRIGRAM + SKIP_ONE];
            memcpy(tri, e->normalized + i, CL_TRIGRAM);
            tri[CL_TRIGRAM] = '\0';
            const char *key = cbm_ht_get_key(trigrams, tri);
            if (!key) {
                key = cbm_arena_strdup(arena, tri);
                if (!key) {
                    return false;
                }
            }
            if (!cl_posting_add(trigrams, key, k)) {
                return false;
            }
        }
    }
    return true;
}

/* A config key's component holds the code file. */
static bool cl_in_component(const cl_entry_t *config, const cl_entry_t *code) {
    size_t n = config->component_len;
    return n == 0 ||
           (strncmp(code->file_path, config->file_path, n) == 0 && code->file_path[n] == '/');
}

/* The key x symbol matches of strategy 1, per config key: exact matches from
 * the exact index, substring matches among the entries holding the key's
 * rarest trigram. Rows run in parallel; each row's matches are in ascending
 * code order, and the edges are inserted afterwards in (config, code) order. */
typedef struct {
    int co;
    double confidence;
} key_match_t;

typedef struct {
    key_match_t *items;
    int count;
    int cap;
} key_match_list_t;

typedef struct {
    const cl_entries_t *config;
    const cl_entries_t *code;
    const CBMHashTable *exact;
    const CBMHashTable *trigrams;
    key_match_list_t *lists;
    _Atomic int next;
    _Atomic bool failed;
} key_match_job_t;

static bool key_match_push(key_match_list_t *list, int co, double confidence) {
    if (list->count == list->cap) {
        int cap = list->cap ? list->cap * PAIR_LEN : CBM_SZ_16;
        key_match_t *grown =
            cbm_realloc(CBM_MEM_CLASS_OTHER, list->items, (size_t)cap * sizeof(*grown));
        if (!grown) {
            return false;
        }
        list->items = grown;
        list->cap = cap;
    }
    list->items[list->count].co = co;
    list->items[list->count].confidence = confidence;
    list->count++;
    return true;
}

/* The trigram posting of `key` with the fewest entries; NULL when some
 * trigram occurs in no entry (then no entry holds the key). */
static const cl_posting_t *cl_rarest_trigram(const CBMHashTable *trigrams, const char *key,
                                             size_t len) {
    const cl_posting_t *rarest = NULL;
    for (size_t i = 0; i + CL_TRIGRAM <= len; i++) {
        char tri[CL_TRIGRAM + SKIP_ONE];
        memcpy(tri, key + i, CL_TRIGRAM);
        tri[CL_TRIGRAM] = '\0';
        const cl_posting_t *posting = cbm_ht_get(trigrams, tri);
        if (!posting) {
            return NULL;
        }
        if (!rarest || posting->count < rarest->count) {
            rarest = posting;
        }
    }
    return rarest;
}

static bool key_match_row(const key_match_job_t *job, int ci, key_match_list_t *list) {
    const cl_entry_t *cfg = &job->config->items[ci];
    const cl_posting_t *exact = cbm_ht_get(job->exact, cfg->normalized);
    const cl_posting_t *subs =
        cfg->infra ? NULL : cl_rarest_trigram(job->trigrams, cfg->normalized, cfg->len);
    int ei = 0;
    int si = 0;
    int ecount = exact ? exact->count : 0;
    int scount = subs ? subs->count : 0;
    /* Merge both ascending candidate lists so the row stays in code order. */
    while (ei < ecount || si < scount) {
        bool take_exact = si >= scount || (ei < ecount && exact->items[ei] <= subs->items[si]);
        int co = take_exact ? exact->items[ei++] : subs->items[si++];
        const cl_entry_t *code = &job->code->items[co];
        double confidence = 0.0;
        if (take_exact) {
            bool infra = cfg->infra || code->infra;
            confidence = (!infra || cl_in_component(cfg, code)) ? CONF_KEY_EXACT : 0.0;
        } else if (code->len > cfg->len && strstr(code->normalized, cfg->normalized)) {
            confidence = CONF_KEY_SUBSTRING;
        }
        if (confidence > 0.0 && !key_match_push(list, co, confidence)) {
            return false;
        }
    }
    return true;
}

static void key_match_worker(int worker_id, void *arg) {
    (void)worker_id;
    key_match_job_t *job = (key_match_job_t *)arg;
    while (!atomic_load_explicit(&job->failed, memory_order_relaxed)) {
        int ci = atomic_fetch_add_explicit(&job->next, SKIP_ONE, memory_order_relaxed);
        if (ci >= job->config->count) {
            break;
        }
        if (!key_match_row(job, ci, &job->lists[ci])) {
            atomic_store_explicit(&job->failed, true, memory_order_relaxed);
            return;
        }
    }
}

static int strategy_key_symbols(cbm_gbuf_t *gb) {
    /* Get all Variable nodes */
    const cbm_gbuf_node_t **vars = NULL;
    int var_count = 0;
    if (cbm_gbuf_find_by_label(gb, "Variable", &vars, &var_count) != 0) {
        return 0;
    }

    CBMArena arena;
    cbm_arena_init(&arena);
    cl_entries_t config = {0};
    cl_entries_t code = {0};
    CBMHashTable *exact = NULL;
    CBMHashTable *trigrams = NULL;
    key_match_list_t *lists = NULL;
    int edge_count = 0;

    bool ok = collect_config_entries(vars, var_count, &config, &arena);
    if (ok && config.count > 0) {
        ok = collect_code_entries(gb, &code, &arena);
        exact = ok ? cbm_ht_create(0) : NULL;
        trigrams = exact ? cbm_ht_create(0) : NULL;
        ok = trigrams && cl_build_indexes(&code, exact, trigrams, &arena);
        lists = ok ? cbm_calloc(CBM_MEM_CLASS_OTHER, (size_t)config.count * sizeof(*lists)) : NULL;
        ok = lists != NULL;
    }
    if (ok && lists) {
        key_match_job_t job = {
            .config = &config,
            .code = &code,
            .exact = exact,
            .trigrams = trigrams,
            .lists = lists,
        };
        atomic_init(&job.next, 0);
        atomic_init(&job.failed, false);
        int workers = cbm_default_worker_count(false);
        cbm_parallel_for(
            workers, key_match_worker, &job,
            (cbm_parallel_for_opts_t){.max_workers = workers, .force_pthreads = false});
        ok = !atomic_load_explicit(&job.failed, memory_order_relaxed);
    }
    if (ok && lists) {
        for (int ci = 0; ci < config.count; ci++) {
            for (int m = 0; m < lists[ci].count; m++) {
                const key_match_t *km = &lists[ci].items[m];
                char props[CBM_SZ_512];
                snprintf(props, sizeof(props),
                         "{\"strategy\":\"key_symbol\",\"confidence\":%.2f,\"config_key\":\"%s\"}",
                         km->confidence, config.items[ci].name);
                cbm_gbuf_insert_edge(gb, code.items[km->co].node_id, config.items[ci].node_id,
                                     "CONFIGURES", props);
                edge_count++;
            }
        }
    } else if (!ok) {
        char cfg_buf[CBM_SZ_16];
        char code_buf[CBM_SZ_16];
        snprintf(cfg_buf, sizeof(cfg_buf), "%d", config.count);
        snprintf(code_buf, sizeof(code_buf), "%d", code.count);
        cbm_log_warn("configlinker.key_symbol.oom", "config", cfg_buf, "code", code_buf);
    }

    for (int ci = 0; lists && ci < config.count; ci++) {
        cbm_free(CBM_MEM_CLASS_OTHER, lists[ci].items);
    }
    cbm_free(CBM_MEM_CLASS_OTHER, lists);
    if (exact) {
        cbm_ht_foreach(exact, cl_posting_free, NULL);
        cbm_ht_free(exact);
    }
    if (trigrams) {
        cbm_ht_foreach(trigrams, cl_posting_free, NULL);
        cbm_ht_free(trigrams);
    }
    cbm_free(CBM_MEM_CLASS_OTHER, config.items);
    cbm_free(CBM_MEM_CLASS_OTHER, code.items);
    cbm_arena_destroy(&arena);
    return edge_count;
}

/* ── Strategy 2: Dependency → Import ────────────────────────────── */

typedef struct {
    int64_t node_id;
    char name[CBM_SZ_256];
} dep_entry_t;

/* Extract basename from a file path. */
static const char *path_basename(const char *path) {
    if (!path) {
        return "";
    }
    const char *slash = strrchr(path, '/');
    return slash ? slash + SKIP_ONE : path;
}

/* Check if a Cargo.toml QN contains a dependency section in any dotted part. */
static bool is_cargo_dep_section(const char *qn) {
    char qn_copy[CBM_SZ_512];
    snprintf(qn_copy, sizeof(qn_copy), "%s", qn);
    char *saveptr = NULL;
    char *part = strtok_r(qn_copy, ".", &saveptr);
    while (part) {
        char lower[CBM_SZ_128];
        size_t plen = strlen(part);
        if (plen >= sizeof(lower)) {
            plen = sizeof(lower) - SKIP_ONE;
        }
        for (size_t j = 0; j < plen; j++) {
            lower[j] = (char)tolower((unsigned char)part[j]);
        }
        lower[plen] = '\0';

        static const char *dep_secs[] = {"dependencies",       "devdependencies",
                                         "peerdependencies",   "dev-dependencies",
                                         "build-dependencies", NULL};
        for (int k = 0; dep_secs[k]; k++) {
            if (strcmp(lower, dep_secs[k]) == 0) {
                return true;
            }
        }
        part = strtok_r(NULL, ".", &saveptr);
    }
    return false;
}

static int collect_manifest_deps(const cbm_gbuf_node_t *const *vars, int var_count,
                                 dep_entry_t *out, int max_out) {
    int n = 0;
    for (int i = 0; i < var_count && n < max_out; i++) {
        const char *base = path_basename(vars[i]->file_path);
        if (!is_manifest_file(base)) {
            continue;
        }

        bool is_dep = vars[i]->qualified_name && is_dep_section(vars[i]->qualified_name);

        if (!is_dep && strcmp(base, "Cargo.toml") == 0 && vars[i]->qualified_name) {
            is_dep = is_cargo_dep_section(vars[i]->qualified_name);
        }

        if (is_dep) {
            out[n].node_id = vars[i]->id;
            snprintf(out[n].name, sizeof(out[n].name), "%s", vars[i]->name);
            n++;
        }
    }
    return n;
}

/* Lowercase a string into buf. */
static void lowercase_into(char *buf, size_t bufsize, const char *src) {
    size_t len = src ? strlen(src) : 0;
    for (size_t j = 0; j < len && j < bufsize - SKIP_ONE; j++) {
        buf[j] = (char)tolower((unsigned char)src[j]);
    }
    buf[len < bufsize ? len : bufsize - SKIP_ONE] = '\0';
}

/* One IMPORTS edge prepared for matching: its endpoints resolved and its
 * target's name and qualified name lowercased ONCE (same truncation as before:
 * 255 and 511 bytes). Resolving both nodes and lowercasing both strings inside
 * the dep x import loop was the whole cost of configlink -- 0.9 s on the Go
 * corpus, and cbm_gbuf_find_by_id's x3.1 super-linear scaling (waste
 * sanitizer, 2026-09-17). */
typedef struct {
    int64_t source_id;
    const char *target_lower; /* into one shared block */
    const char *qn_lower;     /* NULL when the target has no qualified name */
} dep_import_t;

/* Match a dep name (lowercased) against a prepared import target.
 * Returns confidence > 0 on match, 0 on no match. */
static double match_dep_to_import(const dep_import_t *imp, const char *dep_lower) {
    if (strcmp(imp->target_lower, dep_lower) == 0) {
        return CONF_DEP_EXACT;
    }
    if (imp->qn_lower && strstr(imp->qn_lower, dep_lower) != NULL) {
        return CONF_DEP_QN_SUBSTR;
    }
    return 0.0;
}

/* Resolve and lowercase every IMPORTS edge whose endpoints both exist, in edge
 * order. Returns the count (0 with *out NULL on allocation failure). */
static int prepare_dep_imports(cbm_gbuf_t *gb, const cbm_gbuf_edge_t *const *imports,
                               int import_count, dep_import_t **out, char **block_out) {
    *out = NULL;
    *block_out = NULL;
    enum { NAME_CAP = CBM_SZ_256, QN_CAP = CBM_SZ_512 };
    size_t bytes = 0;
    for (int ii = 0; ii < import_count; ii++) {
        const cbm_gbuf_node_t *target = cbm_gbuf_find_by_id(gb, imports[ii]->target_id);
        const cbm_gbuf_node_t *source =
            target ? cbm_gbuf_find_by_id(gb, imports[ii]->source_id) : NULL;
        if (!target || !source) {
            continue;
        }
        size_t nlen = target->name ? strlen(target->name) : 0;
        bytes += (nlen < NAME_CAP ? nlen : NAME_CAP - SKIP_ONE) + SKIP_ONE;
        if (target->qualified_name) {
            size_t qlen = strlen(target->qualified_name);
            bytes += (qlen < QN_CAP ? qlen : QN_CAP - SKIP_ONE) + SKIP_ONE;
        }
    }
    dep_import_t *items = cbm_alloc(
        CBM_MEM_CLASS_OTHER, (size_t)(import_count > 0 ? import_count : 1) * sizeof(dep_import_t));
    char *block = cbm_alloc(CBM_MEM_CLASS_OTHER, bytes > 0 ? bytes : 1);
    if (!items || !block) {
        cbm_free(CBM_MEM_CLASS_OTHER, items);
        cbm_free(CBM_MEM_CLASS_OTHER, block);
        return 0;
    }
    int n = 0;
    char *w = block;
    for (int ii = 0; ii < import_count; ii++) {
        const cbm_gbuf_node_t *target = cbm_gbuf_find_by_id(gb, imports[ii]->target_id);
        const cbm_gbuf_node_t *source =
            target ? cbm_gbuf_find_by_id(gb, imports[ii]->source_id) : NULL;
        if (!target || !source) {
            continue;
        }
        size_t nlen = target->name ? strlen(target->name) : 0;
        size_t ncap = (nlen < NAME_CAP ? nlen : NAME_CAP - SKIP_ONE) + SKIP_ONE;
        lowercase_into(w, ncap, target->name);
        items[n].target_lower = w;
        w += ncap;
        items[n].qn_lower = NULL;
        if (target->qualified_name) {
            size_t qlen = strlen(target->qualified_name);
            size_t qcap = (qlen < QN_CAP ? qlen : QN_CAP - SKIP_ONE) + SKIP_ONE;
            lowercase_into(w, qcap, target->qualified_name);
            items[n].qn_lower = w;
            w += qcap;
        }
        items[n].source_id = source->id;
        n++;
    }
    *out = items;
    *block_out = block;
    return n;
}

static int strategy_dep_imports(cbm_gbuf_t *gb) {
    const cbm_gbuf_node_t **vars = NULL;
    int var_count = 0;
    if (cbm_gbuf_find_by_label(gb, "Variable", &vars, &var_count) != 0) {
        return 0;
    }

    dep_entry_t deps[CBM_SZ_2K];
    int dep_count = collect_manifest_deps(vars, var_count, deps, CBM_SZ_2K);

    if (dep_count == 0) {
        return 0;
    }

    /* Get all IMPORTS edges */
    const cbm_gbuf_edge_t **imports = NULL;
    int import_count = 0;
    if (cbm_gbuf_find_edges_by_type(gb, "IMPORTS", &imports, &import_count) != 0) {
        return 0;
    }

    int edge_count = 0;
    dep_import_t *prepared = NULL;
    char *prepared_block = NULL;
    int prepared_count = prepare_dep_imports(gb, imports, import_count, &prepared, &prepared_block);

    for (int di = 0; di < dep_count && prepared; di++) {
        char dep_lower[CBM_SZ_256];
        lowercase_into(dep_lower, sizeof(dep_lower), deps[di].name);

        for (int ii = 0; ii < prepared_count; ii++) {
            double confidence = match_dep_to_import(&prepared[ii], dep_lower);
            if (confidence > 0.0) {
                char props[CBM_SZ_512];
                snprintf(
                    props, sizeof(props),
                    "{\"strategy\":\"dependency_import\",\"confidence\":%.2f,\"dep_name\":\"%s\"}",
                    confidence, deps[di].name);

                cbm_gbuf_insert_edge(gb, prepared[ii].source_id, deps[di].node_id, "CONFIGURES",
                                     props);
                edge_count++;
            }
        }
    }

    /* gbuf data is borrowed; only the prepared copies are owned */
    cbm_free(CBM_MEM_CLASS_OTHER, prepared);
    cbm_free(CBM_MEM_CLASS_OTHER, prepared_block);
    return edge_count;
}

/* ── Strategy 3: Config File Path → Code String Reference ───────── */

typedef struct {
    const cbm_gbuf_node_t *node;
    char *value;
} cl_config_value_t;

typedef struct {
    int64_t child;
    int64_t parent;
} cl_parent_t;

typedef struct {
    int64_t parent;
    int64_t child;
} cl_child_t;


static int cl_config_value_cmp(const void *pa, const void *pb) {
    const cl_config_value_t *a = pa, *b = pb;
    int r = strcmp(a->value, b->value);
    if (r) return r;
    return strcmp(a->node->qualified_name ? a->node->qualified_name : "",
                  b->node->qualified_name ? b->node->qualified_name : "");
}

static int cl_config_name_cmp(const void *pa, const void *pb) {
    const cl_config_value_t *a = pa, *b = pb;
    int r = strcmp(a->node->name ? a->node->name : "", b->node->name ? b->node->name : "");
    return r ? r : cl_config_value_cmp(pa, pb);
}

static int cl_name_lower_bound(const cl_config_value_t *values, int count, const char *name) {
    int lo = 0, hi = count;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        const char *candidate = values[mid].node->name ? values[mid].node->name : "";
        if (strcmp(candidate, name) < 0) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

static int cl_value_lower_bound(const cl_config_value_t *values, int count,
                                const char *value) {
    int lo = 0, hi = count;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (strcmp(values[mid].value, value) < 0) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

static bool cl_config_value(const cbm_gbuf_node_t *node, char **out) {
    *out = NULL;
    if (!node || !node->properties_json) return false;
    yyjson_doc *doc = yyjson_read(node->properties_json, strlen(node->properties_json), 0);
    yyjson_val *root = doc ? yyjson_doc_get_root(doc) : NULL;
    yyjson_val *is_key = root && yyjson_is_obj(root) ? yyjson_obj_get(root, "config_key") : NULL;
    yyjson_val *value = root && yyjson_is_obj(root) ? yyjson_obj_get(root, "value") : NULL;
    bool config_key = is_key && ((yyjson_is_bool(is_key) && yyjson_get_bool(is_key)) ||
                                 (yyjson_is_str(is_key) &&
                                  strcmp(yyjson_get_str(is_key), "true") == 0));
    bool ok = config_key && value && yyjson_is_str(value);
    if (ok) {
        const char *s = yyjson_get_str(value);
        *out = s ? cbm_strdup(s) : NULL;
        ok = *out != NULL;
    }
    if (doc) yyjson_doc_free(doc);
    return ok;
}

static int cl_parent_cmp(const void *pa, const void *pb) {
    const cl_parent_t *a = pa, *b = pb;
    if (a->child != b->child) return a->child < b->child ? -1 : 1;
    return a->parent < b->parent ? -1 : a->parent > b->parent;
}

static int cl_child_cmp(const void *pa, const void *pb) {
    const cl_child_t *a = pa, *b = pb;
    if (a->parent != b->parent) return a->parent < b->parent ? -1 : 1;
    return a->child < b->child ? -1 : a->child > b->child;
}

static int64_t cl_parent_of(const cl_parent_t *parents, int count, int64_t child) {
    int lo = 0, hi = count;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (parents[mid].child < child) lo = mid + 1;
        else hi = mid;
    }
    return lo < count && parents[lo].child == child ? parents[lo].parent : 0;
}

static int cl_ancestor_chain(const cl_parent_t *parents, int count, int64_t node,
                             int64_t out[64]) {
    int n = 0;
    while (node > 0 && n < 64) {
        out[n++] = node;
        int64_t next = cl_parent_of(parents, count, node);
        if (next == node) break;
        node = next;
    }
    return n;
}

/* A workflow binding is accepted only when the path parameter and declaration
 * meet at a close structural ancestor.  This prevents an equally named key in
 * another workflow from becoming a project-global initialization. */
static int cl_scope_distance(cbm_gbuf_t *gb, const cl_parent_t *parents, int count,
                             int64_t path_node, int64_t declaration) {
    int64_t a[64], b[64];
    int an = cl_ancestor_chain(parents, count, path_node, a);
    int bn = cl_ancestor_chain(parents, count, declaration, b);
    int best = 1000000;
    int64_t lca = 0;
    for (int i = 0; i < an; i++)
        for (int j = 0; j < bn; j++)
            if (a[i] == b[j] && i + j < best) { best = i + j; lca = a[i]; }
    /* A collection array is not a caller scope: accepting it would bind one
     * workflow to a sibling workflow's variable. A top-level workflow object
     * is valid, so depth itself is deliberately not a rule. */
    if (!lca) return 1000000;
    const cbm_gbuf_node_t *scope = cbm_gbuf_find_by_id(gb, lca);
    if (scope && scope->properties_json &&
        (strstr(scope->properties_json, "\"value_kind\":\"array\"") ||
         strstr(scope->properties_json, "\"value_kind\":\"sequence\""))) {
        const cbm_gbuf_node_t *decl = cbm_gbuf_find_by_id(gb, declaration);
        /* A sequence of name/value entries is one parameter environment;
         * a sequence of workflows is not. No workflow/framework key names. */
        bool named_entry = an > 2 && bn > 2 && a[2] == lca && b[2] == lca &&
                           decl && decl->name && !strcmp(decl->name, "name");
        bool alias_entry = an > 2 && bn > 1 && a[2] == lca && b[1] == lca &&
                           decl && decl->properties_json && strstr(decl->properties_json, "\"yaml_alias\"");
        if (!named_entry && !alias_entry) return 1000000;
    }
    return best;
}

static const cbm_gbuf_node_t *cl_initializer(cbm_gbuf_t *gb, const cl_child_t *children,
                                             int child_count, int64_t declaration_parent) {
    int lo = 0, hi = child_count;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (children[mid].parent < declaration_parent) lo = mid + 1;
        else hi = mid;
    }
    static const char *priority[] = {"prior_value", "value", "default", "initial_value"};
    for (size_t p = 0; p < sizeof(priority) / sizeof(priority[0]); p++) {
        for (int i = lo; i < child_count && children[i].parent == declaration_parent; i++) {
            const cbm_gbuf_node_t *node = cbm_gbuf_find_by_id(gb, children[i].child);
            if (node && node->name && strcmp(node->name, priority[p]) == 0) return node;
        }
    }
    return NULL;
}

static bool cl_sql_path_value(const char *value) {
    if (!value) return false;
    const char *extensions[] = {".sql", ".hql", ".ddl", ".dml", ".json", ".yml", ".yaml", ".toml", ".ini", ".properties", NULL};
    size_t n = strcspn(value, "?#");
    while (n && isspace((unsigned char)value[n - 1])) n--;
    for (int i = 0; extensions[i]; i++) {
        size_t en = strlen(extensions[i]);
        if (n < en) continue;
        bool same = true;
        for (size_t j = 0; j < en; j++)
            if (tolower((unsigned char)value[n - en + j]) !=
                tolower((unsigned char)extensions[i][j])) same = false;
        if (same) return true;
    }
    return false;
}

static bool cl_path_char_eq(char a, char b) {
    if (a == '\\') a = '/';
    if (b == '\\') b = '/';
    return a == b;
}

static bool cl_path_ends_with(const char *whole, const char *suffix) {
    size_t wn = strlen(whole), sn = strlen(suffix);
    while (sn && (*suffix == '/' || *suffix == '\\')) { suffix++; sn--; }
    if (!sn || wn < sn) return false;
    size_t off = wn - sn;
    for (size_t i = 0; i < sn; i++)
        if (!cl_path_char_eq(whole[off + i], suffix[i])) return false;
    return off == 0 || whole[off - 1] == '/' || whole[off - 1] == '\\';
}

/* Match a resolved path, never a raw template with an unknown middle part. */
static bool cl_value_references_file(const char *value, const char *file_path) {
    if (!value || !file_path || !file_path[0]) return false;
    size_t clean_len = strcspn(value, "?#");
    while (clean_len && isspace((unsigned char)value[clean_len - 1])) clean_len--;
    char *clean = clean_len < strlen(value) ? cbm_strndup(value, clean_len) : NULL;
    const char *candidate = clean ? clean : value;
    if (cl_path_ends_with(candidate, file_path)) { free(clean); return true; }
    const char *suffix = candidate;
    /* A bare basename is too weak: duplicate SQL filenames are common. */
    if (!strchr(suffix, '/') && !strchr(suffix, '\\')) { free(clean); return false; }
    bool matches = cl_path_ends_with(file_path, suffix) || cl_path_ends_with(suffix, file_path);
    free(clean);
    return matches;
}

static char *cl_json_escape(const char *s) {
    size_t n = strlen(s ? s : "");
    if (n > (SIZE_MAX - 1) / 6) return NULL;
    char *out = malloc(n * 6 + 1);
    if (out) cbm_json_escape(out, n * 6 + 1, s ? s : "");
    return out;
}


/* Properties are merged, never replacing the original config value. */
static void cl_resolution_properties(cbm_gbuf_t *gb, int64_t id,
                                     const char *status, const char *path) {
    cbm_gbuf_node_t *node = (cbm_gbuf_node_t *)cbm_gbuf_find_by_id(gb, id);
    if (!node) return;
    yyjson_doc *doc = yyjson_read(node->properties_json, strlen(node->properties_json), 0);
    yyjson_mut_doc *out = doc ? yyjson_doc_mut_copy(doc, NULL) : yyjson_mut_doc_new(NULL);
    if (!out) { if (doc) yyjson_doc_free(doc); return; }
    yyjson_mut_val *root = yyjson_mut_doc_get_root(out);
    if (!root) { root = yyjson_mut_obj(out); yyjson_mut_doc_set_root(out, root); }
    yyjson_mut_obj_remove_key(root, "resolution_status");
    yyjson_mut_obj_remove_key(root, "resolved_path");
    yyjson_mut_obj_add_strcpy(out, root, "resolution_status", status);
    if (path) yyjson_mut_obj_add_strcpy(out, root, "resolved_path", path);
    char *json = yyjson_mut_write(out, 0, NULL);
    if (json) { cbm_gbuf_node_set_properties_json(node, json); free(json); }
    yyjson_mut_doc_free(out);
    if (doc) yyjson_doc_free(doc);
}


typedef struct {
    char *text;
    int64_t *origins;
    size_t origin_count;
    bool suffix;
} cl_variant_t;

typedef struct {
    cl_variant_t *items;
    size_t count;
    bool cycle, unresolved;
} cl_variants_t;

typedef struct cl_frame {
    int64_t id;
    const struct cl_frame *parent;
} cl_frame_t;

typedef struct {
    int64_t owner, variant, file;
    cl_variant_t selection;
} cl_file_link_t;

typedef struct cl_call_frame {
    const cl_file_link_t *link;
    const struct cl_call_frame *child;
} cl_call_frame_t;

typedef struct {
    cbm_gbuf_t *gb;
    const cl_parent_t *parents;
    const cl_child_t *children;
    int hc;
    const cl_config_value_t *values, *by_name;
    int count;
    bool failed;
    const cbm_gbuf_edge_t **aliases;
    int alias_count;
    int binding_edges;
    const cl_call_frame_t *context;
    CBMHashTable *lookup_cache;
    CBMHashTable *namespaces;
    size_t alias_cycle_epoch;
    bool scan_only;
    bool sql_values; /* Query-time values must never discard unresolved path prefixes. */
    cl_variant_t fallback_definitions;
} cl_resolver_t;

static void cl_variants_free(cl_variants_t *v) {
    for (size_t i = 0; i < v->count; i++) {
        free(v->items[i].text);
        free(v->items[i].origins);
    }
    free(v->items);
    memset(v, 0, sizeof(*v));
}

/* Allocation failure aborts the pass; it must never look like a successfully
 * enumerated subset. There is no policy cap on values, products or depth. */
static bool cl_origin_add(cl_resolver_t *r, cl_variant_t *v, int64_t id) {
    for (size_t i = 0; i < v->origin_count; i++) if (v->origins[i] == id) return true;
    if (v->origin_count >= SIZE_MAX / sizeof(*v->origins) - 1) return !(r->failed = true);
    int64_t *p = realloc(v->origins, (v->origin_count + 1) * sizeof(*p));
    if (!p) return !(r->failed = true);
    v->origins = p;
    v->origins[v->origin_count++] = id;
    return true;
}

static bool cl_has_origin(const cl_variant_t *v, int64_t id);
static bool cl_compatible_choices(cl_resolver_t *r, const cl_variant_t *a,
                                  const cl_variant_t *b);

static bool cl_same_fallback_choices(cl_resolver_t *r, const cl_variant_t *existing,
                                     const cl_variant_t *a, const cl_variant_t *b,
                                     int64_t origin) {
    for (size_t i = 0; i < r->fallback_definitions.origin_count; i++) {
        int64_t id = r->fallback_definitions.origins[i];
        bool wanted = id == origin || cl_has_origin(a, id) || cl_has_origin(b, id);
        if (cl_has_origin(existing, id) != wanted) return false;
    }
    return true;
}

static void cl_variant_add(cl_resolver_t *r, cl_variants_t *list, const char *text,
                           bool suffix, const cl_variant_t *a, const cl_variant_t *b,
                           int64_t origin) {
    if (r->failed) return;
    if (origin && cl_has_origin(&r->fallback_definitions, origin)) {
        cl_variant_t selection = {.origins = &origin, .origin_count = 1};
        if ((a && !cl_compatible_choices(r, &selection, a)) ||
            (b && !cl_compatible_choices(r, &selection, b))) return;
    }
    cl_variant_t *v = NULL;
    for (size_t i = 0; i < list->count; i++)
        if (list->items[i].suffix == suffix && !strcmp(list->items[i].text, text) &&
            cl_same_fallback_choices(r, &list->items[i], a, b, origin)) {
            v = &list->items[i]; break;
        }
    if (!v) {
        if (list->count >= SIZE_MAX / sizeof(*list->items) - 1) { r->failed = true; return; }
        cl_variant_t *p = realloc(list->items, (list->count + 1) * sizeof(*p));
        if (!p) { r->failed = true; return; }
        list->items = p;
        v = &list->items[list->count++];
        *v = (cl_variant_t){.text = strdup(text), .suffix = suffix};
        if (!v->text) { r->failed = true; return; }
    }
    if (a) for (size_t i = 0; i < a->origin_count; i++) cl_origin_add(r, v, a->origins[i]);
    if (b) for (size_t i = 0; i < b->origin_count; i++) cl_origin_add(r, v, b->origins[i]);
    if (origin) cl_origin_add(r, v, origin);
}

static bool cl_config_namespace(const char *path, const char *name, size_t len) {
    if (!path) return false;
    const char *base = strrchr(path, '/');
    base = base ? base + 1 : path;
    const char *win = strrchr(base, '\\');
    if (win) base = win + 1;
    const char *dot = strrchr(base, '.');
    return dot && (size_t)(dot - base) == len && !strncmp(base, name, len);
}

/* Explicit file.key references retain every matching declaration in every
 * matching config file. Unqualified names retain the caller's nearest scope. */
static bool cl_within(cl_resolver_t *r, int64_t node, int64_t scope) {
    if (!scope) return true;
    int64_t chain[64]; int count = cl_ancestor_chain(r->parents, r->hc, node, chain);
    for (int i = 0; i < count; i++) if (chain[i] == scope) return true;
    return false;
}

static cl_variant_t cl_lookup_direct(cl_resolver_t *r, const cbm_gbuf_node_t *caller,
                                      const char *name, int64_t scope) {
    cl_variant_t found = {0};
    const char *dot = strchr(name, '.');
    bool qualified = false;
    if (dot) {
        char *prefix = cbm_strndup(name, (size_t)(dot - name));
        if (!prefix) { r->failed = true; return found; }
        qualified = cbm_ht_has(r->namespaces, prefix);
        free(prefix);
    }
    int distance = 1000000;
    for (int spelling = 0; spelling < (qualified ? 2 : 1); spelling++) {
    const char *key = qualified && !spelling ? dot + 1 : name;
    for (int mode = 0; mode < 2; mode++) {
        const cl_config_value_t *index = mode ? r->by_name : r->values;
        int first = mode ? cl_name_lower_bound(index, r->count, key) :
                           cl_value_lower_bound(index, r->count, key);
        for (int i = first; i < r->count; i++) {
            const cbm_gbuf_node_t *decl = index[i].node, *init = NULL;
            const char *candidate = mode ? decl->name : index[i].value;
            if (!candidate || strcmp(candidate, key)) break;
            if (qualified) {
                if (!cl_config_namespace(decl->file_path, name, (size_t)(dot - name))) continue;
            } else if (!decl->file_path || !caller->file_path ||
                       strcmp(decl->file_path, caller->file_path)) continue;
            if (mode) init = decl;
            else if (decl->name && !strcmp(decl->name, "name"))
                init = cl_initializer(r->gb, r->children, r->hc,
                                      cl_parent_of(r->parents, r->hc, decl->id));
            if (!init) continue;
            if (!qualified && !cl_within(r, init->id, scope)) continue;
            int d = qualified ? 0 : cl_scope_distance(r->gb, r->parents, r->hc, caller->id, decl->id);
            if (d >= 1000000 || d > distance) continue;
            if (d < distance) { found.origin_count = 0; distance = d; }
            cl_origin_add(r, &found, init->id);
        }
    }
    }
    return found;
}

static cl_variant_t cl_lookup_aliases(cl_resolver_t *r, const cbm_gbuf_node_t *caller,
                                      const char *name, int64_t scope, const cl_frame_t *parent);

static cl_variant_t cl_lookup_aliases_uncached(cl_resolver_t *r, const cbm_gbuf_node_t *caller,
                                      const char *name, int64_t scope, const cl_frame_t *parent) {
    cl_variant_t found = {0};
    for (const cl_frame_t *f = parent; f; f = f->parent) if (f->id == caller->id) return found;
    cl_frame_t frame = {.id = caller->id, .parent = parent};
    found = cl_lookup_direct(r, caller, name, scope);
    if (found.origin_count) return found; /* Explicit values override merged defaults. */
    int best = 1000000;
    for (int i = 0; i < r->alias_count; i++) {
        const cbm_gbuf_node_t *alias = cbm_gbuf_find_by_id(r->gb, r->aliases[i]->source_id);
        const cbm_gbuf_node_t *anchor = cbm_gbuf_find_by_id(r->gb, r->aliases[i]->target_id);
        if (!alias || !anchor || !alias->file_path || !caller->file_path ||
            strcmp(alias->file_path, caller->file_path) || !cl_within(r, alias->id, scope)) continue;
        int d = cl_scope_distance(r->gb, r->parents, r->hc, caller->id, alias->id);
        if (d >= 1000000 || d > best) continue;
        cl_variant_t inherited = cl_lookup_aliases(r, anchor, name, anchor->id, &frame);
        if (inherited.origin_count) {
            if (d < best) { found.origin_count = 0; best = d; }
            for (size_t j = 0; j < inherited.origin_count; j++) cl_origin_add(r, &found, inherited.origins[j]);
        }
        free(inherited.origins);
    }
    return found;
}

static cl_variant_t cl_lookup_aliases(cl_resolver_t *r, const cbm_gbuf_node_t *caller,
                                      const char *name, int64_t scope, const cl_frame_t *parent) {
    cl_variant_t result = {0};
    if (!caller) return result;
    for (const cl_frame_t *f = parent; f; f = f->parent)
        if (f->id == caller->id) { r->alias_cycle_epoch++; return result; }
    size_t cap = strlen(name) + 64;
    char *key = malloc(cap);
    if (!key) { r->failed = true; return result; }
    snprintf(key, cap, "%lld:%lld:%s", (long long)caller->id, (long long)scope, name);
    cl_variant_t *cached = cbm_ht_get(r->lookup_cache, key);
    if (!cached) {
        cached = calloc(1, sizeof(*cached));
        if (!cached) { free(key); r->failed = true; return result; }
        size_t epoch = r->alias_cycle_epoch;
        *cached = cl_lookup_aliases_uncached(r, caller, name, scope, parent);
        /* A cut cycle depends on the current recursion stack, not just the
         * scope. Only memoize stack-independent alias subtrees. */
        if (epoch != r->alias_cycle_epoch) {
            result = *cached; free(cached); free(key); return result;
        }
        cbm_ht_set(r->lookup_cache, key, cached);
        if (cbm_ht_get(r->lookup_cache, key) != cached) {
            free(cached->origins); free(cached); free(key); r->failed = true; return result;
        }
    } else free(key);
    for (size_t i = 0; i < cached->origin_count; i++) cl_origin_add(r, &result, cached->origins[i]);
    return result;
}

static cl_variant_t cl_lookup_bindings(cl_resolver_t *r, const cbm_gbuf_node_t *caller,
                                       const char *name) {
    return cl_lookup_aliases(r, caller, name, 0, NULL);
}

static void cl_lookup_cache_free(const char *key, void *value, void *data) {
    (void)data;
    cl_variant_t *v = value;
    free(v->origins); free(v); free((void *)key);
}

static void cl_namespace_free(const char *key, void *value, void *data) {
    (void)value; (void)data; free((void *)key);
}

static bool cl_has_origin(const cl_variant_t *v, int64_t id) {
    if (v) for (size_t i = 0; i < v->origin_count; i++)
        if (v->origins[i] == id) return true;
    return false;
}

/* Last resort only: follow file references out of the root, without reentering
 * any file in this caller chain. In particular, other workflows in the CTL
 * file never become sibling scopes. All declarations in reachable sibling
 * files are candidates; lexical distance in the CTL cannot rank them. */
static cl_variant_t cl_lookup_root_siblings(cl_resolver_t *r, const char *name) {
    cl_variant_t found = {0}, files = {0};
    if (!r->context) return found;
    const cbm_gbuf_node_t *root = cbm_gbuf_find_by_id(r->gb, r->context->link->owner);
    if (!root || !root->file_path) return found;
    const cbm_gbuf_edge_t **refs = NULL;
    int ref_count = 0;
    cbm_gbuf_find_edges_by_type(r->gb, "REFERENCES_FILE", &refs, &ref_count);
    bool changed;
    do {
        changed = false;
        for (int i = 0; i < ref_count && !r->failed; i++) {
            const cbm_gbuf_node_t *from = cbm_gbuf_find_by_id(r->gb, refs[i]->source_id);
            const cbm_gbuf_node_t *to = cbm_gbuf_find_by_id(r->gb, refs[i]->target_id);
            if (!from || !to || !from->file_path || !to->file_path ||
                strcmp(from->label, "ConfigValueVariant") || strcmp(to->label, "File") ||
                cl_has_origin(&files, to->id)) continue;
            bool reachable = !strcmp(from->file_path, root->file_path), blocked = false;
            for (size_t j = 0; !reachable && j < files.origin_count; j++) {
                const cbm_gbuf_node_t *file = cbm_gbuf_find_by_id(r->gb, files.origins[j]);
                reachable = file && !strcmp(file->file_path, from->file_path);
            }
            if (!reachable) continue;
            /* A shared sibling file may have path variants produced by other
             * roots. Those variants are not edges of this caller environment. */
            const cbm_gbuf_edge_t **contexts = NULL; int context_count = 0;
            cbm_gbuf_find_edges_by_source_type(r->gb, from->id, "HAS_CALLER_CONTEXT",
                                               &contexts, &context_count);
            for (int j = 0; j < context_count; j++) {
                yyjson_doc *p = yyjson_read(contexts[j]->properties_json,
                                            strlen(contexts[j]->properties_json), 0);
                yyjson_val *depth = p ? yyjson_obj_get(yyjson_doc_get_root(p), "depth") : NULL;
                const cbm_gbuf_node_t *ancestor = cbm_gbuf_find_by_id(r->gb, contexts[j]->target_id);
                if (yyjson_is_int(depth) && yyjson_get_sint(depth) == 0 && ancestor &&
                    strcmp(ancestor->file_path, root->file_path)) blocked = true;
                if (p) yyjson_doc_free(p);
            }
            for (const cl_call_frame_t *f = r->context; f; f = f->child) {
                const cbm_gbuf_node_t *owner = cbm_gbuf_find_by_id(r->gb, f->link->owner);
                const cbm_gbuf_node_t *callee = cbm_gbuf_find_by_id(r->gb, f->link->file);
                if ((owner && !strcmp(to->file_path, owner->file_path)) ||
                    (callee && !strcmp(to->file_path, callee->file_path))) blocked = true;
            }
            if (!blocked) { cl_origin_add(r, &files, to->id); changed = true; }
        }
    } while (changed && !r->failed);
    for (int mode = 0; mode < 2; mode++) {
        const cl_config_value_t *index = mode ? r->by_name : r->values;
        int first = mode ? cl_name_lower_bound(index, r->count, name) :
                           cl_value_lower_bound(index, r->count, name);
        for (int i = first; i < r->count; i++) {
            const cbm_gbuf_node_t *decl = index[i].node, *init = NULL;
            const char *candidate = mode ? decl->name : index[i].value;
            if (!candidate || strcmp(candidate, name)) break;
            bool reachable = false;
            for (size_t j = 0; j < files.origin_count; j++) {
                const cbm_gbuf_node_t *file = cbm_gbuf_find_by_id(r->gb, files.origins[j]);
                if (file && !strcmp(decl->file_path, file->file_path)) reachable = true;
            }
            if (!reachable) continue;
            if (mode) init = decl;
            else if (!strcmp(decl->name, "name"))
                init = cl_initializer(r->gb, r->children, r->hc,
                                      cl_parent_of(r->parents, r->hc, decl->id));
            if (init) {
                cl_origin_add(r, &found, init->id);
                cl_origin_add(r, &r->fallback_definitions, init->id);
            }
        }
    }
    free(files.origins);
    return found;
}

/* Do not form a schema/prefix product across separate sibling environments
 * (e.g. two entries of a stands sequence). Definitions retain their IDs even
 * when their concrete strings happen to be equal. */
static bool cl_compatible_choices(cl_resolver_t *r, const cl_variant_t *a,
                                  const cl_variant_t *b) {
    for (size_t i = 0; i < a->origin_count; i++) {
        if (!cl_has_origin(&r->fallback_definitions, a->origins[i])) continue;
        const cbm_gbuf_node_t *left = cbm_gbuf_find_by_id(r->gb, a->origins[i]);
        for (size_t j = 0; j < b->origin_count; j++) {
            if (!cl_has_origin(&r->fallback_definitions, b->origins[j])) continue;
            const cbm_gbuf_node_t *right = cbm_gbuf_find_by_id(r->gb, b->origins[j]);
            if (left && right && !strcmp(left->file_path, right->file_path) &&
                cl_scope_distance(r->gb, r->parents, r->hc, left->id, right->id) >= 1000000)
                return false;
        }
    }
    return true;
}

/* Resolve in the declaration's lexical scope first, then in its callers.
 * A caller's own template must not see parameters of its callee. */
static cl_variant_t cl_lookup_context(cl_resolver_t *r, const cbm_gbuf_node_t *owner,
                                      const char *name) {
    cl_variant_t found = {0};
    for (const cl_call_frame_t *f = r->context; f; f = f->child) {
        const cbm_gbuf_node_t *caller = cbm_gbuf_find_by_id(r->gb, f->link->owner);
        if (!caller) continue;
        if (!strcmp(caller->file_path, owner->file_path)) break;
        cl_variant_t local = cl_lookup_bindings(r, caller, name);
        if (local.origin_count) {
            bool selected = false;
            for (size_t i = 0; i < local.origin_count; i++)
                for (size_t j = 0; j < f->link->selection.origin_count; j++)
                    if (local.origins[i] == f->link->selection.origins[j]) selected = true;
            if (selected) {
                size_t n = 0;
                for (size_t i = 0; i < local.origin_count; i++)
                    for (size_t j = 0; j < f->link->selection.origin_count; j++)
                        if (local.origins[i] == f->link->selection.origins[j]) {
                            local.origins[n++] = local.origins[i]; break;
                        }
                local.origin_count = n;
            }
            free(found.origins); found = local;
        } else free(local.origins);
    }
    cl_variant_t local = cl_lookup_bindings(r, owner, name);
    if (local.origin_count) { free(found.origins); found = local; }
    else free(local.origins);
    /* Explicit file.key lookup can rediscover all namespace definitions in
     * the callee. Retain the selection which produced this incoming path. */
    for (const cl_call_frame_t *f = r->context; f; f = f->child) {
        bool selected = false;
        for (size_t i = 0; i < found.origin_count; i++)
            for (size_t j = 0; j < f->link->selection.origin_count; j++)
                if (found.origins[i] == f->link->selection.origins[j]) selected = true;
        if (!selected) continue;
        size_t n = 0;
        for (size_t i = 0; i < found.origin_count; i++)
            for (size_t j = 0; j < f->link->selection.origin_count; j++)
                if (found.origins[i] == f->link->selection.origins[j]) {
                    found.origins[n++] = found.origins[i]; break;
                }
        found.origin_count = n;
    }
    if (!found.origin_count) {
        free(found.origins);
        found = cl_lookup_root_siblings(r, name);
    }
    return found;
}

static void cl_variant_literal(cl_resolver_t *r, cl_variants_t *list,
                               const char *text, size_t len) {
    for (size_t i = 0; i < list->count; i++) {
        size_t n = strlen(list->items[i].text);
        if (len > SIZE_MAX - n - 1) { r->failed = true; return; }
        char *p = realloc(list->items[i].text, n + len + 1);
        if (!p) { r->failed = true; return; }
        memcpy(p + n, text, len); p[n + len] = '\0'; list->items[i].text = p;
    }
}

/* Decide whether a value can end in a supported file suffix without forming
 * its Cartesian product. Non-path templates retain their raw value and use
 * nodes; materializing every combination of e.g. a command line is wasteful. */
static bool cl_may_be_path(cl_resolver_t *r, const cbm_gbuf_node_t *owner,
                           const char *value, const cl_frame_t *parent) {
    if (cl_sql_path_value(value)) return true;
    for (const cl_frame_t *f = parent; f; f = f->parent) if (f->id == owner->id) return false;
    cl_frame_t frame = {.id = owner->id, .parent = parent};
    size_t len = strcspn(value, "?#");
    while (len && isspace((unsigned char)value[len - 1])) len--;
    for (const char *p = value; (size_t)(p - value) < len; p++) {
        if (!((p[0] == '{' && p[1] == '{') || (p[0] == '$' && p[1] == '{'))) continue;
        bool braces = *p == '{';
        const char *end = strstr(p + 2, braces ? "}}" : "}");
        if (!end) return false;
        const char *next = end + (braces ? 2 : 1);
        if ((size_t)(next - value) != len) { p = next - 1; continue; }
        const char *start = p + 2;
        while (start < end && isspace((unsigned char)*start)) start++;
        while (end > start && isspace((unsigned char)end[-1])) end--;
        char *name = cbm_strndup(start, (size_t)(end - start));
        if (!name) { r->failed = true; return false; }
        cl_variant_t bindings = cl_lookup_context(r, owner, name);
        free(name);
        bool possible = false;
        for (size_t i = 0; i < bindings.origin_count && !possible && !r->failed; i++) {
            const cbm_gbuf_node_t *init = cbm_gbuf_find_by_id(r->gb, bindings.origins[i]);
            char *raw = NULL;
            if (cl_config_value(init, &raw)) {
                possible = cl_may_be_path(r, init, raw, &frame);
                free(raw);
            }
        }
        free(bindings.origins);
        return possible;
    }
    return false;
}

static cl_variants_t cl_expand_variants(cl_resolver_t *r, const cbm_gbuf_node_t *owner,
                                        const char *value, const cl_frame_t *parent) {
    cl_variants_t result = {0};
    for (const cl_frame_t *f = parent; f; f = f->parent)
        if (f->id == owner->id) { result.cycle = true; return result; }
    cl_frame_t frame = {.id = owner->id, .parent = parent};
    cl_variant_add(r, &result, "", false, NULL, NULL, 0);
    for (const char *p = value; *p && !r->failed;) {
        const char *literal = p;
        while (*p && !(p[0] == '{' && p[1] == '{') && !(p[0] == '$' && p[1] == '{')) p++;
        cl_variant_literal(r, &result, literal, (size_t)(p - literal));
        if (!*p) break;
        bool braces = *p == '{';
        const char *end = strstr(p + 2, braces ? "}}" : "}");
        if (!end) { cl_variants_free(&result); result.unresolved = true; break; }
        const char *next = end + (braces ? 2 : 1), *start = p + 2, *stop = end;
        while (start < stop && isspace((unsigned char)*start)) start++;
        while (stop > start && isspace((unsigned char)stop[-1])) stop--;
        char *name = cbm_strndup(start, (size_t)(stop - start));
        if (!name) { r->failed = true; break; }
        bool namespaced = strchr(name, '.') != NULL;
        cl_variant_t bindings = cl_lookup_context(r, owner, name);
        int64_t use = 0;
        if (!r->context) {
        size_t cap = strlen(owner->qualified_name) + 64;
        char *qn = malloc(cap);
        if (!qn) { free(name); free(bindings.origins); r->failed = true; break; }
        snprintf(qn, cap, "%s.__config_ref_%zu", owner->qualified_name, (size_t)(p - value));
        char props[160];
        snprintf(props, sizeof(props),
            "{\"value_start_offset\":%zu,\"value_end_offset\":%zu,\"coordinate_kind\":\"decoded_value\"}",
            (size_t)(p - value), (size_t)(next - value));
        use = cbm_gbuf_upsert_node(r->gb, "ConfigVariableRef", name, qn,
            owner->file_path, owner->start_line, owner->end_line, props);
        free(qn);
        if (!use || !cbm_gbuf_insert_edge(r->gb, owner->id, use, "HAS_VARIABLE_REF", "{}")) r->failed = true;
        }
        cl_variants_t choices = {0};
        for (size_t i = 0; i < bindings.origin_count && !r->failed; i++) {
            const cbm_gbuf_node_t *init = cbm_gbuf_find_by_id(r->gb, bindings.origins[i]);
            if (r->sql_values) {
                char *escaped = cl_json_escape(name);
                size_t cap = escaped ? strlen(escaped) + 128 : 0;
                char *props = cap ? malloc(cap) : NULL;
                if (!props) r->failed = true;
                else {
                    snprintf(props, cap, "{\"variable\":\"%s\",\"lookup\":\"%s\"}", escaped,
                        cl_has_origin(&r->fallback_definitions, init->id) ? "root_siblings" : "lexical_or_caller");
                    if (!cbm_gbuf_insert_edge(r->gb, owner->id, init->id,
                                              "RESOLVES_VALUE_FROM", props)) r->failed = true;
                }
                free(props); free(escaped);
            }
            if (use && !cbm_gbuf_insert_edge(r->gb, use, init->id, "RESOLVES_TO_CONFIG",
                                      "{\"strategy\":\"config_reference\"}")) r->failed = true;
            if (r->scan_only) continue;
            char *raw = NULL;
            if (!cl_config_value(init, &raw)) { choices.unresolved = true; continue; }
            cl_variants_t sub = cl_expand_variants(r, init, raw, &frame);
            free(raw);
            choices.cycle |= sub.cycle; choices.unresolved |= sub.unresolved;
            for (size_t j = 0; j < sub.count && !r->failed; j++)
                cl_variant_add(r, &choices, sub.items[j].text, sub.items[j].suffix,
                               &sub.items[j], NULL, init->id);
            cl_variants_free(&sub);
        }
        free(name);
        bool prefix = !r->sql_values && !bindings.origin_count && !namespaced && p == value &&
                      (*next == '/' || *next == '\\');
        if (r->scan_only) {
            if (use) cl_resolution_properties(r->gb, use, bindings.origin_count ? "resolved" :
                                               prefix ? "unresolved_prefix" : "unresolved", NULL);
            free(bindings.origins); p = next; continue;
        }
        if (prefix) {
            cl_variant_add(r, &choices, "", true, NULL, NULL, 0);
            while (*next == '/' || *next == '\\') next++;
        } else if (!bindings.origin_count) choices.unresolved = true;
        free(bindings.origins);
        if (use) cl_resolution_properties(r->gb, use, choices.cycle ? "cycle" : choices.unresolved ?
            "unresolved" : prefix ? "unresolved_prefix" : "resolved", NULL);
        cl_variants_t product = {.cycle = result.cycle || choices.cycle,
                                 .unresolved = result.unresolved || choices.unresolved};
        for (size_t i = 0; i < result.count && !r->failed; i++)
            for (size_t j = 0; j < choices.count && !r->failed; j++) {
                cl_variant_t *a = &result.items[i], *b = &choices.items[j];
                if (!cl_compatible_choices(r, a, b)) continue;
                /* An unknown prefix of a nested value cannot erase a middle directory. */
                if (b->suffix && a->text[0]) { product.unresolved = true; continue; }
                size_t an = strlen(a->text), bn = strlen(b->text);
                if (bn > SIZE_MAX - an - 1) { r->failed = true; break; }
                char *joined = malloc(an + bn + 1);
                if (!joined) { r->failed = true; break; }
                memcpy(joined, a->text, an); memcpy(joined + an, b->text, bn + 1);
                cl_variant_add(r, &product, joined, a->suffix || b->suffix, a, b, 0);
                free(joined);
            }
        cl_variants_free(&result); cl_variants_free(&choices);
        result = product; p = next;
    }
    return result;
}

static int64_t cl_emit_variant(cl_resolver_t *r, const cbm_gbuf_node_t *owner,
                               const cl_variant_t *v) {
    char *escaped = cl_json_escape(v->text);
    if (!escaped) { r->failed = true; return 0; }
    char digest[CBM_SHA256_HEX_LEN + 1];
    cbm_sha256_ctx hash; cbm_sha256_init(&hash);
    cbm_sha256_update(&hash, v->text, strlen(v->text) + 1);
    for (size_t i = 0; i < v->origin_count; i++) {
        if (!cl_has_origin(&r->fallback_definitions, v->origins[i])) continue;
        const cbm_gbuf_node_t *definition = cbm_gbuf_find_by_id(r->gb, v->origins[i]);
        if (definition) cbm_sha256_update(&hash, definition->qualified_name,
                                          strlen(definition->qualified_name) + 1);
    }
    for (const cl_call_frame_t *f = r->context; f; f = f->child) {
        const cbm_gbuf_node_t *caller = cbm_gbuf_find_by_id(r->gb, f->link->variant);
        cbm_sha256_update(&hash, caller->qualified_name, strlen(caller->qualified_name) + 1);
    }
    uint8_t bytes[CBM_SHA256_DIGEST_LEN]; cbm_sha256_final(&hash, bytes);
    for (size_t i = 0; i < sizeof(bytes); i++) snprintf(digest + i * 2, 3, "%02x", bytes[i]);
    size_t cap = strlen(owner->qualified_name) + sizeof(digest) + 40;
    char *qn = malloc(cap), *props = malloc(strlen(escaped) + 128);
    if (!qn || !props) { free(qn); free(props); free(escaped); r->failed = true; return 0; }
    snprintf(qn, cap, "%s.__config_variant_%d:%s", owner->qualified_name, v->suffix, digest);
    snprintf(props, strlen(escaped) + 128,
        "{\"value\":\"%s\",\"derived\":true,\"resolution_status\":\"%s\"}", escaped,
        v->suffix ? "unresolved_prefix" : "resolved");
    int64_t id = cbm_gbuf_upsert_node(r->gb, "ConfigValueVariant", v->text, qn,
        owner->file_path, owner->start_line, owner->end_line, props);
    if (!id || !cbm_gbuf_insert_edge(r->gb, owner->id, id, "HAS_VARIANT", "{}")) r->failed = true;
    unsigned depth = 0;
    for (const cl_call_frame_t *f = r->context; f; f = f->child, depth++) {
        char props_depth[64]; snprintf(props_depth, sizeof(props_depth), "{\"depth\":%u}", depth);
        if (!cbm_gbuf_insert_edge(r->gb, id, f->link->variant, "HAS_CALLER_CONTEXT", props_depth))
            r->failed = true;
    }
    for (size_t i = 0; i < v->origin_count; i++)
        if (!cbm_gbuf_insert_edge(r->gb, id, v->origins[i], "DERIVED_FROM", "{}")) r->failed = true;
    free(qn); free(props); free(escaped);
    return id;
}

static char *cl_property(const cbm_gbuf_node_t *node, const char *key) {
    if (!node || !node->properties_json) return NULL;
    yyjson_doc *doc = yyjson_read(node->properties_json, strlen(node->properties_json), 0);
    const char *s = doc ? yyjson_get_str(yyjson_obj_get(yyjson_doc_get_root(doc), key)) : NULL;
    char *out = s ? strdup(s) : NULL;
    if (doc) yyjson_doc_free(doc);
    return out;
}

static void cl_link_yaml_aliases(cl_resolver_t *r, const cbm_gbuf_node_t **vars, int count) {
    cl_config_value_t *anchors = calloc((size_t)count, sizeof(*anchors));
    if (count && !anchors) { r->failed = true; return; }
    int n = 0;
    for (int i = 0; i < count; i++) {
        char *name = cl_property(vars[i], "yaml_anchor");
        if (name) anchors[n++] = (cl_config_value_t){vars[i], name};
    }
    for (int i = 0; i < count; i++) {
        char *name = cl_property(vars[i], "yaml_alias");
        if (!name) continue;
        const cbm_gbuf_node_t *target = NULL;
        for (int j = 0; j < n; j++) {
            const cbm_gbuf_node_t *a = anchors[j].node;
            if (strcmp(name, anchors[j].value) || !a->file_path || !vars[i]->file_path ||
                strcmp(a->file_path, vars[i]->file_path) || a->start_line > vars[i]->start_line) continue;
            if (!target || a->start_line > target->start_line) target = a;
        }
        if (target && !cbm_gbuf_insert_edge(r->gb, vars[i]->id, target->id,
                                           "RESOLVES_TO_ANCHOR", "{}")) r->failed = true;
        free(name);
    }
    for (int i = 0; i < n; i++) free(anchors[i].value);
    free(anchors);
    cbm_gbuf_find_edges_by_type(r->gb, "RESOLVES_TO_ANCHOR", &r->aliases, &r->alias_count);
}

static void cl_bind_call_chain(cl_resolver_t *r, const cl_call_frame_t *frame,
                               const cbm_gbuf_node_t **uses, int use_count) {
    const cl_call_frame_t *leaf = frame;
    while (leaf->child) leaf = leaf->child;
    const cbm_gbuf_node_t *file = cbm_gbuf_find_by_id(r->gb, leaf->link->file);
    for (int i = 0; i < use_count && !r->failed; i++) {
        const cbm_gbuf_node_t *use = uses[i];
        if (!use->file_path || !file || strcmp(use->file_path, file->file_path)) continue;
        bool config_use = !strcmp(use->label, "ConfigVariableRef");
        cl_variant_t binding = {0};
        const cl_file_link_t *selected = NULL;
        /* Leaf/local values shadow caller values; preserve each distinct
         * incoming call chain rather than unioning unrelated workflows. */
        for (const cl_call_frame_t *f = frame; f; f = f->child) {
            const cbm_gbuf_node_t *owner = cbm_gbuf_find_by_id(r->gb, f->link->owner);
            cl_variant_t local = cl_lookup_bindings(r, owner, use->name);
            if (local.origin_count) { free(binding.origins); binding = local; selected = f->link; }
            else free(local.origins);
        }
        /* A config use has its own lexical scope in the callee. Its local
         * declarations shadow the caller chain, just as the last caller
         * shadows its ancestors. Never attach caller-dependent initializers
         * directly to the shared ConfigVariableRef. */
        if (config_use) {
            const cbm_gbuf_edge_t **owners = NULL;
            int owner_count = 0;
            cbm_gbuf_find_edges_by_target_type(r->gb, use->id, "HAS_VARIABLE_REF",
                                               &owners, &owner_count);
            if (owner_count == 1) {
                const cbm_gbuf_node_t *local_owner = cbm_gbuf_find_by_id(r->gb, owners[0]->source_id);
                if (local_owner) {
                    const cl_call_frame_t *saved = r->context;
                    r->context = frame;
                    cl_variant_t local = cl_lookup_context(r, local_owner, use->name);
                    r->context = saved;
                    free(binding.origins); binding = local; selected = NULL;
                }
            }
        }
        if (!binding.origin_count) {
            const cl_call_frame_t *saved = r->context;
            r->context = frame;
            free(binding.origins);
            binding = cl_lookup_root_siblings(r, use->name);
            r->context = saved;
        }
        cbm_sha256_ctx hash; cbm_sha256_init(&hash);
        for (const cl_call_frame_t *f = frame; f; f = f->child) {
            const cbm_gbuf_node_t *v = cbm_gbuf_find_by_id(r->gb, f->link->variant);
            cbm_sha256_update(&hash, v->qualified_name, strlen(v->qualified_name) + 1);
        }
        cbm_sha256_update(&hash, use->qualified_name, strlen(use->qualified_name) + 1);
        uint8_t bytes[CBM_SHA256_DIGEST_LEN]; cbm_sha256_final(&hash, bytes);
        char digest[CBM_SHA256_HEX_LEN + 1];
        for (size_t j = 0; j < sizeof(bytes); j++) snprintf(digest + 2*j, 3, "%02x", bytes[j]);
        char qn[128]; snprintf(qn, sizeof(qn), "%s.%s",
            config_use ? "__config_binding__" : "__sql_config_binding__", digest);
        const cbm_gbuf_node_t *owner = cbm_gbuf_find_by_id(r->gb, frame->link->owner);
        int64_t id = cbm_gbuf_upsert_node(r->gb,
            config_use ? "ConfigBinding" : "SqlConfigBinding", use->name, qn,
            owner->file_path, owner->start_line, owner->end_line, "{}");
        if (!id || !cbm_gbuf_insert_edge(r->gb, leaf->link->variant, id, "HAS_BINDING", "{}") ||
            !cbm_gbuf_insert_edge(r->gb, id, use->id, "BINDS_VARIABLE", "{}")) r->failed = true;
        unsigned depth = 0;
        for (const cl_call_frame_t *f = frame; f; f = f->child, depth++) {
            char context_props[64];
            snprintf(context_props, sizeof(context_props), "{\"depth\":%u}", depth);
            if (!cbm_gbuf_insert_edge(r->gb, id, f->link->variant,
                                     "HAS_CALLER_CONTEXT", context_props)) r->failed = true;
        }
        bool restrict_origins = false;
        if (selected) for (size_t b = 0; b < binding.origin_count; b++)
            for (size_t j = 0; j < selected->selection.origin_count; j++)
                if (binding.origins[b] == selected->selection.origins[j]) restrict_origins = true;
        int linked = 0;
        for (size_t b = 0; b < binding.origin_count; b++) {
            bool keep = !restrict_origins;
            if (selected) for (size_t j = 0; j < selected->selection.origin_count; j++)
                if (binding.origins[b] == selected->selection.origins[j]) keep = true;
            if (keep) {
                char *expanded_json = NULL;
                if (r->sql_values && !config_use) {
                    const cbm_gbuf_node_t *init = cbm_gbuf_find_by_id(r->gb, binding.origins[b]);
                    char *raw = NULL;
                    const cl_call_frame_t *saved = r->context;
                    r->context = frame;
                    cl_variants_t expanded = {0};
                    if (cl_config_value(init, &raw)) {
                        expanded = cl_expand_variants(r, init, raw, NULL);
                        free(raw);
                    } else expanded.unresolved = true;
                    r->context = saved;
                    yyjson_mut_doc *doc = yyjson_mut_doc_new(NULL);
                    if (!doc) r->failed = true;
                    else {
                        yyjson_mut_val *root = yyjson_mut_obj(doc), *values = yyjson_mut_arr(doc);
                        yyjson_mut_doc_set_root(doc, root);
                        yyjson_mut_obj_add_str(doc, root, "strategy", "variant_config_scope");
                        yyjson_mut_obj_add_str(doc, root, "value_resolution_status",
                            expanded.cycle ? "cycle" : expanded.unresolved ? "unresolved" :
                            expanded.count ? "resolved" : "unresolved");
                        yyjson_mut_obj_add_val(doc, root, "resolved_values", values);
                        for (size_t v = 0; v < expanded.count; v++) {
                            yyjson_mut_val *item = yyjson_mut_obj(doc), *origins = yyjson_mut_arr(doc);
                            yyjson_mut_val *fallback = yyjson_mut_arr(doc);
                            yyjson_mut_obj_add_strcpy(doc, item, "value", expanded.items[v].text);
                            yyjson_mut_arr_add_sint(doc, origins, init->id);
                            for (size_t o = 0; o < expanded.items[v].origin_count; o++)
                                if (expanded.items[v].origins[o] != init->id)
                                    yyjson_mut_arr_add_sint(doc, origins, expanded.items[v].origins[o]);
                            if (cl_has_origin(&r->fallback_definitions, init->id))
                                yyjson_mut_arr_add_sint(doc, fallback, init->id);
                            for (size_t o = 0; o < expanded.items[v].origin_count; o++)
                                if (expanded.items[v].origins[o] != init->id &&
                                    cl_has_origin(&r->fallback_definitions, expanded.items[v].origins[o]))
                                    yyjson_mut_arr_add_sint(doc, fallback, expanded.items[v].origins[o]);
                            yyjson_mut_obj_add_val(doc, item, "definition_ids", origins);
                            yyjson_mut_obj_add_val(doc, item, "sibling_definition_ids", fallback);
                            yyjson_mut_val *steps = yyjson_mut_arr(doc);
                            for (size_t o = 0; o <= expanded.items[v].origin_count; o++) {
                                int64_t from = o ? expanded.items[v].origins[o - 1] : init->id;
                                if (o && from == init->id) continue;
                                const cbm_gbuf_edge_t **trace = NULL; int trace_count = 0;
                                cbm_gbuf_find_edges_by_source_type(r->gb, from, "RESOLVES_VALUE_FROM",
                                                                   &trace, &trace_count);
                                for (int t = 0; t < trace_count; t++) {
                                    if (!cl_has_origin(&expanded.items[v], trace[t]->target_id)) continue;
                                    yyjson_doc *p = yyjson_read(trace[t]->properties_json,
                                                               strlen(trace[t]->properties_json), 0);
                                    if (!p) { r->failed = true; break; }
                                    yyjson_mut_val *step = yyjson_val_mut_copy(doc, yyjson_doc_get_root(p));
                                    yyjson_mut_obj_add_sint(doc, step, "from_definition_id", from);
                                    yyjson_mut_obj_add_sint(doc, step, "to_definition_id", trace[t]->target_id);
                                    yyjson_mut_arr_add_val(steps, step);
                                    yyjson_doc_free(p);
                                }
                            }
                            yyjson_mut_obj_add_val(doc, item, "steps", steps);
                            yyjson_mut_arr_add_val(values, item);
                        }
                        expanded_json = yyjson_mut_write(doc, 0, NULL);
                        if (!expanded_json) r->failed = true;
                        yyjson_mut_doc_free(doc);
                    }
                    cl_variants_free(&expanded);
                }
                if (!cbm_gbuf_insert_edge(r->gb, id, binding.origins[b], "RESOLVES_TO_CONFIG",
                    expanded_json ? expanded_json : "{\"strategy\":\"variant_config_scope\"}")) r->failed = true;
                free(expanded_json);
                linked++;
                r->binding_edges++;
            }
        }
        cl_resolution_properties(r->gb, id, linked ? "resolved" : "unresolved", NULL);
        free(binding.origins);
    }
}

static bool cl_read_link(cl_resolver_t *r, int64_t variant, cl_file_link_t *link) {
    const cbm_gbuf_edge_t **edges = NULL; int n = 0;
    link->variant = variant;
    cbm_gbuf_find_edges_by_target_type(r->gb, variant, "HAS_VARIANT", &edges, &n);
    if (n != 1) return false;
    link->owner = edges[0]->source_id;
    cbm_gbuf_find_edges_by_source_type(r->gb, variant, "REFERENCES_FILE", &edges, &n);
    if (n != 1) return false;
    link->file = edges[0]->target_id;
    cbm_gbuf_find_edges_by_source_type(r->gb, variant, "DERIVED_FROM", &edges, &n);
    for (int i = 0; i < n; i++) cl_origin_add(r, &link->selection, edges[i]->target_id);
    return !r->failed;
}

static void cl_resolve_sql_on_demand(cl_resolver_t *r, const char *path,
                                     const cbm_gbuf_node_t **uses, int use_count) {
    const cbm_gbuf_edge_t **edges = NULL; int n = 0;
    cbm_gbuf_find_edges_by_type(r->gb, "REFERENCES_FILE", &edges, &n);
    for (int i = 0; i < n && !r->failed; i++) {
        const cbm_gbuf_node_t *file = cbm_gbuf_find_by_id(r->gb, edges[i]->target_id);
        const cbm_gbuf_node_t *variant = cbm_gbuf_find_by_id(r->gb, edges[i]->source_id);
        if (!file || !variant || strcmp(variant->label, "ConfigValueVariant") ||
            strcmp(file->file_path, path)) continue;
        const cbm_gbuf_edge_t **contexts = NULL; int count = 0;
        cbm_gbuf_find_edges_by_source_type(r->gb, variant->id, "HAS_CALLER_CONTEXT", &contexts, &count);
        cl_file_link_t *links = calloc((size_t)count + 1, sizeof(*links));
        cl_call_frame_t *frames = calloc((size_t)count + 1, sizeof(*frames));
        if (!links || !frames) { free(links); free(frames); r->failed = true; break; }
        bool valid = true;
        for (int j = 0; j < count; j++) {
            yyjson_doc *doc = yyjson_read(contexts[j]->properties_json,
                                          strlen(contexts[j]->properties_json), 0);
            yyjson_val *dv = doc ? yyjson_obj_get(yyjson_doc_get_root(doc), "depth") : NULL;
            int64_t depth = yyjson_is_int(dv) ? yyjson_get_sint(dv) : -1;
            if (depth < 0 || depth >= count || links[depth].variant) valid = false;
            else valid &= cl_read_link(r, contexts[j]->target_id, &links[depth]);
            if (doc) yyjson_doc_free(doc);
        }
        valid &= cl_read_link(r, variant->id, &links[count]);
        for (int j = 0; j <= count; j++) {
            frames[j].link = &links[j];
            if (j < count) frames[j].child = &frames[j + 1];
            if (!links[j].variant) valid = false;
        }
        if (valid) {
            r->sql_values = true;
            cl_bind_call_chain(r, frames, uses, use_count);
            r->sql_values = false;
        }
        for (int j = 0; j <= count; j++) free(links[j].selection.origins);
        free(links); free(frames);
    }
}

/* Walk concrete call contexts forward. Path evaluation and parameter lookup
 * share the same environment; we never infer a new environment by joining
 * all callers of a shared file after its path has been expanded. */
static void cl_expand_called_file(cl_resolver_t *r, const cl_call_frame_t *chain,
                                  const cbm_gbuf_node_t **files, int file_count,
                                  const cbm_gbuf_node_t **uses, int use_count,
                                  cl_variant_t *called_files) {
    const cl_call_frame_t *leaf = chain;
    int depth = 1;
    while (leaf->child) { leaf = leaf->child; depth++; }
    const cbm_gbuf_node_t *file = cbm_gbuf_find_by_id(r->gb, leaf->link->file);
    if (!file) return;
    cl_origin_add(r, called_files, file->id);
    for (const cl_call_frame_t *f = chain; f; f = f->child) {
        const cbm_gbuf_node_t *owner = cbm_gbuf_find_by_id(r->gb, f->link->owner);
        if (owner && !strcmp(owner->file_path, file->file_path)) {
            cl_resolution_properties(r->gb, leaf->link->variant, "call_cycle", NULL);
            return;
        }
    }
    cl_bind_call_chain(r, chain, uses, use_count);
    for (int i = 0; i < r->count && !r->failed; i++) {
        const cbm_gbuf_node_t *owner = r->values[i].node;
        if (strcmp(owner->file_path, file->file_path)) continue;
        const char *raw = r->values[i].value;
        if (!cl_sql_path_value(raw) && !strstr(raw, "${") && !strstr(raw, "{{")) continue;
        r->context = chain;
        if (!cl_may_be_path(r, owner, raw, NULL)) continue;
        cl_variants_t variants = cl_expand_variants(r, owner, raw, NULL);
        for (size_t vi = 0; vi < variants.count && !r->failed; vi++) {
            cl_variant_t *v = &variants.items[vi];
            if (!cl_sql_path_value(v->text)) continue;
            r->context = chain;
            int64_t variant = cl_emit_variant(r, owner, v);
            const cbm_gbuf_node_t *match = NULL;
            bool ambiguous = false;
            for (int j = 0; j < file_count; j++) {
                if (!cl_value_references_file(v->text, files[j]->file_path)) continue;
                if (match && match->id != files[j]->id) ambiguous = true;
                else match = files[j];
            }
            cl_resolution_properties(r->gb, variant, ambiguous ? "ambiguous" :
                !match ? "file_not_found" : v->suffix ? "suffix_match" : "resolved", v->text);
            if (!match || ambiguous || !variant) continue;
            if (!cbm_gbuf_insert_edge(r->gb, variant, match->id, "REFERENCES_FILE",
                                      "{\"strategy\":\"caller_context_path\"}")) r->failed = true;
            cl_file_link_t next_link = {.owner = owner->id, .variant = variant,
                                        .file = match->id, .selection = *v};
            cl_call_frame_t *next = calloc((size_t)depth + 1, sizeof(*next));
            if (!next) { r->failed = true; break; }
            const cl_call_frame_t *f = chain;
            for (int j = 0; j < depth; j++, f = f->child) {
                next[j].link = f->link; next[j].child = &next[j + 1];
            }
            next[depth].link = &next_link;
            cl_expand_called_file(r, next, files, file_count, uses, use_count, called_files);
            free(next);
        }
        cl_variants_free(&variants);
    }
    r->context = NULL;
}

typedef struct {
    cl_resolver_t *resolver;
    cl_variant_t invalid;
    const cbm_gbuf_edge_t **edges;
    int count;
} cl_prune_t;

static void cl_collect_invalid_edge(const cbm_gbuf_edge_t *edge, void *data) {
    cl_prune_t *p = data;
    if (!cl_has_origin(&p->invalid, edge->source_id) &&
        !cl_has_origin(&p->invalid, edge->target_id)) return;
    const cbm_gbuf_edge_t **grown = realloc(p->edges, ((size_t)p->count + 1) * sizeof(*grown));
    if (!grown) { p->resolver->failed = true; return; }
    p->edges = grown; p->edges[p->count++] = edge;
}

/* A path discovered later can turn an apparent root into a callee. Discard
 * that provisional root's descendants instead of retaining contextless
 * executions. This makes the result independent of value/file sort order. */
static void cl_prune_provisional_contexts(cl_resolver_t *r) {
    cl_prune_t p = {.resolver = r};
    const cbm_gbuf_edge_t **contexts = NULL; int count = 0;
    cbm_gbuf_find_edges_by_type(r->gb, "HAS_CALLER_CONTEXT", &contexts, &count);
    size_t before;
    do {
        before = p.invalid.origin_count;
        for (int i = 0; i < count; i++) {
            const cbm_gbuf_edge_t **refs = NULL; int n = 0;
            cbm_gbuf_find_edges_by_source_type(r->gb, contexts[i]->target_id, "REFERENCES_FILE", &refs, &n);
            if (!n || cl_has_origin(&p.invalid, contexts[i]->target_id))
                cl_origin_add(r, &p.invalid, contexts[i]->source_id);
        }
    } while (!r->failed && before != p.invalid.origin_count);
    cbm_gbuf_foreach_edge(r->gb, cl_collect_invalid_edge, &p);
    if (!r->failed && p.count) cbm_gbuf_delete_edges(r->gb, p.edges, p.count);
    cbm_gbuf_delete_edgeless(r->gb, "ConfigBinding");
    cbm_gbuf_delete_edgeless(r->gb, "ConfigValueVariant");
    free(p.edges); free(p.invalid.origins);
}

/* Keep lexical resolution distinct from resolution under incoming contexts.
 * A shared use may resolve in one caller and remain unresolved in another. */
static void cl_config_context_status(cl_resolver_t *r, const cbm_gbuf_node_t *use) {
    const cbm_gbuf_edge_t **incoming = NULL;
    int count = 0, total = 0, resolved = 0;
    cbm_gbuf_find_edges_by_target_type(r->gb, use->id, "BINDS_VARIABLE", &incoming, &count);
    for (int i = 0; i < count; i++) {
        const cbm_gbuf_node_t *binding = cbm_gbuf_find_by_id(r->gb, incoming[i]->source_id);
        if (!binding || strcmp(binding->label, "ConfigBinding")) continue;
        const cbm_gbuf_edge_t **targets = NULL;
        int target_count = 0;
        cbm_gbuf_find_edges_by_source_type(r->gb, binding->id, "RESOLVES_TO_CONFIG",
                                           &targets, &target_count);
        total++; resolved += target_count > 0;
    }
    if (!total) return;
    yyjson_doc *doc = yyjson_read(use->properties_json, strlen(use->properties_json), 0);
    yyjson_mut_doc *out = doc ? yyjson_doc_mut_copy(doc, NULL) : NULL;
    if (!out) { if (doc) yyjson_doc_free(doc); r->failed = true; return; }
    yyjson_mut_val *root = yyjson_mut_doc_get_root(out);
    const char *local = yyjson_get_str(yyjson_obj_get(yyjson_doc_get_root(doc), "resolution_status"));
    if (local) yyjson_mut_obj_add_strcpy(out, root, "local_resolution_status", local);
    if (resolved) {
        yyjson_mut_obj_remove_key(root, "resolution_status");
        yyjson_mut_obj_add_str(out, root, "resolution_status", "context_dependent");
    }
    yyjson_mut_obj_add_str(out, root, "context_resolution_status",
                           resolved == total ? "resolved" : resolved ? "partial" : "unresolved");
    yyjson_mut_obj_add_int(out, root, "context_binding_count", total);
    yyjson_mut_obj_add_int(out, root, "resolved_context_count", resolved);
    char *json = yyjson_mut_write(out, 0, NULL);
    if (json) {
        cbm_gbuf_node_set_properties_json((cbm_gbuf_node_t *)use, json);
        free(json);
    } else r->failed = true;
    yyjson_mut_doc_free(out); yyjson_doc_free(doc);
}

static int strategy_config_sql_links(cbm_gbuf_t *gb, const char *sql_path) {
    bool lazy = sql_path != NULL;
    /* Rebuild only this pass's derived state; a changed binding must not leave
     * a formerly resolved file/initializer attached on a subsequent run. */
    if (!lazy) {
    cbm_gbuf_delete_by_label(gb, "ConfigVariableRef");
    cbm_gbuf_delete_by_label(gb, "ConfigValueVariant");
    cbm_gbuf_delete_by_label(gb, "SqlConfigBinding");
    cbm_gbuf_delete_by_label(gb, "ConfigBinding");
    const cbm_gbuf_edge_t **old_aliases = NULL; int old_alias_count = 0;
    cbm_gbuf_find_edges_by_type(gb, "RESOLVES_TO_ANCHOR", &old_aliases, &old_alias_count);
    if (old_alias_count) cbm_gbuf_delete_edges(gb, old_aliases, old_alias_count);
    const char *derived_types[] = {"REFERENCES_FILE", "RESOLVES_TO_CONFIG"};
    for (size_t ti = 0; ti < sizeof(derived_types) / sizeof(derived_types[0]); ti++) {
        const cbm_gbuf_edge_t **edges = NULL;
        int count = 0;
        cbm_gbuf_find_edges_by_type(gb, derived_types[ti], &edges, &count);
        const cbm_gbuf_edge_t **owned = count ? malloc((size_t)count * sizeof(*owned)) : NULL;
        if (count && !owned) return -1;
        int n = 0;
        for (int i = 0; owned && i < count; i++) {
            const char *props = edges[i]->properties_json;
            if (props && (strstr(props, "\"config_value_path\"") ||
                          strstr(props, "\"resolved_config_path\"") ||
                          strstr(props, "\"resolved_path_suffix\"") ||
                          strstr(props, "\"caller_config_scope\""))) owned[n++] = edges[i];
        }
        if (n) cbm_gbuf_delete_edges(gb, owned, n);
        free(owned);
    }
    }
    const cbm_gbuf_node_t **vars = NULL, **files = NULL, **sql_refs = NULL;
    int var_count = 0, file_count = 0, sql_ref_count = 0;
    if (cbm_gbuf_find_by_label(gb, "Variable", &vars, &var_count) != 0 ||
        cbm_gbuf_find_by_label(gb, "File", &files, &file_count) != 0) return 0;
    if (lazy) (void)cbm_gbuf_find_by_label(gb, "SqlVariableRef", &sql_refs, &sql_ref_count);

    cl_config_value_t *values = calloc((size_t)var_count, sizeof(*values));
    if (var_count && !values) return -1;
    int value_count = 0;
    for (int i = 0; values && i < var_count; i++) {
        char *value = NULL;
        if (cl_config_value(vars[i], &value)) {
            values[value_count].node = vars[i];
            values[value_count++].value = value;
        }
    }

    cl_config_value_t *by_name = value_count ? malloc((size_t)value_count * sizeof(*by_name)) : NULL;
    if (value_count && !by_name) {
        for (int i = 0; i < value_count; i++) free(values[i].value);
        free(values);
        return -1;
    }
    if (value_count) {
        memcpy(by_name, values, (size_t)value_count * sizeof(*by_name));
        qsort(by_name, (size_t)value_count, sizeof(*by_name), cl_config_name_cmp);
        qsort(values, (size_t)value_count, sizeof(*values), cl_config_value_cmp);
    }
    const cbm_gbuf_edge_t **hierarchy = NULL;
    int hierarchy_count = 0;
    (void)cbm_gbuf_find_edges_by_type(gb, "HAS_CONFIG_KEY", &hierarchy, &hierarchy_count);
    cl_parent_t *parents = calloc((size_t)hierarchy_count, sizeof(*parents));
    cl_child_t *children = calloc((size_t)hierarchy_count, sizeof(*children));
    if (hierarchy_count > 0 && (!parents || !children)) {
        for (int i = 0; i < value_count; i++) free(values[i].value);
        free(values);
        free(by_name);
        free(parents);
        free(children);
        return -1;
    }
    for (int i = 0; i < hierarchy_count; i++) {
        parents[i] = (cl_parent_t){hierarchy[i]->target_id, hierarchy[i]->source_id};
        children[i] = (cl_child_t){hierarchy[i]->source_id, hierarchy[i]->target_id};
    }
    if (parents) qsort(parents, (size_t)hierarchy_count, sizeof(*parents), cl_parent_cmp);
    if (children) qsort(children, (size_t)hierarchy_count, sizeof(*children), cl_child_cmp);

    cl_resolver_t resolver = {.gb = gb, .parents = parents, .children = children,
        .hc = hierarchy_count, .values = values, .by_name = by_name, .count = value_count};
    resolver.lookup_cache = cbm_ht_create(0);
    resolver.namespaces = cbm_ht_create(0);
    if (!resolver.lookup_cache || !resolver.namespaces) resolver.failed = true;
    for (int i = 0; i < value_count && !resolver.failed; i++) {
        const char *path = values[i].node->file_path;
        const char *base = strrchr(path, '/'); base = base ? base + 1 : path;
        const char *win = strrchr(base, '\\'); if (win) base = win + 1;
        const char *dot = strrchr(base, '.');
        if (!dot) continue;
        char *key = cbm_strndup(base, (size_t)(dot - base));
        if (!key) { resolver.failed = true; break; }
        if (cbm_ht_has(resolver.namespaces, key)) free(key);
        else {
            cbm_ht_set(resolver.namespaces, key, (void *)(uintptr_t)1);
            if (!cbm_ht_has(resolver.namespaces, key)) { free(key); resolver.failed = true; }
        }
    }
    if (!lazy) cl_link_yaml_aliases(&resolver, vars, var_count);
    else cbm_gbuf_find_edges_by_type(gb, "RESOLVES_TO_ANCHOR", &resolver.aliases, &resolver.alias_count);
    if (!lazy) cbm_log_info("configlinker.paths", "phase", "lexical_expansion");
    cl_file_link_t *links = NULL; int link_count = 0, link_cap = 0;
    int edge_count = 0;
    for (int i = 0; !lazy && i < value_count && !resolver.failed; i++) {
        const cbm_gbuf_node_t *owner = values[i].node;
        bool templated = strstr(values[i].value, "{{") || strstr(values[i].value, "${");
        if (!templated && !cl_sql_path_value(values[i].value)) continue;
        if (templated) {
            resolver.scan_only = true;
            cl_variants_t scanned = cl_expand_variants(&resolver, owner, values[i].value, NULL);
            cl_variants_free(&scanned);
            resolver.scan_only = false;
        }
        if (!cl_may_be_path(&resolver, owner, values[i].value, NULL)) continue;
        cl_variants_t variants = cl_expand_variants(&resolver, owner, values[i].value, NULL);
        const char *status = variants.cycle ? "cycle" : variants.unresolved ? "unresolved" :
                             variants.count > 1 ? "multiple_values" : "resolved";
        cl_resolution_properties(gb, owner->id, status,
            variants.count == 1 ? variants.items[0].text : NULL);
        for (size_t vi = 0; vi < variants.count && !resolver.failed; vi++) {
            cl_variant_t *v = &variants.items[vi];
            int64_t variant = cl_emit_variant(&resolver, owner, v);
            if (!variant || !cl_sql_path_value(v->text)) continue;
            const cbm_gbuf_node_t *match = NULL;
            bool ambiguous = false;
            for (int j = 0; j < file_count; j++) {
                if (!cl_value_references_file(v->text, files[j]->file_path)) continue;
                if (match && match->id != files[j]->id) ambiguous = true;
                else match = files[j];
            }
            const char *file_status = ambiguous ? "ambiguous" : !match ? "file_not_found" :
                                      v->suffix ? "suffix_match" : "resolved";
            cl_resolution_properties(gb, variant, file_status, v->text);
            if (variants.count == 1 && !variants.cycle && !variants.unresolved)
                cl_resolution_properties(gb, owner->id, file_status, v->text);
            if (!match || ambiguous) continue;
            if (!cbm_gbuf_insert_edge(gb, variant, match->id, "REFERENCES_FILE",
                v->suffix ? "{\"strategy\":\"resolved_path_suffix\"}" :
                            "{\"strategy\":\"resolved_config_path\"}")) resolver.failed = true;
            edge_count++;
            if (link_count == link_cap) {
                int next = link_cap ? link_cap * 2 : 32;
                cl_file_link_t *grown = realloc(links, (size_t)next * sizeof(*grown));
                if (!grown) { resolver.failed = true; break; }
                links = grown; link_cap = next;
            }
            cl_file_link_t link = {.owner = owner->id, .variant = variant, .file = match->id};
            if (v->origin_count) {
                link.selection.origins = malloc(v->origin_count * sizeof(*v->origins));
                if (!link.selection.origins) { resolver.failed = true; break; }
                memcpy(link.selection.origins, v->origins, v->origin_count * sizeof(*v->origins));
                link.selection.origin_count = v->origin_count;
            }
            links[link_count++] = link;
        }
        cl_variants_free(&variants);
    }

    /* ConfigVariableRefs exist after scanning. Only config bindings persist;
     * SQL uses enter this resolver later, in a disposable query snapshot. */
    if (!lazy) cbm_log_info("configlinker.paths", "phase", "caller_expansion");
    const cbm_gbuf_node_t **config_refs = NULL;
    int config_ref_count = 0;
    if (!lazy) cbm_gbuf_find_by_label(gb, "ConfigVariableRef", &config_refs, &config_ref_count);
    int use_count = sql_ref_count + config_ref_count;
    const cbm_gbuf_node_t **uses = use_count ? malloc((size_t)use_count * sizeof(*uses)) : NULL;
    if (use_count && !uses) resolver.failed = true;
    if (uses) {
        if (sql_ref_count) memcpy(uses, sql_refs, (size_t)sql_ref_count * sizeof(*uses));
        if (config_ref_count) memcpy(uses + sql_ref_count, config_refs,
                                    (size_t)config_ref_count * sizeof(*uses));
    }
    if (!lazy) {
        cl_variant_t called_files = {0};
        /* Start with roots, then isolated cyclic components. */
        for (int round = 0; round < 2; round++)
        for (int i = 0; i < link_count && !resolver.failed; i++) {
            const cbm_gbuf_node_t *owner = cbm_gbuf_find_by_id(gb, links[i].owner);
            bool incoming = false, called = false;
            for (int j = 0; j < link_count; j++) {
                const cbm_gbuf_node_t *file = cbm_gbuf_find_by_id(gb, links[j].file);
                if (!strcmp(owner->file_path, file->file_path)) incoming = true;
            }
            for (size_t j = 0; j < called_files.origin_count; j++) {
                const cbm_gbuf_node_t *file = cbm_gbuf_find_by_id(gb, called_files.origins[j]);
                if (!strcmp(owner->file_path, file->file_path)) called = true;
            }
            if ((!round && incoming) || (round && (!incoming || called))) continue;
            cl_call_frame_t frame = {.link = &links[i]};
            cl_expand_called_file(&resolver, &frame, files, file_count, uses, use_count, &called_files);
        }
        /* Lexically expanded variants remain inspectable, but a called file's
         * actual file links belong to its concrete incoming contexts. */
        const cbm_gbuf_edge_t **obsolete = NULL;
        int obsolete_count = 0;
        for (int i = 0; i < link_count; i++) {
            const cbm_gbuf_node_t *owner = cbm_gbuf_find_by_id(gb, links[i].owner);
            for (size_t j = 0; j < called_files.origin_count; j++) {
                const cbm_gbuf_node_t *file = cbm_gbuf_find_by_id(gb, called_files.origins[j]);
                if (strcmp(owner->file_path, file->file_path)) continue;
                const cbm_gbuf_edge_t **edges = NULL; int n = 0;
                cbm_gbuf_find_edges_by_source_type(gb, links[i].variant, "REFERENCES_FILE", &edges, &n);
                if (n) {
                    const cbm_gbuf_edge_t **grown = realloc(obsolete,
                        ((size_t)obsolete_count + (size_t)n) * sizeof(*grown));
                    if (!grown) { resolver.failed = true; break; }
                    obsolete = grown;
                    memcpy(obsolete + obsolete_count, edges, (size_t)n * sizeof(*edges));
                    obsolete_count += n;
                }
                break;
            }
        }
        /* Deletion rebuilds secondary indexes: batch it once, not once per
         * path (which would rescan/reindex the entire graph thousands of times). */
        if (!resolver.failed && obsolete_count) cbm_gbuf_delete_edges(gb, obsolete, obsolete_count);
        free(obsolete);
        free(called_files.origins);
        cl_prune_provisional_contexts(&resolver);
        cbm_log_info("configlinker.paths", "phase", "contexts_complete");
    } else cl_resolve_sql_on_demand(&resolver, sql_path, uses, use_count);
    free(uses);
    if (!lazy) cbm_gbuf_find_by_label(gb, "ConfigVariableRef", &config_refs, &config_ref_count);
    for (int i = 0; i < config_ref_count && !resolver.failed; i++)
        cl_config_context_status(&resolver, config_refs[i]);
    for (int i = 0; i < link_count; i++) free(links[i].selection.origins);
    free(links);
    for (int i = 0; i < value_count; i++) free(values[i].value);
    free(values);
    free(by_name);
    free(parents);
    free(children);
    free(resolver.fallback_definitions.origins);
    if (resolver.lookup_cache) {
        cbm_ht_foreach(resolver.lookup_cache, cl_lookup_cache_free, NULL);
        cbm_ht_free(resolver.lookup_cache);
    }
    if (resolver.namespaces) {
        cbm_ht_foreach(resolver.namespaces, cl_namespace_free, NULL);
        cbm_ht_free(resolver.namespaces);
    }
    return resolver.failed ? -1 : edge_count + resolver.binding_edges;
}

/* Only call with a disposable graph snapshot. The persistent index contains
 * uses and call contexts, never the SQL-use × caller binding product. */
int cbm_configlink_resolve_sql(cbm_gbuf_t *snapshot, const char *file_path) {
    if (!snapshot || !file_path) return -1;
    cbm_gbuf_delete_by_label(snapshot, "SqlConfigBinding");
    const cbm_gbuf_edge_t **trace = NULL; int trace_count = 0;
    cbm_gbuf_find_edges_by_type(snapshot, "RESOLVES_VALUE_FROM", &trace, &trace_count);
    if (trace_count) cbm_gbuf_delete_edges(snapshot, trace, trace_count);
    return strategy_config_sql_links(snapshot, file_path);
}

int cbm_pipeline_pass_configlink(cbm_pipeline_ctx_t *ctx) {
    cbm_gbuf_t *gb = ctx->gbuf;
    /* Early exit: check if any config files exist in the project. */
    bool has_config = false;

    const cbm_gbuf_node_t **vars_check = NULL;
    int var_check_count = 0;
    if (!has_config && cbm_gbuf_find_by_label(gb, "Variable", &vars_check, &var_check_count) == 0) {
        for (int i = 0; i < var_check_count; i++) {
            if (cbm_has_config_extension(vars_check[i]->file_path)) {
                has_config = true;
                break;
            }
        }
    }

    if (!has_config) {
        const cbm_gbuf_node_t **mods_check = NULL;
        int mod_check_count = 0;
        if (cbm_gbuf_find_by_label(gb, "Module", &mods_check, &mod_check_count) == 0) {
            for (int i = 0; i < mod_check_count; i++) {
                if (cbm_has_config_extension(mods_check[i]->file_path)) {
                    has_config = true;
                    break;
                }
            }
        }
    }

    if (!has_config) {
        cbm_log_info("configlinker.skip", "reason", "no_config_files");
        return 0;
    }

    char buf1[CBM_SZ_16];
    char buf2[CBM_SZ_16];
    char buf3[CBM_SZ_16];
    char buf4[CBM_SZ_16];

    int key_edges = strategy_key_symbols(gb);
    snprintf(buf1, sizeof(buf1), "%d", key_edges);
    cbm_log_info("configlinker.strategy", "name", "key_symbol", "edges", buf1);

    int dep_edges = strategy_dep_imports(gb);
    snprintf(buf2, sizeof(buf2), "%d", dep_edges);
    cbm_log_info("configlinker.strategy", "name", "dep_import", "edges", buf2);

    int ref_edges = strategy_config_sql_links(gb, NULL);
    if (ref_edges < 0) return ref_edges;
    snprintf(buf3, sizeof(buf3), "%d", ref_edges);
    cbm_log_info("configlinker.strategy", "name", "file_ref", "edges", buf3);

    snprintf(buf4, sizeof(buf4), "%d", key_edges + dep_edges + ref_edges);
    cbm_log_info("configlinker.done", "total", buf4);

    return key_edges + dep_edges + ref_edges;
}
