/**
 * Deterministic team-combat foundation for an SS2 team-arena mod.
 *
 * This deliberately does not copy the original game's formulas. The adapter
 * will replace `classicStyleRules` once those formulas have been verified
 * against a licensed SS2 build. Keeping state, targeting, turns, and rules
 * separate is what makes 2v2, 3v3, hot-seat, and network play possible.
 */

export const ActionType = Object.freeze({
  MELEE: "melee",
  RANGED: "ranged",
  SPELL: "spell",
  REST: "rest"
});

export class BattleError extends Error {}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => JSON.parse(JSON.stringify(value));

function makeRng(seed) {
  let value = seed >>> 0;
  return {
    next() {
      value = (value + 0x6d2b79f5) >>> 0;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return value >>> 0;
    },
    set state(next) {
      value = next >>> 0;
    }
  };
}

/** A temporary, documented approximation—not a claim of SS2's exact maths. */
export const classicStyleRules = Object.freeze({
  maximumHealth(combatant) {
    return combatant.maxHealth ?? 50 + combatant.stats.vitality * 10;
  },
  hitChance(attacker, defender, action) {
    const modifier = action === ActionType.RANGED ? -0.08 : 0;
    return clamp(0.55 + (attacker.stats.attack - defender.stats.defense) * 0.018 + modifier, 0.1, 0.95);
  },
  damage(attacker, action) {
    const base = action === ActionType.RANGED ? attacker.loadout.rangedDamage : attacker.loadout.meleeDamage;
    return Math.max(1, Math.floor(base + attacker.stats.strength * 2));
  },
  spellDamage(attacker) {
    return Math.max(1, Math.floor(8 + attacker.stats.magicka * 2.5));
  },
  spellHealing(attacker) {
    return Math.max(1, Math.floor(6 + attacker.stats.magicka * 2));
  },
  restRecovery(combatant) {
    return Math.max(1, Math.floor(4 + combatant.stats.stamina * 1.5));
  }
});

function normaliseCombatant(source, teamId, index, rules) {
  const stats = {
    strength: source.stats?.strength ?? 5,
    agility: source.stats?.agility ?? 5,
    attack: source.stats?.attack ?? 5,
    defense: source.stats?.defense ?? 5,
    vitality: source.stats?.vitality ?? 5,
    stamina: source.stats?.stamina ?? 5,
    magicka: source.stats?.magicka ?? 0
  };
  const combatant = {
    id: source.id ?? `${teamId}-${index + 1}`,
    name: source.name ?? `Gladiator ${index + 1}`,
    teamId,
    controller: source.controller ?? "ai",
    stats,
    loadout: {
      meleeDamage: source.loadout?.meleeDamage ?? 4,
      rangedDamage: source.loadout?.rangedDamage ?? 3,
      canUseRanged: source.loadout?.canUseRanged ?? false,
      canUseSpell: source.loadout?.canUseSpell ?? stats.magicka > 0,
      canHeal: source.loadout?.canHeal ?? stats.magicka > 0
    },
    maxHealth: source.maxHealth,
    health: source.health,
    alive: true,
    status: []
  };
  combatant.maxHealth = rules.maximumHealth(combatant);
  combatant.health = clamp(combatant.health ?? combatant.maxHealth, 0, combatant.maxHealth);
  combatant.alive = combatant.health > 0;
  return combatant;
}

function assertUniqueIds(combatants) {
  const ids = new Set();
  for (const combatant of combatants) {
    if (ids.has(combatant.id)) throw new BattleError(`Duplicate combatant id: ${combatant.id}`);
    ids.add(combatant.id);
  }
}

export function createBattle({ teams, seed = 1, rules = classicStyleRules }) {
  if (!Array.isArray(teams) || teams.length !== 2) throw new BattleError("A battle needs exactly two teams.");
  const normalisedTeams = teams.map((team, teamIndex) => {
    if (!Array.isArray(team.combatants) || team.combatants.length < 1 || team.combatants.length > 3) {
      throw new BattleError("Each team must contain one to three combatants.");
    }
    return {
      id: team.id ?? `team-${teamIndex + 1}`,
      name: team.name ?? `Team ${teamIndex + 1}`,
      combatants: team.combatants.map((combatant, index) => normaliseCombatant(combatant, team.id ?? `team-${teamIndex + 1}`, index, rules))
    };
  });
  if (normalisedTeams[0].id === normalisedTeams[1].id) throw new BattleError("Team ids must be unique.");
  const combatants = normalisedTeams.flatMap((team) => team.combatants);
  assertUniqueIds(combatants);
  const initiative = [...combatants]
    .sort((a, b) => b.stats.agility - a.stats.agility || a.id.localeCompare(b.id))
    .map((combatant) => combatant.id);
  const rng = makeRng(seed);
  return {
    version: 1,
    seed: seed >>> 0,
    rngState: rng.state,
    rules,
    teams: normalisedTeams,
    initiative,
    turnCursor: 0,
    turnNumber: 1,
    result: null,
    events: []
  };
}

export function allCombatants(battle) {
  return battle.teams.flatMap((team) => team.combatants);
}

export function combatantById(battle, id) {
  return allCombatants(battle).find((combatant) => combatant.id === id);
}

export function currentCombatant(battle) {
  if (battle.result) return null;
  const id = battle.initiative[battle.turnCursor];
  return combatantById(battle, id);
}

export function aliveCombatants(battle, teamId) {
  return allCombatants(battle).filter((combatant) => combatant.alive && (!teamId || combatant.teamId === teamId));
}

function opponentsOf(battle, actor) {
  return aliveCombatants(battle).filter((combatant) => combatant.teamId !== actor.teamId);
}

function alliesOf(battle, actor) {
  return aliveCombatants(battle, actor.teamId);
}

export function legalActions(battle, actorId = currentCombatant(battle)?.id) {
  const actor = combatantById(battle, actorId);
  if (!actor?.alive || battle.result) return [];
  const foes = opponentsOf(battle, actor);
  const actions = [
    ...foes.map((target) => ({ type: ActionType.MELEE, targetId: target.id })),
    { type: ActionType.REST, targetId: actor.id }
  ];
  if (actor.loadout.canUseRanged) actions.push(...foes.map((target) => ({ type: ActionType.RANGED, targetId: target.id })));
  if (actor.loadout.canUseSpell) {
    actions.push(...foes.map((target) => ({ type: ActionType.SPELL, targetId: target.id, spellKind: "damage" })));
    if (actor.loadout.canHeal) actions.push(...alliesOf(battle, actor).map((target) => ({ type: ActionType.SPELL, targetId: target.id, spellKind: "heal" })));
  }
  return actions;
}

function actionIsLegal(battle, action) {
  return legalActions(battle, action.actorId).some((option) =>
    option.type === action.type && option.targetId === action.targetId && (option.spellKind ?? null) === (action.spellKind ?? null)
  );
}

function roll(battle) {
  const rng = makeRng(battle.rngState);
  const result = rng.next();
  battle.rngState = rng.state;
  return result;
}

function addEvent(battle, event) {
  battle.events.push({ sequence: battle.events.length + 1, turn: battle.turnNumber, ...event });
}

function checkResult(battle) {
  const livingTeams = battle.teams.filter((team) => team.combatants.some((combatant) => combatant.alive));
  if (livingTeams.length === 1) battle.result = { winnerTeamId: livingTeams[0].id, reason: "elimination" };
  if (livingTeams.length === 0) battle.result = { winnerTeamId: null, reason: "draw" };
}

function advanceTurn(battle) {
  checkResult(battle);
  if (battle.result) return;
  const total = battle.initiative.length;
  for (let steps = 0; steps < total; steps += 1) {
    battle.turnCursor = (battle.turnCursor + 1) % total;
    if (battle.turnCursor === 0) battle.turnNumber += 1;
    if (currentCombatant(battle).alive) return;
  }
  throw new BattleError("No living combatant was found while advancing the turn.");
}

/** Applies exactly one legal action. Network clients should submit this shape. */
export function applyAction(battle, action) {
  const actor = currentCombatant(battle);
  if (!actor) throw new BattleError("The battle has already ended.");
  if (action.actorId !== actor.id) throw new BattleError(`It is ${actor.id}'s turn, not ${action.actorId}'s.`);
  if (!actionIsLegal(battle, action)) throw new BattleError("Illegal action.");
  const target = combatantById(battle, action.targetId);
  const rules = battle.rules;

  if (action.type === ActionType.REST) {
    const recovered = Math.min(rules.restRecovery(actor), actor.maxHealth - actor.health);
    actor.health += recovered;
    addEvent(battle, { type: "rest", actorId: actor.id, targetId: actor.id, amount: recovered });
  } else if (action.type === ActionType.SPELL && action.spellKind === "heal") {
    const healed = Math.min(rules.spellHealing(actor), target.maxHealth - target.health);
    target.health += healed;
    addEvent(battle, { type: "heal", actorId: actor.id, targetId: target.id, amount: healed });
  } else {
    const hitChance = action.type === ActionType.SPELL ? 1 : rules.hitChance(actor, target, action.type);
    const hit = roll(battle) <= hitChance;
    const damage = hit ? (action.type === ActionType.SPELL ? rules.spellDamage(actor) : rules.damage(actor, action.type)) : 0;
    target.health = Math.max(0, target.health - damage);
    target.alive = target.health > 0;
    addEvent(battle, { type: action.type, actorId: actor.id, targetId: target.id, hit, damage, spellKind: action.spellKind ?? null });
    if (!target.alive) addEvent(battle, { type: "defeated", actorId: actor.id, targetId: target.id });
  }
  advanceTurn(battle);
  return battle;
}

function ratio(combatant) {
  return combatant.health / combatant.maxHealth;
}

/** Simple deterministic AI. Its actions use the same public protocol as players. */
export function chooseAiAction(battle, actorId = currentCombatant(battle)?.id) {
  const actor = combatantById(battle, actorId);
  if (!actor || actor.controller !== "ai") throw new BattleError("AI action requested for a non-AI combatant.");
  const options = legalActions(battle, actor.id);
  const allies = alliesOf(battle, actor).sort((a, b) => ratio(a) - ratio(b) || a.id.localeCompare(b.id));
  const heal = options.find((option) => option.type === ActionType.SPELL && option.spellKind === "heal" && option.targetId === allies[0]?.id);
  if (heal && ratio(allies[0]) < 0.4) return heal;
  const foes = opponentsOf(battle, actor).sort((a, b) => ratio(a) - ratio(b) || a.id.localeCompare(b.id));
  const target = foes[0];
  return options.find((option) => option.type === ActionType.SPELL && option.spellKind === "damage" && option.targetId === target.id)
    ?? options.find((option) => option.type === ActionType.RANGED && option.targetId === target.id)
    ?? options.find((option) => option.type === ActionType.MELEE && option.targetId === target.id)
    ?? options[0];
}

/** Runs all consecutive AI turns; stops as soon as a human/controller is due. */
export function advanceAiTurns(battle, maximumActions = 100) {
  const actions = [];
  while (!battle.result && currentCombatant(battle).controller === "ai") {
    if (actions.length >= maximumActions) throw new BattleError("AI turn limit reached.");
    const action = { actorId: currentCombatant(battle).id, ...chooseAiAction(battle) };
    actions.push(clone(action));
    applyAction(battle, action);
  }
  return actions;
}

/** Stable, JSON-safe state for a host/client protocol or saved battle replay. */
export function toWireState(battle) {
  return {
    version: battle.version,
    seed: battle.seed,
    rngState: battle.rngState,
    teams: battle.teams.map((team) => ({
      id: team.id,
      name: team.name,
      combatants: team.combatants.map(({ id, name, teamId, controller, stats, loadout, maxHealth, health, alive, status }) =>
        ({ id, name, teamId, controller, stats, loadout, maxHealth, health, alive, status })
      )
    })),
    initiative: [...battle.initiative],
    turnCursor: battle.turnCursor,
    turnNumber: battle.turnNumber,
    result: battle.result ? clone(battle.result) : null,
    events: clone(battle.events)
  };
}

/** Fast consistency check: useful after every host-authoritative online action. */
export function stateHash(battle) {
  const input = JSON.stringify(toWireState(battle));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function replay(blueprint, actions) {
  const battle = createBattle(blueprint);
  for (const action of actions) applyAction(battle, action);
  return battle;
}
