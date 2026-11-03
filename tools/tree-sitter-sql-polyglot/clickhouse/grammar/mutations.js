import { comma_list } from '../../grammar/helpers.js';

export default {

  // Override _alter_specifications to add ClickHouse mutation specs
  // (UPDATE / DELETE) alongside the re-enumerated ANSI base specs.
  _alter_specifications: $ => choice(
    // ANSI base specs (overrides replace, so re-enumerate)
    $.add_column,
    $.add_constraint,
    $.drop_constraint,
    $.alter_column,
    $.modify_column,
    $.change_column,
    $.drop_column,
    $.rename_object,
    $.rename_column,
    $.set_schema,
    $.change_ownership,
    // ClickHouse mutations
    $.alter_update,
    $.alter_delete,
    $.alter_partition,
    $.alter_index_spec,
    // MODIFY SETTING k = v [, …] / RESET SETTING k [, …]; the per-table
    // option list. SETTING is an extracted keyword, so the lexer hands the
    // parser keyword_setting rather than an identifier here and this branch
    // never competes with modify_column (the same arrangement ADD INDEX
    // already relies on above).
    //
    // prec.right, and on the production holding the list rather than on the
    // list itself: alter_table comma-separates its specifications, so a ','
    // after a setting is ambiguous between continuing this list and starting
    // the next specification. Without it tree-sitter reports an unresolved
    // conflict and refuses to generate. Same fix, same reason, as trino's
    // SET PROPERTIES.
    prec.right(seq($.keyword_modify, $.keyword_setting, comma_list($.setting_item, true))),
    prec.right(seq($.keyword_reset, $.keyword_setting, comma_list($.identifier, true))),
  ),

  // Data-skipping index management:
  //   ADD INDEX name expr TYPE type [GRANULARITY n] | {DROP|MATERIALIZE|CLEAR} INDEX name
  alter_index_spec: $ => choice(
    seq(
      $.keyword_add,
      $.keyword_index,
      field('name', $.identifier),
      field('expression', $._expression),
      $.keyword_type,
      field('type', choice($.identifier, $.invocation)),
      optional(seq($.keyword_granularity, alias($._natural_number, $.literal))),
    ),
    seq(
      choice($.keyword_drop, $.keyword_materialize, $.keyword_clear),
      $.keyword_index,
      field('name', $.identifier),
      optional($.in_partition_clause),
    ),
  ),

  // ALTER TABLE t UPDATE col = expr [, ...] [IN PARTITION p] WHERE cond
  alter_update: $ => seq(
    $.keyword_update,
    comma_list($.assignment, true),
    optional($.in_partition_clause),
    $.where,
  ),

  // ALTER TABLE t DELETE [IN PARTITION p] WHERE cond
  alter_delete: $ => seq(
    $.keyword_delete,
    optional($.in_partition_clause),
    $.where,
  ),

  // IN PARTITION partition_expr; scopes a mutation to one partition.
  // `IN PARTITION` is disambiguated from the binary IN operator by the
  // keyword_partition token (see the conflicts entry in grammar.js).
  in_partition_clause: $ => seq(
    $.keyword_in,
    $.keyword_partition,
    field('partition', $._expression),
  ),

  // ALTER TABLE t {DROP|DETACH|ATTACH} PARTITION expr
  // ALTER TABLE t FREEZE [PARTITION expr] [WITH NAME 'backup']
  // ALTER TABLE t UNFREEZE [PARTITION expr] WITH NAME 'backup'
  alter_partition: $ => prec.right(choice(
    seq(
      choice($.keyword_drop, $.keyword_detach, $.keyword_attach),
      $.keyword_partition,
      field('partition', $._expression),
    ),
    seq(
      choice($.keyword_freeze, $.keyword_unfreeze),
      optional(seq($.keyword_partition, field('partition', $._expression))),
      optional(seq(
        $.keyword_with,
        $.keyword_name,
        field('name', alias($._literal_string, $.literal)),
      )),
    ),
  )),

  // EXCHANGE TABLES t1 AND t2 [ON CLUSTER c]; atomic table swap
  exchange_tables_statement: $ => seq(
    $.keyword_exchange,
    $.keyword_tables,
    $.object_reference,
    $.keyword_and,
    $.object_reference,
    optional($.on_cluster),
  ),

  // OPTIMIZE TABLE t [ON CLUSTER c] [PARTITION expr] [FINAL] [DEDUPLICATE [BY expr]]
  optimize_statement: $ => prec.left(seq(
    $.keyword_optimize,
    $.keyword_table,
    $.object_reference,
    optional($.on_cluster),
    optional(seq($.keyword_partition, $.partition_selector)),
    optional(seq($.keyword_dry, $.keyword_run, $.keyword_parts,
                 comma_list(field('part', $.literal), true))),
    optional(choice($.keyword_final, $.keyword_force)),
    optional(seq(
      $.keyword_deduplicate,
      optional(seq($.keyword_by, comma_list($._expression, true))),
    )),
    optional($.keyword_cleanup),
  )),

  // PARTITION {expr | ID '<id>'}.
  //
  // The ID form is one token, not a keyword followed by a string. `id` is an
  // ordinary column name in ClickHouse, so reserving it is not an option, and
  // as an extracted keyword the lexer settles it against the word token
  // before the parser can weigh the alternatives; the string that follows
  // then has nowhere to go. Matching the whole marker lexically decides it by
  // length instead: `ID '…'` is longer than the identifier `id`, while a bare
  // `id` still lexes as an identifier. The cost is that the quoted id is not
  // its own literal node.
  partition_selector: $ => choice(
    $.partition_id,
    field('partition', $._expression),
  ),

  partition_id: _ => token(seq(
    /[iI][dD]/, /[ \t]+/, "'", /[^']*/, "'",
  )),

};
