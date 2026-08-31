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
  loadoutMirrorDifferences,
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
 * The `resources` declaration that already covers one AI-filled slot, read in
 * `src/team/roster.js`'s own precedence order: an array `aiFill`'s entry for
 * that slot, or a team-wide `aiFill` object. `undefined` means the caller
 * declared none for this slot, which is the case the host fills in.
 *
 * A supplied gladiator gets its resources from its own combat object
 * (`toCanonicalCombatantSource`), and it has to: the resolver refuses a write
 * to an undeclared resource, and the hero/villain surface is a binding rebound
 * per action, so *every* combatant must declare the set or an armour write
 * would succeed or throw depending on whose turn it was. An AI-filled slot has
 * no combat object of its own, so its bag comes from the caller's mirror
 * template — and it goes on **that slot's own empty-slot marker**, which the
 * roster reads as the nearest and highest-priority fill source.
 *
 * This used to be a team-level injection, `{ ...team.aiFill, resources }`,
 * from when the roster carried one fill template per team and two disagreeing
 * templates had nowhere to both live. Two things were wrong with it. Filled
 * slots on such a team declared **no** resources at all, reported as
 * `diagnostics.aiFillResourceGaps`, and a rule set's write to one was refused
 * by the resolver. And once `aiFill` was allowed to be an array of per-slot
 * templates, spreading it into an object literal collapsed the whole array —
 * `{ ...[a, b] }` is `{ 0: a, 1: b }`, which the roster reads as one nameless
 * template applying to every slot, so every per-slot name, stat and loadout
 * the caller declared was silently discarded. Per-slot markers have neither
 * problem: nothing is merged across slots, so nothing has to agree about its
 * resources and there is no array to flatten.
 */
function declaredFillResources(declared, index) {
  if (declared === null || typeof declared !== "object") return undefined;
  if (!Array.isArray(declared)) return declared.resources;
  const entry = declared[index];
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  return entry.resources;
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
          const template = normaliseVanillaCombatant(member.vanilla, { clip: member.clip ?? null });
          templates.set(`${teamId}#${index}`, template);
          // The roster invents the fighter; its resources still come from THIS
          // slot's own template, so the filled slot declares the same bag every
          // other combatant does and can be written on either side. Two filled
          // slots no longer have to agree, because the bag rides the marker.
          if (declaredFillResources(team.aiFill, index) !== undefined) {
            // A caller that declared resources for this slot has said what it
            // wants, and the marker would outrank it.
            return { fill: "ai" };
          }
          return { fill: "ai", resources: canonicalResourcesFrom(template.fields) };
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
        // Passed through exactly as the caller declared it, in whichever form
        // the roster accepts. The host adds nothing here: a per-slot bag rides
        // that slot's marker, so nothing has to be merged into this value.
        aiFill: team.aiFill
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
    const aiFillMirrorRewrites = [];
    const aiFillLoadoutGaps = [];
    for (const team of this.#battle.teams) {
      for (const combatant of team.combatants) {
        const key = `${team.id}#${combatant.slotIndex}`;
        let record = templates.get(key);
        if (!record) throw new BattleHostError(`No vanilla record for combatant ${combatant.id}.`);
        maximumHealthReports.push(compareMaximumHealth(this.#battle.rules, combatant, record));

        if (combatant.aiFilled) {
          // **An AI-filled slot's mirror must describe the fighter that is
          // actually fighting.** `src/team/roster.js` invents the combatant
          // from `team.aiFill`, so its stats and maximum health come from the
          // roster and the rule set, not from the caller's template — and the
          // template was only ever supplied for the equipment, armour and
          // inventory nothing else invents. Storing it unchanged left the
          // mirror describing a gladiator with different stats, different
          // maximum health and a different weapon from the one on the field,
          // and `mirrorDifferences` could not see it because it compared only
          // health and status.
          //
          // There is no licensed record being overwritten here — that is what
          // makes writing `hitpointsmax` and the seven base stats legitimate
          // for this slot and for no other.
          const differences = mirrorDifferences(record, combatant, { includeStats: true });
          if (differences.length > 0) {
            record = toVanillaCombatant(combatant, record, { maxHealth: true, stats: true });
            aiFillMirrorRewrites.push(Object.freeze({
              combatantId: combatant.id,
              differences: Object.freeze(differences)
            }));
          }
          assertMirrorAgrees(record, combatant, { includeStats: true });
          // What is left: vanilla's damage is a min/max pair and the canonical
          // loadout is one number, so there is no write that reconciles them
          // without inventing the other half. Reported, never guessed at.
          const loadoutGaps = loadoutMirrorDifferences(record, combatant);
          if (loadoutGaps.length > 0) {
            aiFillLoadoutGaps.push(Object.freeze({
              combatantId: combatant.id,
              differences: Object.freeze(loadoutGaps),
              reason:
                "The AI-fill template's weapon fields still describe the gladiator they were copied from. " +
                "Vanilla carries a min/max damage pair and the canonical loadout carries one number, so the " +
                "adapter cannot write one back without inventing the other half. Supply a real gladiator, or " +
                "an `aiFill.loadout` the template agrees with."
            }));
          }
          this.#mirrors.set(combatant.id, record);
          continue;
        }

        // A supplied gladiator's `hitpointsmax` is licensed evidence, and
        // `compareMaximumHealth` says in as many words that it is only ever
        // reported: `battlevalues` is a vanilla formula, so deriving it is
        // rule-set work. The adapter used to write the rule set's answer over
        // it here, silently. It now refuses instead — a placeholder formula
        // quietly rewriting a real gladiator's maximum health is the exact
        // failure `compareMaximumHealth` exists to make visible.
        if (Number(record.fields.hitpointsmax ?? 0) !== combatant.maxHealth) {
          throw new BattleHostError(
            `Rule set ${this.#battle.rules.id} derives maximum health ${combatant.maxHealth} for ${combatant.id}, ` +
            `but the vanilla combat object stages hitpointsmax ${String(record.fields.hitpointsmax)}. ` +
            "The adapter reports that disagreement (diagnostics.maximumHealthReports) and will not correct either " +
            "side: hitpointsmax comes from vanilla's battlevalues, so writing a rule set's answer over it would " +
            "put a formula the adapter does not own into a licensed gladiator's record."
          );
        }
        // Canonical health can still differ before a single action — the
        // roster clamps it — so sync when it does. Sync only when it actually
        // differs: an unnecessary sync would erase `materialisedFlags`.
        const differences = mirrorDifferences(record, combatant);
        if (differences.length > 0) {
          record = toVanillaCombatant(combatant, record);
          canonicalSyncs.push(Object.freeze({ combatantId: combatant.id, differences: Object.freeze(differences) }));
        }
        assertMirrorAgrees(record, combatant);
        this.#mirrors.set(combatant.id, record);
      }
    }

    this.#diagnostics = Object.freeze({
      /** Slots the roster AI-filled. Their mirror came from a caller template. */
      aiFilledSlots: Object.freeze(aiFilledSlots.map((entry) => Object.freeze({ ...entry }))),
      /**
       * Where an AI-filled slot's template had to be rewritten to describe the
       * fighter the roster actually invented — stats and maximum health, which
       * the template's gladiator does not share.
       */
      aiFillMirrorRewrites: Object.freeze(aiFillMirrorRewrites),
      /**
       * What is left over after that rewrite: the template's weapon fields,
       * which have no single-number canonical counterpart to be pulled to.
       */
      aiFillLoadoutGaps: Object.freeze(aiFillLoadoutGaps),
      /** Where the mirror had to be pulled to canonical state before turn one. */
      canonicalSyncs: Object.freeze(canonicalSyncs),
      /** Reported, never corrected: `hitpointsmax` is a vanilla formula. */
      maximumHealthReports: Object.freeze(maximumHealthReports),
      /**
       * The statuses the gladiators entered the battle with, as the effects
       * that would produce them — **already applied**, by
       * `roster.normaliseStatus`. This used to be called
       * `unappliedInitialStatusEffects`, from when `normaliseCombatant`
       * hard-coded `status: []` and a caller had to reapply them by hand. The
       * roster carries them through now, so the old name was an invitation to
       * set a status a fighter already had.
       */
      startingStatusEffects: Object.freeze(initialStatusEffects(sources))
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
   * Submits what the animation surface reported: which fighters' death
   * animations finished, which arena label the timeline reached, and the
   * completion token the presentation commands carried. Returns the bridge
   * outcomes in order; exactly one of them can carry `settled: true`.
   *
   * **Everything is the caller's to supply, and nothing is defaulted.** This
   * method used to fabricate a death report for every awaiting fighter and
   * then hand the bridge `arenaLabel ?? this.#bridge.expectedArenaLabel` — the
   * label the bridge itself was waiting for. Both documented settlement gates
   * were therefore satisfied by the adapter talking to itself: a lethal action
   * followed by `acknowledgeResultAnimations()` settled the campaign with zero
   * input from any animation surface, and the bridge's desync check
   * ("`combat_won` reported for a battle the resolver decided the other way is
   * refused") had nothing independent to compare against. A convenience that
   * supplies the evidence it is supposed to be checking is not a convenience.
   *
   * So: `deaths` names the fighters that reported, `arenaLabel` is the label
   * the surface actually reached, and `completionToken` is the token the
   * `arena-goto` / `overlay-goto` command carried (a draw's `unmapped` command
   * carries it too). A host with a real animation surface can still call
   * `bridge.reportDeathAnimation` / `bridge.reportArenaLabel` directly; this is
   * the batch form of exactly those calls and grants no extra authority.
   *
   * **A draw stops after the deaths.** Vanilla's `death()` dispatches only
   * `combatwon`/`combatlost`, so a drawn battle has no arena transition to
   * report and the completed death animations are the entire acknowledgement.
   * Passing an `arenaLabel` for one is still reported — and still refused —
   * because a surface that reached a result label for a draw disagrees with
   * resolved state.
   *
   * @param {string[]} params.deaths combatant ids whose death animation finished
   * @param {string|null} [params.arenaLabel] the label the arena timeline reached
   * @param {string} params.completionToken the token the presentation carried
   */
  acknowledgeResultAnimations({ deaths, arenaLabel = null, completionToken } = {}) {
    if (!Array.isArray(deaths) || deaths.some((id) => typeof id !== "string" || id.length === 0)) {
      throw new BattleHostError(
        "acknowledgeResultAnimations needs `deaths`: the combatant ids whose death animation the surface " +
        "reported. The host does not know which animations finished, and inventing them would mean the " +
        "adapter supplying the settlement gate it is supposed to be waiting on."
      );
    }
    if (typeof completionToken !== "string" || completionToken.length === 0) {
      throw new BattleHostError(
        "acknowledgeResultAnimations needs the `completionToken` the presentation commands carried. It is the " +
        "host/client comparison mechanism; reading it back off the bridge would compare the bridge with itself."
      );
    }
    this.#bridge.sync();
    // Checked *before* the deaths: in a draw the last death is what settles, so
    // a token verified afterwards would be verified too late.
    this.#bridge.verifyAcknowledgement({ type: BATTLE_RESULT_ACK_TYPE, completionToken });
    // Armed and no arena transition means a draw.
    const drawn = arenaLabel === null && !this.#bridge.expectsArenaLabel;
    if (!drawn && (typeof arenaLabel !== "string" || arenaLabel.length === 0)) {
      throw new BattleHostError(
        `This result has a vanilla arena transition (${String(this.#bridge.expectedArenaLabel)}), so ` +
        "acknowledgeResultAnimations needs the `arenaLabel` the timeline actually reached. Supplying the " +
        "expected one on the caller's behalf is what made the bridge's desync check unable to fail."
      );
    }
    const outcomes = [];
    for (const combatantId of deaths) {
      outcomes.push(Object.freeze({ kind: "death", combatantId, ...this.#bridge.reportDeathAnimation(combatantId) }));
    }
    if (drawn) return Object.freeze(outcomes);
    outcomes.push(Object.freeze({
      kind: "arena-label",
      label: arenaLabel,
      ...this.#bridge.reportArenaLabel(arenaLabel, { completionToken })
    }));
    return Object.freeze(outcomes);
  }

  /**
   * The fighters the bridge is still waiting on, for a caller assembling the
   * `deaths` list from a real animation surface. Reading it is not reporting
   * them: every id still has to come back through
   * `acknowledgeResultAnimations` or `bridge.reportDeathAnimation`.
   */
  awaitingDeathAnimations() {
    this.#bridge.sync();
    return [...this.#bridge.awaitingDeathAnimations];
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
