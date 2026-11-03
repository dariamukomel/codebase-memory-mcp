import { comma_list, paren_list, optional_parenthesis, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // CREATE [SET|MULTISET] [GLOBAL TEMPORARY|VOLATILE] TABLE t
  //   [, table option …] [(columns)] [AS (query) [WITH [NO] DATA]]
  //   [[UNIQUE] PRIMARY INDEX [name] (cols) | NO PRIMARY INDEX]
  //   [PARTITION BY …] [INDEX (cols)] [ON COMMIT PRESERVE|DELETE ROWS]
  create_table: $ => prec.right(
    seq(
      $.keyword_create,
      optional(choice($.keyword_set, $.keyword_multiset, $.keyword_volatile)),
      optional(choice(
        seq($.keyword_global, $.keyword_temporary),
        $.keyword_volatile,
        $.keyword_set,
        $.keyword_multiset,
        $._temporary,
      )),
      $.keyword_table,
      optional($._if_not_exists),
      field("target", $.object_reference),
      repeat(seq(',', $.table_option)),
      optional($.column_definitions),
      optional(seq(
        $.keyword_as,
        choice($.create_query, wrapped_in_parenthesis($.create_query)),
        optional(seq(
          $.keyword_with, optional($.keyword_no), $.keyword_data,
          optional(seq(
            $.keyword_and, optional($.keyword_no),
            choice($.keyword_statistics, $.keyword_stats),
          )),
        )),
      )),
      optional(choice(
        $.primary_index,
        seq($.keyword_no, $.keyword_primary, $.keyword_index),
      )),
      optional($.table_partition_by),
      optional(seq($.keyword_index, alias($._column_list, $.list))),
      optional($.on_commit_clause),
    ),
  ),

  on_commit_clause: $ => seq(
    $.keyword_on,
    $.keyword_commit,
    choice($.keyword_preserve, $.keyword_delete),
    $.keyword_rows,
  ),

  // CREATE TABLE's attribute list. The BLOCKCOMPRESSION entry carries a
  // GLR-ambiguous optional paren list, so it is kept separate from the
  // unambiguous attributes: ALTER TABLE reuses only the latter (see
  // alter_table in ../grammar.js), rather than putting that ambiguity in a
  // second context.
  //
  // Note on generation time: teradata's `tree-sitter generate` takes ~25-30
  // minutes. That is pre-existing, not a cost of the ALTER TABLE reuse;
  // measured by generating this dialect from an unmodified checkout, which
  // ran past 23 minutes with the same flat ~580MB RSS and CPU-bound profile.
  table_option: $ => choice(
    $._table_attribute,
    // BLOCKCOMPRESSION = mode [(column defs)]; the parens are ambiguous with
    // the table's own column list (…=NEVER (a INT) vs …=AUTOTEMP(c1 INT));
    // GLR explores both and prec.dynamic(-1) prefers the table-column reading
    // when both survive.
    seq(
      $.keyword_blockcompression,
      '=',
      choice(
        $.keyword_default,
        seq($.identifier, optional(prec.dynamic(-1, paren_list($.column_definition, true)))),
      ),
    ),
  ),

  _table_attribute: $ => choice(
    // [NO] FALLBACK [PROTECTION]
    seq(optional($.keyword_no), $.keyword_fallback, optional($.keyword_protection)),
    // [NO|DUAL|LOCAL|NOT LOCAL] [BEFORE|AFTER] JOURNAL
    seq(
      optional(choice(
        $.keyword_no,
        $.keyword_dual,
        $.keyword_local,
        seq($.keyword_not, $.keyword_local),
      )),
      optional(choice($.keyword_before, $.keyword_after)),
      $.keyword_journal,
    ),
    // WITH JOURNAL TABLE = t
    seq($.keyword_with, $.keyword_journal, $.keyword_table, '=', $.object_reference),
    // [NO] LOG
    seq(optional($.keyword_no), $.keyword_log),
    // [MINIMUM|MAXIMUM|DEFAULT] DATABLOCKSIZE [= n [unit]]
    seq(
      optional(choice($.keyword_minimum, $.keyword_maximum, $.keyword_default)),
      $.keyword_datablocksize,
      optional(seq('=', $.literal, optional($.identifier))),
    ),
    // [NO] MERGEBLOCKRATIO [= n [PERCENT]]
    seq(
      optional($.keyword_no),
      $.keyword_mergeblockratio,
      optional(seq('=', $.literal, optional($.keyword_percent))),
    ),
    // FREESPACE = n [PERCENT]
    seq($.keyword_freespace, '=', $.literal, optional($.keyword_percent)),
    // CHECKSUM = ON | OFF | DEFAULT
    seq($.keyword_checksum, '=', choice($.keyword_on, $.keyword_default, $.identifier)),
  ),

  // ALTER TABLE t, <attribute>; the same attributes CREATE TABLE takes, with
  // BLOCKCOMPRESSION in its unambiguous spelling (no trailing column list to
  // weigh against a table's own column definitions).
  alter_table_option: $ => choice(
    $._table_attribute,
    seq($.keyword_blockcompression, '=', choice($.keyword_default, $.identifier)),
  ),

  primary_index: $ => seq(
    optional($.keyword_unique),
    $.keyword_primary,
    $.keyword_index,
    optional(field('name', $.identifier)),
    alias($._column_list, $.list),
  ),

  // PARTITION BY RANGE_N(…) | CASE_N(…) | expr
  table_partition_by: $ => prec.right(seq(
    $.keyword_partition,
    $.keyword_by,
    choice(
      $.range_n,
      $.case_n,
      $._expression,
    ),
  )),

  // RANGE_N(col BETWEEN start [, start …] AND end [EACH size])
  // Operands are restricted to literals/identifiers/* so AND stays the range
  // separator instead of a boolean operator.
  range_n: $ => seq(
    $.keyword_range_n,
    '(',
    $._range_operand,
    $.keyword_between,
    comma_list($._range_operand, true),
    $.keyword_and,
    $._range_operand,
    optional(seq($.keyword_each, $._range_operand)),
    ')',
  ),

  _range_operand: $ => choice(
    $.literal,
    $.identifier,
    alias('*', $.literal),
  ),

  case_n: $ => seq(
    $.keyword_case_n,
    '(',
    comma_list($._expression, true),
    optional(seq(',', $.keyword_no, $.keyword_case)),
    optional(seq(optional(','), $.keyword_unknown)),
    ')',
  ),

  // COLLECT [SUMMARY] STATISTICS|STATS with COLUMN(S)/INDEX targets and ON t
  // in any order (Teradata accepts both orders)
  collect_statistics_statement: $ => prec.right(seq(
    $.keyword_collect,
    optional($.keyword_summary),
    choice($.keyword_statistics, $.keyword_stats),
    repeat1(choice(
      seq(
        choice($.keyword_column, $.keyword_columns, $.keyword_index),
        alias($._column_list, $.list),
      ),
      seq($.keyword_on, $.object_reference),
    )),
  )),

  // CREATE MACRO m [(param TYPE [, …])] AS (statement; [statement; …])
  create_macro_statement: $ => seq(
    $.keyword_create,
    $.keyword_macro,
    $.object_reference,
    optional(paren_list($.macro_parameter, true)),
    $.keyword_as,
    '(',
    repeat1(seq($.statement, ';')),
    ')',
  ),

  macro_parameter: $ => seq(
    field('name', $.identifier),
    field('type', $._type),
  ),

  // Teradata QUALIFY clause (shared node name across dialects)
  qualify: $ => seq(
    $.keyword_qualify,
    $._expression,
  ),

  // LOCKING ROW|TABLE t|VIEW v|DATABASE d FOR ACCESS|READ|WRITE|SHARE|EXCLUSIVE
  // request modifier prefixed to a query
  locking_modifier: $ => seq(
    $.keyword_locking,
    choice(
      $.keyword_row,
      seq($.keyword_table, optional($.object_reference)),
      seq($.keyword_view, optional($.object_reference)),
      seq($.keyword_database, optional($.object_reference)),
      $.object_reference,
    ),
    $.keyword_for,
    choice(
      $.keyword_access,
      $.keyword_read,
      $.keyword_write,
      $.keyword_share,
      $.keyword_exclusive,
    ),
    optional($.keyword_nowait),
  ),

  // base _dml_read plus optional LOCKING request modifiers (also flows into
  // CREATE VIEW … AS via create_query)
  _dml_read: $ => seq(
    optional(optional_parenthesis($._cte)),
    repeat($.locking_modifier),
    optional_parenthesis(
      choice(
        $._select_statement,
        $.set_operation,
      ),
    ),
  ),

  // base set_operation plus Teradata MINUS
  set_operation: $ => seq(
    $._select_statement,
    repeat1(
      seq(
        field(
          "operation",
          choice(
            seq($.keyword_union, optional($.keyword_all)),
            $.keyword_except,
            $.keyword_intersect,
            $.keyword_minus,
          ),
        ),
        $._select_statement,
      ),
    ),
  ),

  // REPLACE VIEW v [(cols)] AS query; Teradata's create-or-replace
  replace_view: $ => seq(
    $.keyword_replace,
    $.keyword_view,
    $.object_reference,
    optional(alias($._column_list, $.list)),
    $.keyword_as,
    $.create_query,
  ),

  // SET QUERY_BAND = 'pairs' UPDATE FOR SESSION [VOLATILE] | FOR TRANSACTION
  set_query_band_statement: $ => seq(
    $.keyword_set,
    $.keyword_query_band,
    '=',
    choice($.literal, $.keyword_none),
    optional($.keyword_update),
    $.keyword_for,
    choice(
      seq($.keyword_session, optional($.keyword_volatile)),
      $.keyword_transaction,
    ),
  ),

  // HELP STATISTICS obj [FROM obj]
  // help_statement now lives in grammar/admin.js, which covers the full
  // HELP object list rather than just STATISTICS and TABLE.

  // SAMPLE n | SAMPLE f [, f …]; row sampling on a FROM clause
  sample_clause: $ => seq(
    $.keyword_sample,
    comma_list($.literal, true),
  ),

  // base term plus Teradata parenthesized FORMAT attribute: expr (FORMAT '…')
  term: $ => seq(
    field(
      'value',
      choice(
        $.all_fields,
        $._expression,
      ),
    ),
    optional($.format_attribute),
    optional($._alias),
  ),

  format_attribute: $ => seq(
    '(',
    $.keyword_format,
    $.literal,
    ')',
  ),

  // base _column_constraint plus Teradata column attributes:
  // FORMAT '…' and COMPRESS [(value [, …]) | value]
  _column_constraint: $ => prec.left(choice(
    choice(
      $.keyword_null,
      $._not_null,
    ),
    seq(
      $.keyword_references,
      $.object_reference,
      paren_list($.identifier, true),
      repeat(
        seq(
          $.keyword_on,
          choice($.keyword_delete, $.keyword_update),
          choice(
            seq($.keyword_no, $.keyword_action),
            $.keyword_restrict,
            $.keyword_cascade,
            seq(
              $.keyword_set,
              choice($.keyword_null, $.keyword_default),
                optional(paren_list($.identifier, true))
            ),
          ),
        ),
      ),
    ),
    $._default_expression,
    $._primary_key,
    $.direction,
    $._column_comment,
    $._check_constraint,
    seq(
      optional(seq($.keyword_generated, $.keyword_always)),
      $.keyword_as,
      $._expression,
    ),
    $.keyword_unique,
    // Teradata additions
    seq($.keyword_format, $.literal),
    prec.right(seq(
      $.keyword_compress,
      optional(choice(
        paren_list($._expression, true),
        $.literal,
      )),
    )),
    // Character-column attributes
    seq(optional($.keyword_not), $.keyword_casespecific),
    $.keyword_uppercase,
    seq($.keyword_title, $.literal),
  )),

  // BEGIN [ATOMIC] stmts END; Teradata stored-procedure compound block
  compound_statement: $ => seq(
    optional(field('label', seq($.identifier, ':'))),
    $.keyword_begin,
    optional($.keyword_atomic),
    repeat(seq($.statement, ';')),
    $.keyword_end,
    optional(field('end_label', $.identifier)),
  ),

};
