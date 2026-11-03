; inherits: sql

; ── Snowflake-specific keywords ─────────────────────────────────────────────

[
  (keyword_at)
  (keyword_before)
  (keyword_qualify)
  (keyword_pivot)
  (keyword_unpivot)
  (keyword_include)
  (keyword_exclude)
  (keyword_match_recognize)
  (keyword_measures)
  (keyword_pattern)
  (keyword_define)
  (keyword_skip)
  (keyword_one)
  (keyword_per)
  (keyword_past)
  (keyword_next)
  (keyword_let)
  (keyword_raise)
  (keyword_exception)
  (keyword_declare)
  (keyword_execute)
  (keyword_immediate)
  (keyword_task)
  (keyword_copy)
  (keyword_stream)
  (keyword_dynamic)
  (keyword_warehouse)
  (keyword_secure)
  (keyword_masking)
  (keyword_access)
  (keyword_storage)
  (keyword_api)
  (keyword_notification)
  (keyword_enabled)
  (keyword_secondary)
  (keyword_roles)
  (keyword_returns)
  (keyword_session)
  (keyword_modify)
] @keyword

; ── Stage references (@stage_name) ─────────────────────────────────────────

(stage_ref) @string.special

; Snowflake STAGE DDL keywords
[
  (keyword_stage)
  (keyword_file_format)
  (keyword_pattern)
  (keyword_list)
] @keyword

; EXPLAIN prefix (non-ANSI; re-added over the strict ANSI base)
[
  (keyword_explain)
  (keyword_analyze)
  (keyword_verbose)
] @keyword

; ============================================================
; Remaining snowflake keywords
; ============================================================

[
  (keyword_abort)
  (keyword_account)
  (keyword_auto_resume)
  (keyword_auto_suspend)
  (keyword_call)
  (keyword_catalog)
  (keyword_clone)
  (keyword_recluster)
  (keyword_search)
  (keyword_optimization)
  (keyword_global)
  (keyword_transient)
  (keyword_tags)
  (keyword_tag)
  (keyword_template)
  (keyword_autoincrement)
  (keyword_identity)
  (keyword_noorder)
  (keyword_projection)
  (keyword_aggregation)
  (keyword_entity)
  (keyword_allowed)
  (keyword_keys)
  (keyword_lifecycle)
  (keyword_contact)
  (keyword_virtual)
  (keyword_enforced)
  (keyword_rely)
  (keyword_norely)
  (keyword_validate)
  (keyword_novalidate)
  (keyword_cluster)
  (keyword_clustering)
  (keyword_columns)
  (keyword_connect)
  (keyword_databases)
  (keyword_describe)
  (keyword_do)
  (keyword_economy)
  (keyword_extension)
  (keyword_file)
  (keyword_files)
  (keyword_format)
  (keyword_formats)
  (keyword_functions)
  (keyword_get)
  (keyword_grants)
  (keyword_hash)
  (keyword_ignore)
  (keyword_ilike)
  (keyword_integration)
  (keyword_integrations)
  (keyword_location)
  (keyword_locks)
  (keyword_match)
  (keyword_max_cluster_count)
  (keyword_min_cluster_count)
  (keyword_nocycle)
  (keyword_overwrite)
  (keyword_parameters)
  (keyword_pipe)
  (keyword_pipes)
  (keyword_policies)
  (keyword_policy)
  (keyword_prior)
  (keyword_procedures)
  (keyword_put)
  (keyword_queries)
  (keyword_remove)
  (keyword_resume)
  (keyword_returning)
  (keyword_scaling_policy)
  (keyword_schemas)
  (keyword_sequences)
  (keyword_show)
  (keyword_stages)
  (keyword_standard)
  (keyword_starts)
  (keyword_streams)
  (keyword_suspend)
  (keyword_swap)
  (keyword_purge)
  (keyword_failover)
  (keyword_try_cast)
  (keyword_connect_by_root)
  (keyword_fields)
  (keyword_edition)
  (keyword_feature)
  (keyword_tasks)
  (keyword_terse)
  (keyword_transactions)
  (keyword_undrop)
  (keyword_unset)
  (keyword_use)
  (keyword_users)
  (keyword_views)
  (keyword_warehouse_size)
  (keyword_warehouses)
] @keyword

; Keywords that moved out of the ISO base grammar into the rules of this dialect
[
  (keyword_change)
  (keyword_collate)
  (keyword_concurrently)
  (keyword_connection)
  (keyword_deferrable)
  (keyword_disable)
  (keyword_enable)
  (keyword_force)
  (keyword_initially)
  (keyword_none)
  (keyword_nowait)
  (keyword_owner)
  (keyword_password)
  (keyword_refresh)
  (keyword_rename)
  (keyword_reset)
  (keyword_tables)
  (keyword_tablespace)
  (keyword_temp)
  (keyword_until)
  (keyword_value)
  (keyword_wait)
] @keyword
(keyword_aggregate) @keyword
(keyword_allowed_values) @keyword
(keyword_caller) @keyword
(keyword_managed) @keyword
(keyword_memoizable) @keyword
(keyword_output) @keyword
(keyword_alert) @keyword
(keyword_authentication) @keyword
(keyword_condition) @keyword
(keyword_frozen) @keyword
(keyword_suspended) @keyword
(keyword_accounts) @keyword
(keyword_alerts) @keyword
(keyword_application) @keyword
(keyword_applications) @keyword
(keyword_compute) @keyword
(keyword_connections) @keyword
(keyword_cortex) @keyword
(keyword_dbt) @keyword
(keyword_dcm) @keyword
(keyword_deployments) @keyword
(keyword_event) @keyword
(keyword_future) @keyword
(keyword_history) @keyword
(keyword_hybrid) @keyword
(keyword_iceberg) @keyword
(keyword_identifier) @keyword
(keyword_imported) @keyword
(keyword_mcp) @keyword
(keyword_metric) @keyword
(keyword_model) @keyword
(keyword_monitor) @keyword
(keyword_monitors) @keyword
(keyword_network) @keyword
(keyword_notebook) @keyword
(keyword_objects) @keyword
(keyword_package) @keyword
(keyword_pool) @keyword
(keyword_pools) @keyword
(keyword_project) @keyword
(keyword_projects) @keyword
(keyword_regions) @keyword
(keyword_replication) @keyword
(keyword_resource) @keyword
(keyword_result) @keyword
(keyword_rule) @keyword
(keyword_rules) @keyword
(keyword_semantic) @keyword
(keyword_server) @keyword
(keyword_servers) @keyword
(keyword_service) @keyword
(keyword_services) @keyword
(keyword_share) @keyword
(keyword_shares) @keyword
(keyword_streamlit) @keyword
(keyword_streamlits) @keyword
(keyword_variables) @keyword
(keyword_volume) @keyword
(keyword_volumes) @keyword
(keyword_workspaces) @keyword
(keyword_apply) @keyword
(keyword_attach) @keyword
(keyword_audit) @keyword
(keyword_bind) @keyword
(keyword_endpoint) @keyword
(keyword_evolve) @keyword
(keyword_exchange) @keyword
(keyword_execution) @keyword
(keyword_import) @keyword
(keyword_backup) @keyword
(keyword_listing) @keyword
(keyword_manage) @keyword
(keyword_name) @keyword
(keyword_operate) @keyword
(keyword_override) @keyword
(keyword_ownership) @keyword
(keyword_packages) @keyword
(keyword_purchase) @keyword
(keyword_reference) @keyword
(keyword_restrictions) @keyword
(keyword_append_only) @keyword
(keyword_asof) @keyword
(keyword_block) @keyword
(keyword_changes) @keyword
(keyword_directed) @keyword
(keyword_error_table) @keyword
(keyword_information) @keyword
(keyword_match_condition) @keyword
(keyword_minus) @keyword
(keyword_sample) @keyword
(keyword_seed) @keyword
(keyword_tabular) @keyword
(keyword_text) @keyword
(keyword_top) @keyword
(keyword_async) @keyword
(keyword_authorizations) @keyword
(keyword_await) @keyword
(keyword_backfill) @keyword
(keyword_body) @keyword
(keyword_break) @keyword
(keyword_cancel) @keyword
(keyword_close) @keyword
(keyword_config) @keyword
(keyword_delegated) @keyword
(keyword_dimensions) @keyword
(keyword_dry_run) @keyword
(keyword_elseif) @keyword
(keyword_empty) @keyword
(keyword_enroll) @keyword
(keyword_exit) @keyword
(keyword_facts) @keyword
(keyword_final) @keyword
(keyword_graph) @keyword
(keyword_indexing) @keyword
(keyword_interactive) @keyword
(keyword_iterate) @keyword
(keyword_loop) @keyword
(keyword_matches) @keyword
(keyword_method) @keyword
(keyword_metrics) @keyword
(keyword_mfa) @keyword
(keyword_movement) @keyword
(keyword_notify) @keyword
(keyword_omit) @keyword
(keyword_open) @keyword
(keyword_other) @keyword
(keyword_percent) @keyword
(keyword_permute) @keyword
(keyword_person) @keyword
(keyword_pull) @keyword
(keyword_repeat) @keyword
(keyword_require) @keyword
(keyword_resultset) @keyword
(keyword_retry) @keyword
(keyword_reverse) @keyword
(keyword_run) @keyword
(keyword_running) @keyword
(keyword_semantic_view) @keyword
(keyword_snapshot) @keyword
(keyword_storage_location) @keyword
(keyword_subpath) @keyword
(keyword_suspend_immediate) @keyword
(keyword_triggers) @keyword
(keyword_unmatched) @keyword
(keyword_while) @keyword
(keyword_respect) @keyword
(keyword_class) @keyword
(keyword_insufficient) @keyword
(keyword_internal) @keyword
(keyword_ls) @keyword
(keyword_partial) @keyword
(keyword_replica) @keyword
(keyword_retention) @keyword
(keyword_rm) @keyword
(keyword_simple) @keyword
(keyword_specification) @keyword
(keyword_workspace) @keyword
(keyword_agent) @keyword
(keyword_agents) @keyword
(keyword_ai) @keyword
(keyword_approval) @keyword
(keyword_approve) @keyword
(keyword_approved) @keyword
(keyword_artifact) @keyword
(keyword_attributes) @keyword
(keyword_available) @keyword
(keyword_backups) @keyword
(keyword_base) @keyword
(keyword_branches) @keyword
(keyword_bundle) @keyword
(keyword_bundles) @keyword
(keyword_channel) @keyword
(keyword_channels) @keyword
(keyword_classes) @keyword
(keyword_code) @keyword
(keyword_configuration) @keyword
(keyword_configurations) @keyword
(keyword_connector) @keyword
(keyword_connectors) @keyword
(keyword_consumer) @keyword
(keyword_consumers) @keyword
(keyword_contacts) @keyword
(keyword_containers) @keyword
(keyword_content) @keyword
(keyword_contracts) @keyword
(keyword_convert) @keyword
(keyword_dataset) @keyword
(keyword_datasets) @keyword
(keyword_decline) @keyword
(keyword_definition) @keyword
(keyword_definitions) @keyword
(keyword_delta) @keyword
(keyword_deploy) @keyword
(keyword_deployment) @keyword
(keyword_directive) @keyword
(keyword_directives) @keyword
(keyword_discovery) @keyword
(keyword_draft) @keyword
(keyword_endpoints) @keyword
(keyword_entities) @keyword
(keyword_experiment) @keyword
(keyword_experiments) @keyword
(keyword_families) @keyword
(keyword_fork) @keyword
(keyword_gateway) @keyword
(keyword_git) @keyword
(keyword_grace_period_in_days) @keyword
(keyword_image) @keyword
(keyword_images) @keyword
(keyword_immediately) @keyword
(keyword_indexes) @keyword
(keyword_inference) @keyword
(keyword_instance) @keyword
(keyword_instances) @keyword
(keyword_job) @keyword
(keyword_jobs) @keyword
(keyword_linked_catalog) @keyword
(keyword_listings) @keyword
(keyword_lock) @keyword
(keyword_maintenance) @keyword
(keyword_materialization) @keyword
(keyword_methods) @keyword
(keyword_models) @keyword
(keyword_multi) @keyword
(keyword_nodes) @keyword
(keyword_notebooks) @keyword
(keyword_offers) @keyword
(keyword_online) @keyword
(keyword_openflow) @keyword
(keyword_organization) @keyword
(keyword_output_path) @keyword
(keyword_owned) @keyword
(keyword_pair) @keyword
(keyword_pairs) @keyword
(keyword_party) @keyword
(keyword_pat) @keyword
(keyword_patch) @keyword
(keyword_pats) @keyword
(keyword_plan) @keyword
(keyword_plane) @keyword
(keyword_plans) @keyword
(keyword_postgres) @keyword
(keyword_preview) @keyword
(keyword_pricing) @keyword
(keyword_privacy) @keyword
(keyword_private) @keyword
(keyword_profile) @keyword
(keyword_profiles) @keyword
(keyword_programmatic) @keyword
(keyword_provisioned) @keyword
(keyword_publish) @keyword
(keyword_published) @keyword
(keyword_relationships) @keyword
(keyword_repositories) @keyword
(keyword_repository) @keyword
(keyword_revision) @keyword
(keyword_root) @keyword
(keyword_rotate) @keyword
(keyword_routing) @keyword
(keyword_rss) @keyword
(keyword_runs) @keyword
(keyword_runtime) @keyword
(keyword_runtimes) @keyword
(keyword_scope) @keyword
(keyword_scopes) @keyword
(keyword_secret) @keyword
(keyword_secrets) @keyword
(keyword_shared) @keyword
(keyword_snapshots) @keyword
(keyword_specification_template) @keyword
(keyword_specifications) @keyword
(keyword_synonyms) @keyword
(keyword_telemetry) @keyword
(keyword_terminate) @keyword
(keyword_test) @keyword
(keyword_throughput) @keyword
(keyword_token) @keyword
(keyword_tokens) @keyword
(keyword_types) @keyword
(keyword_upgrade) @keyword
(keyword_vector) @keyword
(keyword_version) @keyword
(keyword_versioned) @keyword
(keyword_versions) @keyword
(keyword_visibility) @keyword
(keyword_workload) @keyword
(keyword_archive) @keyword
(keyword_excluding) @keyword
(keyword_expectation) @keyword
(keyword_gateways) @keyword
(keyword_inherited) @keyword
(keyword_metadata_columns) @keyword
(keyword_resample) @keyword
(keyword_scoped) @keyword
