/*
 * test_configlink.c — Tests for config ↔ code linking strategies.
 *
 * Ported from internal/pipeline/configlink_test.go (9 tests).
 * Uses unit test approach: set up gbuf state directly, run strategies,
 * check CONFIGURES edges.
 */
#include "../src/foundation/compat.h"
#include "test_framework.h"
#include "test_helpers.h"
#include "pipeline/pipeline.h"
#include "pipeline/pipeline_internal.h"
#include "graph_buffer/graph_buffer.h"

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdatomic.h>

/* Helper: wrap old (gb, project, repo_path) call into ctx-based API */
static int run_configlink(cbm_gbuf_t *gb, const char *project, const char *repo_path) {
    atomic_int cancelled;
    atomic_init(&cancelled, 0);
    cbm_pipeline_ctx_t ctx = {
        .project_name = project,
        .repo_path = repo_path,
        .gbuf = gb,
        .cancelled = &cancelled,
    };
    return cbm_pipeline_pass_configlink(&ctx);
}
#include <sys/stat.h>
#include <unistd.h>

/* ── Helpers ─────────────────────────────────────────────────────── */

/* Helper to check if any CONFIGURES edge has a given strategy (parsed from JSON) */
static bool has_strategy(const cbm_gbuf_edge_t **edges, int count, const char *strategy) {
    char needle[64];
    snprintf(needle, sizeof(needle), "\"strategy\":\"%s\"", strategy);
    for (int i = 0; i < count; i++) {
        if (edges[i]->properties_json && strstr(edges[i]->properties_json, needle))
            return true;
    }
    return false;
}

/* Check if any CONFIGURES edge has given strategy AND confidence. */
static bool has_strategy_with_confidence(const cbm_gbuf_edge_t **edges, int count,
                                         const char *strategy, double confidence) {
    char strat_needle[64];
    snprintf(strat_needle, sizeof(strat_needle), "\"strategy\":\"%s\"", strategy);
    char conf_needle[64];
    snprintf(conf_needle, sizeof(conf_needle), "\"confidence\":%.2f", confidence);

    for (int i = 0; i < count; i++) {
        if (edges[i]->properties_json && strstr(edges[i]->properties_json, strat_needle) &&
            strstr(edges[i]->properties_json, conf_needle))
            return true;
    }
    return false;
}

/* Check if any CONFIGURES edge has given strategy AND config_key. */
static bool has_strategy_with_key(const cbm_gbuf_edge_t **edges, int count, const char *strategy,
                                  const char *config_key) {
    char strat_needle[64];
    snprintf(strat_needle, sizeof(strat_needle), "\"strategy\":\"%s\"", strategy);
    char key_needle[128];
    snprintf(key_needle, sizeof(key_needle), "\"config_key\":\"%s\"", config_key);

    for (int i = 0; i < count; i++) {
        if (edges[i]->properties_json && strstr(edges[i]->properties_json, strat_needle) &&
            strstr(edges[i]->properties_json, key_needle))
            return true;
    }
    return false;
}

static bool has_typed_edge(cbm_gbuf_t *gb, const char *type, int64_t source, int64_t target) {
    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    if (cbm_gbuf_find_edges_by_type(gb, type, &edges, &count) != 0) return false;
    for (int i = 0; i < count; i++)
        if (edges[i]->source_id == source && edges[i]->target_id == target) return true;
    return false;
}

static bool has_config_file_edge(cbm_gbuf_t *gb, int64_t owner, int64_t file) {
    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_source_type(gb, owner, "HAS_VARIANT", &edges, &count);
    for (int i = 0; i < count; i++)
        if (has_typed_edge(gb, "REFERENCES_FILE", edges[i]->target_id, file)) return true;
    return false;
}

static bool has_sql_binding(cbm_gbuf_t *gb, int64_t use, int64_t init) {
    const cbm_gbuf_node_t *use_node = cbm_gbuf_find_by_id(gb, use);
    if (!use_node || cbm_configlink_resolve_sql(gb, use_node->file_path) < 0) return false;
    const cbm_gbuf_node_t **nodes = NULL;
    int count = 0;
    cbm_gbuf_find_by_label(gb, "SqlConfigBinding", &nodes, &count);
    for (int i = 0; i < count; i++)
        if (has_typed_edge(gb, "BINDS_VARIABLE", nodes[i]->id, use) &&
            has_typed_edge(gb, "RESOLVES_TO_CONFIG", nodes[i]->id, init)) return true;
    return false;
}

static int64_t add_config_key(cbm_gbuf_t *gb, const char *qn, const char *name,
                              const char *value) {
    char props[512];
    if (value) snprintf(props, sizeof(props),
                        "{\"config_key\":\"true\",\"value_kind\":\"string\",\"value\":\"%s\"}",
                        value);
    else snprintf(props, sizeof(props), "{\"config_key\":\"true\",\"value_kind\":\"object\"}");
    return cbm_gbuf_upsert_node(gb, "Variable", name, qn, "resources/ctl/ctl.yml", 1, 1,
                                props);
}

/* Recursive remove */
static void rm_rf(const char *path) {
    th_rmtree(path);
}

/* ── Strategy 1: Config Key → Code Symbol ───────────────────────── */

/* Go: TestConfigKeySymbol_ExactMatch
 * config.toml has max_connections, main.go has maxConnections(). (A TOML key
 * links by exact name only, see configlink_key_symbol_toml_ini_exact_scoped.) */
TEST(configlink_key_symbol_exact_match) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");

    /* Config Variable node: max_connections from config.toml */
    int64_t cfg_id = cbm_gbuf_upsert_node(gb, "Variable", "max_connections",
                                          "test.config.max_connections", "config.toml", 0, 0, NULL);
    ASSERT_GT(cfg_id, 0);

    /* Code Function node: maxConnections from main.go */
    int64_t func_id = cbm_gbuf_upsert_node(gb, "Function", "maxConnections",
                                           "test.main.maxConnections", "main.go", 0, 0, NULL);
    ASSERT_GT(func_id, 0);

    /* Run configlink */
    int n = run_configlink(gb, "test", NULL);
    ASSERT_GT(n, 0);

    /* Check CONFIGURES edges */
    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    ASSERT_TRUE(has_strategy(edges, count, "key_symbol"));
    cbm_gbuf_free(gb);
    PASS();
}

/* Go: TestConfigKeySymbol_SubstringMatch
 * app.properties has request_timeout, main.go has getRequestTimeoutSeconds().
 * (Formats outside the exact + component rule -- .properties, .env -- keep
 * substring matching.) */
TEST(configlink_key_symbol_substring_match) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");

    cbm_gbuf_upsert_node(gb, "Variable", "request_timeout", "test.app.request_timeout",
                         "app.properties", 0, 0, NULL);

    cbm_gbuf_upsert_node(gb, "Function", "getRequestTimeoutSeconds",
                         "test.main.getRequestTimeoutSeconds", "main.go", 0, 0, NULL);

    run_configlink(gb, "test", NULL);

    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    ASSERT_TRUE(has_strategy_with_confidence(edges, count, "key_symbol", 0.75));
    cbm_gbuf_free(gb);
    PASS();
}

/* Go: TestConfigKeySymbol_ShortKeySkipped
 * config.toml has port, host, name — all 1-token keys, should be skipped */
TEST(configlink_key_symbol_short_key_skipped) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");

    /* Short single-token config keys */
    const char *short_keys[] = {"port", "host", "name"};
    for (int i = 0; i < 3; i++) {
        char qn[64];
        snprintf(qn, sizeof(qn), "test.config.%s", short_keys[i]);
        cbm_gbuf_upsert_node(gb, "Variable", short_keys[i], qn, "config.toml", 0, 0, NULL);
    }

    cbm_gbuf_upsert_node(gb, "Function", "getPort", "test.main.getPort", "main.go", 0, 0, NULL);

    run_configlink(gb, "test", NULL);

    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    /* No key_symbol edges for 1-token keys */
    ASSERT_FALSE(has_strategy(edges, count, "key_symbol"));
    cbm_gbuf_free(gb);
    PASS();
}

/* Go: TestConfigKeySymbol_CamelCaseNormalization
 * config.json has max_retry_count, handler.go has maxRetryCount: camelCase and
 * snake_case normalize to the same key. (A JSON key links by exact name only,
 * see configlink_key_symbol_infra_exact_only, so the symbol names it exactly.) */
TEST(configlink_key_symbol_camel_case) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");

    cbm_gbuf_upsert_node(gb, "Variable", "max_retry_count", "test.config.max_retry_count",
                         "config.json", 0, 0, NULL);

    cbm_gbuf_upsert_node(gb, "Function", "maxRetryCount", "test.handler.maxRetryCount",
                         "handler.go", 0, 0, NULL);

    run_configlink(gb, "test", NULL);

    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    ASSERT_TRUE(has_strategy(edges, count, "key_symbol"));
    cbm_gbuf_free(gb);
    PASS();
}

static int count_key_symbol_edges(cbm_gbuf_t *gb) {
    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    int n = 0;
    for (int i = 0; i < count; i++) {
        if (edges[i]->properties_json &&
            strstr(edges[i]->properties_json, "\"strategy\":\"key_symbol\"")) {
            n++;
        }
    }
    return n;
}

/* Keys of infrastructure files (YAML, JSON, HCL, tfvars) link by exact name
 * only: the substring guess linked a chart's `node_selector` to every
 * function whose name contains it. In 17 infra repositories 4 of 40 sampled
 * key_symbol edges were right, all exact and in the same directory tree. */
TEST(configlink_key_symbol_infra_exact_only) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    cbm_gbuf_upsert_node(gb, "Variable", "node_selector", "test.charts.app.values.node_selector",
                         "charts/app/values.yaml", 0, 0, NULL);
    cbm_gbuf_upsert_node(gb, "Function", "GetPodNodeSelectorConfig",
                         "test.charts.app.gen.GetPodNodeSelectorConfig", "charts/app/gen.go", 0, 0,
                         NULL);
    run_configlink(gb, "test", NULL);
    ASSERT_EQ(count_key_symbol_edges(gb), 0);
    cbm_gbuf_free(gb);
    PASS();
}

/* ...and only within the config file's own component (its directory tree):
 * a stage's JSON schema does not configure an unrelated module's variable. */
TEST(configlink_key_symbol_infra_scoped_to_component) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t cfg = cbm_gbuf_upsert_node(gb, "Variable", "cluster_name",
                                       "test.svc_a.config.cluster_name", "svc-a/config.yaml", 0,
                                       0, NULL);
    int64_t inside = cbm_gbuf_upsert_node(gb, "Function", "clusterName",
                                          "test.svc_a.cmd.main.clusterName", "svc-a/cmd/main.go",
                                          0, 0, NULL);
    cbm_gbuf_upsert_node(gb, "Function", "clusterName", "test.svc_b.main.clusterName",
                         "svc-b/main.go", 0, 0, NULL);
    run_configlink(gb, "test", NULL);
    ASSERT_EQ(count_key_symbol_edges(gb), 1);
    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    ASSERT_EQ(count, 1);
    ASSERT_EQ(edges[0]->source_id, inside);
    ASSERT_EQ(edges[0]->target_id, cfg);
    cbm_gbuf_free(gb);
    PASS();
}

/* A conventional config directory (config/, conf/, settings/, ...) belongs to
 * the component around it. */
TEST(configlink_key_symbol_config_dir_component) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    cbm_gbuf_upsert_node(gb, "Variable", "cluster_name", "test.config.app.cluster_name",
                         "config/app.yaml", 0, 0, NULL);
    cbm_gbuf_upsert_node(gb, "Function", "clusterName", "test.pkg.app.clusterName", "pkg/app.go",
                         0, 0, NULL);
    run_configlink(gb, "test", NULL);
    ASSERT_EQ(count_key_symbol_edges(gb), 1);
    cbm_gbuf_free(gb);
    PASS();
}

/* A Terraform/OpenTofu variable is what a config value sets: a tfvars.json key
 * links to `variable "<key>"` of its component (the block's Class is named
 * `variable.<key>`), not to outputs, modules or resources, and not to a
 * variable of another component (kubespray: contrib/terraform/gcp/tfvars.json
 * sets contrib/terraform/gcp/modules/.../variables.tf). */
TEST(configlink_key_symbol_terraform_variable) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t cfg = cbm_gbuf_upsert_node(gb, "Variable", "ssh_whitelist",
                                       "test.gcp.tfvars.ssh_whitelist",
                                       "contrib/terraform/gcp/tfvars.json", 0, 0, NULL);
    int64_t var = cbm_gbuf_upsert_node(
        gb, "Class", "variable.ssh_whitelist", "test.gcp.modules.cluster.variable.ssh_whitelist",
        "contrib/terraform/gcp/modules/cluster/variables.tf", 0, 0, NULL);
    cbm_gbuf_upsert_node(gb, "Class", "output.ssh_whitelist",
                         "test.gcp.modules.cluster.output.ssh_whitelist",
                         "contrib/terraform/gcp/modules/cluster/outputs.tf", 0, 0, NULL);
    cbm_gbuf_upsert_node(gb, "Class", "variable.ssh_whitelist",
                         "test.hetzner.variable.ssh_whitelist",
                         "contrib/terraform/hetzner/variables.tf", 0, 0, NULL);
    run_configlink(gb, "test", NULL);
    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    ASSERT_EQ(count, 1);
    ASSERT_EQ(edges[0]->source_id, var);
    ASSERT_EQ(edges[0]->target_id, cfg);
    cbm_gbuf_free(gb);
    PASS();
}

/* TOML and INI keys (.toml, .ini, .cfg, .conf) link like infrastructure keys:
 * by exact name and only inside the config file's component. In 17 infra
 * repositories all 72 TOML/INI key_symbol edges were substring or
 * cross-component coincidences (`.gitleaks.toml useDefault` <-
 * TestConfig_UseDefault, `grafana.ini admin_user` <- GenAdminUser). Each
 * format's key below reaches only svc-a's exact `requestTimeout`: not svc-a's
 * substring `getRequestTimeoutSeconds`, not svc-b's exact `requestTimeout`. */
TEST(configlink_key_symbol_toml_ini_exact_scoped) {
    static const char *const files[] = {"svc-a/config.toml", "svc-a/settings.ini",
                                        "svc-a/setup.cfg", "svc-a/app.conf"};
    enum { FILES = 4 };
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t cfg[FILES];
    for (int i = 0; i < FILES; i++) {
        char qn[CBM_SZ_128];
        snprintf(qn, sizeof(qn), "test.cfg%d.request_timeout", i);
        cfg[i] = cbm_gbuf_upsert_node(gb, "Variable", "request_timeout", qn, files[i], 0, 0, NULL);
    }
    int64_t inside = cbm_gbuf_upsert_node(gb, "Function", "requestTimeout",
                                          "test.svc_a.main.requestTimeout", "svc-a/main.go", 0, 0,
                                          NULL);
    cbm_gbuf_upsert_node(gb, "Function", "getRequestTimeoutSeconds",
                         "test.svc_a.client.getRequestTimeoutSeconds", "svc-a/client.go", 0, 0,
                         NULL);
    cbm_gbuf_upsert_node(gb, "Function", "requestTimeout", "test.svc_b.main.requestTimeout",
                         "svc-b/main.go", 0, 0, NULL);
    run_configlink(gb, "test", NULL);
    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    ASSERT_EQ(count, FILES);
    for (int i = 0; i < FILES; i++) {
        bool found = false;
        for (int e = 0; e < count; e++) {
            found = found || (edges[e]->source_id == inside && edges[e]->target_id == cfg[i]);
        }
        ASSERT_TRUE(found);
    }
    cbm_gbuf_free(gb);
    PASS();
}

/* No count of config keys decides what links: the collector stopped at 4,096. */
TEST(configlink_key_symbol_no_config_cap) {
    enum { KEYS = 4200 };
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    for (int i = 0; i < KEYS; i++) {
        char name[CBM_SZ_64];
        char qn[CBM_SZ_128];
        snprintf(name, sizeof(name), "limit_alpha_%04d", i);
        snprintf(qn, sizeof(qn), "test.config.%s", name);
        cbm_gbuf_upsert_node(gb, "Variable", name, qn, "config.toml", 0, 0, NULL);
        snprintf(qn, sizeof(qn), "test.main.%s", name);
        cbm_gbuf_upsert_node(gb, "Function", name, qn, "main.go", 0, 0, NULL);
    }
    run_configlink(gb, "test", NULL);
    ASSERT_EQ(count_key_symbol_edges(gb), KEYS);
    cbm_gbuf_free(gb);
    PASS();
}

/* Go: TestConfigKeySymbol_NoFalsePositive
 * config.toml has url — 1-token key, should not match parseURL */
TEST(configlink_key_symbol_no_false_positive) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");

    cbm_gbuf_upsert_node(gb, "Variable", "url", "test.db.url", "config.toml", 0, 0, NULL);

    cbm_gbuf_upsert_node(gb, "Function", "parseURL", "test.main.parseURL", "main.go", 0, 0, NULL);

    run_configlink(gb, "test", NULL);

    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    /* url is 1 token → skipped by key_symbol strategy */
    ASSERT_FALSE(has_strategy_with_key(edges, count, "key_symbol", "url"));
    cbm_gbuf_free(gb);
    PASS();
}

/* ── Strategy 2: Dependency → Import ────────────────────────────── */

/* Go: TestDependencyImport_PackageJson
 * package.json has express dep, app.js imports express */
TEST(configlink_dep_import_package_json) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");

    /* Dependency Variable in package.json */
    cbm_gbuf_upsert_node(gb, "Variable", "express", "test.package.dependencies.express",
                         "package.json", 0, 0, NULL);

    /* Module node for app.js (source of import) */
    int64_t app_id = cbm_gbuf_upsert_node(gb, "Module", "app", "test.app", "app.js", 0, 0, NULL);

    /* Import target node (what 'express' resolves to) */
    int64_t target_id = cbm_gbuf_upsert_node(gb, "Module", "express", "test.node_modules.express",
                                             "node_modules/express/index.js", 0, 0, NULL);

    /* IMPORTS edge: app.js → express module */
    cbm_gbuf_insert_edge(gb, app_id, target_id, "IMPORTS", NULL);

    run_configlink(gb, "test", NULL);

    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    /* Should find dependency_import edge linking app.js to package.json dep */
    ASSERT_TRUE(has_strategy(edges, count, "dependency_import"));
    cbm_gbuf_free(gb);
    PASS();
}

/* ── Strategy 3: Config File Path → Code String Reference ───────── */

/* Go: TestConfigFileRef_ExactPath
 * main.go references "config/database.toml" in source code */

/* Go: TestConfigFileRef_BasenameMatch
 * main.go references "settings.yaml" by basename */

/* Go: TestConfigFileRef_NoFalsePositive
 * main.go references "data.csv" — not a config extension */
TEST(configlink_file_ref_no_false_positive) {
    char tmpdir[256];
    snprintf(tmpdir, sizeof(tmpdir), "/tmp/cbm_cfglink_XXXXXX");
    ASSERT_NOT_NULL(cbm_mkdtemp(tmpdir));

    /* Create data.csv */
    char csv_path[512];
    snprintf(csv_path, sizeof(csv_path), "%s/data.csv", tmpdir);
    FILE *f = fopen(csv_path, "w");
    fprintf(f, "a,b,c\n");
    fclose(f);

    /* Create main.go referencing data.csv */
    char main_path[512];
    snprintf(main_path, sizeof(main_path), "%s/main.go", tmpdir);
    f = fopen(main_path, "w");
    fprintf(f, "package main\n\nfunc loadData() {\n"
               "\tf := readFile(\"data.csv\")\n"
               "\t_ = f\n}\n");
    fclose(f);

    char *project = cbm_project_name_from_path(tmpdir);
    cbm_gbuf_t *gb = cbm_gbuf_new(project, tmpdir);

    /* data.csv Module (NOT a config extension) */
    char *csv_qn = cbm_pipeline_fqn_module(project, "data.csv");
    cbm_gbuf_upsert_node(gb, "Module", "data", csv_qn, "data.csv", 0, 0, NULL);

    /* Source Module */
    char *main_qn = cbm_pipeline_fqn_module(project, "main.go");
    cbm_gbuf_upsert_node(gb, "Module", "main", main_qn, "main.go", 0, 0, NULL);

    run_configlink(gb, project, tmpdir);

    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);
    /* .csv is not a config extension — no file_reference edges */
    ASSERT_FALSE(has_strategy(edges, count, "file_reference"));

    cbm_gbuf_free(gb);
    free(csv_qn);
    free(main_qn);
    free(project);
    rm_rf(tmpdir);
    PASS();
}

TEST(configlink_sql_file_and_dynamic_binding_are_caller_scoped) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t file = cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.etl.job.sql",
                                        "etl/job.sql", 1, 20, "{}");
    int64_t use = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "s2t.source.table.name",
                                       "test.etl.job.sql.__sql__var", "etl/job.sql", 3, 3,
                                       "{\"kind\":\"SqlVariableRef\"}");

    int64_t scope_a = add_config_key(gb, "test.ctl.workflow_a", "workflow_a", NULL);
    int64_t path_param_a = add_config_key(gb, "test.ctl.workflow_a.path", "param", NULL);
    int64_t path_a = add_config_key(gb, "test.ctl.workflow_a.path.prior_value",
                                    "prior_value", "{{root}}/etl/job.sql");
    int64_t bind_param_a = add_config_key(gb, "test.ctl.workflow_a.binding", "param", NULL);
    int64_t name_a = add_config_key(gb, "test.ctl.workflow_a.binding.name", "name",
                                    "s2t.source.table.name");
    int64_t init_a = add_config_key(gb, "test.ctl.workflow_a.binding.prior_value",
                                    "prior_value", "raw.source_a");

    int64_t scope_b = add_config_key(gb, "test.ctl.workflow_b", "workflow_b", NULL);
    int64_t path_param_b = add_config_key(gb, "test.ctl.workflow_b.path", "param", NULL);
    int64_t path_b = add_config_key(gb, "test.ctl.workflow_b.path.prior_value",
                                    "prior_value", "{{root}}/etl/job.sql");
    int64_t bind_param_b = add_config_key(gb, "test.ctl.workflow_b.binding", "param", NULL);
    int64_t name_b = add_config_key(gb, "test.ctl.workflow_b.binding.name", "name",
                                    "s2t.source.table.name");
    int64_t init_b = add_config_key(gb, "test.ctl.workflow_b.binding.prior_value",
                                    "prior_value", "raw.source_b");

    cbm_gbuf_insert_edge(gb, scope_a, path_param_a, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, path_param_a, path_a, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, scope_a, bind_param_a, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, bind_param_a, name_a, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, bind_param_a, init_a, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, scope_b, path_param_b, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, path_param_b, path_b, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, scope_b, bind_param_b, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, bind_param_b, name_b, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, bind_param_b, init_b, "HAS_CONFIG_KEY", "{}");

    ASSERT_GTE(run_configlink(gb, "test", NULL), 2);
    ASSERT_TRUE(has_config_file_edge(gb, path_a, file));
    ASSERT_TRUE(has_config_file_edge(gb, path_b, file));
    ASSERT_TRUE(has_sql_binding(gb, use, init_a));
    ASSERT_TRUE(has_sql_binding(gb, use, init_b));
    ASSERT_EQ(cbm_gbuf_edge_count_by_type(gb, "RESOLVES_TO_CONFIG"), 2);

    cbm_gbuf_free(gb);
    PASS();
}

TEST(configlink_sql_dynamic_binding_supports_direct_map_keys) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t file = cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.etl.job.sql",
                                        "etl/job.sql", 1, 20, "{}");
    int64_t use = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "mart.X",
                                       "test.etl.job.sql.__sql__var", "etl/job.sql", 3, 3,
                                       "{\"kind\":\"SqlVariableRef\"}");
    int64_t workflow = add_config_key(gb, "test.ctl.workflow", "workflow", NULL);
    int64_t path = add_config_key(gb, "test.ctl.workflow.path", "sql_path",
                                  "{{root}}/etl/job.sql?version=1");
    int64_t variables = add_config_key(gb, "test.ctl.workflow.variables", "variables", NULL);
    int64_t initializer = add_config_key(gb, "test.ctl.workflow.variables.mart.X", "mart.X",
                                         "raw.source");
    cbm_gbuf_insert_edge(gb, workflow, path, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, workflow, variables, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, variables, initializer, "HAS_CONFIG_KEY", "{}");

    ASSERT_GTE(run_configlink(gb, "test", NULL), 1);
    ASSERT_TRUE(has_config_file_edge(gb, path, file));
    ASSERT_TRUE(has_sql_binding(gb, use, initializer));
    cbm_gbuf_free(gb);
    PASS();
}

TEST(configlink_template_paths_resolve_before_matching) {
    const char *templates[] = {
        "{{root}}/sql/{{mart.X}}/job.sql", "sql/${mart.X}/job.sql",
        "{{whole}}", "sql/{{missing}}/sub/job.sql", "sql/{{loop}}/job.sql",
        "{{root}}/sql/{{duplicate}}/job.sql", "{{root}}/sql/a/job.sql"
    };
    const char *statuses[] = {"suffix_match", "resolved", "resolved", "unresolved",
                             "cycle", "multiple_values", "ambiguous"};
    for (int k = 0; k < 7; k++) {
        cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
        int64_t file = cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.job",
                                           "sql/a/job.sql", 1, 2, "{}");
        if (k == 6) cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.other",
                                        "other/sql/a/job.sql", 1, 2, "{}");
        if (k == 3) cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.false",
                                        "sql/a/sub/job.sql", 1, 2, "{}");
        int64_t wf = add_config_key(gb, "test.wf", "workflow", NULL);
        int64_t path = add_config_key(gb, "test.wf.path", "sql_path", templates[k]);
        int64_t mart = add_config_key(gb, "test.wf.mart", "mart.X", "${leaf}");
        int64_t leaf = add_config_key(gb, "test.wf.leaf", "leaf", "a");
        int64_t whole = add_config_key(gb, "test.wf.whole", "whole", "sql/${mart.X}/job.sql");
        int64_t loop = add_config_key(gb, "test.wf.loop", "loop", "{{loop}}");
        int64_t dup1 = add_config_key(gb, "test.wf.dup1", "duplicate", "a");
        int64_t dup2 = add_config_key(gb, "test.wf.dup2", "duplicate", "b");
        int64_t keys[] = {path, mart, leaf, whole, loop, dup1, dup2};
        for (size_t j = 0; j < sizeof(keys) / sizeof(keys[0]); j++)
            cbm_gbuf_insert_edge(gb, wf, keys[j], "HAS_CONFIG_KEY", "{}");
        run_configlink(gb, "test", NULL);
        const cbm_gbuf_node_t *node = cbm_gbuf_find_by_id(gb, path);
        char status[80];
        snprintf(status, sizeof(status), "\"resolution_status\":\"%s\"", statuses[k]);
        ASSERT_NOT_NULL(strstr(node->properties_json, status));
        ASSERT_NOT_NULL(strstr(node->properties_json, templates[k]));
        ASSERT_EQ(has_config_file_edge(gb, path, file), k < 3 || k == 5);
        if (k < 2) {
            const cbm_gbuf_node_t **uses = NULL;
            int n = 0;
            cbm_gbuf_find_by_label(gb, "ConfigVariableRef", &uses, &n);
            bool linked = false;
            for (int j = 0; j < n; j++)
                if (has_typed_edge(gb, "HAS_VARIABLE_REF", path, uses[j]->id) &&
                    has_typed_edge(gb, "RESOLVES_TO_CONFIG", uses[j]->id, mart)) linked = true;
            ASSERT_TRUE(linked);
        }
        cbm_gbuf_free(gb);
    }
    PASS();
}

TEST(configlink_template_paths_rebuild_and_bind_sql) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t file = cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.job",
                                       "sql/a/job.sql", 1, 2, "{}");
    int64_t sql = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "mart.X", "test.sql.use",
                                      "sql/a/job.sql", 1, 1, "{}");
    int64_t wf = add_config_key(gb, "test.wf", "workflow", NULL);
    int64_t path = add_config_key(gb, "test.wf.path", "path", "sql/{{mart.X}}/job.sql");
    int64_t param = add_config_key(gb, "test.wf.param", "parameter", NULL);
    int64_t name = add_config_key(gb, "test.wf.param.name", "name", "mart.X");
    int64_t init = add_config_key(gb, "test.wf.param.value", "value", "a");
    cbm_gbuf_insert_edge(gb, wf, path, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, wf, param, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, param, name, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, param, init, "HAS_CONFIG_KEY", "{}");
    run_configlink(gb, "test", NULL);
    ASSERT_TRUE(has_config_file_edge(gb, path, file));
    ASSERT_TRUE(has_sql_binding(gb, sql, init));
    ASSERT_NOT_NULL(strstr(cbm_gbuf_find_by_id(gb, path)->properties_json,
                           "\"resolved_path\":\"sql/a/job.sql\""));
    add_config_key(gb, "test.wf.param.value", "value", "b");
    run_configlink(gb, "test", NULL);
    ASSERT_FALSE(has_config_file_edge(gb, path, file));
    ASSERT_FALSE(has_sql_binding(gb, sql, init));
    ASSERT_NOT_NULL(strstr(cbm_gbuf_find_by_id(gb, path)->properties_json, "file_not_found"));
    cbm_gbuf_free(gb);
    PASS();
}

static int64_t add_named_config_value(cbm_gbuf_t *gb, const char *qn, const char *file,
                                     const char *key, const char *value) {
    char props[1024];
    snprintf(props, sizeof(props), "{\"config_key\":true,\"value\":\"%s\"}", value);
    return cbm_gbuf_upsert_node(gb, "Variable", key, qn, file, 1, 1, props);
}

TEST(configlink_cross_file_variants_keep_all_origins_and_call_context) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t path = add_config_key(gb, "test.path", "path", "etl/{{mart.X}}/sql.sql");
    const char *values[] = {"a", "b", "c", "a"};
    int64_t declarations[4], files[3], sql[3];
    for (int i = 0; i < 4; i++) {
        char qn[80]; snprintf(qn, sizeof(qn), "test.mart.X.%d", i);
        declarations[i] = add_named_config_value(gb, qn,
            i == 3 ? "other/mart.json" : "config/mart.yml", i == 3 ? "mart.X" : "X", values[i]);
    }
    for (int i = 0; i < 3; i++) {
        char fp[80], qn[80]; snprintf(fp, sizeof(fp), "etl/%s/sql.sql", values[i]);
        snprintf(qn, sizeof(qn), "test.file.%d", i);
        files[i] = cbm_gbuf_upsert_node(gb, "File", "sql.sql", qn, fp, 1, 5, "{}");
        snprintf(qn, sizeof(qn), "test.sql.%d", i);
        sql[i] = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "mart.X", qn, fp, 2, 2, "{}");
    }
    ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
    const cbm_gbuf_edge_t **variants = NULL;
    int n = 0;
    cbm_gbuf_find_edges_by_source_type(gb, path, "HAS_VARIANT", &variants, &n);
    ASSERT_EQ(n, 3);
    for (int i = 0; i < 3; i++) {
        ASSERT_TRUE(has_config_file_edge(gb, path, files[i]));
        ASSERT_TRUE(has_sql_binding(gb, sql[i], declarations[i]));
        ASSERT_FALSE(has_sql_binding(gb, sql[i], declarations[(i + 1) % 3]));
    }
    ASSERT_TRUE(has_sql_binding(gb, sql[0], declarations[3]));
    for (int i = 0; i < n; i++) {
        if (has_typed_edge(gb, "REFERENCES_FILE", variants[i]->target_id, files[0])) {
            ASSERT_TRUE(has_typed_edge(gb, "DERIVED_FROM", variants[i]->target_id, declarations[0]));
            ASSERT_TRUE(has_typed_edge(gb, "DERIVED_FROM", variants[i]->target_id, declarations[3]));
        }
    }
    const cbm_gbuf_edge_t **uses = NULL;
    cbm_gbuf_find_edges_by_source_type(gb, path, "HAS_VARIABLE_REF", &uses, &n);
    ASSERT_EQ(n, 1);
    for (int i = 0; i < 4; i++)
        ASSERT_TRUE(has_typed_edge(gb, "RESOLVES_TO_CONFIG", uses[0]->target_id, declarations[i]));
    ASSERT_FALSE(has_typed_edge(gb, "REFERENCES_FILE", path, files[0]));
    cbm_gbuf_free(gb);
    PASS();
}

TEST(configlink_variant_product_has_no_policy_limit) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t path = add_config_key(gb, "test.path", "path", "etl/{{mart.X}}/{{env.Y}}/sql.sql");
    for (int i = 0; i < 17; i++) {
        char qn[80], value[20]; snprintf(value, sizeof(value), "%d", i);
        snprintf(qn, sizeof(qn), "test.mart.%d", i);
        add_named_config_value(gb, qn, "mart.json", "X", value);
        snprintf(qn, sizeof(qn), "test.env.%d", i);
        add_named_config_value(gb, qn, "env.yml", "Y", value);
    }
    ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
    const cbm_gbuf_edge_t **edges = NULL;
    int n = 0;
    cbm_gbuf_find_edges_by_source_type(gb, path, "HAS_VARIANT", &edges, &n);
    ASSERT_EQ(n, 289);
    cbm_gbuf_free(gb);
    PASS();
}

TEST(configlink_cross_file_cycles_keep_noncyclic_values) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t path = add_config_key(gb, "test.path", "path", "etl/{{mart.X}}/sql.sql");
    int64_t a = add_named_config_value(gb, "test.mart.a", "mart.yml", "X", "{{env.Y}}");
    int64_t b = add_named_config_value(gb, "test.mart.b", "mart.yml", "X", "valid");
    add_named_config_value(gb, "test.env", "env.json", "Y", "{{mart.X}}");
    int64_t file = cbm_gbuf_upsert_node(gb, "File", "sql.sql", "test.sql",
                                       "etl/valid/sql.sql", 1, 2, "{}");
    ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
    ASSERT_TRUE(has_config_file_edge(gb, path, file));
    ASSERT_NOT_NULL(strstr(cbm_gbuf_find_by_id(gb, path)->properties_json, "cycle"));
    const cbm_gbuf_edge_t **edges = NULL;
    int n = 0;
    cbm_gbuf_find_edges_by_source_type(gb, path, "HAS_VARIANT", &edges, &n);
    ASSERT_EQ(n, 1);
    ASSERT_TRUE(has_typed_edge(gb, "DERIVED_FROM", edges[0]->target_id, a));
    ASSERT_TRUE(has_typed_edge(gb, "DERIVED_FROM", edges[0]->target_id, b));
    cbm_gbuf_free(gb);
    PASS();
}

/* ── Determinism: candidate truncation must not depend on insert order ── */

static int cl_cmp_row(const void *pa, const void *pb) {
    return strcmp(*(const char *const *)pa, *(const char *const *)pb);
}

/* Collect the CONFIGURES edge set as a sorted, newline-joined
 * "src_qn|tgt_qn" fingerprint. Caller frees. */
static char *configures_fingerprint(cbm_gbuf_t *gb) {
    const cbm_gbuf_edge_t **edges = NULL;
    int count = 0;
    cbm_gbuf_find_edges_by_type(gb, "CONFIGURES", &edges, &count);

    char **rows = calloc((size_t)(count > 0 ? count : 1), sizeof(*rows));
    if (!rows) {
        return NULL;
    }
    int n = 0;
    for (int i = 0; i < count; i++) {
        const cbm_gbuf_node_t *s = cbm_gbuf_find_by_id(gb, edges[i]->source_id);
        const cbm_gbuf_node_t *t = cbm_gbuf_find_by_id(gb, edges[i]->target_id);
        if (!s || !t || !s->qualified_name || !t->qualified_name) {
            continue;
        }
        size_t len = strlen(s->qualified_name) + strlen(t->qualified_name) + 2;
        rows[n] = malloc(len);
        if (!rows[n]) {
            break;
        }
        snprintf(rows[n], len, "%s|%s", s->qualified_name, t->qualified_name);
        n++;
    }
    qsort(rows, (size_t)n, sizeof(*rows), cl_cmp_row);

    size_t total = 1;
    for (int i = 0; i < n; i++) {
        total += strlen(rows[i]) + 1;
    }
    char *out = calloc(total, 1);
    if (out) {
        for (int i = 0; i < n; i++) {
            strcat(out, rows[i]);
            strcat(out, "\n");
        }
    }
    for (int i = 0; i < n; i++) {
        free(rows[i]);
    }
    free(rows);
    return out;
}

/* Build a gbuf whose code-candidate count exceeds the collector's internal
 * cap, inserting the candidates either forwards or backwards. */
enum { CL_DET_CANDIDATES = 9000 }; /* > the 8192 code-entry cap */

static cbm_gbuf_t *build_oversized_corpus(bool reverse) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");

    /* One config key every candidate can match on by substring:
     * "max_connections", in a format that keeps substring matching (TOML and
     * INI keys link by exact name only). */
    cbm_gbuf_upsert_node(gb, "Variable", "max_connections", "test.app.max_connections",
                         "app.properties", 0, 0, NULL);

    for (int k = 0; k < CL_DET_CANDIDATES; k++) {
        int i = reverse ? (CL_DET_CANDIDATES - 1 - k) : k;
        char name[CBM_SZ_64];
        char qn[CBM_SZ_128];
        char path[CBM_SZ_64];
        snprintf(name, sizeof(name), "getMaxConnections%04d", i);
        snprintf(qn, sizeof(qn), "test.mod%04d.%s", i, name);
        snprintf(path, sizeof(path), "mod%04d.go", i);
        cbm_gbuf_upsert_node(gb, "Function", name, qn, path, 0, 0, NULL);
    }
    return gb;
}

/* REGRESSION: the collectors walk gbuf label indexes in insertion order --
 * under parallel extraction worker-merge order, which varies run to run.
 * They filled fixed-capacity arrays and stopped at a cap, so the surviving
 * set depended on that order until candidates were sorted first; now no cap
 * cuts the set at all. This test stands in for the scheduling variance by
 * feeding the same corpus in two insertion orders: the emitted edge set must
 * be identical -- and complete, all 9,000 candidates past the old 8,192 cap. */
TEST(configlink_candidate_truncation_is_order_independent) {
    cbm_gbuf_t *fwd = build_oversized_corpus(false);
    run_configlink(fwd, "test", NULL);
    char *fp_fwd = configures_fingerprint(fwd);
    int fwd_edges = count_key_symbol_edges(fwd);

    cbm_gbuf_t *rev = build_oversized_corpus(true);
    run_configlink(rev, "test", NULL);
    char *fp_rev = configures_fingerprint(rev);

    ASSERT_TRUE(fp_fwd != NULL);
    ASSERT_TRUE(fp_rev != NULL);
    ASSERT_EQ(fwd_edges, CL_DET_CANDIDATES);
    ASSERT_STR_EQ(fp_fwd, fp_rev);

    free(fp_fwd);
    free(fp_rev);
    cbm_gbuf_free(fwd);
    cbm_gbuf_free(rev);
    PASS();
}

/* ── Suite ───────────────────────────────────────────────────────── */

TEST(configlink_call_chain_keeps_workflows_separate) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t cfg = cbm_gbuf_upsert_node(gb, "File", "flow.json", "test.cfg", "conf/flow.json", 0, 0, "{}");
    int64_t sql = cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.sql", "sql/job.sql", 0, 0, "{}");
    int64_t path = cbm_gbuf_upsert_node(gb, "Variable", "filePath", "test.cfg.path", "conf/flow.json", 1, 1,
        "{\"config_key\":\"true\",\"value\":\"sql/job.sql\"}");
    int64_t use = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "app.X", "test.use", "sql/job.sql", 1, 1, "{}");
    cbm_gbuf_upsert_node(gb, "Variable", "entity", "test.cfg.use", "conf/flow.json", 2, 2,
        "{\"config_key\":\"true\",\"value\":\"${app.X}\"}");
    int64_t init[2], paths[2];
    for (int i = 0; i < 2; i++) {
        char qn[80]; snprintf(qn,sizeof(qn),"test.wf%d",i);
        int64_t wf = add_config_key(gb, qn, "workflow", NULL);
        snprintf(qn,sizeof(qn),"test.wf%d.path",i);
        paths[i] = add_config_key(gb, qn, "path", "{{root}}/conf/flow.json");
        snprintf(qn,sizeof(qn),"test.wf%d.X",i);
        init[i] = add_config_key(gb, qn, "app.X", i ? "b" : "a");
        cbm_gbuf_insert_edge(gb,wf,paths[i],"HAS_CONFIG_KEY","{}");
        cbm_gbuf_insert_edge(gb,wf,init[i],"HAS_CONFIG_KEY","{}");
    }
    for (int pass = 0; pass < 2; pass++) {
        ASSERT_GTE(run_configlink(gb,"test",NULL), 0);
        ASSERT_TRUE(has_config_file_edge(gb,paths[0],cfg));
        ASSERT_TRUE(has_config_file_edge(gb,paths[1],cfg));
        ASSERT_TRUE(has_config_file_edge(gb,path,sql));
        ASSERT_TRUE(has_sql_binding(gb,use,init[0]));
        ASSERT_TRUE(has_sql_binding(gb,use,init[1]));
        const cbm_gbuf_node_t **bindings = NULL; int count = 0;
        cbm_gbuf_find_by_label(gb,"SqlConfigBinding",&bindings,&count);
        ASSERT_EQ(count,2);
        for(int j=0;j<count;j++) {
            bool a=has_typed_edge(gb,"RESOLVES_TO_CONFIG",bindings[j]->id,init[0]);
            bool b=has_typed_edge(gb,"RESOLVES_TO_CONFIG",bindings[j]->id,init[1]);
            ASSERT_TRUE(a != b);
        }
        cbm_gbuf_find_by_label(gb,"ConfigBinding",&bindings,&count);
        ASSERT_EQ(count,2);
        for(int j=0;j<count;j++) {
            bool a=has_typed_edge(gb,"RESOLVES_TO_CONFIG",bindings[j]->id,init[0]);
            bool b=has_typed_edge(gb,"RESOLVES_TO_CONFIG",bindings[j]->id,init[1]);
            ASSERT_TRUE(a != b);
        }
    }
    cbm_gbuf_free(gb); PASS();
}

TEST(configlink_yaml_anchor_defaults_and_explicit_override) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    cbm_gbuf_upsert_node(gb,"File","job.sql","test.sql","sql/job.sql",0,0,"{}");
    int64_t use=cbm_gbuf_upsert_node(gb,"SqlVariableRef","X","test.use","sql/job.sql",1,1,"{}");
    int64_t anchor=cbm_gbuf_upsert_node(gb,"Variable","defaults","test.defaults","resources/ctl/ctl.yml",1,3,
        "{\"config_key\":\"true\",\"value_kind\":\"mapping\",\"yaml_anchor\":\"defaults\"}");
    int64_t init=add_config_key(gb,"test.defaults.X","X","a");
    cbm_gbuf_insert_edge(gb,anchor,init,"HAS_CONFIG_KEY","{}");
    int64_t wf=add_config_key(gb,"test.wf","wf",NULL);
    int64_t alias=cbm_gbuf_upsert_node(gb,"Variable","<<","test.wf.alias","resources/ctl/ctl.yml",5,5,
        "{\"config_key\":\"true\",\"value_kind\":\"alias\",\"yaml_alias\":\"defaults\",\"value\":\"*defaults\"}");
    int64_t path=add_config_key(gb,"test.wf.path","path","sql/job.sql");
    cbm_gbuf_insert_edge(gb,wf,alias,"HAS_CONFIG_KEY","{}");
    cbm_gbuf_insert_edge(gb,wf,path,"HAS_CONFIG_KEY","{}");
    ASSERT_GTE(run_configlink(gb,"test",NULL),0);
    ASSERT_TRUE(has_typed_edge(gb,"RESOLVES_TO_ANCHOR",alias,anchor));
    ASSERT_TRUE(has_sql_binding(gb,use,init));
    int64_t explicit=add_config_key(gb,"test.wf.X","X","b");
    cbm_gbuf_insert_edge(gb,wf,explicit,"HAS_CONFIG_KEY","{}");
    ASSERT_GTE(run_configlink(gb,"test",NULL),0);
    ASSERT_TRUE(has_sql_binding(gb,use,explicit));
    ASSERT_FALSE(has_sql_binding(gb,use,init));
    cbm_gbuf_free(gb); PASS();
}

TEST(configlink_config_uses_are_caller_scoped_and_local_values_shadow) {
    const char *paths[] = {"conf/shared.json", "conf/shared.yml"};
    for (int format = 0; format < 2; format++) {
        cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
        cbm_gbuf_upsert_node(gb, "File", "shared", "test.shared", paths[format], 0, 0, "{}");
        int64_t root = cbm_gbuf_upsert_node(gb, "Variable", "config", "test.shared.root",
            paths[format], 1, 4, "{\"config_key\":\"true\",\"value_kind\":\"mapping\"}");
        int64_t slot = cbm_gbuf_upsert_node(gb, "Variable", "entityId", "test.shared.use",
            paths[format], 2, 2, "{\"config_key\":\"true\",\"value\":\"${app.entity}\"}");
        cbm_gbuf_insert_edge(gb, root, slot, "HAS_CONFIG_KEY", "{}");
        int64_t init[2];
        for (int i = 0; i < 2; i++) {
            char qn[80]; snprintf(qn, sizeof(qn), "test.caller%d", i);
            int64_t caller = add_config_key(gb, qn, "arbitrary", NULL);
            snprintf(qn, sizeof(qn), "test.caller%d.path", i);
            int64_t path = add_config_key(gb, qn, "file", paths[format]);
            snprintf(qn, sizeof(qn), "test.caller%d.X", i);
            init[i] = add_config_key(gb, qn, "app.entity", i ? "beta" : "alpha");
            cbm_gbuf_insert_edge(gb, caller, path, "HAS_CONFIG_KEY", "{}");
            cbm_gbuf_insert_edge(gb, caller, init[i], "HAS_CONFIG_KEY", "{}");
        }
        int64_t local = 0;
        for (int pass = 0; pass < 5; pass++) {
            if (pass == 2) {
                /* Same-QN replacement uses the graph buffer's canonical
                 * name ordering; choose a winning, different name. */
                add_config_key(gb, "test.caller1.X", "zz_other_variable", "beta");
            }
            if (pass == 3) {
                local = cbm_gbuf_upsert_node(gb, "Variable", "app.entity", "test.shared.local",
                    paths[format], 3, 3, "{\"config_key\":\"true\",\"value\":\"local\"}");
                cbm_gbuf_insert_edge(gb, root, local, "HAS_CONFIG_KEY", "{}");
            }
            ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
            const cbm_gbuf_node_t **bindings = NULL, **uses = NULL;
            int n = 0, use_count = 0;
            cbm_gbuf_find_by_label(gb, "ConfigBinding", &bindings, &n);
            cbm_gbuf_find_by_label(gb, "ConfigVariableRef", &uses, &use_count);
            ASSERT_EQ(n, 2); ASSERT_EQ(use_count, 1);
            ASSERT_NOT_NULL(strstr(uses[0]->properties_json, pass == 2
                ? "\"context_resolution_status\":\"partial\""
                : "\"context_resolution_status\":\"resolved\""));
            ASSERT_NOT_NULL(strstr(uses[0]->properties_json, "\"context_binding_count\":2"));
            int matched[2] = {0};
            for (int i = 0; i < n; i++) {
                ASSERT_TRUE(has_typed_edge(gb, "BINDS_VARIABLE", bindings[i]->id, uses[0]->id));
                bool a = has_typed_edge(gb, "RESOLVES_TO_CONFIG", bindings[i]->id, init[0]);
                bool b = has_typed_edge(gb, "RESOLVES_TO_CONFIG", bindings[i]->id, init[1]);
                if (!local) {
                    if (pass == 2) { ASSERT_FALSE(b); }
                    else ASSERT_TRUE(a != b);
                    matched[0] += a; matched[1] += b;
                }
                else {
                    ASSERT_FALSE(a); ASSERT_FALSE(b);
                    ASSERT_TRUE(has_typed_edge(gb, "RESOLVES_TO_CONFIG", bindings[i]->id, local));
                }
            }
            if (!local) { ASSERT_EQ(matched[0], 1); ASSERT_EQ(matched[1], pass == 2 ? 0 : 1); }
            /* No caller-dependent union on the source occurrence itself. */
            ASSERT_FALSE(has_typed_edge(gb, "RESOLVES_TO_CONFIG", uses[0]->id, init[0]));
            ASSERT_FALSE(has_typed_edge(gb, "RESOLVES_TO_CONFIG", uses[0]->id, init[1]));
        }
        cbm_gbuf_free(gb);
    }
    PASS();
}

TEST(configlink_paths_use_callers_without_persisting_sql_bindings) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    cbm_gbuf_upsert_node(gb, "File", "flow.json", "test.cfg", "conf/flow.json", 0, 0, "{}");
    int64_t root = cbm_gbuf_upsert_node(gb, "Variable", "step", "test.cfg.step", "conf/flow.json", 1, 9,
        "{\"config_key\":true,\"value_kind\":\"object\"}");
    int64_t path = cbm_gbuf_upsert_node(gb, "Variable", "filePath", "test.cfg.path", "conf/flow.json", 2, 2,
        "{\"config_key\":true,\"value\":\"sql/${app.X}/job.sql\"}");
    cbm_gbuf_insert_edge(gb, root, path, "HAS_CONFIG_KEY", "{}");
    int64_t sql[2], use[2], init[2], caller_path[2];
    for (int i = 0; i < 2; i++) {
        char qn[80], file[80];
        snprintf(file, sizeof(file), "sql/%s/job.sql", i ? "b" : "a");
        snprintf(qn, sizeof(qn), "test.sql%d", i);
        sql[i] = cbm_gbuf_upsert_node(gb, "File", "job.sql", qn, file, 0, 0, "{}");
        snprintf(qn, sizeof(qn), "test.use%d", i);
        use[i] = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "app.X", qn, file, 1, 1, "{}");
        snprintf(qn, sizeof(qn), "test.wf%d", i);
        int64_t wf = add_config_key(gb, qn, "workflow", NULL);
        snprintf(qn, sizeof(qn), "test.wf%d.path", i);
        caller_path[i] = add_config_key(gb, qn, "path", "conf/flow.json");
        snprintf(qn, sizeof(qn), "test.wf%d.X", i);
        init[i] = add_config_key(gb, qn, "app.X", i ? "b" : "a");
        cbm_gbuf_insert_edge(gb, wf, caller_path[i], "HAS_CONFIG_KEY", "{}");
        cbm_gbuf_insert_edge(gb, wf, init[i], "HAS_CONFIG_KEY", "{}");
    }
    for (int pass = 0; pass < 2; pass++) {
        ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
        const cbm_gbuf_node_t **nodes = NULL; int n = 0;
        cbm_gbuf_find_by_label(gb, "SqlConfigBinding", &nodes, &n);
        ASSERT_EQ(n, 0);
        ASSERT_TRUE(has_config_file_edge(gb, path, sql[0]));
        ASSERT_TRUE(has_config_file_edge(gb, path, sql[1]));
        ASSERT_TRUE(has_sql_binding(gb, use[0], init[0]));
        ASSERT_FALSE(has_sql_binding(gb, use[0], init[1]));
        ASSERT_TRUE(has_sql_binding(gb, use[1], init[1]));
        ASSERT_FALSE(has_sql_binding(gb, use[1], init[0]));
    }
    cbm_gbuf_free(gb); PASS();
}

TEST(configlink_multihop_paths_discard_provisional_root_contexts) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    cbm_gbuf_upsert_node(gb, "File", "outer.json", "test.outer", "conf/outer.json", 0, 0, "{}");
    cbm_gbuf_upsert_node(gb, "Variable", "path", "test.outer.path", "conf/outer.json", 1, 1,
        "{\"config_key\":true,\"value\":\"conf/${app.X}/inner.json\"}");
    cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.sql", "sql/job.sql", 0, 0, "{}");
    int64_t use = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "app.X", "test.use", "sql/job.sql", 1, 1, "{}");
    int64_t init[2];
    for (int i = 0; i < 2; i++) {
        char qn[80], file[80];
        snprintf(file, sizeof(file), "conf/%s/inner.json", i ? "b" : "a");
        snprintf(qn, sizeof(qn), "test.inner%d", i);
        cbm_gbuf_upsert_node(gb, "File", "inner.json", qn, file, 0, 0, "{}");
        snprintf(qn, sizeof(qn), "test.inner%d.path", i);
        cbm_gbuf_upsert_node(gb, "Variable", "path", qn, file, 1, 1,
            "{\"config_key\":true,\"value\":\"sql/job.sql\"}");
        snprintf(qn, sizeof(qn), "test.inner%d.value", i);
        cbm_gbuf_upsert_node(gb, "Variable", "entity", qn, file, 2, 2,
            "{\"config_key\":true,\"value\":\"${app.X}\"}");
        snprintf(qn, sizeof(qn), "test.wf%d", i);
        int64_t wf = add_config_key(gb, qn, "workflow", NULL);
        snprintf(qn, sizeof(qn), "test.wf%d.path", i);
        int64_t path = add_config_key(gb, qn, "path", "conf/outer.json");
        snprintf(qn, sizeof(qn), "test.wf%d.X", i);
        init[i] = add_config_key(gb, qn, "app.X", i ? "b" : "a");
        cbm_gbuf_insert_edge(gb, wf, path, "HAS_CONFIG_KEY", "{}");
        cbm_gbuf_insert_edge(gb, wf, init[i], "HAS_CONFIG_KEY", "{}");
    }
    ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
    ASSERT_TRUE(has_sql_binding(gb, use, init[0]));
    ASSERT_TRUE(has_sql_binding(gb, use, init[1]));
    const cbm_gbuf_node_t **nodes = NULL; int n = 0;
    cbm_gbuf_find_by_label(gb, "SqlConfigBinding", &nodes, &n);
    ASSERT_EQ(n, 2);
    for (int i = 0; i < n; i++) {
        const cbm_gbuf_edge_t **contexts = NULL; int cn = 0;
        cbm_gbuf_find_edges_by_source_type(gb, nodes[i]->id, "HAS_CALLER_CONTEXT", &contexts, &cn);
        ASSERT_EQ(cn, 3);
    }
    cbm_gbuf_find_by_label(gb, "ConfigBinding", &nodes, &n);
    ASSERT_EQ(n, 4); /* outer path + inner value, in each of two callers */
    cbm_gbuf_free(gb); PASS();
}

TEST(configlink_yaml_alias_chains_and_cycles) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t anchors[2];
    for (int i = 0; i < 2; i++) {
        char qn[80], props[200];
        snprintf(qn, sizeof(qn), "test.anchor%d", i);
        snprintf(props, sizeof(props), "{\"config_key\":true,\"value_kind\":\"mapping\",\"yaml_anchor\":\"%s\"}", i ? "b" : "a");
        anchors[i] = cbm_gbuf_upsert_node(gb, "Variable", "@anchor", qn, "resources/ctl/ctl.yml", 1, 10, props);
        snprintf(qn, sizeof(qn), "test.anchor%d.alias", i);
        snprintf(props, sizeof(props), "{\"config_key\":true,\"yaml_alias\":\"%s\"}", i ? "a" : "b");
        int64_t alias = cbm_gbuf_upsert_node(gb, "Variable", "@alias", qn, "resources/ctl/ctl.yml", 2, 2, props);
        cbm_gbuf_insert_edge(gb, anchors[i], alias, "HAS_CONFIG_KEY", "{}");
    }
    int64_t init = add_config_key(gb, "test.anchor1.X", "X", "alpha");
    cbm_gbuf_insert_edge(gb, anchors[1], init, "HAS_CONFIG_KEY", "{}");
    int64_t wf = add_config_key(gb, "test.wf", "workflow", NULL);
    int64_t path = add_config_key(gb, "test.wf.path", "path", "sql/job.sql");
    int64_t alias = cbm_gbuf_upsert_node(gb, "Variable", "@alias", "test.wf.alias", "resources/ctl/ctl.yml", 20, 20,
        "{\"config_key\":true,\"yaml_alias\":\"a\"}");
    cbm_gbuf_insert_edge(gb, wf, path, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_insert_edge(gb, wf, alias, "HAS_CONFIG_KEY", "{}");
    cbm_gbuf_upsert_node(gb, "File", "job.sql", "test.file", "sql/job.sql", 0, 0, "{}");
    int64_t use = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "X", "test.X", "sql/job.sql", 1, 1, "{}");
    int64_t missing = cbm_gbuf_upsert_node(gb, "SqlVariableRef", "Y", "test.Y", "sql/job.sql", 1, 1, "{}");
    ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
    ASSERT_TRUE(has_sql_binding(gb, use, init));
    ASSERT_FALSE(has_sql_binding(gb, missing, init));
    cbm_gbuf_free(gb); PASS();
}

TEST(configlink_nonpath_templates_keep_uses_without_products) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    int64_t command = add_config_key(gb, "test.command", "command", "run {{mart.X}} {{env.Y}} --done");
    for (int i = 0; i < 17; i++) {
        char qn[80], value[20]; snprintf(value, sizeof(value), "%d", i);
        snprintf(qn, sizeof(qn), "test.mart.%d", i);
        add_named_config_value(gb, qn, "mart.json", "X", value);
        snprintf(qn, sizeof(qn), "test.env.%d", i);
        add_named_config_value(gb, qn, "env.yml", "Y", value);
    }
    ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
    const cbm_gbuf_edge_t **edges = NULL; int n = 0;
    cbm_gbuf_find_edges_by_source_type(gb, command, "HAS_VARIANT", &edges, &n);
    ASSERT_EQ(n, 0);
    cbm_gbuf_find_edges_by_source_type(gb, command, "HAS_VARIABLE_REF", &edges, &n);
    ASSERT_EQ(n, 2);
    ASSERT_EQ(cbm_gbuf_edge_count_by_type(gb, "RESOLVES_TO_CONFIG"), 34);
    cbm_gbuf_free(gb); PASS();
}

TEST(configlink_namespace_choices_survive_nested_paths) {
    cbm_gbuf_t *gb = cbm_gbuf_new("test", "/tmp/test");
    add_config_key(gb, "test.call", "path", "conf/{{mart.X}}/flow.json");
    int64_t paths[2], files[2], init[2];
    for (int i = 0; i < 2; i++) {
        char qn[80], file[80]; const char *value = i ? "b" : "a";
        snprintf(qn, sizeof(qn), "test.mart.%d", i);
        init[i] = add_named_config_value(gb, qn, "mart.yml", "X", value);
        snprintf(file, sizeof(file), "conf/%s/flow.json", value);
        snprintf(qn, sizeof(qn), "test.flow%d", i);
        cbm_gbuf_upsert_node(gb, "File", "flow.json", qn, file, 0, 0, "{}");
        snprintf(qn, sizeof(qn), "test.flow%d.path", i);
        paths[i] = cbm_gbuf_upsert_node(gb, "Variable", "path", qn, file, 1, 1,
            "{\"config_key\":true,\"value\":\"sql/{{mart.X}}/job.sql\"}");
        snprintf(file, sizeof(file), "sql/%s/job.sql", value);
        snprintf(qn, sizeof(qn), "test.sql%d", i);
        files[i] = cbm_gbuf_upsert_node(gb, "File", "job.sql", qn, file, 0, 0, "{}");
    }
    ASSERT_GTE(run_configlink(gb, "test", NULL), 0);
    for (int i = 0; i < 2; i++) {
        ASSERT_TRUE(has_config_file_edge(gb, paths[i], files[i]));
        ASSERT_FALSE(has_config_file_edge(gb, paths[i], files[1-i]));
        const cbm_gbuf_edge_t **uses = NULL, **bindings = NULL; int un = 0, bn = 0;
        cbm_gbuf_find_edges_by_source_type(gb, paths[i], "HAS_VARIABLE_REF", &uses, &un);
        ASSERT_EQ(un, 1);
        cbm_gbuf_find_edges_by_target_type(gb, uses[0]->target_id, "BINDS_VARIABLE", &bindings, &bn);
        ASSERT_EQ(bn, 1);
        ASSERT_TRUE(has_typed_edge(gb, "RESOLVES_TO_CONFIG", bindings[0]->source_id, init[i]));
        ASSERT_FALSE(has_typed_edge(gb, "RESOLVES_TO_CONFIG", bindings[0]->source_id, init[1-i]));
    }
    cbm_gbuf_free(gb); PASS();
}

SUITE(configlink) {
    RUN_TEST(configlink_namespace_choices_survive_nested_paths);
    RUN_TEST(configlink_nonpath_templates_keep_uses_without_products);
    RUN_TEST(configlink_yaml_alias_chains_and_cycles);
    RUN_TEST(configlink_multihop_paths_discard_provisional_root_contexts);
    RUN_TEST(configlink_paths_use_callers_without_persisting_sql_bindings);
    RUN_TEST(configlink_config_uses_are_caller_scoped_and_local_values_shadow);
    RUN_TEST(configlink_call_chain_keeps_workflows_separate);
    RUN_TEST(configlink_yaml_anchor_defaults_and_explicit_override);
    /* Strategy 1: Key → Symbol */
    RUN_TEST(configlink_key_symbol_exact_match);
    RUN_TEST(configlink_key_symbol_substring_match);
    RUN_TEST(configlink_key_symbol_short_key_skipped);
    RUN_TEST(configlink_key_symbol_camel_case);
    RUN_TEST(configlink_key_symbol_no_false_positive);
    RUN_TEST(configlink_key_symbol_infra_exact_only);
    RUN_TEST(configlink_key_symbol_infra_scoped_to_component);
    RUN_TEST(configlink_key_symbol_config_dir_component);
    RUN_TEST(configlink_key_symbol_no_config_cap);
    RUN_TEST(configlink_key_symbol_terraform_variable);
    RUN_TEST(configlink_key_symbol_toml_ini_exact_scoped);

    /* Strategy 2: Dependency → Import */
    RUN_TEST(configlink_dep_import_package_json);

    /* Strategy 3: File Path → Reference */
    RUN_TEST(configlink_file_ref_no_false_positive);
    RUN_TEST(configlink_sql_file_and_dynamic_binding_are_caller_scoped);
    RUN_TEST(configlink_sql_dynamic_binding_supports_direct_map_keys);
    RUN_TEST(configlink_template_paths_resolve_before_matching);
    RUN_TEST(configlink_template_paths_rebuild_and_bind_sql);
    RUN_TEST(configlink_cross_file_variants_keep_all_origins_and_call_context);
    RUN_TEST(configlink_variant_product_has_no_policy_limit);
    RUN_TEST(configlink_cross_file_cycles_keep_noncyclic_values);

    /* Determinism */
    RUN_TEST(configlink_candidate_truncation_is_order_independent);
}
