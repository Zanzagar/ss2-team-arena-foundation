import assert from "node:assert/strict";
import test from "node:test";

import { ingestSs2CaptureTrace } from "../src/golden/capture-ingest.js";
import {
  SS2_PROJECTED_COMBATANT_KEYS,
  SS2_SIMULATED_CAPTURE_METHOD,
  matchSs2ObservationToFixture
} from "../src/golden/observation.js";
import { promoteSs2CandidateToGolden } from "../src/golden/promote-1v1-golden.js";
import {
  HOOK_FOR_STATIC_REASON,
  SPELL_HOOK_FOR_STATIC_REASON,
  SimulationError,
  simulateSs2CaptureTrace
} from "../src/golden/simulate-capture-trace.js";
import { extractCaptureTraceFromRuffleLog, wrapperTapeForFixture } from "../tools/capture-session.mjs";

import { loadSs2Fixtures, loadSs2SpellFixtures } from "./ss2-fixture-files.js";

const fixtures = await loadSs2Fixtures();
const spellFixtures = await loadSs2SpellFixtures();

const parseTrace = (trace) => trace.trim().split("\n").map((line) => JSON.parse(line));

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

test("simulated traces ingest and match every spell candidate fixture", () => {
  // The spell family's whole point: the same reference-trace pipeline the
  // physical family uses, with no special casing at the call site.
  assert.equal(spellFixtures.length, 8);
  for (const fixture of spellFixtures) {
    const trace = simulateSs2CaptureTrace(fixture, {
      observationId: `sim-${fixture.fixtureId}`,
      sessionId: "sim-spell-session"
    });
    const record = ingestSs2CaptureTrace(trace, fixture);
    assert.equal(record.capture.method, SS2_SIMULATED_CAPTURE_METHOD);
    const comparison = matchSs2ObservationToFixture(fixture, record);
    assert.deepEqual(comparison.differences, []);
    assert.equal(comparison.match, true);
  }
});

test("physical traces keep their attack_direction identity, events and hook vocabulary", () => {
  // Regression pin for the physical family: adding the spell ingress must not
  // change one byte of what a physical action's reference trace says about
  // itself. Hooks are the wrapper's function attribution, so no physical set
  // may be attributed to the spell ingress or left unattributed.
  const physicalHooks = new Set(Object.values(HOOK_FOR_STATIC_REASON).filter(
    (hook) => hook !== "magic-damage-character"
  ));
  for (const fixture of fixtures) {
    const lines = parseTrace(simulateSs2CaptureTrace(fixture));
    const vars = lines.filter((line) => line.t === "var");
    assert.deepEqual(
      vars.map((line) => line.name),
      fixture.scenario.transient === undefined
        ? ["fight_mode", "attack_direction"]
        : ["fight_mode", "attack_direction", "criticalhit"],
      fixture.fixtureId
    );
    assert.equal(
      vars.find((line) => line.name === "attack_direction").value,
      fixture.scenario.attackDirection
    );

    const dispatch = lines.find((line) => line.t === "event");
    assert.ok(
      dispatch.type === "defender-hurt" || dispatch.type === "defender-blocked",
      `${fixture.fixtureId} dispatched ${dispatch.type}`
    );
    assert.equal(
      lines.some((line) => line.t === "event" && line.type === "magic-damage"),
      false,
      `${fixture.fixtureId} must never emit a spell-ingress event`
    );

    for (const set of lines.filter((line) => line.t === "set")) {
      assert.ok(
        physicalHooks.has(set.hook),
        `${fixture.fixtureId} attributed ${set.path} to ${set.hook}`
      );
    }
  }
});

test("the spell hook table only re-homes the reasons the spell ingress owns", () => {
  // Map lines 351-364: steps 2-6 all run inside magic_damage_character, so a
  // spell action's armour/hitpoint, psyche_up, breastplate-stamina and
  // check_stats writes are all its own; death() is genuinely shared (map lines
  // 320-321, 453-462) and keeps its own hook on both paths.
  assert.equal(HOOK_FOR_STATIC_REASON["magic-damage"], "magic-damage-character");
  assert.equal(HOOK_FOR_STATIC_REASON["psyche-up"], "magic-damage-character");
  assert.deepEqual(
    Object.keys(SPELL_HOOK_FOR_STATIC_REASON).filter(
      (reason) => SPELL_HOOK_FOR_STATIC_REASON[reason] !== HOOK_FOR_STATIC_REASON[reason]
    ),
    ["breastplate-stamina", "stat-clamp"]
  );
  assert.equal(SPELL_HOOK_FOR_STATIC_REASON["death-status-clear"], "death");
  assert.equal(SPELL_HOOK_FOR_STATIC_REASON["death-taunt-clear"], "death");
  assert.equal(SPELL_HOOK_FOR_STATIC_REASON["physical-damage"], "damagecharacter");

  // No spell fixture may leave a set unattributed.
  for (const fixture of spellFixtures) {
    for (const set of parseTrace(simulateSs2CaptureTrace(fixture)).filter((line) => line.t === "set")) {
      assert.notEqual(set.hook, "unattributed", `${fixture.fixtureId}: ${set.path}`);
      assert.notEqual(set.hook, "damagecharacter", `${fixture.fixtureId}: ${set.path}`);
    }
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

test("wrapper tape strings carry only injectable randomBetween samples", () => {
  const debrisFixture = fixtures.find((fixture) => fixture.fixtureId === "candidate-armour-removal-debris");
  const tape = wrapperTapeForFixture(debrisFixture);
  assert.ok(!tape.includes("armour-debris"));
  assert.equal(
    tape.split(",").length,
    debrisFixture.samples.filter((sample) => sample.source === "randomBetween").length
  );
  for (const entry of tape.split(",")) {
    assert.match(entry, /^[a-z0-9-]+:-?\d+:-?\d+:-?\d+$/);
  }
});

test("ruffle logs delog into clean traces, dropping noise and truncating at end", () => {
  const fixture = fixtures[0];
  const trace = simulateSs2CaptureTrace(fixture);
  const stamp = (line) => `2026-08-30T16:00:00.000000Z  INFO avm_trace: ${line}`;
  const logText = [
    stamp("some game-internal trace text"),
    stamp("[\"an\",\"array\"]"),
    ...trace.trim().split("\n").map(stamp),
    // Anything after the end line is post-session runtime noise.
    stamp("{\"t\":\"set\",\"path\":\"/hero/hitpoints\",\"before\":1,\"after\":2,\"hook\":\"late\"}"),
    "2026-08-30T16:00:03.000000Z  WARN ruffle_core: unrelated runtime noise"
  ].join("\r\n");
  const { trace: extracted, dropped } = extractCaptureTraceFromRuffleLog(logText);
  assert.equal(extracted, trace);
  assert.equal(dropped, 2);
  assert.equal(extractCaptureTraceFromRuffleLog("no trace lines at all").trace, "");
});

test("a colourised Ruffle log delogs identically to a plain one", () => {
  // The trap this closes: raising RUST_LOG's global level turns colour on, and
  // the escapes land between `avm_trace` and its colon. The vehicle gate hit
  // this live - 56 avm_trace lines in the log, 0 extracted, and an error
  // message blaming RUST_LOG for not being set when it was.
  const e = "\u001b";
  const colourised = [
    `${e}[2m2026-08-31T05:51:19.852178Z${e}[0m ${e}[32m INFO${e}[0m ${e}[2mavm_trace${e}[0m${e}[2m:${e}[0m {"t":"meta","schemaVersion":1}`,
    `${e}[2m2026-08-31T05:51:19.860907Z${e}[0m ${e}[32m INFO${e}[0m ${e}[2mavm_trace${e}[0m${e}[2m:${e}[0m {"t":"dbg","at":"rootframe"}`,
    `${e}[2m2026-08-31T05:51:20.100000Z${e}[0m ${e}[32m INFO${e}[0m ${e}[2mavm_trace${e}[0m${e}[2m:${e}[0m {"t":"end","reason":"complete"}`
  ].join("\n");
  const plain = [
    '2026-08-31T05:51:19.852178Z  INFO avm_trace: {"t":"meta","schemaVersion":1}',
    '2026-08-31T05:51:19.860907Z  INFO avm_trace: {"t":"dbg","at":"rootframe"}',
    '2026-08-31T05:51:20.100000Z  INFO avm_trace: {"t":"end","reason":"complete"}'
  ].join("\n");

  const fromColour = extractCaptureTraceFromRuffleLog(colourised);
  const fromPlain = extractCaptureTraceFromRuffleLog(plain);

  // Not just "non-empty": the two must agree exactly, or colour would be
  // changing the evidence rather than only its presentation.
  assert.deepEqual(fromColour, fromPlain);
  assert.equal(fromColour.trace, '{"t":"meta","schemaVersion":1}\n{"t":"end","reason":"complete"}\n');
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
