export const RollSource = Object.freeze({
  RANDOM_BETWEEN: "randomBetween",
  RANDOM_NUMBER: "randomNumber"
});

const SAMPLE_KEYS = Object.freeze(["label", "max", "min", "source", "value"]);

export class OrderedRollError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidRollSampleError extends OrderedRollError {}
export class RollSequenceError extends OrderedRollError {}
export class RollExhaustedError extends OrderedRollError {}
export class UnusedRollSamplesError extends OrderedRollError {}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index]);
}

function assertSafeInteger(value, field, index) {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidRollSampleError(`Roll sample ${index} has a non-integer ${field}.`);
  }
}

function validateSample(sample, index) {
  if (!isPlainObject(sample) || !hasExactKeys(sample, SAMPLE_KEYS)) {
    throw new InvalidRollSampleError(
      `Roll sample ${index} must have exactly: label, source, min, max, value.`
    );
  }
  if (typeof sample.label !== "string" || sample.label.trim().length === 0) {
    throw new InvalidRollSampleError(`Roll sample ${index} needs a non-empty label.`);
  }
  if (sample.source !== RollSource.RANDOM_BETWEEN && sample.source !== RollSource.RANDOM_NUMBER) {
    throw new InvalidRollSampleError(`Roll sample ${index} has an unsupported source: ${String(sample.source)}.`);
  }
  assertSafeInteger(sample.min, "min", index);
  assertSafeInteger(sample.max, "max", index);
  assertSafeInteger(sample.value, "value", index);
  if (sample.max < sample.min) {
    throw new InvalidRollSampleError(`Roll sample ${index} has max below min.`);
  }
  if (sample.source === RollSource.RANDOM_NUMBER && sample.min !== 0) {
    throw new InvalidRollSampleError(`Roll sample ${index} uses randomNumber, whose minimum must be 0.`);
  }
  if (sample.value < sample.min || sample.value > sample.max) {
    throw new InvalidRollSampleError(
      `Roll sample ${index} value ${sample.value} is outside [${sample.min}, ${sample.max}].`
    );
  }
  return Object.freeze({
    label: sample.label,
    source: sample.source,
    min: sample.min,
    max: sample.max,
    value: sample.value
  });
}

function validateExpectedRoll(expected) {
  if (!isPlainObject(expected)) throw new RollSequenceError("An expected roll descriptor must be an object.");
  const { label, source, min, max } = expected;
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new RollSequenceError("An expected roll needs a non-empty label.");
  }
  if (source !== RollSource.RANDOM_BETWEEN && source !== RollSource.RANDOM_NUMBER) {
    throw new RollSequenceError(`Unsupported expected roll source: ${String(source)}.`);
  }
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
    throw new RollSequenceError("Expected roll bounds must be safe integers with max >= min.");
  }
  if (source === RollSource.RANDOM_NUMBER && min !== 0) {
    throw new RollSequenceError("randomNumber expected rolls must start at 0.");
  }
  return { label, source, min, max };
}

function copySample(sample) {
  return {
    label: sample.label,
    source: sample.source,
    min: sample.min,
    max: sample.max,
    value: sample.value
  };
}

/**
 * A strict, finite stream of explicitly supplied integer rolls.
 *
 * `randomBetween` samples use inclusive min/max bounds. AVM1 `randomNumber(n)`
 * samples are recorded with min 0 and max n - 1.
 */
export class OrderedRollTape {
  #samples;
  #cursor = 0;
  #trace = [];
  #finished = false;

  constructor(samples) {
    if (!Array.isArray(samples)) throw new InvalidRollSampleError("Roll samples must be an array.");
    this.#samples = Object.freeze(samples.map((sample, index) => validateSample(sample, index)));
  }

  get consumedCount() {
    return this.#cursor;
  }

  get remainingCount() {
    return this.#samples.length - this.#cursor;
  }

  get trace() {
    return this.#trace.map(copySample);
  }

  consume(expected) {
    if (this.#finished) throw new OrderedRollError("The ordered roll tape has already been finished.");
    const required = validateExpectedRoll(expected);
    const sample = this.#samples[this.#cursor];
    if (!sample) {
      throw new RollExhaustedError(
        `No roll sample remains for ${required.label} (${required.source} [${required.min}, ${required.max}]).`
      );
    }
    if (
      sample.label !== required.label ||
      sample.source !== required.source ||
      sample.min !== required.min ||
      sample.max !== required.max
    ) {
      throw new RollSequenceError(
        `Roll ${this.#cursor} expected ${required.label} (${required.source} [${required.min}, ${required.max}]) ` +
        `but fixture supplied ${sample.label} (${sample.source} [${sample.min}, ${sample.max}]).`
      );
    }
    this.#cursor += 1;
    this.#trace.push(sample);
    return sample.value;
  }

  take(expected) {
    return this.consume(expected);
  }

  randomBetween(label, min, max) {
    return this.consume({ label, source: RollSource.RANDOM_BETWEEN, min, max });
  }

  randomNumber(label, upperExclusive) {
    if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0) {
      throw new RollSequenceError("randomNumber upperExclusive must be a positive safe integer.");
    }
    return this.consume({
      label,
      source: RollSource.RANDOM_NUMBER,
      min: 0,
      max: upperExclusive - 1
    });
  }

  finish() {
    if (this.remainingCount > 0) {
      const sample = this.#samples[this.#cursor];
      throw new UnusedRollSamplesError(
        `${this.remainingCount} unused roll sample(s) remain; next is ${sample.label} at index ${this.#cursor}.`
      );
    }
    this.#finished = true;
    return this.trace;
  }
}

export function createOrderedRollTape(samples) {
  return new OrderedRollTape(samples);
}

export const createOrderedRolls = createOrderedRollTape;
export { OrderedRollTape as OrderedRolls };
