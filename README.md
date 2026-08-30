# Swords & Sandals II — Team Arena foundation

An asset-free technical foundation for a future 2v2 / 3v3 SS2 mod. It does not
contain or alter *Swords & Sandals II* itself.

## Current capability

- Two teams of one to three gladiators (including 2v2 and 3v3), resolved by
  one shared resolver in [`src/team/`](src/team) — 1v1 is not a second code
  path. `src/engine.js` is a compatibility facade over it.
- Arbitrary target selection, damage spells, allied healing, rest actions, and
  team-elimination victory rules, with a campaign settlement that fires once,
  only after a whole team is down and the final animation is acknowledged.
- Controller identity is a seat registry independent of combatant identity, so
  human, hot-seat, AI, and named remote controllers mix on one team and a seat
  can be reassigned mid-battle.
- Seeded random state, action logs, replay, JSON-safe snapshots, and state
  hashes for host-authoritative multiplayer.

The combat formulas are explicitly temporary approximations. They are injected
through the rule-set seam ([`src/team/rule-set.js`](src/team/rule-set.js)) so
verified formulas can be dropped in once promoted from a capture: a rule set
may only claim `runtime-verified` if it pins the build hash and cites a
promoted golden, so a projection always says whether the maths behind it was
measured.

## Run the verification suite

```powershell
npm test
```

There are no package dependencies. If Node is installed but the `npm`
launcher is unavailable, the exact package test entry can also be run with:

```powershell
node --test
```

## Goal status

| Goal | Foundation supplied here | Still required |
| --- | --- | --- |
| Player plus ally vs. AI team | Team model, AI, targeting | SS2 roster/UI/animation adapter |
| 2v2 and 3v3 campaign co-op | Generic 1–3 roster engine and controller model | SS2 adapter, arena layout, campaign saves/rewards |
| Local hot-seat | Named controllers and turn validation | Input/UI binding in SS2 |
| Online co-op | Deterministic action/replay/state-hash protocol | Matchmaking, transport, auth, reconnects |

See [the adapter contract](docs/ss2-adapter-contract.md) for the guarded
licensed-build integration boundary.
The staged path to 2v2 and 3v3 cooperative campaign play is in
[the project roadmap](docs/roadmap.md).

## Licensed-build integration checkpoint

The first read-only map is in
[the SS2 battle map](docs/integration/ss2-battle-map.md), with the exact local
build recorded in
[the asset-free fingerprint](docs/integration/ss2-build-fingerprint.json).
It maps the battle entry, hero/villain state split, RNG, hit/damage/spell path,
result transition, UI clips, and Collection mod-loading route. Reconstructed
formulas remain evidence for golden tests, not replacements for the prototype
rules yet.

The asset-free [1v1 golden harness](docs/integration/ss2-golden-harness.md)
executes those static candidates with strict, named RNG samples. Candidate
fixtures are deliberately separate from runtime-observed goldens and from the
shared team resolver. There are two candidate families: the physical attack
ingress (`src/golden/ss2-attack-candidate.js`) and the spell ingress
(`src/golden/ss2-spell-candidate.js`).

**Runtime-verified so far:** the whole `prisoner-normal-kill` family — all
four normal-band attack directions — is promoted, each golden backed by two
matching observations from two independent unattended sessions. Everything
else is still a candidate.

The [controlled runtime-capture workflow](docs/integration/ss2-runtime-capture.md)
turns instrumented licensed-build sessions into digested observation records
and promotes a candidate only after at least two matching observations from
independent sessions:

```powershell
node tools/capture-session.mjs verify-install
node tools/capture-session.mjs simulate --fixture <candidate.json>
node tools/capture-session.mjs ingest --trace <raw.jsonl> --fixture <candidate.json> --out <observation.json>
node tools/capture-session.mjs verify --fixture <candidate.json> --observation <observation.json>
node tools/capture-session.mjs promote --fixture <candidate.json> --manifest <manifest.json> --observation <obs1.json> --observation <obs2.json>
```

`simulate` writes a reference trace (`synthetic-simulator` method) for
pipeline dry runs and wrapper validation; promotion always rejects simulated
evidence.

Capture sessions are fully unattended — no cursor, no window focus, no
clicking — because the wrapper navigates and fights with the game's own calls:

```powershell
powershell -File tools\runtime-capture\run-capture.ps1 -FixturePath <candidate.json> -SessionId <id> -ObservationId <id>
powershell -File tools\runtime-capture\run-campaign.ps1 -Family prisoner-normal-kill -Rounds 8 -StopWhenComplete
```

`run-campaign.ps1` repeats sessions until every attack direction in a
candidate family has a golden, filing each run against whichever candidate it
actually matches. See [`tools/runtime-capture/`](tools/runtime-capture) for
the loop and its constraints.

Raw traces stay in ignored `captures/`; divergent observations are preserved
under `test/fixtures/ss2-1v1-divergences/` and drive candidate corrections.
The capture vehicle (portable Ruffle 0.5.0 plus an FFDec-compiled AS2
wrapper) is installed and validated end to end by
`tools/runtime-capture/validate-vehicle.ps1`, which must pass after every
wrapper edit.

The project includes a read-only AVM1 metadata inspector:

```powershell
node tools/inspect-swf.mjs <path-to-licensed-ss2-swf>
node tools/inspect-swf.mjs <path-to-licensed-ss2-swf> --function '^attack_chances$'
```

Portable FFDec can be installed under ignored `.tools/` with
`tools/install-ffdec.ps1` and launched with `tools/ffdec.ps1`. Do not export,
copy, commit, or redistribute original game scripts or assets. Use
`local-mod-work/` only for independently authored local experiments.
