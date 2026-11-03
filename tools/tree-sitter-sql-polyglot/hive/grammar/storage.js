import { paren_list } from '../../grammar/helpers.js';

export default {

  // STORED AS file_format
  stored_as: $ => seq(
    $.keyword_stored,
    $.keyword_as,
    choice(
      $.keyword_parquet,
      $.keyword_csv,
      $.keyword_sequencefile,
      $.keyword_textfile,
      $.keyword_rcfile,
      $.keyword_orc,
      $.keyword_avro,
      $.keyword_jsonfile,
    ),
  ),

  // LOCATION 'path' [CACHED IN 'pool' [WITH REPLICATION = n] | UNCACHED]
  storage_location: $ => prec.right(
    seq(
      $.keyword_location,
      field('path', alias($._literal_string, $.literal)),
      optional(seq(
        $.keyword_cached,
        $.keyword_in,
        field('pool', alias($._literal_string, $.literal)),
        optional(choice(
          $.keyword_uncached,
          seq(
            $.keyword_with,
            $.keyword_replication,
            '=',
            field('value', alias($._natural_number, $.literal)),
          ),
        )),
      )),
    ),
  ),

  // CLUSTERED BY (cols) [SORTED BY (cols)] INTO n BUCKETS
  table_cluster: $ => seq(
    $.keyword_clustered,
    $.keyword_by,
    paren_list($.field, true),
    optional(seq($.keyword_sorted, $.keyword_by, paren_list($.field, true))),
    $.keyword_into,
    $.literal,
    $.keyword_buckets,
  ),

  // SORT BY (cols)
  table_sort: $ => seq(
    $.keyword_sort,
    $.keyword_by,
    paren_list($.identifier, true),
  ),

  // ROW FORMAT DELIMITED / SERDE
  row_format: $ => seq(
    $.keyword_row,
    $.keyword_format,
    choice(
      seq(
        $.keyword_delimited,
        optional(seq(
          $.keyword_fields, $.keyword_terminated, $.keyword_by,
          field('fields_terminated_char', alias($._literal_string, $.literal)),
          optional(seq(
            $.keyword_escaped, $.keyword_by,
            field('escaped_char', alias($._literal_string, $.literal)),
          )),
        )),
        optional(seq(
          $.keyword_lines, $.keyword_terminated, $.keyword_by,
          field('row_terminated_char', alias($._literal_string, $.literal)),
        )),
      ),
      seq(
        $.keyword_serde,
        field('class', alias($._literal_string, $.literal)),
        optional(seq(
          $.keyword_with, $.keyword_serdeproperties,
          paren_list(seq($._literal_string, '=', $._literal_string), true),
        )),
      ),
    ),
  ),

  // STORED BY 'handler' [WITH SERDEPROPERTIES (...)]
  stored_by: $ => seq(
    $.keyword_stored,
    $.keyword_by,
    field('handler', alias($._literal_string, $.literal)),
    optional(seq(
      $.keyword_with, $.keyword_serdeproperties,
      paren_list(seq($._literal_string, '=', $._literal_string), true),
    )),
  ),

};
