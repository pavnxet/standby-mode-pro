/* StandBy Mode Pro - Numeric Input Parsing
 *
 * Shared by the converter and calculator widgets.
 *
 * Why not parseFloat: `parseFloat("12abc")` returns 12. A user who types a stray
 * letter into a converter and sees a confident number has been given a wrong
 * answer with no indication, which for a numeric utility is worse than being
 * told the input is not a number.
 *
 * Why not `<input type="number">`: it silently discards non-numeric keystrokes,
 * so a half-typed "1e" leaves an empty box and the user cannot tell why. The
 * widgets use text inputs and parse explicitly instead.
 */

/** Thousands separators are stripped so pasted values work. */
export function parseNumericInput(text) {
  const trimmed = String(text ?? "").trim().replace(/,/g, "");
  if (!trimmed) return null;

  // Optional sign, digits with an optional decimal point, optional exponent.
  // Deliberately rejects trailing garbage, hex, binary, and "Infinity".
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) return null;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Formats a number for display with thousands separators and trimmed zeros. */
export function formatNumberInput(value, maximumFractionDigits = 10) {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toPrecision(12));
  return rounded.toLocaleString(undefined, {
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : maximumFractionDigits
  });
}