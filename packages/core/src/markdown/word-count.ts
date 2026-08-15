/**
 * CJK-aware word counting over a note's plain text (Stats page).
 *
 * "Word" has no whitespace delimiter in Han/kana/Hangul running text, so each
 * CJK character counts as one word and the non-CJK remainder is counted as
 * whitespace-separated tokens — the convention word processors use for mixed
 * Chinese/English text. Tokens without a single letter or digit (bare dashes,
 * punctuation) are not words.
 */

const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu

const HAS_WORD_CHAR_RE = /[\p{L}\p{N}]/u

/**
 * Count the words in `text` (a plain-text rendering, e.g. `ParsedNote.text`).
 * Each CJK character is one word; everything else counts by whitespace-separated
 * tokens that contain at least one letter or digit.
 */
export function countWords(text: string): number {
  if (text === '') {
    return 0
  }
  const cjkChars = text.match(CJK_CHAR_RE)
  const remainder = text.replace(CJK_CHAR_RE, ' ')
  const tokens = remainder.split(/\s+/).filter((token) => HAS_WORD_CHAR_RE.test(token))
  return (cjkChars?.length ?? 0) + tokens.length
}
