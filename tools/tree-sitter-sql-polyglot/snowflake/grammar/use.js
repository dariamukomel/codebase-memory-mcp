import { comma_list } from '../../grammar/helpers.js';

export default {

  // USE [DATABASE | SCHEMA | WAREHOUSE | ROLE] name
  use_statement: $ => seq(
    $.keyword_use,
    optional(
      choice(
        $.keyword_database,
        $.keyword_schema,
        $.keyword_warehouse,
        $.keyword_role,
      ),
    ),
    $.object_reference,
  ),

  // USE SECONDARY ROLES ALL | NONE
  use_secondary_roles: $ => seq(
    $.keyword_use,
    $.keyword_secondary,
    $.keyword_roles,
    choice(
      $.keyword_all,
      $.keyword_none,
      comma_list($.identifier, true),
    ),
  ),

};
