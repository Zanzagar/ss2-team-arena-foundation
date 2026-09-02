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

test("the banner names the placeholder tier, and warns that it is not measured", async () => {
  // This is the honesty guard. The placeholder rules are an invented
  // approximation, and a playable demo is the easiest place in the project to
  // let that be mistaken for measured SS2 behaviour.
  const { stdout } = await runHotseat(["--rules", "placeholder", "--seed", "1", "--hp", "10"], ALWAYS_ATTACK);
  assert.match(stdout, /verification: placeholder/,
    "the tier must be on screen, not merely in the source");
  assert.match(stdout, /NOT SS2 BEHAVIOUR/,
    "a placeholder rule set must carry an explicit warning");
  assert.doesNotMatch(stdout, /Backed by \d+ golden/,
    "a placeholder rule set must never claim golden backing");
});

test("the default is the SS2 rule set, and the banner refuses to overstate it", async () => {
  // The default changed the day the corpus got a consumer. `map-derived` is
  // the easiest tier to misread as "verified", so the banner has to say what
  // has golden backing and what has none, on every run.
  const { stdout } = await runHotseat(["--seed", "1", "--hp", "10"], ALWAYS_ATTACK);
  assert.match(stdout, /verification: map-derived/);
  assert.match(stdout, /NOT RUNTIME-VERIFIED/);
  assert.match(stdout, /NO runtime backing/,
    "the banner must name the parts of the fight no golden covers");
  assert.doesNotMatch(stdout, /Backed by \d+ golden fixture/,
    "only a runtime-verified rule set may claim its goldens back the whole fight");
});

test("the SS2 fight shows the build's own derivation, drawn direction included", async () => {
  // SS2 draws the attack direction; the player does not choose it. Putting the
  // draw on screen is what makes that visible rather than merely documented.
  const { stdout } = await runHotseat(["--seed", "7", "--hp", "40"], ALWAYS_ATTACK);
  assert.match(stdout, /direction \d+ {3}chance \d+% {3}rolled \d+ vs \d+ {3}(HIT|miss)/);
  assert.match(stdout, /quick-attack -> /, "the vocabulary on screen must be SS2's, not the placeholder's");
  assert.match(stdout, /staminaleft \d+\/\d+/, "stamina gates legality, so it has to be visible");
});

test("an unknown rule set is refused by name", async () => {
  const { code, stderr } = await runHotseat(["--rules", "bogus"], "");
  assert.equal(code, 2);
  assert.match(stderr, /--rules must be one of/);
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
  // This test used to assert only that a positive roll count was printed, and
  // a verifier showed that a mutant runner which fabricates 2 damage after
  // every action — printing figures contradicting its own scoreboard — passed
  // it and all ten of its neighbours. The no-combat property was a property of
  // the code and of nothing else. Two assertions close that.
  const { stdout } = await runHotseat(["--seed", "5", "--hp", "40", "--armour", "3"], ALWAYS_ATTACK);

  // 1. The journal is the resolver's own ordered record; the cursor is a
  //    counter. A runner that drew a roll of its own moves one and not the
  //    other.
  const drawn = stdout.match(/rolls drawn: (\d+)   rng cursor: (\d+)/);
  assert.ok(drawn, "the runner must report both the journal length and the cursor");
  assert.ok(Number(drawn[1]) > 0, "a completed fight must have drawn at least one roll");
  assert.equal(drawn[1], drawn[2], "a roll the runner invented would move the cursor and not the journal");

  // 2. Every damage line must be arithmetic the RESOLVER did: the printed
  //    before/after pair must differ by exactly the printed amount. A runner
  //    that fabricates state, or that fabricates only the printed number,
  //    fails here. (Sound because no action in this vocabulary targets its own
  //    actor with damage, so nothing else moves the target's health.)
  const damage = [...stdout.matchAll(/takes (\d+) damage {2}\((\d+) -> (\d+)\)/g)];
  assert.ok(damage.length > 0, "a completed fight must land at least one blow");
  for (const [line, amount, was, now] of damage) {
    assert.equal(Number(was) - Number(now), Number(amount), line);
  }
});

test("an armour-absorbed hit is reported as a hit, not as a miss", async () => {
  // The runner must not compute the hit verdict itself. It did, from
  // `effect.amount === 0`, and armour absorption made that wrong: the blow was
  // announced as a miss two lines under a derivation line reading HIT.
  const { stdout } = await runHotseat(["--seed", "5", "--hp", "40", "--armour", "4"], ALWAYS_ATTACK);
  const blocks = stdout.split("\n\n");
  for (const block of blocks) {
    if (!/direction \d+ {3}chance/.test(block)) continue;
    const hit = /HIT \(/.test(block);
    if (hit) assert.doesNotMatch(block, /is missed/, "a hit must never be announced as a miss");
    else assert.doesNotMatch(block, /stopped by armour/, "a miss must not be announced as absorbed");
  }
  assert.match(stdout, /stopped by armour/, "the seed must produce at least one absorbed hit");
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
  const { code, stdout } = await runHotseat(["--seed", "3", "--hp", "40"], `banana\n${ALWAYS_ATTACK}`);
  assert.equal(code, 0);
  assert.match(stdout, /is not one of 1-/, "a bad choice must say so");
  assert.match(stdout, /WINNER/, "and the fight must still be playable afterwards");
});
