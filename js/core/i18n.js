/* StandBy Mode Pro - Internationalisation (H6)
 *
 * FEATURE_PLAN H6: "i18n Framework (English + Hindi minimum)". The plan names
 * `js/core/i18n.js` and no other detail, so the shape is a decision.
 *
 * Why not a library, and why not per-string gettext:
 *
 *  - A gettext `.po` pipeline is a build step, and this project ships raw ES
 *    modules with no build step at all. Adding one for translations would be the
 *    first toolchain dependency in the repo.
 *
 *  - A library (i18next and friends) is 10-40 KB of runtime for what amounts to a
 *    dictionary lookup plus interpolation. The CI size budget is already over, so
 *    the arithmetic is bad.
 *
 *  So: a dictionary, a lookup with an explicit missing-key path, and a small
 *  number of formatting helpers that delegate to Intl where they can - because
 *  Intl already does Hindi numerals and Devanagari dates correctly and
 *  reimplementing it would be both wrong and large.
 *
 * What this deliberately does NOT do:
 *
 *  - It does not translate the widgets' dynamic content (news headlines, market
 *    symbols, ICS event titles). That is other people's data, and presenting a
 *    machine-translated headline as the original would be a lie.
 *
 *  - It does not claim 100% coverage. English is complete; Hindi is complete for
 *    the interface chrome and deliberately partial elsewhere. A missing key
 *    renders in English rather than as an empty string, because a blank label is
 *    worse than an English one.
 *
 * Locale is a reader's setting, not a guess. `navigator.language` is used only as
 * the initial default, and the choice is persisted.
 */

import { store } from "../state/store.js";

/**
 * Supported locales.
 *
 * `nativeName` is what a speaker of that language reads, which is the only
 * sensible label in a language picker. "हिन्दी" is not spelled "Hindi" by anyone
 * who reads it.
 */
export const LOCALES = [
  { code: "en", label: "English", native: "English", complete: true },
  { code: "hi", label: "Hindi", native: "हिन्दी", complete: true }
];

export const DEFAULT_LOCALE = "en";

const SUPPORTED = new Set(LOCALES.map((l) => l.code));

/**
 * The dictionary.
 *
 * English is the source of truth and is complete. Anything absent from a locale
 * falls back to English, so adding a locale is safe and incremental.
 *
 * Keys are grouped by surface. Values are plain strings with `{name}` style
 * placeholders, interpolated by `t()`.
 */
const DICTIONARY = {
  en: {
    "nav.spaces": "Spaces",
    "nav.previous": "Previous space",
    "nav.next": "Next space",

    "settings.title": "Settings",
    "settings.search": "Search settings",
    "settings.general": "General",
    "settings.display": "Display",
    "settings.audio": "Ambient sound",
    "settings.layout": "Layout",
    "settings.data": "Backup and data",
    "settings.about": "About",

    "display.brightness": "Screen brightness",
    "display.nightMode": "Night mode",
    "display.theme": "Theme",
    "display.theme.dark": "Dark",
    "display.theme.light": "Light",
    "display.theme.amoled": "AMOLED black",
    "display.schedule": "Automatic dimming",
    "display.schedule.time": "By time of day",
    "display.schedule.solar": "By the sun where I am",
    "display.burnIn": "Burn-in protection",
    "display.burnIn.off": "Off",
    "display.burnIn.pixel": "Pixel shift",
    "display.burnIn.checkerboard": "Checkerboard",
    "display.burnIn.edge": "Edge crop",
    "display.burnIn.static": "Static dim",

    "audio.mixer": "Ambient mixer",
    "audio.layers": "Layers",
    "audio.sleepTimer": "Sleep timer",
    "audio.stop": "Stop all ambient sound",

    "layout.edit": "Edit layout",
    "layout.drag": "Drag to reorder",
    "layout.span": "Tile size",
    "layout.presets": "Presets",
    "layout.undo": "Undo",
    "layout.redo": "Redo",
    "layout.widgets": "Widgets",

    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.close": "Close",
    "common.done": "Done",
    "common.remove": "Remove",
    "common.add": "Add",
    "common.retry": "Try again",
    "common.on": "On",
    "common.off": "Off",
    "common.loading": "Loading…",
    "common.unavailable": "Not available here",

    "status.online": "Online",
    "status.offline": "Offline - showing saved data",

    "visits.label": "Visits",
    "visits.hint": "Times you have opened this app on this device. Nothing is sent anywhere."
  },

  hi: {
    "nav.spaces": "स्पेस",
    "nav.previous": "पिछला स्पेस",
    "nav.next": "अगला स्पेस",

    "settings.title": "सेटिंग्स",
    "settings.search": "सेटिंग्स खोजें",
    "settings.general": "सामान्य",
    "settings.display": "डिस्प्ले",
    "settings.audio": "ध्वनि",
    "settings.layout": "लेआउट",
    "settings.data": "बैकअप और डेटा",
    "settings.about": "परिचय",

    "display.brightness": "स्क्रीन की चमक",
    "display.nightMode": "रात का मोड",
    "display.theme": "थीम",
    "display.theme.dark": "डार्क",
    "display.theme.light": "लाइट",
    "display.theme.amoled": "एमोलेड काला",
    "display.schedule": "स्वचालित डिमिंग",
    "display.schedule.time": "दिन के समय से",
    "display.schedule.solar": "जहाँ आप हैं वहाँ सूर्य से",
    "display.burnIn": "बर्न-इन सुरक्षा",
    "display.burnIn.off": "बंद",
    "display.burnIn.pixel": "पिक्सल शिफ्ट",
    "display.burnIn.checkerboard": "चेकरबोर्ड",
    "display.burnIn.edge": "एज क्रॉप",
    "display.burnIn.static": "स्थिर डिम",

    "audio.mixer": "ध्वनि मिक्सर",
    "audio.layers": "परतें",
    "audio.sleepTimer": "स्लीप टाइमर",
    "audio.stop": "सारी ध्वनि रोकें",

    "layout.edit": "लेआउट संपादित करें",
    "layout.drag": "क्रम बदलने के लिए खींचें",
    "layout.span": "टाइल का आकार",
    "layout.presets": "प्रीसेट",
    "layout.undo": "पूर्ववत",
    "layout.redo": "फिर से",
    "layout.widgets": "विजेट",

    "common.cancel": "रद्द",
    "common.save": "सहेजें",
    "common.close": "बंद करें",
    "common.done": "पूर्ण",
    "common.remove": "हटाएँ",
    "common.add": "जोड़ें",
    "common.retry": "फिर कोशिश करें",
    "common.on": "चालू",
    "common.off": "बंद",
    "common.loading": "लोड हो रहा है…",
    "common.unavailable": "यहाँ उपलब्ध नहीं",

    "status.online": "ऑनलाइन",
    "status.offline": "ऑफ़लाइन — सहेजा डेटा दिखाया जा रहा है",

    "visits.label": "विज़िट",
    "visits.hint": "आपने इस ऐप को इस डिवाइस पर कितनी बार खोला। कुछ भी नहीं भेजा जाता।"
  }
};

/** The active locale, or the default. */
export function currentLocale() {
  const stored = store.getState().locale;
  return typeof stored === "string" && SUPPORTED.has(stored) ? stored : DEFAULT_LOCALE;
}

/** True when the locale has a dictionary, not just a picker entry. */
export function isSupported(code) {
  return SUPPORTED.has(code);
}

/**
 * Translates a key, falling back through the default locale.
 *
 * Returns the KEY itself when neither locale has it, rather than an empty string.
 * An empty label is invisible - a reader cannot tell a deliberate blank from a
 * broken translation - and the key at least shows up in review and in a
 * screenshot.
 *
 * @param {string} key
 * @param {Record<string,string|number>} [vars]
 * @returns {string}
 */
export function t(key, vars = null) {
  const locale = currentLocale();
  const template = DICTIONARY[locale]?.[key] ?? DICTIONARY[DEFAULT_LOCALE]?.[key];
  if (template === undefined) return key;

  if (!vars || typeof vars !== "object") return template;

  // `{name}` is replaced with the escaped value. A placeholder left in the output
  // would be visible to the reader; an unescaped value would be an XSS hole. Both
  // are worse than the other.
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (!(name in vars)) return match;
    const value = String(vars[name]);
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  });
}

/** Every key a locale is still missing, for a coverage report. */
export function missingKeys(code) {
  const source = Object.keys(DICTIONARY[DEFAULT_LOCALE]);
  const target = Object.keys(DICTIONARY[code] || {});
  return source.filter((key) => !target.includes(key));
}

/** A coverage figure, 0..1. Used by the language picker. */
export function coverage(code) {
  const source = Object.keys(DICTIONARY[DEFAULT_LOCALE]).length;
  if (!source) return 0;
  return (source - missingKeys(code).length) / source;
}

/**
 * Pick the initial locale from the browser, defaulting to English.
 *
 * Only the primary subtag is considered: `hi-IN`, `hi-Latn` and `hi` all mean
 * "use Hindi" for the purpose of a dictionary this size.
 *
 * This is the INITIAL default only. The reader can change it, and once they have,
 * their choice wins over every future `navigator.language`.
 */
export function detectLocale(browserLanguages = []) {
  for (const tag of browserLanguages) {
    const primary = String(tag || "").split("-")[0].toLowerCase();
    if (SUPPORTED.has(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/**
 * A number in the reader's locale.
 *
 * Delegates to Intl. Hindi uses Western digits in most contexts and Devanagari in
 * others depending on context and region, which is not a thing this project gets
 * to decide - Intl already encodes what the CLDR data says.
 */
export function formatNumber(value, options = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  try {
    return new Intl.NumberFormat(currentLocale(), options || undefined).format(numeric);
  } catch {
    return String(numeric);
  }
}

/**
 * A date in the reader's locale.
 *
 * `en-GB` gives 24-hour time daily; `hi-IN` gives Devanagari-rendered dates. None
 * of that is reimplemented here.
 */
export function formatDate(date, options = null) {
  const when = date instanceof Date ? date : new Date(Number(date));
  if (!Number.isFinite(when.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(currentLocale(), options || undefined).format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

/**
 * The HTML attributes for the locale.
 *
 * `lang` is what a screen reader uses to choose its pronunciation voice. Leaving
 * it as `en` while the interface is in Hindi means the screen reader reads Hindi
 * text with an English voice, which is unintelligible - so it has to be kept in
 * step with the dictionary, not with the browser default.
 */
export function localeAttributes(root = null) {
  const code = currentLocale();
  const target = root || (typeof document !== "undefined" ? document.documentElement : null);
  if (target) {
    target.setAttribute("lang", code);
    target.setAttribute("dir", "ltr");
  }
  return { lang: code, dir: "ltr" };
}

/** The language picker. */
export function renderLanguagePicker() {
  return `
    <div class="i18n-picker" role="radiogroup" aria-label="${escapeAttribute(t("settings.general"))}">
      ${LOCALES.map((locale) => {
        const selected = currentLocale() === locale.code;
        const pct = Math.round(coverage(locale.code) * 100);
        return `
          <button class="i18n-option${selected ? " i18n-option--on" : ""}" type="button"
                  role="radio" aria-checked="${selected}"
                  data-locale="${escapeAttribute(locale.code)}">
            <span class="i18n-native">${escapeHtml(locale.native)}</span>
            <span class="i18n-label">${escapeHtml(locale.label)}</span>
            <span class="i18n-coverage">${pct}%</span>
          </button>`;
      }).join("")}
    </div>
    <p class="i18n-note">
      The interface is translated. Content you have added - notes, events, feed
      headlines - stays exactly as you wrote it.
    </p>`;
}

/**
 * Local escape helpers.
 *
 * Duplicated rather than imported from `core/escape.js` to keep this module
 * importable from anywhere in the graph without a cycle. Two small functions.
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

/** Applies the locale to the document and persists it. */
export function applyLocale(code) {
  if (!isSupported(code)) return currentLocale();
  store.setLocale(code);
  localeAttributes();
  return code;
}
