# Swords & Sandals II — Team Arena foundation

An asset-free technical foundation for a future 2v2 / 3v3 SS2 mod. It does not
contain or alter *Swords & Sandals II* itself.

## Current capability

- Two teams of one to three gladiators (including 2v2 and 3v3).
- Arbitrary target selection, damage spells, allied healing, rest actions, and
  elimination victory rules.
- Human, hot-seat, AI, and named remote-client controllers use one turn API.
- Seeded random state, action logs, replay, JSON-safe snapshots, and state
  hashes for host-authoritative multiplayer.

The combat formulas are explicitly temporary approximations. The engine keeps
them isolated so a licensed SS2 adapter can substitute verified formulas.

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
shared 1–3 combatant engine.

The project includes a read-only AVM1 metadata inspector:

```powershell
node tools/inspect-swf.mjs <path-to-licensed-ss2-swf>
node tools/inspect-swf.mjs <path-to-licensed-ss2-swf> --function '^attack_chances$'
```

Portable FFDec can be installed under ignored `.tools/` with
`tools/install-ffdec.ps1` and launched with `tools/ffdec.ps1`. Do not export,
copy, commit, or redistribute original game scripts or assets. Use
`local-mod-work/` only for independently authored local experiments.
