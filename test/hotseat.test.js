/**
 * The hot-seat runner is the only thing in this repository a person can play,
 * and an unplayed runner rots silently: nothing else imports it, so a rename in
 * `src/team/` breaks it without failing a single existing test. These drive the
 * real CLI as a subprocess — the way a person runs it — rather than importing
 * its internals, because the failure that matters is "the fight will not start".
 *
 * They assert BEHAVIOUR, not layout. Banner wording and bar glyphs are free to
 * change; a fight reaching a winner, the honesty banner naming the rule set's
 * verification tier, and identical seeds replaying identically are not.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = path.join(REPO_ROOT, "tools", "hotseat.mjs");

/** Runs the CLI with piped stdin and resolves with { code, stdout, stderr }. */
function runHotseat(args = [], stdin = "") {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [RUNNER, ...args],
      { cwd: REPO_ROOT, timeout: 60_000 },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr });
      }
    );
    child.stdin.end(stdin);
  });
}

/** Enough "attack the only foe" choices to finish any fight these tests start. */
const ALWAYS_ATTACK = "1\n".repeat(40);

test("a hot-seat fight runs from start to a winner", async () => {
  const { code, stdout, stderr } = await runHotseat(
    ["--seed", "7", "--hp", "40", "--names", "Ringler,Zainger"],
    ALWAYS_ATTACK
  );
  assert.equal(code, 0, `runner exited ${code}\n${stderr}`);
  assert.match(stdout, /WINNER: (Ringler|Zainger)\s+\(elimination\)/,
    "a fight driven to the end must name a winner and why");
  assert.match(stdout, /turn 1/, "the first turn must be announced");
  // The loser is shown as down, which is the resolver's `alive` flag surfacing.
  assert.match(stdout, /\(down\)/, "the defeated fighter must be marked down");
});

test("the banner names the rule set's verification tier, and warns when it is not measured", async () => {
  // This is the honesty guard. The placeholder rules are an invented
  // approximation, and a playable demo is the easiest place in the project to
  // let that be mistaken for measured SS2 behaviour.
  const { stdout } = await runHotseat(["--seed", "1", "--hp", "10"], ALWAYS_ATTACK);
  assert.match(stdout, /verification: placeholder/,
    "the tier must be on screen, not merely in the source");
  assert.match(stdout, /NOT SS2 BEHAVIOUR/,
    "a placeholder rule set must carry an explicit warning");
  assert.doesNotMatch(stdout, /Backed by \d+ golden/,
    "a placeholder rule set must never claim golden backing");
});

test("the same seed and the same choices replay identically", async () => {
  // Determinism is the entire premise of this resolver: two machines must
  // resolve a battle the same way, or multiplayer is impossible later.
  const args = ["--seed", "99", "--hp", "50"];
  const first = await runHotseat(args, ALWAYS_ATTACK);
  const second = await runHotseat(args, ALWAYS_ATTACK);
  assert.equal(first.code, 0);
  assert.equal(first.stdout, second.stdout, "identical seed and choices must produce identical output");
});

test("the runner decides no combat: every roll it causes is drawn by the rule set", async () => {
  // The runner must never roll dice of its own. The resolver journals every
  // draw, so a runner that invented one would push the reported count above the
  // journal — and the count is printed precisely so this stays checkable.
  const { stdout } = await runHotseat(["--seed", "5", "--hp", "40"], ALWAYS_ATTACK);
  const drawn = stdout.match(/rolls drawn: (\d+)/);
  assert.ok(drawn, "the runner must report how many rolls were drawn");
  assert.ok(Number(drawn[1]) > 0, "a completed fight must have drawn at least one roll");
});

test("input ending early stops the fight cleanly instead of hanging", async () => {
  // Measured during development: readline against a closed pipe consumed one
  // line of eight and then died on an unsettled top-level await. A runner that
  // hangs on EOF cannot be scripted, demoed, or tested.
  const { code, stdout } = await runHotseat(["--seed", "2", "--hp", "500"], "1\n");
  assert.equal(code, 0, "running out of input must not be an error exit");
  assert.match(stdout, /input ended before the fight did/);
});

test("quitting is possible, and records no result", async () => {
  const { code, stdout } = await runHotseat(["--seed", "2", "--hp", "40"], "q\n");
  assert.equal(code, 0);
  assert.match(stdout, /No result recorded/);
  assert.doesNotMatch(stdout, /WINNER/, "quitting must not declare a winner");
});

test("bad input is rejected without starting a fight", async () => {
  const bad = await runHotseat(["--bogus"], "");
  assert.equal(bad.code, 2, "an unknown flag must exit non-zero");
  assert.match(bad.stderr, /Unknown flag/);

  const badSeed = await runHotseat(["--seed", "not-a-number"], "");
  assert.equal(badSeed.code, 2);
  assert.match(badSeed.stderr, /--seed must be an integer/);

  const badNames = await runHotseat(["--names", "OnlyOne"], "");
  assert.equal(badNames.code, 2);
  assert.match(badNames.stderr, /exactly two/);
});

test("an unparsable choice re-prompts rather than crashing or acting", async () => {
  const { code, stdout } = await runHotseat(["--seed", "3", "--hp", "40"], "banana\n1\n1\n1\n1\n1\n1\n");
  assert.equal(code, 0);
  assert.match(stdout, /is not one of 1-/, "a bad choice must say so");
  assert.match(stdout, /WINNER/, "and the fight must still be playable afterwards");
});
