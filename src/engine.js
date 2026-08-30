/**
 * Deterministic team-combat foundation for an SS2 team-arena mod.
 *
 * This file is now a thin, compatibility-preserving façade over the shared
 * team seam in `src/team/`. 1v1, 2v2 and 3v3 all run through
 * `src/team/resolver.js`; there is no separate 1v1 combat path.
 *
 * The formulas still live in `src/team/placeholder-rules.js` and are still
 * placeholders. They will be replaced by injecting a *second* rule set that
 * satisfies the contract in `src/team/rule-set.js`, once runtime-verified
 * goldens are promoted from the capture campaign. Nothing in the resolver,
 * roster, controller, elimination, or settlement modules changes at that
 * point — see `docs/ss2-adapter-contract.md`.
 *
 * External guarantees preserved by the façade: the action protocol, the
 * `toWireState` projection, `stateHash`, deterministic replay, and the
 * `ActionType` / `classicStyleRules` / `BattleError` exports.
 */

import { BattleError } from "./team/errors.js";
import {
  ActionType,
  adaptClassicFormulas,
  classicStyleRules,
  looksLikeClassicFormulas,
  placeholderTeamRules
} from "./team/placeholder-rules.js";
import { assertTeamRuleSet, isTeamRuleSet } from "./team/rule-set.js";
import {
  advanceAiTurns,
  aliveCombatants,
  allCombatants,
  applyAction,
  chooseAiAction,
  combatantById,
  createTeamBattle,
  currentCombatant,
  fnv1a,
  legalActions
} from "./team/resolver.js";

export { ActionType, BattleError, classicStyleRules };

export {
  advanceAiTurns,
  aliveCombatants,
  allCombatants,
  applyAction,
  chooseAiAction,
  combatantById,
  currentCombatant,
  legalActions
};

// The seam itself, re-exported so integrators have one entry point.
export {
  acknowledgeResultAnimation,
  campaignSettlement,
  combatStateHash,
  controllerOf,
  isCampaignSettled,
  pendingResultEvent,
  reassignController,
  rngJournal,
  toControllerState,
  toTeamWireState
} from "./team/resolver.js";
export { ControllerKind } from "./team/controllers.js";
export {
  BATTLE_RESULT_ACK_TYPE,
  BATTLE_RESULT_PENDING_TYPE
} from "./team/settlement.js";
export {
  defineTeamRuleSet,
  describeTeamRuleSet,
  isRuntimeVerified,
  RuleSetVerification,
  TEAM_RULE_SET_CONTRACT_VERSION
} from "./team/rule-set.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Accepts either a rule set that already satisfies the seam contract or a bare
 * classic-style formula object (the pre-seam `rules` argument), which is
 * wrapped in a placeholder rule set.
 */
export function toTeamRuleSet(rules) {
  if (rules === classicStyleRules) return placeholderTeamRules;
  if (isTeamRuleSet(rules)) return rules;
  if (looksLikeClassicFormulas(rules)) {
    return adaptClassicFormulas(rules, {
      id: "adapted-classic-formulas",
      note: "Caller-supplied approximation wrapped for the seam. Not measured against the licensed SS2 build."
    });
  }
  return assertTeamRuleSet(rules);
}

export function createBattle({ teams, seed = 1, rules = classicStyleRules, ...options } = {}) {
  return createTeamBattle({ ...options, teams, seed, rules: toTeamRuleSet(rules) });
}

/**
 * Stable, JSON-safe state for a host/client protocol or saved battle replay.
 *
 * This is the historical projection and keeps the historical `controller`
 * string per combatant. The controller-independent projection the seam
 * introduces is `toTeamWireState` / `combatStateHash`.
 */
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
  return fnv1a(JSON.stringify(toWireState(battle)));
}

export function replay(blueprint, actions) {
  const battle = createBattle(blueprint);
  for (const action of actions) applyAction(battle, action);
  return battle;
}
