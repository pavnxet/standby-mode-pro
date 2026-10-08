/* StandBy Mode Pro - Service Worker
 *
 * FEATURE_PLAN.md G1. Makes the app installable and usable offline, which is
 * the point: a bedside clock that needs the network to show the time is not a
 * bedside clock.
 *
 * Caching strategy, chosen per resource class:
 *
 *   App shell (HTML/CSS/JS/icons)  -> precache, then cache-first.
 *                                     The clock must render instantly and must
 *                                     work with no connection at all.
 *   Google Fonts + Tailwind CDN    -> stale-while-revalidate. Third-party, so
 *                                     never precached (a failed precache of a
 *                                     CDN asset would block installation), but
 *                                     cached after first use so the clock still
 *                                     renders offline.
 *   Open-Meteo                     -> network-first with a cache fallback and a
 *                                     short TTL. Weather must be fresh, but a
 *                                     cached reading beats an empty widget when
 *                                     offline.
 *   Anything else                  -> passthrough. Notably, the app's own Turso
 *                                     sync and any user-configured endpoint are
 *                                     NEVER cached, so no data can be served
 *                                     stale.
 *
 * Paths are RELATIVE throughout, so this works identically at the GitHub Pages
 * sub-path /standby-mode-pro/ and at the Vercel root.
 */

const VERSION = "v2";
const SHELL_CACHE = `standby-shell-${VERSION}`;
const RUNTIME_CACHE = `standby-runtime-${VERSION}`;

/** Same-directory resolution, so no absolute paths appear anywhere. */
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/main.css",
  "./css/clocks.css",
  "./css/clocks-m3.css",
  "./css/widgets.css",
  "./css/a11y.css",
  "./css/widgets-m2.css",
  "./css/widgets-m3.css",
  "./css/widgets-m3b.css",
  "./css/m4.css",
  "./css/screensaver.css",
  "./js/core/ambiences.js",
  "./js/core/deviceProfile.js",
  "./js/core/screenTimeoutRescue.js",
  "./js/components/audioMixer.js",
  "./js/components/dimmingController.js",
  "./js/features/kioskMode.js",
  "./js/features/liveBackgrounds.js",
  "./js/features/nightSchedule.js",
  "./js/features/screensaverStyles.js",
  "./js/engines/beatVisualiser.js",
  "./js/engines/wakeLockResilience.js",
  "./js/app.js",
  "./js/core/schema.js",
  "./js/core/registry.js",
  "./js/core/scheduler.js",
  "./js/core/escape.js",
  "./js/core/a11y.js",
  "./js/core/notifications.js",
  "./js/core/alarmScheduler.js",
  // Missed when the PWA shipped: the manifest and worker were precached but the
  // module implementing install/offline detection was not, so the app would
  // 404 on js/core/pwa.js while offline.
  "./js/core/pwa.js",
  "./js/clocks/_shared/numeralMap.js",
  "./js/engines/clockEngine.js",
  "./js/engines/widgetEngine.js",
  "./js/engines/soundEngine.js",
  "./js/engines/visualizerEngine.js",
  "./js/engines/wakeLockEngine.js",
  "./js/engines/burnInProtector.js",
  "./js/state/store.js",
  "./js/state/db.js",
  "./js/state/tursoSync.js",
  "./js/components/modalRuntime.js",
  "./js/components/spacesNav.js",
  "./js/components/statsModal.js",
  "./js/components/customizeModal.js",
  "./js/components/photoModal.js",
  "./js/components/nightModeController.js",
  "./js/components/screensaver.js",
  "./js/components/pomoFocusView.js",
  "./js/clocks/flipClock.js",
  "./js/clocks/neonClock.js",
  "./js/clocks/matrixClock.js",
  "./js/clocks/solarClock.js",
  "./js/clocks/bigCropClock.js",
  "./js/clocks/radialClock.js",
  "./js/clocks/dayClock.js",
  "./js/clocks/segmentedClock.js",
  "./js/clocks/analogDigitalClock.js",
  "./js/clocks/amoledClock.js",
  "./js/clocks/lcarsClock.js",

  // Milestone 3: shared primitives plus the 15 new faces. The index is listed
  // because js/app.js imports from it, and the two _shared modules because the
  // index pulls in faces that import them.
  "./js/clocks/index.js",
  "./js/clocks/_shared/primitives.js",
  "./js/clocks/_shared/solarMath.js",
  "./js/clocks/_shared/words.js",
  "./js/clocks/_shared/worldLand.js",
  "./js/clocks/wordClock.js",
  "./js/clocks/binaryClock.js",
  "./js/clocks/romanClock.js",
  "./js/clocks/analogSkins.js",
  "./js/clocks/terminatorClock.js",
  "./js/clocks/moonClock.js",
  "./js/clocks/gradientClock.js",
  "./js/clocks/tideClock.js",
  "./js/clocks/persianClock.js",
  "./js/clocks/brailleClock.js",
  "./js/clocks/departureBoardClock.js",
  "./js/clocks/dotMatrixClock.js",
  "./js/clocks/worldClock.js",
  "./js/clocks/sunArcClock.js",
  "./js/clocks/yearClock.js",
  "./js/widgets/weatherWidget.js",
  "./js/widgets/calendarWidget.js",
  "./js/widgets/mediaWidget.js",
  "./js/widgets/timerWidget.js",
  "./js/widgets/todoWidget.js",
  "./js/widgets/tallyWidget.js",
  "./js/widgets/quoteWidget.js",
  "./js/widgets/photoWidget.js",
  "./js/widgets/vibesWidget.js",
  "./js/features/alarmWidget.js",
  "./js/features/noteWidget.js",
  "./js/features/habitWidget.js",

  // Milestone 3 widgets. The index is listed because js/app.js imports from it;
  // the core modules are listed because the widgets import them.
  "./js/features/countdownWidget.js",
  "./js/features/airQualityWidget.js",
  "./js/features/sunWidget.js",
  "./js/features/systemStatusWidget.js",
  "./js/features/converterWidget.js",
  "./js/features/calculatorWidget.js",
  "./js/features/goalsWidget.js",
  // Second Milestone 3 widget pass (C6, C14, C20, C12, C17, C7, C8, C19).
  "./js/features/agendaWidget.js",
  "./js/features/flashcardsWidget.js",
  "./js/features/timezoneWidget.js",
  "./js/features/mediaSessionWidget.js",
  "./js/features/fxWidget.js",
  "./js/features/marketWidget.js",
  "./js/features/newsWidget.js",
  "./js/features/prayerWidget.js",
  "./js/widgets/index.js",
  "./js/core/netPolicy.js",
  "./js/core/units.js",
  "./js/core/calculator.js",
  "./js/core/timezones.js",
  "./js/core/clockMath.js",
  "./js/core/systemStatus.js",
  "./js/core/airQuality.js",
  "./js/core/countdownMath.js",
  "./js/core/ics.js",
  "./js/core/flashcards.js",
  "./js/core/rss.js",
  "./js/core/fx.js",
  "./js/core/market.js",
  "./js/core/mediaSession.js",
  "./js/core/prayer.js",
  "./js/core/inputParse.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

const THIRD_PARTY_HOSTS = [
  "cdn.tailwindcss.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

const WEATHER_HOST = "api.open-meteo.com";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll() is atomic: one failure rejects the whole install and the worker
    // never activates, which would silently break the app. Add individually and
    // tolerate a miss so a single optional asset cannot block installation.
    await Promise.all(
      SHELL_ASSETS.map(async (path) => {
        try {
          await cache.add(new Request(path, { cache: "reload" }));
        } catch (err) {
          // Optional asset: log and continue. The runtime handler will fetch it.
          console.warn("[sw] precache skipped", path, err && err.message);
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith("standby-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Never interfere with anything but GET. In particular, the app's Turso sync
  // is a POST and must go straight to the network, never to a cache.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // --- Navigation: network-first so a deployed update is picked up, with the
  // cached shell as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // --- Weather: network-first, short-lived cache fallback.
  if (url.hostname === WEATHER_HOST) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        const fresh = await fetch(request);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        // An explicit failure the widget can render honestly, rather than a
        // thrown error or an empty response it might mistake for real data.
        return new Response(
          JSON.stringify({ error: "offline", message: "Weather is unavailable offline." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
    })());
    return;
  }

  // --- Third-party CDNs: stale-while-revalidate, never precached.
  if (THIRD_PARTY_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          // Opaque responses (no-cors) are still worth caching.
          if (response && (response.ok || response.type === "opaque")) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      return cached || (await network) || new Response("", { status: 504 });
    })());
    return;
  }

  // --- Same-origin app assets: cache-first, which is what makes the clock
  // render instantly and work offline.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }

  // Everything else (including the view counters and any user endpoint) is a
  // plain passthrough. Not cached, not intercepted.
});