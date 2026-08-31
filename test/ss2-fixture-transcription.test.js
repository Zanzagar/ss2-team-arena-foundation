/**
 * The standing guard against a candidate fixture that was COPIED out of an
 * observation record and then confirmed by that same record.
 *
 * What went wrong
 * ---------------
 * `candidate-prisoner-normal-kill`'s `scenario` and its 7-entry tape are
 * byte-identical to `obs-20260830-t1`'s, because the fixture was authored by
 * copying them out of that record's live state dump. `golden-prisoner-normal-kill`
 * then cites `obs-20260830-t1` as one of the TWO INDEPENDENT OBSERVATIONS its
 * promotion required. A copy cannot fail to match its original, so that
 * observation could not have refuted anything, and the promotion rested on one
 * piece of evidence wearing the label of two.
 *
 * The schema made this undetectable BY CONSTRUCTION: every candidate was forced
 * to declare `synthetic-static-map` provenance, so a fixture derived from the
 * bytecode map and a fixture transcribed from a dump made the identical claim.
 * `provenance.authoredFrom` and the `transcribed-observation` kind exist to let
 * the field say which; this file is what stops it from staying silent.
 *
 * WHY DIGEST EQUALITY IS NOT THE TEST
 * -----------------------------------
 * The obvious guard — "a candidate whose scenario and tape digests equal an
 * observation's was transcribed from it" — is WRONG, and measurably so. Run it
 * over this repository and it flags 23 of the 60 candidates. Only 5 of those 23
 * are transcriptions. The other 18 are the pipeline WORKING: a candidate derived
 * from the battle map, committed as a prediction, and later confirmed by a
 * capture that reproduced it exactly. A confirmed prediction and a transcription
 * are byte-identical by construction — that is what confirmation MEANS — so no
 * comparison of the two files can separate them.
 *
 * What separates them is ORDER. A record captured after a candidate was written
 * cannot be the source it was copied from. So the detector below screens on
 * digests and then decides on lineage: a matching observation that entered the
 * repository in the same commit as the candidate, or earlier, must be declared;
 * one that entered later is a confirmation and must not be.
 *
 * That discriminator is not a formality either. Eight power-band and quick-band
 * candidates landed in `d1da29e` as derivations from the battle map, complete
 * with the arithmetic, and one of them (`candidate-prisoner-power-kill-dir10`)
 * digest-matches `obs-pw1`, which was captured 23 SECONDS before that commit —
 * an unattended campaign loop happening to be mid-run. Its siblings `obs-pw2`
 * through `obs-pw8` arrived over the following eight minutes. Under a
 * digest-only rule that fixture would have been mislabelled a transcription on
 * the strength of a 23-second coincidence.
 *
 * Two traps this file is built to avoid, both of which have caught auditors here
 * before:
 *
 *   - An observation's FILE NAME and its internal `observationId` do not agree.
 *     `obs-20260830-auto1.json` carries the id `obs-diag`. Everything below keys
 *     on the id inside the file.
 *   - A directory that resolves empty makes a corpus test pass while asserting
 *     nothing. A test on this project once did exactly that for exactly this
 *     reason, and its run was byte-identical to a legitimate one. Both anchors
 *     are asserted non-empty before anything is compared, and both name the path
 *     they used when they fail.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256OfCanonicalJson } from "../src/golden/observation.js";
import { GoldenProvenance, SS2_CANDIDATE_PROVENANCE_KINDS } from "../src/golden/run-1v1-fixture.js";

const CANDIDATE_DIR = fileURLToPath(new URL("fixtures/ss2-1v1/", import.meta.url));
const OBSERVATION_DIR = fileURLToPath(new URL("observations/ss2-1v1/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Repo-relative POSIX path, which is the only form `git log --name-only` emits. */
const repoPath = (absolute) => path.relative(REPO_ROOT, absolute).split(path.sep).join("/");

async function loadJsonDir(directory) {
  let fileNames;
  try {
    fileNames = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    assert.fail(`cannot read ${directory}: ${error.message}`);
  }
  assert.ok(
    fileNames.length > 0,
    `no .json files under ${directory} — this suite would compare nothing and pass. ` +
    "Fix the anchor path rather than the assertion."
  );
  return Promise.all(fileNames.map(async (fileName) => ({
    fileName,
    absolutePath: path.join(directory, fileName),
    value: JSON.parse(await readFile(path.join(directory, fileName), "utf8"))
  })));
}

/**
 * The two channels a transcription copies verbatim: the staged scenario and the
 * roll tape. The tape is projected to (label, source, min, max, value) — the
 * fields a record and a fixture both carry — so a fixture's `callSite` and a
 * record's `injected` flag cannot make an identical tape look different.
 */
const tapeProjection = (samples) => samples.map((sample) => ({
  label: sample.label,
  source: sample.source,
  min: sample.min,
  max: sample.max,
  value: sample.value
}));

const transcriptionDigests = (subject) => ({
  scenario: sha256OfCanonicalJson(subject.scenario),
  tape: sha256OfCanonicalJson(tapeProjection(subject.samples))
});

const candidates = (await loadJsonDir(CANDIDATE_DIR))
  .filter((entry) => entry.value.classification === "candidate")
  .map((entry) => ({ ...entry, digests: transcriptionDigests(entry.value) }));

const observations = (await loadJsonDir(OBSERVATION_DIR))
  .map((entry) => ({ ...entry, id: entry.value.observationId, digests: transcriptionDigests(entry.value) }));

const observationById = new Map(observations.map((entry) => [entry.id, entry]));

/** Every observation whose scenario AND tape are byte-identical to the candidate's. */
function digestMatches(candidate) {
  return observations.filter((observation) =>
    observation.digests.scenario === candidate.digests.scenario &&
    observation.digests.tape === candidate.digests.tape
  );
}

// ---------------------------------------------------------------------------
// Lineage: which file entered the repository first
// ---------------------------------------------------------------------------

/**
 * Map every tracked path to the ordinal of the commit that ADDED it, in one
 * `git log` pass rather than one call per file.
 *
 * Read in `--reverse` order, so the first commit to mention a path is the one
 * that introduced it — a file deleted and re-added keeps its original ordinal,
 * which is the conservative direction: it can only make the detector MORE
 * willing to call something a transcription, never less.
 *
 * Throws rather than returning empty. A lineage guard that cannot see history
 * has to say so; degrading to "nothing to check" is the failure mode this file's
 * header warns about.
 */
function loadAdditionOrdinals() {
  let log;
  try {
    log = execFileSync(
      "git",
      ["log", "--reverse", "--diff-filter=A", "--name-only", "--format=%x00%H"],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (error) {
    throw new Error(
      `the transcription lineage guard needs read-only git history at ${REPO_ROOT} and could not ` +
      `read it: ${error.message}. It distinguishes a candidate COPIED from a record from one ` +
      "CONFIRMED by a record, and there is no other signal that does — the two are byte-identical. " +
      "Restore the history rather than relaxing this test.",
      { cause: error }
    );
  }
  const ordinals = new Map();
  let ordinal = -1;
  for (const line of log.split("\n")) {
    const text = line.replace(/\r$/, "");
    if (text.startsWith("\0")) { ordinal += 1; continue; }
    if (text.length === 0) continue;
    if (!ordinals.has(text)) ordinals.set(text, ordinal);
  }
  if (ordinals.size === 0) {
    throw new Error(`git history at ${REPO_ROOT} named no added paths; the lineage guard cannot run.`);
  }
  return ordinals;
}

const additionOrdinals = loadAdditionOrdinals();

function additionOrdinal(absolutePath) {
  const key = repoPath(absolutePath);
  const ordinal = additionOrdinals.get(key);
  assert.notEqual(
    ordinal,
    undefined,
    `${key} is untracked, so the lineage guard cannot tell whether it predates its evidence. ` +
    "Commit it before relying on this suite."
  );
  return ordinal;
}

/**
 * The matching observations that could actually have been the source: those
 * already in the repository when the candidate was written, or landing beside it.
 */
function possibleSources(candidate) {
  const candidateOrdinal = additionOrdinal(candidate.absolutePath);
  return digestMatches(candidate).filter(
    (observation) => additionOrdinal(observation.absolutePath) <= candidateOrdinal
  );
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

test("the corpus and the history the detector reads are both actually there", () => {
  assert.ok(candidates.length >= 60, `only ${candidates.length} candidates found under ${CANDIDATE_DIR}`);
  assert.ok(observations.length >= 67, `only ${observations.length} records found under ${OBSERVATION_DIR}`);
  assert.equal(observationById.size, observations.length, "two records share one observationId");
  // The file-name/id mismatch is real and load-bearing, so it is asserted rather
  // than left as a comment: a future rename that made them agree would quietly
  // remove the reason every lookup here keys on the id.
  const renamed = observations.find((entry) => entry.fileName === "obs-20260830-auto1.json");
  assert.ok(renamed, `obs-20260830-auto1.json is missing from ${OBSERVATION_DIR}`);
  assert.equal(renamed.id, "obs-diag", "keying on file names instead of ids would silently mis-resolve");
  assert.ok(additionOrdinals.size > 100, "git history resolved too few added paths to trust");
});

test("a declared authoredFrom names a real record the fixture actually matches", () => {
  let declared = 0;
  for (const candidate of candidates) {
    const { provenance } = candidate.value;
    assert.ok(
      SS2_CANDIDATE_PROVENANCE_KINDS.includes(provenance.kind),
      `${candidate.value.fixtureId} declares unknown provenance kind ${provenance.kind}`
    );
    if (provenance.kind !== GoldenProvenance.TRANSCRIBED) {
      assert.equal(
        Object.hasOwn(provenance, "authoredFrom"),
        false,
        `${candidate.value.fixtureId} is ${provenance.kind} but names a source record`
      );
      continue;
    }
    declared += 1;
    const source = observationById.get(provenance.authoredFrom);
    assert.ok(
      source,
      `${candidate.value.fixtureId} claims it was authored from ${provenance.authoredFrom}, which is ` +
      `not a committed record under ${OBSERVATION_DIR}. A provenance claim a reviewer holding the ` +
      "repository cannot check is not a provenance claim."
    );
    // A fixture cannot have been copied out of a record it disagrees with. This
    // is what stops `authoredFrom` from becoming a decorative string: a typo, a
    // stale id after a re-derivation, or an id chosen to dodge the promotion
    // refusal all land here.
    assert.deepEqual(
      candidate.digests,
      source.digests,
      `${candidate.value.fixtureId} names ${provenance.authoredFrom} as its source but their scenario ` +
      "and tape digests differ, so it was not transcribed from that record"
    );
  }
  assert.ok(declared > 0, "no candidate declares a source: this assertion would be vacuous");
});

test("every candidate that could have been copied from a record declares that record", () => {
  const undeclared = [];
  const declaredSources = [];
  for (const candidate of candidates) {
    const sources = possibleSources(candidate);
    const authoredFrom = candidate.value.provenance.authoredFrom;
    for (const source of sources) {
      if (source.id === authoredFrom) { declaredSources.push(candidate.value.fixtureId); continue; }
      undeclared.push(
        `${candidate.value.fixtureId} (${repoPath(candidate.absolutePath)}) has the same scenario and ` +
        `tape as ${source.id} (${repoPath(source.absolutePath)}), which was already in the repository ` +
        `when the fixture was written, but declares ` +
        `${authoredFrom === undefined ? "no source at all" : `${authoredFrom} instead`}`
      );
    }
  }
  assert.deepEqual(
    undeclared,
    [],
    `${undeclared.length} candidate(s) may have been transcribed from a record they do not declare. ` +
    "Either the fixture was copied from it — declare it with provenance.kind " +
    `${GoldenProvenance.TRANSCRIBED} — or it was not, and the coincidence needs explaining:\n` +
    undeclared.join("\n")
  );
  assert.ok(declaredSources.length > 0, "the detector found no source at all: it would pass on anything");
});

/**
 * Declarations the history cannot corroborate, each with a written reason.
 *
 * A transcription claim is an ADMISSION AGAINST INTEREST: it can only cost the
 * declarer evidence — the named record stops counting toward promotion — and can
 * never gain them any. So an author who says "I copied this" should be believed
 * even when the record reached the repository later than the fixture, which
 * happens whenever the capture was held locally before being committed.
 *
 * What must never happen is a claim landing SILENTLY. Any fixture here needs a
 * human sentence saying why the history does not show its source, and adding one
 * without that sentence turns this file red.
 *
 * Empty today: all five declared transcriptions are corroborated by lineage.
 */
const ACKNOWLEDGED_UNSUPPORTED = new Map([]);

test("a transcription the history cannot corroborate is acknowledged, not silent", () => {
  // The original form of this test asserted the OPPOSITE — that a candidate with
  // no pre-existing matching record must NOT be labelled transcribed. That was
  // aimed the wrong way round, and an adversarial verifier caught it: it made the
  // honest label REFUSABLE. An author who genuinely copied a fixture out of an
  // uncommitted capture, then committed the fixture first, could not say so.
  //
  // A guard that punishes a truthful declaration is a defect in its own right,
  // and it fails in the dangerous direction: the self-serving move is to stay
  // SILENT and keep `synthetic-static-map`, which this test never touched.
  //
  // The protective half is kept. A mechanical relabelling — the one a
  // digest-only rule would produce — still turns this red, because eighteen
  // confirmed predictions would arrive here at once with no reason written for
  // any of them. That is the case worth catching: each `candidate-probe-*` arm
  // has exactly two observations, so refusing one as self-citing would leave one
  // and make the arm unpromotable for ever.
  const flaggedByDigest = candidates.filter((candidate) => digestMatches(candidate).length > 0);
  const withPossibleSource = candidates.filter((candidate) => possibleSources(candidate).length > 0);
  assert.ok(
    flaggedByDigest.length > withPossibleSource.length,
    "digest equality and lineage now agree on every fixture; if that is genuine this test is spent, " +
    "but check first that the lineage lookup has not silently stopped resolving"
  );

  let corroborated = 0;
  for (const candidate of candidates) {
    if (candidate.value.provenance.kind !== GoldenProvenance.TRANSCRIBED) continue;
    if (possibleSources(candidate).length > 0) { corroborated += 1; continue; }
    assert.ok(
      ACKNOWLEDGED_UNSUPPORTED.has(candidate.value.fixtureId),
      `${candidate.value.fixtureId} declares it was transcribed from ` +
      `${candidate.value.provenance.authoredFrom}, but no matching record was in the repository when ` +
      "the fixture was added. That can be honest — a capture held locally and committed afterwards — " +
      "so the declaration is not refused. It may not stand unexplained: add the fixture to " +
      "ACKNOWLEDGED_UNSUPPORTED with a sentence saying where its numbers came from. Declaring a " +
      "transcription only ever COSTS evidence, so the claim is believed; the reason is what is required."
    );
  }

  // Anti-vacuity: the loop above must actually have inspected declarations.
  assert.ok(
    corroborated + ACKNOWLEDGED_UNSUPPORTED.size >= 5,
    `only ${corroborated + ACKNOWLEDGED_UNSUPPORTED.size} transcription declarations were examined; ` +
    "five are committed, so the lineage lookup or the kind filter has stopped resolving"
  );
});
