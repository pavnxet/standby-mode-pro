/* StandBy Mode Pro - Ambience Catalogue
 *
 * FEATURE_PLAN.md E1 (procedural vibes) and E2 (multi-layer mixer) pure logic.
 *
 * Why this file exists separately from the engine: every entry here is
 * metadata, and metadata is what the picker, the mixer and the tests all need
 * to agree on. Putting it in soundEngine.js would mean the tests had to
 * instantiate an AudioContext to check a list of names.
 *
 * Every ambience is GENERATED, not sampled. That is the whole point of E1:
 * seven new sounds at zero bandwidth. A sample-based equivalent would add
 * megabytes for audio nobody can download in this app's privacy model.
 *
 * `group` is not cosmetic. Brown noise and its variants are used to mask
 * sound, rain and cafe to mask *conversation*, and thunderstorm is a
 * foreground sound rather than a masker - treating them as interchangeable
 * would put a thunderstorm in a "mask conversation" preset.
 */

/**
 * Every ambience, in picker order.
 *
 * `defaultMix` is the per-layer gain applied on first play, in 0..1. These are
 * chosen so a full mix of any three sits at a comfortable level: several
 * layers at 0.5 sum to more than one at the master gain, so the values are
 * deliberately conservative and the master limiter does the rest.
 *
 * `requiresHeadphones` marks binaural, which is genuinely only correct on
 * headphones. Presenting it as an ordinary ambience would be a quiet lie.
 */
export const AMBIENCES = [
  {
    id: "rain",
    label: "Rain",
    group: "masker",
    description: "Steady rain on a window.",
    defaultMix: 0.5,
    base: "pink"
  },
  {
    id: "waves",
    label: "Waves",
    group: "masker",
    description: "Slow surf, rising and falling.",
    defaultMix: 0.45,
    base: "pink"
  },
  {
    id: "forest",
    label: "Forest",
    group: "masker",
    description: "Wind through leaves with birdsong.",
    defaultMix: 0.4,
    base: "pink"
  },
  {
    id: "wind",
    label: "Wind",
    group: "masker",
    description: "Broadband wind with slow gusting.",
    defaultMix: 0.4,
    base: "brown"
  },
  {
    id: "fire",
    label: "Fire",
    group: "ambience",
    description: "A crackling hearth.",
    defaultMix: 0.4,
    base: "brown"
  },
  {
    id: "thunderstorm",
    label: "Thunder",
    group: "ambience",
    description: "Distant thunder over rain.",
    defaultMix: 0.35,
    base: "brown"
  },
  {
    id: "cafe",
    label: "Café",
    group: "masker",
    description: "Filtered chatter. Best at masking voices.",
    defaultMix: 0.35,
    base: "pink"
  },
  {
    id: "brownnoise",
    label: "Brown noise",
    group: "noise",
    description: "Deep, even rumble.",
    defaultMix: 0.4,
    base: "brown"
  },
  {
    id: "brownnoiseplus",
    label: "Brown noise +",
    group: "noise",
    description: "Brown noise with a low sine undertone.",
    defaultMix: 0.35,
    base: "brown"
  },
  {
    id: "noise",
    label: "Pink noise",
    group: "noise",
    description: "Softer than white, flatter than brown.",
    defaultMix: 0.4,
    base: "pink"
  },
  {
    id: "vinyl",
    label: "Vinyl",
    group: "ambience",
    description: "Surface noise of a record.",
    defaultMix: 0.3,
    base: "pink"
  },
  {
    id: "binaural",
    label: "Binaural beat",
    group: "focus",
    description: "6 Hz beat between two tones. Headphones only.",
    defaultMix: 0.25,
    requiresHeadphones: true,
    base: "sine"
  }
];

export const AMBIENCE_IDS = AMBIENCES.map((a) => a.id);

/** Groups, in picker order, for the "what do I want" filter. */
export const AMBIENCE_GROUPS = [
  { id: "masker", label: "Masks sound" },
  { id: "ambience", label: "Background" },
  { id: "noise", label: "Noise" },
  { id: "focus", label: "Focus" }
];

/**
 * Looks an ambience up.
 * @returns {object|null} null rather than a throw, so a stale persisted id
 *   renders an explicit "unavailable" state instead of a blank widget.
 */
export function findAmbience(id) {
  return AMBIENCES.find((a) => a.id === id) || null;
}

export function isKnownAmbience(id) {
  return AMBIENCE_IDS.includes(id);
}

/**
 * Clamps a per-layer mix to 0..1.
 *
 * Shared by the engine and the store so a volume of 1.4 is clamped in exactly
 * one place. `Number()` is used deliberately: a range input yields a string,
 * and NaN falls back to the default rather than silently becoming 0 (silence
 * from a typo is the worse failure).
 */
export function clampMix(value, fallback = 0.4) {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

/**
 * The default mix for a set of layers.
 *
 * Returns a complete map for every known ambience so a caller's UI can render
 * one row per layer without checking which are present.
 *
 * @param {string[]} ids
 * @returns {Record<string, number>}
 */
export function defaultMixFor(ids = []) {
  const mix = {};
  for (const ambience of AMBIENCES) mix[ambience.id] = ambience.defaultMix;
  for (const id of ids) {
    const found = findAmbience(id);
    if (found) mix[id] = found.defaultMix;
  }
  return mix;
}

/**
 * Normalises a stored mix against the current catalogue.
 *
 * Two things happen here that both matter:
 *  - unknown ids are dropped, so removing an ambience in a later release does
 *    not leave a permanent dead slider;
 *  - missing ids are backfilled with their default, so a mix saved before an
 *    ambience existed still renders a row for it.
 */
export function normalizeMix(stored = {}, ids = AMBIENCE_IDS) {
  const out = {};
  for (const id of ids) {
    const found = findAmbience(id);
    out[id] = clampMix(stored ? stored[id] : undefined, found ? found.defaultMix : 0.4);
  }
  return out;
}

/**
 * Which layers are audible.
 *
 * Zero is off - a real distinction from "quiet".
 *
 * Only keys actually PRESENT in the mix are considered. An earlier version
 * tested every known id, which meant `clampMix(undefined)` supplied each
 * layer's default and `activeLayers({})` reported all twelve as active. That
 * is not cosmetic: the mixer uses this list to decide which layers to start,
 * so an empty mix would have started the entire catalogue.
 *
 * @param {Record<string, number>} mix
 * @returns {string[]}
 */
export function activeLayers(mix = {}) {
  if (!mix || typeof mix !== "object") return [];
  return AMBIENCE_IDS.filter(
    (id) => Object.prototype.hasOwnProperty.call(mix, id) && clampMix(mix[id]) > 0.001
  );
}

/** Human group label, or the raw id when unknown. */
export function groupLabel(groupId) {
  const found = AMBIENCE_GROUPS.find((g) => g.id === groupId);
  return found ? found.label : String(groupId || "Other");
}

/**
 * Ambiences worth warning about.
 *
 * Binaural only works correctly on headphones - the beat is an interaural
 * difference, and on speakers it collapses into a tone. Surfacing that as a
 * one-time note is more honest than a footnote nobody reads.
 */
export function headphoneWarnings(ids = []) {
  return ids
    .map((id) => findAmbience(id))
    .filter((a) => a && a.requiresHeadphones)
    .map((a) => `${a.label} only works properly on headphones.`);
}

/** Presets. Each is a deliberate mixture, not a random subset. */
export const MIX_PRESETS = [
  { id: "focus", label: "Focus", layers: ["noise", "rain"], detail: "Even, no transients." },
  { id: "sleep", label: "Sleep", layers: ["brownnoise", "rain"], detail: "Deep and steady." },
  { id: "mask-voices", label: "Mask voices", layers: ["cafe", "rain", "wind"], detail: "Chatter plus broadband." },
  { id: "unwind", label: "Unwind", layers: ["waves", "fire"], detail: "Slow and warm." },
  { id: "storm", label: "Storm", layers: ["thunderstorm", "wind", "brownnoise"], detail: "Weather." },
  { id: "silence", label: "Silence", layers: [], detail: "Stop everything." }
];

export function findPreset(id) {
  return MIX_PRESETS.find((p) => p.id === id) || null;
}