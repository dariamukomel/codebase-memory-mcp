import { comma_list, paren_list, wrapped_in_parenthesis } from '../../grammar/helpers.js';

export default {

  // TABLESAMPLE [ SYSTEM ] ( <number> [ PERCENT | ROWS ] ) [ REPEATABLE ( <seed> ) ]
  tablesample: $ => seq(
    $.keyword_tablesample,
    optional($.keyword_system),
    '(',
    choice($._natural_number, /\d+\.\d+/),
    optional(choice($.keyword_percent, $.keyword_rows)),
    ')',
    optional(seq($.keyword_repeatable, '(', $._natural_number, ')')),
  ),

  // Override relation to support T-SQL table hints AND PIVOT/UNPIVOT.
  // T-SQL syntax: table_name [PIVOT|UNPIVOT (...)] [[AS] alias] [WITH (hint [,...])]
  relation: $ => prec.right(
    seq(
      choice(
        $.subquery,
        $.invocation,
        $.object_reference,
        wrapped_in_parenthesis($.values),
      ),
      optional($.tablesample),
      optional(choice(
        $.pivot_clause,
        $.unpivot_clause,
      )),
      optional(
        seq(
          $._alias,
          optional(alias($._column_list, $.list)),
        ),
      ),
      optional($.table_hints),
    ),
  ),

  // WITH ( hint [, ...] )
  table_hints: $ => seq(
    $.keyword_with,
    '(',
    comma_list($.table_hint, true),
    ')',
  ),

  table_hint: $ => choice(
    $.keyword_nolock,
    $.keyword_rowlock,
    $.keyword_updlock,
    $.keyword_readpast,
    $.keyword_tablock,
    $.keyword_tablockx,
    // INDEX = name  or  INDEX ( name [, ...] )
    seq($.keyword_index, '=', $.identifier),
    seq($.keyword_index, paren_list($.identifier, true)),
    // Catch-all: FORCESCAN, HOLDLOCK, KEEPIDENTITY, NOWAIT, PAGLOCK, READCOMMITTED, etc.
    $.identifier,
  ),

};
