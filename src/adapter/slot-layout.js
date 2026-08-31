/**
 * The two-sided problem: mapping a 1v1, 2v2 or 3v3 roster onto a vanilla
 * surface that is hard-coded for exactly two sides.
 *
 * The vanilla surface has three two-sided things (battle map, "Battle entry
 * and timeline ownership", "Combatant state objects", "UI and movie-clip map"):
 *
 * 1. two fighter clips, `hero` (depth 301) and `villain` (depth 300), under
 *    `_root.arena.gladiators`, each with a mirrored shadow at 298/299;
 * 2. two persistent combat objects, `_root.game.hero` and `_root.game.villain`;
 * 3. a `combat_panel` whose named instances are all `hero_*` / `villain_*`.
 *
 * The resolution is *not* to clone hero and villain per slot. The map warns
 * against exactly that ("it should not multiply the existing hero/villain
 * globals"), and it would break the original callbacks, which compare a clip
 * against `arena.gladiators.villain` or `.hero` by identity.
 *
 * The resolution is that **the vanilla two-sided surface is a binding, not a
 * roster.** The combat controller "repeatedly binds the current pair into four
 * globals" — `attacker` / `defender` (clips) and `game_attacker` /
 * `game_defender` (state objects) — and the mapped combat functions take those
 * as parameters (`attack_chances(game_attacker, game_defender)`,
 * `damagecharacter(defender, attacker, game_defender, game_attacker, ...)`,
 * `check_stats(game_defender)`). A 3v3 has six combatants but still exactly one
 * ordered (attacker, defender) pair per resolved action. So:
 *
 * - **sides** carry teams: one team is the hero side, the other the villain side;
 * - **slots** carry combatants: slot 0 of each side reuses the vanilla clip
 *   name, depth and position exactly, so 1v1 is byte-for-byte the vanilla
 *   arrangement and remains the parity gate;
 * - **the four globals are rebound per action** from resolved state, so the
 *   original callbacks always target the right unit;
 * - **state lives in the adapter's mirror**, keyed by combatant id, not in
 *   multiplied `_root.game.*` objects. The vanilla campaign objects are read
 *   once when the battle is built and written back only at settlement, which
 *   is what the roadmap's "do not overwrite vanilla save fields while the
 *   adapter is experimental" constraint requires.
 *
 * Everything about slots beyond the first is authored mod surface. Vanilla has
 * no second ally, so no capture can settle its geometry; see
 * `MAP_SILENCE.multi-slot-arena-geometry`.
 */

import { GLADIATOR_CLIP_ROOT, HERO_SIDE, VILLAIN_SIDE } from "./vanilla-fields.js";

export class SlotLayoutError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

/* ------------------------------------------------------------------ */
/* Vanilla anchors (all cited)                                         */
/* ------------------------------------------------------------------ */

/** Map, "Battle entry" step 3: `hero` at depth 301, `villain` at depth 300. */
export const VANILLA_FIGHTER_DEPTHS = Object.freeze({ [HERO_SIDE]: 301, [VILLAIN_SIDE]: 300 });
/** Map, "Battle entry" step 6: `hero_shadow` and `villain_shadow` at 298 and 299. */
export const VANILLA_SHADOW_DEPTHS = Object.freeze({ [HERO_SIDE]: 298, [VILLAIN_SIDE]: 299 });
/** Map, "Battle entry" step 2 and the spell ingress: overlays and the bonus icon. */
export const VANILLA_RESERVED_DEPTHS = Object.freeze([298, 299, 300, 301, 25005, 40000, 40001]);
/** Map, "Battle entry" step 5: placed at (-250, 200) and (250, 200). */
export const VANILLA_FRONT_X = Object.freeze({ [HERO_SIDE]: -250, [VILLAIN_SIDE]: 250 });
export const ARENA_Y = 200;
/** Map, "Battle entry" step 5: hero faces right, villain faces left. */
export const SIDE_FACING = Object.freeze({ [HERO_SIDE]: "right", [VILLAIN_SIDE]: "left" });
/** Map, `nextphase` step 1: the active x position is clamped to [-2100, 2100]. */
export const ARENA_X_CLAMP = Object.freeze({ min: -2100, max: 2100 });
/** Map, "Battle result": overlay controller labels and the arena timeline labels. */
export const RESULT_LABELS = Object.freeze({
  heroWins: Object.freeze({ overlayLabel: "combatwon", arenaLabel: "combat_won" }),
  villainWins: Object.freeze({ overlayLabel: "combatlost", arenaLabel: "combat_lost" })
});
/** Map, "UI and movie-clip map": the named `combat_panel` instances, all two-sided. */
export const VANILLA_PANEL_INSTANCES = Object.freeze({
  [HERO_SIDE]: Object.freeze({ armour: "hero_armour", potion: "hero_potion", staminaPotion: "hero_stamina_potion" }),
  [VILLAIN_SIDE]: Object.freeze({
    armour: "villain_armour",
    potion: "villain_potion",
    staminaPotion: "villain_stamina_potion"
  })
});
export const PANEL_ROOT = "arena.combat_panel";

/* ------------------------------------------------------------------ */
/* Authored extensions (all marked)                                    */
/* ------------------------------------------------------------------ */

export const MAX_SLOTS_PER_SIDE = 3;
/** Authored. Reserved band chosen to clear every depth the map records. */
export const ALLY_DEPTH_BASE = 320;
export const ALLY_SIDE_DEPTH_STRIDE = 10;
export const ALLY_SLOT_DEPTH_STRIDE = 2;
/** Authored. Rear slots step outward from centre and slightly up-stage. */
export const ALLY_X_STRIDE = 130;
export const ALLY_Y_STRIDE = -18;
/** Authored. The adapter's own scratch root; not a vanilla path. */
export const ADAPTER_STATE_ROOT = "_root.arena.team_arena.state";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function sideIndexOf(side) {
  return side === HERO_SIDE ? 0 : 1;
}

function allyName(side, slotIndex) {
  return `${side}_ally_${slotIndex + 1}`;
}

function fighterDepth(side, slotIndex) {
  if (slotIndex === 0) return VANILLA_FIGHTER_DEPTHS[side];
  return ALLY_DEPTH_BASE + sideIndexOf(side) * ALLY_SIDE_DEPTH_STRIDE + slotIndex * ALLY_SLOT_DEPTH_STRIDE;
}

function shadowDepth(side, slotIndex) {
  if (slotIndex === 0) return VANILLA_SHADOW_DEPTHS[side];
  return fighterDepth(side, slotIndex) + 1;
}

function panelWidgetsFor(side, slotIndex) {
  const vanilla = slotIndex === 0;
  const prefix = vanilla ? side : allyName(side, slotIndex);
  const named = (role, instance) => Object.freeze({
    role,
    instanceName: instance,
    // The map's UI table names only armour/potion/staminaPotion instances.
    // Health and stamina bars are addressed by role, never by a guessed name.
    mapNamed: vanilla && instance !== null
  });
  return Object.freeze({
    root: PANEL_ROOT,
    vanillaNative: vanilla,
    widgets: Object.freeze([
      named("armour", vanilla ? VANILLA_PANEL_INSTANCES[side].armour : `${prefix}_armour`),
      named("potion", vanilla ? VANILLA_PANEL_INSTANCES[side].potion : `${prefix}_potion`),
      named("staminaPotion", vanilla ? VANILLA_PANEL_INSTANCES[side].staminaPotion : `${prefix}_stamina_potion`),
      named("health", null),
      named("stamina", null)
    ])
  });
}

/**
 * One combatant's presentation placement. Nothing here is combat state: a
 * placement is derived entirely from the wire projection plus the hero-side
 * choice, so two peers that agree on combat state agree on the layout.
 */
function placementFor({ combatantId, teamId, side, slotIndex }) {
  const instanceName = slotIndex === 0 ? side : allyName(side, slotIndex);
  const stateKey = `${side}_${slotIndex + 1}`;
  return Object.freeze({
    combatantId,
    teamId,
    side,
    slotIndex,
    /** True only for the slot that *is* the vanilla `hero`/`villain` clip. */
    vanillaNative: slotIndex === 0,
    instanceName,
    instancePath: `${GLADIATOR_CLIP_ROOT}.${instanceName}`,
    shadowInstanceName: slotIndex === 0 ? `${side}_shadow` : `${instanceName}_shadow`,
    shadowInstancePath: `${GLADIATOR_CLIP_ROOT}.${slotIndex === 0 ? `${side}_shadow` : `${instanceName}_shadow`}`,
    depth: fighterDepth(side, slotIndex),
    shadowDepth: shadowDepth(side, slotIndex),
    /**
     * Where `game_attacker` / `game_defender` are bound from. Every combatant,
     * including slot 0, is served from the adapter's mirror so no vanilla save
     * field is written mid-battle.
     */
    stateObjectPath: `${ADAPTER_STATE_ROOT}.${stateKey}`,
    stateKey,
    /**
     * The vanilla campaign record this slot corresponds to, if any. Read once
     * when the battle is built, written back only at settlement. `null` for
     * every ally: the map warns against multiplying these objects.
     */
    vanillaCampaignObjectPath: slotIndex === 0 ? `_root.game.${side}` : null,
    facing: SIDE_FACING[side],
    x: clamp(
      VANILLA_FRONT_X[side] + (side === HERO_SIDE ? -1 : 1) * ALLY_X_STRIDE * slotIndex,
      ARENA_X_CLAMP.min,
      ARENA_X_CLAMP.max
    ),
    y: ARENA_Y + ALLY_Y_STRIDE * slotIndex,
    panel: panelWidgetsFor(side, slotIndex),
    /** Authored geometry for every slot past the first; vanilla cannot settle it. */
    geometryAuthored: slotIndex > 0
  });
}

/**
 * Builds the whole arena layout from a combat projection.
 *
 * @param {object} wire `toTeamWireState(battle)` (or anything with the same
 *   `teams[].combatants[].id` / `slotIndex` shape)
 * @param {string} [options.heroTeamId] which team occupies the vanilla hero
 *   side. Defaults to the first team, which keeps 1v1 identical to vanilla.
 */
export function buildArenaLayout(wire, { heroTeamId = null } = {}) {
  const teams = wire?.teams;
  if (!Array.isArray(teams) || teams.length !== 2) {
    throw new SlotLayoutError("An arena layout needs exactly two teams.");
  }
  const heroId = heroTeamId ?? teams[0].id;
  const heroTeam = teams.find((team) => team.id === heroId);
  const villainTeam = teams.find((team) => team.id !== heroId);
  if (!heroTeam || !villainTeam) {
    throw new SlotLayoutError(`No team with id ${String(heroId)} is in this battle.`);
  }

  const placements = [];
  for (const [side, team] of [[HERO_SIDE, heroTeam], [VILLAIN_SIDE, villainTeam]]) {
    const combatants = [...team.combatants].sort((a, b) => a.slotIndex - b.slotIndex);
    if (combatants.length > MAX_SLOTS_PER_SIDE) {
      throw new SlotLayoutError(`A side holds at most ${MAX_SLOTS_PER_SIDE} slots.`);
    }
    combatants.forEach((combatant, index) => {
      const slotIndex = combatant.slotIndex ?? index;
      if (slotIndex !== index) {
        throw new SlotLayoutError(`Team ${team.id} has a gap or duplicate at slot index ${String(slotIndex)}.`);
      }
      placements.push(placementFor({ combatantId: combatant.id, teamId: team.id, side, slotIndex }));
    });
  }

  assertDistinctPlacements(placements);

  const byCombatantId = new Map(placements.map((placement) => [placement.combatantId, placement]));
  const sides = Object.freeze({ [HERO_SIDE]: heroTeam.id, [VILLAIN_SIDE]: villainTeam.id });

  return Object.freeze({
    sides,
    teamSides: Object.freeze({ [heroTeam.id]: HERO_SIDE, [villainTeam.id]: VILLAIN_SIDE }),
    placements: Object.freeze(placements),
    byCombatantId,
    placementFor(combatantId) {
      const placement = byCombatantId.get(combatantId);
      if (!placement) throw new SlotLayoutError(`No presentation slot for combatant ${String(combatantId)}.`);
      return placement;
    },
    sideOf(teamId) {
      const side = teamId === heroTeam.id ? HERO_SIDE : teamId === villainTeam.id ? VILLAIN_SIDE : null;
      if (!side) throw new SlotLayoutError(`Team ${String(teamId)} is not in this battle.`);
      return side;
    }
  });
}

/**
 * The guarantee 2v2 and 3v3 depend on: every combatant id gets a distinct
 * slot, clip instance, depth, state path, and screen position, and no ally
 * depth collides with a depth the vanilla build already uses.
 */
export function assertDistinctPlacements(placements) {
  const seen = { combatantId: new Set(), instanceName: new Set(), depth: new Set(), stateObjectPath: new Set() };
  for (const placement of placements) {
    for (const key of Object.keys(seen)) {
      const value = placement[key];
      if (seen[key].has(value)) {
        throw new SlotLayoutError(`Duplicate ${key} in the arena layout: ${String(value)}.`);
      }
      seen[key].add(value);
    }
    if (seen.depth.has(placement.shadowDepth) || placement.depth === placement.shadowDepth) {
      throw new SlotLayoutError(`Shadow depth ${placement.shadowDepth} collides in the arena layout.`);
    }
    seen.depth.add(placement.shadowDepth);
    if (!placement.vanillaNative) {
      for (const depth of [placement.depth, placement.shadowDepth]) {
        if (VANILLA_RESERVED_DEPTHS.includes(depth)) {
          throw new SlotLayoutError(`Ally depth ${depth} collides with a depth the vanilla build reserves.`);
        }
      }
    }
  }
  return true;
}

/**
 * The four vanilla binding globals for exactly one resolved action.
 *
 * This is the whole two-sided reconciliation in one function: whatever the
 * team size, one ordered pair is bound, and it is derived from resolved state.
 */
export function bindingPlanFor(layout, { actorId, targetId }) {
  const attacker = layout.placementFor(actorId);
  const defender = targetId === undefined || targetId === null ? null : layout.placementFor(targetId);
  return Object.freeze({
    attacker: attacker.instancePath,
    defender: defender ? defender.instancePath : null,
    game_attacker: attacker.stateObjectPath,
    game_defender: defender ? defender.stateObjectPath : null,
    attackerCombatantId: actorId,
    defenderCombatantId: defender ? targetId : null
  });
}

/**
 * The overlay and arena labels for a decided battle.
 *
 * Vanilla derives these by comparing the *defeated clip* with
 * `arena.gladiators.villain` / `.hero` inside `death()`. With allies present a
 * defeated ally clip matches neither, so that comparison must never be the
 * decision — and it is not: the resolver decides, and this function only
 * translates the resolved winner into the two labels. A draw has no vanilla
 * transition at all, so it is reported as unmapped rather than guessed — and
 * `acknowledgedBy` names what stands in for it, because the acknowledgement
 * bridge has to settle a drawn battle without one.
 */
export function resultLabelsFor(layout, winnerTeamId) {
  if (winnerTeamId === null || winnerTeamId === undefined) {
    return Object.freeze({
      overlayLabel: null,
      arenaLabel: null,
      unmapped: "vanilla has no draw transition: death() dispatches only combatwon or combatlost",
      acknowledgedBy: "the completed death animations; the last one settles the campaign"
    });
  }
  const side = layout.sideOf(winnerTeamId);
  return side === HERO_SIDE ? RESULT_LABELS.heroWins : RESULT_LABELS.villainWins;
}
