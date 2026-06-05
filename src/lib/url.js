// Sync a flat state object to the URL query string so views are shareable.

export function readQuery(keys) {
  const p = new URLSearchParams(window.location.search);
  const out = {};
  for (const k of keys) {
    const v = p.get(k);
    if (v != null) out[k] = v === "true" ? true : v === "false" ? false : v;
  }
  return out;
}

export function writeQuery(state) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) {
    if (v === "" || v == null || v === false) continue;
    p.set(k, String(v));
  }
  const qs = p.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}
