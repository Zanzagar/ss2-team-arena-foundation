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
 * Vanilla base stats with no canonical slot today. `charisma` drives the whole
 * taunt path (map, "Chance calculation": the taunt chance and the direction-20
 * damage both read it), so a runtime-verified rule set needs it. Until
 * `src/team/roster.js` carries it, it survives only in the vanilla record.
 */
export const UNMAPPED_VANILLA_STATS = Object.freeze(["charisma"]);

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

/** Every vanilla status flag currently true, in the byte-verified death order. */
export function canonicalStatusesFrom(fields) {
  return DEATH_STATUS_CLEAR_ORDER.filter((flag) => fields[flag] === true);
}

/**
 * Builds the combatant *source* `src/team/roster.js` consumes.
 *
 * The returned `vanilla` record is the authoritative carrier for everything
 * the canonical shape has no room for (armour, stamina, ammunition, equipment,
 * charisma, the chance cache, the inventory). See `docs/ss2-adapter-contract.md`
 * for the list of canonical-shape gaps this exposes.
 */
export function toCanonicalCombatantSource(source, {
  id,
  name,
  teamId = null,
  controller,
  clip = null
} = {}) {
  const record = normaliseVanillaCombatant(source, { clip });
  const { fields } = record;
  if (typeof id !== "string" || id.length === 0) {
    throw new AdapterStateError("A canonical combatant source needs an explicit combatant id.");
  }
  const stats = {};
  for (const [canonical, vanilla] of Object.entries(CANONICAL_STAT_SOURCES)) {
    stats[canonical] = Number(fields[vanilla] ?? 0);
  }
  const combatant = {
    id,
    name: name ?? (typeof fields.character_name === "string" ? fields.character_name : id),
    stats,
    loadout: placeholderLoadoutFrom(fields),
    maxHealth: Number(fields.hitpointsmax ?? 0),
    health: Number(fields.hitpoints ?? 0),
    // `roster.normaliseCombatant` currently hard-codes `status: []` and drops
    // this. It is emitted anyway because it is the true starting state, and
    // `initialStatusEffects` below turns it into the effects a future roster
    // would need. See the reported canonical-shape gaps.
    status: canonicalStatusesFrom(fields)
  };
  if (teamId !== null) combatant.teamId = teamId;
  if (controller !== undefined) combatant.controller = controller;
  return Object.freeze({ combatant: Object.freeze(combatant), vanilla: record });
}

/**
 * The status effects a caller would have to apply to reproduce the vanilla
 * starting statuses, because `roster.normaliseCombatant` drops `source.status`.
 * Declarative and ordered; applying them is the resolver's job, not ours.
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
export function toVanillaCombatant(canonical, record) {
  assertVanillaRecord(record);
  const fields = { ...record.fields };
  fields[CANONICAL_HEALTH_SOURCES.health] = canonical.health;
  fields[CANONICAL_HEALTH_SOURCES.maxHealth] = canonical.maxHealth;
  const active = new Set(canonical.status ?? []);
  for (const flag of STATUS_FLAG_FIELDS) fields[flag] = active.has(flag);
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
 * Only the fields the adapter owns are compared — `hitpoints`, `hitpointsmax`
 * and the six status flags — because they are the only canonical values that
 * exist. Armour, stamina, ammunition and the rest have no canonical
 * counterpart to disagree with; see `docs/ss2-adapter-contract.md`,
 * "Canonical-shape gaps this exposes".
 */
export function mirrorDifferences(record, canonical) {
  assertVanillaRecord(record);
  const problems = [];
  if (record.fields.hitpoints !== canonical.health) {
    problems.push(`hitpoints ${String(record.fields.hitpoints)} != health ${String(canonical.health)}`);
  }
  if (record.fields.hitpointsmax !== canonical.maxHealth) {
    problems.push(`hitpointsmax ${String(record.fields.hitpointsmax)} != maxHealth ${String(canonical.maxHealth)}`);
  }
  const active = new Set(canonical.status ?? []);
  for (const flag of STATUS_FLAG_FIELDS) {
    const mirrored = record.fields[flag] === true;
    if (mirrored !== active.has(flag)) problems.push(`${flag} ${String(record.fields[flag])} != canonical ${active.has(flag)}`);
  }
  return problems;
}

/**
 * Fails loudly when a vanilla record has drifted away from resolved canonical
 * state. Drift is a bug in whoever applied the writes, and silently correcting
 * it would hide a desync between the mirror and the authoritative resolver.
 */
export function assertMirrorAgrees(record, canonical) {
  const problems = mirrorDifferences(record, canonical);
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

function fieldWrite({ combatantId, placement, field, from, to, reason, target = WriteTarget.COMBAT_OBJECT }) {
  return Object.freeze({
    target,
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
    // the six status flags are undefined until something sets them, so the
    // first write to one *materialises* it.
    materialises: from === undefined,
    reason
  });
}

/**
 * Converts one resolved action's effects into ordered vanilla field writes.
 *
 * The write values come from `after` — the canonical state the resolver
 * produced, clamped by the resolver — not from `effect.amount`. The effect
 * list only supplies the *ordering* and the *reason*. This is the whole point:
 * the adapter can misattribute a reason, but it structurally cannot produce a
 * combat value the resolver did not already decide.
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
      // effect.amount`: the adapter mirrors, it does not compute.
      to: current.health,
      reason
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
      reason
    }));
  };

  // 1. Effect order first, so the write order matches the order the rule set
  //    declared its effects in — the same discipline the 1v1 mutation trace
  //    uses.
  for (const effect of effects) {
    if (effect.kind === EffectKind.DAMAGE || effect.kind === EffectKind.HEAL) {
      emitHealth(effect.targetId, `${effect.kind}-effect`);
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
    target: WriteTarget.FIGHTER_CLIP
  });
}
