import { comma_list } from '../../grammar/helpers.js';

export default {

  // COPY INTO [<namespace>.]<table> [ ( <col> [, ...] ) ]
  //   [ FROM { <stage> | '<external location>' | ( <transform query> ) } ] [ <copy option> ... ]
  // COPY INTO { <stage> | '<external location>' } FROM { <table> | ( <query> ) } [ <copy option> ... ]
  copy_into: $ => seq(
    $.keyword_copy,
    $.keyword_into,
    choice(
      seq(
        $.object_reference,
        optional(seq('(', comma_list($.identifier), ')')),
        optional(seq($.keyword_from, $._copy_source)),
      ),
      seq(
        $._copy_location,
        $.keyword_from,
        choice($.object_reference, seq('(', $._dml_read, ')')),
      ),
    ),
    repeat(choice($.copy_property, seq($.keyword_partition, $.keyword_by, $._expression))),
  ),

  _copy_location: $ => choice($.stage_ref, $.literal, $.unquoted_url),

  _copy_source: $ => choice(
    $.stage_ref,
    $.literal,
    $.unquoted_url,
    seq('(', $._dml_read, ')'),
  ),

  // s3://bucket/path, gcs://bucket/path, azure://account/container/path written without quotes
  unquoted_url: _ => token(prec(2, /[A-Za-z0-9]+:\/\/[^\s;'"(),]+/)),

  // @stage_name  @~  @%table  @stage/path
  stage_ref: _ => /@[~%a-zA-Z0-9_./-]*/,

  // KEY = value  (e.g. FILE_FORMAT = (TYPE = CSV), PURGE = TRUE, FILES = ('a', 'b'))
  copy_property: $ => seq(
    $.identifier,
    '=',
    $._copy_value,
  ),

  _copy_value: $ => choice(
    $.copy_list,
    $.literal,
    $.object_reference,
  ),

  // ( KEY = value ... ) or ( 'a', 'b' ) or ()
  copy_list: $ => seq(
    '(',
    optional(choice(
      repeat1(seq($.copy_kv, optional(','))),
      comma_list(choice($._copy_value, $.copy_aliased_value)),
    )),
    ')',
  ),

  // 'value' AS 'alias', as in IMPORTS = ('@stage/file.zip' AS 'f')
  copy_aliased_value: $ => seq($.literal, $.keyword_as, $.literal),

  // KEY is an identifier, or a quoted string for lists such as SECRETS = ('cred' = s1) and HEADERS = ('h' = 'v')
  copy_kv: $ => seq(choice($.identifier, $.literal), '=', $._copy_value),

};
