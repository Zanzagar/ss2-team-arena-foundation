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
| ours | `ss2TeamArena:quarantine:<recordId>:<n>` | — | a record that failed its integrity check, preserved as evidence |

Both paths in `describeVanillaBoundary()` are *built* by calling `campaignKey()`
and substituting placeholders for its segments, rather than written out beside
it. They had already drifted once — the quarantine path was documented with a
dot where the minter produces a colon — and the test whose job was preventing
that checked only the prefix. It now fills the documented template and compares
it to a key the store really minted.

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
3. **Every payload is screened by name, on the way in.**
   `assertNoVanillaFieldNames()` walks the whole record and refuses it if any
   object key anywhere is a name the vanilla surface uses. The catalogue comes
   from `src/adapter/vanilla-fields.js` (the battle map's per-combatant groups,
   the unnamed timed `spell_*` fields, the clip-resident facing) plus the
   route map's save-container and progression names
   (`goldpieces`, `battlesfought`, `battleswon`, `battleslost`, `score`,
   `character_xp`, `experiencelast`, `heroDNA`, `characterDNA`,
   `max_gladiators`, `char_to_load`, `current_character`, `so_local`,
   `ss2_data`, and `characterN`). Because the catalogue is imported rather
   than copied, the screen grows as the map is extended.

### The screen runs on the write path only, and that is load-bearing

`sealCampaignRecord()` screens every record this layer mints and `store.write()`
screens again at the write. `validateCampaignRecord()` does **not**, and neither
does the re-seal inside a migration.

That is not an oversight; it is the fix for a defect an audit demonstrated end
to end. The screen used to run inside `validateCampaignRecord`, which runs on
every **read**, against a live import of a catalogue this layer does not own —
a catalogue the paragraph above explicitly invites people to grow. `store.js`
funnels every read error that is not a schema-version refusal into
quarantine-then-delete. So adding one additive line to
`src/adapter/vanilla-fields.js` — the name `name`, say, which is an object key
in both `teams[]` and `outcomes[]` of every record ever written — turned every
stored record corrupt, quarantined it, removed the live key, and reported the
campaign as empty. There is no restore API. It also contradicted `errors.js`,
which says `VanillaBoundaryError` is "never recoverable and never degraded".

Stored data must not be perishable against a moving catalogue. The screen
guards the direction the boundary exists to guard — records going *out* of this
layer — and the schema, which is exact-key at every level, is what guards
records coming back in.

### The storage host: give this layer a container of its own

`createNamespacedBackend(container)` is the coexistence mechanism, and it makes
two separate guarantees.

Within the container, safety is structural rather than checked: the constructor
resolves `container[CAMPAIGN_NAMESPACE]` **once** and the returned backend
closes over that bucket alone. It keeps no reference to the container, so after
construction there is no expression in the backend that could reach a sibling
key. A field living next to the bucket is not merely left alone; it is
unreachable.

The choice of container is now structural too. **A container carrying vanilla
field names as its own keys is refused**, with `VanillaBoundaryError`, unless
the caller passes `{ allowVanillaSiblings: true }`. "Records alongside, never
inside" used to be advice — this JSDoc named `so_local.data` as its example
host — and advice does not survive a caller in a hurry. Growing a campaign
history inside `ss2_data` means sharing the vanilla store's flush and its quota,
and `refresh_gladiators` flushes that store unconditionally and has a reset
branch that blanks every character slot when the gladiator count reads back
`undefined`/`0`/`NaN`. The intended host is a `SharedObject` this project owns.

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

`defeatedAtSequence` is checked in **both** directions: a survivor must not carry
one, and a casualty must. Only the first was checked, and the unchecked direction
is the one that loses evidence — a dropped `combatant-defeated` event recorded as
`null` and validated, so the record could not tell "defeated at sequence 6" from
"we lost the event". One battle is refused as a consequence: a combatant that
entered already at zero health was never defeated *by this battle*, so there is
no sequence to record and `buildCampaignRecord()` says so by name rather than
writing a null.
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

The I/O seam is four required synchronous, string-valued methods and one
optional fifth:

```js
{ read(key) -> string|null, write(key, text) -> void, remove(key) -> void, keys() -> string[],
  flush?() -> boolean }
```

Synchronous and string-valued because the AVM1 SharedObject surface is both, and
because the write is driven from the campaign-settlement callback: an async
store would make settlement async, which the once-only latch in
`src/team/settlement.js` is not built for. A host that needs async buffers
behind this interface. Two backends ship: `createMemoryBackend()` (the tests run
entirely on it, so no filesystem is needed) and `createNamespacedBackend()`
described above.

### Committing, and admitting when a commit was refused

`flush()` is **optional rather than required**, deliberately. Requiring it would
break every backend that has no such concept — a `Map`, a plain object, an
in-process buffer — and push each of them into stubbing a method whose `true`
would be a lie. What the seam actually lacked was not a mandatory method but an
*answer*: an AVM1 `SharedObject.flush()` returns `false` or `"pending"` rather
than throwing when the 100 KB local-storage quota is exceeded, and the layer had
no way to ask and no way to hear. `store.write()` reported `status: "written"`
regardless.

So: declare `flush()` and the store calls it after each write, treats anything
other than `true` (a thrown error included) as a refusal, **rolls its own key
back**, and throws `CampaignStorageError`. Omit it and nothing changes; the
write result then reports `flushed: null`, which says the question could not be
asked rather than guessing the answer.

### The byte budget

`createCampaignStore({ byteBudget })` caps how many bytes this layer occupies —
keys included, default **64 KB** — and refuses the write that would cross it,
before writing anything. Pass `null` to disable it deliberately.

The numbers behind the default: one 2v2 record is about 2.4 KB of canonical
JSON, the eventual host is a Flash local store whose default quota is 100 KB per
origin, and `ss2_data` already lives in that quota (679 bytes, per `HANDOFF.md`).
Roughly forty records exhaust it. A campaign history is unbounded by nature —
one record per settled battle, forever — and there is deliberately no `remove()`
on the public surface, so nothing prunes it. Silently filling a shared quota is
how a flush starts failing, and `refresh_gladiators`' reset branch is what
failing flushes lead to. A refused write the host can see and report is a much
better failure than a full disk nobody notices.

Pruning remains a host decision. What this layer owes the host is a bounded
footprint and a loud refusal, not a delete button.

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
the value. Whether the *host* committed it is a separate question: `flush()`
asks it when the backend can answer, and the digest catches a torn commit on the
next read when it cannot.

### Recovery

| On read | Result |
| --- | --- |
| the key is not present in the backend | `missing` — no campaign data for that battle |
| the key is present but holds `null` | `corrupt` — a torn write, not an absence |
| value is not a string, or does not parse | `corrupt` |
| schema newer than this build | `unsupported`, left untouched |
| digest mismatch, or the record fails validation | `corrupt` |
| record id disagrees with its key | `corrupt` |
| otherwise | `ok`, with a deep-frozen record |

The first two rows used to be one. The seam's `read()` answers `string|null`, so
a stored `null` and an absent key are indistinguishable through `read()` alone —
and they are not the same answer. Absent means "no campaign data"; a stored
`null` is a torn write, it is not a string, and the row below says a value that
is not a string is corrupt. Reporting it as `missing` put it in the same
category as an empty store and let the next write clobber it. `keys()` is the
only way to tell the two apart, so the store consults it — but only on the path
where `read()` came back null, so an ordinary hit still costs one `read()`.
`store.has()` answers the same presence question, so a torn entry reads as
taken.

`readRecord()` and `readAll()` never throw for a damaged, absent, or
future-schema record — they throw only for programmer error (a key outside the
namespace, a broken backend). `readAll()` returns the good records alongside the
corrupt ones: one torn record must not cost a campaign its whole history. That
claim depended on `parseCampaignKey()` and `campaignKey()` agreeing on what a
key segment is, and they did not: parse accepted segments the minter would have
refused, so a single malformed key in the namespace made `readAll()` throw and
cost the campaign every good record. Parse now applies the minter's own token
pattern, and a string this layer could not have minted is simply not ours.

Corrupt entries are **quarantined**: copied to
`ss2TeamArena:quarantine:<recordId>:<n>` and then removed from the live key, so
the evidence is preserved rather than discarded — the same instinct as the
divergence reports in `src/golden/promote-1v1-golden.js`.

What is preserved:

- a **text** value is preserved verbatim, byte for byte;
- a **non-text** value is preserved as a JSON envelope
  `{ nonString: true, type, value, text }`, carrying the value's contents
  wherever JSON can hold them and a `String()` rendering as a labelled fallback
  when it cannot (a circular object, say).

The second bullet used to read `JSON.stringify({ nonString: String(rawValue) })`,
which preserved every object as the literal `[object Object]` and then deleted
the original — the quarantine destroyed exactly the evidence it exists to
preserve. The test that covered it asserted only that a quarantine key was
returned, never what it held.

The copy happens first; if it fails, the original is left exactly where it was
and the read still degrades. If the *delete* after a successful copy fails, the
copy is rolled back, so a failed quarantine really does leave the store as it
found it. And an identical copy already in quarantine is reused rather than
added to: on a medium that accepts writes but refuses removes, every read of the
same damaged record used to append another copy of the same bytes, up to a
thousand, after which `store.write()` threw for that battle permanently. A
failed quarantine never deletes and never turns a bad read into a thrown error.
Quarantining can be switched off per store or per read.

Writing a good record over a corrupt copy of the same record is a **repair**:
the corrupt bytes are quarantined and the write proceeds. If the quarantine
fails, the write still proceeds and reports `quarantineFailed` — symmetrically
with the read path, which has always degraded rather than thrown. Preserving
evidence is best-effort; storing a verified record over a copy of itself that no
longer verifies is not.

Nothing in any recovery path consults, reads, or repairs anything vanilla — and
nothing in any recovery path consults the vanilla field-name catalogue either.

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
// modContainer is a container this project owns — e.g. the `data` of a
// SharedObject named for this mod. Not so_local.data: passing the vanilla
// save's own container is refused.
const store = createCampaignStore({ backend: createNamespacedBackend(modContainer) });
const recorder = createCampaignRecorder({ store, battleId: "camp-1" });
const battle = createTeamBattle({ teams, rules, onCampaignSettled: recorder.hook });
recorder.attach(battle);
// … play …
recorder.lastResult; // { status: "written" | "duplicate" | "repaired", flushed, … }
recorder.errors;     // save failures, collected rather than thrown
```

`attach` is a second step because `onCampaignSettled` has to be supplied in the
blueprint, before `createTeamBattle` has returned anything to attach to.

The hook does not throw **for a save failure**. By the time it runs the battle is
over and the campaign has already been told; a storage failure at that point is a
save problem, not a battle problem, and letting it propagate would turn "the disk
is full" into "the arena crashed". Failures are collected on `recorder.errors`,
or rethrown if the recorder was built with `throwOnFailure: true`.

That leniency is scoped to the two failures it is an answer to —
`CampaignStorageError` and `CampaignRecordError` (which `CampaignSchemaVersionError`
extends) — and to nothing else. It used to be a blanket `catch`, which also
swallowed `VanillaBoundaryError`: a boundary violation would have been filed on
`errors` as though it were a full disk, in direct contradiction of `errors.js`,
which says that error "is never recoverable and never degraded" and that the
correct response to one is to fix the caller. It propagates.

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
  What it does owe the host is a bounded footprint, which is the byte budget's
  job, and a refusal it can see rather than a quota it silently exhausts.

## Tests

`test/campaign-persistence.test.js`, 68 tests, filesystem-free. They cover the
schema and its round trip, the AI-fill/AI-controller distinction, the
seat/combatant split, the provenance gate in both directions (with the build
hash pinned by **value**, not by shape — a shape check passes for `"0".repeat(64)`),
exact-key validation, digest tamper detection, the battle-provenance projection
value by value, statuses carried through from a rule set that actually applies
them, both migration directions (a schema-1 record migrating, and a future-schema
record refused with both versions named), the once-only settlement producing
exactly one record, and every corruption and recovery path — including a stored
`null`, a non-text value whose contents must survive quarantine, a malformed key
in our own namespace, and a medium that refuses removes.

The boundary tests the constraint asks for: that no vanilla field name from the
whole catalogue is ever written by this layer; that a record reaching for one is
refused at both authoring gates; that a stored record does **not** perish when
the catalogue grows; and that `createNamespacedBackend()` refuses the vanilla
save outright.

One test in this file was rewritten rather than added to, and the reason is worth
recording. "The namespaced backend leaves every vanilla sibling byte-identical"
deleted our own namespace from its copy of the container and then asserted
equality — it compared the container to itself minus the only thing that
changed. The assertion was true; the claim a reader took from it was not, and it
is why the uncapped growth went unnoticed through review. It now measures the
serialized size of the **whole** container before and after and requires every
byte of the growth to be accounted for.
