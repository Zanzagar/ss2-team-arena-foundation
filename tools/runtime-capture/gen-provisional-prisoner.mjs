/**
 * Regenerates captures/provisional-prisoner-kill.json — the tape-carrier
 * for the deterministic tutorial-prisoner capture (see HANDOFF.md). The
 * scenario is the operator's gladiator "John Ringler" and the constant
 * all-zero prisoner, both transcribed from live state dumps. Provisional
 * fixtures live in ignored captures/ and are never committed; the real
 * candidate is authored from the capture afterwards.
 *
 * Usage: node tools/runtime-capture/gen-provisional-prisoner.mjs
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const mod = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const { createOrderedRollTape } = await mod("src/golden/ordered-rolls.js");
const { resolveSs2PhysicalAttackCandidate } = await mod("src/golden/ss2-attack-candidate.js");
const { validateSs2OneVsOneFixture } = await mod("src/golden/run-1v1-fixture.js");

const between = (label, min, max, value) => ({ label, source: "randomBetween", min, max, value });
const fixture = {
  schemaVersion: 1,
  kind: "ss2-1v1-fixture",
  fixtureId: "provisional-prisoner-kill",
  classification: "candidate",
  build: {
    fingerprintSchemaVersion: 1,
    steamBuildId: 24807725,
    ss2Sha256: "77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA"
  },
  provenance: {
    kind: "synthetic-static-map",
    runtimeVerified: false,
    sourceRefs: ["overlay:862/frame:52/DoAction@0x240c7f/checkattackroll"]
  },
  scenario: {
    attackerSide: "hero", attackDirection: 5, fightMode: "misc", result: null,
    hero: {
      attack: 1, defence: 1, strength: 10, charisma: 1, magicka: 1,
      min_damage: 21, max_damage: 23,
      hitpoints: 30, hitpointsmax: 30, staminaleft: 110, staminamax: 110,
      armourclass: 0, armourclass_max: 0, gladiator_dir: "right"
    },
    villain: {
      attack: 0, defence: 0, strength: 0, charisma: 0, magicka: 0,
      min_damage: 1, max_damage: 3,
      hitpoints: 10, hitpointsmax: 10, staminaleft: 100, staminamax: 100,
      armourclass: 0, armourclass_max: 0, gladiator_dir: "left"
    }
  },
  samples: [
    between("hit-roll", 1, 100, 50),
    between("normal-damage-roll", 21, 23, 22),
    between("normal-critical-roll", 1, 20, 7),
    between("critical-deflection-roll", 1, 100, 42),
    between("armour-removal-roll", 1, 100, 12),
    between("knockback-roll", 1, 4, 1),
    between("enchantment-potency-roll", 1, 100, 100)
  ],
  expected: null
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const tape = createOrderedRollTape(fixture.samples);
fixture.expected = resolveSs2PhysicalAttackCandidate(clone(fixture.scenario), tape);
tape.finish();
validateSs2OneVsOneFixture(fixture);
const outPath = path.join(REPO, "captures", "provisional-prisoner-kill.json");
await writeFile(outPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
console.log(`result: ${JSON.stringify(fixture.expected.resultEvent)}`);
