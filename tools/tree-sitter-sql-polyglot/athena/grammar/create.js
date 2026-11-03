import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // CREATE EXTERNAL TABLE [IF NOT EXISTS] name (col_defs)
  //   [PARTITIONED BY (col_defs)]
  //   [ROW FORMAT SERDE 'class' [WITH SERDEPROPERTIES (...)]
  //    | ROW FORMAT DELIMITED [FIELDS TERMINATED BY 'x'] [LINES TERMINATED BY 'x']]
  //   [STORED AS TEXTFILE|PARQUET|ORC|AVRO|RCFILE|SEQUENCEFILE]
  //   LOCATION 's3://...'
  //   [TBLPROPERTIES (...)]
  create_external_table: $ => seq(
    $.keyword_create,
    $.keyword_external,
    $.keyword_table,
    optional($._if_not_exists),
    field('target', $.object_reference),
    optional($.column_definitions),
    optional(seq(
      $.keyword_partitioned,
      $.keyword_by,
      $.column_definitions,
    )),
    optional($.row_format),
    optional($.stored_as),
    $.keyword_location,
    field('location', alias($._literal_string, $.literal)),
    optional(seq(
      $.keyword_tblproperties,
      paren_list(
        seq(
          field('key', alias($._literal_string, $.literal)),
          '=',
          field('value', alias($._literal_string, $.literal)),
        ),
        true,
      ),
    )),
  ),

  // Managed (non-EXTERNAL) table: trino's create_table plus the Athena tails
  //   [PARTITIONED BY (col | transform(col[, n]), …)]
  //   [LOCATION 's3://…'] [TBLPROPERTIES ('k'='v', …)]
  // TBLPROPERTIES('table_type'='ICEBERG') selects the managed Iceberg engine.
  create_table: $ => prec.left(seq(
    $.keyword_create,
    optional($._temporary),
    $.keyword_table,
    optional($._if_not_exists),
    field("target", $.object_reference),
    seq(
      optional($.column_definitions),
      optional($.with_properties),
      optional(seq($.keyword_as, $.create_query)),
    ),
    optional(seq(
      $.keyword_partitioned, $.keyword_by,
      paren_list($.partition_transform, true),
    )),
    optional(seq($.keyword_location, alias($._literal_string, $.literal))),
    optional(seq(
      $.keyword_tblproperties,
      paren_list(seq(
        field('key', alias($._literal_string, $.literal)),
        '=',
        field('value', alias($._literal_string, $.literal)),
      ), true),
    )),
  )),

  // Iceberg partition spec: bare column or a transform such as day(ts),
  // bucket(16, id), truncate(10, name).
  partition_transform: $ => choice(
    seq(
      field('transform', $.identifier),
      '(',
      comma_list(choice($.identifier, alias($._integer, $.literal)), true),
      ')',
    ),
    field('column', $.identifier),
  ),

  // ROW FORMAT SERDE 'class' [WITH SERDEPROPERTIES (k=v, ...)]
  // ROW FORMAT DELIMITED [FIELDS TERMINATED BY 'x'] [LINES TERMINATED BY 'x']
  row_format: $ => seq(
    $.keyword_row,
    $.keyword_format,
    choice(
      seq(
        $.keyword_serde,
        field('class', alias($._literal_string, $.literal)),
        optional(seq(
          $.keyword_with,
          $.keyword_serdeproperties,
          paren_list(
            seq(
              field('key', alias($._literal_string, $.literal)),
              '=',
              field('value', alias($._literal_string, $.literal)),
            ),
            true,
          ),
        )),
      ),
      seq(
        $.keyword_delimited,
        optional(seq(
          $.keyword_fields,
          $.keyword_terminated,
          $.keyword_by,
          field('field_sep', alias($._literal_string, $.literal)),
        )),
        optional(seq(
          $.keyword_lines,
          $.keyword_terminated,
          $.keyword_by,
          field('line_sep', alias($._literal_string, $.literal)),
        )),
      ),
    ),
  ),

  // STORED AS format_name
  stored_as: $ => seq(
    $.keyword_stored,
    $.keyword_as,
    choice(
      $.keyword_textfile,
      $.keyword_parquet,
      $.keyword_orc,
      $.keyword_avro,
      $.keyword_rcfile,
      $.keyword_sequencefile,
      $.keyword_inputformat,
    ),
  ),

};
