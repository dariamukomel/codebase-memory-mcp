import { paren_list } from '../../grammar/helpers.js';

// Snowflake's staged-file commands. These are the four statement pages under
// https://docs.snowflake.com/en/sql-reference/sql/ that had no rule at all;
// the grammar could parse COPY INTO and LIST, but not the PUT/GET/REMOVE
// round trip they sit next to, nor COPY FILES.
export default {

  // PUT file://<path> <internal_stage> [ <option> = <value> … ]
  // https://docs.snowflake.com/en/sql-reference/sql/put
  put_statement: $ => seq(
    $.keyword_put,
    field('source', $._file_uri),
    field('stage', $.stage_ref),
    repeat($.copy_property),
  ),

  // GET <internal_stage> file://<path> [ <option> = <value> … ]
  // https://docs.snowflake.com/en/sql-reference/sql/get
  get_statement: $ => seq(
    $.keyword_get,
    field('stage', $.stage_ref),
    field('target', $._file_uri),
    repeat($.copy_property),
  ),

  // REMOVE <internal_stage> [ PATTERN = '<regex>' ]
  // https://docs.snowflake.com/en/sql-reference/sql/remove
  remove_statement: $ => seq(
    choice($.keyword_remove, $.keyword_rm),
    field('stage', $.stage_ref),
    optional(seq($.keyword_pattern, '=', alias($._literal_string, $.literal))),
  ),

  // COPY FILES INTO <stage> FROM <stage>
  //   [ FILES = ('f1'[, …]) ] [ PATTERN = '<regex>' ] [ <option> = <value> … ]
  // https://docs.snowflake.com/en/sql-reference/sql/copy-files
  copy_files_statement: $ => seq(
    $.keyword_copy,
    $.keyword_files,
    $.keyword_into,
    field('target', $.stage_ref),
    $.keyword_from,
    field('source', choice($.stage_ref, seq('(', $._dml_read, ')'))),
    repeat(choice(
      seq($.keyword_files, '=', paren_list(alias($._literal_string, $.literal), true)),
      seq($.keyword_pattern, '=', alias($._literal_string, $.literal)),
      $.copy_property,
    )),
  ),

  // `file://…` local paths, bare or quoted. The bare form needs a token
  // precedence above keyword_file's: tree-sitter resolves lexical precedence
  // before match length, so a prec-1 `file` keyword would otherwise win the
  // first four characters and leave `://…` unparsed.
  _file_uri: $ => choice(
    $.file_uri,
    alias($._literal_string, $.literal),
  ),

  file_uri: _ => token(prec(2, /[Ff][Ii][Ll][Ee]:\/\/[^\s;'"]+/)),

};
