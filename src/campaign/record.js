/**
 * The campaign team-battle record: what a completed team battle persists.
 *
 * The record is the separate, additive artefact the roadmap's Stage 5
 * constraint asks for. It is produced by, and only by, a settlement that has
 * already passed both of `src/team/settlement.js`'s gates — a whole team down
 * *and* the final animation acknowledged — so one battle yields exactly one
 * record, and a knockout yields none.
 *
 * House style is deliberately the same as `src/golden/observation.js` and
 * `src/golden/promote-1v1-golden.js`: exact-key validation, an explicit schema
 * version, a canonical-JSON SHA-256 digest, and refusal rather than coercion.
 * A record that does not validate is not repaired; it is rejected, and the
 * reader in `store.js` degrades to "no campaign data" around it.
 *
 * ## What is in the record, and why
 *
 * | Block | Why it is here |
 * | --- | --- |
 * | `settlement` | the record exists because settlement fired. `completionToken` is `<outcome>:<battle discriminator>` — a pure function of the outcome **of one battle** (`src/team/settlement.js`) — so it is the natural idempotency key, and its outcome half is recomputed here as a consistency check. Two bouts between the same teams ending the same way no longer share a token, and therefore no longer share a `recordId`. |
 * | `teams` | the roster: team ids, slot seats, and **which slots were AI-filled**. `aiFilled` is a roster fact — the slot had nobody in it — and is not the same question as whether a seat's controller is the AI. |
 * | `seats` | controller identity, kept in its own block exactly as `toControllerState()` keeps it out of `toTeamWireState()`. A seat entry may not carry a combatant id; the validator says so by name. |
 * | `outcomes` | per-combatant results: survival, final health, statuses, and the event sequence at which the combatant was defeated. |
 * | `provenance.ruleSet` | which rule set produced this battle **and whether it was runtime-verified or a placeholder**. A campaign built on placeholder maths has to stay identifiable, so this block is mandatory and its verified claim is gated the same way `src/team/rule-set.js` gates it. |
 * | `provenance.battle` | seed, state version, initiative, turn count, RNG cursor, and the controller-independent combat state hash, so a record can later be tied to a replay. |
 * | `provenance.writer` | which build of this layer wrote the record. |
 * | `provenance.migration` | null for a natively written record; populated, with the pre-migration digest, for one that was upgraded. |
 *
 * ## What is deliberately not in it
 *
 * Combatant **stat blocks**. `strength`, `attack`, `vitality`, `stamina` and
 * `magicka` are vanilla field names, so `assertNoVanillaFieldNames()` would
 * refuse a record carrying them — and that refusal is correct. A battle record
 * is an outcome record, not a character sheet. The character sheet is
 * vanilla's, and this layer neither copies it nor competes with it.
 *
 * Also absent: any formula, any threshold, and any combat decision. Every
 * number in a record was decided and clamped by the resolver running an
 * injected rule set. This module copies; it never computes an outcome.
 */

import { createHash } from "node:crypto";

import { ControllerKind } from "../team/controllers.js";
import { ResultReason } from "../team/elimination.js";
import { MAX_TEAM_SLOTS, MIN_TEAM_SLOTS, TEAMS_PER_BATTLE } from "../team/roster.js";
import { RuleSetVerification } from "../team/rule-set.js";
import { battleDiscriminatorOf, completionTokenMatchesOutcome } from "../team/settlement.js";
import { CampaignRecordError, CampaignRecordIntegrityError } from "./errors.js";
import { assertNoVanillaFieldNames } from "./vanilla-boundary.js";

/**
 * The current record schema.
 *
 * Version 1 is the same record without `provenance.ruleSet`. It is defined and
 * migratable (see `migrations.js`) because the migration path has to exist and
 * be exercised before it is needed rather than after, and because the 1 -> 2
 * step encodes the rule this project actually cares about: a record that never
 * said which maths produced it migrates to `unknown`, never to a guess.
 */
export const CAMPAIGN_RECORD_SCHEMA_VERSION = 2;
export const CAMPAIGN_RECORD_KIND = "ss2-team-battle-record";

/** Identifies the build of this layer that wrote a record. */
export const CAMPAIGN_WRITER_ID = "ss2-campaign-persistence";
export const CAMPAIGN_WRITER_VERSION = "1";

/**
 * How much is known about the maths behind a record.
 *
 * The first two mirror `src/team/rule-set.js` exactly. `UNKNOWN` is this
 * layer's own third state and can only arrive by migration: it means the
 * evidence is gone, and it is emphatically **not** a synonym for placeholder.
 */
export const RecordedRuleSetVerification = Object.freeze({
  PLACEHOLDER: RuleSetVerification.PLACEHOLDER,
  RUNTIME_VERIFIED: RuleSetVerification.RUNTIME_VERIFIED,
  UNKNOWN: "unknown"
});

const VERIFICATIONS = new Set(Object.values(RecordedRuleSetVerification));
const CONTROLLER_KINDS = new Set(Object.values(ControllerKind));
const RESULT_REASONS = new Set(Object.values(ResultReason));

export const RECORD_TOP_LEVEL_KEYS = Object.freeze([
  "battleId",
  "digest",
  "kind",
  "outcomes",
  "provenance",
  "recordId",
  "recordedAt",
  "schemaVersion",
  "seats",
  "settlement",
  "teams"
]);
const SETTLEMENT_KEYS = Object.freeze([
  "acknowledgedToken",
  "completionToken",
  "loserTeamIds",
  "reason",
  "winnerTeamId"
]);
const TEAM_KEYS = Object.freeze(["name", "slots", "teamId"]);
const SLOT_KEYS = Object.freeze(["aiFilled", "combatantId", "seatId", "slotIndex"]);
const SEAT_KEYS = Object.freeze(["controllerId", "controllerKind", "controllerLabel", "seatId"]);
const OUTCOME_KEYS = Object.freeze([
  "aiFilled",
  "combatantId",
  "defeatedAtSequence",
  "health",
  "maxHealth",
  "name",
  "seatId",
  "slotIndex",
  "statuses",
  "survived",
  "teamId"
]);
const PROVENANCE_KEYS = Object.freeze(["battle", "migration", "ruleSet", "writer"]);
const BATTLE_PROVENANCE_KEYS = Object.freeze([
  "combatStateHash",
  "initiative",
  "rngCursor",
  "seed",
  "stateVersion",
  "turnNumber"
]);
const RULE_SET_PROVENANCE_KEYS = Object.freeze([
  "buildSha256",
  "contractVersion",
  "goldenFixtureIds",
  "id",
  "note",
  "runtimeVerified",
  "verification"
]);
const MIGRATION_KEYS = Object.freeze([
  "migratedAt",
  "sourceDigest",
  "sourceSchemaVersion",
  "steps"
]);
const WRITER_KEYS = Object.freeze(["id", "version"]);

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RECORD_ID_PATTERN = /^tbr-[a-f0-9]{24}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const STATE_HASH_PATTERN = /^[a-f0-9]{8}$/;
const SHA256_PATTERN = /^[A-Fa-f0-9]{64}$/;
const LOWER_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MIGRATION_STEP_PATTERN = /^\d+->\d+$/;
const MAX_STATUSES = 32;
const MAX_NAME_LENGTH = 128;
const MAX_NOTE_LENGTH = 512;

/* ------------------------------------------------------------------ */
/* JSON safety, canonical form, digests                                */
/* ------------------------------------------------------------------ */

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonValue(value, path, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CampaignRecordError(`${path} contains a non-finite number.`);
    return;
  }
  if (typeof value !== "object") throw new CampaignRecordError(`${path} is not JSON-safe.`);
  if (ancestors.has(value)) throw new CampaignRecordError(`${path} contains a circular reference.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new CampaignRecordError(`${path} contains a sparse array.`);
      assertJsonValue(value[index], `${path}[${index}]`, ancestors);
    }
  } else {
    if (!isPlainObject(value)) throw new CampaignRecordError(`${path} contains a non-plain object.`);
    for (const key of Object.keys(value)) assertJsonValue(value[key], `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

export function assertJsonSafe(value, path = "record") {
  assertJsonValue(value, path, new Set());
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Deterministic JSON text: sorted object keys, arrays kept in order.
 *
 * Byte-identical to `src/golden/observation.js`'s canonical form. It is
 * reimplemented rather than imported so this layer does not drag the 1v1
 * golden pipeline in behind it; a test asserts the two agree.
 */
export function canonicalJsonStringify(value, path = "record") {
  assertJsonSafe(value, path);
  return canonicalize(value);
}

export function sha256OfCanonicalJson(value, path = "record") {
  return createHash("sha256").update(canonicalJsonStringify(value, path), "utf8").digest("hex");
}

/**
 * The digest covers the whole record except the digest field itself.
 *
 * Generic across schema versions on purpose: a version 1 record digests the
 * same way, so `migrations.js` can verify a legacy record's integrity before
 * it touches it.
 */
export function computeCampaignRecordDigest(recordLike) {
  if (!isPlainObject(recordLike)) {
    throw new CampaignRecordError("A campaign record must be a plain object.");
  }
  const undigested = { ...recordLike };
  delete undigested.digest;
  return sha256OfCanonicalJson(undigested, "record");
}

/** Deterministic record identity: same battle, same settlement, same id. */
export function campaignRecordIdFor({ battleId, completionToken }) {
  if (typeof battleId !== "string" || !TOKEN_PATTERN.test(battleId)) {
    throw new CampaignRecordError("battleId must be a token.");
  }
  if (typeof completionToken !== "string" || completionToken.length === 0) {
    throw new CampaignRecordError("completionToken must be a non-empty string.");
  }
  const digest = sha256OfCanonicalJson({ battleId, completionToken }, "recordId");
  return `tbr-${digest.slice(0, 24)}`;
}

export function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function assertExactKeys(value, expectedKeys, path) {
  if (!isPlainObject(value)) throw new CampaignRecordError(`${path} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new CampaignRecordError(
      `${path} has unexpected or missing fields (expected exactly: ${expected.join(", ")}).`
    );
  }
}

function assertToken(value, path) {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new CampaignRecordError(`${path} must be a token.`);
  }
  return value;
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CampaignRecordError(`${path} must be a non-negative integer.`);
  }
  return value;
}

function assertPositiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CampaignRecordError(`${path} must be a positive integer.`);
  }
  return value;
}

function assertTimestamp(value, path) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64 || Number.isNaN(Date.parse(value))) {
    throw new CampaignRecordError(`${path} must be a parseable timestamp.`);
  }
  return value;
}

function assertSettlementBlock(settlement, teamIds) {
  assertExactKeys(settlement, SETTLEMENT_KEYS, "settlement");
  const { winnerTeamId, loserTeamIds, reason, completionToken, acknowledgedToken } = settlement;
  if (winnerTeamId !== null && !teamIds.has(winnerTeamId)) {
    throw new CampaignRecordError("settlement.winnerTeamId must be null or one of the recorded team ids.");
  }
  if (!Array.isArray(loserTeamIds) || loserTeamIds.length === 0 || loserTeamIds.length > TEAMS_PER_BATTLE) {
    throw new CampaignRecordError("settlement.loserTeamIds must name one or two teams.");
  }
  const sorted = [...loserTeamIds].sort();
  if (loserTeamIds.some((id, index) => id !== sorted[index])) {
    throw new CampaignRecordError("settlement.loserTeamIds must be sorted, as src/team/settlement.js sorts them.");
  }
  if (new Set(loserTeamIds).size !== loserTeamIds.length) {
    throw new CampaignRecordError("settlement.loserTeamIds repeats a team.");
  }
  for (const id of loserTeamIds) {
    if (!teamIds.has(id)) throw new CampaignRecordError(`settlement.loserTeamIds names unknown team ${id}.`);
    if (id === winnerTeamId) throw new CampaignRecordError("settlement names the same team winner and loser.");
  }
  if (!RESULT_REASONS.has(reason)) {
    throw new CampaignRecordError(
      `settlement.reason must be one of: ${[...RESULT_REASONS].join(", ")}.`
    );
  }
  if (reason === ResultReason.DRAW && winnerTeamId !== null) {
    throw new CampaignRecordError("A draw cannot name a winner.");
  }
  if (reason === ResultReason.ELIMINATION && winnerTeamId === null) {
    throw new CampaignRecordError("An elimination must name a winner.");
  }
  // `battleStanding` reports a draw only when *no* team has a standing
  // combatant, so a draw names every team as eliminated.
  if (reason === ResultReason.DRAW && loserTeamIds.length !== teamIds.size) {
    throw new CampaignRecordError("A draw must name every team as eliminated.");
  }
  // Checked, not trusted — but checked against the half of the token this
  // layer can honestly recompute.
  //
  // The token is `<outcome prefix>:<battle discriminator>`, and the
  // discriminator is `combatStateHash(battle)` as it stood the instant the
  // settlement armed (`src/team/resolver.js`, `checkResult`). A record is a
  // finished artefact: it holds the state hash of the *settled* battle, not
  // the arm-time one, so nothing here can recompute the discriminator. The
  // outcome half it can, and that is the half worth checking — a record whose
  // result was edited no longer agrees with its own token, which is exactly
  // the tamper this check has always existed to catch.
  //
  // The discriminator is not left unguarded either: `recordId` is SHA-256 over
  // `{battleId, completionToken}`, so editing it alone is caught by
  // `validateCampaignRecord`'s recordId check, and `digest` covers everything.
  //
  // Shape first, so a token from before the discriminator existed is refused
  // by name instead of surfacing as a confusing outcome mismatch.
  if (battleDiscriminatorOf(completionToken) === null) {
    throw new CampaignRecordError(
      "settlement.completionToken carries no battle discriminator. A token naming only the outcome is " +
      "shared by every bout between the same teams that ended the same way, so it cannot identify the " +
      "battle this record describes."
    );
  }
  if (!completionTokenMatchesOutcome(completionToken, { winnerTeamId, loserTeamIds, reason })) {
    throw new CampaignRecordError("settlement.completionToken does not match the recorded outcome.");
  }
  if (acknowledgedToken !== completionToken) {
    throw new CampaignRecordError(
      "settlement.acknowledgedToken must equal completionToken; a record is written only after the " +
      "matching battle-result-animation-complete acknowledgement."
    );
  }
}

function assertTeamsBlock(teams) {
  if (!Array.isArray(teams) || teams.length !== TEAMS_PER_BATTLE) {
    throw new CampaignRecordError(`teams must contain exactly ${TEAMS_PER_BATTLE} teams.`);
  }
  const teamIds = new Set();
  const seatIds = new Set();
  const combatantIds = new Set();
  teams.forEach((team, teamIndex) => {
    const path = `teams[${teamIndex}]`;
    assertExactKeys(team, TEAM_KEYS, path);
    assertToken(team.teamId, `${path}.teamId`);
    if (teamIds.has(team.teamId)) throw new CampaignRecordError(`${path}.teamId is duplicated.`);
    teamIds.add(team.teamId);
    if (typeof team.name !== "string" || team.name.length === 0 || team.name.length > MAX_NAME_LENGTH) {
      throw new CampaignRecordError(`${path}.name must be a non-empty string.`);
    }
    if (
      !Array.isArray(team.slots) ||
      team.slots.length < MIN_TEAM_SLOTS ||
      team.slots.length > MAX_TEAM_SLOTS
    ) {
      throw new CampaignRecordError(
        `${path}.slots must hold ${MIN_TEAM_SLOTS} to ${MAX_TEAM_SLOTS} slots.`
      );
    }
    team.slots.forEach((slot, slotIndex) => {
      const slotPath = `${path}.slots[${slotIndex}]`;
      assertExactKeys(slot, SLOT_KEYS, slotPath);
      assertToken(slot.seatId, `${slotPath}.seatId`);
      assertToken(slot.combatantId, `${slotPath}.combatantId`);
      if (slot.slotIndex !== slotIndex) {
        throw new CampaignRecordError(`${slotPath}.slotIndex must equal its position in the slot list.`);
      }
      if (typeof slot.aiFilled !== "boolean") {
        throw new CampaignRecordError(`${slotPath}.aiFilled must be boolean.`);
      }
      if (seatIds.has(slot.seatId)) throw new CampaignRecordError(`${slotPath}.seatId is duplicated.`);
      seatIds.add(slot.seatId);
      if (combatantIds.has(slot.combatantId)) {
        throw new CampaignRecordError(`${slotPath}.combatantId is duplicated.`);
      }
      combatantIds.add(slot.combatantId);
    });
  });
  return { teamIds, seatIds, combatantIds };
}

function assertSeatsBlock(seats, seatIds) {
  if (!Array.isArray(seats) || seats.length !== seatIds.size) {
    throw new CampaignRecordError("seats must hold exactly one entry per roster slot.");
  }
  const seen = new Set();
  seats.forEach((seat, index) => {
    const path = `seats[${index}]`;
    if (!isPlainObject(seat)) throw new CampaignRecordError(`${path} must be an object.`);
    // Named explicitly rather than left to the exact-key check, because this
    // is the confusion the roadmap warns about: controller identity is
    // independent of combatant identity and the two must not be conflated.
    for (const forbidden of ["combatantId", "aiFilled", "slotIndex", "teamId"]) {
      if (Object.hasOwn(seat, forbidden)) {
        throw new CampaignRecordError(
          `${path} carries ${forbidden}. A seat records who is driving a slot, not who is fighting in it; ` +
          "combatant identity belongs in teams[].slots[] and outcomes[]."
        );
      }
    }
    assertExactKeys(seat, SEAT_KEYS, path);
    assertToken(seat.seatId, `${path}.seatId`);
    if (!seatIds.has(seat.seatId)) throw new CampaignRecordError(`${path}.seatId is not a roster seat.`);
    if (seen.has(seat.seatId)) throw new CampaignRecordError(`${path}.seatId is duplicated.`);
    seen.add(seat.seatId);
    if (!CONTROLLER_KINDS.has(seat.controllerKind)) {
      throw new CampaignRecordError(
        `${path}.controllerKind must be one of: ${[...CONTROLLER_KINDS].join(", ")}.`
      );
    }
    for (const field of ["controllerId", "controllerLabel"]) {
      const value = seat[field];
      if (typeof value !== "string" || value.length === 0 || value.length > MAX_NAME_LENGTH) {
        throw new CampaignRecordError(`${path}.${field} must be a non-empty string.`);
      }
    }
  });
}

function assertOutcomesBlock(outcomes, teams, settlement) {
  const slotsByCombatantId = new Map();
  for (const team of teams) {
    for (const slot of team.slots) slotsByCombatantId.set(slot.combatantId, { team, slot });
  }
  if (!Array.isArray(outcomes) || outcomes.length !== slotsByCombatantId.size) {
    throw new CampaignRecordError("outcomes must hold exactly one entry per combatant on the roster.");
  }
  const seen = new Set();
  outcomes.forEach((outcome, index) => {
    const path = `outcomes[${index}]`;
    assertExactKeys(outcome, OUTCOME_KEYS, path);
    assertToken(outcome.combatantId, `${path}.combatantId`);
    const placement = slotsByCombatantId.get(outcome.combatantId);
    if (!placement) throw new CampaignRecordError(`${path}.combatantId is not on the roster.`);
    if (seen.has(outcome.combatantId)) throw new CampaignRecordError(`${path}.combatantId is duplicated.`);
    seen.add(outcome.combatantId);
    if (outcome.teamId !== placement.team.teamId) {
      throw new CampaignRecordError(`${path}.teamId disagrees with the roster.`);
    }
    if (outcome.seatId !== placement.slot.seatId) {
      throw new CampaignRecordError(`${path}.seatId disagrees with the roster.`);
    }
    if (outcome.slotIndex !== placement.slot.slotIndex) {
      throw new CampaignRecordError(`${path}.slotIndex disagrees with the roster.`);
    }
    if (outcome.aiFilled !== placement.slot.aiFilled) {
      throw new CampaignRecordError(`${path}.aiFilled disagrees with the roster.`);
    }
    if (typeof outcome.name !== "string" || outcome.name.length === 0 || outcome.name.length > MAX_NAME_LENGTH) {
      throw new CampaignRecordError(`${path}.name must be a non-empty string.`);
    }
    if (!Number.isFinite(outcome.maxHealth) || outcome.maxHealth < 0) {
      throw new CampaignRecordError(`${path}.maxHealth must be a non-negative finite number.`);
    }
    if (!Number.isFinite(outcome.health) || outcome.health < 0 || outcome.health > outcome.maxHealth) {
      throw new CampaignRecordError(`${path}.health must be between 0 and maxHealth.`);
    }
    if (typeof outcome.survived !== "boolean") {
      throw new CampaignRecordError(`${path}.survived must be boolean.`);
    }
    // The resolver derives `alive` from `health > 0` and nothing else
    // (src/team/resolver.js, applyEffects). A record that disagrees was edited.
    if (outcome.survived !== outcome.health > 0) {
      throw new CampaignRecordError(`${path}.survived disagrees with the recorded health.`);
    }
    // Both directions, because only one of them was checked and the unchecked
    // direction is the one that loses evidence: a survivor must not carry a
    // defeat sequence, *and* a casualty must carry one. Without the second
    // rule a dropped `combatant-defeated` event records as `null` and
    // validates, so the record cannot tell "defeated at sequence 6" from
    // "we lost the event".
    if (outcome.survived) {
      if (outcome.defeatedAtSequence !== null) {
        throw new CampaignRecordError(`${path} survived but carries a defeat sequence.`);
      }
    } else {
      if (outcome.defeatedAtSequence === null) {
        throw new CampaignRecordError(
          `${path} did not survive but carries no defeat sequence. Every casualty is stamped by the ` +
          "resolver's combatant-defeated event; a null here means the event was lost, not that the " +
          "combatant fell silently."
        );
      }
      assertPositiveInteger(outcome.defeatedAtSequence, `${path}.defeatedAtSequence`);
    }
    if (
      !Array.isArray(outcome.statuses) ||
      outcome.statuses.length > MAX_STATUSES ||
      outcome.statuses.some((status) => typeof status !== "string" || status.length === 0)
    ) {
      throw new CampaignRecordError(`${path}.statuses must be an array of non-empty strings.`);
    }
    if (new Set(outcome.statuses).size !== outcome.statuses.length) {
      throw new CampaignRecordError(`${path}.statuses repeats a status.`);
    }
  });

  // Consistency with `src/team/elimination.js`'s definition of a decided
  // battle. This checks the record against what the resolver already decided;
  // it does not decide anything itself.
  const losers = new Set(settlement.loserTeamIds);
  for (const outcome of outcomes) {
    if (losers.has(outcome.teamId) && outcome.survived) {
      throw new CampaignRecordError(
        `outcomes names ${outcome.combatantId} a survivor on eliminated team ${outcome.teamId}.`
      );
    }
  }
  if (settlement.reason === ResultReason.ELIMINATION) {
    const survivors = outcomes.filter((outcome) => outcome.teamId === settlement.winnerTeamId && outcome.survived);
    if (survivors.length === 0) {
      throw new CampaignRecordError("An elimination must leave at least one survivor on the winning team.");
    }
  }
  // A draw needs no separate survivor check: it names every team as
  // eliminated, so the per-outcome rule above already covers all of them.
}

function assertRuleSetProvenance(ruleSet, migration) {
  assertExactKeys(ruleSet, RULE_SET_PROVENANCE_KEYS, "provenance.ruleSet");
  if (!VERIFICATIONS.has(ruleSet.verification)) {
    throw new CampaignRecordError(
      `provenance.ruleSet.verification must be one of: ${[...VERIFICATIONS].join(", ")}.`
    );
  }
  if (typeof ruleSet.runtimeVerified !== "boolean") {
    throw new CampaignRecordError("provenance.ruleSet.runtimeVerified must be boolean.");
  }
  if (ruleSet.runtimeVerified !== (ruleSet.verification === RecordedRuleSetVerification.RUNTIME_VERIFIED)) {
    throw new CampaignRecordError(
      "provenance.ruleSet.runtimeVerified must agree with verification; a record cannot claim more than its rule set did."
    );
  }
  if (typeof ruleSet.note !== "string" || ruleSet.note.trim().length === 0 || ruleSet.note.length > MAX_NOTE_LENGTH) {
    throw new CampaignRecordError("provenance.ruleSet.note must be a human-readable note.");
  }
  if (
    !Array.isArray(ruleSet.goldenFixtureIds) ||
    ruleSet.goldenFixtureIds.some((id) => typeof id !== "string" || !LOWER_TOKEN_PATTERN.test(id))
  ) {
    throw new CampaignRecordError("provenance.ruleSet.goldenFixtureIds must be lowercase tokens.");
  }
  if (new Set(ruleSet.goldenFixtureIds).size !== ruleSet.goldenFixtureIds.length) {
    throw new CampaignRecordError("provenance.ruleSet.goldenFixtureIds repeats a fixture.");
  }

  if (ruleSet.verification === RecordedRuleSetVerification.UNKNOWN) {
    // A natively written record always knows which rule set ran, because
    // `buildCampaignRecord` reads it off the battle. `unknown` can therefore
    // only be the result of a migration from a schema that did not record it.
    if (migration === null) {
      throw new CampaignRecordError(
        "provenance.ruleSet.verification may only be unknown on a migrated record; a natively written " +
        "record always knows which rule set produced it."
      );
    }
    if (ruleSet.id !== null || ruleSet.contractVersion !== null) {
      throw new CampaignRecordError("An unknown rule set cannot name an id or a contract version.");
    }
    if (ruleSet.buildSha256 !== null || ruleSet.goldenFixtureIds.length > 0) {
      throw new CampaignRecordError("An unknown rule set cannot cite a build hash or golden fixtures.");
    }
    return;
  }

  if (typeof ruleSet.id !== "string" || !LOWER_TOKEN_PATTERN.test(ruleSet.id)) {
    throw new CampaignRecordError("provenance.ruleSet.id must be a lowercase token.");
  }
  assertPositiveInteger(ruleSet.contractVersion, "provenance.ruleSet.contractVersion");

  if (ruleSet.verification === RecordedRuleSetVerification.PLACEHOLDER) {
    // The same refusal `src/team/rule-set.js` makes, restated at rest: a
    // placeholder record must not look like evidence.
    if (ruleSet.buildSha256 !== null) {
      throw new CampaignRecordError("A placeholder rule set must not pin a build hash.");
    }
    if (ruleSet.goldenFixtureIds.length > 0) {
      throw new CampaignRecordError("A placeholder rule set must not cite golden fixtures.");
    }
    return;
  }
  if (typeof ruleSet.buildSha256 !== "string" || !SHA256_PATTERN.test(ruleSet.buildSha256)) {
    throw new CampaignRecordError("A runtime-verified rule set must pin the licensed build SHA-256.");
  }
  if (ruleSet.goldenFixtureIds.length === 0) {
    throw new CampaignRecordError("A runtime-verified rule set must cite at least one promoted golden.");
  }
}

function assertBattleProvenance(battle, combatantIds) {
  assertExactKeys(battle, BATTLE_PROVENANCE_KEYS, "provenance.battle");
  assertPositiveInteger(battle.stateVersion, "provenance.battle.stateVersion");
  assertNonNegativeInteger(battle.seed, "provenance.battle.seed");
  assertNonNegativeInteger(battle.rngCursor, "provenance.battle.rngCursor");
  assertPositiveInteger(battle.turnNumber, "provenance.battle.turnNumber");
  if (typeof battle.combatStateHash !== "string" || !STATE_HASH_PATTERN.test(battle.combatStateHash)) {
    throw new CampaignRecordError("provenance.battle.combatStateHash must be an 8-hex-digit fnv1a hash.");
  }
  if (!Array.isArray(battle.initiative) || battle.initiative.length !== combatantIds.size) {
    throw new CampaignRecordError("provenance.battle.initiative must list every combatant exactly once.");
  }
  const seen = new Set();
  for (const id of battle.initiative) {
    if (!combatantIds.has(id) || seen.has(id)) {
      throw new CampaignRecordError("provenance.battle.initiative must list every combatant exactly once.");
    }
    seen.add(id);
  }
}

function assertMigrationBlock(migration, schemaVersion) {
  if (migration === null) return;
  assertExactKeys(migration, MIGRATION_KEYS, "provenance.migration");
  assertPositiveInteger(migration.sourceSchemaVersion, "provenance.migration.sourceSchemaVersion");
  if (migration.sourceSchemaVersion >= schemaVersion) {
    throw new CampaignRecordError("provenance.migration.sourceSchemaVersion must precede the record's own version.");
  }
  if (typeof migration.sourceDigest !== "string" || !DIGEST_PATTERN.test(migration.sourceDigest)) {
    throw new CampaignRecordError("provenance.migration.sourceDigest must be the pre-migration SHA-256 digest.");
  }
  assertTimestamp(migration.migratedAt, "provenance.migration.migratedAt");
  if (
    !Array.isArray(migration.steps) ||
    migration.steps.length === 0 ||
    migration.steps.some((step) => typeof step !== "string" || !MIGRATION_STEP_PATTERN.test(step))
  ) {
    throw new CampaignRecordError('provenance.migration.steps must be a non-empty list of "from->to" steps.');
  }
}

function assertWriterBlock(writer) {
  assertExactKeys(writer, WRITER_KEYS, "provenance.writer");
  for (const field of WRITER_KEYS) {
    const value = writer[field];
    if (typeof value !== "string" || value.length === 0 || value.length > 64) {
      throw new CampaignRecordError(`provenance.writer.${field} must be a short non-empty string.`);
    }
  }
}

/**
 * Validate one campaign record at the current schema version.
 *
 * Throws `CampaignRecordError` for anything structurally wrong and
 * `CampaignRecordIntegrityError` for a digest that does not match. Nothing is
 * coerced, defaulted, or repaired.
 */
export function validateCampaignRecord(record) {
  if (!isPlainObject(record)) throw new CampaignRecordError("A campaign record must be a plain object.");
  // The vanilla field-name screen is deliberately NOT here. It used to be, and
  // that made every stored record perishable against a catalogue this layer
  // does not own: `src/adapter/vanilla-fields.js` invites growth ("the
  // catalogue grows as the map is extended"), validation runs on every read,
  // and `store.js` quarantines and then deletes the live key for any error
  // that is not a schema-version refusal. Adding one already-used name — for
  // instance `name`, an object key in both `teams[]` and `outcomes[]` — would
  // therefore have turned an entire stored campaign corrupt, quarantined it,
  // removed it, and reported the campaign as empty, with no restore API.
  //
  // The screen guards *authoring*, which is the direction it exists to guard:
  // `sealCampaignRecord()` runs it on every record this layer mints, and
  // `store.write()` runs it again at the write. Stored bytes are read back
  // against the schema alone, and the schema is exact-key, so a record cannot
  // silently acquire a field of any name.
  assertExactKeys(record, RECORD_TOP_LEVEL_KEYS, "record");
  if (record.schemaVersion !== CAMPAIGN_RECORD_SCHEMA_VERSION) {
    throw new CampaignRecordError(
      `schemaVersion must be ${CAMPAIGN_RECORD_SCHEMA_VERSION}; migrate the record before validating it.`
    );
  }
  if (record.kind !== CAMPAIGN_RECORD_KIND) {
    throw new CampaignRecordError(`kind must be ${CAMPAIGN_RECORD_KIND}.`);
  }
  if (typeof record.recordId !== "string" || !RECORD_ID_PATTERN.test(record.recordId)) {
    throw new CampaignRecordError("recordId must be a tbr- identifier.");
  }
  assertToken(record.battleId, "battleId");
  assertTimestamp(record.recordedAt, "recordedAt");

  const { teamIds, seatIds, combatantIds } = assertTeamsBlock(record.teams);
  assertSettlementBlock(record.settlement, teamIds);
  assertSeatsBlock(record.seats, seatIds);
  assertOutcomesBlock(record.outcomes, record.teams, record.settlement);

  assertExactKeys(record.provenance, PROVENANCE_KEYS, "provenance");
  assertMigrationBlock(record.provenance.migration, record.schemaVersion);
  assertRuleSetProvenance(record.provenance.ruleSet, record.provenance.migration);
  assertBattleProvenance(record.provenance.battle, combatantIds);
  assertWriterBlock(record.provenance.writer);

  if (record.recordId !== campaignRecordIdFor({
    battleId: record.battleId,
    completionToken: record.settlement.completionToken
  })) {
    throw new CampaignRecordError("recordId does not match its battleId and completion token.");
  }

  assertJsonSafe(record, "record");

  if (typeof record.digest !== "string" || !DIGEST_PATTERN.test(record.digest)) {
    throw new CampaignRecordIntegrityError("digest must be a lowercase SHA-256 hex digest.");
  }
  if (record.digest !== computeCampaignRecordDigest(record)) {
    throw new CampaignRecordIntegrityError("digest does not match the record contents.");
  }
  return record;
}

export function isCampaignRecord(candidate) {
  try {
    validateCampaignRecord(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stamps a record with its digest and validates the result.
 *
 * The only supported way to produce a storable record: the digest is computed
 * from the finished contents, never supplied.
 *
 * This is the authoring gate, so this is where the vanilla field-name screen
 * runs. `screenVanillaNames: false` is for one caller and one reason:
 * `migrations.js` re-seals a record that came *out of storage*, and screening
 * there would put the catalogue back on the read path and make stored schema-1
 * records perishable in exactly the way `validateCampaignRecord` documents.
 *
 * @param {object} draft
 * @param {{screenVanillaNames?: boolean}} [options]
 */
export function sealCampaignRecord(draft, { screenVanillaNames = true } = {}) {
  if (!isPlainObject(draft)) throw new CampaignRecordError("A campaign record draft must be a plain object.");
  if (screenVanillaNames) assertNoVanillaFieldNames(draft, "record");
  const sealed = { ...draft, digest: computeCampaignRecordDigest(draft) };
  validateCampaignRecord(sealed);
  return deepFreeze(sealed);
}

/**
 * One-line summary for a campaign log or UI.
 *
 * `provenance` is surfaced first because a campaign built on placeholder maths
 * must be identifiable at a glance and never presented as measured behaviour.
 */
export function describeCampaignRecord(record) {
  validateCampaignRecord(record);
  const { ruleSet } = record.provenance;
  return Object.freeze({
    recordId: record.recordId,
    battleId: record.battleId,
    recordedAt: record.recordedAt,
    verification: ruleSet.verification,
    runtimeVerified: ruleSet.runtimeVerified,
    ruleSetId: ruleSet.id,
    migrated: record.provenance.migration !== null,
    winnerTeamId: record.settlement.winnerTeamId,
    reason: record.settlement.reason,
    survivors: Object.freeze(
      record.outcomes.filter((outcome) => outcome.survived).map((outcome) => outcome.combatantId)
    ),
    aiFilledSlots: Object.freeze(
      record.outcomes.filter((outcome) => outcome.aiFilled).map((outcome) => outcome.seatId)
    )
  });
}

export { isPlainObject as isPlainCampaignObject };
