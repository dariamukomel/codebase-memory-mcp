import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // PostgreSQL ALTER TABLE ... ALTER COLUMN with SET STATISTICS / SET STORAGE / SET COMPRESSION
  // base _alter_specifications plus the storage-parameter actions:
  //   ALTER TABLE t SET (fillfactor = 70) | RESET (fillfactor)
  _alter_specifications: $ => choice(
    $.add_column,
    $.add_constraint,
    $.drop_constraint,
    $.alter_column,
    $.modify_column,
    $.change_column,
    $.drop_column,
    $.rename_object,
    $.rename_column,
    $.set_schema,
    $.change_ownership,
    seq($.keyword_set, $.storage_parameters),
    seq($.keyword_reset, paren_list($.identifier, true)),
    seq($.keyword_set, $.keyword_tablespace, field('tablespace', $.identifier)),
  ),

  storage_parameters: $ => paren_list($.storage_parameter, true),

  storage_parameter: $ => seq(
    field('name', $.identifier),
    optional(seq('=', field('value', choice($.literal, $.identifier)))),
  ),

  alter_column: $ => seq(
    $.keyword_alter,
    optional($.keyword_column),
    field('name', $.identifier),
    choice(
      seq(
        choice($.keyword_set, $.keyword_drop),
        $.keyword_not,
        $.keyword_null,
      ),
      seq(
        optional(seq($.keyword_set, $.keyword_data)),
        $.keyword_type,
        field('type', $._type),
      ),
      seq(
        $.keyword_set,
        choice(
          seq($.keyword_statistics, field('statistics', $._integer)),
          seq(
            $.keyword_storage,
            choice(
              $.keyword_plain,
              $.keyword_external,
              $.keyword_extended,
              $.keyword_main,
              $.keyword_default,
            ),
          ),
          seq($.keyword_compression, field('compression_method', $._identifier)),
          seq(paren_list($._key_value_pair, true)),
          seq($.keyword_default, $._expression),
        ),
      ),
      seq($.keyword_drop, $.keyword_default),
    ),
  ),

  // PostgreSQL ALTER INDEX ... ALTER COLUMN n SET STATISTICS n
  alter_index: $ => seq(
    $.keyword_alter,
    $.keyword_index,
    choice(
      seq(
        optional($._if_exists),
        $.identifier,
        choice(
          $.rename_object,
          seq(
            $.keyword_alter,
            optional($.keyword_column),
            alias($._natural_number, $.literal),
            $.keyword_set,
            $.keyword_statistics,
            alias($._natural_number, $.literal),
          ),
          seq($.keyword_reset, paren_list($.identifier)),
          seq(
            $.keyword_set,
            choice(
              seq($.keyword_tablespace, $.identifier),
              paren_list(seq($.identifier, '=', field('value', $.literal))),
            ),
          ),
          // ATTACH PARTITION index
          seq(
            $.keyword_attach,
            $.keyword_partition,
            field('index', $.object_reference),
          ),
          // [NO] DEPENDS ON EXTENSION extension
          $._depends_on_extension,
        ),
      ),
      // ALL IN TABLESPACE name [OWNED BY role,...]
      //   SET TABLESPACE new [NOWAIT]
      $._all_in_tablespace,
    ),
  ),

  _depends_on_extension: $ => seq(
    optional($.keyword_no),
    $.keyword_depends,
    $.keyword_on,
    $.keyword_extension,
    field('extension', $.identifier),
  ),

  _all_in_tablespace: $ => seq(
    $.keyword_all,
    $.keyword_in,
    $.keyword_tablespace,
    field('tablespace', $.identifier),
    optional(seq($.keyword_owned, $.keyword_by, comma_list($.identifier, true))),
    $.keyword_set,
    $.keyword_tablespace,
    field('new_tablespace', $.identifier),
    optional($.keyword_nowait),
  ),

  // ALTER MATERIALIZED VIEW [IF EXISTS] name <action> [,...]
  // ALTER MATERIALIZED VIEW ALL IN TABLESPACE ...
  alter_materialized_view: $ => seq(
    $.keyword_alter,
    $.keyword_materialized,
    $.keyword_view,
    choice(
      seq(
        optional($._if_exists),
        $.object_reference,
        choice(
          $.rename_object,
          $.rename_column,
          $.set_schema,
          $._depends_on_extension,
          comma_list($._materialized_view_action, true),
        ),
      ),
      $._all_in_tablespace,
    ),
  ),

  _materialized_view_action: $ => choice(
    $.change_ownership,
    seq(
      $.keyword_alter,
      optional($.keyword_column),
      field('column', $.identifier),
      choice(
        seq($.keyword_set, $.keyword_statistics, alias($._natural_number, $.literal)),
        seq($.keyword_set, paren_list(seq($.identifier, '=', field('value', $._expression)), true)),
        seq($.keyword_reset, paren_list($.identifier, true)),
        seq($.keyword_set, $.keyword_storage, field('storage', $.identifier)),
        seq($.keyword_set, $.keyword_compression, field('compression', $.identifier)),
      ),
    ),
    seq($.keyword_cluster, $.keyword_on, field('index', $.identifier)),
    seq($.keyword_set, $.keyword_without, $.keyword_cluster),
    seq($.keyword_set, $.keyword_access, $.keyword_method, field('method', $.identifier)),
    seq($.keyword_set, $.keyword_tablespace, field('tablespace', $.identifier)),
    seq($.keyword_set, paren_list(seq($.identifier, optional(seq('=', field('value', $._expression)))), true)),
    seq($.keyword_reset, paren_list($.identifier, true)),
  ),

  // Postgres row level security
  alter_policy: $ => prec.right(
    seq(
      $.keyword_alter,
      $.keyword_policy,
      $.object_reference,
      $.keyword_on,
      $.object_reference,
      choice(
        $.rename_object,
        seq(
          optional(
            seq(
              $.keyword_to,
              choice(
                $.object_reference,
                $.keyword_public,
                $.keyword_current_role,
                $.keyword_current_user,
                $.keyword_session_user,
              ),
              repeat(
                seq(
                  ',',
                  choice(
                    $.object_reference,
                    $.keyword_public,
                    $.keyword_current_role,
                    $.keyword_current_user,
                    $.keyword_session_user,
                  ),
                ),
              ),
            ),
          ),
          optional(
            seq(
              $.keyword_using,
              $.parenthesized_expression,
            ),
          ),
          optional(
            seq(
              $.keyword_with,
              $.keyword_check,
              $.parenthesized_expression,
            ),
          ),
        ),
      ),
    ),
  ),

};
