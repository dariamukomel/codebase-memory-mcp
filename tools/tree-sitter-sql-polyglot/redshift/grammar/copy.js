export default {

  // COPY table [(columns)] FROM 's3://...' IAM_ROLE 'arn:...' [options...]
  copy_statement: $ => seq(
    $.keyword_copy,
    $.object_reference,
    optional($._column_list),
    $.keyword_from,
    alias($._literal_string, $.literal),
    repeat1(
      choice(
        seq($.keyword_iam_role, alias($._literal_string, $.literal)),
        seq(
          $.keyword_format,
          optional($.keyword_as),
          field('format', choice(
            $.keyword_parquet,
            $.keyword_orc,
            $.keyword_avro,
            $.keyword_rcfile,
            $.keyword_csv,
            $.identifier,
          )),
        ),
        $.keyword_csv,
        seq($.keyword_delimiter, alias($._literal_string, $.literal)),
        seq($.keyword_quote, alias($._literal_string, $.literal)),
        seq($.keyword_ignoreheader, alias($._integer, $.literal)),
        $.keyword_gzip,
        $.keyword_bzip2,
        $.keyword_lzop,
        $.keyword_zstd,
        seq(
          $.keyword_compression,
          field('compression', choice($.keyword_gzip, $.keyword_bzip2, $.keyword_zstd, $.identifier)),
        ),
      ),
    ),
  ),

  // UNLOAD ('SELECT ...') TO 's3://...' IAM_ROLE 'arn:...' [options...]
  unload_statement: $ => seq(
    $.keyword_unload,
    '(',
    alias($._literal_string, $.literal),
    ')',
    $.keyword_to,
    alias($._literal_string, $.literal),
    repeat(
      choice(
        seq($.keyword_iam_role, alias($._literal_string, $.literal)),
        seq(
          $.keyword_format,
          optional($.keyword_as),
          field('format', choice(
            $.keyword_parquet,
            $.keyword_orc,
            $.keyword_avro,
            $.keyword_csv,
            $.identifier,
          )),
        ),
        seq(
          $.keyword_maxfilesize,
          alias($._integer, $.literal),
          optional($.identifier),
        ),
        $.keyword_gzip,
        $.keyword_bzip2,
        $.keyword_zstd,
        seq(
          $.keyword_compression,
          field('compression', choice($.keyword_gzip, $.keyword_bzip2, $.keyword_zstd, $.identifier)),
        ),
      ),
    ),
  ),

};
