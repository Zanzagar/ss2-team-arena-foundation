/**
 * `src/team/ss2-rules.js` — the map-derived SS2 rule set.
 *
 * The golden corpus is checked against this rule set in
 * `test/ss2-golden-resolver-replay.test.js`. This file covers everything the
 * corpus cannot reach, and is explicit about which of those checks is evidence
 * and which is only self-consistency:
 *
 * - **Map-derived arithmetic with no runtime backing**: `battlevalues`, the
 *   `staminacost` table, `nextphase`'s attacker-only cost and regeneration,
 *   the forced-rest gate. Each assertion below names the offset it came from.
 *   These pin the code to the MAP. They are not evidence about the build.
 * - **Differential checks**: the armour-first split, piece destruction, the
 *   breastplate stamina join and enchantment status have ZERO golden coverage
 *   (all 22 stage `armourclass 0` and eight zero piece ids). They are checked
 *   here by running the SAME arithmetic down two paths — standalone, and
 *   through the resolver — and requiring the defender to end up in the same
 *   state. **That tests the translation, not the arithmetic**, and agreement
 *   between two paths over one module is not a measurement of anything.
 * - **Contract checks**: the seam's own rules — no undeclared resource is ever
 *   written, no event carries `sequence`/`turn`, an AI return is always a legal
 *   option.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceAiTurns,
  applyAction,
  combatantById,
  createOrderedRngChannel,
  createTeamBattle,
  currentCombatant,
  legalActions,
  reassignController,
  RngSequenceError,
  rngJournal,
  RuleSetVerification,
  TeamRuleSetError
} from "../src/team/index.js";
import { resolveSs2PhysicalAttackCandidate } from "../src/golden/ss2-attack-candidate.js";
import { SS2_BUILD_SHA256 } from "../src/golden/run-1v1-fixture.js";
import {
  ATTACK_DIRECTION_ROLL_LABEL,
  createSs2TeamRules,
  Ss2ActionType,
  SS2_ARMOUR_DVAL,
  SS2_ARMOUR_PIECES,
  SS2_FACING_LEFT,
  SS2_MAP_SOURCE_REFS,
  SS2_REQUIRED_RESOURCES,
  SS2_STATUS_FLAGS,
  ss2BattleValues,
  ss2Combatant,
  ss2TeamRules,
  VANILLA_PHASE_LABEL
} from "../src/team/ss2-rules.js";

/** A gladiator described the way a player would describe one: stats and kit. */
function gladiator(overrides = {}) {
  return {
    strength: 5,
    speed: 5,
    attack: 5,
    defence: 5,
    vitality: 3,
    stamina: 4,
    magicka: 0,
    charisma: 3,
    herolevel: 3,
    character_level: 3,
    weapon_min_damage: 3,
    weapon_max_damage: 6,
    ...overrides
  };
}

function battleOf(heroFields, villainFields, options = {}) {
  const { rules = ss2TeamRules, seed = 1, rngTape = null } = options;
  return createTeamBattle({
    seed,
    rngTape,
    rules,
    teams: [
      {
        id: "red",
        combatants: [ss2Combatant(gladiator(heroFields), { id: "hero", name: "Hero", controller: "local" })]
      },
      {
        id: "blue",
        combatants: [
          ss2Combatant(
            gladiator({ speed: 0, gladiator_dir: "left", ...villainFields }),
            { id: "villain", name: "Villain", controller: "local" }
          )
        ]
      }
    ]
  });
}

const strip = (journal) => journal.map(({ label, source, min, max, value }) => ({ label, source, min, max, value }));

/* ------------------------------------------------------------------ */
/* The tier, and what it is allowed to claim                            */
/* ------------------------------------------------------------------ */

test("the rule set is map-derived, cites its evidence, and never claims runtime verification", () => {
  const descriptor = ss2TeamRules.provenance;
  assert.equal(ss2TeamRules.verification, RuleSetVerification.MAP_DERIVED);
  assert.equal(descriptor.runtimeVerified, false);
  assert.equal(descriptor.buildSha256, SS2_BUILD_SHA256);
  assert.deepEqual(descriptor.mapSourceRefs, SS2_MAP_SOURCE_REFS);
  assert.ok(descriptor.goldenFixtureIds.length >= 1);
  assert.match(descriptor.note, /NOT runtime-verified/);
  assert.match(descriptor.note, /invented/, "the note must say which part of this rule set is invented");
});

test("the fight mode is inside the rule-set id, because the wire projection carries only the id", () => {
  // `toTeamWireState` hashes id, contractVersion, verification and
  // runtimeVerified — and nothing else about the rule set. Two peers running
  // different defeat gates would otherwise hash identically and diverge later.
  assert.equal(createSs2TeamRules({ fightMode: "tournament" }).id, "ss2-map-derived-tournament");
  assert.equal(createSs2TeamRules({ fightMode: "misc", fixtureReplay: true }).id, "ss2-map-derived-misc");
  assert.notEqual(
    createSs2TeamRules({ fightMode: "duel", fixtureReplay: true }).id,
    createSs2TeamRules({ fightMode: "tournament" }).id
  );
  assert.throws(() => createSs2TeamRules({ fightMode: "brawl" }), TeamRuleSetError);
  assert.throws(() => createSs2TeamRules({ observer: "not a function" }), TeamRuleSetError);
});

test("duel and misc are refused at CONSTRUCTION unless the caller says it is a fixture replay", () => {
  // The in-action first-blood refusal is not free: it fires after the action's
  // draws have advanced the authoritative RNG state and cursor, which the hash
  // covers and `applyAction` cannot roll back. So the mode that can reach it is
  // gated where the gate costs nothing.
  for (const fightMode of ["duel", "misc"]) {
    assert.throws(
      () => createSs2TeamRules({ fightMode }),
      (error) => error instanceof TeamRuleSetError && /fixtureReplay/.test(error.message),
      fightMode
    );
    assert.ok(createSs2TeamRules({ fightMode, fixtureReplay: true }));
  }
  assert.ok(createSs2TeamRules({ fightMode: "tournament" }), "play needs no opt-in");
});

test("a battle that cannot change state is refused at construction", () => {
  // staminamax <= 0 makes the forced-rest gate the only legal action and rest
  // a total no-op: zero effects, zero rolls, no result, forever.
  const source = ss2Combatant(gladiator(), { id: "hero", name: "Hero" });
  source.resources.staminamax = 0;
  assert.throws(
    () => createTeamBattle({
      rules: ss2TeamRules,
      teams: [
        { id: "red", combatants: [source] },
        { id: "blue", combatants: [ss2Combatant(gladiator(), { id: "villain", name: "Villain" })] }
      ]
    }),
    (error) => error instanceof TeamRuleSetError && /fixpoint/.test(error.message)
  );
});

test("the vocabulary is three melee verbs and a rest, hyphenated to satisfy the token grammar", () => {
  assert.deepEqual([...ss2TeamRules.actionTypes].sort(), [
    "normal-attack",
    "power-attack",
    "quick-attack",
    "rest"
  ]);
  for (const type of ss2TeamRules.actionTypes) {
    assert.match(type, /^[a-z0-9][a-z0-9-]{0,63}$/, "actionTypes tokens reject vanilla's underscores");
    assert.match(VANILLA_PHASE_LABEL[type], /^[a-z_]+$/, "every token maps back to a getphase label");
  }
});

/* ------------------------------------------------------------------ */
/* `battlevalues` — the build's own derivations                         */
/* ------------------------------------------------------------------ */

test("ss2BattleValues reproduces the unconditional derivations, offsets named in the source", () => {
  const derived = ss2BattleValues({
    strength: 7, speed: 6, vitality: 4, stamina: 3, herolevel: 5,
    weapon_min_damage: 4, weapon_max_damage: 9,
    secondary_weapon_min_damage: 2, secondary_weapon_max_damage: 5,
    breastplate: 2, helmet: 3, shinguard: 1, greaves: 1,
    shoulderguard: 1, gauntlet: 1, boot: 1, shield: 2
  });
  assert.equal(derived.physical_size, 80 + Math.round(7 / 1.5));          // +0x30f1
  assert.equal(derived.min_damage, Math.round(7 * 2) + 4);                 // +0x3356
  assert.equal(derived.max_damage, Math.round(7 * 2) + 9);                 // +0x3386
  assert.equal(derived.secondary_min_damage, Math.round(7 * 1) + 2);       // +0x33b6
  assert.equal(derived.secondary_max_damage, Math.round(7 * 1) + 5);       // +0x33e6
  assert.equal(derived.hitpointsmax, 5 * 10 + 4 * 20);                     // +0x378e
  assert.equal(derived.staminamax, 100 + 3 * 10);                          // +0x37b6
  assert.equal(derived.movement_speed, Math.max(4, Math.min(60, Math.round(6 * 1.5)))); // +0x37d2

  for (const piece of SS2_ARMOUR_PIECES) {
    if (piece === "helmet" || piece === "shield") continue;
    assert.equal(
      derived[`${piece}_defence`],
      Math.round(derived[piece] * SS2_ARMOUR_DVAL[piece]),
      `${piece}_defence`
    );
  }
  // The out-of-battle block: armourclass_max is summed only when
  // `_global.battle_started` is false (`+0x3ac3`), and armourclass follows it.
  const sum = SS2_ARMOUR_PIECES.reduce((total, piece) => total + derived[`${piece}_defence`], 0);
  assert.equal(derived.armourclass_max, sum);
  assert.equal(derived.armourclass, sum);
  assert.equal(derived.hitpoints, derived.hitpointsmax);
});

test("helmet_defence is branched at id 25, and shield_defence is flat zero in bow mode", () => {
  // `+0x34eb` above 25, `+0x34bf` at or below; `+0x3623` for the bow branch.
  const low = ss2BattleValues({ helmet: 25, herolevel: 8 });
  const high = ss2BattleValues({ helmet: 26, herolevel: 8 });
  assert.equal(low.helmet_defence, Math.round(25 * SS2_ARMOUR_DVAL.helmet));
  assert.equal(high.helmet_defence, Math.round(8 * 0.5 * SS2_ARMOUR_DVAL.helmet));

  const onFoot = ss2BattleValues({ shield: 3 });
  const withBow = ss2BattleValues({ shield: 3, using_bow: true });
  assert.equal(onFoot.shield_defence, Math.round(3 * SS2_ARMOUR_DVAL.shield));
  assert.equal(withBow.shield_defence, 0);
});

test("bow mode OVERWRITES the primary damage pair with the secondary one", () => {
  // `+0x3416`. The secondary pair carries `round(strength * 1)`, not `* 2`, so
  // a bow swap silently rescales every damage row in the direction dispatcher.
  const withBow = ss2BattleValues({
    strength: 10, using_bow: true,
    weapon_min_damage: 4, weapon_max_damage: 9,
    secondary_weapon_min_damage: 1, secondary_weapon_max_damage: 2
  });
  assert.equal(withBow.min_damage, Math.round(10 * 1) + 1);
  assert.equal(withBow.max_damage, Math.round(10 * 1) + 2);
});

test("the in-battle call skips the block the build skips", () => {
  // `+0x3a90` reads `_global.battle_started` and jumps 360 bytes past the
  // hitpoint refill, the armourclass_max sum and the stamina refill.
  const inBattle = ss2BattleValues({ helmet: 2, hitpoints: 5, staminaleft: 1 }, { battleStarted: true });
  assert.equal(inBattle.hitpoints, 5, "a staged hitpoints survives an in-battle call");
  assert.equal(inBattle.armourclass_max, undefined, "armourclass_max is summed only out of battle");
  assert.ok(Number.isFinite(inBattle.helmet_defence), "the per-piece defences are still unconditional");
});

/* ------------------------------------------------------------------ */
/* Construction refuses an under-specified gladiator                    */
/* ------------------------------------------------------------------ */

test("a combatant missing an SS2 resource is refused when the battle is BUILT, not on the first blow", () => {
  for (const missing of SS2_REQUIRED_RESOURCES) {
    const source = ss2Combatant(gladiator(), { id: "hero", name: "Hero" });
    delete source.resources[missing];
    assert.throws(
      () => createTeamBattle({
        rules: ss2TeamRules,
        teams: [
          { id: "red", combatants: [source] },
          { id: "blue", combatants: [ss2Combatant(gladiator(), { id: "villain", name: "Villain" })] }
        ]
      }),
      (error) => error instanceof TeamRuleSetError && error.message.includes(missing),
      `omitting ${missing} must be refused by name`
    );
  }
});

test("deriving over a record that already states a measured number is refused", () => {
  // `battlevalues` overwrites min_damage/max_damage/hitpointsmax/staminamax
  // unconditionally, so `ss2Combatant(golden.scenario.hero)` would replace the
  // corpus's measured 21/23/30/110 with a computed 20/20/10/100. `derive` was
  // a convention until a verifier pointed out that nothing enforced it.
  const measured = { strength: 10, attack: 1, defence: 1, min_damage: 21, max_damage: 23, hitpointsmax: 30, staminamax: 110, staminaleft: 105, hitpoints: 30 };
  assert.throws(
    () => ss2Combatant(measured, { id: "hero" }),
    (error) => error instanceof TeamRuleSetError && /min_damage/.test(error.message)
  );
  const kept = ss2Combatant(measured, { id: "hero", derive: false });
  assert.equal(kept.resources.min_damage, 21);
  assert.equal(kept.resources.max_damage, 23);
  assert.equal(kept.maxHealth, 30);
});

test("a declared maxHealth is returned verbatim; the battlevalues formula is only a fallback", () => {
  // `battle-host.js` throws outright when a rule set derives a maximum health
  // that disagrees with a vanilla gladiator's staged `hitpointsmax`, because
  // that number is licensed evidence and the formula is rule-set work.
  const source = ss2Combatant(gladiator({ herolevel: 3, vitality: 3 }), { id: "hero" });
  assert.equal(source.maxHealth, 3 * 10 + 3 * 20);
  assert.equal(ss2TeamRules.maximumHealth({ ...source, maxHealth: 999 }), 999);

  const derivedOnly = { ...source, maxHealth: undefined };
  assert.equal(ss2TeamRules.maximumHealth(derivedOnly), 3 * 10 + 3 * 20);

  const noHerolevel = { ...source, maxHealth: undefined, resources: { ...source.resources } };
  delete noHerolevel.resources.herolevel;
  assert.throws(() => ss2TeamRules.maximumHealth(noHerolevel), TeamRuleSetError);
});

/* ------------------------------------------------------------------ */
/* Legality: one gate, and it is the build's                            */
/* ------------------------------------------------------------------ */

test("at zero stamina the only action is rest, exactly as overlay frame 1 forces it", () => {
  // `+0x0d2e`-`+0x0d48`: `staminaleft <= 0` forces `getphase("rest")` before
  // any player choice.
  const battle = battleOf({ stamina: 0 }, {});
  combatantById(battle, "hero").resources.staminaleft.value = 0;
  assert.deepEqual(legalActions(battle), [{ type: Ss2ActionType.REST, targetId: "hero" }]);
});

test("there is NO affordability gate: the build never refuses an attack for lack of stamina", () => {
  // `nextphase` subtracts the cost and `check_stats` floors at zero (`+0x114b`).
  // An "you cannot afford this" gate would be a playability affordance wearing
  // measured clothes, so it is deliberately absent.
  const battle = battleOf({ strength: 20 }, {});
  combatantById(battle, "hero").resources.staminaleft.value = 1;
  const options = legalActions(battle).map((option) => option.type);
  assert.deepEqual(options, ["quick-attack", "normal-attack", "power-attack", "rest"]);
});

test("every living foe gets all three melee verbs, and rest targets the actor", () => {
  const battle = battleOf({}, {});
  const options = legalActions(battle);
  assert.equal(options.filter((option) => option.targetId === "villain").length, 3);
  assert.deepEqual(options.at(-1), { type: Ss2ActionType.REST, targetId: "hero" });
});

/* ------------------------------------------------------------------ */
/* The direction is DRAWN, not chosen                                   */
/* ------------------------------------------------------------------ */

test("each verb draws its direction from the build's own band, before anything else", () => {
  // `randomBetween(1, 4)` `+0x635c`, `(5, 8)` `+0x61f1`, `(9, 12)` `+0x608a`,
  // each assigned before the branch's own `checkattackroll()` call.
  const bands = {
    [Ss2ActionType.QUICK_ATTACK]: [1, 4],
    [Ss2ActionType.NORMAL_ATTACK]: [5, 8],
    [Ss2ActionType.POWER_ATTACK]: [9, 12]
  };
  for (const [type, [low, high]] of Object.entries(bands)) {
    const battle = battleOf({}, {}, { seed: 11 });
    applyAction(battle, { actorId: "hero", type, targetId: "villain" });
    const first = rngJournal(battle)[0];
    assert.equal(first.label, ATTACK_DIRECTION_ROLL_LABEL, type);
    assert.equal(first.source, "randomBetween", type);
    assert.deepEqual([first.min, first.max], [low, high], type);
    const event = battle.lastResolution.events[0];
    assert.ok(event.attackDirection >= low && event.attackDirection <= high, type);
  }
});

test("the player cannot pick a direction: it is not an action type and not a spellKind", () => {
  const battle = battleOf({}, {});
  assert.throws(
    () => applyAction(battle, { actorId: "hero", type: "normal-7", targetId: "villain" }),
    /Illegal action/
  );
  assert.throws(
    () => applyAction(battle, { actorId: "hero", type: Ss2ActionType.NORMAL_ATTACK, targetId: "villain", spellKind: 7 }),
    /Illegal action/
  );
});

/* ------------------------------------------------------------------ */
/* The stamina economy                                                  */
/* ------------------------------------------------------------------ */

test("rest gains the negative staminacost, the branch's own bonus, and the per-turn baseline", () => {
  // `staminacost = 0 - round(stamina * 15)` `+0x5163` (a GAIN, because
  // `nextphase` spends by subtraction), the rest branch's own
  // `staminaleft += stamina` `+0x521d`, and `nextphase`'s
  // `+= 1 + round(stamina / 3)` `+0x32c9`.
  const stamina = 4;
  const battle = battleOf({ stamina }, {});
  const hero = combatantById(battle, "hero");
  hero.resources.staminaleft.value = 10;
  hero.health = 5;

  applyAction(battle, { actorId: "hero", type: Ss2ActionType.REST, targetId: "hero" });
  const gain = Math.round(stamina * 15) + stamina + 1 + Math.round(stamina / 3);
  assert.equal(gain, 60 + 4 + 1 + 1, "pinned to a literal as well as to the formula");
  assert.equal(hero.resources.staminaleft.value, Math.min(100 + stamina * 10, 10 + gain));

  // BOTH hitpoint terms: the rest branch's own `3 + ceil(stamina)` at
  // `+0x51d5`, inside the same `attacker.struck == null` guard as the
  // `+0x521d` stamina write, PLUS `nextphase`'s `1 + ceil(stamina / 2)` at
  // `+0x3305`.
  //
  // This assertion previously read `5 + 1 + ceil(stamina/2)`, on a comment
  // claiming `+0x684c` (taunt) was the only site for `3 + ceil(stamina)`. The
  // battle map's prose said otherwise and was right; the map's own WRITERS
  // TABLE lists only `+0x684c`, which is how a reader who trusts tables over
  // prose loses it. The bytes were then read directly.
  const healed = 3 + Math.ceil(stamina) + 1 + Math.ceil(stamina / 2);
  assert.equal(healed, 3 + 4 + 1 + 2, "pinned to a literal as well as to the formula");
  assert.equal(hero.health, 5 + healed);
  assert.equal(battle.lastResolution.events[0].healed, healed);
  assert.equal(rngJournal(battle).length, 0, "the rest branch draws nothing");
});

test("rest clamps at staminamax and at maxHealth rather than overshooting", () => {
  const battle = battleOf({ stamina: 9 }, {});
  const hero = combatantById(battle, "hero");
  applyAction(battle, { actorId: "hero", type: Ss2ActionType.REST, targetId: "hero" });
  assert.equal(hero.resources.staminaleft.value, hero.resources.staminamax.value);
  assert.equal(hero.health, hero.maxHealth);
  assert.equal(battle.lastResolution.events[0].healed, 0, "a fighter at full health reports no heal");
});

test("an attack spends round(strength * factor) and regenerates, attacker-only", () => {
  // `quick_attack` `+0x6317` = round(strength), `normal_attack` `+0x61a3` =
  // round(strength * 2), `power_attack` `+0x603c` = round(strength * 3).
  const factors = {
    [Ss2ActionType.QUICK_ATTACK]: 1,
    [Ss2ActionType.NORMAL_ATTACK]: 2,
    [Ss2ActionType.POWER_ATTACK]: 3
  };
  const strength = 6;
  const stamina = 4;
  for (const [type, factor] of Object.entries(factors)) {
    const battle = battleOf({ strength, stamina }, { vitality: 40 }, { seed: 5 });
    const hero = combatantById(battle, "hero");
    const villain = combatantById(battle, "villain");
    const staminaBefore = hero.resources.staminaleft.value;
    const villainStaminaBefore = villain.resources.staminaleft.value;
    applyAction(battle, { actorId: "hero", type, targetId: "villain" });

    const expected = Math.max(0, Math.min(
      hero.resources.staminamax.value,
      staminaBefore - Math.round(strength * factor) + 1 + Math.round(stamina / 3)
    ));
    assert.equal(hero.resources.staminaleft.value, expected, type);
    assert.equal(battle.lastResolution.events[0].staminaSpent, Math.round(strength * factor), type);
    // `nextphase` `+0x32a1`-`+0x3304` has no `game_defender` counterpart.
    assert.equal(villain.resources.staminaleft.value, villainStaminaBefore, `${type}: defender untouched`);
  }
});

test("the regeneration ROUNDS stamina/3, and a stat where round differs from floor proves it", () => {
  // `+0x32c9` is `Math.round`. With stamina 4 (this file's default gladiator)
  // round and floor agree, so `round -> floor` passed the whole suite. stamina
  // 2 separates them: round(2/3) is 1, floor(2/3) is 0.
  const battle = battleOf({ strength: 6, stamina: 2 }, { vitality: 40 }, { seed: 5 });
  const hero = combatantById(battle, "hero");
  hero.resources.staminaleft.value = 50;
  applyAction(battle, { actorId: "hero", type: Ss2ActionType.QUICK_ATTACK, targetId: "villain" });
  assert.equal(hero.resources.staminaleft.value, 50 - 6 + 1 + 1, "50 - round(6) + 1 + round(2/3)");
});

test("the spend and the regeneration are combined before ONE clamp, as the build has them", () => {
  // The two statements are consecutive and unbranched with no clamp between,
  // so flooring the spend at zero and then adding the baseline would produce a
  // different number: 1 - 20 + 1 is 0, not 1.
  const battle = battleOf({ strength: 20, stamina: 0 }, {}, { seed: 3 });
  const hero = combatantById(battle, "hero");
  hero.resources.staminaleft.value = 1;
  applyAction(battle, { actorId: "hero", type: Ss2ActionType.NORMAL_ATTACK, targetId: "villain" });
  assert.equal(hero.resources.staminaleft.value, 0);
});

/* ------------------------------------------------------------------ */
/* Differential: the effect translation, on cases no golden covers      */
/* ------------------------------------------------------------------ */

/**
 * Runs one attack down both paths on the same ordered samples and returns the
 * standalone arithmetic's mutated scenario alongside the battle.
 *
 * NOT EVIDENCE ABOUT THE BUILD. Both paths call the same module, so agreement
 * says only that the rule set's translation into effects, and the resolver's
 * application of them, preserve what the arithmetic decided. The build has
 * never been observed doing any of this with armour on.
 */
function bothPaths({ heroFields, villainFields, type, seed }) {
  const heroVanilla = ss2BattleValues(gladiator(heroFields));
  const villainVanilla = ss2BattleValues(gladiator({ speed: 0, gladiator_dir: "left", ...villainFields }));
  // Unsaturated, so a dropped write is visible. Measured: with the defender at
  // full stamina the breastplate join clamps to staminamax and writes nothing,
  // which made "drop the defender's staminaleft write" pass the whole suite.
  villainVanilla.staminaleft = villainVanilla.staminamax - 20;

  // Take the tape from a seeded standalone run, so no sample is hand-authored.
  const probeChannel = createOrderedRngChannel({ seed });
  const probe = probeChannel.withContext({ path: "standalone-probe" });
  const bands = {
    [Ss2ActionType.QUICK_ATTACK]: [1, 4],
    [Ss2ActionType.NORMAL_ATTACK]: [5, 8],
    [Ss2ActionType.POWER_ATTACK]: [9, 12]
  };
  const [low, high] = bands[type];
  const attackDirection = probe.randomBetween(ATTACK_DIRECTION_ROLL_LABEL, low, high);
  const scenario = {
    attackerSide: "hero",
    attackDirection,
    fightMode: "tournament",
    hero: { ...heroVanilla },
    villain: { ...villainVanilla },
    result: null
  };
  const outcome = resolveSs2PhysicalAttackCandidate(scenario, probe);
  const tape = strip(probeChannel.journal);

  const battle = battleOf(heroFields, villainFields, { rngTape: tape });
  combatantById(battle, "villain").resources.staminaleft.value = villainVanilla.staminaleft;
  applyAction(battle, { actorId: "hero", type, targetId: "villain" });
  return { battle, scenario, outcome, tape, attackDirection };
}

test("armour absorbs first and the overflow reaches health — the split no golden covers", () => {
  // Every promoted golden stages armourclass 0, so the armour-first path has
  // zero runtime backing. This checks the TRANSLATION of it, not the maths.
  //
  // Two armour weights, because one cannot show both halves: a hero of
  // strength 5 with a 3-6 weapon swings for 13-16, so a breastplate (defence
  // 32) always absorbs the whole blow and a boot (defence 2) never does.
  const cases = [
    { label: "absorbed", armour: { breastplate: 2 }, wants: (m) => m.armourDamage > 0 && m.hitpointDamage === 0 },
    { label: "overflowed", armour: { boot: 1 }, wants: (m) => m.armourDamage > 0 && m.hitpointDamage > 0 }
  ];
  for (const { label, armour, wants } of cases) {
    let satisfied = false;
    for (let seed = 1; seed <= 60; seed += 1) {
      const { battle, scenario, outcome } = bothPaths({
        heroFields: { strength: 5, attack: 7, defence: 3 },
        villainFields: { ...armour, vitality: 6, attack: 2, defence: 6 },
        type: Ss2ActionType.NORMAL_ATTACK,
        seed
      });
      const villain = combatantById(battle, "villain");
      assert.equal(villain.resources.armourclass.value, scenario.villain.armourclass, `${label} seed ${seed}`);
      assert.equal(villain.resources.armourclass_max.value, scenario.villain.armourclass_max, `${label} seed ${seed}`);
      assert.equal(villain.health, scenario.villain.hitpoints, `${label} seed ${seed}: hitpoints`);
      assert.equal(
        villain.resources.staminaleft.value,
        scenario.villain.staminaleft,
        `${label} seed ${seed}: the breastplate stamina join`
      );
      for (const piece of SS2_ARMOUR_PIECES) {
        assert.equal(villain.resources[piece].value, scenario.villain[piece], `${label} seed ${seed}: ${piece}`);
      }
      // The build's own first-touch order over distinct fields: armourclass,
      // armourclass_max, the destroyed piece, hitpoints, staminaleft. Nothing
      // pinned it, so reversing the two armour writes passed the whole suite.
      const emitted = battle.lastResolution.effects.map(
        (effect) => effect.resource ?? effect.status ?? effect.kind
      );
      const rank = { armourclass: 0, armourclass_max: 1, damage: 3, staminaleft: 4 };
      const ranked = emitted.map((name) => rank[name] ?? (SS2_ARMOUR_PIECES.includes(name) ? 2 : 5));
      assert.deepEqual(ranked, [...ranked].sort((a, b) => a - b), `${label}: ${emitted.join(", ")}`);

      if (outcome.calculation.hit && wants(outcome.mutation)) satisfied = true;
    }
    assert.ok(satisfied, `the sweep must contain a hit that ${label} armour`);
  }
});

test("a destroyed armour piece is written to zero, and its defence leaves both armour pools", () => {
  let sawRemoval = false;
  for (let seed = 1; seed <= 120 && !sawRemoval; seed += 1) {
    const { battle, scenario, outcome } = bothPaths({
      heroFields: { strength: 6, attack: 7, defence: 3 },
      villainFields: { helmet: 3, shoulderguard: 3, breastplate: 3, gauntlet: 3, greaves: 3, vitality: 8, attack: 2, defence: 6 },
      type: Ss2ActionType.NORMAL_ATTACK,
      seed
    });
    const destroyed = outcome.mutation.armourRemovals.filter((removal) => removal.removed);
    if (destroyed.length === 0) continue;
    sawRemoval = true;
    const villain = combatantById(battle, "villain");
    for (const removal of destroyed) {
      assert.equal(villain.resources[removal.selected].value, 0, `seed ${seed}: ${removal.selected} destroyed`);
    }
    assert.equal(villain.resources.armourclass_max.value, scenario.villain.armourclass_max, `seed ${seed}`);
    assert.deepEqual(
      battle.lastResolution.events[0].armourDestroyed,
      destroyed.map((removal) => removal.selected)
    );
  }
  assert.ok(sawRemoval, "the sweep must destroy at least one piece");
});

test("an enchantment status reaches the resolver as a status effect", () => {
  let sawStatus = false;
  for (let seed = 1; seed <= 120 && !sawStatus; seed += 1) {
    const { battle, outcome } = bothPaths({
      heroFields: { strength: 6, attack: 7, defence: 3, weapon_enchantment_type: 2, weapon_enchantment_potency: 3 },
      villainFields: { vitality: 8, attack: 2, defence: 6 },
      type: Ss2ActionType.NORMAL_ATTACK,
      seed
    });
    if (!outcome.mutation.statusApplied) continue;
    sawStatus = true;
    const villain = combatantById(battle, "villain");
    assert.ok(SS2_STATUS_FLAGS.includes(outcome.mutation.statusApplied));
    assert.ok(villain.status.includes(outcome.mutation.statusApplied), `seed ${seed}: status applied`);
    assert.ok(
      battle.lastResolution.effects.some(
        (effect) => effect.kind === "status" && effect.status === outcome.mutation.statusApplied
      )
    );
  }
  assert.ok(sawStatus, "the sweep must apply at least one enchantment status");
});

/* ------------------------------------------------------------------ */
/* Facing is on the tape, not just on the presentation                  */
/* ------------------------------------------------------------------ */

test("facing changes the armour-debris draw's shape, so it is tape-load-bearing", () => {
  // `gladiator_dir == "right"` draws `randomNumber(x, 20)`, `"left"` draws
  // `randomNumber(x, 30)`. Replaying a right-facing tape against a left-facing
  // defender must therefore be REFUSED at the cursor, not silently absorbed.
  let checked = false;
  for (let seed = 1; seed <= 200 && !checked; seed += 1) {
    const right = bothPaths({
      heroFields: { strength: 6, attack: 7, defence: 3 },
      villainFields: { gladiator_dir: "right", helmet: 3, shoulderguard: 3, breastplate: 3, vitality: 8, attack: 2, defence: 6 },
      type: Ss2ActionType.NORMAL_ATTACK,
      seed
    });
    if (!right.outcome.mutation.armourRemovals.some((removal) => removal.removed)) continue;
    checked = true;
    assert.ok(right.tape.some((sample) => sample.label.endsWith("-x") && sample.max === 19));

    const mirrored = battleOf(
      { strength: 6, attack: 7, defence: 3 },
      { gladiator_dir: "left", helmet: 3, shoulderguard: 3, breastplate: 3, vitality: 8, attack: 2, defence: 6 },
      { rngTape: right.tape }
    );
    assert.equal(combatantById(mirrored, "villain").status.includes(SS2_FACING_LEFT), true);
    assert.throws(
      () => applyAction(mirrored, { actorId: "hero", type: Ss2ActionType.NORMAL_ATTACK, targetId: "villain" }),
      RngSequenceError,
      "a facing swap must desync the tape rather than move a number quietly"
    );
  }
  assert.ok(checked, "the sweep must reach an armour destruction");
});

/* ------------------------------------------------------------------ */
/* Seam contract                                                        */
/* ------------------------------------------------------------------ */

test("no resource is ever written that the blueprint did not declare", () => {
  // `writeResource` refuses an undeclared name mid-list, leaving the earlier
  // effects applied with no rollback — a partial action. The rule set must
  // therefore skip, not assume.
  const minimal = ss2Combatant(gladiator({ helmet: 3, breastplate: 3, vitality: 8 }), {
    id: "villain",
    name: "Villain"
  });
  const declared = new Set(SS2_REQUIRED_RESOURCES);
  minimal.resources = Object.fromEntries(
    Object.entries(minimal.resources).filter(([name]) => declared.has(name))
  );

  for (let seed = 1; seed <= 40; seed += 1) {
    const battle = createTeamBattle({
      seed,
      rules: ss2TeamRules,
      teams: [
        { id: "red", combatants: [ss2Combatant(gladiator({ strength: 6 }), { id: "hero", name: "Hero" })] },
        { id: "blue", combatants: [JSON.parse(JSON.stringify(minimal))] }
      ]
    });
    applyAction(battle, { actorId: "hero", type: Ss2ActionType.NORMAL_ATTACK, targetId: "villain" });
    for (const effect of battle.lastResolution.effects) {
      if (effect.kind !== "resource") continue;
      const target = combatantById(battle, effect.targetId);
      assert.ok(
        Object.hasOwn(target.resources, effect.resource),
        `seed ${seed}: wrote undeclared ${effect.resource} on ${effect.targetId}`
      );
    }
  }
});

test("the rule set never emits the resolver's own result event", () => {
  const battle = battleOf({ strength: 30 }, { vitality: 0, herolevel: 1 }, { seed: 4 });
  while (!battle.result) {
    const actor = currentCombatant(battle);
    applyAction(battle, { actorId: actor.id, type: Ss2ActionType.POWER_ATTACK, targetId: actor.id === "hero" ? "villain" : "hero" });
  }
  const emitted = battle.events.filter((event) => event.type === "battle-result-pending");
  assert.equal(emitted.length, 1, "exactly one, and the resolver stamped it");
  assert.ok(battle.events.every((event) => Number.isSafeInteger(event.sequence) && Number.isSafeInteger(event.turn)));
});

test("a first-blood outcome is REFUSED, not silently dropped", () => {
  // The arithmetic ends a duel or misc bout at `hitpoints < hitpointsmax`;
  // `battleStanding` decides on `health > 0` alone. Rather than let the two
  // disagree in silence, the rule set throws.
  const rules = createSs2TeamRules({ fightMode: "duel", fixtureReplay: true });
  let threw = false;
  for (let seed = 1; seed <= 40 && !threw; seed += 1) {
    const battle = battleOf({ strength: 4 }, { vitality: 20 }, { rules, seed });
    try {
      applyAction(battle, { actorId: "hero", type: Ss2ActionType.NORMAL_ATTACK, targetId: "villain" });
    } catch (error) {
      assert.ok(error instanceof TeamRuleSetError, `seed ${seed}`);
      assert.match(error.message, /first-blood/);
      threw = true;
    }
  }
  assert.ok(threw, "a duel-mode hit that does not kill must be refused");
});

/* ------------------------------------------------------------------ */
/* The AI: two decisions from the build, one invented                   */
/* ------------------------------------------------------------------ */

test("the AI rests at or below the ONE stamina gate the bytes actually decode", () => {
  // `villainChooseAction` `+0x03e8` gates the whole action-choice block on
  // `staminaleft > 10`, unconditionally. That is the only villain stamina gate
  // this rule set applies.
  //
  // A `< 40%` rest gate stood here and has been removed. The map places that
  // test on ONE `choices` band arm, and a verifier reading the bytes found the
  // map's own row conflates it with a sibling arm that pushes 30 and selects
  // `wincrowd`. Generalising a band-conditional gate to every decision, under
  // a comment calling it byte-decoded, is an invented number with a citation.
  for (const staminaleft of [0, 5, 10]) {
    const battle = battleOf({ stamina: 10 }, {});
    reassignController(battle, "red:slot-1", "ai");
    combatantById(battle, "hero").resources.staminaleft.value = staminaleft;
    const choice = ss2TeamRules.chooseAiAction(
      { turnNumber: 1, actor: viewOf(battle, "hero"), allies: [viewOf(battle, "hero")], foes: [viewOf(battle, "villain")] },
      "hero",
      legalActions(battle)
    );
    assert.equal(choice.type, Ss2ActionType.REST, `staminaleft ${staminaleft} (of ${100 + 10 * 10})`);
  }
  // Above the gate it attacks, even at 11 of 200 — the removed 40% gate would
  // have rested here, so this pins the removal rather than merely allowing it.
  const battle = battleOf({ stamina: 10 }, {});
  reassignController(battle, "red:slot-1", "ai");
  combatantById(battle, "hero").resources.staminaleft.value = 11;
  const choice = ss2TeamRules.chooseAiAction(
    { turnNumber: 1, actor: viewOf(battle, "hero"), allies: [viewOf(battle, "hero")], foes: [viewOf(battle, "villain")] },
    "hero",
    legalActions(battle)
  );
  assert.notEqual(choice.type, Ss2ActionType.REST);
});

test("a killing blow costs the attacker nothing: death() removes the phase transition", () => {
  // `death()` deletes `attacker.onEnterFrame` (`+0x2035`),
  // `defender.onEnterFrame` (`+0x2042`) and the `nextphase` variable itself
  // (`+0x2049`), and the melee branch only calls `nextphase()` on a later tick
  // behind `attacker.struck == true` (`+0x62c3` -> `+0x62e2`). So the tick that
  // kills is the last one, and it never pays.
  let sawKill = false;
  for (let seed = 1; seed <= 60 && !sawKill; seed += 1) {
    const battle = battleOf({ strength: 20 }, { vitality: 0, herolevel: 1 }, { seed });
    const hero = combatantById(battle, "hero");
    const staminaBefore = hero.resources.staminaleft.value;
    const healthBefore = hero.health;
    applyAction(battle, { actorId: "hero", type: Ss2ActionType.POWER_ATTACK, targetId: "villain" });
    if (combatantById(battle, "villain").alive) continue;
    sawKill = true;
    assert.equal(hero.resources.staminaleft.value, staminaBefore, `seed ${seed}: no stamina spent on a kill`);
    assert.equal(hero.health, healthBefore, `seed ${seed}: no regeneration on a kill`);
    assert.equal(battle.lastResolution.events[0].staminaSpent, 0, `seed ${seed}`);
  }
  assert.ok(sawKill, "the sweep must land a killing blow");

  // And a NON-lethal blow does transition, so the skip is conditional and not
  // a quiet removal of the whole mechanism.
  const survivor = battleOf({ strength: 20 }, { vitality: 40 }, { seed: 5 });
  const hero = combatantById(survivor, "hero");
  const staminaBefore = hero.resources.staminaleft.value;
  applyAction(survivor, { actorId: "hero", type: Ss2ActionType.POWER_ATTACK, targetId: "villain" });
  assert.ok(combatantById(survivor, "villain").alive);
  assert.notEqual(hero.resources.staminaleft.value, staminaBefore);
});

test("status effects come out in death()'s own order: attacker's four, defender's four, then the taunts", () => {
  // `clearDeathState` walks side-then-field for the four condition flags and
  // field-then-SIDE for the two taunts. This file emitted two independent
  // per-side passes, in the wrong flag order, under a docstring claiming it was
  // the build's — caught by a verifier reading the interleave.
  assert.deepEqual([...SS2_STATUS_FLAGS], ["frozen", "burning", "poison", "life_stolen", "taunted1", "taunted2"]);

  let cleared = null;
  for (let seed = 1; seed <= 60 && cleared === null; seed += 1) {
    const battle = battleOf({ strength: 30 }, { vitality: 0, herolevel: 1 }, { seed });
    for (const id of ["hero", "villain"]) {
      combatantById(battle, id).status =
        ["frozen", "burning", "poison", "life_stolen", "taunted1", "taunted2"];
    }
    applyAction(battle, { actorId: "hero", type: Ss2ActionType.POWER_ATTACK, targetId: "villain" });
    if (!battle.result) continue;   // a miss: death() never runs
    cleared = battle.lastResolution.effects
      .filter((effect) => effect.kind === "status")
      .map((effect) => `${effect.targetId}:${effect.status}`);
  }
  assert.ok(cleared, "the sweep must land a killing blow, so death() runs and clears the flags");
  assert.deepEqual(cleared, [
    "hero:frozen", "hero:burning", "hero:poison", "hero:life_stolen",
    "villain:frozen", "villain:burning", "villain:poison", "villain:life_stolen",
    "hero:taunted1", "villain:taunted1",
    "hero:taunted2", "villain:taunted2"
  ]);
});

test("the AI always returns one of the options it was handed, and a full AI fight settles", () => {
  const battle = battleOf({ strength: 8 }, { strength: 8, vitality: 1, herolevel: 1 }, { seed: 21 });
  reassignController(battle, "red:slot-1", "ai");
  reassignController(battle, "blue:slot-1", "ai");
  const actions = advanceAiTurns(battle, 400);
  assert.ok(actions.length > 0);
  for (const action of actions) {
    assert.ok(ss2TeamRules.actionTypes.includes(action.type), action.type);
  }
  assert.ok(battle.result, "an AI-vs-AI fight must reach a result rather than deadlocking");
});

/** A combatant view shaped the way the resolver builds one, for direct AI calls. */
function viewOf(battle, id) {
  const combatant = combatantById(battle, id);
  return Object.freeze({
    id: combatant.id,
    name: combatant.name,
    teamId: combatant.teamId,
    seatId: combatant.seatId,
    slotIndex: combatant.slotIndex,
    aiFilled: combatant.aiFilled,
    stats: { ...combatant.stats },
    loadout: { ...combatant.loadout },
    resources: JSON.parse(JSON.stringify(combatant.resources)),
    maxHealth: combatant.maxHealth,
    health: combatant.health,
    alive: combatant.alive,
    status: [...combatant.status]
  });
}
