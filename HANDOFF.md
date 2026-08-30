# Transfer handoff — SS2 Team Arena Foundation

## Capture campaign state (2026-08-30, end of session)

One session away from the first golden. Read this section first.

- **Committed evidence**: `test/observations/ss2-1v1/obs-20260830-e1.json`
  formally MATCHES `candidate-duel-firstblood-normal-kill` (observation 1 of
  the 2 the promotion gate needs). Eighteen candidate fixtures exist; the
  full pipeline (`simulate`/`tape`/`delog`/`ingest`/`verify`/`promote`) is
  tested (78 tests) and gate-verified end to end
  (`tools/runtime-capture/validate-vehicle.ps1` must PASS after any wrapper
  edit).
- **The deterministic target**: the operator's gladiator **John Ringler**
  (attack 1, defence 1, strength 10, charisma 1, magicka 1, min 21 / max
  23, 30 hp, 110 stamina, no armour) versus the **tutorial prisoner**
  (all-zero stats, 10 hp, `fight_mode "misc"` — constant every time). The
  operator discovered the fight **re-offers if the window is closed before
  clicking the post-kill checkmark** — the replay loop for observation
  pairs. One melee hit (21–23 damage vs 10 hp) is always lethal.
- **Session flow**: regenerate the tape-carrier with
  `node tools/runtime-capture/gen-provisional-prisoner.mjs`, launch with
  `powershell -File tools\runtime-capture\launch-capture.ps1 -FixturePath
  captures\provisional-prisoner-kill.json -SessionId <s> -ObservationId
  <o>`; operator walks to the prisoner and normal-attacks; the kill
  auto-closes the trace. Author the real candidate from the capture,
  re-ingest the same raw jsonl against it (observation A), replay via the
  checkmark trick (observation B), then `promote`. Saves are snapshotted
  with `tools/runtime-capture/save-state.ps1` (short non-OneDrive root,
  hash-verified; snapshot `post-k-character` holds the character).
- **Capture kit v3 mechanics** (all forced by live evidence, see the git
  log from `b54aa45` to HEAD): frame 52 re-defines the combat functions and
  calls them in the same script (slot wraps cannot interpose), each Ruffle
  level has its own `Math`, and watching function slots VOIDS the game's
  scope-style definitions. Hence: a tapped `Math` clone is planted as a
  timeline variable on the game root and overlay (serves/records the tape
  for every path); recording arms at `attack_chances` **only when
  `attack_direction` is a number** (the function also renders the UI button
  percentages with direction null); lethal captures close one tick after
  the surviving native `gotoAndPlay`; `nextphase` closes non-lethal armed
  windows; per-frame sweeps re-wrap functions and re-watch swapped stat
  objects; `dbg` milestone lines in the raw log (stripped by delog) show
  exactly where a failed session stopped.
- **Not yet verified live** (the very next session answers both): the
  direction-gated arming and the Math-shadow interception against the real
  game (`math-shadowed:*` and `mrand-first` dbg lines, and injected roll
  lines in the trace, are the confirmation signals).
- **Known out-of-scope actions**: range taunts (and opcode-rolled paths)
  make zero `randomBetween` calls — uncapturable by design, documented in
  the runtime-capture doc. Melee attacks are the capture family.



## On the PC with Swords & Sandals II installed

1. Preferred: copy `ss2-team-arena-foundation.bundle` to the new PC and run
   `git clone ss2-team-arena-foundation.bundle ss2-team-arena-foundation`.
   This preserves the complete commit history.
2. Alternative: extract the transfer ZIP into a new local Codex project folder.
3. Open that folder as the project, then continue this Codex task and say that
   the licensed game is installed.
4. Give Codex permission to read the game's installation directory when asked.
   Do not copy, upload, or redistribute the original SWF or assets.
5. Run `npm test` from this folder to confirm the transferred foundation.

## What Codex should inspect first

Locate the licensed Swords & Sandals Classic Collection installation and identify
the S&S II SWF and any S&S II mod folders. The adapter work starts by mapping
the vanilla battle entry point, player/opponent state objects, random-number
generation, combat formulas, result callback, and battle movie clips.

## Scope already completed

`src/engine.js` is an asset-free deterministic combat core for one-to-three
gladiators per team. It provides targeting, AI turns, local/hot-seat controller
identities, replays, wire snapshots, and state hashes. Its formulas are
intentional placeholders until they can be validated against the licensed game.

The fingerprinted Steam build now has a read-only battle map and an isolated
asset-free 1v1 candidate harness with fifteen strict ordered-RNG fixtures.
Static candidates are not runtime goldens and do not replace the placeholder
engine rules. The Stage 3 runtime-capture pipeline is in place: observation
records with digests, raw-trace ingestion, a two-independent-observation
promotion gate, preserved divergence reports, a reference-trace simulator
(never promotable), an unvalidated AS2 wrapper draft, and the
`tools/capture-session.mjs` CLI, all documented in
`docs/integration/ss2-runtime-capture.md`. The battle map's damage ingresses
were re-verified opcode-by-opcode on 2026-08-30 (see the defeat-gate and
`magic_damage_character` sections), which corrected the breastplate-stamina
rule in the isolated candidate. The next technical gate is running the first
controlled licensed 1v1 captures — the capture vehicle (portable Ruffle
0.5.0 plus the FFDec-compiled wrapper) is installed and validated end to end
by `tools/runtime-capture/validate-vehicle.ps1`, and
`tools/runtime-capture/launch-capture.ps1` drives real sessions — followed
by the SS2 state/UI adapter. The delivery target remains 2v2 and 3v3
cooperative campaign support; see `docs/roadmap.md`.

## Keep the project lawful and reversible

Use only a licensed local copy for inspection. Keep originals untouched, work in
a separate mod folder, and distribute patches or independently authored files
rather than the original game files or assets.
