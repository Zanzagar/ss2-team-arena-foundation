/**
 * Assembles a minimal, fully independently authored AVM1 SWF whose only
 * behavior is to trace two fixed lines. It exists to validate the Ruffle
 * trace-capture channel (RUST_LOG=avm_trace) before any wrapper trace is
 * trusted. No game content is involved in any way.
 *
 * Usage: node tools/runtime-capture/make-smoke-swf.mjs [outPath]
 * Default output: captures/smoke/trace-smoke.swf (ignored by Git).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(SCRIPT_DIR, "..", "..", "captures", "smoke", "trace-smoke.swf");

function pushString(text) {
  const bytes = Buffer.from(text, "ascii");
  // ActionPush (0x96): length, then type 0 (string) + NUL-terminated text.
  const body = Buffer.concat([Buffer.from([0]), bytes, Buffer.from([0])]);
  const header = Buffer.alloc(3);
  header[0] = 0x96;
  header.writeUInt16LE(body.length, 1);
  return Buffer.concat([header, body]);
}

const ACTION_TRACE = Buffer.from([0x26]);
const ACTION_END = Buffer.from([0x00]);

function tag(code, body) {
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

// 550x400 px stage: RECT with nbits=15, values in twips.
function stageRect() {
  const bits = [];
  const pushBits = (value, count) => {
    for (let index = count - 1; index >= 0; index -= 1) bits.push((value >> index) & 1);
  };
  pushBits(15, 5);
  pushBits(0, 15);
  pushBits(11000, 15);
  pushBits(0, 15);
  pushBits(8000, 15);
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes = Buffer.alloc(bits.length / 8);
  bits.forEach((bit, index) => {
    if (bit) bytes[index >> 3] |= 0x80 >> (index & 7);
  });
  return bytes;
}

const actions = Buffer.concat([
  pushString("SS2-CAPTURE-SMOKE-OK line 1"),
  ACTION_TRACE,
  pushString("{\"t\":\"meta\",\"smoke\":true}"),
  ACTION_TRACE,
  ACTION_END
]);

const body = Buffer.concat([
  stageRect(),
  Buffer.from([0x00, 0x0c]), // 12 fps (8.8 fixed, little-endian)
  Buffer.from([0x01, 0x00]), // 1 frame
  tag(9, Buffer.from([0xff, 0xff, 0xff])), // SetBackgroundColor white
  tag(12, actions), // DoAction
  tag(1, Buffer.alloc(0)), // ShowFrame
  tag(0, Buffer.alloc(0)) // End
]);

const header = Buffer.alloc(8);
header.write("FWS", 0, "ascii");
header[3] = 6; // SWF version 6 (AVM1)
header.writeUInt32LE(8 + body.length, 4);

const outPath = process.argv[2] ?? DEFAULT_OUT;
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, Buffer.concat([header, body]));
console.log(`Wrote ${outPath} (${8 + body.length} bytes)`);
