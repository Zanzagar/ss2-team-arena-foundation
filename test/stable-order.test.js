/**
 * The locale-independence of every ordering this project's evidence depends on.
 *
 * ## What this file exists to stop happening again
 *
 * `localeCompare` is ICU-locale-dependent. Five places in this repository had
 * independently reached for it, and one of them — the capture-manifest session
 * tiebreak — sits inside the digest that all 22 promoted goldens cite as
 * `provenance.captureManifestSha256`. So two machines could mint two different,
 * equally "correct" digests for byte-identical evidence, in the one number that
 * is supposed to make a promotion reproducible.
 *
 * **None of that was caught by the suite, and it could not have been.** Every
 * id pair in the committed fixtures collates identically in every locale
 * tested, so a green run was never evidence either way — and the one test that
 * looked like it checked the manifest ordering
 * (`capture-campaign.test.js`) built its expected order with
 * `localeCompare` itself, so both sides of the assertion moved together.
 *
 * These tests therefore do NOT assert "the suite still passes". They assert the
 * property directly, against inputs chosen to make the two comparators
 * disagree. Every one of them fails if `byCodeUnit` is swapped back.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { byCodeUnit, byCodeUnitKey } from "../src/common/stable-order.js";
import { buildRoster, initiativeOrder } from "../src/team/roster.js";
import { adaptClassicFormulas } from "../src/team/placeholder-rules.js";

/**
 * Locales that actually reorder ASCII. `az-AZ` is the one that bites this
 * project's own ids: it orders 682 of the 3,655 committed sessionId pairs
 * differently from every other locale tested
 * (`node tools/stable-order-locale-census.mjs`).
 */
const LOCALES = ["en-US", "az-AZ", "haw-US", "cs-CZ", "tr-TR", "lt-LT", "et-EE"];

const rosterUrl = new URL("../src/team/roster.js", import.meta.url).href;
const placeholderUrl = new URL("../src/team/placeholder-rules.js", import.meta.url).href;
const buildManifestUrl = new URL("../tools/runtime-capture/build-manifest.mjs", import.meta.url).href;
const promoteUrl = new URL("../src/golden/promote-1v1-golden.js", import.meta.url).href;
const observationUrl = new URL("../src/golden/observation.js", import.meta.url).href;
const sampleObservationPath = fileURLToPath(new URL("./observations/ss2-1v1/obs-par2.json", import.meta.url));

test("byCodeUnit is a total order and agrees with itself in every locale", () => {
  const ids = ["session-a", "session-B", "session-ch1", "session-c1", "session-q", "session-x"];
  const expected = [...ids].sort(byCodeUnit);
  for (const locale of LOCALES) {
    // The point is that `byCodeUnit` does not consult the locale at all, so
    // running the same sort under a locale-aware collator must not change it.
    const underLocale = [...ids].sort(byCodeUnit);
    assert.deepEqual(underLocale, expected, `byCodeUnit moved under ${locale}`);
  }
  assert.equal(byCodeUnit("a", "a"), 0);
  assert.equal(byCodeUnit("a", "b"), -1);
  assert.equal(byCodeUnit("b", "a"), 1);
});

test("the ids this project actually commits are ones ICU DOES reorder", () => {
  // A guard against the test above going vacuous. If no pair in this list ever
  // diverges, these tests prove nothing, so pin a pair that does.
  const [left, right] = ["session-pr-normal-rollneeded-hit-30", "session-pr-quick-rollneeded-hit-1"];
  assert.equal(byCodeUnit(left, right), -1);
  assert.equal(
    Math.sign(left.localeCompare(right, "az-AZ")),
    1,
    "az-AZ no longer reorders this pair; pick another or the locale tests are vacuous"
  );
});

test("byCodeUnitKey orders objects by the named field", () => {
  const rows = [{ id: "b" }, { id: "A" }, { id: "a" }];
  assert.deepEqual(rows.slice().sort(byCodeUnitKey("id")).map((r) => r.id), ["A", "a", "b"]);
});

/**
 * The case difference is real and is NOT a bug to paper over — `byCodeUnit`
 * puts `"Beta"` before `"alpha"` where en-US collation does the opposite. It is
 * pinned here so that a future reader who "fixes" it by case-folding has to
 * delete an assertion that says why, rather than quietly changing an ordering
 * that reaches a sealed campaign record.
 */
test("initiative tiebreak is by code unit, so uppercase ids sort first", () => {
  const { teams } = buildRoster({
    teams: [
      { id: "red", combatants: [{ id: "alpha", stats: { agility: 5 } }] },
      { id: "blue", combatants: [{ id: "Beta", stats: { agility: 5 } }] }
    ],
    rules: stubRules()
  });
  assert.deepEqual(initiativeOrder(teams), ["Beta", "alpha"]);
  // ...and that is exactly where en-US collation disagrees, which is the whole
  // reason the comparator had to be pinned rather than left to the platform.
  assert.deepEqual(["alpha", "Beta"].slice().sort((a, b) => a.localeCompare(b, "en-US")), ["alpha", "Beta"]);
});

/**
 * The two tests above discriminate `byCodeUnit` from en-US collation. Neither
 * can discriminate it from az-AZ collation, because the ASSERTIONS run in this
 * process and this process is en-US — which is exactly the saturation trap this
 * project keeps rediscovering. Measured while writing them: restoring
 * `localeCompare` at both consumer sites left the locale-named tests GREEN.
 *
 * So the locale claim is tested the only way it can be — by running the real
 * code in a child process whose default collation actually differs. Node
 * resolves its default locale from the environment (verified: `LC_ALL=az-AZ`
 * makes `Intl.DateTimeFormat().resolvedOptions().locale` report `az-AZ`, and
 * flips the sign of `localeCompare` on the pair below).
 */
test("initiative and target order are identical under az-AZ collation", () => {
  const ids = ["session-pr-normal-rollneeded-hit-30", "session-pr-quick-rollneeded-hit-1"];
  const script = `
    import { buildRoster, initiativeOrder } from ${JSON.stringify(rosterUrl)};
    import { adaptClassicFormulas } from ${JSON.stringify(placeholderUrl)};
    const ids = ${JSON.stringify(ids)};
    if (Intl.DateTimeFormat().resolvedOptions().locale !== "az-AZ") {
      throw new Error("child did not adopt az-AZ; this test would be vacuous");
    }
    if (Math.sign(ids[0].localeCompare(ids[1])) !== 1) {
      throw new Error("az-AZ no longer reorders this pair; the test is vacuous");
    }
    const { teams } = buildRoster({
      teams: [
        { id: "red", combatants: [{ id: ids[0], stats: { agility: 5 } }] },
        { id: "blue", combatants: [{ id: ids[1], stats: { agility: 5 } }] }
      ],
      rules: { maximumHealth: () => 10 }
    });
    const rules = adaptClassicFormulas({
      maximumHealth: () => 10, hitChance: () => 1, damage: () => 1,
      spellDamage: () => 1, spellHealing: () => 1, restRecovery: () => 1
    });
    const foes = ids.map((id) => ({ id, health: 10, maxHealth: 10, alive: true }));
    const actor = { id: "actor", health: 10, maxHealth: 10, alive: true, stats: { magicka: 0, stamina: 5 } };
    const chosen = rules.chooseAiAction({ actor, allies: [actor], foes }, actor.id,
      foes.map((foe) => ({ type: "melee", actorId: actor.id, targetId: foe.id })));
    process.stdout.write(JSON.stringify({ initiative: initiativeOrder(teams), target: chosen.targetId }));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "az-AZ", LANG: "az-AZ", LANGUAGE: "az-AZ" }
  });
  assert.equal(child.status, 0, `child failed: ${child.stderr}`);
  const result = JSON.parse(child.stdout);
  // Both must match what this en-US process produces. Under `localeCompare`
  // they do not: the child reverses both.
  assert.deepEqual(result.initiative, ids, "initiative order changed under az-AZ");
  assert.equal(result.target, ids[0], "AI target changed under az-AZ");
});

/**
 * THE SITE THAT MATTERS MOST, AND THE ONE NOTHING GUARDED.
 *
 * `build-manifest.mjs` breaks session-ordering ties on `sessionId`, and the
 * session array's order is inside the digest that all 22 promoted goldens cite
 * as `provenance.captureManifestSha256`. A locale-dependent tiebreak there
 * means two machines mint two different digests for byte-identical evidence.
 *
 * Measured while writing this: reverting that one line to `localeCompare` and
 * running the whole of `capture-campaign.test.js` under `LC_ALL=az-AZ` passed
 * 76 of 76. The defect was invisible to the suite, because the tiebreak is only
 * REACHED on an exact `observedAt` tie and the two ties in the committed corpus
 * happen to involve ids az-AZ does not reorder.
 *
 * So this test manufactures the reachable case: two sessions at the SAME
 * instant whose ids az-AZ orders differently, and asserts the digest matches
 * across locales. It fails if the tiebreak goes back to `localeCompare`.
 */
test("a capture manifest digest does not depend on the machine's locale", () => {
  const script = `
    import { readFileSync } from "node:fs";
    import { buildSs2CaptureManifest } from ${JSON.stringify(buildManifestUrl)};
    import { computeSs2CaptureManifestDigest } from ${JSON.stringify(promoteUrl)};
    import { computeSs2ObservationDigest } from ${JSON.stringify(observationUrl)};
    const base = JSON.parse(readFileSync(${JSON.stringify(sampleObservationPath)}, "utf8"));
    // Two sessions, same instant, ids az-AZ reorders. Everything else identical,
    // so the digest can only move if the ORDER moves.
    const at = "2026-08-30T21:29:43Z";
    const make = (observationId, sessionId) => {
      const copy = structuredClone(base);
      copy.observationId = observationId;
      copy.capture.sessionId = sessionId;
      copy.capture.observedAt = at;
      // The record is tamper-evident: its own digest covers these fields, so a
      // rewritten copy has to be re-digested rather than forged. That check is
      // doing its job here, which is why it is recomputed and not bypassed.
      copy.digest = computeSs2ObservationDigest(copy);
      return copy;
    };
    const records = [
      make("obs-order-a", "session-pr-quick-rollneeded-hit-1"),
      make("obs-order-b", "session-pr-normal-rollneeded-hit-30")
    ];
    const { manifest, digest } = buildSs2CaptureManifest(records, { createdAt: at });
    process.stdout.write(JSON.stringify({
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      order: manifest.sessions.map((s) => s.sessionId),
      digest,
      // Recomputed independently of the builder's own return, so a builder that
      // stopped hashing the order would not silently pass this test.
      recomputed: computeSs2CaptureManifestDigest(manifest)
    }));
  `;
  const run = (env) => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, ...env }
    });
    assert.equal(child.status, 0, `child failed: ${child.stderr}`);
    return JSON.parse(child.stdout);
  };
  const enUS = run({ LC_ALL: "en-US", LANG: "en-US", LANGUAGE: "en-US" });
  const azAZ = run({ LC_ALL: "az-AZ", LANG: "az-AZ", LANGUAGE: "az-AZ" });

  assert.equal(enUS.locale, "en-US", "the en-US child did not adopt its locale; test would be vacuous");
  assert.equal(azAZ.locale, "az-AZ", "the az-AZ child did not adopt its locale; test would be vacuous");
  // Vacuity guard: az-AZ must DISAGREE with the code-unit order, i.e. it would
  // put the second id first. If ICU ever stops reordering this pair the test
  // proves nothing, and it should say so rather than pass quietly.
  assert.equal(
    Math.sign(enUS.order[0].localeCompare(enUS.order[1], "az-AZ")),
    1,
    "az-AZ no longer reorders this id pair; choose another or this test is vacuous"
  );
  assert.deepEqual(azAZ.order, enUS.order, "session order moved between locales");
  assert.equal(azAZ.digest, enUS.digest, "manifest digest moved between locales");
  assert.equal(azAZ.digest, azAZ.recomputed);
  assert.equal(enUS.digest, enUS.recomputed);
});

/** Minimal rule set: only what `buildTeams` calls. */
function stubRules() {
  return { maximumHealth: () => 10 };
}

/** Minimal classic-formula object: exactly the six names the adapter requires. */
function classicStub() {
  return {
    maximumHealth: () => 10,
    hitChance: () => 1,
    damage: () => 1,
    spellDamage: () => 1,
    spellHealing: () => 1,
    restRecovery: () => 1
  };
}
