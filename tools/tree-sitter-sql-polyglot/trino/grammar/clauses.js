import { comma_list } from '../../grammar/helpers.js';

// Clause completions from the Trino SQL statement reference (77 syntax
// blocks scraped from trino.io/docs). Each override reproduces the
// inherited body; an override replaces the parent rule wholesale.
export default {

  // SET AUTHORIZATION ( user | USER user | ROLE role )
  // Trino spells this the same way on schemas, views and materialized views.
  _set_authorization: $ => seq(
    $.keyword_set,
    $.keyword_authorization,
    choice(
      seq($.keyword_user, field('user', $.identifier)),
      seq($.keyword_role, field('role', choice($.identifier, $.keyword_public))),
      field('user', $.identifier),
    ),
  ),

  // SET PROPERTIES name = expression [, ...]
  _set_properties: $ => seq(
    $.keyword_set,
    $.keyword_properties,
    comma_list($.trino_property, true),
  ),

  trino_property: $ => seq(
    field('name', $.identifier),
    '=',
    field('value', $._expression),
  ),

  alter_schema: $ => seq(
    $.keyword_alter,
    $.keyword_schema,
    $.identifier,
    choice(
      seq(choice($.keyword_rename, $.keyword_owner), $.keyword_to, $.identifier),
      $._set_authorization,
    ),
  ),

  // ALTER VIEW name { RENAME TO | REFRESH | SET AUTHORIZATION ... }
  alter_view: $ => seq(
    $.keyword_alter,
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    choice(
      $.rename_object,
      $.rename_column,
      $.set_schema,
      $.change_ownership,
      seq($.keyword_as, $._dml_read),
      $.keyword_refresh,
      $._set_authorization,
    ),
  ),

  alter_materialized_view: $ => seq(
    $.keyword_alter,
    $.keyword_materialized,
    $.keyword_view,
    optional($._if_exists),
    $.object_reference,
    choice(
      $.rename_object,
      $.set_schema,
      $.change_ownership,
      $._set_authorization,
      $._set_properties,
    ),
  ),

};
