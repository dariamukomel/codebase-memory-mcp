import { comma_list, paren_list } from '../../grammar/helpers.js';

// CREATE / ALTER DATABASE, from the T-SQL reference (443 statement syntax
// blocks read from the MicrosoftDocs/sql-docs sources, which carry the
// ```syntaxsql blocks the published pages render).
export default {

  // CREATE DATABASE name [CONTAINMENT = ...]
  //   [ON [PRIMARY] <filespec>,... [, <filegroup>,...] [LOG ON <filespec>,...]]
  //   [COLLATE c] [WITH <option>,...]
  //   | ... FOR ATTACH | AS COPY OF ...
  create_database: $ => prec.left(seq(
    $.keyword_create,
    $.keyword_database,
    optional($._if_not_exists),
    $.identifier,
    repeat(choice(
      seq($.keyword_containment, '=', field('containment', $.identifier)),
      seq(
        $.keyword_on,
        optional($.keyword_primary),
        comma_list($._db_file_element, true),
      ),
      seq($.keyword_log, $.keyword_on, comma_list($.db_filespec, true)),
      seq($.keyword_collate, field('collation', $.identifier)),
      seq($.keyword_with, comma_list($.tsql_option, true)),
      seq($.keyword_for, field('attach', $.identifier)),
      seq($.keyword_as, $.keyword_copy, $.keyword_of, field('source', $.object_reference)),
    )),
  )),

  // A flat comma list of filespecs and FILEGROUP markers. Nesting a comma
  // list inside this one is not decidable; the two commas are the same
  // token in the same position.
  _db_file_element: $ => choice(
    $.db_filespec,
    seq($.keyword_filegroup, field('filegroup', $.identifier)),
  ),

  // ( NAME = n, FILENAME = 'p', SIZE = s, MAXSIZE = m, FILEGROWTH = g )
  db_filespec: $ => paren_list($.tsql_option, true),

  // ALTER DATABASE name <action>
  alter_database: $ => prec.left(seq(
    $.keyword_alter,
    $.keyword_database,
    choice($.identifier, $.keyword_current),
    choice(
      $.rename_object,
      seq($.keyword_collate, field('collation', $.identifier)),
      seq(
        $.keyword_add,
        choice(
          seq($.keyword_filegroup, field('filegroup', $.identifier)),
          seq(optional($.keyword_log), $.keyword_file, comma_list($.db_filespec, true),
              optional(seq($.keyword_to, $.keyword_filegroup, field('filegroup', $.identifier)))),
        ),
      ),
      seq($.keyword_remove, choice(
        seq($.keyword_file, field('file', $.identifier)),
        seq($.keyword_filegroup, field('filegroup', $.identifier)),
      )),
      seq($.keyword_modify, choice(
        seq($.keyword_file, $.db_filespec),
        seq($.keyword_name, '=', field('name', $.identifier)),
        seq($.keyword_filegroup, field('filegroup', $.identifier),
            repeat(choice($.tsql_option, field('option', $.identifier)))),
      )),
      seq(
        $.keyword_set,
        optional(seq($.keyword_scoped, $.keyword_configuration)),
        comma_list($._alter_db_option, true),
        optional(seq($.keyword_with, comma_list($.tsql_option, true))),
      ),
    ),
  )),

  // Option lists here are long, version specific and mostly bare words or
  // `NAME = value`, so they are accepted in that shape rather than enumerated.
  _alter_db_option: $ => choice(
    $.tsql_option,
    seq(field('option', $.identifier), $._on_off),
    seq(field('option', $.identifier), field('argument', $.identifier)),
    field('option', $.identifier),
  ),

};
