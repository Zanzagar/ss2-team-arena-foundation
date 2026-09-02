/**
 * FNV-1a, 32-bit, as an 8-character lowercase hex string.
 *
 * Lifted out of `src/team/resolver.js` on 2026-09-02 so that `src/team/rng.js`
 * can commit to its own drawn samples without importing the resolver, which
 * imports it. `resolver.js` still re-exports it, so every existing caller and
 * the `fnv1a` name in `src/campaign/record.js`'s validation message stay valid.
 *
 * This is a CONSISTENCY check, not a security primitive: it is 32 bits and
 * trivially collidable by anyone trying. It exists so two peers can notice they
 * have diverged, not to stop one lying about it.
 *
 * Node builtins only; no imports, so anything may depend on it.
 */
export function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
