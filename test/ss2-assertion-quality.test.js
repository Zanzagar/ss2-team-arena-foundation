/**
 * Properties of the test suite itself.
 *
 * Why this suite exists
 * ---------------------
 * Four separate audits this session each found the same class of defect, and
 * each time it had hidden a real bug for weeks: a test that PASSES but does
 * not CONSTRAIN. A test asserting "every vanilla sibling is byte-identical"
 * deleted the added namespace before comparing. A provenance test matched a
 * build hash against a regexp, so sixty-four zeros passed. An adapter test
 * asserted that the writer writes exactly what the comparator compares. A test
 * named "a death on the winning side" had both its actions attacking the same
 * direction, so nobody was ever knocked down.
 *
 * What this file checks, and what it CANNOT
 * -----------------------------------------
 * Be clear about the limit, because overstating it would be the same failure
 * this file exists to catch. **None of the four defects above is detectable by
 * this file.** Each required reading the test against the behaviour it named,
 * and "does this assertion mean what its name claims" is not a mechanical
 * property. What is mechanical is the surrounding hygiene — the shapes that
 * make an assertion unable to fail *at all*, regardless of what it is about:
 *
 *   1. non-vacuity: the lexer really engaged with every file
 *   2. every `assert.throws`/`rejects` carries a failure predicate
 *   3. a regexp predicate names something rather than matching anything
 *   4. every `assert.rejects` is awaited, so its failure is observable
 *   5. no equality assertion compares an expression with itself
 *   6. no `assert.ok` on a constant-truthy literal
 *   7. every `test()` body contains at least one assertion
 *   8. no duplicate test names within a file
 *   9. no `.only` left behind, which would silently skip the rest of a file
 *  10. a file that lists a directory proves the listing was not empty
 *
 * So this is a RATCHET, not a detector. Every property below already holds
 * across the whole suite; the file's job is to keep it holding. It found none
 * of the defects listed above and it would not have.
 *
 * Deliberately NOT a snapshot of the present
 * ------------------------------------------
 * Two tests in this project asserted a snapshot of the current moment as an
 * invariant ("no committed record carries an attestation", "no fixture outside
 * these families stages tournament mode"). Both broke the moment the intended
 * future arrived, and one cost a new fixture family an observable channel.
 * Writing that same shape here — pinning the count of test files, the number
 * of tests, or a list of file names — would be this file committing the exact
 * defect it audits. It therefore pins NOTHING: it discovers the test files by
 * listing the directory, quantifies universally over whatever it finds, and
 * asserts only floors of the form "greater than zero". A new test file is
 * covered automatically and no honest change to the suite can turn it red.
 *
 * The lexer is a lexer, not a parser
 * ----------------------------------
 * `callsTo` below tracks strings, template literals, comments and regexp
 * literals so it does not match inside them, but it does not build an AST. A
 * silently degraded lexer would make every check below pass vacuously, which
 * is why the FIRST test asserts that it extracted tests and assertions from
 * every single file. That guard is the thing standing between this file and
 * being the instrument that commits the failure it was built to detect.
 *
 * Every check here was verified by injecting a violating file and confirming
 * the check goes red — a check that has never been seen to fail is exactly the
 * thing this file exists to refuse.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * A file may declare that it lists a directory it legitimately expects to be
 * empty, which is the one honest reason to have no non-emptiness floor. The
 * marker has to be written on purpose, so the exemption stays visible.
 */
const EMPTY_LISTING_OPT_OUT = "assertion-quality: empty listing is the assertion";

// ---------------------------------------------------------------------------
// A comment-, string- and regexp-aware call extractor.
// ---------------------------------------------------------------------------

/** Keywords after which a `/` starts a regexp literal rather than division. */
const REGEXP_MAY_FOLLOW = new Set([
  "return", "typeof", "case", "in", "of", "new", "delete", "void",
  "instanceof", "do", "else", "yield", "await"
]);

function regexpCanStartAfter(previousToken) {
  if (previousToken === "") return true;
  if (/^[A-Za-z0-9_$)\]]/.test(previousToken)) return REGEXP_MAY_FOLLOW.has(previousToken);
  return true;
}

function skipQuoted(source, index) {
  const quote = source[index];
  index += 1;
  while (index < source.length) {
    if (source[index] === "\\") { index += 2; continue; }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return index;
}

function skipTemplate(source, index) {
  index += 1;
  while (index < source.length) {
    if (source[index] === "\\") { index += 2; continue; }
    if (source[index] === "`") return index + 1;
    if (source[index] === "$" && source[index + 1] === "{") {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source[index] === "\\") { index += 2; continue; }
        if (source[index] === '"' || source[index] === "'") { index = skipQuoted(source, index); continue; }
        if (source[index] === "`") { index = skipTemplate(source, index); continue; }
        if (source[index] === "{") depth += 1;
        else if (source[index] === "}") depth -= 1;
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  return index;
}

/** Returns the index past a regexp literal, or `index` if this `/` is not one. */
function skipRegexp(source, index) {
  let scan = index + 1;
  let inClass = false;
  while (scan < source.length) {
    const character = source[scan];
    if (character === "\\") { scan += 2; continue; }
    if (character === "\n") return index;
    if (inClass) { if (character === "]") inClass = false; }
    else if (character === "[") inClass = true;
    else if (character === "/") {
      scan += 1;
      while (scan < source.length && /[a-z]/.test(source[scan])) scan += 1;
      return scan;
    }
    scan += 1;
  }
  return index;
}

/** Splits the argument list starting at `openParen` into top-level arguments. */
function splitArguments(source, openParen) {
  let index = openParen + 1;
  let depth = 1;
  const parts = [];
  let start = index;
  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'") { index = skipQuoted(source, index); continue; }
    if (character === "`") { index = skipTemplate(source, index); continue; }
    if (character === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (character === "/") {
      const past = skipRegexp(source, index);
      if (past > index) { index = past; continue; }
    }
    if ("([{".includes(character)) { depth += 1; index += 1; continue; }
    if (")]}".includes(character)) {
      depth -= 1;
      if (depth === 0) {
        parts.push(source.slice(start, index));
        const trimmed = parts.map((part) => part.trim());
        while (trimmed.length > 0 && trimmed.at(-1) === "") trimmed.pop();
        return { args: trimmed, end: index + 1 };
      }
      index += 1;
      continue;
    }
    if (character === "," && depth === 1) {
      parts.push(source.slice(start, index));
      start = index + 1;
      index += 1;
      continue;
    }
    index += 1;
  }
  return null;
}

/**
 * Every call whose callee text matches `calleePattern`, with its top-level
 * arguments as raw source text. Matches nothing inside a string, template,
 * comment or regexp literal.
 */
function callsTo(source, calleePattern) {
  const found = [];
  let index = 0;
  let previousToken = "";
  while (index < source.length) {
    const character = source[index];
    if (character === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (character === '"' || character === "'") { index = skipQuoted(source, index); previousToken = "'"; continue; }
    if (character === "`") { index = skipTemplate(source, index); previousToken = "'"; continue; }
    if (character === "/" && regexpCanStartAfter(previousToken)) {
      const past = skipRegexp(source, index);
      if (past > index) { index = past; previousToken = "/"; continue; }
    }
    if (/[A-Za-z_$]/.test(character)) {
      let end = index;
      while (end < source.length && /[A-Za-z0-9_$.]/.test(source[end])) end += 1;
      const callee = source.slice(index, end);
      let afterName = end;
      while (afterName < source.length && /\s/.test(source[afterName])) afterName += 1;
      if (source[afterName] === "(" && calleePattern.test(callee)) {
        const split = splitArguments(source, afterName);
        if (split) {
          found.push({
            callee,
            index,
            // `test` reached as `t.test` is a subtest, not a top-level test.
            memberAccess: source[index - 1] === ".",
            args: split.args
          });
        }
      }
      previousToken = callee;
      index = end;
      continue;
    }
    if (!/\s/.test(character)) previousToken = character;
    index += 1;
  }
  return found;
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/**
 * The names of functions in a file that assert, directly or through another
 * such function.
 *
 * A test that reaches its assertions through a local helper is asserting, and
 * a check that could not see that would push authors away from helpers — a
 * style rule wearing a correctness rule's clothes. So the "does this test
 * assert" question follows one level of indirection and then closes over it.
 */
function assertingHelpersIn(source) {
  const bodies = new Map();
  const declaration = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function)/g;
  for (const match of source.matchAll(declaration)) {
    const name = match[1] ?? match[2] ?? match[3];
    const openBrace = source.indexOf("{", match.index + match[0].length - 1);
    // An expression-bodied arrow has no brace before the next statement; take
    // the rest of the line, which is where its expression lives.
    const lineEnd = source.indexOf("\n", match.index + match[0].length);
    let body;
    if (openBrace >= 0 && (lineEnd < 0 || openBrace < lineEnd)) {
      let depth = 0;
      let scan = openBrace;
      for (; scan < source.length; scan += 1) {
        if (source[scan] === "{") depth += 1;
        else if (source[scan] === "}") { depth -= 1; if (depth === 0) break; }
      }
      body = source.slice(openBrace, scan + 1);
    } else {
      body = source.slice(match.index, lineEnd < 0 ? source.length : lineEnd);
    }
    bodies.set(name, body);
  }

  const asserting = new Set();
  for (const [name, body] of bodies) if (/assert\./.test(body)) asserting.add(name);
  // One closure pass: a helper that calls an asserting helper also asserts.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const [name, body] of bodies) {
      if (asserting.has(name)) continue;
      for (const helper of asserting) {
        if (new RegExp(`\\b${helper}\\s*\\(`).test(body)) { asserting.add(name); break; }
      }
    }
  }
  return asserting;
}

// ---------------------------------------------------------------------------
// The corpus: discovered, never pinned.
// ---------------------------------------------------------------------------

const files = readdirSync(TEST_DIR)
  .filter((name) => name.endsWith(".js"))
  .sort()
  .map((name) => {
    const source = readFileSync(path.join(TEST_DIR, name), "utf8");
    return {
      name,
      source,
      tests: callsTo(source, /^(?:test|it)$/).filter((call) => !call.memberAccess),
      assertions: callsTo(source, /^assert\.[A-Za-z]+$/),
      throwsCalls: callsTo(source, /^assert\.(?:throws|rejects)$/),
      assertingHelpers: assertingHelpersIn(source)
    };
  });

/** Reports a list of offences as one readable failure. */
function assertNoOffences(offences, headline) {
  assert.deepEqual(offences, [], `${headline}\n  ${offences.join("\n  ")}`);
}

// ---------------------------------------------------------------------------
// 1. Non-vacuity. Everything below is universally quantified, so a lexer that
//    silently stopped extracting would make every one of these tests pass
//    while checking nothing. This test is the only thing preventing that.
// ---------------------------------------------------------------------------

test("the lexer extracted tests and assertions from every file, so nothing below passes vacuously", () => {
  assert.ok(files.length > 0, "no test files were discovered — every check below would be vacuous");

  const silent = files
    .filter((file) => file.tests.length === 0 || file.assertions.length === 0)
    .map((file) => `${file.name}: ${file.tests.length} tests, ${file.assertions.length} assertions`);
  assertNoOffences(
    silent,
    "a test file yielded no tests or no assertions. Either the file really has none — which is " +
    "itself the defect — or this file's lexer failed on it and every check below is passing " +
    "vacuously for that file. Both need reading; neither may be left."
  );

  // Floors, not counts: this file must never pin how large the suite is.
  assert.ok(
    files.reduce((total, file) => total + file.tests.length, 0) > 0,
    "no test() calls were extracted from the whole suite"
  );
  assert.ok(
    files.reduce((total, file) => total + file.throwsCalls.length, 0) > 0,
    "no assert.throws/rejects calls were extracted from the whole suite"
  );
});

// ---------------------------------------------------------------------------
// 2. A refusal must be pinned to the refusal it names.
// ---------------------------------------------------------------------------

test("every assert.throws and assert.rejects carries a failure predicate", () => {
  // `assert.throws(fn)` passes for ANY error, so it cannot tell the refusal it
  // was written for from a TypeError raised by a typo on the way to it. The
  // whole point of these tests is which refusal fired.
  const offences = [];
  for (const file of files) {
    for (const call of file.throwsCalls) {
      if (call.args.length < 2) {
        offences.push(`${file.name}:${lineOf(file.source, call.index)} ${call.callee} has no predicate`);
      }
    }
  }
  assertNoOffences(
    offences,
    "an assert.throws/rejects would accept any error at all. Give it the error class, a message " +
    "regexp, or a validator function."
  );
});

test("every regexp predicate names something rather than matching almost anything", () => {
  // `/e/` or `/./` is a predicate in form only. A predicate has to contain at
  // least one run of literal characters long enough to name the refusal — the
  // shortest in the suite today is four (`/disk is full/`, `/not JSON-safe/`).
  const MINIMUM_LITERAL_RUN = 3;
  const offences = [];
  for (const file of files) {
    for (const call of file.throwsCalls) {
      const predicate = call.args[1] ?? "";
      if (!predicate.startsWith("/")) continue;
      const body = predicate.slice(1, predicate.lastIndexOf("/"));
      const literalRuns = body
        .replace(/\\./g, " ")        // escapes are not literal text
        .replace(/\[[^\]]*\]/g, " ") // character classes match many things
        .replace(/[.*+?^${}()|]/g, " ")
        .match(/[A-Za-z0-9_]+/g) ?? [];
      const longest = literalRuns.reduce((best, run) => Math.max(best, run.length), 0);
      if (longest < MINIMUM_LITERAL_RUN) {
        offences.push(`${file.name}:${lineOf(file.source, call.index)} ${predicate}`);
      }
    }
  }
  assertNoOffences(
    offences,
    `a regexp predicate has no literal run of ${MINIMUM_LITERAL_RUN}+ characters, so it does not ` +
    "identify the message it is meant to pin."
  );
});

test("every assert.rejects is awaited or returned, so its failure can be observed", () => {
  // A bare `assert.rejects(...)` returns a promise nobody holds. The test
  // function resolves first, the test passes, and the assertion's verdict —
  // pass or fail — is discarded. It is unfailable by construction.
  const offences = [];
  for (const file of files) {
    for (const call of file.throwsCalls) {
      if (call.callee !== "assert.rejects") continue;
      const preceding = file.source.slice(0, call.index).replace(/\s+$/, "");
      const handed = /\b(?:await|return)$/.test(preceding) || /[(,[=]$/.test(preceding);
      if (!handed) {
        offences.push(`${file.name}:${lineOf(file.source, call.index)} assert.rejects is not awaited`);
      }
    }
  }
  assertNoOffences(
    offences,
    "an assert.rejects result is discarded, so the assertion cannot fail the test. Await it."
  );
});

// ---------------------------------------------------------------------------
// 3. Shapes that cannot fail for any implementation.
// ---------------------------------------------------------------------------

test("no equality assertion compares an expression with itself", () => {
  // `assert.equal(x.y, x.y)` is true for every implementation of everything.
  const EQUALITY = /^assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual|notDeepEqual|notDeepStrictEqual)$/;
  const offences = [];
  for (const file of files) {
    for (const call of callsTo(file.source, EQUALITY)) {
      if (call.args.length < 2) continue;
      const [actual, expected] = call.args;
      if (actual.replace(/\s+/g, "") === expected.replace(/\s+/g, "")) {
        offences.push(`${file.name}:${lineOf(file.source, call.index)} ${actual.slice(0, 70)}`);
      }
    }
  }
  assertNoOffences(
    offences,
    "an equality assertion has textually identical operands, so it holds for any implementation."
  );
});

test("no assert.ok is handed a constant-truthy literal", () => {
  // `assert.ok(true)` and `assert.ok("checked")` are decoration, not checks.
  const offences = [];
  for (const file of files) {
    for (const call of callsTo(file.source, /^assert\.ok$/)) {
      const subject = call.args[0] ?? "";
      const constantTruthy =
        subject === "true" ||
        /^"[^"]+"$/.test(subject) ||
        /^'[^']+'$/.test(subject) ||
        (/^\d+(?:\.\d+)?$/.test(subject) && Number(subject) !== 0);
      if (constantTruthy) {
        offences.push(`${file.name}:${lineOf(file.source, call.index)} assert.ok(${subject})`);
      }
    }
  }
  assertNoOffences(offences, "an assert.ok was given a literal that is true before the code runs.");
});

// ---------------------------------------------------------------------------
// 4. A test has to assert, be findable, and not silence its neighbours.
// ---------------------------------------------------------------------------

test("every test body contains an assertion or an explicit skip", () => {
  // `test("name")` with no body, and a body that only calls the subject, both
  // report a green tick for having executed something. Neither constrains it.
  const offences = [];
  for (const file of files) {
    for (const call of file.tests) {
      const body = call.args.slice(1).join(",");
      const asserts = /assert\./.test(body) ||
        [...file.assertingHelpers].some((helper) => new RegExp(`\\b${helper}\\s*\\(`).test(body));
      const declaredSkip = /\.(?:skip|todo|diagnostic)\s*\(/.test(body);
      if (!asserts && !declaredSkip) {
        offences.push(`${file.name}:${lineOf(file.source, call.index)} ${call.args[0] ?? "<unnamed>"}`);
      }
    }
  }
  assertNoOffences(
    offences,
    "a test runs code and asserts nothing about it, so it reports green for any behaviour."
  );
});

test("no two tests in a file share a name", () => {
  // A duplicate name means a failure report cannot say which test failed, and
  // a copy-paste that was meant to be edited reads as an intentional pair.
  const offences = [];
  for (const file of files) {
    const seen = new Set();
    for (const call of file.tests) {
      const name = call.args[0] ?? "";
      if (seen.has(name)) offences.push(`${file.name}:${lineOf(file.source, call.index)} ${name.slice(0, 80)}`);
      seen.add(name);
    }
  }
  assertNoOffences(offences, "two tests in one file share a name, so a failure cannot be attributed.");
});

test("no test is marked .only, which would silence every other test in its file", () => {
  const offences = [];
  for (const file of files) {
    for (const match of file.source.matchAll(/\b(?:test|it|describe|suite)\.only\b/g)) {
      offences.push(`${file.name}:${lineOf(file.source, match.index)}`);
    }
  }
  assertNoOffences(
    offences,
    "a .only was committed. Under --test-only it would reduce its whole file to one test."
  );
});

// ---------------------------------------------------------------------------
// 5. A loop over a listing must prove the listing was not empty.
// ---------------------------------------------------------------------------

test("every file that lists a directory proves the listing was not empty", () => {
  // Sixty-nine divergence reports were once deleted and nothing in the suite
  // noticed. A test that lists a directory and asserts a property of each
  // entry passes perfectly when the directory is empty: `for (const x of [])`
  // runs no assertions at all. The floor is what makes the loop mean anything.
  const offences = [];
  for (const file of files) {
    if (!/\breaddir(?:Sync)?\s*\(/.test(file.source)) continue;
    if (file.source.includes(EMPTY_LISTING_OPT_OUT)) continue;
    const hasFloor = /\.(?:length|size)\s*>=?\s*\d/.test(file.source);
    if (!hasFloor) offences.push(file.name);
  }
  assertNoOffences(
    offences,
    "a file lists a directory but never asserts the listing is non-empty, so its per-entry " +
    "assertions would all pass against an empty directory. Add a floor such as " +
    `\`assert.ok(entries.length > 0, "...")\`, or — if an empty listing really is the thing being ` +
    `asserted — write the comment "${EMPTY_LISTING_OPT_OUT}" to say so on purpose.`
  );
});
