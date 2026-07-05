/** Usuário logado em localStorage — preenchido no login, exibido no topbar. */

const USER_KEY = "central_user";

export interface StoredUser {
  name?: string;
  email?: string;
  role?: string;
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
}

export function clearStoredUser(): void {
  try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
}
