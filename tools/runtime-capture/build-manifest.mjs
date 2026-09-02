#!/usr/bin/env node
/**
 * Derive a capture manifest from the observation records it attests.
 *
 * A manifest is the promotion gate's session-independence evidence. Writing
 * one by hand invites exactly the error the gate exists to catch: a manifest
 * that claims a session or an attestation the observation never made. This
 * builder therefore copies every field out of the validated observation
 * records themselves and invents nothing. The only value it originates is
 * `createdAt`, which is when the manifest was assembled.
 *
 * Usage:
 *   node tools/runtime-capture/build-manifest.mjs \
 *     --observation test/observations/ss2-1v1/obs-a.json \
 *     --observation test/observations/ss2-1v1/obs-b.json \
 *     --out test/manifests/<name>.json
 *
 * Refuses to emit a manifest that the promotion gate would reject: it
 * validates every observation, requires a single capture-tool version, and
 * requires each session to attest the installed hash before and after.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  SS2_CAPTURE_MANIFEST_KIND,
  SS2_CAPTURE_MANIFEST_SCHEMA_VERSION,
  computeSs2CaptureManifestDigest
} from "../../src/golden/promote-1v1-golden.js";
import { validateSs2Observation } from "../../src/golden/observation.js";
import { SS2_BUILD_SHA256, SS2_STEAM_BUILD_ID } from "../../src/golden/run-1v1-fixture.js";
import { byCodeUnit } from "../../src/common/stable-order.js";

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  // Windows editors and PowerShell 5.1 redirection often write a UTF-8 BOM.
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
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
      case "--observation": options.observations.push(next()); break;
      case "--out": options.out = next(); break;
      // Regenerating a committed manifest has to reproduce its digest.
      // Stamping a fresh createdAt would invalidate the
      // captureManifestSha256 a promoted golden already cites, silently.
      case "--created-at": options.createdAt = next(); break;
      case "--print": options.print = true; break;
      default: throw new Error(`Unknown option: ${flag}`);
    }
  }
  return options;
}

/**
 * Build the manifest object for a set of already-parsed observation records.
 * Exported so the campaign driver and the tests can build one without going
 * through the filesystem.
 */
export function buildSs2CaptureManifest(observationRecords, { createdAt } = {}) {
  if (!Array.isArray(observationRecords) || observationRecords.length === 0) {
    throw new Error("At least one observation is required to build a manifest.");
  }
  const observations = observationRecords.map((record) => validateSs2Observation(record));

  const toolVersions = new Set(observations.map((observation) => observation.capture.captureToolVersion));
  if (toolVersions.size !== 1) {
    throw new Error(
      `Observations disagree about captureToolVersion (${[...toolVersions].join(", ")}); ` +
      "the promotion gate requires one version per manifest."
    );
  }

  const sessions = new Map();
  // Duplicate detection has to be global, not per session: the same
  // observation id under two different session ids is exactly the shape a
  // faked independence claim would take, and a per-session check cannot see
  // it.
  const seenObservationIds = new Set();
  for (const observation of observations) {
    const { sessionId, method, observedAt, installHashVerifiedBefore, installHashVerifiedAfter } =
      observation.capture;
    if (installHashVerifiedBefore !== true || installHashVerifiedAfter !== true) {
      throw new Error(
        `Observation ${observation.observationId} does not attest the installed hash before and ` +
        "after its session; it cannot be manifested."
      );
    }
    let session = sessions.get(sessionId);
    if (session === undefined) {
      session = {
        installHashVerifiedAfter: true,
        installHashVerifiedBefore: true,
        method,
        observationIds: [],
        // The session's timestamp is the earliest observation it produced.
        observedAt,
        sessionId
      };
      sessions.set(sessionId, session);
    }
    if (session.method !== method) {
      throw new Error(
        `Session ${sessionId} has observations captured by different methods ` +
        `(${session.method} vs ${method}).`
      );
    }
    if (seenObservationIds.has(observation.observationId)) {
      throw new Error(`Observation ${observation.observationId} was supplied more than once.`);
    }
    seenObservationIds.add(observation.observationId);
    if (Date.parse(observedAt) < Date.parse(session.observedAt)) session.observedAt = observedAt;
    session.observationIds.push(observation.observationId);
  }

  // Sessions are ordered by when they were captured, NOT by the order the
  // caller happened to read the records off disk. `sessions` is an array, so
  // canonicalization preserves its order and the order is therefore part of
  // the manifest digest — the digest a promoted golden cites in
  // `provenance.captureManifestSha256`. The campaign driver supplies records
  // in readdir order, so without this a different filesystem would mint a
  // different, equally "correct" digest for the same evidence. Ties break on
  // sessionId so the ordering is total.
  //
  // The tiebreak used `localeCompare` until 2026-09-02, which reintroduced the
  // exact defect the paragraph above exists to prevent, one layer down: a
  // different LOCALE would mint a different, equally "correct" digest for the
  // same evidence. Measured over the 86 committed sessionIds, az-AZ orders 682
  // of the 3,655 pairs differently from every other locale tested. No committed
  // digest moves, because en-US — what they were all minted under — agrees with
  // `byCodeUnit` on all 3,655 (`node tools/stable-order-locale-census.mjs`).
  const orderedSessions = [...sessions.values()].sort((left, right) =>
    Date.parse(left.observedAt) - Date.parse(right.observedAt) ||
    byCodeUnit(left.sessionId, right.sessionId)
  );

  const manifest = {
    schemaVersion: SS2_CAPTURE_MANIFEST_SCHEMA_VERSION,
    kind: SS2_CAPTURE_MANIFEST_KIND,
    build: {
      fingerprintSchemaVersion: 1,
      steamBuildId: SS2_STEAM_BUILD_ID,
      ss2Sha256: SS2_BUILD_SHA256
    },
    captureToolVersion: [...toolVersions][0],
    createdAt: createdAt ?? new Date().toISOString(),
    sessions: orderedSessions
  };

  // Fail here rather than at promotion time, and return the digest the
  // golden's provenance will carry.
  const digest = computeSs2CaptureManifestDigest(manifest);
  return { manifest, digest };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.observations.length === 0) {
    console.error(
      "Usage: node tools/runtime-capture/build-manifest.mjs --observation <record.json> " +
      "[--observation ...] --out <manifest.json>"
    );
    process.exitCode = 2;
    return;
  }
  const records = [];
  for (const observationPath of options.observations) records.push(await readJson(observationPath));

  const { manifest, digest } = buildSs2CaptureManifest(records, { createdAt: options.createdAt });
  const text = `${JSON.stringify(manifest, null, 2)}\n`;

  if (options.out) {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, text, "utf8");
    console.log(`Wrote capture manifest for ${manifest.sessions.length} session(s) to ${options.out}`);
  }
  if (options.print || !options.out) process.stdout.write(text);
  console.log(`manifest sha256: ${digest}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
