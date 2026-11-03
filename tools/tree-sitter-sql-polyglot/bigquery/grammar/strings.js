export default {

  // Triple-double-quoted:  """multi-line string"""
  triple_double_quoted_string: _ => token(
    seq('"""', /([^"]|"[^"]|""[^"])*/, '"""'),
  ),

  // Triple-single-quoted:  '''another multi-line'''
  // Must use higher precedence than base _single_quote_string (prec 1)
  triple_single_quoted_string: _ => token(
    prec(2, seq("'''", /([^']|'[^']|''[^'])*/, "'''")),
  ),

};
