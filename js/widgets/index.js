/* StandBy Mode Pro - Widget Style Index
 *
 * FEATURE_PLAN.md A1 applied to widgets. `app.js` iterates this once and feeds
 * both `widgetEngine` and `registry` from the same list, which is the property
 * the two hand-written registration lists lacked: a widget that landed in one
 * registry and not the other would render but never appear in the picker, and
 * nothing would detect it.
 *
 * Adding a widget means adding exactly one entry here.
 *
 * Registration stays eager, matching the twelve pre-existing widgets, so no
 * consumer's loading behaviour changes. The registry still accepts lazy
 * descriptors for a future milestone.
 */

import { weatherWidget } from "./weatherWidget.js";
import { calendarWidget } from "./calendarWidget.js";
import { mediaWidget } from "./mediaWidget.js";
import { timerWidget } from "./timerWidget.js";
import { todoWidget } from "./todoWidget.js";
import { tallyWidget } from "./tallyWidget.js";
import { quoteWidget } from "./quoteWidget.js";
import { photoWidget } from "./photoWidget.js";
import { vibesWidget } from "./vibesWidget.js";

import { alarmWidget } from "../features/alarmWidget.js";
import { noteWidget } from "../features/noteWidget.js";
import { habitWidget } from "../features/habitWidget.js";

import { countdownWidget } from "../features/countdownWidget.js";
import { airQualityWidget } from "../features/airQualityWidget.js";
import { sunWidget } from "../features/sunWidget.js";
import { systemStatusWidget } from "../features/systemStatusWidget.js";
import { converterWidget } from "../features/converterWidget.js";
import { calculatorWidget } from "../features/calculatorWidget.js";
import { goalsWidget } from "../features/goalsWidget.js";

import { timezoneWidget } from "../features/timezoneWidget.js";
import { agendaWidget } from "../features/agendaWidget.js";
import { flashcardsWidget } from "../features/flashcardsWidget.js";
import { fxWidget } from "../features/fxWidget.js";
import { marketWidget } from "../features/marketWidget.js";
import { newsWidget } from "../features/newsWidget.js";
import { mediaSessionWidget } from "../features/mediaSessionWidget.js";
import { prayerWidget } from "../features/prayerWidget.js";

/**
 * Every widget, in picker order.
 * @type {Array<{ id: string, widget: object, milestone: string, feature?: string }>}
 *   `feature` is the FEATURE_PLAN.md C-number this widget implements.
 */
export const WIDGETS = [
  // --- Pre-existing ---
  { id: "weather", widget: weatherWidget, milestone: "M0" },
  { id: "calendar", widget: calendarWidget, milestone: "M0" },
  { id: "media", widget: mediaWidget, milestone: "M0" },
  { id: "timer", widget: timerWidget, milestone: "M0" },
  { id: "todo", widget: todoWidget, milestone: "M0" },
  { id: "tally", widget: tallyWidget, milestone: "M0" },
  { id: "quote", widget: quoteWidget, milestone: "M0" },
  { id: "photo", widget: photoWidget, milestone: "M0" },
  { id: "vibes", widget: vibesWidget, milestone: "M0" },

  // --- Milestone 2 (FEATURE_PLAN C2, C3, C4) ---
  { id: "alarm", widget: alarmWidget, milestone: "M2", feature: "C2" },
  { id: "note", widget: noteWidget, milestone: "M2", feature: "C4" },
  { id: "habit", widget: habitWidget, milestone: "M2", feature: "C3" },

  // --- Milestone 3 (FEATURE_PLAN C5, C9, C10, C11, C15, C16, C18) ---
  { id: "countdown", widget: countdownWidget, milestone: "M3", feature: "C5" },
  { id: "converter", widget: converterWidget, milestone: "M3", feature: "C15" },
  { id: "calculator", widget: calculatorWidget, milestone: "M3", feature: "C16" },
  { id: "goals", widget: goalsWidget, milestone: "M3", feature: "C18" },
  { id: "sun", widget: sunWidget, milestone: "M3", feature: "C10" },
  { id: "airquality", widget: airQualityWidget, milestone: "M3", feature: "C9" },
  { id: "system", widget: systemStatusWidget, milestone: "M3", feature: "C11" },

  // --- Milestone 3, second pass (C6, C7, C8, C12, C14, C17, C19, C20) ---
  // C19 is flagged experimental on the widget object, which the registry
  // (registry.js) carries into the picker as a visible badge.
  { id: "agenda", widget: agendaWidget, milestone: "M3", feature: "C6" },
  { id: "flashcards", widget: flashcardsWidget, milestone: "M3", feature: "C14" },
  { id: "timezone", widget: timezoneWidget, milestone: "M3", feature: "C20" },
  { id: "mediakeys", widget: mediaSessionWidget, milestone: "M3", feature: "C12" },
  { id: "fx", widget: fxWidget, milestone: "M3", feature: "C17" },
  { id: "market", widget: marketWidget, milestone: "M3", feature: "C7" },
  { id: "news", widget: newsWidget, milestone: "M3", feature: "C8" },
  { id: "prayer", widget: prayerWidget, milestone: "M3", feature: "C19" }
];

/** Milestone 3 widgets, for filtering in tests and the picker. */
export const M3_WIDGETS = WIDGETS.filter((w) => w.milestone === "M3");

/** Every distinct category, sorted, for grouping in the picker. */
export const WIDGET_CATEGORIES = Array.from(
  new Set(WIDGETS.map((w) => w.widget.category || "General"))
).sort();