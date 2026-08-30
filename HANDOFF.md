# Transfer handoff — SS2 Team Arena Foundation

## On the PC with Swords & Sandals II installed

1. Extract this folder into a new local Codex project folder.
2. Open that folder as the project, then continue this Codex task and say that
   the licensed game is installed.
3. Give Codex permission to read the game's installation directory when asked.
   Do not copy, upload, or redistribute the original SWF or assets.
4. Run `npm test` from this folder to confirm the transferred foundation.

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

## Keep the project lawful and reversible

Use only a licensed local copy for inspection. Keep originals untouched, work in
a separate mod folder, and distribute patches or independently authored files
rather than the original game files or assets.
