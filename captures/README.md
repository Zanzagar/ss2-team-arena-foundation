# Raw capture traces (ignored)

Raw JSONL instrumentation traces from controlled licensed-build sessions live
here and stay out of Git; only normalized observation records under
`test/observations/ss2-1v1/` are committed. Layout:

```text
captures/<session-id>/<observation-id>.jsonl
```

See `docs/integration/ss2-runtime-capture.md` for the session protocol and the
trace grammar. Never place original game files, extracted scripts, or
screenshots here — traces contain only independently authored numeric state,
rolls, mutations, and events.

## `ARCHIVE-MANIFEST.sha256` — the one file here that IS committed

The archive is the primary measured evidence this whole corpus is ingested
from, it is gitignored by design, and on 2026-09-01 it was measured to have
**one reachable copy**. This manifest is what makes any other copy checkable.

Regenerate or verify it from the archive root (on this machine,
`C:\ss2-capture\captures`, reachable from WSL at `/mnt/c/ss2-capture/captures`):

```bash
# verify a copy — silent means every file matches. Paths in the manifest are
# relative to the archive root, so cd there and point at the committed copy.
cd /mnt/c/ss2-capture/captures
sha256sum -c --quiet <repo>/captures/ARCHIVE-MANIFEST.sha256

# regenerate after a capture session adds traces
find . -type f -printf "%P\n" | LC_ALL=C sort | tr '\n' '\0' | xargs -0 sha256sum \
  > <repo>/captures/ARCHIVE-MANIFEST.sha256
```

Recorded 2026-09-01: **1,603 files, 20,008,972 bytes.** Regenerate it whenever a
session adds traces, or the manifest silently describes a smaller archive than
the one on disk — the same staleness this project has been bitten by elsewhere.

**Read what it does and does not prove.** It is an integrity check on bytes as
they were on 2026-09-01: it detects corruption, truncation, and partial or
failed copies, and it makes a restored backup verifiable rather than merely
present. **It is NOT a provenance claim.** It says nothing about when a trace
was captured, whether two traces came from independent sessions, or whether a
trace is genuine — a copy hashes exactly like its original, which is the whole
difficulty this corpus already has elsewhere. Do not cite it as evidence of
capture independence.

## Two standing defects in the archive, recorded rather than quietly fixed

- **15 PNG screenshots sit under `auto-shots/`**, which the paragraph above
  forbids in plain words. They are UI-navigation aids from `ui-automation.ps1`,
  not evidence — no trace or record depends on them. They are gitignored, so
  they have never reached the repository. Deciding whether to delete them or
  move them to a designated scratch location is the owner's call; they are
  listed in the manifest so that either way the record is honest.
- **More than half the archive is regenerable**, which matters when sizing a
  backup: the 175 `DoAction.as` files are decompiled copies of this project's
  OWN wrapper, the `.swf` files are its compiled builds, and the `.jsonl` files
  are delogged from the `.rufflelog` files by
  `node tools/capture-session.mjs delog`. The irreplaceable set is the
  `.rufflelog` files plus the launcher logs, `.json` and `.sha256` — 8.7 MB raw,
  about 2.4 MB compressed, against 20 MB for the whole archive.
