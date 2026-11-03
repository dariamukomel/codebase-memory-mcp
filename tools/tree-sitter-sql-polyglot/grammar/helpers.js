export function make_keyword(word) {
  let str = "";
  for (var i = 0; i < word.length; i++) {
    str = str + "[" + word.charAt(i).toLowerCase() + word.charAt(i).toUpperCase() + "]";
  }
  return new RegExp(str);
}

export function optional_parenthesis(node) {
  return prec.right(
    choice(
      node,
      wrapped_in_parenthesis(node),
    ),
  )
}

export function wrapped_in_parenthesis(node) {
  if (node) {
    return seq("(", node, ")");
  }
  return seq("(", ")");
}

export function comma_list(field, requireFirst) {
  let sequence = seq(field, repeat(seq(',', field)));

  if (requireFirst) {
    return sequence;
  }

  return optional(sequence);
}

export function paren_list(field, requireFirst) {
  return wrapped_in_parenthesis(
    comma_list(field, requireFirst),
  )
}

// Tree-sitter's parse-table size depends on the order of the rules in grammar.json: the same grammar
// builds 9k or 24k states depending on it (the greedy state merging follows rule order). Composing a
// grammar from many spread files makes the natural order arbitrary, so every grammar applies one
// canonical order: `program` first, then the keyword rules, then everything else, then the `_identifier`
// word token last, each group alphabetical. Lexical ties go to the earlier token, so every keyword and
// inline pattern beats the identifier pattern.
export function canonicalOrder(g) {
  const rules = g.grammar.rules;
  const rank = (n) => (n === 'program' ? 0 : n.startsWith('keyword_') ? 1 : n === '_identifier' ? 3 : 2);
  const names = Object.keys(rules).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  g.grammar.rules = Object.fromEntries(names.map((n) => [n, rules[n]]));
  return g;
}
