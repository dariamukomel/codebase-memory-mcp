import { paren_list } from "../../grammar/helpers.js";

export default {
  _compute_stats: $ => prec.left(choice(
    // Hive
    seq(
      $.keyword_analyze, $.keyword_table, $.object_reference,
      optional($._partition_spec), $.keyword_compute, $.keyword_statistics,
      optional(seq($.keyword_for, $.keyword_columns)),
      optional(seq($.keyword_cache, $.keyword_metadata)),
      optional($.keyword_noscan),
    ),
    // Impala
    seq(
      $.keyword_compute,
      optional($.keyword_incremental),
      $.keyword_stats,
      $.object_reference,
      optional(choice(
        paren_list(repeat1($.field)),
        $._partition_spec,
      ))
    ),
  )),

  _spark_analyze: $ => prec.left(1, choice(
    seq(
      $.keyword_analyze, $.keyword_table, $.object_reference,
      optional($._partition_spec), $.keyword_compute,
      optional($.keyword_delta), $.keyword_statistics,
      optional(choice(
        $.keyword_noscan,
        seq($.keyword_for, $.keyword_columns, repeat1(seq(optional(','), $.field))),
        seq($.keyword_for, $.keyword_all, $.keyword_columns),
      )),
    ),
    seq(
      $.keyword_analyze, $.keyword_tables,
      optional(seq($.keyword_from, $.object_reference)),
      $.keyword_compute, optional($.keyword_delta), $.keyword_statistics,
      optional($.keyword_noscan),
    ),
    prec.left(2, seq(
      $.keyword_analyze, $.keyword_tables, $.keyword_in, $.object_reference,
      $.keyword_compute, optional($.keyword_delta), $.keyword_statistics,
      optional($.keyword_noscan),
    )),
  )),

  _partition_spec: $ => seq(
    $.keyword_partition, paren_list($.table_option, true),
  ),

  _optimize_table: $ => seq(
    $.keyword_optimize,
    $.object_reference,
    $.keyword_rewrite,
    $.keyword_data,
    optional(seq($.keyword_using, $.keyword_bin_pack)),
    optional($.where),
  ),

  // OPTIMIZE t [WHERE p] [ZORDER BY (cols)]; Delta Lake's compaction
  // statement. Open source since Delta 2.0, so it belongs to Spark rather
  // than to Databricks; Databricks inherits it from here.
  // Distinguished from the Iceberg form above by the token after the table
  // reference (REWRITE vs WHERE/ZORDER/end), so the two stay LR-decidable.
  _delta_optimize: $ => seq(
    $.keyword_optimize,
    $.object_reference,
    optional($.where),
    optional(seq(
      $.keyword_zorder,
      $.keyword_by,
      paren_list($.field, true),
    )),
  ),
};
