/**
 * The one shared turn/action resolver.
 *
 * 1v1, 2v2 and 3v3 are the same code path with a different slot count. There
 * is no second combat implementation anywhere in this repository, and adding
 * one would be the single most damaging thing a future change could do.
 *
 * What the resolver guarantees to any injected rule set:
 *
 * - it is called at most once per action, only for a legal action, only on the
 *   combatant whose turn it is;
 * - every random value it needs arrives through one ordered, labelled channel
 *   in the order it asks for them; the resolver draws nothing itself;
 * - it sees frozen views, never live state, so it cannot mutate the battle
 *   out from under the resolver;
 * - everything it can see, the projection carries — and therefore the state
 *   hash covers. That is what makes the hash a real desync check rather than
 *   one that agrees right up to the moment two peers diverge, and it is why
 *   the canonical resource bag (`resources.js`) is on both the view and the
 *   projection rather than reaching a rule set through a side channel;
 * - its declarative effects are applied in order and clamped, its events are
 *   stamped with sequence and turn and appended in order;
 * - knockouts, team elimination, the battle result, and campaign settlement
 *   are computed afterwards by the resolver, not by the rule set.
 *
 * Determinism: same blueprint + same ordered action stream => identical
 * combat state hash, for every team size.
 */

import {
  battleStanding,
  collectKnockouts,
  EliminationEvent,
  snapshotLiveness
} from "./elimination.js";
import { BattleError } from "./errors.js";
import { placeholderTeamRules } from "./placeholder-rules.js";
import { buildRoster, initiativeOrder } from "./roster.js";
import { createOrderedRngChannel } from "./rng.js";
import { freezeResources, projectResources, writeResource } from "./resources.js";
import {
  assertActionOutcome,
  assertTeamRuleSet,
  describeTeamRuleSet,
  EffectKind
} from "./rule-set.js";
import {
  BATTLE_RESULT_PENDING_TYPE,
  createCampaignSettlement
} from "./settlement.js";

export { BattleError };

export const BATTLE_STATE_VERSION = 1;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Deep-freezes a JSON-shaped value in place. Used for the read-only trace. */
function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

/**
 * @param {object} blueprint
 * @param {object[]} blueprint.teams   exactly two teams, one to three slots each
 * @param {number} [blueprint.seed]    seed for the ordered RNG channel
 * @param {object} [blueprint.rules]   the injected rule set (the seam)
 * @param {object[]} [blueprint.rngTape] ordered samples instead of a seed
 * @param {boolean} [blueprint.journalRolls] keep the diagnostic roll journal
 * @param {Function} [blueprint.onCampaignSettled] once-only settlement callback
 */
export function createTeamBattle({
  teams,
  seed = 1,
  rules = placeholderTeamRules,
  rngTape = null,
  journalRolls = true,
  onCampaignSettled = null
} = {}) {
  assertTeamRuleSet(rules);
  const roster = buildRoster({ teams, rules });
  const rng = createOrderedRngChannel({ seed, tape: rngTape, journal: journalRolls });
  const battle = {
    version: BATTLE_STATE_VERSION,
    seed: seed >>> 0,
    rules,
    rulesDescriptor: describeTeamRuleSet(rules),
    teams: roster.teams,
    controllers: roster.controllers,
    initiative: initiativeOrder(roster.teams),
    turnCursor: 0,
    turnNumber: 1,
    result: null,
    events: [],
    /** Trace of the last applied action. Never projected, never hashed. */
    lastResolution: null,
    rng,
    settlement: createCampaignSettlement(onCampaignSettled)
  };
  Object.defineProperty(battle, "rngState", {
    enumerable: true,
    configurable: true,
    get: () => rng.state,
    set: (next) => {
      rng.state = next;
    }
  });
  Object.defineProperty(battle, "rngCursor", {
    enumerable: true,
    configurable: true,
    get: () => rng.cursor
  });
  return battle;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function allCombatants(battle) {
  return battle.teams.flatMap((team) => team.combatants);
}

export function combatantById(battle, id) {
  return allCombatants(battle).find((combatant) => combatant.id === id);
}

export function currentCombatant(battle) {
  if (battle.result) return null;
  return combatantById(battle, battle.initiative[battle.turnCursor]);
}

export function aliveCombatants(battle, teamId) {
  return allCombatants(battle).filter((combatant) => combatant.alive && (!teamId || combatant.teamId === teamId));
}

export function teamById(battle, teamId) {
  return battle.teams.find((team) => team.id === teamId);
}

export function seatOf(battle, combatantId) {
  const combatant = combatantById(battle, combatantId);
  if (!combatant) throw new BattleError(`Unknown combatant: ${String(combatantId)}.`);
  return combatant.seatId;
}

export function controllerOf(battle, combatantId) {
  return battle.controllers.identityFor(seatOf(battle, combatantId));
}

export function isAiControlled(battle, combatant) {
  return battle.controllers.isAi(combatant.seatId);
}

/** Hand a seat to a different controller. Combat state is deliberately untouched. */
export function reassignController(battle, seatId, controller) {
  return battle.controllers.reassign(seatId, controller);
}

/* ------------------------------------------------------------------ */
/* Rule-set views                                                      */
/* ------------------------------------------------------------------ */

/**
 * What a rule set is allowed to see of one combatant.
 *
 * **Soundness invariant:** every field here also appears in
 * `combatantProjection` below, and therefore inside `combatStateHash`. That is
 * not a coincidence to be maintained by care — it is the property that makes
 * the hash a real desync check, because a rule set can only read what the hash
 * already covers. A field added here and not there would let two peers agree
 * on their hashes and then diverge on the next action, which is the one thing
 * the hash exists to prevent. `test/team-resolver.test.js` pins it.
 */
function combatantView(combatant) {
  if (!combatant) return null;
  return Object.freeze({
    id: combatant.id,
    name: combatant.name,
    teamId: combatant.teamId,
    seatId: combatant.seatId,
    slotIndex: combatant.slotIndex,
    aiFilled: combatant.aiFilled,
    stats: Object.freeze({ ...combatant.stats }),
    loadout: Object.freeze({ ...combatant.loadout }),
    resources: freezeResources(combatant.resources),
    maxHealth: combatant.maxHealth,
    health: combatant.health,
    alive: combatant.alive,
    status: Object.freeze([...combatant.status])
  });
}

function actorView(battle, actor) {
  return {
    turnNumber: battle.turnNumber,
    actor: combatantView(actor),
    allies: Object.freeze(aliveCombatants(battle, actor.teamId).map(combatantView)),
    foes: Object.freeze(
      aliveCombatants(battle).filter((combatant) => combatant.teamId !== actor.teamId).map(combatantView)
    )
  };
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export function legalActions(battle, actorId = currentCombatant(battle)?.id) {
  const actor = combatantById(battle, actorId);
  if (!actor?.alive || battle.result) return [];
  const options = battle.rules.legalActions(Object.freeze(actorView(battle, actor)), actor.id);
  if (!Array.isArray(options)) {
    throw new BattleError(`Rule set ${battle.rules.id} did not return a list of legal actions.`);
  }
  return options;
}

function actionIsLegal(battle, action) {
  return legalActions(battle, action.actorId).some((option) =>
    option.type === action.type &&
    option.targetId === action.targetId &&
    (option.spellKind ?? null) === (action.spellKind ?? null)
  );
}

function addEvent(battle, event) {
  battle.events.push({ sequence: battle.events.length + 1, turn: battle.turnNumber, ...event });
}

/**
 * Applies a rule set's declarative effects, in order, clamping each.
 *
 * Ordering is load-bearing and is the rule set's to choose. An armour-first
 * damage split is `{ resource: armour, to: 0 }` then `{ damage: overflow }`,
 * and the resolver applies exactly that, in exactly that order — it does not
 * know what "armour" is and must not.
 *
 * Only `health` decides life. A resource reaching zero means nothing to the
 * resolver, which is the point: making a pool lethal would be a combat rule.
 */
function applyEffects(battle, effects) {
  for (const effect of effects) {
    const target = combatantById(battle, effect.targetId);
    if (!target) {
      throw new BattleError(
        `Rule set ${battle.rules.id} produced an effect for unknown combatant ${effect.targetId}.`
      );
    }
    if (effect.kind === EffectKind.DAMAGE) {
      target.health = clamp(target.health - effect.amount, 0, target.maxHealth);
    } else if (effect.kind === EffectKind.HEAL) {
      target.health = clamp(target.health + effect.amount, 0, target.maxHealth);
    } else if (effect.kind === EffectKind.RESOURCE) {
      writeResource(target, effect.resource, effect.to, { ruleSetId: battle.rules.id });
    } else if (effect.kind === EffectKind.STATUS) {
      const present = target.status.includes(effect.status);
      if (effect.active === false && present) {
        target.status = target.status.filter((entry) => entry !== effect.status);
      } else if (effect.active !== false && !present) {
        target.status = [...target.status, effect.status];
      }
    }
    target.alive = target.health > 0;
  }
}

/**
 * A whole team is down. Record it, freeze the battle result, and arm — but do
 * not fire — campaign settlement. Settlement waits for the acknowledgement.
 *
 * The settlement is armed with a **battle discriminator** as well as the
 * outcome, because the outcome alone does not identify a battle. Two bouts
 * between the same two teams ending the same way are the delivery target here
 * — a networked campaign of consecutive bouts — and without a discriminator
 * they share a completion token, so bout 1's `battle-result-animation-complete`
 * satisfies bout 2's second gate and settles it with bout 1's winner.
 *
 * The discriminator is `combatStateHash(battle)` read *here*: after the result
 * and the `team-eliminated` events are on the battle and before the settlement
 * is armed. That ordering matters twice over.
 *
 * - It is late enough to cover this battle's whole terminal state — seed, RNG
 *   cursor, rosters, healths, statuses, initiative, turn number and the entire
 *   ordered event log — so two genuinely independent bouts differ in it.
 * - It is early enough that the hash cannot see the token it is about to go
 *   into. `toTeamWireState` carries `settlement.toJSON()`, which is still the
 *   unarmed constant at this line, so there is no circularity to resolve.
 *
 * It stays a pure function of this battle's own play: a replay of the same
 * blueprint and the same ordered actions reaches the identical terminal state
 * and therefore the identical token. A counter or a random value would have
 * discriminated just as well and broken deterministic replay, which is why
 * neither is used.
 */
function checkResult(battle) {
  if (battle.result) return;
  const standing = battleStanding(battle.teams);
  if (!standing.decided) return;
  battle.result = { winnerTeamId: standing.winnerTeamId, reason: standing.reason };
  for (const teamId of standing.eliminatedTeamIds) {
    addEvent(battle, { type: EliminationEvent.TEAM_ELIMINATED, teamId });
  }
  battle.settlement.arm({
    winnerTeamId: standing.winnerTeamId,
    loserTeamIds: standing.eliminatedTeamIds,
    reason: standing.reason,
    battleDiscriminator: combatStateHash(battle)
  });
  const pending = battle.settlement.pendingResultEvent();
  addEvent(battle, {
    type: BATTLE_RESULT_PENDING_TYPE,
    status: pending.status,
    completionToken: pending.completionToken,
    winnerTeamId: pending.winnerTeamId,
    loserTeamIds: [...pending.loserTeamIds],
    reason: pending.reason
  });
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

/**
 * Applies exactly one legal action. Network clients should submit this shape.
 *
 * Returns the battle, as it always has. The effects and events the rule set
 * produced are recorded on `battle.lastResolution` and readable with
 * `lastResolvedAction(battle)`; `applyActionWithOutcome` returns them
 * directly. They used to be discarded, which forced any honest integration to
 * wrap the rule set in a recording decorator just to see what the resolver had
 * already computed.
 */
export function applyAction(battle, action) {
  const actor = currentCombatant(battle);
  if (!actor) throw new BattleError("The battle has already ended.");
  if (action.actorId !== actor.id) throw new BattleError(`It is ${actor.id}'s turn, not ${action.actorId}'s.`);
  if (!actionIsLegal(battle, action)) throw new BattleError("Illegal action.");
  const target = combatantById(battle, action.targetId);

  const request = Object.freeze({
    ...actorView(battle, actor),
    actorId: actor.id,
    teamId: actor.teamId,
    type: action.type,
    targetId: action.targetId,
    spellKind: action.spellKind ?? null,
    target: combatantView(target)
  });
  const rolls = battle.rng.withContext({
    turn: battle.turnNumber,
    actorId: actor.id,
    actionType: action.type
  });
  const outcome = assertActionOutcome(battle.rules.resolveAction(request, rolls), battle.rules.id);

  const liveness = snapshotLiveness(allCombatants(battle));
  const firstEventSequence = battle.events.length + 1;
  applyEffects(battle, outcome.effects);
  for (const event of outcome.events) addEvent(battle, event);
  const knockouts = collectKnockouts(liveness, allCombatants(battle));
  for (const knockedOut of knockouts) {
    // An individual knockout is only a combatant-defeated event. It never
    // settles the campaign, and on a multi-slot team it never ends the battle.
    addEvent(battle, {
      type: EliminationEvent.COMBATANT_DEFEATED,
      actorId: actor.id,
      targetId: knockedOut
    });
  }
  // Recorded, not projected: this is the resolver's trace of what it just
  // applied, not combat state. `toTeamWireState` does not carry it and
  // `combatStateHash` does not cover it — the state the effects produced is
  // already in the projection, and hashing the derivation too would make a
  // rule set's internal bookkeeping look like a desync.
  battle.lastResolution = deepFreeze({
    action: { ...action },
    actorId: actor.id,
    turn: battle.turnNumber,
    firstEventSequence,
    effects: clone(outcome.effects),
    events: clone(outcome.events),
    knockouts: [...knockouts]
  });
  advanceTurn(battle);
  return battle;
}

/**
 * The effects and events the last applied action produced, or `null` before
 * the first action. Frozen deep copies: reading the trace cannot alter state.
 */
export function lastResolvedAction(battle) {
  return battle.lastResolution ?? null;
}

/**
 * `applyAction`, returning the resolution record instead of the battle, for
 * callers that want the effects in one call. Same protocol, same validation,
 * same everything — this is sugar over `applyAction` and nothing else.
 */
export function applyActionWithOutcome(battle, action) {
  applyAction(battle, action);
  return lastResolvedAction(battle);
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

/** Deterministic AI. Its actions use exactly the same protocol as players. */
export function chooseAiAction(battle, actorId = currentCombatant(battle)?.id) {
  const actor = combatantById(battle, actorId);
  if (!actor || !isAiControlled(battle, actor)) {
    throw new BattleError("AI action requested for a non-AI combatant.");
  }
  const options = legalActions(battle, actor.id);
  return battle.rules.chooseAiAction(Object.freeze(actorView(battle, actor)), actor.id, options);
}

/** Runs all consecutive AI turns; stops as soon as a human/controller is due. */
export function advanceAiTurns(battle, maximumActions = 100) {
  const actions = [];
  while (!battle.result && isAiControlled(battle, currentCombatant(battle))) {
    if (actions.length >= maximumActions) throw new BattleError("AI turn limit reached.");
    const action = { actorId: currentCombatant(battle).id, ...chooseAiAction(battle) };
    actions.push(clone(action));
    applyAction(battle, action);
  }
  return actions;
}

/* ------------------------------------------------------------------ */
/* Settlement bridge                                                   */
/* ------------------------------------------------------------------ */

export function pendingResultEvent(battle) {
  return battle.settlement.pendingResultEvent();
}

/**
 * Gate 2 of settlement. Returns true exactly once: on the acknowledgement that
 * actually settles the campaign.
 */
export function acknowledgeResultAnimation(battle, acknowledgement) {
  return battle.settlement.acknowledge(acknowledgement);
}

export function campaignSettlement(battle) {
  return battle.settlement.settled;
}

export function isCampaignSettled(battle) {
  return battle.settlement.isSettled;
}

/* ------------------------------------------------------------------ */
/* Projections                                                         */
/* ------------------------------------------------------------------ */

/** The authoritative per-combatant projection. See `combatantView`: this is a
 * superset of it, by construction and by test. */
function combatantProjection(combatant) {
  return {
    id: combatant.id,
    name: combatant.name,
    teamId: combatant.teamId,
    seatId: combatant.seatId,
    slotIndex: combatant.slotIndex,
    aiFilled: combatant.aiFilled,
    stats: { ...combatant.stats },
    loadout: { ...combatant.loadout },
    resources: projectResources(combatant.resources),
    maxHealth: combatant.maxHealth,
    health: combatant.health,
    alive: combatant.alive,
    status: [...combatant.status]
  };
}

/**
 * The authoritative combat projection.
 *
 * It deliberately excludes controller identity: a host and a client that
 * disagree about who is driving a seat must still agree on combat state, and
 * reassigning a controller must not look like a desync.
 */
export function toTeamWireState(battle) {
  return {
    version: battle.version,
    seed: battle.seed,
    rngState: battle.rngState,
    rngCursor: battle.rngCursor,
    rules: {
      id: battle.rulesDescriptor.id,
      contractVersion: battle.rulesDescriptor.contractVersion,
      verification: battle.rulesDescriptor.verification,
      runtimeVerified: battle.rulesDescriptor.runtimeVerified
    },
    teams: battle.teams.map((team) => ({
      id: team.id,
      name: team.name,
      slots: team.slots.map((slot) => ({ ...slot })),
      combatants: team.combatants.map(combatantProjection)
    })),
    initiative: [...battle.initiative],
    turnCursor: battle.turnCursor,
    turnNumber: battle.turnNumber,
    result: battle.result ? clone(battle.result) : null,
    events: clone(battle.events),
    settlement: battle.settlement.toJSON()
  };
}

/** Seat -> controller projection, kept separate from combat state on purpose. */
export function toControllerState(battle) {
  return battle.controllers.toJSON();
}

export function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Controller-independent consistency check for host-authoritative play. */
export function combatStateHash(battle) {
  return fnv1a(JSON.stringify(toTeamWireState(battle)));
}

/** Diagnostic ordered record of every RNG draw. Not part of any hash. */
export function rngJournal(battle) {
  return battle.rng.journal;
}

export function replayTeamBattle(blueprint, actions) {
  const battle = createTeamBattle(blueprint);
  for (const action of actions) applyAction(battle, action);
  return battle;
}
