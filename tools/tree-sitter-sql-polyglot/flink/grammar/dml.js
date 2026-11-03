import { paren_list } from '../../grammar/helpers.js';

export default {

  // Override insert to support INSERT OVERWRITE and UPSERT INTO
  insert: $ => seq(
    choice(
      seq($.keyword_insert, choice($.keyword_into, $.keyword_overwrite)),
      seq($.keyword_upsert, $.keyword_into),
    ),
    field('target', $.object_reference),
    optional(seq(
      $.keyword_partition,
      paren_list(seq($.identifier, '=', $.literal), true),
    )),
    $._insert_values,
  ),

  // EXECUTE STATEMENT SET BEGIN insert; ... END
  execute_statement_set: $ => seq(
    $.keyword_execute,
    $.keyword_statement,
    $.keyword_set,
    $.keyword_begin,
    repeat1(seq($.insert, ';')),
    $.keyword_end,
  ),

  // BEGIN STATEMENT SET insert; ... END  (interactive form)
  begin_statement_set: $ => seq(
    $.keyword_begin,
    $.keyword_statement,
    $.keyword_set,
    repeat1(seq($.insert, ';')),
    $.keyword_end,
  ),

  // COMPILE PLAN 'path' [IF NOT EXISTS] FOR (insert | statement_set)
  compile_plan: $ => seq(
    $.keyword_compile,
    $.keyword_plan,
    field('path', alias($._literal_string, $.literal)),
    optional($._if_not_exists),
    $.keyword_for,
    choice($.insert, $.execute_statement_set),
  ),

  // COMPILE AND EXECUTE PLAN 'path' FOR (insert | statement_set)
  compile_and_execute_plan: $ => seq(
    $.keyword_compile,
    $.keyword_and,
    $.keyword_execute,
    $.keyword_plan,
    field('path', alias($._literal_string, $.literal)),
    $.keyword_for,
    choice($.insert, $.execute_statement_set),
  ),

  // EXECUTE PLAN 'path'
  execute_plan: $ => seq(
    $.keyword_execute,
    $.keyword_plan,
    field('path', alias($._literal_string, $.literal)),
  ),

  // EXECUTE select; general EXECUTE wrapper for SELECT queries
  execute_statement: $ => seq(
    $.keyword_execute,
    $._dml_read,
  ),

};
