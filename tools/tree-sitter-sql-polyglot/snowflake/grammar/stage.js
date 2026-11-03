import { comma_list, paren_list } from '../../grammar/helpers.js';

export default {

  // CREATE [OR REPLACE] [TEMPORARY] STAGE [IF NOT EXISTS] name
  //   [URL = 's3://...']
  //   [CREDENTIALS = (...)]
  //   [FILE_FORMAT = (...) | (TYPE = ...)]
  //   [COPY_OPTIONS = (...)]
  //   [COMMENT = 'str']
  create_stage: $ => seq(
    $.keyword_create,
    optional($._or_replace_or_alter),
    optional($._temporary),
    $.keyword_stage,
    optional($._if_not_exists),
    $.object_reference,
    repeat(
      seq(
        choice(
          $.keyword_url,
          $.keyword_credentials,
          $.keyword_file_format,
          $.keyword_copy_options,
          $.keyword_comment,
          $.keyword_directory,
          $.keyword_encryption,
        ),
        '=',
        choice(
          alias($._literal_string, $.literal),
          seq('(', repeat(seq(choice($.identifier, alias($._literal_string, $.literal)), optional(seq('=', choice(alias($._literal_string, $.literal), $.identifier))))), ')'),
        ),
      ),
    ),
  ),

  // ALTER STAGE [IF EXISTS] name (RENAME TO new_name | SET key = val [...])
  alter_stage: $ => seq(
    $.keyword_alter,
    $.keyword_stage,
    optional($._if_exists),
    $.object_reference,
    choice(
      seq($.keyword_rename, $.keyword_to, $.object_reference),
      seq(
        $.keyword_set,
        repeat1(
          seq(
            choice(
              $.keyword_url,
              $.keyword_credentials,
              $.keyword_file_format,
              $.keyword_copy_options,
              $.keyword_comment,
              $.keyword_directory,
              $.keyword_encryption,
            ),
            '=',
            choice(
              alias($._literal_string, $.literal),
              seq('(', repeat(seq(choice($.identifier, alias($._literal_string, $.literal)), optional(seq('=', choice(alias($._literal_string, $.literal), $.identifier))))), ')'),
            ),
          ),
        ),
      ),
    ),
  ),

  // DROP STAGE [IF EXISTS] name
  drop_stage: $ => seq(
    $.keyword_drop,
    $.keyword_stage,
    optional($._if_exists),
    $.object_reference,
  ),

  // LIST @stage [PATTERN = 'regex']
  list_stage_statement: $ => seq(
    choice($.keyword_list, $.keyword_ls),
    $.stage_ref,
    optional(seq($.keyword_pattern, '=', alias($._literal_string, $.literal))),
  ),

};
