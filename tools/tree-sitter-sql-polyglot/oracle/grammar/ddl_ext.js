import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // AS OF SCN expr | AS OF TIMESTAMP expr
  flashback_clause: $ => seq(
    $.keyword_as,
    $.keyword_of,
    choice(
      seq($.keyword_scn, $._expression),
      seq($.keyword_timestamp, $._expression),
    ),
  ),

  // CREATE [OR REPLACE] [PUBLIC] SYNONYM name FOR ref [@dblink]
  create_synonym_statement: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    optional($.keyword_public),
    $.keyword_synonym,
    $.object_reference,
    $.keyword_for,
    $.object_reference,
    optional(seq('@', $.identifier)),
  ),

  // DROP [PUBLIC] SYNONYM name [FORCE]
  drop_synonym_statement: $ => seq(
    $.keyword_drop,
    optional($.keyword_public),
    $.keyword_synonym,
    $.object_reference,
  ),

  // CREATE [SHARED] [PUBLIC] DATABASE LINK name
  //   [CONNECT TO user IDENTIFIED BY password]
  //   [USING 'service']
  create_database_link_statement: $ => seq(
    $.keyword_create,
    optional($.keyword_shared),
    optional($.keyword_public),
    $.keyword_database,
    $.keyword_link,
    $.object_reference,
    optional(seq(
      $.keyword_connect,
      $.keyword_to,
      $.identifier,
      $.keyword_identified,
      $.keyword_by,
      $._expression,
    )),
    optional(seq($.keyword_using, alias($._literal_string, $.literal))),
  ),

  // CREATE DATABASE db CHARACTER SET AL32UTF8 [NATIONAL CHARACTER SET …]
  //   [USER SYS IDENTIFIED BY pw] [SET DEFAULT … TABLESPACE]
  // Oracle's CREATE DATABASE takes a character-set/attribute list, not the
  // ANSI base rule's generic `name = value` settings. The clause set is long
  // and order-independent in practice, so it is parsed as a repeat.
  create_database: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_database,
    // Required, unlike Oracle's own optional name: leaving it optional makes
    // `CREATE DATABASE LINK …` ambiguous with this rule at the point where
    // only the LINK keyword distinguishes them.
    field('name', $.identifier),
    repeat($._oracle_database_clause),
  )),

  _oracle_database_clause: $ => choice(
    seq(
      optional($.keyword_national),
      $.keyword_character,
      $.keyword_set,
      field('charset', $.identifier),
    ),
    seq($.keyword_user, field('user', $.identifier),
        $.keyword_identified, $.keyword_by, field('password', $._expression)),
    seq($.keyword_default, optional($.keyword_temporary), $.keyword_tablespace,
        field('tablespace', $.identifier)),
  ),

  // CREATE [OR REPLACE] OPERATOR name
  //   BINDING (type, …) RETURN type USING function [, BINDING …]
  // Oracle's extensible-indexing operator: a named operator bound to one or
  // more functions by argument signature.
  create_operator: $ => prec.left(seq(
    $.keyword_create,
    optional($._or_replace),
    $.keyword_operator,
    optional($._if_not_exists),
    field('name', $.object_reference),
    comma_list($.operator_binding, true),
  )),

  operator_binding: $ => seq(
    $.keyword_binding,
    paren_list($._type, true),
    $.keyword_return,
    field('return_type', $._type),
    $.keyword_using,
    field('implementation', $.object_reference),
  ),

};
