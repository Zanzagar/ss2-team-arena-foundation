/**
 * The SS2 adapter: the seam between the shared team resolver and the vanilla
 * presentation surface.
 *
 * The adapter converts state, dispatches presentation, and produces
 * acknowledgements. **It does not decide combat.** There is no formula, no
 * roll, no threshold and no damage arithmetic anywhere under `src/adapter/`;
 * every combat value it moves was decided and clamped by the resolver running
 * an injected rule set. See `docs/ss2-adapter-contract.md` for the full
 * boundary and for what is verified versus assumed.
 *
 * Module layout, one responsibility each:
 *
 * | module              | owns                                                        |
 * | ------------------- | ----------------------------------------------------------- |
 * | `vanilla-fields.js` | the vanilla field catalogue, citations, and map silences     |
 * | `state-bridge.js`   | vanilla state <-> canonical state, and effects -> field writes |
 * | `slot-layout.js`    | sides, slots, clips, depths, panel bindings, the four globals |
 * | `clip-registry.js`  | `clipByCombatantId`, structurally outside deterministic state |
 * | `presentation.js`   | resolved events -> ordered presentation commands             |
 * | `acknowledgement.js`| the animation surface -> once-only campaign settlement        |
 * | `battle-host.js`    | the reference host loop that drives both seams together      |
 *
 * Node builtins only; no assets, no game data, no third-party dependencies.
 */

export * from "./vanilla-fields.js";
export * from "./state-bridge.js";
export * from "./slot-layout.js";
export * from "./clip-registry.js";
export * from "./presentation.js";
export * from "./acknowledgement.js";
export * from "./battle-host.js";
