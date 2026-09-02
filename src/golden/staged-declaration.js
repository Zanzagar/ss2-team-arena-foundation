/**
 * The `side.field=value` staging grammar, in the one place both sides can reach.
 *
 * A capture that stages combatant state has to declare it, and TWO layers need
 * to parse the same declaration: an observation record carries it as
 * `capture.staged` (`observation.js`), and a promoted golden carries it as
 * `provenance.staged` (`run-1v1-fixture.js`). Those two modules cannot share it
 * directly — `observation.js` already imports `run-1v1-fixture.js`, so the
 * obvious import is a CYCLE.
 *
 * `promote-1v1-golden.js`'s refusal message says to "validate it with
 * parseSs2StagedDeclaration from src/golden/observation.js", and that is the
 * one instruction in it that cannot be followed as written. This module is the
 * answer: the grammar moves DOWN to a leaf both can depend on, and
 * `observation.js` re-exports it so every existing caller is untouched.
 *
 * ## Why the error class is a parameter
 *
 * The same grammar failing means different things at different layers — an
 * observation with a malformed declaration is `ObservationValidationError`, a
 * golden with one is `GoldenFixtureValidationError` — and both are part of
 * their module's contract. Rather than change either, the caller passes the
 * class it owes its own callers. A shared leaf that dictated one error type
 * would quietly re-classify every existing failure.
 */

/** A staged entry: `side.field=value`, sides fixed to the two the build has. */
const STAGED_ENTRY_PATTERN =
  /^(hero|villain)\.([a-z][a-z0-9_]{0,63})=(-?\d+(?:\.\d+)?|true|false)$/;

/**
 * The declaration is a trace field, so it is bounded like one.
 *
 * 512 characters comfortably holds the longest staging this project uses — the
 * sixteen-key armoured villain string is 232 — while refusing a trace line that
 * has run away.
 */
export const SS2_STAGED_MAX_LENGTH = 512;

/** Thrown when no caller supplied its own class. */
export class StagedDeclarationError extends Error {}

/**
 * Parse a staging declaration into ordered `{ side, field, value }` entries.
 *
 * Order is APPLICATION order and is preserved: the wrapper writes the fields in
 * the order given, and a later write to the same field would shadow an earlier
 * one — so a repeated key is refused rather than resolved, because "the value
 * that stuck" is not recoverable from the text alone.
 *
 * @param {string} text          the declaration
 * @param {string} [path]        where it came from, for the message
 * @param {Function} [ErrorClass] the error to throw; defaults to this module's
 */
export function parseStagedDeclaration(text, path = "capture.staged", ErrorClass = StagedDeclarationError) {
  const reject = (why) => {
    throw new ErrorClass(
      `${path} must be a non-empty comma-separated "side.field=value" list in application order, ` +
      `for example "hero.strength=40,villain.helmet=6" — ${why}. A capture that staged nothing ` +
      "omits the field entirely; the empty string is not a second spelling of that."
    );
  };
  if (typeof text !== "string") reject(`got ${JSON.stringify(text)}`);
  if (text.length === 0) reject("it is empty");
  if (text.length > SS2_STAGED_MAX_LENGTH) {
    reject(`it is ${text.length} characters, past the ${SS2_STAGED_MAX_LENGTH} cap`);
  }
  const entries = [];
  const seen = new Set();
  for (const part of text.split(",")) {
    const match = STAGED_ENTRY_PATTERN.exec(part);
    if (!match) reject(`the entry ${JSON.stringify(part)} is not side.field=value`);
    const [, side, field, literal] = match;
    const key = `${side}.${field}`;
    if (seen.has(key)) {
      reject(`${key} is listed twice — each staged field appears once, carrying the value that stuck`);
    }
    seen.add(key);
    entries.push({
      side,
      field,
      value: literal === "true" ? true : literal === "false" ? false : Number(literal)
    });
  }
  return entries;
}
