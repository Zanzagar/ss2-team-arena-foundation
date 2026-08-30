/**
 * The seam: what a rule set must provide to drive the shared team resolver.
 *
 * This module contains no formulas. It is the typed injection point that a
 * runtime-verified rule set is dropped into once the capture campaign promotes
 * goldens, and the gate that keeps an unverified formula from *claiming* to be
 * verified.
 *
 * A rule set owns: the action vocabulary, legality, the outcome of one action
 * (including which RNG draws it makes, in what order), the derived maximum
 * health, and the AI policy.
 *
 * The resolver owns, and a rule set can neither see nor change: turn order,
 * team/slot structure, controller identity, effect application and clamping,
 * event sequencing, knockout and team-elimination detection, and campaign
 * settlement.
 */

export const TEAM_RULE_SET_CONTRACT_VERSION = 1;

export const RuleSetVerification = Object.freeze({
  /** A documented approximation. Never presented as SS2 behaviour. */
  PLACEHOLDER: "placeholder",
  /** Backed by promoted goldens from the licensed build. */
  RUNTIME_VERIFIED: "runtime-verified"
});

export const EffectKind = Object.freeze({
  DAMAGE: "damage",
  HEAL: "heal",
  STATUS: "status"
});

const REQUIRED_FUNCTIONS = Object.freeze([
  "maximumHealth",
  "legalActions",
  "resolveAction",
  "chooseAiAction"
]);

const TOKEN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256 = /^[A-Fa-f0-9]{64}$/;

export class TeamRuleSetError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertTokenList(values, field) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !TOKEN.test(String(value)))) {
    throw new TeamRuleSetError(`${field} must be a non-empty list of lowercase tokens.`);
  }
}

function assertProvenance(verification, provenance) {
  if (!isPlainObject(provenance)) {
    throw new TeamRuleSetError("A rule set needs a provenance object.");
  }
  if (typeof provenance.note !== "string" || provenance.note.trim().length === 0) {
    throw new TeamRuleSetError("Rule-set provenance needs a human-readable note.");
  }
  if (verification === RuleSetVerification.PLACEHOLDER) {
    if (provenance.runtimeVerified !== false) {
      throw new TeamRuleSetError("A placeholder rule set must declare runtimeVerified: false.");
    }
    if (provenance.goldenFixtureIds !== undefined) {
      throw new TeamRuleSetError("A placeholder rule set must not cite golden fixtures.");
    }
    return;
  }
  if (provenance.runtimeVerified !== true) {
    throw new TeamRuleSetError("A runtime-verified rule set must declare runtimeVerified: true.");
  }
  if (!SHA256.test(String(provenance.buildSha256 ?? ""))) {
    throw new TeamRuleSetError("A runtime-verified rule set must pin the licensed build SHA-256.");
  }
  assertTokenList(provenance.goldenFixtureIds, "provenance.goldenFixtureIds");
}

/**
 * Validates a rule set against the seam contract. This is the only place that
 * decides whether a rule set may call itself runtime-verified, and it refuses
 * the claim unless the rule set pins a build hash and cites promoted goldens.
 */
export function assertTeamRuleSet(rules) {
  if (!rules || typeof rules !== "object") {
    throw new TeamRuleSetError("A rule set must be an object.");
  }
  if (!TOKEN.test(String(rules.id ?? ""))) {
    throw new TeamRuleSetError("A rule set needs a lowercase token id.");
  }
  if (rules.contractVersion !== TEAM_RULE_SET_CONTRACT_VERSION) {
    throw new TeamRuleSetError(
      `A rule set must declare contractVersion ${TEAM_RULE_SET_CONTRACT_VERSION}.`
    );
  }
  if (!Object.values(RuleSetVerification).includes(rules.verification)) {
    throw new TeamRuleSetError(
      `A rule set must declare verification as ${Object.values(RuleSetVerification).join(" or ")}.`
    );
  }
  assertTokenList(rules.actionTypes, "actionTypes");
  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof rules[name] !== "function") {
      throw new TeamRuleSetError(`A rule set must implement ${name}().`);
    }
  }
  assertProvenance(rules.verification, rules.provenance);
  return rules;
}

export function isTeamRuleSet(candidate) {
  try {
    assertTeamRuleSet(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Validates and freezes a rule set. Prefer this over a bare object literal. */
export function defineTeamRuleSet(spec) {
  const rules = {
    contractVersion: TEAM_RULE_SET_CONTRACT_VERSION,
    ...spec,
    provenance: Object.freeze({ ...spec?.provenance }),
    actionTypes: Object.freeze([...(spec?.actionTypes ?? [])])
  };
  assertTeamRuleSet(rules);
  return Object.freeze(rules);
}

export function isRuntimeVerified(rules) {
  return rules?.verification === RuleSetVerification.RUNTIME_VERIFIED;
}

/**
 * One-line provenance summary. UI, logs, and save records should carry this so
 * placeholder behaviour is never mistaken for measured behaviour.
 */
export function describeTeamRuleSet(rules) {
  assertTeamRuleSet(rules);
  return Object.freeze({
    id: rules.id,
    contractVersion: rules.contractVersion,
    verification: rules.verification,
    runtimeVerified: rules.provenance.runtimeVerified === true,
    goldenFixtureIds: Object.freeze([...(rules.provenance.goldenFixtureIds ?? [])]),
    buildSha256: rules.provenance.buildSha256 ?? null,
    note: rules.provenance.note
  });
}

/** Structural check of what a rule set hands back from `resolveAction`. */
export function assertActionOutcome(outcome, ruleSetId) {
  if (!isPlainObject(outcome)) {
    throw new TeamRuleSetError(`Rule set ${ruleSetId} must return an outcome object.`);
  }
  const { effects, events } = outcome;
  if (!Array.isArray(effects) || !Array.isArray(events)) {
    throw new TeamRuleSetError(`Rule set ${ruleSetId} must return { effects: [], events: [] }.`);
  }
  for (const effect of effects) {
    if (!isPlainObject(effect) || !Object.values(EffectKind).includes(effect.kind)) {
      throw new TeamRuleSetError(`Rule set ${ruleSetId} produced an effect with an unsupported kind.`);
    }
    if (typeof effect.targetId !== "string" || effect.targetId.length === 0) {
      throw new TeamRuleSetError(`Rule set ${ruleSetId} produced an effect without a target id.`);
    }
    if (effect.kind === EffectKind.STATUS) {
      if (typeof effect.status !== "string" || effect.status.length === 0) {
        throw new TeamRuleSetError(`Rule set ${ruleSetId} produced a status effect without a status name.`);
      }
    } else if (!Number.isFinite(effect.amount) || effect.amount < 0) {
      throw new TeamRuleSetError(
        `Rule set ${ruleSetId} produced a ${effect.kind} effect without a non-negative finite amount.`
      );
    }
  }
  for (const event of events) {
    if (!isPlainObject(event) || typeof event.type !== "string" || event.type.length === 0) {
      throw new TeamRuleSetError(`Rule set ${ruleSetId} produced an event without a type.`);
    }
    if ("sequence" in event || "turn" in event) {
      throw new TeamRuleSetError(
        `Rule set ${ruleSetId} produced an event carrying sequence/turn; the resolver stamps those.`
      );
    }
  }
  return outcome;
}
