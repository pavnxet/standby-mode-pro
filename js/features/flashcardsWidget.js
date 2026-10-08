/* StandBy Mode Pro - Flashcards Widget
 *
 * FEATURE_PLAN.md C14. Spaced repetition on a desk display: a card is due, the
 * widget flips to show the answer, four buttons grade the recall, and the next
 * due date comes from core/flashcards.js (pure, unit-tested SM-2-lite).
 *
 * The scheduling rules deliberately do NOT live here. This file decides which
 * card is showing and renders four buttons; flashcards.js decides what each
 * button means. That separation is why the rules can be tested without a DOM.
 *
 * Keyboard is a first-class path, not an afterthought: this is the one widget
 * where you interact repeatedly, so Space flips and 1-4 grade without touching
 * the mouse.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";
import { scheduleCard, previewIntervals, reviewState, dueCards, formatInterval, GRADES } from "../core/flashcards.js";

/** Button labels, in the same order as GRADES. */
const GRADE_LABELS = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy"
};

export const flashcardsWidget = {
  name: "Flashcards",
  icon: "cards",
  category: "Focus",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;
    /** Which deck is open. */
    let activeDeckId = null;
    /** Whether the answer is showing. */
    let revealed = false;
    /** Card being reviewed, so a grade applies to a stable object. */
    let currentCard = null;
    /** Set when a save failed, cleared on the next successful action. */
    let actionError = "";

    /** Due cards for the active deck, earliest first. */
    const queue = () => {
      const decks = store.getState().decks || [];
      const deck = decks.find((d) => d.id === activeDeckId);
      if (!deck) return [];
      return dueCards(deck.cards || []);
    };

    /** Picks the first card with a due date, creating nothing on its own. */
    const refreshCurrent = () => {
      const due = queue();
      currentCard = due.length ? due[0] : null;
      if (!currentCard) revealed = false;
    };

    const render = () => {
      if (disposed) return;

      const decks = store.getState().decks || [];

      // ---- No decks at all: explain the concept rather than render a dead box.
      if (!decks.length) {
        container.innerHTML = `
          <div class="fc-container">
            <div class="fc-header">Flashcards</div>
            <div class="fc-state">
              <p>No decks yet.</p>
              <p class="fc-hint">
                A deck is a list of question and answer pairs. Cards you keep
                getting right come back less often, so reviewing stays quick.
              </p>
              <form class="fc-form" id="fc-new-deck">
                <label class="fc-label" for="fc-deck-name">Deck name</label>
                <input class="fc-input" id="fc-deck-name" type="text" maxlength="40"
                       placeholder="Spanish verbs" required>
                <button class="fc-btn fc-btn--primary" type="submit">Create deck</button>
              </form>
            </div>
          </div>`;
        wireNewDeck();
        return;
      }

      // Deck with no cards.
      const activeDeck = decks.find((d) => d.id === activeDeckId) || decks[0];
      activeDeckId = activeDeck.id;
      const cards = activeDeck.cards || [];

      if (!cards.length) {
        container.innerHTML = `
          <div class="fc-container">
            <div class="fc-header">Flashcards</div>
            <div class="fc-state">
              <p><strong>${escapeHtml(activeDeck.name)}</strong> has no cards.</p>
              <form class="fc-form" id="fc-add-card">
                <label class="fc-label" for="fc-front">Front (the prompt)</label>
                <input class="fc-input" id="fc-front" type="text" maxlength="200"
                       placeholder="hablar" required>
                <label class="fc-label" for="fc-back">Back (the answer)</label>
                <input class="fc-input" id="fc-back" type="text" maxlength="200"
                       placeholder="to speak" required>
                <button class="fc-btn fc-btn--primary" type="submit">Add card</button>
              </form>
              ${deckPicker(decks, activeDeckId)}
            </div>
          </div>`;
        wireAddCard();
        wireDeckPicker();
        return;
      }

      refreshCurrent();

      if (!currentCard) {
        const nextUp = earliestFuture(cards);
        const stage = cards.length === 1 ? reviewState(cards[0]) : null;
        container.innerHTML = `
          <div class="fc-container">
            <div class="fc-header">
              Flashcards — ${escapeHtml(activeDeck.name)}
              <span class="fc-deck-count">${cards.length} card${cards.length === 1 ? "" : "s"}</span>
            </div>
            <div class="fc-state">
              <p>Nothing due right now.</p>
              ${nextUp
                ? `<p class="fc-hint">Next card due ${escapeHtml(relativeTime(nextUp))}
                     (in ${escapeHtml(formatInterval(nextUp.intervalDays))}).</p>`
                : ""}
              ${stage ? `<p class="fc-hint">This deck is <strong>${escapeHtml(stage.label)}</strong>.</p>` : ""}
              ${dueTodayCount(cards)}
              ${deckPicker(decks, activeDeckId)}
              ${addCardForm()}
            </div>
          </div>`;
        wireAddCard();
        wireDeckPicker();
        return;
      }

      // ---- The review card itself.
      const stage = reviewState(currentCard);
      const previews = revealed ? previewIntervals(currentCard) : null;

      container.innerHTML = `
        <div class="fc-container">
          <div class="fc-header">
            Flashcards — ${escapeHtml(activeDeck.name)}
            <span class="fc-deck-count">${escapeHtml(stage.label)}</span>
          </div>

          ${actionError
            ? `<div class="fc-error" role="alert">${escapeHtml(actionError)}</div>`
            : ""}

          <div class="fc-card${revealed ? " fc-card--revealed" : ""}"
               id="fc-card" tabindex="0" role="button"
               aria-label="${revealed ? "Answer shown. Press Space to hide." : "Prompt shown. Press Space to reveal the answer."}">
            <div class="fc-face fc-front">${escapeHtml(currentCard.front)}</div>
            ${revealed ? `<div class="fc-face fc-back">${escapeHtml(currentCard.back)}</div>` : ""}
          </div>

          <p class="fc-hint fc-reveal-hint">
            ${revealed ? "Press 1–4 to grade." : "Press Space or click the card to reveal."}
          </p>

          ${revealed
            ? `<div class="fc-grades" role="group" aria-label="Grade your recall">
                 ${previews.map((p) => `
                   <button class="fc-grade fc-grade--${escapeHtml(p.grade)}"
                           data-grade="${escapeHtml(p.grade)}"
                           type="button"
                           aria-label="${escapeHtml(GRADE_LABELS[p.grade])}, next review in ${escapeHtml(formatInterval(p.intervalDays))}">
                     <span class="fc-grade-name">${escapeHtml(GRADE_LABELS[p.grade])}</span>
                     <span class="fc-grade-when">${escapeHtml(formatInterval(p.intervalDays))}</span>
                   </button>`).join("")}
               </div>`
            : `<button class="fc-btn fc-btn--primary fc-reveal-btn" id="fc-reveal" type="button">
                 Show answer
               </button>`}

          ${deckPicker(decks, activeDeckId)}
          ${addCardForm()}
        </div>`;

      wireCard();
      wireGrades();
      wireDeckPicker();
      wireAddCard();
    };

    // ---------------------------------------------------------------- wiring

    const wireNewDeck = () => {
      const form = container.querySelector("#fc-new-deck");
      if (!form) return;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = container.querySelector("#fc-deck-name");
        const deck = store.addDeck(input?.value || "");
        if (!deck) {
          actionError = "Give the deck a name first.";
          render();
          return;
        }
        activeDeckId = deck.id;
        actionError = "";
        render();
      });
    };

    const wireAddCard = () => {
      const form = container.querySelector("#fc-add-card");
      if (!form) return;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const front = container.querySelector("#fc-front")?.value || "";
        const back = container.querySelector("#fc-back")?.value || "";
        const ok = store.addCard(activeDeckId, front, back);
        if (!ok) {
          actionError = "A card needs both a front and a back.";
          render();
          return;
        }
        actionError = "";
        render();
      });
    };

    const wireDeckPicker = () => {
      const select = container.querySelector("#fc-deck-select");
      if (!select) return;
      select.addEventListener("change", () => {
        activeDeckId = select.value;
        revealed = false;
        currentCard = null;
        actionError = "";
        render();
      });
    };

    const wireCard = () => {
      const card = container.querySelector("#fc-card");
      if (!card) return;
      card.addEventListener("click", () => {
        if (revealed) return;
        revealed = true;
        render();
      });

      // Keyboard is the primary path for repeated review.
      container.addEventListener("keydown", (event) => {
        if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;

        if (event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          if (!currentCard) return;
          revealed = !revealed;
          render();
          // Keep focus on the card so the next Space lands in the right place.
          container.querySelector("#fc-card")?.focus();
          return;
        }

        if (!revealed) return;
        const index = ["1", "2", "3", "4"].indexOf(event.key);
        if (index === -1) return;
        event.preventDefault();
        grade(GRADES[index]);
      });
    };

    const wireGrades = () => {
      container.querySelectorAll("[data-grade]").forEach((button) => {
        button.addEventListener("click", () => grade(button.dataset.grade));
      });
      const reveal = container.querySelector("#fc-reveal");
      if (reveal) reveal.addEventListener("click", () => { revealed = true; render(); });
    };

    /**
     * Applies a grade and persists it.
     *
     * The next state is computed by flashcards.js, then written back through the
     * store. A failed write is reported rather than optimistically hidden: the
     * user would otherwise think a card was rescheduled when it was not.
     */
    const grade = (gradeName) => {
      if (!currentCard) return;
      const next = scheduleCard(currentCard, gradeName);
      const ok = store.reviewCard(activeDeckId, currentCard.id, next);
      if (!ok) {
        actionError = "That review could not be saved. Try again.";
        render();
        return;
      }
      actionError = "";
      revealed = false;
      currentCard = null;
      render();
      container.querySelector("#fc-card")?.focus();
    };

    unsubscribeStore = store.subscribe((key) => {
      if (key === "decks_updated") render();
    });

    render();

    return {
      unmount() {
        disposed = true;
        if (unsubscribeStore) unsubscribeStore();
      }
    };
  }
};

/** Earliest due date in the future, or null. */
function earliestFuture(cards) {
  const now = Date.now();
  return (cards || [])
    .filter((c) => Number.isFinite(c.dueMs) && c.dueMs > now)
    .sort((a, b) => a.dueMs - b.dueMs)[0] || null;
}

/** "in 3 h" for a future due date. */
function relativeTime(card) {
  const minutes = Math.round((card.dueMs - Date.now()) / 60000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} d`;
}

/** How many cards are due today but not yet reviewed. */
function dueTodayCount(cards) {
  const count = dueCards(cards).length;
  if (!count) return "";
  return `<p class="fc-hint">${count} card${count === 1 ? "" : "s"} due now.</p>`;
}

function deckPicker(decks, activeId) {
  if (decks.length < 2) return "";
  return `
    <div class="fc-picker">
      <label class="fc-label" for="fc-deck-select">Deck</label>
      <select class="fc-select" id="fc-deck-select">
        ${decks.map((d) => `
          <option value="${escapeHtml(d.id)}"${d.id === activeId ? " selected" : ""}>
            ${escapeHtml(d.name)} (${(d.cards || []).length})
          </option>`).join("")}
      </select>
    </div>`;
}

function addCardForm() {
  return `
    <details class="fc-add-panel">
      <summary class="fc-summary">Add a card</summary>
      <form class="fc-form" id="fc-add-card">
        <label class="fc-label" for="fc-front">Front (the prompt)</label>
        <input class="fc-input" id="fc-front" type="text" maxlength="200" placeholder="hablar" required>
        <label class="fc-label" for="fc-back">Back (the answer)</label>
        <input class="fc-input" id="fc-back" type="text" maxlength="200" placeholder="to speak" required>
        <button class="fc-btn fc-btn--primary" type="submit">Add card</button>
      </form>
    </details>`;
}