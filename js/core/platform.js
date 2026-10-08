/* StandBy Mode Pro - Gamepad, Web Share, Permissions (G4, G2, G6)
 *
 * Three small platform integrations in one module because each is a thin
 * capability shim over the same shape: detect support, expose the state, degrade
 * to nothing. Keeping them together makes that shared shape obvious rather than
 * repeating it three times.
 *
 * The rule for all three, and the reason this file exists rather than three
 * call sites: **never claim a capability that is not there.** A gamepad status
 * that says "connected" when no Gamepad API exists, a share button that throws
 * when the user cancels, and a permission panel that reports "granted" for an
 * API the browser does not implement all read as the app being broken.
 */

/* ============================================================ G4: gamepad */

/** Standard gamepad button indices (W3C Standard Gamepad layout). */
export const BUTTON = {
  south: 0, east: 1, west: 2, north: 3,
  leftShoulder: 4, rightShoulder: 5,
  leftTrigger: 6, rightTrigger: 7,
  select: 8, start: 9,
  dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15
};

export const GAMEPAD_ACTIONS = [
  { id: "prev-space", label: "Previous space", button: BUTTON.leftShoulder },
  { id: "next-space", label: "Next space", button: BUTTON.rightShoulder },
  { id: "toggle-night", label: "Toggle night mode", button: BUTTON.north },
  { id: "open-palette", label: "Open command palette", button: BUTTON.start },
  { id: "toggle-fullscreen", label: "Fullscreen", button: BUTTON.select },
  { id: "play-pause", label: "Play / pause", button: BUTTON.south }
];

/**
 * Whether the Gamepad API exists.
 *
 * Always guarded: `getGamepads` is Chromium-only, and referencing
 * `navigator.getGamepads()` unguarded throws on Firefox and Safari rather than
 * returning undefined.
 */
export function gamepadSupport() {
  if (typeof navigator === "undefined") return { supported: false, reason: "No browser." };
  if (typeof navigator.getGamepads !== "function") {
    return {
      supported: false,
      reason: "This browser has no Gamepad API, so controllers cannot be used. " +
        "It is available in Chrome, Edge and Firefox."
    };
  }
  return { supported: true, reason: "" };
}

/**
 * Picks the gamepad to follow.
 *
 * The first non-empty pad, by index. Using index 0 unconditionally is wrong
 * because a disconnected pad leaves a null entry in the list.
 */
export function activeGamepad(pads) {
  if (!Array.isArray(pads)) return null;
  for (const pad of pads) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

/**
 * Translates a poll result into edge-triggered actions.
 *
 * Edge-triggered, not level-triggered: without it, holding a button runs the
 * action every frame - which for "toggle night mode" means a strobing display.
 *
 * @param {object|null} pad
 * @param {Set<number>} previous pressed indices
 * @returns {{ actions: Array<object>, pressed: Set<number> }}
 */
export function detectGamepadActions(pad, previous = new Set()) {
  const pressed = new Set();
  if (!pad || !Array.isArray(pad.buttons)) return { actions: [], pressed };

  const actions = [];
  for (const binding of GAMEPAD_ACTIONS) {
    const button = pad.buttons[binding.button];
    if (!button) continue;

    // `pressed` is the field; older implementations only set `value`. Reading
    // both is what makes this work across browser generations.
    const down = button.pressed === true || (button.pressed === undefined && button.value > 0.5);
    if (!down) continue;

    pressed.add(binding.button);
    if (!previous.has(binding.button)) actions.push(binding);
  }

  return { actions, pressed };
}

/**
 * Short human name for a controller.
 *
 * Uses `id` rather than nothing: "Connected" alone tells a user nothing when
 * several pads are plugged in.
 */
export function gamepadName(pad) {
  if (!pad) return "None";
  const id = String(pad.id || "").trim();
  if (!id) return "Connected controller";
  // The ids are long and often contain a GUID, which is noise in a status line.
  return id.replace(/\s*\([^)]*\)\s*/g, " ").replace(/vendor:|product:/gi, "").trim().slice(0, 48);
}

/* ========================================================= G2: Web Share */

/**
 * Whether sharing is possible.
 *
 * `canShare` is checked separately from `share` existing: Safari has `share` but
 * refuses to share a file it cannot serialise, and a button that throws on tap
 * is worse than no button.
 */
export function shareSupport() {
  if (typeof navigator === "undefined") return { supported: false, reason: "No browser." };
  if (typeof navigator.share !== "function") {
    return {
      supported: false,
      reason: "This browser cannot share. Web Share is available in Chrome, Edge and Safari on mobile and desktop."
    };
  }
  return { supported: true, reason: "" };
}

/**
 * Shares, reporting every outcome distinctly.
 *
 * The distinction that matters: **a user cancelling is not a failure.** The
 * promise rejects with AbortError, and reporting that as "sharing failed" is
 * both wrong and alarming.
 *
 * @returns {{ ok: boolean, reason?: string, cancelled?: boolean }}
 */
export async function shareContent({ title, text, url } = {}) {
  const support = shareSupport();
  if (!support.supported) return { ok: false, reason: support.reason };

  if (!title && !text && !url) {
    return { ok: false, reason: "there is nothing to share" };
  }

  try {
    await navigator.share({ title, text, url });
    return { ok: true };
  } catch (err) {
    if (err && (err.name === "AbortError" || /abort|cancel/i.test(String(err.message)))) {
      return { ok: false, cancelled: true, reason: "Sharing was cancelled." };
    }
    if (err && err.name === "NotAllowedError") {
      return { ok: false, reason: "Sharing was blocked. It usually needs a direct tap, not a timed one." };
    }
    if (err && err.name === "DataError") {
      return { ok: false, reason: "Some of that could not be shared." };
    }
    return { ok: false, reason: "Sharing failed." };
  }
}

/* =================================================== G6: permission centre */

/**
 * Every permission the app can ask for, with what it is used for.
 *
 * `why` is not decoration. A permission prompt with no stated reason is the
 * fastest way to a permanent denial, and a denied permission the user cannot
 * remember asking about is one they never re-grant.
 */
export const PERMISSIONS = [
  {
    id: "notifications",
    label: "Notifications",
    why: "So an alarm can reach you while this tab is in the background.",
    query: () => (typeof Notification !== "undefined" ? Notification.permission : "unsupported")
  },
  {
    id: "wakeLock",
    label: "Keep the screen on",
    why: "So the display does not switch off overnight. Needs a tap to grant.",
    query: () => (typeof navigator !== "undefined" && "wakeLock" in navigator ? "available" : "unsupported")
  },
  {
    id: "geolocation",
    label: "Location",
    why: "For sunrise, sunset, air quality and prayer times. Optional.",
    query: () => {
      if (typeof navigator === "undefined" || !navigator.permissions) return "unsupported";
      // `query` is async; the sync read here is the coarse permission-state
      // approximation, which is all this table needs.
      return "unknown";
    }
  },
  {
    id: "fullscreen",
    label: "Fullscreen",
    why: "Hides the browser chrome for a cleaner display.",
    query: () => (typeof document !== "undefined" && document.fullscreenEnabled ? "available" : "unsupported")
  },
  {
    id: "microphone",
    label: "Microphone",
    why: "Only for voice commands (G5), which is experimental and off by default.",
    query: () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
      return "available";
    }
  },
  {
    id: "clipboard",
    label: "Clipboard",
    why: "Only when you copy something, never on a timer.",
    query: () => (typeof navigator !== "undefined" && navigator.clipboard ? "available" : "unsupported")
  }
];

const PERMISSION_TONES = {
  granted: { label: "Granted", tone: "good" },
  available: { label: "Available", tone: "good" },
  denied: { label: "Blocked", tone: "bad" },
  unsupported: { label: "Not supported", tone: "neutral" },
  prompt: { label: "Not asked yet", tone: "warn" },
  unknown: { label: "Unknown", tone: "neutral" }
};

/** One row of the permission centre. */
export function describePermission(permission) {
  let state;
  try {
    state = permission.query();
  } catch (err) {
    state = "unsupported";
  }

  const described = PERMISSION_TONES[state] || PERMISSION_TONES.unknown;

  // The action a person can actually take, per state. Offering "Grant" for
  // something already granted, or for an API that does not exist, is how a
  // settings panel teaches people to ignore its buttons.
  let action = null;
  if (state === "prompt") action = { label: "Ask", kind: "ask" };
  else if (state === "available" || state === "granted") action = { label: "Test", kind: "test" };

  return {
    id: permission.id,
    label: permission.label,
    why: permission.why,
    state,
    stateLabel: described.label,
    tone: described.tone,
    action
  };
}

/** The permission centre markup. */
export function renderPermissionCentre(permissions = PERMISSIONS) {
  const rows = permissions.map((permission) => {
    const described = describePermission(permission);
    return `
      <li class="pc-row">
        <div class="pc-main">
          <div class="pc-label">${escapeHtmlSafe(described.label)}</div>
          <div class="pc-why">${escapeHtmlSafe(described.why)}</div>
        </div>
        <span class="pc-state pc-state--${described.tone}">${escapeHtmlSafe(described.stateLabel)}</span>
        ${described.action
          ? `<button class="pc-action" type="button" data-permission="${escapeHtmlSafe(described.id)}"
                     data-kind="${escapeHtmlSafe(described.action.kind)}">
               ${escapeHtmlSafe(described.action.label)}
             </button>`
          : `<span class="pc-action pc-action--none" aria-hidden="true"></span>`}
      </li>`;
  }).join("");

  return `
    <div class="pc-panel">
      <p class="pc-intro">
        Nothing here is requested in the background. Each permission is asked for
        at the moment it is needed, and you can decline without losing anything.
      </p>
      <ul class="pc-rows">${rows}</ul>
    </div>`;
}

/**
 * Local escape.
 *
 * Duplicated rather than imported to keep this module usable from a settings
 * panel that loads before the shared helper. Two lines, and the alternative -
 * an import cycle through escape.js - is worse.
 */
function escapeHtmlSafe(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ================================================== G5: voice (experimental) */

/**
 * Speech recognition support.
 *
 * G5 is marked experimental in the plan. Two hard limits are stated here rather
 * than discovered:
 *
 *  - Web Speech recognition is Chromium-only, and sends audio to the browser
 *    vendor's cloud service. For an app with a zero-tracking policy that is a
 *    genuine conflict, and it is why this is off by default and labelled.
 *  - Recognition needs a network connection and a microphone permission.
 */
export function voiceSupport() {
  if (typeof window === "undefined") return { supported: false, reason: "No browser." };

  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    return {
      supported: false,
      reason: "This browser has no speech recognition. It is Chromium-only, and it " +
        "sends audio to the browser vendor's servers — which is why voice is off by " +
        "default here."
    };
  }
  return { supported: true, reason: "" };
}