import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { knownVanillaFields } from "../src/adapter/vanilla-fields.js";
import { canonicalJsonStringify as goldenCanonicalJsonStringify } from "../src/golden/observation.js";
import { SS2_BUILD_SHA256 } from "../src/golden/run-1v1-fixture.js";
import {
  BATTLE_RESULT_ACK_TYPE,
  acknowledgeResultAnimation,
  advanceAiTurns,
  applyAction,
  campaignSettlement,
  combatStateHash,
  createTeamBattle,
  currentCombatant,
  defineTeamRuleSet,
  isAiControlled,
  isCampaignSettled,
  legalActions,
  pendingResultEvent,
  reassignController,
  RuleSetVerification
} from "../src/team/index.js";
import {
  BATTLE_KEY_TEMPLATE,
  CAMPAIGN_MIGRATIONS,
  CAMPAIGN_NAMESPACE,
  CAMPAIGN_RECORD_KIND,
  CAMPAIGN_RECORD_SCHEMA_VERSION,
  CampaignMigrationError,
  CampaignRecordError,
  CampaignRecordIntegrityError,
  CampaignSchemaVersionError,
  CampaignStorageError,
  DEFAULT_CAMPAIGN_BYTE_BUDGET,
  MINIMUM_SUPPORTED_SCHEMA_VERSION,
  QUARANTINE_KEY_TEMPLATE,
  ReadStatus,
  RecordedRuleSetVerification,
  VANILLA_SAVE_CONTAINER_FIELDS,
  VanillaBoundaryError,
  WriteStatus,
  assertCampaignKey,
  assertJsonSafe,
  assertNoVanillaFieldNames,
  buildCampaignRecord,
  campaignKey,
  campaignRecordIdFor,
  canonicalJsonStringify,
  computeCampaignRecordDigest,
  createCampaignRecorder,
  createCampaignStore,
  createMemoryBackend,
  createNamespacedBackend,
  describeCampaignMigrations,
  describeCampaignRecord,
  describeVanillaBoundary,
  isCampaignRecord,
  isVanillaFieldName,
  migrateCampaignRecord,
  parseCampaignKey,
  recordSettledBattle,
  schemaVersionOf,
  sealCampaignRecord,
  validateCampaignRecord,
  vanillaFieldNamesIn,
  vanillaFieldNamesOn
} from "../src/campaign/index.js";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const AT = "2026-08-30T12:00:00.000Z";

/**
 * A one-shot brute, borrowed in spirit from `test/team-resolver.test.js`: high
 * damage and a high hit chance so every battle here reaches settlement in a
 * handful of turns without needing an explicit RNG tape.
 */
const brute = (id, agility, overrides = {}) => ({
  id,
  name: id,
  controller: overrides.controller ?? "ai",
  stats: { strength: 10, agility, attack: 40, defense: 0, vitality: 0, stamina: 5, magicka: 0 },
  loadout: { meleeDamage: 40, rangedDamage: 1, canUseRanged: false },
  maxHealth: 50,
  health: overrides.health ?? 50
});

const twoVsTwo = (overrides = {}) => ({
  seed: 7,
  teams: [
    {
      id: "alpha",
      name: "Alpha",
      slots: 2,
      combatants: [brute("a1", 9, { controller: overrides.alphaController }), brute("a2", 8)]
    },
    // Slot 2 is left empty so the roster AI-fills it. That fill is a *roster*
    // fact; the controller on slot 1 is a separate question.
    { id: "beta", name: "Beta", slots: 2, combatants: [brute("b1", 3), null] }
  ],
  ...overrides.blueprint
});

/** Drives a battle to settlement, human seats included, then acknowledges. */
function runToSettlement(battle) {
  for (let guard = 0; !battle.result; guard += 1) {
    if (guard > 200) throw new Error("The battle did not end.");
    const actor = currentCombatant(battle);
    if (isAiControlled(battle, actor)) {
      advanceAiTurns(battle);
      continue;
    }
    const options = legalActions(battle, actor.id);
    const attack = options.find((option) => option.type === "melee") ?? options[0];
    applyAction(battle, { actorId: actor.id, ...attack });
  }
  const pending = pendingResultEvent(battle);
  acknowledgeResultAnimation(battle, {
    type: BATTLE_RESULT_ACK_TYPE,
    completionToken: pending.completionToken
  });
  return battle;
}

function settledBattle(blueprint = twoVsTwo()) {
  return runToSettlement(createTeamBattle(blueprint));
}

function sampleRecord(options = {}) {
  return buildCampaignRecord(settledBattle(options.blueprint ?? twoVsTwo()), {
    battleId: options.battleId ?? "camp-1",
    recordedAt: options.recordedAt ?? AT
  });
}

const mutable = (record) => JSON.parse(JSON.stringify(record));

/** Reseal a mutated draft, so a tamper test exercises validation, not the digest. */
function reseal(draft) {
  const next = { ...draft };
  delete next.digest;
  return sealCampaignRecord(next);
}

/** The schema-1 shape: everything current, minus `provenance.ruleSet`. */
function demoteToSchema1(record) {
  const draft = mutable(record);
  draft.schemaVersion = 1;
  delete draft.provenance.ruleSet;
  draft.provenance.migration = null;
  delete draft.digest;
  draft.digest = computeCampaignRecordDigest(draft);
  return draft;
}

/**
 * Stands in for a promoted SS2 rule set so the provenance gate can be
 * exercised at rest. It is a test double: nothing in this repository is
 * runtime-verified except the promoted goldens in
 * `test/fixtures/ss2-1v1-golden/`.
 */
const pretendVerifiedRules = defineTeamRuleSet({
  id: "test-double-verified",
  verification: RuleSetVerification.RUNTIME_VERIFIED,
  provenance: {
    kind: "licensed-observation",
    runtimeVerified: true,
    note: "Test double standing in for a promoted rule set. Not a verification claim.",
    buildSha256: SS2_BUILD_SHA256,
    goldenFixtureIds: ["golden-prisoner-normal-kill-dir6"]
  },
  actionTypes: ["strike"],
  maximumHealth: (combatant) => combatant.maxHealth ?? 50,
  legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
  resolveAction: (request) => ({
    effects: [{ kind: "damage", targetId: request.target.id, amount: 50 }],
    events: [{ type: "strike", actorId: request.actor.id, targetId: request.target.id }]
  }),
  chooseAiAction: (view, actorId, options) => options[0]
});

/**
 * A rule set that applies status effects, so `outcomes[].statuses` is exercised
 * with something in it.
 *
 * Every fixture above leaves every status list empty, which meant
 * `from-battle.js` could have written `statuses: []` unconditionally and the
 * whole suite would still have passed — and `record.js`'s length cap,
 * non-empty-string check and duplicate check were never reached by any test.
 * `scorch` marks the target and the actor, so a settled battle ends with
 * several different non-empty lists.
 */
const scorchingRules = defineTeamRuleSet({
  id: "test-double-scorching",
  verification: RuleSetVerification.PLACEHOLDER,
  provenance: {
    runtimeVerified: false,
    note: "Test double that applies status effects. Invented; nothing here is measured SS2 behaviour."
  },
  actionTypes: ["scorch"],
  maximumHealth: (combatant) => combatant.maxHealth ?? 50,
  legalActions: (view) => view.foes.map((foe) => ({ type: "scorch", targetId: foe.id })),
  resolveAction: (request) => ({
    effects: [
      { kind: "status", targetId: request.target.id, status: "burning" },
      { kind: "status", targetId: request.actor.id, status: "overheated" },
      { kind: "damage", targetId: request.target.id, amount: 25 }
    ],
    events: [{ type: "scorch", actorId: request.actor.id, targetId: request.target.id }]
  }),
  chooseAiAction: (view, actorId, options) => options[0]
});

/** A container this project owns: the intended host, with no vanilla siblings. */
const modContainer = (extra = {}) => ({ modVersion: "1", ...extra });

/* ------------------------------------------------------------------ */
/* The record schema                                                   */
/* ------------------------------------------------------------------ */

test("a settled 2v2 produces one record that validates and round-trips through canonical JSON", () => {
  const record = sampleRecord();
  assert.equal(record.schemaVersion, CAMPAIGN_RECORD_SCHEMA_VERSION);
  assert.equal(record.kind, CAMPAIGN_RECORD_KIND);
  validateCampaignRecord(record);

  const text = canonicalJsonStringify(record);
  const parsed = JSON.parse(text);
  validateCampaignRecord(parsed);
  assert.equal(canonicalJsonStringify(parsed), text);
});

test("the record names which slots were AI-filled, and AI fill is not the same question as an AI controller", () => {
  const record = sampleRecord({ blueprint: twoVsTwo({ alphaController: "local" }) });
  const bySeat = new Map(record.seats.map((seat) => [seat.seatId, seat]));
  const slots = record.teams.flatMap((team) => team.slots);

  const filled = slots.filter((slot) => slot.aiFilled);
  assert.deepEqual(filled.map((slot) => slot.seatId), ["beta:slot-2"]);
  assert.equal(bySeat.get("beta:slot-2").controllerKind, "ai", "an AI-filled slot is always AI-driven");

  // The other direction is the one that matters: an occupied slot can be
  // AI-driven without having been AI-filled.
  const aiDrivenButNotFilled = slots.filter(
    (slot) => !slot.aiFilled && bySeat.get(slot.seatId).controllerKind === "ai"
  );
  assert.ok(aiDrivenButNotFilled.length > 0);
  assert.equal(bySeat.get("alpha:slot-1").controllerKind, "local");
  assert.equal(slots.find((slot) => slot.seatId === "alpha:slot-1").aiFilled, false);
});

test("controller seats are recorded apart from combatants, and a seat carrying combatant identity is refused", () => {
  const record = sampleRecord();
  assert.equal(record.seats.length, 4);
  for (const seat of record.seats) {
    assert.deepEqual(
      Object.keys(seat).sort(),
      ["controllerId", "controllerKind", "controllerLabel", "seatId"]
    );
  }
  for (const forbidden of ["combatantId", "teamId", "slotIndex", "aiFilled"]) {
    const draft = mutable(record);
    draft.seats[0][forbidden] = draft.outcomes[0][forbidden] ?? "x";
    assert.throws(() => reseal(draft), (error) =>
      error instanceof CampaignRecordError && /independent|not who is fighting/i.test(error.message));
  }
});

test("per-combatant outcomes mirror the resolver's final state", () => {
  const battle = settledBattle();
  const record = buildCampaignRecord(battle, { battleId: "camp-1", recordedAt: AT });
  const combatants = battle.teams.flatMap((team) => team.combatants);
  assert.equal(record.outcomes.length, combatants.length);
  for (const combatant of combatants) {
    const outcome = record.outcomes.find((entry) => entry.combatantId === combatant.id);
    assert.equal(outcome.survived, combatant.alive);
    assert.equal(outcome.health, combatant.health);
    assert.equal(outcome.maxHealth, combatant.maxHealth);
    assert.equal(outcome.seatId, combatant.seatId);
    assert.deepEqual(outcome.statuses, combatant.status);
    if (!combatant.alive) {
      const defeat = battle.events.find(
        (event) => event.type === "defeated" && event.targetId === combatant.id
      );
      assert.equal(outcome.defeatedAtSequence, defeat.sequence);
    } else {
      assert.equal(outcome.defeatedAtSequence, null);
    }
  }
});

test("a casualty must carry the sequence at which it was defeated", () => {
  const record = sampleRecord();
  const casualty = record.outcomes.find((outcome) => !outcome.survived);
  assert.ok(Number.isSafeInteger(casualty.defeatedAtSequence) && casualty.defeatedAtSequence > 0);

  // Only one direction of this rule was checked, and it was the direction that
  // cannot lose evidence. A dropped `combatant-defeated` event recorded as
  // `null` and validated, so the record could not tell "defeated at sequence 6"
  // from "we lost the event".
  const dropped = mutable(record);
  dropped.outcomes.find((outcome) => !outcome.survived).defeatedAtSequence = null;
  assert.throws(() => reseal(dropped), /carries no defeat sequence/);

  const zero = mutable(record);
  zero.outcomes.find((outcome) => !outcome.survived).defeatedAtSequence = 0;
  assert.throws(() => reseal(zero), /must be a positive integer/);

  // The other direction still holds, and so does the draw case, where every
  // combatant is a casualty.
  const survivorStamped = mutable(record);
  survivorStamped.outcomes.find((outcome) => outcome.survived).defeatedAtSequence = 3;
  assert.throws(() => reseal(survivorStamped), /survived but carries a defeat sequence/);
});

test("a combatant that entered the battle already down is refused by name, not flattened to null", () => {
  // The one battle in which a casualty legitimately has no defeat event: it was
  // never defeated *by this battle*. `defeatedAtSequence` means "the point in
  // this battle at which the combatant fell", so there is nothing honest to
  // write, and inventing one or recording null are both worse than refusing.
  const battle = runToSettlement(createTeamBattle({
    seed: 7,
    teams: [
      { id: "alpha", name: "Alpha", slots: 2, combatants: [brute("a1", 9), brute("a2", 8)] },
      {
        id: "beta",
        name: "Beta",
        slots: 2,
        combatants: [brute("b1", 3, { health: 0 }), brute("b2", 2, { health: 0 })]
      }
    ]
  }));
  assert.ok(battle.result, "the battle is decided — beta entered eliminated");
  assert.throws(
    () => buildCampaignRecord(battle, { battleId: "camp-walkover", recordedAt: AT }),
    (error) => {
      assert.ok(error instanceof CampaignRecordError);
      assert.match(error.message, /b1 is down but the battle logged no combatant-defeated event/);
      return true;
    }
  );
});

test("statuses are carried through from the resolver, and the list is bounded, non-empty and unique", () => {
  const record = buildCampaignRecord(
    settledBattle({ ...twoVsTwo(), rules: scorchingRules }),
    { battleId: "camp-scorched", recordedAt: AT }
  );
  // Every other fixture in this file leaves every status list empty, so
  // `from-battle.js` could have written `statuses: []` unconditionally and the
  // suite would still have passed.
  const byId = new Map(record.outcomes.map((outcome) => [outcome.combatantId, outcome.statuses]));
  assert.ok([...byId.values()].every((statuses) => statuses.length > 0), "every combatant was marked");
  assert.ok(new Set([...byId.values()].map((statuses) => statuses.join(","))).size > 1, "and not identically");
  assert.deepEqual(byId.get("b1"), ["burning"], "the first target burns and never acts");
  const battle = settledBattle({ ...twoVsTwo(), rules: scorchingRules });
  for (const combatant of battle.teams.flatMap((team) => team.combatants)) {
    assert.deepEqual(
      record.outcomes.find((outcome) => outcome.combatantId === combatant.id).statuses,
      combatant.status,
      `${combatant.id} statuses mirror the resolver`
    );
  }

  const withStatus = (statuses) => {
    const draft = mutable(record);
    draft.outcomes[0].statuses = statuses;
    return () => reseal(draft);
  };
  assert.throws(withStatus(["burning", "burning"]), /repeats a status/);
  assert.throws(withStatus(["burning", ""]), /array of non-empty strings/);
  assert.throws(withStatus(["burning", 7]), /array of non-empty strings/);
  assert.throws(withStatus("burning"), /array of non-empty strings/);
  assert.throws(
    withStatus(Array.from({ length: 33 }, (unused, index) => `status-${index}`)),
    /array of non-empty strings/
  );
  assert.doesNotThrow(withStatus(Array.from({ length: 32 }, (unused, index) => `status-${index}`)));
});

test("the writer block is checked where it is supplied, not where it fails to serialise", () => {
  const battle = settledBattle();
  // A bad `writer` used to be spread field by field into the draft and surface
  // as "provenance.writer.id is not JSON-safe" — a message about JSON that
  // names neither the argument nor what was wrong with it.
  for (const writer of ["nope", 7, null, [], {}, { id: "x" }, { id: "x", version: "" }, { id: 1, version: "1" }]) {
    assert.throws(
      () => buildCampaignRecord(battle, { battleId: "camp-1", recordedAt: AT, writer }),
      (error) => {
        assert.ok(error instanceof CampaignRecordError);
        assert.match(error.message, /^writer(\.\w+)? must be/);
        return true;
      },
      JSON.stringify(writer) ?? String(writer)
    );
  }
  const named = buildCampaignRecord(battle, {
    battleId: "camp-1",
    recordedAt: AT,
    writer: { id: "host-shell", version: "4" }
  });
  assert.deepEqual(named.provenance.writer, { id: "host-shell", version: "4" });
});

test("the record says which rule set produced it, and that today's rule set is a placeholder", () => {
  const record = sampleRecord();
  assert.deepEqual(record.provenance.ruleSet, {
    id: "placeholder-classic-style",
    contractVersion: 1,
    verification: RecordedRuleSetVerification.PLACEHOLDER,
    runtimeVerified: false,
    goldenFixtureIds: [],
    buildSha256: null,
    note: "Invented approximation. Not measured against the licensed SS2 build."
  });
  assert.equal(describeCampaignRecord(record).runtimeVerified, false);
});

test("a record cannot claim runtime verification without a build hash and a promoted golden", () => {
  const record = sampleRecord();
  const claim = (ruleSet) => {
    const draft = mutable(record);
    draft.provenance.ruleSet = { ...draft.provenance.ruleSet, ...ruleSet };
    return () => reseal(draft);
  };
  assert.throws(claim({ verification: "runtime-verified" }), CampaignRecordError, "flag must agree");
  assert.throws(
    claim({ verification: "runtime-verified", runtimeVerified: true }),
    /must pin the licensed build SHA-256/
  );
  assert.throws(
    claim({
      verification: "runtime-verified",
      runtimeVerified: true,
      buildSha256: "a".repeat(64)
    }),
    /must cite at least one promoted golden/
  );
  assert.throws(
    claim({ goldenFixtureIds: ["golden-prisoner-normal-kill-dir6"] }),
    /placeholder rule set must not cite golden fixtures/
  );
  assert.throws(claim({ buildSha256: "a".repeat(64) }), /placeholder rule set must not pin a build hash/);
});

test("a record built on a runtime-verified rule set carries its build hash and goldens", () => {
  const record = buildCampaignRecord(
    settledBattle({ ...twoVsTwo(), rules: pretendVerifiedRules }),
    { battleId: "camp-verified", recordedAt: AT }
  );
  assert.equal(record.provenance.ruleSet.verification, RecordedRuleSetVerification.RUNTIME_VERIFIED);
  assert.equal(record.provenance.ruleSet.runtimeVerified, true);
  // The VALUE, not the shape. A shape check (`/^[A-Fa-f0-9]{64}$/`) passes for
  // `"0".repeat(64)`, so a rule set pinning a hash of nothing and citing a
  // fixture that does not exist produced a record saying `runtimeVerified: true`
  // and the assertion held. The build this project measures is one build.
  assert.equal(
    record.provenance.ruleSet.buildSha256,
    "77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA"
  );
  assert.equal(record.provenance.ruleSet.buildSha256, SS2_BUILD_SHA256, "and it is the repository's own pin");
  assert.deepEqual(record.provenance.ruleSet.goldenFixtureIds, ["golden-prisoner-normal-kill-dir6"]);
  // Whether a cited fixture id RESOLVES is the promotion gate's question, not
  // this layer's; the record only carries the citation.
});

test("the completion token is recomputed from the outcome, so an edited result is refused", () => {
  const record = sampleRecord();
  const draft = mutable(record);
  draft.settlement.winnerTeamId = "beta";
  draft.settlement.loserTeamIds = ["alpha"];
  assert.throws(() => reseal(draft), /completionToken does not match the recorded outcome/);

  const swapped = mutable(record);
  swapped.settlement.acknowledgedToken = "team-arena:beta:alpha+none:elimination";
  assert.throws(() => reseal(swapped), /acknowledgedToken must equal completionToken/);
});

test("recorded survival must agree with recorded health", () => {
  const draft = mutable(sampleRecord());
  const survivor = draft.outcomes.find((outcome) => outcome.survived);
  survivor.survived = false;
  assert.throws(() => reseal(draft), /survived disagrees with the recorded health/);
});

test("the record is checked against the resolver's definition of a decided battle", () => {
  const record = sampleRecord();

  const zombie = mutable(record);
  const loser = zombie.outcomes.find((outcome) => !outcome.survived);
  loser.health = 10;
  loser.survived = true;
  loser.defeatedAtSequence = null;
  assert.throws(() => reseal(zombie), /survivor on eliminated team/);

  const noSurvivors = mutable(record);
  for (const outcome of noSurvivors.outcomes) {
    outcome.health = 0;
    outcome.survived = false;
    outcome.defeatedAtSequence = outcome.defeatedAtSequence ?? 1;
  }
  assert.throws(() => reseal(noSurvivors), /at least one survivor on the winning team/);
});

test("a draw names every team as eliminated and cannot leave a survivor", () => {
  const base = mutable(sampleRecord());
  const asDraw = (loserTeamIds) => {
    const draw = { ...base };
    const token = `team-arena:none:${[...loserTeamIds].sort().join("+")}:draw`;
    draw.settlement = {
      winnerTeamId: null,
      loserTeamIds: [...loserTeamIds].sort(),
      reason: "draw",
      completionToken: token,
      acknowledgedToken: token
    };
    draw.outcomes = base.outcomes.map((outcome) => ({
      ...outcome,
      health: 0,
      survived: false,
      defeatedAtSequence: outcome.defeatedAtSequence ?? 1
    }));
    draw.recordId = campaignRecordIdFor({ battleId: draw.battleId, completionToken: token });
    return draw;
  };

  const sealed = reseal(asDraw(["alpha", "beta"]));
  assert.equal(sealed.settlement.reason, "draw");
  assert.equal(sealed.settlement.winnerTeamId, null);

  assert.throws(() => reseal(asDraw(["alpha"])), /draw must name every team as eliminated/);

  const survivor = mutable(sealed);
  survivor.outcomes[0].health = 5;
  survivor.outcomes[0].survived = true;
  survivor.outcomes[0].defeatedAtSequence = null;
  assert.throws(() => reseal(survivor), /survivor on eliminated team/);
});

test("validation is exact-key: an extra field or a missing block is refused, never ignored", () => {
  const record = sampleRecord();
  const extra = mutable(record);
  extra.campaignGold = 1200;
  assert.throws(() => reseal(extra), /record has unexpected or missing fields/);

  const missing = mutable(record);
  delete missing.provenance.battle;
  assert.throws(() => reseal(missing), /provenance has unexpected or missing fields/);

  const strayProvenance = mutable(record);
  strayProvenance.provenance.ruleSet.extra = true;
  assert.throws(() => reseal(strayProvenance), /provenance.ruleSet has unexpected or missing fields/);
});

test("the digest covers the whole record; one edited character is caught", () => {
  const record = sampleRecord();
  const tampered = mutable(record);
  tampered.provenance.battle.turnNumber += 1;
  assert.throws(() => validateCampaignRecord(tampered), CampaignRecordIntegrityError);

  const rebadged = mutable(record);
  rebadged.digest = "f".repeat(64);
  assert.throws(() => validateCampaignRecord(rebadged), /digest does not match/);

  const notHex = mutable(record);
  notHex.digest = "not-a-digest";
  assert.throws(() => validateCampaignRecord(notHex), /lowercase SHA-256 hex digest/);
});

test("the record id is a pure function of the battle id and the completion token", () => {
  const first = sampleRecord({ recordedAt: AT });
  const replayed = sampleRecord({ recordedAt: "2027-01-01T00:00:00.000Z" });
  assert.equal(first.recordId, replayed.recordId, "a replay of the same settlement keeps its identity");
  assert.notEqual(first.digest, replayed.digest, "but the digest still covers the timestamp");
  assert.notEqual(sampleRecord({ battleId: "camp-2" }).recordId, first.recordId);

  const relabelled = mutable(first);
  relabelled.battleId = "camp-2";
  assert.throws(() => reseal(relabelled), /recordId does not match its battleId/);
});

test("the canonical JSON form matches the one the golden pipeline already uses", () => {
  const record = sampleRecord();
  assert.equal(canonicalJsonStringify(record), goldenCanonicalJsonStringify(record));
  const awkward = { z: [3, { b: 1, a: 2 }], a: null, m: "x" };
  assert.equal(canonicalJsonStringify(awkward), goldenCanonicalJsonStringify(awkward));
});

test("a 3v3 with mixed controllers records six seats, and a mid-battle reassignment is not AI fill", () => {
  const battle = createTeamBattle({
    seed: 11,
    teams: [
      {
        id: "alpha",
        name: "Alpha",
        slots: 3,
        combatants: [
          brute("a1", 9, { controller: "local" }),
          brute("a2", 8, { controller: "hot-seat:pad-2" }),
          brute("a3", 7, { controller: "peer-7" })
        ]
      },
      { id: "beta", name: "Beta", slots: 3, combatants: [brute("b1", 3), brute("b2", 2), null] }
    ]
  });
  // Controller identity is independent of combatant identity: handing a
  // human's seat to the AI mid-battle changes neither the combatant nor the
  // fact that the slot was never AI-*filled*.
  reassignController(battle, "alpha:slot-3", "ai");
  runToSettlement(battle);

  const record = buildCampaignRecord(battle, { battleId: "camp-3v3", recordedAt: AT });
  validateCampaignRecord(record);
  assert.equal(record.outcomes.length, 6);
  assert.equal(record.seats.length, 6);
  const bySeat = new Map(record.seats.map((seat) => [seat.seatId, seat]));
  assert.deepEqual(
    ["alpha:slot-1", "alpha:slot-2", "alpha:slot-3"].map((seat) => bySeat.get(seat).controllerKind),
    ["local", "hot-seat", "ai"]
  );
  assert.equal(bySeat.get("alpha:slot-2").controllerId, "hot-seat:pad-2");
  const slots = record.teams.flatMap((team) => team.slots);
  assert.equal(slots.find((slot) => slot.seatId === "alpha:slot-3").aiFilled, false);
  assert.deepEqual(slots.filter((slot) => slot.aiFilled).map((slot) => slot.seatId), ["beta:slot-3"]);
  assert.equal(new Set(record.seats.map((seat) => seat.controllerKind)).size, 3);
});

test("describeCampaignRecord leads with provenance and names the AI-filled seats", () => {
  const summary = describeCampaignRecord(sampleRecord());
  assert.equal(summary.verification, RecordedRuleSetVerification.PLACEHOLDER);
  assert.equal(summary.runtimeVerified, false);
  assert.equal(summary.migrated, false);
  assert.deepEqual(summary.aiFilledSlots, ["beta:slot-2"]);
  assert.deepEqual(summary.survivors, ["a1", "a2"]);
});

/* ------------------------------------------------------------------ */
/* The settlement contract                                             */
/* ------------------------------------------------------------------ */

test("an unsettled battle produces no record", () => {
  const battle = createTeamBattle(twoVsTwo());
  assert.throws(
    () => buildCampaignRecord(battle, { battleId: "camp-1" }),
    /has not settled/
  );
});

test("a knockout arms nothing the campaign can record; only the acknowledgement does", () => {
  const battle = createTeamBattle(twoVsTwo());
  advanceAiTurns(battle);
  assert.ok(battle.result, "the battle is decided");
  assert.ok(pendingResultEvent(battle), "settlement is armed");
  assert.throws(() => buildCampaignRecord(battle, { battleId: "camp-1" }), /has not settled/);

  const pending = pendingResultEvent(battle);
  acknowledgeResultAnimation(battle, {
    type: BATTLE_RESULT_ACK_TYPE,
    completionToken: pending.completionToken
  });
  const record = buildCampaignRecord(battle, { battleId: "camp-1", recordedAt: AT });
  assert.equal(record.settlement.acknowledgedToken, pending.completionToken);
});

test("the settlement hook fires once and stores exactly one record", () => {
  const store = createCampaignStore({ backend: createMemoryBackend() });
  const recorder = createCampaignRecorder({ store, battleId: "camp-1", recordedAt: AT });
  const battle = createTeamBattle({ ...twoVsTwo(), onCampaignSettled: recorder.hook });
  recorder.attach(battle);
  runToSettlement(battle);

  assert.deepEqual(recorder.errors, []);
  assert.equal(recorder.results.length, 1);
  assert.equal(recorder.lastResult.status, WriteStatus.WRITTEN);
  assert.equal(store.recordIds().length, 1);

  // A repeated, delayed, or duplicated acknowledgement returns false and must
  // not produce a second record.
  assert.equal(
    acknowledgeResultAnimation(battle, {
      type: BATTLE_RESULT_ACK_TYPE,
      completionToken: campaignSettlement(battle).completionToken
    }),
    false
  );
  assert.equal(recorder.results.length, 1);
  assert.equal(store.recordIds().length, 1);
});

test("recording the same settled battle again stores nothing new", () => {
  const store = createCampaignStore({ backend: createMemoryBackend() });
  const battle = settledBattle();
  const first = store.write(buildCampaignRecord(battle, { battleId: "camp-1", recordedAt: AT }));
  const second = store.write(
    buildCampaignRecord(battle, { battleId: "camp-1", recordedAt: "2027-05-05T00:00:00.000Z" })
  );
  assert.equal(first.status, WriteStatus.WRITTEN);
  assert.equal(second.status, WriteStatus.DUPLICATE);
  assert.equal(second.written, false);
  assert.equal(store.recordIds().length, 1);
  assert.equal(store.readAll().records[0].recordedAt, AT, "the first record is kept, not replaced");
});

test("a recorder refuses to be attached to a second battle", () => {
  const recorder = createCampaignRecorder({
    store: createCampaignStore({ backend: createMemoryBackend() }),
    battleId: "camp-1"
  });
  recorder.attach(createTeamBattle(twoVsTwo()));
  assert.throws(() => recorder.attach(createTeamBattle(twoVsTwo())), /already attached/);
});

test("a storage failure at settlement is collected, not thrown out of the battle", () => {
  const brokenStore = {
    write() {
      throw new CampaignStorageError("the disk is full");
    }
  };
  const recorder = createCampaignRecorder({ store: brokenStore, battleId: "camp-1", recordedAt: AT });
  const battle = createTeamBattle({ ...twoVsTwo(), onCampaignSettled: recorder.hook });
  recorder.attach(battle);
  assert.doesNotThrow(() => runToSettlement(battle));
  assert.equal(recorder.results.length, 0);
  assert.equal(recorder.errors.length, 1);
  assert.match(recorder.errors[0].message, /disk is full/);
  assert.equal(isCampaignSettled(battle), true, "the battle still settled exactly once");
});

test("the hook swallows save failures and nothing else — a boundary violation propagates", () => {
  // `errors.js`: a VanillaBoundaryError "is never recoverable and never
  // degraded", and "if it is ever thrown in production the correct response is
  // to fix the caller, not to catch it". The hook's blanket catch filed it on
  // `errors` alongside a full disk and let the run continue.
  const boundaryStore = {
    write() {
      throw new VanillaBoundaryError("ss2_data is outside the namespace");
    }
  };
  const recorder = createCampaignRecorder({ store: boundaryStore, battleId: "camp-1", recordedAt: AT });
  const battle = createTeamBattle({ ...twoVsTwo(), onCampaignSettled: recorder.hook });
  recorder.attach(battle);
  assert.throws(() => runToSettlement(battle), VanillaBoundaryError);
  assert.deepEqual(recorder.errors, [], "it was not collected");

  // A record failure is a save problem and is still collected.
  const recordFailing = createCampaignRecorder({
    store: { write() { throw new CampaignRecordError("the record did not validate"); } },
    battleId: "camp-2",
    recordedAt: AT
  });
  const second = createTeamBattle({ ...twoVsTwo(), onCampaignSettled: recordFailing.hook });
  recordFailing.attach(second);
  assert.doesNotThrow(() => runToSettlement(second));
  assert.equal(recordFailing.errors.length, 1);
  assert.ok(recordFailing.errors[0] instanceof CampaignRecordError);
});

test("throwOnFailure turns a collected save failure back into a thrown one", () => {
  const recorder = createCampaignRecorder({
    store: { write() { throw new CampaignStorageError("the disk is full"); } },
    battleId: "camp-1",
    recordedAt: AT,
    throwOnFailure: true
  });
  const battle = createTeamBattle({ ...twoVsTwo(), onCampaignSettled: recorder.hook });
  recorder.attach(battle);
  assert.throws(() => runToSettlement(battle), /disk is full/);
  assert.equal(recorder.errors.length, 1, "and it is recorded either way");
  assert.equal(recorder.results.length, 0);
  assert.equal(recorder.lastResult, null);
});

test("recordSettledBattle is the one-shot form, and it needs a store", () => {
  const store = createCampaignStore({ backend: createMemoryBackend() });
  const battle = settledBattle();
  const { result, record } = recordSettledBattle(store, battle, { battleId: "camp-1", recordedAt: AT });
  assert.equal(result.status, WriteStatus.WRITTEN);
  assert.equal(result.recordId, record.recordId);
  assert.equal(store.has(record.recordId), true);
  assert.equal(store.has("tbr-0123456789abcdef01234567"), false);

  // Idempotent for the same reason the hook is: the id is the settlement.
  assert.equal(
    recordSettledBattle(store, battle, { battleId: "camp-1", recordedAt: AT }).result.status,
    WriteStatus.DUPLICATE
  );
  assert.equal(store.recordIds().length, 1);

  for (const bad of [null, undefined, {}, { write: "no" }]) {
    assert.throws(() => recordSettledBattle(bad, battle, { battleId: "camp-1" }), /needs a campaign store/);
  }
  const recorder = createCampaignRecorder({ store, battleId: "camp-1" });
  assert.throws(() => recorder.record(), /No battle is attached/);
  assert.throws(() => createCampaignRecorder({ store }), /needs a battleId/);
  assert.throws(() => createCampaignRecorder({ battleId: "camp-1" }), /needs a campaign store/);
});

/* ------------------------------------------------------------------ */
/* Versioning and migration                                            */
/* ------------------------------------------------------------------ */

test("the migration chain runs contiguously from the oldest readable schema to the current one", () => {
  const chain = describeCampaignMigrations();
  assert.equal(chain.current, CAMPAIGN_RECORD_SCHEMA_VERSION);
  assert.equal(chain.minimumSupported, MINIMUM_SUPPORTED_SCHEMA_VERSION);
  let version = MINIMUM_SUPPORTED_SCHEMA_VERSION;
  for (const step of chain.steps) {
    assert.equal(step.from, version);
    assert.equal(step.to, version + 1);
    assert.ok(step.describe.length > 0);
    version = step.to;
  }
  assert.equal(version, CAMPAIGN_RECORD_SCHEMA_VERSION);
  assert.equal(CAMPAIGN_MIGRATIONS.length, chain.steps.length);
});

test("a schema-1 record migrates forward and validates at the current schema", () => {
  const current = sampleRecord();
  const legacy = demoteToSchema1(current);
  const { record, applied, sourceSchemaVersion } = migrateCampaignRecord(legacy, { migratedAt: AT });
  assert.deepEqual(applied, ["1->2"]);
  assert.equal(sourceSchemaVersion, 1);
  assert.equal(record.schemaVersion, CAMPAIGN_RECORD_SCHEMA_VERSION);
  validateCampaignRecord(record);
  assert.equal(record.recordId, current.recordId);
  assert.deepEqual(record.outcomes, current.outcomes);
});

test("the migration says unknown rather than guessing placeholder, and keeps the pre-migration digest", () => {
  const legacy = demoteToSchema1(sampleRecord());
  const { record } = migrateCampaignRecord(legacy, { migratedAt: AT });
  assert.equal(record.provenance.ruleSet.verification, RecordedRuleSetVerification.UNKNOWN);
  assert.notEqual(record.provenance.ruleSet.verification, RecordedRuleSetVerification.PLACEHOLDER);
  assert.equal(record.provenance.ruleSet.runtimeVerified, false);
  assert.equal(record.provenance.ruleSet.id, null);
  assert.equal(record.provenance.ruleSet.buildSha256, null);
  assert.deepEqual(record.provenance.ruleSet.goldenFixtureIds, []);
  assert.deepEqual(record.provenance.migration, {
    sourceSchemaVersion: 1,
    sourceDigest: legacy.digest,
    migratedAt: AT,
    steps: ["1->2"]
  });
  assert.equal(describeCampaignRecord(record).migrated, true);
});

test("an unknown rule set is only legal on a migrated record", () => {
  const record = sampleRecord();
  const draft = mutable(record);
  draft.provenance.ruleSet = {
    id: null,
    contractVersion: null,
    verification: RecordedRuleSetVerification.UNKNOWN,
    runtimeVerified: false,
    goldenFixtureIds: [],
    buildSha256: null,
    note: "who knows"
  };
  assert.throws(() => reseal(draft), /may only be unknown on a migrated record/);
});

test("a record from a future schema is refused, naming both versions", () => {
  const future = mutable(sampleRecord());
  future.schemaVersion = CAMPAIGN_RECORD_SCHEMA_VERSION + 1;
  future.digest = computeCampaignRecordDigest(future);
  assert.throws(
    () => migrateCampaignRecord(future),
    (error) => {
      assert.ok(error instanceof CampaignSchemaVersionError);
      assert.equal(error.recordVersion, CAMPAIGN_RECORD_SCHEMA_VERSION + 1);
      assert.equal(error.supportedVersion, CAMPAIGN_RECORD_SCHEMA_VERSION);
      return true;
    }
  );
  for (const bad of [0, -1, 1.5, "2", null, undefined]) {
    const broken = mutable(sampleRecord());
    broken.schemaVersion = bad;
    assert.throws(() => migrateCampaignRecord(broken), CampaignRecordError);
  }
});

test("a schema-1 record whose digest does not match is refused rather than migrated", () => {
  const legacy = demoteToSchema1(sampleRecord());
  legacy.outcomes[0].health = legacy.outcomes[0].health + 1;
  assert.throws(() => migrateCampaignRecord(legacy), CampaignRecordIntegrityError);

  const wrongShape = demoteToSchema1(sampleRecord());
  wrongShape.provenance.somethingElse = 1;
  wrongShape.digest = computeCampaignRecordDigest(wrongShape);
  assert.throws(() => migrateCampaignRecord(wrongShape), CampaignMigrationError);
});

test("the store migrates a stored schema-1 record on read and reports that it did", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const legacy = demoteToSchema1(sampleRecord());
  backend.write(campaignKey("battle", legacy.recordId), canonicalJsonStringify(legacy));

  const result = store.readRecord(legacy.recordId);
  assert.equal(result.status, ReadStatus.OK);
  assert.equal(result.migrated, true);
  assert.equal(result.record.provenance.ruleSet.verification, RecordedRuleSetVerification.UNKNOWN);
  // Reading does not rewrite: the stored bytes are still schema 1.
  assert.equal(JSON.parse(backend.read(campaignKey("battle", legacy.recordId))).schemaVersion, 1);
});

test("the store reports a future-schema record as unsupported and leaves it exactly as it found it", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const future = mutable(sampleRecord());
  future.schemaVersion = CAMPAIGN_RECORD_SCHEMA_VERSION + 5;
  future.digest = computeCampaignRecordDigest(future);
  const key = campaignKey("battle", future.recordId);
  const text = canonicalJsonStringify(future);
  backend.write(key, text);

  const result = store.readRecord(future.recordId);
  assert.equal(result.status, ReadStatus.UNSUPPORTED);
  assert.equal(result.recordVersion, CAMPAIGN_RECORD_SCHEMA_VERSION + 5);
  assert.equal(result.record, null);
  assert.equal(backend.read(key), text, "a newer record is not rewritten");
  assert.deepEqual(store.quarantinedKeys(), [], "and not quarantined");

  const all = store.readAll();
  assert.deepEqual(all.records, []);
  assert.equal(all.unsupported.length, 1);

  assert.throws(() => store.write(sampleRecord()), CampaignSchemaVersionError);
  assert.equal(backend.read(key), text);
});

/* ------------------------------------------------------------------ */
/* The vanilla boundary                                                */
/* ------------------------------------------------------------------ */

const ALL_VANILLA_NAMES = [
  ...knownVanillaFields(),
  ...VANILLA_SAVE_CONTAINER_FIELDS,
  "spell_haste",
  "gladiator_dir",
  "character1",
  "character12"
];

test("no vanilla save field name is written anywhere by this layer", () => {
  // Every write the layer makes across a full lifecycle: a fresh write, a
  // duplicate, a corrupt read that quarantines, and the repair that follows.
  const written = [];
  const inner = createMemoryBackend();
  const spy = {
    read: (key) => inner.read(key),
    write(key, text) {
      written.push({ key, text });
      inner.write(key, text);
    },
    remove: (key) => inner.remove(key),
    keys: () => inner.keys()
  };
  const store = createCampaignStore({ backend: spy });
  const record = sampleRecord();
  store.write(record);
  store.write(record);
  inner.write(campaignKey("battle", record.recordId), '{"schemaVersion":2,"kind":"ss2-team');
  assert.equal(store.readRecord(record.recordId).status, ReadStatus.CORRUPT);
  store.write(record);

  assert.ok(written.length >= 3);
  for (const { key, text } of written) {
    assert.ok(key.startsWith(`${CAMPAIGN_NAMESPACE}:`), `${key} escaped the namespace`);
    assert.equal(isVanillaFieldName(key), false);
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue; // quarantined raw bytes; the key check above is the guarantee
    }
    assert.deepEqual(vanillaFieldNamesIn(parsed, key), []);
  }

  // And the catalogue sweep: not one vanilla name appears as a key anywhere.
  assert.deepEqual(vanillaFieldNamesIn(record), []);
  for (const name of ALL_VANILLA_NAMES) {
    assert.equal(isVanillaFieldName(name), true, `${name} should be recognised as vanilla`);
    assert.equal(
      JSON.stringify(record).includes(`"${name}":`),
      false,
      `${name} appears as a key in a produced record`
    );
  }
});

test("the screen has teeth: a record reaching for a vanilla field name is refused at every gate", () => {
  const record = sampleRecord();
  for (const name of ["hitpoints", "herolevel", "goldpieces", "character_name", "spell_haste", "character3"]) {
    const draft = mutable(record);
    draft.outcomes[0][name] = 1;
    assert.throws(() => reseal(draft), VanillaBoundaryError, `${name} should be refused`);
  }
  const stats = mutable(record);
  // The stat block is the concrete case: canonical stat names are vanilla
  // field names, which is why a battle record is not a character sheet.
  stats.outcomes[0].strength = 10;
  assert.throws(() => reseal(stats), VanillaBoundaryError);

  // Both authoring gates, named: the seal and the store's write.
  const store = createCampaignStore({ backend: createMemoryBackend() });
  const smuggled = mutable(record);
  smuggled.outcomes[0].goldpieces = 500;
  assert.throws(() => store.write(smuggled), VanillaBoundaryError);
  assert.throws(() => assertNoVanillaFieldNames({ hero: { hitpoints: 1 } }), VanillaBoundaryError);
  assert.deepEqual(
    vanillaFieldNamesIn({ outer: { goldpieces: 1, fine: [{ herolevel: 2 }] } }).map((entry) => entry.path),
    ["record.outer.goldpieces", "record.outer.fine[0].herolevel"]
  );
});

test("the screen guards authoring only: a stored record does not perish when the catalogue grows", () => {
  // The defect this test exists for. `assertNoVanillaFieldNames` used to run
  // inside `validateCampaignRecord`, which runs on every READ, against a live
  // import of `src/adapter/vanilla-fields.js` — a file that invites growth
  // ("the catalogue grows as the map is extended"). `store.js` funnels every
  // error that is not a schema-version refusal into quarantine-then-delete, so
  // adding one already-used name to that catalogue turned every stored record
  // corrupt, quarantined it, removed the live key, and reported the campaign
  // as empty. There is no restore API. It also contradicted `errors.js`, which
  // says a VanillaBoundaryError is "never recoverable and never degraded".
  const record = sampleRecord();

  // `name` is an object key in two blocks of every record this layer writes.
  // It is the concrete candidate: one additive line and it is a vanilla name.
  assert.equal(isVanillaFieldName("name"), false, "not in the catalogue today");
  assert.ok(canonicalJsonStringify(record).includes('"name":'), "but every record uses it as a key");

  // Reading must therefore not consult the catalogue at all. Validation refuses
  // a stray vanilla-named key as what it is — a schema violation — rather than
  // as a boundary violation, which is how the screen used to announce itself.
  assert.throws(() => validateCampaignRecord({ goldpieces: 1200 }), (error) => {
    assert.ok(error instanceof CampaignRecordError, "a read-path refusal is a record error");
    assert.equal(error instanceof VanillaBoundaryError, false, "the screen no longer runs on the read path");
    assert.match(error.message, /unexpected or missing fields/);
    return true;
  });

  // A stored record — current schema and migrated schema-1 alike — reads back
  // intact, is not quarantined, and is not removed.
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  store.write(record);
  const legacy = demoteToSchema1(sampleRecord({ battleId: "camp-legacy" }));
  backend.write(campaignKey("battle", legacy.recordId), canonicalJsonStringify(legacy));

  const all = store.readAll();
  assert.equal(all.records.length, 2);
  assert.deepEqual(all.corrupt, []);
  assert.deepEqual(store.quarantinedKeys(), []);
  assert.equal(backend.read(campaignKey("battle", record.recordId)), canonicalJsonStringify(record));

  // And the guarantee is not bought by weakening the write: sealing still
  // screens, so a record cannot be authored with a vanilla name in it.
  const draft = mutable(record);
  draft.outcomes[0].max_gladiators = 4;
  assert.throws(() => reseal(draft), VanillaBoundaryError);
});

test("every key is minted inside the namespace, and a foreign key cannot be addressed", () => {
  assert.equal(campaignKey("battle", "tbr-0123456789abcdef01234567"),
    `${CAMPAIGN_NAMESPACE}:battle:tbr-0123456789abcdef01234567`);
  assert.throws(() => campaignKey("gold", "x"), VanillaBoundaryError);
  assert.throws(() => campaignKey("battle"), VanillaBoundaryError);
  assert.throws(() => campaignKey("battle", "a:b"), VanillaBoundaryError, "a segment cannot forge a separator");
  for (const foreign of ["character1", "max_gladiators", "ss2_data", "hitpoints", "", CAMPAIGN_NAMESPACE]) {
    assert.throws(() => assertCampaignKey(foreign), VanillaBoundaryError);
  }
  const store = createCampaignStore({ backend: createMemoryBackend() });
  assert.throws(() => store.readRecord("not:a:token"), VanillaBoundaryError);
  assert.throws(() => store.readQuarantined(campaignKey("battle", "tbr-0123456789abcdef01234567")),
    VanillaBoundaryError);
});

test("the namespaced backend refuses a container that is the vanilla save", () => {
  // The refusal the coexistence story always needed and never had. The
  // previous test here asserted that vanilla siblings survive a write cycle —
  // which is true, and is not the risk. The risk is being handed the vanilla
  // container in the first place: `so_local.data` is flushed unconditionally
  // by `refresh_gladiators`, shares one storage quota, and has a reset branch
  // that blanks every character slot.
  const vanillaSave = {
    character1: { herolevel: 3, goldpieces: 1200, battleswon: 4 },
    character2: { herolevel: 1, goldpieces: 0 },
    max_gladiators: 4,
    char_to_load: 1
  };
  assert.throws(() => createNamespacedBackend(vanillaSave), (error) => {
    assert.ok(error instanceof VanillaBoundaryError);
    assert.match(error.message, /vanilla save field name/);
    return true;
  });
  assert.equal(
    Object.hasOwn(vanillaSave, CAMPAIGN_NAMESPACE),
    false,
    "a refused container is not even given a bucket"
  );
  assert.deepEqual(
    vanillaFieldNamesOn(vanillaSave).sort(),
    ["char_to_load", "character1", "character2", "max_gladiators"]
  );

  // One vanilla name is enough; the whole container is suspect.
  for (const name of ["ss2_data", "goldpieces", "character12", "hitpoints"]) {
    assert.throws(() => createNamespacedBackend({ [name]: 1 }), VanillaBoundaryError, name);
  }

  // And the opt-in is explicit, per call, and named for what it costs.
  const shared = { max_gladiators: 4 };
  assert.doesNotThrow(() => createNamespacedBackend(shared, { allowVanillaSiblings: true }));
  assert.equal(shared.max_gladiators, 4);
});

test("a store over a container of our own grows only by our own bytes", () => {
  // The size of the WHOLE container, before and after. The previous version of
  // this test deleted our namespace from the copy and then asserted equality,
  // so it compared the container to itself minus the only thing that changed:
  // an uncapped write into a shared host would have passed it. Here the growth
  // is measured and has to be entirely, and only, ours.
  const container = modContainer({ lastPlayed: "2026-08-30", roster: ["a", "b"] });
  const siblings = JSON.parse(JSON.stringify(container));
  const before = JSON.stringify(container);
  const beforeBytes = Buffer.byteLength(before, "utf8");

  const store = createCampaignStore({ backend: createNamespacedBackend(container) });
  const record = sampleRecord();
  store.write(record);
  store.write(record);
  store.readRecord(record.recordId);
  store.readAll();

  const afterBytes = Buffer.byteLength(JSON.stringify(container), "utf8");
  const ourBytes = Buffer.byteLength(JSON.stringify(container[CAMPAIGN_NAMESPACE]), "utf8");
  assert.ok(afterBytes > beforeBytes, "the container did grow — a store that stores costs bytes");
  // `{"ss2TeamArena":<ours>}` is the whole delta: two bytes of quotes, the
  // namespace name, a colon, and a comma separating it from what was there.
  assert.equal(
    afterBytes - beforeBytes,
    ourBytes + CAMPAIGN_NAMESPACE.length + 4,
    "every byte the container gained is a byte of ours"
  );
  assert.ok(ourBytes > 2000, "and a single 2v2 record is thousands of them, which is why there is a budget");

  for (const key of Object.keys(container)) {
    if (key === CAMPAIGN_NAMESPACE) continue;
    assert.deepEqual(container[key], siblings[key], `${key} was modified`);
  }
  assert.deepEqual(
    Object.keys(container).filter((key) => !Object.hasOwn(siblings, key)),
    [CAMPAIGN_NAMESPACE],
    "exactly one new key, and it is ours"
  );
  for (const key of Object.keys(container[CAMPAIGN_NAMESPACE])) {
    assert.ok(key.startsWith(`${CAMPAIGN_NAMESPACE}:`));
  }
  assert.equal(store.readAll().records.length, 1);
});

test("the namespaced backend refuses to replace a namespace value it did not write", () => {
  assert.throws(() => createNamespacedBackend({ [CAMPAIGN_NAMESPACE]: "already here" }), VanillaBoundaryError);
  assert.throws(() => createNamespacedBackend(null), CampaignStorageError);
  assert.throws(() => createNamespacedBackend([]), CampaignStorageError);
  const reused = { [CAMPAIGN_NAMESPACE]: { existing: "kept" } };
  createNamespacedBackend(reused);
  assert.equal(reused[CAMPAIGN_NAMESPACE].existing, "kept");
});

test("the store occupies a bounded number of bytes and refuses the write that would cross it", () => {
  const record = sampleRecord();
  const text = canonicalJsonStringify(record);
  const key = campaignKey("battle", record.recordId);
  const entryBytes = Buffer.byteLength(text, "utf8") + Buffer.byteLength(key, "utf8");

  // A campaign history is unbounded by nature and the eventual host's quota is
  // not: Flash's default is 100 KB per origin, shared with the vanilla save.
  assert.ok(entryBytes * 45 > 102400, "≈40 records is a 100 KB quota, so an uncapped history reaches it");
  assert.equal(DEFAULT_CAMPAIGN_BYTE_BUDGET, 64 * 1024);

  const backend = createMemoryBackend();
  const tight = createCampaignStore({ backend, byteBudget: entryBytes - 1 });
  assert.throws(() => tight.write(record), (error) => {
    assert.ok(error instanceof CampaignStorageError);
    assert.match(error.message, /byte budget/);
    return true;
  });
  assert.deepEqual(backend.keys(), [], "and nothing was written");

  const exact = createCampaignStore({ backend: createMemoryBackend(), byteBudget: entryBytes });
  assert.equal(exact.write(record).status, WriteStatus.WRITTEN, "the budget is inclusive");

  // A second, different record does not fit under a one-record budget.
  const second = sampleRecord({ battleId: "camp-2" });
  assert.throws(() => exact.write(second), CampaignStorageError);
  assert.equal(exact.recordIds().length, 1, "the record already stored is untouched");
  assert.equal(exact.readRecord(record.recordId).status, ReadStatus.OK);

  // Opting out is possible and deliberate; a bad budget is refused outright.
  assert.doesNotThrow(() =>
    createCampaignStore({ backend: createMemoryBackend(), byteBudget: null }).write(record));
  for (const bad of [0, -1, 1.5, "1024"]) {
    assert.throws(() => createCampaignStore({ backend: createMemoryBackend(), byteBudget: bad }),
      CampaignStorageError, String(bad));
  }
});

test("a backend that can be asked to commit is asked, and a refused commit is not reported as a written record", () => {
  const record = sampleRecord();
  const key = campaignKey("battle", record.recordId);

  const flushes = [];
  const inner = createMemoryBackend();
  const committing = {
    read: (k) => inner.read(k),
    write: (k, t) => inner.write(k, t),
    remove: (k) => inner.remove(k),
    keys: () => inner.keys(),
    flush() {
      flushes.push(inner.keys().length);
      return true;
    }
  };
  const result = createCampaignStore({ backend: committing }).write(record);
  assert.equal(result.status, WriteStatus.WRITTEN);
  assert.equal(result.flushed, true, "the commit was requested and granted");
  assert.equal(flushes.length, 1);

  // AVM1's SharedObject.flush() returns false (or "pending") on a quota
  // failure rather than throwing, and the old seam had no way to hear it: the
  // store reported `status: "written"` for a record the host never committed.
  const quotaBound = createMemoryBackend();
  const refusing = {
    read: (k) => quotaBound.read(k),
    write: (k, t) => quotaBound.write(k, t),
    remove: (k) => quotaBound.remove(k),
    keys: () => quotaBound.keys(),
    flush: () => false
  };
  const store = createCampaignStore({ backend: refusing });
  assert.throws(() => store.write(record), (error) => {
    assert.ok(error instanceof CampaignStorageError);
    assert.match(error.message, /refused to commit/);
    return true;
  });
  assert.equal(quotaBound.read(key), null, "and the uncommitted record was rolled back, not left behind");

  // A backend that throws from flush() is a refusal too, not a crash path.
  const throwing = createMemoryBackend();
  const store2 = createCampaignStore({
    backend: {
      read: (k) => throwing.read(k),
      write: (k, t) => throwing.write(k, t),
      remove: (k) => throwing.remove(k),
      keys: () => throwing.keys(),
      flush() { throw new Error("SharedObject: quota exceeded"); }
    }
  });
  assert.throws(() => store2.write(record), /refused to commit/);
  assert.equal(throwing.read(key), null);

  // flush is optional, so a backend without it still works and says so.
  const plain = createCampaignStore({ backend: createMemoryBackend() }).write(record);
  assert.equal(plain.flushed, null, "the question could not be asked, and is not answered with a guess");
  assert.throws(
    () => createCampaignStore({ backend: { ...createMemoryBackend(), flush: "yes" } }),
    CampaignStorageError
  );
});

test("the documented boundary is complete and matches the keys the code actually mints", () => {
  const boundary = describeVanillaBoundary();
  assert.equal(boundary.namespace, CAMPAIGN_NAMESPACE);
  assert.ok(boundary.ours.length >= 2);
  assert.ok(boundary.vanilla.length >= 3);
  assert.ok(boundary.rules.length >= 5);
  for (const entry of boundary.ours) {
    assert.ok(entry.path.startsWith(`${CAMPAIGN_NAMESPACE}:`));
    assert.ok(entry.holds.length > 0 && entry.writtenBy.length > 0);
  }
  for (const entry of boundary.vanilla) {
    assert.equal(entry.owner, "SS2");
    assert.ok(entry.surface.length > 0);
    assert.ok(entry.citation.length > 0);
    assert.ok(entry.note.length > 0);
  }

  // The prefix check above is what the whole test used to be, and a prefix
  // check cannot see the separator: the documented quarantine path said
  // `<recordId>.<n>` with a dot while the minter produced a colon, and the
  // test whose stated job was preventing exactly that drift passed anyway.
  // Build the documented paths from real minted keys instead.
  const recordId = "tbr-0123456789abcdef01234567";
  const documented = new Map(boundary.ours.map((entry) => [entry.path, entry]));
  assert.ok(documented.has(BATTLE_KEY_TEMPLATE) && documented.has(QUARANTINE_KEY_TEMPLATE));

  const fill = (template, values) =>
    template.replace(/<([^>]+)>/g, (whole, name) => {
      assert.ok(Object.hasOwn(values, name), `the template names an unexpected segment ${name}`);
      return values[name];
    });
  assert.equal(fill(BATTLE_KEY_TEMPLATE, { recordId }), campaignKey("battle", recordId));
  assert.equal(
    fill(QUARANTINE_KEY_TEMPLATE, { recordId, n: "3" }),
    campaignKey("quarantine", recordId, "3")
  );

  // And a quarantine key the store really minted matches the documented shape.
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const record = sampleRecord();
  backend.write(campaignKey("battle", record.recordId), "{torn");
  const minted = store.readRecord(record.recordId).quarantinedTo;
  assert.equal(minted, fill(QUARANTINE_KEY_TEMPLATE, { recordId: record.recordId, n: "1" }));
});

test("this layer imports the vanilla catalogue as evidence and nothing that can write a vanilla field", () => {
  const directory = fileURLToPath(new URL("../src/campaign/", import.meta.url));
  const files = readdirSync(directory).filter((name) => name.endsWith(".js"));
  assert.ok(files.length >= 7);
  const adapterImports = new Set();
  for (const name of files) {
    const source = readFileSync(new URL(name, new URL("../src/campaign/", import.meta.url)), "utf8");
    for (const match of source.matchAll(/from\s+"(\.\.\/adapter\/[^"]+)"/g)) adapterImports.add(match[1]);
  }
  assert.deepEqual(
    [...adapterImports],
    ["../adapter/vanilla-fields.js"],
    "the only adapter module this layer may import is the read-only field catalogue"
  );
});

/* ------------------------------------------------------------------ */
/* Integrity and recovery                                              */
/* ------------------------------------------------------------------ */

test("an absent record degrades to no campaign data", () => {
  const store = createCampaignStore({ backend: createMemoryBackend() });
  const result = store.readRecord("tbr-0123456789abcdef01234567");
  assert.equal(result.status, ReadStatus.MISSING);
  assert.equal(result.record, null);
  assert.deepEqual(store.readAll(), { records: [], corrupt: [], unsupported: [] });
  assert.deepEqual(store.recordIds(), []);
});

test("a truncated record is detected, degraded, and quarantined rather than discarded", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const record = sampleRecord();
  store.write(record);
  const key = campaignKey("battle", record.recordId);
  const torn = canonicalJsonStringify(record).slice(0, 120);
  backend.write(key, torn);

  const result = store.readRecord(record.recordId);
  assert.equal(result.status, ReadStatus.CORRUPT);
  assert.match(result.reason, /not JSON/);
  assert.ok(result.quarantinedTo);
  assert.equal(backend.read(key), null, "the live key is cleared");
  assert.equal(store.readQuarantined(result.quarantinedTo), torn, "the bytes are preserved");
  assert.equal(store.readRecord(record.recordId).status, ReadStatus.MISSING);
});

test("a bit-flipped record, a non-string value, and a misfiled record all degrade to corrupt", () => {
  const cases = [
    ["digest mismatch", (record) => {
      const broken = mutable(record);
      broken.provenance.battle.turnNumber += 1;
      return canonicalJsonStringify(broken);
    }, /digest does not match/],
    ["not text", () => ({ notAString: true }), /not text/],
    ["misfiled", () => {
      const other = sampleRecord({ battleId: "camp-elsewhere" });
      return canonicalJsonStringify(other);
    }, /identifies itself as/],
    ["structurally invalid", (record) => {
      const broken = mutable(record);
      delete broken.seats;
      return JSON.stringify(broken);
    }, /unexpected or missing fields/]
  ];
  for (const [label, corrupt, expected] of cases) {
    const backend = createMemoryBackend();
    const store = createCampaignStore({ backend });
    const record = sampleRecord();
    backend.write(campaignKey("battle", record.recordId), corrupt(record));
    const result = store.readRecord(record.recordId);
    assert.equal(result.status, ReadStatus.CORRUPT, label);
    assert.match(result.reason, expected, label);
    assert.ok(result.quarantinedTo, label);
  }
});

test("a stored null is a torn write, not an absence: it degrades to corrupt and is preserved", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const record = sampleRecord();
  const key = campaignKey("battle", record.recordId);
  backend.write(key, null);

  // The seam's read() answers `string|null`, so a stored null and an absent key
  // look identical through it — and the store used to report the first as the
  // second. That is the corrupt-reads-as-empty case: the recovery table says a
  // value that is not a string is corrupt, and a null is not a string.
  assert.equal(store.has(record.recordId), true, "the key is taken");
  const result = store.readRecord(record.recordId);
  assert.equal(result.status, ReadStatus.CORRUPT);
  assert.match(result.reason, /null, not text/);
  assert.ok(result.quarantinedTo);
  assert.equal(JSON.parse(store.readQuarantined(result.quarantinedTo)).type, "null");
  assert.equal(store.readRecord(record.recordId).status, ReadStatus.MISSING, "and now it really is absent");

  // With quarantine off it is still corrupt, and still not silently clobbered.
  const kept = createMemoryBackend();
  const noQuarantine = createCampaignStore({ backend: kept, quarantine: false });
  kept.write(key, null);
  assert.equal(noQuarantine.readRecord(record.recordId).status, ReadStatus.CORRUPT);
  assert.equal(kept.keys().includes(key), true, "nothing was moved");

  // And a write over one is a repair that keeps the evidence, not a plain write.
  const written = noQuarantine.write(record);
  assert.equal(written.status, WriteStatus.REPAIRED);
  assert.ok(written.quarantinedTo);
  assert.equal(store.has("tbr-0123456789abcdef01234567"), false, "an untaken key is still untaken");
});

test("quarantine preserves the contents of a non-text value, not the words [object Object]", () => {
  const record = sampleRecord();
  const key = campaignKey("battle", record.recordId);
  const cases = [
    ["object", { partial: "record", outcomes: [1, 2], nested: { deep: true } }],
    ["array", [1, "two", null]],
    ["number", 42],
    ["boolean", false]
  ];
  for (const [label, value] of cases) {
    const backend = createMemoryBackend();
    const store = createCampaignStore({ backend });
    backend.write(key, value);
    const result = store.readRecord(record.recordId);
    assert.equal(result.status, ReadStatus.CORRUPT, label);
    // The whole reason quarantine exists is that the original is then deleted.
    // Preserving `String(value)` deleted the evidence and kept a label for it.
    const preserved = JSON.parse(store.readQuarantined(result.quarantinedTo));
    assert.equal(preserved.nonString, true, label);
    assert.equal(preserved.type, label, label);
    assert.deepEqual(preserved.value, value, `${label} lost its contents`);
    assert.equal(backend.read(key), null, `${label} was not moved`);
  }

  // A value JSON cannot hold still leaves something better than nothing.
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const circular = { name: "loop" };
  circular.self = circular;
  backend.write(key, circular);
  const preserved = JSON.parse(store.readQuarantined(store.readRecord(record.recordId).quarantinedTo));
  assert.equal(preserved.value, null);
  assert.equal(preserved.text, "[object Object]", "the fallback is still recorded, and labelled as one");
});

test("one malformed key in our own namespace does not cost readAll every good record", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const good = sampleRecord({ battleId: "camp-1" });
  store.write(good);

  // `campaignKey()` token-checks every segment; `parseCampaignKey()` did not,
  // so it happily reported a single empty segment for this key, `recordIds()`
  // returned "" as a record id, and `readRecord` threw re-minting it —
  // contradicting "never throws for a damaged, absent, or future-schema
  // record" and losing the whole history to one bad key.
  for (const malformed of [
    `${CAMPAIGN_NAMESPACE}:battle:`,
    `${CAMPAIGN_NAMESPACE}:battle:not a token`,
    `${CAMPAIGN_NAMESPACE}:quarantine:`,
    `${CAMPAIGN_NAMESPACE}:battle:${"x".repeat(200)}`,
    `${CAMPAIGN_NAMESPACE}:battle:-leading-dash`
  ]) {
    assert.equal(parseCampaignKey(malformed), null, `${malformed} is not a key this layer could mint`);
    backend.write(malformed, "junk");
  }

  const all = store.readAll();
  assert.equal(all.records.length, 1);
  assert.equal(all.records[0].recordId, good.recordId);
  assert.deepEqual(all.corrupt, []);
  assert.deepEqual(store.recordIds(), [good.recordId]);
  assert.deepEqual(store.quarantinedKeys(), [], "and nothing foreign was adopted or moved");
});

test("a medium that refuses removes does not grow a new quarantine copy on every read", () => {
  const values = new Map();
  const backend = {
    read: (key) => (values.has(key) ? values.get(key) : null),
    write: (key, text) => values.set(key, text),
    remove() {
      throw new CampaignStorageError("read-only medium");
    },
    keys: () => [...values.keys()]
  };
  const store = createCampaignStore({ backend });
  const record = sampleRecord();
  const key = campaignKey("battle", record.recordId);
  values.set(key, "{bad");

  // Copy-then-delete caught as a unit meant the copy stayed and the delete
  // failed, so every read appended another identical copy — to the 1000-copy
  // cap, after which `store.write()` threw for that battle forever.
  for (let read = 0; read < 25; read += 1) {
    const result = store.readRecord(record.recordId);
    assert.equal(result.status, ReadStatus.CORRUPT);
    assert.match(result.quarantineFailed, /read-only medium/);
  }
  assert.equal(store.quarantinedKeys().length, 1, "one copy of one damaged record, however often it is read");
  assert.equal(backend.read(key), "{bad", "and the original is still where it was");

  // The asymmetry the read path hid: a failed quarantine degraded on read but
  // propagated out of write(). Both report it now; neither throws.
  const written = store.write(record);
  assert.equal(written.status, WriteStatus.REPAIRED);
  assert.equal(written.written, true);
  assert.match(written.quarantineFailed, /read-only medium/);
  assert.equal(written.quarantinedTo, null);
  assert.equal(store.readRecord(record.recordId).status, ReadStatus.OK, "the good record landed anyway");
});

test("one torn record does not cost the campaign the rest of its history", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const good = sampleRecord({ battleId: "camp-1" });
  store.write(good);
  // An interrupted write can only leave one torn key, because records are
  // immutable and content-addressed and there is no index to corrupt.
  const torn = sampleRecord({ battleId: "camp-2" });
  backend.write(campaignKey("battle", torn.recordId), canonicalJsonStringify(torn).slice(0, 200));

  const all = store.readAll();
  assert.equal(all.records.length, 1);
  assert.equal(all.records[0].recordId, good.recordId);
  assert.equal(all.corrupt.length, 1);
  assert.equal(all.corrupt[0].recordId, torn.recordId);
  assert.equal(store.readRecord(good.recordId).status, ReadStatus.OK, "the good record is untouched");
});

test("writing over a corrupt copy repairs it and keeps the corrupt bytes", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const record = sampleRecord();
  const key = campaignKey("battle", record.recordId);
  backend.write(key, "{ this is not json");

  const result = store.write(record);
  assert.equal(result.status, WriteStatus.REPAIRED);
  assert.equal(result.written, true);
  assert.ok(result.quarantinedTo);
  assert.equal(store.readQuarantined(result.quarantinedTo), "{ this is not json");
  assert.equal(store.readRecord(record.recordId).status, ReadStatus.OK);
});

test("quarantined copies accumulate instead of overwriting each other", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend });
  const record = sampleRecord();
  const key = campaignKey("battle", record.recordId);
  for (const text of ["{bad one", "{bad two"]) {
    backend.write(key, text);
    store.readRecord(record.recordId);
  }
  const quarantined = store.quarantinedKeys();
  assert.equal(quarantined.length, 2);
  assert.deepEqual(quarantined.map((entry) => store.readQuarantined(entry)).sort(), ["{bad one", "{bad two"]);
});

test("quarantine can be switched off, and a failing quarantine still degrades", () => {
  const backend = createMemoryBackend();
  const store = createCampaignStore({ backend, quarantine: false });
  const record = sampleRecord();
  const key = campaignKey("battle", record.recordId);
  backend.write(key, "{nope");
  assert.equal(store.readRecord(record.recordId).status, ReadStatus.CORRUPT);
  assert.equal(backend.read(key), "{nope", "nothing was moved");
  assert.deepEqual(store.quarantinedKeys(), []);

  const refusing = createCampaignStore({
    backend: {
      read: (readKey) => (readKey === key ? "{nope" : null),
      write() {
        throw new CampaignStorageError("read-only medium");
      },
      remove() {
        throw new CampaignStorageError("read-only medium");
      },
      keys: () => [key]
    }
  });
  const result = refusing.readRecord(record.recordId);
  assert.equal(result.status, ReadStatus.CORRUPT);
  assert.match(result.quarantineFailed, /read-only medium/);
});

test("a write the backend does not retain is reported as a failure, not as a success", () => {
  const dropping = {
    read: () => null,
    write() {},
    remove() {},
    keys: () => []
  };
  const store = createCampaignStore({ backend: dropping });
  assert.throws(() => store.write(sampleRecord()), /did not retain the value/);
});

test("the store refuses anything that is not a sealed, valid record", () => {
  const store = createCampaignStore({ backend: createMemoryBackend() });
  assert.throws(() => store.write({}), CampaignRecordError);
  assert.throws(() => store.write(null), CampaignRecordError);
  const unsealed = mutable(sampleRecord());
  delete unsealed.digest;
  assert.throws(() => store.write(unsealed), CampaignRecordError);
  assert.throws(() => createCampaignStore({ backend: { read: () => null } }), CampaignStorageError);
  assert.throws(() => createCampaignStore({}), CampaignStorageError);
});

test("a backend whose keys() misbehaves is refused rather than half-read", () => {
  const store = createCampaignStore({
    backend: { read: () => null, write() {}, remove() {}, keys: () => "nope" }
  });
  assert.throws(() => store.recordIds(), CampaignStorageError);
  assert.throws(() => store.has("tbr-0123456789abcdef01234567"), CampaignStorageError);
});

/* ------------------------------------------------------------------ */
/* The pieces the suite never reached                                  */
/* ------------------------------------------------------------------ */

test("the battle provenance is a real projection of the battle, value by value", () => {
  const battle = settledBattle();
  const record = buildCampaignRecord(battle, { battleId: "camp-1", recordedAt: AT });
  const provenance = record.provenance.battle;
  assert.equal(provenance.stateVersion, battle.version);
  assert.equal(provenance.seed, 7);
  assert.equal(provenance.rngCursor, battle.rngCursor);
  assert.equal(provenance.turnNumber, battle.turnNumber);
  assert.deepEqual(provenance.initiative, battle.initiative);
  assert.equal(provenance.combatStateHash, combatStateHash(battle));
  assert.match(provenance.combatStateHash, /^[a-f0-9]{8}$/);

  // The hash is the controller-independent one, so a host and a client that
  // disagree about who drove a seat still record the same value.
  const reassigned = settledBattle();
  reassignController(reassigned, "alpha:slot-1", "peer-9");
  assert.equal(combatStateHash(reassigned), provenance.combatStateHash);

  const bad = {
    stateVersion: [0, -1, 1.5, "1"],
    rngCursor: [-1, 1.5, "0"],
    turnNumber: [0, -1],
    seed: [-1, 2.5],
    combatStateHash: ["", "zzzzzzzz", "abc", "a".repeat(9)],
    initiative: [[], ["a1"], ["a1", "a1", "a2", "beta-fill-2"], ["a1", "a2", "b1", "nobody"]]
  };
  for (const [field, values] of Object.entries(bad)) {
    for (const value of values) {
      const draft = mutable(record);
      draft.provenance.battle[field] = value;
      assert.throws(() => reseal(draft), CampaignRecordError, `${field} = ${JSON.stringify(value)}`);
    }
  }
});

test("assertJsonSafe refuses what canonical JSON cannot round-trip", () => {
  assert.doesNotThrow(() => assertJsonSafe({ a: [1, "two", null, true], b: { c: -0.5 } }));

  const circular = { name: "loop" };
  circular.self = circular;
  assert.throws(() => assertJsonSafe(circular), /circular reference/);
  const sharedLeaf = { leaf: true };
  assert.doesNotThrow(
    () => assertJsonSafe({ first: sharedLeaf, second: sharedLeaf }),
    "a repeated sibling is not a cycle"
  );

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => assertJsonSafe({ value }), /non-finite number/);
  }
  const sparse = [1];
  sparse[3] = 4;
  assert.throws(() => assertJsonSafe({ sparse }), /sparse array/);
  assert.throws(() => assertJsonSafe({ f: () => 1 }), /not JSON-safe/);
  assert.throws(() => assertJsonSafe({ u: undefined }), /not JSON-safe/);
  assert.throws(() => assertJsonSafe({ big: 1n }), /not JSON-safe/);
  assert.throws(() => assertJsonSafe({ when: new Date(0) }), /non-plain object/);
  assert.throws(() => assertJsonSafe({ set: new Set([1]) }), /non-plain object/);
  assert.equal(assertJsonSafe({ ok: 1 }, "path").ok, 1, "it returns the value it accepted");
  assert.throws(() => assertJsonSafe({ f: () => 1 }, "draft"), /draft\.f is not JSON-safe/);
});

test("isCampaignRecord answers the validator's question without throwing", () => {
  const record = sampleRecord();
  assert.equal(isCampaignRecord(record), true);
  assert.equal(isCampaignRecord(JSON.parse(canonicalJsonStringify(record))), true);
  for (const candidate of [null, undefined, {}, [], "record", 7, demoteToSchema1(record)]) {
    assert.equal(isCampaignRecord(candidate), false, JSON.stringify(candidate) ?? String(candidate));
  }
  const tampered = mutable(record);
  tampered.provenance.battle.turnNumber += 1;
  assert.equal(isCampaignRecord(tampered), false, "a digest mismatch is not a record");
});

test("parseCampaignKey accepts exactly what campaignKey mints, and nothing else", () => {
  const recordId = "tbr-0123456789abcdef01234567";
  assert.deepEqual(parseCampaignKey(campaignKey("battle", recordId)), { kind: "battle", parts: [recordId] });
  assert.deepEqual(
    parseCampaignKey(campaignKey("quarantine", recordId, "7")),
    { kind: "quarantine", parts: [recordId, "7"] }
  );
  for (const foreign of [
    "character1",
    "max_gladiators",
    "ss2_data",
    "",
    CAMPAIGN_NAMESPACE,
    `${CAMPAIGN_NAMESPACE}:`,
    `${CAMPAIGN_NAMESPACE}:gold:${recordId}`,
    `${CAMPAIGN_NAMESPACE}:battle`,
    `${CAMPAIGN_NAMESPACE}:battle:`,
    `${CAMPAIGN_NAMESPACE}:battle: `,
    `other:battle:${recordId}`,
    null,
    7
  ]) {
    assert.equal(parseCampaignKey(foreign), null, String(foreign));
  }
  // The round trip that matters: anything parse accepts, mint can produce.
  const parsed = parseCampaignKey(campaignKey("quarantine", recordId, "7"));
  assert.equal(campaignKey(parsed.kind, ...parsed.parts), campaignKey("quarantine", recordId, "7"));
});

test("schemaVersionOf reads the declared version and refuses anything that is not one", () => {
  assert.equal(schemaVersionOf(sampleRecord()), CAMPAIGN_RECORD_SCHEMA_VERSION);
  assert.equal(schemaVersionOf(demoteToSchema1(sampleRecord())), 1);
  assert.equal(schemaVersionOf({ schemaVersion: 99 }), 99, "it reads, it does not judge");
  for (const bad of [null, undefined, [], "record", 7]) {
    assert.throws(() => schemaVersionOf(bad), /must be a plain object/, String(bad));
  }
  for (const bad of [0, -1, 1.5, "2", null, undefined, Number.NaN]) {
    assert.throws(() => schemaVersionOf({ schemaVersion: bad }), /must be a positive integer/, String(bad));
  }
});
