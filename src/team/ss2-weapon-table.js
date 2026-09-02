/**
 * SS2's static weapon table, transcribed from the licensed build.
 *
 * `battlevalues` does not take a gladiator's damage pair as an input. It looks
 * it up: `c.weapon_min_damage = _root["weapon" + c.weapon][3]` (`+0x31be`) and
 * `[4]` (`+0x31da`), where `_root.weapon<N>` is one of ninety six-element array
 * literals declared in a single run at `root/frame:35/DoAction@0x3fa9dc`,
 * inside a `With` whose scope object is `weapons_table`. So a gladiator's
 * damage pair IS derivable from a character record — the missing piece was
 * only ever this table.
 *
 * Until 2026-09-02 both `HANDOFF.md` and this module's own sibling said "the
 * table is not transcribed", and a ranked next step told the next session to
 * transcribe it. It had been transcribed on 2026-08-30, into
 * `docs/integration/ss2-item-tables.md` §2.3 and §2.4.
 *
 * ## What each column is, and why the display name is not here
 *
 * The literal is `Array(type, name, weight, min, max, range)`, so index `[1]`
 * is a display-name string. **Item display names are game content and are not
 * reproduced anywhere in this repository** — the boundary `ss2-item-tables.md`
 * set when it recorded the table, and the reason items are addressed by id
 * throughout the capture tooling. Index `[1]` is therefore absent below rather
 * than blanked, so nobody can mistake an empty string for a name the build
 * lacks.
 *
 * `[2]` is an index into `weaponweights` and is also the character's
 * `attack_speed` (`battlevalues` `+0x3174` and `+0x346a`). `[5]` is a range
 * multiplier, not a range: `weapon_range = physical_size + [5] * 44`
 * (`+0x3190`).
 *
 * ## How this stays honest
 *
 * This is build DATA, and the project's rule for build data is that the only
 * honest oracle is the build. So it is not checked against a doc, a fixture or
 * a golden — `node tools/item-table-transcription.mjs` re-reads the ninety
 * literals out of the installed SWF and diffs THIS MODULE and the document
 * against them, and separately confirms from `battlevalues`'s own
 * `Push <n>; GetMember` sites that the column meanings above are the build's
 * rather than a convention the transcription invented.
 *
 * The tests that ship with the repository can only check structure, because a
 * fresh clone has no licensed build. They say so where they are written; they
 * are not the guarantee. The tool is.
 *
 * Node builtins only.
 */

/**
 * One row per weapon id: `[id, type, weight, minDamage, maxDamage, rangeMultiplier]`.
 *
 * A flat array of tuples rather than objects, because it is transcribed data
 * and a diff of it should read like a diff of the build.
 */
const WEAPON_ROWS = Object.freeze([
  [0, 2, 5, 1, 3, 1],
  [1, 1, 5, 3, 9, 1],
  [2, 1, 5, 4, 16, 1],
  [3, 1, 5, 5, 25, 1],
  [4, 1, 4, 6, 36, 1],
  [5, 1, 3, 7, 49, 2],
  [6, 1, 3, 8, 64, 2],
  [7, 1, 3, 9, 81, 2],
  [8, 1, 3, 10, 100, 2],
  [9, 1, 3, 12, 144, 2],
  [10, 1, 3, 14, 196, 2],
  [11, 1, 3, 16, 256, 2],
  [12, 1, 3, 18, 324, 2],
  [13, 1, 4, 19, 361, 2],
  [14, 1, 4, 20, 400, 2],
  [15, 1, 1, 21, 441, 2],
  [16, 1, 1, 22, 484, 2],
  [17, 1, 3, 23, 529, 3],
  [18, 1, 2, 24, 576, 3],
  [19, 1, 2, 25, 625, 3],
  [20, 1, 1, 26, 676, 3],
  [21, 3, 5, 4, 16, 1],
  [22, 3, 4, 5, 20, 1],
  [23, 3, 4, 6, 24, 1],
  [24, 3, 4, 8, 32, 1],
  [25, 3, 3, 10, 40, 1],
  [26, 3, 3, 15, 60, 1],
  [27, 3, 3, 18, 72, 2],
  [28, 3, 1, 20, 80, 2],
  [29, 3, 3, 25, 100, 2],
  [30, 3, 2, 30, 120, 2],
  [31, 3, 3, 35, 140, 2],
  [32, 3, 3, 40, 160, 2],
  [33, 3, 3, 45, 180, 2],
  [34, 3, 3, 50, 200, 3],
  [35, 3, 1, 70, 240, 3],
  [36, 3, 2, 90, 280, 3],
  [37, 3, 2, 110, 320, 3],
  [38, 3, 2, 130, 360, 3],
  [39, 3, 1, 150, 400, 3],
  [40, 3, 1, 170, 440, 3],
  [41, 2, 4, 4, 12, 1],
  [42, 2, 4, 5, 15, 1],
  [43, 2, 5, 8, 24, 1],
  [44, 2, 3, 10, 30, 1],
  [45, 2, 3, 15, 45, 1],
  [46, 2, 3, 20, 60, 2],
  [47, 2, 2, 25, 75, 2],
  [48, 2, 3, 30, 90, 2],
  [49, 2, 3, 35, 105, 2],
  [50, 2, 3, 40, 120, 2],
  [51, 2, 2, 45, 135, 2],
  [52, 2, 2, 50, 150, 2],
  [53, 2, 1, 60, 180, 2],
  [54, 2, 3, 70, 210, 2],
  [55, 2, 1, 80, 250, 2],
  [56, 2, 2, 90, 270, 3],
  [57, 2, 2, 100, 30, 3],
  [58, 2, 4, 120, 360, 3],
  [59, 2, 3, 140, 420, 3],
  [60, 2, 1, 160, 480, 3],
  [61, 4, 5, 4, 16, 100],
  [62, 4, 5, 5, 25, 100],
  [63, 4, 5, 6, 36, 100],
  [64, 4, 4, 7, 49, 100],
  [65, 4, 3, 8, 64, 4],
  [66, 4, 3, 9, 81, 100],
  [67, 4, 3, 10, 100, 100],
  [68, 4, 3, 11, 121, 100],
  [69, 4, 3, 12, 144, 100],
  [70, 4, 3, 13, 169, 100],
  [71, 4, 3, 14, 196, 100],
  [72, 4, 3, 15, 225, 100],
  [73, 4, 4, 16, 256, 100],
  [74, 4, 4, 17, 289, 100],
  [75, 4, 1, 18, 324, 4],
  [76, 4, 1, 19, 361, 100],
  [77, 4, 3, 20, 400, 100],
  [78, 4, 2, 21, 441, 100],
  [79, 4, 2, 22, 484, 100],
  [80, 4, 1, 23, 529, 100],
  [201, 1, 4, 5, 19, 2],
  [202, 1, 3, 10, 30, 2],
  [203, 2, 4, 20, 80, 2],
  [204, 3, 3, 25, 100, 2],
  [205, 3, 3, 25, 100, 3],
  [206, 1, 3, 30, 110, 3],
  [207, 1, 3, 40, 150, 3],
  [210, 1, 3, 30, 300, 3],
  [220, 1, 3, 200, 800, 4],
].map((row) => Object.freeze(row)));

/**
 * Weapon ids the shop can sell: the four bands of twenty.
 *
 * `weapon0` is the starting weapon written by the `heroDNA` literal, and ids
 * 201-220 are reachable only through paths nothing here maps — the magic
 * shop's `enchant_weapon`, `unleash_hell`'s hard-coded champion DNA, and
 * `randomise_gladiator`. They are in the table because the build declares
 * them, not because anything can buy them.
 */
export const SS2_SHOP_WEAPON_IDS = Object.freeze(
  WEAPON_ROWS.map((row) => row[0]).filter((id) => id >= 1 && id <= 80)
);

/** Every weapon id the build declares, ascending. */
export const SS2_WEAPON_IDS = Object.freeze(WEAPON_ROWS.map((row) => row[0]));

const BY_ID = new Map(
  WEAPON_ROWS.map(([id, type, weight, minDamage, maxDamage, rangeMultiplier]) => [
    id,
    Object.freeze({ id, type, weight, minDamage, maxDamage, rangeMultiplier })
  ])
);

/**
 * The build's row for one weapon id, or `null` when the build declares none.
 *
 * Null rather than a throw, and null rather than a zero row: `battlevalues`
 * itself resolves `_root["weapon" + c.weapon]` and would read `undefined[3]`
 * for an id the build does not declare, so there is no build behaviour to
 * imitate here. A caller that wants a fight out of an unknown id has to decide
 * that for itself, visibly.
 */
export function ss2WeaponEntry(weaponId) {
  return BY_ID.get(weaponId) ?? null;
}

/**
 * `[weapon_min_damage, weapon_max_damage]` for one weapon id, or null.
 *
 * This is the pair `battlevalues` reads at `+0x31be` and `+0x31da`, BEFORE the
 * strength term: `min_damage = round(strength * 2) + weapon_min_damage`
 * (`+0x3356`). It is deliberately not the finished `min_damage`, so a caller
 * cannot use it as one by accident.
 */
export function ss2WeaponDamageRange(weaponId) {
  const entry = BY_ID.get(weaponId);
  return entry === undefined ? null : Object.freeze([entry.minDamage, entry.maxDamage]);
}

/**
 * `weapontypes` index -> band name (`weapontypes` at `+0x3d8c`).
 *
 * Note the index order is NOT the id order: ids 1-20 are slashing (type 1),
 * 21-40 hacking (type 3), 41-60 bashing (type 2), 61-80 ranged (type 4).
 */
export const SS2_WEAPON_TYPES = Object.freeze({
  1: "slashing",
  2: "bashing",
  3: "hacking",
  4: "ranged"
});
