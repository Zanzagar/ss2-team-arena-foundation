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
  lastResolvedAction,
  placeholderTeamRules,
  resourceValue,
  RuleSetVerification,
  toControllerState,
  toTeamWireState
} from "../src/team/index.js";

import {
  AcknowledgementError,
  BattleHostError,
  bindingPlanFor,
  CANONICAL_RESOURCE_SOURCES,
  CommandKind,
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

/**
 * DEMONSTRATION ONLY — invented, never measured against the licensed build.
 * It exists to show the shape a runtime-verified rule set would use for the
 * map's armour-first damage path: the pool written absolutely, then the
 * overflow as damage, both decided here and neither computed by the adapter.
 */
const armourFirstRules = defineTeamRuleSet({
  id: "test-armour-first",
  verification: RuleSetVerification.PLACEHOLDER,
  provenance: { runtimeVerified: false, note: "Invented armour-first split. Not SS2 behaviour." },
  actionTypes: ["strike"],
  maximumHealth: (combatant) => combatant.maxHealth ?? 30,
  legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
  resolveAction(request) {
    const armour = resourceValue(request.target, "armourclass");
    const blow = 60;
    return {
      effects: [
        { kind: EffectKind.RESOURCE, targetId: request.targetId, resource: "armourclass", to: Math.max(0, armour - blow) },
        { kind: EffectKind.DAMAGE, targetId: request.targetId, amount: Math.max(0, blow - armour) }
      ],
      events: [{ type: "strike", actorId: request.actorId, targetId: request.targetId }]
    };
  },
  chooseAiAction: (view, actorId, options) => options[0]
});

/**
 * What the animation surface saw, read out of the presentation commands the
 * host already emitted: which fighters were given a death animation, which
 * arena label the timeline was told to play, and the completion token that
 * command carried.
 *
 * Every test that settles goes through this, and nothing in it reads the
 * bridge. That is the point: `acknowledgeResultAnimations` used to invent the
 * death reports and then read the expected arena label back off the bridge, so
 * both settlement gates were satisfied by the adapter talking to itself and
 * neither the surface's agreement with resolved state nor the completion token
 * was ever really tested.
 */
function animationSurface(host) {
  const commands = host.steps.flatMap((step) => step.commands);
  const deaths = commands
    .filter((command) => command.kind === CommandKind.CLIP_GOTO && command.role === "defeated")
    .map((command) => command.combatantId);
  const arena = commands.find((command) => command.kind === CommandKind.ARENA_GOTO) ?? null;
  const drawn = commands.find(
    (command) => command.kind === CommandKind.UNMAPPED && command.detail?.completionToken !== undefined
  ) ?? null;
  return {
    deaths,
    arenaLabel: arena ? arena.label : null,
    completionToken: arena ? arena.completionToken : (drawn ? drawn.detail.completionToken : undefined)
  };
}

/** Submits that surface report to the host, with optional overrides. */
function reportAnimationSurface(host, overrides = {}) {
  return host.acknowledgeResultAnimations({ ...animationSurface(host), ...overrides });
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
  const outcomes = reportAnimationSurface(host);
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
  reportAnimationSurface(host);

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
        // The conversion now includes the canonical resource bag, so the bare
        // blueprint has to carry it too: it is combat state, and the hash
        // covers it. Omitting it here would be comparing two different battles.
        resources: JSON.parse(JSON.stringify(combatant.resources)),
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

    reportAnimationSurface(host);
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

test("every combatant declares the same canonical resources, on both sides of the binding, at every size", () => {
  for (const size of [1, 2, 3]) {
    const host = makeHost(size);
    const names = [...CANONICAL_RESOURCE_SOURCES].sort();
    for (const combatant of host.battle.teams.flatMap((team) => team.combatants)) {
      assert.deepEqual(
        Object.keys(combatant.resources).sort(),
        names,
        `${combatant.id} must declare the whole set: the vanilla surface is a binding rebound per action, ` +
        "so any combatant can be game_attacker on one action and game_defender on the next"
      );
      assert.equal(combatant.resources.armourclass.value, 44);
      assert.equal(combatant.resources.charisma.value, 7);
    }
    // Including the slot the roster invented: its resources come from the
    // caller's fill template, so a write to it is legal like any other.
    if (size > 1) {
      assert.equal(host.combatant("blue-fill-2").aiFilled, true);
      assert.equal(host.combatant("blue-fill-2").resources.armourclass.value, 44);
      assert.deepEqual(host.diagnostics.aiFillResourceGaps, []);
    }
    // Both sides of the layout, not just the hero side.
    const sides = new Set(host.layout.placements.map((placement) => placement.side));
    assert.deepEqual([...sides].sort(), [HERO_SIDE, VILLAIN_SIDE].sort());
  }
});

test("an armour write lands on an AI-filled ally at 3v3, which is what declaring on both sides buys", () => {
  const member = (side, index) => {
    const vanilla = vanillaGladiator({ speed: side === "red" ? 30 - index : 4 - index });
    // Blue's middle slot is the one the roster invents.
    if (side === "blue" && index === 1) return { fill: "ai", vanilla };
    return { id: `${side}-${index + 1}`, controller: side === "red" ? "local" : "peer-7", vanilla };
  };
  const host = createVanillaBattleHost({
    teams: ["red", "blue"].map((side) => ({
      id: side,
      name: side,
      members: [0, 1, 2].map((index) => member(side, index))
    })),
    rules: armourFirstRules
  });

  const filled = host.combatant("blue-fill-2");
  assert.equal(filled.aiFilled, true);
  assert.equal(host.layout.placementFor(filled.id).side, VILLAIN_SIDE);
  assert.equal(filled.resources.armourclass.value, 44);

  // Before the resource bag reached AI-filled slots this threw from the
  // resolver: an invented combatant declared no resources, so the rule set's
  // armour write to it was refused while the identical write to a supplied
  // gladiator succeeded — the outcome depending on whose turn it was.
  const step = host.submit({ actorId: "red-1", type: "strike", targetId: filled.id });
  assert.deepEqual(
    step.writes.map((write) => [write.combatantId, write.field, write.to]),
    [[filled.id, "armourclass", 0], [filled.id, "hitpoints", filled.maxHealth - 16]]
  );
  assert.equal(host.vanillaState()[filled.id].combatObject.armourclass, 0);
  assert.equal(host.layout.placementFor(filled.id).stateObjectPath, "_root.arena.team_arena.state.villain_2");
});

test("the roster's one-fill-template-per-team limit is reported, never guessed around", () => {
  const host = createVanillaBattleHost({
    teams: [
      { id: "red", members: [{ id: "red-1", controller: "local", vanilla: vanillaGladiator({ speed: 30 }) }] },
      {
        id: "blue",
        members: [
          { fill: "ai", vanilla: vanillaGladiator({ speed: 4, armourclass: 44 }) },
          { fill: "ai", vanilla: vanillaGladiator({ speed: 3, armourclass: 12 }) }
        ]
      }
    ],
    rngTape: hitTape(8)
  });

  // `src/team/roster.js` builds every filled slot from one `team.aiFill`, so
  // two templates that disagree about armour have nowhere to both live.
  // Picking a winner would put an invented number in the state hash.
  assert.deepEqual(host.diagnostics.aiFillResourceGaps.map((gap) => gap.teamId), ["blue"]);
  assert.match(host.diagnostics.aiFillResourceGaps[0].reason, /one AI-fill template per team/);
  for (const combatant of host.battle.teams.find((team) => team.id === "blue").combatants) {
    assert.deepEqual(combatant.resources, {}, "the filled slots declare nothing rather than the wrong thing");
  }

  // A caller that says what it wants is obeyed instead.
  const declared = createVanillaBattleHost({
    teams: [
      { id: "red", members: [{ id: "red-1", controller: "local", vanilla: vanillaGladiator({ speed: 30 }) }] },
      {
        id: "blue",
        aiFill: { resources: { armourclass: 7 } },
        members: [
          { fill: "ai", vanilla: vanillaGladiator({ speed: 4, armourclass: 44 }) },
          { fill: "ai", vanilla: vanillaGladiator({ speed: 3, armourclass: 12 }) }
        ]
      }
    ],
    rngTape: hitTape(8)
  });
  assert.deepEqual(declared.diagnostics.aiFillResourceGaps, []);
  assert.equal(declared.combatant("blue-fill-1").resources.armourclass.value, 7);
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
    const size = host.combatantIds().length;
    assert.deepEqual(host.steps[0].commands.map((command) => command.kind), [
      CommandKind.BIND_GLOBALS,
      CommandKind.CLIP_GOTO,
      CommandKind.CLIP_GOTO,
      // Presentation is total: every panel is refreshed, not only the pair the
      // event names, because an action can move a combatant the event does not
      // name and every one of those changes produces a vanilla write.
      ...Array(size).fill(CommandKind.PANEL_REFRESH)
    ]);
    assert.deepEqual(
      host.steps[0].commands.filter((command) => command.kind === CommandKind.PANEL_REFRESH)
        .map((command) => command.combatantId)
        .sort(),
      [...host.combatantIds()].sort(),
      "no combatant's bar is left showing a number the resolver has replaced"
    );
    // One ordered (attacker, defender) pair per action, whatever the roster size.
    const globals = host.steps[0].commands[0].globals;
    const bound = ["attacker", "defender", "game_attacker", "game_defender"];
    assert.deepEqual(Object.keys(globals).filter((key) => bound.includes(key)).sort(), [...bound].sort());
    assert.equal(new Set(bound.map((key) => globals[key])).size, 4);
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
  assert.throws(
    () => host.bridge.reportDeathAnimation("blue-1"),
    (error) => error instanceof AcknowledgementError && /no battle result is armed/.test(error.message)
  );
  assert.throws(
    () => host.acknowledgeResultAnimations({ deaths: ["blue-1"], arenaLabel: "combat_won", completionToken: "x" }),
    (error) => error instanceof AcknowledgementError && /no battle result is armed/.test(error.message)
  );
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

  const first = reportAnimationSurface(host);
  assert.equal(first.filter((outcome) => outcome.settled === true).length, 1);
  assert.equal(settlements.length, 1);

  // The whole surface report replayed verbatim — every death and the arena
  // label again — pays nothing a second time.
  for (let repeat = 0; repeat < 3; repeat += 1) {
    const again = reportAnimationSurface(host);
    assert.deepEqual(again.map((outcome) => outcome.kind), ["death", "death", "arena-label"]);
    assert.deepEqual(again.map((outcome) => outcome.settled), [false, false, false]);
    assert.ok(again.every((outcome) => outcome.alreadySettled === true));
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
  assert.throws(
    () => host.bridge.reportArenaLabel("combat_won"),
    (error) => error instanceof AcknowledgementError && /no battle result is armed/.test(error.message)
  );
  assert.throws(
    () => acknowledgeResultAnimation(host.battle, { type: BATTLE_RESULT_ACK_TYPE, completionToken: "anything" }),
    /No battle result is armed/
  );

  fightToSettlement(host);
  assert.equal(host.bridge.sync(), "armed");

  // Mismatched token: refused, never settled.
  assert.throws(
    () => reportAnimationSurface(host, { completionToken: "team-arena:blue:red:elimination" }),
    (error) => error instanceof AcknowledgementError && /does not match the armed result/.test(error.message)
  );
  // A surface that disagrees with the resolved winner is refused too.
  assert.throws(
    () => host.bridge.reportArenaLabel("combat_lost"),
    (error) => error instanceof AcknowledgementError && /refusing to settle/.test(error.message)
  );
  assert.deepEqual(settlements, []);

  // The right token still settles, once.
  reportAnimationSurface(host);
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
  const outcomes = reportAnimationSurface(host);
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
    const acknowledgements = reportAnimationSurface(host);
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
  reportAnimationSurface(host);

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
  const refusesSerialisation = (error) =>
    error instanceof ClipRegistryError && /must never enter a state projection/.test(error.message);
  assert.throws(() => JSON.stringify(host.clips), refusesSerialisation);
  assert.throws(() => JSON.stringify({ wire: host.wire(), clips: host.clips }), refusesSerialisation);
  assert.deepEqual(host.clips.describe().map((entry) => entry.instanceName).sort(), [
    "hero",
    "hero_ally_2",
    "villain",
    "villain_ally_2"
  ]);
});

test("the host injects the rule set undecorated and takes the effect list from the resolver's trace", () => {
  const host = makeHost(2);

  // The rule set reaches the resolver as the caller's own object. It used to
  // be wrapped in a recording decorator, because `applyAction` discarded
  // `outcome.effects` and a host had no other way to see the write ordering.
  // `lastResolvedAction` made that wrapper redundant, and the wrapper is gone:
  // there is now nothing between the injected rule set and the resolver.
  assert.equal(host.battle.rules, placeholderTeamRules, "no decorator sits between the caller and the resolver");
  assert.deepEqual(describeTeamRuleSet(host.battle.rules), describeTeamRuleSet(placeholderTeamRules));

  const step = host.submit({ actorId: "red-1", type: "melee", targetId: "blue-1" });
  const trace = lastResolvedAction(host.battle);
  assert.deepEqual(step.effects, trace.effects, "the step's effects are the resolver's own record");
  assert.deepEqual(step.effects, [{ kind: "damage", targetId: "blue-1", amount: 101 }]);
  assert.deepEqual(trace.knockouts, ["blue-1"]);
  assert.equal(trace.actorId, "red-1");

  // And every write is attributed, with no opt-in and no wrapper to forget.
  assert.deepEqual(step.writes.map((write) => write.reason), ["damage-effect"]);

  // The trace is a read-only copy: reading it cannot move combat state.
  const hash = host.hash();
  assert.ok(Object.isFrozen(trace.effects));
  assert.equal(host.hash(), hash);
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
    (error) => error instanceof BattleHostError && /needs a vanilla combat object/.test(error.message)
  );
});

test("an AI-filled slot's mirror describes the fighter the roster invented, not the template's gladiator", () => {
  const host = makeHost(2);
  const fill = host.combatant("blue-fill-2");
  const mirror = host.mirrorFor("blue-fill-2");

  // The roster invents the combatant from `team.aiFill`, so this fighter has
  // DEFAULT_STATS and a rule-set maximum health of 50 + vitality * 10 = 100.
  // The template was supplied only for the equipment, armour and inventory
  // nothing else invents — and its gladiator has different stats entirely.
  assert.equal(fill.maxHealth, 100);
  assert.deepEqual(fill.stats, {
    strength: 5, agility: 5, attack: 5, defense: 5, vitality: 5, stamina: 5, magicka: 0
  });

  // The mirror used to be stored as the template, unchanged: canonical
  // `strength 5 / attack 5` against a mirror saying `strength 10 / attack 8`,
  // with `mirrorDifferences` reporting `[]` because it compared only health.
  // `game_attacker` therefore pointed at a description of a different
  // gladiator from the one on the field.
  const rewrite = host.diagnostics.aiFillMirrorRewrites.find((entry) => entry.combatantId === "blue-fill-2");
  assert.ok(rewrite, "the filled slot's mirror had to be rewritten");
  assert.ok(rewrite.differences.includes("strength 10 != strength 5"));
  assert.ok(rewrite.differences.includes("attack 8 != attack 5"));
  assert.ok(rewrite.differences.includes("speed 3 != agility 5"));
  assert.ok(rewrite.differences.includes("hitpointsmax 30 != maxHealth 100"));

  assert.equal(mirror.fields.strength, 5);
  assert.equal(mirror.fields.attack, 5);
  assert.equal(mirror.fields.speed, 5);
  assert.equal(mirror.fields.hitpointsmax, 100);
  assert.deepEqual(mirrorDifferences(mirror, fill, { includeStats: true }), []);

  // What no write can reconcile is reported instead of papered over: vanilla
  // carries a min/max damage pair and the canonical loadout carries one
  // number, so `min_damage 21` against `meleeDamage 4` has no answer here.
  const gap = host.diagnostics.aiFillLoadoutGaps.find((entry) => entry.combatantId === "blue-fill-2");
  assert.ok(gap, "the template's weapon fields still describe someone else, and that is reported");
  assert.deepEqual(gap.differences, ["min_damage 21 != loadout.meleeDamage 4"]);
  assert.match(gap.reason, /cannot write one back without inventing the other half/);
  assert.equal(mirror.fields.min_damage, 21, "the adapter did not invent a min/max damage pair");

  // Reported against what vanilla actually staged, never against the value the
  // adapter went on to write.
  const report = host.diagnostics.maximumHealthReports.find((entry) => entry.combatantId === "blue-fill-2");
  assert.deepEqual({ derived: report.ruleSetDerived, vanilla: report.vanillaHitpointsMax, agrees: report.agrees }, {
    derived: 100,
    vanilla: 30,
    agrees: false
  });
  // A supplied gladiator's own record is never rewritten this way.
  assert.deepEqual(host.diagnostics.aiFillMirrorRewrites.map((entry) => entry.combatantId), ["blue-fill-2"]);
  assert.equal(host.mirrorFor("blue-1").fields.strength, 10);
});

test("a supplied gladiator's hitpointsmax is refused, never corrected, when the rule set disagrees", () => {
  // `compareMaximumHealth` and the contract both say `hitpointsmax` is only
  // ever *reported*: it comes from vanilla's `battlevalues`, so deriving it is
  // rule-set work. The host used to call `toVanillaCombatant` on disagreement,
  // which wrote the rule set's answer straight into the licensed record — the
  // one place the contract says the adapter never corrects it.
  const vitalityRules = defineTeamRuleSet({
    id: "test-derived-maximum-health",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { runtimeVerified: false, note: "Invented; derives maximum health. Not SS2 behaviour." },
    actionTypes: ["strike"],
    // Ignores the staged `maxHealth` entirely, as a verified rule set reading
    // `herolevel * 10 + vitality * 20` would.
    maximumHealth: (combatant) => combatant.stats.vitality * 20,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction: (request) => ({
      effects: [{ kind: EffectKind.DAMAGE, targetId: request.targetId, amount: 1 }],
      events: [{ type: "strike", actorId: request.actorId, targetId: request.targetId }]
    }),
    chooseAiAction: (view, actorId, options) => options[0]
  });

  assert.throws(
    () => makeHost(1, { rules: vitalityRules }),
    (error) =>
      error instanceof BattleHostError &&
      /derives maximum health 60 for red-1, but the vanilla combat object stages hitpointsmax 30/.test(error.message) &&
      /would put a formula the adapter does not own into a licensed gladiator's record/.test(error.message)
  );

  // Staged to agree, the same rule set builds without complaint and the
  // vanilla record is left exactly as it came in.
  const host = createVanillaBattleHost({
    teams: [
      {
        id: "red",
        members: [{
          id: "red-1",
          controller: "local",
          vanilla: vanillaGladiator({ speed: 30, vitality: 3, hitpoints: 60, hitpointsmax: 60 })
        }]
      },
      {
        id: "blue",
        members: [{
          id: "blue-1",
          controller: "peer-7",
          vanilla: vanillaGladiator({ speed: 4, vitality: 3, hitpoints: 60, hitpointsmax: 60 })
        }]
      }
    ],
    rules: vitalityRules,
    rngTape: hitTape(8)
  });
  assert.deepEqual(host.diagnostics.canonicalSyncs, []);
  assert.equal(host.mirrorFor("red-1").fields.hitpointsmax, 60);
  const report = host.diagnostics.maximumHealthReports.find((entry) => entry.combatantId === "red-1");
  assert.equal(report.agrees, true);
});

test("CLOSED: a gladiator who enters already burning keeps that condition through construction", () => {
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

  // CLOSED. This test used to document a gap: the adapter could express the
  // condition declaratively, but `normaliseCombatant` hard-coded `status: []`,
  // so a gladiator who walked into the arena already burning silently stopped
  // burning — and the canonical sync then erased it from the mirror too.
  //
  // The roster now honours `source.status`, so the condition survives
  // construction and the mirror keeps agreeing with the game.
  assert.deepEqual(host.combatant("blue-1").status, ["burning"]);
  assert.equal(host.mirrorFor("blue-1").fields.burning, true);
  assert.equal(
    host.diagnostics.canonicalSyncs.some((entry) => entry.differences.some((d) => d.startsWith("burning"))),
    false,
    "the canonical sync must no longer erase a runtime-observed condition"
  );
  // The diagnostic that describes those starting conditions says they are
  // already applied. It used to be called `unappliedInitialStatusEffects`,
  // which invited a caller to set a status the fighter already had.
  assert.deepEqual(host.diagnostics.startingStatusEffects, [
    { kind: "status", targetId: "blue-1", status: "burning", active: true }
  ]);
  assert.equal("unappliedInitialStatusEffects" in host.diagnostics, false);
});

/* ------------------------------------------------------------------ */
/* 7. Every action kind and every effect kind, through the host        */
/* ------------------------------------------------------------------ */

/**
 * The whole placeholder vocabulary, driven through `createVanillaBattleHost`.
 *
 * Until this test the *only* action any host test ever submitted was `melee`,
 * and the only effect kind any of them produced was `damage`. That was the
 * hole an adversarial audit walked through: five separate combat-deciding
 * edits to `state-bridge.js` — including a `staminaleft` write computed as
 * `before - ceil(amount * 1.5)`, the exact shape the contract forbids — left
 * the whole suite green, because nothing drove a heal, a rest, a ranged
 * attack, a spell, a `STATUS` effect or a `RESOURCE` effect through the host
 * at all.
 */
function skirmishHost({ settlements = null } = {}) {
  const caster = (name, speed, overrides = {}) => vanillaGladiator({
    character_name: name,
    speed,
    magicka: 2,
    stamina: 4,
    strength: 10,
    secondary_min_damage: 7,
    maximum_ammo: 12,
    using_bow: true,
    ...overrides
  });
  return createVanillaBattleHost({
    teams: [
      {
        id: "red",
        name: "Red",
        members: [
          { id: "red-1", controller: "local", vanilla: caster("red-1", 30), clip: { gladiator_dir: "right" } },
          {
            id: "red-2",
            controller: "local",
            vanilla: caster("red-2", 29, { hitpoints: 5 }),
            clip: { gladiator_dir: "right" }
          }
        ]
      },
      {
        id: "blue",
        name: "Blue",
        members: [
          { id: "blue-1", controller: "peer-7", vanilla: caster("blue-1", 4), clip: { gladiator_dir: "left" } },
          { id: "blue-2", controller: "peer-7", vanilla: caster("blue-2", 3), clip: { gladiator_dir: "left" } }
        ]
      }
    ],
    rngTape: hitTape(40),
    onCampaignSettled: settlements ? (record) => settlements.push(record) : null
  });
}

test("heal, rest, ranged and spell all run through the host, and every write is the resolver's", () => {
  const host = skirmishHost();
  host.constructArena();

  // The roster's own default made these legal: 2 magicka and an empty
  // inventory is a caster, and the adapter no longer overrides that.
  assert.equal(host.combatant("red-1").loadout.canUseSpell, true);
  assert.equal(host.combatant("red-1").loadout.canUseRanged, true);
  assert.equal(host.combatant("red-1").loadout.rangedDamage, 7, "from secondary_min_damage, not from min_damage");
  assert.deepEqual(
    [...new Set(host.legalActions("red-1").map((action) => action.type))].sort(),
    ["melee", "ranged", "rest", "spell"]
  );

  // 1. A heal on an ally: `spellHealing` = 6 + magicka * 2 = 10 into 5/30.
  const heal = host.submit({ actorId: "red-1", type: "spell", targetId: "red-2", spellKind: "heal" });
  assert.deepEqual(heal.effects, [{ kind: "heal", targetId: "red-2", amount: 10 }]);
  assert.deepEqual(
    heal.writes.map((write) => [write.combatantId, write.field, write.source, write.from, write.to, write.reason]),
    [["red-2", "hitpoints", "canonical-health", 5, 15, "heal-effect"]],
    "a heal produces exactly one health write, attributed to the heal effect, in effect order"
  );
  assert.equal(host.vanillaState()["red-2"].combatObject.hitpoints, 15);
  // A heal must not move any pool the rule set did not touch.
  assert.equal(host.vanillaState()["red-2"].combatObject.staminaleft, 105);
  assert.equal(host.vanillaState()["red-2"].combatObject.armourclass, 44);

  // 2. Rest, which is self-targeted: `restRecovery` = 4 + stamina * 1.5 = 10.
  const rest = host.submit({ actorId: "red-2", type: "rest", targetId: "red-2" });
  assert.deepEqual(rest.effects, [{ kind: "heal", targetId: "red-2", amount: 10 }]);
  assert.deepEqual(
    rest.writes.map((write) => [write.combatantId, write.field, write.source, write.from, write.to]),
    [["red-2", "hitpoints", "canonical-health", 15, 25]]
  );
  // The self-target does not alias the four binding globals onto one unit.
  const restBind = rest.commands.find((command) => command.kind === CommandKind.BIND_GLOBALS);
  assert.equal(restBind.globals.selfTargeted, true);
  assert.equal(restBind.globals.defender, null);
  assert.equal(restBind.globals.game_defender, null);
  assert.deepEqual(
    rest.commands.filter((command) => command.kind === CommandKind.CLIP_GOTO).map((command) => [command.role, command.label]),
    [["actor", "rest"]]
  );

  // 3. Blue rests too, at full health: a zero-amount heal writes nothing.
  const idle = host.submit({ actorId: "blue-1", type: "rest", targetId: "blue-1" });
  assert.deepEqual(idle.effects, [{ kind: "heal", targetId: "blue-1", amount: 0 }]);
  assert.deepEqual(idle.writes, [], "no canonical value changed, so no vanilla field is written");
  host.submit({ actorId: "blue-2", type: "rest", targetId: "blue-2" });

  // 4. A ranged attack: `rangedDamage` 7 + strength * 2 = 27.
  const ranged = host.submit({ actorId: "red-1", type: "ranged", targetId: "blue-1" });
  assert.equal(ranged.effects[0].amount, 27);
  assert.deepEqual(
    ranged.writes.map((write) => [write.combatantId, write.field, write.source, write.to, write.reason]),
    [["blue-1", "hitpoints", "canonical-health", 3, "damage-effect"]]
  );
  assert.equal(
    ranged.commands.find((command) => command.kind === CommandKind.CLIP_GOTO && command.role === "actor").label,
    "snipe"
  );

  // 5. A damage spell: `spellDamage` = 8 + magicka * 2.5 = 13, clamped to 0.
  const spell = host.submit({ actorId: "red-2", type: "spell", targetId: "blue-1", spellKind: "damage" });
  assert.equal(spell.effects[0].amount, 13);
  assert.deepEqual(
    spell.writes.map((write) => [write.combatantId, write.field, write.source, write.to]),
    [["blue-1", "hitpoints", "canonical-health", 0]],
    "the resolver clamped 3 - 13 to 0, and the write is that 0"
  );
  assert.notEqual(spell.writes[0].to, 3 - 13);
  assert.equal(
    spell.commands.some((command) => command.kind === CommandKind.CLIP_GOTO && command.role === "defeated"),
    true
  );

  // Across every one of those actions: only ever `hitpoints`, only ever from
  // canonical health, and never a value the projection does not hold.
  const everyWrite = host.steps.flatMap((step) => step.writes);
  assert.deepEqual([...new Set(everyWrite.map((write) => write.field))], ["hitpoints"]);
  assert.deepEqual([...new Set(everyWrite.map((write) => write.source))], ["canonical-health"]);
  const after = host.wire().teams.flatMap((team) => team.combatants);
  const byId = new Map(after.map((combatant) => [combatant.id, combatant]));
  assert.equal(host.mirrorFor("blue-1").fields.staminaleft, 105, "no action ever spent stamina");
  for (const combatant of after) {
    assert.deepEqual(mirrorDifferences(host.mirrorFor(combatant.id), byId.get(combatant.id)), []);
  }
});

test("STATUS and RESOURCE effects reach vanilla through the host, in the order the rule set declared them", () => {
  /**
   * DEMONSTRATION ONLY — invented, never measured. It declares all four effect
   * kinds in one action, in one order, so the host has to carry each of them
   * to the right vanilla field without deciding any of them.
   */
  const scorch = defineTeamRuleSet({
    id: "test-scorch",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { runtimeVerified: false, note: "Invented; exercises all four effect kinds. Not SS2 behaviour." },
    actionTypes: ["scorch", "douse"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 30,
    legalActions: (view) => [
      ...view.foes.map((foe) => ({ type: "scorch", targetId: foe.id })),
      ...view.foes.map((foe) => ({ type: "douse", targetId: foe.id }))
    ],
    resolveAction(request) {
      if (request.type === "douse") {
        return {
          effects: [{ kind: EffectKind.STATUS, targetId: request.targetId, status: "burning", active: false }],
          events: [{ type: "spell", actorId: request.actorId, targetId: request.targetId, hit: true, damage: 0 }]
        };
      }
      const armour = resourceValue(request.target, "armourclass");
      const stamina = resourceValue(request.actor, "staminaleft");
      return {
        effects: [
          // Armour first, then the overflow, then the condition, then the
          // actor's own stamina. All four decided here and none of them here.
          { kind: EffectKind.RESOURCE, targetId: request.targetId, resource: "armourclass", to: Math.max(0, armour - 50) },
          { kind: EffectKind.DAMAGE, targetId: request.targetId, amount: Math.max(0, 50 - armour) },
          { kind: EffectKind.STATUS, targetId: request.targetId, status: "burning", active: true },
          { kind: EffectKind.RESOURCE, targetId: request.actorId, resource: "staminaleft", to: stamina - 9 }
        ],
        events: [{ type: "spell", actorId: request.actorId, targetId: request.targetId, hit: true, damage: 6 }]
      };
    },
    chooseAiAction: (view, actorId, options) => options[0]
  });

  const host = createVanillaBattleHost({
    teams: [
      {
        id: "red",
        name: "Red",
        members: [{
          id: "red-1",
          controller: "local",
          vanilla: vanillaGladiator({ speed: 30 }),
          clip: { gladiator_dir: "right" }
        }]
      },
      {
        id: "blue",
        name: "Blue",
        members: [{
          id: "blue-1",
          controller: "peer-7",
          vanilla: vanillaGladiator({ speed: 4 }),
          clip: { gladiator_dir: "left" }
        }]
      }
    ],
    rules: scorch,
    rngTape: hitTape(8)
  });
  host.constructArena();

  const step = host.submit({ actorId: "red-1", type: "scorch", targetId: "blue-1" });
  assert.deepEqual(step.effects.map((effect) => effect.kind), ["resource", "damage", "status", "resource"]);
  assert.deepEqual(
    step.writes.map((write) => [write.combatantId, write.field, write.source, write.from, write.to, write.reason]),
    [
      ["blue-1", "armourclass", "declared-resource", 44, 0, "resource-effect"],
      ["blue-1", "hitpoints", "canonical-health", 30, 24, "damage-effect"],
      ["blue-1", "burning", "canonical-status", undefined, true, "status-effect"],
      ["red-1", "staminaleft", "declared-resource", 105, 96, "resource-effect"]
    ],
    "one write per effect, in effect order, each from the source that owns that field"
  );
  // The first write to an undefined-until-set flag *creates* it.
  assert.equal(step.writes[2].materialises, true);
  assert.deepEqual(step.unmapped, []);

  // Every value is one the post-action projection actually holds.
  const after = new Map(host.wire().teams.flatMap((team) => team.combatants).map((c) => [c.id, c]));
  assert.equal(step.writes[0].to, after.get("blue-1").resources.armourclass.value);
  assert.equal(step.writes[1].to, after.get("blue-1").health);
  assert.equal(step.writes[3].to, after.get("red-1").resources.staminaleft.value);
  // ...and none of them is the subtraction the rule set performed.
  assert.notEqual(step.writes[1].to, 30 - 6 - 1);

  const blue = host.vanillaState()["blue-1"].combatObject;
  assert.deepEqual(
    { hitpoints: blue.hitpoints, armourclass: blue.armourclass, burning: blue.burning, armourclass_max: blue.armourclass_max },
    { hitpoints: 24, armourclass: 0, burning: true, armourclass_max: 44 },
    "the pool moved, the overflow landed, the flag was created, the bound was left alone"
  );
  assert.equal(host.vanillaState()["red-1"].combatObject.staminaleft, 96);

  // Clearing the condition writes the flag back, and reports its real previous
  // value rather than materialising it a second time.
  // A status effect the rule set declared is always mirrored, even when it
  // changed nothing: the value written is still `after.status.includes(flag)`,
  // so it is the resolver's answer, and on a flag nothing had written yet the
  // write is what *creates* the vanilla field.
  const doused = host.submit({ actorId: "blue-1", type: "douse", targetId: "red-1" });
  assert.deepEqual(
    doused.writes.map((write) => [write.combatantId, write.field, write.source, write.to, write.materialises]),
    [["red-1", "burning", "canonical-status", false, true]]
  );
  assert.equal(host.combatant("red-1").status.includes("burning"), false);
  const cleared = host.submit({ actorId: "red-1", type: "douse", targetId: "blue-1" });
  assert.deepEqual(
    cleared.writes.map((write) => [write.combatantId, write.field, write.source, write.from, write.to]),
    [["blue-1", "burning", "canonical-status", true, false]]
  );
  assert.equal(cleared.writes[0].materialises, false);
  assert.equal(host.vanillaState()["blue-1"].combatObject.burning, false);
});

test("a placeholder rule set that declares no armour effect still writes only hitpoints", () => {
  const host = makeHost(1);
  fightToSettlement(host);

  const everyWrite = host.steps.flatMap((step) => step.writes);
  assert.deepEqual(
    [...new Set(everyWrite.map((write) => write.field))],
    ["hitpoints"],
    "the only field the whole battle ever wrote"
  );
  // EffectKind gained a generic resource kind rather than a bespoke armour
  // one: a bespoke kind would put an SS2 noun inside a game-agnostic resolver
  // and need a sibling for stamina, ammo and everything after.
  assert.deepEqual(Object.values(EffectKind).sort(), ["damage", "heal", "resource", "status"]);

  // The defeated fighter is at 0 hitpoints with all 44 points of armour still
  // standing, and that is right: `classicStyleRules` has no armour rule, and
  // the adapter may not invent the subtraction. A vanilla-shaped outcome needs
  // a rule set that declares the split — the test below — not adapter code.
  const defeated = host.vanillaState()["blue-1"].combatObject;
  assert.deepEqual({ hitpoints: defeated.hitpoints, armourclass: defeated.armourclass }, {
    hitpoints: 0,
    armourclass: 44
  });
  assert.deepEqual(mirrorDifferences(host.mirrorFor("blue-1"), host.combatant("blue-1")), []);
});

test("an armour-first split declared by a rule set reaches armourclass, in effect order", () => {
  const host = createVanillaBattleHost({
    teams: [
      { id: "red", members: [{ id: "red-1", controller: "local", vanilla: vanillaGladiator({ speed: 30 }) }] },
      { id: "blue", members: [{ id: "blue-1", controller: "peer-7", vanilla: vanillaGladiator({ speed: 4 }) }] }
    ],
    rules: armourFirstRules
  });

  const step = host.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });
  assert.deepEqual(step.unmapped, []);
  assert.deepEqual(
    step.writes.map((write) => [write.combatantId, write.field, write.from, write.to, write.reason]),
    [
      ["blue-1", "armourclass", 44, 0, "resource-effect"],
      ["blue-1", "hitpoints", 30, 14, "damage-effect"]
    ],
    "armour first, then the overflow: the write order is the effect order"
  );
  assert.equal(step.writes[0].path, "_root.arena.team_arena.state.villain_1");
  assert.equal(step.writes[0].target, WriteTarget.COMBAT_OBJECT);

  // The live vanilla object now holds a state vanilla could actually be in.
  const combatObject = host.vanillaState()["blue-1"].combatObject;
  assert.deepEqual({ hitpoints: combatObject.hitpoints, armourclass: combatObject.armourclass }, {
    hitpoints: 14,
    armourclass: 0
  });
  // Nothing about the split was the adapter's: 60 - 44 never appears here, the
  // write value is the resolver's post-action projection.
  assert.equal(host.combatant("blue-1").resources.armourclass.value, 0);
  assert.equal(host.combatant("blue-1").health, 14);
  assert.deepEqual(mirrorDifferences(host.mirrorFor("blue-1"), host.combatant("blue-1")), []);

  // Blue strikes back, so the same split lands on the *other* side of the
  // binding — which only works because both sides declared the resource.
  const reply = host.submit({ actorId: "blue-1", type: "strike", targetId: "red-1" });
  assert.deepEqual(
    reply.writes.map((write) => [write.combatantId, write.field, write.from, write.to]),
    [["red-1", "armourclass", 44, 0], ["red-1", "hitpoints", 30, 14]]
  );

  // A second blow with blue's pool already empty spills the lot.
  host.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });
  assert.equal(host.vanillaState()["blue-1"].combatObject.hitpoints, 0);
  assert.equal(host.battle.result.winnerTeamId, "red");
  // Blue's armour was written once: an unchanged pool is not rewritten again.
  assert.equal(
    host.steps
      .flatMap((step) => step.writes)
      .filter((write) => write.field === "armourclass" && write.combatantId === "blue-1").length,
    1
  );
});

test("CLOSED: a rule set reads armour off the canonical view, and the hash covers it", () => {
  const seen = [];
  /**
   * DEMONSTRATION ONLY — not SS2 behaviour and not a proposal. It exists to
   * show what a runtime-verified rule set can now do *without* a side channel:
   * read armour out of the view the resolver handed it.
   */
  const armourAware = defineTeamRuleSet({
    id: "test-armour-reader",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: {
      runtimeVerified: false,
      note: "Demonstration of the canonical resource bag. Invented; never measured against the licensed build."
    },
    actionTypes: ["strike"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction(request) {
      seen.push(Object.keys(request.target).sort());
      const armour = resourceValue(request.target, "armourclass");
      const spilled = Math.max(0, 25 - armour);
      return {
        effects: [{ kind: EffectKind.DAMAGE, targetId: request.targetId, amount: spilled }],
        events: [{ type: "strike", actorId: request.actorId, targetId: request.targetId, damage: spilled }]
      };
    },
    chooseAiAction: (view, actorId, options) => options[0]
  });

  const build = (armourclass) => createVanillaBattleHost({
    teams: [
      { id: "red", members: [{ id: "red-1", controller: "local", vanilla: vanillaGladiator({ speed: 30 }) }] },
      { id: "blue", members: [{ id: "blue-1", controller: "peer-7", vanilla: vanillaGladiator({ speed: 4, armourclass }) }] }
    ],
    rules: armourAware
  });

  const armoured = build(44);
  const bare = build(0);

  // This test used to document the gap: two peers that disagreed about 44
  // points of armour hashed *identically*, because the adapter's mirror was
  // the only carrier for armour and the projection could not see it. A hash
  // that agrees right up to the moment two peers diverge is not a desync
  // check. `toCanonicalCombatantSource` now emits the resource bag, so the
  // disagreement is visible before the first action rather than after it.
  assert.notEqual(armoured.hash(), bare.hash(), "armourclass is in the combat state hash");
  assert.equal(armoured.combatant("blue-1").resources.armourclass.value, 44);
  assert.equal(bare.combatant("blue-1").resources.armourclass.value, 0);

  armoured.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });
  bare.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });

  // The rule set still cannot see the vanilla record, and it no longer needs
  // to: `resources` is on the view, and the invariant that makes that sound is
  // that the projection carries everything the view does.
  assert.deepEqual(seen[0], [
    "aiFilled", "alive", "health", "id", "loadout", "maxHealth",
    "name", "resources", "seatId", "slotIndex", "stats", "status", "teamId"
  ].sort());
  assert.equal(seen[0].includes("vanilla"), false);
  assert.equal(seen[0].includes("armourclass"), false, "armour arrives inside `resources`, not as a top-level field");

  assert.equal(armoured.combatant("blue-1").health, 30);
  assert.equal(bare.combatant("blue-1").health, 5);
});

/** DEMONSTRATION ONLY. A vocabulary that kills both fighters at once. */
const mutualDestruction = defineTeamRuleSet({
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

/** A host whose every fighter can wipe the pair, so a draw is reachable. */
function drawnHost(size, settlements) {
  const member = (side, index) => ({
    id: `${side}-${index + 1}`,
    controller: side === "red" ? "local" : "peer-7",
    vanilla: vanillaGladiator({ speed: side === "red" ? 30 - index : 4 - index })
  });
  const team = (side) => ({
    id: side,
    name: side,
    members: Array.from({ length: size }, (unused, index) => member(side, index))
  });
  return createVanillaBattleHost({
    teams: [team("red"), team("blue")],
    rules: mutualDestruction,
    onCampaignSettled: settlements ? (record) => settlements.push(record) : null
  });
}

test("CLOSED: a drawn battle settles end to end through the bridge, on the death animations alone", () => {
  const settlements = [];
  const host = drawnHost(1, settlements);
  const step = host.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });

  assert.equal(host.battle.result.reason, "draw");
  assert.equal(host.battle.result.winnerTeamId, null);
  assert.equal(step.bridgeStatus, "armed");

  // Presentation still reports the missing transition rather than guessing
  // one — vanilla's `death()` dispatches only `combatwon`/`combatlost` — but
  // the record now names what acknowledges a draw instead.
  // (The `strike` action event is also unmapped: these placeholder bindings
  // serve the melee/ranged/spell/rest vocabulary, not this test vocabulary.)
  const unmapped = step.commands.filter((command) => command.kind === CommandKind.UNMAPPED);
  assert.equal(unmapped.length, 2);
  const drawCommand = unmapped.find((command) => /no draw transition/.test(command.reason));
  assert.match(drawCommand.detail.acknowledgedBy, /completed death animations/);
  assert.equal(drawCommand.detail.winnerTeamId, null);
  assert.equal(unmapped.filter((command) => /no animation binding/.test(command.reason)).length, 1);
  assert.equal(
    step.commands.some((command) => command.kind === CommandKind.ARENA_GOTO),
    false,
    "a draw reaches no arena transition, so none may be dispatched"
  );

  // The bridge says outright that there is no arena label to wait for.
  assert.equal(host.bridge.expectedArenaLabel, null);
  assert.equal(host.bridge.expectsArenaLabel, false);
  assert.match(host.bridge.unmappedArenaTransition, /no draw transition/);
  // A draw eliminates both teams, so every fighter's animation is awaited.
  assert.deepEqual([...host.bridge.awaitingDeathAnimations].sort(), ["blue-1", "red-1"]);

  // This is the whole acknowledgement: the deaths, and the last one settles.
  assert.equal(host.bridge.reportDeathAnimation("red-1").settled, false);
  assert.deepEqual(settlements, []);
  const final = host.bridge.reportDeathAnimation("blue-1");
  assert.equal(final.settled, true);
  assert.equal(host.bridge.status, "settled");
  assert.equal(isCampaignSettled(host.battle), true);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].winnerTeamId, null);
  assert.equal(settlements[0].reason, "draw");
  assert.deepEqual(settlements[0].loserTeamIds, ["blue", "red"]);
  assert.equal(settlements[0].acknowledgedToken, host.bridge.pendingToken);

  // Once only, exactly as an elimination is.
  for (let repeat = 0; repeat < 3; repeat += 1) {
    const again = host.bridge.reportDeathAnimation("blue-1");
    assert.equal(again.settled, false);
    assert.equal(again.alreadySettled, true);
  }
  assert.equal(settlements.length, 1);
  // And the resolver's own gate agrees it is already paid.
  assert.equal(
    acknowledgeResultAnimation(host.battle, {
      type: BATTLE_RESULT_ACK_TYPE,
      completionToken: host.bridge.pendingToken
    }),
    false
  );
  assert.equal(settlements.length, 1);

  // Reporting an arena label for a draw is still a refusal: the surface and
  // the resolved result disagree, and a desync is not settled.
  assert.throws(
    () => host.bridge.reportArenaLabel("combat_won"),
    (error) => error instanceof AcknowledgementError && /a draw/.test(error.message)
  );
});

test("a drawn 2v2 settles through the host's own animation drain, with no arena transition", () => {
  const settlements = [];
  const host = drawnHost(2, settlements);
  host.constructArena();

  host.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });
  assert.equal(host.battle.result, null, "two fighters down is not a decided 2v2");
  host.submit({ actorId: "red-2", type: "strike", targetId: "blue-2" });
  assert.equal(host.battle.result.reason, "draw");

  const outcomes = reportAnimationSurface(host);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.kind),
    ["death", "death", "death", "death"],
    "no arena-label step: a draw has no vanilla transition to report"
  );
  assert.deepEqual([...outcomes.map((outcome) => outcome.combatantId)].sort(), [
    "blue-1", "blue-2", "red-1", "red-2"
  ]);
  assert.deepEqual(outcomes.map((outcome) => outcome.settled), [false, false, false, true]);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].winnerTeamId, null);

  // Draining again has nothing left to report and pays nothing again.
  assert.deepEqual(host.acknowledgeResultAnimations({ ...animationSurface(host), deaths: [] }), []);
  assert.equal(settlements.length, 1);

  // An explicit arena label is still offered to the bridge, and still refused.
  assert.throws(
    () => reportAnimationSurface(host, { arenaLabel: "combat_won" }),
    (error) => error instanceof AcknowledgementError && /a draw/.test(error.message)
  );
  // A mismatched completion token is refused before the deaths are reported,
  // because in a draw the last death is what settles.
  const fresh = drawnHost(2, []);
  fresh.submit({ actorId: "red-1", type: "strike", targetId: "blue-1" });
  fresh.submit({ actorId: "red-2", type: "strike", targetId: "blue-2" });
  assert.throws(
    () => reportAnimationSurface(fresh, { completionToken: "team-arena:red:blue:elimination" }),
    (error) => error instanceof AcknowledgementError && /does not match the armed result/.test(error.message)
  );
  assert.equal(fresh.bridge.isSettled, false);
  assert.deepEqual([...fresh.bridge.awaitingDeathAnimations].sort(), [
    "blue-1", "blue-2", "red-1", "red-2"
  ]);
  // The right token settles it.
  assert.equal(
    reportAnimationSurface(fresh).at(-1).settled,
    true
  );
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
  reportAnimationSurface(host);

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
