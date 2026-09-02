/**
 * Census: does `docs/integration/ss2-item-tables.md` still say what the build says?
 *
 * That document is a TRANSCRIPTION of build-constant data — 90 weapon entries,
 * each a six-element array literal in one run at
 * `root/frame:35/DoAction@0x3fa9dc`. It was recorded on 2026-08-30 by reading
 * the bytes, and for three days afterwards two other places in this repository
 * said the table "is not transcribed", so a ranked next step pointed at work
 * that was already done. The document is now load-bearing, and a hand-made
 * table nobody re-checks is exactly the artefact this project distrusts.
 *
 * REPORT ONLY. It reads the installed SWF and the committed document, and
 * writes nothing.
 *
 *   node tools/item-table-transcription.mjs
 *   node tools/item-table-transcription.mjs "/path/to/swords_sandals2_download.swf"
 *
 * Exit status is 0 when every row agrees, 1 when any row disagrees, 2 when the
 * SWF is not reachable. A fresh clone has no licensed build, so this is a tool
 * a human runs on the capture box rather than a test — the same shape as
 * `tools/stable-order-locale-census.mjs`.
 *
 * ## What it checks, and the part that is easy to miss
 *
 * Two independent things, because the first alone would not be worth much:
 *
 * 1. **The numbers.** Every field of every row, against the literal the
 *    document names, INCLUDING the instruction offset. A diff that skipped the
 *    offset would pass a document whose rows had been silently renumbered.
 *
 * 2. **The index convention.** Check 1 only proves the document's numbers are
 *    the build's numbers UNDER THE DOCUMENT'S OWN CONVENTION — it reads
 *    `[e, name, d, c, b, a]` out of `Push "weapon<N>", a, b, c, d, <name>, e`
 *    because the document says that is the order, so a wrong convention would
 *    be invisible to it. So the reader sites in `battlevalues` are checked
 *    too: `weapon_min_damage` really is index 3, `weapon_max_damage` index 4,
 *    and so on, read off the `Push <n>; GetMember` that follows each. THIS IS
 *    THE HALF THAT MAKES THE OTHER HALF MEAN ANYTHING, and it is the half a
 *    checker written in a hurry leaves out.
 *
 * ## Inspection boundary
 *
 * Display names are game content. The document does not reproduce them and
 * neither does this tool: index `[1]` is parsed only far enough to confirm a
 * string sits there, and its value is never printed or compared.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { analyseSwfBuffer } from "./inspect-swf.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC_PATH = path.join(REPO_ROOT, "docs", "integration", "ss2-item-tables.md");

/**
 * Where the Collection installs on the capture box. Overridable by argument
 * because the tree has already moved twice, and a literal path in a document
 * that calls itself load-bearing is the thing that rots.
 */
const DEFAULT_SWF =
  "/mnt/c/Program Files (x86)/Steam/steamapps/common/Swords and Sandals Classic Collection/swf/swords_sandals2_download.swf";

/** The index each `battlevalues` output reads out of the weapon array. */
const READER_SITES = Object.freeze({
  weapon_type: 0,
  weapon_weight: 2,
  weapon_min_damage: 3,
  weapon_max_damage: 4,
  weapon_range: 5
});

const numeric = (operand) =>
  operand && (operand.type === "integer" || operand.type === "double" || operand.type === "float")
    ? operand.value
    : null;

/**
 * Every instruction in a block, nested bodies included.
 *
 * THE WHOLE TABLE IS NESTED, and a flat scan of `block.instructions` finds
 * NOTHING — root frame 35 declares the weapon literals inside a `With (body
 * 282)` at `+0x3d87`, and `battlevalues` is a `DefineFunction2 (body 754)` at
 * `+0x3062`, so both halves of this census are invisible without the walk. The
 * first draft of this file scanned flat, and the only reason that was caught
 * rather than shipped is the vacuity guard below reporting "0 literals" instead
 * of "no mismatches".
 *
 * `inspect-swf.mjs` has its own `instructionChildren`, which is not exported;
 * this mirrors it. If a future SWF nests actions under some other opcode, this
 * walk goes quiet — which is why the caller must keep failing on an empty
 * result rather than treating it as agreement.
 */
function* walk(instructions) {
  for (const instruction of instructions) {
    yield instruction;
    const name = instruction.name;
    if (name === "DefineFunction" || name === "DefineFunction2" || name === "With") {
      yield* walk(instruction.operand?.body ?? []);
    } else if (name === "Try") {
      for (const entry of instruction.operand?.bodies ?? []) yield* walk(entry.body ?? []);
    }
  }
}

/**
 * Every `_root.weapon<N> = Array(...)` literal in the build.
 *
 * Found by SHAPE rather than by address: a Push whose first operand is the
 * string `weapon<digits>` and whose last two are `6` and `Array`. Keying on
 * `+0x3c46 … +0x4c9c` would go quiet the moment anything above it in the frame
 * changed length, and going quiet is the failure mode that matters — a census
 * that finds nothing looks exactly like a census that finds no problems.
 */
function weaponLiteralsIn(analysis) {
  const table = new Map();
  const contexts = new Set();
  for (const block of analysis.actionBlocks) {
    for (const instruction of walk(block.instructions)) {
      if (instruction.name !== "Push" || !Array.isArray(instruction.operand)) continue;
      const operands = instruction.operand;
      if (operands.length !== 9) continue;
      const [name, a, b, c, d, display, e, count, constructor] = operands;
      if (name.type !== "string" && name.type !== "constant") continue;
      if (typeof name.value !== "string" || !/^weapon\d+$/.test(name.value)) continue;
      if (numeric(count) !== 6) continue;
      if (constructor.value !== "Array") continue;
      // `NewObject` pops the class name, then the count, then the arguments —
      // so the compiler emits them in reverse and the array is [e, …, a].
      // Offsets in the map and in `inspect-swf.mjs`'s own output are RELATIVE
      // to the enclosing action block, which is what the document records.
      table.set(Number(name.value.slice("weapon".length)), {
        offset: `+0x${(instruction.offset - block.offset).toString(16)}`,
        context: block.context,
        hasDisplayName: display.type === "string" || display.type === "constant",
        0: numeric(e),
        2: numeric(d),
        3: numeric(c),
        4: numeric(b),
        5: numeric(a)
      });
      contexts.add(block.context);
    }
  }
  return { table, contexts };
}

/**
 * The index each `weapon_*` output is actually read from, per the bytes.
 *
 * `battlevalues` writes each one as `c.<field> = _root["weapon" + c.weapon][k]`,
 * which compiles to a Push naming the field, then the lookup, then `Push k;
 * GetMember`. The scan window is deliberately small: a `Push k` found twenty
 * instructions away would be some other statement's.
 */
function readerIndicesIn(analysis) {
  const found = new Map();
  for (const block of analysis.actionBlocks) {
    const instructions = [...walk(block.instructions)];
    for (let index = 0; index < instructions.length; index += 1) {
      const instruction = instructions[index];
      if (instruction.name !== "Push" || !Array.isArray(instruction.operand)) continue;
      const field = instruction.operand.find(
        (operand) => typeof operand.value === "string" && Object.hasOwn(READER_SITES, operand.value)
      );
      if (!field || found.has(field.value)) continue;

      // Only the WRITE site interests us, and a write is the one that performs
      // the `_root["weapon" + c.weapon]` lookup — a Push naming `weapon` twice.
      // THAT PUSH IS NOT ALWAYS THE SAME ONE THAT NAMES THE FIELD:
      // `weapon_min_damage` fuses both into `+0x31be`, while `weapon_range`
      // (`+0x3190`) splits them, because its right-hand side starts with
      // `physical_size +`. Requiring one fused push found four of the five
      // sites and reported the fifth as "convention UNVERIFIED" — correctly,
      // but for the wrong reason.
      const countsWeapon = (candidate) =>
        Array.isArray(candidate.operand)
          ? candidate.operand.filter((operand) => operand.value === "weapon").length
          : 0;
      let sawLookup = countsWeapon(instruction) >= 2;
      for (let ahead = index + 1; ahead < Math.min(index + 12, instructions.length); ahead += 1) {
        const candidate = instructions[ahead];
        if (candidate.name !== "Push" || !Array.isArray(candidate.operand)) continue;
        if (!sawLookup) { sawLookup = countsWeapon(candidate) >= 2; continue; }
        const value = numeric(candidate.operand[0]);
        if (value === null) continue;
        const next = instructions[ahead + 1];
        if (!next || next.name !== "GetMember") continue;
        found.set(field.value, {
          index: value,
          at: `+0x${(candidate.offset - block.offset).toString(16)}`,
          block: block.context
        });
        break;
      }
    }
  }
  return found;
}

/**
 * The document's own two tables.
 *
 * §2.3 (the shop, ids 1-80) and §2.4 (id 0 and the off-shop ids) carry
 * different column orders, so each is matched on its own width and on the
 * literal-offset cell that ends both. Rows are keyed by id, and a duplicate id
 * across the two is reported rather than silently overwritten.
 */
function documentRows(text) {
  const rows = new Map();
  const duplicates = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.startsWith("| ")) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    const id = Number(cells[0]);
    if (!Number.isInteger(id) || !/^\d+$/.test(cells[0])) continue;
    const last = cells.at(-1);
    if (typeof last !== "string" || !last.startsWith("`+0x")) continue;
    let row = null;
    // §2.3: id | band | weap_i | itemlevel | gate | [0] | [3] | [4] | [2] | [5] | cost | page | literal
    if (cells.length === 13) {
      row = { 0: Number(cells[5]), 3: Number(cells[6]), 4: Number(cells[7]), 2: Number(cells[8]), 5: Number(cells[9]) };
    // §2.4: id | [0] | [2] | [3] | [4] | [5] | literal
    } else if (cells.length === 7) {
      row = { 0: Number(cells[1]), 2: Number(cells[2]), 3: Number(cells[3]), 4: Number(cells[4]), 5: Number(cells[5]) };
    }
    if (row === null) continue;
    row.offset = last.replaceAll("`", "");
    if (rows.has(id)) duplicates.push(id);
    rows.set(id, row);
  }
  return { rows, duplicates };
}

function main(argv) {
  const swfPath = argv[0] ?? DEFAULT_SWF;
  let buffer;
  try {
    buffer = readFileSync(swfPath);
  } catch (error) {
    console.error(`Cannot read the licensed build at:\n  ${swfPath}\n${error.message}`);
    console.error("Pass the path as the first argument. This tool needs the installed SWF and has no fallback:");
    console.error("for build DATA the only honest oracle is the build.");
    return 2;
  }

  const { analysis } = analyseSwfBuffer(buffer);
  const { table, contexts } = weaponLiteralsIn(analysis);
  const { rows, duplicates } = documentRows(readFileSync(DOC_PATH, "utf8"));

  console.log(`build: ${swfPath}`);
  console.log(`       ${buffer.length} bytes`);
  console.log(`literals found: ${table.size}, all in ${[...contexts].join(", ") || "(none)"}`);
  console.log(`document rows:  ${rows.size} from ${path.relative(REPO_ROOT, DOC_PATH)}`);

  const problems = [];
  // Vacuity guards. A census that parses nothing agrees with everything.
  if (table.size === 0) problems.push("no weapon literals matched in the build — the shape scan is broken, not the document");
  if (rows.size === 0) problems.push("no rows parsed from the document — the table parse is broken, not the build");
  for (const id of duplicates) problems.push(`id ${id} appears in both document tables`);

  let comparisons = 0;
  for (const id of [...new Set([...table.keys(), ...rows.keys()])].sort((a, b) => a - b)) {
    const built = table.get(id);
    const documented = rows.get(id);
    if (!built) { problems.push(`id ${id}: in the document, not in the build`); continue; }
    if (!documented) { problems.push(`id ${id}: in the build (${built.offset}), not in the document`); continue; }
    if (!built.hasDisplayName) problems.push(`id ${id}: index [1] is not a string; the shape assumption is wrong`);
    for (const field of ["0", "2", "3", "4", "5", "offset"]) {
      comparisons += 1;
      if (built[field] !== documented[field]) {
        problems.push(`id ${id} index [${field}]: build ${built[field]}, document ${documented[field]}`);
      }
    }
  }
  console.log(`compared ${comparisons} fields`);

  console.log("\nindex convention, read off `battlevalues` rather than assumed:");
  const readers = readerIndicesIn(analysis);
  for (const [field, expected] of Object.entries(READER_SITES)) {
    const site = readers.get(field);
    if (!site) {
      problems.push(`${field}: no reader site found; the convention is UNVERIFIED, not confirmed`);
      console.log(`  ${field.padEnd(18)} NOT FOUND`);
      continue;
    }
    const ok = site.index === expected;
    if (!ok) problems.push(`${field}: the build reads index ${site.index}, the document says ${expected}`);
    console.log(`  ${field.padEnd(18)} index ${site.index} at ${site.at} ${ok ? "" : `!= documented ${expected}`}`);
  }

  if (problems.length === 0) {
    console.log("\nOK: every documented row matches its literal, and every index matches its reader site.");
    return 0;
  }
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const problem of problems) console.log(`  ${problem}`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
