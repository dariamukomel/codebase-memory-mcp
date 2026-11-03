import { comma_list, paren_list } from "../../grammar/helpers.js";

export default {

  // LOAD DATA [LOW_PRIORITY | CONCURRENT] [LOCAL] INFILE 'f'
  //   [REPLACE | IGNORE] INTO TABLE t [PARTITION (p,...)]
  //   [CHARACTER SET cs] [FIELDS ...] [LINES ...] [IGNORE n LINES]
  //   [(cols)] [SET col = expr, ...]
  load_data_statement: $ => seq(
    $.keyword_load,
    $.keyword_data,
    optional(choice($.keyword_low_priority, $.keyword_concurrent)),
    optional($.keyword_local),
    $.keyword_infile,
    alias($._literal_string, $.literal),
    optional(choice($.keyword_replace, $.keyword_ignore)),
    $.keyword_into,
    $.keyword_table,
    $.object_reference,
    optional(seq($.keyword_partition, paren_list($.identifier, true))),
    optional(seq($.keyword_character, $.keyword_set, field('charset', $.identifier))),
    optional($._load_fields_clause),
    optional($._load_lines_clause),
    optional($._load_ignore_lines),
    optional(alias($._column_list, $.list)),
    optional(seq($.keyword_set, comma_list($._load_set_item, true))),
  ),

  _load_set_item: $ => seq(
    field('column', $.identifier),
    '=',
    field('value', $._expression),
  ),

  // FIELDS/COLUMNS are synonyms, and ENCLOSED BY may be OPTIONALLY ENCLOSED.
  _load_fields_clause: $ => seq(
    choice($.keyword_fields, $.keyword_columns),
    repeat1(choice(
      seq($.keyword_terminated, $.keyword_by, alias($._literal_string, $.literal)),
      // Spelled as two alternatives rather than a leading optional: an
      // optional at the head of a repeat alternative is not decidable.
      seq($.keyword_enclosed, $.keyword_by, alias($._literal_string, $.literal)),
      seq(
        $.keyword_optionally,
        $.keyword_enclosed,
        $.keyword_by,
        alias($._literal_string, $.literal),
      ),
      seq($.keyword_escaped,    $.keyword_by, alias($._literal_string, $.literal)),
    )),
  ),

  // LINES [STARTING BY 'str'] [TERMINATED BY 'str'].
  // Spelled in the documented fixed order rather than as a repeat: this rule
  // is shared with into_outfile, which sits inside SELECT, and a repeat over
  // two alternatives destabilises the MariaDB select path.
  _load_lines_clause: $ => seq(
    $.keyword_lines,
    choice(
      seq($._load_lines_starting, optional($._load_lines_terminated)),
      $._load_lines_terminated,
    ),
  ),

  _load_lines_starting: $ => seq(
    $.keyword_starting,
    $.keyword_by,
    alias($._literal_string, $.literal),
  ),

  _load_lines_terminated: $ => seq(
    $.keyword_terminated,
    $.keyword_by,
    alias($._literal_string, $.literal),
  ),

  _load_ignore_lines: $ => seq(
    $.keyword_ignore,
    alias($._integer, $.literal),
    choice($.keyword_lines, $.keyword_rows),
  ),

  // SELECT … INTO { OUTFILE 'f' [CHARACTER SET cs] [FIELDS …] [LINES …]
  //              | DUMPFILE 'f' }
  into_outfile: $ => seq(
    $.keyword_into,
    choice(
      seq(
        $.keyword_outfile,
        alias($._literal_string, $.literal),
        optional(seq($.keyword_character, $.keyword_set, $.identifier)),
        optional($._load_fields_clause),
        optional($._load_lines_clause),
      ),
      seq($.keyword_dumpfile, alias($._literal_string, $.literal)),
    ),
  ),

};
