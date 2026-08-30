# Runtime-capture instrumentation

`ss2-capture-wrapper.as` is the independently authored AS2 instrumentation
host for controlled licensed-build capture sessions. It is compiled from
source on every use (never committed as a binary): `make-wrapper-shell.mjs`
assembles a minimal FWS v8 shell and portable FFDec's `-importScript`
compiles the wrapper into it.

## Validation status (2026-08-30)

The capture vehicle is **validated end to end against a structural stub**:

1. Portable Ruffle 0.5.0 is installed under ignored `.tools/` by
   `tools/install-ruffle.ps1` (pinned release, SHA-256 verified against the
   GitHub-published digest).
2. `validate-vehicle.ps1` — the one-command gate — rebuilds the wrapper and
   `stub-game.as` (a structural mimic of the mapped battle layout that
   replays `candidate-lethal-result` exactly, containing no game content),
   runs the wrapper against the stub under Ruffle, then delogs, ingests
   (live post-session hash check included), and verifies. The round trip
   MATCHES the fixture. This proves FlashVars plumbing, the JSON emitter,
   tape injection, `Object.watch` per-assignment capture with hook
   attribution, cross-level function wrapping, `loadMovieNum` level
   isolation, event emission and ordering, and the whole
   delog→ingest→verify pipeline.
3. Validated against the licensed build itself, by the sessions that produced
   the four `golden-prisoner-normal-kill*` goldens: the real instance path
   `arena.gladiators.overlay`, live battle-flow timing, the `misc` fight
   mode, the direction-gated arming, the Math-shadow interception, and the
   whole unattended navigate-fight-close cycle.
4. Not yet exercised live: the END-key non-lethal finish (every capture so
   far has been lethal), the archer controllers (this fight forces
   `using_bow = false`, so `bombard*`/`snipe*`/`bash_attack` need a gladiator
   that owns a bow), and any staged scenario with armour or status flags.

Run `validate-vehicle.ps1` after every wrapper edit; run
`launch-capture.ps1` for real sessions (it verifies hashes, rebuilds,
injects the fixture tape, opens the licensed game read-in-place via a
`file:` URL, and runs the pipeline when the window closes).

Traces produced against the stub are validation artifacts only: their ids
stay prefixed `stubcheck-` and their observation records never enter
`test/observations/`.

## Running captures

| Script | Use |
| --- | --- |
| `validate-vehicle.ps1` | the gate. Run after **every** wrapper edit, before trusting any real capture. |
| `launch-capture.ps1` | one session against the licensed build; runs delog/ingest/verify on close unless `-SkipPipeline`. |
| `run-capture.ps1` | one session, start to finish, unattended — launches, waits on the log for `battle-ready` and the trace close, then closes the window. |
| `run-campaign.ps1` | many sessions in a loop until a candidate family is fully covered. |
| `campaign.mjs` | the bookkeeping: `plan`, `seed`, `ingest-round`, `settle`. |
| `build-manifest.mjs` | derive a capture manifest from the observation records it attests. |

One session:

```
powershell -File tools\runtime-capture\run-capture.ps1 `
  -FixturePath test\fixtures\ss2-1v1\candidate-prisoner-normal-kill.json `
  -SessionId <unique> -ObservationId <unique>
```

A whole family, until every attack direction has a golden:

```
powershell -File tools\runtime-capture\run-campaign.ps1 `
  -Family prisoner-normal-kill -SessionPrefix camp -Rounds 8 -StopWhenComplete
```

Only one Ruffle window may exist at a time — a stale window flushes its older
save state back on exit and silently clobbers a newer session's — so rounds
are strictly sequential and every entry point refuses to start while one is
open.

The campaign loop exists because `attack_direction` is **observed, not
forced**: the game draws it (`randomBetween(5, 8)` for a normal attack)
before the recording window arms, so which candidate a run is evidence for is
only known once the trace is read. `campaign.mjs ingest-round` therefore
ingests each session against every candidate in the family and keeps the one
that MATCHES. See the campaign-automation section of
[`docs/integration/ss2-runtime-capture.md`](../../docs/integration/ss2-runtime-capture.md).

## Known constraints

- The wrapper cannot observe AVM1 `RandomNumber` opcode rolls (cosmetic
  debris), which are excluded from observation matching.
- It cannot attest the post-session install hash itself: its end line
  carries a `null` placeholder that `capture-session.mjs ingest` replaces
  only after re-running the hash check live.
- FlashVars land as `_root` properties and timeline vars ARE `_root`
  properties — read every FlashVar before declaring any variable with the
  same name (the tape FlashVar was silently clobbered this way; the stub
  gate caught it).
- Reference traces from `capture-session.mjs simulate` must stay
  reproducible by the wrapper modulo meta identity, passive roll values, and
  per-roll callSite attribution.
