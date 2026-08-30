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
