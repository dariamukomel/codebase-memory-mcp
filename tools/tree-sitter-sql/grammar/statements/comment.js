export default {

  comment_statement: $ => seq(
    $.keyword_comment,
    $.keyword_on,
    $._comment_target,
    $.keyword_is,
    choice(
      $.keyword_null,
      alias($._literal_string, $.literal),
    ),
  ),

  _comment_target: $ => choice(
    // TODO: access method
    // TODO: aggregate
    $.cast,
    // TODO: collation
    seq($.keyword_column, field('column', alias($._qualified_field, $.object_reference))),
    // TODO: constraint (on domain)
    // TODO: conversion
    seq($.keyword_database, $.identifier),
    // TODO: domain
    seq($.keyword_extension, field('extension', $.object_reference)),
    // TODO: event trigger
    // TODO: foreign data wrapper
    // TODO: foreign table
    seq($.keyword_function, field('function', $.object_reference), optional($.function_arguments)),
    seq($.keyword_index, field('index', $.object_reference)),
    // TODO: large object
    seq($.keyword_materialized, $.keyword_view, field('table', $.object_reference)),
    // TODO: operator (|class|family)
    // TODO: policy
    // TODO: (procedural) language
    seq($.keyword_procedure, field('procedure', $.object_reference), optional($.function_arguments)),
    // TODO: publication
    seq($.keyword_role, $.identifier),
    // TODO: routine
    // TODO: rule
    seq($.keyword_schema, $.identifier),
    seq($.keyword_sequence, field('sequence', $.object_reference)),
    // TODO: server
    // TODO: statistics
    // TODO: subscription
    seq($.keyword_table, field('table', $.object_reference)),
    seq($.keyword_tablespace, $.identifier),
    // TODO: text search (configuration|dictionary|parser|template)
    // TODO: transform for
    seq($.keyword_trigger, $.identifier, $.keyword_on, field('table', $.object_reference)),
    seq($.keyword_type, $.identifier),
    seq($.keyword_view, field('table', $.object_reference)),
  ),

};
