# Swords & Sandals II Multiplayer Foundation

An asset-free, independently authored foundation for bringing cooperative
multiplayer to *Swords & Sandals II*. The repository combines three related
tracks without confusing their evidence:

1. measure and reproduce selected vanilla combat behaviour;
2. build one deterministic 1v1 / 2v2 / 3v3 multiplayer architecture; and
3. design an optional Endless progression mode behind a separate rule set.

This repository contains, alters, and redistributes no original game binaries,
extracted scripts, artwork, or other licensed assets. Controlled research tools
may mutate an isolated runtime/save state while leaving installed binaries
read-only. This is not yet a finished playable mod.

## Status at a glance

| Track | Current state |
| --- | --- |
| Shared team resolver | Implemented and tested for one to three combatants per team. 1v1, 2v2, and 3v3 use the same resolver. |
| Vanilla parity | Partial and expanding. Promoted runtime goldens exist, but no complete runtime-verified SS2 rule set has been injected into the resolver. |
| SS2 adapter and campaign layer | Asset-free state bridge, slot layout, presentation commands, acknowledgement bridge, and additive campaign-record schema have landed. Rendering, roster read-back, rewards, and licensed-build integration remain incomplete. |
| Endless progression | Quantitatively diagnosed and specified in a research-backed design; owner decisions and readiness blockers remain open. No Endless rule set or progression implementation exists yet. |
| Online multiplayer | Deterministic foundations exist; lobby, transport, authentication, reconnect, and desync recovery are planned. |

The detailed and frequently changing delivery state lives in the
[project roadmap](docs/roadmap.md) and [current handoff](HANDOFF.md).

## What works today

- Two teams of one to three gladiators resolve through one shared engine in
  [`src/team/`](src/team). `src/engine.js` is a compatibility facade, not a
  second 1v1 implementation.
- Arbitrary targets, direct damage, damage spells, allied healing, rest,
  resources, AI fill, individual knockouts, team elimination, and once-only
  result settlement share the same event path.
- Settlement requires both team elimination and the matching final-animation
  acknowledgement; an individual knockout cannot pay a campaign result.
- Controller identity is separate from combatant and seat identity. Local,
  hot-seat, named remote, and AI controllers can coexist, and controller
  reassignment does not alter combat state.
- Ordered labelled RNG, action logs, replay, JSON-safe wire projections, and
  controller-independent combat hashes provide a host-authoritative foundation.
- [`src/adapter/`](src/adapter) converts between vanilla-shaped and canonical
  state and emits inert presentation commands. Those commands have not proved a
  rendered multi-slot battle in the licensed build.
- [`src/campaign/`](src/campaign) stores a separate, versioned, additive campaign
  record. It has no path that overwrites vanilla save fields; it does not yet
  read a persistent roster back into a playable campaign or award progression.

These are repository capabilities, not proof of complete vanilla parity. The
resolver still runs an explicitly labelled placeholder rule set.

## Two rule paths, one resolver

Combat formulas and action vocabulary are injected through
[`src/team/rule-set.js`](src/team/rule-set.js). That seam keeps two future paths
separate:

- **Classic/parity path:** may reproduce only behaviour supported by the
  fingerprinted build map and promoted runtime evidence. Static reconstruction
  alone cannot claim runtime verification.
- **Endless path:** a future `endless-v0` rule set containing intentional mod
  mechanics. Before it can start, the shared rule-set contract must advance to
  v2 and require `designVersion`. Until a later verification-enum migration,
  `endless-v0` remains `placeholder` with `runtimeVerified: false`; today its
  human-readable provenance note carries designed intent. If v2 retains an
  explicit `designIntent`, it must validate, project, hash, persist, and migrate
  it. Its progression data uses a separately versioned sidecar, and it never
  reinterprets a classic fixture or golden.

Both paths may use the same team resolver, controller model, settlement gate,
and deterministic protocol. They do not share an evidence claim.

## Proposed Endless direction — design only

The current design proposes:

- four-fight **Arena Circuits** with disclosed routes, opponents, Contracts,
  and deterministic reward plans;
- a designed vertical stat and item-chassis cap at career tier 50, followed by
  lateral progression rather than unbounded scalar inflation;
- a four-point **Rule Load** budget shared by behaviour-bearing equipment and
  abilities;
- rarity based on authored rule complexity rather than strictly larger damage
  or armour numbers;
- personal inventories tied to stable combatants, with explicit co-op custody,
  binding, exchange, and crash-safe settlement rules;
- authored doctrine modules, champions, rivals, milestone bosses, and bounded
  anti-stall Arena Pressure; and
- post-100 Epoch Charters that rotate bounded challenge, opponent, and reward
  themes without raising the vertical cap.

Every proposed mechanic states whether it preserves classic combat semantics or
requires the separate designed rule set, the degenerate strategy it invites,
and the required counter/rejection test. Names, rates, caps, unlock levels, and
balance thresholds remain design assumptions until approved and tested.

The first proposed proof is a deterministic 2v2, four-fight Contract loop.
Before code, each of the six product decisions and EP-A01–EP-A03 must be
accepted or superseded by a fully normative, explicitly accepted replacement;
rejection or an open revision remains blocking.
The readiness audit also found three P0 model questions that approval alone
does not close—career/challenge pacing, deterministic retry/seed shopping, and
post-completion maintenance access—plus missing designed-combat budgets and an
incomplete Pressure termination proof, and one incompatible JSON/u64
persistence claim. Rule-contract v2, sidecar/snapshot, or `endless-v0` code
remains blocked until their selected repairs/specifications are normative.
Headless and playable proofs have different final gates; playable work also
needs a real per-action animation acknowledgement signal.

Read the work in this order:

1. [progression diagnosis and transferable principles](docs/design/progression-diagnosis.md);
2. [Swords & Sandals mod-scene survey](docs/design/swords-and-sandals-mod-scene-survey.md);
3. [complete Endless progression-system design](docs/design/endless-progression-system.md);
4. [six owner decisions](docs/design/endless-progression-decisions.md); and
5. [MVP implementation-readiness record](docs/design/endless-mvp-readiness.md).

## Evidence vocabulary

| Label | What it means |
| --- | --- |
| Runtime-observed / promoted golden | The promotion gate requires at least two matching qualifying records with distinct declared session IDs for the fingerprinted build. Runtime origin and process independence additionally depend on the documented operating procedure; the repository cannot prove them by itself. A golden supports that fixture, not the whole game. |
| Byte-mapped | Read from the fingerprinted build's static control flow or data. It is stronger than recollection but is not automatically a runtime observation. |
| Derived | Mathematics or conclusions calculated from mapped or observed inputs. The derivation may be exact even when its domain remains incomplete. |
| Designed / assumed | An intentional mod mechanic or tuning hypothesis. Combat changes to vocabulary, legality, outcomes, RNG, AI, or stacking require the separate designed rule set; campaign routes, rewards, inventory, custody, persistence, and content-only Contracts may live outside combat behind their stated seams. |
| Unverified | A claim, interaction, or curve for which the current repository does not carry adequate evidence. |

The primary technical sources are the
[SS2 battle map](docs/integration/ss2-battle-map.md),
[golden harness](docs/integration/ss2-golden-harness.md), and
[adapter contract](docs/ss2-adapter-contract.md).

## Documentation map

### Multiplayer, parity, and integration

- [project roadmap](docs/roadmap.md)
- [adapter contract](docs/ss2-adapter-contract.md)
- [campaign persistence](docs/campaign-persistence.md)
- [SS2 battle map](docs/integration/ss2-battle-map.md)
- [arena-route integration map](docs/integration/ss2-arena-route.md)
- [golden harness and evidence boundary](docs/integration/ss2-golden-harness.md)
- [runtime-capture methodology](docs/integration/ss2-runtime-capture.md)

### Progression research and design

- [research brief](docs/design/endless-progression-brief.md)
- [quantitative progression diagnosis](docs/design/progression-diagnosis.md)
- [mod-scene findings](docs/design/swords-and-sandals-mod-scene-survey.md)
- [Arena Circuit progression design](docs/design/endless-progression-system.md)
- [Endless owner decision record](docs/design/endless-progression-decisions.md)
- [Endless MVP readiness record](docs/design/endless-mvp-readiness.md)

## Run the verification suite

```powershell
npm test
```

There are no package dependencies. If Node is installed but the `npm` launcher
is unavailable, run the package test entry directly:

```powershell
node --test
```

## Licensed-build and contributor boundary

- Keep licensed binaries, saves, and raw capture traces outside version control.
  Normalized, asset-free observation records are committed evidence.
- Never copy, export, commit, or redistribute original game or third-party mod
  source/assets. Research may describe and cite other mods; it may not vendor
  them.
- Runtime capture is a controlled, save-sensitive workflow. Only one Ruffle
  session may touch a save at a time; a second session can flush stale state and
  silently overwrite the first session's progress.
- Read the [current handoff safety items](HANDOFF.md#open-items) before any
  capture work. Some scripts and runbook premises are explicitly still unsafe
  or stale. Use the dedicated
  [runtime-capture documentation](docs/integration/ss2-runtime-capture.md) and
  [staging runbook](docs/integration/ss2-staging-runbook.md) only together with
  those current warnings; never launch capture tools casually.
- Distributable work is limited to independently authored source, metadata,
  fixtures, documentation, and patches.
