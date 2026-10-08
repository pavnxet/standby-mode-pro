/* StandBy Mode Pro - Expression Evaluator
 *
 * FEATURE_PLAN.md C16 is explicit: "Must not use eval() - implement a small
 * shunting-yard parser." This is that parser.
 *
 * Why not eval: `eval` on user input is arbitrary code execution. Even in a
 * clock widget with no server, it is the exact pattern that turns an XSS-shaped
 * bug into an RCE-shaped one, and it violates the project's Content Security
 * Policy direction. A shunting-yard parser is about 120 lines and has no such
 * surface.
 *
 * Grammar:
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/' | '%') factor)*
 *   factor     := unary ('^' factor)?          right-associative
 *   unary      := ('+' | '-')* primary
 *   primary    := number | '(' expression ')' | function '(' expression ')'
 *   function   := sqrt | abs | sin | cos | tan | ln | log | round | floor | ceil
 */

const OPERATORS = {
  "+": { precedence: 1, arity: 2, apply: (a, b) => a + b, symbol: (a, b) => `${a} + ${b}` },
  "-": { precedence: 1, arity: 2, apply: (a, b) => a - b, symbol: (a, b) => `${a} − ${b}` },
  "*": { precedence: 2, arity: 2, apply: (a, b) => a * b, symbol: (a, b) => `${a} × ${b}` },
  "/": { precedence: 2, arity: 2, apply: (a, b) => a / b, symbol: (a, b) => `${a} ÷ ${b}` },
  "%": { precedence: 2, arity: 2, apply: (a, b) => a % b, symbol: (a, b) => `${a} % ${b}` },
  "^": { precedence: 3, arity: 2, apply: (a, b) => Math.pow(a, b), symbol: (a, b) => `${a} ^ ${b}`, rightAssoc: true },
  "u-": { precedence: 4, arity: 1, apply: (a) => -a },
  "u+": { precedence: 4, arity: 1, apply: (a) => a }
};

const FUNCTIONS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  ln: Math.log,
  log: Math.log10,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil
};

/** Thrown for any malformed expression. Caught by the widget, which shows a
 *  message rather than letting a rejection escape. */
export class ExpressionError extends Error {
  constructor(message, position = -1) {
    super(message);
    this.name = "ExpressionError";
    this.position = position;
  }
}

/** Tokenises into numbers, operators, names and parentheses. */
function tokenize(input) {
  const tokens = [];
  const text = String(input);
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === " " || ch === "\t" || ch === "\n") { i++; continue; }

    // Number. Accepts decimals and exponent notation, but NOT the hex/binary
    // prefixes Number() would otherwise accept - those are not calculator input.
    if (/[0-9.]/.test(ch)) {
      const start = i;
      let seenDot = false;
      let seenExp = false;
      while (i < text.length) {
        const c = text[i];
        if (c >= "0" && c <= "9") { i++; continue; }
        if (c === "." && !seenDot && !seenExp) { seenDot = true; i++; continue; }
        if ((c === "e" || c === "E") && !seenExp && i > start) {
          const next = text[i + 1];
          if (next && ((next >= "0" && next <= "9") || next === "-" || next === "+")) {
            seenExp = true;
            i += 2;
            continue;
          }
        }
        break;
      }
      const raw = text.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ExpressionError(`Bad number "${raw}"`, start);
      tokens.push({ type: "number", value, position: start });
      continue;
    }

    // Identifier: function name, or `pi` / `e`.
    if (/[a-zA-Z]/.test(ch)) {
      const start = i;
      while (i < text.length && /[a-zA-Z]/.test(text[i])) i++;
      const name = text.slice(start, i).toLowerCase();
      tokens.push({ type: "name", value: name, position: start });
      continue;
    }

    if (ch === "(" || ch === ")") {
      tokens.push({ type: ch, position: i });
      i++;
      continue;
    }

    if ("+-*/%^".includes(ch)) {
      tokens.push({ type: "operator", value: ch, position: i });
      i++;
      continue;
    }

    if (ch === ",") {
      tokens.push({ type: "comma", position: i });
      i++;
      continue;
    }

    throw new ExpressionError(`Unexpected character "${ch}"`, i);
  }

  return tokens;
}

/**
 * Evaluates an arithmetic expression.
 *
 * @param {string} input
 * @returns {number} the result, which may legitimately be Infinity or NaN for
 *   inputs like `1/0` and `0/0`. The widget is responsible for rendering those
 *   honestly rather than pretending they are numbers.
 * @throws {ExpressionError} on any malformed input.
 */
export function evaluate(input) {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new ExpressionError("Empty expression");

  const output = [];   // RPN
  const stack = [];    // operator stack

  let previousWasValue = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "number") {
      output.push(token);
      previousWasValue = true;
      continue;
    }

    if (token.type === "name") {
      const name = token.value;

      if (name === "pi") { output.push({ type: "number", value: Math.PI, position: token.position }); previousWasValue = true; continue; }
      if (name === "e") { output.push({ type: "number", value: Math.E, position: token.position }); previousWasValue = true; continue; }

      if (FUNCTIONS[name]) {
        if (tokens[i + 1]?.type !== "(") {
          throw new ExpressionError(`"${name}" needs parentheses`, token.position);
        }
        stack.push({ type: "function", value: name, position: token.position });
        previousWasValue = false;
        continue;
      }

      throw new ExpressionError(`Unknown name "${token.value}"`, token.position);
    }

    if (token.type === "(") {
      stack.push(token);
      previousWasValue = false;
      continue;
    }

    if (token.type === ")") {
      while (stack.length && stack[stack.length - 1].type !== "(") {
        if (stack[stack.length - 1].type === "function") {
          throw new ExpressionError(`"${stack[stack.length - 1].value}" is missing an argument`, stack[stack.length - 1].position);
        }
        output.push(stack.pop());
      }
      if (!stack.length) throw new ExpressionError("Unbalanced parentheses", token.position);
      stack.pop(); // discard "("
      if (stack.length && stack[stack.length - 1].type === "function") {
        output.push(stack.pop());
      }
      previousWasValue = true;
      continue;
    }

    if (token.type === "operator") {
      const unary = !previousWasValue ||
        (i > 0 && tokens[i - 1].type === "operator" && tokens[i - 1].value !== ")");

      const op = unary
        ? { ...OPERATORS[token.value === "-" ? "u-" : token.value === "+" ? "u+" : null], position: token.position }
        : { ...OPERATORS[token.value], position: token.position };

      if (!op.apply) throw new ExpressionError(`"${token.value}" is not a unary operator`, token.position);

      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type !== "operator") break;
        const topOp = OPERATORS[top.value];
        // Right-associative operators (^) must not pop an equal-precedence
        // operator, or 2^3^2 becomes (2^3)^2 = 64 instead of 2^9 = 512.
        if (topOp.precedence > op.precedence || (topOp.precedence === op.precedence && !op.rightAssoc)) {
          output.push(stack.pop());
        } else {
          break;
        }
      }
      stack.push({ type: "operator", value: token.value, position: token.position, unary: !!unary, rightAssoc: op.rightAssoc });
      previousWasValue = false;
      continue;
    }

    if (token.type === "comma") {
      while (stack.length && stack[stack.length - 1].type !== "(") output.push(stack.pop());
      if (!stack.length) throw new ExpressionError("Misplaced comma", token.position);
      previousWasValue = false;
      continue;
    }
  }

  while (stack.length) {
    const top = stack.pop();
    if (top.type === "(") throw new ExpressionError("Unbalanced parentheses", top.position);
    if (top.type === "function") throw new ExpressionError(`"${top.value}" is missing an argument`, top.position);
    output.push(top);
  }

  // Evaluate the RPN stream.
  const values = [];
  for (const token of output) {
    if (token.type === "number") { values.push(token.value); continue; }

    if (token.type === "function") {
      const fn = FUNCTIONS[token.value];
      if (!values.length) throw new ExpressionError(`"${token.value}" has no argument`, token.position);
      values.push(fn(values.pop()));
      continue;
    }

    const op = OPERATORS[token.value];
    if (token.unary) {
      if (!values.length) throw new ExpressionError("Missing operand", token.position);
      values.push(token.value === "-" ? -values.pop() : values.pop());
      continue;
    }

    if (values.length < 2) throw new ExpressionError(`"${token.value}" needs two operands`, token.position);
    const b = values.pop();
    const a = values.pop();
    values.push(op.apply(a, b));
  }

  if (values.length !== 1) throw new ExpressionError("Malformed expression");
  return values[0];
}

/** Formats a result for display, including the non-finite cases explicitly. */
export function formatResult(value) {
  if (Number.isNaN(value)) return "Not a number";
  if (value === Infinity) return "∞";
  if (value === -Infinity) return "−∞";

  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return value.toExponential(6);

  // Trim trailing zeros without losing precision the user typed, but never
  // round a whole number into a decimal: `1234.5` must not display as "1,234.5"
  // and `1200` must not become "1,200." with a trailing separator.
  const rounded = Number(value.toPrecision(12));
  const maximumFractionDigits = Number.isInteger(rounded) ? 0 : 10;
  return rounded.toLocaleString(undefined, { maximumFractionDigits });
}

/** Non-throwing wrapper, for live keystroke previews. */
export function tryEvaluate(input) {
  try {
    return { ok: true, value: evaluate(input), error: null };
  } catch (err) {
    return {
      ok: false,
      value: null,
      error: err instanceof ExpressionError ? err.message : "Could not read that expression"
    };
  }
}