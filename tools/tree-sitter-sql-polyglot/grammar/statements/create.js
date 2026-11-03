import { comma_list, paren_list, wrapped_in_parenthesis } from "../helpers.js";
import create_function_rules from "./create-function.js";
import create_procedure_rules from "./create-procedure.js";

// ISO 9075 CREATE statements (section 11). Vendor CREATE syntax (IF NOT EXISTS, OR REPLACE, TEMP,
// UNLOGGED, CREATE DATABASE / INDEX / MATERIALIZED VIEW, PostgreSQL role, sequence, trigger and type
// options, ...) lives in each dialect's own grammar/legacy_statements.js.
export function createStatementChoices($) {
  return [
    $.create_table,
    $.create_view,
    $.create_function,
    $.create_procedure,
    $.create_type,
    $.create_role,
    $.create_sequence,
    $.create_trigger,
    prec.left(seq(
      $.create_schema,
      repeat($._create_statement),
    )),
  ];
}

export default {

  _create_statement: $ => seq(
    choice(...createStatementChoices($)),
  ),

  // <table definition> ::= CREATE [ <global or local> TEMPORARY ] TABLE <table name> <table contents source>
  // where the source is an element list or an <as subquery clause> ( [ (cols) ] AS query { WITH [NO] DATA } )
  create_table: $ => prec.left(
    seq(
      $.keyword_create,
      optional(seq(choice($.keyword_global, $.keyword_local), $.keyword_temporary)),
      $.keyword_table,
      field('target', $.object_reference),
      choice(
        $.column_definitions,
        seq(
          optional(paren_list($.identifier, true)),
          $.keyword_as,
          field('query', $.create_query),
          optional(seq($.keyword_with, optional($.keyword_no), $.keyword_data)),
        ),
      ),
    ),
  ),

  create_query: $ => $._dml_read,

  // <view definition> ::= CREATE [ RECURSIVE ] VIEW <name> [ (cols) ] AS <query> [ WITH [ CASCADED | LOCAL ] CHECK OPTION ]
  create_view: $ => prec.right(
    seq(
      $.keyword_create,
      optional($.keyword_recursive),
      $.keyword_view,
      field('target', $.object_reference),
      optional(paren_list($.identifier, true)),
      $.keyword_as,
      field('query', $.create_query),
      optional(
        seq(
          $.keyword_with,
          optional(choice($.keyword_local, $.keyword_cascaded)),
          $._check_option,
        ),
      ),
    ),
  ),

  ...create_function_rules,
  ...create_procedure_rules,

  // <schema definition>: CREATE SCHEMA { name | AUTHORIZATION owner | name AUTHORIZATION owner } [ elements ]
  create_schema: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_schema,
    choice(
      seq(
        $.identifier,
        optional(seq($.keyword_authorization, $.identifier)),
      ),
      seq(
        $.keyword_authorization,
        $.identifier,
      ),
    ),
  )),

  // <role definition> ::= CREATE ROLE <role name> [ WITH ADMIN <grantor> ]
  create_role: $ => seq(
    $.keyword_create,
    $.keyword_role,
    $.identifier,
    optional(seq($.keyword_with, $.keyword_admin, choice($.keyword_current_user, $.keyword_current_role))),
  ),

  // <sequence generator definition> ::= CREATE SEQUENCE <name> [ <sequence generator option> ... ]
  create_sequence: $ => seq(
    $.keyword_create,
    $.keyword_sequence,
    $.object_reference,
    repeat(
      choice(
        seq($.keyword_as, $._type),
        seq($.keyword_start, $.keyword_with, field('start', alias($._integer, $.literal))),
        seq($.keyword_increment, $.keyword_by, field('increment', alias($._integer, $.literal))),
        seq($.keyword_minvalue, $.literal),
        seq($.keyword_no, $.keyword_minvalue),
        seq($.keyword_maxvalue, $.literal),
        seq($.keyword_no, $.keyword_maxvalue),
        seq(optional($.keyword_no), $.keyword_cycle),
      )
    ),
  ),

  // <trigger definition> ::= CREATE TRIGGER <name> { BEFORE | AFTER | INSTEAD OF } <event> ON <table>
  //   [ REFERENCING ... ] [ FOR EACH { ROW | STATEMENT } ] [ WHEN ( <condition> ) ] <triggered SQL statement>
  create_trigger: $ => seq(
    $.keyword_create,
    $.keyword_trigger,
    $.object_reference,
    choice(
      $.keyword_before,
      $.keyword_after,
      seq($.keyword_instead, $.keyword_of),
    ),
    $._create_trigger_event,
    $.keyword_on,
    $.object_reference,
    optional(seq($.keyword_referencing, repeat1($._transition_alias))),
    optional(seq($.keyword_for, $.keyword_each, choice($.keyword_row, $.keyword_statement))),
    optional(seq($.keyword_when, wrapped_in_parenthesis($._expression))),
    $._triggered_statement,
  ),

  _create_trigger_event: $ => choice(
    $.keyword_insert,
    $.keyword_delete,
    seq(
      $.keyword_update,
      optional(seq($.keyword_of, comma_list($.identifier, true))),
    ),
  ),

  // OLD | NEW [ ROW | TABLE ] [ AS ] <name>
  _transition_alias: $ => seq(
    choice($.keyword_old, $.keyword_new),
    optional(choice($.keyword_row, $.keyword_table)),
    optional($.keyword_as),
    $.identifier,
  ),

  // <SQL procedure statement> | BEGIN ATOMIC { <SQL procedure statement> ; } ... END
  _triggered_statement: $ => choice(
    $.statement,
    seq(
      $.keyword_begin,
      $.keyword_atomic,
      repeat1(seq($.statement, ';')),
      $.keyword_end,
    ),
  ),

  // <user-defined type definition>: CREATE TYPE <name> [ AS { ( attributes ) | <predefined type> } ]
  create_type: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_type,
    $.object_reference,
    optional(seq($.keyword_as, choice($.column_definitions, $._type))),
  )),

};
