/**
 * Canonical resources: the resolver's one open, clamped, hashed numeric bag.
 *
 * ## Why this exists
 *
 * Before this module the only combat number the resolver carried was
 * `health`. A rule set could therefore be handed nothing else, and a rule set
 * that needed something else — SS2's `armourclass`, `staminaleft`,
 * `ammo_left`, `charisma`, the armour piece ratings — had to reach around the
 * seam and close over a side channel. That is not merely inconvenient: it is
 * unsound. `combatStateHash` covers what the resolver projects, so a value a
 * rule set reads through a side channel is a value the hash cannot see, and
 * two peers who disagree about it hash *identically* right up to the moment
 * they diverge. The hash's only job is to catch that, so a side channel turns
 * the desync check into a lie.
 *
 * The invariant this module exists to restore, and which
 * `test/team-resolver.test.js` pins:
 *
 * > **Everything a rule set can see, the projection carries — and therefore
 * > the hash covers.** The view is a strict subset of the projection.
 *
 * ## What qualifies as a resource
 *
 * A value belongs in `resources` if and only if **a rule set needs to read it
 * and the resolver must not interpret it**. The resolver stores it, clamps it,
 * projects it, and applies absolute `resource` effects to it. It never derives
 * one, never defaults one into existence, and never attaches meaning to a
 * name.
 *
 * Four constraints are what keep that from becoming an untyped grab-bag, and
 * they are enforced here rather than documented and hoped for:
 *
 * 1. **Numbers only.** A resource is a finite scalar. Not a string, not a
 *    boolean, not a nested structure. Anything that needs to be a flag is
 *    already served by `status`, which the resolver treats as an opaque
 *    string; anything that needs structure is the rule set's own static
 *    configuration and is not per-combatant battle state at all.
 * 2. **Declared at construction.** A combatant's resource *names* are fixed
 *    when the roster builds it. A rule set cannot conjure one mid-battle,
 *    because a resource that exists only on the branch one peer happened to
 *    take is a desync with a delay fuse.
 * 3. **Sorted.** The bag's key order is normalised, because the hash is
 *    `JSON.stringify` of the projection and object key order is insertion
 *    order. Two peers building the same bag from differently-ordered literals
 *    must not hash differently.
 * 4. **Written only through effects.** The rule set never holds live state; it
 *    returns `{ kind: "resource", targetId, resource, to }` and the resolver
 *    performs and clamps the write, exactly as it already does for damage and
 *    healing.
 *
 * ## Where the game-agnostic line actually falls
 *
 * The resolver learns no SS2 name from any of this. It learns one concept —
 * "clamped numeric pool" — and every name (`armourclass`, `staminaleft`) is
 * supplied by the blueprint, precisely the way the *values* of `stats` already
 * are. That is the argument for the generic `resource` effect over a bespoke
 * `armour` one: a bespoke kind would put an SS2 noun inside the resolver and
 * would need a sibling for stamina, another for ammunition, and another for
 * every resource a future rule set invents.
 *
 * ## Bounds are a rail, not a rule
 *
 * `min` defaults to 0 and `max` defaults to `null` (unbounded). Both must be
 * finite or `null` so the projection stays JSON-safe. They exist to stop a
 * pool going somewhere structurally impossible, **not** to express a game
 * rule: a maximum that itself moves during a battle is modelled as its own
 * resource, exactly as vanilla models `armourclass_max`, `staminamax` and
 * `maximum_ammo` as fields alongside the pools they bound.
 *
 * `health` is deliberately *not* a resource. It is the one number the resolver
 * does interpret (`alive = health > 0`), it already has effects and clamping
 * of its own, and two ways to write it would be two ways to disagree about it.
 * Its name is reserved below.
 */

import { BattleError } from "./errors.js";

/** Resource names are free-form but must be a stable, JSON-safe identifier. */
export const RESOURCE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Names a resource may not take, because the resolver already owns a
 * combatant field of that name and interprets it.
 */
export const RESERVED_RESOURCE_NAMES = Object.freeze([
  "alive",
  "health",
  "id",
  "loadout",
  "maxHealth",
  "name",
  "resources",
  "seatId",
  "slotIndex",
  "stats",
  "status",
  "teamId"
]);

const RESERVED = new Set(RESERVED_RESOURCE_NAMES);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const lower = (entry) => (entry.min === null ? -Infinity : entry.min);
const upper = (entry) => (entry.max === null ? Infinity : entry.max);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertBound(bound, field, name) {
  if (bound === undefined || bound === null) return null;
  if (!Number.isFinite(bound)) {
    throw new BattleError(
      `Resource ${name} declared a non-finite ${field}; a bound must be a finite number or null.`
    );
  }
  return bound;
}

function normaliseEntry(name, declaration) {
  if (Number.isFinite(declaration)) {
    return { value: declaration, min: 0, max: null };
  }
  if (!isPlainObject(declaration)) {
    throw new BattleError(
      `Resource ${name} must be a finite number or a { value, min, max } object.`
    );
  }
  const { value, min, max, ...rest } = declaration;
  const unknown = Object.keys(rest);
  if (unknown.length > 0) {
    throw new BattleError(`Resource ${name} carries unsupported keys: ${unknown.sort().join(", ")}.`);
  }
  if (!Number.isFinite(value)) {
    throw new BattleError(`Resource ${name} needs a finite numeric value.`);
  }
  const low = min === undefined ? 0 : assertBound(min, "min", name);
  const high = assertBound(max, "max", name);
  if (low !== null && high !== null && low > high) {
    throw new BattleError(`Resource ${name} declares min ${low} above max ${high}.`);
  }
  const entry = { value, min: low, max: high };
  // Clamped on the way in, the same way `health` is, so a blueprint can never
  // start a battle in a state the resolver would refuse to reach.
  entry.value = clamp(value, lower(entry), upper(entry));
  return entry;
}

/**
 * Validates one combatant's declared resources into the canonical bag shape:
 * `{ [name]: { value, min, max } }`, keys sorted.
 *
 * Accepts a shorthand — `{ armourclass: 44 }` means
 * `{ armourclass: { value: 44, min: 0, max: null } }`.
 *
 * @param {object} [source] the blueprint's `combatant.resources`
 * @returns {object} a fresh, sorted, validated bag; `{}` when nothing declared
 */
export function normaliseResourceBag(source) {
  if (source === undefined || source === null) return {};
  if (!isPlainObject(source)) {
    throw new BattleError("A combatant's resources must be a plain object of named numbers.");
  }
  const bag = {};
  // Sorted: the hash is JSON of the projection, and JSON key order is
  // insertion order. Two peers must not hash differently for writing the same
  // two resources in a different order in a literal.
  for (const name of Object.keys(source).sort()) {
    if (!RESOURCE_NAME_PATTERN.test(name)) {
      throw new BattleError(
        `Resource name ${JSON.stringify(name)} must match ${String(RESOURCE_NAME_PATTERN)}.`
      );
    }
    if (RESERVED.has(name)) {
      throw new BattleError(
        `Resource name ${name} is reserved: the resolver owns a combatant field of that name.`
      );
    }
    bag[name] = normaliseEntry(name, source[name]);
  }
  return bag;
}

/** A mutable deep copy, for the authoritative projection. Key order preserved. */
export function projectResources(bag) {
  const copy = {};
  for (const [name, entry] of Object.entries(bag ?? {})) {
    copy[name] = { value: entry.value, min: entry.min, max: entry.max };
  }
  return copy;
}

/** A deeply frozen deep copy, for the rule-set view. */
export function freezeResources(bag) {
  const copy = {};
  for (const [name, entry] of Object.entries(bag ?? {})) {
    copy[name] = Object.freeze({ value: entry.value, min: entry.min, max: entry.max });
  }
  return Object.freeze(copy);
}

/** Declared resource names, sorted. */
export function resourceNames(carrier) {
  return Object.keys(carrier?.resources ?? {});
}

/**
 * Reads one resource off a combatant, a frozen view, or a projection.
 *
 * Convenience for rule sets, so a formula reads `resourceValue(target,
 * "armourclass")` instead of `target.resources?.armourclass?.value ?? 0`. It
 * decides nothing; an undeclared resource yields the caller's fallback.
 */
export function resourceValue(carrier, name, fallback = 0) {
  const entry = carrier?.resources?.[name];
  return entry === undefined ? fallback : entry.value;
}

/** Declared bounds for one resource, or `null` when it is not declared. */
export function resourceBounds(carrier, name) {
  const entry = carrier?.resources?.[name];
  return entry === undefined ? null : Object.freeze({ min: entry.min, max: entry.max });
}

/**
 * Applies one absolute resource write to live state and clamps it.
 *
 * Refuses an undeclared name rather than creating one: see constraint 2 in the
 * header. This is the only writer; a rule set never touches live state.
 *
 * @returns {{ resource: string, from: number, to: number, clamped: boolean }}
 */
export function writeResource(combatant, name, to, { ruleSetId = "a rule set" } = {}) {
  const entry = combatant.resources?.[name];
  if (entry === undefined) {
    throw new BattleError(
      `Rule set ${ruleSetId} wrote resource ${String(name)} on combatant ${combatant.id}, ` +
      `which declares ${resourceNames(combatant).length > 0 ? resourceNames(combatant).join(", ") : "no resources"}. ` +
      "A combatant's resources are declared at construction; the resolver will not create one mid-battle."
    );
  }
  if (!Number.isFinite(to)) {
    throw new BattleError(
      `Rule set ${ruleSetId} wrote a non-finite value to resource ${name} on combatant ${combatant.id}.`
    );
  }
  const from = entry.value;
  const clamped = clamp(to, lower(entry), upper(entry));
  entry.value = clamped;
  return { resource: name, from, to: clamped, clamped: clamped !== to };
}
