import { paren_list } from '../../grammar/helpers.js';

export default {

  // CREATE MASK name ON table FOR COLUMN col RETURN expr [ENABLE|DISABLE]
  create_mask: $ => seq(
    $.keyword_create,
    $.keyword_mask,
    field('name', $.object_reference),
    $.keyword_on,
    field('table', $.object_reference),
    $.keyword_for,
    $.keyword_column,
    field('column', $.identifier),
    $.keyword_return,
    field('expression', $._expression),
    optional(choice($.keyword_enable, $.keyword_disable)),
  ),

  // CREATE PERMISSION name ON table FOR ROWS WHERE expr ENFORCED FOR ALL ACCESS [ENABLE|DISABLE]
  create_permission: $ => seq(
    $.keyword_create,
    $.keyword_permission,
    field('name', $.object_reference),
    $.keyword_on,
    field('table', $.object_reference),
    $.keyword_for,
    $.keyword_rows,
    $.keyword_where,
    field('condition', $._expression),
    optional(seq($.keyword_enforced, $.keyword_for, $.keyword_all, $.keyword_access)),
    optional(choice($.keyword_enable, $.keyword_disable)),
  ),

  // TRANSFER OWNERSHIP OF TABLE|VIEW t TO USER|GROUP|ROLE name PRESERVE PRIVILEGES
};
