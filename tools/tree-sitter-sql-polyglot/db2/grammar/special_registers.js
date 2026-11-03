export default {

  // CURRENT SCHEMA | CURRENT TIMESTAMP | CURRENT DATE etc.; Db2 special registers
  special_register: $ => seq(
    $.keyword_current,
    choice(
      $.keyword_schema,
      $.keyword_timestamp,
      $.keyword_date,
      $.keyword_time,
      $.keyword_user,
      $.keyword_path,
    ),
  ),

};
