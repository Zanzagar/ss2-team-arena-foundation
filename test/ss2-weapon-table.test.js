/**
 * What a committed test CAN prove about transcribed build data, and what it
 * cannot.
 *
 * `src/team/ss2-weapon-table.js` is ninety rows read out of the licensed
 * build's bytecode. **The oracle for those numbers is the build, and a fresh
 * clone does not have it** — so the check that actually matters is
 * `node tools/item-table-transcription.mjs`, which re-reads every literal and
 * every `battlevalues` reader index from the installed SWF and diffs both the
 * module and `docs/integration/ss2-item-tables.md` against them.
 *
 * This file deliberately does NOT try to stand in for that. The project has
 * already been burned once by an oracle computed from the table under test:
 * five of the eight `SS2_ARMOUR_DVAL` constants could be set to 500 with the
 * suite green, because every assertion about them was derived from them.
 *
 * So what is asserted here is only what is checkable WITHOUT the build, and
 * each assertion is a structural invariant that a corrupted or truncated
 * transcription violates:
 *
 * - the id set is exactly the ninety the build declares, by name;
 * - the band-to-type mapping holds across all eighty shop ids — an invariant
 *   `ss2-item-tables.md` §2.2 established from two independent directions
 *   (every literal's `[0]`, and the frame labels the ids sit on), so it is not
 *   a restatement of the rows themselves;
 *   ► **and it is the weakest assertion here, because both it and the rows
 *     come from the same transcription. It catches a scrambled or partial
 *     table. It cannot catch a table that is wrong the same way twice.**
 * - damage is ordered and positive, so a swapped min/max column fails;
 * - the module is frozen, so a caller cannot mutate build data in place.
 *
 * A mutation for each is named at its assertion, and each was run.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SS2_SHOP_WEAPON_IDS,
  SS2_WEAPON_IDS,
  SS2_WEAPON_TYPES,
  ss2WeaponDamageRange,
  ss2WeaponEntry
} from "../src/team/ss2-weapon-table.js";

/**
 * The exact ids, written out rather than counted.
 *
 * A count assertion (`length === 90`) passes on ninety WRONG ids, and the ids
 * are not contiguous — 0, then 1-80, then seven, then 210 and 220 — so a
 * range check would not catch a missing off-shop id either.
 */
const EXPECTED_IDS = Object.freeze([
  0,
  ...Array.from({ length: 80 }, (_, index) => index + 1),
  201, 202, 203, 204, 205, 206, 207, 210, 220
]);

test("the table carries exactly the ids the build declares", () => {
  // Mutation: delete any row, or change 220 to 221. Both fail by naming the id.
  assert.deepEqual(SS2_WEAPON_IDS, EXPECTED_IDS);
  assert.deepEqual(SS2_SHOP_WEAPON_IDS, EXPECTED_IDS.filter((id) => id >= 1 && id <= 80));
  assert.equal(SS2_SHOP_WEAPON_IDS.length, 80, "the shop bands are four twenties");
});

test("every shop id's type matches its band, in the build's own order", () => {
  // ss2-item-tables.md §2.2: ids 1-20 are slashing (type 1), 21-40 hacking (3),
  // 41-60 bashing (2), 61-80 ranged (4) — note the type indices are NOT in id
  // order, which is exactly the sort of detail a careless transcription
  // straightens out.
  //
  // Mutation: swap the 2 and the 3 below, or change one row's `[0]`. Both fail
  // and name the id.
  const bandType = (id) => (id <= 20 ? 1 : id <= 40 ? 3 : id <= 60 ? 2 : 4);
  const wrong = SS2_SHOP_WEAPON_IDS.filter((id) => ss2WeaponEntry(id).type !== bandType(id));
  assert.deepEqual(wrong, [], "shop ids whose type does not match their band");

  // Vacuity guard: if `ss2WeaponEntry` ever returned a constant, the filter
  // above would be empty for a table of anything at all.
  assert.equal(new Set(SS2_SHOP_WEAPON_IDS.map((id) => ss2WeaponEntry(id).type)).size, 4);
  assert.deepEqual(Object.keys(SS2_WEAPON_TYPES).map(Number).sort(), [1, 2, 3, 4]);
});

/**
 * The one weapon whose damage pair is inverted IN THE BUILD.
 *
 * `weapon57` is `min 100, max 30` at `+0x473c`, and it is not a transcription
 * slip — `ss2-item-tables.md` §7 records it as anomaly 1, and this file's first
 * draft asserted `max >= min` across the table and FAILED on exactly this id.
 * That is the assertion working: it found real build data that contradicts the
 * obvious invariant.
 *
 * It is pinned by value rather than skipped, because the standing rule is to
 * reproduce the build and never to smooth it. `randomBetween(min, max)` with
 * these operands returns `100 + floor(random() * -69)`, so a gladiator holding
 * id 57 rolls damage BELOW its minimum — which is a fight, and the build's
 * fight.
 */
const BUILD_INVERTED_DAMAGE_IDS = Object.freeze([57]);

test("damage columns are positive and ordered, except where the build is not", () => {
  // Mutation: swap `[3]` and `[4]` in the module's row generator — every row
  // where min < max reverses and this fails with a list.
  const broken = SS2_WEAPON_IDS.filter((id) => {
    const { minDamage, maxDamage } = ss2WeaponEntry(id);
    if (!(Number.isInteger(minDamage) && Number.isInteger(maxDamage)) || minDamage < 1 || maxDamage < 1) return true;
    return maxDamage < minDamage && !BUILD_INVERTED_DAMAGE_IDS.includes(id);
  });
  assert.deepEqual(broken, [], "ids whose damage pair is non-integer, non-positive or unexpectedly reversed");

  // The allowance is pinned to its values, so it cannot quietly cover a second
  // id later, and so a transcription that "fixed" 57 fails here.
  assert.deepEqual(ss2WeaponDamageRange(57), [100, 30], "weapon 57's inverted pair is the build's, and must survive");
  const alsoInverted = SS2_WEAPON_IDS.filter((id) => {
    const { minDamage, maxDamage } = ss2WeaponEntry(id);
    return maxDamage < minDamage;
  });
  assert.deepEqual(alsoInverted, [...BUILD_INVERTED_DAMAGE_IDS], "the set of inverted ids changed");

  // And the pair is not degenerate across the table: a table of identical rows
  // would satisfy every assertion above.
  const spans = new Set(SS2_WEAPON_IDS.map((id) => ss2WeaponEntry(id).maxDamage - ss2WeaponEntry(id).minDamage));
  assert.ok(spans.size > 20, `only ${spans.size} distinct damage spans; the table looks degenerate`);
});

test("ss2WeaponDamageRange returns the pre-strength pair, and null off the table", () => {
  // The pair `battlevalues` reads at +0x31be / +0x31da, BEFORE the
  // `round(strength * 2)` term — id 24 is the worked example the map and the
  // item tables both quote.
  assert.deepEqual(ss2WeaponDamageRange(24), [8, 32]);
  assert.deepEqual(ss2WeaponEntry(24), { id: 24, type: 3, weight: 4, minDamage: 8, maxDamage: 32, rangeMultiplier: 1 });

  // An id the build does not declare is null, not a zero row: there is no build
  // behaviour to imitate, because `_root["weapon" + c.weapon]` would be
  // undefined and `battlevalues` would read `undefined[3]`.
  // Mutation: return a zero row instead — this fails.
  assert.equal(ss2WeaponEntry(999), null);
  assert.equal(ss2WeaponDamageRange(999), null);
  assert.equal(ss2WeaponEntry(81), null, "81 is between the shop bands and the off-shop ids");
});

test("the table is frozen, so build data cannot be edited in place", () => {
  // Mutation: drop the Object.freeze calls — this fails.
  assert.throws(() => { SS2_WEAPON_IDS.push(999); }, TypeError);
  const entry = ss2WeaponEntry(24);
  assert.throws(() => { entry.minDamage = 1; }, TypeError);
  assert.equal(ss2WeaponEntry(24).minDamage, 8, "the entry survived the attempted write");
});
