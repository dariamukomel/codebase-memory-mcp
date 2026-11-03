import { paren_list, wrapped_in_parenthesis } from "../../grammar/helpers.js";

export default {

  create_trigger: $ => seq(
    $.keyword_create,
    optional($._or_replace),
    // MariaDB DEFINER
    optional(seq($.keyword_definer, '=', $.identifier)),
    optional($.keyword_constraint),
    optional($._temporary),
    $.keyword_trigger,
    optional($._if_not_exists),
    $.object_reference,
    choice(
      $.keyword_before,
      $.keyword_after,
      seq($.keyword_instead, $.keyword_of),
    ),
    $._create_trigger_event,
    repeat(seq($.keyword_or, $._create_trigger_event)),
    $.keyword_on,
    $.object_reference,
    repeat(
      choice(
        seq($.keyword_from, $.object_reference),
        choice(
          seq($.keyword_not, $.keyword_deferrable),
          $.keyword_deferrable,
          seq($.keyword_initially, $.keyword_immediate),
          seq($.keyword_initially, $.keyword_deferred),
        ),
        seq($.keyword_referencing, choice($.keyword_old, $.keyword_new), $.keyword_table, optional($.keyword_as), $.identifier),
        seq(
          $.keyword_for,
          optional($.keyword_each),
          choice($.keyword_row, $.keyword_statement),
          // MariaDB FOLLOWS/PRECEDES
          optional(seq(choice($.keyword_follows, $.keyword_precedes), $.identifier)),
        ),
        seq($.keyword_when, wrapped_in_parenthesis($._expression)),
      ),
    ),
    choice(
      // MySQL/MariaDB: FOR EACH ROW body
      $.procedure_body,
      // PostgreSQL-style: EXECUTE FUNCTION/PROCEDURE name(args)
      seq(
        $.keyword_execute,
        choice($.keyword_function, $.keyword_procedure),
        $.object_reference,
        paren_list(field('parameter', $.term)),
      ),
    ),
  ),

};
