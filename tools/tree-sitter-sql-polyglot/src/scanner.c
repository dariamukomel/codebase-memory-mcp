#include "tree_sitter/parser.h"
#include <stdlib.h>
#include <string.h>
#include <wctype.h>

enum TokenType {
  POSITION_CALL,
  POSITION_REGEX_CALL,
  SUBSTRING_REGEX_CALL,
  DOLLAR_QUOTED_STRING_START_TAG,
  DOLLAR_QUOTED_STRING_END_TAG,
  DOLLAR_QUOTED_STRING
};

#define MALLOC_STRING_SIZE 1024

typedef struct LexerState {
  char* start_tag;
} LexerState;

void *tree_sitter_sql_external_scanner_create() {
  LexerState *state = malloc(sizeof(LexerState));
  state->start_tag = NULL;
  return state;
}

void tree_sitter_sql_external_scanner_destroy(void *payload) {
  LexerState *state = (LexerState*)payload;
  if (state->start_tag != NULL) {
    free(state->start_tag);
    state->start_tag = NULL;
  }
  free(payload);
}

static char* add_char(char* text, size_t* text_size, char c, int index) {
  if (text == NULL) {
    text = malloc(sizeof(char) * MALLOC_STRING_SIZE);
    *text_size = MALLOC_STRING_SIZE;
  }

  // will break when indexes advances more than MALLOC_STRING_SIZE
  if ((size_t)index + 1 >= *text_size) {
    size_t old_size = *text_size;
    *text_size += MALLOC_STRING_SIZE;
    char* tmp = malloc(*text_size * sizeof(char));
    memcpy(tmp, text, old_size);
    free(text);
    text = tmp;
  }

  text[index] = c;
  text[index + 1] = '\0';
  return text;
}

// text_size lives on the stack, not the heap. Scanning the body of a dollar-quoted
// string calls this function once per input character (see the DOLLAR_QUOTED_STRING
// loop below, which advances one character and retries whenever no tag is found), and
// the overwhelmingly common case returns at the very first `if` without ever touching
// the buffer. Heap-allocating the size counter made that hot path pay a malloc/free
// per character of every dollar-quoted body.
static char* scan_dollar_string_tag(TSLexer *lexer) {
  char* tag = NULL;
  int index = 0;
  size_t text_size = 0;
  if (lexer->lookahead == '$') {
    tag = add_char(tag, &text_size, '$', index);
    lexer->advance(lexer, false);
  } else {
    return NULL;
  }

  while (lexer->lookahead != '$' && !iswspace(lexer->lookahead) && !lexer->eof(lexer)) {
    tag = add_char(tag, &text_size, lexer->lookahead, ++index);
    lexer->advance(lexer, false);
  }

  if (lexer->lookahead == '$') {
    tag = add_char(tag, &text_size, lexer->lookahead, ++index);
    lexer->advance(lexer, false);
    return tag;
  } else {
    free(tag);
    return NULL;
  }
}


// ISO 9075 <character position expression>: POSITION ( needle IN haystack [USING ...] ), and the
// regex functions POSITION_REGEX / SUBSTRING_REGEX that share the shape.
// POSITION is an ISO reserved word, but dialects use `position` as a column name and as an ordinary
// function (position(a, b)). A keyword token cannot serve both, so this token is produced only for
// the ISO shape: the word `position`, optional whitespace, `(`, and a top-level IN before the
// matching `)`. In every other position the word stays an identifier. The token is just the word;
// the lookahead past it is not part of the token.
static bool is_word_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '$';
}

static bool scan_position_call(TSLexer *lexer, const bool *valid_symbols) {
  // The word: position, position_regex or substring_regex (case-insensitive).
  char word[20];
  int len = 0;
  while (is_word_char(lexer->lookahead)) {
    if (len >= 19) return false;
    int32_t c = lexer->lookahead;
    word[len++] = (char)(c >= 'A' && c <= 'Z' ? c + ('a' - 'A') : c);
    lexer->advance(lexer, false);
  }
  word[len] = '\0';
  int symbol;
  if (strcmp(word, "position") == 0 && valid_symbols[POSITION_CALL]) symbol = POSITION_CALL;
  else if (strcmp(word, "position_regex") == 0 && valid_symbols[POSITION_REGEX_CALL]) symbol = POSITION_REGEX_CALL;
  else if (strcmp(word, "substring_regex") == 0 && valid_symbols[SUBSTRING_REGEX_CALL]) symbol = SUBSTRING_REGEX_CALL;
  else return false;
  lexer->mark_end(lexer);
  lexer->result_symbol = symbol;

  while (iswspace(lexer->lookahead)) lexer->advance(lexer, false);
  if (lexer->lookahead != '(') return false;
  lexer->advance(lexer, false);

  int depth = 1;
  int scanned = 0;
  while (!lexer->eof(lexer) && scanned++ < 4096) {
    int32_t c = lexer->lookahead;
    if (c == '\'' || c == '"') {
      int32_t quote = c;
      lexer->advance(lexer, false);
      while (!lexer->eof(lexer) && lexer->lookahead != quote) lexer->advance(lexer, false);
      if (lexer->eof(lexer)) return false;
      lexer->advance(lexer, false);
    } else if (c == '(') {
      depth++;
      lexer->advance(lexer, false);
    } else if (c == ')') {
      if (--depth == 0) return false;
      lexer->advance(lexer, false);
    } else if (c == ';') {
      return false;
    } else if (is_word_char(c)) {
      char buf[3] = {0, 0, 0};
      int len = 0;
      while (is_word_char(lexer->lookahead)) {
        if (len < 2) buf[len] = (char)(lexer->lookahead >= 'A' && lexer->lookahead <= 'Z' ? lexer->lookahead + 32 : lexer->lookahead);
        len++;
        lexer->advance(lexer, false);
      }
      if (depth == 1 && len == 2 && buf[0] == 'i' && buf[1] == 'n') return true;
    } else {
      lexer->advance(lexer, false);
    }
  }
  return false;
}

bool tree_sitter_sql_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  LexerState *state = (LexerState*)payload;
  if (valid_symbols[POSITION_CALL] || valid_symbols[POSITION_REGEX_CALL] || valid_symbols[SUBSTRING_REGEX_CALL]) {
    while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);
    int32_t first = lexer->lookahead;
    if (first == 'p' || first == 'P' || first == 's' || first == 'S') {
      // Once the word has been consumed no other external token can match from here (the other
      // tokens start with '$'), so the result of this scan is final.
      return scan_position_call(lexer, valid_symbols);
    }
  }
  if (valid_symbols[DOLLAR_QUOTED_STRING_START_TAG] && state->start_tag == NULL) {
    while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);

    char* start_tag = scan_dollar_string_tag(lexer);
    if (start_tag == NULL) {
      return false;
    }
    if (state->start_tag != NULL) {
      free(state->start_tag);
      state->start_tag = NULL;
    }
    state->start_tag = start_tag;
    lexer->result_symbol = DOLLAR_QUOTED_STRING_START_TAG;
    return true;
  }

  if (valid_symbols[DOLLAR_QUOTED_STRING_END_TAG] && state->start_tag != NULL) {
    while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);

    char* end_tag = scan_dollar_string_tag(lexer);
    if (end_tag != NULL && strcmp(end_tag, state->start_tag) == 0) {
      free(state->start_tag);
      state->start_tag = NULL;
      lexer->result_symbol = DOLLAR_QUOTED_STRING_END_TAG;
      free(end_tag);
      return true;
    }
    if (end_tag != NULL) {
      free(end_tag);
    }
    return false;
  }

  if (valid_symbols[DOLLAR_QUOTED_STRING]) {
    lexer->mark_end(lexer);
    while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);

    char* start_tag = scan_dollar_string_tag(lexer);
    if (start_tag == NULL) {
      return false;
    }

    if (state->start_tag != NULL && strcmp(state->start_tag, start_tag) == 0) {
      return false;
    }

    char* end_tag = NULL;
    while (true) {
      if (lexer->eof(lexer)) {
        free(start_tag);
        free(end_tag);
        return false;
      }

      end_tag = scan_dollar_string_tag(lexer);
      if (end_tag == NULL) {
        lexer->advance(lexer, false);
        continue;
      }

      if (strcmp(end_tag, start_tag) == 0) {
        free(start_tag);
        free(end_tag);
        lexer->mark_end(lexer);
        lexer->result_symbol = DOLLAR_QUOTED_STRING;
        return true;
      }

      free(end_tag);
      end_tag = NULL;
    }
  }

  return false;
}

unsigned tree_sitter_sql_external_scanner_serialize(void *payload, char *buffer) {
  LexerState *state = (LexerState *)payload;
  if (state == NULL || state->start_tag == NULL) {
    return 0;
  }
  // + 1 for the '\0'
  int tag_length = strlen(state->start_tag) + 1;
  if (tag_length >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE) {
    return 0;
  }

  memcpy(buffer, state->start_tag, tag_length);
  if (state->start_tag != NULL) {
    free(state->start_tag);
    state->start_tag = NULL;
  }
  return tag_length;
}

void tree_sitter_sql_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  LexerState *state = (LexerState *)payload;
  // Tree-sitter can restore the same scanner repeatedly while exploring GLR
  // branches. Release the previous serialized tag before replacing it.
  free(state->start_tag);
  state->start_tag = NULL;
  // A length of 1 can't exists.
  if (length > 1) {
    state->start_tag = malloc(length);
    memcpy(state->start_tag, buffer, length);
  }
}
