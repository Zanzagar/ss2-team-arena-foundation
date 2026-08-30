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

import { ingestSs2CaptureTrace } from "./capture-ingest.js";
import {
  SS2_PROJECTED_COMBATANT_KEYS,
  SS2_SIMULATED_CAPTURE_METHOD,
  deriveExpectedEventsFromSs2Fixture,
  isCosmeticDebrisSample,
  matchSs2ObservationToFixture
} from "./observation.js";
import { validateSs2OneVsOneFixture } from "./run-1v1-fixture.js";

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Wrapper hook attribution a perfect wrapper would report per static reason.
 *
 * The convention is the *ingress* function that owns the assignment, not the
 * innermost helper: `stat-clamp` is `check_stats`' work but is attributed to
 * the ingress that called it. This is the physical (`damagecharacter`) table;
 * see SPELL_HOOK_FOR_STATIC_REASON for the spell ingress.
 */
export const HOOK_FOR_STATIC_REASON = Object.freeze({
  "physical-damage": "damagecharacter",
  // The spell ingress's own two writes. `magic-damage` is its armour/hitpoint
  // subtraction (battle map steps 2-3, lines 351-360) and `psyche-up` is the
  // unconditional `game_defender.psyche_up = 1` join (map line 361, step 4).
  // Both are inside `magic_damage_character` (map lines 336-339), whose AS2
  // name is rendered here in the hyphenated hook vocabulary because the hook
  // token pattern admits no underscores.
  "magic-damage": "magic-damage-character",
  "psyche-up": "magic-damage-character",
  "breastplate-stamina": "damagecharacter",
  "stat-clamp": "damagecharacter",
  "weapon-enchantment": "damagecharacter",
  "remove-armour-piece": "remove-armour",
  "remove-armour-clamp": "remove-armour",
  "death-status-clear": "death",
  "death-taunt-clear": "death"
});

/**
 * The same table as seen from the spell ingress.
 *
 * Two reasons are shared with the physical path but belong to a different
 * function there: the breastplate stamina join is step 5 and `check_stats` is
 * step 6 of `magic_damage_character` itself (map lines 362-364), so a wrapper
 * attributing by call frame reports `magic-damage-character` for both during a
 * spell action. `death-*` stays `death`, which really is the shared function
 * (map lines 320-321, 453-462).
 */
export const SPELL_HOOK_FOR_STATIC_REASON = Object.freeze({
  ...HOOK_FOR_STATIC_REASON,
  "breastplate-stamina": "magic-damage-character",
  "stat-clamp": "magic-damage-character"
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
  // Block-level attribution, as the wrapper stamps it: the sourceRef minus
  // its trailing function-name segment.
  const callSite = fixture.provenance.sourceRefs[0].replace(/\/[A-Za-z_][A-Za-z0-9_]*$/, "");

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
  lines.push({ t: "var", name: "fight_mode", value: fixture.scenario.fightMode ?? "tournament" });
  // One action identity per trace, mirroring the fixture schema: a physical
  // action records the `attack_direction` global the dispatcher read, a spell
  // action records the caller's inventory id instead (map line 317 — the spell
  // ingress reads no direction).
  const spellIngress = fixture.scenario.spellId !== undefined;
  if (spellIngress) {
    lines.push({ t: "var", name: "spell_id", value: fixture.scenario.spellId });
  } else {
    lines.push({ t: "var", name: "attack_direction", value: fixture.scenario.attackDirection });
  }
  if (fixture.scenario.transient !== undefined) {
    lines.push({ t: "var", name: "criticalhit", value: fixture.scenario.transient.criticalhit });
  }
  for (const sample of fixture.samples) {
    // Cosmetic debris rolls come from the RandomNumber opcode, which the
    // wrapper can neither inject nor record; a faithful reference trace
    // omits them, and observation matching excludes them on both sides.
    if (isCosmeticDebrisSample(sample)) continue;
    lines.push({
      t: "roll",
      ...sample,
      callSite,
      injected: sample.source === "randomBetween"
    });
  }
  // The damage-dispatch event precedes every recorded mutation: hit/miss for
  // the physical path, the ingress itself for a spell.
  lines.push({ t: "event", ...events[0] });
  const hookForReason = spellIngress ? SPELL_HOOK_FOR_STATIC_REASON : HOOK_FOR_STATIC_REASON;
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
      hook: hookForReason[entry.reason] ?? "unattributed"
    });
  }
  for (const side of ["hero", "villain"]) {
    lines.push({ t: "final", side, fields: { ...fixture.expected.state[side] } });
  }
  lines.push({ t: "end", installHashVerifiedAfter: true });
  const trace = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;

  // Fail fast: a reference trace that its own pipeline cannot ingest and
  // match points at an internally inconsistent fixture, and the defect must
  // be reported against the fixture, not the trace.
  let record;
  try {
    record = ingestSs2CaptureTrace(trace, fixture);
  } catch (error) {
    throw new SimulationError(
      `Fixture ${fixture.fixtureId} cannot produce an ingestable reference trace: ${error.message}`,
      { cause: error }
    );
  }
  const comparison = matchSs2ObservationToFixture(fixture, record);
  if (!comparison.match) {
    throw new SimulationError(
      `Fixture ${fixture.fixtureId} is internally inconsistent: its reference trace does not match ` +
      `its own expectations (first difference at ${comparison.differences[0].path}).`
    );
  }
  return trace;
}
