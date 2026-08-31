import test from "node:test";
import assert from "node:assert/strict";

import {
  acknowledgeResultAnimation,
  applyAction,
  BATTLE_RESULT_ACK_TYPE,
  BATTLE_RESULT_PENDING_TYPE,
  combatStateHash,
  createTeamBattle,
  currentCombatant,
  defineTeamRuleSet,
  EffectKind,
  RuleSetVerification,
  toTeamWireState
} from "../src/team/index.js";

import {
  absentResourceSources,
  AcknowledgementError,
  AdapterStateError,
  ALLOWED_WRITE_FIELDS,
  applyVanillaWrites,
  assertMirrorAgrees,
  assertWriteProvenance,
  ARENA_Y,
  buildArenaLayout,
  bindingPlanFor,
  CANONICAL_RESOURCE_SOURCES,
  CANONICAL_STAT_SOURCES,
  canonicalResourcesFrom,
  canonicalStatusesFrom,
  citationFor,
  ClipRegistryError,
  CommandKind,
  compareMaximumHealth,
  createClipRegistry,
  createPresentationBinder,
  createResultAcknowledgementBridge,
  denormaliseVanillaCombatant,
  DEATH_STATUS_CLEAR_ORDER,
  facingWrite,
  HERO_SIDE,
  initialStatusEffects,
  isResourceBackedVanillaField,
  LabelProvenance,
  loadoutMirrorDifferences,
  MAP_SILENCE,
  mirrorDifferences,
  normaliseVanillaCombatant,
  placeholderLoadoutFrom,
  PLACEHOLDER_ANIMATION_BINDINGS,
  presentArenaConstruction,
  presentResolvedEvents,
  PresentationError,
  readStatusFlag,
  resultLabelsFor,
  SlotLayoutError,
  SS2_STATIC_MAP_BINDINGS,
  STATUS_FLAG_FIELDS,
  toCanonicalCombatantSource,
  toVanillaCombatant,
  VANILLA_FIGHTER_DEPTHS,
  VANILLA_FRONT_X,
  VANILLA_RESERVED_DEPTHS,
  VANILLA_SHADOW_DEPTHS,
  vanillaWritesForResolvedAction,
  VILLAIN_SIDE,
  WriteSource,
  WriteTarget
} from "../src/adapter/index.js";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * A vanilla persistent combat object as the map describes one *before*
 * anything has written a status: the six flags are simply absent, and there is
 * no `gladiator_dir` — the facing lives on the fighter clip.
 */
const freshVanillaGladiator = (overrides = {}) => ({
  character_name: "Prisoner",
  herolevel: 1,
  character_level: 1,
  strength: 10,
  speed: 4,
  attack: 1,
  defence: 1,
  vitality: 3,
  stamina: 1,
  charisma: 2,
  magicka: 1,
  hitpoints: 30,
  hitpointsmax: 30,
  staminaleft: 105,
  staminamax: 110,
  armourclass: 44,
  armourclass_max: 44,
  ammo_left: 0,
  maximum_ammo: 0,
  min_damage: 21,
  max_damage: 23,
  physical_size: 87,
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
  equipped_weapon: 1,
  using_bow: false,
  weapon_enchantment_type: 0,
  weapon_enchantment_potency: 0,
  inventory1: 30,
  inventory2: 43,
  inventory3: 0,
  inventory4: 0,
  inventory5: 0,
  inventory6: 0,
  psyche_up: 0,
  spell_colossus: 0,
  spell_bloodlust: 0,
  ...overrides
});

const brute = (id, agility, controller = "local") => ({
  id,
  name: id,
  controller,
  stats: { strength: 10, agility, attack: 40, defense: 0, vitality: 0, stamina: 5, magicka: 0 },
  loadout: { meleeDamage: 40, rangedDamage: 10, canUseRanged: false, canUseSpell: false, canHeal: false }
});

const hitTape = (count) =>
  Array.from({ length: count }, () => ({ label: "hit-roll", source: "unit", min: 0, max: 1, value: 0 }));

/** Team `red` always outruns team `blue`, so knockouts land in a known order. */
function makeBattle(redSize, blueSize, options = {}) {
  const red = { id: "red", name: "Red", slots: redSize, combatants: [] };
  const blue = { id: "blue", name: "Blue", slots: blueSize, combatants: [] };
  for (let index = 0; index < redSize; index += 1) red.combatants.push(brute(`red-${index + 1}`, 20 - index));
  for (let index = 0; index < blueSize; index += 1) blue.combatants.push(brute(`blue-${index + 1}`, 5 - index));
  return createTeamBattle({ teams: [red, blue], rngTape: hitTape(24), ...options });
}

const melee = (battle, targetId) => ({ actorId: currentCombatant(battle).id, type: "melee", targetId });

/** Runs red's fighters through blue's until blue is eliminated. */
function eliminateBlue(battle) {
  const blueIds = battle.teams.find((team) => team.id === "blue").combatants.map((combatant) => combatant.id);
  for (const targetId of blueIds) {
    applyAction(battle, melee(battle, targetId));
    if (battle.result) break;
  }
  return battle;
}

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
};

/* ------------------------------------------------------------------ */
/* State bridge: undefined-until-set flags                             */
/* ------------------------------------------------------------------ */

test("the six status flags are undefined until set and normalise to false, with the absence recorded", () => {
  const source = freshVanillaGladiator();
  for (const flag of STATUS_FLAG_FIELDS) {
    assert.equal(source[flag], undefined, `${flag} must be absent on a fresh combat object`);
    const read = readStatusFlag(source, flag);
    assert.deepEqual({ ...read }, { name: flag, absent: true, value: false });
  }

  const record = normaliseVanillaCombatant(source);
  assert.deepEqual([...record.materialisedFlags].sort(), [...STATUS_FLAG_FIELDS].sort());
  for (const flag of STATUS_FLAG_FIELDS) assert.equal(record.fields[flag], false);
});

test("an explicitly false flag and an absent flag produce identical canonical state", () => {
  const absent = normaliseVanillaCombatant(freshVanillaGladiator());
  const explicit = normaliseVanillaCombatant(
    freshVanillaGladiator(Object.fromEntries(STATUS_FLAG_FIELDS.map((flag) => [flag, false])))
  );
  assert.deepEqual(absent.fields, explicit.fields);
  assert.deepEqual(explicit.materialisedFlags, []);

  const fromAbsent = toCanonicalCombatantSource(freshVanillaGladiator(), { id: "a" }).combatant;
  const fromExplicit = toCanonicalCombatantSource(
    freshVanillaGladiator(Object.fromEntries(STATUS_FLAG_FIELDS.map((flag) => [flag, false]))),
    { id: "a" }
  ).combatant;
  assert.deepEqual(fromAbsent, fromExplicit);
});

test("a set flag survives into the canonical status list in the byte-verified death-clear order", () => {
  const record = normaliseVanillaCombatant(freshVanillaGladiator({ poison: true, frozen: true, taunted2: 1 }));
  assert.deepEqual(canonicalStatusesFrom(record.fields), ["frozen", "poison", "taunted2"]);
  assert.deepEqual(DEATH_STATUS_CLEAR_ORDER.slice(0, 4), ["frozen", "burning", "poison", "life_stolen"]);
});

/* ------------------------------------------------------------------ */
/* State bridge: clip-resident facing                                  */
/* ------------------------------------------------------------------ */

test("gladiator_dir is read from the fighter clip and never stored on the combat object", () => {
  const record = normaliseVanillaCombatant(freshVanillaGladiator(), { clip: { gladiator_dir: "left" } });
  assert.equal(record.clip.gladiator_dir, "left");
  assert.equal(record.facingSource, "fighter-clip");
  assert.ok(!("gladiator_dir" in record.fields), "the facing must not appear on the combat object");

  const split = denormaliseVanillaCombatant(record);
  assert.ok(!("gladiator_dir" in split.combatObject));
  assert.deepEqual(split.fighterClip, { gladiator_dir: "left" });
});

test("a facing found on the combat object is accepted as a staging artefact and reported as one", () => {
  const record = normaliseVanillaCombatant(freshVanillaGladiator({ gladiator_dir: "left" }));
  assert.equal(record.clip.gladiator_dir, "left");
  assert.equal(record.facingSource, "combat-object");
  assert.ok(!("gladiator_dir" in record.fields));

  const clipWins = normaliseVanillaCombatant(
    freshVanillaGladiator({ gladiator_dir: "left" }),
    { clip: { gladiator_dir: "right" } }
  );
  assert.equal(clipWins.clip.gladiator_dir, "right");
  assert.equal(clipWins.facingSource, "fighter-clip");
});

test("a missing facing defaults to the vanilla hero facing and an invalid one is refused", () => {
  assert.equal(normaliseVanillaCombatant(freshVanillaGladiator()).facingSource, "default");
  assert.equal(normaliseVanillaCombatant(freshVanillaGladiator()).clip.gladiator_dir, "right");
  assert.throws(
    () => normaliseVanillaCombatant(freshVanillaGladiator({ gladiator_dir: "up" })),
    AdapterStateError
  );
});

test("the facing write is the only write that targets the fighter clip", () => {
  const record = normaliseVanillaCombatant(freshVanillaGladiator(), { clip: { gladiator_dir: "right" } });
  const layout = buildArenaLayout(toTeamWireState(makeBattle(1, 1)));
  const write = facingWrite("red-1", layout.placementFor("red-1"), record, "left");
  assert.equal(write.target, WriteTarget.FIGHTER_CLIP);
  assert.equal(write.path, "_root.arena.gladiators.hero");
  assert.deepEqual([write.field, write.from, write.to], ["gladiator_dir", "right", "left"]);
});

/* ------------------------------------------------------------------ */
/* State bridge: totality and round trip                               */
/* ------------------------------------------------------------------ */

test("normalisation is total: unnamed spell_* fields and unknown fields round-trip unchanged", () => {
  const source = freshVanillaGladiator({ spell_regenerate: 17, some_future_field: "kept" });
  const record = normaliseVanillaCombatant(source);
  assert.ok(record.timedSpellFields.includes("spell_regenerate"));
  assert.ok(record.timedSpellFields.includes("spell_colossus"));
  assert.deepEqual(record.unknownFields, ["some_future_field"]);
  assert.equal(record.fields.spell_regenerate, 17);
  assert.equal(record.fields.some_future_field, "kept");

  const { combatObject } = denormaliseVanillaCombatant(record);
  for (const [key, value] of Object.entries(source)) {
    assert.deepEqual(combatObject[key], value, `${key} must survive the round trip`);
  }
});

test("the canonical stat mapping reconciles names without transforming any value", () => {
  const source = freshVanillaGladiator();
  const { combatant, vanilla } = toCanonicalCombatantSource(source, { id: "red-1", teamId: "red" });
  assert.deepEqual(combatant.stats, {
    strength: 10,
    agility: 4, // <- vanilla `speed`
    attack: 1,
    defense: 1, // <- vanilla `defence`
    vitality: 3,
    stamina: 1,
    magicka: 1
  });
  assert.equal(CANONICAL_STAT_SOURCES.agility, "speed");
  assert.equal(CANONICAL_STAT_SOURCES.defense, "defence");
  assert.equal(combatant.health, 30);
  assert.equal(combatant.maxHealth, 30);
  assert.equal(combatant.name, "Prisoner");
  // charisma has no canonical slot; it survives only in the vanilla record.
  assert.equal("charisma" in combatant.stats, false);
  assert.equal(vanilla.fields.charisma, 2);
  // armour is never folded into canonical health: the armour-first split is a formula.
  assert.equal(vanilla.fields.armourclass, 44);
});

test("canonical state mirrors back onto the vanilla record and changes nothing else", () => {
  // The expectation is built from the *source object*, not from anything
  // `toVanillaCombatant` returns. The previous version of this test asserted
  // the mirrored record against `mirrorDifferences`, which compares exactly
  // the fields `toVanillaCombatant` writes — so it could only ever pass, for
  // any pair of functions that agreed with each other about anything.
  const source = freshVanillaGladiator();
  const record = normaliseVanillaCombatant(source);
  const canonical = { id: "red-1", health: 12, maxHealth: 30, status: ["burning"], alive: true };
  const mirrored = toVanillaCombatant(canonical, record);

  const expected = {
    ...source,
    hitpoints: 12,
    burning: true,
    frozen: false,
    poison: false,
    life_stolen: false,
    taunted1: false,
    taunted2: false
  };
  assert.deepEqual(mirrored.fields, expected, "exactly hitpoints and the six flags move; every other key is untouched");
  assert.deepEqual(Object.keys(mirrored.fields).sort(), Object.keys(expected).sort());
  assert.equal(mirrored.clip.gladiator_dir, record.clip.gladiator_dir);

  // `hitpointsmax` is deliberately NOT among them: it is vanilla's
  // `battlevalues` output, so writing canonical `maxHealth` over it would put
  // the rule set's formula into a licensed gladiator's record. The staged 30
  // survives even though this canonical state was handed a different one.
  const disagreeing = { ...canonical, maxHealth: 80 };
  assert.equal(toVanillaCombatant(disagreeing, record).fields.hitpointsmax, 30);
  assert.equal(source.hitpointsmax, 30, "and the source object itself is never mutated");
  // Only the one record with no licensed gladiator behind it opts in.
  assert.equal(toVanillaCombatant(disagreeing, record, { maxHealth: true }).fields.hitpointsmax, 80);
});

/* ------------------------------------------------------------------ */
/* State bridge: the READ side decides nothing either                  */
/* ------------------------------------------------------------------ */

test("the conversion emits only the loadout keys a named vanilla field answers", () => {
  const { combatant, omittedLoadoutKeys } = toCanonicalCombatantSource(freshVanillaGladiator(), { id: "red-1" });

  // `min_damage` is there, `secondary_min_damage` is not, and `using_bow`
  // answers `canUseRanged`. Nothing else is stated.
  assert.deepEqual(combatant.loadout, { meleeDamage: 21, canUseRanged: false });
  assert.deepEqual([...omittedLoadoutKeys].sort(), ["canHeal", "canUseSpell", "rangedDamage"]);

  // `rangedDamage` used to fall back to `min_damage`, which silently said
  // "this gladiator's bow hits exactly as hard as its sword" for every
  // gladiator without a second weapon.
  assert.equal("rangedDamage" in combatant.loadout, false);
  const armed = toCanonicalCombatantSource(freshVanillaGladiator({ secondary_min_damage: 7 }), { id: "red-1" });
  assert.equal(armed.combatant.loadout.rangedDamage, 7);
  assert.equal(armed.omittedLoadoutKeys.includes("rangedDamage"), false);

  // `canUseRanged` is a real reading of two real fields, in both directions.
  const quiver = toCanonicalCombatantSource(freshVanillaGladiator({ maximum_ammo: 12 }), { id: "red-1" });
  assert.equal(quiver.combatant.loadout.canUseRanged, true);
  const bow = toCanonicalCombatantSource(freshVanillaGladiator({ using_bow: true }), { id: "red-1" });
  assert.equal(bow.combatant.loadout.canUseRanged, true);
  // An empty quiver is not a bow: `maximum_ammo: 0` means no ranged attack.
  assert.equal(
    toCanonicalCombatantSource(freshVanillaGladiator({ maximum_ammo: 0, using_bow: false }), { id: "red-1" })
      .combatant.loadout.canUseRanged,
    false
  );

  // A caller that wants the whole placeholder bridge asks for it by name.
  const explicit = toCanonicalCombatantSource(freshVanillaGladiator(), {
    id: "red-1",
    loadout: placeholderLoadoutFrom(freshVanillaGladiator())
  });
  assert.deepEqual(explicit.combatant.loadout, {
    meleeDamage: 21,
    rangedDamage: 21,
    canUseRanged: false,
    canUseSpell: true,
    canHeal: true
  });
  assert.deepEqual(explicit.omittedLoadoutKeys, []);
});

test("the adapter never answers canUseSpell or canHeal, because inverting the roster's default in both directions is deciding combat", () => {
  // The inventory id sets are the adapter's own decision labels, not a vanilla
  // field, and stating them always beat `roster.normaliseCombatant`'s own
  // `stats.magicka > 0` — in both directions.
  const caster = freshVanillaGladiator({
    magicka: 20,
    inventory1: 0, inventory2: 0, inventory3: 0, inventory4: 0, inventory5: 0, inventory6: 0
  });
  const converted = toCanonicalCombatantSource(caster, { id: "red-1" });
  assert.equal("canUseSpell" in converted.combatant.loadout, false);
  assert.equal("canHeal" in converted.combatant.loadout, false);
  // The adapter's old answer for exactly this gladiator.
  assert.equal(placeholderLoadoutFrom(caster).canUseSpell, false);

  // Through the roster, the resolver's own default now survives: 20 magicka
  // and an empty inventory is a caster, and 0 magicka is not.
  const battle = createTeamBattle({
    teams: [
      { id: "red", name: "Red", slots: 1, combatants: [{ ...converted.combatant, teamId: "red" }] },
      {
        id: "blue",
        name: "Blue",
        slots: 1,
        combatants: [
          { ...toCanonicalCombatantSource(freshVanillaGladiator({ magicka: 0 }), { id: "blue-1" }).combatant, teamId: "blue" }
        ]
      }
    ],
    rngTape: hitTape(4)
  });
  assert.equal(battle.teams[0].combatants[0].loadout.canUseSpell, true, "20 magicka: the roster's default stands");
  assert.equal(battle.teams[0].combatants[0].loadout.canHeal, true);
  assert.equal(battle.teams[1].combatants[0].loadout.canUseSpell, false, "0 magicka: likewise");
});

test("a vanilla record missing a base stat is refused, never defaulted", () => {
  // Reading an absent `defence` as 0 — or as 5, or as anything — is the
  // adapter choosing a combat input, and canonical state carries no record
  // that the number was invented.
  const { defence, ...noDefence } = freshVanillaGladiator();
  assert.equal(defence, 1);
  assert.throws(
    () => toCanonicalCombatantSource(noDefence, { id: "red-1" }),
    (error) =>
      error instanceof AdapterStateError &&
      /carries no defence, so canonical defense cannot be read/.test(error.message) &&
      /converts base stats, it does not default them/.test(error.message)
  );
  for (const field of Object.values(CANONICAL_STAT_SOURCES)) {
    const stripped = { ...freshVanillaGladiator() };
    delete stripped[field];
    assert.throws(
      () => toCanonicalCombatantSource(stripped, { id: "red-1" }),
      (error) => error instanceof AdapterStateError && new RegExp(`carries no ${field}`).test(error.message),
      `a missing ${field} must be refused, not read as some number`
    );
  }
});

test("mirror drift is refused rather than silently corrected", () => {
  const record = normaliseVanillaCombatant(freshVanillaGladiator());
  assert.throws(
    () => assertMirrorAgrees(record, { id: "red-1", health: 1, maxHealth: 30, status: [] }),
    (error) => error instanceof AdapterStateError && /drifted from resolved state/.test(error.message)
  );
});

test("vanilla starting statuses are surfaced as declarative effects, because the roster drops them", () => {
  const source = toCanonicalCombatantSource(freshVanillaGladiator({ burning: true }), { id: "red-1" });
  assert.deepEqual(source.combatant.status, ["burning"]);
  assert.deepEqual(initialStatusEffects([source]), [
    { kind: "status", targetId: "red-1", status: "burning", active: true }
  ]);
  // The gap this exists for: roster.normaliseCombatant hard-codes status: [].
  const battle = createTeamBattle({
    teams: [
      { id: "red", slots: 1, combatants: [{ ...brute("red-1", 20), status: ["burning"] }] },
      { id: "blue", slots: 1, combatants: [brute("blue-1", 5)] }
    ],
    rngTape: hitTape(2)
  });
  // CLOSED. The roster used to hard-code `status: []`, so a gladiator who
  // entered already burning silently stopped burning. It now honours the
  // starting statuses, which is what lets the adapter's mirror keep agreeing
  // with the game instead of erasing a runtime-observed condition.
  assert.deepEqual(battle.teams[0].combatants[0].status, ["burning"]);
});

/* ------------------------------------------------------------------ */
/* State bridge: the canonical resource bag                            */
/* ------------------------------------------------------------------ */

test("the vanilla resources with no canonical slot are emitted as a canonical resource bag", () => {
  const { combatant, vanilla } = toCanonicalCombatantSource(freshVanillaGladiator(), { id: "red-1" });

  // Every name is the vanilla field name verbatim, exactly as the status
  // tokens are the vanilla flag names verbatim: no translation table.
  assert.deepEqual(Object.keys(combatant.resources).sort(), [...CANONICAL_RESOURCE_SOURCES].sort());
  const value = (name) => combatant.resources[name].value;
  assert.equal(value("armourclass"), 44);
  assert.equal(value("armourclass_max"), 44);
  assert.equal(value("staminaleft"), 105);
  assert.equal(value("staminamax"), 110);
  assert.equal(value("ammo_left"), 0);
  assert.equal(value("charisma"), 2, "charisma has no canonical stat slot, so it travels as a resource");
  assert.equal(value("helmet_defence"), 20, "the armour piece ratings, one resource each");
  assert.equal(value("shield_defence"), 24);
  assert.equal(value("weapon_enchantment_potency"), 0);

  // The values are copied, never transformed: the vanilla record still agrees.
  for (const name of CANONICAL_RESOURCE_SOURCES) {
    if (vanilla.fields[name] === undefined) continue;
    assert.equal(value(name), Number(vanilla.fields[name]), `${name} must round-trip untransformed`);
  }
  // Nothing here is folded into health: the armour-first split is a formula.
  assert.equal(combatant.health, 30);
  assert.equal(combatant.maxHealth, 30);
});

test("the adapter declares no resource bound, because a floor on armour would be a combat rule", () => {
  const resources = canonicalResourcesFrom(freshVanillaGladiator());
  for (const [name, entry] of Object.entries(resources)) {
    assert.deepEqual(
      { min: entry.min, max: entry.max },
      { min: null, max: null },
      `${name} must not carry a bound the adapter cannot evidence`
    );
  }
  // `armourclass_max` is its own resource rather than `armourclass`'s ceiling,
  // because a maximum that moves during a battle is modelled as a resource —
  // `remove_armour` moves this one.
  assert.ok(CANONICAL_RESOURCE_SOURCES.includes("armourclass_max"));
  assert.ok(CANONICAL_RESOURCE_SOURCES.includes("staminamax"));
  assert.ok(CANONICAL_RESOURCE_SOURCES.includes("maximum_ammo"));
});

test("a resource field the combat object never carried reads as zero, and the absence is recorded", () => {
  const source = freshVanillaGladiator();
  // The fixture stages no secondary weapon, so neither enchantment field exists.
  assert.equal("secondary_weapon_enchantment_type" in source, false);
  const converted = toCanonicalCombatantSource(source, { id: "red-1" });
  assert.equal(converted.combatant.resources.secondary_weapon_enchantment_type.value, 0);
  assert.deepEqual(converted.defaultedResources, absentResourceSources(source));
  assert.deepEqual([...converted.defaultedResources].sort(), [
    "secondary_weapon_enchantment_potency",
    "secondary_weapon_enchantment_type",
    "weapon_enchantment_damage"
  ]);
  // Materialising it in the bag must not invent the vanilla field.
  assert.equal("secondary_weapon_enchantment_type" in converted.vanilla.fields, false);
  // ...and the mirror still agrees, exactly as an unwritten status flag does.
  assert.deepEqual(mirrorDifferences(converted.vanilla, converted.combatant), []);
});

test("a mirror that is wrong about armour is drift now, where it used to be silence", () => {
  const record = normaliseVanillaCombatant(freshVanillaGladiator());
  const canonical = {
    id: "red-1",
    health: 30,
    maxHealth: 30,
    status: [],
    resources: canonicalResourcesFrom(freshVanillaGladiator())
  };
  assert.deepEqual(mirrorDifferences(record, canonical), []);

  const spent = { ...canonical, resources: { ...canonical.resources, armourclass: { value: 22, min: null, max: null } } };
  assert.deepEqual(mirrorDifferences(record, spent), ["armourclass 44 != resource 22"]);
  assert.throws(
    () => assertMirrorAgrees(record, spent),
    (error) => error instanceof AdapterStateError && /drifted from resolved state: armourclass 44 != resource 22/.test(error.message)
  );

  // A resource the build has no field for is skipped, not reported: a rule set
  // may invent a resource, and the adapter will not invent a field for it.
  const invented = { ...canonical, resources: { ...canonical.resources, momentum: { value: 9, min: null, max: null } } };
  assert.deepEqual(mirrorDifferences(record, invented), []);
});

test("every canonical resource name is a field the battle map already cites", () => {
  for (const name of CANONICAL_RESOURCE_SOURCES) {
    assert.ok(citationFor(name), `${name} must cite a battle-map section`);
  }
  assert.equal(new Set(CANONICAL_RESOURCE_SOURCES).size, CANONICAL_RESOURCE_SOURCES.length);
  // The reserved canonical field names are not resource names.
  for (const reserved of ["health", "maxHealth", "status", "stats", "id"]) {
    assert.equal(CANONICAL_RESOURCE_SOURCES.includes(reserved), false);
  }
});

test("maximum health is compared against the rule set, never corrected by the adapter", () => {
  const battle = makeBattle(1, 1);
  const source = toCanonicalCombatantSource(freshVanillaGladiator(), { id: "red-1" });
  const report = compareMaximumHealth(battle.rules, source.combatant, source.vanilla);
  // The placeholder formula is 50 + vitality*10 = 80; vanilla staged 30.
  assert.deepEqual(
    { derived: report.ruleSetDerived, vanilla: report.vanillaHitpointsMax, agrees: report.agrees },
    { derived: 80, vanilla: 30, agrees: false }
  );
});

/* ------------------------------------------------------------------ */
/* State bridge: effects -> field writes                               */
/* ------------------------------------------------------------------ */

function projections(battle) {
  return toTeamWireState(battle).teams.flatMap((team) => team.combatants);
}

test("a damage effect writes the resolver's clamped value, not a value the adapter computed", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const mirrors = new Map([["blue-1", normaliseVanillaCombatant(freshVanillaGladiator({ hitpoints: 50, hitpointsmax: 50 }))]]);
  const before = projections(battle);
  applyAction(battle, melee(battle, "blue-1"));
  const after = projections(battle);

  // 60 damage into 50 health: the resolver clamps to 0, so the write must be 0.
  const { writes } = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [{ kind: "damage", targetId: "blue-1", amount: 60 }],
    placements: layout.byCombatantId,
    mirrors
  });
  assert.equal(writes.length, 1);
  assert.deepEqual(
    { target: writes[0].target, field: writes[0].field, from: writes[0].from, to: writes[0].to, reason: writes[0].reason },
    { target: WriteTarget.COMBAT_OBJECT, field: "hitpoints", from: 50, to: 0, reason: "damage-effect" }
  );
  assert.equal(writes[0].path, "_root.arena.team_arena.state.villain_1");
  assert.notEqual(writes[0].to, 50 - 60);
});

test("a status effect on an undefined-until-set flag materialises the field", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const mirror = normaliseVanillaCombatant(freshVanillaGladiator());
  const before = projections(battle).map((combatant) => ({ ...combatant, status: [] }));
  const after = before.map((combatant) =>
    combatant.id === "blue-1" ? { ...combatant, status: ["burning"] } : combatant
  );

  const { writes } = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [{ kind: "status", targetId: "blue-1", status: "burning", active: true }],
    placements: layout.byCombatantId,
    mirrors: { "blue-1": mirror }
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].field, "burning");
  assert.equal(writes[0].from, undefined);
  assert.equal(writes[0].to, true);
  assert.equal(writes[0].materialises, true);

  // Once written, the field exists: a later write reports its real previous value.
  const applied = applyVanillaWrites(mirror, writes);
  assert.equal(applied.fields.burning, true);
  const cleared = vanillaWritesForResolvedAction({
    before: after,
    after: before,
    effects: [{ kind: "status", targetId: "blue-1", status: "burning", active: false }],
    placements: layout.byCombatantId,
    mirrors: { "blue-1": applied }
  });
  assert.equal(cleared.writes[0].from, true);
  assert.equal(cleared.writes[0].to, false);
  assert.equal(cleared.writes[0].materialises, false);
});

test("a status with no vanilla flag produces no field write and is reported as unmapped", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const before = projections(battle).map((combatant) => ({ ...combatant, status: [] }));
  const after = before.map((combatant) =>
    combatant.id === "blue-1" ? { ...combatant, status: ["invented-status"] } : combatant
  );
  const result = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [{ kind: "status", targetId: "blue-1", status: "invented-status", active: true }],
    placements: layout.byCombatantId
  });
  assert.deepEqual(result.writes, []);
  assert.equal(result.unmapped.length, 1);
  assert.equal(result.unmapped[0].status, "invented-status");
});

test("a resource effect writes the resolver's resource value, so writes reach armourclass", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const mirror = normaliseVanillaCombatant(freshVanillaGladiator());
  const resources = canonicalResourcesFrom(freshVanillaGladiator());
  // Staged at the mirror's own 30/30 so the writes read against the fixture.
  const before = projections(battle).map((combatant) => ({
    ...combatant,
    health: 30,
    maxHealth: 30,
    resources
  }));
  // The armour-first split as a rule set declares it: the pool down to 19,
  // then the overflow into health. The adapter performs neither subtraction.
  const after = before.map((combatant) =>
    combatant.id === "blue-1"
      ? {
        ...combatant,
        health: 24,
        resources: { ...resources, armourclass: { value: 19, min: null, max: null } }
      }
      : combatant
  );

  const { writes, unmapped } = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [
      { kind: "resource", targetId: "blue-1", resource: "armourclass", to: 19 },
      { kind: "damage", targetId: "blue-1", amount: 6 }
    ],
    placements: layout.byCombatantId,
    mirrors: { "blue-1": mirror }
  });

  assert.deepEqual(unmapped, []);
  assert.deepEqual(
    writes.map((write) => [write.combatantId, write.field, write.from, write.to, write.reason]),
    [
      ["blue-1", "armourclass", 44, 19, "resource-effect"],
      ["blue-1", "hitpoints", 30, 24, "damage-effect"]
    ],
    "the effect order is the write order: armour first, then the overflow"
  );
  assert.equal(writes[0].target, WriteTarget.COMBAT_OBJECT);
  assert.equal(writes[0].path, "_root.arena.team_arena.state.villain_1");
  const applied = applyVanillaWrites(mirror, writes);
  assert.equal(applied.fields.armourclass, 19);
  assert.equal(applied.fields.hitpoints, 24);
});

test("a resource write mirrors the resolver's clamped value, never the value the rule set asked for", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const resources = canonicalResourcesFrom(freshVanillaGladiator());
  const before = projections(battle).map((combatant) => ({ ...combatant, resources }));
  // The rule set asked for -30; the resolver clamped the declared pool to 0.
  const after = before.map((combatant) =>
    combatant.id === "blue-1"
      ? { ...combatant, resources: { ...resources, armourclass: { value: 0, min: 0, max: null } } }
      : combatant
  );
  const { writes } = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [{ kind: "resource", targetId: "blue-1", resource: "armourclass", to: -30 }],
    placements: layout.byCombatantId
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].to, 0);
  assert.notEqual(writes[0].to, -30, "the write comes from the post-action projection, not from effect.to");
});

test("a resource with no vanilla field produces no field write and is reported as unmapped", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const before = projections(battle).map((combatant) => ({
    ...combatant,
    resources: { momentum: { value: 0, min: null, max: null } }
  }));
  const after = before.map((combatant) =>
    combatant.id === "blue-1"
      ? { ...combatant, resources: { momentum: { value: 3, min: null, max: null } } }
      : combatant
  );
  const result = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [{ kind: "resource", targetId: "blue-1", resource: "momentum", to: 3 }],
    placements: layout.byCombatantId
  });
  assert.deepEqual(result.writes, []);
  assert.deepEqual(result.unmapped.map((entry) => [entry.combatantId, entry.resource]), [["blue-1", "momentum"]]);
  assert.match(result.unmapped[0].reason, /no vanilla field carries this resource/);

  // An effect naming a resource the projection does not declare at all is
  // reported rather than written; the resolver refuses it upstream anyway.
  const undeclared = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [{ kind: "resource", targetId: "blue-1", resource: "armourclass", to: 3 }],
    placements: layout.byCombatantId
  });
  assert.deepEqual(undeclared.writes, []);
  assert.match(undeclared.unmapped[0].reason, /declares no such resource/);
});

test("an unattributed resource change is still written, and an unchanged one is not", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const resources = canonicalResourcesFrom(freshVanillaGladiator());
  const before = projections(battle).map((combatant) => ({ ...combatant, resources }));
  const after = before.map((combatant) =>
    combatant.id === "blue-1"
      ? { ...combatant, resources: { ...resources, staminaleft: { value: 90, min: null, max: null } } }
      : combatant
  );
  const { writes } = vanillaWritesForResolvedAction({ before, after, placements: layout.byCombatantId });
  assert.deepEqual(
    writes.map((write) => [write.combatantId, write.field, write.to, write.reason]),
    [["blue-1", "staminaleft", 90, "resolved-state-diff"]],
    "totality: a resource the effects did not explain is written anyway, and the other 19 are untouched"
  );
});

test("writes follow effect order and stay total for unattributed differences", () => {
  // `after` comes from the resolver, not from mapping over `before`. The
  // previous version built both sides itself, so it constrained the ordering
  // and nothing else: the "values come from the resolver" half was supplied by
  // the test. Here a rule set splashes the actor as well as the target, and
  // only the target's damage is attributed to an effect.
  const splash = defineTeamRuleSet({
    id: "test-splash",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { runtimeVerified: false, note: "Invented; hits the actor too. Not SS2 behaviour." },
    actionTypes: ["splash"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 40,
    legalActions: (view) => view.foes.map((foe) => ({ type: "splash", targetId: foe.id })),
    resolveAction: (request) => ({
      effects: [
        { kind: EffectKind.DAMAGE, targetId: request.targetId, amount: 7 },
        { kind: EffectKind.DAMAGE, targetId: request.actorId, amount: 3 }
      ],
      events: [{ type: "melee", actorId: request.actorId, targetId: request.targetId, hit: true, damage: 7 }]
    }),
    chooseAiAction: (view, actorId, options) => options[0]
  });
  const battle = makeBattle(1, 1, { rules: splash });
  const layout = buildArenaLayout(toTeamWireState(battle));
  const before = projections(battle);
  applyAction(battle, { actorId: "red-1", type: "splash", targetId: "blue-1" });
  const after = projections(battle);

  // Only the target's damage is declared as an effect the writer sees.
  const { writes } = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [{ kind: "damage", targetId: "blue-1", amount: 7 }],
    placements: layout.byCombatantId
  });
  assert.deepEqual(writes.map((write) => write.combatantId), ["blue-1", "red-1"]);
  assert.deepEqual(writes.map((write) => write.reason), ["damage-effect", "resolved-state-diff"]);
  // Both values are the resolver's, including the one no effect explained.
  const byId = new Map(after.map((combatant) => [combatant.id, combatant]));
  for (const write of writes) assert.equal(write.to, byId.get(write.combatantId).health);
  assert.equal(writes[1].to, 37, "the actor's own 3 points, mirrored because the state changed");
});

/* ------------------------------------------------------------------ */
/* State bridge: the write shape, checked rather than described        */
/* ------------------------------------------------------------------ */

test("every vanilla write declares one of four sources, and the field set is fixed independently of any scenario", () => {
  assert.deepEqual(Object.keys(ALLOWED_WRITE_FIELDS).sort(), [...Object.values(WriteSource)].sort());
  assert.deepEqual(ALLOWED_WRITE_FIELDS[WriteSource.CANONICAL_HEALTH], ["hitpoints"]);
  assert.deepEqual([...ALLOWED_WRITE_FIELDS[WriteSource.CANONICAL_STATUS]], [...STATUS_FLAG_FIELDS]);
  assert.deepEqual([...ALLOWED_WRITE_FIELDS[WriteSource.DECLARED_RESOURCE]], [...CANONICAL_RESOURCE_SOURCES]);
  assert.deepEqual(ALLOWED_WRITE_FIELDS[WriteSource.CLIP_FACING], ["gladiator_dir"]);

  // The whole set, named once, in one place, with no battle in sight.
  const allowed = new Set(Object.values(ALLOWED_WRITE_FIELDS).flatMap((fields) => [...fields]));
  assert.equal(allowed.size, 1 + STATUS_FLAG_FIELDS.length + CANONICAL_RESOURCE_SOURCES.length + 1);
  // Nothing a rule set can name reaches a field another source owns.
  for (const reserved of ["hitpointsmax", "hitpoints", "gladiator_dir", ...STATUS_FLAG_FIELDS]) {
    assert.equal(isResourceBackedVanillaField(reserved), false, `${reserved} is not a resource's to write`);
  }
  assert.equal(isResourceBackedVanillaField("armourclass"), true);
  assert.equal(isResourceBackedVanillaField("spell_regenerate"), true, "the timed pools the map declines to name");
  assert.equal(isResourceBackedVanillaField("psyche_up"), false, "a vanilla field is not a resource by being a field");

  // And no scenario produces a write outside it. Four vocabularies, four team
  // sizes, damage / heal / status / resource / facing.
  const observed = new Set();
  for (const [redSize, blueSize] of [[1, 1], [2, 2], [3, 3], [1, 3]]) {
    const battle = makeBattle(redSize, blueSize);
    const layout = buildArenaLayout(toTeamWireState(battle));
    const resources = canonicalResourcesFrom(freshVanillaGladiator());
    const before = projections(battle).map((combatant) => ({ ...combatant, resources }));
    const after = before.map((combatant) => ({
      ...combatant,
      health: Math.max(0, combatant.health - 3),
      status: [...combatant.status, "burning", "invented-status"],
      resources: { ...resources, armourclass: { value: 1, min: null, max: null }, momentum: { value: 4, min: null, max: null } }
    }));
    const { writes } = vanillaWritesForResolvedAction({
      before,
      after,
      effects: [
        { kind: "resource", targetId: "blue-1", resource: "armourclass", to: 1 },
        { kind: "damage", targetId: "blue-1", amount: 3 },
        { kind: "status", targetId: "blue-1", status: "burning", active: true },
        { kind: "status", targetId: "blue-1", status: "invented-status", active: true },
        { kind: "resource", targetId: "blue-1", resource: "momentum", to: 4 }
      ],
      placements: layout.byCombatantId
    });
    const all = [
      ...writes,
      ...layout.placements.map((placement) =>
        facingWrite(placement.combatantId, placement, normaliseVanillaCombatant(freshVanillaGladiator()), "left"))
    ];
    for (const write of all) {
      assert.ok(Object.values(WriteSource).includes(write.source), `${write.field} declared no known source`);
      assert.ok(allowed.has(write.field), `${write.field} is outside the allowed field set`);
      observed.add(`${write.source}:${write.field}`);
    }
  }
  // The scenarios really did exercise all four sources.
  assert.deepEqual(
    [...new Set([...observed].map((entry) => entry.split(":")[0]))].sort(),
    [...Object.values(WriteSource)].sort()
  );
});

test("a write carrying a value the resolver never produced is refused, however it was built", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const resources = canonicalResourcesFrom(freshVanillaGladiator());
  const before = projections(battle).map((combatant) => ({ ...combatant, resources }));
  applyAction(battle, melee(battle, "blue-1"));
  const after = projections(battle).map((combatant) => ({ ...combatant, resources }));

  // Every emitted write is identical to a value the projection actually holds.
  const { writes } = vanillaWritesForResolvedAction({
    before,
    after,
    effects: [{ kind: "damage", targetId: "blue-1", amount: 60 }],
    placements: layout.byCombatantId
  });
  assert.equal(assertWriteProvenance(writes, after), true);

  // The forbidden shape, in the words the contract uses for it. `staminaleft`
  // is a real resource-backed field, the write is well formed, the source is
  // declared — and 105 - ceil(60 * 1.5) is a number that exists nowhere in the
  // post-action projection, so it cannot be a value the resolver decided.
  const computed = [{
    ...writes[0],
    field: "staminaleft",
    source: WriteSource.DECLARED_RESOURCE,
    from: 105,
    to: 105 - Math.ceil(60 * 1.5)
  }];
  assert.throws(
    () => assertWriteProvenance(computed, after),
    (error) =>
      error instanceof AdapterStateError &&
      /but the resolved projection holds/.test(error.message) &&
      /a computed one is a second place combat is being decided/.test(error.message)
  );

  // Same for a health write that is `before - amount` rather than `after`.
  assert.throws(
    () => assertWriteProvenance([{ ...writes[0], to: 50 - 60 }], after),
    (error) => error instanceof AdapterStateError && /canonical-health write/.test(error.message)
  );
  // And for a status write that disagrees with the projection's status list.
  assert.throws(
    () => assertWriteProvenance(
      [{ ...writes[0], field: "burning", source: WriteSource.CANONICAL_STATUS, to: true }],
      after
    ),
    (error) => error instanceof AdapterStateError && /canonical-status write/.test(error.message)
  );
  // A write naming nobody is refused rather than skipped.
  assert.throws(
    () => assertWriteProvenance([{ ...writes[0], combatantId: "ghost" }], after),
    (error) => error instanceof AdapterStateError && /has no resolved projection/.test(error.message)
  );
});

test("a resource may not borrow a field canonical health or status already owns", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));
  for (const field of ["hitpoints", "hitpointsmax", "burning"]) {
    const before = projections(battle).map((combatant) => ({
      ...combatant,
      resources: { [field]: { value: 0, min: null, max: null } }
    }));
    const after = before.map((combatant) =>
      combatant.id === "blue-1"
        ? { ...combatant, resources: { [field]: { value: 7, min: null, max: null } } }
        : combatant
    );
    const result = vanillaWritesForResolvedAction({
      before,
      after,
      effects: [{ kind: "resource", targetId: "blue-1", resource: field, to: 7 }],
      placements: layout.byCombatantId
    });
    assert.deepEqual(result.writes, [], `a resource named ${field} must not produce a write`);
    assert.match(result.unmapped[0].reason, /owned by canonical health, canonical status or the clip record/);
  }
});

/* ------------------------------------------------------------------ */
/* Slot layout                                                         */
/* ------------------------------------------------------------------ */

for (const [redSize, blueSize] of [[1, 1], [2, 2], [3, 3], [1, 3]]) {
  test(`slot layout maps every combatant id to a distinct presentation slot (${redSize}v${blueSize})`, () => {
    const battle = makeBattle(redSize, blueSize);
    const layout = buildArenaLayout(toTeamWireState(battle));
    assert.equal(layout.placements.length, redSize + blueSize);

    const unique = (key) => new Set(layout.placements.map((placement) => placement[key]));
    for (const key of ["combatantId", "instanceName", "instancePath", "depth", "stateObjectPath", "shadowDepth"]) {
      assert.equal(unique(key).size, layout.placements.length, `${key} must be distinct per combatant`);
    }
    const positions = new Set(layout.placements.map((placement) => `${placement.x}:${placement.y}`));
    assert.equal(positions.size, layout.placements.length, "every slot needs its own position");

    for (const placement of layout.placements) {
      assert.equal(layout.placementFor(placement.combatantId), placement);
      if (placement.vanillaNative) continue;
      assert.ok(!VANILLA_RESERVED_DEPTHS.includes(placement.depth));
      assert.ok(!VANILLA_RESERVED_DEPTHS.includes(placement.shadowDepth));
    }
  });
}

test("slot 0 of each side reproduces the vanilla arrangement exactly", () => {
  const layout = buildArenaLayout(toTeamWireState(makeBattle(3, 3)));
  const hero = layout.placementFor("red-1");
  const villain = layout.placementFor("blue-1");

  assert.deepEqual(
    { name: hero.instanceName, depth: hero.depth, shadow: hero.shadowDepth, x: hero.x, y: hero.y, facing: hero.facing },
    {
      name: "hero",
      depth: VANILLA_FIGHTER_DEPTHS[HERO_SIDE],
      shadow: VANILLA_SHADOW_DEPTHS[HERO_SIDE],
      x: VANILLA_FRONT_X[HERO_SIDE],
      y: ARENA_Y,
      facing: "right"
    }
  );
  assert.deepEqual(
    {
      name: villain.instanceName,
      depth: villain.depth,
      shadow: villain.shadowDepth,
      x: villain.x,
      y: villain.y,
      facing: villain.facing
    },
    {
      name: "villain",
      depth: VANILLA_FIGHTER_DEPTHS[VILLAIN_SIDE],
      shadow: VANILLA_SHADOW_DEPTHS[VILLAIN_SIDE],
      x: VANILLA_FRONT_X[VILLAIN_SIDE],
      y: ARENA_Y,
      facing: "left"
    }
  );
  assert.equal(hero.instancePath, "_root.arena.gladiators.hero");
  assert.equal(hero.vanillaCampaignObjectPath, "_root.game.hero");
  assert.equal(hero.panel.widgets.find((widget) => widget.role === "armour").instanceName, "hero_armour");
  assert.equal(hero.geometryAuthored, false);

  // Allies are authored surface and say so; they never multiply _root.game.*.
  const ally = layout.placementFor("red-2");
  assert.equal(ally.instanceName, "hero_ally_2");
  assert.equal(ally.vanillaCampaignObjectPath, null);
  assert.equal(ally.geometryAuthored, true);
  assert.equal(ally.vanillaNative, false);
});

test("the hero side is a choice, and both teams can occupy it", () => {
  const wire = toTeamWireState(makeBattle(2, 2));
  const defaulted = buildArenaLayout(wire);
  assert.equal(defaulted.sides[HERO_SIDE], "red");
  const flipped = buildArenaLayout(wire, { heroTeamId: "blue" });
  assert.equal(flipped.sides[HERO_SIDE], "blue");
  assert.equal(flipped.placementFor("blue-1").instanceName, "hero");
  assert.equal(flipped.placementFor("red-1").instanceName, "villain");
  assert.throws(
    () => buildArenaLayout(wire, { heroTeamId: "green" }),
    (error) => error instanceof SlotLayoutError && /No team with id green is in this battle/.test(error.message)
  );
});

test("a 3v3 binds exactly one attacker/defender pair per action, from resolved state", () => {
  const layout = buildArenaLayout(toTeamWireState(makeBattle(3, 3)));
  const plan = bindingPlanFor(layout, { actorId: "red-3", targetId: "blue-2" });
  assert.deepEqual({ ...plan }, {
    attacker: "_root.arena.gladiators.hero_ally_3",
    defender: "_root.arena.gladiators.villain_ally_2",
    game_attacker: "_root.arena.team_arena.state.hero_3",
    game_defender: "_root.arena.team_arena.state.villain_2",
    attackerCombatantId: "red-3",
    defenderCombatantId: "blue-2",
    selfTargeted: false,
    unmapped: null
  });
  // Four globals, whatever the team size: the surface is a binding, not a roster.
  const globals = ["attacker", "defender", "game_attacker", "game_defender"];
  assert.deepEqual(Object.keys(plan).filter((key) => globals.includes(key)).sort(), [...globals].sort());
  assert.equal(new Set(globals.map((key) => plan[key])).size, 4, "four distinct bindings, never one unit twice");
});

test("a self-targeted action binds no defender, because one unit is not a pair", () => {
  const layout = buildArenaLayout(toTeamWireState(makeBattle(3, 3)));
  const plan = bindingPlanFor(layout, { actorId: "red-1", targetId: "red-1" });

  // The whole two-sided argument rests on the four globals being four distinct
  // things: `damagecharacter(defender, attacker, game_defender, game_attacker)`
  // reads and writes both sides. Binding one fighter to both would alias them.
  assert.equal(plan.attacker, "_root.arena.gladiators.hero");
  assert.equal(plan.game_attacker, "_root.arena.team_arena.state.hero_1");
  assert.equal(plan.defender, null);
  assert.equal(plan.game_defender, null);
  assert.equal(plan.defenderCombatantId, null);
  assert.equal(plan.selfTargeted, true);
  assert.match(plan.unmapped, /distinct parameters/);
  assert.notEqual(plan.attacker, plan.defender);
  assert.notEqual(plan.game_attacker, plan.game_defender);

  // And the same through presentation, for the vocabulary's legal self-target.
  const battle = makeBattle(1, 1);
  applyAction(battle, { actorId: "red-1", type: "rest", targetId: "red-1" });
  const wire = toTeamWireState(battle);
  const { commands } = presentResolvedEvents(wire, { layout: buildArenaLayout(wire) });
  const bind = commands.find((command) => command.kind === CommandKind.BIND_GLOBALS);
  assert.equal(bind.globals.selfTargeted, true);
  assert.equal(bind.globals.defender, null);
  assert.equal(bind.globals.game_defender, null);
  // One clip, so the actor's animation plays and nothing else is aimed at it.
  assert.deepEqual(
    commands.filter((command) => command.kind === CommandKind.CLIP_GOTO).map((command) => [command.role, command.combatantId]),
    [["actor", "red-1"]]
  );

  // A binding table that *does* name a target label for a self-targeted action
  // has nowhere to play it, and that is reported rather than dropped.
  const selfHarm = {
    id: "test-self-harm-bindings",
    verification: "placeholder",
    action: () => ({ actor: { label: "attack5", provenance: LabelProvenance.PLACEHOLDER }, target: { label: "hurt5", provenance: LabelProvenance.PLACEHOLDER } }),
    defeated: () => ({ label: "death", provenance: LabelProvenance.PLACEHOLDER })
  };
  const reported = presentResolvedEvents(wire, { layout: buildArenaLayout(wire), bindings: selfHarm });
  const unmapped = reported.commands.find((command) => command.kind === CommandKind.UNMAPPED);
  assert.ok(unmapped, "the target label has to go somewhere, and saying so beats dropping it");
  assert.match(unmapped.reason, /one clip for both roles/);
  assert.equal(unmapped.detail.label, "hurt5");
});

test("result labels come from the resolved winner, and a draw is reported unmapped", () => {
  const layout = buildArenaLayout(toTeamWireState(makeBattle(2, 2)));
  assert.deepEqual({ ...resultLabelsFor(layout, "red") }, { overlayLabel: "combatwon", arenaLabel: "combat_won" });
  assert.deepEqual({ ...resultLabelsFor(layout, "blue") }, { overlayLabel: "combatlost", arenaLabel: "combat_lost" });
  const draw = resultLabelsFor(layout, null);
  assert.equal(draw.arenaLabel, null);
  assert.match(draw.unmapped, /no draw transition/);
});

test("arena construction reproduces the vanilla attach/place calls and mirrors the villain scale", () => {
  const battle = makeBattle(2, 2);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const mirrors = new Map(
    layout.placements.map((placement) => [
      placement.combatantId,
      normaliseVanillaCombatant(freshVanillaGladiator({ physical_size: 87 }))
    ])
  );
  const commands = presentArenaConstruction(layout, { mirrors });
  const heroPlace = commands.find(
    (command) => command.kind === CommandKind.PLACE_CLIP && command.combatantId === "red-1"
  );
  const villainPlace = commands.find(
    (command) => command.kind === CommandKind.PLACE_CLIP && command.combatantId === "blue-1"
  );
  assert.equal(heroPlace.xscale, 87);
  assert.equal(villainPlace.xscale, -87);
  assert.equal(villainPlace.yscale, 87);
  const attach = commands.filter((command) => command.kind === CommandKind.ATTACH_CLIP);
  assert.equal(attach.length, 8, "one fighter and one shadow per combatant");
  assert.equal(attach[0].linkage, "hero_battle");
  // Scale is read, never derived: physical_size comes from battlevalues.
  const withoutSize = presentArenaConstruction(layout);
  assert.equal(withoutSize.find((command) => command.kind === CommandKind.PLACE_CLIP).xscale, null);
});

/* ------------------------------------------------------------------ */
/* Clip registry                                                       */
/* ------------------------------------------------------------------ */

test("the clip registry holds live handles and refuses to be serialised", () => {
  const battle = makeBattle(2, 2);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const handles = new Map(layout.placements.map((placement) => [placement.combatantId, { clip: placement.instanceName }]));
  const registry = createClipRegistry().registerLayout(layout, handles);

  assert.deepEqual(registry.combatantIds().sort(), ["blue-1", "blue-2", "red-1", "red-2"]);
  assert.equal(registry.clipFor("red-2").clip, "hero_ally_2");
  assert.throws(
    () => registry.clipFor("nobody"),
    (error) => error instanceof ClipRegistryError && /No clip is registered for combatant nobody/.test(error.message)
  );
  const refusesSerialisation = (error) =>
    error instanceof ClipRegistryError && /must never enter a state projection/.test(error.message);
  assert.throws(() => JSON.stringify(registry), refusesSerialisation);
  assert.throws(() => JSON.stringify({ battle: "x", clips: registry }), refusesSerialisation);
  assert.deepEqual(registry.describe().map((entry) => entry.instanceName).sort(), [
    "hero",
    "hero_ally_2",
    "villain",
    "villain_ally_2"
  ]);
});

test("a clip registry cannot change combat state or its hash", () => {
  const battle = makeBattle(2, 2);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const before = combatStateHash(battle);
  createClipRegistry().registerLayout(
    layout,
    Object.fromEntries(layout.placements.map((placement) => [placement.combatantId, { live: true }]))
  );
  assert.equal(combatStateHash(battle), before);
  assert.equal(JSON.stringify(toTeamWireState(battle)).includes("clip"), false);
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

test("presentation never mutates combat state", () => {
  const battle = makeBattle(2, 2);
  eliminateBlue(battle);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const hashBefore = combatStateHash(battle);
  const wire = deepFreeze(toTeamWireState(battle));

  const { commands } = presentResolvedEvents(wire, { layout });
  assert.ok(commands.length > 0);
  assert.equal(combatStateHash(battle), hashBefore);
  assert.deepEqual(toTeamWireState(battle), JSON.parse(JSON.stringify(wire)));
  // Commands are inert data: JSON-safe, with no callable in sight.
  assert.deepEqual(JSON.parse(JSON.stringify(commands)).length, commands.length);
  for (const command of commands) {
    for (const value of Object.values(command)) assert.notEqual(typeof value, "function");
  }
});

test("presentation refuses a live battle and demands the projection", () => {
  const battle = makeBattle(1, 1);
  const layout = buildArenaLayout(toTeamWireState(battle));

  // A live battle, refused for being a live battle — and the message has to
  // say so. The second assertion here used to pass `{}` for the options, so it
  // threw on the missing layout and said nothing at all about live battles.
  assert.throws(
    () => presentResolvedEvents(battle, { layout }),
    (error) => error instanceof PresentationError && /was handed a live battle/.test(error.message)
  );
  // Each of the three ways a live battle is recognised, one at a time, all
  // with a perfectly good layout in hand.
  const wire = toTeamWireState(battle);
  assert.throws(
    () => presentResolvedEvents({ ...wire, settlement: battle.settlement }, { layout }),
    (error) => error instanceof PresentationError && /it carries settlement/.test(error.message)
  );
  assert.throws(
    () => presentResolvedEvents({ ...wire, controllers: battle.controllers }, { layout }),
    (error) => error instanceof PresentationError && /it carries controllers/.test(error.message)
  );
  assert.throws(
    () => presentResolvedEvents({ ...wire, rules: battle.rules }, { layout }),
    (error) => error instanceof PresentationError && /carrying a rule set/.test(error.message)
  );
  // And something that is not a projection at all.
  assert.throws(
    () => presentResolvedEvents(null, { layout }),
    (error) => error instanceof PresentationError && /needs a combat projection/.test(error.message)
  );
  assert.throws(
    () => presentResolvedEvents({ notTeams: [] }, { layout }),
    (error) => error instanceof PresentationError && /needs a combat projection/.test(error.message)
  );
  // The missing-layout refusal is its own thing, and says its own thing.
  assert.throws(
    () => presentResolvedEvents(wire, {}),
    (error) => error instanceof PresentationError && /needs an arena layout/.test(error.message)
  );
});

test("an individual knockout plays a death animation and nothing else", () => {
  const battle = makeBattle(2, 2);
  applyAction(battle, melee(battle, "blue-1"));
  assert.equal(battle.result, null, "a 2v2 must not end on the first knockout");

  const wire = toTeamWireState(battle);
  const layout = buildArenaLayout(wire);
  const { commands } = presentResolvedEvents(wire, { layout });
  const defeat = commands.filter((command) => command.role === "defeated");
  assert.equal(defeat.length, 1);
  assert.equal(defeat[0].combatantId, "blue-1");
  assert.equal(
    commands.some((command) => command.kind === CommandKind.ARENA_GOTO || command.kind === CommandKind.OVERLAY_GOTO),
    false,
    "a knockout must never reach the vanilla win/loss timeline"
  );
});

test("the terminal result event drives the overlay and arena labels, once", () => {
  const battle = makeBattle(2, 2);
  eliminateBlue(battle);
  const wire = toTeamWireState(battle);
  const layout = buildArenaLayout(wire);
  const { commands } = presentResolvedEvents(wire, { layout });

  const overlay = commands.filter((command) => command.kind === CommandKind.OVERLAY_GOTO);
  const arena = commands.filter((command) => command.kind === CommandKind.ARENA_GOTO);
  assert.deepEqual(overlay.map((command) => command.label), ["combatwon"]);
  assert.deepEqual(arena.map((command) => command.label), ["combat_won"]);
  const pending = wire.events.find((event) => event.type === BATTLE_RESULT_PENDING_TYPE);
  assert.equal(arena[0].completionToken, pending.completionToken);

  // Same battle, opposite hero side: the labels flip with the resolved winner.
  const flipped = presentResolvedEvents(wire, { layout: buildArenaLayout(wire, { heroTeamId: "blue" }) });
  assert.deepEqual(
    flipped.commands.filter((command) => command.kind === CommandKind.ARENA_GOTO).map((command) => command.label),
    ["combat_lost"]
  );
});

test("each action binds exactly one attacker/defender pair, derived from the event", () => {
  const battle = makeBattle(3, 3);
  applyAction(battle, melee(battle, "blue-2"));
  const wire = toTeamWireState(battle);
  const layout = buildArenaLayout(wire);
  const { commands } = presentResolvedEvents(wire, { layout });
  const binds = commands.filter((command) => command.kind === CommandKind.BIND_GLOBALS);
  assert.equal(binds.length, 1);
  assert.deepEqual(
    { attacker: binds[0].globals.attacker, defender: binds[0].globals.defender },
    { attacker: "_root.arena.gladiators.hero", defender: "_root.arena.gladiators.villain_ally_2" }
  );
});

test("the binder drains only new commands as the battle progresses", () => {
  const battle = makeBattle(2, 2);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const binder = createPresentationBinder({ layout });

  applyAction(battle, melee(battle, "blue-1"));
  const first = binder.drain(toTeamWireState(battle));
  assert.ok(first.length > 0);
  assert.deepEqual(binder.drain(toTeamWireState(battle)), []);

  applyAction(battle, melee(battle, "blue-2"));
  const second = binder.drain(toTeamWireState(battle));
  assert.ok(second.length > 0);
  assert.ok(Math.min(...second.map((command) => command.sequence)) > Math.max(...first.map((command) => command.sequence)));
});

test("animation labels carry their provenance, and none of them claims verification", () => {
  const wire = {
    teams: [
      { id: "red", combatants: [{ id: "red-1", slotIndex: 0, health: 10, maxHealth: 10, alive: true, status: [] }] },
      { id: "blue", combatants: [{ id: "blue-1", slotIndex: 0, health: 4, maxHealth: 10, alive: true, status: [] }] }
    ],
    events: [
      { sequence: 1, turn: 1, type: "normal", actorId: "red-1", targetId: "blue-1", hit: true, attackDirection: 7, dispatchedMethod: "normal" },
      { sequence: 2, turn: 1, type: "bombard", actorId: "red-1", targetId: "blue-1", hit: true, attackDirection: 21, dispatchedMethod: "normal" },
      { sequence: 3, turn: 1, type: "normal", actorId: "red-1", targetId: "blue-1", hit: false, attackDirection: 7 }
    ]
  };
  const layout = buildArenaLayout(wire);
  const { commands } = presentResolvedEvents(wire, { layout, bindings: SS2_STATIC_MAP_BINDINGS });
  const labels = commands
    .filter((command) => command.kind === CommandKind.CLIP_GOTO)
    .map((command) => [command.label, command.labelProvenance]);

  assert.deepEqual(labels, [
    ["attack7", LabelProvenance.ASSUMED],
    ["hurt7", LabelProvenance.MAP_NAMED],
    ["bombard", LabelProvenance.MAP_NAMED],
    ["hurt21", LabelProvenance.ASSUMED],
    ["attack7", LabelProvenance.ASSUMED],
    ["Block", LabelProvenance.MAP_NAMED]
  ]);
  assert.equal(
    labels.some(([, provenance]) => provenance === "runtime-verified"),
    false,
    "no clip label has ever been observed in a capture"
  );
  assert.equal(SS2_STATIC_MAP_BINDINGS.verification, "static-map");
  assert.equal(PLACEHOLDER_ANIMATION_BINDINGS.verification, "placeholder");
});

test("an event with no binding is reported as unmapped instead of guessed", () => {
  const wire = {
    teams: [
      { id: "red", combatants: [{ id: "red-1", slotIndex: 0, health: 10, maxHealth: 10, alive: true, status: [] }] },
      { id: "blue", combatants: [{ id: "blue-1", slotIndex: 0, health: 10, maxHealth: 10, alive: true, status: [] }] }
    ],
    events: [{ sequence: 1, turn: 1, type: "cartwheel", actorId: "red-1", targetId: "blue-1" }]
  };
  const { commands } = presentResolvedEvents(wire, { layout: buildArenaLayout(wire) });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].kind, CommandKind.UNMAPPED);
  assert.match(commands[0].reason, /no animation binding/);
});

/* ------------------------------------------------------------------ */
/* Acknowledgement bridge                                              */
/* ------------------------------------------------------------------ */

function settledBattle(redSize, blueSize) {
  const settlements = [];
  const battle = makeBattle(redSize, blueSize, { onCampaignSettled: (record) => settlements.push(record) });
  eliminateBlue(battle);
  const layout = buildArenaLayout(toTeamWireState(battle));
  return { battle, layout, settlements, bridge: createResultAcknowledgementBridge(battle, { layout }) };
}

test("the bridge settles exactly once, and only after the last death animation", () => {
  const { battle, bridge, settlements } = settledBattle(2, 2);
  assert.equal(bridge.sync(), "armed");
  assert.deepEqual(bridge.awaitingDeathAnimations.sort(), ["blue-1", "blue-2"]);
  assert.equal(bridge.expectedArenaLabel, "combat_won");

  // The arena label can arrive first; settlement still waits for both deaths.
  assert.equal(bridge.reportArenaLabel("combat_won").settled, false);
  assert.equal(bridge.reportDeathAnimation("blue-1").settled, false);
  assert.deepEqual(settlements, []);

  const final = bridge.reportDeathAnimation("blue-2");
  assert.equal(final.settled, true);
  assert.equal(bridge.status, "settled");
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].winnerTeamId, "red");
  assert.equal(settlements[0].acknowledgedToken, bridge.pendingToken);
  assert.equal(battle.settlement.isSettled, true);
});

test("replaying the animation surface never settles a second time", () => {
  const { bridge, settlements } = settledBattle(2, 2);
  bridge.sync();
  bridge.reportDeathAnimation("blue-1");
  bridge.reportDeathAnimation("blue-2");
  assert.equal(bridge.reportArenaLabel("combat_won").settled, true);
  assert.equal(settlements.length, 1);

  for (let repeat = 0; repeat < 3; repeat += 1) {
    const again = bridge.reportArenaLabel("combat_won");
    assert.equal(again.settled, false);
    assert.equal(again.alreadySettled, true);
    assert.equal(bridge.reportDeathAnimation("blue-1").settled, false);
  }
  assert.equal(settlements.length, 1);
});

test("a mismatched completion token is refused, never settled", () => {
  const { bridge, settlements } = settledBattle(1, 1);
  bridge.sync();
  assert.throws(
    () => bridge.reportArenaLabel("combat_won", { completionToken: "team-arena:blue:red+:elimination" }),
    (error) => error instanceof AcknowledgementError && /does not match the armed result/.test(error.message)
  );
  assert.throws(
    () => bridge.verifyAcknowledgement({ type: BATTLE_RESULT_ACK_TYPE, completionToken: "nonsense" }),
    AcknowledgementError
  );
  assert.throws(
    () => bridge.verifyAcknowledgement({ type: "something-else", completionToken: "x" }),
    (error) => error instanceof AcknowledgementError && /acknowledgement with a non-empty completionToken is required/.test(error.message)
  );
  assert.deepEqual(settlements, []);
  assert.equal(bridge.isSettled, false);

  // The right token still settles afterwards.
  assert.equal(bridge.verifyAcknowledgement(bridge.acknowledgement()), true);
  bridge.reportDeathAnimation("blue-1");
  assert.equal(bridge.reportArenaLabel("combat_won", { completionToken: bridge.pendingToken }).settled, true);
  assert.equal(settlements.length, 1);
});

test("an animation surface that disagrees with the resolved winner is refused", () => {
  const { bridge, settlements } = settledBattle(1, 1);
  bridge.sync();
  assert.throws(
    () => bridge.reportArenaLabel("combat_lost"),
    (error) => error instanceof AcknowledgementError && /refusing to settle/.test(error.message)
  );
  assert.deepEqual(settlements, []);
});

test("the bridge cannot settle a battle the resolver has not decided", () => {
  const battle = makeBattle(2, 2);
  applyAction(battle, melee(battle, "blue-1"));
  const layout = buildArenaLayout(toTeamWireState(battle));
  const bridge = createResultAcknowledgementBridge(battle, { layout });

  assert.equal(bridge.sync(), "idle");
  assert.equal(bridge.pendingToken, null);
  assert.equal(bridge.acknowledgement(), null);
  assert.throws(
    () => bridge.reportDeathAnimation("blue-1"),
    (error) => error instanceof AcknowledgementError && /Cannot report a death animation: no battle result is armed/.test(error.message)
  );
  assert.throws(
    () => bridge.reportArenaLabel("combat_won"),
    (error) => error instanceof AcknowledgementError && /Cannot report an arena result label: no battle result is armed/.test(error.message)
  );
});

test("a death on the winning side is accepted but never gates settlement", () => {
  const settlements = [];
  // Blue-1 is the fastest fighter in this battle, so blue really does act
  // first and really does knock a red fighter down. The previous version of
  // this test had red attacking on both actions, so no red combatant was ever
  // knocked down — it passed only because the bridge accepted a death report
  // for a fighter who was still standing, which is the very thing it now
  // refuses. It was pinning that bug, not this guarantee.
  const red = {
    id: "red",
    name: "Red",
    slots: 2,
    combatants: [brute("red-1", 10), brute("red-2", 8)]
  };
  const blue = {
    id: "blue",
    name: "Blue",
    slots: 2,
    combatants: [
      brute("blue-1", 30),
      // Slow and harmless: it gets its turn between red's two, and its hit
      // must not decide the battle.
      {
        ...brute("blue-2", 5),
        stats: { strength: 0, agility: 5, attack: 40, defense: 0, vitality: 0, stamina: 5, magicka: 0 },
        loadout: { meleeDamage: 1, rangedDamage: 1, canUseRanged: false, canUseSpell: false, canHeal: false }
      }
    ]
  };
  const battle = createTeamBattle({
    teams: [red, blue],
    rngTape: hitTape(24),
    onCampaignSettled: (record) => settlements.push(record)
  });

  assert.equal(currentCombatant(battle).id, "blue-1");
  applyAction(battle, { actorId: "blue-1", type: "melee", targetId: "red-1" });
  assert.equal(battle.teams[0].combatants[0].alive, false, "blue really knocked a red fighter down");
  assert.equal(battle.result, null);
  applyAction(battle, { actorId: "red-2", type: "melee", targetId: "blue-1" });
  applyAction(battle, { actorId: "blue-2", type: "melee", targetId: "red-2" });
  assert.equal(battle.teams[0].combatants[1].alive, true, "blue-2's blow does not decide anything");
  applyAction(battle, { actorId: "red-2", type: "melee", targetId: "blue-2" });
  assert.equal(battle.result.winnerTeamId, "red");

  const layout = buildArenaLayout(toTeamWireState(battle));
  const bridge = createResultAcknowledgementBridge(battle, { layout });
  bridge.sync();
  const winnerSide = bridge.reportDeathAnimation("red-1");
  assert.deepEqual({ accepted: winnerSide.accepted, counted: winnerSide.counted }, { accepted: true, counted: false });
  assert.deepEqual(bridge.awaitingDeathAnimations.sort(), ["blue-1", "blue-2"]);
  assert.throws(
    () => bridge.reportDeathAnimation("nobody"),
    (error) => error instanceof AcknowledgementError && /is not in this battle/.test(error.message)
  );

  // The winning side's *living* fighter is a different matter: that is not an
  // animation that played earlier, it is presentation disagreeing with
  // resolved state, and it is refused like any other desync.
  assert.equal(battle.teams[0].combatants[1].alive, true);
  assert.throws(
    () => bridge.reportDeathAnimation("red-2"),
    (error) => error instanceof AcknowledgementError && /still standing in resolved state/.test(error.message)
  );

  bridge.reportDeathAnimation("blue-1");
  bridge.reportDeathAnimation("blue-2");
  assert.equal(bridge.reportArenaLabel("combat_won").settled, true);
  assert.equal(settlements.length, 1);
});

test("a 3v3 waits for all three death animations", () => {
  const { bridge, settlements } = settledBattle(3, 3);
  bridge.sync();
  assert.deepEqual(bridge.awaitingDeathAnimations.sort(), ["blue-1", "blue-2", "blue-3"]);
  bridge.reportArenaLabel("combat_won");
  bridge.reportDeathAnimation("blue-1");
  bridge.reportDeathAnimation("blue-2");
  assert.deepEqual(settlements, []);
  assert.equal(bridge.reportDeathAnimation("blue-3").settled, true);
  assert.equal(settlements.length, 1);
});

test("a draw is acknowledged by the death animations, and an elimination is not", () => {
  /** DEMONSTRATION ONLY. A vocabulary that kills both fighters at once. */
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

  const settlements = [];
  const battle = makeBattle(1, 1, { rules: mutual, onCampaignSettled: (record) => settlements.push(record) });
  applyAction(battle, { actorId: "red-1", type: "strike", targetId: "blue-1" });
  const layout = buildArenaLayout(toTeamWireState(battle));
  const bridge = createResultAcknowledgementBridge(battle, { layout });

  assert.equal(bridge.sync(), "armed");
  assert.equal(bridge.expectsArenaLabel, false, "vanilla dispatches no transition for a draw");
  assert.equal(bridge.expectedArenaLabel, null);
  assert.match(bridge.unmappedArenaTransition, /no draw transition/);
  assert.deepEqual([...bridge.awaitingDeathAnimations].sort(), ["blue-1", "red-1"]);

  assert.equal(bridge.reportDeathAnimation("blue-1").settled, false);
  assert.equal(bridge.reportDeathAnimation("red-1").settled, true);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].winnerTeamId, null);
  assert.equal(settlements[0].reason, "draw");
  assert.equal(bridge.arenaLabelReached, false, "nothing ever reached an arena label");

  // A decided battle keeps the stricter gate: the deaths alone do not settle
  // it, because there really is a transition the campaign must not outrun.
  const decided = settledBattle(2, 2);
  decided.bridge.sync();
  assert.equal(decided.bridge.expectsArenaLabel, true);
  assert.equal(decided.bridge.unmappedArenaTransition, null);
  decided.bridge.reportDeathAnimation("blue-1");
  assert.equal(decided.bridge.reportDeathAnimation("blue-2").settled, false);
  assert.deepEqual(decided.settlements, []);
  assert.equal(decided.bridge.reportArenaLabel("combat_won").settled, true);
});

test("the bridge submits through the resolver's own once-only gate", () => {
  const { battle, bridge, settlements } = settledBattle(1, 1);
  bridge.sync();
  // Someone else acknowledges first; the bridge must not pay the campaign twice.
  assert.equal(
    acknowledgeResultAnimation(battle, { type: BATTLE_RESULT_ACK_TYPE, completionToken: bridge.pendingToken }),
    true
  );
  bridge.reportDeathAnimation("blue-1");
  assert.equal(bridge.reportArenaLabel("combat_won").settled, false);
  assert.equal(settlements.length, 1);
});

test("a throwing campaign callback still latches the bridge", () => {
  const battle = makeBattle(1, 1, {
    onCampaignSettled: () => {
      throw new Error("campaign write failed");
    }
  });
  eliminateBlue(battle);
  const layout = buildArenaLayout(toTeamWireState(battle));
  const bridge = createResultAcknowledgementBridge(battle, { layout });
  bridge.sync();
  bridge.reportDeathAnimation("blue-1");
  assert.throws(() => bridge.reportArenaLabel("combat_won"), /campaign write failed/);
  assert.equal(bridge.isSettled, true);
  assert.equal(bridge.reportArenaLabel("combat_won").settled, false);
});

/* ------------------------------------------------------------------ */
/* Provenance discipline                                               */
/* ------------------------------------------------------------------ */

test("every field the adapter maps cites the battle map, and every silence names its capture", () => {
  const record = normaliseVanillaCombatant(freshVanillaGladiator());
  for (const field of Object.values(CANONICAL_STAT_SOURCES)) {
    assert.ok(citationFor(field), `${field} must cite a battle-map section`);
  }
  for (const field of ["hitpoints", "hitpointsmax", "armourclass", "charisma", ...STATUS_FLAG_FIELDS]) {
    assert.ok(citationFor(field), `${field} must cite a battle-map section`);
  }
  assert.equal(citationFor("gladiator_dir"), "battle-map: Combatant state objects / clip-resident facing");
  assert.match(citationFor("spell_regenerate"), /timed spell_\* fields, unnamed/);
  assert.equal(citationFor("some_future_field"), null);
  assert.ok(record.unknownFields.length === 0);

  // Pinned so the contract's "seven entries" claim cannot drift silently.
  assert.deepEqual([...MAP_SILENCE.map((entry) => entry.id)].sort(), [
    "initiative-order",
    "multi-slot-arena-geometry",
    "panel-bar-instance-names",
    "psyche-up-initialisation",
    "ranged-hurt-label-adjustment",
    "secondary-weapon-field-names",
    "timed-spell-field-names"
  ]);
  for (const entry of MAP_SILENCE) {
    for (const key of ["id", "subject", "silence", "adapterBehaviour", "settledBy"]) {
      assert.equal(typeof entry[key], "string");
      assert.ok(entry[key].length > 0, `${entry.id} needs a ${key}`);
    }
  }
  assert.equal(new Set(MAP_SILENCE.map((entry) => entry.id)).size, MAP_SILENCE.length);
});
