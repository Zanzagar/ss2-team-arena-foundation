/**
 * Campaign persistence: the separate, additive team-battle record.
 *
 * Roadmap Stage 5's constraint, in full: "Campaign saves add a separate
 * team-battle record and migration version; they do not overwrite vanilla save
 * fields while the adapter is experimental." This directory is that record,
 * that migration version, and the mechanism that makes the second clause
 * structural instead of aspirational.
 *
 * Module layout, one responsibility each:
 *
 * | module               | owns                                                          |
 * | -------------------- | ------------------------------------------------------------- |
 * | `errors.js`          | the error hierarchy, and which failures degrade vs. refuse     |
 * | `vanilla-boundary.js`| the namespace, key minting, and the vanilla field-name screen  |
 * | `record.js`          | the record schema, canonical JSON, digests, strict validation  |
 * | `migrations.js`      | the schema version, the migration chain, future-version refusal |
 * | `from-battle.js`     | settled battle -> record (a projection, never a computation)   |
 * | `store.js`           | the injectable storage seam and the corruption-recovery policy |
 * | `recorder.js`        | the once-only settlement wiring                                |
 *
 * This layer records outcomes. It contains no formula, no threshold, and no
 * combat decision; every number it stores was decided and clamped by the
 * resolver running an injected rule set. It also contains no read or write
 * path for the vanilla SS2 save — see `docs/campaign-persistence.md`.
 *
 * Node builtins only; no assets, no game data, no third-party dependencies.
 */

export * from "./errors.js";
export * from "./vanilla-boundary.js";
export * from "./record.js";
export * from "./migrations.js";
export * from "./from-battle.js";
export * from "./store.js";
export * from "./recorder.js";
