import { wrapped_in_parenthesis } from "../../grammar/helpers.js";

export default {

  // COPY {table [(cols)] | (query)} {FROM | TO} {'file' | STDIN | STDOUT
  //   | PROGRAM 'cmd'} [[WITH] (option, …)] [WHERE cond]
  // The column list and the option block are both optional; requiring them
  // rejected the plainest spelling, `COPY t FROM 'f.csv'`.
  _copy_statement: $ => prec.right(seq(
    $.keyword_copy,
    choice(
      seq($.object_reference, optional($._column_list)),
      wrapped_in_parenthesis($._dml_read),
    ),
    choice($.keyword_from, $.keyword_to),
    choice(
      $.keyword_stdin,
      $.keyword_stdout,
      alias($._literal_string, "filename"),
      seq($.keyword_program, alias($._literal_string, "command")),
    ),
    optional(seq(
    optional($.keyword_with),
    wrapped_in_parenthesis(
      repeat1(
        choice(
          seq(
            $.keyword_format,
            choice(
              $.keyword_csv,
              $.keyword_binary,
              $.keyword_text,
            ),
          ),
          seq(
            $.keyword_freeze,
            choice(
              $.keyword_true,
              $.keyword_false
            )
          ),
          seq(
            $.keyword_header,
            choice(
              $.keyword_true,
              $.keyword_false,
              $.keyword_match
            ),
          ),
          seq(
            choice(
              $.keyword_delimiter,
              $.keyword_null,
              $.keyword_default,
              $.keyword_escape,
              $.keyword_quote,
              $.keyword_encoding,
            ),
            alias($._literal_string, $.identifier)
          ),
          seq(
            choice(
              $.keyword_force_null,
              $.keyword_force_not_null,
              $.keyword_force_quote,
            ),
            $._column_list
          ),
        ),
      ),
    ),
    )),
    optional($.where),
  )),

};
