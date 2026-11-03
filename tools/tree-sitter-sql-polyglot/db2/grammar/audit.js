import { comma_list } from '../../grammar/helpers.js';

export default {

  // CREATE AUDIT POLICY name CATEGORIES ALL | {cat [, cat ...]} STATUS {BOTH|FAILURE|SUCCESS}
  create_audit_policy: $ => seq(
    $.keyword_create,
    $.keyword_audit,
    $.keyword_policy,
    field('name', $.object_reference),
    $.keyword_categories,
    choice(
      $.keyword_all,
      // CONNECT is a reserved keyword in this dialect (CONNECT statement), so
      // it can no longer arrive here as a plain identifier.
      comma_list(choice($.identifier, $.keyword_connect), true),
    ),
    $.keyword_status,
    choice($.keyword_both, $.keyword_failure, $.keyword_success),
  ),

  // DROP AUDIT POLICY name
  drop_audit_policy: $ => seq(
    $.keyword_drop,
    $.keyword_audit,
    $.keyword_policy,
    field('name', $.object_reference),
  ),

};
