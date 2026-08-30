/**
 * Asset-free reconstruction of the licensed SS2 build's physical attack path.
 *
 * This module is deliberately isolated from classicStyleRules. Its output is a
 * static-analysis candidate for golden comparison, not a claim of runtime
 * parity. Only licensed observations should promote a fixture to verified.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => JSON.parse(JSON.stringify(value));

// Byte-verified death() clear order: frozen, burning, poison, life_stolen —
// hero's group first, then villain's, then taunted1/taunted2 per field.
const STATUS_FIELDS = Object.freeze(["frozen", "burning", "poison", "life_stolen"]);
const ENCHANTMENT_STATUS = Object.freeze({
  2: "burning",
  3: "frozen",
  4: "poison",
  5: "life_stolen"
});

const TOP_ARMOUR = Object.freeze([
  ["helmet", "helmet_defence"],
  ["shoulderguard", "shoulderguard_defence"]
]);
const MIDDLE_ARMOUR = Object.freeze([
  ["breastplate", "breastplate_defence"],
  ["gauntlet", "gauntlet_defence"],
  ["greaves", "greaves_defence"]
]);
const LOWER_ARMOUR = Object.freeze([
  ["shinguard", "shinguard_defence"],
  ["boot", "boot_defence"],
  ["shield", "shield_defence"]
]);
const ALL_ARMOUR = Object.freeze([...TOP_ARMOUR, ...MIDDLE_ARMOUR, ...LOWER_ARMOUR]);

export class Ss2CandidateError extends Error {}

function numberField(object, name, fallback = 0) {
  const value = object[name] ?? fallback;
  if (!Number.isFinite(value)) throw new Ss2CandidateError(`${name} must be a finite number.`);
  return value;
}

function initialiseCombatant(combatant) {
  combatant.attack = numberField(combatant, "attack");
  combatant.defence = numberField(combatant, "defence");
  combatant.strength = numberField(combatant, "strength");
  combatant.charisma = numberField(combatant, "charisma");
  combatant.magicka = numberField(combatant, "magicka");
  combatant.shield = numberField(combatant, "shield");
  combatant.helmet = numberField(combatant, "helmet");
  combatant.greaves = numberField(combatant, "greaves");
  combatant.min_damage = numberField(combatant, "min_damage", 1);
  combatant.max_damage = numberField(combatant, "max_damage", combatant.min_damage);
  combatant.character_level = numberField(combatant, "character_level", 1);
  combatant.hitpointsmax = numberField(combatant, "hitpointsmax", combatant.hitpoints ?? 1);
  combatant.hitpoints = numberField(combatant, "hitpoints", combatant.hitpointsmax);
  combatant.armourclass_max = numberField(combatant, "armourclass_max", combatant.armourclass ?? 0);
  combatant.armourclass = numberField(combatant, "armourclass", combatant.armourclass_max);
  combatant.staminamax = numberField(combatant, "staminamax", combatant.staminaleft ?? 0);
  combatant.staminaleft = numberField(combatant, "staminaleft", combatant.staminamax);
  combatant.equipped_weapon = numberField(combatant, "equipped_weapon", 1);
  combatant.weapon_enchantment_type = numberField(combatant, "weapon_enchantment_type");
  combatant.weapon_enchantment_potency = numberField(combatant, "weapon_enchantment_potency");
  combatant.secondary_weapon_enchantment_type = numberField(combatant, "secondary_weapon_enchantment_type");
  combatant.secondary_weapon_enchantment_potency = numberField(combatant, "secondary_weapon_enchantment_potency");
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

function roundedChance(ratio, factor) {
  return Math.round(ratio * 100 * factor);
}

/** Statically reconstructed candidate for overlay.attack_chances. */
export function calculateSs2AttackChances(attackerSource, defenderSource) {
  const attacker = initialiseCombatant(clone(attackerSource));
  const defender = initialiseCombatant(clone(defenderSource));
  const attackRatio = (attacker.attack + 9) / (defender.defence + 9);
  const charismaRatio = (attacker.charisma + 9) / (defender.charisma + 9);
  const magickaRatio = (attacker.magicka + 9) / (defender.magicka + 9);
  const rangedShieldAdjustment = (base) => Math.ceil(base * (100 + attacker.shield * 1.5) / 100);
  const bounded = (value) => clamp(value, 1, 99);
  return {
    power: bounded(roundedChance(attackRatio, 0.33)),
    normal: bounded(roundedChance(attackRatio, 0.5)),
    quick: bounded(roundedChance(attackRatio, 0.66)),
    bash: bounded(roundedChance(attackRatio, 0.2)),
    taunt: bounded(roundedChance(charismaRatio, 0.4)),
    bombard: bounded(rangedShieldAdjustment(roundedChance(attackRatio, 0.6))),
    snipe: bounded(rangedShieldAdjustment(roundedChance(attackRatio, 0.9))),
    magicka: roundedChance(magickaRatio, 0.5)
  };
}

function directionProfile(direction, attacker, defender, chances, rolls, transientCritical) {
  if (direction >= 1 && direction <= 4) {
    return {
      chance: chances.quick,
      damage: attacker.min_damage,
      critical: rolls.randomBetween("quick-critical-roll", -20, 20)
    };
  }
  if (direction >= 5 && direction <= 8) {
    return {
      chance: chances.normal,
      damage: rolls.randomBetween("normal-damage-roll", attacker.min_damage, attacker.max_damage),
      critical: rolls.randomBetween("normal-critical-roll", 1, 20)
    };
  }
  if (direction >= 9 && direction <= 12) {
    return {
      chance: chances.power,
      critical: rolls.randomBetween("power-critical-roll", 5, 20),
      damage: attacker.max_damage
    };
  }
  if (direction === 20) {
    let damage = Math.round(attacker.charisma * 4) - defender.charisma;
    if (damage < 1) damage = rolls.randomBetween("taunt-floor-damage-roll", 1, 3);
    return { chance: chances.taunt, damage, critical: 21 };
  }
  if (direction === 21) {
    return {
      chance: chances.bombard,
      critical: rolls.randomBetween("bombard-critical-roll", -20, 20),
      damage: rolls.randomBetween("bombard-damage-roll", attacker.min_damage, attacker.max_damage)
    };
  }
  if (direction === 22) return { chance: chances.snipe, damage: attacker.min_damage, critical: 0 };
  if (direction === 23) {
    if (!Number.isFinite(transientCritical)) {
      throw new Ss2CandidateError(
        "attack_direction 23 does not assign criticalhit; scenario.transient.criticalhit is required."
      );
    }
    return {
      chance: chances.bash,
      damage: Math.ceil(attacker.min_damage / 2),
      critical: transientCritical,
      inheritedCritical: true
    };
  }
  if (direction === 30) {
    let damage = Math.ceil(attacker.max_damage * 1.5);
    if (damage <= 1) damage = attacker.character_level * 10;
    return { chance: chances.normal, damage, critical: 20 };
  }
  throw new Ss2CandidateError(`Unsupported attack_direction: ${direction}`);
}

function armourGroup(direction) {
  if ([1, 5, 8, 9].includes(direction)) return TOP_ARMOUR;
  if ([2, 4, 6, 10, 12].includes(direction)) return MIDDLE_ARMOUR;
  if ([3, 7, 11].includes(direction)) return LOWER_ARMOUR;
  return null;
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

function removeArmourCandidate(defender, direction, rolls, requestIndex, mutationTrace, defenderSide) {
  const group = armourGroup(direction);
  if (!group) return { request: requestIndex, selected: null, removed: false };
  const selection = rolls.randomBetween(`armour-selection-${requestIndex}`, 1, group.length);
  const [piece, defenceField] = group[selection - 1];
  const equipped = numberField(defender, piece);
  const defence = numberField(defender, defenceField);
  const removed = equipped !== 0;
  if (removed) {
    const armourBefore = defender.armourclass;
    defender.armourclass -= defence;
    recordMutation(
      mutationTrace,
      `/${defenderSide}/armourclass`,
      armourBefore,
      defender.armourclass,
      "remove-armour-piece"
    );
    const maximumBefore = defender.armourclass_max;
    defender.armourclass_max -= defence;
    recordMutation(
      mutationTrace,
      `/${defenderSide}/armourclass_max`,
      maximumBefore,
      defender.armourclass_max,
      "remove-armour-piece"
    );
  }
  let debrisRolls = null;
  if (removed) {
    const prefix = `armour-debris-${requestIndex}`;
    const horizontal = defender.gladiator_dir === "right"
      ? { source: "randomNumber", value: rolls.randomNumber(`${prefix}-x`, 20) }
      : defender.gladiator_dir === "left"
        ? { source: "randomNumber", value: rolls.randomNumber(`${prefix}-x`, 30) }
        : { source: "randomBetween", value: rolls.randomBetween(`${prefix}-x`, -30, 60) };
    debrisRolls = {
      horizontal,
      vertical: rolls.randomNumber(`${prefix}-y`, 20),
      rotation: rolls.randomNumber(`${prefix}-rotation`, 5)
    };
    defender[piece] = 0;
    recordMutation(mutationTrace, `/${defenderSide}/${piece}`, equipped, 0, "remove-armour-piece");
  }
  const unclampedArmour = defender.armourclass;
  defender.armourclass = Math.max(0, defender.armourclass);
  recordMutation(
    mutationTrace,
    `/${defenderSide}/armourclass`,
    unclampedArmour,
    defender.armourclass,
    "remove-armour-clamp"
  );
  const unclampedMaximum = defender.armourclass_max;
  defender.armourclass_max = Math.max(0, defender.armourclass_max);
  recordMutation(
    mutationTrace,
    `/${defenderSide}/armourclass_max`,
    unclampedMaximum,
    defender.armourclass_max,
    "remove-armour-clamp"
  );
  return {
    request: requestIndex,
    selected: piece,
    removed,
    defenceRemoved: removed ? defence : 0,
    debrisRolls
  };
}

function activeEnchantment(attacker) {
  if (attacker.equipped_weapon === 2) {
    return {
      type: attacker.secondary_weapon_enchantment_type,
      potency: attacker.weapon_enchantment_potency
    };
  }
  return {
    type: attacker.weapon_enchantment_type,
    potency: attacker.weapon_enchantment_potency
  };
}

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

function createResult(attackerSide, defenderSide) {
  const arenaLabel = attackerSide === "hero" ? "combat_won" : "combat_lost";
  return {
    status: "pending-animation",
    completionToken: `ss2-1v1:${attackerSide}:${defenderSide}:${arenaLabel}`,
    winnerSide: attackerSide,
    loserSide: defenderSide,
    reason: "elimination",
    overlayLabel: attackerSide === "hero" ? "combatwon" : "combatlost",
    arenaLabel
  };
}

/**
 * Resolves one mapped physical attack with a strict ordered-roll tape.
 * The passed scenario is intentionally mutated; the generic harness supplies a
 * deep clone so fixture input remains immutable.
 */
export function resolveSs2PhysicalAttackCandidate(scenario, rolls) {
  if (!scenario || typeof scenario !== "object") throw new Ss2CandidateError("scenario must be an object.");
  if (scenario.result) throw new Ss2CandidateError("The 1v1 result has already been set.");
  const attackerSide = scenario.attackerSide;
  if (attackerSide !== "hero" && attackerSide !== "villain") {
    throw new Ss2CandidateError("attackerSide must be hero or villain.");
  }
  const defenderSide = attackerSide === "hero" ? "villain" : "hero";
  const attacker = initialiseCombatant(scenario[attackerSide]);
  const defender = initialiseCombatant(scenario[defenderSide]);
  const direction = Number(scenario.attackDirection);
  if (!Number.isInteger(direction)) throw new Ss2CandidateError("attackDirection must be an integer.");

  const chances = calculateSs2AttackChances(attacker, defender);
  const diceroll = rolls.randomBetween("hit-roll", 1, 100);
  const profile = directionProfile(
    direction,
    attacker,
    defender,
    chances,
    rolls,
    scenario.transient?.criticalhit
  );
  const selectedDamage = Math.ceil(profile.damage);
  const rollNeeded = 100 - profile.chance;
  const hit = diceroll >= rollNeeded;

  const calculation = {
    attackDirection: direction,
    chance: profile.chance,
    rollNeeded,
    diceroll,
    hit,
    selectedDamage,
    criticalSample: profile.critical,
    inheritedCritical: Boolean(profile.inheritedCritical)
  };

  if (!hit) {
    return {
      calculation,
      mutation: {
        armourDamage: 0,
        hitpointDamage: 0,
        staminaBonus: 0,
        armourRemovalRoll: null,
        armourRemovals: [],
        knockback: null,
        enchantmentRoll: null,
        statusApplied: null
      },
      mutationTrace: [],
      resultEvent: null,
      state: projectState(scenario)
    };
  }

  const deflectionRoll = rolls.randomBetween("critical-deflection-roll", 1, 100);
  const deflectionThreshold = (100 - defender.helmet * 1.5) + defender.greaves;
  const criticalCleared = direction !== 30 && deflectionRoll >= deflectionThreshold;
  const criticalSample = criticalCleared ? 0 : profile.critical;
  const dispatchedMethod = direction === 30
    ? "grievous"
    : direction === 20
      ? "taunt"
      : criticalSample === 20
        ? "critical"
        : "normal";
  const effectiveMethod = dispatchedMethod === "taunt" ? "normal" : dispatchedMethod;
  calculation.deflectionRoll = deflectionRoll;
  calculation.deflectionThreshold = deflectionThreshold;
  calculation.criticalCleared = criticalCleared;
  calculation.criticalSampleAfterDeflection = criticalSample;
  calculation.dispatchedMethod = dispatchedMethod;
  calculation.effectiveDamageMethod = effectiveMethod;

  const armourRemovalRoll = rolls.randomBetween("armour-removal-roll", 1, 100);
  const mutationTrace = [];
  const removalRequests = (effectiveMethod === "grievous" ? 1 : 0) + (armourRemovalRoll > 66 ? 1 : 0);
  const armourRemovals = [];
  for (let request = 1; request <= removalRequests; request += 1) {
    armourRemovals.push(
      removeArmourCandidate(defender, direction, rolls, request, mutationTrace, defenderSide)
    );
  }

  const armourBeforeDamage = defender.armourclass;
  const hitpointsBeforeDamage = defender.hitpoints;
  let vanillaDamageRegister = selectedDamage;
  let hitpointDamage = selectedDamage;
  let healthPathEntered = true;
  if ((effectiveMethod === "normal" || effectiveMethod === "grievous") && defender.armourclass > 0) {
    const armourTemporary = defender.armourclass;
    const armourBefore = defender.armourclass;
    defender.armourclass -= selectedDamage;
    recordMutation(
      mutationTrace,
      `/${defenderSide}/armourclass`,
      armourBefore,
      defender.armourclass,
      "physical-damage"
    );
    if (defender.armourclass < 0) vanillaDamageRegister = selectedDamage - armourTemporary;
    healthPathEntered = defender.armourclass <= 0;
    hitpointDamage = healthPathEntered ? vanillaDamageRegister : 0;
  }
  if (hitpointDamage > 0) {
    const hitpointsBefore = defender.hitpoints;
    defender.hitpoints -= hitpointDamage;
    recordMutation(
      mutationTrace,
      `/${defenderSide}/hitpoints`,
      hitpointsBefore,
      defender.hitpoints,
      "physical-damage"
    );
  }
  // Byte-verified 2026-08-30: the breastplate stamina block is an
  // unconditional join in the mapped ingress — the absorbed-armour skip
  // branch jumps directly into it — so fully absorbed damage still grants
  // stamina from the undiminished damage register.
  const staminaBonus = Math.ceil(defender.breastplate * vanillaDamageRegister / 100);
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
  clampCombatant(defender, mutationTrace, defenderSide);

  let resultEvent = null;
  if (defender.hitpoints <= 0) {
    clearDeathState(scenario, mutationTrace);
    const resultBefore = scenario.result ?? null;
    scenario.result = createResult(attackerSide, defenderSide);
    recordMutation(mutationTrace, "/result", resultBefore, scenario.result, "battle-result-pending");
    resultEvent = { type: "battle-result-pending", ...scenario.result };
  }

  let knockback = null;
  if ((direction >= 5 && direction <= 12) || direction === 30) {
    const knockbackRoll = rolls.randomBetween("knockback-roll", 1, 4);
    if (knockbackRoll > 3 || direction === 30) {
      // Byte-verified: the vanilla force reads the timeline-aliased damage
      // register AFTER the armour-overflow rewrite, so an overflowing hit
      // knocks back with the overflow remainder, not the selected damage.
      const magnitude = Math.max(20, vanillaDamageRegister + attacker.strength * 6);
      const force = defender.gladiator_dir === "left" ? magnitude : -magnitude;
      knockback = { roll: knockbackRoll, force, animation: Math.abs(force) > 80 };
    } else {
      knockback = { roll: knockbackRoll, force: null, animation: false };
    }
  }

  const enchantmentRoll = rolls.randomBetween("enchantment-potency-roll", 1, 100);
  const enchantment = activeEnchantment(attacker);
  const statusApplied = enchantmentRoll < enchantment.potency * 10
    ? ENCHANTMENT_STATUS[enchantment.type] ?? null
    : null;
  if (statusApplied) {
    const statusBefore = defender[statusApplied];
    defender[statusApplied] = true;
    recordMutation(
      mutationTrace,
      `/${defenderSide}/${statusApplied}`,
      statusBefore,
      true,
      "weapon-enchantment"
    );
  }

  return {
    calculation,
    mutation: {
      armourDamage: armourBeforeDamage - defender.armourclass,
      hitpointDamage: hitpointsBeforeDamage - defender.hitpoints,
      staminaBonus,
      armourRemovalRoll,
      armourRemovals,
      knockback,
      enchantmentRoll,
      statusApplied
    },
    mutationTrace,
    resultEvent,
    state: projectState(scenario)
  };
}

/** One-shot bridge for the final animation acknowledgement. */
export function createOneShotResultBridge(callback) {
  if (typeof callback !== "function") throw new Ss2CandidateError("A result callback is required.");
  let delivered = false;
  return {
    acknowledge(event, acknowledgement) {
      if (
        !event ||
        event.type !== "battle-result-pending" ||
        typeof event.completionToken !== "string" ||
        event.completionToken.length === 0
      ) {
        throw new Ss2CandidateError("Expected a battle-result-pending event with a completion token.");
      }
      if (
        !acknowledgement ||
        acknowledgement.type !== "battle-result-animation-complete" ||
        typeof acknowledgement.completionToken !== "string" ||
        acknowledgement.completionToken.length === 0 ||
        acknowledgement.completionToken !== event.completionToken
      ) {
        throw new Ss2CandidateError("A matching battle-result-animation-complete acknowledgement is required.");
      }
      if (delivered) return false;
      delivered = true;
      callback(clone(event));
      return true;
    },
    get delivered() {
      return delivered;
    }
  };
}
