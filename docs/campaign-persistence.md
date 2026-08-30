# Campaign persistence

The persistence half of roadmap Stage 5. The constraint, verbatim:

> Campaign saves add a separate team-battle record and migration version; they
> do not overwrite vanilla save fields while the adapter is experimental.

`src/campaign/` is that separate record, that migration version, and the
mechanism that makes the second clause structural rather than aspirational.

This layer **records outcomes**. It contains no formula, no threshold, and no
combat decision; every number it stores was decided and clamped by the resolver
running an injected rule set. Nothing in it is runtime-verified, and nothing in
it may be presented as SS2 behaviour: the only runtime-verified material in this
repository is the promoted goldens under `test/fixtures/ss2-1v1-golden/`, and
the default rule set is an explicit placeholder.

## Why the vanilla save is untouchable

`docs/integration/ss2-arena-route.md` §8 records the hazard in bytes. Root frame
150 calls `save_character(_global.current_character)` on **every** entry to the
town square; `save_character` re-skins and re-derives the hero, splits `heroDNA`
into `characterDNA`, writes `so_local["character" + char_no]`, then calls
`SharedObject.getLocal("ss2_data")` and **`.flush()`**. Every leveled-gladiator
route passes through the town square, both on the way in and after each win, so
a session is not save-neutral: gold, experience, level, equipment and the battle
counters are persisted at least twice per fight loop. The capture protocol's
install-hash attestation covers the SWF, not the SharedObject, so nothing about
that surfaces as a verification failure.

The consequence for this layer is simple. The vanilla save is live, mutable
state that the project does not own, cannot fully predict, and may find changed
between sessions. Anything written into it would be a race. So the campaign
layer is **strictly additive**: it records alongside, never inside, and it
degrades to "no campaign data" rather than reaching into vanilla to repair
itself.

## The data boundary

`describeVanillaBoundary()` in `src/campaign/vanilla-boundary.js` is the
machine-readable version of this table, and a test asserts the two agree.

| Owner | Surface | Citation | This layer |
| --- | --- | --- | --- |
| SS2 | `SharedObject.getLocal("ss2_data")`, `so_local["character" + n]` | arena-route §8 | never read, never written |
| SS2 | `_root.game.hero` / `_root.game.villain` | battle-map, "Combatant state objects" | never read, never written (that is `src/adapter/`'s job) |
| SS2 | `_root.arena.gladiators.hero` / `.villain` | battle-map, "Battle entry and timeline ownership" | never read, never written |
| ours | `ss2TeamArena:battle:<recordId>` | — | one immutable settled-battle record, canonical JSON text |
| ours | `ss2TeamArena:quarantine:<recordId>:<n>` | — | the raw text of a record that failed its integrity check |

### How the boundary is enforced, in three layers

1. **No API here accepts a vanilla object.** There is no read path, no write
   path, and no field mapping for `_root.game.hero`, `so_local`, or `ss2_data`
   anywhere under `src/campaign/`. The illegal write has no function to call.
   The only thing this layer imports from `src/adapter/` is
   `vanilla-fields.js` — the read-only *catalogue* of names — and a test
   asserts that is the only adapter import in the directory, so the vanilla
   state bridge can never be pulled in by a later edit without the test
   noticing.
2. **Every key is minted in one place.** `campaignKey()` is the only key
   constructor; every key it returns begins `ss2TeamArena:`, its segments are
   token-checked so a caller cannot forge a separator, and the store re-checks
   the prefix at a single three-line choke point (`assertCampaignKey`) through
   which every read, write and delete passes. Vanilla's own save keys contain
   no colon, so a minted key cannot collide with one even by accident.
3. **Every payload is screened by name.** `assertNoVanillaFieldNames()` walks
   the whole record and refuses it if any object key anywhere is a name the
   vanilla surface uses. The catalogue comes from
   `src/adapter/vanilla-fields.js` (the battle map's per-combatant groups, the
   unnamed timed `spell_*` fields, the clip-resident facing) plus the
   route map's save-container and progression names
   (`goldpieces`, `battlesfought`, `battleswon`, `battleslost`, `score`,
   `character_xp`, `experiencelast`, `heroDNA`, `characterDNA`,
   `max_gladiators`, `char_to_load`, `current_character`, `so_local`,
   `ss2_data`, and `characterN`). Because the catalogue is imported rather
   than copied, the screen grows as the map is extended.

For the storage host, `createNamespacedBackend(container)` is the coexistence
mechanism, and its safety is structural rather than checked: the constructor
resolves `container[CAMPAIGN_NAMESPACE]` **once** and the returned backend
closes over that bucket alone. It keeps no reference to the container, so after
construction there is no expression in the backend that could reach a sibling
key. A vanilla field living next to the bucket is not merely left alone; it is
unreachable.

### The screen's most useful refusal

A campaign record cannot carry a combatant's stat block, because `strength`,
`attack`, `vitality`, `stamina` and `magicka` are vanilla field names and the
screen refuses them. That is the right answer, not a limitation to work around.
A battle record is an outcome record, not a character sheet; the character sheet
belongs to vanilla, and duplicating it here is precisely the coupling the
boundary exists to prevent.

## The record

`ss2-team-battle-record`, schema version 2. Exact-key validation, an explicit
schema version, a canonical-JSON SHA-256 digest, and refusal rather than
coercion — the same house style as `src/golden/observation.js` and
`src/golden/promote-1v1-golden.js`. The canonical JSON form is byte-identical to
the golden pipeline's, and a test pins that.

| Block | Contents | Why |
| --- | --- | --- |
| `settlement` | `winnerTeamId`, sorted `loserTeamIds`, `reason`, `completionToken`, `acknowledgedToken` | the record exists because settlement fired. The completion token is a pure function of the outcome, so it is recomputed during validation: a record whose result was edited no longer agrees with its own token. `acknowledgedToken` must equal it, which is the record's evidence that gate 2 passed and not merely gate 1. |
| `teams[]` | `teamId`, `name`, and `slots[]` of `{seatId, slotIndex, combatantId, aiFilled}` | the roster, including **which slots were AI-filled**. |
| `seats[]` | `{seatId, controllerKind, controllerId, controllerLabel}` | controller identity, in its own block, exactly as `toControllerState()` keeps it out of `toTeamWireState()`. |
| `outcomes[]` | `combatantId`, `name`, `teamId`, `seatId`, `slotIndex`, `aiFilled`, `survived`, `health`, `maxHealth`, `statuses`, `defeatedAtSequence` | the per-combatant result, with the resolver's stamped event sequence at which each fallen combatant was defeated. |
| `provenance.ruleSet` | `id`, `contractVersion`, `verification`, `runtimeVerified`, `goldenFixtureIds`, `buildSha256`, `note` | **which maths produced this battle.** |
| `provenance.battle` | `stateVersion`, `seed`, `rngCursor`, `turnNumber`, `initiative`, `combatStateHash` | enough to tie the record to a replay. The hash is the controller-independent one, so a host and a client that disagree about who drove a seat still record the same value. |
| `provenance.writer` | `id`, `version` | which build of this layer wrote it. |
| `provenance.migration` | `null`, or `{sourceSchemaVersion, sourceDigest, migratedAt, steps}` | see below. |
| `recordId`, `battleId`, `recordedAt`, `digest` | envelope | `recordId` is `tbr-` plus 96 bits of SHA-256 over `{battleId, completionToken}`. |

### AI fill is not the same question as an AI controller

`slots[].aiFilled` is a *roster* fact: the slot had nobody in it, so
`buildRoster` filled it. `seats[].controllerKind` is who is driving that seat
right now. An AI-filled slot is always AI-driven, but the converse does not
hold: an occupied slot can be handed to the AI, and a seat can be reassigned
mid-battle without touching combat state. Recording both, in separate blocks, is
the whole point. The validator refuses a seat entry that carries `combatantId`,
`teamId`, `slotIndex` or `aiFilled`, by name and with an explanatory message,
because conflating the two identities is the specific mistake the roadmap warns
about.

**Known limitation.** `seats[]` is the assignment *at settlement*. The resolver
does not journal controller reassignments, so neither does this layer; a seat
handed from a remote peer to the AI mid-battle records only where it ended up.

### The provenance gate

`provenance.ruleSet` is mandatory, and its claim is gated exactly as
`src/team/rule-set.js` gates the live one:

- `runtimeVerified` must agree with `verification`; a record cannot claim more
  than its rule set could.
- `placeholder` must not pin a build hash and must not cite goldens.
- `runtime-verified` must pin a 64-hex build SHA-256 **and** cite at least one
  promoted golden fixture id.
- `unknown` is legal only on a migrated record (see below).

Today every record this layer can produce says `placeholder`, because
`classicStyleRules` is an explicit placeholder and no verified rule set exists.
`describeCampaignRecord()` surfaces `verification` and `runtimeVerified` first
for exactly that reason: a campaign built on placeholder maths has to stay
identifiable later, and must never be presented as measured behaviour.

## Versioning and migration

| Version | Shape |
| --- | --- |
| 1 | the current record without `provenance.ruleSet` |
| 2 | current |

Version 1 was never written by a released version of this project — the
persistence layer landed at version 2. It is defined and supported anyway,
because a migration path that has never been exercised is not a migration path,
and because the 1 → 2 step is the cheapest place to pin the rule every later
migration will have to follow:

> **A migration may not invent evidence.** Schema 1 did not record which rule
> set produced a battle, so the migrated record says `unknown`. It does not
> guess `placeholder`, even though every rule set in the repository today is
> one, because a guess in a provenance field is worse than a gap.

`unknown` therefore means *the evidence is gone*, not *it was a placeholder*.
`runtimeVerified` is false, there is no id, no build hash and no golden to point
at, and the note says so in words.

Three further rules:

- **Integrity before migration.** A legacy record's digest is verified before a
  single field is touched. A schema-1 record with a broken digest is refused,
  not migrated.
- **The pre-migration digest is preserved.** Migration necessarily changes the
  contents and so forces a re-digest, so the old digest is carried into
  `provenance.migration.sourceDigest`. The chain of custody survives.
- **Future versions are refused, not coerced.** A record declaring a schema
  newer than this build throws `CampaignSchemaVersionError`, which carries both
  versions. It is not truncated to the fields we recognise, not partially read,
  and — the part that matters — **not rewritten, not quarantined, and not
  deleted**. A newer record is not damaged; it is simply not ours. The store
  also refuses to write over one.

## Storage

The I/O seam is four synchronous, string-valued methods:

```js
{ read(key) -> string|null, write(key, text) -> void, remove(key) -> void, keys() -> string[] }
```

Synchronous and string-valued because the AVM1 SharedObject surface is both, and
because the write is driven from the campaign-settlement callback: an async
store would make settlement async, which the once-only latch in
`src/team/settlement.js` is not built for. A host that needs async buffers
behind this interface. Two backends ship: `createMemoryBackend()` (the tests run
entirely on it, so no filesystem is needed) and `createNamespacedBackend()`
described above.

### Why a record can only ever damage itself

Records are **immutable and content-addressed**. The key is derived from the
record id, which is derived from the battle id and the settlement completion
token. So:

- there is no read-modify-write anywhere in the layer;
- there is deliberately **no index file**, because an index is the one structure
  an interrupted write could corrupt for every record at once —
  `recordIds()` enumerates the backend instead;
- an interrupted write can therefore only leave one torn key, belonging to one
  record, and can never touch a record that was already good.

Writes are read back and compared immediately. That proves the backend accepted
the value; it cannot prove the host flushed it to disk, which is exactly why the
digest exists.

### Recovery

| On read | Result |
| --- | --- |
| key absent | `missing` — no campaign data for that battle |
| value is not a string, or does not parse | `corrupt` |
| schema newer than this build | `unsupported`, left untouched |
| digest mismatch, or the record fails validation | `corrupt` |
| record id disagrees with its key | `corrupt` |
| otherwise | `ok`, with a deep-frozen record |

`readRecord()` and `readAll()` never throw for a damaged, absent, or
future-schema record — they throw only for programmer error (a key outside the
namespace, a broken backend). `readAll()` returns the good records alongside the
corrupt ones: one torn record must not cost a campaign its whole history.

Corrupt entries are **quarantined**: copied to
`ss2TeamArena:quarantine:<recordId>:<n>` and then removed from the live key, so
the evidence is preserved rather than discarded — the same instinct as the
divergence reports in `src/golden/promote-1v1-golden.js`. The copy happens
first; if it fails, the original is left exactly where it was and the read still
degrades. A failed quarantine never deletes and never turns a bad read into a
thrown error. Quarantining can be switched off per store or per read.

Writing a good record over a corrupt copy of the same record is a **repair**:
the corrupt bytes are quarantined and the write proceeds.

Nothing in any recovery path consults, reads, or repairs anything vanilla.

## Once-only

Two independent guarantees, deliberately overlapping:

1. `src/team/settlement.js` fires its callback exactly once, behind two gates —
   a whole team eliminated *and* a matching
   `battle-result-animation-complete`. `buildCampaignRecord()` reads
   `campaignSettlement(battle)`, which is populated by that private latch and by
   nothing else, so there is no route to a record through gate 1 alone. A
   knockout produces no record.
2. The record id is a pure function of the battle id and the completion token,
   so a second write of the same settlement finds a verifying record already
   stored and writes nothing (`status: "duplicate"`). Replaying the battle, or
   recording it again after a restart, cannot produce a second record.

### Wiring

```js
const store = createCampaignStore({ backend: createNamespacedBackend(saveContainer) });
const recorder = createCampaignRecorder({ store, battleId: "camp-1" });
const battle = createTeamBattle({ teams, rules, onCampaignSettled: recorder.hook });
recorder.attach(battle);
// … play …
recorder.lastResult; // { status: "written" | "duplicate" | "repaired", … }
recorder.errors;     // storage failures, collected rather than thrown
```

`attach` is a second step because `onCampaignSettled` has to be supplied in the
blueprint, before `createTeamBattle` has returned anything to attach to.

The hook does not throw. By the time it runs the battle is over and the campaign
has already been told; a storage failure at that point is a save problem, not a
battle problem, and letting it propagate would turn "the disk is full" into "the
arena crashed". Failures are collected on `recorder.errors`, or rethrown if the
recorder was built with `throwOnFailure: true`.

## What this layer does not do

- **No rewards.** The roadmap's Stage 5 line covers "campaign roster/save/reward
  integration"; only the save half is built here. Computing a reward is a
  formula, and formulas belong in a rule set. The record carries what a reward
  calculation would need to read — the result, the survivors, the AI-filled
  slots, and the provenance of the maths — and stops there.
- **No roster write-back.** Nothing here advances a gladiator, and nothing here
  reads one. A campaign that wants to apply consequences does so through
  vanilla's own surface, or through a future adapter path, with full knowledge
  that the town square will flush over it.
- **No action journal.** The record stores the outcome, the seed, the RNG
  cursor and the combat state hash, not the ordered action stream a replay would
  need. That is a bigger artefact with a different lifetime, and adding it later
  is a schema-3 migration.
- **No deletion.** The store has no public `remove`. Pruning a campaign history
  is a host decision, and this layer should not be the thing that makes it easy.

## Tests

`test/campaign-persistence.test.js`, 48 tests, filesystem-free. They cover the
schema and its round trip, the AI-fill/AI-controller distinction, the
seat/combatant split, the provenance gate in both directions, exact-key
validation, digest tamper detection, both migration directions (a schema-1
record migrating, and a future-schema record refused with both versions named),
the once-only settlement producing exactly one record, every corruption and
recovery path, and — the boundary test the constraint asks for — that no vanilla
field name from the whole catalogue is ever written by this layer, that a record
reaching for one is refused, and that a save container full of vanilla fields is
byte-identical after a full write/read/quarantine cycle.
