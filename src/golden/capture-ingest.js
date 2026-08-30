/**
 * Normalizes one raw instrumentation trace (JSON lines) into a validated
 * runtime observation record.
 *
 * The raw trace is produced by the read-only capture wrapper described in
 * docs/integration/ss2-runtime-capture.md. Raw traces stay outside Git; only
 * the normalized, independently authored observation record is committed.
 *
 * Line grammar (one JSON object per line):
 *   meta   first line: session/observation identity and attestations
 *   state  staged pre-action dump, one per side
 *   var    named scalar (attack_direction, criticalhit)
 *   roll   one ordered RNG sample with call-site metadata
 *   set    one watched property assignment (hook = wrapper attribution)
 *   event  semantic event (defender-hurt/defender-blocked/death/overlay-label)
 *   final  post-action dump, one per side
 *   end    last line: closing hash attestation
 */

import {
  SS2_OBSERVATION_KIND,
  SS2_OBSERVATION_SCHEMA_VERSION,
  SS2_PROJECTED_COMBATANT_KEYS,
  canonicalJsonStringify,
  computeSs2ObservationDigest,
  validateSs2Observation
} from "./observation.js";
import {
  SS2_BUILD_SHA256,
  SS2_STEAM_BUILD_ID,
  validateSs2OneVsOneFixture
} from "./run-1v1-fixture.js";

export const SS2_CAPTURE_TRACE_VERSION = 1;

const META_KEYS = Object.freeze([
  "attackerSide",
  "captureToolVersion",
  "installHashVerifiedBefore",
  "method",
  "mutationGranularity",
  "observationId",
  "observedAt",
  "schemaVersion",
  "sessionId",
  "t"
]);
const HOOK_PATTERN = /^[a-z][a-z-]{0,63}$/;
const SET_PATH_PATTERN = /^\/(?:hero|villain)\/([a-z][a-z0-9_]*)$/;

export class CaptureTraceError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

function fail(lineNumber, message) {
  throw new CaptureTraceError(`Capture trace line ${lineNumber}: ${message}`);
}

function parseLines(rawText) {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    throw new CaptureTraceError("The capture trace is empty.");
  }
  const lines = [];
  const textLines = rawText.split(/\r?\n/);
  for (let index = 0; index < textLines.length; index += 1) {
    const text = textLines[index].trim();
    if (text.length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new CaptureTraceError(`Capture trace line ${index + 1} is not valid JSON.`, { cause: error });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.t !== "string") {
      fail(index + 1, "every line must be an object with a t field.");
    }
    lines.push({ lineNumber: index + 1, entry: parsed });
  }
  if (lines.length === 0) throw new CaptureTraceError("The capture trace is empty.");
  return lines;
}

function sameJson(left, right) {
  return canonicalJsonStringify(left ?? null) === canonicalJsonStringify(right ?? null);
}

function readMeta(lines) {
  const { lineNumber, entry } = lines[0];
  if (entry.t !== "meta") fail(lineNumber, "the first line must be a meta line.");
  const keys = Object.keys(entry).sort();
  const expected = [...META_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(lineNumber, "the meta line has unexpected or missing fields.");
  }
  if (entry.schemaVersion !== SS2_CAPTURE_TRACE_VERSION) {
    fail(lineNumber, `trace schemaVersion must be ${SS2_CAPTURE_TRACE_VERSION}.`);
  }
  if (entry.attackerSide !== "hero" && entry.attackerSide !== "villain") {
    fail(lineNumber, "meta.attackerSide must be hero or villain.");
  }
  if (entry.installHashVerifiedBefore !== true) {
    fail(lineNumber, "the installed hash must be verified before the session (installHashVerifiedBefore=true).");
  }
  return entry;
}

function readEnd(lines) {
  const { lineNumber, entry } = lines[lines.length - 1];
  if (entry.t !== "end") fail(lineNumber, "the last line must be an end line.");
  const keys = Object.keys(entry).sort();
  if (keys.length !== 2 || keys[0] !== "installHashVerifiedAfter" || keys[1] !== "t") {
    fail(lineNumber, "the end line must carry only installHashVerifiedAfter.");
  }
  if (entry.installHashVerifiedAfter !== true) {
    fail(lineNumber, "the installed hash must be verified after the session (installHashVerifiedAfter=true).");
  }
  return entry;
}

function projectFields(fields, requiredKeys, context, lineNumber) {
  const projection = {};
  for (const key of requiredKeys) {
    if (!Object.hasOwn(fields, key)) {
      fail(lineNumber, `${context} is missing the required field ${key}.`);
    }
    projection[key] = fields[key];
  }
  return projection;
}

/**
 * Convert one raw capture trace into a validated observation record for the
 * given target fixture. The fixture determines which staged fields become the
 * observation scenario; the recorded values are always the observed ones, so
 * a mis-staged scenario surfaces later as an explicit fixture mismatch.
 */
export function ingestSs2CaptureTrace(rawText, fixture) {
  validateSs2OneVsOneFixture(fixture);
  const lines = parseLines(rawText);
  const meta = readMeta(lines);
  const end = readEnd(lines);

  const staged = { hero: null, villain: null };
  const finals = { hero: null, villain: null };
  const vars = new Map();
  const samples = [];
  const events = [];
  const rawMutations = [];
  const chain = new Map();
  let sawAction = false;
  let deathEvent = null;
  let resultObject = null;

  const chainKeyValue = (path, fallbackKnown, fallbackValue) => {
    if (chain.has(path)) return { known: true, value: chain.get(path) };
    return { known: fallbackKnown, value: fallbackValue };
  };

  for (const { lineNumber, entry } of lines.slice(1, -1)) {
    switch (entry.t) {
      case "meta":
        fail(lineNumber, "only the first line may be a meta line.");
        break;
      case "end":
        fail(lineNumber, "only the last line may be an end line.");
        break;
      case "state": {
        if (sawAction) fail(lineNumber, "state dumps must precede the observed action.");
        if (entry.side !== "hero" && entry.side !== "villain") fail(lineNumber, "state.side must be hero or villain.");
        if (staged[entry.side]) fail(lineNumber, `duplicate staged state dump for ${entry.side}.`);
        if (!entry.fields || typeof entry.fields !== "object" || Array.isArray(entry.fields)) {
          fail(lineNumber, "state.fields must be an object.");
        }
        staged[entry.side] = { fields: entry.fields, lineNumber };
        break;
      }
      case "var": {
        if (typeof entry.name !== "string") fail(lineNumber, "var.name must be a string.");
        vars.set(entry.name, entry.value);
        break;
      }
      case "roll": {
        sawAction = true;
        const { t, ...sample } = entry;
        samples.push(sample);
        break;
      }
      case "set": {
        sawAction = true;
        if (typeof entry.path !== "string") fail(lineNumber, "set.path must be a string.");
        if (typeof entry.hook !== "string" || !HOOK_PATTERN.test(entry.hook)) {
          fail(lineNumber, "set.hook must be a lowercase hook attribution token.");
        }
        if (!Object.hasOwn(entry, "before") || !Object.hasOwn(entry, "after")) {
          fail(lineNumber, "set lines must carry explicit before and after values.");
        }
        const fieldMatch = SET_PATH_PATTERN.exec(entry.path);
        if (!fieldMatch) fail(lineNumber, `set.path ${entry.path} is not a watched combatant field path.`);
        const side = entry.path.split("/")[1];
        const field = fieldMatch[1];
        const stagedSide = staged[side];
        const prior = chainKeyValue(
          entry.path,
          Boolean(stagedSide && Object.hasOwn(stagedSide.fields, field)),
          stagedSide?.fields?.[field]
        );
        if (prior.known && !sameJson(prior.value, entry.before)) {
          fail(
            lineNumber,
            `broken mutation chain for ${entry.path}: before=${JSON.stringify(entry.before)} ` +
            `but the prior value was ${JSON.stringify(prior.value)}.`
          );
        }
        chain.set(entry.path, entry.after);
        if (!sameJson(entry.before, entry.after)) {
          rawMutations.push({ path: entry.path, before: entry.before, after: entry.after, reason: entry.hook });
        }
        break;
      }
      case "event": {
        sawAction = true;
        const { t, ...event } = entry;
        if (event.type === "death") {
          if (deathEvent) fail(lineNumber, "a controlled 1v1 action can record at most one death event.");
          deathEvent = { event, lineNumber };
        }
        if (event.type === "overlay-label") {
          if (!deathEvent) fail(lineNumber, "an overlay-label event requires a preceding death event.");
          if (resultObject) fail(lineNumber, "duplicate overlay-label event.");
          const loserSide = deathEvent.event.side;
          const winnerSide = loserSide === "hero" ? "villain" : "hero";
          const overlayLabel = winnerSide === "hero" ? "combatwon" : "combatlost";
          const arenaLabel = winnerSide === "hero" ? "combat_won" : "combat_lost";
          if (event.label !== overlayLabel) {
            fail(
              lineNumber,
              `overlay label ${JSON.stringify(event.label)} does not match the observed death of ${loserSide}.`
            );
          }
          resultObject = {
            status: "pending-animation",
            completionToken: `ss2-1v1:${winnerSide}:${loserSide}:${arenaLabel}`,
            winnerSide,
            loserSide,
            reason: "elimination",
            overlayLabel,
            arenaLabel
          };
          rawMutations.push({ path: "/result", before: null, after: resultObject, reason: "result-bridge" });
        }
        events.push(event);
        break;
      }
      case "final": {
        if (entry.side !== "hero" && entry.side !== "villain") fail(lineNumber, "final.side must be hero or villain.");
        if (finals[entry.side]) fail(lineNumber, `duplicate final state dump for ${entry.side}.`);
        if (!entry.fields || typeof entry.fields !== "object" || Array.isArray(entry.fields)) {
          fail(lineNumber, "final.fields must be an object.");
        }
        finals[entry.side] = { fields: entry.fields, lineNumber };
        break;
      }
      default:
        fail(lineNumber, `unsupported line type: ${JSON.stringify(entry.t)}.`);
    }
  }

  for (const side of ["hero", "villain"]) {
    if (!staged[side]) throw new CaptureTraceError(`The trace has no staged state dump for ${side}.`);
    if (!finals[side]) throw new CaptureTraceError(`The trace has no final state dump for ${side}.`);
    // Every projected field needs a staged anchor so the mutation-chain and
    // final-dump consistency checks can never be silently skipped.
    projectFields(
      staged[side].fields,
      SS2_PROJECTED_COMBATANT_KEYS,
      `the staged ${side} state`,
      staged[side].lineNumber
    );
  }
  if (deathEvent && !resultObject) {
    throw new CaptureTraceError("A death event was recorded without its overlay-label result transition.");
  }

  const scenario = {
    attackerSide: meta.attackerSide,
    attackDirection: vars.get("attack_direction"),
    result: null,
    hero: projectFields(
      staged.hero.fields,
      Object.keys(fixture.scenario.hero),
      "the staged hero state",
      staged.hero.lineNumber
    ),
    villain: projectFields(
      staged.villain.fields,
      Object.keys(fixture.scenario.villain),
      "the staged villain state",
      staged.villain.lineNumber
    )
  };
  if (scenario.attackDirection === undefined) {
    throw new CaptureTraceError("The trace never recorded the attack_direction variable.");
  }
  if (fixture.scenario.transient !== undefined) {
    if (!vars.has("criticalhit")) {
      throw new CaptureTraceError("The target fixture needs the transient criticalhit variable, which was not recorded.");
    }
    scenario.transient = { criticalhit: vars.get("criticalhit") };
  }

  const finalState = { result: resultObject ?? null };
  for (const side of ["hero", "villain"]) {
    finalState[side] = projectFields(
      finals[side].fields,
      SS2_PROJECTED_COMBATANT_KEYS,
      `the final ${side} state`,
      finals[side].lineNumber
    );
    for (const field of SS2_PROJECTED_COMBATANT_KEYS) {
      const path = `/${side}/${field}`;
      const expected = chain.has(path)
        ? chain.get(path)
        : Object.hasOwn(staged[side].fields, field)
          ? staged[side].fields[field]
          : undefined;
      if (expected !== undefined && !sameJson(expected, finalState[side][field])) {
        throw new CaptureTraceError(
          `Unobserved mutation of ${path}: the final dump shows ${JSON.stringify(finalState[side][field])} ` +
          `but the watched chain ends at ${JSON.stringify(expected)}.`
        );
      }
    }
  }

  const record = {
    schemaVersion: SS2_OBSERVATION_SCHEMA_VERSION,
    kind: SS2_OBSERVATION_KIND,
    observationId: meta.observationId,
    build: {
      fingerprintSchemaVersion: 1,
      steamBuildId: SS2_STEAM_BUILD_ID,
      ss2Sha256: SS2_BUILD_SHA256
    },
    capture: {
      sessionId: meta.sessionId,
      captureToolVersion: meta.captureToolVersion,
      method: meta.method,
      observedAt: meta.observedAt,
      installHashVerifiedBefore: meta.installHashVerifiedBefore,
      installHashVerifiedAfter: end.installHashVerifiedAfter,
      mutationGranularity: meta.mutationGranularity
    },
    target: { fixtureId: fixture.fixtureId },
    scenario,
    samples,
    mutationTrace: rawMutations.map((mutation, index) => ({ sequence: index + 1, ...mutation })),
    events,
    resultEvent: resultObject ? { type: "battle-result-pending", ...resultObject } : null,
    finalState
  };
  record.digest = computeSs2ObservationDigest(record);
  return validateSs2Observation(record);
}
