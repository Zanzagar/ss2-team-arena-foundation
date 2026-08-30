/**
 * Teams, slots, combatant identity, and AI fill.
 *
 * A team owns one to three *slots*. Every slot has a stable seat id and holds
 * exactly one combatant. An unoccupied slot is filled with an ordinary
 * combatant whose seat is assigned to the AI controller — the filled fighter
 * is not a special case anywhere downstream, which is the point: there is no
 * second code path for AI allies.
 *
 * Combatant identity (who is fighting) and controller identity (who is driving
 * the seat) are produced here as two separate structures.
 */

import { ControllerKind, createControllerRegistry } from "./controllers.js";
import { BattleError } from "./errors.js";

export const MIN_TEAM_SLOTS = 1;
export const MAX_TEAM_SLOTS = 3;
export const TEAMS_PER_BATTLE = 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const DEFAULT_STATS = Object.freeze({
  strength: 5,
  agility: 5,
  attack: 5,
  defense: 5,
  vitality: 5,
  stamina: 5,
  magicka: 0
});

export const DEFAULT_LOADOUT = Object.freeze({
  meleeDamage: 4,
  rangedDamage: 3,
  canUseRanged: false
});

export function seatIdFor(teamId, index) {
  return `${teamId}:slot-${index + 1}`;
}

/**
 * Normalises one combatant source. This is the only combatant constructor in
 * the codebase; AI fill goes through it too.
 */
export function normaliseCombatant(source, teamId, index, rules) {
  const stats = {
    strength: source.stats?.strength ?? DEFAULT_STATS.strength,
    agility: source.stats?.agility ?? DEFAULT_STATS.agility,
    attack: source.stats?.attack ?? DEFAULT_STATS.attack,
    defense: source.stats?.defense ?? DEFAULT_STATS.defense,
    vitality: source.stats?.vitality ?? DEFAULT_STATS.vitality,
    stamina: source.stats?.stamina ?? DEFAULT_STATS.stamina,
    magicka: source.stats?.magicka ?? DEFAULT_STATS.magicka
  };
  const combatant = {
    id: source.id ?? `${teamId}-${index + 1}`,
    name: source.name ?? `Gladiator ${index + 1}`,
    teamId,
    seatId: seatIdFor(teamId, index),
    slotIndex: index,
    aiFilled: source.aiFilled === true,
    stats,
    loadout: {
      meleeDamage: source.loadout?.meleeDamage ?? DEFAULT_LOADOUT.meleeDamage,
      rangedDamage: source.loadout?.rangedDamage ?? DEFAULT_LOADOUT.rangedDamage,
      canUseRanged: source.loadout?.canUseRanged ?? DEFAULT_LOADOUT.canUseRanged,
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

function isEmptySlot(entry) {
  if (entry === null || entry === undefined) return true;
  if (typeof entry === "string") return entry === "ai-fill" || entry === "empty";
  return entry.fill === "ai" || entry.empty === true;
}

/**
 * Builds the combatant source for an unoccupied slot. Pure and deterministic:
 * the fill never consumes the RNG channel, so team size does not perturb any
 * replay.
 */
export function aiFillSource(team, index) {
  const template = team.aiFill ?? {};
  return {
    ...template,
    id: template.id ?? `${team.id}-fill-${index + 1}`,
    name: template.name ?? `${team.name} Reserve ${index + 1}`,
    aiFilled: true
  };
}

function slotCountFor(team) {
  const declared = team.slots ?? team.size;
  if (declared === undefined) return Array.isArray(team.combatants) ? team.combatants.length : 0;
  if (!Number.isSafeInteger(declared)) throw new BattleError("A team's slot count must be an integer.");
  if (Array.isArray(team.combatants) && team.combatants.length > declared) {
    throw new BattleError("A team declares fewer slots than it supplies combatants for.");
  }
  return declared;
}

function assertUniqueIds(combatants) {
  const ids = new Set();
  for (const combatant of combatants) {
    if (ids.has(combatant.id)) throw new BattleError(`Duplicate combatant id: ${combatant.id}`);
    ids.add(combatant.id);
  }
}

/**
 * Builds both teams, their slots, and the seat -> controller registry.
 *
 * @returns {{ teams: object[], controllers: import("./controllers.js").ControllerRegistry }}
 */
export function buildRoster({ teams, rules }) {
  if (!Array.isArray(teams) || teams.length !== TEAMS_PER_BATTLE) {
    throw new BattleError("A battle needs exactly two teams.");
  }
  const seatAssignments = [];
  const built = teams.map((team, teamIndex) => {
    const id = team.id ?? `team-${teamIndex + 1}`;
    const name = team.name ?? `Team ${teamIndex + 1}`;
    const supplied = Array.isArray(team.combatants) ? team.combatants : [];
    const slotCount = slotCountFor({ ...team, id, name, combatants: supplied });
    if (slotCount < MIN_TEAM_SLOTS || slotCount > MAX_TEAM_SLOTS) {
      throw new BattleError("Each team must contain one to three combatants.");
    }
    const combatants = [];
    for (let index = 0; index < slotCount; index += 1) {
      const entry = supplied[index];
      const filled = isEmptySlot(entry);
      if (!filled && (typeof entry !== "object" || Array.isArray(entry))) {
        throw new BattleError("A slot entry must be a combatant object or an empty-slot marker.");
      }
      const source = filled ? aiFillSource({ ...team, id, name }, index) : entry;
      const combatant = normaliseCombatant(source, id, index, rules);
      combatant.aiFilled = filled;
      combatants.push(combatant);
      const controller = filled ? ControllerKind.AI : (source.controller ?? ControllerKind.AI);
      seatAssignments.push({ seatId: combatant.seatId, controller });
    }
    return {
      id,
      name,
      slots: combatants.map((combatant) => ({
        seatId: combatant.seatId,
        index: combatant.slotIndex,
        combatantId: combatant.id,
        aiFilled: combatant.aiFilled
      })),
      combatants
    };
  });
  if (built[0].id === built[1].id) throw new BattleError("Team ids must be unique.");
  assertUniqueIds(built.flatMap((team) => team.combatants));

  const controllers = createControllerRegistry(seatAssignments);
  for (const team of built) {
    for (const combatant of team.combatants) {
      // Compatibility view only: the legacy `combatant.controller` string now
      // reads through the seat registry, so a reassignment is visible without
      // duplicating controller identity onto combat state. Non-enumerable, so
      // it can never leak into a state projection by accident.
      Object.defineProperty(combatant, "controller", {
        enumerable: false,
        configurable: true,
        get: () => controllers.identityFor(combatant.seatId).id
      });
    }
  }
  return { teams: built, controllers };
}

/** Stable initiative: agility descending, then combatant id ascending. */
export function initiativeOrder(teams) {
  return teams
    .flatMap((team) => team.combatants)
    .slice()
    .sort((a, b) => b.stats.agility - a.stats.agility || a.id.localeCompare(b.id))
    .map((combatant) => combatant.id);
}
