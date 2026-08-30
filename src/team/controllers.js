/**
 * Controller identity, deliberately decoupled from combatant identity.
 *
 * A combatant is a fighter in the arena. A *seat* is the slot that fighter
 * occupies. A *controller* is whoever is driving that seat right now: a local
 * player, a hot-seat pad, a remote peer, or the AI. The registry maps
 * seat -> controller and nothing else, which is what lets one campaign team
 * mix local, hot-seat, remote, and AI allies without a second combat path.
 *
 * Nothing in this module touches combat state, and the authoritative combat
 * projection deliberately excludes it: reassigning a controller must never
 * change a combat state hash.
 */

export const ControllerKind = Object.freeze({
  LOCAL: "local",
  HOT_SEAT: "hot-seat",
  REMOTE: "remote",
  AI: "ai"
});

const KINDS = new Set(Object.values(ControllerKind));

export class ControllerError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * Legacy single-string controller tokens (what `src/engine.js` accepted before
 * the seam) map onto kinds by prefix. `"ai"` is the AI, `"local"`/`"local:*"`
 * is the local player, `"hot-seat:*"`/`"hotseat:*"` is a hot-seat pad, and
 * everything else is treated as a remote peer id.
 */
export function controllerKindForToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new ControllerError("A controller token must be a non-empty string.");
  }
  if (token === ControllerKind.AI || token.startsWith("ai:")) return ControllerKind.AI;
  if (token === ControllerKind.LOCAL || token.startsWith("local:")) return ControllerKind.LOCAL;
  if (token === "hot-seat" || token.startsWith("hot-seat:")) return ControllerKind.HOT_SEAT;
  if (token === "hotseat" || token.startsWith("hotseat:")) return ControllerKind.HOT_SEAT;
  return ControllerKind.REMOTE;
}

/**
 * Normalises a controller spec. A bare string keeps its exact token, so the
 * legacy projection in `src/engine.js` round-trips losslessly.
 */
export function controllerIdentity(spec) {
  if (typeof spec === "string") {
    return Object.freeze({ kind: controllerKindForToken(spec), id: spec, label: spec });
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new ControllerError("A controller must be a token string or a { kind, id } object.");
  }
  const { kind, id, label } = spec;
  if (!KINDS.has(kind)) {
    throw new ControllerError(`Unsupported controller kind: ${String(kind)}.`);
  }
  const resolvedId = id ?? kind;
  if (typeof resolvedId !== "string" || resolvedId.length === 0) {
    throw new ControllerError("A controller id must be a non-empty string.");
  }
  if (label !== undefined && (typeof label !== "string" || label.length === 0)) {
    throw new ControllerError("A controller label must be a non-empty string when present.");
  }
  return Object.freeze({ kind, id: resolvedId, label: label ?? resolvedId });
}

/** The single-string form used by the legacy engine wire projection. */
export function controllerToken(identity) {
  return identity.id;
}

export class ControllerRegistry {
  #seats = new Map();

  assign(seatId, spec) {
    if (typeof seatId !== "string" || seatId.length === 0) {
      throw new ControllerError("A seat id must be a non-empty string.");
    }
    const identity = controllerIdentity(spec);
    this.#seats.set(seatId, identity);
    return identity;
  }

  /** Hand a seat to a different controller mid-battle. Combat state is untouched. */
  reassign(seatId, spec) {
    if (!this.#seats.has(seatId)) {
      throw new ControllerError(`Unknown seat: ${String(seatId)}.`);
    }
    return this.assign(seatId, spec);
  }

  identityFor(seatId) {
    const identity = this.#seats.get(seatId);
    if (!identity) throw new ControllerError(`Unknown seat: ${String(seatId)}.`);
    return identity;
  }

  has(seatId) {
    return this.#seats.has(seatId);
  }

  isAi(seatId) {
    return this.identityFor(seatId).kind === ControllerKind.AI;
  }

  seatIds() {
    return [...this.#seats.keys()];
  }

  /** Ordered, JSON-safe seat -> controller projection. Never combat state. */
  toJSON() {
    return this.seatIds().map((seatId) => ({ seatId, ...this.identityFor(seatId) }));
  }

  clone() {
    const copy = new ControllerRegistry();
    for (const seatId of this.seatIds()) copy.assign(seatId, this.identityFor(seatId));
    return copy;
  }
}

export function createControllerRegistry(entries = []) {
  const registry = new ControllerRegistry();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") throw new ControllerError("Controller entries must be objects.");
    registry.assign(entry.seatId, entry.controller ?? entry);
  }
  return registry;
}
