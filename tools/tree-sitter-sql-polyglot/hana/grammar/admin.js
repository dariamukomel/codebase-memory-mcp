import { comma_list, paren_list } from '../../grammar/helpers.js';

// SAP HANA statements that had no rule at all. The inventory comes from the
// "Alphabetical List of Statements" section of the HANA Cloud SQL Reference
// Guide (220 statements), read through help.sap.com's deliverableMetadata →
// pagecontent API.
export default {

  // LOCK TABLE t IN { EXCLUSIVE | SHARE } MODE [NOWAIT]
  lock_table_statement: $ => prec.right(seq(
    $.keyword_lock,
    $.keyword_table,
    field('table', $.object_reference),
    optional(seq($.keyword_partition, field('partition', $.literal))),
    $.keyword_in,
    field('mode', choice($.keyword_exclusive, $.keyword_share)),
    $.keyword_mode,
    optional($.keyword_nowait),
  )),

  // MERGE DELTA OF t [PART n] [WITH PARAMETERS (…)]
  merge_delta_statement: $ => prec.right(seq(
    $.keyword_merge,
    $.keyword_delta,
    $.keyword_of,
    field('table', $.object_reference),
    optional(seq($.keyword_part, field('part', $.literal))),
    optional(seq($.keyword_with, $.keyword_parameters, paren_list($._expression, true))),
    optional(seq($.keyword_force, $.keyword_rebuild)),
  )),

  // LOAD t [ALL | (col, …)]   |   UNLOAD t
  load_unload_statement: $ => prec.right(seq(
    choice($.keyword_load, $.keyword_unload),
    field('table', $.object_reference),
    optional(choice($.keyword_all, paren_list($.identifier, true))),
  )),

  // REFRESH { VIEW v | STATISTICS … | PSE p }
  refresh_object_statement: $ => prec.right(seq(
    $.keyword_refresh,
    choice(
      seq(
        $.keyword_view,
        field('name', $.object_reference),
        optional($.keyword_anonymization),
      ),
      seq($.keyword_pse, field('name', $.object_reference)),
      seq(
        $.keyword_statistics,
        optional(seq($.keyword_on, field('name', $.object_reference))),
      ),
    ),
  )),

  // RENAME { COLUMN | INDEX | SCHEMA | VECTOR INDEX } old TO new
  // TABLE is absent: base's _rename_statement already covers RENAME TABLE.
  rename_object_statement: $ => seq(
    $.keyword_rename,
    choice(
      $.keyword_column,
      $.keyword_index,
      $.keyword_schema,
      seq($.keyword_vector, $.keyword_index),
    ),
    field('name', $.object_reference),
    $.keyword_to,
    field('new_name', $.object_reference),
  ),

  // SET SCHEMA s
  set_schema_statement: $ => seq(
    $.keyword_set,
    $.keyword_schema,
    field('name', $.object_reference),
  ),

  // ALTER SYSTEM <action>
  // The reference lists roughly forty ALTER SYSTEM forms (CLEAR CACHE, RECLAIM
  // DATAVOLUME, START/STOP PERFTRACE, DISCONNECT SESSION, …). They are
  // accepted as a word/option tail rather than enumerated: modelling each one
  // would add a large amount of grammar for statements that share no shape.
  alter_system_statement: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_system,
    repeat1(choice(
      $.keyword_all,
      $.keyword_set,
      $.keyword_session,
      $.keyword_cache,
      $.keyword_savepoint,
      $.system_option,
      $.literal,
      paren_list($._expression, true),
    )),
  )),

  // A bare word, or `name = scalar`. The value is a literal or identifier
  // rather than a full expression: with _expression here, `a = b = c` could
  // either nest as a binary_expression or continue the enclosing repeat,
  // which is an unresolvable conflict between the two rules.
  system_option: $ => seq(
    field('name', $.identifier),
    optional(seq('=', field('value', choice($.literal, $.identifier)))),
  ),

  // CREATE | DROP <object-kind> name [options]
  // One rule for the object kinds HANA adds that have a plain
  // `<kind> name [word …]` shape.
  hana_object_statement: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_drop, $.keyword_alter),
    optional($._or_replace),
    $._hana_object_kind,
    optional($._if_exists),
    field('name', $.object_reference),
    repeat(choice(
      seq($.keyword_for, field('target', $.object_reference)),
      $.system_option,
      $.literal,
      paren_list($._expression, true),
      seq($.keyword_set, $.system_option),
    )),
  )),

  // TABLE GROUP is deliberately absent: after `ALTER TABLE`, GROUP is an
  // extracted keyword and therefore indistinguishable from a table name, so
  // it would collide with base's alter_table.
  _hana_object_kind: $ => choice(
    seq($.keyword_audit, $.keyword_policy),
    $.keyword_credential,
    $.keyword_pse,
    $.keyword_certificate,
    seq($.keyword_schema, $.keyword_synonym),
    $.keyword_synonym,
    $.keyword_statistics,
    seq($.keyword_workload, $.keyword_class),
    seq($.keyword_workload, $.keyword_mapping),
    $.keyword_usergroup,
    $.keyword_rolegroup,
    seq($.keyword_jwt, $.keyword_provider),
    seq($.keyword_ldap, $.keyword_provider),
    seq($.keyword_saml, $.keyword_provider),
    seq($.keyword_x509, $.keyword_provider),
    seq($.keyword_remote, $.keyword_source),
    seq($.keyword_scheduler, $.keyword_job),
  ),

  // VALIDATE { USER u | LDAP PROVIDER p }
  validate_statement: $ => seq(
    $.keyword_validate,
    choice(
      seq(
        $.keyword_user,
        choice(
          seq(
            field('name', $.object_reference),
            optional(seq($.keyword_password, field('password', $._expression))),
          ),
          seq($.keyword_with, $.keyword_assertion, field('assertion', $._expression)),
        ),
      ),
      seq($.keyword_ldap, $.keyword_provider, field('name', $.object_reference)),
    ),
  ),

  // ANNOTATE <kind> name SET|UNSET (…)
  annotate_statement: $ => prec.right(seq(
    $.keyword_annotate,
    field('kind', $.identifier),
    field('name', $.object_reference),
    repeat1(choice(
      seq($.keyword_set, paren_list($._expression, true)),
      seq($.keyword_unset, paren_list($._expression, true)),
      field('option', $.identifier),
    )),
  )),

  // CANCEL ASYNC CALL id
  cancel_async_call_statement: $ => seq(
    $.keyword_cancel,
    $.keyword_async,
    $.keyword_call,
    field('id', $._expression),
  ),

  // CALL proc(args) [WITH OVERVIEW] [ASYNC]
  call_statement: $ => prec.right(seq(
    $.keyword_call,
    field('procedure', $.object_reference),
    optional(paren_list($._expression)),
    repeat(field('option', $.identifier)),
  )),

  // CONNECT user PASSWORD pw
  connect_statement: $ => prec.right(seq(
    $.keyword_connect,
    field('user', $.object_reference),
    optional(seq($.keyword_password, field('password', $._expression))),
  )),
  // EXPORT <objects> [WHERE c | HAVING c] AS <format> INTO <path>
  //   [WITH <options>] [[ON <locations>] FOR <procedure_call>]
  // EXPORT INTO [<format> FILE] <path> FROM {<source> | (<select>)}
  // EXPORT INTO RDF FILE <path> FROM SPARQL_GRAPH {DEFAULT | '<graph>'}
  export_statement: $ => prec.right(seq(
    $.keyword_export,
    choice(
      seq(
        $.keyword_into,
        optional(seq(field('format', $._hana_io_file_type), $.keyword_file)),
        field('path', $.literal),
        $.keyword_from,
        choice(
          seq(
            $.keyword_sparql_graph,
            choice($.keyword_default, field('graph', $.literal)),
          ),
          field('source', $.object_reference),
          $._select_statement,
        ),
      ),
      seq(
        $._hana_io_objects,
        optional(choice($.where, seq($.keyword_having, field('condition', $._expression)))),
        $.keyword_as,
        $._hana_io_format,
        $.keyword_into,
        field('path', $.literal),
      ),
    ),
    repeat($._hana_io_tail),
  )),

  // IMPORT <objects> [HAVING c] [AS <format>] FROM <path> [WITH <options>]
  //   [AT [LOCATION] <host:port>] [WITH IGNORE NUMA NODE]
  // IMPORT FROM [<file_type> FILE] [IN <directory_type>] <path>
  //   [INTO {<target> | SPARQL_GRAPH {DEFAULT | <graph>}}] [WITH <options>]
  // IMPORT SCAN <path> <output> [WITH <options>]
  import_statement: $ => prec.right(seq(
    $.keyword_import,
    choice(
      // The documented <output> element does not appear in any vendor
      // example, so it is optional here.
      seq(
        $.keyword_scan,
        field('path', $.literal),
        optional(field('output', $._expression)),
      ),
      seq(
        $.keyword_from,
        optional(seq(field('file_type', $._hana_io_file_type), $.keyword_file)),
        // HIVE PARTITION | DELTA LAKE; always two words, neither reserved.
        optional(seq(
          $.keyword_in,
          field('directory_type', $.identifier),
          field('directory_subtype', $.identifier),
        )),
        field('path', $.literal),
        optional(seq(
          $.keyword_into,
          choice(
            seq(
              $.keyword_sparql_graph,
              choice($.keyword_default, field('graph', $._expression)),
            ),
            field('target', $.object_reference),
          ),
        )),
      ),
      seq(
        $._hana_io_objects,
        optional(seq($.keyword_having, field('condition', $._expression))),
        optional(seq($.keyword_as, $._hana_io_format)),
        $.keyword_from,
        field('path', $.literal),
      ),
    ),
    repeat($._hana_io_tail),
  )),

  // <object_list> | ALL | *
  _hana_io_objects: $ => choice(
    $.keyword_all,
    '*',
    comma_list($.object_reference, true),
  ),

  // CSV | PARQUET | JSON | CONTROL | RDF; always followed by FILE, which is
  // reserved here, so the leading word can stay an ordinary identifier.
  _hana_io_file_type: $ => choice($.identifier, $.keyword_rdf),

  // CSV | PARQUET | BINARY [DATA | RAW]
  _hana_io_format: $ => seq(
    field('format', $.identifier),
    optional(field('binary_type', $.identifier)),
  ),

  // The trailing clauses are order independent in practice and the option
  // lists are long, open ended and version specific, so options are accepted
  // as runs of words, scalars and parenthesised lists.
  _hana_io_tail: $ => choice(
    seq($.keyword_with, comma_list($._hana_io_option, true)),
    seq($.keyword_at, optional($.keyword_location), field('location', $._expression)),
    seq($.keyword_on, comma_list($._expression, true)),
    seq($.keyword_for, $.call_statement),
  ),

  _hana_io_option: $ => repeat1(choice(
    $.identifier,
    $.literal,
    paren_list($._expression, true),
  )),

  // UNSET [SESSION] <key>          UNSET ROLEGROUP | USERGROUP
  // UNSET TRANSACTION <timeout>    UNSET PSE <name> PURPOSE <purpose>
  // UNSET SESSION CREDENTIAL FOR REMOTE SOURCE ref { TYPE 'OAUTH' | ALL }
  unset_statement: $ => prec.right(seq(
    $.keyword_unset,
    choice(
      seq(
        $.keyword_session,
        $.keyword_credential,
        $.keyword_for,
        $.keyword_remote,
        $.keyword_source,
        field('name', $.object_reference),
        choice(
          seq($.keyword_type, field('type', $.literal)),
          $.keyword_all,
        ),
      ),
      // PURPOSE is one word, or two for REMOTE SOURCE / TOKEN EXCHANGE.
      seq(
        $.keyword_pse,
        field('name', $.object_reference),
        $.keyword_purpose,
        field('purpose', $.identifier),
        optional(field('purpose_detail', $.identifier)),
      ),
      // TRANSACTION [HESITANT] LOCK WAIT TIMEOUT <n>
      seq(
        $.keyword_transaction,
        optional(field('mode', $.identifier)),
        $.keyword_lock,
        field('option', $.identifier),
        field('setting', $.identifier),
        field('value', $.literal),
      ),
      $.keyword_rolegroup,
      $.keyword_usergroup,
      // <key> is a string literal, which keeps this apart from the
      // SESSION CREDENTIAL form above.
      seq(optional($.keyword_session), field('key', $.literal)),
    ),
  )),

  // DO [(<named_parameters>)] [(<bound_parameters>)] BEGIN … END
  // Both lists are parenthesised, so they are accepted as a repetition
  // rather than two adjacent optionals, which would not be decidable.
  do_statement: $ => prec.right(seq(
    $.keyword_do,
    repeat(paren_list($._hana_do_parameter, false)),
    $.compound_statement,
  )),

  // <mode>, <name>, <type>   or   <parameter> => <value>
  _hana_do_parameter: $ => choice(
    seq(field('name', $.identifier), '=>', field('value', $._expression)),
    $._expression,
  ),

  // ── Statements added from the clause-level pass over the SQL Reference ───

  // ALTER INDEX i {REBUILD | UNIQUE <type> | <load_unit> [ONLINE [PREFERRED]]}
  alter_index: $ => prec.right(seq(
    $.keyword_alter,
    $.keyword_index,
    field('name', $.object_reference),
    choice(
      $.keyword_rebuild,
      seq($.keyword_unique, optional(field('index_type', $.identifier))),
      seq(
        $._hana_load_unit,
        optional(seq($.keyword_online, optional($.keyword_preferred))),
      ),
    ),
  )),

  _hana_load_unit: $ => seq(
    choice($.keyword_column, $.keyword_page, $.keyword_default),
    $.keyword_loadable,
  ),

  // ALTER ROLE r {SET|UNSET ROLEGROUP g | {ADD|DROP} LDAP GROUP g, …}
  alter_role: $ => seq(
    $.keyword_alter,
    $.keyword_role,
    field('name', $.object_reference),
    choice(
      seq($.keyword_set, $.keyword_rolegroup, field('rolegroup', $.identifier)),
      seq($.keyword_unset, $.keyword_rolegroup),
      seq(
        choice($.keyword_add, $.keyword_drop),
        $.keyword_ldap,
        $.keyword_group,
        comma_list($.identifier, true),
      ),
    ),
  ),

  // {CREATE | ALTER | DROP} TABLE GROUP g …
  table_group_statement: $ => prec.right(seq(
    choice($.keyword_create, $.keyword_alter, $.keyword_drop),
    $.keyword_table,
    $.keyword_group,
    field('name', $.object_reference),
    repeat(choice(
      seq(choice($.keyword_set, $.keyword_unset), $.system_option),
      seq(
        choice($.keyword_add, $.keyword_remove),
        comma_list($.object_reference, true),
      ),
      $.keyword_force,
      $.system_option,
    )),
  )),

};
