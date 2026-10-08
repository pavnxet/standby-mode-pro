/* StandBy Mode Pro - Voice Commands (G5) - EXPERIMENTAL
 *
 * FEATURE_PLAN G5: "Voice Commands (Web Speech API)". The plan says it needs a
 * permission, so this is an explicit, opt-in, experimental module.
 *
 * The privacy calculus, which the plan's own dependency list implies but is worth
 * stating plainly: Web Speech recognition is Chromium-only and sends audio to the
 * browser vendor's cloud service. For an app whose stated position is zero
 * tracking and no third-party calls without one being visible, that is a real
 * conflict rather than a nuisance.
 *
 * So:
 *  - Off by default. Nothing here listens until the reader asks for it.
 *  - The microphone light is the browser's, not ours - we cannot mask it.
 *  - Commands are matched locally against a fixed list. Audio is sent to the
 *    speech recogniser because that is what recognition is; nothing else leaves.
 *  - The feature is labelled experimental in the UI, permanently. It will not be
 *    promoted until it works on Firefox and Safari, which it does not.
 *
 * Feedback is by state, not by a transcript. The recogniser streams partial
 * results, and rendering them makes the UI flashy and wrong-looking; a confirmed
 * command produces a toast naming what it did.
 */

import { store } from "../state/store.js";
import { toasts } from "../core/commandPalette.js";
import { voiceSupport } from "../core/platform.js";

/** Phrases mapped to command ids in the command index. */
const PHRASES = [
  { match: /next space/, command: "next-space" },
  { match: /previous space/, command: "prev-space" },
  { match: /toggle night mode/, command: "toggle-night" },
  { match: /fullscreen/, command: "fullscreen" },
  { match: /open the command palette/, command: "palette" },
  { match: /stop (all )?(the )?(ambient )?sound/, command: "stop-audio" },
  { match: /open settings/, command: "open-settings" },
  { match: /show (the )?keyboard shortcuts/, command: "cheatsheet" }
];

/** The scope of things a voice command can do. Deliberately short. */
const COMMAND_MAP = {
  "next-space": () => store.getState && store.setActiveSpace?.(nextSpaceId(1)),
  "prev-space": () => store.setActiveSpace?.(nextSpaceId(-1)),
  "toggle-night": () => store.toggleNightMode?.(),
  "fullscreen": () => document.documentElement.requestFullscreen?.(),
  "palette": () => voiceHost.onCommand?.("palette"),
  "stop-audio": () => store.clearAmbienceMix?.(),
  "open-settings": () => voiceHost.onCommand?.("open-settings"),
  "cheatsheet": () => voiceHost.onCommand?.("cheatsheet")
};

function nextSpaceId(step) {
  const ids = Object.keys(store.getState().spaces || {});
  if (ids.length < 2) return null;
  const at = ids.indexOf(store.getState().activeSpaceId);
  return ids[(Math.max(0, at) + step + ids.length) % ids.length];
}

/** Human text for a command id. */
const LABELS = {
  "next-space": "Next space",
  "prev-space": "Previous space",
  "toggle-night": "Night mode",
  "fullscreen": "Fullscreen",
  "palette": "Command palette",
  "stop-audio": "Ambient sound stopped",
  "open-settings": "Settings",
  "cheatsheet": "Keyboard shortcuts"
};

/**
 * Turns a phrase into a command id, or null.
 *
 * Case- and filler-insensitive, and the longest pattern wins so "stop all ambient
 * sound" does not match "stop sound" first.
 */
export function matchPhrase(text) {
  if (typeof text !== "string") return null;
  const normalised = text.toLowerCase().trim().replace(/[.,!?]/g, "");
  let best = null;

  for (const entry of PHRASES) {
    if (!entry.match.test(normalised)) continue;
    if (!best || entry.match.source.length > best.match.source.length) best = entry;
  }
  return best?.command ?? null;
}

/** The four states this feature can be in, reported exactly. */
const VOICE_STATE = {
  off: "Off",
  listening: "Listening…",
  heard: "Heard",
  unsupported: "Not supported in this browser"
};

export class VoiceCommands {
  constructor() {
    this.recognition = null;
    this.state = "off";
    this.enabled = store.getState().voice?.enabled === true;
  }

  /**
   * Why this cannot run, or an empty string when it can.
   *
   * Returns the reason rather than a bare false: "not supported here" is the
   * difference between a broken-looking button and an honest unavailable one.
   */
  unavailable() {
    const support = voiceSupport();
    if (!support.supported) return support.reason;
    if (this.state === "denied") return "Microphone access was declined.";
    return "";
  }

  /** Starts listening. Requires a user gesture, like everything microphone. */
  async start() {
    const problem = this.unavailable();
    if (problem) {
      toasts.show(problem, { tone: "warn" });
      return false;
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Ctor();
    recognition.lang = store.getState().locale || "en";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const result = event.results?.[event.results.length - 1];
      const text = result?.[0]?.transcript || "";
      if (result?.isFinal) {
        this.state = "heard";
        const command = matchPhrase(text);
        if (command) {
          this.run(command);
        } else {
          toasts.show(`I did not recognise "${text}". Say "next space" or "toggle night mode".`, { tone: "info", durationMs: 6000 });
        }
      }
    };

    recognition.onerror = (event) => {
      this.state = "off";
      this.stop();
      const messages = {
        "not-allowed": "Microphone access was declined.",
        "service-not-allowed": "The speech service refused this page.",
        network: "Voice needs a network connection.",
        "no-speech": "I did not hear anything."
      };
      toasts.show(messages[event.error] || `Voice stopped: ${event.error}`, { tone: "warn" });
    };

    recognition.onend = () => {
      if (this.state !== "heard") this.state = "off";
    };

    this.recognition = recognition;
    this.state = "listening";
    try {
      recognition.start();
      return true;
    } catch (err) {
      this.state = "off";
      toasts.show("Could not start listening.", { tone: "warn" });
      return false;
    }
  }

  stop() {
    try {
      this.recognition?.stop?.();
    } catch {
      // Stopping something already stopped is not an error worth surfacing.
    }
    this.recognition = null;
    if (this.state !== "heard") this.state = "off";
  }

  /** Runs a recognised command, and reports what happened. */
  run(commandId) {
    const action = COMMAND_MAP[commandId];
    if (!action) {
      toasts.show(`"${LABELS[commandId] || commandId}" is not available yet.`, { tone: "info" });
      return false;
    }
    try {
      action();
      toasts.show(LABELS[commandId] || commandId, { tone: "success", durationMs: 2500 });
      return true;
    } catch (err) {
      toasts.show(`That command failed: ${err.message}`, { tone: "error" });
      return false;
    }
  }

  /** Status for a settings row. */
  describe() {
    if (this.enabled && this.unavailable() === "") {
      return { state: this.state, label: VOICE_STATE[this.state] || VOICE_STATE.off, tone: this.state === "listening" ? "good" : "neutral" };
    }
    return { state: "unsupported", label: VOICE_STATE.unsupported, tone: "neutral" };
  }
}

/**
 * A callback the app installs so palette/settings commands can reach the UI.
 *
 * Kept as a property rather than a constructor argument because the command
 * palette does not exist when this module is first imported, and a constructor
 * argument would bind to nothing.
 */
export const voiceHost = {
  onCommand: null
};

export const voiceCommands = new VoiceCommands();
