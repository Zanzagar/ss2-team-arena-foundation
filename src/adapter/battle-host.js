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
 * 2. it will not compute a vanilla value the resolver did not produce. An
 *    armour-first split reaches `armourclass` only because a rule set declared
 *    it as an ordered `resource` effect and the resolver applied and clamped
 *    it; the host writes the post-action projection and does no subtraction;
 * 3. it will not decorate, wrap or re-run the injected rule set. The resolver
 *    records what it applied on `battle.lastResolution`, so the effect list
 *    comes from `lastResolvedAction(battle)` — the authoritative trace of what
 *    actually happened, rather than a recording wrapper's guess at it.
 *
 * Node builtins only; no assets, no game data.
 */

import {
  allCombatants,
  applyAction,
  assertTeamRuleSet,
  BATTLE_RESULT_ACK_TYPE,
  chooseAiAction,
  combatantById,
  combatStateHash,
  createTeamBattle,
  currentCombatant,
  isAiControlled,
  lastResolvedAction,
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
  canonicalResourcesFrom,
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

function projectionsOf(wire) {
  return wire.teams.flatMap((team) => team.combatants);
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

/**
 * Carries the canonical resource bag onto a team's AI-filled slots.
 *
 * A supplied gladiator gets its resources from its own combat object
 * (`toCanonicalCombatantSource`), and it has to: the resolver refuses a write
 * to an undeclared resource, and the hero/villain surface is a binding rebound
 * per action, so *every* combatant must declare the set or an armour write
 * would succeed or throw depending on whose turn it was.
 *
 * An AI-filled slot is the one case the adapter cannot serve per slot.
 * `src/team/roster.js` builds a filled slot from `team.aiFill` — **one
 * template per team, not per slot** — so when two slots on one team are filled
 * from two different vanilla templates there is nowhere to put the second bag.
 * That is reported rather than papered over: guessing which template wins
 * would put an invented number in the state hash.
 */
function aiFillWithResources(teamId, declared, fillResources, gaps) {
  if (fillResources.length === 0) return declared;
  // A caller that declared resources on `aiFill` has said what it wants.
  if (declared?.resources !== undefined) return declared;
  const [first, ...rest] = fillResources;
  const serialised = JSON.stringify(first);
  if (rest.some((bag) => JSON.stringify(bag) !== serialised)) {
    gaps.push(Object.freeze({
      teamId,
      reason:
        `Team ${teamId} AI-fills ${fillResources.length} slots from templates that disagree about their ` +
        "canonical resources, and src/team/roster.js carries one AI-fill template per team rather than " +
        "one per slot. The filled slots therefore declare no resources, and a rule set's write to one " +
        "will be refused. Supply real gladiators, matching templates, or an explicit `aiFill.resources`."
    }));
    return declared;
  }
  return { ...declared, resources: first };
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
    onCampaignSettled = null
  } = {}) {
    if (!Array.isArray(teams) || teams.length !== 2) {
      throw new BattleHostError("A hosted battle needs exactly two teams.");
    }
    assertTeamRuleSet(rules);

    /* 1. vanilla -> canonical, one combatant at a time. */
    const sources = [];
    const templates = new Map();
    const aiFilledSlots = [];
    const aiFillResourceGaps = [];
    const blueprintTeams = teams.map((team, teamIndex) => {
      const teamId = team.id ?? `team-${teamIndex + 1}`;
      const members = Array.isArray(team.members) ? team.members : [];
      if (members.length === 0) throw new BattleHostError(`Team ${teamId} has no slots.`);
      const fillResources = [];
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
          const template = normaliseVanillaCombatant(member.vanilla, { clip: member.clip ?? null });
          templates.set(`${teamId}#${index}`, template);
          // The roster invents the fighter; its resources still come from the
          // caller's template, so the filled slot declares the same bag every
          // other combatant does and can be written on either side.
          fillResources.push(canonicalResourcesFrom(template.fields));
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
      return {
        id: teamId,
        name: team.name ?? teamId,
        slots: members.length,
        combatants,
        aiFill: aiFillWithResources(teamId, team.aiFill, fillResources, aiFillResourceGaps)
      };
    });

    /* 2. one shared resolver, whatever the team size. The rule set is injected
     *    exactly as the caller supplied it: undecorated, unwrapped, and the
     *    same object `describeTeamRuleSet` will report on. */
    this.#battle = createTeamBattle({
      teams: blueprintTeams,
      seed,
      rngTape,
      rules,
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
      /**
       * Teams whose AI-filled slots could not be given canonical resources,
       * because the roster carries one fill template per team and theirs
       * disagreed. Empty in every other case.
       */
      aiFillResourceGaps: Object.freeze(aiFillResourceGaps),
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

    // The resolver's own trace of what it just applied. It is not projected
    // and not hashed — the state the effects produced is already in the
    // projection — but it is authoritative about the *order* the rule set
    // declared them in, which is the order the vanilla writes must follow.
    const effects = lastResolvedAction(this.#battle)?.effects ?? [];
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
   *
   * **A draw stops after the deaths.** Vanilla's `death()` dispatches only
   * `combatwon`/`combatlost`, so a drawn battle has no arena transition to
   * report and the completed death animations are the entire acknowledgement.
   * Passing an explicit `arenaLabel` for one is still reported — and still
   * refused — because a surface that reached a result label for a draw
   * disagrees with resolved state.
   */
  acknowledgeResultAnimations({ arenaLabel = null, completionToken = undefined } = {}) {
    this.#bridge.sync();
    // Armed and no arena transition means a draw. An unarmed battle falls
    // through to `reportArenaLabel`, which refuses it — the bridge cannot
    // acknowledge a battle the resolver has not decided.
    const drawn =
      this.#bridge.pendingToken !== null && arenaLabel === null && !this.#bridge.expectsArenaLabel;
    if (drawn && completionToken !== undefined) {
      // Checked *before* the deaths, because in a draw the last death is what
      // settles: a token verified afterwards would be verified too late.
      this.#bridge.verifyAcknowledgement({ type: BATTLE_RESULT_ACK_TYPE, completionToken });
    }
    const outcomes = [];
    for (const combatantId of [...this.#bridge.awaitingDeathAnimations]) {
      outcomes.push(Object.freeze({ kind: "death", combatantId, ...this.#bridge.reportDeathAnimation(combatantId) }));
    }
    if (drawn) return Object.freeze(outcomes);
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
