# Runtime-capture instrumentation

`ss2-capture-wrapper.as` is the independently authored AS2 instrumentation
host for controlled licensed-build capture sessions. It is compiled from
source, never committed as a binary: `make-wrapper-shell.mjs` assembles a
minimal FWS v8 shell and portable FFDec's `-importScript` compiles the wrapper
into it. The compile is content-addressed on the source hash and reused across
sessions — see [the wrapper cache](#the-wrapper-cache).

## Validation status (2026-08-31)

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
3. Validated against the licensed build itself, by the sessions behind all
   **22 promoted goldens** — twelve prisoner kills across every melee attack
   direction and ten probe arms: the real instance path
   `arena.gladiators.overlay`, live battle-flow timing, the `misc` fight
   mode, the direction-gated arming, the Math-shadow interception, and the
   whole unattended navigate-fight-close cycle. Non-lethal outcomes are
   exercised too: the six `probe-*-rollneeded-miss` records close on
   `defender-blocked` with no result event.
4. Not yet exercised live: the **END-key** manual finish (it is only a
   fallback for a trace that did not auto-finish, and no unattended run has
   needed it — the wrapper closes its own trace); the archer controllers
   (this fight forces `using_bow = false`, so `bombard*`/`snipe*`/`bash_attack`
   need a gladiator that owns a bow); and any scenario **staged** with armour
   or status flags. Note that the armour probes do not close that last gap:
   they stage `armourclass: 0` and vary only an injected roll value, so what
   they measure is the armour-selection *draw*, not armour absorption.

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
| `run-capture.ps1` | one session, start to finish, unattended — launches, waits on the log for `battle-ready` and the trace close, then closes the window by **its own recorded pid**. |
| `run-campaign.ps1` | many sessions until a candidate family is fully covered; `-Concurrency <n>` runs a batch at once. |
| `run-arena.ps1` | the levelled-gladiator arena route. **Mutates the licensed save**, refuses to start without a fresh snapshot, and is always serial. |
| `campaign.mjs` | the bookkeeping: `plan`, `seed`, `ingest-round`, `settle`. |
| `build-manifest.mjs` | derive a capture manifest from the observation records it attests. |
| `save-state.ps1` | snapshot / restore the licensed `ss2_data.sol`. |

One session:

```
powershell -File tools\runtime-capture\run-capture.ps1 `
  -FixturePath test\fixtures\ss2-1v1\candidate-prisoner-normal-kill.json `
  -SessionId <unique> -ObservationId <unique>
```

A whole family, until every member has a golden:

```
powershell -File tools\runtime-capture\run-campaign.ps1 `
  -Family prisoner-normal-kill -SessionPrefix camp -Rounds 8 -StopWhenComplete
```

The campaign loop exists because the action a run performs is **observed, not
forced**. For the physical ingress the game draws the direction
(`randomBetween(5, 8)` for a normal attack) before the recording window arms;
for the spell ingress there is no direction at all and the run is identified by
its `spell_id`. Either way, which candidate a run is evidence for is only known
once the trace is read, so `campaign.mjs ingest-round` ingests each session
against every candidate in the family and keeps the one that MATCHES.

**A family is a `-`-delimited id segment, not a raw string prefix**, and its
members are indexed by *action identity* — attack direction for the physical
ingress, spell id for the spell ingress. Six of the family names the committed
candidates offer are therefore refused as single-tape campaigns, correctly:
`armour`, `armoured`, `normal`, `probe`, `spell` and `tournament` all have two
or more members sharing one action identity. They are captured **one candidate
at a time**, as one-member families —

```
powershell -File tools\runtime-capture\run-campaign.ps1 `
  -Family probe-normal-rollneeded-hit -SessionPrefix pr -Rounds 2 -StopWhenComplete
```

— which is exactly how the ten probe goldens were captured. The full account is
in the campaign-automation section of
[`docs/integration/ss2-runtime-capture.md`](../../docs/integration/ss2-runtime-capture.md).

## Running sessions concurrently

Sessions used to be strictly serial, and the recorded reason — a stale Ruffle
window flushes its older save state back on exit and silently clobbers a newer
session's — was real. But it was a consequence of **sharing one SharedObject
store**, and nothing else, so it lifts exactly when a session has its own.

```
powershell -File tools\runtime-capture\run-campaign.ps1 `
  -Family prisoner-normal-kill -SessionPrefix par -Rounds 6 -Concurrency 3
```

`-Concurrency <n>` runs each batch of `n` sessions as background jobs, giving
each one a private `-SaveDirectory` under `%LOCALAPPDATA%\ss2-capture-isolated\<sessionId>`,
seeded from the real save and deleted afterwards. Ingest and settle run **after**
the batch, serially: they are CPU-only, they mutate `test/observations/`, and
promotion reads the evidence set as a whole.

The store lives outside the repository on purpose. That path plus the store's
own nesting is about 203 characters; under `captures/` it would be 259 and hit
the Windows `MAX_PATH` boundary during the seed copy.

To drive concurrency yourself, invoke `run-capture.ps1` once per session with
a distinct `-SaveDirectory` (and distinct ids), then run `campaign.mjs
ingest-round` for each afterwards. `launch-capture.ps1` and `run-capture.ps1`
both lift their one-window guard when `-SaveDirectory` is set.

Four things make that safe:

- **the seed is asserted, not assumed.** The game's `ss2_data.sol` must exist
  in the master store, must land in the isolated store, and must hash equal.
  A session that cannot prove its seed refuses to start.
- **a `-SaveDirectory` containing `..` is refused.** Ruffle silently rejects
  every read and write for such a path (ruffle-rs/ruffle#17825), which would
  produce a session that looks isolated and is not.
- **each launcher records its Ruffle pid** to `captures/<session>/ruffle.pid`,
  and callers close *that* window. The old `Get-Process ruffle | Stop-Process`
  would have killed every concurrent run.
- **`RUST_LOG` is respected when a caller sets it, and raised automatically
  for an isolated-store session.** Ordinary captures keep the old
  `avm_trace=info`, so their raw logs stay comparable with the ones already
  archived.

Measured: three concurrent sessions in **22 s** wall clock against ~45 s
serial, all three closing traces with `overdraw 0` and three distinct launch
nonces, all three matching promoted goldens, and the master `ss2_data.sol`
byte-identical afterwards. The evidence is committed as `obs-par1`–`obs-par3`
(and `obs-iso2` for the single isolated session that preceded them). It is well
short of linear because roughly 7 s of every round is fixed setup — hashing the
~107 MB install and starting the player — which contends on disk and CPU.

**Scope limit, stated plainly: per-session stores FORK the save.** That is
right for the probe and observation campaign, which reads a staged gladiator
and is indifferent to what a session writes. It is **wrong for the arena
route**, which has to *accumulate* level, gold and experience across bouts. So
`-Navigate arena` stays serial, and `run-campaign.ps1` refuses `-Concurrency`
above 1 for any navigator but `prisoner`. `run-arena.ps1` takes no
`-SaveDirectory` at all, guards on any open Ruffle window, and still stops
every Ruffle process on exit — so never run it alongside isolated capture
sessions.

Historical note, because it was recorded as fact and was wrong: `-SaveDirectory`
was **never broken**. The seed simply never landed, and the two Ruffle log lines
that would have said so immediately (`Creating storage dir` and
`Unable to read file "..."`) were suppressed by `RUST_LOG=avm_trace=info`, which
sets Ruffle's *global* log level to off. The root cause was `tools/ffdec.ps1`
redirecting `LOCALAPPDATA` to `.tools/ffdec-profile` for the whole **process**;
`launch-capture.ps1` calls it for the wrapper compile, so the seed copy then
looked for the master store inside `.tools/` and skipped it behind a
`Test-Path`. Both halves are fixed — `ffdec.ps1` saves and restores the
variables, and `launch-capture.ps1` captures the real `LOCALAPPDATA` before
anything can redirect it.

## The wrapper cache

The wrapper compile depends on nothing but `ss2-capture-wrapper.as`, and it is
roughly half of the ~7 s of fixed setup a ~14 s round pays. So the build is
**content-addressed on the source hash** and reused across sessions, under
`captures/wrapper-cache/<first 16 hex of the SHA-256>/`.

Keyed on the source hash rather than a filename or a timestamp on purpose:
reusing a stale wrapper would silently capture with the wrong instrumentation,
which is the one failure mode a cache here could introduce. Any edit to the
source produces a different directory and a fresh compile, so **the cache
cannot go stale — it can only be cold.** Concurrent sessions share it, so a
build is published by rename from a private staging directory rather than
written in place; the loser of a publish race simply uses the winner's build.

`-NoWrapperCache` on `launch-capture.ps1` forces a fresh compile. It exists for
diagnosing the FFDec step itself, not for correctness — and it is a
`launch-capture.ps1` switch only: neither `run-capture.ps1` nor
`run-campaign.ps1` forwards it, so an unattended run that needs it must call
the launcher directly.

Two things the cache deliberately does not do. It does **not** hoist the
install-hash verification above itself — that is a per-session attestation, not
setup, and it stays per session. And moving the wrapper SWF out of the
per-session directory does not move the game's SharedObject: Ruffle keys a
store by the path of the SWF that *created* it, and the game's store is created
by the game on `_level1`.

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
