/**
 * The vanilla SS2 field catalogue.
 *
 * This module is *data*: the names, groups, defaults, and citations for every
 * field the read-only battle map records on the persistent combat objects
 * (`_root.game.hero` / `_root.game.villain`) and on the runtime fighter clips
 * (`_root.arena.gladiators.hero` / `.villain`). It contains no formulas, no
 * derivations, and no combat decisions — deriving a value from these fields is
 * rule-set work, not adapter work.
 *
 * Every citation below is a section of `docs/integration/ss2-battle-map.md`.
 * Where the map is silent the constant says so explicitly and the accompanying
 * `MAP_SILENCE` entry names the capture that would settle it. Nothing in this
 * file may be presented as runtime-verified: the only runtime-verified
 * behaviour in the repository is what `test/fixtures/ss2-1v1-golden/` holds.
 */

export const HERO_SIDE = "hero";
export const VILLAIN_SIDE = "villain";

/** The two — and only two — sides the vanilla surface knows about. */
export const VANILLA_SIDES = Object.freeze([HERO_SIDE, VILLAIN_SIDE]);

/** Map: "Combatant state objects". Persistent combat data. */
export const GAME_OBJECT_ROOT = "_root.game";

/** Map: "Battle entry and timeline ownership" step 1-3. Display/animation state. */
export const GLADIATOR_CLIP_ROOT = "_root.arena.gladiators";

/** Map: "Combatant state objects". The four per-action binding registers. */
export const VANILLA_BINDING_GLOBALS = Object.freeze({
  ATTACKER_CLIP: "attacker",
  DEFENDER_CLIP: "defender",
  ATTACKER_OBJECT: "game_attacker",
  DEFENDER_OBJECT: "game_defender"
});

export class VanillaFieldError extends Error {
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

/* ------------------------------------------------------------------ */
/* Field groups                                                        */
/* ------------------------------------------------------------------ */

const group = (citation, fields, notes = null) =>
  Object.freeze({ citation, fields: Object.freeze([...fields]), notes });

/**
 * Every field group the map's "Observed data fields" table records, in the
 * table's own order. `citation` names the section a reader should check.
 */
export const VANILLA_FIELD_GROUPS = Object.freeze({
  identity: group("battle-map: Combatant state objects / Identity-progression", [
    "character_name",
    "herolevel",
    "character_level",
    "experience",
    "experienceneeded",
    "current_tournament",
    "tournament_ranking"
  ]),
  baseStats: group("battle-map: Combatant state objects / Base stats", [
    "strength",
    "speed",
    "attack",
    "defence",
    "vitality",
    "stamina",
    "charisma",
    "magicka"
  ]),
  liveResources: group("battle-map: Combatant state objects / Live resources", [
    "hitpoints",
    "hitpointsmax",
    "staminaleft",
    "staminamax",
    "armourclass",
    "armourclass_max",
    "ammo_left",
    "maximum_ammo"
  ]),
  primaryWeapon: group("battle-map: Combatant state objects / Primary weapon", [
    "weapon",
    "weapon_type",
    "weapon_weight",
    "weapon_range",
    "weapon_min_damage",
    "weapon_max_damage",
    "weapon_enchantment_type",
    "weapon_enchantment_potency",
    "equipped_weapon",
    "using_bow"
  ]),
  secondaryWeapon: group(
    "battle-map: Combatant state objects / Secondary weapon",
    [
      "secondary_weapon",
      "secondary_weapon_type",
      "secondary_weapon_weight",
      "secondary_weapon_range",
      "secondary_weapon_min_damage",
      "secondary_weapon_max_damage",
      "secondary_weapon_enchantment_type",
      "secondary_weapon_enchantment_potency"
    ],
    // The map names `secondary_weapon` explicitly and then says "plus the
    // corresponding type, weight, range, min/max damage, and enchantment
    // fields". Only the two enchantment names are independently corroborated
    // (they appear in the 1v1 candidate resolver). The rest are reconstructed
    // by prefixing and are marked as such.
    "ASSUMPTION: names reconstructed by prefixing `secondary_`; the map spells out only `secondary_weapon` and the two enchantment fields."
  ),
  armour: group("battle-map: Combatant state objects / Armour", [
    "breastplate",
    "helmet",
    "shinguard",
    "greaves",
    "shoulderguard",
    "gauntlet",
    "boot",
    "shield",
    "breastplate_defence",
    "helmet_defence",
    "shinguard_defence",
    "greaves_defence",
    "shoulderguard_defence",
    "gauntlet_defence",
    "boot_defence",
    "shield_defence"
  ]),
  derivedCombat: group("battle-map: Combatant state objects / Derived combat + battlevalues", [
    "physical_size",
    "min_damage",
    "max_damage",
    "secondary_min_damage",
    "secondary_max_damage",
    "movement_speed",
    "attack_type",
    "attack_speed",
    "weapon_enchantment_damage",
    // Added 2026-09-02. Its absence was an asymmetry rather than a decision:
    // `battlevalues` writes BOTH, four instructions apart (`+0x320c` and
    // `+0x3326`), and the map's own "Derived combat" row names both. Every
    // other field in this group that has a `secondary_` twin carries it.
    "secondary_weapon_enchantment_damage"
  ]),
  chanceCache: group("battle-map: Hit and damage path / Chance calculation", [
    "power_percentage",
    "normal_percentage",
    "quick_percentage",
    "bash_percentage",
    "taunt_percentage",
    "bombard_percentage",
    "snipe_percentage",
    "magicka_percentage"
  ]),
  conditions: group(
    "battle-map: Combatant state objects / Conditions",
    ["psyche_up", "taunted1", "taunted2", "burning", "frozen", "poison", "life_stolen"],
    "Timed `spell_*` fields belong to this group; the map names none of them individually."
  ),
  inventory: group("battle-map: Combatant state objects / Inventory", [
    "inventory1",
    "inventory2",
    "inventory3",
    "inventory4",
    "inventory5",
    "inventory6"
  ])
});

/**
 * Runtime-observed 2026-08-30 (battle map, "Combatant state objects"): the
 * persistent combat objects leave these six flags **undefined** until
 * something sets them. Reading one therefore yields `undefined`, not `false`,
 * on a freshly constructed battle. The capture wrapper normalises undefined to
 * `false` and this adapter does the same, recording every normalisation so the
 * difference between "never set" and "explicitly false" is never lost.
 */
export const STATUS_FLAG_FIELDS = Object.freeze([
  "burning",
  "frozen",
  "poison",
  "life_stolen",
  "taunted1",
  "taunted2"
]);

/**
 * Byte-verified `death()` clear order (battle map, "Battle result and reward
 * callbacks"): frozen, burning, poison, life_stolen — hero's group first, then
 * villain's — followed by taunted1 (hero, villain) and taunted2 (hero,
 * villain). Used only to order *writes*; clearing is the rule set's decision.
 */
export const DEATH_STATUS_CLEAR_ORDER = Object.freeze([
  "frozen",
  "burning",
  "poison",
  "life_stolen",
  "taunted1",
  "taunted2"
]);

/**
 * Runtime-observed 2026-08-30 (battle map, "Combatant state objects"): the
 * persistent combat objects "do not carry `gladiator_dir` at action time — the
 * facing lives on the fighter clips". It is therefore read from, and written
 * to, `_root.arena.gladiators.<instance>` and never to `_root.game.<side>`.
 */
export const CLIP_RESIDENT_FIELDS = Object.freeze(["gladiator_dir"]);

/** Map, "Battle entry": the clips are placed facing right (hero) and left (villain). */
export const FACING_VALUES = Object.freeze(["right", "left"]);
export const DEFAULT_FACING = "right";

const TIMED_SPELL_PREFIX = "spell_";

const KNOWN_FIELDS = Object.freeze(
  new Set(Object.values(VANILLA_FIELD_GROUPS).flatMap((entry) => entry.fields))
);

const STATUS_FLAG_SET = Object.freeze(new Set(STATUS_FLAG_FIELDS));
const CLIP_RESIDENT_SET = Object.freeze(new Set(CLIP_RESIDENT_FIELDS));

/* ------------------------------------------------------------------ */
/* Where the map is silent                                             */
/* ------------------------------------------------------------------ */

/**
 * Every place this adapter had to act without the map settling the question.
 * Each entry names what would settle it. Nothing here is verified; nothing
 * here may be presented as SS2 behaviour.
 */
export const MAP_SILENCE = Object.freeze([
  Object.freeze({
    id: "psyche-up-initialisation",
    subject: "`psyche_up` initial value",
    silence:
      "The map lists `psyche_up` under Conditions and records that the spell ingress writes " +
      "`game_defender.psyche_up = 1` unconditionally, but never says whether it is initialised " +
      "before that write, so it may be undefined-until-set like the six status flags.",
    adapterBehaviour: "Treated as a numeric field defaulting to 0; NOT normalised as a status flag.",
    settledBy: "A capture that dumps the persistent object before any action and reports whether `psyche_up` is undefined."
  }),
  Object.freeze({
    id: "timed-spell-field-names",
    subject: "the timed `spell_*` field names",
    silence: "The map says \"timed `spell_*` fields\" and names none of them.",
    adapterBehaviour:
      "Any own key matching /^spell_/ is classified as a timed spell field and passed through unchanged.",
    settledBy: "A capture that enumerates the persistent object's own keys after casting each of the six buffs."
  }),
  Object.freeze({
    id: "secondary-weapon-field-names",
    subject: "the secondary weapon field names",
    silence: "The map spells out `secondary_weapon` and the two enchantment fields only.",
    adapterBehaviour: "The remaining names are reconstructed by prefixing `secondary_` and are marked as assumed.",
    settledBy: "The same own-key enumeration capture, on a gladiator carrying a secondary weapon."
  }),
  Object.freeze({
    id: "panel-bar-instance-names",
    subject: "the combat panel's health and stamina bar instance names",
    silence:
      "The map's UI table names only `hero_potion`, `villain_potion`, `hero_stamina_potion`, " +
      "`villain_stamina_potion`, `hero_armour`, and `villain_armour` on `combat_panel` (export 751).",
    adapterBehaviour:
      "Panel updates address a widget *role* per slot; the front slots use the six mapped instance names and " +
      "every other role is addressed by role name, not by a guessed instance name.",
    settledBy: "A capture that enumerates `arena.combat_panel`'s child instance names."
  }),
  Object.freeze({
    id: "ranged-hurt-label-adjustment",
    subject: "the `hurtN` label adjustment for ranged directions",
    silence:
      "The map records that `defender_hurt` \"selects an animation label (`hurtN`, adjusted for ranged " +
      "directions, or `knockback`)\" without giving the adjustment.",
    adapterBehaviour:
      "The shipped SS2 label table marks every ranged-direction hurt label `assumed` and carries the flag " +
      "onto the emitted presentation command.",
    settledBy: "A capture that records the defender clip's current frame label after each bombard/snipe/bash hit."
  }),
  Object.freeze({
    id: "multi-slot-arena-geometry",
    subject: "positions, depths, and clip names for slots beyond the first",
    silence:
      "Vanilla has no second ally, so the map cannot settle this: it records only `hero` at depth 301 and " +
      "`villain` at depth 300, placed at (-250, 200) and (250, 200), and states that the panel and timeline " +
      "are hard-coded for two sides.",
    adapterBehaviour:
      "Slot 0 reuses the vanilla instance names, depths, and positions exactly; further slots use authored " +
      "names and a reserved depth band that provably avoids every depth the map records.",
    settledBy: "Nothing in vanilla; this is authored mod surface and is labelled as such."
  }),
  Object.freeze({
    id: "initiative-order",
    subject: "the resolver's strict initiative order",
    silence:
      "Vanilla runs a three-phase `battle_action` cycle advanced by `nextphase` (map, \"Spell and vanilla AI " +
      "surface\"), not a sorted initiative list. The map does not describe a turn order the resolver's " +
      "`initiativeOrder` could be compared against.",
    adapterBehaviour: "The adapter does not translate turn order at all; it presents whatever order the resolver produced.",
    settledBy: "A capture that records the `battle_action` cycle and phase attribution across a multi-action battle."
  })
]);

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

export function isKnownVanillaField(name) {
  return KNOWN_FIELDS.has(name);
}

/** True for the six flags the persistent objects leave undefined until set. */
export function isStatusFlagField(name) {
  return STATUS_FLAG_SET.has(name);
}

/** True for fields that live on the fighter clip, not the persistent object. */
export function isClipResidentField(name) {
  return CLIP_RESIDENT_SET.has(name);
}

export function isTimedSpellField(name) {
  return typeof name === "string" && name.startsWith(TIMED_SPELL_PREFIX);
}

export function knownVanillaFields() {
  return [...KNOWN_FIELDS];
}

/**
 * Reads one of the six undefined-until-set status flags.
 *
 * `undefined` means "nothing has written it yet" and reads as `false`, which
 * is exactly what the capture wrapper does. `absent` in the returned record
 * preserves the distinction the raw object would otherwise lose.
 */
export function readStatusFlag(record, name) {
  if (!isStatusFlagField(name)) {
    throw new VanillaFieldError(`${String(name)} is not one of the undefined-until-set status flags.`);
  }
  if (!isPlainObject(record)) {
    throw new VanillaFieldError("A vanilla combat object must be a plain object.");
  }
  const raw = record[name];
  return Object.freeze({ name, absent: raw === undefined, value: raw === undefined ? false : Boolean(raw) });
}

/** The map section a field's presence in this adapter is justified by. */
export function citationFor(name) {
  for (const entry of Object.values(VANILLA_FIELD_GROUPS)) {
    if (entry.fields.includes(name)) return entry.citation;
  }
  if (isClipResidentField(name)) return "battle-map: Combatant state objects / clip-resident facing";
  if (isTimedSpellField(name)) return "battle-map: Combatant state objects / Conditions (timed spell_* fields, unnamed)";
  return null;
}

export { isPlainObject as isPlainVanillaObject };
