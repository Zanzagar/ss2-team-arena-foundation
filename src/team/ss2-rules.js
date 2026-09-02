/**
 * SS2's own arithmetic, wired into the shared team resolver. MAP-DERIVED.
 *
 * This is the first rule set in the repository that is not invented. Every
 * number it produces is either read out of the licensed build's bytecode (via
 * `docs/integration/ss2-battle-map.md`, which carries the offsets) or computed
 * by `src/golden/ss2-attack-candidate.js`, the module the 22 promoted goldens
 * already replay against. Until this file existed the corpus fed nothing: the
 * resolver ran `placeholder-rules.js`, and 22 runtime-verified fixtures sat in
 * `test/fixtures/` with no consumer.
 *
 * ## What tier this is, and why it is not higher
 *
 * `map-derived`, and it declares `runtimeVerified: false`. No capture session
 * has ever observed THIS MODULE driving a fight. What the goldens back is the
 * attack ingress it delegates to, for directions 1-12 only. Everything else
 * here — the stamina economy, action legality, the AI policy — is derived from
 * the map and has never been observed at all. The provenance note says so, the
 * hot-seat banner prints the tier, and `rule-set.js` refuses the claim of
 * runtime verification outright.
 *
 * ## The vocabulary is three verbs and a rest, and the direction is DRAWN
 *
 * A player does not choose an `attack_direction` in SS2. `power_attack`,
 * `normal_attack` and `quick_attack` each draw one — `randomBetween(9, 12)` at
 * `+0x608a`, `randomBetween(5, 8)` at `+0x61f1`, `randomBetween(1, 4)` at
 * `+0x635c` (map § "Where `attack_direction` is assigned") — before calling
 * `checkattackroll`. The map states it plainly: the direction "is recorded,
 * never dictated".
 *
 * So the direction is a draw on the ordered channel, not a token in the action
 * vocabulary. That is the opposite of the obvious design — encoding twelve
 * directions as twelve action types — and the obvious design would have handed
 * the player a choice the build does not give them, which is a parity claim
 * nothing measured.
 *
 * `rest` is in the vocabulary because without it a fight deadlocks: the
 * attacker pays `staminacost` on every phase transition (`nextphase`
 * `+0x32a7`), and at `staminaleft <= 0` overlay frame 1 forces
 * `getphase("rest")` (`+0x0d2e`).
 *
 * Deferred, each for a stated reason: `bash_attack` (needs a `criticalhit`
 * inherited across actions, which the resolver has no channel for),
 * `bombard`/`snipe` (need `using_bow`, a `swap_weapons` turn and an
 * `ammo_left` model), `psyche_up` (needs a three-turn counter and a position
 * model), `taunt` (the candidate implements only the post-`checkattackroll`
 * arm, so it would consume the wrong number of samples). None of the four has
 * a single golden.
 *
 * ## What reaches the arithmetic, and how
 *
 * `resolveSs2PhysicalAttackCandidate` reads ~40 vanilla fields. The resolver's
 * combatant carries seven stats, five loadout keys, a numeric resource bag and
 * a status list — and `roster.normaliseCombatant` rebuilds `stats` and
 * `loadout` as fixed-key literals, so a blueprint's extra keys are dropped.
 * Everything SS2-specific therefore travels as a **resource** (numbers) or a
 * **status** (strings), which is exactly what those two channels exist for:
 * both are on the view AND on the projection, so `combatStateHash` covers
 * every PER-COMBATANT input this rule set reads.
 *
 * That sentence used to end "covers every input this rule set reads. Nothing
 * reaches it through a side channel", and a verifier broke it. Two things are
 * read that the hash does not cover, and neither is this module's to fix:
 *
 * - **the RNG samples in tape mode.** `toTeamWireState` carries `rngState` and
 *   `rngCursor`, but a tape channel's `state` is a constant 0, so only the
 *   cursor moves. Two peers with different tapes hash identically until they
 *   diverge. Projecting the channel mode and a digest of the samples would
 *   close it; that is a resolver-contract change with its own decision.
 * - **the `observer` option**, which is not in the rule-set id and not in the
 *   projection. It is handed a deep clone precisely so it cannot reach the
 *   objects `battle.events` holds.
 *
 * `gladiator_dir` is the one input that cannot be a resource — resources are
 * finite numbers by construction — so it travels as the status token
 * `facing-left` (absent means "right", matching the candidate's own default).
 * It is load-bearing on the RNG: facing decides the armour-debris draw's
 * source and bounds, so getting it wrong desyncs a tape rather than merely
 * moving a number.
 *
 * ## The adapter path works for AI-filled slots and not for supplied ones
 *
 * **Corrected 2026-09-02. This section previously said "A battle built through
 * `src/adapter/` therefore cannot feed this rule set", and that is FALSE** — a
 * verifier built one and fought a 28-step battle through it. The claim was
 * mine and it was over-general in the direction that discourages someone from
 * trying; it is corrected here rather than deleted because it was cited as a
 * known limitation in `HANDOFF.md`.
 *
 * What is true: `CANONICAL_RESOURCE_SOURCES` (`src/adapter/state-bridge.js`) is
 * a closed list carrying none of the eight armour piece ids, `min_damage`,
 * `max_damage`, `character_level`, `equipped_weapon` or `herolevel`. What that
 * blocks is the **supplied-gladiator** path only, because
 * `toCanonicalCombatantSource` hard-codes the bag and takes no `resources`
 * option.
 *
 * An **AI-filled slot** has no combat object, so its bag comes from the
 * caller's own template, and `declaredFillResources`
 * (`src/adapter/battle-host.js`) reads `resources` straight off `team.aiFill`
 * — bypassing `CANONICAL_RESOURCE_SOURCES` entirely. So
 * `createVanillaBattleHost({ teams: [...aiFill.resources from ss2Combatant()],
 * rules: ss2TeamRules })` constructs, resolves actions, and emits real vanilla
 * writes with `unmapped: []`.
 *
 * Also corrected: the refusal is NOT `maximumHealth`'s. On the supplied path
 * the throw that actually fires is `assertRequiredResources`, and it names
 * `max_damage, min_damage` — `staminaleft` and `staminamax` ARE in
 * `CANONICAL_RESOURCE_SOURCES`, so only two of the four required names are
 * missing. Anyone debugging this from the old wording went to the wrong throw.
 *
 * Widening the canonical list is still real work with its own evidence
 * requirements; it is not done here.
 *
 * ## Two honest gaps, named because a silent one would be a lie
 *
 * 1. **First blood is not representable.** The candidate ends a `duel` or
 *    `misc` bout at `hitpoints < hitpointsmax`; the resolver decides
 *    elimination on `health > 0` alone and knows nothing else. Rather than
 *    drop the result event, this rule set THROWS when the arithmetic produces
 *    a first-blood outcome — and that throw is NOT free: it fires after the
 *    action's draws have already advanced the authoritative RNG state and
 *    cursor, which `combatStateHash` covers and `applyAction` cannot roll
 *    back. A caller that catches it holds a battle no replay of the accepted
 *    action log reproduces. So `duel` and `misc` are refused AT CONSTRUCTION
 *    unless the caller passes `fixtureReplay: true`, which is what the golden
 *    replay does; the in-action throw is a backstop behind that gate, not a
 *    routine path.
 *
 *    Worth knowing while reading that: `tournament` — the mode play uses — is
 *    the one mode of the build's three that no capture in this repository has
 *    ever observed. All 22 goldens are `misc`.
 * 2. **The AI policy is invented, apart from one gate.** Only
 *    `villainChooseAction`'s unconditional `staminaleft > 10` is byte-decoded.
 *    Target choice and the choice among the three verbs are this module's own.
 *
 * 3. **`weapon_min_damage` / `weapon_max_damage` are unmodelled — but NOT
 *    because they are underivable.** `ss2BattleValues` takes them as
 *    caller-supplied inputs.
 *
 *    **Corrected 2026-09-02.** This gap used to end "so it cannot produce a
 *    gladiator's damage pair from a character record alone", which is wrong,
 *    and wrong in a way that made the gap look closed by nature rather than
 *    open by omission. The build's lookup is
 *    `_root["weapon" + whichcharacter.weapon][3]` and `[4]` (`+0x31be`,
 *    `+0x31da`) — keyed on `weapon`, a field ON the character record, into a
 *    STATIC literal table declared in the same root-frame-35 block
 *    (`weapon24 = Array(3, "Hatchet", 4, 8, 32, 1)` at `+0x41c6`, one entry per
 *    weapon id). So the pair IS derivable from a character record plus a
 *    transcription of build-constant data — data no different in status from
 *    the `_global.<piece>_dval` constants this module already transcribes.
 *
 *    What actually blocks it is two omissions, both closable: `weapon` is not
 *    a declarable field in `SS2_RESOURCE_NAMES`, `CANONICAL_RESOURCE_SOURCES`
 *    or `COMBATANT_KEYS`; and the table is not transcribed ~~into this
 *    repository~~ **INTO CODE — corrected 2026-09-02, because the unqualified
 *    sentence sent the ranked next step off to redo finished work.**
 *    `docs/integration/ss2-item-tables.md` has carried the transcription since
 *    2026-08-30: §2.3 for weapon ids 1-80, §2.4 for id 0 and the nine off-shop
 *    ids, EACH ROW WITH THE INSTRUCTION OFFSET OF ITS OWN LITERAL, and §2.1
 *    for what every array index means. Two rows were re-read from the bytes on
 *    2026-09-02 and matched; the other 88 have never been checked, so what
 *    this module needs first is a MECHANICAL diff of that document against the
 *    build, not a fresh transcription. That document also settles the boundary
 *    question this work runs into — display names are game content and are not
 *    reproduced; items are addressed by id.
 *
 *    Note the battle map has the same hole and is what made the error
 *    reachable: it records `min_damage = round(strength*2) + weapon_min_damage`
 *    and never records where `weapon_min_damage` itself comes from, so anyone
 *    following the standing "derive from the map" rule concludes it is an
 *    input. Corrected there too.
 *
 * 4. **Enchantment DAMAGE is dropped entirely, on both weapons.**
 *    `weapon_enchantment_damage` (`+0x320c`) and
 *    `secondary_weapon_enchantment_damage` (`+0x3326`) are each
 *    `ceil(<max_damage> / 3 * <potency>)`, and neither is computed here — so an
 *    enchanted weapon applies a status and deals no magic damage. The
 *    secondary field is absent from the adapter catalogue too
 *    (`src/adapter/vanilla-fields.js` carries only the primary), which is an
 *    asymmetry rather than a deliberate exclusion.
 *
 *    Do NOT confuse this with the enchantment PROC, which is modelled and is
 *    correct: the proc gate reads the PRIMARY potency for both weapons, and
 *    `src/golden/ss2-attack-candidate.js`'s `activeEnchantment` documents the
 *    bytes. That pairing has been flagged as a bug once already and is not one.
 *
 * Node builtins only.
 */

import { calculateSs2AttackChances, resolveSs2PhysicalAttackCandidate } from "../golden/ss2-attack-candidate.js";
import { SS2_BUILD_SHA256 } from "../golden/run-1v1-fixture.js";
import { resourceValue } from "./resources.js";
import { defineTeamRuleSet, EffectKind, RuleSetVerification, TeamRuleSetError } from "./rule-set.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => JSON.parse(JSON.stringify(value));

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/**
 * The action vocabulary. Hyphenated because `actionTypes` tokens must match
 * `/^[a-z0-9][a-z0-9-]{0,63}$/` (`rule-set.js`), which rejects vanilla's
 * underscores. `VANILLA_PHASE_LABEL` keeps the round trip.
 */
export const Ss2ActionType = Object.freeze({
  QUICK_ATTACK: "quick-attack",
  NORMAL_ATTACK: "normal-attack",
  POWER_ATTACK: "power-attack",
  REST: "rest"
});

/** Action token -> the `getphase` label the build knows it by. */
export const VANILLA_PHASE_LABEL = Object.freeze({
  [Ss2ActionType.QUICK_ATTACK]: "quick_attack",
  [Ss2ActionType.NORMAL_ATTACK]: "normal_attack",
  [Ss2ActionType.POWER_ATTACK]: "power_attack",
  [Ss2ActionType.REST]: "rest"
});

/**
 * The three melee bands, with the direction draw and the `staminacost` each
 * branch sets. Both columns are byte-verified; the offsets are the map's.
 *
 * | token | direction draw | `staminacost` |
 * | --- | --- | --- |
 * | `quick-attack`  | `randomBetween(1, 4)`  `+0x635c` | `round(strength)`     `+0x6317` |
 * | `normal-attack` | `randomBetween(5, 8)`  `+0x61f1` | `round(strength * 2)` `+0x61a3` |
 * | `power-attack`  | `randomBetween(9, 12)` `+0x608a` | `round(strength * 3)` `+0x603c` |
 */
const ATTACK_BANDS = Object.freeze({
  [Ss2ActionType.QUICK_ATTACK]: Object.freeze({ low: 1, high: 4, strengthFactor: 1 }),
  [Ss2ActionType.NORMAL_ATTACK]: Object.freeze({ low: 5, high: 8, strengthFactor: 2 }),
  [Ss2ActionType.POWER_ATTACK]: Object.freeze({ low: 9, high: 12, strengthFactor: 3 })
});

/** The label the direction draw takes on the ordered channel. See the header. */
export const ATTACK_DIRECTION_ROLL_LABEL = "attack-direction-roll";

/* ------------------------------------------------------------------ */
/* The SS2 field set, and the two channels it travels on                */
/* ------------------------------------------------------------------ */

/** The eight armour pieces, in `battlevalues` assignment order. */
export const SS2_ARMOUR_PIECES = Object.freeze([
  "helmet",
  "shoulderguard",
  "breastplate",
  "gauntlet",
  "greaves",
  "shinguard",
  "boot",
  "shield"
]);

/**
 * `_global.<piece>_dval`, read at root frame 35 `+0x3089`-`+0x30e4`.
 * `helmet_defence` is branched (`round(herolevel * 0.5 * dval)` above id 25)
 * and `shield_defence` is flat 0 in bow mode; `ss2BattleValues` carries both.
 */
export const SS2_ARMOUR_DVAL = Object.freeze({
  breastplate: 16,
  helmet: 10,
  shinguard: 6,
  greaves: 3,
  shoulderguard: 8,
  gauntlet: 5,
  boot: 2,
  shield: 12
});

/**
 * The six vanilla condition flags. Statuses, not resources: they are booleans.
 *
 * The first four are in `death()`'s own clear order — frozen, burning, poison,
 * life_stolen — which is also `STATUS_FIELDS` in
 * `src/golden/ss2-attack-candidate.js`. This list read burning-first until an
 * adversarial verifier caught it while the docstring below claimed it was the
 * build's order. Two lists that must agree, only one of which was checked.
 */
export const SS2_DEATH_CLEAR_FLAGS = Object.freeze([
  "frozen",
  "burning",
  "poison",
  "life_stolen"
]);

/** The two taunt flags. `death()` clears these per FIELD across both sides. */
export const SS2_TAUNT_FLAGS = Object.freeze(["taunted1", "taunted2"]);

export const SS2_STATUS_FLAGS = Object.freeze([...SS2_DEATH_CLEAR_FLAGS, ...SS2_TAUNT_FLAGS]);

/**
 * `gladiator_dir` as a status token. Resources are finite numbers, so a string
 * cannot be one; status is the only per-combatant string channel that is both
 * on the view and inside the hash.
 */
export const SS2_FACING_LEFT = "facing-left";

/**
 * Every resource name this rule set reads. A blueprint that declares all of
 * them can never make the arithmetic fall back on a default.
 */
export const SS2_RESOURCE_NAMES = Object.freeze([
  "armourclass",
  "armourclass_max",
  "character_level",
  "charisma",
  "equipped_weapon",
  "herolevel",
  "max_damage",
  "min_damage",
  "secondary_weapon_enchantment_potency",
  "secondary_weapon_enchantment_type",
  "staminaleft",
  "staminamax",
  "weapon_enchantment_potency",
  "weapon_enchantment_type",
  ...SS2_ARMOUR_PIECES,
  ...SS2_ARMOUR_PIECES.map((piece) => `${piece}_defence`)
].sort());

/**
 * The resources whose absence changes the fight rather than merely defaulting
 * to the build's own zero. Checked at roster construction, not at first blow.
 *
 * Everything else on `SS2_RESOURCE_NAMES` has a defensible zero: no armour, no
 * enchantment, weapon slot 1. These four do not — `min_damage` absent means a
 * gladiator hitting for 1, which is a fight, just not this one's.
 */
export const SS2_REQUIRED_RESOURCES = Object.freeze([
  "max_damage",
  "min_damage",
  "staminaleft",
  "staminamax"
]);

/**
 * The value a resource takes when a gladiator does not state one — "no armour,
 * no enchantment, weapon slot 1, level 1".
 *
 * These are DECLARED rather than left absent, deliberately — but not for the
 * reason this comment used to give. It claimed an absent resource is invisible
 * to `combatStateHash`; that is wrong, because an absent resource is a
 * code-level fallback both peers share, and a resource declared on one peer
 * and absent on the other already changes the projection's key set and so the
 * hash. What declaring actually buys is that `defenderEffects` and
 * `phaseTransitionEffects` SKIP writes to undeclared names, so an omitted
 * `armourclass` would run the whole armour arithmetic and then silently
 * discard the result. (Corrected after a verifier broke the old reasoning.)
 *
 * The four names on `SS2_REQUIRED_RESOURCES` are absent from this table on
 * purpose: they have no defensible default, so a gladiator that omits one is
 * refused instead.
 */
export const SS2_RESOURCE_DEFAULTS = Object.freeze({
  armourclass: 0,
  armourclass_max: 0,
  character_level: 1,
  charisma: 0,
  equipped_weapon: 1,
  herolevel: 1,
  secondary_weapon_enchantment_potency: 0,
  secondary_weapon_enchantment_type: 0,
  weapon_enchantment_potency: 0,
  weapon_enchantment_type: 0,
  ...Object.fromEntries(SS2_ARMOUR_PIECES.map((piece) => [piece, 0])),
  ...Object.fromEntries(SS2_ARMOUR_PIECES.map((piece) => [`${piece}_defence`, 0]))
});

/** Resource names this rule set can write. Each write is guarded on declaration. */
export const SS2_WRITTEN_RESOURCES = Object.freeze([
  "armourclass",
  "armourclass_max",
  "staminaleft",
  ...SS2_ARMOUR_PIECES
].sort());

/* ------------------------------------------------------------------ */
/* `battlevalues`: the build's own derivation, so a blueprint need not   */
/* hand-type a derived number                                          */
/* ------------------------------------------------------------------ */

/**
 * The licensed build's `battlevalues(whichcharacter)`, root frame 35
 * `DoAction@0x3fa9dc` `+0x3062`, as a pure function.
 *
 * Two blocks, exactly as the build has them. The unconditional derivations run
 * on every call; the second block is skipped while `_global.battle_started` is
 * true, which is why staged `hitpoints` does not survive a bout and staged
 * armour does.
 *
 * Deliberately NOT reproduced: the two `experience` writes at `+0x3845` and
 * `+0x38d3`. They target `_root.game.hero` unconditionally — `register:1`,
 * never the `whichcharacter` argument — so in the build, computing a villain's
 * battle values rewrites the HERO's progression fields. That is a real hazard
 * worth knowing about (map § "Hazard"), and reproducing it in a pure function
 * would mean writing to a global. Nothing here reads those fields.
 *
 * @param {object} character  base stats and equipment ids
 * @param {object} [options]
 * @param {boolean} [options.battleStarted=false] skip the second block
 * @returns {object} a new object; the input is never mutated
 */
export function ss2BattleValues(character, { battleStarted = false } = {}) {
  const source = { ...character };
  const number = (name, fallback = 0) => {
    const value = source[name] ?? fallback;
    if (!Number.isFinite(value)) {
      throw new TeamRuleSetError(`ss2BattleValues: ${name} must be a finite number.`);
    }
    return value;
  };

  const strength = number("strength");
  const herolevel = number("herolevel", 1);
  const usingBow = source.using_bow === true;
  const derived = { ...source };

  derived.physical_size = 80 + Math.round(strength / 1.5);

  for (const piece of SS2_ARMOUR_PIECES) {
    const id = number(piece);
    const dval = SS2_ARMOUR_DVAL[piece];
    if (piece === "helmet") {
      // `+0x34eb` above id 25, `+0x34bf` at or below it. Both arms assign.
      derived.helmet_defence = id > 25 ? Math.round(herolevel * 0.5 * dval) : Math.round(id * dval);
    } else if (piece === "shield") {
      // `+0x35f7`, or the flat 0 at `+0x3623` while `using_bow` is true.
      derived.shield_defence = usingBow ? 0 : Math.round(id * dval);
    } else {
      derived[`${piece}_defence`] = Math.round(id * dval);
    }
  }

  derived.min_damage = Math.round(strength * 2) + number("weapon_min_damage");
  derived.max_damage = Math.round(strength * 2) + number("weapon_max_damage");
  derived.secondary_min_damage = Math.round(strength * 1) + number("secondary_weapon_min_damage");
  derived.secondary_max_damage = Math.round(strength * 1) + number("secondary_weapon_max_damage");
  if (usingBow) {
    // `+0x3416`: bow mode OVERWRITES the primary pair, carrying the secondary
    // pair's `round(strength * 1)` scaling rather than `round(strength * 2)`.
    derived.min_damage = derived.secondary_min_damage;
    derived.max_damage = derived.secondary_max_damage;
  }

  derived.hitpointsmax = herolevel * 10 + number("vitality") * 20;
  derived.staminamax = 100 + number("stamina") * 10;
  derived.movement_speed = clamp(Math.round(number("speed") * 1.5), 4, 60);

  if (battleStarted) return derived;

  derived.hitpoints = Math.round(derived.hitpointsmax);
  derived.armourclass_max = SS2_ARMOUR_PIECES
    .reduce((total, piece) => total + derived[`${piece}_defence`], 0);
  derived.armourclass = derived.armourclass_max;
  if (!(number("staminaleft") > 0)) derived.staminaleft = derived.staminamax;
  if (!(number("ammo_left") > 0)) derived.ammo_left = number("maximum_ammo");
  return derived;
}

/**
 * A roster-ready combatant source built from a vanilla-shaped gladiator.
 *
 * Runs `ss2BattleValues` first, so a caller supplies base stats and equipment
 * ids and the BUILD's formulas supply everything derived. Then it sorts the
 * result onto the two channels the seam actually has: numbers into
 * `resources`, the facing and the six condition flags into `status`.
 *
 * `stats.agility` is fed from SS2's `speed`. That is a rename with a caveat
 * worth stating: agility is what the RESOLVER sorts initiative by, and SS2
 * does not sort initiative at all — `changeCombatants` alternates. Turn order
 * in a team battle is the resolver's, not the build's.
 *
 * @param {object} [options]
 * @param {boolean} [options.derive=true] run `ss2BattleValues` first. Pass
 *   `false` for a record whose derived fields are ALREADY KNOWN — a promoted
 *   golden's scenario, or a state dump read off a capture — where re-deriving
 *   would overwrite measured numbers with numbers computed from inputs the
 *   record does not carry.
 */
export function ss2Combatant(
  vanilla,
  { id, name, controller, battleStarted = false, derive = true } = {}
) {
  // `derive` is a GUARD, not a convention. `ss2BattleValues` overwrites
  // `min_damage`, `max_damage`, `hitpointsmax` and `staminamax`
  // unconditionally, so running it over a promoted golden's record replaces
  // runtime-verified numbers with computed ones — a verifier measured
  // 21/23/30/110 becoming 20/20/10/100. A record that already states a derived
  // field must therefore say which it wants; silence is not an answer.
  const STATED = ["min_damage", "max_damage", "hitpointsmax", "staminamax"]
    .filter((name) => Number.isFinite(vanilla?.[name]));
  if (derive === true && STATED.length > 0 && !battleStarted) {
    throw new TeamRuleSetError(
      `ss2Combatant was asked to DERIVE a record that already states ${STATED.join(", ")}. ` +
      "battlevalues overwrites those, so a measured number would be replaced by a computed one. " +
      "Pass derive: false to keep the stated values, or remove them to derive from stats and kit."
    );
  }
  const derived = derive ? ss2BattleValues(vanilla, { battleStarted }) : { ...vanilla };
  const resources = {};
  for (const key of SS2_RESOURCE_NAMES) {
    const value = Number.isFinite(derived[key]) ? derived[key] : SS2_RESOURCE_DEFAULTS[key];
    if (Number.isFinite(value)) resources[key] = value;
  }
  // `vanillaRecordOf` falls back to `armourclass` for a missing
  // `armourclass_max`, so the default table's flat 0 would have fed the
  // arithmetic a different pool depending on which builder made the
  // combatant. Mirror the fallback here so the two agree.
  if (!Number.isFinite(derived.armourclass_max) && Number.isFinite(derived.armourclass)) {
    resources.armourclass_max = derived.armourclass;
  }
  const status = [];
  if ((derived.gladiator_dir ?? "right") === "left") status.push(SS2_FACING_LEFT);
  for (const flag of SS2_STATUS_FLAGS) if (derived[flag] === true) status.push(flag);

  const source = {
    stats: {
      strength: derived.strength ?? 0,
      agility: derived.speed ?? 0,
      attack: derived.attack ?? 0,
      defense: derived.defence ?? 0,
      vitality: derived.vitality ?? 0,
      stamina: derived.stamina ?? 0,
      magicka: derived.magicka ?? 0
    },
    resources,
    status,
    maxHealth: derived.hitpointsmax,
    health: derived.hitpoints ?? derived.hitpointsmax
  };
  if (id !== undefined) source.id = id;
  if (name !== undefined) source.name = name;
  if (controller !== undefined) source.controller = controller;
  return source;
}

/* ------------------------------------------------------------------ */
/* View -> the flat vanilla record the arithmetic consumes              */
/* ------------------------------------------------------------------ */

/**
 * Reads a resource off either shape a carrier can be in: the resolver's
 * normalised `{ value, min, max }` bag, or the blueprint shorthand where a
 * resource is a bare number. `normaliseResourceBag` accepts both, and
 * `maximumHealth` is reachable with either — the roster hands it a normalised
 * combatant, while `compareMaximumHealth` in the adapter hands it a blueprint
 * source. Reporting "missing" for a resource that is present but unnormalised
 * would send a reader to the wrong problem.
 */
function declaredResourceValue(carrier, name) {
  const entry = carrier?.resources?.[name];
  return Number.isFinite(entry) ? entry : entry?.value;
}

function assertRequiredResources(carrier, where) {
  const missing = SS2_REQUIRED_RESOURCES.filter(
    (name) => !Number.isFinite(declaredResourceValue(carrier, name))
  );
  if (missing.length === 0 && declaredResourceValue(carrier, "staminamax") <= 0) {
    // A verifier found the fixpoint: at staminamax <= 0 the forced-rest gate
    // makes `rest` the only legal action, and `rest` then writes nothing —
    // zero effects, zero rolls, no result, forever. Refused at construction,
    // because a battle that cannot change state is not a battle.
    throw new TeamRuleSetError(
      `${where} declares staminamax ${declaredResourceValue(carrier, "staminamax")}. At or below zero the ` +
      "forced-rest gate leaves rest as the only legal action and rest can change nothing, so the battle " +
      "is a fixpoint with no result. staminamax = 100 + stamina * 10 in the build, so it is never <= 0 there."
    );
  }
  if (missing.length > 0) {
    throw new TeamRuleSetError(
      `${where} does not declare the SS2 resources ${missing.join(", ")}. ` +
      "The attack arithmetic would silently default them and fight a different gladiator, so this " +
      "rule set refuses instead. Build the combatant with ss2Combatant(), or declare " +
      `resources: { ${SS2_REQUIRED_RESOURCES.join(", ")} } on the blueprint.`
    );
  }
}

/**
 * One frozen combatant view -> one FRESH MUTABLE flat vanilla record.
 *
 * The allocation is not defensive tidiness. `initialiseCombatant` assigns onto
 * its argument (`ss2-attack-candidate.js`), and the resolver hands rule sets
 * frozen views, so passing a view through would throw. Cloning the view
 * instead would be worse than throwing: `numberField` defaults every absent
 * field to 0, and a view shares no field name with the vanilla shape, so a
 * cloned view resolves to attack 0 / defence 0 / hitpointsmax 1 and returns a
 * plausible-looking fabricated kill. This translator is therefore total and
 * explicit: every field is named, and the four that matter are required.
 */
function vanillaRecordOf(view) {
  assertRequiredResources(view, `Combatant ${view.id}`);
  const status = new Set(view.status ?? []);
  const read = (name, fallback = 0) => resourceValue(view, name, fallback);
  const record = {
    attack: view.stats.attack,
    defence: view.stats.defense,
    strength: view.stats.strength,
    magicka: view.stats.magicka,
    charisma: read("charisma"),
    hitpoints: view.health,
    hitpointsmax: view.maxHealth,
    armourclass: read("armourclass"),
    armourclass_max: read("armourclass_max", read("armourclass")),
    staminaleft: read("staminaleft"),
    staminamax: read("staminamax"),
    min_damage: read("min_damage", 1),
    max_damage: read("max_damage", read("min_damage", 1)),
    character_level: read("character_level", 1),
    equipped_weapon: read("equipped_weapon", 1),
    weapon_enchantment_type: read("weapon_enchantment_type"),
    weapon_enchantment_potency: read("weapon_enchantment_potency"),
    secondary_weapon_enchantment_type: read("secondary_weapon_enchantment_type"),
    secondary_weapon_enchantment_potency: read("secondary_weapon_enchantment_potency"),
    gladiator_dir: status.has(SS2_FACING_LEFT) ? "left" : "right"
  };
  for (const piece of SS2_ARMOUR_PIECES) {
    record[piece] = read(piece);
    record[`${piece}_defence`] = read(`${piece}_defence`);
  }
  for (const flag of SS2_STATUS_FLAGS) record[flag] = status.has(flag);
  return record;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

const declaredResourceNames = (view) => new Set(Object.keys(view.resources ?? {}));

/**
 * Ordered effects for what the ingress did to the defender.
 *
 * The order is the build's own first-touch order over distinct fields —
 * `armourclass`, `armourclass_max`, the destroyed piece, `hitpoints`,
 * `staminaleft`, then the status writes — which is what `removeArmour`,
 * `damagecharacter` and the enchantment block do in sequence. Resource effects
 * are ABSOLUTE, so one write per field carrying the settled value is exact;
 * only the order between distinct fields is observable, and it is preserved.
 *
 * A resource the blueprint never declared is SKIPPED, not written: the
 * resolver refuses an undeclared name mid-list and leaves the earlier effects
 * applied, which would be a partial action with no rollback.
 */
function defenderEffects(before, after, target) {
  const declared = declaredResourceNames(target);
  const effects = [];
  const writeResourceEffect = (name) => {
    if (!declared.has(name) || before[name] === after[name]) return;
    effects.push({ kind: EffectKind.RESOURCE, targetId: target.id, resource: name, to: after[name] });
  };

  writeResourceEffect("armourclass");
  writeResourceEffect("armourclass_max");
  for (const piece of SS2_ARMOUR_PIECES) writeResourceEffect(piece);

  // Always emitted, zero included: a miss is a zero-damage effect rather than
  // an absent one, so the effect list stays a faithful record of what was
  // attempted and a UI can say "misses" instead of inventing the word.
  effects.push({
    kind: EffectKind.DAMAGE,
    targetId: target.id,
    amount: Math.max(0, before.hitpoints - after.hitpoints)
  });

  writeResourceEffect("staminaleft");
  return effects;
}

/**
 * Status transitions on BOTH sides, in the order `death()` writes them.
 *
 * `clearDeathState` walks side-then-field for the four condition flags — the
 * attacker's four, then the defender's four — and then field-then-SIDE for the
 * two taunts (`taunted1` attacker, `taunted1` defender, `taunted2` attacker,
 * `taunted2` defender). It cannot be two independent per-side passes, which is
 * what this file did until a verifier read the interleave.
 *
 * These are net changes, so a flag the death clear zeroes and the enchantment
 * then sets appears once, in the defender's group. Order is unobservable in
 * state — status writes are set-semantics and at most one is added per action —
 * so this is fidelity, not correctness. It is worth having anyway: this
 * module's whole warrant is that it reproduces measured behaviour.
 */
function statusEffects(attackerBefore, attackerAfter, defenderBefore, defenderAfter, actor, target) {
  const effects = [];
  const emit = (before, after, view, flag) => {
    if (before[flag] === after[flag]) return;
    effects.push({
      kind: EffectKind.STATUS,
      targetId: view.id,
      status: flag,
      active: after[flag] === true
    });
  };
  for (const flag of SS2_DEATH_CLEAR_FLAGS) emit(attackerBefore, attackerAfter, actor, flag);
  for (const flag of SS2_DEATH_CLEAR_FLAGS) emit(defenderBefore, defenderAfter, target, flag);
  for (const flag of SS2_TAUNT_FLAGS) {
    emit(attackerBefore, attackerAfter, actor, flag);
    emit(defenderBefore, defenderAfter, target, flag);
  }
  return effects;
}

/**
 * `nextphase`'s per-transition bookkeeping, attacker-only.
 *
 * `+0x32a1`-`+0x3304` are two consecutive unbranched statements on
 * `game_attacker.staminaleft` — the cost subtraction and the regeneration —
 * with no `game_defender` counterpart anywhere in the function, and the
 * hitpoint regeneration at `+0x3305`-`+0x3346` is attacker-only for the same
 * reason. A simulation that regenerates both sides per turn drifts from the
 * build.
 *
 * The two stamina statements are combined before a single clamp because the
 * build has no clamp between them; clamping in the middle would floor a spend
 * at zero and then add the regeneration on top, which is a different number.
 *
 * @param {number} staminaCost  the phase's `staminacost`. NEGATIVE for `rest`,
 *   where the branch sets `0 - round(stamina * 15)` and the subtraction below
 *   therefore becomes a gain.
 * @param {number} branchGain   stamina the phase branch itself added before
 *   `nextphase` ran; `rest` adds `game_attacker.stamina` at `+0x521d`.
 * @param {number} branchHeal   hitpoints the phase branch itself added before
 *   `nextphase` ran; `rest` adds `3 + ceil(game_attacker.stamina)` at
 *   `+0x51d5`, inside the same `attacker.struck == null` guard as `+0x521d`.
 *   Summed with the `nextphase` term before ONE maxHealth clamp, because the
 *   build's own clamps (`check_stats` at `+0x5266` and `+0x334d`) are both
 *   ceilings and every term here is non-negative.
 */
function phaseTransitionEffects(actor, { staminaCost, branchGain = 0, branchHeal = 0 }) {
  const declared = declaredResourceNames(actor);
  const stamina = actor.stats.stamina;
  const effects = [];
  let staminaGained = 0;

  if (declared.has("staminaleft")) {
    const before = resourceValue(actor, "staminaleft", 0);
    const maximum = resourceValue(actor, "staminamax", before);
    const after = clamp(before - staminaCost + branchGain + 1 + Math.round(stamina / 3), 0, maximum);
    staminaGained = after - before;
    if (after !== before) {
      effects.push({
        kind: EffectKind.RESOURCE,
        targetId: actor.id,
        resource: "staminaleft",
        to: after
      });
    }
  }

  const healed = Math.min(
    branchHeal + 1 + Math.ceil(stamina / 2),
    Math.max(0, actor.maxHealth - actor.health)
  );
  if (healed > 0) {
    effects.push({ kind: EffectKind.HEAL, targetId: actor.id, amount: healed });
  }
  return { effects, staminaGained, healed };
}

/* ------------------------------------------------------------------ */
/* The rule set                                                        */
/* ------------------------------------------------------------------ */

/** The 22 promoted goldens this rule set's attack ingress is checked against. */
export const SS2_GOLDEN_FIXTURE_IDS = Object.freeze([
  "golden-prisoner-normal-kill",
  "golden-prisoner-normal-kill-dir5",
  "golden-prisoner-normal-kill-dir6",
  "golden-prisoner-normal-kill-dir8",
  "golden-prisoner-power-kill-dir9",
  "golden-prisoner-power-kill-dir10",
  "golden-prisoner-power-kill-dir11",
  "golden-prisoner-power-kill-dir12",
  "golden-prisoner-quick-kill-dir1",
  "golden-prisoner-quick-kill-dir2",
  "golden-prisoner-quick-kill-dir3",
  "golden-prisoner-quick-kill-dir4",
  "golden-probe-armour-removal-gate-above",
  "golden-probe-armour-removal-gate-below",
  "golden-probe-deflection-threshold-cleared",
  "golden-probe-deflection-threshold-critical",
  "golden-probe-normal-rollneeded-hit",
  "golden-probe-normal-rollneeded-miss",
  "golden-probe-power-rollneeded-hit",
  "golden-probe-power-rollneeded-miss",
  "golden-probe-quick-rollneeded-hit",
  "golden-probe-quick-rollneeded-miss"
]);

/** Battle-map sections this rule set's arithmetic was read out of. */
export const SS2_MAP_SOURCE_REFS = Object.freeze([
  "overlay:862/frame:52/DoAction@0x240c7f/checkattackroll",
  "overlay:862/frame:52/DoAction@0x240c7f/damagecharacter",
  "overlay:862/frame:52/DoAction@0x240c7f/nextphase@+0x32a1",
  "overlay:862/frame:52/DoAction@0x240c7f/staminacost@+0x5163",
  "overlay:862/frame:52/DoAction@0x240c7f/power_attack@+0x608a",
  "overlay:862/frame:52/DoAction@0x240c7f/normal_attack@+0x61f1",
  "overlay:862/frame:52/DoAction@0x240c7f/quick_attack@+0x635c",
  "overlay:862/frame:1/turn-gating@+0x0d2e",
  "root:35/DoAction@0x3fa9dc/battlevalues@+0x3062",
  "sprite:862/frame:52/DoAction@0x23f835/villainChooseAction@+0x03e8"
]);

const FIGHT_MODES = Object.freeze(["tournament", "duel", "misc"]);

const healthRatio = (combatant) => (combatant.maxHealth > 0 ? combatant.health / combatant.maxHealth : 0);
/**
 * Locale-INDEPENDENT id comparison. `localeCompare` is ICU-locale-dependent,
 * and since every foe starts at full health the tiebreak is the common path —
 * so two peers in different locales would pick different targets and their
 * `combatStateHash` would diverge with no other cause. Found by a verifier.
 * The same construct still stands in `roster.js` (initiative) and
 * `placeholder-rules.js`; both are recorded as open items rather than changed
 * here, because initiative order is a wider blast radius than this change.
 */
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byHealthThenId = (a, b) => healthRatio(a) - healthRatio(b) || byId(a, b);

/**
 * @param {object} [options]
 * @param {"tournament"|"duel"|"misc"} [options.fightMode="tournament"]
 *   The defeat gate the arithmetic runs. `tournament` is the only mode this
 *   seam can represent; the other two are accepted so the promoted goldens
 *   (all `misc`) can be replayed through the resolver, and this rule set
 *   throws if one of them actually produces a first-blood result.
 * @param {boolean} [options.fixtureReplay=false]
 *   Required to accept a `fightMode` other than `"tournament"`. Those modes
 *   can produce a first-blood result this seam cannot represent, and the
 *   refusal costs the battle's RNG state (see the header's gap 1), so they are
 *   for replaying measured fixtures, not for play.
 * @param {(record: object) => void} [options.observer]
 *   Diagnostic sink, called once per resolved action with the arithmetic's
 *   full return. NOT battle state: it is not projected and not hashed, exactly
 *   as `battle.lastResolution` is not. It must not mutate what it is handed.
 */
export function createSs2TeamRules({ fightMode = "tournament", observer = null, fixtureReplay = false } = {}) {
  if (!FIGHT_MODES.includes(fightMode)) {
    throw new TeamRuleSetError(`fightMode must be one of: ${FIGHT_MODES.join(", ")}.`);
  }
  if (fightMode !== "tournament" && fixtureReplay !== true) {
    throw new TeamRuleSetError(
      `fightMode ${fightMode} can produce a first-blood result the team resolver cannot represent, and the ` +
      "refusal fires mid-action, after the action's RNG draws have already advanced state the resolver " +
      "cannot roll back. Pass fixtureReplay: true if you are replaying a measured fixture whose outcome is " +
      "known not to be first blood; use tournament for play."
    );
  }
  if (observer !== null && typeof observer !== "function") {
    throw new TeamRuleSetError("observer must be a function.");
  }

  // Captured rather than read off `this`: a rule set's methods are only ever
  // called as methods by the resolver today, but an unbound `resolveAction`
  // would then throw a TypeError on the error path instead of the error.
  const ruleSetId = `ss2-map-derived-${fightMode}`;

  return defineTeamRuleSet({
    // The mode is in the id because `toTeamWireState` carries only id,
    // contractVersion, verification and runtimeVerified into the hash. Two
    // peers running different defeat gates would otherwise hash identically.
    id: ruleSetId,
    verification: RuleSetVerification.MAP_DERIVED,
    provenance: {
      kind: "map-derived",
      runtimeVerified: false,
      buildSha256: SS2_BUILD_SHA256,
      mapSourceRefs: SS2_MAP_SOURCE_REFS,
      goldenFixtureIds: SS2_GOLDEN_FIXTURE_IDS,
      note:
        "SS2's own attack arithmetic, read out of the licensed build's bytecode and replayed against " +
        "22 promoted goldens for attack directions 1-12. NOT runtime-verified: no capture has observed " +
        "this module driving a fight, and the stamina economy, action legality and AI policy it adds " +
        "around the ingress have no runtime backing at all. The AI's choice among the three melee " +
        "verbs is invented; only its stamina gates are byte-decoded."
    },
    actionTypes: Object.values(Ss2ActionType),
    fightMode,

    /**
     * `hitpointsmax = herolevel * 10 + vitality * 20`, `battlevalues`
     * `+0x378e` — but ONLY as a fallback.
     *
     * A supplied gladiator's `hitpointsmax` is licensed evidence, and
     * `battle-host.js` throws outright when a rule set derives a different
     * number for a real vanilla record. So a declared `maxHealth` is returned
     * verbatim and the formula never overrules it.
     *
     * This is also the one hook the resolver calls at CONSTRUCTION, so it is
     * where the required-resource check lives: a blueprint missing `min_damage`
     * fails when the battle is built rather than on the first blow.
     */
    maximumHealth(combatant) {
      assertRequiredResources(combatant, `Combatant ${combatant.id}`);
      if (Number.isFinite(combatant.maxHealth)) return combatant.maxHealth;
      const herolevel = declaredResourceValue(combatant, "herolevel");
      if (!Number.isFinite(herolevel)) {
        throw new TeamRuleSetError(
          `Combatant ${combatant.id} declares neither maxHealth nor a herolevel resource, so ` +
          "hitpointsmax = herolevel * 10 + vitality * 20 cannot be derived."
        );
      }
      return herolevel * 10 + combatant.stats.vitality * 20;
    },

    /**
     * Three melee verbs against every living foe, plus rest.
     *
     * One gate, and it is the build's: overlay frame 1 `+0x0d2e` forces
     * `getphase("rest")` at `staminaleft <= 0`, before any player choice, so
     * at zero stamina rest is the only action there is.
     *
     * There is deliberately NO "you cannot afford this attack" gate. The build
     * has none — `nextphase` subtracts the cost and `check_stats` floors at
     * zero (`+0x114b`) — and inventing one would be a playability affordance
     * wearing measured clothes.
     *
     * Two documented widenings, because v1 models neither position nor the
     * controller frames: the build wires the three melee verbs only on
     * `closerange_warrior`, and wires `rest` only on the two long-range frames
     * and only below 50% stamina. Adding the controller-frame gate needs
     * `_root.arena.fightdistance`, for which the map records no writer at all.
     */
    legalActions(view, actorId) {
      const rest = { type: Ss2ActionType.REST, targetId: actorId };
      if (resourceValue(view.actor, "staminaleft", 0) <= 0) return [rest];
      const actions = [];
      for (const foe of view.foes) {
        actions.push({ type: Ss2ActionType.QUICK_ATTACK, targetId: foe.id });
        actions.push({ type: Ss2ActionType.NORMAL_ATTACK, targetId: foe.id });
        actions.push({ type: Ss2ActionType.POWER_ATTACK, targetId: foe.id });
      }
      actions.push(rest);
      return actions;
    },

    /**
     * Draws the direction, delegates the whole ingress to the candidate
     * arithmetic, then translates what it did into declarative effects.
     *
     * `rolls` is passed through UNWRAPPED: the resolver's per-action channel
     * exposes `randomBetween(label, min, max)` and `randomNumber(label, n)`
     * with the same signatures the arithmetic calls, so an adapter here would
     * be an identity function with a place to introduce a bug.
     */
    resolveAction(request, rolls) {
      const actor = request.actor;
      if (request.type === Ss2ActionType.REST) {
        // `staminacost = 0 - round(stamina * 15)` at `+0x5163` — negative, so
        // `nextphase`'s subtraction is a gain — plus the branch's own
        // `staminaleft += game_attacker.stamina` at `+0x521d`.
        //
        // The hitpoint gain is BOTH the branch's own `3 + ceil(stamina)`
        // (`+0x51d5`) and `nextphase`'s `1 + ceil(stamina / 2)` (`+0x3305`).
        //
        // CORRECTED 2026-09-02, and the correction is the instructive part.
        // This block previously applied only the `nextphase` term, on a
        // comment asserting that the sole offset-backed site for
        // `3 + ceil(stamina)` was `+0x684c` in the TAUNT branch. That is
        // false: `+0x51d5` is the rest branch's own, inside the same
        // `attacker.struck == null` guard as the `+0x521d` stamina write this
        // file already copied. `docs/integration/ss2-battle-map.md` said so in
        // prose and was OVERRULED by an asserted byte claim, and a test was
        // then written to pin the resulting wrong number. Two independent
        // verifiers broke it; the bytes above were then read directly. The
        // map's own writers table still lists only `+0x684c`, which is how the
        // error survived a reader who trusted the table over the prose.
        const stamina = actor.stats.stamina;
        const transition = phaseTransitionEffects(actor, {
          staminaCost: 0 - Math.round(stamina * 15),
          branchGain: stamina,
          branchHeal: 3 + Math.ceil(stamina)
        });
        return {
          effects: transition.effects,
          events: [{
            type: Ss2ActionType.REST,
            actorId: actor.id,
            targetId: actor.id,
            staminaGained: transition.staminaGained,
            healed: transition.healed
          }]
        };
      }

      const band = ATTACK_BANDS[request.type];
      if (!band) {
        throw new TeamRuleSetError(`Rule set ${ruleSetId} was asked to resolve unknown action ${request.type}.`);
      }
      const target = request.target;
      if (!target) {
        throw new TeamRuleSetError(`${request.type} needs a target; ${String(request.targetId)} is not a combatant.`);
      }

      // Drawn before anything else, matching the build: every band assigns the
      // direction before its own `checkattackroll()` call (`+0x608a` before
      // `+0x6146`, `+0x61f1` before `+0x62ad`, `+0x635c` before `+0x6418`).
      const attackDirection = rolls.randomBetween(ATTACK_DIRECTION_ROLL_LABEL, band.low, band.high);

      const hero = vanillaRecordOf(actor);
      const villain = vanillaRecordOf(target);
      const attackerBefore = { ...hero };
      const defenderBefore = { ...villain };
      const scenario = {
        attackerSide: "hero",
        attackDirection,
        fightMode,
        hero,
        villain,
        result: null
      };
      const outcome = resolveSs2PhysicalAttackCandidate(scenario, rolls);

      if (outcome.resultEvent && outcome.resultEvent.reason === "first-blood") {
        // Refused rather than dropped. `battleStanding` decides on `alive`
        // alone, so a first-blood result would end the bout in the arithmetic
        // and not in the battle — the two would disagree in silence.
        throw new TeamRuleSetError(
          `Rule set ${ruleSetId} produced a first-blood result, which the team resolver cannot represent: ` +
          "it decides elimination on health > 0 and knows nothing of hitpoints < hitpointsmax. Use " +
          "fightMode \"tournament\" for play."
        );
      }

      // THE KILLING BLOW COSTS THE ATTACKER NOTHING, and this is not a
      // simplification — it is what the build does.
      //
      // `nextphase()` is not called on the tick the attack resolves: every
      // melee branch gates it behind `attacker.struck == true` (`+0x62c3`
      // -> `+0x62e2` for normal, mirrored for quick and power), which is
      // false while the animation is still running. It fires on a LATER tick
      // of the same `onEnterFrame`. But `damagecharacter` calls `death()`
      // synchronously inside `checkattackroll`, and `death()` deletes
      // `attacker.onEnterFrame` (`+0x2035`), `defender.onEnterFrame`
      // (`+0x2042`) and the `nextphase` variable itself (`+0x2049`) — so
      // after a kill that later tick never comes.
      //
      // Found by an adversarial verifier and then re-read from the bytes.
      // Before this, the golden replay test asserted NINETEEN TIMES that the
      // attacker's stamina must DIFFER from the only measured number the
      // fixture carries for it. It now asserts they are equal.
      const eliminated = scenario.villain.hitpoints <= 0;
      const staminaCost = Math.round(actor.stats.strength * band.strengthFactor);
      const transition = eliminated
        ? { effects: [], staminaGained: 0, healed: 0 }
        : phaseTransitionEffects(actor, { staminaCost });
      const effects = [
        ...defenderEffects(defenderBefore, scenario.villain, target),
        ...statusEffects(attackerBefore, scenario.hero, defenderBefore, scenario.villain, actor, target),
        ...transition.effects
      ];

      const { calculation, mutation } = outcome;
      const events = [{
        type: request.type,
        actorId: actor.id,
        targetId: target.id,
        attackDirection,
        hit: calculation.hit,
        chance: calculation.chance,
        rollNeeded: calculation.rollNeeded,
        diceroll: calculation.diceroll,
        dispatchedMethod: calculation.dispatchedMethod ?? null,
        howDied: outcome.resultEvent?.howDied ?? null,
        damage: mutation.hitpointDamage,
        // Two different quantities, and reporting one as the other was a
        // measurable defect: `mutation.armourDamage` is the arithmetic's own
        // register, taken AFTER any armour removal, so a destroyed piece's
        // rating is not in it (a verifier measured 49 lost, 9 reported).
        armourAbsorbed: mutation.armourDamage,
        armourLost: defenderBefore.armourclass - scenario.villain.armourclass,
        armourDestroyed: mutation.armourRemovals
          .filter((removal) => removal.removed)
          .map((removal) => removal.selected),
        staminaBonus: mutation.staminaBonus,
        statusApplied: mutation.statusApplied,
        knockback: mutation.knockback === null ? null : { ...mutation.knockback },
        staminaSpent: eliminated ? 0 : staminaCost,
        staminaGained: transition.staminaGained,
        healed: transition.healed
      }];

      if (observer) {
        // Deep-cloned. The observer is diagnostic — not projected, not hashed —
        // but `outcome.mutation.knockback` and `outcome.mutation.statusApplied`
        // reach `battle.events` by reference, and `addEvent` only shallow-
        // spreads, so a mutating observer could change hashed state with no
        // hash-visible cause. Cloning costs one action's worth of JSON and
        // removes the hazard outright.
        observer(clone({
          actorId: actor.id,
          targetId: target.id,
          type: request.type,
          attackDirection,
          fightMode,
          scenario,
          outcome
        }));
      }
      return { effects, events };
    },

    /**
     * Deterministic AI. ONE of its decisions is the build's; the rest is not.
     *
     * MAP-DERIVED, and it is the only part that is: `villainChooseAction`
     * `+0x03e8` gates the entire action-choice block on `staminaleft > 10`,
     * unconditionally. Below that, this AI rests.
     *
     * INVENTED: everything else — which foe, and which of quick / normal /
     * power. The map decodes only three of the hundred `choices` bands and
     * none of them selects a melee verb, so there is nothing to be faithful
     * to. The policy is expected damage — `chance / 100` from the build's own
     * `attack_chances`, times the band's own damage term — against the weakest
     * living foe, ties broken toward the heavier attack. It reads measured
     * numbers; the way it uses them is this module's invention.
     *
     * A `staminaleft / staminamax * 100 < 40` rest gate stood here and has
     * been REMOVED as unsupported. The map places that test on ONE `choices`
     * band arm, not on every decision — and a verifier reading the bytes found
     * the map's own row conflates it with a sibling arm that pushes 30 and
     * selects `wincrowd`, not `taunt`. Generalising a band-conditional gate to
     * every decision, under a comment calling it byte-decoded, is an invented
     * number wearing a citation.
     */
    chooseAiAction(view, actorId, options) {
      const restOption = options.find((option) => option.type === Ss2ActionType.REST);
      const actor = view.actor;
      if (restOption && resourceValue(actor, "staminaleft", 0) <= 10) return restOption;

      const foes = [...view.foes].sort(byHealthThenId);
      const target = foes[0];
      if (!target) return restOption ?? options[0];

      const attacker = vanillaRecordOf(actor);
      const defender = vanillaRecordOf(target);
      const chances = calculateSs2AttackChances(attacker, defender);
      const expected = {
        [Ss2ActionType.QUICK_ATTACK]: (chances.quick / 100) * attacker.min_damage,
        [Ss2ActionType.NORMAL_ATTACK]:
          (chances.normal / 100) * ((attacker.min_damage + attacker.max_damage) / 2),
        [Ss2ActionType.POWER_ATTACK]: (chances.power / 100) * attacker.max_damage
      };
      // Ties break toward the heavier attack, deterministically.
      const preference = [
        Ss2ActionType.POWER_ATTACK,
        Ss2ActionType.NORMAL_ATTACK,
        Ss2ActionType.QUICK_ATTACK
      ];
      let best = null;
      for (const type of preference) {
        const option = options.find((entry) => entry.type === type && entry.targetId === target.id);
        if (!option) continue;
        if (best === null || expected[type] > expected[best.type]) best = option;
      }
      return best ?? restOption ?? options[0];
    }
  });
}

/** The default SS2 rule set: tournament mode, the only defeat gate this seam represents. */
export const ss2TeamRules = createSs2TeamRules();
