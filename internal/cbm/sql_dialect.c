#include "sql_dialect.h"

#include <ctype.h>
#include <stdbool.h>
#include <string.h>

typedef struct {
    const char *needle;
    const char *dialects[CBM_SQL_DIALECT_CANDIDATE_MAX];
    unsigned weight;
} DialectMarker;

/* Only reasonably distinctive constructs belong here.  Shared constructs map
 * to several candidates; the parser or the surrounding directory profile
 * makes the final choice. */
static const DialectMarker k_markers[] = {
    {"LATERAL VIEW", {"spark", "hive"}, 4},
    {"TBLPROPERTIES", {"spark", "hive", "databricks"}, 4},
    {"STORED AS", {"hive", "spark"}, 3},
    {"DISTRIBUTE BY", {"spark", "hive"}, 3},
    {"USING DELTA", {"databricks", "spark"}, 5},
    {"ZORDER BY", {"databricks"}, 5},
    {"DISTKEY", {"redshift"}, 5},
    {"SORTKEY", {"redshift"}, 5},
    {"SAFE_CAST", {"bigquery"}, 4},
    {"STRUCT<", {"bigquery", "spark"}, 3},
    {"QUALIFY", {"bigquery", "snowflake", "duckdb"}, 2},
    {"FLATTEN(", {"snowflake"}, 4},
    {"VARIANT", {"snowflake"}, 3},
    {"IFF(", {"snowflake"}, 3},
    {"ON DUPLICATE KEY", {"mysql"}, 5},
    {"ON CONFLICT", {"postgres"}, 4},
    {"RETURNING", {"postgres", "sqlite"}, 2},
    {"VARCHAR2", {"oracle"}, 5},
    {"CONNECT BY", {"oracle"}, 4},
    {"NVL(", {"oracle", "snowflake", "hive", "spark"}, 1},
    {"SELECT TOP ", {"tsql"}, 4},
    {"TRY_CONVERT(", {"tsql"}, 4},
};

static _Thread_local const char *tl_hint;
static _Thread_local const char *tl_hint_source;
static _Thread_local const char *tl_directory;
static _Thread_local const char *tl_ranked[32];
static _Thread_local int tl_ranked_count;

void cbm_sql_dialect_hint_set(const char *dialect, const char *source) {
    tl_hint = dialect;
    tl_hint_source = source;
    tl_directory = NULL;
    tl_ranked_count = 0;
}

void cbm_sql_dialect_preferences_set(const char *directory, const char *const *ranked, int count) {
    tl_directory = directory;
    tl_ranked_count = count < 32 ? count : 32;
    for (int i = 0; i < tl_ranked_count; i++) tl_ranked[i] = ranked[i];
}

static int preference(const char *name) {
    if (tl_directory && !strcmp(name, tl_directory)) return -1;
    for (int i = 0; i < tl_ranked_count; i++) if (!strcmp(name, tl_ranked[i])) return i;
    return 32;
}

void cbm_sql_dialect_order_candidates(CBMSqlDialectCandidate *candidates, int count) {
    for (int i = 1; i < count; i++) {
        CBMSqlDialectCandidate value = candidates[i];
        int j = i;
        while (j > 0 && (preference(candidates[j - 1].name) > preference(value.name) ||
            (preference(candidates[j - 1].name) == preference(value.name) &&
             strcmp(candidates[j - 1].name, value.name) > 0))) {
            candidates[j] = candidates[j - 1]; j--;
        }
        candidates[j] = value;
    }
}

const char *cbm_sql_dialect_hint_get(const char **source) {
    if (source) *source = tl_hint_source;
    return tl_hint;
}

static bool contains_ascii_ci(const char *text, size_t len, const char *needle) {
    size_t n = strlen(needle);
    if (!text || !n || len < n) return false;
    for (size_t i = 0; i < len; i++) {
        if (i + 1 < len && text[i] == '-' && text[i + 1] == '-') {
            while (i < len && text[i] != '\n') i++;
            continue;
        }
        if (i + 1 < len && text[i] == '/' && text[i + 1] == '*') {
            unsigned depth = 1;
            i += 2;
            while (i + 1 < len && depth) {
                if (text[i] == '/' && text[i + 1] == '*') { depth++; i += 2; }
                else if (text[i] == '*' && text[i + 1] == '/') { depth--; i += 2; }
                else i++;
            }
            if (depth) return false;
            i--;
            continue;
        }
        if (text[i] == '\'' || text[i] == '"' || text[i] == '`' || text[i] == '[') {
            char quote = text[i] == '[' ? ']' : text[i];
            for (i++; i < len; i++) {
                if (text[i] == '\\' && i + 1 < len) { i++; continue; }
                if (text[i] == quote) {
                    if (i + 1 < len && text[i + 1] == quote) { i++; continue; }
                    break;
                }
            }
            continue;
        }
        if (text[i] == '$') {
            size_t end = i + 1;
            while (end < len && (isalnum((unsigned char)text[end]) || text[end] == '_')) end++;
            if (end < len && text[end] == '$') {
                size_t tag = end - i + 1, at = end + 1;
                while (at + tag <= len && memcmp(text + at, text + i, tag)) at++;
                if (at + tag > len) return false;
                i = at + tag - 1;
                continue;
            }
        }
        if (i && (isalnum((unsigned char)text[i - 1]) || text[i - 1] == '_' || text[i - 1] == '$')) continue;
        size_t j = 0, at = i;
        while (j < n && at < len) {
            if (isspace((unsigned char)needle[j])) {
                if (!isspace((unsigned char)text[at])) break;
                while (at < len && isspace((unsigned char)text[at])) at++;
                while (j < n && isspace((unsigned char)needle[j])) j++;
            } else {
                if (needle[j] == '(') while (at < len && isspace((unsigned char)text[at])) at++;
                if (at >= len || toupper((unsigned char)text[at]) != needle[j]) break;
                at++; j++;
            }
        }
        if (j == n && (!isalnum((unsigned char)needle[n - 1]) || at == len ||
            !(isalnum((unsigned char)text[at]) || text[at] == '_' || text[at] == '$'))) return true;
    }
    return false;
}

static void add_score(CBMSqlDialectCandidate *scores, int *count, const char *name,
                      unsigned weight) {
    if (!name) return;
    for (int i = 0; i < *count; i++) {
        if (strcmp(scores[i].name, name) == 0) {
            scores[i].score += weight;
            return;
        }
    }
    if (*count < 32) scores[(*count)++] = (CBMSqlDialectCandidate){name, weight};
}

int cbm_sql_dialect_candidates(const char *sql, size_t len,
                               CBMSqlDialectCandidate out[CBM_SQL_DIALECT_CANDIDATE_MAX]) {
    CBMSqlDialectCandidate scores[32] = {{0}};
    int count = 0;
    for (size_t i = 0; i < sizeof(k_markers) / sizeof(k_markers[0]); i++) {
        if (!contains_ascii_ci(sql, len, k_markers[i].needle)) continue;
        for (int j = 0; j < CBM_SQL_DIALECT_CANDIDATE_MAX && k_markers[i].dialects[j]; j++)
            add_score(scores, &count, k_markers[i].dialects[j], k_markers[i].weight);
    }
    for (int i = 1; i < count; i++) {
        CBMSqlDialectCandidate value = scores[i];
        int j = i;
        while (j > 0 && (scores[j - 1].score < value.score ||
                         (scores[j - 1].score == value.score &&
                          strcmp(scores[j - 1].name, value.name) > 0))) {
            scores[j] = scores[j - 1];
            j--;
        }
        scores[j] = value;
    }
    int n = count < CBM_SQL_DIALECT_CANDIDATE_MAX ? count : CBM_SQL_DIALECT_CANDIDATE_MAX;
    for (int i = 0; i < n; i++) out[i] = scores[i];
    return n;
}
