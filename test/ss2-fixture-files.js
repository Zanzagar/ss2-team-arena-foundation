import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Every committed 1v1 physical-attack candidate fixture; shared by the
 * golden, observation, and simulator suites so a new fixture is exercised by
 * all three. Every entry must replay through
 * resolveSs2PhysicalAttackCandidate. */
export const SS2_FIXTURE_FILES = [
  "candidate-normal-threshold-hit.json",
  "candidate-normal-miss-roll-order.json",
  "candidate-armour-overflow-burning.json",
  "candidate-armour-equality-quirk.json",
  "candidate-lethal-result.json",
  "candidate-quick-threshold-profile.json",
  "candidate-power-critical-armour-bypass.json",
  "candidate-taunt-charisma-floor.json",
  "candidate-armour-removal-debris.json",
  "candidate-grievous-knockback.json",
  "candidate-snipe-shield-boost.json",
  "candidate-deflection-threshold-discriminator.json",
  "candidate-frozen-enchantment-proc.json",
  "candidate-bash-inherited-critical.json",
  "candidate-bombard-threshold.json",
  "candidate-duel-absorbed-normal-hit.json",
  "candidate-duel-firstblood-normal-kill.json",
  "candidate-prisoner-normal-kill.json",
  "candidate-prisoner-normal-kill-dir8.json",
  "candidate-prisoner-normal-kill-dir6.json",
  "candidate-prisoner-normal-kill-dir5.json",
  "candidate-prisoner-power-kill-dir9.json",
  "candidate-prisoner-power-kill-dir10.json",
  "candidate-prisoner-power-kill-dir11.json",
  "candidate-prisoner-power-kill-dir12.json",
  "candidate-prisoner-quick-kill-dir1.json",
  "candidate-prisoner-quick-kill-dir2.json",
  "candidate-prisoner-quick-kill-dir3.json",
  "candidate-prisoner-quick-kill-dir4.json",
  // Discriminating probe pairs (see test/ss2-probe-fixtures.test.js). Each
  // pair's two arms are staged identically except for one injected value, and
  // are designed so the arms differ in a channel a runtime capture genuinely
  // OBSERVES — the dispatched event, the ordered mutation trace, the final
  // state, or the number of draws — never merely in an echoed sample value.
  "candidate-probe-normal-rollneeded-miss.json",
  "candidate-probe-normal-rollneeded-hit.json",
  "candidate-probe-power-rollneeded-miss.json",
  "candidate-probe-power-rollneeded-hit.json",
  "candidate-probe-quick-rollneeded-miss.json",
  "candidate-probe-quick-rollneeded-hit.json",
  "candidate-probe-deflection-threshold-critical.json",
  "candidate-probe-deflection-threshold-cleared.json",
  "candidate-probe-armour-removal-gate-below.json",
  "candidate-probe-armour-removal-gate-above.json"
];

/**
 * Every committed 1v1 spell-ingress (`magic_damage_character`) candidate
 * fixture. These share the 1v1 fixture schema but replay through
 * resolveSs2SpellDamageCandidate, not the physical resolver, so they are a
 * separate list: the golden/observation/simulator suites above are hard-wired
 * to the physical resolver and would reject a spell fixture. The on-disk guard
 * at the bottom of this file checks both lists together.
 */
export const SS2_SPELL_FIXTURE_FILES = [
  "candidate-spell-fireball-armour-absorbed.json",
  "candidate-spell-breastplate-stamina-absorbed.json",
  "candidate-spell-armour-equality-quirk.json",
  "candidate-spell-armour-overflow-remainder.json",
  "candidate-spell-armour-depleted-full-damage.json",
  "candidate-spell-raw-fractional-damage.json",
  "candidate-spell-first-blood-duel.json",
  "candidate-spell-lethal-slain.json"
];

/** Every committed 1v1 candidate fixture, whichever resolver replays it. */
export const SS2_ALL_FIXTURE_FILES = [...SS2_FIXTURE_FILES, ...SS2_SPELL_FIXTURE_FILES];

async function loadFixtureFiles(fileNames) {
  return Promise.all(fileNames.map(async (fileName) => {
    const contents = await readFile(
      new URL(`fixtures/ss2-1v1/${fileName}`, import.meta.url),
      "utf8"
    );
    return JSON.parse(contents);
  }));
}

export async function loadSs2Fixtures() {
  return loadFixtureFiles(SS2_FIXTURE_FILES);
}

export async function loadSs2SpellFixtures() {
  return loadFixtureFiles(SS2_SPELL_FIXTURE_FILES);
}

// Register only when the runner executes this file directly, so the guard
// does not repeat inside every suite that imports the loader.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  test("every committed candidate fixture is registered in exactly one shared list", async () => {
    const directory = fileURLToPath(new URL("fixtures/ss2-1v1/", import.meta.url));
    const onDisk = (await readdir(directory))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort();
    assert.deepEqual(onDisk, [...SS2_ALL_FIXTURE_FILES].sort());
    assert.equal(
      new Set(SS2_ALL_FIXTURE_FILES).size,
      SS2_ALL_FIXTURE_FILES.length,
      "a fixture may appear in only one resolver list"
    );
  });
}
