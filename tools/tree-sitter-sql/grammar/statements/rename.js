export default {

  _rename_statement: $ => seq(
    $.keyword_rename,
    choice(
      $.keyword_table,
      $.keyword_tables,
    ),
    optional($._if_exists),
    field('old_name', $.object_reference),
    optional(
      choice(
        $.keyword_nowait,
        seq(
          $.keyword_wait,
          field('timeout', alias($._natural_number, $.literal))
        )
      )
    ),
    $.keyword_to,
    field('new_name', $.object_reference),
    repeat(
      seq(
        ',',
        $._rename_table_names,
      )
    ),
  ),

  _rename_table_names: $ => seq(
    field('old_name', $.object_reference),
    $.keyword_to,
    field('new_name', $.object_reference),
  ),

};
