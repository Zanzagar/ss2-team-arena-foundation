/**
 * The living head's reading map must not point at sections that do not exist.
 *
 * `HANDOFF.md` § "What to read, and what you may skip" tells a session which
 * sections it may SKIP. That makes every pointer in it load-bearing in the one
 * direction that hurts: a reader who follows a dead reference concludes the
 * guidance is not there and moves on, and a reader who trusts a "you may skip"
 * row never opens the section at all. A map with a dead link is worse than no
 * map, because it is followed.
 *
 * This is the failure mode the map was written to avoid reproducing. The head
 * already carries "Docs known stale, not yet reconciled" as a standing open
 * item, and the project's own rule is that evidence a reviewer holding the
 * repository cannot check is not evidence. A section reference is exactly that
 * kind of claim, and nothing checked it.
 *
 * What is asserted, and what deliberately is not. Every `§ "..."` reference in
 * the map must resolve to a real heading — in `HANDOFF.md` itself, or in a
 * committed handoff under `docs/handoffs/`, because the map cites one of those
 * too. Whether the section still SAYS what the row claims is not checkable
 * here and is not attempted; that is what a reader is for. The narrow check is
 * the one that can be made honestly.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const HANDOFF_PATH = path.join(REPO_ROOT, "HANDOFF.md");
const HANDOFFS_DIR = path.join(REPO_ROOT, "docs", "handoffs");

const MAP_HEADING = "## What to read, and what you may skip";
const ARCHIVE_LINE = "## THE ARCHIVE LINE";

/**
 * Read a document with its line endings normalised to LF.
 *
 * THIS TEST FAILED IN EVERY WINDOWS CHECKOUT AND PASSED IN WSL. Windows git has
 * `core.autocrlf=true` at system scope, so these files check out CRLF there;
 * `headingOffset` looked for `\n<heading>\n` and the heading line really ends
 * `...skip\r`, so it reported "## What to read, and what you may skip is
 * missing from HANDOFF.md" while that heading sat at line 31.
 *
 * The repository already documents the two environments disagreeing about line
 * endings as a hazard — and neither the author of this file nor its reviewer
 * thought to apply that to the file itself. A guard that cannot run in one of
 * the project's two working trees is worse than no guard THERE: the Windows
 * tree is where captures run, and a suite that is red for an environmental
 * reason is a suite whose next genuine failure gets ignored.
 *
 * Normalised at READ time rather than by making each parse tolerant, so no
 * future parser added below has to remember. And `\r` belongs on the
 * formatting side of the line this file already draws — collapse what the
 * medium inserted, never normalise away a truncation like an ellipsis.
 */
const readText = async (filePath) => (await readFile(filePath, "utf8")).replace(/\r\n/g, "\n");

const handoffText = await readText(HANDOFF_PATH);

/** Every markdown heading in a document, without its leading hashes. */
function headingsIn(text) {
  return new Set(
    text
      .split("\n")
      .filter((line) => /^#{2,6}\s/.test(line))
      .map((line) => line.replace(/^#{2,6}\s+/, "").trim())
  );
}

/**
 * Section names the map cites, as `§ "Name"`. Returned with duplicates so a
 * count can be asserted: a regex that silently stopped matching would
 * otherwise make every assertion below pass over an empty list.
 */
function citedSections(text) {
  // THIS NORMALISATION IS ASYMMETRIC ON PURPOSE, and it will look like an
  // oversight to whoever tidies it next. Do not make it uniform in either
  // direction; the two cases are different kinds of thing.
  //
  // Wrapped whitespace IS collapsed. Markdown wraps, so a reference near a
  // line end arrives with a newline inside its quotes. That is the FORMATTING
  // differing from the heading, not the map naming a section that does not
  // exist, and failing on it would report a defect that is not there.
  //
  // An ellipsis is NOT normalised away. "§ \"The pairwise gate…\"" names no
  // heading, and a reader who follows it dead-ends exactly as they would on an
  // outright wrong name — a truncated reference IS a dead link, which is the
  // only thing this test is for. Strip the ellipsis to make it resolve and the
  // test starts passing over the failure it exists to catch.
  //
  // Both cases are real: the first run of this test on the map it was written
  // for produced one wrapped reference AND one ellipsis, and only one of them
  // was a defect.
  return [...text.matchAll(/§\s+"([^"]+)"/g)].map((match) => match[1].replace(/\s+/g, " ").trim());
}

/**
 * Where a heading actually starts, as a heading and not as a mention of one.
 * `indexOf("## THE ARCHIVE LINE")` finds the sentence 18 lines from the top
 * that EXPLAINS the archive line, hundreds of lines before the heading itself
 * — which made the ordering assertion below fail on a correct file.
 */
function headingOffset(text, heading) {
  const at = text.indexOf(`\n${heading}\n`);
  return at === -1 ? -1 : at + 1;
}

/**
 * Handoff stamps sort lexicographically, so the newest is the last name.
 * `README.md` is not a handoff and is excluded by the stamp pattern rather
 * than by name, so a second non-handoff file cannot quietly join it.
 */
const HANDOFF_STAMP = /^(\d{4}-\d{2}-\d{2}-\d{4})--[a-z0-9-]+\.md$/;

async function committedHandoffs() {
  return (await readdir(HANDOFFS_DIR)).filter((name) => HANDOFF_STAMP.test(name)).sort();
}

/**
 * The file the head's `**LATEST:` marker points at.
 *
 * The test below used to accept the newest handoff appearing ANYWHERE in the
 * head's links, and the head links five of them — the previous latest, the
 * brief that opened the current items, and two from the night before. So the
 * assertion passed while the LATEST marker named a different file from the one
 * it was checking, which is the precise failure it exists to catch. It is
 * parsed from the marker here so the check is about the pointer a reader
 * actually follows.
 */
function latestPointerTarget(text) {
  const match = text.match(/\*\*LATEST:\s*\n?\s*\[[^\]]*\]\(docs\/handoffs\/([^)]+\.md)\)/);
  return match ? match[1] : null;
}

/**
 * Which handoff each handoff declares it supersedes, keyed by superseded name.
 *
 * `supersedes:` is free text after the name — "(ALL FOUR of its ranked items
 * 2-5)", "(its ranked items 1 and 2)" — so only the leading stamped name is
 * taken, and `none` matches nothing because it is not a stamp.
 */
function supersededName(frontmatterText) {
  const match = frontmatterText.match(/^supersedes:[ \t]*(\d{4}-\d{2}-\d{2}-\d{4}--[a-z0-9-]+)/m);
  return match ? `${match[1]}.md` : null;
}

/**
 * When each handoff FIRST entered git, as an epoch-seconds number.
 *
 * THE FILENAME STAMP IS A CLAIM; THIS IS THE FACT, and the two have disagreed
 * twice. Both times a handoff was stamped with the UTC time while labelled
 * `-0400`, so it sorted after a file written hours later and `ls
 * docs/handoffs/` sent the next session to a superseded brief. The head asks
 * every session to check with `git log --date=iso-local` and nothing enforced
 * it; that is what this derivation is for.
 *
 * `--follow` is load-bearing: `2026-09-01-1550--codex-independence…` was
 * renamed from `…-1950--` for this same bug, so without it that file has no
 * add commit at all and the whole derivation returns null.
 *
 * Returns null — not a throw and not a skip — when the history is not
 * derivable (no git, a tarball export, a shallow clone with the add commit cut
 * off). The callers then fall back to a weaker git-free check and SAY SO in
 * the assertion message, because a guard that silently changes what it proves
 * is the hazard this file was written about.
 */
async function firstCommitInstants() {
  const names = await committedHandoffs();
  const instants = new Map();
  try {
    for (const name of names) {
      const { stdout } = await execFileAsync("git", [
        "-C", REPO_ROOT,
        "log", "--follow", "--diff-filter=A", "--format=%at",
        "--", path.posix.join("docs", "handoffs", name)
      ]);
      const stamps = stdout.trim().split("\n").filter(Boolean);
      if (stamps.length === 0) return null;
      instants.set(name, Number(stamps.at(-1)));
    }
  } catch {
    return null;
  }
  // A shallow clone can answer every query and still answer them all wrongly.
  // Distinct instants are what the ordering assertions consume, so require
  // enough of them that a collapsed history fails here by name.
  if (new Set(instants.values()).size < 4) return null;
  return instants;
}

/**
 * Handoffs whose filename stamp is out of order with the commit that added
 * them, with the reason each is left alone. BOTH ARE RECORDED IN THE LIVING
 * HEAD; neither may be renamed, because every link to them would break.
 *
 * This list is asserted MINIMAL below — an entry that stops being an inversion
 * fails the test as unnecessary — so it cannot quietly outlive its cause. Add
 * to it only for a handoff that is already committed and already linked;
 * a NEW handoff that lands here is the bug, and the fix is to stamp it in
 * local time before committing, not to widen this list.
 */
const KNOWN_STAMP_INVERSIONS = Object.freeze({
  "2026-09-01-0030--migration-closeout-and-what-is-untested.md":
    "two sessions closed the same night; this one committed at 2026-08-31 23:39 -0400 " +
    "while the 00:21 corpus brief committed at 00:24. The head names both and says which answers what.",
  "2026-09-02-0130--ss2-rules-and-the-wave-that-broke-it.md":
    "stamped with the UTC time under a -0400 label; committed 2026-09-01 22:58 -0400, " +
    "so its true stamp is 2026-09-01-2258. It carries a forward pointer instead of a rename."
});

test("the head's LATEST pointer names a handoff nothing else supersedes", async () => {
  // This has gone stale twice, both times the same way: a session lands a
  // handoff and the pointer keeps naming the previous one, so AGENTS.md sends
  // the next reader to "read the newest file in docs/handoffs/" while the head
  // names a different file as latest. It went stale again the moment a
  // concurrent session pushed a newer handoff without touching the head, which
  // is the case no amount of care by one author prevents.
  //
  // This half needs no git, so it is the half that survives a tarball. The
  // handoffs already declare their own order in `supersedes:`, and a pointer
  // aimed at a brief some LATER brief has retired is the exact harm — that is
  // what "ls puts the newest second-to-last" costs a reader.
  const handoffs = await committedHandoffs();
  assert.ok(handoffs.length >= 4, `only ${handoffs.length} handoffs matched the stamp pattern`);

  const latest = latestPointerTarget(handoffText);
  assert.ok(latest !== null, "the head has no `**LATEST:` marker linking a handoff");
  assert.ok(
    handoffs.includes(latest),
    `the head's LATEST pointer names ${latest}, which is not a committed handoff`
  );

  const retired = new Map();
  for (const name of handoffs) {
    const superseded = supersededName(await readText(path.join(HANDOFFS_DIR, name)));
    if (superseded) retired.set(superseded, name);
  }
  // Vacuity guard: if the frontmatter parse stops matching, every assertion
  // below passes for free.
  assert.ok(retired.size >= 3, `only ${retired.size} supersedes: rows parsed; the frontmatter parse is wrong`);
  assert.equal(
    retired.get(latest) ?? null,
    null,
    `the head's LATEST pointer names ${latest}, which ${retired.get(latest)} declares it supersedes`
  );
});

test("the head's LATEST pointer names the handoff that entered git most recently", async () => {
  // The git half. `ls docs/handoffs/` orders by the stamp a session TYPED, and
  // twice that stamp was the UTC time wearing a -0400 label. Commit order is
  // the fact the stamp is a claim about, so this is the assertion that would
  // have caught both, and the one the head asks every session to make by hand.
  const handoffs = await committedHandoffs();
  const instants = await firstCommitInstants();
  const latest = latestPointerTarget(handoffText);
  assert.ok(latest !== null, "the head has no `**LATEST:` marker linking a handoff");

  if (instants === null) {
    // No derivable history. Say which check ran, rather than reporting a pass
    // that sounds like the stronger one.
    assert.ok(
      handoffs.includes(latest),
      `git history is not derivable here, so only the git-free check ran: ` +
      `the head's LATEST pointer names ${latest}, which is not a committed handoff`
    );
    return;
  }

  const newest = [...instants.entries()].sort((a, b) => a[1] - b[1]).at(-1)[0];
  assert.equal(
    latest,
    newest,
    `the head's LATEST pointer names ${latest}, but ${newest} entered git more recently. ` +
    `Either the pointer is stale, or the newer file's stamp is wrong — check with ` +
    `\`git log --date=iso-local -- docs/handoffs/\` and stamp handoffs in LOCAL time.`
  );
});

test("handoff filename stamps sort in the order the files entered git", async () => {
  // `AGENTS.md` tells every session to "read the newest file in
  // docs/handoffs/", so the sort order of the directory listing is an
  // instruction, not a convenience. When a stamp disagrees with its commit,
  // that instruction points at a superseded brief — which has now happened
  // twice, and the second time the head recorded it as "the SECOND time this
  // bug has shipped".
  const instants = await firstCommitInstants();
  if (instants === null) {
    // Nothing to assert without history, and inventing a weaker stand-in here
    // would be a guard that looks like this one and is not.
    assert.ok(
      (await committedHandoffs()).length >= 4,
      "git history is not derivable here, so the stamp-order check did not run"
    );
    return;
  }

  const byName = [...instants.keys()].sort();
  const inverted = byName.filter((name, index) => index > 0 && instants.get(name) < instants.get(byName[index - 1]));

  const unexpected = inverted.filter((name) => !(name in KNOWN_STAMP_INVERSIONS));
  assert.deepEqual(
    unexpected,
    [],
    "these handoffs sort AFTER a file that entered git later, so `ls docs/handoffs/` now points the " +
    "next session at a superseded brief. Stamp handoffs in LOCAL time; check with " +
    "`git log --date=iso-local` BEFORE committing one."
  );

  // Self-cleaning: an allowance that has stopped being an inversion is a lie
  // about the corpus, and this file's whole subject is guidance that outlived
  // its cause.
  const stale = Object.keys(KNOWN_STAMP_INVERSIONS).filter((name) => !inverted.includes(name));
  assert.deepEqual(
    stale,
    [],
    "KNOWN_STAMP_INVERSIONS lists handoffs that no longer invert the ordering; delete those entries"
  );
});

test("every committed handoff has a row in the handoffs index", async () => {
  // The index lost a row once already — the 14:43 handoff was never added, so
  // the index's newest row was the second-newest handoff. Derived from a
  // directory listing rather than a count, so a handoff added without a row
  // fails by name.
  const index = await readText(path.join(HANDOFFS_DIR, "README.md"));
  const missing = (await committedHandoffs()).filter((name) => !index.includes(name));
  assert.deepEqual(missing, [], "handoffs with no row in docs/handoffs/README.md");
});

test("the doc parse survives a CRLF checkout, which is what Windows produces", async () => {
  // Reproduces the Windows condition from a LF tree, so this stays covered on
  // the machine that cannot produce it naturally. Without the normalisation in
  // `readText`, `headingOffset` returns -1 here and both assertions below fail
  // with "is missing from HANDOFF.md" while the heading is present.
  const lf = (await readFile(HANDOFF_PATH, "utf8")).replace(/\r\n/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.ok(crlf.includes("\r\n"), "the CRLF fixture was not actually converted");
  assert.notEqual(crlf, lf, "HANDOFF.md is already CRLF on disk; this test proves nothing");

  const normalised = crlf.replace(/\r\n/g, "\n");
  assert.equal(normalised, lf, "normalising a CRLF copy must reproduce the LF text exactly");
  assert.notEqual(
    headingOffset(normalised, MAP_HEADING),
    -1,
    "the reading map heading is unfindable after a CRLF round trip"
  );
  // And the raw CRLF text is genuinely hostile, so the assertion above is not
  // passing for free.
  assert.equal(headingOffset(crlf, MAP_HEADING), -1, "CRLF text no longer breaks the raw lookup");
});

test("the living head's reading map is present, and above the archive line", () => {
  const mapAt = headingOffset(handoffText, MAP_HEADING);
  const archiveAt = headingOffset(handoffText, ARCHIVE_LINE);
  assert.notEqual(mapAt, -1, `${MAP_HEADING} is missing from HANDOFF.md`);
  assert.notEqual(archiveAt, -1, `${ARCHIVE_LINE} is missing from HANDOFF.md`);
  // Below the archive line it would be frozen history rather than live
  // guidance, and the head's own rule is that a live instruction down there
  // must be hoisted rather than corrected in place.
  assert.ok(mapAt < archiveAt, "the reading map is below the archive line, where it is frozen");
});

test("every section the reading map names resolves to a real heading", async () => {
  const mapAt = headingOffset(handoffText, MAP_HEADING);
  assert.notEqual(mapAt, -1, `${MAP_HEADING} is missing from HANDOFF.md`);
  const nextHeadingAt = handoffText.indexOf("\n## ", mapAt + MAP_HEADING.length);
  assert.notEqual(nextHeadingAt, -1, "the reading map is the last section; expected another after it");
  const map = handoffText.slice(mapAt, nextHeadingAt);

  const cited = citedSections(map);
  assert.ok(
    cited.length >= 8,
    `the map cites only ${cited.length} sections; the extraction regex has probably stopped matching`
  );

  const known = headingsIn(handoffText);
  for (const name of await readdir(HANDOFFS_DIR)) {
    if (!name.endsWith(".md")) continue;
    for (const heading of headingsIn(await readText(path.join(HANDOFFS_DIR, name)))) {
      known.add(heading);
    }
  }
  assert.ok(known.size > 20, `only ${known.size} headings resolved; the heading parse is wrong`);

  const dangling = [...new Set(cited)].filter((name) => !known.has(name));
  assert.deepEqual(
    dangling,
    [],
    "the reading map names sections that do not exist in HANDOFF.md or any committed handoff. " +
    "A map that is followed and dead-ends is worse than no map; rename the reference, or restore " +
    "the section."
  );
});
