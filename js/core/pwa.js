/* StandBy Mode Pro - PWA registration
 *
 * FEATURE_PLAN.md G1. Handles registration, update lifecycle, and the install
 * prompt with explicit state reporting, because a silently failing install
 * path is indistinguishable from a broken one.
 */

import { announce } from "./a11y.js";

let deferredPrompt = null;
const installListeners = new Set();

export function isSupported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/** True when running as an installed PWA. */
export function isInstalled() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      window.navigator.standalone === true
    );
  } catch (e) {
    return false;
  }
}

export function onInstallPromptChange(listener) {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

/**
 * Shows the browser install prompt if one was captured.
 * @returns {Promise<{ outcome: 'accepted'|'dismissed'|'unavailable' }>}
 */
export async function promptInstall() {
  if (!deferredPrompt) return { outcome: "unavailable" };
  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    const outcome = choice.outcome === "accepted" ? "accepted" : "dismissed";
    if (outcome === "accepted") announce("App installed");
    return { outcome };
  } catch (e) {
    deferredPrompt = null;
    return { outcome: "unavailable" };
  }
}

/**
 * Registers the service worker.
 *
 * Only registers on a secure context. On plain http://localhost it is a no-op,
 * and callers can fall back to online-only behaviour without special-casing.
 *
 * @param {{ onState?: (state: string, detail?: any) => void }} [options]
 */
export async function registerServiceWorker(options = {}) {
  const report = options.onState || (() => {});

  if (!isSupported()) {
    report("unsupported");
    return { registered: false, reason: "unsupported" };
  }

  if (!window.isSecureContext) {
    report("insecure-context");
    return { registered: false, reason: "insecure-context" };
  }

  // The scope is relative so this resolves identically under the GitHub Pages
  // sub-path and at the Vercel root.
  const swUrl = new URL("./sw.js", document.baseURI);

  try {
    const registration = await navigator.serviceWorker.register(swUrl, { scope: "./" });
    report("registered", registration);

    // A new worker means new assets. Tell the user rather than silently
    // swapping the app out from under them mid-session.
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          report("update-available");
        }
      });
    });

    return { registered: true, registration };
  } catch (e) {
    report("failed", e);
    return { registered: false, reason: "registration-failed", error: e };
  }
}

/** Activates a waiting worker immediately. */
export async function applyUpdate() {
  if (!isSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

export async function clearCaches() {
  if (!isSupported() || !("caches" in window)) return false;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("standby-")).map(k => caches.delete(k)));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Wires the beforeinstallprompt listener. Safe to call once at boot.
 */
export function initInstallPromptCapture() {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Prevent the mini-infobar so the app can offer its own affordance.
    event.preventDefault();
    deferredPrompt = event;
    for (const listener of installListeners) {
      try { listener({ available: true }); } catch (e) {}
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    for (const listener of installListeners) {
      try { listener({ available: false, installed: true }); } catch (e) {}
    }
  });
}