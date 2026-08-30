import assert from "node:assert/strict";
import test from "node:test";

import { ingestSs2CaptureTrace } from "../src/golden/capture-ingest.js";
import {
  SS2_PROJECTED_COMBATANT_KEYS,
  SS2_SIMULATED_CAPTURE_METHOD,
  matchSs2ObservationToFixture
} from "../src/golden/observation.js";
import { promoteSs2CandidateToGolden } from "../src/golden/promote-1v1-golden.js";
import { SimulationError, simulateSs2CaptureTrace } from "../src/golden/simulate-capture-trace.js";

import { loadSs2Fixtures } from "./ss2-fixture-files.js";

const fixtures = await loadSs2Fixtures();

test("simulated traces ingest and match every candidate fixture", () => {
  for (const fixture of fixtures) {
    const trace = simulateSs2CaptureTrace(fixture, {
      observationId: `sim-${fixture.fixtureId}`,
      sessionId: "sim-session-1"
    });
    const record = ingestSs2CaptureTrace(trace, fixture);
    assert.equal(record.capture.method, SS2_SIMULATED_CAPTURE_METHOD);
    assert.equal(record.observationId, `sim-${fixture.fixtureId}`);
    const comparison = matchSs2ObservationToFixture(fixture, record);
    assert.deepEqual(comparison.differences, []);
    assert.equal(comparison.match, true);
  }
});

test("the simulator emits the documented trace grammar", () => {
  const fixture = fixtures[0];
  const lines = simulateSs2CaptureTrace(fixture)
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(lines[0].t, "meta");
  assert.equal(lines[0].schemaVersion, 1);
  assert.equal(lines[0].mutationGranularity, "property-watch");
  assert.equal(lines.at(-1).t, "end");
  assert.equal(lines.at(-1).installHashVerifiedAfter, true);
  const allowed = new Set(["meta", "state", "var", "roll", "set", "event", "final", "end"]);
  for (const line of lines) assert.ok(allowed.has(line.t), `unexpected line type ${line.t}`);
  const stateLines = lines.filter((line) => line.t === "state");
  assert.equal(stateLines.length, 2);
  for (const stateLine of stateLines) {
    for (const key of SS2_PROJECTED_COMBATANT_KEYS) {
      assert.ok(Object.hasOwn(stateLine.fields, key), `staged dump missing ${key}`);
    }
  }
  for (const rollLine of lines.filter((line) => line.t === "roll")) {
    assert.match(rollLine.callSite, /^(?:overlay|root|sprite):/);
    assert.equal(typeof rollLine.injected, "boolean");
  }
});

test("simulated observations can never be promoted", () => {
  const fixture = fixtures[0];
  const observations = ["a", "b"].map((suffix) =>
    ingestSs2CaptureTrace(
      simulateSs2CaptureTrace(fixture, {
        observationId: `sim-obs-${suffix}`,
        sessionId: `sim-session-${suffix}`
      }),
      fixture
    )
  );
  const manifest = {
    schemaVersion: 1,
    kind: "ss2-capture-manifest",
    build: JSON.parse(JSON.stringify(fixture.build)),
    captureToolVersion: "ss2-capture/0.1.0",
    createdAt: "2026-08-30T18:00:00Z",
    sessions: observations.map((observation) => ({
      sessionId: observation.capture.sessionId,
      method: observation.capture.method,
      observedAt: observation.capture.observedAt,
      observationIds: [observation.observationId],
      installHashVerifiedBefore: true,
      installHashVerifiedAfter: true
    }))
  };
  assert.throws(
    () => promoteSs2CandidateToGolden(fixture, observations, manifest),
    /synthetic simulator trace, not runtime evidence/
  );
});

test("the simulator fails fast on internally inconsistent fixtures", () => {
  const fixture = JSON.parse(JSON.stringify(fixtures[0]));
  fixture.scenario.villain.hitpoints += 1;
  assert.throws(
    () => simulateSs2CaptureTrace(fixture),
    (error) => error instanceof SimulationError && new RegExp(fixture.fixtureId).test(error.message)
  );
});

test("simulated traces omit unobservable opcode debris rolls", () => {
  const debrisFixture = fixtures.find((fixture) => fixture.fixtureId === "candidate-armour-removal-debris");
  assert.ok(debrisFixture.samples.some((sample) => sample.source === "randomNumber"));
  const lines = simulateSs2CaptureTrace(debrisFixture)
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const rollLines = lines.filter((line) => line.t === "roll");
  assert.ok(rollLines.every((line) => line.source === "randomBetween"));
  const record = ingestSs2CaptureTrace(simulateSs2CaptureTrace(debrisFixture), debrisFixture);
  assert.equal(matchSs2ObservationToFixture(debrisFixture, record).match, true);
});

test("the simulator rejects invalid identity metadata", () => {
  const fixture = fixtures[0];
  assert.throws(
    () => simulateSs2CaptureTrace(fixture, { observationId: "spaced id" }),
    SimulationError
  );
  assert.throws(
    () => simulateSs2CaptureTrace(fixture, { observedAt: "not-a-date" }),
    SimulationError
  );
  assert.throws(() => simulateSs2CaptureTrace({ not: "a fixture" }), Error);
});
