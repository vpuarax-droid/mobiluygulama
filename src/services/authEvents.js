/**
 * Basit auth event bus.
 * 401/403 geldiğinde api.js buradan event yayınlar.
 * Screens tarafı onUnauthorized ile dinleyip Login ekranına düşebilir.
 */
const listeners = new Set();

export function emitUnauthorized(reason = "") {
  for (const fn of Array.from(listeners)) {
    try {
      fn(reason);
    } catch (e) {}
  }
}

export function onUnauthorized(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
