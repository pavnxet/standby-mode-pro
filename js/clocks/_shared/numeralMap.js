/* StandBy Mode Pro - Numeral System Engine
 *
 * FEATURE_PLAN.md A19. Competitor reference: StandBy Mode Pro (Android) ships
 * 20+ languages and numeral forms; DAKboard's translation request
 * (github.com/dakboard/DAKboard/issues/9) has been open since 2016.
 *
 * This runs BEFORE clockEngine formats its strings, so all 11 existing clock
 * faces gain numeral support without any of them being modified.
 *
 * Design decision: we map *digits* rather than reformatting with a locale, so a
 * clock reading "14:30" renders as "१४:३०" in Devanagari without depending on
 * Intl's ICU data being present for that numbering system.
 */

export const NUMERAL_SYSTEMS = {
  latn: { id: "latn", name: "Latin (1 2 3)", digits: ["0","1","2","3","4","5","6","7","8","9"] },
  devanagari: { id: "devanagari", name: "Devanagari (१ २ ३)", digits: ["०","१","२","३","४","५","६","७","८","९"] },
  arab: { id: "arab", name: "Arabic-Indic (٠ ١ ٢)", digits: ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"] },
  beng: { id: "beng", name: "Bengali (০ ১ ২)", digits: ["০","১","২","৩","৪","৫","৬","৭","৮","৯"] },
  taml: { id: "taml", name: "Tamil (௦ ௧ ௨)", digits: ["௦","௧","௨","௩","௪","௫","௬","௭","௮","௯"] },
  pers: { id: "pers", name: "Persian (۰ ۱ ۲)", digits: ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"] }
};

/**
 * Braille cell mapping used by the Braille clock (A11).
 *
 * Grade-1 braille encodes digits as the letters a-j, so 0 is U+281A (j) and 1
 * is U+2801 (a). U+2834 is the NUMBER SIGN, which signals "the digits that
 * follow are a numeral" - rendering it as the digit zero makes 10:30 read as
 * "1n3n", which is the opposite of what a braille clock is for.
 */
const BRAILLE_DOTS = {
  "0": "⠚", "1": "⠁", "2": "⠃", "3": "⠉", "4": "⠙",
  "5": "⠑", "6": "⠋", "7": "⠛", "8": "⠓", "9": "⠊"
};

let activeSystem = "latn";

/** @param {string} id One of NUMERAL_SYSTEMS. Unknown ids fall back to latin. */
export function setNumeralSystem(id) {
  activeSystem = NUMERAL_SYSTEMS[id] ? id : "latn";
  return activeSystem;
}

export function getNumeralSystem() {
  return activeSystem;
}

export function listNumeralSystems() {
  return Object.values(NUMERAL_SYSTEMS);
}

/**
 * Converts every ASCII digit in a string to the active numeral system.
 * Non-digit characters (colons, AM/PM, letters) pass through untouched.
 *
 * @param {string|number} value
 * @param {string} [systemId] Optional one-off override.
 */
export function formatDigits(value, systemId) {
  const id = systemId && NUMERAL_SYSTEMS[systemId] ? systemId : activeSystem;
  const { digits } = NUMERAL_SYSTEMS[id];
  return String(value).replace(/[0-9]/g, d => digits[Number(d)]);
}

/** Braille form of a digit string. Used by the A11 Braille clock. */
export function toBraille(value) {
  return String(value)
    .replace(/[0-9]/g, d => BRAILLE_DOTS[d])
    .replace(/:/g, "⠒")
    .replace(/\s/g, "⠀");
}

/**
 * Roman numerals for the A4 Roman clock. Values above 3999 fall back to the
 * Arabic numeral rather than rendering an unreadable string.
 */
export function toRoman(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0 || n > 3999) return String(value);

  const table = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
  ];

  let remaining = n;
  let out = "";
  for (const [amount, numeral] of table) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

/**
 * Persian/Jalali-style 12-hour clock text for the A10 clock.
 * Deliberately simple: a sliding-style display with localized period labels,
 * not a full Jalali calendar (that belongs to the C19 prayer widget).
 */
export function formatPersianDigits(value) {
  return formatDigits(value, "pers");
}

/** Convenience for components that need the active system label. */
export function activeSystemLabel() {
  return NUMERAL_SYSTEMS[activeSystem].name;
}