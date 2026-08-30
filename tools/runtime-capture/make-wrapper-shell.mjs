/**
 * Assembles the independently authored FWS v8 shell that FFDec compiles the
 * capture wrapper into (tools/runtime-capture/build-wrapper.ps1). The shell
 * contains one placeholder DoAction on frame 1; script import replaces it
 * with ss2-capture-wrapper.as. No game content is involved.
 *
 * Usage: node tools/runtime-capture/make-wrapper-shell.mjs [outPath]
 * Default output: captures/wrapper/wrapper-shell.swf (ignored by Git).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(SCRIPT_DIR, "..", "..", "captures", "wrapper", "wrapper-shell.swf");

function pushString(text) {
  const bytes = Buffer.from(text, "ascii");
  const body = Buffer.concat([Buffer.from([0]), bytes, Buffer.from([0])]);
  const header = Buffer.alloc(3);
  header[0] = 0x96;
  header.writeUInt16LE(body.length, 1);
  return Buffer.concat([header, body]);
}

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

// 640x420 px, matching the licensed SS2 header rect exactly — level 0 (this
// shell) defines the stage, and a smaller stage crops the game's UI.
function stageRect() {
  const bits = [];
  const pushBits = (value, count) => {
    for (let index = count - 1; index >= 0; index -= 1) bits.push((value >> index) & 1);
  };
  pushBits(15, 5);
  pushBits(0, 15);
  pushBits(12800, 15);
  pushBits(0, 15);
  pushBits(8400, 15);
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes = Buffer.alloc(bits.length / 8);
  bits.forEach((bit, index) => {
    if (bit) bytes[index >> 3] |= 0x80 >> (index & 7);
  });
  return bytes;
}

const actions = Buffer.concat([
  pushString("WRAPPER-SHELL-PLACEHOLDER"),
  Buffer.from([0x26]), // ActionTrace
  Buffer.from([0x00]) // ActionEnd
]);

const body = Buffer.concat([
  stageRect(),
  Buffer.from([0x00, 0x1e]), // 30 fps, matching the game's frame rate
  Buffer.from([0x01, 0x00]), // 1 frame
  tag(9, Buffer.from([0x00, 0x00, 0x00])), // black background
  tag(12, actions),
  tag(1, Buffer.alloc(0)),
  tag(0, Buffer.alloc(0))
]);

const header = Buffer.alloc(8);
header.write("FWS", 0, "ascii");
header[3] = 8; // SWF v8: DefineFunction2/registers available to the compiler
header.writeUInt32LE(8 + body.length, 4);

const outPath = process.argv[2] ?? DEFAULT_OUT;
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, Buffer.concat([header, body]));
console.log(`Wrote ${outPath} (${8 + body.length} bytes)`);
