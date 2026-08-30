import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Every committed 1v1 candidate fixture; shared by the golden, observation,
 * and simulator suites so a new fixture is exercised by all three. */
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
  "candidate-duel-absorbed-normal-hit.json"
];

export async function loadSs2Fixtures() {
  return Promise.all(SS2_FIXTURE_FILES.map(async (fileName) => {
    const contents = await readFile(
      new URL(`fixtures/ss2-1v1/${fileName}`, import.meta.url),
      "utf8"
    );
    return JSON.parse(contents);
  }));
}

// Register only when the runner executes this file directly, so the guard
// does not repeat inside every suite that imports the loader.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  test("every committed candidate fixture is registered in the shared list", async () => {
    const directory = fileURLToPath(new URL("fixtures/ss2-1v1/", import.meta.url));
    const onDisk = (await readdir(directory))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort();
    assert.deepEqual(onDisk, [...SS2_FIXTURE_FILES].sort());
  });
}
