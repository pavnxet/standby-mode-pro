/* StandBy Mode Pro - ICS Agenda Widget
 *
 * FEATURE_PLAN.md C6, rated HIGH risk with the note "timezone correctness is an
 * unsolved industry-wide failure". The parsing that makes this correct lives in
 * js/core/ics.js and is unit-tested against the four distinct date kinds a real
 * calendar emits. This file is only the DOM around it.
 *
 * What replaced: AUDIT.md recorded the calendar widget as showing a hardcoded
 * list of events. This widget reads the user's OWN .ics file. Nothing is
 * uploaded anywhere - the file is parsed in the browser and stored locally,
 * which is what makes it usable without a calendar account.
 *
 * Privacy note worth stating in the UI: an .ics export contains the user's
 * calendar contents, so it is never sent to a server. There is no server.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";
import { escapeHtml } from "../core/escape.js";
import { parseICS } from "../core/ics.js";

/** Days shown, including today. */
const DAYS_AHEAD = 7;
/** Events listed before the rest are collapsed behind a count. */
const MAX_VISIBLE = 6;

/** Recomputed only when the day changes, not every second. */
function dayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export const agendaWidget = {
  name: "Agenda",
  icon: "calendar",
  category: "Utility",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribeTick = null;
    let lastDay = null;
    /** Parsed once per import, not per tick. */
    let parsed = { events: [], warnings: [] };

    const reanalyse = () => {
      const text = (store.getState().agenda || {}).icsText || "";
      parsed = text ? parseICS(text, lookAhead()) : { events: [], warnings: [] };
    };

    const lookAhead = () => {
      const now = new Date();
      return {
        rangeStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        rangeEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD)
      };
    };

    const render = () => {
      if (disposed) return;

      const state = store.getState();
      const { icsText, sourceName } = state.agenda || {};

      // ---- Empty state: explain how to add a file, do not just show a box.
      if (!icsText) {
        container.innerHTML = `
          <div class="ag-container">
            <div class="ag-header">Agenda</div>
            <div class="ag-state">
              <p>No calendar imported yet.</p>
              <p class="ag-hint">
                Paste an .ics export below, or choose a file. It is read and
                stored only in this browser — nothing is uploaded.
              </p>
              <div class="ag-import">
                <label class="ag-label" for="ag-file">Choose an .ics file</label>
                <input class="ag-file" id="ag-file" type="file" accept=".ics,text/calendar"
                       aria-describedby="ag-file-hint">
                <p class="ag-hint" id="ag-file-hint">Exported from Google, Apple or Outlook.</p>
              </div>
              <div class="ag-import">
                <label class="ag-label" for="ag-paste">…or paste the text</label>
                <textarea class="ag-textarea" id="ag-paste" rows="4"
                          placeholder="BEGIN:VCALENDAR&#10;BEGIN:VEVENT&#10;SUMMARY:Standup&#10;DTSTART:20260115T090000Z&#10;END:VEVENT&#10;END:VCALENDAR"
                          aria-describedby="ag-paste-hint"></textarea>
                <p class="ag-hint" id="ag-paste-hint">
                  Start with <code>BEGIN:VCALENDAR</code>.
                </p>
                <button class="ag-btn ag-btn--primary" id="ag-import-btn" type="button">Import</button>
              </div>
            </div>
          </div>`;
        wireImports();
        return;
      }

      // ---- Parse problems surface as a warning, never as a silent empty list.
      if (parsed.warnings.length && !parsed.events.length) {
        container.innerHTML = `
          <div class="ag-container">
            <div class="ag-header">Agenda</div>
            <div class="ag-state ag-state--error">
              <p>That file could not be read as a calendar.</p>
              <ul class="ag-warnings">${parsed.warnings.map((w) =>
                `<li>${escapeHtml(w)}</li>`).join("")}</ul>
              ${importBlock(sourceName)}
            </div>
          </div>`;
        wireImports();
        return;
      }

      const now = new Date();
      const upcoming = parsed.events.filter((e) => e.startMs >= startOfToday(now));

      if (!upcoming.length) {
        container.innerHTML = `
          <div class="ag-container">
            <div class="ag-header">Agenda</div>
            <div class="ag-state">
              <p>Nothing in the next ${DAYS_AHEAD} days.</p>
              ${parsed.warnings.length
                ? `<p class="ag-hint">${escapeHtml(parsed.warnings[0])}</p>`
                : ""}
              ${importBlock(sourceName)}
            </div>
          </div>`;
        wireImports();
        return;
      }

      const shown = upcoming.slice(0, MAX_VISIBLE);
      const hidden = upcoming.length - shown.length;

      container.innerHTML = `
        <div class="ag-container">
          <div class="ag-header">Agenda</div>
          <ul class="ag-list">
            ${shown.map((event) => renderEvent(event, now)).join("")}
          </ul>
          ${hidden > 0
            ? `<div class="ag-more">+${hidden} more in the next ${DAYS_AHEAD} days</div>`
            : ""}
          ${importBlock(sourceName)}
        </div>`;

      wireImports();
    };

    const wireImports = () => {
      const fileInput = container.querySelector("#ag-file");
      if (fileInput) {
        fileInput.addEventListener("change", async () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const result = store.setAgendaIcs(text, file.name);
            if (!result.ok) {
              container.querySelector("#ag-file-hint").textContent =
                `Could not import: ${result.reason}.`;
              return;
            }
            reanalyse();
            render();
          } catch (err) {
            const hint = container.querySelector("#ag-file-hint");
            if (hint) hint.textContent = `Could not read that file: ${err.message}`;
          }
        });
      }

      const pasteBtn = container.querySelector("#ag-import-btn");
      if (pasteBtn) {
        pasteBtn.addEventListener("click", () => {
          const text = container.querySelector("#ag-paste")?.value || "";
          const result = store.setAgendaIcs(text, "pasted");
          if (!result.ok) {
            const hint = container.querySelector("#ag-paste-hint");
            if (hint) hint.textContent = `Could not import: ${result.reason}.`;
            return;
          }
          reanalyse();
          render();
        });
      }

      const clearBtn = container.querySelector("#ag-clear");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          store.clearAgendaIcs();
          reanalyse();
          render();
        });
      }
    };

    reanalyse();
    // The first paint is immediate. The tick below only re-renders when the
    // calendar day rolls over, so without this the widget would sit blank until
    // midnight.
    lastDay = dayKey(new Date());
    render();

    unsubscribeTick = scheduler.subscribe("agenda-widget", () => {
      scheduler.onSecondBoundary(() => {
        // Rebuilding the list is only needed when the calendar day rolls over.
        const today = dayKey(new Date());
        if (today === lastDay) return;
        lastDay = today;
        reanalyse();
        render();
      });
    }, { priority: 230 });

    return {
      unmount() {
        disposed = true;
        if (unsubscribeTick) unsubscribeTick();
      }
    };
  }
};

function startOfToday(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * One event row.
 *
 * The all-day / timed distinction is visible, not internal: an all-day event
 * gets no clock time because the source declared none, and inventing "00:00"
 * would be a false statement about someone's calendar.
 */
function renderEvent(event, now) {
  const start = new Date(event.startMs);
  const end = event.endMs ? new Date(event.endMs) : null;

  let when;
  if (event.allDay) {
    when = `<span class="ag-when ag-when--allday">All day</span>`;
  } else {
    const startLabel = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const endLabel = end
      ? end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : "";
    when = `<span class="ag-when">${escapeHtml(startLabel)}${
      endLabel ? `–${escapeHtml(endLabel)}` : ""
    }</span>`;
  }

  // "Now" / "in 2 h" / "3 d ago"-style context, computed from the same instant
  // the row is showing, so the two can never disagree.
  const relative = describeRelative(event.startMs, now, event.allDay);

  // The source timezone is surfaced when it differs from the viewer's, because
  // that is exactly the case where a reader might expect a different time.
  const zoneNote = event.sourceZone && event.sourceZone !== Intl.DateTimeFormat().resolvedOptions().timeZone
    ? `<span class="ag-zone">${escapeHtml(event.sourceZone)}</span>`
    : "";

  return `
    <li class="ag-item${event.allDay ? " ag-item--allday" : ""}">
      <div class="ag-item-main">
        <span class="ag-title">${escapeHtml(event.summary)}</span>
        ${event.location ? `<span class="ag-location">${escapeHtml(event.location)}</span>` : ""}
      </div>
      <div class="ag-item-meta">
        ${when}
        <span class="ag-rel">${escapeHtml(relative)}</span>
        ${zoneNote}
      </div>
    </li>`;
}

/**
 * "now", "in 3 h", "Tue", "in 4 d".
 *
 * `now` accepts a Date or an epoch. Both are normalised to an epoch first,
 * because `Number.isFinite(new Date())` is false - a version that checked the
 * Date directly would return "" for the exact input the render path passes,
 * which is a silent blank label rather than a visible failure.
 */
export function describeRelative(startMs, now, isAllDay = false) {
  if (!Number.isFinite(startMs)) return "";

  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs)) return "";

  // Day arithmetic is done on whole local days, never on raw millisecond
  // differences, so an event at 00:30 tomorrow is "tomorrow" rather than
  // "in 1 d" plus a rounding artefact.
  if (isAllDay) {
    const diffDays = Math.round((startOfDayValue(startMs) - startOfDayValue(nowMs)) / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "tomorrow";
    if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} d`;
    return new Date(startMs).toLocaleDateString(undefined, { weekday: "short" });
  }

  const deltaMin = Math.round((startMs - nowMs) / 60000);
  if (Math.abs(deltaMin) < 1) return "now";
  if (deltaMin > 0 && deltaMin < 60) return `in ${deltaMin} min`;
  if (deltaMin >= 60 && deltaMin < 1440) return `in ${Math.round(deltaMin / 60)} h`;

  // Past but still today, or later in the week.
  if (deltaMin <= 0 && startOfDayValue(startMs) === startOfDayValue(nowMs)) {
    return "earlier today";
  }
  const days = Math.round((startOfDayValue(startMs) - startOfDayValue(nowMs)) / 86400000);
  if (days > 0 && days <= 7) return `in ${days} d`;
  return new Date(startMs).toLocaleDateString(undefined, { weekday: "short" });
}

/** Local midnight for an epoch, so day maths ignores the time of day. */
function startOfDayValue(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The collapsible import panel, present on every populated render. */
function importBlock(sourceName) {
  return `
    <details class="ag-import-panel">
      <summary class="ag-summary">Calendar file${sourceName ? ` — ${escapeHtml(sourceName)}` : ""}</summary>
      <div class="ag-import">
        <label class="ag-label" for="ag-file">Choose an .ics file</label>
        <input class="ag-file" id="ag-file" type="file" accept=".ics,text/calendar"
               aria-describedby="ag-file-hint">
        <p class="ag-hint" id="ag-file-hint">Stored in this browser only.</p>
      </div>
      <div class="ag-import">
        <label class="ag-label" for="ag-paste">…or paste the text</label>
        <textarea class="ag-textarea" id="ag-paste" rows="3"
                  placeholder="BEGIN:VCALENDAR…"></textarea>
        <p class="ag-hint" id="ag-paste-hint">Start with <code>BEGIN:VCALENDAR</code>.</p>
        <button class="ag-btn ag-btn--primary" id="ag-import-btn" type="button">Import</button>
        <button class="ag-btn ag-btn--danger" id="ag-clear" type="button">Remove calendar</button>
      </div>
    </details>`;
}