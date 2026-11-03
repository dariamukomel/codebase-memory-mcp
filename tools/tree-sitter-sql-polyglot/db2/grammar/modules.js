import { paren_list } from '../../grammar/helpers.js';

export default {

  // CREATE WRAPPER drda [OPTIONS (...)]
  create_wrapper: $ => seq(
    $.keyword_create,
    $.keyword_wrapper,
    field('name', $.identifier),
    optional($.options_clause),
  ),

  // CREATE SERVER name [TYPE type] [VERSION version] WRAPPER wrp [OPTIONS (...)]
  create_server: $ => seq(
    $.keyword_create,
    $.keyword_server,
    field('name', $.identifier),
    optional(seq($.keyword_type, field('type', $.identifier))),
    optional(seq($.keyword_version, field('version', $._expression))),
    $.keyword_wrapper,
    field('wrapper', $.identifier),
    optional($.options_clause),
  ),

  // CREATE NICKNAME schema.nickname FOR server.schema.table
  create_nickname: $ => seq(
    $.keyword_create,
    $.keyword_nickname,
    field('name', $.object_reference),
    $.keyword_for,
    field('remote', $.object_reference),
    optional($.options_clause),
  ),

  // CREATE [OR REPLACE] MODULE name
  create_module: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_module,
    field('name', $.object_reference),
  ),

  // OPTIONS (key 'value' [, key 'value']); Db2 federation options
  options_clause: $ => seq(
    $.keyword_options,
    paren_list(
      seq(field('key', $.identifier), field('value', $._literal_string)),
      true,
    ),
  ),

};
