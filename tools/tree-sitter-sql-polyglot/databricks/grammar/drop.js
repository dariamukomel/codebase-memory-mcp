export default {

  // DROP CATALOG [IF EXISTS] name [CASCADE | RESTRICT]
  drop_catalog: $ => seq(
    $.keyword_drop,
    $.keyword_catalog,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

  // DROP NAMESPACE [IF EXISTS] name [CASCADE | RESTRICT]
  drop_namespace: $ => seq(
    $.keyword_drop,
    $.keyword_namespace,
    optional($._if_exists),
    $.object_reference,
    optional($._drop_behavior),
  ),

  // DROP CONNECTION [IF EXISTS] name
  drop_connection: $ => seq(
    $.keyword_drop,
    $.keyword_connection,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP CREDENTIAL [IF EXISTS] name
  drop_credential: $ => seq(
    $.keyword_drop,
    $.keyword_credential,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP EXTERNAL LOCATION [IF EXISTS] name
  drop_external_location: $ => seq(
    $.keyword_drop,
    $.keyword_external,
    $.keyword_location,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP VOLUME [IF EXISTS] name
  drop_volume: $ => seq(
    $.keyword_drop,
    $.keyword_volume,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP SHARE [IF EXISTS] name
  drop_share: $ => seq(
    $.keyword_drop,
    $.keyword_share,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP RECIPIENT [IF EXISTS] name
  drop_recipient: $ => seq(
    $.keyword_drop,
    $.keyword_recipient,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP PROVIDER [IF EXISTS] name
  drop_provider: $ => seq(
    $.keyword_drop,
    $.keyword_provider,
    optional($._if_exists),
    $.object_reference,
  ),

  // DROP POLICY [IF EXISTS] name
  drop_policy: $ => seq(
    $.keyword_drop,
    $.keyword_policy,
    optional($._if_exists),
    $.object_reference,
  ),

};
