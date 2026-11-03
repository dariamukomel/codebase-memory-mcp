import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // WITH (key = value, ...); Trino table/schema properties
  with_properties: $ => seq(
    $.keyword_with,
    '(',
    comma_list(
      seq(
        field('key', $.identifier),
        '=',
        field('value', $._expression),
      ),
      true,
    ),
    ')',
  ),

  // EXPLAIN [(TYPE type [, FORMAT format])] statement
  explain_options: $ => seq(
    '(',
    comma_list(
      choice(
        seq(
          $.keyword_type,
          choice(
            $.keyword_logical,
            $.keyword_distributed,
            $.keyword_validate,
            $.keyword_io,
          ),
        ),
        seq(
          $.keyword_format,
          choice(
            $.keyword_text,
            $.keyword_json,
            $.keyword_graphviz,
          ),
        ),
      ),
      true,
    ),
    ')',
  ),

  // Override create_table to add WITH properties
  create_table: $ => prec.left(
    seq(
      $.keyword_create,
      optional($._temporary),
      $.keyword_table,
      optional($._if_not_exists),
      field("target", $.object_reference),
      seq(
        optional($.column_definitions),
        optional($.with_properties),
        optional(seq($.keyword_as, $.create_query)),
      ),
    ),
  ),

  // Override create_schema to add WITH properties
  create_schema: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_schema,
    optional($._if_not_exists),
    $.object_reference,
    optional(seq($.keyword_authorization, $.identifier)),
    optional($.with_properties),
  )),

};
