#!/usr/bin/env node

/**
 * Read-only SWF metadata and AVM1 action inspector.
 *
 * This tool intentionally does not export scripts, images, sounds, or other
 * embedded assets. It reads a local SWF in memory and prints authored metadata
 * that is useful when building an interoperability map: symbol names, character
 * ids, instruction offsets, and frame labels with the frame spans they own.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const TAG_NAMES = new Map([
  [0, "End"],
  [1, "ShowFrame"],
  [7, "DefineButton"],
  [12, "DoAction"],
  [26, "PlaceObject2"],
  [34, "DefineButton2"],
  [37, "DefineEditText"],
  [39, "DefineSprite"],
  [43, "FrameLabel"],
  [56, "ExportAssets"],
  [59, "DoInitAction"],
  [70, "PlaceObject3"],
  [76, "SymbolClass"],
  [82, "DoABC"]
]);

const ACTION_NAMES = new Map([
  [0x00, "End"], [0x04, "NextFrame"], [0x05, "PreviousFrame"],
  [0x06, "Play"], [0x07, "Stop"], [0x08, "ToggleQuality"],
  [0x09, "StopSounds"], [0x0a, "Add"], [0x0b, "Subtract"],
  [0x0c, "Multiply"], [0x0d, "Divide"], [0x0e, "Equals"],
  [0x0f, "Less"], [0x10, "And"], [0x11, "Or"], [0x12, "Not"],
  [0x13, "StringEquals"], [0x14, "StringLength"], [0x15, "StringExtract"],
  [0x17, "Pop"], [0x18, "ToInteger"], [0x1c, "GetVariable"],
  [0x1d, "SetVariable"], [0x20, "SetTarget2"], [0x21, "StringAdd"],
  [0x22, "GetProperty"], [0x23, "SetProperty"], [0x24, "CloneSprite"],
  [0x25, "RemoveSprite"], [0x26, "Trace"], [0x27, "StartDrag"],
  [0x28, "EndDrag"], [0x29, "StringLess"], [0x2a, "Throw"],
  [0x2b, "CastOp"], [0x2c, "ImplementsOp"], [0x30, "RandomNumber"],
  [0x31, "MBStringLength"], [0x32, "CharToAscii"], [0x33, "AsciiToChar"],
  [0x34, "GetTime"], [0x35, "MBStringExtract"], [0x36, "MBCharToAscii"],
  [0x37, "MBAsciiToChar"], [0x3a, "Delete"], [0x3b, "Delete2"],
  [0x3c, "DefineLocal"], [0x3d, "CallFunction"], [0x3e, "Return"],
  [0x3f, "Modulo"], [0x40, "NewObject"], [0x41, "DefineLocal2"],
  [0x42, "InitArray"], [0x43, "InitObject"], [0x44, "TypeOf"],
  [0x45, "TargetPath"], [0x46, "Enumerate"], [0x47, "Add2"],
  [0x48, "Less2"], [0x49, "Equals2"], [0x4a, "ToNumber"],
  [0x4b, "ToString"], [0x4c, "Duplicate"], [0x4d, "Swap"],
  [0x4e, "GetMember"], [0x4f, "SetMember"], [0x50, "Increment"],
  [0x51, "Decrement"], [0x52, "CallMethod"], [0x53, "NewMethod"],
  [0x54, "InstanceOf"], [0x55, "Enumerate2"], [0x60, "BitAnd"],
  [0x61, "BitOr"], [0x62, "BitXor"], [0x63, "BitLShift"],
  [0x64, "BitRShift"], [0x65, "BitURShift"], [0x66, "StrictEquals"],
  [0x67, "Greater"], [0x68, "StringGreater"], [0x69, "Extends"],
  [0x81, "GotoFrame"], [0x83, "GetURL"], [0x87, "StoreRegister"],
  [0x88, "ConstantPool"], [0x89, "StrictMode"], [0x8a, "WaitForFrame"],
  [0x8b, "SetTarget"], [0x8c, "GoToLabel"], [0x8d, "WaitForFrame2"],
  [0x8e, "DefineFunction2"], [0x8f, "Try"], [0x94, "With"],
  [0x96, "Push"], [0x99, "Jump"], [0x9a, "GetURL2"],
  [0x9b, "DefineFunction"], [0x9d, "If"], [0x9e, "Call"],
  [0x9f, "GotoFrame2"]
]);

function usage(message) {
  if (message) console.error(message);
  console.error("Usage: node tools/inspect-swf.mjs <file.swf> [--search <regex> | --function <regex> | --function-names <regex> | --references <regex> | --labels [regex]] [--around <n>] [--timeline <regex>] [--max-actions <n>] [--json]");
  process.exitCode = 2;
}

export function parseArguments(argv) {
  const options = { file: null, search: null, function: null, functionNames: null, references: null, labels: null, timeline: null, around: 0, maxActions: 240, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--search") options.search = argv[++index];
    else if (value === "--function") options.function = argv[++index];
    else if (value === "--function-names") options.functionNames = argv[++index];
    else if (value === "--references") options.references = argv[++index];
    else if (value === "--labels") {
      // The regex is optional: `--labels` alone lists every timeline's labels.
      // The next token is only taken as the filter once the positional file
      // argument is already known, so `--labels <file.swf>` still means "list
      // every label in that file" rather than silently filtering by a path.
      const next = argv[index + 1];
      const takesFilter = options.file !== null && typeof next === "string" && !next.startsWith("-");
      options.labels = { filter: takesFilter ? argv[++index] : null };
    } else if (value === "--timeline") options.timeline = argv[++index];
    else if (value === "--around") options.around = Number(argv[++index]);
    else if (value === "--max-actions") options.maxActions = Number(argv[++index]);
    else if (value === "--json") options.json = true;
    else if (!options.file) options.file = value;
    else throw new Error(`Unexpected argument: ${value}`);
  }
  if (!options.file) return null;
  if ([options.search, options.function, options.functionNames, options.references, options.labels].filter(Boolean).length > 1) {
    throw new Error("Use only one of --search, --function, --function-names, --references, or --labels.");
  }
  if (!Number.isInteger(options.maxActions) || options.maxActions < 1) throw new Error("--max-actions must be a positive integer.");
  if (!Number.isInteger(options.around) || options.around < 0) throw new Error("--around must be a non-negative integer.");
  if (options.around && !options.references) throw new Error("--around can only be used with --references.");
  if (options.timeline !== null && !options.labels) throw new Error("--timeline can only be used with --labels.");
  return options;
}

function readCString(buffer, start, end = buffer.length) {
  let cursor = start;
  while (cursor < end && buffer[cursor] !== 0) cursor += 1;
  return {
    value: buffer.toString("utf8", start, cursor),
    next: Math.min(cursor + 1, end)
  };
}

class BitCursor {
  constructor(buffer, byteOffset) {
    this.buffer = buffer;
    this.bitOffset = byteOffset * 8;
  }

  readUnsigned(count) {
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const byte = this.buffer[this.bitOffset >> 3];
      const bit = (byte >> (7 - (this.bitOffset & 7))) & 1;
      value = value * 2 + bit;
      this.bitOffset += 1;
    }
    return value;
  }

  align() {
    this.bitOffset = Math.ceil(this.bitOffset / 8) * 8;
  }

  get byteOffset() {
    return Math.ceil(this.bitOffset / 8);
  }
}

function skipRect(buffer, start) {
  const bits = new BitCursor(buffer, start);
  const width = bits.readUnsigned(5);
  bits.readUnsigned(width * 4);
  bits.align();
  return bits.byteOffset;
}

function skipMatrix(buffer, start) {
  const bits = new BitCursor(buffer, start);
  if (bits.readUnsigned(1)) {
    const width = bits.readUnsigned(5);
    bits.readUnsigned(width * 2);
  }
  if (bits.readUnsigned(1)) {
    const width = bits.readUnsigned(5);
    bits.readUnsigned(width * 2);
  }
  const translateWidth = bits.readUnsigned(5);
  bits.readUnsigned(translateWidth * 2);
  bits.align();
  return bits.byteOffset;
}

function skipColorTransform(buffer, start, withAlpha = true) {
  const bits = new BitCursor(buffer, start);
  const hasAdd = bits.readUnsigned(1);
  const hasMultiply = bits.readUnsigned(1);
  const width = bits.readUnsigned(4);
  const channelCount = withAlpha ? 4 : 3;
  if (hasMultiply) bits.readUnsigned(width * channelCount);
  if (hasAdd) bits.readUnsigned(width * channelCount);
  bits.align();
  return bits.byteOffset;
}

function normaliseSwf(input) {
  const signature = input.toString("ascii", 0, 3);
  if (signature === "FWS") return { buffer: input, compression: "none" };
  if (signature === "CWS") {
    const output = Buffer.concat([Buffer.from("FWS", "ascii"), input.subarray(3, 8), zlib.inflateSync(input.subarray(8))]);
    return { buffer: output, compression: "zlib" };
  }
  if (signature === "ZWS") throw new Error("LZMA-compressed ZWS files are not supported by this read-only inspector.");
  throw new Error(`Not a SWF file (signature ${JSON.stringify(signature)}).`);
}

function parsePushValues(buffer, start, end, constantPool) {
  const values = [];
  let cursor = start;
  while (cursor < end) {
    const type = buffer[cursor++];
    if (type === 0) {
      const parsed = readCString(buffer, cursor, end);
      values.push({ type: "string", value: parsed.value });
      cursor = parsed.next;
    } else if (type === 1 && cursor + 4 <= end) {
      values.push({ type: "float", value: buffer.readFloatLE(cursor) });
      cursor += 4;
    } else if (type === 2) values.push({ type: "null", value: null });
    else if (type === 3) values.push({ type: "undefined", value: "undefined" });
    else if (type === 4 && cursor < end) values.push({ type: "register", value: buffer[cursor++] });
    else if (type === 5 && cursor < end) values.push({ type: "boolean", value: buffer[cursor++] !== 0 });
    else if (type === 6 && cursor + 8 <= end) {
      const reordered = Buffer.concat([buffer.subarray(cursor + 4, cursor + 8), buffer.subarray(cursor, cursor + 4)]);
      values.push({ type: "double", value: reordered.readDoubleLE(0) });
      cursor += 8;
    } else if (type === 7 && cursor + 4 <= end) {
      values.push({ type: "integer", value: buffer.readInt32LE(cursor) });
      cursor += 4;
    } else if (type === 8 && cursor < end) {
      const index = buffer[cursor++];
      values.push({ type: "constant", index, value: constantPool[index] });
    } else if (type === 9 && cursor + 2 <= end) {
      const index = buffer.readUInt16LE(cursor);
      cursor += 2;
      values.push({ type: "constant", index, value: constantPool[index] });
    } else {
      values.push({ type: `unknown-${type}`, value: null });
      break;
    }
  }
  return values;
}

function parseFunction(buffer, start, payloadEnd, sequenceEnd, version2, constantPool, context) {
  let cursor = start;
  const named = readCString(buffer, cursor, payloadEnd);
  cursor = named.next;
  if (cursor + 2 > payloadEnd) return { definition: { name: named.value, parameters: [], body: [] }, nextOffset: payloadEnd };
  const parameterCount = buffer.readUInt16LE(cursor);
  cursor += 2;
  const parameters = [];
  let registerCount = null;
  let flags = null;
  if (version2) {
    registerCount = buffer[cursor++];
    flags = buffer.readUInt16LE(cursor);
    cursor += 2;
    for (let index = 0; index < parameterCount && cursor < payloadEnd; index += 1) {
      const register = buffer[cursor++];
      const parsed = readCString(buffer, cursor, payloadEnd);
      cursor = parsed.next;
      parameters.push({ register, name: parsed.value });
    }
  } else {
    for (let index = 0; index < parameterCount && cursor < payloadEnd; index += 1) {
      const parsed = readCString(buffer, cursor, payloadEnd);
      cursor = parsed.next;
      parameters.push({ name: parsed.value });
    }
  }
  if (cursor + 2 > payloadEnd) {
    return { definition: { name: named.value, parameters, registerCount, flags, body: [] }, nextOffset: payloadEnd };
  }
  const codeSize = buffer.readUInt16LE(cursor);
  const codeStart = payloadEnd;
  const codeEnd = Math.min(codeStart + codeSize, sequenceEnd);
  return {
    definition: {
      name: named.value,
      parameters,
      registerCount,
      flags,
      body: decodeActions(buffer, codeStart, codeEnd, [...constantPool], `${context}/function:${named.value || "<anonymous>"}`)
    },
    nextOffset: codeEnd
  };
}

function parseTry(buffer, start, payloadEnd, sequenceEnd, constantPool, context) {
  let cursor = start;
  const flags = buffer[cursor++];
  if (cursor + 6 > payloadEnd) return { operand: { flags, bodies: [] }, nextOffset: payloadEnd };
  const trySize = buffer.readUInt16LE(cursor);
  const catchSize = buffer.readUInt16LE(cursor + 2);
  const finallySize = buffer.readUInt16LE(cursor + 4);
  cursor += 6;
  let catchTarget;
  if (flags & 0x04) catchTarget = { register: buffer[cursor++] };
  else {
    const parsed = readCString(buffer, cursor, payloadEnd);
    cursor = parsed.next;
    catchTarget = { name: parsed.value };
  }
  const bodyStart = payloadEnd;
  const tryEnd = Math.min(bodyStart + trySize, sequenceEnd);
  const catchEnd = Math.min(tryEnd + catchSize, sequenceEnd);
  const finallyEnd = Math.min(catchEnd + finallySize, sequenceEnd);
  return {
    operand: {
      flags,
      catchTarget,
      bodies: [
      { kind: "try", body: decodeActions(buffer, bodyStart, tryEnd, [...constantPool], `${context}/try`) },
      { kind: "catch", body: decodeActions(buffer, tryEnd, catchEnd, [...constantPool], `${context}/catch`) },
      { kind: "finally", body: decodeActions(buffer, catchEnd, finallyEnd, [...constantPool], `${context}/finally`) }
      ]
    },
    nextOffset: finallyEnd
  };
}

function decodeActions(buffer, start, end, initialPool = [], context = "actions") {
  const instructions = [];
  let constantPool = initialPool;
  let cursor = start;
  while (cursor < end) {
    const offset = cursor;
    const opcode = buffer[cursor++];
    let length = 0;
    if (opcode >= 0x80) {
      if (cursor + 2 > end) break;
      length = buffer.readUInt16LE(cursor);
      cursor += 2;
    }
    const payloadStart = cursor;
    const payloadEnd = Math.min(payloadStart + length, end);
    let nextOffset = payloadEnd;
    const instruction = {
      offset,
      opcode,
      name: ACTION_NAMES.get(opcode) ?? `Action0x${opcode.toString(16).padStart(2, "0")}`
    };
    if (opcode === 0x88 && payloadStart + 2 <= payloadEnd) {
      const count = buffer.readUInt16LE(payloadStart);
      let poolCursor = payloadStart + 2;
      const nextPool = [];
      for (let index = 0; index < count && poolCursor < payloadEnd; index += 1) {
        const parsed = readCString(buffer, poolCursor, payloadEnd);
        poolCursor = parsed.next;
        nextPool.push(parsed.value);
      }
      constantPool = nextPool;
      instruction.operand = { count };
    } else if (opcode === 0x96) {
      instruction.operand = parsePushValues(buffer, payloadStart, payloadEnd, constantPool);
    } else if (opcode === 0x8e) {
      const parsed = parseFunction(buffer, payloadStart, payloadEnd, end, true, constantPool, context);
      instruction.operand = parsed.definition;
      nextOffset = parsed.nextOffset;
    } else if (opcode === 0x9b) {
      const parsed = parseFunction(buffer, payloadStart, payloadEnd, end, false, constantPool, context);
      instruction.operand = parsed.definition;
      nextOffset = parsed.nextOffset;
    } else if ((opcode === 0x99 || opcode === 0x9d) && payloadStart + 2 <= payloadEnd) {
      const delta = buffer.readInt16LE(payloadStart);
      instruction.operand = { delta, target: payloadEnd + delta };
    } else if (opcode === 0x94 && payloadStart + 2 <= payloadEnd) {
      const size = buffer.readUInt16LE(payloadStart);
      const bodyStart = payloadEnd;
      const bodyEnd = Math.min(bodyStart + size, end);
      instruction.operand = {
        body: decodeActions(buffer, bodyStart, bodyEnd, [...constantPool], `${context}/with`)
      };
      nextOffset = bodyEnd;
    } else if (opcode === 0x8f) {
      const parsed = parseTry(buffer, payloadStart, payloadEnd, end, constantPool, context);
      instruction.operand = parsed.operand;
      nextOffset = parsed.nextOffset;
    }
    else if (opcode === 0x81 && payloadStart + 2 <= payloadEnd) instruction.operand = { frame: buffer.readUInt16LE(payloadStart) };
    else if (opcode === 0x83) {
      const url = readCString(buffer, payloadStart, payloadEnd);
      const target = readCString(buffer, url.next, payloadEnd);
      instruction.operand = { url: url.value, target: target.value };
    } else if (opcode === 0x87 && payloadStart < payloadEnd) instruction.operand = { register: buffer[payloadStart] };
    else if (opcode === 0x89 && payloadStart < payloadEnd) instruction.operand = { strict: buffer[payloadStart] !== 0 };
    else if (opcode === 0x8a && payloadStart + 3 <= payloadEnd) instruction.operand = { frame: buffer.readUInt16LE(payloadStart), skip: buffer[payloadStart + 2] };
    else if (opcode === 0x8d && payloadStart < payloadEnd) instruction.operand = { skip: buffer[payloadStart] };
    else if (opcode === 0x8b || opcode === 0x8c) instruction.operand = { value: readCString(buffer, payloadStart, payloadEnd).value };
    else if (opcode === 0x9a && payloadStart < payloadEnd) instruction.operand = { flags: buffer[payloadStart] };
    else if (opcode === 0x9f && payloadStart < payloadEnd) {
      const flags = buffer[payloadStart];
      instruction.operand = { flags, sceneBias: flags & 0x02 && payloadStart + 3 <= payloadEnd ? buffer.readUInt16LE(payloadStart + 1) : null };
    } else if (length > 0) {
      instruction.operand = { bytes: buffer.subarray(payloadStart, Math.min(payloadEnd, payloadStart + 24)).toString("hex"), length };
    }
    instructions.push(instruction);
    cursor = nextOffset;
    if (opcode === 0x00) break;
  }
  return instructions;
}

function pushActionBlock(analysis, buffer, start, end, context, kind, extra = {}) {
  if (end <= start) return;
  analysis.actionBlocks.push({
    context,
    kind,
    offset: start,
    length: end - start,
    instructions: decodeActions(buffer, start, end, [], context),
    ...extra
  });
}

function parseExportAssets(buffer, start, end, target) {
  if (start + 2 > end) return;
  const count = buffer.readUInt16LE(start);
  let cursor = start + 2;
  for (let index = 0; index < count && cursor + 2 <= end; index += 1) {
    const id = buffer.readUInt16LE(cursor);
    cursor += 2;
    const parsed = readCString(buffer, cursor, end);
    cursor = parsed.next;
    target.push({ id, name: parsed.value });
  }
}

function parseDefineEditText(buffer, start, end, context, analysis) {
  if (start + 4 > end) return;
  const id = buffer.readUInt16LE(start);
  let cursor = skipRect(buffer, start + 2);
  if (cursor + 2 > end) return;
  const flags = buffer.readUInt16BE(cursor);
  cursor += 2;
  const hasText = Boolean(flags & 0x8000);
  const hasTextColor = Boolean(flags & 0x0400);
  const hasMaxLength = Boolean(flags & 0x0200);
  const hasFont = Boolean(flags & 0x0100);
  const hasFontClass = Boolean(flags & 0x0080);
  const hasLayout = Boolean(flags & 0x0020);
  if (hasFont) cursor += 2;
  if (hasFontClass) cursor = readCString(buffer, cursor, end).next;
  if (hasFont) cursor += 2;
  if (hasTextColor) cursor += 4;
  if (hasMaxLength) cursor += 2;
  if (hasLayout) cursor += 9;
  const variable = readCString(buffer, cursor, end);
  cursor = variable.next;
  const initialText = hasText ? readCString(buffer, cursor, end).value : null;
  analysis.editTexts.push({ id, variable: variable.value, initialText, context });
}

function parseClipActions(buffer, start, end, swfVersion, context, analysis) {
  let cursor = start;
  if (cursor + 2 > end) return;
  cursor += 2;
  const flagSize = swfVersion >= 6 ? 4 : 2;
  if (cursor + flagSize > end) return;
  cursor += flagSize;
  let record = 0;
  while (cursor + flagSize <= end) {
    const flags = flagSize === 4 ? buffer.readUInt32LE(cursor) : buffer.readUInt16LE(cursor);
    cursor += flagSize;
    if (flags === 0) break;
    if (cursor + 4 > end) break;
    const actionSize = buffer.readUInt32LE(cursor);
    cursor += 4;
    const recordEnd = Math.min(cursor + actionSize, end);
    if (swfVersion >= 6 && (flags & 0x00020000) && cursor < recordEnd) cursor += 1;
    pushActionBlock(analysis, buffer, cursor, recordEnd, `${context}/clip-action:${record}`, "ClipAction", { eventFlags: flags });
    cursor = recordEnd;
    record += 1;
  }
}

function skipFilterList(buffer, start, end) {
  let cursor = start;
  if (cursor >= end) return end;
  const count = buffer[cursor++];
  for (let index = 0; index < count && cursor < end; index += 1) {
    const type = buffer[cursor++];
    const fixedSizes = new Map([[0, 23], [1, 9], [2, 15], [3, 27], [6, 80]]);
    if (fixedSizes.has(type)) cursor += fixedSizes.get(type);
    else if (type === 4 || type === 7) {
      if (cursor >= end) return end;
      const colors = buffer[cursor++];
      cursor += colors * 4 + colors + 19;
    } else if (type === 5) {
      if (cursor + 2 > end) return end;
      const matrixEntries = buffer[cursor] * buffer[cursor + 1];
      const filterBytes = 15 + matrixEntries * 4;
      if (cursor + filterBytes > end) return end;
      cursor += filterBytes;
    } else return end;
  }
  return Math.min(cursor, end);
}

function parsePlaceObject(buffer, start, end, tagCode, context, analysis, swfVersion) {
  let cursor = start;
  const flags1 = buffer[cursor++];
  const flags2 = tagCode === 70 ? buffer[cursor++] : 0;
  if (cursor + 2 > end) return;
  const depth = buffer.readUInt16LE(cursor);
  cursor += 2;
  const hasCharacter = Boolean(flags1 & 0x02);
  const hasMatrix = Boolean(flags1 & 0x04);
  const hasColorTransform = Boolean(flags1 & 0x08);
  const hasRatio = Boolean(flags1 & 0x10);
  const hasName = Boolean(flags1 & 0x20);
  const hasClipDepth = Boolean(flags1 & 0x40);
  const hasClipActions = Boolean(flags1 & 0x80);
  const hasFilterList = Boolean(flags2 & 0x01);
  const hasBlendMode = Boolean(flags2 & 0x02);
  const hasCacheAsBitmap = Boolean(flags2 & 0x04);
  const hasClassName = Boolean(flags2 & 0x08);
  const hasImage = Boolean(flags2 & 0x10);
  let className = null;
  if (hasClassName || (hasImage && hasCharacter)) {
    const parsed = readCString(buffer, cursor, end);
    className = parsed.value;
    cursor = parsed.next;
  }
  let characterId = null;
  if (hasCharacter && cursor + 2 <= end) {
    characterId = buffer.readUInt16LE(cursor);
    cursor += 2;
  }
  if (hasMatrix && cursor < end) cursor = skipMatrix(buffer, cursor);
  if (hasColorTransform && cursor < end) cursor = skipColorTransform(buffer, cursor, true);
  if (hasRatio && cursor + 2 <= end) cursor += 2;
  let name = null;
  if (hasName && cursor < end) {
    const parsed = readCString(buffer, cursor, end);
    name = parsed.value;
    cursor = parsed.next;
  }
  if (hasClipDepth && cursor + 2 <= end) cursor += 2;
  if (hasFilterList) cursor = skipFilterList(buffer, cursor, end);
  if (hasBlendMode && cursor < end) cursor += 1;
  if (hasCacheAsBitmap && cursor < end) cursor += 1;
  if (name || className) analysis.instances.push({ name, className, characterId, depth, context });
  if (hasClipActions && cursor < end) parseClipActions(buffer, cursor, end, swfVersion, `${context}/instance:${name ?? depth}`, analysis);
}

/**
 * FrameLabel (tag 43): a NUL-terminated STRING, optionally followed — SWF 6 and
 * later only — by a single UI8 "named anchor" byte whose defined value is 1.
 *
 * Nothing here throws on damaged input: an unterminated string, an empty label
 * and unexpected trailing bytes are all reported as flags on the decoded record
 * so a caller sees the damage instead of a silently plausible label.
 */
export function parseFrameLabel(buffer, start, end, swfVersion) {
  const parsed = readCString(buffer, start, end);
  const terminated = parsed.next > start && buffer[parsed.next - 1] === 0;
  const trailing = Math.max(0, end - parsed.next);
  const namedAnchor = swfVersion >= 6 && trailing >= 1 && buffer[parsed.next] === 1;
  return {
    label: parsed.value,
    namedAnchor,
    truncated: !terminated,
    trailingBytes: trailing - (namedAnchor ? 1 : 0)
  };
}

function parseDefineButton2(buffer, start, end, context, analysis) {
  if (start + 5 > end) return;
  const characterId = buffer.readUInt16LE(start);
  const actionOffsetField = start + 3;
  const actionOffset = buffer.readUInt16LE(actionOffsetField);
  if (!actionOffset) return;
  let cursor = actionOffsetField + actionOffset;
  let record = 0;
  while (cursor + 4 <= end) {
    const recordStart = cursor;
    const size = buffer.readUInt16LE(cursor);
    const flags = buffer.readUInt16LE(cursor + 2);
    cursor += 4;
    const recordEnd = size === 0 ? end : Math.min(recordStart + size, end);
    pushActionBlock(analysis, buffer, cursor, recordEnd, `${context}/button:${characterId}/condition:${record}`, "ButtonCondition", { eventFlags: flags });
    if (size === 0) break;
    cursor = recordEnd;
    record += 1;
  }
}

function parseTags(buffer, start, end, context, analysis, swfVersion) {
  let cursor = start;
  let frame = 1;
  while (cursor + 2 <= end) {
    const tagOffset = cursor;
    const recordHeader = buffer.readUInt16LE(cursor);
    cursor += 2;
    const code = recordHeader >>> 6;
    let length = recordHeader & 0x3f;
    if (length === 0x3f) {
      if (cursor + 4 > end) break;
      length = buffer.readUInt32LE(cursor);
      cursor += 4;
    }
    const bodyStart = cursor;
    const bodyEnd = Math.min(bodyStart + length, end);
    analysis.tagCounts.set(code, (analysis.tagCounts.get(code) ?? 0) + 1);
    const frameContext = `${context}/frame:${frame}`;
    if (code === 0) break;
    if (code === 1) frame += 1;
    else if (code === 12) pushActionBlock(analysis, buffer, bodyStart, bodyEnd, `${frameContext}/DoAction@0x${tagOffset.toString(16)}`, "DoAction");
    else if (code === 26 || code === 70) parsePlaceObject(buffer, bodyStart, bodyEnd, code, frameContext, analysis, swfVersion);
    else if (code === 34) parseDefineButton2(buffer, bodyStart, bodyEnd, context, analysis);
    else if (code === 37) parseDefineEditText(buffer, bodyStart, bodyEnd, context, analysis);
    else if (code === 39 && bodyStart + 4 <= bodyEnd) {
      const id = buffer.readUInt16LE(bodyStart);
      const declaredFrames = buffer.readUInt16LE(bodyStart + 2);
      analysis.sprites.push({ id, declaredFrames, offset: tagOffset });
      parseTags(buffer, bodyStart + 4, bodyEnd, `sprite:${id}`, analysis, swfVersion);
    } else if (code === 43) {
      // The label belongs to the frame currently being assembled, i.e. the one
      // the next ShowFrame will display. `frame` is 1-based and only advances
      // on ShowFrame, so it is exactly what `_currentframe` reports there.
      analysis.frameLabels.push({
        timeline: context,
        frame,
        offset: tagOffset,
        ...parseFrameLabel(buffer, bodyStart, bodyEnd, swfVersion)
      });
    } else if (code === 56) parseExportAssets(buffer, bodyStart, bodyEnd, analysis.exports);
    else if (code === 59 && bodyStart + 2 <= bodyEnd) {
      const spriteId = buffer.readUInt16LE(bodyStart);
      pushActionBlock(analysis, buffer, bodyStart + 2, bodyEnd, `${frameContext}/DoInitAction:${spriteId}@0x${tagOffset.toString(16)}`, "DoInitAction", { spriteId });
    } else if (code === 76) parseExportAssets(buffer, bodyStart, bodyEnd, analysis.symbolClasses);
    cursor = bodyEnd;
  }
  // Frames actually displayed by this timeline: one per ShowFrame. `frame` is
  // the number of the frame being assembled when the stream ran out, so the
  // last displayed frame is `frame - 1`.
  const displayed = frame - 1;
  if (displayed > (analysis.timelineFrames.get(context) ?? 0)) analysis.timelineFrames.set(context, displayed);
}

function instructionChildren(instruction) {
  if (instruction.name === "DefineFunction" || instruction.name === "DefineFunction2") return instruction.operand?.body ?? [];
  if (instruction.name === "With") return instruction.operand?.body ?? [];
  if (instruction.name === "Try") return (instruction.operand?.bodies ?? []).flatMap((entry) => entry.body);
  return [];
}

function instructionSearchText(instruction) {
  const own = instruction.name === "ConstantPool" ? instruction.name : `${instruction.name} ${JSON.stringify(instruction.operand ?? "")}`;
  return `${own} ${instructionChildren(instruction).map(instructionSearchText).join(" ")}`;
}

function blockSearchText(block) {
  return block.instructions.map(instructionSearchText).join(" ");
}

function collectFunctions(instructions, output = []) {
  for (const instruction of instructions) {
    if (instruction.name === "DefineFunction" || instruction.name === "DefineFunction2") {
      output.push({ instruction, definition: instruction.operand });
    }
    collectFunctions(instructionChildren(instruction), output);
  }
  return output;
}

function collectReferences(instructions, expression, functionName = "<timeline>", output = []) {
  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    const operand = JSON.stringify(instruction.operand ?? "", (key, value) => key === "body" || key === "bodies" ? undefined : value);
    if (expression.test(`${instruction.name} ${operand}`)) output.push({ instruction, functionName, instructions, index });
    if (instruction.name === "DefineFunction" || instruction.name === "DefineFunction2") {
      collectReferences(instructionChildren(instruction), expression, instruction.operand?.name || "<anonymous>", output);
    } else {
      collectReferences(instructionChildren(instruction), expression, functionName, output);
    }
  }
  return output;
}

function displayValue(value) {
  if (value.type === "constant") return `constant[${value.index}]=${JSON.stringify(value.value)}`;
  if (value.type === "register") return `register:${value.value}`;
  if (value.type === "undefined") return "undefined";
  return JSON.stringify(value.value);
}

function formatInstruction(instruction, baseOffset, indent = "  ") {
  const relative = instruction.offset - baseOffset;
  let suffix = "";
  if (instruction.name === "Push") suffix = ` ${instruction.operand.map(displayValue).join(", ")}`;
  else if (instruction.name === "ConstantPool") suffix = ` (${instruction.operand.count} entries)`;
  else if (instruction.name === "DefineFunction" || instruction.name === "DefineFunction2") {
    const fn = instruction.operand;
    suffix = ` ${fn.name || "<anonymous>"}(${fn.parameters.map((parameter) => parameter.name).join(", ")})`;
  } else if (instruction.operand) suffix = ` ${JSON.stringify(instruction.operand, (key, value) => key === "body" || key === "bodies" ? undefined : value)}`;
  const lines = [`${indent}+0x${relative.toString(16).padStart(4, "0")} ${instruction.name}${suffix}`];
  if (instruction.name === "DefineFunction" || instruction.name === "DefineFunction2" || instruction.name === "With") {
    for (const child of instructionChildren(instruction)) lines.push(...formatInstruction(child, baseOffset, `${indent}  `));
  } else if (instruction.name === "Try") {
    for (const body of instruction.operand?.bodies ?? []) {
      lines.push(`${indent}  [${body.kind}]`);
      for (const child of body.body) lines.push(...formatInstruction(child, baseOffset, `${indent}    `));
    }
  }
  return lines;
}

function resolveContext(context, exportById) {
  return context.replace(/sprite:(\d+)/g, (match, id) => {
    const names = exportById.get(Number(id));
    return names?.length ? `${match}[${names.join("|")}]` : match;
  });
}

function buildExportIndex(exports, symbolClasses) {
  const exportById = new Map();
  for (const entry of [...exports, ...symbolClasses]) {
    if (!exportById.has(entry.id)) exportById.set(entry.id, []);
    exportById.get(entry.id).push(entry.name);
  }
  return exportById;
}

/**
 * Groups decoded FrameLabel records per timeline and gives each label the frame
 * span it owns: from its own frame up to the frame before the next label on the
 * same timeline, or up to the timeline's last frame for the final label. A
 * controller plays through that span and rests inside it, so the span — not the
 * label frame — is what a `_currentframe` reader has to expect.
 */
export function buildFrameLabelTimelines(analysis, swf = null) {
  const exportById = buildExportIndex(analysis.exports, analysis.symbolClasses);
  const spriteById = new Map();
  for (const sprite of analysis.sprites) if (!spriteById.has(sprite.id)) spriteById.set(sprite.id, sprite);

  const groups = new Map();
  const groupFor = (timeline) => {
    const existing = groups.get(timeline);
    if (existing) return existing;
    const matched = /^sprite:(\d+)$/.exec(timeline);
    const spriteId = matched ? Number(matched[1]) : null;
    const group = {
      timeline,
      display: resolveContext(timeline, exportById),
      spriteId,
      names: spriteId === null ? [] : exportById.get(spriteId) ?? [],
      frameCount: analysis.timelineFrames.get(timeline) ?? 0,
      declaredFrameCount: spriteId === null ? swf?.frameCount ?? null : spriteById.get(spriteId)?.declaredFrames ?? null,
      labels: []
    };
    groups.set(timeline, group);
    return group;
  };

  for (const entry of analysis.frameLabels) groupFor(entry.timeline).labels.push(entry);

  const timelines = [...groups.values()];
  for (const group of timelines) {
    const ordered = [...group.labels].sort((a, b) => a.frame - b.frame || a.offset - b.offset);
    const lastFrame = Math.max(group.frameCount, ordered[ordered.length - 1]?.frame ?? 0);
    group.labels = ordered.map((entry, index) => {
      const next = ordered[index + 1];
      const spanEnd = Math.max(entry.frame, next ? next.frame - 1 : lastFrame);
      return {
        label: entry.label,
        frame: entry.frame,
        spanEnd,
        spanFrames: spanEnd - entry.frame + 1,
        namedAnchor: entry.namedAnchor,
        truncated: entry.truncated,
        trailingBytes: entry.trailingBytes,
        offset: entry.offset
      };
    });
  }
  timelines.sort((a, b) => {
    if (a.spriteId === b.spriteId) return a.timeline.localeCompare(b.timeline);
    if (a.spriteId === null) return -1;
    if (b.spriteId === null) return 1;
    return a.spriteId - b.spriteId;
  });
  return timelines;
}

export function filterFrameLabelTimelines(timelines, { label = null, timeline = null } = {}) {
  const labelExpression = label ? new RegExp(label, "i") : null;
  const timelineExpression = timeline ? new RegExp(timeline, "i") : null;
  const output = [];
  for (const group of timelines) {
    if (timelineExpression && !timelineExpression.test(group.display)) continue;
    const labels = labelExpression ? group.labels.filter((entry) => labelExpression.test(entry.label)) : group.labels;
    if (!labels.length) continue;
    output.push({ ...group, labels });
  }
  return output;
}

function frameLabelNotes(entry) {
  const notes = [];
  if (entry.namedAnchor) notes.push("named anchor");
  if (entry.truncated) notes.push("unterminated string");
  if (entry.trailingBytes > 0) notes.push(`${entry.trailingBytes} unexpected trailing byte${entry.trailingBytes === 1 ? "" : "s"}`);
  return notes.length ? `  [${notes.join("; ")}]` : "";
}

export function formatFrameLabelReport(timelines, { label = null, timeline = null, totalTimelines = null } = {}) {
  const shown = timelines.reduce((total, group) => total + group.labels.length, 0);
  const filters = [];
  if (label) filters.push(`labels matching /${label}/i`);
  if (timeline) filters.push(`timelines matching /${timeline}/i`);
  const scope = totalTimelines === null || totalTimelines === timelines.length
    ? `${timelines.length} timelines`
    : `${timelines.length} of ${totalTimelines} timelines`;
  const lines = [filters.length
    ? `\nFrame labels (${filters.join("; ")}): ${shown} across ${scope}`
    : `\nFrame labels: ${shown} across ${scope}`];
  for (const group of timelines) {
    const declared = group.declaredFrameCount === null
      ? ""
      : `, declared ${group.declaredFrameCount}${group.declaredFrameCount === group.frameCount ? "" : " — MISMATCH"}`;
    lines.push(`\n[${group.display}] ${group.frameCount} frame${group.frameCount === 1 ? "" : "s"}${declared}`);
    for (const entry of group.labels) {
      const name = entry.label === "" ? "<empty>" : entry.label;
      lines.push(`  ${name.padEnd(24)} frame ${String(entry.frame).padStart(4)}  span ${entry.frame}-${entry.spanEnd} (${entry.spanFrames} frame${entry.spanFrames === 1 ? "" : "s"})${frameLabelNotes(entry)}`);
    }
  }
  return lines;
}

export function frameLabelPayload(file, timelines, { label = null, timeline = null, totalTimelines = null } = {}) {
  return {
    file,
    labelFilter: label,
    timelineFilter: timeline,
    labelCount: timelines.reduce((total, group) => total + group.labels.length, 0),
    timelineCount: timelines.length,
    totalTimelinesWithLabels: totalTimelines,
    timelines
  };
}

function serialisableSummary(file, stat, swf, analysis) {
  const exportById = new Map();
  for (const entry of [...analysis.exports, ...analysis.symbolClasses]) {
    if (!exportById.has(entry.id)) exportById.set(entry.id, []);
    exportById.get(entry.id).push(entry.name);
  }
  return {
    file,
    bytesOnDisk: stat.size,
    signature: swf.buffer.toString("ascii", 0, 3),
    originalCompression: swf.compression,
    version: swf.version,
    declaredFileLength: swf.declaredFileLength,
    frameRate: swf.frameRate,
    frameCount: swf.frameCount,
    tagCounts: [...analysis.tagCounts.entries()].sort((a, b) => a[0] - b[0]).map(([code, count]) => ({ code, name: TAG_NAMES.get(code) ?? `Tag${code}`, count })),
    exports: analysis.exports,
    symbolClasses: analysis.symbolClasses,
    sprites: analysis.sprites.map((sprite) => ({ ...sprite, names: exportById.get(sprite.id) ?? [] })),
    namedInstances: analysis.instances,
    editTexts: analysis.editTexts,
    actionBlockCount: analysis.actionBlocks.length
  };
}

function printHumanSummary(summary, analysis, options) {
  const {
    search,
    function: functionSearch,
    functionNames: functionNamesSearch,
    references: referencesSearch,
    labels,
    timeline: timelineFilter,
    around,
    maxActions
  } = options;
  console.log(`SWF: ${summary.file}`);
  console.log(`Size: ${summary.bytesOnDisk} bytes; FWS v${summary.version}; original compression: ${summary.originalCompression}`);
  console.log(`Movie: ${summary.frameRate} fps, ${summary.frameCount} root frames; declared length: ${summary.declaredFileLength}`);
  console.log(`AVM1 action blocks: ${summary.actionBlockCount}; sprites: ${summary.sprites.length}; exports: ${summary.exports.length}; named instances: ${summary.namedInstances.length}; edit text fields: ${summary.editTexts.length}`);
  console.log("Tags: " + summary.tagCounts.map((entry) => `${entry.name}=${entry.count}`).join(", "));
  if (labels) {
    const all = buildFrameLabelTimelines(analysis, { frameCount: summary.frameCount });
    const selected = filterFrameLabelTimelines(all, { label: labels.filter, timeline: timelineFilter });
    const report = { label: labels.filter, timeline: timelineFilter, totalTimelines: all.length };
    for (const line of formatFrameLabelReport(selected, report)) console.log(line);
    return;
  }
  if (referencesSearch) {
    const expression = new RegExp(referencesSearch, "i");
    const exportById = new Map();
    for (const entry of [...summary.exports, ...summary.symbolClasses]) {
      if (!exportById.has(entry.id)) exportById.set(entry.id, []);
      exportById.get(entry.id).push(entry.name);
    }
    const matches = [];
    for (const block of analysis.actionBlocks) {
      for (const match of collectReferences(block.instructions, expression)) matches.push({ block, ...match });
    }
    console.log(`\nReferences matching /${referencesSearch}/i: ${matches.length}`);
    for (const match of matches.slice(0, maxActions)) {
      const context = `${resolveContext(match.block.context, exportById)} — ${match.functionName}`;
      if (!around) {
        const instruction = formatInstruction(match.instruction, match.block.offset, "")[0];
        console.log(`${context} — ${instruction}`);
        continue;
      }
      console.log(`\n[${context}]`);
      const start = Math.max(0, match.index - around);
      const end = Math.min(match.instructions.length, match.index + around + 1);
      for (let index = start; index < end; index += 1) {
        const marker = index === match.index ? "> " : "  ";
        for (const line of formatInstruction(match.instructions[index], match.block.offset, marker)) console.log(line);
      }
    }
    if (matches.length > maxActions) console.log(`... output capped at ${maxActions} references; raise --max-actions to inspect more.`);
    return;
  }
  if (functionNamesSearch) {
    const expression = new RegExp(functionNamesSearch, "i");
    const exportById = new Map();
    for (const entry of [...summary.exports, ...summary.symbolClasses]) {
      if (!exportById.has(entry.id)) exportById.set(entry.id, []);
      exportById.get(entry.id).push(entry.name);
    }
    const matches = [];
    for (const block of analysis.actionBlocks) {
      for (const entry of collectFunctions(block.instructions)) {
        if (expression.test(entry.definition?.name ?? "")) {
          matches.push({
            name: entry.definition.name || "<anonymous>",
            parameters: entry.definition.parameters.map((parameter) => parameter.name),
            kind: block.kind,
            context: resolveContext(block.context, exportById),
            offset: `0x${block.offset.toString(16)}`
          });
        }
      }
    }
    console.log(`\nFunction names matching /${functionNamesSearch}/i: ${matches.length}`);
    for (const match of matches) {
      console.log(`${match.name}(${match.parameters.join(", ")}) — ${match.kind} ${match.context} ${match.offset}`);
    }
    return;
  }
  if (functionSearch) {
    const expression = new RegExp(functionSearch, "i");
    const exportById = new Map();
    for (const entry of [...summary.exports, ...summary.symbolClasses]) {
      if (!exportById.has(entry.id)) exportById.set(entry.id, []);
      exportById.get(entry.id).push(entry.name);
    }
    const matches = [];
    for (const block of analysis.actionBlocks) {
      for (const entry of collectFunctions(block.instructions)) {
        if (expression.test(entry.definition?.name ?? "")) matches.push({ block, ...entry });
      }
    }
    console.log(`\nFunctions matching /${functionSearch}/i: ${matches.length}`);
    let emitted = 0;
    for (const match of matches) {
      console.log(`\n[${match.block.kind}] ${resolveContext(match.block.context, exportById)} offset=0x${match.block.offset.toString(16)}`);
      const definition = match.definition;
      console.log(`  function ${definition.name || "<anonymous>"}(${definition.parameters.map((parameter) => parameter.name).join(", ")})`);
      for (const instruction of definition.body) {
        for (const line of formatInstruction(instruction, match.block.offset, "    ")) {
          if (emitted >= maxActions) {
            console.log(`... output capped at ${maxActions} action lines; raise --max-actions to inspect more.`);
            return;
          }
          console.log(line);
          emitted += 1;
        }
      }
    }
    return;
  }
  if (!search) return;
  const expression = new RegExp(search, "i");
  const exportById = new Map();
  for (const entry of [...summary.exports, ...summary.symbolClasses]) {
    if (!exportById.has(entry.id)) exportById.set(entry.id, []);
    exportById.get(entry.id).push(entry.name);
  }
  const metadataMatches = {
    exports: summary.exports.filter((entry) => expression.test(entry.name)),
    symbolClasses: summary.symbolClasses.filter((entry) => expression.test(entry.name)),
    namedInstances: summary.namedInstances.filter((entry) => expression.test(`${entry.name ?? ""} ${entry.className ?? ""}`)),
    editTexts: summary.editTexts.filter((entry) => expression.test(`${entry.variable} ${entry.initialText ?? ""}`))
  };
  console.log(`\nMetadata matches for /${search}/i:`);
  console.log(JSON.stringify(metadataMatches, null, 2));
  const matches = analysis.actionBlocks.filter((block) => expression.test(blockSearchText(block)));
  console.log(`\nAction blocks matching /${search}/i: ${matches.length}`);
  let emitted = 0;
  for (const block of matches) {
    console.log(`\n[${block.kind}] ${resolveContext(block.context, exportById)} offset=0x${block.offset.toString(16)} length=${block.length}`);
    for (const instruction of block.instructions) {
      const lines = formatInstruction(instruction, block.offset);
      for (const line of lines) {
        if (emitted >= maxActions) {
          console.log(`... output capped at ${maxActions} action lines; raise --max-actions to inspect more.`);
          return;
        }
        console.log(line);
        emitted += 1;
      }
    }
  }
}

/**
 * Reads a SWF that is already in memory. Nothing here touches the filesystem,
 * which is what lets the tests exercise the decoders on synthetic buffers.
 */
export function analyseSwfBuffer(input) {
  const normalised = normaliseSwf(input);
  const buffer = normalised.buffer;
  const version = buffer[3];
  const declaredFileLength = buffer.readUInt32LE(4);
  let cursor = skipRect(buffer, 8);
  const frameRate = buffer.readUInt16LE(cursor) / 256;
  const frameCount = buffer.readUInt16LE(cursor + 2);
  cursor += 4;
  const analysis = {
    tagCounts: new Map(),
    exports: [],
    symbolClasses: [],
    sprites: [],
    instances: [],
    editTexts: [],
    actionBlocks: [],
    frameLabels: [],
    timelineFrames: new Map()
  };
  parseTags(buffer, cursor, buffer.length, "root", analysis, version);
  return { swf: { ...normalised, version, declaredFileLength, frameRate, frameCount }, analysis };
}

function main(argv) {
  const options = parseArguments(argv);
  if (!options) {
    usage();
    return;
  }
  const file = path.resolve(options.file);
  const stat = fs.statSync(file);
  const { swf, analysis } = analyseSwfBuffer(fs.readFileSync(file));
  const summary = serialisableSummary(file, stat, swf, analysis);
  if (options.json && options.labels) {
    const all = buildFrameLabelTimelines(analysis, swf);
    const selected = filterFrameLabelTimelines(all, { label: options.labels.filter, timeline: options.timeline });
    console.log(JSON.stringify(frameLabelPayload(file, selected, {
      label: options.labels.filter,
      timeline: options.timeline,
      totalTimelines: all.length
    }), null, 2));
  } else if (options.json) console.log(JSON.stringify(summary, null, 2));
  else printHumanSummary(summary, analysis, options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}
