import { comma_list, wrapped_in_parenthesis, optional_parenthesis, paren_list } from '../../grammar/helpers.js';

export default {

  // ATTACH ['file.db'] [AS alias] [(TYPE type, READ_ONLY bool, ...)]
  // ATTACH [IF NOT EXISTS | OR REPLACE] [DATABASE] 'path' [AS alias]
  //   [( option [value] [, ...] )]
  attach_statement: $ => seq(
    $.keyword_attach,
    optional(choice($._if_not_exists, $._or_replace)),
    optional($.keyword_database),
    optional(field('path', alias($._literal_string, $.literal))),
    optional(seq(
      $.keyword_as,
      field('alias', $.identifier),
    )),
    optional(wrapped_in_parenthesis(
      comma_list(
        seq(
          field('option_name', $.identifier),
          optional(field('option_value', choice($.identifier, alias($._literal_string, $.literal), $.literal))),
        ),
        true,
      ),
    )),
  ),

  // DETACH [DATABASE] [IF EXISTS] alias
  detach_statement: $ => seq(
    $.keyword_detach,
    optional($.keyword_database),
    optional($._if_exists),
    optional(field('alias', $.identifier)),
  ),

  // INSTALL name [FROM 'url' | FROM community | FROM core]
  install_statement: $ => seq(
    $.keyword_install,
    field('name', choice($.identifier, alias($._literal_string, $.literal))),
    optional(seq(
      $.keyword_from,
      field('source', choice($.identifier, alias($._literal_string, $.literal))),
    )),
  ),

  // LOAD name
  load_statement: $ => seq(
    $.keyword_load,
    field('name', choice($.identifier, alias($._literal_string, $.literal))),
  ),

  // SUMMARIZE table_ref | SUMMARIZE SELECT ...
  summarize_statement: $ => seq(
    $.keyword_summarize,
    choice(
      $.object_reference,
      $._dml_read,
    ),
  ),

  // CREATE [OR REPLACE] MACRO [IF NOT EXISTS] name(params) AS [TABLE] expr
  create_macro_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_macro,
    optional($._if_not_exists),
    $.object_reference,
    '(',
    optional(comma_list($.identifier, true)),
    ')',
    $.keyword_as,
    optional($.keyword_table),
    $._expression,
  ),

  // EXPORT DATABASE 'path' [(format_option [, ...])]
  export_database_statement: $ => seq(
    $.keyword_export,
    $.keyword_database,
    field('path', alias($._literal_string, $.literal)),
    optional(seq(
      '(',
      comma_list(
        seq(
          $.identifier,
          optional(choice(
            $._expression,
            seq('=', $._expression),
          )),
        ),
        true,
      ),
      ')',
    )),
  ),

  // IMPORT DATABASE 'path'
  import_database_statement: $ => seq(
    $.keyword_import,
    $.keyword_database,
    field('path', alias($._literal_string, $.literal)),
  ),

  // COPY {table [(cols)] | (SELECT ...)} FROM|TO 'file' [(options)]
  copy_statement: $ => prec.left(seq(
    $.keyword_copy,
    choice(
      seq(
        $.object_reference,
        optional(seq('(', comma_list($.identifier, true), ')')),
      ),
      seq('(', $._select_statement, ')'),
    ),
    choice($.keyword_from, $.keyword_to),
    alias($._literal_string, $.literal),
    optional(seq(
      '(',
      comma_list(
        seq(
          $.identifier,
          optional(choice(
            $._expression,
            seq('=', $._expression),
          )),
        ),
        true,
      ),
      ')',
    )),
  )),

  // SHOW {TABLES | ALL TABLES | DATABASES | object} (metadata inspection)
  show_statement: $ => seq(
    $.keyword_show,
    choice(
      seq(optional($.keyword_all), $.keyword_tables),
      $.keyword_databases,
      $.object_reference,
    ),
  ),

  // PREPARE name AS statement (PostgreSQL-compatible)
  prepare_statement: $ => seq(
    $.keyword_prepare,
    field('name', $.identifier),
    $.keyword_as,
    choice(
      $._dml_read,
      $._dml_write,
    ),
  ),

  // EXECUTE name [(parameter, ...)]
  execute_statement: $ => seq(
    $.keyword_execute,
    field('name', $.identifier),
    optional(paren_list($._expression, true)),
  ),

  // DEALLOCATE [PREPARE] name
  deallocate_statement: $ => seq(
    $.keyword_deallocate,
    optional($.keyword_prepare),
    field('name', $.identifier),
  ),

};
