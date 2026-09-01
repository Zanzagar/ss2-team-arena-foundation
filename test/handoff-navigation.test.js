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

const handoffText = await readFile(HANDOFF_PATH, "utf8");

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
    for (const heading of headingsIn(await readFile(path.join(HANDOFFS_DIR, name), "utf8"))) {
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
