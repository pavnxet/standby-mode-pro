/* Word-clock phrase builder
 *
 * Extracted so the grammar can be unit-tested without a DOM. Handles the
 * awkward cases that make a naive implementation read wrong:
 *
 *  - "quarter to eight", not "quarter of eight"
 *  - 12-hour wrap: 00:07 is "seven minutes past twelve", not "...past zero"
 *  - 24-hour midnight and noon read naturally
 *  - exactly on the hour omits the minutes entirely
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen"
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];

/** 0-59 as English words, e.g. 42 -> "forty-two". */
export function numberToWords(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 20) return ONES[n];
  if (n < 60) {
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    return ones ? `${tens}-${ONES[ones]}` : tens;
  }
  // Beyond an hour, spell out fully rather than producing nonsense.
  if (n < 100) return `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}`;
  return String(n);
}

function hourWord(hour24) {
  const h = ((hour24 % 24) + 24) % 24;
  // 0 and 24 both mean midnight; 12 means noon.
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return ONES[h];
}

/** The hour as it will be spoken: 23 -> "eleven" for "quarter to midnight". */
function nextHourWord(hour24) {
  return hourWord((hour24 + 1) % 24);
}

/**
 * Builds the spoken phrase.
 *
 * AM/PM is deliberately NOT folded into the sentence. "It is half past six in
 * the afternoon" reads like a translation; the face renders AM/PM as its own
 * line instead, which is both grammatical and legible from across a room.
 *
 * @param {{ hours: number, minutes: number, is24?: boolean }} input
 *   `hours` must be the raw 0-23 hour. Passing an already-numeral-converted
 *   string yields NaN and an empty phrase.
 * @returns {string} e.g. "quarter to eight", "twelve past ten", "half past six"
 */
export function wordsFor({ hours, minutes, is24 = false }) {
  const hour24 = ((Number(hours) % 24) + 24) % 24;
  if (!Number.isFinite(hour24)) return "";

  const mins = Math.max(0, Math.min(59, Number(minutes) || 0));

  // 24-hour mode names the hour directly ("nineteen", "midnight"); 12-hour mode
  // cycles 1-12.
  const baseHour = is24 ? hour24 : hour24 % 12 === 0 ? 12 : hour24 % 12;
  const baseWord = is24 ? hourWord(baseHour) : ONES[baseHour];

  // The hour the "to" branch counts forward to. In 12-hour mode this has to
  // wrap 12 -> 1, so it is computed off the 12-hour value rather than off
  // baseHour + 1, which would produce "thirteen".
  const nextWord = is24
    ? nextHourWord(hour24)
    : ONES[(baseHour % 12) + 1];

  if (mins === 0) {
    if (hour24 === 0) return "midnight";
    if (hour24 === 12) return "noon";
    return baseWord;
  }

  if (mins === 15) return `quarter past ${baseWord}`;
  if (mins === 30) return `half past ${baseWord}`;
  if (mins === 45) return `quarter to ${nextWord}`;

  if (mins < 30) return `${numberToWords(mins)} past ${baseWord}`;

  const remaining = 60 - mins;
  if (remaining === 15) return `quarter to ${nextWord}`;
  return `${numberToWords(remaining)} to ${nextWord}`;
}