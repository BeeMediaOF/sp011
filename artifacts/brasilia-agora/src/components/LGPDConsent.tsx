import { useState, useEffect } from "react";

const STORAGE_KEY = "bee_analytics_consent";

export type ConsentState = "accepted" | "rejected" | null;

export function getConsent(): ConsentState {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "accepted" || v === "rejected") return v;
  } catch { /* ignore */ }
  return null;
}

export default function LGPDConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === null) {
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
    window.dispatchEvent(new Event("bee_consent_change"));
  }

  function reject() {
    localStorage.setItem(STORAGE_KEY, "rejected");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] text-white shadow-2xl border-t-2 border-[#c8102e]"
      role="dialog"
      aria-label="Aviso de cookies e privacidade"
    >
      <div className="max-w-[1280px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 text-sm leading-relaxed">
          <span className="font-bold text-yellow-400 mr-1">🍪 Privacidade e Cookies</span>
          Utilizamos cookies e tecnologias similares para melhorar sua experiência, medir o desempenho do portal e exibir conteúdo relevante, em conformidade com a{" "}
          <strong>Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>.
          Seus dados nunca são vendidos a terceiros.{" "}
          <a href="/privacidade" className="underline text-blue-300 hover:text-blue-200 text-xs ml-1">
            Política de Privacidade
          </a>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={reject}
            className="px-4 py-2 text-sm border border-gray-500 text-gray-300 rounded hover:bg-gray-700 transition-colors"
          >
            Recusar
          </button>
          <button
            onClick={accept}
            className="px-5 py-2 text-sm bg-[#c8102e] hover:bg-red-700 text-white font-bold rounded transition-colors"
          >
            Aceitar todos
          </button>
        </div>
      </div>
    </div>
  );
}
