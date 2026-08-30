# Transfer handoff — SS2 Team Arena Foundation

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
