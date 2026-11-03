import { comma_list } from "../../grammar/helpers.js";

export default {

  grant_statement: $ => seq(
    $.keyword_grant,
    $._privilege_list,
    $.keyword_on,
    $._securable_object,
    $.keyword_to,
    $._principal_list,
  ),

  revoke_statement: $ => seq(
    $.keyword_revoke,
    optional(seq($.keyword_grant, $.keyword_option, $.keyword_for)),
    $._privilege_list,
    $.keyword_on,
    $._securable_object,
    $.keyword_from,
    $._principal_list,
  ),

  deny_statement: $ => seq(
    $.keyword_deny,
    $._privilege_list,
    $.keyword_on,
    $._securable_object,
    $.keyword_to,
    $._principal_list,
  ),

  _privilege_list: $ => comma_list($._privilege_type, true),

  _privilege_type: $ => choice(
    $.keyword_select,
    $.keyword_insert,
    $.keyword_update,
    $.keyword_delete,
    $.keyword_modify,
    $.keyword_execute,
    seq($.keyword_all, optional($.keyword_privileges)),
    seq($.keyword_create, optional($._privilege_create_sub)),
    seq($.keyword_use, choice($.keyword_catalog, $.keyword_schema)),
    seq($.keyword_read, choice($.keyword_volume, $.keyword_files)),
    seq($.keyword_write, choice($.keyword_volume, $.keyword_files)),
    $.identifier,
  ),

  _privilege_create_sub: $ => choice(
    $.keyword_table,
    $.keyword_schema,
    $.keyword_view,
    $.keyword_function,
    $.keyword_volume,
    seq($.keyword_external, $.keyword_location),
    $.keyword_connection,
    $.keyword_credential,
    $.keyword_share,
  ),

  // The securable-type keyword is optional in Unity Catalog: `ON TABLE t` and
  // the type-inferred `ON t` are both valid. When the type is omitted (or is a
  // type that names an object) an object_reference identifies the securable.
  _securable_object: $ => choice(
    seq(
      choice(
        $.keyword_catalog,
        $.keyword_schema,
        $.keyword_table,
        $.keyword_view,
        $.keyword_function,
        $.keyword_volume,
        seq($.keyword_external, $.keyword_location),
        $.keyword_connection,
        $.keyword_credential,
        $.keyword_share,
        $.keyword_recipient,
        $.keyword_metastore,
      ),
      optional($.object_reference),
    ),
    seq($.keyword_any, $.keyword_file),
    $.object_reference,
  ),

  _principal_list: $ => comma_list($._principal, true),

  // A principal is a bare account identifier / quoted name; the optional
  // USER | GROUP | SERVICE PRINCIPAL prefix is legacy/ANSI-style.
  _principal: $ => seq(
    optional(choice(
      $.keyword_user,
      $.keyword_group,
      seq($.keyword_service, $.keyword_principal),
    )),
    choice($.identifier, $.literal),
  ),

};
