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
Set-Location C:\Users\cjh5690.PSU\Documents\Codex\2026-08-29\would-it-be-possible-if-at\outputs\ss2-team-arena-foundation
npm test
```

## Goal status

| Goal | Foundation supplied here | Still required |
| --- | --- | --- |
| Player plus ally vs. AI team | Team model, AI, targeting | SS2 roster/UI/animation adapter |
| 2v2 and 3v3 teams | Generic 1–3 roster engine | Balance, arena layout, campaign mode |
| Local hot-seat | Named controllers and turn validation | Input/UI binding in SS2 |
| Online 2v2 | Deterministic action/replay/state-hash protocol | Matchmaking, transport, auth, reconnects |

See [the adapter contract](docs/ss2-adapter-contract.md) for the safe next
reverse-engineering step once a licensed SS2 installation is available.
