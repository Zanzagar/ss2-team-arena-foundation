/**
 * FrameLabel (tag 43) decoding in the read-only inspector.
 *
 * Every SWF used here is assembled byte by byte in this file from invented
 * names and empty frames. Nothing reads the licensed installation, so the suite
 * runs unchanged on a machine that has never had the game: the point of the
 * decoder is that its output is reproducible, and a test that needed a licensed
 * build to prove it would be exactly the kind of unreproducible claim the
 * decoder exists to retire.
 *
 * The load-bearing assertion is frame attribution. A label belongs to the frame
 * that the *next* ShowFrame displays, timelines are numbered from 1, and a
 * sprite's frames are counted separately from the root's. Getting any of those
 * wrong shifts every future citation by one frame while still looking
 * plausible, so each is pinned separately below, including the case where a
 * sprite's own ShowFrames sit between two root labels.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyseSwfBuffer,
  buildFrameLabelTimelines,
  filterFrameLabelTimelines,
  formatFrameLabelReport,
  frameLabelPayload,
  parseArguments,
  parseFrameLabel
} from "../tools/inspect-swf.mjs";

const INSPECTOR = fileURLToPath(new URL("../tools/inspect-swf.mjs", import.meta.url));

// --- synthetic SWF assembly -------------------------------------------------

function tag(code, body = Buffer.alloc(0)) {
  if (body.length < 0x3f) {
    const header = Buffer.alloc(2);
    header.writeUInt16LE((code << 6) | body.length, 0);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE((code << 6) | 0x3f, 0);
  header.writeUInt32LE(body.length, 2);
  return Buffer.concat([header, body]);
}

function uint16(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value, 0);
  return bytes;
}

const SHOW_FRAME = tag(1);
const END = tag(0);

/** FrameLabel: NUL-terminated name, plus the SWF 6+ named-anchor byte. */
function frameLabel(name, { namedAnchor = false, terminated = true, trailing = null } = {}) {
  const parts = [Buffer.from(name, "utf8")];
  if (terminated) parts.push(Buffer.from([0]));
  if (namedAnchor) parts.push(Buffer.from([1]));
  if (trailing !== null) parts.push(Buffer.from(trailing));
  return tag(43, Buffer.concat(parts));
}

function defineSprite(id, declaredFrames, tags) {
  return tag(39, Buffer.concat([uint16(id), uint16(declaredFrames), ...tags, END]));
}

function exportAssets(entries) {
  const parts = [uint16(entries.length)];
  for (const entry of entries) parts.push(uint16(entry.id), Buffer.from(`${entry.name}\0`, "utf8"));
  return tag(56, Buffer.concat(parts));
}

/** Smallest legal RECT: nbits = 0, so the whole stage rectangle is one byte. */
const EMPTY_RECT = Buffer.from([0x00]);

function buildSwf({ version = 6, frameRate = 30, frameCount = 1, tags = [] } = {}) {
  const body = Buffer.concat([
    EMPTY_RECT,
    uint16(Math.round(frameRate * 256)),
    uint16(frameCount),
    ...tags,
    END
  ]);
  const header = Buffer.alloc(8);
  header.write("FWS", 0, "ascii");
  header[3] = version;
  header.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

function labelsOf(buffer) {
  const { swf, analysis } = analyseSwfBuffer(buffer);
  return { swf, analysis, timelines: buildFrameLabelTimelines(analysis, swf) };
}

function timelineNamed(timelines, name) {
  const found = timelines.find((entry) => entry.timeline === name);
  assert.ok(found, `expected a timeline named ${name}, saw ${timelines.map((entry) => entry.timeline).join(", ")}`);
  return found;
}

const flat = (timeline) => timeline.labels.map((entry) => [entry.label, entry.frame]);
const spans = (timeline) => timeline.labels.map((entry) => [entry.label, entry.frame, entry.spanEnd]);

// --- frame attribution ------------------------------------------------------

test("a label before any ShowFrame is frame 1, not frame 0", () => {
  const { timelines } = labelsOf(buildSwf({ frameCount: 1, tags: [frameLabel("start"), SHOW_FRAME] }));
  assert.deepEqual(flat(timelineNamed(timelines, "root")), [["start", 1]]);
});

test("root labels count one frame per ShowFrame", () => {
  // start | . | middle | . | . | end   ->  frames 1, 3 and 6.
  const swf = buildSwf({
    frameCount: 6,
    tags: [
      frameLabel("start"), SHOW_FRAME,
      SHOW_FRAME,
      frameLabel("middle"), SHOW_FRAME,
      SHOW_FRAME,
      SHOW_FRAME,
      frameLabel("end"), SHOW_FRAME
    ]
  });
  const root = timelineNamed(labelsOf(swf).timelines, "root");
  assert.deepEqual(flat(root), [["start", 1], ["middle", 3], ["end", 6]]);
  assert.equal(root.frameCount, 6);
  assert.equal(root.declaredFrameCount, 6);
});

test("a sprite's labels land on the sprite timeline with their own frame numbers", () => {
  const sprite = defineSprite(7, 4, [
    frameLabel("intro"), SHOW_FRAME,
    SHOW_FRAME,
    frameLabel("menu"), SHOW_FRAME,
    SHOW_FRAME
  ]);
  const { timelines } = labelsOf(buildSwf({
    frameCount: 2,
    tags: [sprite, frameLabel("root_one"), SHOW_FRAME, frameLabel("root_two"), SHOW_FRAME]
  }));
  assert.deepEqual(timelines.map((entry) => entry.timeline), ["root", "sprite:7"]);
  assert.deepEqual(flat(timelineNamed(timelines, "sprite:7")), [["intro", 1], ["menu", 3]]);
  assert.equal(timelineNamed(timelines, "sprite:7").frameCount, 4);
  assert.equal(timelineNamed(timelines, "sprite:7").declaredFrameCount, 4);
});

test("a sprite's ShowFrames do not advance the root's frame counter", () => {
  // The regression this guards: walking the sprite in place would otherwise
  // push `root_two` from frame 2 to frame 5 and silently shift the whole root.
  const sprite = defineSprite(11, 3, [SHOW_FRAME, SHOW_FRAME, SHOW_FRAME]);
  const { timelines } = labelsOf(buildSwf({
    frameCount: 2,
    tags: [frameLabel("root_one"), SHOW_FRAME, sprite, frameLabel("root_two"), SHOW_FRAME]
  }));
  assert.deepEqual(flat(timelineNamed(timelines, "root")), [["root_one", 1], ["root_two", 2]]);
});

test("two sprites keep separate frame counters", () => {
  const first = defineSprite(3, 2, [SHOW_FRAME, frameLabel("second_frame"), SHOW_FRAME]);
  const second = defineSprite(4, 5, [SHOW_FRAME, SHOW_FRAME, SHOW_FRAME, SHOW_FRAME, frameLabel("fifth_frame"), SHOW_FRAME]);
  const { timelines } = labelsOf(buildSwf({ frameCount: 1, tags: [first, second, SHOW_FRAME] }));
  assert.deepEqual(flat(timelineNamed(timelines, "sprite:3")), [["second_frame", 2]]);
  assert.deepEqual(flat(timelineNamed(timelines, "sprite:4")), [["fifth_frame", 5]]);
});

test("a declared frame count that disagrees with the ShowFrames is reported, not corrected", () => {
  const sprite = defineSprite(9, 12, [frameLabel("only"), SHOW_FRAME, SHOW_FRAME]);
  const timeline = timelineNamed(labelsOf(buildSwf({ frameCount: 1, tags: [sprite, SHOW_FRAME] })).timelines, "sprite:9");
  assert.equal(timeline.frameCount, 2);
  assert.equal(timeline.declaredFrameCount, 12);
  assert.match(formatFrameLabelReport([timeline]).join("\n"), /2 frames, declared 12 — MISMATCH/);
});

// --- spans ------------------------------------------------------------------

test("each label spans to the frame before the next label on its timeline", () => {
  const swf = buildSwf({
    frameCount: 8,
    tags: [
      frameLabel("first"), SHOW_FRAME, SHOW_FRAME, SHOW_FRAME,
      frameLabel("second"), SHOW_FRAME, SHOW_FRAME,
      frameLabel("third"), SHOW_FRAME, SHOW_FRAME, SHOW_FRAME
    ]
  });
  const root = timelineNamed(labelsOf(swf).timelines, "root");
  assert.deepEqual(spans(root), [["first", 1, 3], ["second", 4, 5], ["third", 6, 8]]);
  assert.deepEqual(root.labels.map((entry) => entry.spanFrames), [3, 2, 3]);
});

test("the last label's span runs to the last frame of its own timeline", () => {
  const sprite = defineSprite(21, 4, [SHOW_FRAME, frameLabel("tail"), SHOW_FRAME, SHOW_FRAME, SHOW_FRAME]);
  const { timelines } = labelsOf(buildSwf({ frameCount: 9, tags: [sprite, SHOW_FRAME] }));
  // The root is nine frames long; the sprite's tail must stop at the sprite's
  // fourth frame, not borrow the root's length.
  assert.deepEqual(spans(timelineNamed(timelines, "sprite:21")), [["tail", 2, 4]]);
});

test("a label on the final frame owns a one-frame span", () => {
  const swf = buildSwf({ frameCount: 2, tags: [SHOW_FRAME, frameLabel("last"), SHOW_FRAME] });
  const root = timelineNamed(labelsOf(swf).timelines, "root");
  assert.deepEqual(spans(root), [["last", 2, 2]]);
  assert.equal(root.labels[0].spanFrames, 1);
});

test("two labels on one frame do not produce a backwards span", () => {
  const swf = buildSwf({ frameCount: 2, tags: [frameLabel("alpha"), frameLabel("beta"), SHOW_FRAME, SHOW_FRAME] });
  const root = timelineNamed(labelsOf(swf).timelines, "root");
  assert.deepEqual(spans(root), [["alpha", 1, 1], ["beta", 1, 2]]);
  assert.ok(root.labels.every((entry) => entry.spanEnd >= entry.frame));
});

// --- named anchors, empty and malformed labels ------------------------------

test("the SWF 6 named-anchor byte is recognised and kept out of the label", () => {
  const swf = buildSwf({ version: 6, frameCount: 2, tags: [frameLabel("anchored", { namedAnchor: true }), SHOW_FRAME, frameLabel("plain"), SHOW_FRAME] });
  const root = timelineNamed(labelsOf(swf).timelines, "root");
  assert.deepEqual(flat(root), [["anchored", 1], ["plain", 2]]);
  assert.deepEqual(root.labels.map((entry) => entry.namedAnchor), [true, false]);
  assert.deepEqual(root.labels.map((entry) => entry.trailingBytes), [0, 0]);
  assert.match(formatFrameLabelReport([root]).join("\n"), /anchored.*\[named anchor\]/);
});

test("a trailing byte in a SWF 5 file is reported as unexpected, not as an anchor", () => {
  const swf = buildSwf({ version: 5, frameCount: 1, tags: [frameLabel("old_build", { namedAnchor: true }), SHOW_FRAME] });
  const [entry] = timelineNamed(labelsOf(swf).timelines, "root").labels;
  assert.equal(entry.label, "old_build");
  assert.equal(entry.namedAnchor, false);
  assert.equal(entry.trailingBytes, 1);
});

test("an empty label body is decoded as an empty label without throwing", () => {
  const swf = buildSwf({ frameCount: 2, tags: [tag(43), SHOW_FRAME, frameLabel("after"), SHOW_FRAME] });
  const root = timelineNamed(labelsOf(swf).timelines, "root");
  assert.deepEqual(flat(root), [["", 1], ["after", 2]]);
  assert.equal(root.labels[0].truncated, true);
  assert.match(formatFrameLabelReport([root]).join("\n"), /<empty>/);
});

test("a label that is only its terminator is empty but not damaged", () => {
  const swf = buildSwf({ frameCount: 1, tags: [frameLabel(""), SHOW_FRAME] });
  const [entry] = timelineNamed(labelsOf(swf).timelines, "root").labels;
  assert.deepEqual([entry.label, entry.frame, entry.truncated, entry.trailingBytes], ["", 1, false, 0]);
});

test("an unterminated label neither throws nor swallows the labels after it", () => {
  const swf = buildSwf({
    frameCount: 3,
    tags: [frameLabel("no_terminator", { terminated: false }), SHOW_FRAME, SHOW_FRAME, frameLabel("still_read"), SHOW_FRAME]
  });
  const root = timelineNamed(labelsOf(swf).timelines, "root");
  assert.deepEqual(flat(root), [["no_terminator", 1], ["still_read", 3]]);
  assert.deepEqual(root.labels.map((entry) => entry.truncated), [true, false]);
  assert.match(formatFrameLabelReport([root]).join("\n"), /unterminated string/);
});

test("unexpected trailing bytes are counted rather than folded into the label", () => {
  const swf = buildSwf({ frameCount: 1, tags: [frameLabel("padded", { trailing: [7, 7] }), SHOW_FRAME] });
  const [entry] = timelineNamed(labelsOf(swf).timelines, "root").labels;
  assert.equal(entry.label, "padded");
  assert.equal(entry.trailingBytes, 2);
  assert.equal(entry.namedAnchor, false);
});

test("parseFrameLabel tolerates a body that runs past the end of the buffer", () => {
  const buffer = Buffer.from("abc", "utf8");
  assert.deepEqual(parseFrameLabel(buffer, 0, buffer.length, 6), {
    label: "abc",
    namedAnchor: false,
    truncated: true,
    trailingBytes: 0
  });
  assert.deepEqual(parseFrameLabel(buffer, 3, 3, 6), { label: "", namedAnchor: false, truncated: true, trailingBytes: 0 });
});

test("label text is read as UTF-8", () => {
  const swf = buildSwf({ frameCount: 1, tags: [frameLabel("étape_één"), SHOW_FRAME] });
  assert.deepEqual(flat(timelineNamed(labelsOf(swf).timelines, "root")), [["étape_één", 1]]);
});

// --- naming, ordering and filtering ----------------------------------------

test("exported sprite names are resolved for display and ordering puts the root first", () => {
  const swf = buildSwf({
    frameCount: 1,
    tags: [
      defineSprite(40, 1, [frameLabel("late"), SHOW_FRAME]),
      defineSprite(8, 1, [frameLabel("early"), SHOW_FRAME]),
      exportAssets([{ id: 8, name: "widget_clip" }]),
      frameLabel("root_label"),
      SHOW_FRAME
    ]
  });
  const timelines = labelsOf(swf).timelines;
  assert.deepEqual(timelines.map((entry) => entry.display), ["root", "sprite:8[widget_clip]", "sprite:40"]);
  assert.deepEqual(timelineNamed(timelines, "sprite:8").names, ["widget_clip"]);
});

test("filtering by label keeps each label's full span", () => {
  const swf = buildSwf({
    frameCount: 9,
    tags: [
      frameLabel("menu_open"), SHOW_FRAME, SHOW_FRAME, SHOW_FRAME,
      frameLabel("fight_start"), SHOW_FRAME, SHOW_FRAME,
      frameLabel("menu_close"), SHOW_FRAME, SHOW_FRAME, SHOW_FRAME, SHOW_FRAME
    ]
  });
  const timelines = labelsOf(swf).timelines;
  const filtered = filterFrameLabelTimelines(timelines, { label: "^menu_" });
  assert.deepEqual(spans(filtered[0]), [["menu_open", 1, 3], ["menu_close", 6, 9]]);
});

test("filtering by timeline selects whole timelines and drops the rest", () => {
  const swf = buildSwf({
    frameCount: 1,
    tags: [
      defineSprite(12, 1, [frameLabel("in_twelve"), SHOW_FRAME]),
      defineSprite(13, 1, [frameLabel("in_thirteen"), SHOW_FRAME]),
      exportAssets([{ id: 13, name: "chosen_clip" }]),
      frameLabel("on_root"),
      SHOW_FRAME
    ]
  });
  const timelines = labelsOf(swf).timelines;
  assert.deepEqual(filterFrameLabelTimelines(timelines, { timeline: "^root$" }).map((entry) => entry.timeline), ["root"]);
  assert.deepEqual(filterFrameLabelTimelines(timelines, { timeline: "chosen_clip" }).map((entry) => entry.timeline), ["sprite:13"]);
  assert.deepEqual(filterFrameLabelTimelines(timelines, { timeline: "sprite:12" }).map((entry) => entry.timeline), ["sprite:12"]);
  assert.deepEqual(filterFrameLabelTimelines(timelines, { label: "nothing_matches" }), []);
});

test("the report heading names the filters and the timelines they left out", () => {
  const swf = buildSwf({
    frameCount: 1,
    tags: [defineSprite(5, 1, [frameLabel("kept"), SHOW_FRAME]), frameLabel("dropped"), SHOW_FRAME]
  });
  const timelines = labelsOf(swf).timelines;
  const filtered = filterFrameLabelTimelines(timelines, { label: "kept" });
  const lines = formatFrameLabelReport(filtered, { label: "kept", totalTimelines: timelines.length });
  assert.match(lines[0], /Frame labels \(labels matching \/kept\/i\): 1 across 1 of 2 timelines/);
  assert.match(formatFrameLabelReport(timelines)[0], /Frame labels: 2 across 2 timelines/);
});

test("the JSON payload carries the filters, the counts and the spans", () => {
  const swf = buildSwf({ frameCount: 3, tags: [frameLabel("one"), SHOW_FRAME, frameLabel("two"), SHOW_FRAME, SHOW_FRAME] });
  const timelines = labelsOf(swf).timelines;
  const payload = frameLabelPayload("in-memory.swf", timelines, { label: null, timeline: null, totalTimelines: 1 });
  assert.equal(payload.labelCount, 2);
  assert.equal(payload.timelineCount, 1);
  assert.equal(payload.labelFilter, null);
  assert.deepEqual(payload.timelines[0].labels.map((entry) => [entry.label, entry.frame, entry.spanEnd]), [["one", 1, 1], ["two", 2, 3]]);
});

// --- tag accounting ---------------------------------------------------------

test("every FrameLabel tag in the file turns into exactly one decoded label", () => {
  const swf = buildSwf({
    frameCount: 2,
    tags: [
      defineSprite(2, 2, [frameLabel("a"), SHOW_FRAME, frameLabel("b"), SHOW_FRAME]),
      frameLabel("c"), SHOW_FRAME, frameLabel("d"), SHOW_FRAME
    ]
  });
  const { analysis, timelines } = labelsOf(swf);
  const decoded = timelines.reduce((total, entry) => total + entry.labels.length, 0);
  assert.equal(analysis.tagCounts.get(43), 4);
  assert.equal(decoded, 4);
});

// --- argument parsing -------------------------------------------------------

test("--labels is a query mode and cannot be combined with the other query modes", () => {
  assert.deepEqual(parseArguments(["movie.swf", "--labels"]).labels, { filter: null });
  assert.throws(
    () => parseArguments(["movie.swf", "--labels", "--search", "x"]),
    /Use only one of --search, --function, --function-names, --references, or --labels\./
  );
  assert.throws(
    () => parseArguments(["movie.swf", "--references", "x", "--labels"]),
    /Use only one of/
  );
});

test("--labels takes an optional filter and never eats the file argument", () => {
  assert.equal(parseArguments(["movie.swf", "--labels", "combat"]).labels.filter, "combat");
  assert.equal(parseArguments(["movie.swf", "--labels", "--json"]).labels.filter, null);
  assert.equal(parseArguments(["movie.swf", "--labels", "--json"]).json, true);
  const fileLast = parseArguments(["--labels", "movie.swf"]);
  assert.equal(fileLast.file, "movie.swf");
  assert.equal(fileLast.labels.filter, null);
});

test("--timeline only makes sense with --labels", () => {
  assert.equal(parseArguments(["movie.swf", "--labels", "--timeline", "sprite:5"]).timeline, "sprite:5");
  assert.throws(() => parseArguments(["movie.swf", "--timeline", "sprite:5"]), /--timeline can only be used with --labels\./);
  assert.throws(() => parseArguments(["movie.swf", "--references", "x", "--around", "2", "--timeline", "y"]), /--timeline can only be used with --labels\./);
});

test("the pre-existing modes and their guards are unchanged", () => {
  assert.equal(parseArguments(["movie.swf", "--search", "x"]).search, "x");
  assert.equal(parseArguments(["movie.swf", "--references", "x", "--around", "3"]).around, 3);
  assert.equal(parseArguments([]), null);
  assert.throws(() => parseArguments(["movie.swf", "--around", "3"]), /--around can only be used with --references\./);
  assert.throws(() => parseArguments(["movie.swf", "--max-actions", "0"]), /--max-actions must be a positive integer\./);
  assert.throws(() => parseArguments(["movie.swf", "--search", "x", "--function", "y"]), /Use only one of/);
});

// --- command line -----------------------------------------------------------

const workspace = mkdtempSync(path.join(os.tmpdir(), "ss2-inspect-swf-"));
after(() => rmSync(workspace, { recursive: true, force: true }));

function writeSwf(name, buffer) {
  const target = path.join(workspace, name);
  writeFileSync(target, buffer);
  return target;
}

const CLI_SWF = writeSwf("labels.swf", buildSwf({
  frameCount: 4,
  tags: [
    defineSprite(6, 3, [frameLabel("clip_start"), SHOW_FRAME, SHOW_FRAME, frameLabel("clip_end"), SHOW_FRAME]),
    exportAssets([{ id: 6, name: "sample_clip" }]),
    frameLabel("root_start"), SHOW_FRAME, SHOW_FRAME,
    frameLabel("root_end"), SHOW_FRAME, SHOW_FRAME
  ]
}));

const runInspector = (...args) => execFileSync(process.execPath, [INSPECTOR, ...args], { encoding: "utf8" });

test("the CLI prints labels, frames and spans per timeline", () => {
  const output = runInspector(CLI_SWF, "--labels");
  assert.match(output, /Frame labels: 4 across 2 timelines/);
  assert.match(output, /\[root\] 4 frames, declared 4/);
  assert.match(output, /root_start\s+frame\s+1\s+span 1-2 \(2 frames\)/);
  assert.match(output, /root_end\s+frame\s+3\s+span 3-4 \(2 frames\)/);
  assert.match(output, /\[sprite:6\[sample_clip\]\] 3 frames, declared 3/);
  assert.match(output, /clip_end\s+frame\s+3\s+span 3-3 \(1 frame\)/);
});

test("the CLI filters labels and timelines", () => {
  const byLabel = runInspector(CLI_SWF, "--labels", "^root_");
  assert.match(byLabel, /Frame labels \(labels matching \/\^root_\/i\): 2 across 1 of 2 timelines/);
  assert.doesNotMatch(byLabel, /clip_start/);
  const byTimeline = runInspector(CLI_SWF, "--labels", "--timeline", "sample_clip");
  assert.match(byTimeline, /timelines matching \/sample_clip\/i/);
  assert.doesNotMatch(byTimeline, /root_start/);
});

test("--labels --json emits the same decode as a JSON payload", () => {
  const payload = JSON.parse(runInspector(CLI_SWF, "--labels", "--json"));
  assert.equal(payload.labelCount, 4);
  assert.equal(payload.timelineCount, 2);
  assert.equal(payload.file, CLI_SWF);
  assert.deepEqual(payload.timelines.map((entry) => entry.timeline), ["root", "sprite:6"]);
  assert.deepEqual(
    payload.timelines[1].labels.map((entry) => [entry.label, entry.frame, entry.spanEnd, entry.spanFrames]),
    [["clip_start", 1, 2, 2], ["clip_end", 3, 3, 1]]
  );
});

test("--json without --labels still prints the plain summary", () => {
  const summary = JSON.parse(runInspector(CLI_SWF, "--json"));
  assert.equal(summary.frameCount, 4);
  assert.equal(summary.timelines, undefined);
  assert.equal(summary.labelCount, undefined);
  assert.deepEqual(summary.sprites.map((entry) => entry.id), [6]);
  assert.ok(summary.tagCounts.some((entry) => entry.code === 43 && entry.name === "FrameLabel" && entry.count === 4));
});

test("the summary header is still printed ahead of a label query", () => {
  const output = runInspector(CLI_SWF, "--labels");
  const lines = output.split(/\r?\n/);
  assert.match(lines[0], /^SWF: /);
  assert.match(lines[2], /^Movie: 30 fps, 4 root frames/);
  assert.match(lines[4], /^Tags: .*FrameLabel=4/);
});

test("the CLI refuses two query modes at once and reports usage", () => {
  assert.throws(
    () => execFileSync(process.execPath, [INSPECTOR, CLI_SWF, "--labels", "--search", "x"], { encoding: "utf8", stdio: "pipe" }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), /Use only one of/);
      return true;
    }
  );
});
