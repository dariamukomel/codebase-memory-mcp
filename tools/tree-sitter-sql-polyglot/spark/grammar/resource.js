export default {

  // ADD {FILE | FILES | JAR | JARS | ARCHIVE | ARCHIVES} path [path ...]
  add_resource_statement: $ => seq(
    $.keyword_add,
    choice(
      $.keyword_file,
      $.keyword_files,
      $.keyword_jar,
      $.keyword_jars,
      $.keyword_archive,
      $.keyword_archives,
    ),
    repeat1($._literal_string),
  ),

  // LIST {FILE | FILES | JAR | JARS | ARCHIVE | ARCHIVES} [path ...]
  list_resource_statement: $ => seq(
    $.keyword_list,
    choice(
      $.keyword_file,
      $.keyword_files,
      $.keyword_jar,
      $.keyword_jars,
      $.keyword_archive,
      $.keyword_archives,
    ),
    repeat($._literal_string),
  ),

};
