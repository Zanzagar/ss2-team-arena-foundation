/**
 * `clipByCombatantId` — the live handle registry, kept firmly outside
 * deterministic state.
 *
 * The battle map's instruction is explicit: "Team mode should use combatant
 * IDs and keep `clipByCombatantId` outside deterministic state". A clip handle
 * is a live AVM1 movie clip reference. It is not JSON-safe, it differs between
 * a host and a client that agree perfectly on combat state, and it changes
 * every time the arena is rebuilt. If it ever reached `toTeamWireState` it
 * would turn every presentation difference into a false desync.
 *
 * Three structural guarantees, not conventions:
 *
 * 1. handles live in a private field, so no projection can walk into them;
 * 2. `toJSON()` throws, so a registry can never be serialised by accident —
 *    `JSON.stringify` on anything that reaches a registry fails loudly instead
 *    of quietly embedding it;
 * 3. the registry is never attached to a battle. It is passed alongside one.
 *
 * `describe()` is the only way out, and it returns slot identity (which the
 * layout already derives from combat state), never a handle.
 */

export class ClipRegistryError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ClipRegistry {
  #handles = new Map();
  #instanceNames = new Map();

  /**
   * @param {string} combatantId
   * @param {*} handle the live clip reference; opaque to this module
   * @param {string} [instanceName] the clip's instance name, for diagnostics
   */
  register(combatantId, handle, instanceName = null) {
    if (typeof combatantId !== "string" || combatantId.length === 0) {
      throw new ClipRegistryError("A clip registration needs a non-empty combatant id.");
    }
    if (handle === undefined || handle === null) {
      throw new ClipRegistryError(`No clip handle supplied for combatant ${combatantId}.`);
    }
    this.#handles.set(combatantId, handle);
    this.#instanceNames.set(combatantId, instanceName);
    return this;
  }

  /** Registers every placement in a layout against the handles a host supplies. */
  registerLayout(layout, handles) {
    for (const placement of layout.placements) {
      const handle = handles instanceof Map ? handles.get(placement.combatantId) : handles?.[placement.combatantId];
      if (handle === undefined || handle === null) {
        throw new ClipRegistryError(
          `The arena layout places combatant ${placement.combatantId} but no clip handle was supplied for it.`
        );
      }
      this.register(placement.combatantId, handle, placement.instanceName);
    }
    return this;
  }

  has(combatantId) {
    return this.#handles.has(combatantId);
  }

  clipFor(combatantId) {
    if (!this.#handles.has(combatantId)) {
      throw new ClipRegistryError(`No clip is registered for combatant ${String(combatantId)}.`);
    }
    return this.#handles.get(combatantId);
  }

  combatantIds() {
    return [...this.#handles.keys()];
  }

  release(combatantId) {
    this.#instanceNames.delete(combatantId);
    return this.#handles.delete(combatantId);
  }

  clear() {
    this.#handles.clear();
    this.#instanceNames.clear();
  }

  /** Diagnostics only: slot identity, never a handle. */
  describe() {
    return this.combatantIds().map((combatantId) => ({
      combatantId,
      instanceName: this.#instanceNames.get(combatantId) ?? null,
      registered: true
    }));
  }

  /**
   * Deliberately hostile. A clip registry is presentation state; serialising
   * one would be a bug, so it fails here rather than silently entering a state
   * projection, a save record, or a state hash.
   */
  toJSON() {
    throw new ClipRegistryError(
      "A clip registry is presentation state and must never enter a state projection. Use describe() for diagnostics."
    );
  }
}

export function createClipRegistry(entries = []) {
  const registry = new ClipRegistry();
  for (const entry of entries) {
    registry.register(entry.combatantId, entry.handle, entry.instanceName ?? null);
  }
  return registry;
}
