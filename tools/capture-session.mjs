#!/usr/bin/env node
/**
 * Controlled runtime-capture session driver for the licensed SS2 build.
 *
 * Subcommands:
 *   verify-install   recompute the installed SWF hashes against the pinned
 *                    fingerprint (run before and after every capture session)
 *   simulate         generate a reference trace (synthetic-simulator method,
 *                    never promotable) from a candidate fixture for pipeline
 *                    dry runs and wrapper validation
 *   ingest           normalize one raw wrapper trace (JSONL) into a validated
 *                    observation record
 *   verify           match observation records against a fixture; divergences
 *                    are preserved as reports, never discarded
 *   promote          promote a candidate fixture to a runtime golden from at
 *                    least two matching independent observations
 *   manifest-digest  print the canonical SHA-256 of a capture manifest
 *
 * The tool reads the licensed installation in place and never copies,
 * patches, or redistributes it. Raw traces belong under the ignored
 * captures/ directory; only normalized observation records, divergence
 * reports, manifests, and golden fixtures are committed.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ingestSs2CaptureTrace } from "../src/golden/capture-ingest.js";
import { matchSs2ObservationToFixture, validateSs2Observation } from "../src/golden/observation.js";
import { simulateSs2CaptureTrace } from "../src/golden/simulate-capture-trace.js";
import {
  PromotionBlockedError,
  buildSs2DivergenceReport,
  computeSs2CaptureManifestDigest,
  goldenFixtureIdFor,
  promoteSs2CandidateToGolden
} from "../src/golden/promote-1v1-golden.js";
import { validateSs2OneVsOneFixture } from "../src/golden/run-1v1-fixture.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_INSTALL_DIR =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Swords and Sandals Classic Collection";
export const DEFAULT_FINGERPRINT_PATH = path.join(
  SCRIPT_DIR,
  "..",
  "docs",
  "integration",
  "ss2-build-fingerprint.json"
);

async function sha256OfFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex").toUpperCase();
}

/**
 * Compare the installed launcher and SS2 SWF against the pinned fingerprint.
 * Returns { ok, checks } without printing; the CLI renders the result.
 */
export async function verifyInstallAgainstFingerprint({
  installDir = DEFAULT_INSTALL_DIR,
  fingerprintPath = DEFAULT_FINGERPRINT_PATH
} = {}) {
  const fingerprint = await readJson(fingerprintPath);
  const targets = [fingerprint.collection.launcher, fingerprint.collection.ss2];
  const checks = [];
  for (const target of targets) {
    const filePath = path.join(installDir, ...target.relativePath.split("/"));
    const check = {
      relativePath: target.relativePath,
      expectedSha256: target.sha256.toUpperCase(),
      expectedBytes: target.bytes,
      actualSha256: null,
      actualBytes: null,
      ok: false
    };
    try {
      const stats = await stat(filePath);
      check.actualBytes = stats.size;
      check.actualSha256 = await sha256OfFile(filePath);
      check.ok = check.actualSha256 === check.expectedSha256 && check.actualBytes === check.expectedBytes;
    } catch (error) {
      check.error = error.code ?? error.message;
    }
    checks.push(check);
  }
  return { ok: checks.every((check) => check.ok), checks };
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  // Windows editors and PowerShell 5.1 redirection often write a UTF-8 BOM.
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

async function writeJson(filePath, value, { overwrite = true } = {}) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: overwrite ? "w" : "wx"
  });
}

function safeFileToken(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

/**
 * Report filenames get a short digest of the raw ids so distinct ids that
 * sanitize identically (or differ only by case on a case-insensitive
 * filesystem) can never overwrite each other's preserved evidence.
 */
function divergenceReportPath(directory, fixtureId, observationId) {
  const suffix = createHash("sha256")
    .update(`${fixtureId}\n${observationId}`, "utf8")
    .digest("hex")
    .slice(0, 8);
  return path.join(
    directory,
    `${safeFileToken(fixtureId)}--${safeFileToken(observationId)}-${suffix}.json`
  );
}

function parseArgs(argv) {
  const options = { observations: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${flag} needs a value.`);
      return argv[index];
    };
    switch (flag) {
      case "--install-dir": options.installDir = next(); break;
      case "--fingerprint": options.fingerprintPath = next(); break;
      case "--trace": options.trace = next(); break;
      case "--fixture": options.fixture = next(); break;
      case "--observation": options.observations.push(next()); break;
      case "--manifest": options.manifest = next(); break;
      case "--out": options.out = next(); break;
      case "--divergence-dir": options.divergenceDir = next(); break;
      case "--observation-id": options.observationId = next(); break;
      case "--session-id": options.sessionId = next(); break;
      default: throw new Error(`Unknown option: ${flag}`);
    }
  }
  return options;
}

function require_(options, key, flag) {
  const value = options[key];
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`${flag} is required for this subcommand.`);
  }
  return value;
}

async function commandVerifyInstall(options) {
  const result = await verifyInstallAgainstFingerprint(options);
  for (const check of result.checks) {
    const status = check.ok ? "OK  " : "FAIL";
    console.log(`${status} ${check.relativePath}`);
    console.log(`     expected sha256 ${check.expectedSha256} (${check.expectedBytes} bytes)`);
    console.log(`     actual   sha256 ${check.actualSha256 ?? "-"} (${check.actualBytes ?? "-"} bytes)`);
    if (check.error) console.log(`     error: ${check.error}`);
  }
  console.log(result.ok
    ? "Installed build matches the pinned fingerprint."
    : "Installed build DOES NOT match the pinned fingerprint. Stop the capture session.");
  return result.ok ? 0 : 1;
}

async function commandSimulate(options) {
  const fixture = await readJson(require_(options, "fixture", "--fixture"));
  const stamp = Date.now();
  const trace = simulateSs2CaptureTrace(fixture, {
    observationId: options.observationId ?? `sim-obs-${stamp}`,
    sessionId: options.sessionId ?? `sim-session-${stamp}`,
    observedAt: new Date().toISOString()
  });
  const outPath = options.out ??
    path.join(SCRIPT_DIR, "..", "captures", "simulated", `${fixture.fixtureId}-${stamp}.jsonl`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, trace, "utf8");
  console.log(`Wrote synthetic-simulator reference trace to ${outPath}`);
  console.log("Simulated traces exercise the pipeline only; promotion always rejects them.");
  return 0;
}

async function commandIngest(options) {
  const fixture = await readJson(require_(options, "fixture", "--fixture"));
  const rawText = await readFile(require_(options, "trace", "--trace"), "utf8");
  let record;
  try {
    record = ingestSs2CaptureTrace(rawText, fixture);
  } catch (error) {
    if (/null after-attestation placeholder/.test(error.message)) {
      // Wrapper traces cannot attest the post-session hash themselves; run
      // the same check verify-install performs, live, and stamp the result.
      const check = await verifyInstallAgainstFingerprint(options);
      if (!check.ok) {
        throw new Error(
          "Post-session hash verification FAILED: the installed build no longer matches the pinned " +
          "fingerprint, so this trace cannot be ingested as evidence."
        );
      }
      console.log("Post-session hash verification passed; stamping installHashVerifiedAfter.");
      record = ingestSs2CaptureTrace(rawText, fixture, { installHashVerifiedAfter: true });
    } else if (/at least one injected sample/.test(error.message)) {
      throw new Error(
        `${error.message}\nEvery roll fell back to the live RNG, so this session fully diverged from ` +
        "the fixture's expected tape before the first sample matched. The raw trace itself is the " +
        "divergence evidence; keep it in captures/ and correct the isolated candidate's roll order from it."
      );
    } else {
      throw error;
    }
  }
  const outPath = require_(options, "out", "--out");
  await writeJson(outPath, record);
  console.log(`Wrote observation ${record.observationId} (digest ${record.digest}) to ${outPath}`);
  return 0;
}

async function commandVerify(options) {
  const fixture = validateSs2OneVsOneFixture(await readJson(require_(options, "fixture", "--fixture")));
  const divergenceDir = options.divergenceDir ??
    path.join(SCRIPT_DIR, "..", "test", "fixtures", "ss2-1v1-divergences");
  let failures = 0;
  for (const observationPath of require_(options, "observations", "--observation")) {
    const observation = validateSs2Observation(await readJson(observationPath));
    const comparison = matchSs2ObservationToFixture(fixture, observation);
    if (comparison.match) {
      console.log(`MATCH ${observation.observationId} agrees with ${fixture.fixtureId}.`);
      continue;
    }
    failures += 1;
    const report = buildSs2DivergenceReport(fixture, observation, comparison.differences);
    const reportPath = divergenceReportPath(divergenceDir, fixture.fixtureId, observation.observationId);
    await writeJson(reportPath, report);
    console.log(`DIVERGE ${observation.observationId} disagrees with ${fixture.fixtureId}:`);
    for (const difference of comparison.differences.slice(0, 20)) {
      console.log(`  at ${difference.path}: fixture ${JSON.stringify(difference.expected)}` +
        ` vs observed ${JSON.stringify(difference.actual)}`);
    }
    console.log(`  full report preserved at ${reportPath}`);
  }
  if (failures > 0) {
    console.log("Correct the isolated candidate from the preserved divergence(s); do not promote.");
  }
  return failures > 0 ? 1 : 0;
}

async function commandPromote(options) {
  const candidate = await readJson(require_(options, "fixture", "--fixture"));
  const manifest = await readJson(require_(options, "manifest", "--manifest"));
  const observationPaths = require_(options, "observations", "--observation");
  const observations = [];
  for (const observationPath of observationPaths) observations.push(await readJson(observationPath));
  try {
    const { golden, captureManifestSha256 } = promoteSs2CandidateToGolden(candidate, observations, manifest);
    const outPath = options.out ??
      path.join(SCRIPT_DIR, "..", "test", "fixtures", "ss2-1v1-golden", `${golden.fixtureId}.json`);
    try {
      await writeJson(outPath, golden, { overwrite: false });
    } catch (error) {
      if (error.code === "EEXIST") {
        throw new Error(
          `${outPath} already exists; refusing to overwrite a promoted golden. ` +
          "Pass --out for a different destination or remove the stale file deliberately."
        );
      }
      throw error;
    }
    console.log(`Promoted ${candidate.fixtureId} -> ${golden.fixtureId}`);
    console.log(`  repetitions: ${golden.provenance.repetitions}`);
    console.log(`  capture manifest sha256: ${captureManifestSha256}`);
    console.log(`  wrote ${outPath}`);
    return 0;
  } catch (error) {
    if (error instanceof PromotionBlockedError) {
      const divergenceDir = options.divergenceDir ??
        path.join(SCRIPT_DIR, "..", "test", "fixtures", "ss2-1v1-divergences");
      for (const report of error.divergences) {
        const reportPath = divergenceReportPath(divergenceDir, report.fixtureId, report.observationId);
        await writeJson(reportPath, report);
        console.log(`DIVERGE ${report.observationId}: report preserved at ${reportPath}`);
      }
    }
    throw error;
  }
}

async function commandManifestDigest(options) {
  const manifest = await readJson(require_(options, "manifest", "--manifest"));
  console.log(computeSs2CaptureManifestDigest(manifest));
  return 0;
}

/**
 * Extract the raw capture trace from a Ruffle stdout log
 * (RUST_LOG=avm_trace=info): keep each avm_trace payload that is a JSON
 * object with a `t` field, drop everything else (game-internal traces,
 * runtime noise). Returns { trace, dropped }.
 */
export function extractCaptureTraceFromRuffleLog(logText) {
  const lines = [];
  let dropped = 0;
  for (const rawLine of logText.split(/\r?\n/)) {
    const match = /avm_trace:\s(.*)$/.exec(rawLine);
    if (!match) continue;
    const payload = match[1];
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.t === "string") {
        lines.push(payload);
        // A capture is a single action; anything after the end line is
        // post-session runtime noise, not evidence.
        if (parsed.t === "end") break;
      } else {
        dropped += 1;
      }
    } catch {
      dropped += 1;
    }
  }
  return { trace: lines.length > 0 ? `${lines.join("\n")}\n` : "", dropped };
}

async function commandDelog(options) {
  const logText = await readFile(require_(options, "trace", "--trace"), "utf8");
  const { trace, dropped } = extractCaptureTraceFromRuffleLog(logText);
  if (trace.length === 0) {
    throw new Error("No capture-trace lines found in the log (is RUST_LOG=avm_trace=info set?).");
  }
  const outPath = require_(options, "out", "--out");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, trace, "utf8");
  console.log(`Extracted ${trace.trimEnd().split("\n").length} trace line(s) to ${outPath} (${dropped} non-trace line(s) dropped).`);
  return 0;
}

/** The wrapper's `tape` FlashVars value: injectable randomBetween samples only. */
export function wrapperTapeForFixture(fixture) {
  return fixture.samples
    .filter((sample) => sample.source === "randomBetween")
    .map((sample) => `${sample.label}:${sample.min}:${sample.max}:${sample.value}`)
    .join(",");
}

async function commandTape(options) {
  const fixture = validateSs2OneVsOneFixture(await readJson(require_(options, "fixture", "--fixture")));
  console.log(wrapperTapeForFixture(fixture));
  return 0;
}

const COMMANDS = new Map([
  ["verify-install", commandVerifyInstall],
  ["simulate", commandSimulate],
  ["ingest", commandIngest],
  ["verify", commandVerify],
  ["promote", commandPromote],
  ["manifest-digest", commandManifestDigest],
  ["tape", commandTape],
  ["delog", commandDelog]
]);

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const handler = COMMANDS.get(command);
  if (!handler) {
    console.error(`Usage: node tools/capture-session.mjs <${[...COMMANDS.keys()].join("|")}> [options]`);
    process.exitCode = 2;
    return;
  }
  try {
    process.exitCode = await handler(parseArgs(rest));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export { goldenFixtureIdFor };
