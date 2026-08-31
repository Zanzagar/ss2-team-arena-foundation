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
 *
 * ## The fill source is per slot
 *
 * `team.aiFill` used to be one template for the whole team, which is fine
 * while every filled slot is interchangeable and wrong as soon as one is not.
 * The concrete case is the SS2 adapter: each filled slot mirrors a *distinct*
 * vanilla gladiator record, so each needs its own canonical resource bag, and
 * with one template per team there was nowhere to put the second one. The
 * adapter's answer was to declare no resources at all on those slots and
 * report `diagnostics.aiFillResourceGaps`, because guessing which template won
 * would have put an invented number inside `combatStateHash` — which is the one
 * thing that hash exists to prevent.
 *
 * A slot's fill source is therefore assembled from up to two declarations,
 * merged shallowly with the one nearest the slot winning:
 *
 * | Declaration | Shape | Applies to |
 * | --- | --- | --- |
 * | `team.aiFill` as an object | `{ ...combatantFields }` | every filled slot on the team |
 * | `team.aiFill` as an array | `[template, ...]`, indexed by slot | the slot at that index |
 * | the empty-slot marker | `{ fill: "ai", ...combatantFields }` | that one slot |
 *
 * The two `aiFill` forms are mutually exclusive by type; the marker's own
 * fields override whichever applied. `{ fill: "ai" }` and `{ empty: true }`
 * carry no fields and so mean exactly what they always did, which is what keeps
 * every existing blueprint byte-identical: a team declaring a single object
 * template and bare markers resolves to `{ ...template }` for every filled
 * slot, as before.
 *
 * The merge is shallow, exactly as the single-template spread always was: a
 * marker's `stats` replaces the team template's `stats` rather than merging
 * into it.
 *
 * Four things are refused rather than dropped in silence, because a fill field
 * that vanishes is how an AI ally ends up fighting as somebody else:
 *
 * 1. **A function.** `aiFill: (index) => template` was the obvious third
 *    option and it is unsound here. A blueprint has to survive a JSON round
 *    trip — `replayTeamBattle` takes one, so does every wire transfer and every
 *    saved battle — and a function does not, so a replayed blueprint would
 *    quietly build a *different* roster from the one that was hashed. The array
 *    form is the serialisable equivalent. (Today a function is not even inert:
 *    `template.name` reads the function's own `name`, so `aiFill: () => ...`
 *    names the fighter after the property it was assigned to.)
 * 2. **A scalar.** `aiFill: 42` spread to nothing and filled with defaults.
 * 3. **An array longer than the team's slot count.** A template addressed to a
 *    slot that cannot exist can never be used. An entry addressed to a slot
 *    that exists but happens to be *occupied* is deliberately allowed: "what
 *    each seat would be if empty" is a legitimate declaration.
 * 4. **`controller` on a fill template or marker.** It is the one key that is
 *    read for a supplied combatant and ignored for a filled one, so accepting
 *    it silently would be the exact asymmetry this module should not have. A
 *    filled slot's seat goes to the AI by construction; `reassignController`
 *    hands it to anyone else, mid-battle, without touching combat state.
 *
 * None of this consumes the RNG channel, and none of it is order-dependent: the
 * fill stays pure, so team size still never perturbs a replay.
 */

import { ControllerKind, createControllerRegistry } from "./controllers.js";
import { BattleError } from "./errors.js";
import { normaliseResourceBag } from "./resources.js";

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
 * The conditions a combatant is carrying, in declaration order, deduplicated.
 *
 * This used to be hard-coded to `[]`, which silently discarded the starting
 * state of anyone who entered a battle already burning, frozen or poisoned.
 * A status is an opaque string to the resolver, so there is nothing to
 * validate beyond the shape — but the shape is validated, because a malformed
 * status is a desync the projection would happily hash.
 */
function normaliseStatus(source) {
  if (source === undefined || source === null) return [];
  if (!Array.isArray(source)) {
    throw new BattleError("A combatant's status must be an array of non-empty strings.");
  }
  const seen = new Set();
  const statuses = [];
  for (const entry of source) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new BattleError("A combatant's status must be an array of non-empty strings.");
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    statuses.push(entry);
  }
  return statuses;
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
    // Every per-combatant number a rule set needs that the resolver does not
    // itself define. Empty unless the blueprint declares one, so a rule set
    // that needs no resources — the placeholder included — never opts in.
    resources: normaliseResourceBag(source.resources),
    maxHealth: source.maxHealth,
    health: source.health,
    alive: true,
    status: normaliseStatus(source.status)
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
 * The keys that *select* a fill rather than describe the fighter. Everything
 * else on an empty-slot marker is a per-slot fill field.
 */
export const AI_FILL_MARKER_KEYS = Object.freeze(["empty", "fill"]);

const EMPTY_FILL_TEMPLATE = Object.freeze({});

const isTemplateObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Every fill declaration passes through here, so the refusals are stated once.
 * See the module header for why `controller` in particular is refused.
 */
function assertFillTemplate(template, where) {
  if (!isTemplateObject(template)) {
    throw new BattleError(`${where} must be an object of combatant fields.`);
  }
  if (template.controller !== undefined) {
    throw new BattleError(
      `${where} declares a controller. An AI-filled slot's seat is assigned to the AI controller by ` +
      "construction, so the roster would drop it; hand the seat over with " +
      "reassignController(battle, seatId, controller) instead."
    );
  }
  return template;
}

/** The team-level half of one slot's fill source: object form, or array entry. */
function teamFillTemplate(team, index) {
  const declared = team.aiFill;
  if (declared === undefined || declared === null) return EMPTY_FILL_TEMPLATE;
  if (typeof declared === "function") {
    throw new BattleError(
      "A team's aiFill may not be a function. A blueprint has to survive a JSON round trip — " +
      "replayTeamBattle takes one, and so does every wire transfer and saved battle — and a function " +
      "does not, so a replayed blueprint would silently build a different roster from the one that was " +
      "hashed. Supply an array of per-slot templates, which serialises."
    );
  }
  if (Array.isArray(declared)) {
    const entry = declared[index];
    if (entry === undefined || entry === null) return EMPTY_FILL_TEMPLATE;
    return assertFillTemplate(entry, `A team's aiFill[${index}]`);
  }
  if (typeof declared !== "object") {
    throw new BattleError(
      "A team's aiFill must be one template object for every filled slot, or an array of one template " +
      `per slot. Received ${typeof declared}.`
    );
  }
  return assertFillTemplate(declared, "A team's aiFill");
}

/** The marker's own fields — everything on it but the two marker keys. */
function markerFillFields(entry) {
  if (!isTemplateObject(entry)) return EMPTY_FILL_TEMPLATE;
  const fields = {};
  for (const [key, value] of Object.entries(entry)) {
    if (AI_FILL_MARKER_KEYS.includes(key)) continue;
    fields[key] = value;
  }
  return assertFillTemplate(fields, "An empty-slot marker");
}

/**
 * Refuses a per-slot template addressed to a slot that cannot exist. Checked
 * once per team, where the slot count is known.
 */
function assertAiFillDeclaration(team, slotCount) {
  const declared = team.aiFill;
  if (!Array.isArray(declared)) return;
  if (declared.length > slotCount) {
    throw new BattleError(
      `Team ${team.id} declares ${slotCount} slots but supplies ${declared.length} per-slot aiFill ` +
      "templates. A template addressed to a slot that does not exist can never be used."
    );
  }
}

/**
 * Builds the combatant source for an unoccupied slot. Pure and deterministic:
 * the fill never consumes the RNG channel, so team size does not perturb any
 * replay.
 *
 * @param {object} team    the team, carrying `aiFill` in either accepted form
 * @param {number} index   the slot index being filled
 * @param {object|string|null} [entry] the empty-slot marker occupying the slot,
 *   whose own fields are this slot's nearest and highest-priority fill source
 */
export function aiFillSource(team, index, entry = null) {
  const template = { ...teamFillTemplate(team, index), ...markerFillFields(entry) };
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
    assertAiFillDeclaration({ ...team, id }, slotCount);
    const combatants = [];
    for (let index = 0; index < slotCount; index += 1) {
      const entry = supplied[index];
      const filled = isEmptySlot(entry);
      if (!filled && (typeof entry !== "object" || Array.isArray(entry))) {
        throw new BattleError("A slot entry must be a combatant object or an empty-slot marker.");
      }
      // The marker itself is this slot's nearest fill source, so it is passed
      // through rather than discarded once `isEmptySlot` has read it.
      const source = filled ? aiFillSource({ ...team, id, name }, index, entry) : entry;
      const combatant = normaliseCombatant(source, id, index, rules);
      combatant.aiFilled = filled;
      combatants.push(combatant);
      // A filled slot's seat is the AI's by construction; `assertFillTemplate`
      // refuses a fill `controller` rather than letting this line drop one.
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
