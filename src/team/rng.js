/**
 * Ordered authoritative RNG channel for the shared team resolver.
 *
 * Every stochastic value a rule set consumes is drawn from one ordered,
 * labelled channel. Two modes exist and both are deterministic:
 *
 * - `seeded`: a self-contained integer generator. Same seed + same ordered
 *   requests => same values. This is what local 1v1/2v2/3v3 play uses.
 * - `tape`: a finite list of explicitly supplied samples with strict label,
 *   source, and bound checking. This is the mode a runtime-verified rule set
 *   uses when it is replayed against a captured licensed observation, and it
 *   deliberately mirrors the sample shape of the 1v1 golden harness
 *   (`{ label, source, min, max, value }`) so a promoted golden's tape can be
 *   handed to the team resolver without translation.
 *
 * `randomBetween` and `randomNumber` are the two sources the licensed AVM1
 * build actually exposes. `unit` has no AVM1 counterpart; it exists only for
 * the placeholder rule set and must not appear in a runtime-verified tape.
 */

export const RollSource = Object.freeze({
  RANDOM_BETWEEN: "randomBetween",
  RANDOM_NUMBER: "randomNumber",
  /** Placeholder-only. The licensed build has no float RNG primitive. */
  UNIT: "unit"
});

const OBSERVABLE_SOURCES = Object.freeze([RollSource.RANDOM_BETWEEN, RollSource.RANDOM_NUMBER]);
const SAMPLE_KEYS = Object.freeze(["label", "max", "min", "source", "value"]);
const UINT32 = 4294967296;

export class TeamRngError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class RngSequenceError extends TeamRngError {}
export class RngExhaustedError extends TeamRngError {}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** The exact generator the pre-seam engine used; kept so replays stay stable. */
function step(state) {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: next, unit: ((t ^ (t >>> 14)) >>> 0) / UINT32 };
}

function assertLabel(label) {
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new RngSequenceError("Every RNG draw needs a non-empty label.");
  }
  return label;
}

function assertBounds(source, min, max) {
  if (source === RollSource.UNIT) {
    if (min !== 0 || max !== 1) throw new RngSequenceError("A unit draw is bounded by [0, 1].");
    return;
  }
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
    throw new RngSequenceError("Integer RNG bounds must be safe integers with max >= min.");
  }
  if (source === RollSource.RANDOM_NUMBER && min !== 0) {
    throw new RngSequenceError("randomNumber draws must start at 0.");
  }
}

function validateSample(sample, index) {
  if (!isPlainObject(sample)) {
    throw new RngSequenceError(`RNG tape sample ${index} must be an object.`);
  }
  const keys = Object.keys(sample).sort();
  if (keys.length !== SAMPLE_KEYS.length || keys.some((key, at) => key !== SAMPLE_KEYS[at])) {
    throw new RngSequenceError(`RNG tape sample ${index} must have exactly: label, source, min, max, value.`);
  }
  assertLabel(sample.label);
  if (!Object.values(RollSource).includes(sample.source)) {
    throw new RngSequenceError(`RNG tape sample ${index} has an unsupported source: ${String(sample.source)}.`);
  }
  assertBounds(sample.source, sample.min, sample.max);
  if (sample.source === RollSource.UNIT) {
    if (!Number.isFinite(sample.value) || sample.value < 0 || sample.value >= 1) {
      throw new RngSequenceError(`RNG tape sample ${index} must carry a unit value in [0, 1).`);
    }
  } else if (!Number.isSafeInteger(sample.value) || sample.value < sample.min || sample.value > sample.max) {
    throw new RngSequenceError(
      `RNG tape sample ${index} value ${String(sample.value)} is outside [${sample.min}, ${sample.max}].`
    );
  }
  return Object.freeze({ ...sample });
}

function copyContext(context) {
  if (context === null || context === undefined) return null;
  if (!isPlainObject(context)) throw new RngSequenceError("An RNG draw context must be a plain object.");
  return Object.freeze(JSON.parse(JSON.stringify(context)));
}

/**
 * One ordered channel. `cursor` is the number of draws taken and is part of
 * the authoritative state: a host and a client that agree on `state` and
 * `cursor` have consumed the same ordered stream.
 */
export class OrderedRngChannel {
  #mode;
  #state;
  #cursor;
  #samples;
  #journal;
  #journalEnabled;

  constructor({ seed, state, cursor = 0, tape = null, journal = true } = {}) {
    this.#mode = tape ? "tape" : "seeded";
    if (tape) {
      if (!Array.isArray(tape)) throw new RngSequenceError("An RNG tape must be an array of samples.");
      this.#samples = Object.freeze(tape.map(validateSample));
      this.#state = 0;
    } else {
      this.#samples = Object.freeze([]);
      const initial = state ?? seed ?? 1;
      if (!Number.isFinite(initial)) throw new RngSequenceError("A seeded RNG channel needs a numeric seed.");
      this.#state = initial >>> 0;
    }
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new RngSequenceError("An RNG cursor must be a count.");
    this.#cursor = cursor;
    this.#journalEnabled = journal !== false;
    this.#journal = [];
  }

  get mode() {
    return this.#mode;
  }

  get state() {
    return this.#state;
  }

  set state(next) {
    if (this.#mode === "tape") throw new RngSequenceError("A tape channel has no generator state to set.");
    if (!Number.isFinite(next)) throw new RngSequenceError("An RNG state must be numeric.");
    this.#state = next >>> 0;
  }

  get cursor() {
    return this.#cursor;
  }

  get remainingCount() {
    return this.#mode === "tape" ? this.#samples.length - this.#cursor : Infinity;
  }

  /** Diagnostic-only ordered record of every draw. Never part of a state hash. */
  get journal() {
    return this.#journal.map((entry) => ({ ...entry }));
  }

  snapshot() {
    return { mode: this.#mode, state: this.#state, cursor: this.#cursor };
  }

  #draw(source, label, min, max, context) {
    assertLabel(label);
    assertBounds(source, min, max);
    let value;
    if (this.#mode === "tape") {
      const sample = this.#samples[this.#cursor];
      if (!sample) {
        throw new RngExhaustedError(
          `No RNG sample remains for ${label} (${source} [${min}, ${max}]).`
        );
      }
      if (sample.label !== label || sample.source !== source || sample.min !== min || sample.max !== max) {
        throw new RngSequenceError(
          `RNG draw ${this.#cursor} expected ${label} (${source} [${min}, ${max}]) ` +
          `but the tape supplied ${sample.label} (${sample.source} [${sample.min}, ${sample.max}]).`
        );
      }
      value = sample.value;
    } else {
      const advanced = step(this.#state);
      this.#state = advanced.state;
      value = source === RollSource.UNIT
        ? advanced.unit
        : Math.min(max, min + Math.floor(advanced.unit * (max - min + 1)));
    }
    if (this.#journalEnabled) {
      this.#journal.push({ sequence: this.#cursor + 1, source, label, min, max, value, context: context ?? null });
    }
    this.#cursor += 1;
    return value;
  }

  unit(label, context = null) {
    return this.#draw(RollSource.UNIT, label, 0, 1, copyContext(context));
  }

  randomBetween(label, min, max, context = null) {
    return this.#draw(RollSource.RANDOM_BETWEEN, label, min, max, copyContext(context));
  }

  randomNumber(label, upperExclusive, context = null) {
    if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0) {
      throw new RngSequenceError("randomNumber upperExclusive must be a positive safe integer.");
    }
    return this.#draw(RollSource.RANDOM_NUMBER, label, 0, upperExclusive - 1, copyContext(context));
  }

  /**
   * A per-action view of the same channel. Rule sets only ever see this: it
   * exposes the three draw methods and nothing that could reorder, rewind, or
   * reseed the authoritative stream.
   */
  withContext(context) {
    const stamped = copyContext(context);
    return Object.freeze({
      get context() {
        return stamped;
      },
      unit: (label) => this.#draw(RollSource.UNIT, label, 0, 1, stamped),
      randomBetween: (label, min, max) => this.#draw(RollSource.RANDOM_BETWEEN, label, min, max, stamped),
      randomNumber: (label, upperExclusive) => {
        if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0) {
          throw new RngSequenceError("randomNumber upperExclusive must be a positive safe integer.");
        }
        return this.#draw(RollSource.RANDOM_NUMBER, label, 0, upperExclusive - 1, stamped);
      }
    });
  }
}

export function createOrderedRngChannel(options = {}) {
  return new OrderedRngChannel(options);
}

/** Sources a licensed AVM1 capture can actually observe. */
export function observableRollSources() {
  return [...OBSERVABLE_SOURCES];
}
