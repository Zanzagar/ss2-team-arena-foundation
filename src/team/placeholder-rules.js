/**
 * PLACEHOLDER RULES — NOT SS2 BEHAVIOUR.
 *
 * Everything in this file is a documented approximation invented for this
 * repository. None of it is measured against the licensed build, and none of
 * it may be presented as SS2 parity. It exists so the shared resolver has
 * something to run while the capture campaign promotes runtime-verified
 * goldens; when those land, a second rule set is registered next to this one
 * and injected instead. No resolver, roster, controller, elimination, or
 * settlement code changes at that point — that is the entire point of the seam.
 *
 * The action vocabulary below (melee / ranged / spell / rest) is also
 * placeholder. The licensed build's vocabulary is different (power, normal,
 * quick, bash, taunt, bombard, snipe, grievous), which is exactly why the
 * vocabulary belongs to the rule set and not to the resolver.
 */

import { defineTeamRuleSet, EffectKind, RuleSetVerification } from "./rule-set.js";

/** Placeholder action vocabulary. Not the licensed build's vocabulary. */
export const ActionType = Object.freeze({
  MELEE: "melee",
  RANGED: "ranged",
  SPELL: "spell",
  REST: "rest"
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** A temporary, documented approximation—not a claim of SS2's exact maths. */
export const classicStyleRules = Object.freeze({
  maximumHealth(combatant) {
    return combatant.maxHealth ?? 50 + combatant.stats.vitality * 10;
  },
  hitChance(attacker, defender, action) {
    const modifier = action === ActionType.RANGED ? -0.08 : 0;
    return clamp(0.55 + (attacker.stats.attack - defender.stats.defense) * 0.018 + modifier, 0.1, 0.95);
  },
  damage(attacker, action) {
    const base = action === ActionType.RANGED ? attacker.loadout.rangedDamage : attacker.loadout.meleeDamage;
    return Math.max(1, Math.floor(base + attacker.stats.strength * 2));
  },
  spellDamage(attacker) {
    return Math.max(1, Math.floor(8 + attacker.stats.magicka * 2.5));
  },
  spellHealing(attacker) {
    return Math.max(1, Math.floor(6 + attacker.stats.magicka * 2));
  },
  restRecovery(combatant) {
    return Math.max(1, Math.floor(4 + combatant.stats.stamina * 1.5));
  }
});

/** The formula-object shape `adaptClassicFormulas` knows how to wrap. */
const CLASSIC_FORMULA_NAMES = Object.freeze([
  "maximumHealth",
  "hitChance",
  "damage",
  "spellDamage",
  "spellHealing",
  "restRecovery"
]);

export function looksLikeClassicFormulas(candidate) {
  return Boolean(candidate) &&
    typeof candidate === "object" &&
    CLASSIC_FORMULA_NAMES.every((name) => typeof candidate[name] === "function");
}

const healthRatio = (combatant) => combatant.health / combatant.maxHealth;
const byHealthThenId = (a, b) => healthRatio(a) - healthRatio(b) || a.id.localeCompare(b.id);

/**
 * Wraps a bare classic-style formula object in the team rule-set contract.
 *
 * This is also the worked example of how a promoted SS2 rule set plugs in: a
 * thin adapter that answers `legalActions`, `resolveAction`, `chooseAiAction`,
 * and `maximumHealth`, draws every random value from the injected ordered
 * channel by label, and returns declarative effects plus events.
 */
export function adaptClassicFormulas(formulas, { id = "placeholder-classic-style", note } = {}) {
  if (!looksLikeClassicFormulas(formulas)) {
    throw new TypeError("adaptClassicFormulas needs a classic-style formula object.");
  }
  return defineTeamRuleSet({
    id,
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: {
      kind: "authored-approximation",
      runtimeVerified: false,
      note: note ?? "Invented approximation. Not measured against the licensed SS2 build."
    },
    actionTypes: Object.values(ActionType),
    formulas,

    maximumHealth(combatant) {
      return formulas.maximumHealth(combatant);
    },

    legalActions(view) {
      const { actor, allies, foes } = view;
      const actions = [
        ...foes.map((target) => ({ type: ActionType.MELEE, targetId: target.id })),
        { type: ActionType.REST, targetId: actor.id }
      ];
      if (actor.loadout.canUseRanged) {
        actions.push(...foes.map((target) => ({ type: ActionType.RANGED, targetId: target.id })));
      }
      if (actor.loadout.canUseSpell) {
        actions.push(...foes.map((target) => ({
          type: ActionType.SPELL,
          targetId: target.id,
          spellKind: "damage"
        })));
        if (actor.loadout.canHeal) {
          actions.push(...allies.map((target) => ({
            type: ActionType.SPELL,
            targetId: target.id,
            spellKind: "heal"
          })));
        }
      }
      return actions;
    },

    resolveAction(request, rolls) {
      const { actor, target, type, spellKind } = request;
      if (type === ActionType.REST) {
        const recovered = Math.min(formulas.restRecovery(actor), actor.maxHealth - actor.health);
        return {
          effects: [{ kind: EffectKind.HEAL, targetId: actor.id, amount: recovered }],
          events: [{ type: "rest", actorId: actor.id, targetId: actor.id, amount: recovered }]
        };
      }
      if (type === ActionType.SPELL && spellKind === "heal") {
        const healed = Math.min(formulas.spellHealing(actor), target.maxHealth - target.health);
        return {
          effects: [{ kind: EffectKind.HEAL, targetId: target.id, amount: healed }],
          events: [{ type: "heal", actorId: actor.id, targetId: target.id, amount: healed }]
        };
      }
      // One labelled draw, taken unconditionally so the ordered channel stays
      // aligned whether or not the attack can miss.
      const hitChance = type === ActionType.SPELL ? 1 : formulas.hitChance(actor, target, type);
      const hit = rolls.unit("hit-roll") <= hitChance;
      const damage = hit
        ? (type === ActionType.SPELL ? formulas.spellDamage(actor) : formulas.damage(actor, type))
        : 0;
      return {
        effects: [{ kind: EffectKind.DAMAGE, targetId: target.id, amount: damage }],
        events: [{
          type,
          actorId: actor.id,
          targetId: target.id,
          hit,
          damage,
          spellKind: spellKind ?? null
        }]
      };
    },

    chooseAiAction(view, actorId, options) {
      const allies = [...view.allies].sort(byHealthThenId);
      const heal = options.find((option) =>
        option.type === ActionType.SPELL && option.spellKind === "heal" && option.targetId === allies[0]?.id
      );
      if (heal && healthRatio(allies[0]) < 0.4) return heal;
      const foes = [...view.foes].sort(byHealthThenId);
      const target = foes[0];
      if (!target) return options[0];
      return options.find((option) =>
        option.type === ActionType.SPELL && option.spellKind === "damage" && option.targetId === target.id
      )
        ?? options.find((option) => option.type === ActionType.RANGED && option.targetId === target.id)
        ?? options.find((option) => option.type === ActionType.MELEE && option.targetId === target.id)
        ?? options[0];
    }
  });
}

/** The default rule set. Explicitly a placeholder; see the header. */
export const placeholderTeamRules = adaptClassicFormulas(classicStyleRules);
