import { comma_list, paren_list } from '../../grammar/helpers.js';

// Teradata statements that had no rule at all. The statement inventory comes
// from the v20.00 SQL DDL/DCL/DML manuals, read through the docs.teradata.com
// Fluid Topics API (/api/khub/maps/{id}/toc).
export default {

  // SHOW { TABLE | VIEW | MACRO | PROCEDURE | TRIGGER | JOIN INDEX
  //      | HASH INDEX | MAP | STATISTICS | QUERY LOGGING } object
  // SHOW <request>  ; echoes the DDL that would create the request's objects
  show_statement: $ => prec.right(seq(
    $.keyword_show,
    choice(
      seq(
        choice(
          $.keyword_table,
          $.keyword_view,
          $.keyword_macro,
          $.keyword_procedure,
          $.keyword_trigger,
          seq($.keyword_join, $.keyword_index),
          seq($.keyword_hash, $.keyword_index),
          $.keyword_map,
          $.keyword_statistics,
        ),
        field('name', $.object_reference),
      ),
      seq($.keyword_query, $.keyword_logging, optional($._logging_scope)),
      $._dml_read,
    ),
  )),

  // HELP is Teradata's catalog-introspection statement; the existing rule
  // covered only STATISTICS and TABLE.
  help_statement: $ => prec.right(seq(
    $.keyword_help,
    choice(
      seq(
        $.keyword_statistics,
        field('name', $.object_reference),
        optional(seq($.keyword_from, $.object_reference)),
      ),
      seq(
        choice(
          $.keyword_table,
          $.keyword_view,
          $.keyword_macro,
          $.keyword_procedure,
          $.keyword_function,
          $.keyword_trigger,
          $.keyword_type,
          $.keyword_database,
          $.keyword_user,
          $.keyword_constraint,
          $.keyword_index,
          $.keyword_method,
          $.keyword_cast,
          $.keyword_transform,
          seq($.keyword_join, $.keyword_index),
          seq($.keyword_hash, $.keyword_index),
          seq($.keyword_error, $.keyword_table),
          seq($.keyword_volatile, $.keyword_table),
        ),
        field('name', $.object_reference),
      ),
      seq($.keyword_column, field('column', $.object_reference)),
      $.keyword_session,
      $.keyword_online,
    ),
  )),

  // BEGIN|END LOGGING …            BEGIN|END QUERY LOGGING …
  // BEGIN|END QUERY CAPTURE …      BEGIN|END ISOLATED LOADING …
  // REPLACE|FLUSH QUERY LOGGING …
  logging_statement: $ => prec.right(seq(
    choice(
      $.keyword_begin,
      $.keyword_end,
      $.keyword_replace,
      $.keyword_flush,
    ),
    choice(
      seq($.keyword_query, $.keyword_logging, optional($._logging_scope)),
      seq($.keyword_query, $.keyword_capture, optional($._logging_scope)),
      seq($.keyword_isolated, $.keyword_loading, optional($._logging_scope)),
      seq($.keyword_logging, optional($._logging_scope)),
    ),
  )),

  // The trailing ON/WITH/FOR qualifiers differ per statement; they are
  // accepted as a loose tail rather than modelled per form.
  _logging_scope: $ => repeat1(choice(
    seq($.keyword_on, comma_list($.object_reference, true)),
    seq($.keyword_with, comma_list(field('option', $.identifier), true)),
    seq($.keyword_for, comma_list($.object_reference, true)),
    $.keyword_all,
    field('option', $.identifier),
    $.literal,
  )),

  // DATABASE name; sets the session's default database
  database_statement: $ => seq(
    $.keyword_database,
    field('name', $.object_reference),
  ),

  // GIVE database TO recipient
  give_statement: $ => seq(
    $.keyword_give,
    field('name', $.object_reference),
    $.keyword_to,
    field('recipient', $.object_reference),
  ),

  // RENAME { VIEW | MACRO | PROCEDURE | TRIGGER | FUNCTION } old {TO|AS} new
  // TABLE is deliberately absent: base's _rename_statement already covers
  // `RENAME TABLE t TO t2`, and listing it here made that reducible two ways.
  rename_object_statement: $ => seq(
    $.keyword_rename,
    choice(
      $.keyword_view,
      $.keyword_macro,
      $.keyword_procedure,
      $.keyword_trigger,
      $.keyword_function,
    ),
    field('name', $.object_reference),
    choice($.keyword_to, $.keyword_as),
    field('new_name', $.object_reference),
  ),

  // DELETE { DATABASE | USER } name [ALL]
  delete_database_statement: $ => prec.right(seq(
    $.keyword_delete,
    choice($.keyword_database, $.keyword_user),
    field('name', $.object_reference),
    optional($.keyword_all),
  )),

  // CHECKPOINT [name]   |   ECHO 'string'   |   ABORT [expression]
  checkpoint_statement: $ => prec.right(seq(
    $.keyword_checkpoint,
    optional(field('name', $.object_reference)),
  )),

  echo_statement: $ => seq(
    $.keyword_echo,
    field('command', alias($._literal_string, $.literal)),
  ),

  abort_statement: $ => prec.right(seq(
    $.keyword_abort,
    optional(field('message', alias($._literal_string, $.literal))),
    optional($.where),
  )),

  // COLLECT DEMOGRAPHICS FOR table INTO qcd
  collect_demographics_statement: $ => prec.right(seq(
    $.keyword_collect,
    $.keyword_demographics,
    $.keyword_for,
    comma_list($.object_reference, true),
    optional(seq($.keyword_into, field('qcd', $.object_reference))),
  )),

  // DROP STATISTICS [COLUMN (…) | INDEX (…)] ON table
  drop_statistics_statement: $ => prec.right(seq(
    $.keyword_drop,
    choice($.keyword_statistics, $.keyword_stats),
    optional(seq(
      choice($.keyword_column, $.keyword_index),
      paren_list($.identifier, true),
    )),
    optional($.keyword_on),
    field('name', $.object_reference),
  )),

  // EXECUTE macro_name [(arg [, …])]
  execute_macro_statement: $ => prec.right(seq(
    $.keyword_execute,
    field('name', $.object_reference),
    optional(paren_list($._expression)),
  )),

};
