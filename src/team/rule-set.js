/**
 * The seam: what a rule set must provide to drive the shared team resolver.
 *
 * This module contains no formulas. It is the typed injection point a rule set
 * is dropped into, and the gate that keeps an unverified formula from
 * *claiming* to be verified.
 *
 * Three tiers, and the middle one carries the weight: `placeholder` is invented,
 * `map-derived` was read out of the licensed build's bytecode with partial
 * golden backing, and `runtime-verified` was observed running. **Only
 * `runtime-verified` may set `runtimeVerified: true`** — a map-derived rule set
 * declares `false` and cites its map sections and goldens instead.
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
  /**
   * Reconstructed from the byte-level battle map, with partial golden backing.
   *
   * Stronger than a placeholder: the arithmetic was read out of the licensed
   * build's bytecode, and some of it is checked against promoted goldens.
   * Weaker than runtime-verified: no capture session observed the paths this
   * rule set actually runs, so `runtimeVerified` is false and stays false.
   *
   * THE TIER EXISTS BECAUSE ITS ABSENCE WAS BLOCKING THE PROJECT. SS2's real
   * arithmetic fits neither neighbour: calling it `placeholder` understates
   * evidence that was read out of the build, and calling it
   * `runtime-verified` is a lie about what was observed. With only two tiers
   * the honest move was to write nothing, so nothing was written — a corpus of
   * 22 goldens sat unused while the resolver ran invented formulas.
   */
  MAP_DERIVED: "map-derived",
  /** Backed by promoted goldens from the licensed build. */
  RUNTIME_VERIFIED: "runtime-verified"
});

/**
 * The declarative vocabulary a rule set writes state with. Every kind is
 * applied and clamped by the resolver, in the order the rule set declared it.
 *
 * `DAMAGE` and `HEAL` are *relative* and carry a non-negative `amount`; they
 * are the only way to move `health`, which is the one number the resolver
 * interprets (`alive = health > 0`).
 *
 * `RESOURCE` is *absolute* — `{ kind: "resource", targetId, resource, to }` —
 * and moves one declared entry in the combatant's canonical resource bag. It
 * is deliberately generic rather than a bespoke `armour` kind: the resolver
 * must not learn a game's nouns, and a bespoke kind would need a sibling for
 * stamina, ammunition, and every resource a future rule set invents. See
 * `resources.js` for what qualifies as a resource and why.
 *
 * An armour-first damage split is therefore two ordered effects and no new
 * concept: write the armour pool down, then apply the overflow as damage.
 */
export const EffectKind = Object.freeze({
  DAMAGE: "damage",
  HEAL: "heal",
  STATUS: "status",
  RESOURCE: "resource"
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
    // Found 2026-09-01 while adding the map-derived tier: this validator and
    // `assertRuleSetProvenance` in src/campaign/record.js are documented as
    // mirrors and were not. record.js REFUSES a placeholder that pins a build
    // hash; this one allowed it, so such a rule set was constructible here and
    // its battles were then unrecordable at settlement — a failure that
    // surfaces only after a fight is fought.
    if (provenance.buildSha256 !== undefined) {
      throw new TeamRuleSetError(
        "A placeholder rule set must not pin a build SHA-256: it is not derived from that build."
      );
    }
    return;
  }
  if (verification === RuleSetVerification.MAP_DERIVED) {
    // Every requirement here is the difference between this tier and the
    // placeholder it would otherwise collapse into. An unenforced "may cite
    // evidence" becomes "does not", and the tier would be a nicer word for
    // guesswork — which is precisely the substitution this project exists to
    // refuse.
    if (provenance.runtimeVerified !== false) {
      throw new TeamRuleSetError(
        "A map-derived rule set must declare runtimeVerified: false. Deriving arithmetic from the " +
        "build's bytecode is not observing the build run."
      );
    }
    if (!SHA256.test(String(provenance.buildSha256 ?? ""))) {
      throw new TeamRuleSetError(
        "A map-derived rule set must pin the licensed build SHA-256 it was derived from: a derivation " +
        "with no build behind it is a derivation from nothing."
      );
    }
    if (!Array.isArray(provenance.mapSourceRefs) || provenance.mapSourceRefs.length === 0) {
      throw new TeamRuleSetError(
        "provenance.mapSourceRefs must cite at least one battle-map section; it is this tier's whole claim."
      );
    }
    if (provenance.mapSourceRefs.some((ref) => typeof ref !== "string" || ref.trim().length === 0)) {
      throw new TeamRuleSetError("Every provenance.mapSourceRefs entry must be a non-empty string.");
    }
    assertTokenList(provenance.goldenFixtureIds, "provenance.goldenFixtureIds");
    if (provenance.goldenFixtureIds.length === 0) {
      throw new TeamRuleSetError(
        "A map-derived rule set must cite at least one promoted golden. Partial runtime backing is what " +
        "separates this tier from a placeholder."
      );
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
      `A rule set must declare verification as one of: ${Object.values(RuleSetVerification).join(", ")}.`
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
    mapSourceRefs: Object.freeze([...(rules.provenance.mapSourceRefs ?? [])]),
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
    } else if (effect.kind === EffectKind.RESOURCE) {
      if (typeof effect.resource !== "string" || effect.resource.length === 0) {
        throw new TeamRuleSetError(`Rule set ${ruleSetId} produced a resource effect without a resource name.`);
      }
      // Absolute, never relative. A replayed effect must land on the same
      // value whatever the peer thought the pool held a moment earlier.
      if (!Number.isFinite(effect.to)) {
        throw new TeamRuleSetError(
          `Rule set ${ruleSetId} produced a resource effect without a finite absolute \`to\` value.`
        );
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
