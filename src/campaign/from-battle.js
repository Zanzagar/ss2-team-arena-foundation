/**
 * Settled team battle -> campaign record.
 *
 * This is the only place a record is manufactured, and it is a projection and
 * nothing else. Every value it writes was decided and clamped by the resolver
 * running an injected rule set; nothing here computes an outcome, chooses a
 * winner, or derives a combat value.
 *
 * ## The settlement contract this depends on
 *
 * `src/team/settlement.js` fires once, and only after two independent gates:
 * a whole team is eliminated (the resolver arms it) *and* the presentation
 * layer returns a matching `battle-result-animation-complete`. A knockout is
 * only a combatant-defeated event and arms nothing.
 *
 * So this module refuses to build a record from anything but a *settled*
 * battle. It reads `campaignSettlement(battle)`, which is populated by the
 * private latch inside `CampaignSettlement` and by nothing else, so there is
 * no way to reach a record through gate 1 alone. Combined with the record id
 * being a pure function of `battleId` plus the settlement's completion token,
 * one battle yields exactly one record no matter how many times this is
 * called.
 */

import { EliminationEvent } from "../team/elimination.js";
import {
  allCombatants,
  campaignSettlement,
  combatStateHash,
  isCampaignSettled,
  toControllerState
} from "../team/resolver.js";
import { CampaignRecordError } from "./errors.js";
import {
  CAMPAIGN_RECORD_KIND,
  CAMPAIGN_RECORD_SCHEMA_VERSION,
  CAMPAIGN_WRITER_ID,
  CAMPAIGN_WRITER_VERSION,
  campaignRecordIdFor,
  sealCampaignRecord
} from "./record.js";

const DEFAULT_WRITER = Object.freeze({ id: CAMPAIGN_WRITER_ID, version: CAMPAIGN_WRITER_VERSION });

/** Last defeat sequence per combatant, from the resolver's stamped event log. */
function defeatSequences(events) {
  const sequences = new Map();
  for (const event of events) {
    if (event.type === EliminationEvent.COMBATANT_DEFEATED && typeof event.targetId === "string") {
      sequences.set(event.targetId, event.sequence);
    }
  }
  return sequences;
}

/**
 * The writer block names the build of this layer that produced the record, so
 * a bad one has to be refused before it is spread into the draft.
 */
function assertWriter(writer) {
  if (!writer || typeof writer !== "object" || Array.isArray(writer)) {
    throw new CampaignRecordError(
      "writer must be an object of the form { id, version } naming the build of this layer."
    );
  }
  for (const field of ["id", "version"]) {
    const value = writer[field];
    if (typeof value !== "string" || value.length === 0 || value.length > 64) {
      throw new CampaignRecordError(`writer.${field} must be a short non-empty string.`);
    }
  }
  return writer;
}

/**
 * The defeat sequence for one combatant, refusing rather than recording null.
 *
 * A casualty carries the sequence the resolver stamped on its
 * `combatant-defeated` event. There is one case where no such event exists: a
 * combatant that entered the battle already at zero health, so the battle
 * never defeated it. That is not an outcome this record can describe — the
 * record's `defeatedAtSequence` means "the point in *this battle* at which the
 * combatant fell" — so it is refused by name here rather than flattened to a
 * null that validates and hides a dropped event.
 */
function defeatSequenceFor(combatant, sequences) {
  if (combatant.alive) return null;
  const sequence = sequences.get(combatant.id);
  if (sequence === undefined) {
    throw new CampaignRecordError(
      `Combatant ${combatant.id} is down but the battle logged no combatant-defeated event for it, so ` +
      "there is no defeat sequence to record. A combatant that entered the battle already at zero health " +
      "was never defeated by it, and this layer will not invent a sequence for one."
    );
  }
  return sequence;
}

/**
 * Build a sealed, validated campaign record for a settled battle.
 *
 * @param {object} battle a battle from `createTeamBattle()` that has settled
 * @param {object} options
 * @param {string} options.battleId the campaign's identifier for this battle
 * @param {string} [options.recordedAt] ISO timestamp; injectable for tests
 * @param {{id: string, version: string}} [options.writer]
 */
export function buildCampaignRecord(battle, { battleId, recordedAt, writer = DEFAULT_WRITER } = {}) {
  if (!battle || typeof battle !== "object" || !Array.isArray(battle.teams)) {
    throw new CampaignRecordError("A campaign record needs a team battle from createTeamBattle().");
  }
  // Checked here rather than left to the seal. `writer` is spread field by
  // field into the draft, so a bad one arrives at validation as two
  // `undefined`s and surfaces as "provenance.writer.id is not JSON-safe" — a
  // message about JSON that says nothing about the argument that was wrong.
  assertWriter(writer);
  if (!isCampaignSettled(battle)) {
    throw new CampaignRecordError(
      "The battle has not settled. A campaign record is written once, after a whole team is eliminated " +
      "and the final animation is acknowledged — never on a knockout."
    );
  }
  const settled = campaignSettlement(battle);
  if (!settled) {
    throw new CampaignRecordError("The battle reports settled but carries no settlement record.");
  }
  const descriptor = battle.rulesDescriptor;
  if (!descriptor || typeof descriptor !== "object") {
    throw new CampaignRecordError(
      "The battle carries no rule-set descriptor, so the record could not say which maths produced it."
    );
  }

  const sequences = defeatSequences(battle.events);
  const combatants = allCombatants(battle);

  const draft = {
    schemaVersion: CAMPAIGN_RECORD_SCHEMA_VERSION,
    kind: CAMPAIGN_RECORD_KIND,
    recordId: campaignRecordIdFor({ battleId, completionToken: settled.completionToken }),
    battleId,
    recordedAt: recordedAt ?? new Date().toISOString(),
    settlement: {
      winnerTeamId: settled.winnerTeamId,
      loserTeamIds: [...settled.loserTeamIds],
      reason: settled.reason,
      completionToken: settled.completionToken,
      acknowledgedToken: settled.acknowledgedToken
    },
    teams: battle.teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      slots: team.slots.map((slot) => ({
        seatId: slot.seatId,
        // The resolver's slot calls this `index`; the record calls it
        // `slotIndex` so one name means one thing across the whole record.
        slotIndex: slot.index,
        combatantId: slot.combatantId,
        aiFilled: slot.aiFilled
      }))
    })),
    // Controller identity, in its own block, exactly as `toControllerState()`
    // keeps it out of `toTeamWireState()`. The fields are renamed so a seat's
    // `id` can never be mistaken for a combatant's.
    seats: toControllerState(battle).map((seat) => ({
      seatId: seat.seatId,
      controllerKind: seat.kind,
      controllerId: seat.id,
      controllerLabel: seat.label
    })),
    outcomes: combatants.map((combatant) => ({
      combatantId: combatant.id,
      name: combatant.name,
      teamId: combatant.teamId,
      seatId: combatant.seatId,
      slotIndex: combatant.slotIndex,
      aiFilled: combatant.aiFilled,
      survived: combatant.alive,
      health: combatant.health,
      maxHealth: combatant.maxHealth,
      statuses: [...combatant.status],
      defeatedAtSequence: defeatSequenceFor(combatant, sequences)
    })),
    provenance: {
      ruleSet: {
        id: descriptor.id,
        contractVersion: descriptor.contractVersion,
        verification: descriptor.verification,
        runtimeVerified: descriptor.runtimeVerified,
        goldenFixtureIds: [...(descriptor.goldenFixtureIds ?? [])],
        buildSha256: descriptor.buildSha256 ?? null,
        note: descriptor.note
      },
      battle: {
        stateVersion: battle.version,
        seed: battle.seed,
        rngCursor: battle.rngCursor,
        turnNumber: battle.turnNumber,
        initiative: [...battle.initiative],
        combatStateHash: combatStateHash(battle)
      },
      writer: { id: writer?.id, version: writer?.version },
      migration: null
    }
  };
  return sealCampaignRecord(draft);
}
