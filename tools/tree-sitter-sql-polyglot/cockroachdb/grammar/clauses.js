import { comma_list } from '../../grammar/helpers.js';

// Clause completions from CockroachDB's generated EBNF
// (docs/generated/sql/bnf in the cockroachdb/cockroach repository, 327
// statement files; the published docs render these as SVG diagrams, but
// the generated .bnf sources are machine readable).
export default {

  // CONFIGURE ZONE {USING var = {value | COPY FROM PARENT} [,...] | DISCARD}
  // Already present on ALTER TABLE; databases and indexes take it too.
  _configure_zone: $ => seq(
    $.keyword_configure,
    $.keyword_zone,
    choice(
      seq($.keyword_using, comma_list($._zone_option, true)),
      $.keyword_discard,
    ),
  ),

  _zone_option: $ => seq(
    field('name', $.identifier),
    '=',
    choice(
      seq($.keyword_copy, $.keyword_from, $.keyword_parent),
      field('value', $._expression),
    ),
  ),

  // SURVIVE {REGION | ZONE | AVAILABILITY ZONE} FAILURE
  _survive_clause: $ => seq(
    $.keyword_survive,
    choice(
      $.keyword_region,
      seq(optional($.keyword_availability), $.keyword_zone),
    ),
    $.keyword_failure,
  ),

  // ALTER DATABASE name <action>
  alter_database: $ => seq(
    $.keyword_alter,
    $.keyword_database,
    $.identifier,
    choice(
      $.rename_object,
      $.change_ownership,
      $._configure_zone,
      $._survive_clause,
      seq(
        choice($.keyword_add, $.keyword_drop),
        $.keyword_region,
        optional($._if_not_exists),
        optional($._if_exists),
        field('region', $.identifier),
      ),
      seq(
        $.keyword_set,
        $.keyword_primary,
        $.keyword_region,
        field('region', $.identifier),
      ),
      seq(
        $.keyword_placement,
        choice($.keyword_restricted, $.keyword_default),
      ),
      seq($.keyword_convert, $.keyword_to, $.keyword_schema, $.keyword_with,
          $.keyword_parent, field('parent', $.identifier)),
      seq($.keyword_set, $.set_configuration),
      seq($.keyword_reset, choice($.keyword_all, field('parameter', $.identifier))),
    ),
  ),

  // ALTER INDEX name <action>
  alter_index: $ => seq(
    $.keyword_alter,
    $.keyword_index,
    optional($._if_exists),
    $.identifier,
    choice(
      $.rename_object,
      $._configure_zone,
      $.split_at,
      $.unsplit_at,
      seq($.keyword_reset, $.keyword_zone, $.keyword_configuration),
    ),
  ),

  // CREATE DATABASE [IF NOT EXISTS] name
  //   [ENCODING v] [CONNECTION LIMIT n]
  //   [PRIMARY REGION r] [REGIONS r,...] [SURVIVE ... FAILURE]
  create_database: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_database,
    optional($._if_not_exists),
    $.identifier,
    optional($.keyword_with),
    repeat(choice(
      $._with_settings,
      // Region names are written either bare/quoted as identifiers or as
      // string literals ('us-east1'); both spellings are accepted.
      seq($.keyword_primary, $.keyword_region,
          field('region', choice($.identifier, alias($._literal_string, $.literal)))),
      seq($.keyword_regions,
          comma_list(field('region', choice($.identifier, alias($._literal_string, $.literal))), true)),
      $._survive_clause,
      seq($.keyword_connection, $.keyword_limit, field('limit', $._expression)),
    )),
  )),

};
