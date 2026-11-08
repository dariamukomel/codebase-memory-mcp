/* Shared regression cases for the full extraction suite and focused runner. */
TEST(sql_audit_root_cte_insert) {
    CBMFileResult *r = extract("WITH c AS (SELECT a FROM raw.s UNION ALL SELECT b FROM raw.t) "
        "INSERT OVERWRITE dst SELECT a FROM c;", CBM_LANG_SQL, "t", "job.sql");
    ASSERT_NOT_NULL(r);
    ASSERT_FALSE(r->parse_incomplete);
    ASSERT(has_sql_entity(r, CBM_SQL_CTE, "c"));
    ASSERT(has_sql_entity(r, CBM_SQL_CTE_REF, "c"));
    ASSERT_FALSE(has_sql_entity(r, CBM_SQL_TABLE_REF, "c"));
    ASSERT(has_sql_entity(r, CBM_SQL_TABLE_REF, "raw.s"));
    ASSERT(has_sql_entity(r, CBM_SQL_TABLE_REF, "raw.t"));
    ASSERT(has_sql_entity(r, CBM_SQL_COLUMN_REF, "b"));
    CBMSqlEntity *s = find_sql_entity(r, CBM_SQL_STATEMENT, "statement_0001");
    ASSERT_NOT_NULL(s);
    ASSERT_GT(s->ast_reference_count, 0);
    ASSERT_EQ(s->missing_reference_count, 0);
    cbm_free_result(r); PASS();
}

TEST(sql_audit_partition_lateral_values) {
    cbm_sql_dialect_hint_set("hive", "config");
    CBMFileResult *r = extract("INSERT OVERWRITE dst PARTITION(p='x') "
        "SELECT x FROM raw.s LATERAL VIEW explode(array(a,b)) ex AS x;"
        "INSERT INTO dst VALUES (v); INSERT INTO dst SELECT a FROM raw.s;",
        CBM_LANG_SQL, "t", "job.sql");
    cbm_sql_dialect_hint_set(NULL, NULL);
    ASSERT_NOT_NULL(r);
    ASSERT_FALSE(r->parse_incomplete);
    int partitions = 0;
    for (int i = 0; i < r->sql_entities.count; i++) {
        CBMSqlEntity *e = &r->sql_entities.items[i];
        if (e->kind == CBM_SQL_CLAUSE && e->clause_kind && !strcmp(e->clause_kind, "partition")) {
            partitions++; ASSERT_STR_EQ(e->syntax_type, "partition");
            ASSERT_GT(e->start_byte, 0);
        }
    }
    ASSERT_EQ(partitions, 1);
    ASSERT(has_sql_entity(r, CBM_SQL_COLUMN_REF, "p"));
    ASSERT(has_sql_entity(r, CBM_SQL_COLUMN_REF, "a"));
    ASSERT(has_sql_entity(r, CBM_SQL_COLUMN_REF, "b"));
    ASSERT(has_sql_entity(r, CBM_SQL_COLUMN_REF, "v"));
    cbm_free_result(r); PASS();
}

TEST(sql_audit_optimizer_hint_is_not_missing_data) {
    cbm_sql_dialect_hint_set("hive", "config");
    CBMFileResult *r = extract("SELECT /*+ MERGE(s,t) */ s.a FROM src s JOIN other t ON s.id=t.id;",
                               CBM_LANG_SQL, "t", "hint.sql");
    cbm_sql_dialect_hint_set(NULL, NULL);
    ASSERT_NOT_NULL(r); ASSERT_FALSE(r->parse_incomplete);
    CBMSqlEntity *s = find_sql_entity(r, CBM_SQL_STATEMENT, "statement_0001");
    ASSERT_NOT_NULL(s); ASSERT_EQ(s->missing_reference_count, 0);
    ASSERT_FALSE(has_sql_entity(r, CBM_SQL_COLUMN_REF, "s"));
    ASSERT_FALSE(has_sql_entity(r, CBM_SQL_COLUMN_REF, "t"));
    cbm_free_result(r); PASS();
}

TEST(sql_audit_cte_self_reference_needs_recursive) {
    CBMFileResult *r = extract("WITH c AS (SELECT a FROM c) INSERT INTO dst SELECT a FROM c;",
                               CBM_LANG_SQL, "t", "job.sql");
    ASSERT_NOT_NULL(r);
    ASSERT(has_sql_entity(r, CBM_SQL_TABLE_REF, "c"));
    ASSERT(has_sql_entity(r, CBM_SQL_CTE_REF, "c"));
    cbm_free_result(r);
    cbm_sql_dialect_hint_set("postgres", "config");
    r = extract("WITH RECURSIVE c AS (SELECT a FROM c) INSERT INTO dst SELECT a FROM c;",
                 CBM_LANG_SQL, "t", "job.sql");
    cbm_sql_dialect_hint_set(NULL, NULL);
    ASSERT_NOT_NULL(r);
    ASSERT_FALSE(has_sql_entity(r, CBM_SQL_TABLE_REF, "c"));
    ASSERT(has_sql_entity(r, CBM_SQL_CTE_REF, "c"));
    cbm_free_result(r); PASS();
}

TEST(sql_audit_dsl_only_has_coverage_gap) {
    CBMFileResult *r = extract("-- a comment\nlet x = 'some path';\ncoalesce_files(x);\n",
                               CBM_LANG_SQL, "t", "job.sql");
    ASSERT_NOT_NULL(r); ASSERT_TRUE(r->parse_incomplete); ASSERT_TRUE(r->parse_unusable);
    ASSERT_NOT_NULL(r->error_ranges); ASSERT_EQ(r->error_ranges[0], '2');
    cbm_free_result(r);
    r = extract("-- comment only\n/* comment */\n", CBM_LANG_SQL, "t", "empty.sql");
    ASSERT_NOT_NULL(r); ASSERT_FALSE(r->parse_incomplete);
    cbm_free_result(r); PASS();
}

TEST(sql_audit_projection_loss_is_not_complete) {
    /* A named WINDOW is currently outside the specialized SELECT projection.
     * The verifier must report its omitted key, not certify completeness. */
    CBMFileResult *r = extract("SELECT SUM(v) OVER w FROM src WINDOW w AS (PARTITION BY k);",
                               CBM_LANG_SQL, "t", "window.sql");
    ASSERT_NOT_NULL(r);
    CBMSqlEntity *s = find_sql_entity(r, CBM_SQL_STATEMENT, "statement_0001");
    ASSERT_NOT_NULL(s); ASSERT_GT(s->missing_reference_count, 0);
    ASSERT_TRUE(r->parse_incomplete); ASSERT_TRUE(s->partial);
    bool gap = false;
    for (int i=0;i<r->sql_entities.count;i++) {
        CBMSqlEntity *e=&r->sql_entities.items[i];
        if(e->kind==CBM_SQL_UNPARSED_REGION && e->clause_kind && !strcmp(e->clause_kind,"extraction_gap")) gap=true;
    }
    ASSERT_TRUE(gap); cbm_free_result(r); PASS();
}

TEST(yaml_audit_nested_values_and_aliases) {
    CBMFileResult *r = extract("vars: &base\n  X: alpha\nstands:\n  prod:\n    <<: *base\n"
        "    X: beta\nparams:\n  - *base\n", CBM_LANG_YAML, "t", "resources/mart.yml");
    ASSERT_NOT_NULL(r);
    const CBMDefinition *a = find_config_def(r, "vars.X");
    const CBMDefinition *b = find_config_def(r, "stands.prod.X");
    ASSERT_NOT_NULL(a); ASSERT_NOT_NULL(b);
    ASSERT_STR_EQ(def_extra_prop(a, "value"), "alpha");
    ASSERT_STR_EQ(def_extra_prop(b, "value"), "beta");
    a = find_config_def(r, "vars"); ASSERT_NOT_NULL(a);
    ASSERT_STR_EQ(def_extra_prop(a, "yaml_anchor"), "base");
    a = find_config_def(r, "stands.prod.<<"); ASSERT_NOT_NULL(a);
    ASSERT_STR_EQ(def_extra_prop(a, "yaml_alias"), "base");
    a = find_config_def(r, "params[0]"); ASSERT_NOT_NULL(a);
    ASSERT_STR_EQ(def_extra_prop(a, "yaml_alias"), "base");
    cbm_free_result(r); PASS();
}

TEST(yaml_audit_anchored_sequence_items) {
    CBMFileResult *r = extract("defaults:\n  - &entry\n    name: app.X\n    value: alpha\n"
        "params:\n  - *entry\nscalars: [&path 'sql/job.sql']\nscalar: &single 'beta'\n",
        CBM_LANG_YAML, "t", "resources/ctl/ctl.yml");
    ASSERT_NOT_NULL(r);
    const CBMDefinition *anchor = find_config_def(r, "defaults[0]");
    const CBMDefinition *name = find_config_def(r, "defaults[0].name");
    const CBMDefinition *value = find_config_def(r, "defaults[0].value");
    const CBMDefinition *alias = find_config_def(r, "params[0]");
    ASSERT_NOT_NULL(anchor); ASSERT_NOT_NULL(name); ASSERT_NOT_NULL(value); ASSERT_NOT_NULL(alias);
    ASSERT_STR_EQ(def_extra_prop(anchor, "yaml_anchor"), "entry");
    ASSERT_STR_EQ(name->config_parent_qn, anchor->qualified_name);
    ASSERT_STR_EQ(value->config_parent_qn, anchor->qualified_name);
    ASSERT_STR_EQ(def_extra_prop(alias, "yaml_alias"), "entry");
    const CBMDefinition *scalar = find_config_def(r, "scalars[0]");
    ASSERT_NOT_NULL(scalar);
    ASSERT_STR_EQ(def_extra_prop(scalar, "yaml_anchor"), "path");
    ASSERT_STR_EQ(def_extra_prop(scalar, "value"), "sql/job.sql");
    scalar = find_config_def(r, "scalar"); ASSERT_NOT_NULL(scalar);
    ASSERT_STR_EQ(def_extra_prop(scalar, "value"), "beta");
    cbm_free_result(r); PASS();
}
