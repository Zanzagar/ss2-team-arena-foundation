/**
 * The reference host loop: the two seams, driven together.
 *
 * `src/team/` decides combat and `src/adapter/` converts and presents it, but
 * until this module nothing drove them as one thing. A host is what a real mod
 * would be: it reads vanilla combat objects, builds a team battle, submits one
 * action at a time, mirrors every resolved action back into vanilla field
 * writes and presentation commands, and finally acknowledges the result
 * animation so the campaign settles once.
 *
 * **It decides no combat.** There is no formula, no roll, no threshold and no
 * damage arithmetic here. Every value it moves was decided and clamped by the
 * resolver running the injected rule set; every write it produces comes out of
 * `vanillaWritesForResolvedAction`, which mirrors the resolver's post-action
 * projection. The host's own arithmetic is limited to array indices.
 *
 * Three things this module deliberately does **not** do, because doing them
 * would hide a real gap between the two seams:
 *
 * 1. it will not invent a vanilla combat object for an AI-filled slot. The
 *    roster invents the *combatant*; nothing invents its equipment, armour or
 *    inventory, so the caller must supply a template or the host refuses;
 * 2. it will not compute a vanilla value the resolver did not produce. In
 *    particular it never writes `armourclass`, because `EffectKind` cannot
 *    express an armour-first split and the adapter may not do the subtraction;
 * 3. it will not reach into the rule set for the effect list. `applyAction`
 *    discards `outcome.effects`, so the only honest way to recover the write
 *    ordering is a pass-through recorder around the injected rule set, which
 *    is opt-in and provably inert (`describeTeamRuleSet` and the combat state
 *    hash are unchanged by it).
 *
 * Node builtins only; no assets, no game data.
 */

import {
  allCombatants,
  applyAction,
  assertTeamRuleSet,
  chooseAiAction,
  combatantById,
  combatStateHash,
  createTeamBattle,
  currentCombatant,
  isAiControlled,
  legalActions,
  placeholderTeamRules,
  toTeamWireState
} from "../team/index.js";

import { createResultAcknowledgementBridge } from "./acknowledgement.js";
import { ClipRegistry } from "./clip-registry.js";
import { createPresentationBinder, PLACEHOLDER_ANIMATION_BINDINGS, presentArenaConstruction } from "./presentation.js";
import { buildArenaLayout } from "./slot-layout.js";
import {
  applyVanillaWrites,
  assertMirrorAgrees,
  compareMaximumHealth,
  denormaliseVanillaCombatant,
  facingWrite,
  initialStatusEffects,
  mirrorDifferences,
  normaliseVanillaCombatant,
  toCanonicalCombatantSource,
  toVanillaCombatant,
  vanillaWritesForResolvedAction
} from "./state-bridge.js";
import { isPlainVanillaObject } from "./vanilla-fields.js";

export class BattleHostError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * The ordered adapter pipeline one submitted action runs through, with repeats
 * collapsed. It is recorded per action and is **identical for 1v1, 2v2 and
 * 3v3**: there is one resolver call and one adapter conversion per action
 * whatever the team size, and the only thing that scales is how many
 * combatants the conversion covers.
 */
export const HOST_PIPELINE = Object.freeze([
  "toTeamWireState:before",
  "applyAction",
  "toTeamWireState:after",
  "vanillaWritesForResolvedAction",
  "applyVanillaWrites",
  "assertMirrorAgrees",
  "presentResolvedEvents",
  "bridge.sync"
]);

const clone = (value) => JSON.parse(JSON.stringify(value));

function projectionsOf(wire) {
  return wire.teams.flatMap((team) => team.combatants);
}

/* ------------------------------------------------------------------ */
/* Effect recorder                                                     */
/* ------------------------------------------------------------------ */

/**
 * A pass-through decorator that remembers the effect list a rule set returned.
 *
 * `vanillaWritesForResolvedAction` accepts the rule set's declarative effects
 * so the write order matches the order the effects were declared in, and so
 * each write carries an attributed reason. But `applyAction` applies
 * `outcome.effects` and then discards them: nothing on the battle, the event
 * log or the wire projection carries them, so a host cannot get at them. This
 * decorator is the only route that does not either re-run the rule set (which
 * would draw the ordered RNG channel twice) or teach the adapter the rule
 * set's vocabulary (which the boundary forbids).
 *
 * It is inert by construction: it calls through, records a deep copy, and
 * returns the underlying outcome object unchanged. Every property the
 * rule-set contract and the wire projection read — `id`, `contractVersion`,
 * `verification`, `provenance`, `actionTypes` — is carried over untouched, so
 * `describeTeamRuleSet` and `combatStateHash` do not move.
 */
export function createEffectRecordingRuleSet(rules) {
  assertTeamRuleSet(rules);
  let pending = [];
  const wrapped = assertTeamRuleSet({
    ...rules,
    resolveAction(request, rolls) {
      const outcome = rules.resolveAction(request, rolls);
      pending.push(clone(outcome?.effects ?? []));
      return outcome;
    }
  });
  return Object.freeze({
    rules: Object.freeze(wrapped),
    /** Every effect recorded since the last take, flattened in order. */
    take() {
      const taken = pending.flat();
      pending = [];
      return taken;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Blueprint construction                                              */
/* ------------------------------------------------------------------ */

function assertMember(member, teamId, index) {
  if (!member || typeof member !== "object" || Array.isArray(member)) {
    throw new BattleHostError(`Team ${teamId} slot ${index + 1} needs a member object.`);
  }
  const filled = member.fill === "ai" || member.empty === true;
  if (!filled && !isPlainVanillaObject(member.vanilla)) {
    throw new BattleHostError(
      `Team ${teamId} slot ${index + 1} needs a vanilla combat object; the host converts vanilla state, it does not invent it.`
    );
  }
  if (filled && member.vanilla !== undefined && !isPlainVanillaObject(member.vanilla)) {
    throw new BattleHostError(`Team ${teamId} slot ${index + 1} supplied a non-object AI-fill template.`);
  }
  return filled;
}

/* ------------------------------------------------------------------ */
/* The host                                                            */
/* ------------------------------------------------------------------ */

class VanillaBattleHost {
  #battle;
  #layout;
  #binder;
  #bridge;
  #clips = new ClipRegistry();
  #mirrors = new Map();
  #recorder;
  #steps = [];
  #pipeline = [];
  #diagnostics;

  constructor({
    teams,
    rules = placeholderTeamRules,
    seed = 1,
    rngTape = null,
    heroTeamId = null,
    bindings = PLACEHOLDER_ANIMATION_BINDINGS,
    onCampaignSettled = null,
    recordEffects = true
  } = {}) {
    if (!Array.isArray(teams) || teams.length !== 2) {
      throw new BattleHostError("A hosted battle needs exactly two teams.");
    }
    assertTeamRuleSet(rules);

    /* 1. vanilla -> canonical, one combatant at a time. */
    const sources = [];
    const templates = new Map();
    const aiFilledSlots = [];
    const blueprintTeams = teams.map((team, teamIndex) => {
      const teamId = team.id ?? `team-${teamIndex + 1}`;
      const members = Array.isArray(team.members) ? team.members : [];
      if (members.length === 0) throw new BattleHostError(`Team ${teamId} has no slots.`);
      const combatants = members.map((member, index) => {
        const filled = assertMember(member, teamId, index);
        if (filled) {
          aiFilledSlots.push({ teamId, index });
          // The roster invents the combatant. Nothing invents its equipment,
          // so a mirror template is the caller's to supply.
          if (member.vanilla === undefined) {
            throw new BattleHostError(
              `Team ${teamId} slot ${index + 1} is AI-filled and supplied no vanilla template. ` +
              "src/team/roster.js invents the combatant, but no layer invents its armour, stamina, " +
              "ammunition, equipment or inventory, and the adapter will not fabricate a combat object. " +
              "Supply `vanilla` for the slot, or fill it with a real gladiator."
            );
          }
          templates.set(`${teamId}#${index}`, normaliseVanillaCombatant(member.vanilla, { clip: member.clip ?? null }));
          return { fill: "ai" };
        }
        const source = toCanonicalCombatantSource(member.vanilla, {
          id: member.id,
          name: member.name,
          teamId,
          controller: member.controller,
          clip: member.clip ?? null
        });
        sources.push(source);
        templates.set(`${teamId}#${index}`, source.vanilla);
        return source.combatant;
      });
      return { id: teamId, name: team.name ?? teamId, slots: members.length, combatants, aiFill: team.aiFill };
    });

    /* 2. one shared resolver, whatever the team size. */
    this.#recorder = recordEffects ? createEffectRecordingRuleSet(rules) : null;
    this.#battle = createTeamBattle({
      teams: blueprintTeams,
      seed,
      rngTape,
      rules: this.#recorder ? this.#recorder.rules : rules,
      onCampaignSettled
    });

    /* 3. presentation surface, derived entirely from the combat projection. */
    const wire = toTeamWireState(this.#battle);
    this.#layout = buildArenaLayout(wire, { heroTeamId });
    this.#binder = createPresentationBinder({ layout: this.#layout, bindings });
    this.#bridge = createResultAcknowledgementBridge(this.#battle, { layout: this.#layout });

    /* 4. mirrors, brought into step with the canonical state the roster built. */
    const canonicalSyncs = [];
    const maximumHealthReports = [];
    for (const team of this.#battle.teams) {
      for (const combatant of team.combatants) {
        const key = `${team.id}#${combatant.slotIndex}`;
        let record = templates.get(key);
        if (!record) throw new BattleHostError(`No vanilla record for combatant ${combatant.id}.`);
        // `normaliseCombatant` runs the rule set's `maximumHealth`, so canonical
        // state can differ from the vanilla record before a single action —
        // always for an AI-filled slot, whose canonical health comes from the
        // rule set and not from the template. Sync only when it actually
        // differs: an unnecessary sync would erase `materialisedFlags`.
        const differences = mirrorDifferences(record, combatant);
        if (differences.length > 0) {
          record = toVanillaCombatant(combatant, record);
          canonicalSyncs.push(Object.freeze({ combatantId: combatant.id, differences: Object.freeze(differences) }));
        }
        assertMirrorAgrees(record, combatant);
        this.#mirrors.set(combatant.id, record);
        maximumHealthReports.push(compareMaximumHealth(this.#battle.rules, combatant, record));
      }
    }

    this.#diagnostics = Object.freeze({
      /** Slots the roster AI-filled. Their mirror came from a caller template. */
      aiFilledSlots: Object.freeze(aiFilledSlots.map((entry) => Object.freeze({ ...entry }))),
      /** Where the mirror had to be pulled to canonical state before turn one. */
      canonicalSyncs: Object.freeze(canonicalSyncs),
      /** Reported, never corrected: `hitpointsmax` is a vanilla formula. */
      maximumHealthReports: Object.freeze(maximumHealthReports),
      /**
       * The statuses a gladiator entered the battle with. `normaliseCombatant`
       * hard-codes `status: []` and the resolver exposes no way to apply an
       * effect outside `applyAction`, so these are reported and *not* applied.
       */
      unappliedInitialStatusEffects: Object.freeze(initialStatusEffects(sources))
    });
  }

  get battle() {
    return this.#battle;
  }

  get layout() {
    return this.#layout;
  }

  get bridge() {
    return this.#bridge;
  }

  get clips() {
    return this.#clips;
  }

  get diagnostics() {
    return this.#diagnostics;
  }

  /** The ordered adapter pipeline the last submitted action ran through. */
  get pipeline() {
    return [...this.#pipeline];
  }

  get steps() {
    return [...this.#steps];
  }

  wire() {
    return toTeamWireState(this.#battle);
  }

  hash() {
    return combatStateHash(this.#battle);
  }

  currentCombatantId() {
    return currentCombatant(this.#battle)?.id ?? null;
  }

  legalActions(actorId = this.currentCombatantId()) {
    return legalActions(this.#battle, actorId);
  }

  mirrorFor(combatantId) {
    const record = this.#mirrors.get(combatantId);
    if (!record) throw new BattleHostError(`No vanilla mirror for combatant ${String(combatantId)}.`);
    return record;
  }

  /** The two objects vanilla stores each combatant in, per combatant id. */
  vanillaState() {
    const state = {};
    for (const [combatantId, record] of this.#mirrors) {
      state[combatantId] = denormaliseVanillaCombatant(record);
    }
    return state;
  }

  /**
   * The one-time arena build: attach and place every clip, then face each
   * fighter its side's way. The facing write is the only write that ever
   * targets `_root.arena.gladiators.*`, and it never touches a combat object.
   */
  constructArena({ handles = null } = {}) {
    const commands = presentArenaConstruction(this.#layout, { mirrors: this.#mirrors });
    const facingWrites = [];
    for (const placement of this.#layout.placements) {
      const record = this.mirrorFor(placement.combatantId);
      const write = facingWrite(placement.combatantId, placement, record, placement.facing);
      facingWrites.push(write);
      this.#mirrors.set(placement.combatantId, applyVanillaWrites(record, [write]));
    }
    if (handles) this.#clips.registerLayout(this.#layout, handles);
    return Object.freeze({ commands, facingWrites: Object.freeze(facingWrites) });
  }

  /**
   * One action, all the way through both layers.
   *
   * The resolver decides; the adapter mirrors what it decided into vanilla
   * field writes and presentation commands; the bridge notices whether the
   * battle became decided. Nothing here computes a combat value.
   */
  submit(action) {
    const pipeline = [];
    const before = projectionsOf(this.wire());
    pipeline.push("toTeamWireState:before");

    applyAction(this.#battle, action);
    pipeline.push("applyAction");

    const wire = this.wire();
    pipeline.push("toTeamWireState:after");
    const after = projectionsOf(wire);
    const afterById = new Map(after.map((combatant) => [combatant.id, combatant]));

    const effects = this.#recorder ? this.#recorder.take() : [];
    const { writes, unmapped } = vanillaWritesForResolvedAction({
      before,
      after,
      effects,
      placements: this.#layout.byCombatantId,
      mirrors: this.#mirrors
    });
    pipeline.push("vanillaWritesForResolvedAction");

    const byCombatant = new Map();
    for (const write of writes) {
      if (!byCombatant.has(write.combatantId)) byCombatant.set(write.combatantId, []);
      byCombatant.get(write.combatantId).push(write);
    }
    for (const [combatantId, combatantWrites] of byCombatant) {
      this.#mirrors.set(combatantId, applyVanillaWrites(this.mirrorFor(combatantId), combatantWrites));
    }
    pipeline.push("applyVanillaWrites");

    // The mirror is a mirror: if it has drifted from resolved state, that is a
    // bug in the host, and it fails here rather than desyncing quietly.
    for (const [combatantId, record] of this.#mirrors) {
      assertMirrorAgrees(record, afterById.get(combatantId));
    }
    pipeline.push("assertMirrorAgrees");

    const commands = this.#binder.drain(wire);
    pipeline.push("presentResolvedEvents");

    const bridgeStatus = this.#bridge.sync();
    pipeline.push("bridge.sync");

    this.#pipeline = pipeline;
    const step = Object.freeze({
      action: Object.freeze({ ...action }),
      effects: Object.freeze(effects),
      writes,
      unmapped,
      commands,
      bridgeStatus,
      result: this.#battle.result ? Object.freeze({ ...this.#battle.result }) : null,
      hash: this.hash()
    });
    this.#steps.push(step);
    return step;
  }

  /**
   * Runs every consecutive AI-seated turn through `submit`, so an AI ally
   * takes exactly the same route as a human one. Following the *seat* rather
   * than the combatant is what lets one team mix controller kinds.
   */
  runAiTurns(maximumActions = 100) {
    const taken = [];
    while (!this.#battle.result && isAiControlled(this.#battle, currentCombatant(this.#battle))) {
      if (taken.length >= maximumActions) throw new BattleHostError("AI turn limit reached.");
      const actorId = this.currentCombatantId();
      taken.push(this.submit({ actorId, ...chooseAiAction(this.#battle, actorId) }));
    }
    return taken;
  }

  /**
   * The whole animation surface reporting in: one death animation per fighter
   * on every eliminated team, then the arena timeline label. Returns the
   * bridge outcomes in order; exactly one of them can carry `settled: true`.
   */
  acknowledgeResultAnimations({ arenaLabel = null, completionToken = undefined } = {}) {
    this.#bridge.sync();
    const outcomes = [];
    for (const combatantId of [...this.#bridge.awaitingDeathAnimations]) {
      outcomes.push(Object.freeze({ kind: "death", combatantId, ...this.#bridge.reportDeathAnimation(combatantId) }));
    }
    const label = arenaLabel ?? this.#bridge.expectedArenaLabel;
    outcomes.push(Object.freeze({
      kind: "arena-label",
      label,
      ...this.#bridge.reportArenaLabel(label, completionToken === undefined ? {} : { completionToken })
    }));
    return Object.freeze(outcomes);
  }

  /** Combatant ids, in roster order. Diagnostics and test convenience. */
  combatantIds() {
    return allCombatants(this.#battle).map((combatant) => combatant.id);
  }

  combatant(combatantId) {
    return combatantById(this.#battle, combatantId);
  }
}

export function createVanillaBattleHost(options) {
  return new VanillaBattleHost(options);
}
