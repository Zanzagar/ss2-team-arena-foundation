/**
 * Vanilla combat state <-> canonical combatant state.
 *
 * This is a pure, total, two-way mapping and nothing else. It has no formulas,
 * no rolls, no thresholds, and no arithmetic on combat values: **every vanilla
 * field write it produces is an absolute assignment that mirrors a value the
 * resolver already decided and already clamped.** That is the structural
 * reason the adapter cannot become a second place where combat is decided — it
 * can only copy. If a future edit here starts computing an outcome, it belongs
 * in a rule set (`src/team/rule-set.js`), not in this file.
 *
 * **That sentence used to be a description; it is now a check.** Two of them,
 * in fact, and they are what make the claim inspectable rather than a promise:
 *
 * - every write declares a `source` from a closed four-value set (`WriteSource`),
 *   and the source fixes which vanilla fields the write may target
 *   (`ALLOWED_WRITE_FIELDS`) — a set defined here, not per scenario;
 * - `assertWriteProvenance` then requires each write's `to` to be `===` the
 *   value the post-action projection actually holds at the canonical location
 *   its source names. A computed value has no such location to be identical
 *   to, so `to: before - amount` cannot be expressed at all.
 *
 * The read side has the same discipline: `toCanonicalCombatantSource` refuses
 * a vanilla record missing a base stat rather than defaulting it, and emits
 * only the `loadout` keys a named vanilla field answers, so an assumption the
 * record cannot support does not silently override the roster's own default.
 *
 * Totality: `normaliseVanillaCombatant` preserves every own key of its input,
 * including keys the battle map does not name (the unnamed timed `spell_*`
 * fields, and anything a future build adds). Only three things are treated
 * specially, each because the map says so:
 *
 * 1. the six status flags are **undefined until something sets them**, so they
 *    are materialised to `false` and the materialisation is recorded;
 * 2. `gladiator_dir` is **clip-resident**, so it is lifted out of the combat
 *    object into a separate clip record and written back only to the clip;
 * 3. everything else round-trips byte-for-byte.
 *
 * Citations are sections of `docs/integration/ss2-battle-map.md`.
 */

import { EffectKind } from "../team/rule-set.js";
import {
  DEATH_STATUS_CLEAR_ORDER,
  DEFAULT_FACING,
  FACING_VALUES,
  isClipResidentField,
  isKnownVanillaField,
  isPlainVanillaObject,
  isStatusFlagField,
  isTimedSpellField,
  STATUS_FLAG_FIELDS
} from "./vanilla-fields.js";

/**
 * True for a canonical resource name the vanilla build actually has a
 * resource-backed field for: one of the names this module declares in
 * `CANONICAL_RESOURCE_SOURCES`, or one of the timed `spell_*` pools the map
 * declines to enumerate.
 *
 * Everything else is reported as unmapped — the same discipline `emitStatus`
 * applies to a status with no vanilla flag. A rule set is free to invent a
 * resource; the adapter will not invent a vanilla field to hold it, and it
 * will not repurpose a vanilla field it has not declared resource-backed.
 * `hitpoints`, `hitpointsmax`, the six status flags and the clip-resident
 * facing are owned by canonical health, canonical status and the clip record
 * respectively, so a resource that names one of them is refused rather than
 * allowed to forge a health or status write through the resource branch.
 */
function mirrorsToVanillaField(name) {
  return CANONICAL_RESOURCE_SOURCES.includes(name) || isTimedSpellField(name);
}

/**
 * Why a resource cannot reach vanilla, as a fixed reason string. Split from
 * "no vanilla field at all" because a resource colliding with a field another
 * source already owns is a different mistake from inventing one.
 */
function unmappedResourceReason(name) {
  if (RESOURCE_RESERVED_FIELDS.has(name)) {
    return "this vanilla field is owned by canonical health, canonical status or the clip record, not by a resource";
  }
  return "no vanilla field carries this resource";
}

export class AdapterStateError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value));

/* ------------------------------------------------------------------ */
/* Stat mapping                                                        */
/* ------------------------------------------------------------------ */

/**
 * canonical stat -> vanilla field. The canonical stat names come from
 * `src/team/roster.js`; the vanilla names come from the map's "Base stats"
 * row. `agility <- speed` and `defense <- defence` are naming reconciliations,
 * not derivations: no value is transformed.
 */
export const CANONICAL_STAT_SOURCES = Object.freeze({
  strength: "strength",
  agility: "speed",
  attack: "attack",
  defense: "defence",
  vitality: "vitality",
  stamina: "stamina",
  magicka: "magicka"
});

/**
 * Vanilla base stats with no canonical `stats` slot. `charisma` drives the
 * whole taunt path (map, "Chance calculation": the taunt chance and the
 * direction-20 damage both read it), so a runtime-verified rule set needs it —
 * and it now reaches one through the canonical **resource** bag below rather
 * than only through the vanilla record. It is still not a canonical *stat*.
 */
export const UNMAPPED_VANILLA_STATS = Object.freeze(["charisma"]);

/**
 * Vanilla fields carried into the canonical **resource** bag
 * (`src/team/resources.js`), sorted, one name each.
 *
 * Why these and not everything: a resource is a per-combatant number a rule
 * set must be able to *read and write* while the resolver refuses to interpret
 * it. Before the bag existed, a rule set needing SS2's armour, stamina,
 * ammunition, charisma, per-piece armour ratings or enchantment values had to
 * close over the adapter's mirror — a side channel outside `combatStateHash`,
 * which turns the desync check into a lie. Declaring them here is what makes
 * the write legal at all: the resolver refuses a write to an undeclared
 * resource *by design* (`resources.js`, constraint 2), so an undeclared pool
 * is a pool no rule set can ever move.
 *
 * The names are the vanilla field names **verbatim**, exactly as the canonical
 * status tokens are the vanilla flag names verbatim: an invented resource
 * vocabulary is one more table that can be mapped wrongly.
 *
 * The three `*_max` / `maximum_*` fields are declared as resources of their
 * own rather than folded into the pools' bounds, because `resources.js` says
 * so in as many words: "a maximum that itself moves during a battle is
 * modelled as its own resource, exactly as vanilla models `armourclass_max`,
 * `staminamax` and `maximum_ammo` as fields alongside the pools they bound".
 * `remove_armour` moves `armourclass_max` mid-battle, so a frozen bound would
 * be wrong within one action of a destroyed piece.
 *
 * Every entry is a name `VANILLA_FIELD_GROUPS` already carries a citation for;
 * a test asserts that, so this list cannot drift away from the catalogue.
 */
export const CANONICAL_RESOURCE_SOURCES = Object.freeze([
  // Live resources: the pools and the three maxima that bound them.
  "ammo_left",
  "armourclass",
  "armourclass_max",
  "maximum_ammo",
  "staminaleft",
  "staminamax",
  // Base stats: the one with no canonical stat slot.
  "charisma",
  // Armour: the per-piece ratings (the piece *ids* are equipment identity, not
  // a numeric pool, and are deliberately left in the vanilla record).
  "boot_defence",
  "breastplate_defence",
  "gauntlet_defence",
  "greaves_defence",
  "helmet_defence",
  "shield_defence",
  "shinguard_defence",
  "shoulderguard_defence",
  // Enchantments: every catalogued field whose name carries `enchantment`.
  "secondary_weapon_enchantment_potency",
  "secondary_weapon_enchantment_type",
  "weapon_enchantment_damage",
  "weapon_enchantment_potency",
  "weapon_enchantment_type"
]);

/**
 * Canonical health maps to the vanilla hitpoint pair and to nothing else.
 *
 * `armourclass` deliberately does NOT map into canonical health: the map's
 * damage path subtracts normal/grievous damage from `armourclass` first and
 * carries only the overflow into `hitpoints`, and *deciding* that split is a
 * formula. It is rule-set work. The adapter carries `armourclass` in the
 * vanilla record and never folds it into `health`.
 */
export const CANONICAL_HEALTH_SOURCES = Object.freeze({
  health: "hitpoints",
  maxHealth: "hitpointsmax"
});

/**
 * Canonical status tokens are the vanilla flag names verbatim. There is
 * deliberately no translation table: an invented status vocabulary is one more
 * thing that can be mapped wrongly, and the resolver treats a status as an
 * opaque string anyway (`src/team/resolver.js`, `applyEffects`).
 */
export const CANONICAL_STATUS_TOKENS = STATUS_FLAG_FIELDS;

/**
 * Vanilla fields another canonical source already owns. A declared resource
 * may never name one: allowing it would let the resource branch write
 * `hitpoints` with a number canonical health never produced, which is the one
 * thing the write shape exists to make impossible.
 */
export const RESOURCE_RESERVED_FIELDS = Object.freeze(new Set([
  CANONICAL_HEALTH_SOURCES.health,
  CANONICAL_HEALTH_SOURCES.maxHealth,
  ...STATUS_FLAG_FIELDS,
  "gladiator_dir"
]));

/* ------------------------------------------------------------------ */
/* The closed set of write sources                                     */
/* ------------------------------------------------------------------ */

/**
 * **Where a vanilla field write is allowed to get its value from.**
 *
 * This is the structural half of "the adapter decides no combat". The prose
 * version — *every vanilla write mirrors the resolver's post-action
 * projection, never `before - effect`* — was a convention: nothing stopped a
 * write carrying a number the adapter had computed, because nothing checked
 * where the number came from.
 *
 * Now every write must name one of exactly four sources, each of which fixes
 * two things: **which vanilla fields the write may target** (see
 * `ALLOWED_WRITE_FIELDS`) and **which canonical value it must carry** (see
 * `assertWriteProvenance`, which requires `write.to` to be `===` the value the
 * post-action projection actually holds there). A computed value has no
 * canonical location to be identical to, so it cannot be expressed.
 */
export const WriteSource = Object.freeze({
  /** `hitpoints`, and only ever the post-action `health` the resolver clamped. */
  CANONICAL_HEALTH: "canonical-health",
  /** One of the six vanilla flags, and only ever `after.status.includes(flag)`. */
  CANONICAL_STATUS: "canonical-status",
  /** One resource-backed field, and only ever `after.resources[field].value`. */
  DECLARED_RESOURCE: "declared-resource",
  /** `gladiator_dir` on the fighter clip, and only ever a `FACING_VALUES` member. */
  CLIP_FACING: "clip-facing"
});

const WRITE_SOURCES = Object.freeze(Object.values(WriteSource));

/**
 * The vanilla fields each source may write, independent of any scenario.
 *
 * `DECLARED_RESOURCE` additionally admits the timed `spell_*` pools, which the
 * map declines to enumerate by name — `isResourceBackedVanillaField` is the
 * authoritative predicate and this table is its enumerable core.
 */
export const ALLOWED_WRITE_FIELDS = Object.freeze({
  [WriteSource.CANONICAL_HEALTH]: Object.freeze([CANONICAL_HEALTH_SOURCES.health]),
  [WriteSource.CANONICAL_STATUS]: STATUS_FLAG_FIELDS,
  [WriteSource.DECLARED_RESOURCE]: CANONICAL_RESOURCE_SOURCES,
  [WriteSource.CLIP_FACING]: Object.freeze(["gladiator_dir"])
});

/** Which of the two vanilla objects each source is allowed to aim at. */
const WRITE_SOURCE_TARGETS = Object.freeze({
  [WriteSource.CANONICAL_HEALTH]: "combat-object",
  [WriteSource.CANONICAL_STATUS]: "combat-object",
  [WriteSource.DECLARED_RESOURCE]: "combat-object",
  [WriteSource.CLIP_FACING]: "fighter-clip"
});

/** True for a vanilla field a declared resource is allowed to reach. */
export function isResourceBackedVanillaField(name) {
  return mirrorsToVanillaField(name);
}

/* ------------------------------------------------------------------ */
/* Vanilla -> normalised vanilla record                                */
/* ------------------------------------------------------------------ */

function assertFacing(value, source) {
  if (!FACING_VALUES.includes(value)) {
    throw new AdapterStateError(
      `A fighter clip facing must be one of ${FACING_VALUES.join(", ")}; ${source} supplied ${JSON.stringify(value)}.`
    );
  }
  return value;
}

/**
 * Normalises one vanilla combatant into `{ fields, clip, materialisedFlags,
 * facingSource, timedSpellFields, unknownFields }`.
 *
 * @param {object} source the persistent combat object (`_root.game.<side>`)
 * @param {object} [options.clip] the runtime fighter clip, which owns the facing
 */
export function normaliseVanillaCombatant(source, { clip = null } = {}) {
  if (!isPlainVanillaObject(source)) {
    throw new AdapterStateError("A vanilla combat object must be a plain object.");
  }
  if (clip !== null && !isPlainVanillaObject(clip)) {
    throw new AdapterStateError("A fighter clip record must be a plain object when supplied.");
  }

  const fields = {};
  const timedSpellFields = [];
  const unknownFields = [];
  for (const [name, value] of Object.entries(source)) {
    if (isClipResidentField(name)) continue; // lifted onto the clip record below
    fields[name] = value === undefined ? undefined : clone(value);
    if (isTimedSpellField(name)) timedSpellFields.push(name);
    else if (!isKnownVanillaField(name)) unknownFields.push(name);
  }

  // Runtime-observed: undefined until something sets them. Materialising to
  // false is exactly what the capture wrapper does; recording which ones were
  // absent keeps "never written" distinguishable from "explicitly false".
  const materialisedFlags = [];
  for (const flag of STATUS_FLAG_FIELDS) {
    if (fields[flag] === undefined) {
      materialisedFlags.push(flag);
      fields[flag] = false;
    } else {
      fields[flag] = Boolean(fields[flag]);
    }
  }

  // Clip-resident facing. The combat object does not carry it at action time;
  // a value found there is a staging artefact (the 1v1 fixtures fold the
  // clip's facing into the scenario) and is accepted with its origin recorded.
  let facing = DEFAULT_FACING;
  let facingSource = "default";
  if (clip && clip.gladiator_dir !== undefined) {
    facing = assertFacing(clip.gladiator_dir, "the fighter clip");
    facingSource = "fighter-clip";
  } else if (source.gladiator_dir !== undefined) {
    facing = assertFacing(source.gladiator_dir, "the combat object");
    facingSource = "combat-object";
  }

  return Object.freeze({
    fields,
    clip: Object.freeze({ gladiator_dir: facing }),
    materialisedFlags: Object.freeze(materialisedFlags),
    facingSource,
    timedSpellFields: Object.freeze(timedSpellFields),
    unknownFields: Object.freeze(unknownFields)
  });
}

/**
 * The inverse of `normaliseVanillaCombatant`'s split: recombines a normalised
 * record into the two objects vanilla actually stores them in.
 */
export function denormaliseVanillaCombatant(record) {
  assertVanillaRecord(record);
  return Object.freeze({
    combatObject: { ...record.fields },
    fighterClip: { gladiator_dir: record.clip.gladiator_dir }
  });
}

function assertVanillaRecord(record) {
  if (!record || typeof record !== "object" || !isPlainVanillaObject(record.fields)) {
    throw new AdapterStateError("A normalised vanilla record needs a `fields` object.");
  }
  if (!record.clip || !FACING_VALUES.includes(record.clip.gladiator_dir)) {
    throw new AdapterStateError("A normalised vanilla record needs a clip facing.");
  }
  return record;
}

/* ------------------------------------------------------------------ */
/* Vanilla -> canonical                                                */
/* ------------------------------------------------------------------ */

/** Map, "Spell and vanilla AI surface": observed inventory id -> decision label. */
const DAMAGE_SPELL_IDS = Object.freeze(new Set([30, 31, 32, 34, 35, 49]));
const HEAL_SPELL_IDS = Object.freeze(new Set([43, 46]));
const INVENTORY_SLOTS = Object.freeze(["inventory1", "inventory2", "inventory3", "inventory4", "inventory5", "inventory6"]);

function inventoryIds(fields) {
  return INVENTORY_SLOTS.map((slot) => Number(fields[slot])).filter((id) => Number.isFinite(id));
}

/**
 * PLACEHOLDER-VOCABULARY BRIDGE.
 *
 * `loadout` in `src/team/roster.js` is placeholder shape
 * (`meleeDamage`/`rangedDamage`/`canUseRanged`/`canUseSpell`/`canHeal`) because
 * the placeholder rule set's vocabulary is placeholder. Vanilla has a min/max
 * damage pair, a two-weapon slot system, ammunition, and an inventory of
 * numbered items — none of which reduce to those five values without inventing
 * something. Everything below is therefore an ASSUMPTION serving the
 * placeholder vocabulary only.
 *
 * A runtime-verified rule set will read the vanilla record directly and this
 * function becomes dead. Nothing else in the adapter depends on it.
 */
export function placeholderLoadoutFrom(fields) {
  const ids = inventoryIds(fields);
  return {
    meleeDamage: Number(fields.min_damage ?? 0),
    rangedDamage: Number(fields.secondary_min_damage ?? fields.min_damage ?? 0),
    canUseRanged: fields.using_bow === true || Number(fields.maximum_ammo ?? 0) > 0,
    canUseSpell: ids.some((id) => DAMAGE_SPELL_IDS.has(id)),
    canHeal: ids.some((id) => HEAL_SPELL_IDS.has(id))
  };
}

/**
 * The loadout keys the *vanilla record itself* backs, and nothing else.
 *
 * `placeholderLoadoutFrom` above answers all five keys unconditionally, which
 * meant the adapter's answer always won over `roster.normaliseCombatant`'s own
 * default — including in the two places where the two disagree in opposite
 * directions. `canUseSpell`/`canHeal` default to `stats.magicka > 0` in the
 * roster, so a gladiator with 20 magicka and an empty inventory came out
 * unable to cast, and one with 0 magicka holding a scroll came out able to.
 * That is the adapter deciding combat on the read side, which the write-shape
 * argument never covered.
 *
 * So the conversion emits a key only where a named vanilla field carries the
 * answer, and stays silent otherwise:
 *
 * | key | vanilla evidence | absent ⇒ |
 * | --- | --- | --- |
 * | `meleeDamage` | `min_damage` | omitted; the roster's default stands |
 * | `rangedDamage` | `secondary_min_damage` **only** — falling back to `min_damage` silently equated ranged with melee for every gladiator without a second weapon | omitted |
 * | `canUseRanged` | `using_bow` or `maximum_ammo` | omitted |
 * | `canUseSpell` | none: the inventory id sets are the adapter's own decision labels, not a vanilla field | **always** omitted |
 * | `canHeal` | none, likewise | **always** omitted |
 *
 * The `min_damage`-as-melee-base reading is still an assumption of the
 * placeholder vocabulary; what changes is that an assumption the vanilla
 * record cannot support is no longer stated at all. A caller that wants the
 * whole placeholder bridge passes it explicitly as `options.loadout`.
 */
function vanillaBackedLoadout(fields) {
  const loadout = {};
  const omitted = [];
  if (Number.isFinite(Number(fields.min_damage))) loadout.meleeDamage = Number(fields.min_damage);
  else omitted.push("meleeDamage");
  if (Number.isFinite(Number(fields.secondary_min_damage))) loadout.rangedDamage = Number(fields.secondary_min_damage);
  else omitted.push("rangedDamage");
  if (typeof fields.using_bow === "boolean" || Number.isFinite(Number(fields.maximum_ammo))) {
    loadout.canUseRanged = fields.using_bow === true || Number(fields.maximum_ammo ?? 0) > 0;
  } else {
    omitted.push("canUseRanged");
  }
  omitted.push("canUseSpell", "canHeal");
  return { loadout, omitted: Object.freeze(omitted) };
}

/** Every vanilla status flag currently true, in the byte-verified death order. */
export function canonicalStatusesFrom(fields) {
  return DEATH_STATUS_CLEAR_ORDER.filter((flag) => fields[flag] === true);
}

/** The numeric reading of one resource-backed vanilla field. */
function vanillaResourceValue(fields, name) {
  const raw = fields?.[name];
  if (raw === undefined) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * The canonical resource bag for one vanilla combat object.
 *
 * **No bound is declared, and that is a boundary decision rather than an
 * oversight.** `min` and `max` are a rail the *blueprint* asserts, and the
 * adapter has no evidence for one: saying `armourclass` has a floor of zero is
 * saying what happens when damage exceeds armour, which is exactly the
 * armour-first split the map records as a formula — rule-set work. So the
 * adapter declares `{ min: null, max: null }`, which also guarantees the value
 * round-trips untouched: `normaliseResourceBag` clamps on the way in, and a
 * clamp here would be the adapter quietly rewriting a vanilla field.
 *
 * Absent fields are materialised to 0, the same normalisation the six
 * undefined-until-set status flags get; `absentResourceSources` records which
 * ones, so "never written" stays distinguishable from "explicitly zero".
 */
export function canonicalResourcesFrom(fields) {
  const resources = {};
  for (const name of CANONICAL_RESOURCE_SOURCES) {
    resources[name] = { value: vanillaResourceValue(fields, name), min: null, max: null };
  }
  return resources;
}

/** Resource-backed fields the combat object carries no finite number for. */
export function absentResourceSources(fields) {
  return CANONICAL_RESOURCE_SOURCES.filter((name) => !Number.isFinite(Number(fields?.[name])));
}

/**
 * Builds the combatant *source* `src/team/roster.js` consumes.
 *
 * Every converted combatant declares the **same** canonical resource names, on
 * whichever side of the vanilla binding it lands. That is not tidiness: the
 * hero/villain surface is a binding rebound per action, not a roster, so any
 * combatant can be `game_attacker` on one action and `game_defender` on the
 * next, and the resolver refuses a write to a resource that combatant did not
 * declare. Declaring the set on one side only would mean a rule set's armour
 * write succeeded or threw depending on whose turn it was.
 *
 * The returned `vanilla` record remains the authoritative carrier for
 * everything neither the canonical shape nor the resource bag has room for
 * (equipment ids, the chance cache, the inventory, the timed spell fields).
 * See `docs/ss2-adapter-contract.md` for the canonical-shape gaps left.
 */
export function toCanonicalCombatantSource(source, {
  id,
  name,
  teamId = null,
  controller,
  clip = null,
  loadout = null
} = {}) {
  const record = normaliseVanillaCombatant(source, { clip });
  const { fields } = record;
  if (typeof id !== "string" || id.length === 0) {
    throw new AdapterStateError("A canonical combatant source needs an explicit combatant id.");
  }
  const stats = {};
  for (const [canonical, vanilla] of Object.entries(CANONICAL_STAT_SOURCES)) {
    const raw = Number(fields[vanilla]);
    if (!Number.isFinite(raw)) {
      // The adapter converts vanilla state; it does not invent it. Reading an
      // absent `defence` as 0 (or as 5, or as anything) is the adapter picking
      // a combat input, and the choice is invisible afterwards — canonical
      // state carries no record that the number was made up. A combat object
      // the map's "Base stats" row describes always carries all seven.
      throw new AdapterStateError(
        `The vanilla combat object for ${id} carries no ${vanilla}, so canonical ${canonical} cannot be read. ` +
        "The adapter converts base stats, it does not default them: supply the field, or build the combatant " +
        "from a blueprint rather than from a vanilla record."
      );
    }
    stats[canonical] = raw;
  }
  const backed = vanillaBackedLoadout(fields);
  const combatant = {
    id,
    name: name ?? (typeof fields.character_name === "string" ? fields.character_name : id),
    stats,
    // Only the keys a named vanilla field answers. See `vanillaBackedLoadout`:
    // everything else is left to `roster.normaliseCombatant`'s own defaults
    // rather than overridden by an assumption the record cannot support. A
    // caller that wants the full placeholder bridge passes it in.
    loadout: loadout === null ? backed.loadout : { ...loadout },
    // The one open, hashed, resolver-clamped numeric bag. Declared on every
    // combatant so either side of the per-action binding can be written.
    resources: canonicalResourcesFrom(fields),
    maxHealth: Number(fields.hitpointsmax ?? 0),
    health: Number(fields.hitpoints ?? 0),
    // The gladiator's true starting conditions. `roster.normaliseCombatant`
    // used to hard-code `status: []` and drop this; `normaliseStatus` now
    // carries it through, so a fighter who enters already burning still is.
    status: canonicalStatusesFrom(fields)
  };
  if (teamId !== null) combatant.teamId = teamId;
  if (controller !== undefined) combatant.controller = controller;
  return Object.freeze({
    combatant: Object.freeze(combatant),
    vanilla: record,
    /** Resource-backed fields this combat object never carried; read as 0. */
    defaultedResources: Object.freeze(absentResourceSources(fields)),
    /**
     * Loadout keys the vanilla record could not answer, so the roster's own
     * default decides them. Empty only when the caller supplied a `loadout`.
     */
    omittedLoadoutKeys: loadout === null ? backed.omitted : Object.freeze([])
  });
}

/**
 * The vanilla starting statuses as declarative effects, ordered.
 *
 * **Do not apply these to a battle built from these same sources.** They exist
 * from when `roster.normaliseCombatant` hard-coded `status: []` and dropped
 * `source.status`, so a caller had to reapply them by hand. `normaliseStatus`
 * carries them through now, so the roster has already applied them: this is a
 * description of the starting state, useful for diagnostics and for a caller
 * building a battle some other way, and applying it on top of a roster-built
 * battle would set a status the fighter already has.
 */
export function initialStatusEffects(sources) {
  return sources.flatMap(({ combatant }) =>
    combatant.status.map((status) => ({
      kind: EffectKind.STATUS,
      targetId: combatant.id,
      status,
      active: true
    }))
  );
}

/**
 * Diagnostic only. Reports whether the injected rule set's derived maximum
 * health agrees with the vanilla `hitpointsmax` the adapter read. It never
 * corrects either value: `hitpointsmax` comes from `battlevalues` (map,
 * "Combatant state objects"), which is a formula and therefore rule-set work.
 */
export function compareMaximumHealth(rules, canonicalSource, vanillaRecord) {
  const derived = rules.maximumHealth({ ...canonicalSource, maxHealth: undefined });
  const vanilla = Number(vanillaRecord.fields.hitpointsmax ?? 0);
  return Object.freeze({
    combatantId: canonicalSource.id,
    ruleSetDerived: derived,
    vanillaHitpointsMax: vanilla,
    agrees: derived === vanilla
  });
}

/* ------------------------------------------------------------------ */
/* Canonical -> vanilla                                                */
/* ------------------------------------------------------------------ */

/**
 * Mirrors resolved canonical state onto a vanilla record. Pure: it returns a
 * new record and copies values, never computing one.
 *
 * It writes **all six** status flags unconditionally, so the returned record
 * reports `materialisedFlags: []` — after this, nothing is absent any more.
 * That is only true of a record whose writes were actually applied to the live
 * combat object, so a caller that syncs canonical state onto a mirror it has
 * not flushed has thrown away the undefined-until-set provenance. Prefer
 * `mirrorDifferences` first and skip the sync when the mirror already agrees.
 */
export function toVanillaCombatant(canonical, record, { maxHealth = false, stats = false } = {}) {
  assertVanillaRecord(record);
  const fields = { ...record.fields };
  fields[CANONICAL_HEALTH_SOURCES.health] = canonical.health;
  // `hitpointsmax` is NOT written by default, and the default is the whole
  // point: `compareMaximumHealth` says it only ever reports, because
  // `hitpointsmax` comes from vanilla's `battlevalues` and deriving it is a
  // formula. Writing canonical `maxHealth` over it would put the *rule set's*
  // formula into a licensed gladiator's record.
  //
  // `maxHealth: true` is for the one record where that reasoning does not
  // apply: an AI-filled slot's mirror, where there is no licensed gladiator to
  // overwrite — the roster invented the fighter and its maximum health, and
  // the mirror's job is to describe *that* fighter. `battle-host.js` passes it
  // there and refuses the disagreement everywhere else.
  if (maxHealth) fields[CANONICAL_HEALTH_SOURCES.maxHealth] = canonical.maxHealth;
  // Base stats, likewise: mirrored only for a combatant the roster invented,
  // where the template's numbers describe a different gladiator from the one
  // that is actually fighting.
  if (stats && canonical.stats) {
    for (const [canonicalName, vanillaName] of Object.entries(CANONICAL_STAT_SOURCES)) {
      if (canonical.stats[canonicalName] === undefined) continue;
      fields[vanillaName] = canonical.stats[canonicalName];
    }
  }
  const active = new Set(canonical.status ?? []);
  for (const flag of STATUS_FLAG_FIELDS) fields[flag] = active.has(flag);
  // Resources, unlike the status flags, are written only where they actually
  // differ. Writing every declared resource unconditionally would *create* a
  // field on a combat object that never carried one — inventing vanilla state
  // rather than mirroring it — for every resource the object left absent.
  for (const [name, entry] of Object.entries(canonical.resources ?? {})) {
    if (!mirrorsToVanillaField(name)) continue;
    if (vanillaResourceValue(fields, name) === entry.value) continue;
    fields[name] = entry.value;
  }
  return Object.freeze({
    fields,
    clip: Object.freeze({ ...record.clip }),
    materialisedFlags: Object.freeze([]),
    facingSource: record.facingSource,
    timedSpellFields: record.timedSpellFields,
    unknownFields: record.unknownFields
  });
}

/**
 * Every place a vanilla record disagrees with resolved canonical state, as
 * human-readable strings. Empty means the mirror is in step.
 *
 * The fields compared are the ones the adapter owns: `hitpoints`,
 * `hitpointsmax`, the six status flags, and — since the canonical resource bag
 * exists — every declared resource the vanilla build has a field for. Armour,
 * stamina, ammunition and charisma used to have no canonical counterpart to
 * disagree with, so a mirror that was wrong about 44 points of armour reported
 * itself in perfect step. It no longer can.
 *
 * A resource the build has no field for is skipped rather than reported: a
 * rule set may invent a resource, and the adapter will not invent a vanilla
 * field to hold it (the same rule `emitStatus` applies to statuses).
 */
export function mirrorDifferences(record, canonical, { includeStats = false } = {}) {
  assertVanillaRecord(record);
  const problems = [];
  if (record.fields.hitpoints !== canonical.health) {
    problems.push(`hitpoints ${String(record.fields.hitpoints)} != health ${String(canonical.health)}`);
  }
  if (record.fields.hitpointsmax !== canonical.maxHealth) {
    problems.push(`hitpointsmax ${String(record.fields.hitpointsmax)} != maxHealth ${String(canonical.maxHealth)}`);
  }
  if (includeStats && canonical.stats) {
    for (const [canonicalName, vanillaName] of Object.entries(CANONICAL_STAT_SOURCES)) {
      if (canonical.stats[canonicalName] === undefined) continue;
      if (Number(record.fields[vanillaName]) === Number(canonical.stats[canonicalName])) continue;
      problems.push(
        `${vanillaName} ${String(record.fields[vanillaName])} != ${canonicalName} ${String(canonical.stats[canonicalName])}`
      );
    }
  }
  const active = new Set(canonical.status ?? []);
  for (const flag of STATUS_FLAG_FIELDS) {
    const mirrored = record.fields[flag] === true;
    if (mirrored !== active.has(flag)) problems.push(`${flag} ${String(record.fields[flag])} != canonical ${active.has(flag)}`);
  }
  for (const [name, entry] of Object.entries(canonical.resources ?? {})) {
    if (!mirrorsToVanillaField(name)) continue;
    // An absent field reads as 0, exactly as an unwritten status flag reads as
    // false: a resource nothing has written yet must not look like drift.
    const mirrored = vanillaResourceValue(record.fields, name);
    if (mirrored !== entry.value) {
      problems.push(`${name} ${String(record.fields[name])} != resource ${String(entry.value)}`);
    }
  }
  return problems;
}

/**
 * The vanilla fields the placeholder loadout bridge reads, and where a record
 * disagrees with the canonical loadout the roster actually built.
 *
 * `mirrorDifferences` cannot cover these: a rule set's `meleeDamage` is one
 * number and vanilla's is a `min_damage`/`max_damage` pair, so there is no
 * write that would reconcile them without inventing the other half. They are
 * *reported* instead — which is the whole point for an AI-filled slot, whose
 * mirror is a template describing some other gladiator's weapon.
 */
export const LOADOUT_SOURCE_FIELDS = Object.freeze([
  "min_damage",
  "secondary_min_damage",
  "using_bow",
  "maximum_ammo",
  ...INVENTORY_SLOTS
]);

export function loadoutMirrorDifferences(record, canonical) {
  assertVanillaRecord(record);
  const problems = [];
  const loadout = canonical.loadout ?? {};
  const compare = (field, key) => {
    if (loadout[key] === undefined) return;
    if (record.fields[field] === undefined) return;
    if (Number(record.fields[field]) === Number(loadout[key])) return;
    problems.push(`${field} ${String(record.fields[field])} != loadout.${key} ${String(loadout[key])}`);
  };
  compare("min_damage", "meleeDamage");
  compare("secondary_min_damage", "rangedDamage");
  if (loadout.canUseRanged !== undefined) {
    const mirrored = record.fields.using_bow === true || Number(record.fields.maximum_ammo ?? 0) > 0;
    if (mirrored !== loadout.canUseRanged) {
      problems.push(`using_bow/maximum_ammo imply canUseRanged ${mirrored} != loadout.canUseRanged ${loadout.canUseRanged}`);
    }
  }
  return problems;
}

/**
 * Fails loudly when a vanilla record has drifted away from resolved canonical
 * state. Drift is a bug in whoever applied the writes, and silently correcting
 * it would hide a desync between the mirror and the authoritative resolver.
 */
export function assertMirrorAgrees(record, canonical, options = {}) {
  const problems = mirrorDifferences(record, canonical, options);
  if (problems.length > 0) {
    throw new AdapterStateError(
      `The vanilla mirror for ${canonical.id} has drifted from resolved state: ${problems.join("; ")}.`
    );
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Effects -> vanilla field writes                                     */
/* ------------------------------------------------------------------ */

export const WriteTarget = Object.freeze({
  COMBAT_OBJECT: "combat-object",
  FIGHTER_CLIP: "fighter-clip"
});

function indexById(combatants) {
  if (!Array.isArray(combatants)) throw new AdapterStateError("Combatant projections must be an array.");
  return new Map(combatants.map((combatant) => [combatant.id, combatant]));
}

/**
 * Builds one vanilla field write, refusing any that the closed source
 * vocabulary cannot account for.
 *
 * `source` is mandatory. It is not documentation: it is what
 * `assertWriteProvenance` uses to decide which canonical value this write is
 * required to be identical to, and what pins the field to a set fixed
 * independently of any scenario.
 */
function fieldWrite({ combatantId, placement, field, from, to, reason, source, target = WriteTarget.COMBAT_OBJECT }) {
  if (!WRITE_SOURCES.includes(source)) {
    throw new AdapterStateError(
      `A vanilla field write must declare one of the ${WRITE_SOURCES.length} write sources ` +
      `(${WRITE_SOURCES.join(", ")}); the write to ${String(field)} declared ${JSON.stringify(source)}. ` +
      "A write with no declared source is a write with no evidence that the resolver produced its value."
    );
  }
  const allowed = source === WriteSource.DECLARED_RESOURCE
    ? isResourceBackedVanillaField(field)
    : ALLOWED_WRITE_FIELDS[source].includes(field);
  if (!allowed) {
    throw new AdapterStateError(
      `The write source ${source} may not write the vanilla field ${String(field)}. ` +
      `Allowed: ${ALLOWED_WRITE_FIELDS[source].join(", ")}${source === WriteSource.DECLARED_RESOURCE ? ", or a timed spell_* pool" : ""}.`
    );
  }
  if (target !== WRITE_SOURCE_TARGETS[source]) {
    throw new AdapterStateError(
      `The write source ${source} writes the ${WRITE_SOURCE_TARGETS[source]}, not the ${String(target)}.`
    );
  }
  return Object.freeze({
    target,
    source,
    combatantId,
    side: placement?.side ?? null,
    slotIndex: placement?.slotIndex ?? null,
    path: target === WriteTarget.FIGHTER_CLIP
      ? (placement?.instancePath ?? null)
      : (placement?.stateObjectPath ?? null),
    field,
    from,
    to,
    // `from === undefined` means the field did not exist before this write:
    // the six status flags are undefined until something sets them, and a
    // resource-backed field can be absent too, so the first write *creates* it.
    materialises: from === undefined,
    reason
  });
}

/**
 * **The structural check behind "the adapter decides no combat."**
 *
 * For every write, the source names exactly one place in the post-action
 * projection the value has to have come from, and the value has to be `===`
 * what is there. Not "close to", not "derivable from" — identical to a value
 * the resolver produced and clamped.
 *
 * That is what a prose rule could never give. `to: before - effect.amount`
 * reads plausibly and passes review; a value computed anywhere in this module
 * has no canonical location to be identical to, so it fails here by
 * construction. The same check catches a write pushed straight onto the list
 * without going through `fieldWrite`, because it walks the writes rather than
 * trusting how they were built.
 *
 * `clip-facing` is the one source with no canonical counterpart — the facing
 * is presentation, not combat state — so it is checked against the closed
 * `FACING_VALUES` vocabulary instead.
 *
 * @param {object[]} writes
 * @param {object[]|Map} after the post-action combatant projections
 */
export function assertWriteProvenance(writes, after) {
  const afterById = after instanceof Map ? after : indexById(after);
  for (const write of writes) {
    const projection = afterById.get(write.combatantId);
    const where = `${String(write.combatantId)}.${String(write.field)}`;
    if (write.source === WriteSource.CLIP_FACING) {
      if (!FACING_VALUES.includes(write.to)) {
        throw new AdapterStateError(
          `The clip-facing write for ${where} carries ${JSON.stringify(write.to)}, which is not a facing.`
        );
      }
      continue;
    }
    if (!projection) {
      throw new AdapterStateError(
        `The write to ${where} names combatant ${String(write.combatantId)}, who has no resolved projection. ` +
        "Every write must mirror a value the resolver produced."
      );
    }
    let expected;
    if (write.source === WriteSource.CANONICAL_HEALTH) {
      expected = projection.health;
    } else if (write.source === WriteSource.CANONICAL_STATUS) {
      expected = (projection.status ?? []).includes(write.field);
    } else if (write.source === WriteSource.DECLARED_RESOURCE) {
      const entry = projection.resources?.[write.field];
      if (entry === undefined) {
        throw new AdapterStateError(
          `The declared-resource write to ${where} names a resource the resolved projection does not declare.`
        );
      }
      expected = entry.value;
    } else {
      throw new AdapterStateError(`The write to ${where} declares no known write source.`);
    }
    if (write.to !== expected) {
      throw new AdapterStateError(
        `The ${write.source} write to ${where} carries ${JSON.stringify(write.to)}, but the resolved projection ` +
        `holds ${JSON.stringify(expected)}. A vanilla write must be identical to a value the resolver produced; ` +
        "a computed one is a second place combat is being decided."
      );
    }
  }
  return true;
}

/**
 * Converts one resolved action's effects into ordered vanilla field writes.
 *
 * The write values come from `after` — the canonical state the resolver
 * produced, clamped by the resolver — not from `effect.amount` and not from a
 * resource effect's `effect.to`. The effect list only supplies the *ordering*
 * and the *reason*. This is the whole point: the adapter can misattribute a
 * reason, but it structurally cannot produce a combat value the resolver did
 * not already decide.
 *
 * Three kinds of field are written: `hitpoints` from canonical health, the six
 * status flags from canonical status, and one vanilla field per canonical
 * **resource** — which is how `armourclass`, `staminaleft`, `ammo_left` and
 * the armour piece ratings are written. An armour-first split arrives as two
 * ordered effects (`resource` then `damage`) and leaves as two ordered writes;
 * the adapter never performs the subtraction that decided them.
 *
 * @param {object[]} params.before combatant projections before `applyAction`
 * @param {object[]} params.after  combatant projections after `applyAction`
 * @param {object[]} [params.effects] the rule set's declarative effects, in order
 * @param {Map|object} [params.placements] combatant id -> slot placement
 * @param {Map|object} [params.mirrors] combatant id -> normalised vanilla record
 */
export function vanillaWritesForResolvedAction({
  before,
  after,
  effects = [],
  placements = new Map(),
  mirrors = new Map()
} = {}) {
  const beforeById = indexById(before);
  const afterById = indexById(after);
  const placementFor = (id) => (placements instanceof Map ? placements.get(id) : placements?.[id]) ?? null;
  const mirrorFor = (id) => (mirrors instanceof Map ? mirrors.get(id) : mirrors?.[id]) ?? null;

  const writes = [];
  const unmapped = [];
  const emitted = new Set();

  const emitHealth = (id, reason) => {
    const key = `${id}:hitpoints`;
    if (emitted.has(key)) return;
    const previous = beforeById.get(id);
    const current = afterById.get(id);
    if (!current) throw new AdapterStateError(`No resolved state for combatant ${String(id)}.`);
    if (previous && previous.health === current.health) return;
    emitted.add(key);
    const mirror = mirrorFor(id);
    writes.push(fieldWrite({
      combatantId: id,
      placement: placementFor(id),
      field: "hitpoints",
      from: mirror ? mirror.fields.hitpoints : previous?.health,
      // The value the resolver produced and clamped. Never `previous.health -
      // effect.amount`: the adapter mirrors, it does not compute, and
      // `assertWriteProvenance` refuses anything that is not `after.health`.
      to: current.health,
      reason,
      source: WriteSource.CANONICAL_HEALTH
    }));
  };

  /**
   * The resource branch. `armourclass`, `staminaleft`, `ammo_left` and the
   * armour piece ratings reach vanilla through here and nowhere else.
   *
   * The value written is `after`'s resource value — the absolute value the
   * rule set asked for, already clamped to the declared bounds by the
   * resolver. It is never `before - effect.amount`, and it is never
   * `effect.to`: reading the post-action projection is what makes it
   * structurally impossible for the adapter to write a number the resolver did
   * not produce, and a rule set's `to` that the resolver clamped must land on
   * the clamped value, not the requested one.
   */
  const emitResource = (id, resource, reason) => {
    const key = `${id}:resource:${resource}`;
    if (emitted.has(key)) return;
    const current = afterById.get(id);
    if (!current) throw new AdapterStateError(`No resolved state for combatant ${String(id)}.`);
    const entry = current.resources?.[resource];
    if (entry === undefined) {
      // The resolver refuses a write to an undeclared resource, so this should
      // be unreachable through `applyAction`. It is reported rather than
      // assumed away, because the same function serves hand-built projections.
      emitted.add(key);
      unmapped.push(Object.freeze({
        combatantId: id,
        resource,
        reason: "the resolved projection declares no such resource"
      }));
      return;
    }
    const previous = beforeById.get(id)?.resources?.[resource];
    // Checked before the vanilla-field test so the totality pass, which walks
    // every declared resource on every combatant, stays silent about the ones
    // nothing moved.
    if (previous !== undefined && previous.value === entry.value) return;
    if (!mirrorsToVanillaField(resource)) {
      // The adapter will not invent a vanilla field for a resource the build
      // does not have, exactly as it will not for an unmapped status — nor
      // will it let a resource borrow a field canonical health, canonical
      // status or the clip record already owns.
      emitted.add(key);
      unmapped.push(Object.freeze({
        combatantId: id,
        resource,
        reason: unmappedResourceReason(resource)
      }));
      return;
    }
    emitted.add(key);
    const mirror = mirrorFor(id);
    writes.push(fieldWrite({
      combatantId: id,
      placement: placementFor(id),
      field: resource,
      // A resource-backed field can be absent on the live combat object just
      // as a status flag can, so the first write to one *materialises* it.
      from: mirror ? mirror.fields[resource] : previous?.value,
      to: entry.value,
      reason,
      source: WriteSource.DECLARED_RESOURCE
    }));
  };

  const emitStatus = (id, status, active, reason) => {
    const key = `${id}:${status}`;
    if (emitted.has(key)) return;
    if (!isStatusFlagField(status)) {
      // The adapter will not invent a vanilla field for a status the build
      // does not have. It is reported once, not guessed at.
      emitted.add(key);
      unmapped.push(Object.freeze({ combatantId: id, status, reason: "no vanilla flag carries this status" }));
      return;
    }
    emitted.add(key);
    const mirror = mirrorFor(id);
    // The live vanilla object still holds `undefined` for any flag the
    // normalisation had to materialise, so the first write to one *creates*
    // the field. `from: undefined` records that, and `materialises` reports it.
    const from = mirror
      ? (mirror.materialisedFlags.includes(status) ? undefined : mirror.fields[status])
      : (beforeById.get(id)?.status ?? []).includes(status);
    writes.push(fieldWrite({
      combatantId: id,
      placement: placementFor(id),
      field: status,
      from,
      to: active,
      reason,
      source: WriteSource.CANONICAL_STATUS
    }));
  };

  // 1. Effect order first, so the write order matches the order the rule set
  //    declared its effects in — the same discipline the 1v1 mutation trace
  //    uses.
  for (const effect of effects) {
    if (effect.kind === EffectKind.DAMAGE || effect.kind === EffectKind.HEAL) {
      emitHealth(effect.targetId, `${effect.kind}-effect`);
    } else if (effect.kind === EffectKind.RESOURCE) {
      // An armour-first split is `{ resource: armourclass, to: 0 }` then
      // `{ damage: overflow }`, and the writes come out in that order because
      // the effects did. The split itself is the rule set's, never ours.
      emitResource(effect.targetId, effect.resource, "resource-effect");
    } else if (effect.kind === EffectKind.STATUS) {
      const current = afterById.get(effect.targetId);
      if (!current) throw new AdapterStateError(`No resolved state for combatant ${String(effect.targetId)}.`);
      emitStatus(effect.targetId, effect.status, current.status.includes(effect.status), "status-effect");
    }
  }

  // 2. Then anything else the resolved state changed. Totality: a write is
  //    produced for every canonical difference, attributed or not.
  for (const [id, current] of afterById) {
    emitHealth(id, "resolved-state-diff");
    // Resource bag key order is normalised by `normaliseResourceBag`, so this
    // is a stable order two peers both produce.
    for (const resource of Object.keys(current.resources ?? {})) {
      emitResource(id, resource, "resolved-state-diff");
    }
    const previous = beforeById.get(id);
    const was = new Set(previous?.status ?? []);
    const now = new Set(current.status ?? []);
    for (const flag of DEATH_STATUS_CLEAR_ORDER) {
      if (was.has(flag) === now.has(flag)) continue;
      emitStatus(id, flag, now.has(flag), "resolved-state-diff");
    }
    for (const status of [...was, ...now]) {
      if (isStatusFlagField(status)) continue;
      if (was.has(status) === now.has(status)) continue;
      emitStatus(id, status, now.has(status), "resolved-state-diff");
    }
  }

  // 3. The shape check. Every write must be identical to a value the resolved
  //    projection actually holds, at the canonical location its source names.
  //    This runs on the produced list, not on the code that produced it, so it
  //    catches a write that never went through `fieldWrite` too.
  assertWriteProvenance(writes, afterById);

  return Object.freeze({ writes: Object.freeze(writes), unmapped: Object.freeze(unmapped) });
}

/**
 * Applies field writes to a normalised vanilla record. Pure; returns a new record.
 *
 * `materialisedFlags` is carried forward minus the flags these writes actually
 * touched. A write *creates* the flag it writes, so that flag is no longer
 * absent — but a flag nobody wrote is still absent on the live combat object,
 * and forgetting that would make a later first write report `materialises:
 * false` for a field it really does create. Applying a health-only write must
 * not erase the absence of five untouched status flags.
 */
export function applyVanillaWrites(record, writes) {
  assertVanillaRecord(record);
  const fields = { ...record.fields };
  const clip = { ...record.clip };
  const written = new Set();
  for (const write of writes) {
    if (write.target === WriteTarget.FIGHTER_CLIP) clip[write.field] = write.to;
    else {
      fields[write.field] = write.to;
      written.add(write.field);
    }
  }
  return Object.freeze({
    fields,
    clip: Object.freeze(clip),
    materialisedFlags: Object.freeze(
      (record.materialisedFlags ?? []).filter((flag) => !written.has(flag))
    ),
    facingSource: record.facingSource,
    timedSpellFields: record.timedSpellFields,
    unknownFields: record.unknownFields
  });
}

/** The one write that ever targets the fighter clip rather than the combat object. */
export function facingWrite(combatantId, placement, record, facing) {
  assertVanillaRecord(record);
  assertFacing(facing, "the caller");
  return fieldWrite({
    combatantId,
    placement,
    field: "gladiator_dir",
    from: record.clip.gladiator_dir,
    to: facing,
    reason: "clip-resident-facing",
    source: WriteSource.CLIP_FACING,
    target: WriteTarget.FIGHTER_CLIP
  });
}
