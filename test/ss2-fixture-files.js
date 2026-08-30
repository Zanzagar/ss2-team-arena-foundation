/**
 * The committed 1v1 candidate fixtures, DISCOVERED from disk and classified by
 * a declared rule — not by a hand-kept roster.
 *
 * Why this file changed shape
 * ---------------------------
 * This module used to hold two literal arrays of file names, and its guard
 * asserted that the directory listing equalled their union. That made the file
 * a chokepoint: every track that authored a fixture had to edit the same list,
 * and until it did, the guard failed for a reason that had nothing to do with
 * the fixture. The list also carried no information the fixtures did not
 * already carry about themselves.
 *
 * The classification rule, stated once
 * ------------------------------------
 * A fixture declares its own ingress through its scenario's ACTION IDENTITY,
 * and `assertSs2ScenarioShape` (src/golden/run-1v1-fixture.js) already refuses
 * any fixture that does not carry exactly one of the two:
 *
 *   - `scenario.attackDirection` -> the PHYSICAL ingress
 *     (`checkattackroll` / `damagecharacter`), replayed by
 *     `resolveSs2PhysicalAttackCandidate`;
 *   - `scenario.spellId`         -> the SPELL ingress
 *     (`magic_damage_character`), replayed by
 *     `resolveSs2SpellDamageCandidate`.
 *
 * The battle map is explicit that `magic_damage_character` has no direction
 * chain (map §Spell ingress `magic_damage_character`), which is why the two
 * identities are mutually exclusive in the schema and why this rule is total
 * and disjoint by construction rather than by convention. Nothing here keys off
 * a file name or an id prefix: a fixture cannot be misfiled, only malformed,
 * and a malformed one is refused by name.
 *
 * What the guard still guards
 * ---------------------------
 * Discovery makes "a fixture on disk is missing from the list" impossible, so
 * the guard now enforces the properties that discovery does NOT give for free:
 *
 *   1. every `.json` under the fixture directory really is a valid 1v1 fixture
 *      (a stray or malformed file is named, not silently swept into a bucket);
 *   2. the file name is the fixture id, so ids and paths cannot drift apart;
 *   3. the two ingress buckets are disjoint and together cover the directory;
 *   4. NO FIXTURE IS SILENTLY UNEXERCISED — the guard itself replays every
 *      discovered fixture through the resolver its declared ingress selects.
 *      That is the property the old on-disk-versus-list assertion was really
 *      protecting, and it is now enforced here rather than depending on a
 *      downstream suite happening to import the right array.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const FIXTURE_DIRECTORY = new URL("fixtures/ss2-1v1/", import.meta.url);

/** The two ingresses a 1v1 fixture can declare. */
export const Ss2FixtureIngress = Object.freeze({
  PHYSICAL: "physical",
  SPELL: "spell"
});

export class Ss2FixtureRegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The declared classification rule, in one place.
 *
 * Mirrors the "exactly one action identity" invariant the fixture validator
 * enforces, so a fixture that would fail validation is reported here first,
 * with its file name, instead of failing far away inside a resolver.
 */
export function ss2FixtureIngress(fixture, label = fixture?.fixtureId ?? "fixture") {
  const hasAttackDirection = fixture?.scenario?.attackDirection !== undefined;
  const hasSpellId = fixture?.scenario?.spellId !== undefined;
  if (hasAttackDirection === hasSpellId) {
    throw new Ss2FixtureRegistryError(
      `${label} must carry exactly one action identity: scenario.attackDirection ` +
      "(physical ingress) or scenario.spellId (spell ingress)."
    );
  }
  return hasSpellId ? Ss2FixtureIngress.SPELL : Ss2FixtureIngress.PHYSICAL;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

async function discoverFixtures() {
  const fileNames = (await readdir(fileURLToPath(FIXTURE_DIRECTORY)))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();
  return Promise.all(fileNames.map(async (fileName) => {
    const text = await readFile(new URL(fileName, FIXTURE_DIRECTORY), "utf8");
    let fixture;
    try {
      fixture = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch (cause) {
      throw new Ss2FixtureRegistryError(`${fileName} is not parseable JSON: ${cause.message}`);
    }
    return { fileName, fixture, ingress: ss2FixtureIngress(fixture, fileName) };
  }));
}

/** Discovered once per process; the loaders below hand out clones. */
const discovered = await discoverFixtures();

const physical = discovered.filter((entry) => entry.ingress === Ss2FixtureIngress.PHYSICAL);
const spell = discovered.filter((entry) => entry.ingress === Ss2FixtureIngress.SPELL);

/**
 * Every committed 1v1 physical-attack candidate fixture file, discovered from
 * disk. Shared by the golden, observation, band, probe, and simulator suites so
 * a new fixture is exercised by all of them the moment it is committed. Every
 * entry replays through resolveSs2PhysicalAttackCandidate.
 */
export const SS2_FIXTURE_FILES = Object.freeze(physical.map((entry) => entry.fileName));

/**
 * Every committed 1v1 spell-ingress (`magic_damage_character`) candidate
 * fixture file. These share the 1v1 fixture schema but replay through
 * resolveSs2SpellDamageCandidate, not the physical resolver, so they stay a
 * separate bucket: the suites above are hard-wired to the physical resolver and
 * would reject a spell fixture.
 */
export const SS2_SPELL_FIXTURE_FILES = Object.freeze(spell.map((entry) => entry.fileName));

/** Every committed 1v1 candidate fixture file, whichever resolver replays it. */
export const SS2_ALL_FIXTURE_FILES = Object.freeze([
  ...SS2_FIXTURE_FILES,
  ...SS2_SPELL_FIXTURE_FILES
]);

export async function loadSs2Fixtures() {
  return physical.map((entry) => clone(entry.fixture));
}

export async function loadSs2SpellFixtures() {
  return spell.map((entry) => clone(entry.fixture));
}

/** Both buckets together, tagged with the ingress each one declared. */
export async function loadSs2FixtureRegistry() {
  return discovered.map((entry) => ({
    fileName: entry.fileName,
    ingress: entry.ingress,
    fixture: clone(entry.fixture)
  }));
}

// Register only when the runner executes this file directly, so the guard
// does not repeat inside every suite that imports the loader.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { runSs2OneVsOneGoldenFixture, validateSs2OneVsOneFixture } =
    await import("../src/golden/run-1v1-fixture.js");
  const { resolveSs2PhysicalAttackCandidate } =
    await import("../src/golden/ss2-attack-candidate.js");
  const { resolveSs2SpellDamageCandidate } =
    await import("../src/golden/ss2-spell-candidate.js");

  const RESOLVER_FOR_INGRESS = {
    [Ss2FixtureIngress.PHYSICAL]: resolveSs2PhysicalAttackCandidate,
    [Ss2FixtureIngress.SPELL]: resolveSs2SpellDamageCandidate
  };

  test("every committed fixture is a valid fixture whose file name is its id", () => {
    assert.ok(discovered.length > 0, "the fixture directory is empty");
    for (const { fileName, fixture } of discovered) {
      assert.equal(validateSs2OneVsOneFixture(fixture), fixture, fileName);
      assert.equal(
        fileName,
        `${fixture.fixtureId}.json`,
        "a fixture's file name must be its id, so paths and ids cannot drift apart"
      );
    }
  });

  test("the declared ingress rule partitions the directory into two disjoint buckets", async () => {
    const onDisk = (await readdir(fileURLToPath(FIXTURE_DIRECTORY)))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort();
    assert.deepEqual([...SS2_ALL_FIXTURE_FILES].sort(), onDisk, "discovery must cover the directory");
    assert.equal(
      new Set(SS2_ALL_FIXTURE_FILES).size,
      SS2_ALL_FIXTURE_FILES.length,
      "a fixture may appear in only one ingress bucket"
    );
    assert.ok(SS2_FIXTURE_FILES.length > 0 && SS2_SPELL_FIXTURE_FILES.length > 0);

    // The rule is total and disjoint because the schema forbids a fixture from
    // carrying both action identities, or neither. Re-derive it here from the
    // fixtures rather than trusting the buckets built above.
    for (const { fileName, fixture, ingress } of discovered) {
      const hasAttackDirection = fixture.scenario.attackDirection !== undefined;
      const hasSpellId = fixture.scenario.spellId !== undefined;
      assert.notEqual(hasAttackDirection, hasSpellId, `${fileName} must declare exactly one ingress`);
      assert.equal(
        ingress,
        hasSpellId ? Ss2FixtureIngress.SPELL : Ss2FixtureIngress.PHYSICAL,
        fileName
      );
    }
  });

  test("no discovered fixture is silently unexercised: each replays through its ingress resolver", () => {
    for (const { fileName, fixture, ingress } of discovered) {
      const replay = runSs2OneVsOneGoldenFixture(fixture, RESOLVER_FOR_INGRESS[ingress]);
      assert.deepEqual(replay.outcome, fixture.expected, fileName);
      assert.deepEqual(replay.trace, fixture.samples, fileName);
    }
  });

  test("the classification rule rejects a fixture that declares both or neither ingress", () => {
    const physicalFixture = physical[0].fixture;
    assert.equal(ss2FixtureIngress(physicalFixture), Ss2FixtureIngress.PHYSICAL);
    assert.equal(ss2FixtureIngress(spell[0].fixture), Ss2FixtureIngress.SPELL);

    const both = clone(physicalFixture);
    both.scenario.spellId = 30;
    assert.throws(() => ss2FixtureIngress(both, "both.json"), Ss2FixtureRegistryError);

    const neither = clone(physicalFixture);
    delete neither.scenario.attackDirection;
    assert.throws(() => ss2FixtureIngress(neither, "neither.json"), Ss2FixtureRegistryError);
  });
}
