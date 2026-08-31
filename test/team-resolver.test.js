import test from "node:test";
import assert from "node:assert/strict";

import * as engine from "../src/engine.js";
import {
  acknowledgeResultAnimation,
  advanceAiTurns,
  AI_FILL_MARKER_KEYS,
  applyAction,
  applyActionWithOutcome,
  BATTLE_RESULT_ACK_TYPE,
  BATTLE_RESULT_PENDING_TYPE,
  BattleError,
  battleDiscriminatorOf,
  campaignSettlement,
  combatantById,
  combatStateHash,
  completionTokenFor,
  completionTokenMatchesOutcome,
  ControllerKind,
  controllerOf,
  createTeamBattle,
  currentCombatant,
  DEFAULT_STATS,
  defineTeamRuleSet,
  describeTeamRuleSet,
  EffectKind,
  isCampaignSettled,
  lastResolvedAction,
  legalActions,
  normaliseResourceBag,
  outcomeTokenPrefix,
  placeholderTeamRules,
  reassignController,
  replayTeamBattle,
  RESERVED_RESOURCE_NAMES,
  resourceNames,
  resourceValue,
  ResultReason,
  RngSequenceError,
  RuleSetVerification,
  SettlementError,
  TeamRuleSetError,
  rngJournal,
  toControllerState,
  toTeamWireState
} from "../src/team/index.js";
import * as resolver from "../src/team/resolver.js";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * A one-shot brute: 50 max health, 60 melee damage, 95% hit chance. Combined
 * with an explicit RNG tape this makes every knockout in these tests exact.
 */
const brute = (id, agility, overrides = {}) => ({
  id,
  name: id,
  controller: overrides.controller ?? "local",
  stats: {
    strength: 10,
    agility,
    attack: 40,
    defense: 0,
    vitality: 0,
    stamina: 5,
    magicka: 0,
    ...overrides.stats
  },
  loadout: {
    meleeDamage: 40,
    rangedDamage: 10,
    canUseRanged: false,
    canUseSpell: false,
    canHeal: false,
    ...overrides.loadout
  }
});

/** Ordered tape of `hit-roll` draws. 0 always hits, 0.99 always misses. */
const hitTape = (count, value = 0) =>
  Array.from({ length: count }, () => ({ label: "hit-roll", source: "unit", min: 0, max: 1, value }));

const melee = (actorId, targetId) => ({ actorId, type: "melee", targetId });

const ackFor = (battle) => ({
  type: BATTLE_RESULT_ACK_TYPE,
  completionToken: battle.settlement.pendingResultEvent().completionToken
});

const eventTypes = (battle) => battle.events.map((event) => event.type);

/* ------------------------------------------------------------------ */
/* One resolver for every team size                                    */
/* ------------------------------------------------------------------ */

test("the engine facade and the team seam are literally the same resolver", () => {
  assert.equal(engine.applyAction, resolver.applyAction);
  assert.equal(engine.legalActions, resolver.legalActions);
  assert.equal(engine.chooseAiAction, resolver.chooseAiAction);
  assert.equal(engine.advanceAiTurns, resolver.advanceAiTurns);
  assert.equal(engine.currentCombatant, resolver.currentCombatant);
});

test("1v1, 2v2 and 3v3 run through the same resolver and replay deterministically", () => {
  const sizes = [1, 2, 3];
  const usedRuleSets = new Set();
  for (const size of sizes) {
    const blueprint = {
      seed: 20260830 + size,
      teams: [
        {
          id: "red",
          combatants: Array.from({ length: size }, (unused, index) =>
            brute(`r${index + 1}`, 60 - index * 5, { controller: "ai" }))
        },
        {
          id: "blue",
          combatants: Array.from({ length: size }, (unused, index) =>
            brute(`b${index + 1}`, 30 - index * 5, { controller: "ai" }))
        }
      ]
    };
    const live = createTeamBattle(blueprint);
    const actions = advanceAiTurns(live, 500);
    assert.ok(live.result, `a ${size}v${size} battle must reach a result`);
    assert.ok(actions.length > 0);
    usedRuleSets.add(live.rules.id);

    const rebuilt = replayTeamBattle(blueprint, actions);
    assert.deepEqual(toTeamWireState(rebuilt), toTeamWireState(live));
    assert.equal(combatStateHash(rebuilt), combatStateHash(live));
    // Same inputs and same ordered channel => same consumed roll count.
    assert.equal(rebuilt.rngCursor, live.rngCursor);
    assert.equal(rebuilt.rngState, live.rngState);
  }
  assert.deepEqual([...usedRuleSets], [placeholderTeamRules.id]);
});

test("the resolver itself draws nothing; every roll is a labelled rule-set request", () => {
  const battle = createTeamBattle({
    seed: 11,
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "ai" }), brute("r2", 30, { controller: "ai" })] },
      { id: "blue", combatants: [brute("b1", 20, { controller: "ai" }), brute("b2", 10, { controller: "ai" })] }
    ]
  });
  advanceAiTurns(battle, 500);
  const journal = rngJournal(battle);
  const attacks = battle.events.filter((event) => event.type === "melee").length;
  assert.equal(journal.length, attacks);
  assert.equal(battle.rngCursor, journal.length);
  journal.forEach((entry, index) => {
    assert.equal(entry.sequence, index + 1);
    assert.equal(entry.label, "hit-roll");
    assert.equal(entry.source, "unit");
    assert.equal(entry.context.actionType, "melee");
  });
});

/* ------------------------------------------------------------------ */
/* Team elimination                                                    */
/* ------------------------------------------------------------------ */

test("a team is eliminated only when every one of its slots is down", () => {
  const battle = createTeamBattle({
    rngTape: hitTape(3),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30), brute("r3", 20)] },
      { id: "blue", combatants: [brute("b1", 15), brute("b2", 10), brute("b3", 5)] }
    ]
  });

  applyAction(battle, melee("r1", "b1"));
  assert.equal(combatantById(battle, "b1").alive, false);
  assert.equal(battle.result, null, "one knockout must not end a 3v3");
  assert.equal(battle.settlement.isArmed, false);

  applyAction(battle, melee("r2", "b2"));
  assert.equal(battle.result, null, "two of three down is still not elimination");
  assert.equal(battle.settlement.isArmed, false);

  applyAction(battle, melee("r3", "b3"));
  assert.deepEqual(battle.result, { winnerTeamId: "red", reason: "elimination" });
  assert.equal(battle.settlement.isArmed, true);
  assert.deepEqual(
    battle.events.filter((event) => event.type === "team-eliminated").map((event) => event.teamId),
    ["blue"]
  );
});

test("an individual knockout emits combatant-defeated and never settles the campaign", () => {
  let settlements = 0;
  const battle = createTeamBattle({
    rngTape: hitTape(1),
    onCampaignSettled: () => {
      settlements += 1;
    },
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });

  applyAction(battle, melee("r1", "b1"));

  const defeated = battle.events.filter((event) => event.type === "defeated");
  assert.equal(defeated.length, 1);
  assert.deepEqual(
    { actorId: defeated[0].actorId, targetId: defeated[0].targetId },
    { actorId: "r1", targetId: "b1" }
  );
  assert.equal(eventTypes(battle).includes("team-eliminated"), false);
  assert.equal(eventTypes(battle).includes(BATTLE_RESULT_PENDING_TYPE), false);
  assert.equal(battle.result, null);
  assert.equal(settlements, 0);
  assert.equal(isCampaignSettled(battle), false);
  assert.equal(campaignSettlement(battle), null);
});

/* ------------------------------------------------------------------ */
/* Settlement: two gates, fires once                                   */
/* ------------------------------------------------------------------ */

function eliminatedTwoOnTwo() {
  const settled = [];
  const battle = createTeamBattle({
    rngTape: hitTape(2),
    onCampaignSettled: (record) => settled.push(record),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  applyAction(battle, melee("r1", "b1"));
  applyAction(battle, melee("r2", "b2"));
  return { battle, settled };
}

test("settlement fires exactly once, and only after elimination and acknowledgement", () => {
  const { battle, settled } = eliminatedTwoOnTwo();

  // Gate 1 passed: the team is eliminated and a pending result is armed.
  assert.deepEqual(battle.result, { winnerTeamId: "red", reason: "elimination" });
  const pending = battle.events.at(-1);
  assert.equal(pending.type, BATTLE_RESULT_PENDING_TYPE);
  assert.equal(pending.status, "pending-animation");
  // The token is `<outcome>:<battle discriminator>`. The outcome half is the
  // string the token used to be in its entirety; the battle half is this
  // battle's own arm-time `combatStateHash`, and is what stops a second bout
  // between the same teams from sharing this bout's token.
  assert.equal(
    outcomeTokenPrefix({ winnerTeamId: "red", loserTeamIds: ["blue"], reason: "elimination" }),
    "team-arena:red:blue:elimination"
  );
  assert.ok(pending.completionToken.startsWith("team-arena:red:blue:elimination:"));
  assert.match(battleDiscriminatorOf(pending.completionToken), /^[0-9a-f]{8}$/);
  assert.equal(
    completionTokenMatchesOutcome(pending.completionToken, {
      winnerTeamId: "red",
      loserTeamIds: ["blue"],
      reason: "elimination"
    }),
    true
  );
  // Gate 2 not passed yet: nothing has settled.
  assert.equal(settled.length, 0);
  assert.equal(isCampaignSettled(battle), false);

  assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), true);
  assert.equal(settled.length, 1);
  assert.equal(isCampaignSettled(battle), true);
  // The settlement record's shape is unchanged: five fields, the discriminator
  // living inside the token and nowhere else.
  assert.deepEqual(settled[0], {
    winnerTeamId: "red",
    loserTeamIds: ["blue"],
    reason: "elimination",
    completionToken: pending.completionToken,
    acknowledgedToken: pending.completionToken
  });
});

test("a repeated acknowledgement cannot settle the campaign twice", () => {
  const { battle, settled } = eliminatedTwoOnTwo();
  assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), true);
  for (let repeat = 0; repeat < 5; repeat += 1) {
    assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), false);
  }
  assert.equal(settled.length, 1);
});

test("an acknowledgement before team elimination is refused", () => {
  const battle = createTeamBattle({
    rngTape: hitTape(1),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  // A perfectly well-formed token for the result this battle is heading for.
  // Gate 1 has not passed, so it is refused on the gate, not on its shape.
  const premature = {
    type: BATTLE_RESULT_ACK_TYPE,
    completionToken: completionTokenFor({
      winnerTeamId: "red",
      loserTeamIds: ["blue"],
      reason: "elimination",
      battleDiscriminator: "0123abcd"
    })
  };
  assert.throws(() => acknowledgeResultAnimation(battle, premature), SettlementError);

  // One knockout is still not elimination, so the gate stays shut.
  applyAction(battle, melee("r1", "b1"));
  assert.throws(() => acknowledgeResultAnimation(battle, premature), SettlementError);
  assert.equal(isCampaignSettled(battle), false);
});

test("an acknowledgement with the wrong token or shape is refused", () => {
  const { battle, settled } = eliminatedTwoOnTwo();
  // The mirror image of the real result, correctly shaped, still refused.
  assert.throws(
    () => acknowledgeResultAnimation(battle, {
      type: BATTLE_RESULT_ACK_TYPE,
      completionToken: completionTokenFor({
        winnerTeamId: "blue",
        loserTeamIds: ["red"],
        reason: "elimination",
        battleDiscriminator: battleDiscriminatorOf(ackFor(battle).completionToken)
      })
    }),
    SettlementError
  );
  // And the pre-discriminator token shape, which every bout used to share.
  assert.throws(
    () => acknowledgeResultAnimation(battle, {
      type: BATTLE_RESULT_ACK_TYPE,
      completionToken: "team-arena:red:blue:elimination"
    }),
    SettlementError
  );
  assert.throws(() => acknowledgeResultAnimation(battle, { type: "something-else", completionToken: "x" }), SettlementError);
  assert.throws(() => acknowledgeResultAnimation(battle, null), SettlementError);
  assert.equal(settled.length, 0);
  assert.equal(isCampaignSettled(battle), false);
});

test("a throwing campaign callback still latches; the campaign is never paid twice", () => {
  let calls = 0;
  const battle = createTeamBattle({
    rngTape: hitTape(2),
    onCampaignSettled: () => {
      calls += 1;
      throw new Error("campaign save failed");
    },
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  applyAction(battle, melee("r1", "b1"));
  applyAction(battle, melee("r2", "b2"));

  assert.throws(() => acknowledgeResultAnimation(battle, ackFor(battle)), /campaign save failed/);
  assert.equal(calls, 1);
  assert.equal(isCampaignSettled(battle), true);
  assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), false);
  assert.equal(calls, 1);
});

test("a settled battle cannot be re-armed with a different result", () => {
  const { battle } = eliminatedTwoOnTwo();
  acknowledgeResultAnimation(battle, ackFor(battle));
  assert.throws(
    // A fully valid outcome, discriminator included, so this is refused by the
    // latch rather than by the outcome's own validation.
    () => battle.settlement.arm({
      winnerTeamId: "blue",
      loserTeamIds: ["red"],
      reason: "elimination",
      battleDiscriminator: combatStateHash(battle)
    }),
    (error) => error instanceof SettlementError && /already settled/.test(error.message)
  );
});

test("a settlement cannot be armed without a battle discriminator", () => {
  const { battle } = eliminatedTwoOnTwo();
  const fresh = createTeamBattle({
    rngTape: hitTape(2),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  const outcome = { winnerTeamId: "red", loserTeamIds: ["blue"], reason: "elimination" };
  // Missing, and every shape that is not a state hash: a counter, a timestamp,
  // a random-looking string. Each of them would discriminate; none of them is
  // a function of the battle, so each would break deterministic replay.
  for (const battleDiscriminator of [undefined, null, "", "1", "2", "0123ABCD", "0123abcde", "not-a-hash"]) {
    assert.throws(
      () => fresh.settlement.arm({ ...outcome, battleDiscriminator }),
      (error) => error instanceof SettlementError && /battleDiscriminator/.test(error.message)
    );
  }
  assert.equal(fresh.settlement.isArmed, false);
  // The resolver supplies one, so the ordinary path never sees this refusal.
  assert.match(battleDiscriminatorOf(ackFor(battle).completionToken), /^[0-9a-f]{8}$/);
});

/* ------------------------------------------------------------------ */
/* Settlement: the token names one battle, not one result              */
/* ------------------------------------------------------------------ */

/**
 * One bout of a campaign: red beats blue by elimination, every time.
 *
 * `seed` and `order` are the only things that vary. Every bout has the same
 * team ids, the same winner, the same loser and the same reason — which is
 * precisely the situation the old token could not tell apart, and precisely
 * the situation the delivery target is: consecutive bouts between the same two
 * teams in one networked campaign.
 */
function redBeatsBlue({ seed = 1, order = ["b1", "b2"] } = {}) {
  const settled = [];
  const battle = createTeamBattle({
    seed,
    rngTape: hitTape(2),
    onCampaignSettled: (record) => settled.push(record),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  // r1 always acts first (agility 40), r2 second; which of blue's two they
  // fell is what `order` chooses.
  applyAction(battle, melee("r1", order[0]));
  applyAction(battle, melee("r2", order[1]));
  return { battle, settled, token: battle.settlement.pendingResultEvent().completionToken };
}

test("two independent bouts with the same teams and the same result do not share a token", () => {
  const outcome = { winnerTeamId: "red", loserTeamIds: ["blue"], reason: "elimination" };
  const bouts = [
    redBeatsBlue({ seed: 101 }),
    redBeatsBlue({ seed: 202 }),
    redBeatsBlue({ seed: 101, order: ["b2", "b1"] })
  ];

  for (const bout of bouts) {
    assert.deepEqual(bout.battle.result, { winnerTeamId: "red", reason: "elimination" });
    // Every bout agrees about the outcome...
    assert.equal(completionTokenMatchesOutcome(bout.token, outcome), true);
    assert.ok(bout.token.startsWith("team-arena:red:blue:elimination:"));
  }
  // ...and disagrees about which battle it was. Before the discriminator all
  // three of these were the single string "team-arena:red:blue:elimination".
  const tokens = bouts.map((bout) => bout.token);
  assert.equal(new Set(tokens).size, tokens.length, tokens.join(" "));
  assert.equal(new Set(tokens.map(battleDiscriminatorOf)).size, tokens.length);
});

test("bout 1's acknowledgement cannot settle bout 2", () => {
  const boutOne = redBeatsBlue({ seed: 101 });
  const boutTwo = redBeatsBlue({ seed: 202 });

  // Bout 1 settles on its own acknowledgement, as it should.
  assert.equal(
    acknowledgeResultAnimation(boutOne.battle, { type: BATTLE_RESULT_ACK_TYPE, completionToken: boutOne.token }),
    true
  );
  assert.equal(boutOne.settled.length, 1);

  // Bout 2 is armed and waiting. Bout 1's acknowledgement is the one that used
  // to settle it — same teams, same winner, same reason, therefore, until now,
  // the same token — and settle it with bout 1's result.
  assert.equal(boutTwo.battle.settlement.isArmed, true);
  assert.throws(
    () => acknowledgeResultAnimation(boutTwo.battle, {
      type: BATTLE_RESULT_ACK_TYPE,
      completionToken: boutOne.token
    }),
    (error) => error instanceof SettlementError && /does not match the armed battle result/.test(error.message)
  );
  assert.equal(boutTwo.settled.length, 0);
  assert.equal(isCampaignSettled(boutTwo.battle), false);

  // Its own acknowledgement still settles it, exactly once.
  assert.equal(
    acknowledgeResultAnimation(boutTwo.battle, { type: BATTLE_RESULT_ACK_TYPE, completionToken: boutTwo.token }),
    true
  );
  assert.equal(boutTwo.settled.length, 1);
  assert.notEqual(boutOne.settled[0].completionToken, boutTwo.settled[0].completionToken);
});

test("the token stays a pure function of the battle: a replay reproduces it exactly", () => {
  const blueprint = {
    seed: 909,
    rngTape: hitTape(2),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  };
  const actions = [melee("r1", "b1"), melee("r2", "b2")];

  const live = replayTeamBattle(blueprint, actions);
  const again = replayTeamBattle(blueprint, actions);
  const liveToken = live.settlement.pendingResultEvent().completionToken;

  // A counter or a random value would discriminate too, and would fail here.
  assert.equal(again.settlement.pendingResultEvent().completionToken, liveToken);
  assert.equal(combatStateHash(again), combatStateHash(live));
  // The discriminator is this battle's arm-time state hash, so it is not the
  // settled battle's hash — the pending event and the armed settlement land in
  // the projection after it is taken.
  assert.notEqual(battleDiscriminatorOf(liveToken), combatStateHash(live));

  // And a bout that differs only in seed differs in the token, so the token is
  // reproducible without being shared.
  const elsewhere = replayTeamBattle({ ...blueprint, seed: 910 }, actions);
  assert.notEqual(elsewhere.settlement.pendingResultEvent().completionToken, liveToken);
});

/* ------------------------------------------------------------------ */
/* AI fill                                                             */
/* ------------------------------------------------------------------ */

test("AI fill occupies empty slots through the ordinary combatant path", () => {
  const battle = createTeamBattle({
    seed: 3,
    teams: [
      { id: "red", slots: 3, combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", slots: 3, combatants: [brute("b1", 20, { controller: "ai" }), null, { fill: "ai" }] }
    ]
  });

  assert.equal(battle.teams[0].combatants.length, 3);
  assert.equal(battle.teams[1].combatants.length, 3);
  assert.deepEqual(battle.teams[0].slots.map((slot) => slot.aiFilled), [false, false, true]);
  assert.deepEqual(battle.teams[1].slots.map((slot) => slot.aiFilled), [false, true, true]);

  const supplied = battle.teams[0].combatants[0];
  const filled = battle.teams[0].combatants[2];
  // Identical shape: an AI-filled fighter is not a special kind of combatant.
  assert.deepEqual(Object.keys(supplied).sort(), Object.keys(filled).sort());
  assert.equal(controllerOf(battle, filled.id).kind, ControllerKind.AI);
  assert.equal(controllerOf(battle, supplied.id).kind, ControllerKind.LOCAL);
  assert.ok(battle.initiative.includes(filled.id));
  assert.ok(legalActions(battle, filled.id).length > 0);

  // It takes its own turn through the same resolver, not a side loop.
  applyAction(battle, melee("r1", "b1"));
  applyAction(battle, melee("r2", "blue-fill-2"));
  const taken = advanceAiTurns(battle, 500);
  assert.ok(
    taken.some((action) => action.actorId === filled.id),
    "the AI-filled slot acts through advanceAiTurns like any other AI seat"
  );
});

test("AI fill is pure: it never consumes the ordered RNG channel", () => {
  const withFill = createTeamBattle({
    seed: 9,
    teams: [
      { id: "red", slots: 3, combatants: [brute("r1", 40)] },
      { id: "blue", slots: 3, combatants: [brute("b1", 20)] }
    ]
  });
  const withoutFill = createTeamBattle({
    seed: 9,
    teams: [
      { id: "red", combatants: [brute("r1", 40)] },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });
  assert.equal(withFill.rngCursor, 0);
  assert.equal(withoutFill.rngCursor, 0);
  assert.equal(withFill.rngState, withoutFill.rngState);

  // The fill is deterministic, so two identical blueprints agree exactly.
  const twin = createTeamBattle({
    seed: 9,
    teams: [
      { id: "red", slots: 3, combatants: [brute("r1", 40)] },
      { id: "blue", slots: 3, combatants: [brute("b1", 20)] }
    ]
  });
  assert.equal(combatStateHash(twin), combatStateHash(withFill));
});

/* ------------------------------------------------------------------ */
/* Per-slot AI fill                                                    */
/* ------------------------------------------------------------------ */

/**
 * The blueprints that must not move, and the hashes they produced **before**
 * per-slot fill existed.
 *
 * These literals were not hand-written. They were read off a run of the roster
 * at the commit before this change, over the five shapes a single-template team
 * can take: implicit empty slots, `null` and `{ fill: "ai" }` markers, the two
 * string markers, a fully populated team template, and a team that supplies no
 * fighters at all. Both projections are covered — the combat hash and the
 * legacy engine one — because `src/engine.js` is a compatibility façade whose
 * historical replay and state hash the seam may not disturb.
 */
const UNCHANGED_FILL_BLUEPRINTS = [
  {
    name: "implicit empty slots",
    combat: "79952a5d",
    legacy: "ecffd39f",
    blueprint: {
      seed: 3,
      teams: [
        { id: "red", slots: 3, combatants: [brute("r1", 40)] },
        { id: "blue", slots: 3, combatants: [brute("b1", 20)] }
      ]
    }
  },
  {
    name: "null and object markers",
    combat: "b629f6a2",
    legacy: "5a573636",
    blueprint: {
      seed: 3,
      teams: [
        { id: "red", slots: 3, combatants: [brute("r1", 40), brute("r2", 30)] },
        { id: "blue", slots: 3, combatants: [brute("b1", 20, { controller: "ai" }), null, { fill: "ai" }] }
      ]
    }
  },
  {
    name: "string markers",
    combat: "fefc60d4",
    legacy: "b2dfc69d",
    blueprint: {
      seed: 5,
      teams: [
        { id: "red", slots: 3, combatants: [brute("r1", 40), "ai-fill", "empty"] },
        { id: "blue", slots: 2, combatants: [brute("b1", 20), { empty: true }] }
      ]
    }
  },
  {
    name: "a populated team template",
    combat: "8d2f19d4",
    legacy: "1529c5aa",
    blueprint: {
      seed: 7,
      teams: [
        {
          id: "red",
          slots: 3,
          combatants: [brute("r1", 40)],
          aiFill: {
            name: "Reserve",
            stats: { strength: 3, agility: 11, attack: 7, defense: 1, vitality: 2, stamina: 4, magicka: 0 },
            loadout: { meleeDamage: 6, rangedDamage: 2, canUseRanged: true },
            resources: { armourclass: 12, staminaleft: 30 },
            status: ["burning"],
            health: 9
          }
        },
        { id: "blue", slots: 3, combatants: [brute("b1", 20)] }
      ]
    }
  },
  {
    name: "a template carrying an explicit id",
    combat: "2007fba4",
    legacy: "be79738c",
    blueprint: {
      seed: 11,
      teams: [
        { id: "red", slots: 2, combatants: [brute("r1", 40)], aiFill: { id: "solo-reserve", name: "Solo" } },
        { id: "blue", slots: 2, combatants: [brute("b1", 20)], aiFill: { resources: { armourclass: 7 } } }
      ]
    }
  },
  {
    name: "a team that supplies no fighters at all",
    combat: "5b5bafa7",
    legacy: "8e29b02b",
    blueprint: {
      seed: 13,
      teams: [
        { id: "red", slots: 3, combatants: [], aiFill: { stats: { agility: 9 } } },
        { id: "blue", slots: 1, combatants: [] }
      ]
    }
  }
];

test("a single aiFill template still fills exactly as it did: the pinned hashes do not move", () => {
  for (const { name, blueprint, combat, legacy } of UNCHANGED_FILL_BLUEPRINTS) {
    assert.equal(combatStateHash(createTeamBattle(blueprint)), combat, `${name}: combat hash`);
    // The façade's historical projection, which per-slot fill must not disturb.
    assert.equal(engine.stateHash(engine.createBattle(blueprint)), legacy, `${name}: legacy engine hash`);
  }
});

test("an aiFill array addresses one template per slot", () => {
  const battle = createTeamBattle({
    seed: 3,
    teams: [
      {
        id: "red",
        slots: 3,
        combatants: [brute("r1", 40)],
        aiFill: [null, { name: "Vanguard", resources: { armourclass: 44 } }, { name: "Skirmisher", resources: { armourclass: 12 } }]
      },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });
  const [, second, third] = battle.teams[0].combatants;
  assert.equal(second.name, "Vanguard");
  assert.equal(third.name, "Skirmisher");
  // The bag the adapter could not deliver before: one per slot, both distinct.
  assert.equal(resourceValue(second, "armourclass"), 44);
  assert.equal(resourceValue(third, "armourclass"), 12);
  // Still the ordinary combatant path: same ids, same seats, same AI seat.
  assert.deepEqual(battle.teams[0].combatants.map((combatant) => combatant.id), ["r1", "red-fill-2", "red-fill-3"]);
  assert.equal(controllerOf(battle, second.id).kind, ControllerKind.AI);
});

test("an empty-slot marker's own fields are the slot's fill source", () => {
  const battle = createTeamBattle({
    seed: 3,
    teams: [
      {
        id: "red",
        slots: 3,
        combatants: [
          brute("r1", 40),
          { fill: "ai", id: "red-guard", name: "Guard", resources: { armourclass: 44 } },
          { empty: true, id: "red-scout", name: "Scout", resources: { armourclass: 12 } }
        ]
      },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });
  const [, guard, scout] = battle.teams[0].combatants;
  assert.deepEqual([guard.id, scout.id], ["red-guard", "red-scout"]);
  assert.deepEqual([guard.name, scout.name], ["Guard", "Scout"]);
  assert.deepEqual([guard.aiFilled, scout.aiFilled], [true, true]);
  assert.equal(resourceValue(guard, "armourclass"), 44);
  assert.equal(resourceValue(scout, "armourclass"), 12);
  // `fill` and `empty` select the fill; they are never combatant fields.
  assert.equal(guard.fill, undefined);
  assert.equal(scout.empty, undefined);
  assert.deepEqual([...AI_FILL_MARKER_KEYS], ["empty", "fill"]);
});

test("the nearest declaration wins, and the merge is shallow", () => {
  const battle = createTeamBattle({
    seed: 3,
    teams: [
      {
        id: "red",
        slots: 3,
        combatants: [
          brute("r1", 40),
          null,
          { fill: "ai", name: "Champion", stats: { agility: 21 } }
        ],
        aiFill: { name: "Reserve", stats: { agility: 3, strength: 9 }, resources: { armourclass: 5 } }
      },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });
  const [, plain, champion] = battle.teams[0].combatants;
  assert.equal(plain.name, "Reserve");
  assert.equal(plain.stats.agility, 3);

  // The marker overrode `name` and `stats`, and inherited `resources`.
  assert.equal(champion.name, "Champion");
  assert.equal(champion.stats.agility, 21);
  assert.equal(resourceValue(champion, "armourclass"), 5);
  // Shallow, exactly as the single-template spread always was: the marker's
  // `stats` REPLACED the template's, so `strength` fell back to the default
  // rather than merging through.
  assert.equal(plain.stats.strength, 9);
  assert.equal(champion.stats.strength, DEFAULT_STATS.strength);
});

/**
 * THE DEFECT THIS CLOSES.
 *
 * Two AI-filled slots on one team, each mirroring a different gladiator, each
 * needing its own armour pool. With one template per team there was nowhere to
 * put the second bag, so `src/adapter/battle-host.js` declared **none** on
 * either slot and reported `diagnostics.aiFillResourceGaps` — correctly,
 * because guessing which template won would have put an invented number inside
 * `combatStateHash`. The consequence it named is exercised here: a rule set's
 * write to a resource on such a slot was refused by the resolver.
 */
test("two AI-filled slots that disagree about their resources each get their own bag", () => {
  const battle = createTeamBattle({
    seed: 4,
    rules: armourFirstRules({ hit: 25 }),
    teams: [
      { id: "red", combatants: [warden("red-1", 30, { armour: { value: 0, max: 44 } }, { maxHealth: 200 })] },
      {
        id: "blue",
        slots: 2,
        combatants: [
          { fill: "ai", id: "blue-guard", resources: { armour: { value: 44, max: 44 } }, maxHealth: 30 },
          { fill: "ai", id: "blue-scout", resources: { armour: { value: 3, max: 44 } }, maxHealth: 30 }
        ]
      }
    ]
  });
  assert.deepEqual(battle.teams[1].combatants.map((combatant) => combatant.aiFilled), [true, true]);
  assert.equal(resourceValue(combatantById(battle, "blue-guard"), "armour"), 44);
  assert.equal(resourceValue(combatantById(battle, "blue-scout"), "armour"), 3);
  // Both bags are inside the hash, so two peers cannot disagree about either.
  const projected = toTeamWireState(battle).teams[1].combatants;
  assert.deepEqual(projected.map((combatant) => combatant.resources.armour.value), [44, 3]);

  // And a rule set's write to each of them is now applied rather than refused.
  applyAction(battle, strike("red-1", "blue-guard"));
  advanceAiTurns(battle, 10);
  applyAction(battle, strike("red-1", "blue-scout"));

  const guard = combatantById(battle, "blue-guard");
  const scout = combatantById(battle, "blue-scout");
  assert.equal(resourceValue(guard, "armour"), 19, "44 armour absorbed the whole hit");
  assert.equal(guard.health, 30);
  assert.equal(resourceValue(scout, "armour"), 0, "3 armour was spent");
  assert.equal(scout.health, 8, "and 22 spilled past it");
  assert.equal(combatantById(battle, "red-1").health, 150, "both AI allies took their own turn");
});

test("the three fill declarations are the same data, so identical slots still hash identically", () => {
  const template = {
    stats: { strength: 3, agility: 11, attack: 7, defense: 1, vitality: 2, stamina: 4, magicka: 0 },
    loadout: { meleeDamage: 6, rangedDamage: 2, canUseRanged: true },
    resources: { armourclass: 12, staminaleft: 30 }
  };
  const blue = { id: "blue", slots: 3, combatants: [brute("b1", 20)] };
  const viaTeamTemplate = createTeamBattle({
    seed: 7,
    teams: [{ id: "red", slots: 3, combatants: [brute("r1", 40)], aiFill: template }, blue]
  });
  const viaArray = createTeamBattle({
    seed: 7,
    teams: [{ id: "red", slots: 3, combatants: [brute("r1", 40)], aiFill: [null, template, template] }, blue]
  });
  const viaMarkers = createTeamBattle({
    seed: 7,
    teams: [
      {
        id: "red",
        slots: 3,
        combatants: [brute("r1", 40), { fill: "ai", ...template }, { empty: true, ...template }]
      },
      blue
    ]
  });
  assert.equal(combatStateHash(viaArray), combatStateHash(viaTeamTemplate));
  assert.equal(combatStateHash(viaMarkers), combatStateHash(viaTeamTemplate));
  assert.equal(engine.stateHash(engine.createBattle({
    seed: 7,
    teams: [{ id: "red", slots: 3, combatants: [brute("r1", 40)], aiFill: [null, template, template] }, blue]
  })), engine.stateHash(engine.createBattle({
    seed: 7,
    teams: [{ id: "red", slots: 3, combatants: [brute("r1", 40)], aiFill: template }, blue]
  })));
});

test("per-slot fill stays pure, serialisable and deterministic", () => {
  const blueprint = {
    seed: 9,
    teams: [
      {
        id: "red",
        slots: 3,
        combatants: [brute("r1", 40), { fill: "ai", name: "Guard", resources: { armourclass: 44 } }],
        aiFill: [null, null, { name: "Scout", resources: { armourclass: 12 } }]
      },
      { id: "blue", slots: 2, combatants: [brute("b1", 20)] }
    ]
  };
  const battle = createTeamBattle(blueprint);
  assert.equal(battle.rngCursor, 0, "the fill draws nothing");
  assert.equal(combatStateHash(createTeamBattle(blueprint)), combatStateHash(battle));

  // Why a function is refused: every accepted form survives the round trip a
  // replay, a wire transfer or a saved battle puts a blueprint through, so the
  // roster rebuilt from JSON is the roster that was hashed.
  const roundTripped = JSON.parse(JSON.stringify(blueprint));
  assert.equal(combatStateHash(createTeamBattle(roundTripped)), combatStateHash(battle));
  assert.equal(combatStateHash(replayTeamBattle(roundTripped, [])), combatStateHash(battle));
});

test("a fill declaration that could never be honoured is refused, not dropped", () => {
  const withAiFill = (aiFill, combatants = [brute("r1", 40)]) => () => createTeamBattle({
    seed: 2,
    teams: [
      { id: "red", slots: 2, combatants, aiFill },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });

  // A function cannot survive a blueprint's JSON round trip, so a replay would
  // silently build a different roster. Worse, it is not even inert today: the
  // roster read the function's own `name` and called the fighter "aiFill".
  assert.throws(withAiFill((index) => ({ name: `Reserve ${index}` })), BattleError);
  assert.throws(withAiFill(() => ({})), /aiFill may not be a function/);
  assert.throws(withAiFill(42), /Received number/);
  assert.throws(withAiFill("reserve"), /Received string/);
  assert.throws(withAiFill([{}, {}, {}]), /2 slots but supplies 3 per-slot aiFill templates/);

  // `controller` is the one key read for a supplied combatant and ignored for a
  // filled one, so it is refused on every fill route rather than dropped.
  assert.throws(withAiFill({ controller: "remote:peer" }), /A team's aiFill declares a controller/);
  assert.throws(withAiFill([null, { controller: "remote:peer" }]), /aiFill\[1\] declares a controller/);
  assert.throws(
    withAiFill(undefined, [brute("r1", 40), { fill: "ai", controller: "remote:peer" }]),
    /An empty-slot marker declares a controller/
  );
});

test("a per-slot template addressed to an occupied slot is allowed and simply unused", () => {
  // "What each seat would be if it were empty" is a legitimate declaration, and
  // is a different thing from a template addressed to a slot that cannot exist.
  const battle = createTeamBattle({
    seed: 2,
    teams: [
      {
        id: "red",
        slots: 2,
        combatants: [brute("r1", 40)],
        aiFill: [{ name: "Unused", resources: { armourclass: 99 } }, { name: "Used" }]
      },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });
  assert.deepEqual(battle.teams[0].combatants.map((combatant) => combatant.name), ["r1", "Used"]);
  assert.deepEqual(resourceNames(battle.teams[0].combatants[0]), []);
  assert.deepEqual(resourceNames(battle.teams[0].combatants[1]), []);
});

/* ------------------------------------------------------------------ */
/* Controller identity vs combatant identity                           */
/* ------------------------------------------------------------------ */

test("one team can mix local, hot-seat, remote and AI controllers", () => {
  const battle = createTeamBattle({
    seed: 5,
    teams: [
      {
        id: "red",
        slots: 3,
        combatants: [
          brute("r1", 40, { controller: "local" }),
          brute("r2", 30, { controller: "hot-seat:pad-2" }),
          null
        ]
      },
      { id: "blue", combatants: [brute("b1", 20, { controller: "peer-7f" })] }
    ]
  });
  assert.deepEqual(
    battle.teams[0].combatants.map((combatant) => controllerOf(battle, combatant.id).kind),
    [ControllerKind.LOCAL, ControllerKind.HOT_SEAT, ControllerKind.AI]
  );
  assert.equal(controllerOf(battle, "b1").kind, ControllerKind.REMOTE);
  assert.equal(controllerOf(battle, "b1").id, "peer-7f");
});

test("controller identity can be reassigned without touching combatant state or the combat hash", () => {
  const battle = createTeamBattle({
    rngTape: hitTape(4),
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "peer-7f" }), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  applyAction(battle, melee("r1", "b1"));

  const combatBefore = toTeamWireState(battle);
  const hashBefore = combatStateHash(battle);
  const seatId = combatantById(battle, "r1").seatId;

  reassignController(battle, seatId, { kind: ControllerKind.LOCAL, id: "local", label: "Player One" });

  assert.deepEqual(toTeamWireState(battle), combatBefore);
  assert.equal(combatStateHash(battle), hashBefore);
  assert.equal(controllerOf(battle, "r1").kind, ControllerKind.LOCAL);
  assert.equal(controllerOf(battle, "r1").label, "Player One");
  // Only the seat -> controller projection moved.
  assert.notDeepEqual(
    toControllerState(battle).find((entry) => entry.seatId === seatId),
    { seatId, kind: ControllerKind.REMOTE, id: "peer-7f", label: "peer-7f" }
  );
});

test("the AI loop follows the seat, not the combatant", () => {
  const battle = createTeamBattle({
    seed: 4,
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "local" })] },
      { id: "blue", combatants: [brute("b1", 20, { controller: "ai" })] }
    ]
  });
  assert.equal(currentCombatant(battle).id, "r1");
  assert.deepEqual(advanceAiTurns(battle), [], "a local seat must stop the AI loop");

  reassignController(battle, combatantById(battle, "r1").seatId, ControllerKind.AI);
  const taken = advanceAiTurns(battle, 500);
  assert.ok(taken.length > 0, "the same combatant is now AI-driven with no combatant change");
  assert.equal(taken[0].actorId, "r1");
});

test("the legacy engine hash still binds the controller string; the combat hash does not", () => {
  const blueprint = {
    seed: 8,
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "peer-7f" })] },
      { id: "blue", combatants: [brute("b1", 20, { controller: "ai" })] }
    ]
  };
  const battle = engine.createBattle(blueprint);
  const legacyBefore = engine.stateHash(battle);
  const combatBefore = combatStateHash(battle);

  reassignController(battle, combatantById(battle, "r1").seatId, "local");

  assert.equal(combatStateHash(battle), combatBefore);
  assert.notEqual(engine.stateHash(battle), legacyBefore);
  assert.equal(engine.toWireState(battle).teams[0].combatants[0].controller, "local");
});

/* ------------------------------------------------------------------ */
/* The rule-set seam                                                   */
/* ------------------------------------------------------------------ */

test("the placeholder rule set is labelled a placeholder, in code", () => {
  const descriptor = describeTeamRuleSet(placeholderTeamRules);
  assert.equal(descriptor.verification, RuleSetVerification.PLACEHOLDER);
  assert.equal(descriptor.runtimeVerified, false);
  assert.deepEqual(descriptor.goldenFixtureIds, []);
  assert.equal(descriptor.buildSha256, null);
  assert.match(descriptor.note, /not measured against the licensed SS2 build/i);

  const battle = createTeamBattle({
    teams: [{ id: "red", combatants: [brute("r1", 40)] }, { id: "blue", combatants: [brute("b1", 20)] }]
  });
  assert.equal(toTeamWireState(battle).rules.runtimeVerified, false);
  assert.equal(toTeamWireState(battle).rules.verification, RuleSetVerification.PLACEHOLDER);
});

test("a rule set cannot claim runtime verification without golden provenance", () => {
  const base = {
    id: "pretend-verified",
    actionTypes: ["strike"],
    maximumHealth: () => 10,
    legalActions: () => [],
    resolveAction: () => ({ effects: [], events: [] }),
    chooseAiAction: () => null
  };
  assert.throws(
    () => defineTeamRuleSet({
      ...base,
      verification: RuleSetVerification.RUNTIME_VERIFIED,
      provenance: { runtimeVerified: true, note: "trust me" }
    }),
    TeamRuleSetError
  );
  assert.throws(
    () => defineTeamRuleSet({
      ...base,
      verification: RuleSetVerification.RUNTIME_VERIFIED,
      provenance: { runtimeVerified: false, note: "n", buildSha256: "a".repeat(64), goldenFixtureIds: ["g"] }
    }),
    TeamRuleSetError
  );
  assert.throws(
    () => defineTeamRuleSet({
      ...base,
      verification: RuleSetVerification.PLACEHOLDER,
      provenance: { runtimeVerified: false, note: "n", goldenFixtureIds: ["golden-prisoner-normal-kill-dir6"] }
    }),
    TeamRuleSetError,
    "a placeholder must not cite goldens"
  );

  const accepted = defineTeamRuleSet({
    ...base,
    verification: RuleSetVerification.RUNTIME_VERIFIED,
    provenance: {
      kind: "licensed-observation",
      runtimeVerified: true,
      note: "Backed by promoted goldens.",
      buildSha256: "77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA",
      goldenFixtureIds: ["golden-prisoner-normal-kill-dir6"]
    }
  });
  assert.equal(describeTeamRuleSet(accepted).runtimeVerified, true);
});

test("an alternate rule set with its own vocabulary drives the same resolver unchanged", () => {
  // Stands in for a promoted SS2 rule set: different action names, different
  // roll labels, different maths. No resolver, roster, controller,
  // elimination, or settlement code changes to accept it.
  const alternate = defineTeamRuleSet({
    id: "test-alternate-vocabulary",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { kind: "test-double", runtimeVerified: false, note: "Test double. Not SS2 behaviour." },
    actionTypes: ["cleave"],
    maximumHealth: () => 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "cleave", targetId: foe.id })),
    resolveAction: (request, rolls) => {
      const swing = rolls.randomBetween("cleave-swing", 1, 6);
      return {
        effects: [{ kind: EffectKind.DAMAGE, targetId: request.targetId, amount: swing * 5 }],
        events: [{ type: "cleave", actorId: request.actorId, targetId: request.targetId, swing }]
      };
    },
    chooseAiAction: (view, actorId, options) => options[0]
  });

  const blueprint = {
    seed: 77,
    rules: alternate,
    teams: [
      { id: "red", slots: 3, combatants: [brute("r1", 40, { controller: "ai" })] },
      { id: "blue", slots: 3, combatants: [brute("b1", 20, { controller: "ai" })] }
    ]
  };
  const live = createTeamBattle(blueprint);
  const actions = advanceAiTurns(live, 500);
  assert.ok(live.result);
  assert.equal(live.rules.id, "test-alternate-vocabulary");
  assert.equal(eventTypes(live).includes("cleave"), true);
  assert.equal(eventTypes(live).includes(BATTLE_RESULT_PENDING_TYPE), true);
  assert.equal(combatantById(live, "r1").maxHealth, 30);
  assert.equal(rngJournal(live).every((entry) => entry.label === "cleave-swing"), true);

  const rebuilt = replayTeamBattle(blueprint, actions);
  assert.equal(combatStateHash(rebuilt), combatStateHash(live));

  // A 3v3 of the same rule set settles once, behind the same two gates.
  let settlements = 0;
  const bigger = createTeamBattle({
    ...blueprint,
    seed: 78,
    onCampaignSettled: () => {
      settlements += 1;
    }
  });
  advanceAiTurns(bigger, 500);
  assert.equal(settlements, 0);
  assert.equal(acknowledgeResultAnimation(bigger, ackFor(bigger)), true);
  assert.equal(acknowledgeResultAnimation(bigger, ackFor(bigger)), false);
  assert.equal(settlements, 1);
});

test("the resolver rejects malformed rule-set output", () => {
  const makeRules = (resolveAction) => defineTeamRuleSet({
    id: "test-malformed",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { kind: "test-double", runtimeVerified: false, note: "Test double." },
    actionTypes: ["poke"],
    maximumHealth: () => 20,
    legalActions: (view) => view.foes.map((foe) => ({ type: "poke", targetId: foe.id })),
    resolveAction,
    chooseAiAction: (view, actorId, options) => options[0]
  });
  const start = (resolveAction) => createTeamBattle({
    rules: makeRules(resolveAction),
    teams: [{ id: "red", combatants: [brute("r1", 40)] }, { id: "blue", combatants: [brute("b1", 20)] }]
  });

  assert.throws(
    () => applyAction(start(() => ({ effects: [{ kind: "damage", targetId: "nobody", amount: 1 }], events: [] })),
      { actorId: "r1", type: "poke", targetId: "b1" }),
    BattleError
  );
  assert.throws(
    () => applyAction(start(() => ({ effects: [], events: [{ type: "poke", sequence: 1 }] })),
      { actorId: "r1", type: "poke", targetId: "b1" }),
    TeamRuleSetError
  );
  assert.throws(
    () => applyAction(start(() => ({ effects: [{ kind: "damage", targetId: "b1", amount: -3 }], events: [] })),
      { actorId: "r1", type: "poke", targetId: "b1" }),
    TeamRuleSetError
  );
  assert.throws(
    () => applyAction(start(() => null), { actorId: "r1", type: "poke", targetId: "b1" }),
    TeamRuleSetError
  );
});

test("createTeamBattle refuses anything that is not a rule set", () => {
  const teams = [{ id: "red", combatants: [brute("r1", 40)] }, { id: "blue", combatants: [brute("b1", 20)] }];
  assert.throws(() => createTeamBattle({ teams, rules: {} }), TeamRuleSetError);
  assert.throws(() => createTeamBattle({ teams, rules: engine.classicStyleRules }), TeamRuleSetError);
  // The engine facade wraps the historical bare formula object for callers.
  assert.equal(engine.createBattle({ teams, rules: engine.classicStyleRules }).rules.id, placeholderTeamRules.id);
});

/* ------------------------------------------------------------------ */
/* The ordered RNG channel                                             */
/* ------------------------------------------------------------------ */

test("a tape-backed channel enforces label, source and bound order", () => {
  const teams = [
    { id: "red", combatants: [brute("r1", 40)] },
    { id: "blue", combatants: [brute("b1", 20)] }
  ];
  const wrongLabel = createTeamBattle({
    teams,
    rngTape: [{ label: "not-the-hit-roll", source: "unit", min: 0, max: 1, value: 0 }]
  });
  assert.throws(() => applyAction(wrongLabel, melee("r1", "b1")), RngSequenceError);

  const wrongSource = createTeamBattle({
    teams,
    rngTape: [{ label: "hit-roll", source: "randomBetween", min: 0, max: 1, value: 0 }]
  });
  assert.throws(() => applyAction(wrongSource, melee("r1", "b1")), RngSequenceError);

  const exhausted = createTeamBattle({ teams, rngTape: [] });
  assert.throws(() => applyAction(exhausted, melee("r1", "b1")), /No RNG sample remains/);
});

test("a miss recorded on the tape reproduces exactly", () => {
  const teams = [
    { id: "red", combatants: [brute("r1", 40)] },
    { id: "blue", combatants: [brute("b1", 20)] }
  ];
  const battle = createTeamBattle({ teams, rngTape: [...hitTape(1, 0.99), ...hitTape(1, 0)] });
  applyAction(battle, melee("r1", "b1"));
  assert.equal(battle.events[0].hit, false);
  assert.equal(combatantById(battle, "b1").health, 50);
  applyAction(battle, melee("b1", "r1"));
  assert.equal(battle.events[1].hit, true);
  assert.equal(battle.result.winnerTeamId, "blue");
});

/* ------------------------------------------------------------------ */
/* Legacy projection guard                                             */
/* ------------------------------------------------------------------ */

test("the legacy engine wire projection keeps its exact historical shape", () => {
  const battle = engine.createBattle({
    seed: 1,
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "client-red" })] },
      { id: "blue", combatants: [brute("b1", 20, { controller: "ai" })] }
    ]
  });
  const wire = engine.toWireState(battle);
  assert.deepEqual(Object.keys(wire), [
    "version", "seed", "rngState", "teams", "initiative", "turnCursor", "turnNumber", "result", "events"
  ]);
  assert.deepEqual(Object.keys(wire.teams[0]), ["id", "name", "combatants"]);
  assert.deepEqual(Object.keys(wire.teams[0].combatants[0]), [
    "id", "name", "teamId", "controller", "stats", "loadout", "maxHealth", "health", "alive", "status"
  ]);
  assert.equal(wire.teams[0].combatants[0].controller, "client-red");
  assert.equal(typeof engine.stateHash(battle), "string");
  assert.equal(engine.stateHash(battle).length, 8);
});

/* ------------------------------------------------------------------ */
/* Canonical resources                                                 */
/* ------------------------------------------------------------------ */

/**
 * A fighter carrying declared resources. `maxHealth` is pinned so the numbers
 * in these tests are exact.
 */
const warden = (id, agility, resources = {}, overrides = {}) => ({
  id,
  name: id,
  controller: overrides.controller ?? "local",
  stats: { strength: 10, agility, attack: 40, defense: 0, vitality: 0, stamina: 5, magicka: 0 },
  loadout: { meleeDamage: 40, rangedDamage: 10, canUseRanged: false, canUseSpell: false, canHeal: false },
  maxHealth: 30,
  resources,
  ...overrides
});

const strike = (actorId, targetId) => ({ actorId, type: "strike", targetId });

/**
 * DEMONSTRATION ONLY — invented for these tests, never measured against the
 * licensed build, and not a proposal for the SS2 rule set.
 *
 * It is deliberately shaped like vanilla's armour-first split — write the
 * armour pool down, carry only the overflow into hitpoints — because that is
 * the shape the seam has to be able to express. Testing the machinery against
 * something easier would prove nothing.
 */
const armourFirstRules = ({ id = "test-armour-first", hit = 25 } = {}) => defineTeamRuleSet({
  id,
  verification: RuleSetVerification.PLACEHOLDER,
  provenance: {
    runtimeVerified: false,
    note: "Invented to exercise the resource seam. Not measured against the licensed SS2 build."
  },
  actionTypes: ["strike"],
  maximumHealth: (combatant) => combatant.maxHealth ?? 30,
  legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
  resolveAction(request) {
    const armour = resourceValue(request.target, "armour");
    return {
      effects: [
        // Ordered and absolute: armour down first, then whatever spilled past it.
        { kind: EffectKind.RESOURCE, targetId: request.targetId, resource: "armour", to: armour - hit },
        { kind: EffectKind.DAMAGE, targetId: request.targetId, amount: Math.max(0, hit - armour) }
      ],
      events: [{
        type: "strike",
        actorId: request.actorId,
        targetId: request.targetId,
        absorbed: Math.min(armour, hit),
        damage: Math.max(0, hit - armour)
      }]
    };
  },
  chooseAiAction: (view, actorId, options) => options[0]
});

/**
 * Both fighters declare `armour`, because the rule set writes it on whoever it
 * hits and the resolver refuses to conjure a resource nobody declared. That
 * strictness is the point of constraint 2 in `src/team/resources.js`: a
 * resource that exists only on the branch one peer happened to take is a
 * desync with a delay fuse.
 */
const armouredPair = (armourclass, { rules = armourFirstRules(), redMaxHealth = 30 } = {}) =>
  createTeamBattle({
    seed: 5,
    rules,
    teams: [
      {
        id: "red",
        combatants: [warden("red-1", 30, { armour: { value: 0, max: 44 } }, { maxHealth: redMaxHealth })]
      },
      { id: "blue", combatants: [warden("blue-1", 4, { armour: { value: armourclass, max: 44 } })] }
    ]
  });

/**
 * THE DEFECT THIS WHOLE SEAM EXISTS TO FIX.
 *
 * Before resources, a rule set that needed armour had to close over a side
 * channel, and two battles that differed by 44 points of armour produced the
 * *same* `combatStateHash` and then diverged to health 30 versus 5 on the same
 * action. A hash that cannot see an input the rule set read is not a desync
 * check; it is a desync check that lies.
 */
test("two battles differing only in a resource now hash differently, before they diverge", () => {
  const armoured = armouredPair(44);
  const bare = armouredPair(0);

  // Everything else about these two battles is identical.
  assert.equal(armoured.rulesDescriptor.id, bare.rulesDescriptor.id);
  assert.equal(combatantById(armoured, "blue-1").health, combatantById(bare, "blue-1").health);

  // The hash separates them *before* the action that makes them diverge, which
  // is the only moment at which knowing is useful.
  assert.notEqual(combatStateHash(armoured), combatStateHash(bare));

  applyAction(armoured, strike("red-1", "blue-1"));
  applyAction(bare, strike("red-1", "blue-1"));

  assert.equal(combatantById(armoured, "blue-1").health, 30, "44 armour absorbed the whole hit");
  assert.equal(combatantById(bare, "blue-1").health, 5, "no armour, so all 25 reached hitpoints");
  assert.notEqual(combatStateHash(armoured), combatStateHash(bare));
});

/**
 * The structural property that makes the test above true in general rather
 * than by luck: a rule set can only read what the projection carries, so there
 * is no field it can act on that the hash does not already cover.
 */
test("every field a rule set can see is carried by the projection, so the hash covers every input", () => {
  const seenViews = [];
  const probe = defineTeamRuleSet({
    id: "test-view-probe",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { runtimeVerified: false, note: "Invented probe. Not SS2 behaviour." },
    actionTypes: ["strike"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction(request) {
      seenViews.push(request.actor, request.target, ...request.allies, ...request.foes);
      return { effects: [], events: [{ type: "strike", actorId: request.actorId }] };
    },
    chooseAiAction: (view, actorId, options) => options[0]
  });

  const battle = createTeamBattle({
    seed: 11,
    rules: probe,
    teams: [
      {
        id: "red",
        combatants: [
          warden("red-1", 30, { armour: { value: 12, max: 44 }, ammo: 5 }),
          warden("red-2", 20, { stamina: { value: 100, min: 0, max: 150 } })
        ]
      },
      { id: "blue", combatants: [warden("blue-1", 4, { armour: 44, charisma: { value: 9, min: 9, max: 9 } })] }
    ]
  });

  // The projection taken *before* the action is the state the views were built
  // from, so the two are directly comparable.
  const before = toTeamWireState(battle);
  applyAction(battle, strike("red-1", "blue-1"));

  const projections = new Map(before.teams.flatMap((team) => team.combatants).map((entry) => [entry.id, entry]));
  assert.ok(seenViews.length > 0);
  for (const view of seenViews) {
    const projection = projections.get(view.id);
    assert.ok(projection, `${view.id} was visible to the rule set but absent from the projection`);
    for (const key of Object.keys(view)) {
      assert.ok(key in projection, `${key} is visible to a rule set but is not in the projection`);
      assert.deepEqual(view[key], projection[key], `${view.id}.${key} disagrees with the projection`);
    }
  }
  // And specifically: the resources reached the rule set, and are hashed.
  assert.deepEqual(projections.get("blue-1").resources, {
    armour: { value: 44, min: 0, max: null },
    charisma: { value: 9, min: 9, max: 9 }
  });
  assert.equal(resourceValue(seenViews.find((view) => view.id === "blue-1"), "armour"), 44);
});

test("a resource battle replays deterministically at 1v1, 2v2 and 3v3", () => {
  for (const size of [1, 2, 3]) {
    const team = (prefix, baseAgility) => ({
      id: prefix,
      combatants: Array.from({ length: size }, (unused, index) =>
        warden(`${prefix}-${index + 1}`, baseAgility - index * 3, {
          armour: { value: 10 * (index + 1), max: 44 },
          stamina: { value: 100, min: 0, max: 150 }
        }, { controller: "ai" }))
    });
    const blueprint = {
      seed: 20260830 + size,
      rules: armourFirstRules(),
      teams: [team("red", 60), team("blue", 40)]
    };
    const live = createTeamBattle(blueprint);
    const actions = advanceAiTurns(live, 400);
    assert.ok(live.result, `${size}v${size} settled`);

    const rebuilt = replayTeamBattle(blueprint, actions);
    assert.deepEqual(toTeamWireState(rebuilt), toTeamWireState(live));
    assert.equal(combatStateHash(rebuilt), combatStateHash(live));
    // Resources moved during the battle, so this is not a vacuous replay.
    assert.ok(
      toTeamWireState(live).teams.flatMap((entry) => entry.combatants)
        .some((combatant) => combatant.resources.armour.value === 0)
    );
  }
});

test("a defeated fighter's armour pool is spent, not left standing", () => {
  const battle = armouredPair(44, { redMaxHealth: 200 });
  // 44 armour, 25 per hit, 30 hitpoints: the armour absorbs before hitpoints
  // move at all. Vanilla could never end a fight with the loser at zero
  // hitpoints and full armour, and now neither can the resolver.
  const trace = [];
  while (!battle.result) {
    const actor = currentCombatant(battle);
    const foeId = actor.teamId === "red" ? "blue-1" : "red-1";
    applyAction(battle, strike(actor.id, foeId));
    trace.push({
      blueArmour: combatantById(battle, "blue-1").resources.armour.value,
      blueHealth: combatantById(battle, "blue-1").health
    });
  }
  const loser = combatantById(battle, "blue-1");
  assert.equal(loser.alive, false);
  assert.equal(loser.health, 0);
  assert.equal(loser.resources.armour.value, 0, "the armour was actually spent");
  assert.equal(trace[0].blueHealth, 30);
  assert.equal(trace[0].blueArmour, 19);
});

test("a resource effect is absolute and the resolver clamps it to the declared bounds", () => {
  const overshoot = defineTeamRuleSet({
    id: "test-resource-overshoot",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { runtimeVerified: false, note: "Invented. Not SS2 behaviour." },
    actionTypes: ["strike"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction: (request) => ({
      effects: [
        { kind: EffectKind.RESOURCE, targetId: request.targetId, resource: "armour", to: -500 },
        { kind: EffectKind.RESOURCE, targetId: request.targetId, resource: "stamina", to: 99999 }
      ],
      events: [{ type: "strike", actorId: request.actorId, targetId: request.targetId }]
    }),
    chooseAiAction: (view, actorId, options) => options[0]
  });
  const battle = createTeamBattle({
    seed: 3,
    rules: overshoot,
    teams: [
      { id: "red", combatants: [warden("red-1", 30)] },
      {
        id: "blue",
        combatants: [warden("blue-1", 4, { armour: { value: 20, max: 44 }, stamina: { value: 10, max: 150 } })]
      }
    ]
  });
  applyAction(battle, strike("red-1", "blue-1"));
  const blue = combatantById(battle, "blue-1");
  assert.equal(blue.resources.armour.value, 0, "clamped to min");
  assert.equal(blue.resources.stamina.value, 150, "clamped to max");
  // A spent pool is not death. Only health decides that.
  assert.equal(blue.alive, true);
  assert.equal(blue.health, 30);
});

test("the resolver refuses a resource effect naming a resource nobody declared", () => {
  const inventive = defineTeamRuleSet({
    id: "test-undeclared-resource",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { runtimeVerified: false, note: "Invented. Not SS2 behaviour." },
    actionTypes: ["strike"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction: (request) => ({
      effects: [{ kind: EffectKind.RESOURCE, targetId: request.targetId, resource: "mana", to: 3 }],
      events: [{ type: "strike", actorId: request.actorId }]
    }),
    chooseAiAction: (view, actorId, options) => options[0]
  });
  const battle = createTeamBattle({
    seed: 3,
    rules: inventive,
    teams: [
      { id: "red", combatants: [warden("red-1", 30)] },
      { id: "blue", combatants: [warden("blue-1", 4, { armour: 44 })] }
    ]
  });
  assert.throws(
    () => applyAction(battle, strike("red-1", "blue-1")),
    (error) => error instanceof BattleError && /declared at construction/.test(error.message)
  );
});

test("a malformed resource effect is refused by the outcome contract", () => {
  const bad = (effect) => defineTeamRuleSet({
    id: "test-bad-resource-effect",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { runtimeVerified: false, note: "Invented. Not SS2 behaviour." },
    actionTypes: ["strike"],
    maximumHealth: () => 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction: () => ({ effects: [effect], events: [] }),
    chooseAiAction: (view, actorId, options) => options[0]
  });
  const run = (effect) => {
    const battle = createTeamBattle({
      seed: 1,
      rules: bad(effect),
      teams: [
        { id: "red", combatants: [warden("red-1", 30)] },
        { id: "blue", combatants: [warden("blue-1", 4, { armour: 44 })] }
      ]
    });
    applyAction(battle, strike("red-1", "blue-1"));
  };
  assert.throws(
    () => run({ kind: EffectKind.RESOURCE, targetId: "blue-1", to: 1 }),
    (error) => error instanceof TeamRuleSetError && /without a resource name/.test(error.message)
  );
  assert.throws(
    () => run({ kind: EffectKind.RESOURCE, targetId: "blue-1", resource: "armour" }),
    (error) => error instanceof TeamRuleSetError && /absolute/.test(error.message)
  );
  assert.throws(
    () => run({ kind: EffectKind.RESOURCE, targetId: "blue-1", resource: "armour", to: Number.NaN }),
    (error) => error instanceof TeamRuleSetError && /absolute/.test(error.message)
  );
});

test("resource key order is normalised, so two peers cannot hash differently for the same bag", () => {
  const build = (resources) => createTeamBattle({
    seed: 8,
    rules: armourFirstRules(),
    teams: [
      { id: "red", combatants: [warden("red-1", 30)] },
      { id: "blue", combatants: [warden("blue-1", 4, resources)] }
    ]
  });
  const forwards = build({ armour: 44, ammo: 5, stamina: 100 });
  const backwards = build({ stamina: 100, ammo: 5, armour: 44 });
  assert.deepEqual(Object.keys(combatantById(forwards, "blue-1").resources), ["ammo", "armour", "stamina"]);
  assert.equal(combatStateHash(forwards), combatStateHash(backwards));
});

test("the resource bag is typed, not a grab-bag", () => {
  // Shorthand and long form agree.
  assert.deepEqual(normaliseResourceBag({ armour: 44 }), { armour: { value: 44, min: 0, max: null } });
  assert.deepEqual(
    normaliseResourceBag({ armour: { value: 44, max: 44 } }),
    { armour: { value: 44, min: 0, max: 44 } }
  );
  // Declared out of range is clamped on the way in, exactly as `health` is.
  assert.equal(normaliseResourceBag({ armour: { value: 90, max: 44 } }).armour.value, 44);
  // Nothing declared is an empty bag, never a missing one.
  assert.deepEqual(normaliseResourceBag(undefined), {});

  const refuses = (bag, pattern) => assert.throws(
    () => normaliseResourceBag(bag),
    (error) => error instanceof BattleError && pattern.test(error.message),
    `expected ${JSON.stringify(bag)} to be refused`
  );
  refuses({ armour: "44" }, /finite number or a/);
  refuses({ armour: true }, /finite number or a/);
  refuses({ armour: { value: 4, hp: 1 } }, /unsupported keys/);
  refuses({ armour: { value: Number.POSITIVE_INFINITY } }, /finite numeric value/);
  refuses({ armour: { value: 4, max: Number.POSITIVE_INFINITY } }, /finite number or null/);
  refuses({ armour: { value: 4, min: 10, max: 5 } }, /min 10 above max 5/);
  refuses({ "not a name": 1 }, /must match/);
  refuses([1, 2], /plain object of named numbers/);
  // Reserved: the resolver already owns a combatant field of each of these
  // names and interprets it, so a resource may not shadow one.
  assert.ok(RESERVED_RESOURCE_NAMES.includes("health"));
  for (const reserved of RESERVED_RESOURCE_NAMES) {
    refuses({ [reserved]: 1 }, /is reserved/);
  }
});

test("a rule set that declares no resources is untouched: the machinery is opt-in", () => {
  const battle = createTeamBattle({
    seed: 42,
    rngTape: hitTape(4),
    teams: [
      { id: "red", combatants: [brute("r1", 40)] },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });
  assert.deepEqual(combatantById(battle, "r1").resources, {});
  assert.deepEqual(toTeamWireState(battle).teams[0].combatants[0].resources, {});
  applyAction(battle, melee("r1", "b1"));
  assert.equal(battle.rulesDescriptor.verification, RuleSetVerification.PLACEHOLDER);
  assert.deepEqual(combatantById(battle, "b1").resources, {});
});

/* ------------------------------------------------------------------ */
/* The resolved-action trace                                           */
/* ------------------------------------------------------------------ */

test("applyAction surfaces the effects it applied instead of discarding them", () => {
  const battle = armouredPair(44);
  assert.equal(lastResolvedAction(battle), null, "nothing resolved yet");

  applyAction(battle, strike("red-1", "blue-1"));
  const trace = lastResolvedAction(battle);
  assert.deepEqual(trace.effects, [
    { kind: EffectKind.RESOURCE, targetId: "blue-1", resource: "armour", to: 19 },
    { kind: EffectKind.DAMAGE, targetId: "blue-1", amount: 0 }
  ]);
  assert.deepEqual(trace.events, [
    { type: "strike", actorId: "red-1", targetId: "blue-1", absorbed: 25, damage: 0 }
  ]);
  assert.equal(trace.actorId, "red-1");
  assert.equal(trace.turn, 1);
  assert.deepEqual(trace.knockouts, []);
  // The trace is a frozen copy: reading it cannot reach live state.
  assert.throws(() => {
    trace.effects.push({});
  }, TypeError);

  // The one-call form is the same record, and `applyAction` still returns the
  // battle, so nothing that already called it has to change.
  assert.equal(applyAction(battle, strike("blue-1", "red-1")), battle);
  const second = applyActionWithOutcome(battle, strike("red-1", "blue-1"));
  assert.equal(second, lastResolvedAction(battle));
  assert.equal(second.turn, 2);
  assert.equal(second.firstEventSequence, 3);

  // It is a trace, not state: it is not projected and it is not hashed.
  assert.equal("lastResolution" in toTeamWireState(battle), false);
});

test("the trace reports the knockout the action caused", () => {
  const battle = armouredPair(0);
  applyAction(battle, strike("red-1", "blue-1"));
  applyAction(battle, strike("blue-1", "red-1"));
  const finisher = applyActionWithOutcome(battle, strike("red-1", "blue-1"));
  assert.deepEqual(finisher.knockouts, ["blue-1"]);
  assert.equal(combatantById(battle, "blue-1").alive, false);
});

/* ------------------------------------------------------------------ */
/* Starting conditions                                                 */
/* ------------------------------------------------------------------ */

test("a gladiator who enters a battle already burning keeps the condition", () => {
  const battle = createTeamBattle({
    seed: 1,
    rngTape: hitTape(4),
    teams: [
      { id: "red", combatants: [brute("r1", 40)] },
      { id: "blue", combatants: [{ ...brute("b1", 20), status: ["burning", "poison"] }] }
    ]
  });
  assert.deepEqual(combatantById(battle, "b1").status, ["burning", "poison"]);
  // It is in the view a rule set reads, and in the projection the hash covers.
  assert.deepEqual(toTeamWireState(battle).teams[1].combatants[0].status, ["burning", "poison"]);

  const clean = createTeamBattle({
    seed: 1,
    rngTape: hitTape(4),
    teams: [
      { id: "red", combatants: [brute("r1", 40)] },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });
  assert.notEqual(combatStateHash(battle), combatStateHash(clean));
});

test("a starting status list is deduplicated in order, and a malformed one is refused", () => {
  const build = (status) => createTeamBattle({
    seed: 1,
    rngTape: hitTape(4),
    teams: [
      { id: "red", combatants: [brute("r1", 40)] },
      { id: "blue", combatants: [{ ...brute("b1", 20), status }] }
    ]
  });
  assert.deepEqual(combatantById(build(["poison", "burning", "poison"]), "b1").status, ["poison", "burning"]);
  assert.deepEqual(combatantById(build([]), "b1").status, []);
  assert.deepEqual(combatantById(build(undefined), "b1").status, []);
  for (const bad of ["burning", [""], [null], [{ status: "burning" }]]) {
    assert.throws(
      () => build(bad),
      (error) => error instanceof BattleError && /array of non-empty strings/.test(error.message)
    );
  }
});

/* ------------------------------------------------------------------ */
/* Draws                                                               */
/* ------------------------------------------------------------------ */

/**
 * DECIDED: the resolver can produce a draw, and settles one through its own
 * two gates like any other result.
 *
 * The alternatives are worse in both directions. Refusing to call a mutual
 * wipe decided leaves a battle with no living combatant and `advanceTurn`
 * throwing; naming a winner would be the resolver inventing a combat rule,
 * which it is forbidden to do. So `battleStanding` stays total: every
 * reachable state has an answer, and "both teams are down" is a draw.
 *
 * That the adapter's acknowledgement bridge cannot acknowledge one is an
 * adapter defect, not a resolver one — vanilla's `death()` dispatches only
 * `combatwon`/`combatlost`, so a draw has no arena label and the bridge
 * requires an arena label. The fix belongs there: a draw's acknowledgement is
 * the completed death animations, with no arena transition.
 */
test("a drawn battle settles through the resolver's own two gates", () => {
  const settlements = [];
  const mutual = defineTeamRuleSet({
    id: "test-mutual-destruction",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { runtimeVerified: false, note: "Invented; forces the draw branch. Not SS2 behaviour." },
    actionTypes: ["strike"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction: (request) => ({
      effects: [
        { kind: EffectKind.DAMAGE, targetId: request.targetId, amount: 999 },
        { kind: EffectKind.DAMAGE, targetId: request.actorId, amount: 999 }
      ],
      events: [{ type: "strike", actorId: request.actorId, targetId: request.targetId }]
    }),
    chooseAiAction: (view, actorId, options) => options[0]
  });
  const battle = createTeamBattle({
    seed: 2,
    rules: mutual,
    teams: [
      { id: "red", combatants: [warden("red-1", 30)] },
      { id: "blue", combatants: [warden("blue-1", 4)] }
    ],
    onCampaignSettled: (record) => settlements.push(record)
  });

  applyAction(battle, strike("red-1", "blue-1"));

  assert.equal(battle.result.reason, ResultReason.DRAW);
  assert.equal(battle.result.winnerTeamId, null);
  // Both teams are eliminated and both are named as losers, so a campaign
  // record built from this can neither invent a winner nor leave a survivor.
  const pending = battle.settlement.pendingResultEvent();
  assert.deepEqual(pending.loserTeamIds, ["blue", "red"]);
  assert.equal(pending.winnerTeamId, null);
  assert.equal(eventTypes(battle).filter((type) => type === "team-eliminated").length, 2);

  assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), true);
  assert.equal(isCampaignSettled(battle), true);
  assert.equal(settlements.length, 1);
  assert.equal(campaignSettlement(battle).winnerTeamId, null);
  assert.equal(campaignSettlement(battle).reason, ResultReason.DRAW);
  // Idempotent, exactly as a decided battle is.
  assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), false);
});
