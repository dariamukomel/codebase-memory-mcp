import keyword_rules from "./grammar/keywords.js";
import type_rules from "./grammar/types.js";
import column_list_rules from "./grammar/column-lists.js";
import expression_rules from "./grammar/expressions.js";
import transaction_rules from "./grammar/transactions.js";
import statement_rules from "./grammar/statements/index.js";
import { canonicalOrder } from './grammar/helpers.js';

export default canonicalOrder(grammar({
  name: 'sql',

  // /\s/ alone covers every whitespace character including newlines. An earlier
  // /\s\n/ entry sat in front of it, inherited from upstream; it matched nothing
  // /\s/ did not already match. Removing it is byte-neutral at runtime (measured:
  // no throughput change outside noise) and drops ~2KB from every parser.c.
  extras: $ => [
    /\s/,
    $.comment,
    $.marginalia,
  ],

  conflicts: $ => [
    [$.object_reference, $._qualified_field],
    [$.field, $._qualified_field],
    [$.object_reference],
    // Local shift/reduce ambiguity at the same "what does a trailing NOT
    // belong to" boundary that between_expression/binary_expression already
    // share above; bounded to one lookahead decision, not a duplicate
    // derivation of the whole like_expression subtree.
    [$.between_expression, $.binary_expression, $.like_expression],
    [$.create_function],
    [$.list, $.grouping_set],
    [$.list, $.rollup_element],
    [$.list, $.cube_element],
    // [$.interval] removed: the interval rule now resolves its trailing-
    // qualifier shift/reduce statically via prec.right (see
    // grammar/expressions.js), so the GLR conflict is no longer needed.
  ],

  precedences: $ => [
    [
      'binary_is',
      'unary_not',
      'binary_exp',
      'binary_times',
      'binary_plus',
      'unary_other',
      'binary_other',
      'binary_in',
      'binary_compare',
      'binary_relation',
      'pattern_matching',
      'between',
      'clause_connective',
      'clause_disjunctive',
    ],
  ],

  word: $ => $._identifier,

  // Strict ANSI base: ON is an ISO SQL reserved word. Reserving it stops `on`
  // from being lexed as a bare identifier / function name, so the PostgreSQL
  // `SELECT DISTINCT ON (…)` extension no longer parses accidentally as an
  // `on(…)` invocation. `JOIN … ON` is unaffected; it references the
  // keyword_on token explicitly rather than an identifier position.
  reserved: {
    global: $ => [$.keyword_on],
  },

  // ISO POSITION(needle IN haystack): produced by the external scanner only for that shape, so
  // `position` stays usable as a column name and function name everywhere else.
  externals: $ => [
    $._position_call,
    $._position_regex_call,
    $._substring_regex_call,
  ],

  rules: {
    program: $ => seq(
      // any number of statements with a terminating ;
      repeat(
        seq(
          $.statement,
          ';',
        ),
      ),
      // optionally, a single statement without a terminating ;
      optional(
        $.statement,
      ),
    ),

    comment: _ => /--.*/,
    // https://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment
    marginalia: _ => /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//,

    ...keyword_rules,
    ...type_rules,
    ...column_list_rules,
    ...expression_rules,
    ...transaction_rules,
    ...statement_rules,

  }

}));
