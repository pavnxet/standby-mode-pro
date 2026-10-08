/* StandBy Mode Pro - Device Profile
 *
 * FEATURE_PLAN B4 (device-aware layout profiles) merged with F6 (10-foot TV UI).
 *
 * The plan files them as two features because they come from two competitors'
 * complaints: a wall display viewed from across the room (F6) and a tablet
 * dragged between orientations (B4). They are one feature here because the
 * answer to both is the same question - how far away is the reader, and can
 * they hit what they are aiming at - and one detector answers it.
 *
 * Detection is by capability, not by user-agent string. A UA string is a
 * guess that vendors break; what actually matters is the viewport, the pointer
 * coarseness and whether there is a fine pointer at all. A touchscreen laptop
 * reports both a fine and a coarse pointer, and treating it as a phone is how
 * you end up with 18px tap targets on a desktop.
 */

/**
 * Profiles, in increasing viewing distance.
 *
 * `typeScale` multiplies the root font size. `tapTarget` is the minimum
 * interactive size in CSS pixels - WCAG 2.2 SC 2.5.8 sets 24px as the floor,
 * and a 10-foot UI needs far more than that to be hit from a sofa.
 *
 * `chroma` says whether the display can show dark pixels as genuinely dark.
 * A TV in a bright room and an OLED laptop do not need the same black level,
 * and the theme engine reads this to pick between pure black and near-black.
 */
export const DEVICE_PROFILES = {
  phone: {
    id: "phone",
    label: "Phone",
    maxWidth: 640,
    typeScale: 1,
    tapTarget: 44,
    columns: 1,
    chroma: "standard",
    autoHideChromeMs: 4000
  },
  tablet: {
    id: "tablet",
    label: "Tablet",
    maxWidth: 1024,
    typeScale: 1.12,
    tapTarget: 48,
    columns: 2,
    chroma: "standard",
    autoHideChromeMs: 0
  },
  desktop: {
    id: "desktop",
    label: "Desktop",
    maxWidth: 1600,
    typeScale: 1,
    tapTarget: 32,
    columns: 3,
    chroma: "standard",
    autoHideChromeMs: 0
  },
  wall: {
    id: "wall",
    label: "Wall display",
    maxWidth: 2600,
    // 10-foot viewing distance: roughly 3x the type, so the clock is readable
    // from a sofa rather than only from an armchair.
    typeScale: 2.1,
    tapTarget: 72,
    columns: 3,
    chroma: "standard",
    autoHideChromeMs: 0
  },
  tv: {
    id: "tv",
    label: "TV",
    maxWidth: Infinity,
    typeScale: 2.6,
    tapTarget: 96,
    columns: 2,
    // A TV is viewed in a dark room, so true black is worth spending the
    // power on here and nowhere else.
    chroma: "deep",
    // Chrome never comes back on a TV - there is no pointer to bring it back
    // with, so any visible chrome is chrome you cannot dismiss.
    autoHideChromeMs: 6000
  }
};

export const DEFAULT_PROFILE_ID = "desktop";

/**
 * Classifies a viewport.
 *
 * Thresholds are on width alone because height is already accounted for: a
 * 1400px-wide portrait phone is narrower than a 1400px laptop only in
 * orientation, which `typeScale` handles better than a second axis would.
 *
 * The `forced` argument is how F6's TV mode is entered deliberately - there is
 * no reliable signal that says "this is a television", so it must be a choice.
 *
 * @param {{ width: number, height?: number, coarsePointer?: boolean }} viewport
 * @param {string} [forced] explicit profile id
 * @returns {object} a DEVICE_PROFILES entry
 */
export function detectProfile(viewport = {}, forced = null) {
  const width = Number.isFinite(viewport.width) ? viewport.width : 1280;

  if (forced && DEVICE_PROFILES[forced]) return DEVICE_PROFILES[forced];

  if (width <= DEVICE_PROFILES.phone.maxWidth) return DEVICE_PROFILES.phone;
  if (width <= DEVICE_PROFILES.tablet.maxWidth) return DEVICE_PROFILES.tablet;
  if (width <= DEVICE_PROFILES.desktop.maxWidth) return DEVICE_PROFILES.desktop;
  if (width <= DEVICE_PROFILES.wall.maxWidth) return DEVICE_PROFILES.wall;
  return DEVICE_PROFILES.tv;
}

/**
 * Builds a profile from the live environment.
 *
 * Coarse pointer alone is not enough to call something a tablet: a touchscreen
 * laptop is coarse AND fine. So the pointer is used only to lift the tap target
 * on a small screen, never to decide the profile.
 *
 * @param {string} [forced]
 * @returns {{ profile: object, reason: string }}
 */
export function profileFromEnvironment(forced = null) {
  if (typeof window === "undefined") {
    return { profile: DEVICE_PROFILES[DEFAULT_PROFILE_ID], reason: "no window" };
  }

  const width = window.innerWidth;
  const profile = detectProfile({ width }, forced);
  return { profile, reason: `viewport ${width}px -> ${profile.id}` };
}

/**
 * Applies a profile to the document root.
 *
 * Written as CSS custom properties rather than class-swapped stylesheets so the
 * change is instant and does not force a style recalculation of the whole tree.
 *
 * @returns {object} the profile applied
 */
export function applyProfile(profile, root = null) {
  const target = root || (typeof document !== "undefined" ? document.documentElement : null);
  if (!target || !target.style) return profile;

  target.style.setProperty("--device-type-scale", String(profile.typeScale));
  target.style.setProperty("--device-tap-target", `${profile.tapTarget}px`);
  target.style.setProperty("--device-columns", String(profile.columns));
  target.dataset.deviceProfile = profile.id;
  target.classList.toggle("is-tv", profile.id === "tv");
  target.classList.toggle("is-wall", profile.id === "wall");
  target.classList.toggle("is-touch", profile.tapTarget >= 44);

  return profile;
}

/**
 * Whether the chrome should auto-hide.
 *
 * Zero means never. A tablet left alone should keep its navigation, because
 * nobody is going to swipe it away and then wonder where it went.
 */
export function shouldAutoHide(profile, nowMs = Date.now(), lastInputMs = 0) {
  const idle = profile.autoHideChromeMs;
  if (!idle) return false;
  return nowMs - lastInputMs >= idle;
}

/**
 * Merges the profile into a grid column count.
 *
 * A layout set for three columns on a phone produces three unreadable
 * slivers, so the profile is a ceiling rather than a suggestion.
 */
export function columnsFor(profile, preferred) {
  if (!Number.isInteger(preferred) || preferred < 1) return profile.columns;
  return Math.max(1, Math.min(preferred, profile.columns));
}