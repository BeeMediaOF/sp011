export function invalidatePermissionsCache() {
  try { localStorage.removeItem("editor_permissions_cache"); } catch {}
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>)["__permCacheInvalidated"] = true;
  }
}
