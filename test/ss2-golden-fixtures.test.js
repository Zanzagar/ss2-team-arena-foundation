import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  GoldenClassification,
  GoldenProvenance,
  runSs2OneVsOneGoldenFixture,
  validateSs2OneVsOneFixture
} from "../src/golden/run-1v1-fixture.js";
import { resolveSs2PhysicalAttackCandidate } from "../src/golden/ss2-attack-candidate.js";
import { matchSs2ObservationToFixture, validateSs2Observation } from "../src/golden/observation.js";

const GOLDEN_DIR = fileURLToPath(new URL("fixtures/ss2-1v1-golden/", import.meta.url));
const OBSERVATION_DIR = fileURLToPath(new URL("observations/ss2-1v1/", import.meta.url));

async function loadJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

const goldenFiles = (await readdir(GOLDEN_DIR)).filter((name) => name.endsWith(".json"));
const observationFiles = (await readdir(OBSERVATION_DIR)).filter((name) => name.endsWith(".json"));
const observations = await Promise.all(
  observationFiles.map((name) => loadJson(path.join(OBSERVATION_DIR, name)))
);

test("runtime goldens exist and carry licensed-observation provenance", async () => {
  assert.ok(goldenFiles.length > 0, "no promoted goldens yet");
  for (const name of goldenFiles) {
    const golden = await loadJson(path.join(GOLDEN_DIR, name));
    assert.equal(validateSs2OneVsOneFixture(golden), golden);
    assert.equal(golden.classification, GoldenClassification.GOLDEN);
    assert.equal(golden.provenance.kind, GoldenProvenance.LICENSED);
    assert.equal(golden.provenance.runtimeVerified, true);
    assert.ok(golden.provenance.repetitions >= 2);
    assert.equal(golden.provenance.observationIds.length, golden.provenance.repetitions);
    assert.equal(golden.provenance.observationDigests.length, golden.provenance.repetitions);
    assert.match(golden.provenance.captureManifestSha256, /^[a-f0-9]{64}$/);
  }
});

test("every golden replays exactly through the isolated resolver", async () => {
  for (const name of goldenFiles) {
    const golden = await loadJson(path.join(GOLDEN_DIR, name));
    const replay = runSs2OneVsOneGoldenFixture(golden, resolveSs2PhysicalAttackCandidate);
    assert.deepEqual(replay.outcome, golden.expected);
  }
});

test("each golden's cited observations exist, validate and still match it", async () => {
  const byId = new Map(observations.map((observation) => [observation.observationId, observation]));
  for (const name of goldenFiles) {
    const golden = await loadJson(path.join(GOLDEN_DIR, name));
    const sessions = new Set();
    golden.provenance.observationIds.forEach((observationId, index) => {
      const observation = byId.get(observationId);
      assert.ok(observation, `golden ${golden.fixtureId} cites missing observation ${observationId}`);
      assert.equal(validateSs2Observation(observation), observation);
      assert.equal(observation.digest, golden.provenance.observationDigests[index]);
      assert.equal(matchSs2ObservationToFixture(golden, observation).match, true);
      sessions.add(observation.capture.sessionId);
    });
    // Independence: the promotion gate requires distinct capture sessions.
    assert.ok(sessions.size >= 2, `golden ${golden.fixtureId} lacks independent sessions`);
  }
});

test("committed observations are all valid and hash-consistent", () => {
  assert.ok(observations.length > 0);
  for (const observation of observations) {
    assert.equal(validateSs2Observation(observation), observation);
    assert.equal(observation.capture.installHashVerifiedBefore, true);
    assert.equal(observation.capture.installHashVerifiedAfter, true);
  }
});
