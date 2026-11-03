import { comma_list, paren_list } from '../../grammar/helpers.js';

// Snowflake documents most object options as long, version-churning property
// lists. Enumerating them dates instantly, so they are modelled as
// `NAME = value` pairs; the shape the reference itself uses.
export default {

  // <name> = { <literal> | <identifier> | ( [<list> | <name> = <value> ...] ) }   or   <name> <literal> | <identifier>
  snowflake_property: $ => choice(
    seq(
      field('name', $.identifier),
      '=',
      field('value', choice(
        $.literal,
        $.object_reference,
        $.copy_list,
      )),
    ),
    seq(
      field('name', $.identifier),
      field('value', choice($.literal, $.identifier)),
    ),
  ),

};
