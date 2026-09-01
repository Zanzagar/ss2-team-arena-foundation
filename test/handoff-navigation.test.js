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
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("the head's \"Latest\" pointer names the newest committed handoff", async () => {
  // This has gone stale twice, both times the same way: a session lands a
  // handoff and the pointer keeps naming the previous one, so AGENTS.md sends
  // the next reader to "read the newest file in docs/handoffs/" while the head
  // names a different file as latest. It went stale again the moment a
  // concurrent session pushed a newer handoff without touching the head, which
  // is the case no amount of care by one author prevents.
  const handoffs = await committedHandoffs();
  assert.ok(handoffs.length >= 4, `only ${handoffs.length} handoffs matched the stamp pattern`);
  const newest = handoffs.at(-1);

  const linked = [...handoffText.matchAll(/\(docs\/handoffs\/([^)]+\.md)\)/g)].map((match) => match[1]);
  assert.ok(linked.length > 0, "the head links no handoff at all");
  assert.ok(
    linked.includes(newest),
    `the head's Latest pointer names ${linked.filter((name) => HANDOFF_STAMP.test(name)).join(", ") || "no handoff"}, ` +
    `but the newest committed handoff is ${newest}`
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
