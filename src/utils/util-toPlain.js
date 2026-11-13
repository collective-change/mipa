import { toRaw, isProxy } from "vue";

// Vue 3 reactive objects are Proxies, which can't be structured-cloned
// (postMessage to workers, IndexedDB put). Returns a deep plain copy.
export function toPlain(value) {
  const raw = isProxy(value) ? toRaw(value) : value;
  if (Array.isArray(raw)) return raw.map(toPlain);
  if (raw && typeof raw === "object") {
    const proto = Object.getPrototypeOf(raw);
    if (proto !== Object.prototype && proto !== null) return raw; // Date, Timestamp, etc.
    const out = {};
    for (const key of Object.keys(raw)) out[key] = toPlain(raw[key]);
    if ("id" in raw && !("id" in out)) out.id = raw.id; // keep non-enumerable Firestore ids
    return out;
  }
  return raw;
}
