import { createOrderedRollTape } from "./ordered-rolls.js";

export const SS2_GOLDEN_SCHEMA_VERSION = 1;
export const SS2_1V1_FIXTURE_KIND = "ss2-1v1-fixture";
export const SS2_BUILD_SHA256 = "77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA";
export const SS2_STEAM_BUILD_ID = 24807725;

export const GoldenClassification = Object.freeze({
  CANDIDATE: "candidate",
  GOLDEN: "golden"
});

export const GoldenProvenance = Object.freeze({
  SYNTHETIC: "synthetic-static-map",
  LICENSED: "licensed-observation"
});

const TOP_LEVEL_KEYS = Object.freeze([
  "build",
  "classification",
  "expected",
  "fixtureId",
  "kind",
  "provenance",
  "samples",
  "scenario",
  "schemaVersion"
]);
const BUILD_KEYS = Object.freeze(["fingerprintSchemaVersion", "ss2Sha256", "steamBuildId"]);
const EXPECTED_KEYS = Object.freeze(["calculation", "mutation", "mutationTrace", "resultEvent", "state"]);
const MUTATION_TRACE_KEYS = Object.freeze(["after", "before", "path", "reason", "sequence"]);
const CANDIDATE_PROVENANCE_KEYS = new Set([
  "candidateFlags",
  "kind",
  "runtimeVerified",
  "sourceRefs"
]);
const GOLDEN_PROVENANCE_KEYS = new Set([
  "captureManifestSha256",
  "captureToolVersion",
  "kind",
  "observationDigests",
  "observationIds",
  "observedAt",
  "repetitions",
  "runtimeVerified",
  "sourceRefs"
]);
const SCENARIO_KEYS = new Set([
  "attackDirection",
  "attackerSide",
  "fightMode",
  "hero",
  "result",
  "transient",
  "villain"
]);
const COMBATANT_KEYS = new Set([
  "armourclass",
  "armourclass_max",
  "attack",
  "boot",
  "boot_defence",
  "breastplate",
  "breastplate_defence",
  "burning",
  "character_level",
  "charisma",
  "defence",
  "equipped_weapon",
  "frozen",
  "gauntlet",
  "gauntlet_defence",
  "gladiator_dir",
  "greaves",
  "greaves_defence",
  "helmet",
  "helmet_defence",
  "hitpoints",
  "hitpointsmax",
  "life_stolen",
  "magicka",
  "max_damage",
  "min_damage",
  "poison",
  "secondary_weapon_enchantment_potency",
  "secondary_weapon_enchantment_type",
  "shield",
  "shield_defence",
  "shinguard",
  "shinguard_defence",
  "shoulderguard",
  "shoulderguard_defence",
  "staminaleft",
  "staminamax",
  "strength",
  "taunted1",
  "taunted2",
  "weapon_enchantment_potency",
  "weapon_enchantment_type"
]);
const BOOLEAN_COMBATANT_KEYS = new Set([
  "burning",
  "frozen",
  "life_stolen",
  "poison",
  "taunted1",
  "taunted2"
]);

/** Exact key set of every projected combatant state (fixtures and observations). */
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
const RESULT_EVENT_KEYS = Object.freeze([
  "arenaLabel",
  "completionToken",
  "howDied",
  "loserSide",
  "overlayLabel",
  "reason",
  "status",
  "type",
  "winnerSide"
]);
const RESULT_REASONS = new Set(["elimination", "first-blood"]);
const RESULT_HOW_DIED = new Set(["slain", "yield", "taunt", "arrow", "grievous"]);

export class GoldenFixtureError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class GoldenFixtureValidationError extends GoldenFixtureError {}

export class GoldenFixtureMismatchError extends GoldenFixtureError {
  constructor(expected, actual, trace) {
    super("The resolver outcome does not exactly match the golden fixture's expected result.");
    this.expected = cloneJson(expected);
    this.actual = cloneJson(actual);
    this.trace = cloneJson(trace);
  }
}

export { GoldenFixtureValidationError as InvalidGoldenFixtureError };

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expected, path) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new GoldenFixtureValidationError(`${path} has unexpected or missing fields.`);
  }
}

function assertAllowedKeys(value, allowed, path) {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new GoldenFixtureValidationError(`${path} has unsupported fields: ${unexpected.join(", ")}.`);
  }
}

function assertSourceRefs(sourceRefs) {
  if (
    !Array.isArray(sourceRefs) ||
    sourceRefs.length === 0 ||
    sourceRefs.some((ref) => typeof ref !== "string" || ref.length > 256 || !/^(overlay|root|sprite):/.test(ref))
  ) {
    throw new GoldenFixtureValidationError(
      "provenance.sourceRefs must contain non-empty overlay:, root:, or sprite: identifiers."
    );
  }
}

function assertUniqueStrings(values, count, name, pattern) {
  if (
    !Array.isArray(values) ||
    values.length !== count ||
    values.some((value) => typeof value !== "string" || !pattern.test(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new GoldenFixtureValidationError(`${name} must contain ${count} unique valid values.`);
  }
}

function assertCombatantShape(combatant, path) {
  if (!isPlainObject(combatant)) throw new GoldenFixtureValidationError(`${path} must be an object.`);
  assertAllowedKeys(combatant, COMBATANT_KEYS, path);
  for (const [key, value] of Object.entries(combatant)) {
    if (key === "gladiator_dir") {
      if (value !== "left" && value !== "right") {
        throw new GoldenFixtureValidationError(`${path}.gladiator_dir must be left or right.`);
      }
    } else if (BOOLEAN_COMBATANT_KEYS.has(key)) {
      if (typeof value !== "boolean") throw new GoldenFixtureValidationError(`${path}.${key} must be boolean.`);
    } else if (!Number.isFinite(value)) {
      throw new GoldenFixtureValidationError(`${path}.${key} must be numeric.`);
    }
  }
}

export function assertNoAssetPayload(value, path = "fixture") {
  if (typeof value === "string") {
    if (
      value.length > 512 ||
      /\0/.test(value) ||
      /^(?:data:|[a-z]:[\\/]|\\\\)/i.test(value) ||
      /\.(?:swf|png|jpe?g|gif|mp3|wav|flv|zip|jar)(?:$|[?#])/i.test(value)
    ) {
      throw new GoldenFixtureValidationError(`${path} contains a path or asset-like payload.`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAssetPayload(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) assertNoAssetPayload(item, `${path}.${key}`);
}

function rethrowAs(ErrorClass, run) {
  try {
    run();
  } catch (error) {
    if (ErrorClass !== GoldenFixtureValidationError && error instanceof GoldenFixtureValidationError) {
      throw new ErrorClass(error.message, { cause: error });
    }
    throw error;
  }
}

/** Shared ordered-mutation-trace shape check for fixtures and observations. */
export function assertSs2MutationTraceShape(trace, path = "mutationTrace", ErrorClass = GoldenFixtureValidationError) {
  rethrowAs(ErrorClass, () => {
    if (!Array.isArray(trace)) {
      throw new GoldenFixtureValidationError(`${path} must be an ordered array.`);
    }
    trace.forEach((entry, index) => {
      if (!isPlainObject(entry)) throw new GoldenFixtureValidationError(`${path}[${index}] must be an object.`);
      assertExactKeys(entry, MUTATION_TRACE_KEYS, `${path}[${index}]`);
      if (
        entry.sequence !== index + 1 ||
        typeof entry.path !== "string" ||
        !/^\/(?:(?:hero|villain)\/[a-z][a-z0-9_]*|result)$/.test(entry.path) ||
        typeof entry.reason !== "string" ||
        !/^[a-z][a-z-]{0,63}$/.test(entry.reason)
      ) {
        throw new GoldenFixtureValidationError(`${path}[${index}] has invalid ordering or metadata.`);
      }
      if (jsonValuesEqual(entry.before ?? null, entry.after ?? null)) {
        throw new GoldenFixtureValidationError(
          `${path}[${index}] is a no-op assignment (before equals after); ` +
          "no-op sets are dropped at ingest and can never match."
        );
      }
    });
  });
}

/**
 * Shared battle-result event shape check. The convention ties the labels and
 * completion token to the winner side; `null` means no result was produced.
 */
export function assertSs2ResultEventShape(resultEvent, path = "resultEvent", ErrorClass = GoldenFixtureValidationError) {
  rethrowAs(ErrorClass, () => {
    if (resultEvent === null) return;
    if (!isPlainObject(resultEvent)) {
      throw new GoldenFixtureValidationError(`${path} must be null or an object.`);
    }
    assertExactKeys(resultEvent, RESULT_EVENT_KEYS, path);
    const { winnerSide, loserSide } = resultEvent;
    if (
      resultEvent.type !== "battle-result-pending" ||
      resultEvent.status !== "pending-animation" ||
      !RESULT_REASONS.has(resultEvent.reason) ||
      !RESULT_HOW_DIED.has(resultEvent.howDied) ||
      (winnerSide !== "hero" && winnerSide !== "villain") ||
      (loserSide !== "hero" && loserSide !== "villain") ||
      winnerSide === loserSide
    ) {
      throw new GoldenFixtureValidationError(
        `${path} must be a battle-result-pending event with distinct sides, ` +
        "a mapped reason, and a mapped howDied."
      );
    }
    const expectedOverlay = winnerSide === "hero" ? "combatwon" : "combatlost";
    const expectedArena = winnerSide === "hero" ? "combat_won" : "combat_lost";
    const expectedToken = `ss2-1v1:${winnerSide}:${loserSide}:${expectedArena}`;
    if (
      resultEvent.overlayLabel !== expectedOverlay ||
      resultEvent.arenaLabel !== expectedArena ||
      resultEvent.completionToken !== expectedToken
    ) {
      throw new GoldenFixtureValidationError(
        `${path} labels and completion token must follow the 1v1 convention.`
      );
    }
  });
}

function assertProjectedCombatantShape(projection, path) {
  if (!isPlainObject(projection)) throw new GoldenFixtureValidationError(`${path} must be an object.`);
  assertExactKeys(projection, SS2_PROJECTED_COMBATANT_KEYS, path);
  for (const [key, value] of Object.entries(projection)) {
    if (BOOLEAN_COMBATANT_KEYS.has(key)) {
      if (typeof value !== "boolean") {
        throw new GoldenFixtureValidationError(`${path}.${key} must be boolean.`);
      }
    } else if (!Number.isFinite(value)) {
      throw new GoldenFixtureValidationError(`${path}.${key} must be numeric.`);
    }
  }
}

function assertExpectedShape(expected) {
  if (!isPlainObject(expected)) throw new GoldenFixtureValidationError("expected must be an object.");
  assertExactKeys(expected, EXPECTED_KEYS, "expected");
  if (!isPlainObject(expected.calculation) || !isPlainObject(expected.mutation)) {
    throw new GoldenFixtureValidationError("expected calculation and mutation must be objects.");
  }
  if (!Array.isArray(expected.mutationTrace)) {
    throw new GoldenFixtureValidationError("expected.mutationTrace must be an ordered array.");
  }
  assertSs2MutationTraceShape(expected.mutationTrace, "mutationTrace");
  if (!isPlainObject(expected.state)) throw new GoldenFixtureValidationError("expected.state must be an object.");
  assertExactKeys(expected.state, ["hero", "result", "villain"], "expected.state");
  assertProjectedCombatantShape(expected.state.hero, "expected.state.hero");
  assertProjectedCombatantShape(expected.state.villain, "expected.state.villain");
  assertSs2ResultEventShape(expected.resultEvent, "expected.resultEvent");

  // The /result mutation entry and the result event must agree: a lethal
  // outcome records exactly one /result entry whose payload is the event.
  const resultEntries = expected.mutationTrace.filter((entry) => entry.path === "/result");
  if (expected.resultEvent === null) {
    if (resultEntries.length !== 0) {
      throw new GoldenFixtureValidationError(
        "expected.mutationTrace records /result but expected.resultEvent is null."
      );
    }
    if (expected.state.result !== null) {
      throw new GoldenFixtureValidationError(
        "expected.state.result must be null when no result event is expected."
      );
    }
  } else {
    const resultPayload = { ...expected.resultEvent };
    delete resultPayload.type;
    if (
      resultEntries.length !== 1 ||
      resultEntries[0].before !== null ||
      !jsonValuesEqual(resultEntries[0].after, resultPayload)
    ) {
      throw new GoldenFixtureValidationError(
        "a result-bearing fixture needs exactly one /result mutation whose payload equals the result event."
      );
    }
    if (!jsonValuesEqual(expected.state.result, resultPayload)) {
      throw new GoldenFixtureValidationError(
        "expected.state.result must equal the expected result event payload."
      );
    }
  }
}

/** Shared 1v1 scenario shape check for fixtures and observations. */
export function assertSs2ScenarioShape(scenario, path = "scenario", ErrorClass = GoldenFixtureValidationError) {
  rethrowAs(ErrorClass, () => {
    if (!isPlainObject(scenario)) {
      throw new GoldenFixtureValidationError(`${path} must be an object containing hero and villain.`);
    }
    assertAllowedKeys(scenario, SCENARIO_KEYS, path);
    if (scenario.attackerSide !== "hero" && scenario.attackerSide !== "villain") {
      throw new GoldenFixtureValidationError(`${path}.attackerSide must be hero or villain.`);
    }
    if (!Number.isSafeInteger(scenario.attackDirection)) {
      throw new GoldenFixtureValidationError(`${path}.attackDirection must be an integer.`);
    }
    if (
      scenario.fightMode !== undefined &&
      scenario.fightMode !== "tournament" &&
      scenario.fightMode !== "duel" &&
      scenario.fightMode !== "misc"
    ) {
      throw new GoldenFixtureValidationError(
        `${path}.fightMode must be tournament, duel, or misc (absent means tournament).`
      );
    }
    if (scenario.result !== null) {
      throw new GoldenFixtureValidationError("A one-action 1v1 fixture must start with result=null.");
    }
    if (scenario.transient !== undefined) {
      if (
        !isPlainObject(scenario.transient) ||
        Object.keys(scenario.transient).length !== 1 ||
        !Number.isFinite(scenario.transient.criticalhit)
      ) {
        throw new GoldenFixtureValidationError(`${path}.transient may contain only numeric criticalhit.`);
      }
    }
    assertCombatantShape(scenario.hero, `${path}.hero`);
    assertCombatantShape(scenario.villain, `${path}.villain`);
  });
}

function assertJsonValue(value, path, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new GoldenFixtureValidationError(`${path} contains a non-finite number.`);
    return;
  }
  if (typeof value !== "object") {
    throw new GoldenFixtureValidationError(`${path} is not JSON-safe.`);
  }
  if (ancestors.has(value)) throw new GoldenFixtureValidationError(`${path} contains a circular reference.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new GoldenFixtureValidationError(`${path} contains a sparse array.`);
      assertJsonValue(value[index], `${path}[${index}]`, ancestors);
    }
  } else {
    if (!isPlainObject(value)) throw new GoldenFixtureValidationError(`${path} contains a non-plain object.`);
    for (const key of Object.keys(value)) assertJsonValue(value[key], `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

export function assertJsonSafe(value, path = "value") {
  assertJsonValue(value, path, new Set());
  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonValuesEqual(left, right) {
  if (typeof left !== typeof right) return false;
  if (left === null || right === null || typeof left !== "object") return Object.is(left, right);
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => jsonValuesEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) return false;
    if (!jsonValuesEqual(left[leftKeys[index]], right[rightKeys[index]])) return false;
  }
  return true;
}

/** Validate the asset-free fixture envelope before any candidate rules run. */
export function validateSs2OneVsOneFixture(fixture) {
  if (!isPlainObject(fixture)) throw new GoldenFixtureValidationError("The golden fixture must be an object.");
  assertExactKeys(fixture, TOP_LEVEL_KEYS, "fixture");
  if (fixture.schemaVersion !== SS2_GOLDEN_SCHEMA_VERSION) {
    throw new GoldenFixtureValidationError(`schemaVersion must be ${SS2_GOLDEN_SCHEMA_VERSION}.`);
  }
  if (fixture.kind !== SS2_1V1_FIXTURE_KIND) {
    throw new GoldenFixtureValidationError(`kind must be ${SS2_1V1_FIXTURE_KIND}.`);
  }
  if (typeof fixture.fixtureId !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(fixture.fixtureId)) {
    throw new GoldenFixtureValidationError("fixtureId must be a lowercase token.");
  }
  if (
    !isPlainObject(fixture.build) ||
    fixture.build.fingerprintSchemaVersion !== 1 ||
    fixture.build.steamBuildId !== SS2_STEAM_BUILD_ID ||
    fixture.build.ss2Sha256 !== SS2_BUILD_SHA256
  ) {
    throw new GoldenFixtureValidationError(
      `build must match fingerprint schema 1, Steam build ${SS2_STEAM_BUILD_ID}, and SS2 SHA-256 ${SS2_BUILD_SHA256}.`
    );
  }
  assertExactKeys(fixture.build, BUILD_KEYS, "build");
  if (!isPlainObject(fixture.provenance)) {
    throw new GoldenFixtureValidationError("provenance must be an object.");
  }
  if (fixture.classification === GoldenClassification.CANDIDATE) {
    assertAllowedKeys(fixture.provenance, CANDIDATE_PROVENANCE_KEYS, "candidate provenance");
    if (fixture.provenance.kind !== GoldenProvenance.SYNTHETIC || fixture.provenance.runtimeVerified !== false) {
      throw new GoldenFixtureValidationError(
        "candidate fixtures require synthetic-static-map provenance and runtimeVerified=false."
      );
    }
    assertSourceRefs(fixture.provenance.sourceRefs);
    if (
      fixture.provenance.candidateFlags !== undefined &&
      (
        !Array.isArray(fixture.provenance.candidateFlags) ||
        fixture.provenance.candidateFlags.some(
          (flag) => typeof flag !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(flag)
        )
      )
    ) {
      throw new GoldenFixtureValidationError("candidateFlags must be lowercase tokens.");
    }
  } else if (fixture.classification === GoldenClassification.GOLDEN) {
    assertAllowedKeys(fixture.provenance, GOLDEN_PROVENANCE_KEYS, "golden provenance");
    if (fixture.provenance.kind !== GoldenProvenance.LICENSED || fixture.provenance.runtimeVerified !== true) {
      throw new GoldenFixtureValidationError(
        "golden fixtures require licensed-observation provenance and runtimeVerified=true."
      );
    }
    if (
      typeof fixture.provenance.observedAt !== "string" ||
      Number.isNaN(Date.parse(fixture.provenance.observedAt)) ||
      typeof fixture.provenance.captureToolVersion !== "string" ||
      fixture.provenance.captureToolVersion.trim().length === 0 ||
      fixture.provenance.captureToolVersion.length > 128 ||
      !Number.isSafeInteger(fixture.provenance.repetitions) ||
      fixture.provenance.repetitions < 2
    ) {
      throw new GoldenFixtureValidationError(
        "golden provenance requires a parseable observedAt, captureToolVersion, and at least two repetitions."
      );
    }
    assertSourceRefs(fixture.provenance.sourceRefs);
    assertUniqueStrings(
      fixture.provenance.observationIds,
      fixture.provenance.repetitions,
      "observationIds",
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
    );
    assertUniqueStrings(
      fixture.provenance.observationDigests,
      fixture.provenance.repetitions,
      "observationDigests",
      /^[A-Fa-f0-9]{64}$/
    );
    if (!/^[A-Fa-f0-9]{64}$/.test(fixture.provenance.captureManifestSha256 ?? "")) {
      throw new GoldenFixtureValidationError("captureManifestSha256 must be a SHA-256 digest.");
    }
  } else {
    throw new GoldenFixtureValidationError("classification must be candidate or golden.");
  }
  assertSs2ScenarioShape(fixture.scenario, "scenario");
  if (!Array.isArray(fixture.samples)) throw new GoldenFixtureValidationError("samples must be an array.");
  assertJsonSafe(fixture.build, "build");
  assertJsonSafe(fixture.provenance, "provenance");
  assertJsonSafe(fixture.scenario, "scenario");
  assertJsonSafe(fixture.expected, "expected");
  assertExpectedShape(fixture.expected);
  assertNoAssetPayload(fixture);
  createOrderedRollTape(fixture.samples);
  return fixture;
}

/**
 * Run one candidate 1v1 resolver with a finite ordered-roll tape.
 *
 * The resolver receives `(scenarioClone, rolls)`. It may mutate the clone, but
 * never the fixture. Its return value must be JSON-safe and exactly equal to
 * `fixture.expected`; all supplied rolls must also have been consumed.
 */
export function runSs2OneVsOneGoldenFixture(fixture, resolver) {
  validateSs2OneVsOneFixture(fixture);
  if (typeof resolver !== "function") throw new GoldenFixtureValidationError("resolver must be a function.");

  const scenario = cloneJson(fixture.scenario);
  const rolls = createOrderedRollTape(fixture.samples);
  const outcome = resolver(scenario, rolls);
  const trace = rolls.finish();
  assertJsonSafe(outcome, "resolver outcome");
  if (!jsonValuesEqual(outcome, fixture.expected)) {
    throw new GoldenFixtureMismatchError(fixture.expected, outcome, trace);
  }
  return { outcome: cloneJson(outcome), trace: cloneJson(trace) };
}

export const validateOneVsOneGoldenFixture = validateSs2OneVsOneFixture;
export const runOneVsOneGoldenFixture = runSs2OneVsOneGoldenFixture;
