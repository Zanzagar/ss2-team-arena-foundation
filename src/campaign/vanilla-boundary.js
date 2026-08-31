/**
 * The data boundary between this layer and the vanilla SS2 save.
 *
 * The roadmap's Stage 5 constraint is one sentence: "Campaign saves add a
 * separate team-battle record and migration version; they do not overwrite
 * vanilla save fields while the adapter is experimental." This module is the
 * mechanism that makes the second half true by construction rather than by
 * care.
 *
 * ## Why the boundary has to be structural
 *
 * The vanilla save is not a file this project owns. `docs/integration/
 * ss2-arena-route.md` §8 records that root frame 150 calls
 * `save_character(_global.current_character)` on **every** entry to the town
 * square, which re-derives the hero, writes `so_local["character" + char_no]`
 * and flushes `SharedObject.getLocal("ss2_data")`. A leveled-gladiator route
 * therefore rewrites gold, experience, level, equipment and the battle
 * counters at least twice per fight loop, and the capture protocol's install
 * hash attests the SWF, not the SharedObject. The vanilla save is live,
 * mutable state that changes under us between sessions and that we cannot
 * fully predict. Anything we write into it we would be racing.
 *
 * So this layer is strictly additive. It records *alongside* the vanilla save,
 * never inside it, and it degrades to "no campaign data" rather than reaching
 * for a vanilla field to reconstruct itself.
 *
 * ## Three defences, in order of strength
 *
 * 1. **No API in `src/campaign/` accepts a vanilla object.** There is no read
 *    path, no write path, and no field mapping for `_root.game.hero`,
 *    `so_local`, or `ss2_data` anywhere in this directory. The illegal write
 *    has no function to call. (Compare `src/adapter/`, which *does* map the
 *    vanilla surface — that is the adapter's job and not this layer's.)
 * 2. **Every storage key is minted here.** `campaignKey()` is the only key
 *    constructor, every key it mints begins `ss2TeamArena:`, and the store
 *    re-checks the prefix at its single choke point. Vanilla's own save keys
 *    (`character1`, `max_gladiators`, …) contain no colon, so a minted key
 *    cannot collide with one even by accident.
 * 3. **Every payload is screened by name.** `assertNoVanillaFieldNames()`
 *    walks the whole record and refuses it if *any* object key anywhere in it
 *    is a name the vanilla surface uses. The catalogue is imported from
 *    `src/adapter/vanilla-fields.js` rather than copied, so the screen grows
 *    automatically as the map is extended.
 *
 * Defence 3 has a side effect that is deliberate: a campaign record cannot
 * carry a combatant's stat block, because `strength`, `attack`, `vitality`,
 * `stamina` and `magicka` are vanilla field names. That is the right answer.
 * A battle record is an outcome record, not a character sheet; the character
 * sheet belongs to vanilla and duplicating it here is exactly the coupling the
 * boundary exists to prevent.
 */

import {
  isClipResidentField,
  isKnownVanillaField,
  isTimedSpellField
} from "../adapter/vanilla-fields.js";
import { VanillaBoundaryError } from "./errors.js";

/**
 * The single root every stored key and every stored container lives under.
 *
 * Chosen to be lowerCamelCase with no underscore, because every vanilla name
 * the battle map and the route map record is either snake_case
 * (`character_name`, `max_gladiators`) or a bare word plus a digit
 * (`character1`, `inventory6`).
 */
export const CAMPAIGN_NAMESPACE = "ss2TeamArena";

/** The separator that guarantees a minted key can never look like a vanilla key. */
export const CAMPAIGN_KEY_SEPARATOR = ":";

export const CampaignKeyKind = Object.freeze({
  /** One immutable settled-battle record. */
  BATTLE: "battle",
  /** A record that failed integrity checks, preserved instead of discarded. */
  QUARANTINE: "quarantine"
});

const KEY_KINDS = new Set(Object.values(CampaignKeyKind));
const KEY_PART_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const KEY_PREFIX = `${CAMPAIGN_NAMESPACE}${CAMPAIGN_KEY_SEPARATOR}`;

/**
 * Vanilla save-container and progression names the *route* map records that
 * the battle map's per-combatant catalogue does not cover.
 *
 * Citations are sections of `docs/integration/ss2-arena-route.md`:
 * `so_local`/`ss2_data`/`characterN`/`heroDNA`/`characterDNA`/
 * `current_character` from §8 (the save-write hazard),
 * `goldpieces`/`battlesfought`/`battleswon`/`score` from the win-reward block
 * (foyer `fight_win_stuff`), `battleslost` from the loss panel
 * (`sprite:2249/frame:315`), `character_xp` and `experiencelast` from the same
 * two blocks, and `max_gladiators`/`char_to_load` from the slot screen.
 */
export const VANILLA_SAVE_CONTAINER_FIELDS = Object.freeze([
  "battlesfought",
  "battleslost",
  "battleswon",
  "char_to_load",
  "characterDNA",
  "character_xp",
  "current_character",
  "experiencelast",
  "goldpieces",
  "heroDNA",
  "max_gladiators",
  "score",
  "so_local",
  "ss2_data"
]);

const SAVE_CONTAINER_SET = Object.freeze(new Set(VANILLA_SAVE_CONTAINER_FIELDS));

/** `so_local["character" + char_no]` — the per-slot gladiator records. */
const CHARACTER_SLOT_PATTERN = /^character\d+$/;

/**
 * True for any name the vanilla surface owns: the battle map's per-combatant
 * catalogue, the unnamed timed `spell_*` fields, the clip-resident facing, the
 * route map's save-container and progression fields, and the numbered
 * character slots.
 */
export function isVanillaFieldName(name) {
  if (typeof name !== "string" || name.length === 0) return false;
  return (
    isKnownVanillaField(name) ||
    isTimedSpellField(name) ||
    isClipResidentField(name) ||
    SAVE_CONTAINER_SET.has(name) ||
    CHARACTER_SLOT_PATTERN.test(name)
  );
}

function collectVanillaNames(value, path, found, seen) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectVanillaNames(item, `${path}[${index}]`, found, seen));
    return;
  }
  for (const key of Object.keys(value)) {
    if (isVanillaFieldName(key)) found.push({ path: `${path}.${key}`, name: key });
    collectVanillaNames(value[key], `${path}.${key}`, found, seen);
  }
}

/**
 * Every vanilla field name used as an object key anywhere in `value`.
 *
 * Returns the offending paths rather than a boolean so a refusal can say
 * exactly which field it refused and where.
 */
export function vanillaFieldNamesIn(value, path = "record") {
  const found = [];
  collectVanillaNames(value, path, found, new Set());
  return found;
}

/**
 * The vanilla field names a host container carries as its *own* top-level
 * keys — the shape of a live `so_local.data`.
 *
 * Shallow on purpose: this answers "is this container the vanilla save?", not
 * "does this payload mention a vanilla field?". `vanillaFieldNamesIn()` is the
 * deep screen and answers the second question.
 */
export function vanillaFieldNamesOn(container) {
  if (container === null || typeof container !== "object" || Array.isArray(container)) return [];
  return Object.keys(container).filter((key) => isVanillaFieldName(key));
}

/**
 * The screen every write passes through. Throws rather than stripping: a
 * record that reached for a vanilla field name is a design mistake upstream,
 * and silently editing it would hide the mistake instead of stopping it.
 */
export function assertNoVanillaFieldNames(value, path = "record") {
  const found = vanillaFieldNamesIn(value, path);
  if (found.length > 0) {
    const listed = found.slice(0, 5).map((entry) => entry.path).join(", ");
    throw new VanillaBoundaryError(
      `${path} uses ${found.length} vanilla save field name(s) as keys (${listed}` +
      `${found.length > 5 ? ", …" : ""}). This layer records alongside the vanilla save, never inside it.`
    );
  }
  return value;
}

/**
 * Mints a storage key. The only key constructor in this layer.
 *
 * @param {string} kind one of `CampaignKeyKind`
 * @param {...string} parts token path segments
 */
export function campaignKey(kind, ...parts) {
  if (!KEY_KINDS.has(kind)) {
    throw new VanillaBoundaryError(
      `Unknown campaign key kind ${JSON.stringify(kind)}; expected one of ${[...KEY_KINDS].join(", ")}.`
    );
  }
  if (parts.length === 0) {
    throw new VanillaBoundaryError("A campaign key needs at least one path segment.");
  }
  for (const part of parts) {
    if (typeof part !== "string" || !KEY_PART_PATTERN.test(part)) {
      throw new VanillaBoundaryError(
        `Campaign key segment ${JSON.stringify(part)} is not a token; a key segment cannot introduce a separator.`
      );
    }
  }
  return [CAMPAIGN_NAMESPACE, kind, ...parts].join(CAMPAIGN_KEY_SEPARATOR);
}

export function isCampaignKey(key) {
  return typeof key === "string" && key.startsWith(KEY_PREFIX) && key.length > KEY_PREFIX.length;
}

/**
 * The store's choke point. Every read, write and delete goes through this, so
 * there is exactly one place to audit and it is three lines long.
 */
export function assertCampaignKey(key) {
  if (!isCampaignKey(key)) {
    throw new VanillaBoundaryError(
      `${JSON.stringify(key)} is outside the ${CAMPAIGN_NAMESPACE} namespace. ` +
      "This layer may only address keys it minted."
    );
  }
  if (isVanillaFieldName(key)) {
    throw new VanillaBoundaryError(`${JSON.stringify(key)} is a vanilla save field name.`);
  }
  return key;
}

/**
 * The kind and segments of a minted key, or `null` if it is not one of ours.
 *
 * The segment check is the load-bearing half and is deliberately the *same*
 * pattern `campaignKey()` mints against. Without it this function accepts
 * strings `campaignKey()` could never have produced — `ss2TeamArena:battle:`
 * parses to a single empty segment — and every caller that re-mints a key from
 * a parsed segment then throws. `store.readAll()` did exactly that: one
 * malformed key in the namespace cost the campaign every good record.
 * Parse and mint must agree on what a segment is, or the round trip is a lie.
 */
export function parseCampaignKey(key) {
  if (!isCampaignKey(key)) return null;
  const [namespace, kind, ...parts] = key.split(CAMPAIGN_KEY_SEPARATOR);
  if (namespace !== CAMPAIGN_NAMESPACE || !KEY_KINDS.has(kind) || parts.length === 0) return null;
  if (parts.some((part) => !KEY_PART_PATTERN.test(part))) return null;
  return Object.freeze({ kind, parts: Object.freeze(parts) });
}

/**
 * A documentation path for one key kind, built by minting a real key and
 * replacing its segments with `<placeholder>` markers.
 *
 * Built rather than written out so the separator between a record id and a
 * quarantine copy number cannot drift from the one `campaignKey()` actually
 * mints — it had drifted to a dot, and a test that checked only the prefix let
 * it through.
 */
function campaignKeyTemplate(kind, ...segmentNames) {
  return campaignKey(kind, ...segmentNames)
    .split(CAMPAIGN_KEY_SEPARATOR)
    .map((segment, index) => (index >= 2 ? `<${segment}>` : segment))
    .join(CAMPAIGN_KEY_SEPARATOR);
}

/** The documented shape of a stored battle key: `ss2TeamArena:battle:<recordId>`. */
export const BATTLE_KEY_TEMPLATE = campaignKeyTemplate(CampaignKeyKind.BATTLE, "recordId");

/** The documented shape of a quarantine key: `ss2TeamArena:quarantine:<recordId>:<n>`. */
export const QUARANTINE_KEY_TEMPLATE = campaignKeyTemplate(CampaignKeyKind.QUARANTINE, "recordId", "n");

/**
 * The documented boundary, in machine-readable form, so the prose in
 * `docs/campaign-persistence.md` and the code cannot drift apart. A test
 * asserts every entry is complete.
 */
export function describeVanillaBoundary() {
  return Object.freeze({
    namespace: CAMPAIGN_NAMESPACE,
    ours: Object.freeze([
      Object.freeze({
        path: BATTLE_KEY_TEMPLATE,
        holds: "one immutable settled team-battle record, as canonical JSON text",
        writtenBy: "src/campaign/store.js"
      }),
      Object.freeze({
        path: QUARANTINE_KEY_TEMPLATE,
        holds:
          "a record that failed its integrity check, preserved as evidence: the raw text when the stored " +
          "value was text, or a JSON envelope carrying the value's type and contents when it was not",
        writtenBy: "src/campaign/store.js"
      })
    ]),
    vanilla: Object.freeze([
      Object.freeze({
        owner: "SS2",
        surface: 'SharedObject.getLocal("ss2_data") / so_local["character" + char_no]',
        citation: "arena-route: §8 The save-write hazard",
        note: "Flushed by save_character() on every entry to the town square. Never read or written here."
      }),
      Object.freeze({
        owner: "SS2",
        surface: "_root.game.hero / _root.game.villain",
        citation: "battle-map: Combatant state objects",
        note: "The per-combatant field catalogue. Mapped by src/adapter/, never by src/campaign/."
      }),
      Object.freeze({
        owner: "SS2",
        surface: "_root.arena.gladiators.hero / .villain",
        citation: "battle-map: Battle entry and timeline ownership",
        note: "Display and animation state, including the clip-resident gladiator_dir."
      })
    ]),
    rules: Object.freeze([
      "No function in src/campaign/ accepts, reads, or writes a vanilla object.",
      "Every storage key is minted by campaignKey() and re-checked by assertCampaignKey().",
      "Every payload is screened by assertNoVanillaFieldNames() on the authoring path, before it is written.",
      "The screen never runs on the read path: stored records must not perish when the catalogue grows.",
      "createNamespacedBackend() refuses a container holding vanilla field names unless the caller opts in.",
      "A corrupt or absent campaign record degrades to no campaign data; nothing vanilla is consulted to repair it.",
      "A record from a future schema version is refused and left untouched, never rewritten or quarantined."
    ])
  });
}
