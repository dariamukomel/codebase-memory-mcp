#include "tree_sitter/parser.h"
#include <stdlib.h>
#include <string.h>
#include <wctype.h>

enum TokenType {
  DOLLAR_QUOTED_STRING_START_TAG,
  DOLLAR_QUOTED_STRING_END_TAG,
  DOLLAR_QUOTED_STRING
};

typedef struct LexerState {
  char start_tag[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
  unsigned start_tag_length;
} LexerState;

void *tree_sitter_sql_external_scanner_create() {
  return calloc(1, sizeof(LexerState));
}

void tree_sitter_sql_external_scanner_destroy(void *payload) {
  free(payload);
}

static bool scan_dollar_string_tag(TSLexer *lexer, char *tag, unsigned *length) {
  unsigned index = 0;
  if (lexer->lookahead != '$') return false;
  tag[index++] = '$';
  lexer->advance(lexer, false);

  while (lexer->lookahead != '$' && !iswspace(lexer->lookahead) && !lexer->eof(lexer)) {
    if (index + 1 >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return false;
    tag[index++] = (char)lexer->lookahead;
    lexer->advance(lexer, false);
  }

  if (lexer->lookahead != '$' || index + 1 >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE) {
    return false;
  }
  tag[index++] = '$';
  tag[index] = '\0';
  lexer->advance(lexer, false);
  *length = index;
  return true;
}

bool tree_sitter_sql_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  LexerState *state = (LexerState*)payload;
  if (valid_symbols[DOLLAR_QUOTED_STRING_START_TAG] && state->start_tag_length == 0) {
    while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);

    unsigned length = 0;
    if (!scan_dollar_string_tag(lexer, state->start_tag, &length)) return false;
    state->start_tag_length = length;
    lexer->result_symbol = DOLLAR_QUOTED_STRING_START_TAG;
    return true;
  }

  if (valid_symbols[DOLLAR_QUOTED_STRING_END_TAG] && state->start_tag_length != 0) {
    while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);

    char end_tag[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
    unsigned end_length = 0;
    if (scan_dollar_string_tag(lexer, end_tag, &end_length) &&
        end_length == state->start_tag_length &&
        memcmp(end_tag, state->start_tag, end_length) == 0) {
      state->start_tag_length = 0;
      state->start_tag[0] = '\0';
      lexer->result_symbol = DOLLAR_QUOTED_STRING_END_TAG;
      return true;
    }
    return false;
  }

  if (valid_symbols[DOLLAR_QUOTED_STRING]) {
    lexer->mark_end(lexer);
    while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);

    char start_tag[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
    unsigned start_length = 0;
    if (!scan_dollar_string_tag(lexer, start_tag, &start_length)) return false;

    if (state->start_tag_length == start_length && start_length != 0 &&
        memcmp(state->start_tag, start_tag, start_length) == 0) {
      return false;
    }

    char end_tag[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];
    while (true) {
      if (lexer->eof(lexer)) {
        return false;
      }

      unsigned end_length = 0;
      if (!scan_dollar_string_tag(lexer, end_tag, &end_length)) {
        lexer->advance(lexer, false);
        continue;
      }

      if (end_length == start_length && memcmp(end_tag, start_tag, start_length) == 0) {
        lexer->mark_end(lexer);
        lexer->result_symbol = DOLLAR_QUOTED_STRING;
        return true;
      }
    }
  }

  return false;
}

unsigned tree_sitter_sql_external_scanner_serialize(void *payload, char *buffer) {
  LexerState *state = (LexerState *)payload;
  if (state == NULL || state->start_tag_length == 0) return 0;
  memcpy(buffer, state->start_tag, state->start_tag_length);
  return state->start_tag_length;
}

void tree_sitter_sql_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  LexerState *state = (LexerState *)payload;
  state->start_tag_length = 0;
  state->start_tag[0] = '\0';
  if (buffer == NULL || length == 0 || length >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return;
  memcpy(state->start_tag, buffer, length);
  state->start_tag[length] = '\0';
  state->start_tag_length = length;
}
