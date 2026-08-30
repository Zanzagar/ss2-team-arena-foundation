/**
 * Integration: the shared team resolver and the SS2 adapter, driven together.
 *
 * `test/ss2-adapter.test.js` tests the adapter's parts in isolation and
 * `test/team-resolver.test.js` tests the resolver's. Nothing until this file
 * drove both as one thing: vanilla-shaped state in, converted to canonical,
 * resolved turn by turn, mirrored back into vanilla field writes and
 * presentation commands, through to one campaign settlement.
 *
 * Nothing here is runtime-verified. `classicStyleRules` is an explicit
 * placeholder, the animation labels are static-map at best, and only the
 * eighteen promoted goldens in `test/fixtures/ss2-1v1-golden/` are measured
 * against the licensed build. This file proves the two seams *compose*; it
 * says nothing about whether the maths is SS2's.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  acknowledgeResultAnimation,
  applyAction,
  BATTLE_RESULT_ACK_TYPE,
  BATTLE_RESULT_PENDING_TYPE,
  combatStateHash,
  ControllerKind,
  createTeamBattle,
  currentCombatant,
  defineTeamRuleSet,
  describeTeamRuleSet,
  EffectKind,
  isCampaignSettled,
  placeholderTeamRules,
  RuleSetVerification,
  toControllerState,
  toTeamWireState
} from "../src/team/index.js";

import {
  AcknowledgementError,
  BattleHostError,
  bindingPlanFor,
  CommandKind,
  createEffectRecordingRuleSet,
  createVanillaBattleHost,
  ClipRegistryError,
  HERO_SIDE,
  HOST_PIPELINE,
  LabelProvenance,
  mirrorDifferences,
  presentResolvedEvents,
  STATUS_FLAG_FIELDS,
  VILLAIN_SIDE,
  WriteTarget
} from "../src/adapter/index.js";

/* ------------------------------------------------------------------ */
/* Vanilla-shaped fixtures                                             */
/* ------------------------------------------------------------------ */

/**
 * A persistent combat object as the battle map describes one: the six status
 * flags are simply **absent** (undefined until something sets them) and there
 * is no `gladiator_dir` — the facing lives on the fighter clip.
 *
 * The values are authored, not captured. They exist so the round trip has
 * something to preserve.
 */
const vanillaGladiator = (overrides = {}) => ({
  character_name: "Gladiator",
  herolevel: 3,
  character_level: 3,
  experience: 240,
  experienceneeded: 400,
  current_tournament: 1,
  tournament_ranking: 12,
  strength: 10,
  speed: 6,
  attack: 8,
  defence: 3,
  vitality: 3,
  stamina: 4,
  charisma: 7,
  magicka: 0,
  hitpoints: 30,
  hitpointsmax: 30,
  staminaleft: 105,
  staminamax: 140,
  armourclass: 44,
  armourclass_max: 44,
  ammo_left: 0,
  maximum_ammo: 0,
  weapon: 4,
  weapon_type: 1,
  weapon_weight: 9,
  weapon_range: 1,
  weapon_min_damage: 1,
  weapon_max_damage: 3,
  weapon_enchantment_type: 0,
  weapon_enchantment_potency: 0,
  equipped_weapon: 1,
  using_bow: false,
  breastplate: 1,
  breastplate_defence: 16,
  helmet: 2,
  helmet_defence: 20,
  shinguard: 0,
  shinguard_defence: 0,
  greaves: 4,
  greaves_defence: 12,
  shoulderguard: 0,
  shoulderguard_defence: 0,
  gauntlet: 1,
  gauntlet_defence: 5,
  boot: 4,
  boot_defence: 8,
  shield: 2,
  shield_defence: 24,
  physical_size: 87,
  min_damage: 21,
  max_damage: 23,
  movement_speed: 9,
  attack_type: 1,
  attack_speed: 5,
  weapon_enchantment_damage: 0,
  power_percentage: 40,
  normal_percentage: 60,
  quick_percentage: 80,
  bash_percentage: 55,
  taunt_percentage: 35,
  bombard_percentage: 0,
  snipe_percentage: 0,
  magicka_percentage: 0,
  psyche_up: 0,
  inventory1: 0,
  inventory2: 0,
  inventory3: 0,
  inventory4: 0,
  inventory5: 0,
  inventory6: 0,
  spell_colossus: 0,
  spell_bloodlust: 0,
  ...overrides
});

/** Every field name the adapter is allowed to write on a combat object. */
const ADAPTER_OWNED_FIELDS = Object.freeze(["hitpoints", "hitpointsmax", ...STATUS_FLAG_FIELDS]);

const hitTape = (count, value = 0) =>
  Array.from({ length: count }, () => ({ label: "hit-roll", source: "unit", min: 0, max: 1, value }));

/**
 * Red is the hero side and always outruns blue, so every knockout lands in a
 * known order and blue never gets a turn. Red hits for `min_damage +
 * strength * 2` = 101, which one-shots anything in these fixtures.
 */
const CONTROLLERS = Object.freeze({
  1: Object.freeze({ red: ["local"], blue: ["peer-7"] }),
  2: Object.freeze({ red: ["local", ControllerKind.AI], blue: ["peer-7", null] }),
  3: Object.freeze({
    red: ["local", "hot-seat:pad-2", ControllerKind.AI],
    blue: ["peer-7", null, ControllerKind.AI]
  })
});

/**
 * Builds a host for a 1v1, 2v2 or 3v3 from vanilla-shaped input.
 *
 * A `null` controller marks a slot the roster AI-fills. The fill still needs a
 * vanilla template: `src/team/roster.js` invents the combatant, but nothing
 * invents its armour, stamina, ammunition or inventory, and the host refuses
 * to fabricate a combat object.
 */
function makeHost(size, { tape = hitTape(40), settlements = null, ...options } = {}) {
  const member = (side, index, controller) => {
    const speed = side === "red" ? 30 - index : 4 - index;
    const vanilla = vanillaGladiator({
      character_name: `${side}-${index + 1}`,
      speed,
      strength: side === "red" ? 40 : 10,
      attack: side === "red" ? 40 : 8
    });
    if (controller === null) return { fill: "ai", vanilla, clip: { gladiator_dir: "right" } };
    return { id: `${side}-${index + 1}`, controller, vanilla, clip: { gladiator_dir: "right" } };
  };
  const team = (side) => ({
    id: side,
    name: side === "red" ? "Red" : "Blue",
    members: CONTROLLERS[size][side].map((controller, index) => member(side, index, controller))
  });
  return createVanillaBattleHost({
    teams: [team("red"), team("blue")],
    rngTape: tape,
    onCampaignSettled: settlements ? (record) => settlements.push(record) : null,
    ...options
  });
}

/** Red's living fighters strike down blue's, one action each, in order. */
function fightToSettlement(host) {
  const blueIds = host.battle.teams.find((team) => team.id === "blue").combatants.map((c) => c.id);
  const steps = [];
  for (const targetId of blueIds) {
    if (host.battle.result) break;
    steps.push(...host.runAiTurns());
    if (host.battle.result) break;
    steps.push(host.submit({ actorId: host.currentCombatantId(), type: "melee", targetId }));
  }
  steps.push(...host.runAiTurns());
  return steps;
}

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
};

/* ------------------------------------------------------------------ */
/* 1. A full 1v1, vanilla state in to settlement out                   */
/* ------------------------------------------------------------------ */

test("a whole 1v1 runs from vanilla state in to one campaign settlement out", () => {
  const settlements = [];
  const host = makeHost(1, { settlements });

  // Construction: vanilla -> canonical, and the vanilla arena build.
  assert.deepEqual(host.combatantIds(), ["red-1", "blue-1"]);
  assert.equal(host.combatant("blue-1").health, 30);
  assert.equal(host.combatant("blue-1").stats.agility, 4, "canonical agility comes from vanilla `speed`");
  assert.equal(host.combatant("blue-1").stats.defense, 3, "canonical defense comes from vanilla `defence`");
  assert.equal(host.mirrorFor("blue-1").fields.charisma, 7, "charisma has no canonical slot and stays in the mirror");

  const arena = host.constructArena();
  const attach = arena.commands.filter((command) => command.kind === CommandKind.ATTACH_CLIP);
  assert.deepEqual(attach.map((command) => command.instanceName), ["hero", "hero_shadow", "villain", "villain_shadow"]);
  assert.deepEqual(
    arena.facingWrites.map((write) => [write.combatantId, write.target, write.to]),
    [["red-1", WriteTarget.FIGHTER_CLIP, "right"], ["blue-1", WriteTarget.FIGHTER_CLIP, "left"]]
  );

  // One action, all the way through both layers.
  const step = host.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });
  assert.deepEqual(host.pipeline, HOST_PIPELINE);
  assert.deepEqual(step.effects, [{ kind: "damage", targetId: "blue-1", amount: 101 }]);
  assert.deepEqual(
    step.writes.map((write) => [write.combatantId, write.field, write.from, write.to, write.reason]),
    [["blue-1", "hitpoints", 30, 0, "damage-effect"]],
    "the write is the resolver's clamped 0, never 30 - 101"
  );
  assert.equal(step.writes[0].path, "_root.arena.team_arena.state.villain_1");
  assert.equal(host.vanillaState()["blue-1"].combatObject.hitpoints, 0);

  // The battle is decided, the presentation reached the result, nothing settled yet.
  assert.equal(step.result.winnerTeamId, "red");
  assert.equal(step.bridgeStatus, "armed");
  assert.deepEqual(settlements, []);
  const kinds = step.commands.map((command) => command.kind);
  assert.ok(kinds.includes(CommandKind.OVERLAY_GOTO) && kinds.includes(CommandKind.ARENA_GOTO));
  assert.equal(
    step.commands.find((command) => command.kind === CommandKind.ARENA_GOTO).label,
    "combat_won"
  );

  // The animation surface reports back; the campaign settles exactly once.
  const outcomes = host.acknowledgeResultAnimations();
  assert.deepEqual(outcomes.map((outcome) => outcome.kind), ["death", "arena-label"]);
  assert.deepEqual(outcomes.map((outcome) => outcome.settled), [false, true]);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].winnerTeamId, "red");
  assert.equal(isCampaignSettled(host.battle), true);
});

test("1v1 through the adapter leaves the resolver bit-identical to running it bare", () => {
  const host = makeHost(1);
  host.constructArena();
  host.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });
  host.acknowledgeResultAnimations();

  // The same blueprint the host built, resolved with no adapter in sight.
  const bare = createTeamBattle({
    teams: host.battle.teams.map((team) => ({
      id: team.id,
      name: team.name,
      slots: team.combatants.length,
      combatants: team.combatants.map((combatant) => ({
        id: combatant.id,
        name: combatant.name,
        stats: { ...combatant.stats },
        loadout: { ...combatant.loadout },
        maxHealth: combatant.maxHealth,
        health: combatant.maxHealth
      }))
    })),
    rngTape: hitTape(40),
    rules: placeholderTeamRules
  });
  applyAction(bare, { actorId: "red-1", type: "melee", targetId: "blue-1" });
  acknowledgeResultAnimation(bare, {
    type: BATTLE_RESULT_ACK_TYPE,
    completionToken: bare.settlement.pending.completionToken
  });
  assert.equal(host.hash(), combatStateHash(bare), "conversion and presentation add nothing to combat state");
});

/* ------------------------------------------------------------------ */
/* 2. 2v2 and 3v3 down the same code path                              */
/* ------------------------------------------------------------------ */

for (const size of [1, 2, 3]) {
  test(`a full ${size}v${size} runs to settlement through the same host, resolver and adapter`, () => {
    const settlements = [];
    const host = makeHost(size, { settlements });
    host.constructArena();

    assert.equal(host.layout.placements.length, size * 2);
    assert.equal(host.layout.sides[HERO_SIDE], "red");
    assert.equal(host.layout.sides[VILLAIN_SIDE], "blue");

    const steps = fightToSettlement(host);
    assert.equal(steps.length, size, "one resolved action per fallen fighter");
    assert.equal(host.battle.result.winnerTeamId, "red");

    // Every blue fighter is down in the mirror, and only the last action decided it.
    for (const combatant of host.battle.teams.find((team) => team.id === "blue").combatants) {
      assert.equal(host.vanillaState()[combatant.id].combatObject.hitpoints, 0);
    }
    assert.deepEqual(steps.slice(0, -1).map((step) => step.result), Array(size - 1).fill(null));

    host.acknowledgeResultAnimations();
    assert.equal(settlements.length, 1);
    assert.deepEqual(settlements[0].loserTeamIds, ["blue"]);
  });
}

test("2v2 and 3v3 fill a slot with AI and mix controller kinds on one team", () => {
  for (const size of [2, 3]) {
    const host = makeHost(size);
    const filled = host.battle.teams
      .flatMap((team) => team.combatants)
      .filter((combatant) => combatant.aiFilled);
    assert.equal(filled.length, 1, `${size}v${size} must AI-fill exactly one slot`);
    assert.equal(filled[0].id, `blue-fill-2`);
    assert.deepEqual(host.diagnostics.aiFilledSlots, [{ teamId: "blue", index: 1 }]);

    // The filled fighter is an ordinary combatant everywhere downstream.
    assert.equal(host.layout.placementFor(filled[0].id).instanceName, "villain_ally_2");
    assert.ok(host.mirrorFor(filled[0].id).fields.armourclass === 44);

    const kinds = new Set(
      toControllerState(host.battle)
        .filter((seat) => seat.seatId.startsWith("red:"))
        .map((seat) => seat.kind)
    );
    assert.ok(kinds.size >= 2, "one team mixes controller kinds");
    assert.ok(kinds.has(ControllerKind.LOCAL) && kinds.has(ControllerKind.AI));
    if (size === 3) assert.ok(kinds.has(ControllerKind.HOT_SEAT));
    assert.equal(
      toControllerState(host.battle).find((seat) => seat.seatId === "blue:slot-1").kind,
      ControllerKind.REMOTE
    );

    // AI seats take the same route as human ones: one `submit` per action.
    const steps = fightToSettlement(host);
    assert.equal(steps.length, size);
    for (const step of steps) assert.deepEqual(Object.keys(step.action).sort(), ["actorId", "targetId", "type"]);
  }
});

test("there is no second code path: one resolver, one adapter pipeline, four globals, at every size", () => {
  // A tape that misses, so the first action of every size is the same shape:
  // nothing dies, nothing is decided, and only the presentation differs by name.
  const hosts = [1, 2, 3].map((size) => makeHost(size, { tape: hitTape(40, 0.99) }));
  for (const host of hosts) host.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });

  for (const host of hosts) {
    assert.deepEqual(host.pipeline, HOST_PIPELINE, "the same ordered adapter pipeline serves every team size");
    assert.deepEqual(host.battle.rulesDescriptor, describeTeamRuleSet(placeholderTeamRules));
    assert.equal(host.battle.result, null);
    assert.deepEqual(host.steps[0].writes, [], "a miss changes no canonical state, so it writes nothing");
    assert.deepEqual(host.steps[0].commands.map((command) => command.kind), [
      CommandKind.BIND_GLOBALS,
      CommandKind.CLIP_GOTO,
      CommandKind.CLIP_GOTO,
      CommandKind.PANEL_REFRESH
    ]);
    // One ordered (attacker, defender) pair per action, whatever the roster size.
    const globals = host.steps[0].commands[0].globals;
    assert.equal(Object.keys(globals).filter((key) => !key.endsWith("CombatantId")).length, 4);
    assert.deepEqual(
      bindingPlanFor(host.layout, { actorId: "red-1", targetId: "blue-1" }),
      globals
    );
  }
  // Every size drew exactly one sample: the roll stream is the rule set's, and
  // AI fill never perturbs it.
  assert.deepEqual(hosts.map((host) => host.battle.rngCursor), [1, 1, 1]);
});

/* ------------------------------------------------------------------ */
/* 3. Team elimination semantics under the adapter                     */
/* ------------------------------------------------------------------ */

test("an individual knockout produces a death animation and a defeated event, and settles nothing", () => {
  const settlements = [];
  const host = makeHost(3, { settlements });
  host.constructArena();
  const step = host.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });

  assert.equal(host.battle.result, null, "a 3v3 must not end on the first knockout");
  assert.equal(step.bridgeStatus, "idle");
  assert.deepEqual(settlements, []);

  const defeated = host.wire().events.filter((event) => event.type === "defeated");
  assert.deepEqual(defeated.map((event) => event.targetId), ["blue-1"]);
  assert.equal(host.wire().events.some((event) => event.type === "team-eliminated"), false);
  assert.equal(host.wire().events.some((event) => event.type === BATTLE_RESULT_PENDING_TYPE), false);

  const deathClip = step.commands.filter((command) => command.role === "defeated");
  assert.deepEqual(deathClip.map((command) => [command.combatantId, command.label]), [["blue-1", "death"]]);
  assert.equal(deathClip[0].labelProvenance, LabelProvenance.PLACEHOLDER);
  assert.equal(
    step.commands.some((c) => c.kind === CommandKind.OVERLAY_GOTO || c.kind === CommandKind.ARENA_GOTO),
    false,
    "a knockout must never reach the vanilla win/loss timeline"
  );
  // And the bridge cannot be talked into settling.
  assert.throws(() => host.bridge.reportDeathAnimation("blue-1"), AcknowledgementError);
  assert.throws(() => host.acknowledgeResultAnimations(), AcknowledgementError);
});

test("only the last member of a team falling arms settlement", () => {
  const host = makeHost(3);
  const armed = [];
  for (const targetId of ["blue-1", "blue-fill-2", "blue-3"]) {
    host.runAiTurns();
    if (host.battle.result) break;
    const step = host.submit({ actorId: host.currentCombatantId(), type: "melee", targetId });
    armed.push(step.bridgeStatus);
  }
  host.runAiTurns();
  assert.deepEqual(armed.slice(0, 2), ["idle", "idle"]);
  assert.equal(host.bridge.sync(), "armed");
  assert.deepEqual(
    host.wire().events.filter((event) => event.type === "defeated").map((event) => event.targetId),
    ["blue-1", "blue-fill-2", "blue-3"]
  );
  assert.deepEqual(host.bridge.awaitingDeathAnimations.sort(), ["blue-1", "blue-3", "blue-fill-2"]);
});

/* ------------------------------------------------------------------ */
/* 4. Settlement exactly once, through the acknowledgement bridge      */
/* ------------------------------------------------------------------ */

test("settlement fires once through the bridge and a replayed acknowledgement does not re-fire it", () => {
  const settlements = [];
  const host = makeHost(2, { settlements });
  fightToSettlement(host);

  const first = host.acknowledgeResultAnimations();
  assert.equal(first.filter((outcome) => outcome.settled === true).length, 1);
  assert.equal(settlements.length, 1);

  for (let repeat = 0; repeat < 3; repeat += 1) {
    const again = host.acknowledgeResultAnimations();
    assert.deepEqual(again.map((outcome) => outcome.settled), [false]);
    assert.equal(again[0].alreadySettled, true);
    for (const combatantId of ["blue-1", "blue-fill-2"]) {
      assert.equal(host.bridge.reportDeathAnimation(combatantId).settled, false);
    }
  }
  assert.equal(settlements.length, 1, "the campaign is paid exactly once");
});

test("a mismatched completion token is refused and a pre-elimination acknowledgement is refused", () => {
  const settlements = [];
  const host = makeHost(2, { settlements });

  // Pre-elimination: nothing is armed, so nothing can be acknowledged.
  host.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });
  assert.equal(host.bridge.pendingToken, null);
  assert.equal(host.bridge.acknowledgement(), null);
  assert.throws(() => host.bridge.reportArenaLabel("combat_won"), AcknowledgementError);
  assert.throws(
    () => acknowledgeResultAnimation(host.battle, { type: BATTLE_RESULT_ACK_TYPE, completionToken: "anything" }),
    /No battle result is armed/
  );

  fightToSettlement(host);
  assert.equal(host.bridge.sync(), "armed");

  // Mismatched token: refused, never settled.
  assert.throws(
    () => host.acknowledgeResultAnimations({ completionToken: "team-arena:blue:red:elimination" }),
    (error) => error instanceof AcknowledgementError && /does not match the armed result/.test(error.message)
  );
  // A surface that disagrees with the resolved winner is refused too.
  assert.throws(
    () => host.bridge.reportArenaLabel("combat_lost"),
    (error) => error instanceof AcknowledgementError && /refusing to settle/.test(error.message)
  );
  assert.deepEqual(settlements, []);

  // The right token still settles, once.
  host.acknowledgeResultAnimations({ completionToken: host.bridge.pendingToken });
  assert.equal(settlements.length, 1);
});

test("the bridge settles through the resolver's own gate, so a direct acknowledgement wins the race", () => {
  const settlements = [];
  const host = makeHost(1, { settlements });
  fightToSettlement(host);
  host.bridge.sync();

  assert.equal(
    acknowledgeResultAnimation(host.battle, {
      type: BATTLE_RESULT_ACK_TYPE,
      completionToken: host.bridge.pendingToken
    }),
    true
  );
  const outcomes = host.acknowledgeResultAnimations();
  assert.deepEqual(outcomes.map((outcome) => outcome.settled), [false, false]);
  assert.equal(settlements.length, 1);
});

/* ------------------------------------------------------------------ */
/* 5. Determinism across the whole stack                               */
/* ------------------------------------------------------------------ */

test("the same vanilla input and the same ordered action stream produce identical vanilla state and hash", () => {
  const run = () => {
    const settlements = [];
    const host = makeHost(3, { settlements });
    const arena = host.constructArena();
    const steps = fightToSettlement(host);
    const acknowledgements = host.acknowledgeResultAnimations();
    return {
      hash: host.hash(),
      vanilla: host.vanillaState(),
      wire: host.wire(),
      arena: JSON.parse(JSON.stringify(arena)),
      steps: JSON.parse(JSON.stringify(steps)),
      acknowledgements: JSON.parse(JSON.stringify(acknowledgements)),
      settlements
    };
  };

  const first = run();
  const second = run();

  assert.equal(first.hash, second.hash, "the combat state hash must be identical");
  assert.deepEqual(first.vanilla, second.vanilla, "every vanilla field must land on the same value");
  assert.deepEqual(first.wire, second.wire);
  assert.deepEqual(first.arena, second.arena, "the arena build is derived from the projection, so it repeats");
  assert.deepEqual(first.steps, second.steps, "writes, commands and effects all repeat in order");
  assert.deepEqual(first.acknowledgements, second.acknowledgements);
  assert.deepEqual(first.settlements, second.settlements);
  assert.equal(first.settlements.length, 1);
});

test("presentation output never influences resolved state", () => {
  const presented = makeHost(2);
  const quiet = makeHost(2);

  // Both hosts build the same arena; only one of them ever holds live clip
  // handles and drains a presentation binder against them. The resolver, and
  // every vanilla field the adapter owns, must not be able to tell.
  presented.constructArena({ handles: Object.fromEntries(presented.combatantIds().map((id) => [id, { live: id }])) });
  quiet.constructArena();
  fightToSettlement(presented);
  fightToSettlement(quiet);
  assert.equal(presented.hash(), quiet.hash());
  assert.deepEqual(presented.vanillaState(), quiet.vanillaState());

  // Re-presenting a frozen projection any number of times changes nothing.
  const before = presented.hash();
  const frozen = deepFreeze(presented.wire());
  for (let repeat = 0; repeat < 3; repeat += 1) {
    const { commands } = presentResolvedEvents(frozen, { layout: presented.layout });
    assert.ok(commands.length > 0);
    for (const command of commands) {
      for (const value of Object.values(command)) assert.notEqual(typeof value, "function");
    }
  }
  assert.equal(presented.hash(), before);
  assert.deepEqual(presented.wire(), JSON.parse(JSON.stringify(frozen)));
});

/* ------------------------------------------------------------------ */
/* 6. Round-tripping state                                             */
/* ------------------------------------------------------------------ */

test("a whole battle leaves every field the adapter does not own untouched", () => {
  const host = makeHost(3);
  const inputs = Object.fromEntries(
    host.layout.placements.map((placement) => [
      placement.combatantId,
      host.mirrorFor(placement.combatantId).fields
    ])
  );
  const before = JSON.parse(JSON.stringify(inputs));
  host.constructArena();
  fightToSettlement(host);
  host.acknowledgeResultAnimations();

  const after = host.vanillaState();
  for (const [combatantId, fields] of Object.entries(before)) {
    const combatObject = after[combatantId].combatObject;
    assert.deepEqual(
      Object.keys(combatObject).sort(),
      Object.keys(fields).sort(),
      `${combatantId} must gain and lose no keys`
    );
    for (const [name, value] of Object.entries(fields)) {
      if (ADAPTER_OWNED_FIELDS.includes(name)) continue;
      assert.deepEqual(combatObject[name], value, `${combatantId}.${name} is not the adapter's to change`);
    }
    // Specifically: the SS2 resources that live outside canonical state.
    assert.equal(combatObject.armourclass, 44);
    assert.equal(combatObject.staminaleft, 105);
    assert.equal(combatObject.charisma, 7);
    assert.equal(combatObject.inventory1, 0);
    assert.equal(combatObject.spell_colossus, 0);
  }
});

test("the undefined-until-set flags are materialised once and stay distinguishable through a battle", () => {
  const host = makeHost(2);
  // Nothing has written a status flag, so the input object simply has no key.
  const raw = vanillaGladiator();
  for (const flag of STATUS_FLAG_FIELDS) assert.equal(flag in raw, false);

  const mirror = host.mirrorFor("blue-1");
  assert.deepEqual([...mirror.materialisedFlags].sort(), [...STATUS_FLAG_FIELDS].sort());
  for (const flag of STATUS_FLAG_FIELDS) assert.equal(mirror.fields[flag], false);

  // A health-only write must not make the adapter forget that the flags were
  // never written: the next status write still *creates* its field.
  host.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });
  assert.deepEqual([...host.mirrorFor("blue-1").materialisedFlags].sort(), [...STATUS_FLAG_FIELDS].sort());

  // The whole battle never writes a status flag, so all six stay absent-in-fact.
  fightToSettlement(host);
  for (const combatantId of ["red-1", "red-2", "blue-1"]) {
    assert.deepEqual(
      [...host.mirrorFor(combatantId).materialisedFlags].sort(),
      [...STATUS_FLAG_FIELDS].sort(),
      `${combatantId} never had a status flag written`
    );
  }

  // The one exception, and it is a consequence rather than a choice: the
  // AI-filled slot needed its mirror pulled to canonical state before turn one
  // (its maximum health came from the rule set), and `toVanillaCombatant`
  // writes all six flags unconditionally. Bringing a mirror into step
  // therefore costs the undefined-until-set provenance for that combatant.
  assert.deepEqual(host.mirrorFor("blue-fill-2").materialisedFlags, []);
});

test("the facing lives on the fighter clip and never appears on the combat object", () => {
  const host = makeHost(2);
  for (const combatantId of host.combatantIds()) {
    assert.equal(host.mirrorFor(combatantId).facingSource, "fighter-clip");
    assert.equal(host.mirrorFor(combatantId).clip.gladiator_dir, "right", "the fixture staged both sides facing right");
  }
  const { facingWrites } = host.constructArena();
  assert.ok(facingWrites.every((write) => write.target === WriteTarget.FIGHTER_CLIP));
  assert.ok(facingWrites.every((write) => write.path.startsWith("_root.arena.gladiators.")));

  fightToSettlement(host);
  const state = host.vanillaState();
  for (const placement of host.layout.placements) {
    const { combatObject, fighterClip } = state[placement.combatantId];
    assert.equal("gladiator_dir" in combatObject, false, "the facing is never stored on the combat object");
    assert.equal(fighterClip.gladiator_dir, placement.side === HERO_SIDE ? "right" : "left");
  }
});

/* ------------------------------------------------------------------ */
/* 7. The seam boundary under composition                              */
/* ------------------------------------------------------------------ */

test("no clip handle reaches the state hash, even with live handles registered all battle", () => {
  const host = makeHost(2);
  const handles = {};
  for (const combatantId of host.combatantIds()) {
    const handle = { combatantId, gotoAndPlay() {}, _parent: null };
    handle._parent = handle; // a live AVM1 clip is circular and not JSON-safe
    handles[combatantId] = handle;
  }
  const before = host.hash();
  host.constructArena({ handles });
  assert.equal(host.hash(), before);

  fightToSettlement(host);
  const serialised = JSON.stringify(host.wire());
  assert.equal(serialised.includes("gotoAndPlay"), false);
  assert.equal(serialised.includes("_parent"), false);
  assert.throws(() => JSON.stringify(host.clips), ClipRegistryError);
  assert.throws(() => JSON.stringify({ wire: host.wire(), clips: host.clips }), ClipRegistryError);
  assert.deepEqual(host.clips.describe().map((entry) => entry.instanceName).sort(), [
    "hero",
    "hero_ally_2",
    "villain",
    "villain_ally_2"
  ]);
});

test("the effect recorder is inert: it changes neither the rule-set descriptor nor the hash", () => {
  const recorded = makeHost(2);
  const plain = makeHost(2, { recordEffects: false });

  assert.deepEqual(describeTeamRuleSet(recorded.battle.rules), describeTeamRuleSet(placeholderTeamRules));
  assert.equal(recorded.hash(), plain.hash());

  const a = recorded.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });
  const b = plain.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });
  assert.equal(recorded.hash(), plain.hash());
  assert.deepEqual(a.commands, b.commands);
  assert.deepEqual(
    a.writes.map((write) => [write.combatantId, write.field, write.to]),
    b.writes.map((write) => [write.combatantId, write.field, write.to])
  );

  // The one thing it does change: without it, no write can be attributed.
  assert.deepEqual(a.writes.map((write) => write.reason), ["damage-effect"]);
  assert.deepEqual(b.writes.map((write) => write.reason), ["resolved-state-diff"]);
  assert.deepEqual(b.effects, [], "applyAction discards outcome.effects; nothing on the battle carries them");

  // And a recorder built by hand passes the same rule-set gate.
  const recorder = createEffectRecordingRuleSet(placeholderTeamRules);
  assert.deepEqual(describeTeamRuleSet(recorder.rules), describeTeamRuleSet(placeholderTeamRules));
  assert.deepEqual(recorder.take(), []);
});

/* ------------------------------------------------------------------ */
/* Where the two seams do not fit                                      */
/* ------------------------------------------------------------------ */

test("GAP: the adapter refuses to invent a vanilla combat object for an AI-filled slot", () => {
  assert.throws(
    () => createVanillaBattleHost({
      teams: [
        { id: "red", members: [{ id: "red-1", controller: "local", vanilla: vanillaGladiator() }] },
        { id: "blue", members: [{ fill: "ai" }] }
      ],
      rngTape: hitTape(4)
    }),
    (error) =>
      error instanceof BattleHostError &&
      /invents the combatant, but no layer invents its armour/.test(error.message)
  );
  // A supplied fighter with no vanilla record is refused for the same reason.
  assert.throws(
    () => createVanillaBattleHost({
      teams: [
        { id: "red", members: [{ id: "red-1", controller: "local" }] },
        { id: "blue", members: [{ id: "blue-1", vanilla: vanillaGladiator() }] }
      ]
    }),
    BattleHostError
  );
});

test("GAP: an AI-filled slot's maximum health comes from the rule set, so the mirror must be pulled to canonical", () => {
  const host = makeHost(2);
  const fill = host.combatant("blue-fill-2");
  // The template staged 30/30. `normaliseCombatant` had no `maxHealth` to
  // preserve, so the placeholder rule set derived 50 + vitality * 10 = 100.
  assert.equal(fill.maxHealth, 100);
  assert.deepEqual(host.diagnostics.canonicalSyncs.map((entry) => entry.combatantId), ["blue-fill-2"]);
  assert.deepEqual(host.diagnostics.canonicalSyncs[0].differences, [
    "hitpoints 30 != health 100",
    "hitpointsmax 30 != maxHealth 100"
  ]);
  assert.equal(host.mirrorFor("blue-fill-2").fields.hitpointsmax, 100);
  // Reported, never corrected: `hitpointsmax` is a vanilla `battlevalues` formula.
  const report = host.diagnostics.maximumHealthReports.find((entry) => entry.combatantId === "blue-fill-2");
  assert.deepEqual({ derived: report.ruleSetDerived, vanilla: report.vanillaHitpointsMax, agrees: report.agrees }, {
    derived: 100,
    vanilla: 100,
    agrees: true
  });
  // For a supplied gladiator the rule set derives 80 while vanilla staged 30,
  // and the adapter reports the disagreement rather than resolving it.
  const supplied = host.diagnostics.maximumHealthReports.find((entry) => entry.combatantId === "blue-1");
  assert.deepEqual({ derived: supplied.ruleSetDerived, vanilla: supplied.vanillaHitpointsMax, agrees: supplied.agrees }, {
    derived: 80,
    vanilla: 30,
    agrees: false
  });
});

test("GAP: a gladiator who enters already burning loses that condition at construction", () => {
  const host = createVanillaBattleHost({
    teams: [
      {
        id: "red",
        members: [{ id: "red-1", controller: "local", vanilla: vanillaGladiator({ speed: 30, strength: 40 }) }]
      },
      {
        id: "blue",
        members: [{ id: "blue-1", controller: "peer-7", vanilla: vanillaGladiator({ speed: 4, burning: true }) }]
      }
    ],
    rngTape: hitTape(4)
  });

  // The adapter read the condition and can express it declaratively...
  assert.deepEqual(host.diagnostics.unappliedInitialStatusEffects, [
    { kind: EffectKind.STATUS, targetId: "blue-1", status: "burning", active: true }
  ]);
  // ...but `roster.normaliseCombatant` hard-codes `status: []`, and the
  // resolver exposes no entry point that applies an effect outside
  // `applyAction`, so there is nowhere to put them.
  assert.deepEqual(host.combatant("blue-1").status, []);
  // Worse: bringing the mirror into step with canonical state *erased* a
  // runtime-observed vanilla condition.
  assert.ok(host.diagnostics.canonicalSyncs.some((entry) => entry.differences.some((d) => d.startsWith("burning"))));
  assert.equal(host.mirrorFor("blue-1").fields.burning, false);
});

test("GAP: armour lives outside canonical state, so no field write ever reaches armourclass", () => {
  const host = makeHost(1);
  fightToSettlement(host);

  const everyWrite = host.steps.flatMap((step) => step.writes);
  assert.deepEqual(
    [...new Set(everyWrite.map((write) => write.field))],
    ["hitpoints"],
    "the only field the whole battle ever wrote"
  );
  assert.equal(everyWrite.some((write) => write.field === "armourclass"), false);
  assert.deepEqual(Object.values(EffectKind).sort(), ["damage", "heal", "status"]);

  // The defeated fighter is at 0 hitpoints with all 44 points of armour still
  // standing. That is correct *adapter* behaviour — the armour-first split is
  // a formula and the adapter may not compute one — and it is a state vanilla
  // could never be in, because `damagecharacter` subtracts from `armourclass`
  // first and carries only the overflow into `hitpoints`.
  const defeated = host.vanillaState()["blue-1"].combatObject;
  assert.deepEqual({ hitpoints: defeated.hitpoints, armourclass: defeated.armourclass }, {
    hitpoints: 0,
    armourclass: 44
  });
  // And the mirror check cannot see it. `mirrorDifferences` compares only the
  // fields canonical state has, so a mirror that is wrong about armour, stamina
  // and ammunition still reports itself in perfect step with the resolver.
  assert.deepEqual(mirrorDifferences(host.mirrorFor("blue-1"), host.combatant("blue-1")), []);
});

test("GAP: a rule set cannot read the vanilla record, and smuggling it in defeats the hash", () => {
  const seen = [];
  /**
   * DEMONSTRATION ONLY — not SS2 behaviour and not a proposal. It exists to
   * show what a runtime-verified rule set would have to do to see armour, and
   * what that costs.
   */
  const armourAware = (armourByCombatantId) => defineTeamRuleSet({
    id: "test-armour-side-channel",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: {
      runtimeVerified: false,
      note: "Demonstration of the canonical-shape gap. Invented; never measured against the licensed build."
    },
    actionTypes: ["strike"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction(request) {
      seen.push(Object.keys(request.target).sort());
      const armour = armourByCombatantId.get(request.targetId) ?? 0;
      const spilled = Math.max(0, 25 - armour);
      return {
        effects: [{ kind: EffectKind.DAMAGE, targetId: request.targetId, amount: spilled }],
        events: [{ type: "strike", actorId: request.actorId, targetId: request.targetId, damage: spilled }]
      };
    },
    chooseAiAction: (view, actorId, options) => options[0]
  });

  const build = (armourclass) => {
    const armour = new Map([["blue-1", armourclass]]);
    return createVanillaBattleHost({
      teams: [
        { id: "red", members: [{ id: "red-1", controller: "local", vanilla: vanillaGladiator({ speed: 30 }) }] },
        { id: "blue", members: [{ id: "blue-1", controller: "peer-7", vanilla: vanillaGladiator({ speed: 4, armourclass }) }] }
      ],
      rules: armourAware(armour)
    });
  };

  const armoured = build(44);
  const bare = build(0);

  // Two peers that agree perfectly on combat state, and disagree on 44 points
  // of armour: the hash cannot tell them apart.
  assert.equal(armoured.hash(), bare.hash(), "armourclass is not in the combat state hash");
  assert.notEqual(
    armoured.mirrorFor("blue-1").fields.armourclass,
    bare.mirrorFor("blue-1").fields.armourclass
  );

  armoured.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });
  bare.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });

  // The rule set never saw armour in what the resolver handed it...
  assert.deepEqual(seen[0], [
    "aiFilled", "alive", "health", "id", "loadout", "maxHealth",
    "name", "seatId", "slotIndex", "stats", "status", "teamId"
  ].sort());
  assert.equal(seen[0].includes("armourclass"), false);
  assert.equal(seen[0].includes("vanilla"), false);

  // ...so it had to close over the adapter's mirror, and the two now disagree
  // on the outcome after starting from identical hashes.
  assert.equal(armoured.combatant("blue-1").health, 30);
  assert.equal(bare.combatant("blue-1").health, 5);
  assert.notEqual(armoured.hash(), bare.hash());
});

test("GAP: a drawn battle arms settlement that the adapter bridge can never acknowledge", () => {
  const settlements = [];
  /** DEMONSTRATION ONLY. A vocabulary that can kill both fighters at once. */
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
      events: [{ type: "strike", actorId: request.actorId, targetId: request.targetId, damage: 999 }]
    }),
    chooseAiAction: (view, actorId, options) => options[0]
  });

  const host = createVanillaBattleHost({
    teams: [
      { id: "red", members: [{ id: "red-1", controller: "local", vanilla: vanillaGladiator({ speed: 30 }) }] },
      { id: "blue", members: [{ id: "blue-1", controller: "peer-7", vanilla: vanillaGladiator({ speed: 4 }) }] }
    ],
    rules: mutual,
    onCampaignSettled: (record) => settlements.push(record)
  });
  const step = host.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });

  assert.equal(host.battle.result.reason, "draw");
  assert.equal(host.battle.result.winnerTeamId, null);
  assert.equal(step.bridgeStatus, "armed");
  // Presentation reports the missing transition rather than guessing one.
  // (The `strike` action event is also unmapped: these placeholder bindings
  // serve the melee/ranged/spell/rest vocabulary, not this test vocabulary.)
  const unmapped = step.commands.filter((command) => command.kind === CommandKind.UNMAPPED);
  assert.deepEqual(unmapped.length, 2);
  assert.equal(unmapped.filter((command) => /no draw transition/.test(command.reason)).length, 1);
  assert.equal(unmapped.filter((command) => /no animation binding/.test(command.reason)).length, 1);

  // Both fighters can report their death animations, and it still cannot settle:
  // `reportArenaLabel` is the only thing that can arm the final gate, and a
  // draw has no arena label for it to accept.
  assert.equal(host.bridge.expectedArenaLabel, null);
  for (const combatantId of ["red-1", "blue-1"]) {
    assert.equal(host.bridge.reportDeathAnimation(combatantId).settled, false);
  }
  assert.throws(
    () => host.bridge.reportArenaLabel("combat_won"),
    (error) => error instanceof AcknowledgementError && /a draw/.test(error.message)
  );
  assert.deepEqual(settlements, [], "the campaign is never settled for a draw, through the bridge");

  // The resolver's own gate would settle it perfectly well, which is what
  // makes this a composition defect rather than a resolver one.
  assert.equal(
    acknowledgeResultAnimation(host.battle, {
      type: BATTLE_RESULT_ACK_TYPE,
      completionToken: host.bridge.pendingToken
    }),
    true
  );
  assert.equal(settlements.length, 1);
});

test("GAP: the adapter presents the resolver's initiative and never translates a vanilla phase", () => {
  const host = makeHost(3);
  // Agility descending, id ascending. Vanilla runs a three-phase
  // `battle_action` cycle advanced by `nextphase` instead, and the adapter
  // does not translate between them — see MAP_SILENCE.initiative-order.
  assert.deepEqual(host.wire().initiative, [
    "red-1", "red-2", "red-3", "blue-fill-2", "blue-1", "blue-3"
  ]);
  host.constructArena();
  fightToSettlement(host);
  host.acknowledgeResultAnimations();

  // Nothing the adapter emits carries a turn, a phase, or a `nextphase` call:
  // the whole vanilla turn-gating surface is simply absent from the seam.
  const commands = host.steps.flatMap((step) => step.commands);
  assert.ok(commands.length > 0);
  for (const command of commands) {
    for (const key of Object.keys(command)) {
      assert.equal(/phase|turn/i.test(key), false, `${command.kind} must not carry ${key}`);
    }
  }
  assert.equal(JSON.stringify(commands).includes("nextphase"), false);
});
