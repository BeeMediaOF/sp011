const LS_KEY = "admin_dark_mode";

export function getAdminDarkMode(): boolean {
  try { return localStorage.getItem(LS_KEY) === "true"; } catch { return false; }
}

export function setAdminDarkMode(dark: boolean): void {
  try { localStorage.setItem(LS_KEY, String(dark)); } catch {}
}
