/**
 * Asset-free runtime observation records for the licensed SS2 build.
 *
 * An observation is one instrumented, controlled 1v1 action captured from the
 * fingerprinted licensed installation. It stores only independently authored
 * numeric state, ordered RNG samples with call-site metadata, ordered
 * mutations, semantic events, and integrity digests. It never stores game
 * code, assets, screenshots, or install paths.
 *
 * Observations are the runtime half of the golden pipeline: static candidate
 * fixtures stay hypotheses until at least two matching independent
 * observations exist (see promote-1v1-golden.js).
 */

import { createHash } from "node:crypto";

import { RollSource, createOrderedRollTape } from "./ordered-rolls.js";
import {
  SS2_BUILD_SHA256,
  SS2_STEAM_BUILD_ID,
  assertJsonSafe,
  assertNoAssetPayload,
  assertSs2MutationTraceShape,
  assertSs2ScenarioShape,
  validateSs2OneVsOneFixture
} from "./run-1v1-fixture.js";

export const SS2_OBSERVATION_SCHEMA_VERSION = 1;
export const SS2_OBSERVATION_KIND = "ss2-1v1-observation";

/** Documented capture methods; both keep the installed files read-only. */
export const ObservationCaptureMethod = Object.freeze({
  /** randomBetween wrapped with an injected deterministic tape. */
  INJECTED_TAPE: "injected-tape-runtime",
  /** rolls recorded without forcing them; only exact roll matches count. */
  PASSIVE: "passive-runtime"
});

const OBSERVATION_KEYS = Object.freeze([
  "build",
  "capture",
  "digest",
  "events",
  "finalState",
  "kind",
  "mutationTrace",
  "observationId",
  "resultEvent",
  "samples",
  "scenario",
  "schemaVersion",
  "target"
]);
const CAPTURE_KEYS = Object.freeze([
  "captureToolVersion",
  "installHashVerifiedAfter",
  "installHashVerifiedBefore",
  "method",
  "mutationGranularity",
  "observedAt",
  "sessionId"
]);
const SAMPLE_KEYS = Object.freeze(["callSite", "injected", "label", "max", "min", "source", "value"]);
const RESULT_EVENT_KEYS = Object.freeze([
  "arenaLabel",
  "completionToken",
  "loserSide",
  "overlayLabel",
  "reason",
  "status",
  "type",
  "winnerSide"
]);

/** Exact key set every final-state combatant projection must carry. */
export const SS2_PROJECTED_COMBATANT_KEYS = Object.freeze([
  "armourclass",
  "armourclass_max",
  "boot",
  "breastplate",
  "burning",
  "frozen",
  "gauntlet",
  "greaves",
  "helmet",
  "hitpoints",
  "life_stolen",
  "poison",
  "shield",
  "shinguard",
  "shoulderguard",
  "staminaleft",
  "taunted1",
  "taunted2"
]);
const PROJECTED_BOOLEAN_KEYS = new Set([
  "burning",
  "frozen",
  "life_stolen",
  "poison",
  "taunted1",
  "taunted2"
]);

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CALL_SITE_PATTERN = /^(?:overlay|root|sprite):/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const COSMETIC_DEBRIS_PATTERN = /^armour-debris-\d+-(?:x|y|rotation)$/;

export class ObservationError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ObservationValidationError extends ObservationError {}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, path) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ObservationValidationError(`${path} has unexpected or missing fields.`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Deterministic JSON text: sorted object keys, arrays kept in order. */
export function canonicalJsonStringify(value, path = "value") {
  assertJsonSafe(value, path);
  return canonicalize(value);
}

export function sha256OfCanonicalJson(value, path = "value") {
  return createHash("sha256").update(canonicalJsonStringify(value, path), "utf8").digest("hex");
}

/**
 * The digest covers the full record except the digest field itself, so every
 * observation (with its unique id and capture metadata) digests uniquely.
 */
export function computeSs2ObservationDigest(record) {
  if (!isPlainObject(record)) throw new ObservationValidationError("The observation must be an object.");
  const undigested = { ...record };
  delete undigested.digest;
  return sha256OfCanonicalJson(undigested, "observation");
}

function assertBuildBlock(build, path) {
  if (
    !isPlainObject(build) ||
    build.fingerprintSchemaVersion !== 1 ||
    build.steamBuildId !== SS2_STEAM_BUILD_ID ||
    build.ss2Sha256 !== SS2_BUILD_SHA256
  ) {
    throw new ObservationValidationError(
      `${path} must match fingerprint schema 1, Steam build ${SS2_STEAM_BUILD_ID}, and the pinned SS2 SHA-256.`
    );
  }
  assertExactKeys(build, ["fingerprintSchemaVersion", "ss2Sha256", "steamBuildId"], path);
}

function assertCaptureBlock(capture) {
  if (!isPlainObject(capture)) throw new ObservationValidationError("capture must be an object.");
  assertExactKeys(capture, CAPTURE_KEYS, "capture");
  if (typeof capture.sessionId !== "string" || !TOKEN_PATTERN.test(capture.sessionId)) {
    throw new ObservationValidationError("capture.sessionId must be a valid token.");
  }
  if (
    typeof capture.captureToolVersion !== "string" ||
    capture.captureToolVersion.trim().length === 0 ||
    capture.captureToolVersion.length > 128
  ) {
    throw new ObservationValidationError("capture.captureToolVersion must be a non-empty string.");
  }
  if (!Object.values(ObservationCaptureMethod).includes(capture.method)) {
    throw new ObservationValidationError(
      `capture.method must be one of: ${Object.values(ObservationCaptureMethod).join(", ")}.`
    );
  }
  if (typeof capture.observedAt !== "string" || Number.isNaN(Date.parse(capture.observedAt))) {
    throw new ObservationValidationError("capture.observedAt must be a parseable timestamp.");
  }
  if (capture.installHashVerifiedBefore !== true || capture.installHashVerifiedAfter !== true) {
    throw new ObservationValidationError(
      "The installed SS2 hash must be verified before and after every capture session."
    );
  }
  if (capture.mutationGranularity !== "property-watch") {
    throw new ObservationValidationError(
      "capture.mutationGranularity must be property-watch; coarser capture cannot match ordered mutation traces."
    );
  }
}

function assertSampleShape(sample, index) {
  if (!isPlainObject(sample)) {
    throw new ObservationValidationError(`samples[${index}] must be an object.`);
  }
  assertExactKeys(sample, SAMPLE_KEYS, `samples[${index}]`);
  if (typeof sample.callSite !== "string" || sample.callSite.length > 256 || !CALL_SITE_PATTERN.test(sample.callSite)) {
    throw new ObservationValidationError(
      `samples[${index}].callSite must be an overlay:, root:, or sprite: identifier.`
    );
  }
  if (typeof sample.injected !== "boolean") {
    throw new ObservationValidationError(`samples[${index}].injected must be boolean.`);
  }
  if (sample.injected && sample.source !== RollSource.RANDOM_BETWEEN) {
    throw new ObservationValidationError(
      `samples[${index}] cannot be injected: only randomBetween rolls are injectable; ` +
      "AVM1 RandomNumber opcode rolls can only be recorded."
    );
  }
}

function tapeProjection(samples) {
  return samples.map((sample) => ({
    label: sample.label,
    source: sample.source,
    min: sample.min,
    max: sample.max,
    value: sample.value
  }));
}

/**
 * Cosmetic debris rolls come from the uninterceptable AVM1 RandomNumber
 * opcode after a piece is already removed; they never change combat state, so
 * comparisons check their position and bounds but not their values.
 */
export function isCosmeticDebrisSample(sample) {
  return sample.source === RollSource.RANDOM_NUMBER && COSMETIC_DEBRIS_PATTERN.test(sample.label);
}

function assertEventShape(event, index) {
  if (!isPlainObject(event)) throw new ObservationValidationError(`events[${index}] must be an object.`);
  switch (event.type) {
    case "defender-hurt":
      assertExactKeys(event, ["method", "type"], `events[${index}]`);
      if (!["normal", "critical", "taunt", "grievous"].includes(event.method)) {
        throw new ObservationValidationError(`events[${index}].method must be a mapped defender_hurt method.`);
      }
      return;
    case "defender-blocked":
      assertExactKeys(event, ["type"], `events[${index}]`);
      return;
    case "death":
      assertExactKeys(event, ["side", "type"], `events[${index}]`);
      if (event.side !== "hero" && event.side !== "villain") {
        throw new ObservationValidationError(`events[${index}].side must be hero or villain.`);
      }
      return;
    case "overlay-label":
      assertExactKeys(event, ["label", "type"], `events[${index}]`);
      if (event.label !== "combatwon" && event.label !== "combatlost") {
        throw new ObservationValidationError(`events[${index}].label must be combatwon or combatlost.`);
      }
      return;
    default:
      throw new ObservationValidationError(`events[${index}] has an unsupported type: ${String(event.type)}.`);
  }
}

function assertResultEventShape(resultEvent) {
  if (resultEvent === null) return;
  if (!isPlainObject(resultEvent)) {
    throw new ObservationValidationError("resultEvent must be null or an object.");
  }
  assertExactKeys(resultEvent, RESULT_EVENT_KEYS, "resultEvent");
  const { winnerSide, loserSide } = resultEvent;
  if (
    resultEvent.type !== "battle-result-pending" ||
    resultEvent.status !== "pending-animation" ||
    resultEvent.reason !== "elimination" ||
    (winnerSide !== "hero" && winnerSide !== "villain") ||
    (loserSide !== "hero" && loserSide !== "villain") ||
    winnerSide === loserSide
  ) {
    throw new ObservationValidationError("resultEvent must be a battle-result-pending event with distinct sides.");
  }
  const expectedOverlay = winnerSide === "hero" ? "combatwon" : "combatlost";
  const expectedArena = winnerSide === "hero" ? "combat_won" : "combat_lost";
  const expectedToken = `ss2-1v1:${winnerSide}:${loserSide}:${expectedArena}`;
  if (
    resultEvent.overlayLabel !== expectedOverlay ||
    resultEvent.arenaLabel !== expectedArena ||
    resultEvent.completionToken !== expectedToken
  ) {
    throw new ObservationValidationError("resultEvent labels and completion token must follow the 1v1 convention.");
  }
}

function assertFinalStateShape(finalState, resultEvent) {
  if (!isPlainObject(finalState)) throw new ObservationValidationError("finalState must be an object.");
  assertExactKeys(finalState, ["hero", "result", "villain"], "finalState");
  for (const side of ["hero", "villain"]) {
    const combatant = finalState[side];
    if (!isPlainObject(combatant)) {
      throw new ObservationValidationError(`finalState.${side} must be an object.`);
    }
    assertExactKeys(combatant, SS2_PROJECTED_COMBATANT_KEYS, `finalState.${side}`);
    for (const [key, value] of Object.entries(combatant)) {
      if (PROJECTED_BOOLEAN_KEYS.has(key)) {
        if (typeof value !== "boolean") {
          throw new ObservationValidationError(`finalState.${side}.${key} must be boolean.`);
        }
      } else if (!Number.isFinite(value)) {
        throw new ObservationValidationError(`finalState.${side}.${key} must be numeric.`);
      }
    }
  }
  if (resultEvent === null) {
    if (finalState.result !== null) {
      throw new ObservationValidationError("finalState.result must be null when no result event was observed.");
    }
    return;
  }
  try {
    assertJsonSafe(finalState.result, "finalState.result");
  } catch (error) {
    throw new ObservationValidationError(error.message, { cause: error });
  }
  const expectedResult = { ...resultEvent };
  delete expectedResult.type;
  if (canonicalize(finalState.result) !== canonicalize(expectedResult)) {
    throw new ObservationValidationError("finalState.result must equal the observed result event payload.");
  }
}

function assertResultConsistency(record) {
  const overlayEvents = record.events.filter((event) => event.type === "overlay-label");
  const deathEvents = record.events.filter((event) => event.type === "death");
  if (record.resultEvent === null) {
    if (overlayEvents.length > 0) {
      throw new ObservationValidationError("An overlay-label event requires a matching resultEvent.");
    }
    return;
  }
  if (overlayEvents.length !== 1 || deathEvents.length !== 1) {
    throw new ObservationValidationError(
      "A result-bearing observation needs exactly one death and one overlay-label event."
    );
  }
  if (deathEvents[0].side !== record.resultEvent.loserSide) {
    throw new ObservationValidationError("The death event side must match resultEvent.loserSide.");
  }
  if (overlayEvents[0].label !== record.resultEvent.overlayLabel) {
    throw new ObservationValidationError("The overlay-label event must match resultEvent.overlayLabel.");
  }
}

/** Validate one runtime observation record, including its digest. */
export function validateSs2Observation(record) {
  if (!isPlainObject(record)) throw new ObservationValidationError("The observation must be an object.");
  assertExactKeys(record, OBSERVATION_KEYS, "observation");
  if (record.schemaVersion !== SS2_OBSERVATION_SCHEMA_VERSION) {
    throw new ObservationValidationError(`schemaVersion must be ${SS2_OBSERVATION_SCHEMA_VERSION}.`);
  }
  if (record.kind !== SS2_OBSERVATION_KIND) {
    throw new ObservationValidationError(`kind must be ${SS2_OBSERVATION_KIND}.`);
  }
  if (typeof record.observationId !== "string" || !TOKEN_PATTERN.test(record.observationId)) {
    throw new ObservationValidationError("observationId must be a valid token.");
  }
  assertBuildBlock(record.build, "build");
  assertCaptureBlock(record.capture);
  if (!isPlainObject(record.target)) throw new ObservationValidationError("target must be an object.");
  assertExactKeys(record.target, ["fixtureId"], "target");
  if (typeof record.target.fixtureId !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(record.target.fixtureId)) {
    throw new ObservationValidationError("target.fixtureId must be a lowercase token.");
  }
  assertSs2ScenarioShape(record.scenario, "scenario", ObservationValidationError);
  if (!Array.isArray(record.samples) || record.samples.length === 0 || record.samples.length > 200) {
    throw new ObservationValidationError("samples must be a non-empty array of at most 200 rolls.");
  }
  record.samples.forEach((sample, index) => assertSampleShape(sample, index));
  try {
    createOrderedRollTape(tapeProjection(record.samples));
  } catch (error) {
    throw new ObservationValidationError(`samples: ${error.message}`, { cause: error });
  }
  const injectedCount = record.samples.filter((sample) => sample.injected).length;
  if (record.capture.method === ObservationCaptureMethod.PASSIVE && injectedCount > 0) {
    throw new ObservationValidationError("passive-runtime captures cannot contain injected samples.");
  }
  if (record.capture.method !== ObservationCaptureMethod.PASSIVE && injectedCount === 0) {
    throw new ObservationValidationError(
      `${record.capture.method} captures must contain at least one injected sample.`
    );
  }
  assertSs2MutationTraceShape(record.mutationTrace, "mutationTrace", ObservationValidationError);
  if (record.mutationTrace.length > 500) {
    throw new ObservationValidationError("mutationTrace must contain at most 500 entries.");
  }
  if (!Array.isArray(record.events) || record.events.length > 50) {
    throw new ObservationValidationError("events must be an array of at most 50 entries.");
  }
  record.events.forEach((event, index) => assertEventShape(event, index));
  assertResultEventShape(record.resultEvent);
  assertFinalStateShape(record.finalState, record.resultEvent);
  assertResultConsistency(record);
  try {
    assertJsonSafe(record, "observation");
    assertNoAssetPayload(record, "observation");
  } catch (error) {
    throw new ObservationValidationError(error.message, { cause: error });
  }
  if (typeof record.digest !== "string" || !DIGEST_PATTERN.test(record.digest)) {
    throw new ObservationValidationError("digest must be a lowercase SHA-256 hex digest.");
  }
  const expectedDigest = computeSs2ObservationDigest(record);
  if (record.digest !== expectedDigest) {
    throw new ObservationValidationError("digest does not match the record contents.");
  }
  return record;
}

function comparableSamples(samples) {
  return samples.map((sample) => ({
    label: sample.label,
    source: sample.source,
    min: sample.min,
    max: sample.max,
    value: isCosmeticDebrisSample(sample) ? null : sample.value
  }));
}

/**
 * The projection two independent observations must agree on. Identity and
 * capture metadata are excluded (they must differ); cosmetic debris roll
 * values are redacted; mutation reasons are wrapper hook attributions and are
 * kept because independent runs of the same tooling must attribute alike.
 */
export function projectSs2ObservationForComparison(record) {
  return cloneJson({
    build: record.build,
    target: record.target,
    scenario: record.scenario,
    samples: comparableSamples(record.samples),
    mutationTrace: record.mutationTrace,
    events: record.events,
    resultEvent: record.resultEvent,
    finalState: record.finalState
  });
}

const MAX_DIFFERENCES = 200;

function pushDifference(differences, difference) {
  if (differences.length < MAX_DIFFERENCES) differences.push(difference);
}

function collectDifferences(expected, actual, path, differences) {
  if (differences.length >= MAX_DIFFERENCES) return;
  const bothObjects =
    expected !== null && actual !== null &&
    typeof expected === "object" && typeof actual === "object" &&
    Array.isArray(expected) === Array.isArray(actual);
  if (!bothObjects) {
    if (canonicalize(expected ?? null) !== canonicalize(actual ?? null)) {
      pushDifference(differences, {
        path,
        expected: cloneJson(expected ?? null),
        actual: cloneJson(actual ?? null)
      });
    }
    return;
  }
  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) {
      pushDifference(differences, {
        path: `${path}/length`,
        expected: expected.length,
        actual: actual.length
      });
    }
    const shared = Math.min(expected.length, actual.length);
    for (let index = 0; index < shared; index += 1) {
      if (differences.length >= MAX_DIFFERENCES) return;
      collectDifferences(expected[index], actual[index], `${path}/${index}`, differences);
    }
    return;
  }
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  for (const key of keys) {
    if (differences.length >= MAX_DIFFERENCES) return;
    if (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key)) {
      pushDifference(differences, {
        path: `${path}/${key}`,
        expected: Object.hasOwn(expected, key) ? cloneJson(expected[key]) : undefined,
        actual: Object.hasOwn(actual, key) ? cloneJson(actual[key]) : undefined
      });
      continue;
    }
    collectDifferences(expected[key], actual[key], `${path}/${key}`, differences);
  }
}

/** Compare two validated observations; match means equal comparison projections. */
export function ss2ObservationsMatch(left, right) {
  validateSs2Observation(left);
  validateSs2Observation(right);
  const differences = [];
  collectDifferences(
    projectSs2ObservationForComparison(left),
    projectSs2ObservationForComparison(right),
    "",
    differences
  );
  return { match: differences.length === 0, differences };
}

/** Semantic events a fixture's expected outcome implies at runtime. */
export function deriveExpectedEventsFromSs2Fixture(fixture) {
  if (fixture?.expected?.calculation?.hit !== true) {
    return [{ type: "defender-blocked" }];
  }
  const events = [{ type: "defender-hurt", method: fixture.expected.calculation.dispatchedMethod }];
  if (fixture.expected.resultEvent) {
    events.push({ type: "death", side: fixture.expected.resultEvent.loserSide });
    events.push({ type: "overlay-label", label: fixture.expected.resultEvent.overlayLabel });
  }
  return events;
}

function candidateIdFor(fixtureId) {
  return fixtureId.startsWith("golden-") ? `candidate-${fixtureId.slice("golden-".length)}` : fixtureId;
}

function stripTraceReasons(trace) {
  return trace.map((entry) => ({
    sequence: entry.sequence,
    path: entry.path,
    before: entry.before,
    after: entry.after
  }));
}

/**
 * Match one runtime observation against a fixture's runtime-observable
 * projection: scenario, ordered samples, ordered mutations (reasons are
 * annotations, not part of the contract), semantic events, the result event,
 * and the final state. `expected.calculation`/`expected.mutation` stay
 * candidate-derived and are not directly observable.
 */
export function matchSs2ObservationToFixture(fixture, observation) {
  validateSs2OneVsOneFixture(fixture);
  validateSs2Observation(observation);
  const differences = [];

  if (
    observation.target.fixtureId !== fixture.fixtureId &&
    observation.target.fixtureId !== candidateIdFor(fixture.fixtureId)
  ) {
    differences.push({
      path: "/target/fixtureId",
      expected: fixture.fixtureId,
      actual: observation.target.fixtureId
    });
  }
  collectDifferences(fixture.build, observation.build, "/build", differences);
  collectDifferences(fixture.scenario, observation.scenario, "/scenario", differences);

  const observed = comparableSamples(observation.samples);
  if (fixture.samples.length !== observed.length) {
    differences.push({
      path: "/samples/length",
      expected: fixture.samples.length,
      actual: observed.length
    });
  }
  const sharedSamples = Math.min(fixture.samples.length, observed.length);
  for (let index = 0; index < sharedSamples; index += 1) {
    const expectedSample = fixture.samples[index];
    const observedSample = observed[index];
    const cosmetic = isCosmeticDebrisSample(expectedSample) && observedSample.value === null;
    const comparableExpected = cosmetic ? { ...expectedSample, value: null } : expectedSample;
    collectDifferences(comparableExpected, observedSample, `/samples/${index}`, differences);
  }

  collectDifferences(
    stripTraceReasons(fixture.expected.mutationTrace),
    stripTraceReasons(observation.mutationTrace),
    "/mutationTrace",
    differences
  );
  collectDifferences(
    deriveExpectedEventsFromSs2Fixture(fixture),
    observation.events,
    "/events",
    differences
  );
  collectDifferences(fixture.expected.resultEvent, observation.resultEvent, "/resultEvent", differences);
  collectDifferences(fixture.expected.state, observation.finalState, "/finalState", differences);

  return { match: differences.length === 0, differences };
}
