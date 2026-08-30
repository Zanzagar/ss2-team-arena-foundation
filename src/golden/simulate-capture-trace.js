/**
 * Reference generator for the raw capture-trace grammar: emits the JSONL a
 * perfect instrumentation wrapper would produce for a candidate fixture's
 * staged scenario and injected tape. It exists to (a) exercise the ingest ->
 * verify pipeline end to end on disk and (b) give the AS2 wrapper in
 * tools/runtime-capture/ an executable specification to reproduce during
 * validation.
 *
 * Simulated traces are NOT runtime evidence: the capture method is
 * "synthetic-simulator" and promotion rejects it unconditionally.
 */

import {
  SS2_PROJECTED_COMBATANT_KEYS,
  SS2_SIMULATED_CAPTURE_METHOD,
  deriveExpectedEventsFromSs2Fixture
} from "./observation.js";
import { validateSs2OneVsOneFixture } from "./run-1v1-fixture.js";

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Wrapper hook attribution a perfect wrapper would report per static reason. */
export const HOOK_FOR_STATIC_REASON = Object.freeze({
  "physical-damage": "damagecharacter",
  "breastplate-stamina": "damagecharacter",
  "stat-clamp": "damagecharacter",
  "weapon-enchantment": "damagecharacter",
  "remove-armour-piece": "remove-armour",
  "remove-armour-clamp": "remove-armour",
  "death-status-clear": "death",
  "death-taunt-clear": "death"
});

export class SimulationError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

function requireToken(value, name) {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new SimulationError(`${name} must be a valid token.`);
  }
  return value;
}

/**
 * Staged pre-action value for one side/field, in priority order: the fixture
 * scenario (what the resolver starts from), the first recorded mutation's
 * `before`, then the final state (initial equals final for untouched fields).
 */
function stagedValue(fixture, side, field) {
  if (Object.hasOwn(fixture.scenario[side], field)) return fixture.scenario[side][field];
  const path = `/${side}/${field}`;
  const firstMutation = fixture.expected.mutationTrace.find((entry) => entry.path === path);
  if (firstMutation) return firstMutation.before;
  return fixture.expected.state[side][field];
}

function stagedDump(fixture, side) {
  const fields = {};
  for (const field of Object.keys(fixture.scenario[side])) {
    fields[field] = fixture.scenario[side][field];
  }
  for (const field of SS2_PROJECTED_COMBATANT_KEYS) {
    if (!Object.hasOwn(fields, field)) fields[field] = stagedValue(fixture, side, field);
  }
  return fields;
}

/**
 * Emit the raw JSONL trace a perfect property-watch wrapper would produce
 * for one controlled action replaying the fixture's tape.
 */
export function simulateSs2CaptureTrace(fixture, identity = {}) {
  validateSs2OneVsOneFixture(fixture);
  const observationId = requireToken(identity.observationId ?? "sim-obs-1", "observationId");
  const sessionId = requireToken(identity.sessionId ?? "sim-session-1", "sessionId");
  const observedAt = identity.observedAt ?? "2026-08-30T00:00:00Z";
  if (Number.isNaN(Date.parse(observedAt))) throw new SimulationError("observedAt must be parseable.");
  const captureToolVersion = identity.captureToolVersion ?? "ss2-capture/0.1.0";
  const callSite = fixture.provenance.sourceRefs[0];

  const events = deriveExpectedEventsFromSs2Fixture(fixture);
  const lines = [];
  lines.push({
    t: "meta",
    schemaVersion: 1,
    observationId,
    sessionId,
    captureToolVersion,
    method: SS2_SIMULATED_CAPTURE_METHOD,
    observedAt,
    mutationGranularity: "property-watch",
    installHashVerifiedBefore: true,
    attackerSide: fixture.scenario.attackerSide
  });
  for (const side of ["hero", "villain"]) {
    lines.push({ t: "state", side, fields: stagedDump(fixture, side) });
  }
  lines.push({ t: "var", name: "attack_direction", value: fixture.scenario.attackDirection });
  if (fixture.scenario.transient !== undefined) {
    lines.push({ t: "var", name: "criticalhit", value: fixture.scenario.transient.criticalhit });
  }
  for (const sample of fixture.samples) {
    lines.push({
      t: "roll",
      ...sample,
      callSite,
      injected: sample.source === "randomBetween"
    });
  }
  // The hit/miss dispatch event precedes every recorded mutation.
  lines.push({ t: "event", ...events[0] });
  for (const entry of fixture.expected.mutationTrace) {
    if (entry.path === "/result") {
      // A wrapper cannot watch /result (a pipeline convention, not a game
      // field); it sees the death call and the overlay label instead, and
      // ingest synthesizes /result at exactly this position.
      lines.push({ t: "event", type: "death", side: fixture.expected.resultEvent.loserSide });
      lines.push({ t: "event", type: "overlay-label", label: fixture.expected.resultEvent.overlayLabel });
      continue;
    }
    lines.push({
      t: "set",
      path: entry.path,
      before: entry.before,
      after: entry.after,
      hook: HOOK_FOR_STATIC_REASON[entry.reason] ?? "unattributed"
    });
  }
  for (const side of ["hero", "villain"]) {
    lines.push({ t: "final", side, fields: { ...fixture.expected.state[side] } });
  }
  lines.push({ t: "end", installHashVerifiedAfter: true });
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}
