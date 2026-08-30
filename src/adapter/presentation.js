/**
 * Event binding: resolved state -> ordered presentation commands.
 *
 * Presentation is strictly downstream of resolved state, and the module
 * boundary is what enforces it rather than a convention:
 *
 * - the only combat input is a **wire projection** (`toTeamWireState(battle)`),
 *   a plain JSON structure. A live battle is rejected, so there is nothing here
 *   to mutate even by accident;
 * - the output is **data**: plain, JSON-safe command records. No callbacks, no
 *   handles, no clip references. A host executes them; this module never does;
 * - no command carries a combat value this module computed. Damage, hit, and
 *   status all come from the resolver's own events and projections.
 *
 * The one decision this module *does* make is which animation label to play,
 * and even that is injected: the label vocabulary belongs to the rule set (see
 * `docs/ss2-adapter-contract.md`), so bindings are a parameter. Two are
 * shipped, both explicitly unverified — the promoted goldens verify the
 * resolver path, not the clip labels.
 *
 * Individual knockouts deliberately produce a death animation and **nothing
 * else**: no overlay label, no arena label, no reward UI. Vanilla's `death()`
 * jumps straight to `combatwon`/`combatlost` on the first knockout, which is
 * exactly what a multi-slot battle must not do (battle map, "Battle result and
 * reward callbacks": "It must not run vanilla win settlement after the first
 * individual knockout").
 */

import { EliminationEvent } from "../team/elimination.js";
import { BATTLE_RESULT_PENDING_TYPE } from "../team/settlement.js";
import { bindingPlanFor, resultLabelsFor } from "./slot-layout.js";
import { GLADIATOR_CLIP_ROOT, HERO_SIDE, isPlainVanillaObject } from "./vanilla-fields.js";

export class PresentationError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export const CommandKind = Object.freeze({
  ATTACH_CLIP: "attach-clip",
  PLACE_CLIP: "place-clip",
  BIND_GLOBALS: "bind-globals",
  CLIP_GOTO: "clip-goto",
  PANEL_REFRESH: "panel-refresh",
  OVERLAY_GOTO: "overlay-goto",
  ARENA_GOTO: "arena-goto",
  UNMAPPED: "unmapped"
});

/** Provenance of a chosen animation label. Never "runtime-verified". */
export const LabelProvenance = Object.freeze({
  /** The battle map names this exact label string. */
  MAP_NAMED: "map-named",
  /** The map names the family but not this string, or leaves the rule unstated. */
  ASSUMED: "assumed",
  /** Belongs to the placeholder vocabulary, which is not SS2's vocabulary. */
  PLACEHOLDER: "placeholder"
});

/** Map, "UI and movie-clip map": `hero_battle`, export 1241, used for both sides. */
export const FIGHTER_LINKAGE = "hero_battle";

/* ------------------------------------------------------------------ */
/* Animation bindings                                                  */
/* ------------------------------------------------------------------ */

const label = (value, provenance) => Object.freeze({ label: value, provenance });

/**
 * PLACEHOLDER vocabulary bindings (melee / ranged / spell / rest).
 *
 * This is not SS2's action vocabulary — the licensed build's is power, normal,
 * quick, bash, taunt, bombard, snipe, grievous. These exist so the shipped
 * placeholder rule set can drive a presentation surface end to end.
 */
export const PLACEHOLDER_ANIMATION_BINDINGS = Object.freeze({
  id: "placeholder-vocabulary",
  verification: "placeholder",
  note: "Placeholder action vocabulary bound to map-named clip labels. Not SS2 parity.",
  action(event) {
    switch (event.type) {
      case "melee":
      case "ranged":
        return Object.freeze({
          actor: label(event.type === "ranged" ? "snipe" : "attack5", LabelProvenance.PLACEHOLDER),
          target: event.hit ? label("hurt5", LabelProvenance.PLACEHOLDER) : label("Block", LabelProvenance.MAP_NAMED)
        });
      case "spell":
        return Object.freeze({
          actor: label("cast", LabelProvenance.PLACEHOLDER),
          target: label("burning", LabelProvenance.PLACEHOLDER)
        });
      case "heal":
        return Object.freeze({ actor: label("cast", LabelProvenance.PLACEHOLDER), target: null });
      case "rest":
        return Object.freeze({ actor: label("rest", LabelProvenance.MAP_NAMED), target: null });
      default:
        return null;
    }
  },
  defeated() {
    return label("death", LabelProvenance.PLACEHOLDER);
  }
});

/** Map, "Attack roll dispatcher": which directions are the ranged band. */
const RANGED_DIRECTIONS = Object.freeze(new Set([21, 22, 23]));

/**
 * SS2 vocabulary bindings, derived from the static map only.
 *
 * NOT runtime-verified. The promoted goldens in
 * `test/fixtures/ss2-1v1-golden/` verify the roll order, the mutation order,
 * and the result transition — they do not observe a single clip label. Every
 * entry below carries its own provenance and the emitted command carries it
 * onward, so a consumer can always tell a map-named label from a guess.
 */
export const SS2_STATIC_MAP_BINDINGS = Object.freeze({
  id: "ss2-static-map",
  verification: "static-map",
  note:
    "Derived from docs/integration/ss2-battle-map.md, 'UI and movie-clip map' and 'Hit and damage path'. " +
    "No capture has observed a clip label; every entry is map-named at best.",
  action(event) {
    const direction = Number(event.attackDirection);
    if (event.hit === false) {
      // Map, "Attack roll dispatcher": "A miss calls `defender_blocked()`."
      return Object.freeze({ actor: attackLabel(direction), target: label("Block", LabelProvenance.MAP_NAMED) });
    }
    switch (event.dispatchedMethod) {
      case "taunt":
        // Map: `taunt`/`taunted` at frames 1482/1512 — the actor taunts, the target is taunted.
        return Object.freeze({
          actor: label("taunt", LabelProvenance.MAP_NAMED),
          target: label("taunted", LabelProvenance.MAP_NAMED)
        });
      case "grievous":
        // Map: direction 30 dispatches `defender_hurt("grievous")`; `knockback` is frame 1428.
        return Object.freeze({ actor: attackLabel(direction), target: label("knockback", LabelProvenance.MAP_NAMED) });
      default:
        return Object.freeze({ actor: attackLabel(direction), target: hurtLabel(direction) });
    }
  },
  defeated(event) {
    // Map, "Defeat gate and death dispatch": death(clip, how_died) with
    // how_died in slain / yield / taunt / arrow / grievous. That these strings
    // are ALSO clip labels is an assumption; the map records "death variants
    // (585-1083)" without naming any of them.
    const howDied = typeof event.howDied === "string" ? event.howDied : "slain";
    return label(howDied, LabelProvenance.ASSUMED);
  }
});

function attackLabel(direction) {
  // Map: "attack directions 1-12 (190-360)". The frame range is recorded; the
  // label strings are not, so the naming is assumed.
  if (!Number.isFinite(direction)) return label("Standing", LabelProvenance.MAP_NAMED);
  if (direction === 20) return label("taunt", LabelProvenance.MAP_NAMED);
  if (direction === 21) return label("bombard", LabelProvenance.MAP_NAMED);
  if (direction === 22) return label("snipe", LabelProvenance.MAP_NAMED);
  return label(`attack${direction}`, LabelProvenance.ASSUMED);
}

function hurtLabel(direction) {
  // Map: `defender_hurt` "selects an animation label (`hurtN`, adjusted for
  // ranged directions, or `knockback`)" — the adjustment is not given, so
  // every ranged-band hurt label is assumed. See MAP_SILENCE.
  if (!Number.isFinite(direction)) return label("hurt5", LabelProvenance.ASSUMED);
  if (RANGED_DIRECTIONS.has(direction)) return label(`hurt${direction}`, LabelProvenance.ASSUMED);
  return label(`hurt${direction}`, LabelProvenance.MAP_NAMED);
}

/* ------------------------------------------------------------------ */
/* Projection guard                                                    */
/* ------------------------------------------------------------------ */

const LIVE_BATTLE_KEYS = Object.freeze(["rng", "controllers", "settlement", "rulesDescriptor"]);

/**
 * Refuses anything that is not a plain combat projection. Passing a live
 * battle here would be the one way presentation could reach mutable state, so
 * it is rejected by shape rather than trusted not to be misused.
 */
export function assertCombatProjection(wire) {
  if (!isPlainVanillaObject(wire) || !Array.isArray(wire.teams)) {
    throw new PresentationError("Presentation needs a combat projection: toTeamWireState(battle).");
  }
  for (const key of LIVE_BATTLE_KEYS) {
    if (wire[key] !== undefined && typeof wire[key] === "object" && typeof wire[key]?.toJSON === "function") {
      throw new PresentationError(
        `Presentation was handed a live battle (it carries ${key}). Pass toTeamWireState(battle) instead.`
      );
    }
  }
  if (typeof wire.rules === "function" || typeof wire.rules?.resolveAction === "function") {
    throw new PresentationError("Presentation was handed a live battle carrying a rule set. Pass the projection.");
  }
  return wire;
}

function combatantIndex(wire) {
  return new Map(wire.teams.flatMap((team) => team.combatants.map((combatant) => [combatant.id, combatant])));
}

/* ------------------------------------------------------------------ */
/* Arena construction                                                  */
/* ------------------------------------------------------------------ */

/**
 * The six-slot arena build. Slot 0 of each side reproduces the vanilla
 * construction exactly (linkage, depth, position, facing, mirrored scale);
 * every further slot uses the authored band from `slot-layout.js`.
 *
 * The clip scale is read from the vanilla record's `physical_size`. It is not
 * computed here: `physical_size = 80 + round(strength / 1.5)` is part of
 * `battlevalues` (map, "Combatant state objects"), which is a formula and
 * therefore rule-set work. Absent, the command carries `scale: null`.
 */
export function presentArenaConstruction(layout, { mirrors = new Map() } = {}) {
  const mirrorFor = (id) => (mirrors instanceof Map ? mirrors.get(id) : mirrors?.[id]) ?? null;
  const commands = [];
  for (const placement of layout.placements) {
    commands.push(Object.freeze({
      kind: CommandKind.ATTACH_CLIP,
      combatantId: placement.combatantId,
      parentPath: GLADIATOR_CLIP_ROOT,
      linkage: FIGHTER_LINKAGE,
      instanceName: placement.instanceName,
      depth: placement.depth,
      vanillaNative: placement.vanillaNative
    }));
    commands.push(Object.freeze({
      kind: CommandKind.ATTACH_CLIP,
      combatantId: placement.combatantId,
      parentPath: GLADIATOR_CLIP_ROOT,
      linkage: `${placement.side}_shadow`,
      instanceName: placement.shadowInstanceName,
      depth: placement.shadowDepth,
      vanillaNative: placement.vanillaNative
    }));
    const size = mirrorFor(placement.combatantId)?.fields?.physical_size;
    const scale = Number.isFinite(size) ? size : null;
    commands.push(Object.freeze({
      kind: CommandKind.PLACE_CLIP,
      combatantId: placement.combatantId,
      instancePath: placement.instancePath,
      x: placement.x,
      y: placement.y,
      facing: placement.facing,
      // Map, "Battle entry" step 5: the villain's horizontal scale is mirrored.
      xscale: scale === null ? null : (placement.side === HERO_SIDE ? scale : -scale),
      yscale: scale,
      geometryAuthored: placement.geometryAuthored
    }));
  }
  return Object.freeze(commands);
}

/* ------------------------------------------------------------------ */
/* Event binding                                                       */
/* ------------------------------------------------------------------ */

function panelRefresh(sequence, placement, combatant) {
  return Object.freeze({
    kind: CommandKind.PANEL_REFRESH,
    sequence,
    combatantId: combatant.id,
    panelRoot: placement.panel.root,
    vanillaNativePanel: placement.panel.vanillaNative,
    widgets: placement.panel.widgets.map((widget) => ({ ...widget })),
    // Resolved values, read from the projection. Nothing is derived here.
    values: Object.freeze({
      health: combatant.health,
      maxHealth: combatant.maxHealth,
      alive: combatant.alive,
      status: [...combatant.status]
    })
  });
}

function clipGoto(sequence, placement, chosen, role) {
  return Object.freeze({
    kind: CommandKind.CLIP_GOTO,
    sequence,
    role,
    combatantId: placement.combatantId,
    instancePath: placement.instancePath,
    label: chosen.label,
    labelProvenance: chosen.provenance
  });
}

/**
 * Converts resolver events into ordered presentation commands.
 *
 * @param {object} wire `toTeamWireState(battle)`
 * @param {object} options.layout from `buildArenaLayout`
 * @param {object} [options.bindings] the animation binding table
 * @param {number} [options.fromSequence] resume point; only events after it are bound
 * @returns {{ commands: object[], nextSequence: number }}
 */
export function presentResolvedEvents(wire, {
  layout,
  bindings = PLACEHOLDER_ANIMATION_BINDINGS,
  fromSequence = 0
} = {}) {
  assertCombatProjection(wire);
  if (!layout || typeof layout.placementFor !== "function") {
    throw new PresentationError("Presentation needs an arena layout from buildArenaLayout().");
  }
  const combatants = combatantIndex(wire);
  const commands = [];
  let nextSequence = fromSequence;

  for (const event of wire.events ?? []) {
    if (!Number.isFinite(event.sequence) || event.sequence <= fromSequence) continue;
    nextSequence = Math.max(nextSequence, event.sequence);

    if (event.type === EliminationEvent.COMBATANT_DEFEATED) {
      // A knockout plays a death animation and nothing else. No overlay label,
      // no arena label, no reward UI: the battle may well continue.
      const placement = layout.placementFor(event.targetId);
      commands.push(clipGoto(event.sequence, placement, bindings.defeated(event), "defeated"));
      commands.push(panelRefresh(event.sequence, placement, combatants.get(event.targetId)));
      continue;
    }

    if (event.type === EliminationEvent.TEAM_ELIMINATED) {
      // Informational. The transition is driven by the result event below, so
      // a two-team draw cannot fire two conflicting arena transitions.
      continue;
    }

    if (event.type === BATTLE_RESULT_PENDING_TYPE) {
      const labels = resultLabelsFor(layout, event.winnerTeamId);
      if (labels.arenaLabel === null) {
        commands.push(Object.freeze({
          kind: CommandKind.UNMAPPED,
          sequence: event.sequence,
          reason: labels.unmapped,
          detail: Object.freeze({ eventType: event.type, winnerTeamId: event.winnerTeamId ?? null })
        }));
        continue;
      }
      // Map, "Battle result": overlay frames 62/74 bridge combatwon/combatlost
      // to _root.arena.gotoAndPlay("combat_won"/"combat_lost").
      commands.push(Object.freeze({
        kind: CommandKind.OVERLAY_GOTO,
        sequence: event.sequence,
        label: labels.overlayLabel,
        completionToken: event.completionToken
      }));
      commands.push(Object.freeze({
        kind: CommandKind.ARENA_GOTO,
        sequence: event.sequence,
        label: labels.arenaLabel,
        completionToken: event.completionToken
      }));
      continue;
    }

    const chosen = bindings.action(event);
    if (!chosen) {
      commands.push(Object.freeze({
        kind: CommandKind.UNMAPPED,
        sequence: event.sequence,
        reason: `no animation binding for event type ${event.type} in ${bindings.id}`,
        detail: Object.freeze({ eventType: event.type })
      }));
      continue;
    }
    const actorPlacement = layout.placementFor(event.actorId);
    const targetPlacement = event.targetId ? layout.placementFor(event.targetId) : null;
    commands.push(Object.freeze({
      kind: CommandKind.BIND_GLOBALS,
      sequence: event.sequence,
      globals: bindingPlanFor(layout, { actorId: event.actorId, targetId: event.targetId ?? null })
    }));
    if (chosen.actor) commands.push(clipGoto(event.sequence, actorPlacement, chosen.actor, "actor"));
    if (chosen.target && targetPlacement) {
      commands.push(clipGoto(event.sequence, targetPlacement, chosen.target, "target"));
    }
    if (targetPlacement) {
      commands.push(panelRefresh(event.sequence, targetPlacement, combatants.get(event.targetId)));
    }
    if (!targetPlacement || event.targetId === event.actorId) {
      commands.push(panelRefresh(event.sequence, actorPlacement, combatants.get(event.actorId)));
    }
  }

  return Object.freeze({ commands: Object.freeze(commands), nextSequence });
}

/**
 * A stateful cursor over `presentResolvedEvents`, so a host can drain new
 * commands after each action without rebinding the whole event log. The cursor
 * holds a sequence number and nothing else — no combat state.
 */
export function createPresentationBinder({ layout, bindings = PLACEHOLDER_ANIMATION_BINDINGS } = {}) {
  let cursor = 0;
  return Object.freeze({
    get sequence() {
      return cursor;
    },
    drain(wire) {
      const result = presentResolvedEvents(wire, { layout, bindings, fromSequence: cursor });
      cursor = result.nextSequence;
      return result.commands;
    },
    reset() {
      cursor = 0;
    }
  });
}
