import React, { useEffect } from "react";
import { useLocation } from "wouter";

export function getStoredRole(): string {
  return localStorage.getItem("admin_role") ?? "";
}

export interface StoredUser { email: string; name: string; role: string; avatarBase64?: string; }

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem("admin_user");
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredUser; } catch { return null; }
}

export function setStoredUser(u: StoredUser): void {
  localStorage.setItem("admin_user", JSON.stringify(u));
}

export function clearAuth(): void {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_role");
  localStorage.removeItem("admin_user");
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("admin_token");

  useEffect(() => {
    if (!token) navigate("/admin/login");
  }, [token, navigate]);

  if (!token) return null;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("admin_token");
  const role = getStoredRole();

  useEffect(() => {
    if (!token) { navigate("/admin/login"); return; }
  }, [token, navigate]);

  if (!token) return null;
  if (role && role !== "admin") return (
    <div className="h-full min-h-[50vh] flex items-center justify-center bg-[#F8FAFC]">
      <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🚫</span>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito</h2>
        <p className="text-slate-500 text-sm">Você não tem permissão para visualizar esta página.</p>
        <button
          onClick={() => navigate("/admin")}
          className="mt-4 px-6 py-2 bg-[#0B2A66] text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          Voltar ao Dashboard
        </button>
      </div>
    </div>
  );
  return <>{children}</>;
}
