/**
 * Asset-free reconstruction of the licensed SS2 build's spell damage ingress,
 * `magic_damage_character`.
 *
 * This module is deliberately isolated: it imports nothing from
 * src/golden/ss2-attack-candidate.js, nothing from src/engine.js, and nothing
 * from classicStyleRules. The duplicated helpers below are intentional — the
 * physical and spell ingresses are independent reconstructions that must be
 * able to diverge without either one silently rewriting the other.
 *
 * Its output is a static-analysis candidate for golden comparison, not a claim
 * of runtime parity. Only licensed observations may promote a fixture.
 *
 * Every rule below cites docs/integration/ss2-battle-map.md, section
 * "Spell ingress `magic_damage_character` (byte-verified 2026-08-30)"
 * (map lines 336-397) and the shared "Defeat gate and death dispatch"
 * section (map lines 298-334).
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => JSON.parse(JSON.stringify(value));

// Byte-verified death() clear order (map lines 453-462): frozen, burning,
// poison, life_stolen — the hero's group first, then the villain's — followed
// by taunted1 (hero, villain) and taunted2 (hero, villain).
const STATUS_FIELDS = Object.freeze(["frozen", "burning", "poison", "life_stolen"]);

// The eight armour pieces and their per-piece defence fields (map line 138).
// The spell ingress never removes a piece (see NO_REMOVAL below); the list
// exists so the projected state carries the same 18 keys as every other 1v1
// record.
const ALL_ARMOUR = Object.freeze([
  ["helmet", "helmet_defence"],
  ["shoulderguard", "shoulderguard_defence"],
  ["breastplate", "breastplate_defence"],
  ["gauntlet", "gauntlet_defence"],
  ["greaves", "greaves_defence"],
  ["shinguard", "shinguard_defence"],
  ["boot", "boot_defence"],
  ["shield", "shield_defence"]
]);

const FIGHT_MODES = Object.freeze(new Set(["tournament", "duel", "misc"]));

/**
 * The mapped direct-damage spell callers (map lines 384-397 for the ranges,
 * map lines 415-419 for the inventory ID table).
 *
 * `magic_damage_character` itself contains **no** RNG call and no
 * `RandomNumber` opcode (map lines 366-371): "Spell damage rolls therefore all
 * happen in the callers (the mapped `randomBetween` ranges)". So the single
 * ordered-roll sample this family consumes belongs to the caller, not to the
 * ingress, and the ingress core (`applySs2MagicDamageCandidate`) takes the
 * already-calculated `damage` argument with no tape at all.
 *
 * `damageMethod` is the ingress's `damage_method` argument, which for this
 * ingress is the defender's animation label (map lines 348-350). The map
 * records a label only for fireball ("burning") and lightning bolt
 * ("lightning"); the remaining direct-damage spells have no recorded label, so
 * they carry `null` rather than an invented one. The "burning" animation label
 * is NOT the `burning` status flag — this ingress sets no status flags.
 *
 * ID 33 (little fat kid) is a transformation, not a direct-damage spell, and
 * ID 49 (death from above / molten death) schedules 10-20 separate 40-damage
 * impacts (map line 393), i.e. many ingress invocations; neither is a
 * single-invocation direct-damage caller, so neither is mapped here.
 */
export const SS2_DIRECT_DAMAGE_SPELLS = Object.freeze({
  30: Object.freeze({
    name: "fireball",
    rollLabel: "fireball-damage-roll",
    min: 80,
    max: 160,
    damageMethod: "burning"
  }),
  31: Object.freeze({
    name: "hell-fireball",
    rollLabel: "hell-fireball-damage-roll",
    min: 150,
    max: 450,
    damageMethod: null
  }),
  32: Object.freeze({
    name: "dire-fireball",
    rollLabel: "dire-fireball-damage-roll",
    min: 300,
    max: 600,
    damageMethod: null
  }),
  34: Object.freeze({
    name: "lightning-bolt",
    rollLabel: "lightning-bolt-damage-roll",
    min: 100,
    max: 200,
    damageMethod: "lightning"
  }),
  35: Object.freeze({
    name: "frightning-bolt",
    rollLabel: "frightning-bolt-damage-roll",
    min: 200,
    max: 400,
    damageMethod: null
  })
});

export class Ss2SpellCandidateError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

function isPlainish(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberField(object, name, fallback = 0) {
  const value = object[name] ?? fallback;
  if (!Number.isFinite(value)) throw new Ss2SpellCandidateError(`${name} must be a finite number.`);
  return value;
}

/**
 * Normalise only the fields this ingress reads or projects. The ingress reads
 * `game_defender` (register r2) and the `damage` argument; `attacker` and
 * `game_attacker` are not even register-bound in the byte-verified parameter
 * table (map lines 341-345), so no attacker stat can influence the outcome.
 */
function initialiseCombatant(combatant, path) {
  if (!isPlainish(combatant)) throw new Ss2SpellCandidateError(`${path} must be an object.`);
  combatant.hitpointsmax = numberField(combatant, "hitpointsmax", combatant.hitpoints ?? 1);
  combatant.hitpoints = numberField(combatant, "hitpoints", combatant.hitpointsmax);
  combatant.armourclass_max = numberField(combatant, "armourclass_max", combatant.armourclass ?? 0);
  combatant.armourclass = numberField(combatant, "armourclass", combatant.armourclass_max);
  combatant.staminamax = numberField(combatant, "staminamax", combatant.staminaleft ?? 0);
  combatant.staminaleft = numberField(combatant, "staminaleft", combatant.staminamax);
  for (const [piece, defenceField] of ALL_ARMOUR) {
    combatant[piece] = numberField(combatant, piece);
    combatant[defenceField] = numberField(combatant, defenceField);
  }
  combatant.gladiator_dir ??= "right";
  for (const field of STATUS_FIELDS) combatant[field] = Boolean(combatant[field]);
  combatant.taunted1 = Boolean(combatant.taunted1);
  combatant.taunted2 = Boolean(combatant.taunted2);
  return combatant;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordMutation(trace, path, before, after, reason) {
  if (valuesEqual(before, after)) return;
  trace.push({
    sequence: trace.length + 1,
    path,
    before: clone(before),
    after: clone(after),
    reason
  });
}

/** `check_stats(game_defender)` — map step 6 (line 364). */
function clampCombatant(combatant, mutationTrace, side) {
  const hitpointsBefore = combatant.hitpoints;
  combatant.hitpoints = clamp(combatant.hitpoints, 0, combatant.hitpointsmax);
  recordMutation(mutationTrace, `/${side}/hitpoints`, hitpointsBefore, combatant.hitpoints, "stat-clamp");
  const armourBefore = combatant.armourclass;
  combatant.armourclass = clamp(combatant.armourclass, 0, combatant.armourclass_max);
  recordMutation(mutationTrace, `/${side}/armourclass`, armourBefore, combatant.armourclass, "stat-clamp");
  const staminaBefore = combatant.staminaleft;
  combatant.staminaleft = clamp(combatant.staminaleft, 0, combatant.staminamax);
  recordMutation(mutationTrace, `/${side}/staminaleft`, staminaBefore, combatant.staminaleft, "stat-clamp");
}

/** Byte-verified death() status clear order (map lines 453-462). */
function clearDeathState(scenario, mutationTrace) {
  for (const side of ["hero", "villain"]) {
    for (const field of STATUS_FIELDS) {
      const before = scenario[side][field];
      scenario[side][field] = false;
      recordMutation(mutationTrace, `/${side}/${field}`, before, false, "death-status-clear");
    }
  }
  for (const field of ["taunted1", "taunted2"]) {
    for (const side of ["hero", "villain"]) {
      const before = scenario[side][field];
      scenario[side][field] = false;
      recordMutation(mutationTrace, `/${side}/${field}`, before, false, "death-taunt-clear");
    }
  }
}

function projectCombatant(combatant) {
  const projection = {
    hitpoints: combatant.hitpoints,
    armourclass: combatant.armourclass,
    armourclass_max: combatant.armourclass_max,
    staminaleft: combatant.staminaleft,
    burning: combatant.burning,
    frozen: combatant.frozen,
    poison: combatant.poison,
    life_stolen: combatant.life_stolen,
    taunted1: combatant.taunted1,
    taunted2: combatant.taunted2
  };
  // `psyche_up` is deliberately absent: the shared projected-combatant key set
  // (SS2_PROJECTED_COMBATANT_KEYS in run-1v1-fixture.js) does not carry it, so
  // the unconditional psyche_up write is visible in the ordered mutation trace
  // only.
  for (const [piece] of ALL_ARMOUR) projection[piece] = combatant[piece];
  return projection;
}

function projectState(scenario) {
  return {
    hero: projectCombatant(scenario.hero),
    villain: projectCombatant(scenario.villain),
    result: scenario.result ?? null
  };
}

function createResult(attackerSide, defenderSide, reason, howDied) {
  const arenaLabel = attackerSide === "hero" ? "combat_won" : "combat_lost";
  return {
    status: "pending-animation",
    completionToken: `ss2-1v1:${attackerSide}:${defenderSide}:${arenaLabel}`,
    winnerSide: attackerSide,
    loserSide: defenderSide,
    reason,
    howDied,
    overlayLabel: attackerSide === "hero" ? "combatwon" : "combatlost",
    arenaLabel
  };
}

function readScenarioEnvelope(scenario) {
  if (!isPlainish(scenario)) throw new Ss2SpellCandidateError("scenario must be an object.");
  if (scenario.result) throw new Ss2SpellCandidateError("The 1v1 result has already been set.");
  const attackerSide = scenario.attackerSide;
  if (attackerSide !== "hero" && attackerSide !== "villain") {
    throw new Ss2SpellCandidateError("attackerSide must be hero or villain.");
  }
  // Byte-verified and observed live (map lines 298-334): the defeat gate
  // depends on the fight mode. Absent fightMode means "tournament", the mode
  // whose only defeat condition is hitpoints <= 0.
  const fightMode = scenario.fightMode ?? "tournament";
  if (!FIGHT_MODES.has(fightMode)) {
    throw new Ss2SpellCandidateError("fightMode must be tournament, duel, or misc.");
  }
  return { attackerSide, defenderSide: attackerSide === "hero" ? "villain" : "hero", fightMode };
}

/**
 * The `magic_damage_character` ingress core: a pure function of the scenario
 * and one already-calculated `damage` argument, with **no** RNG of any kind.
 *
 * The passed scenario is intentionally mutated; the generic harness supplies a
 * deep clone so fixture input stays immutable.
 *
 * @param {object} scenario  1v1 scenario (mutated in place)
 * @param {number} damage    the ingress's `damage` argument (may be fractional)
 * @param {object} identity  caller attribution: spellId, spell, damageMethod,
 *                           rolledDamage — all optional and outcome-neutral
 */
export function applySs2MagicDamageCandidate(scenario, damage, identity = {}) {
  const { attackerSide, defenderSide, fightMode } = readScenarioEnvelope(scenario);
  if (!Number.isFinite(damage)) {
    throw new Ss2SpellCandidateError("The magic_damage_character damage argument must be a finite number.");
  }
  if (!isPlainish(identity)) throw new Ss2SpellCandidateError("identity must be an object.");
  initialiseCombatant(scenario[attackerSide], `scenario.${attackerSide}`);
  const defender = initialiseCombatant(scenario[defenderSide], `scenario.${defenderSide}`);

  const mutationTrace = [];
  const incomingDamage = damage;

  // Step 1 (map lines 346-350) is UI only: bonus_icon at depth 25005, the
  // splat frame from `bonus_frame`, check_flipping, crowd action 2 and
  // `defenderClip.gotoAndPlay(damage_method)`. The only number it computes is
  // the *displayed* bonus, `Math.ceil(damage)` — the map is explicit (line
  // 359) that "the ceil at step 1 is display-only". It never feeds the
  // armour/hitpoint math below.
  const displayedBonus = Math.ceil(incomingDamage);

  const armourBeforeDamage = defender.armourclass;
  const hitpointsBeforeDamage = defender.hitpoints;

  // Step 2 (map lines 351-356): armour-first, identical to the physical path,
  // including the exact-armour-equality quirk and the strict-overflow rewrite
  // `damage -= originalArmour`; `armourclass` is left negative until
  // `check_stats` clamps it.
  let damageRegister = incomingDamage;
  let armourEquality = false;
  let overflowRewritten = false;
  if (defender.armourclass > 0) {
    // `armourclass_temp` in vanilla: the pre-decrement armour, zeroed only on
    // strict overflow. It is a scratch register with no persistent effect in
    // this ingress, so it is modelled as a local.
    const armourclassTemp = defender.armourclass;
    const armourBefore = defender.armourclass;
    defender.armourclass -= incomingDamage;
    recordMutation(
      mutationTrace,
      `/${defenderSide}/armourclass`,
      armourBefore,
      defender.armourclass,
      "magic-damage"
    );
    if (defender.armourclass < 0) {
      damageRegister = incomingDamage - armourclassTemp;
      overflowRewritten = true;
    } else if (defender.armourclass === 0) {
      // The quirk: equality skips the overflow rewrite, so the full original
      // damage also reaches hitpoints through the branch below.
      armourEquality = true;
    }
  }
  const armourAfterDamage = defender.armourclass;

  // Step 3 (map lines 357-360): the hitpoints subtraction is gated on the
  // post-decrement `armourclass <= 0`, and the applied damage is the raw
  // `damage` register (possibly overflow-rewritten). Unlike the physical
  // `damagecharacter`, which rounds damage upward (map line 269), there is NO
  // Math.ceil here.
  const hitpointsApplied = defender.armourclass <= 0;
  if (hitpointsApplied) {
    const hitpointsBefore = defender.hitpoints;
    defender.hitpoints -= damageRegister;
    recordMutation(
      mutationTrace,
      `/${defenderSide}/hitpoints`,
      hitpointsBefore,
      defender.hitpoints,
      "magic-damage"
    );
  }

  // Step 4 (map line 361): `game_defender.psyche_up = 1` unconditionally at
  // the join — on absorbed hits, overflowing hits and no-armour hits alike.
  // The fixture schema cannot stage psyche_up (it is outside COMBATANT_KEYS)
  // and the vanilla objects leave conditions undefined until something sets
  // them (map lines 117-119), so an unstaged pre-state is recorded as null.
  const psycheUpBefore = defender.psyche_up ?? null;
  defender.psyche_up = 1;
  recordMutation(mutationTrace, `/${defenderSide}/psyche_up`, psycheUpBefore, 1, "psyche-up");

  // Step 5 (map lines 362, 283-289): the same unconditional breastplate
  // stamina join as the physical path — `add_percentage(breastplate, damage)`
  // = ceil(breastplate * damage / 100), where `damage` is the current
  // register: the full damage when armour absorbed the hit or on the
  // no-armour path, and the overflow remainder after a rewrite. Raw, not
  // ceiled, on the way in.
  const staminaBonus = Math.ceil(defender.breastplate * damageRegister / 100);
  if (staminaBonus !== 0) {
    const staminaBefore = defender.staminaleft;
    defender.staminaleft += staminaBonus;
    recordMutation(
      mutationTrace,
      `/${defenderSide}/staminaleft`,
      staminaBefore,
      defender.staminaleft,
      "breastplate-stamina"
    );
  }

  // Step 6 (map line 364): check_stats(game_defender), then the shared defeat
  // gate. `_global.phasecomplete = true` is set first on gate entry (map line
  // 308); it is a global flag, not combatant state, so it is not projected.
  clampCombatant(defender, mutationTrace, defenderSide);

  let resultEvent = null;
  const eliminated = defender.hitpoints <= 0;
  const firstBlood = !eliminated &&
    defender.hitpoints < defender.hitpointsmax &&
    fightMode !== "tournament";
  if (eliminated || firstBlood) {
    clearDeathState(scenario, mutationTrace);
    const resultBefore = scenario.result ?? null;
    // Map lines 311-318: duels always call death(clip, "yield"); otherwise
    // `magic_damage_character` has no direction chain and always uses "slain".
    scenario.result = createResult(
      attackerSide,
      defenderSide,
      eliminated ? "elimination" : "first-blood",
      fightMode === "duel" ? "yield" : "slain"
    );
    recordMutation(mutationTrace, "/result", resultBefore, scenario.result, "battle-result-pending");
    resultEvent = { type: "battle-result-pending", ...scenario.result };
  }

  return {
    calculation: {
      spellId: identity.spellId ?? null,
      spell: identity.spell ?? null,
      damageMethod: identity.damageMethod ?? null,
      fightMode,
      rolledDamage: identity.rolledDamage ?? null,
      incomingDamage,
      displayedBonus,
      armourBefore: armourBeforeDamage,
      armourAfterDamage,
      armourEquality,
      overflowRewritten,
      appliedDamage: damageRegister,
      hitpointsApplied
    },
    mutation: {
      appliedDamage: damageRegister,
      armourDamage: armourBeforeDamage - defender.armourclass,
      hitpointDamage: hitpointsBeforeDamage - defender.hitpoints,
      staminaBonus,
      // Always true: step 4 is an unconditional join, so there is no branch in
      // which the spell ingress leaves psyche_up alone.
      psycheUpApplied: true
    },
    mutationTrace,
    resultEvent,
    state: projectState(scenario)
  };
}

/**
 * Resolves one mapped direct-damage spell with a strict ordered-roll tape, in
 * the `(scenario, rolls)` shape the 1v1 fixture runner calls.
 *
 * Schema note: the shared 1v1 scenario schema has no spell field, so the spell
 * identity travels in `scenario.attackDirection` as the mapped inventory ID
 * (map lines 415-419). That is sound for this ingress precisely because
 * `magic_damage_character` "has no direction chain" (map line 317) — no rule
 * below reads an attack direction. Fixtures flag this with the
 * `spell-id-in-attack-direction` candidate flag.
 *
 * The single tape sample belongs to the *caller* (`villain_cast_spells` and
 * the `cast_*` phase decisions), not to the ingress, which contains no RNG
 * call at all.
 */
export function resolveSs2SpellDamageCandidate(scenario, rolls) {
  if (!isPlainish(scenario)) throw new Ss2SpellCandidateError("scenario must be an object.");
  const spellId = scenario.attackDirection;
  if (!Number.isInteger(spellId)) {
    throw new Ss2SpellCandidateError("attackDirection must be an integer spell inventory id.");
  }
  const spell = SS2_DIRECT_DAMAGE_SPELLS[spellId];
  if (!spell) {
    throw new Ss2SpellCandidateError(
      `${spellId} is not a mapped direct-damage spell inventory id ` +
      `(expected one of ${Object.keys(SS2_DIRECT_DAMAGE_SPELLS).join(", ")}).`
    );
  }
  if (!rolls || typeof rolls.randomBetween !== "function") {
    throw new Ss2SpellCandidateError("An ordered roll tape is required.");
  }
  // Validate the envelope before touching the tape, so a malformed scenario
  // never silently consumes a sample.
  readScenarioEnvelope(scenario);
  const rolledDamage = rolls.randomBetween(spell.rollLabel, spell.min, spell.max);
  return applySs2MagicDamageCandidate(scenario, rolledDamage, {
    spellId,
    spell: spell.name,
    damageMethod: spell.damageMethod,
    rolledDamage
  });
}

/** Naming alias, matching the run-1v1-fixture.js alias convention. */
export const resolveSs2SpellCandidate = resolveSs2SpellDamageCandidate;
