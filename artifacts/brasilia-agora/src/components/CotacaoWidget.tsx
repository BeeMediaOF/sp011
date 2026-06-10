import React, { useState, useEffect } from "react";

interface FxQuote { bid: string; ask: string; pctChange: string; }
interface CryptoQuote { bid: string; pctChange: string; }

interface QuotesData {
  fx: {
    USDBRL?: FxQuote;
    EURBRL?: FxQuote;
    GBPBRL?: FxQuote;
  };
  crypto: {
    BTCBRL?: CryptoQuote;
    ETHBRL?: CryptoQuote;
  };
  ts?: number;
}

const fmt2 = (v: string) =>
  parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const fmtCrypto = (v: string) =>
  parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PctBadge({ pct }: { pct: string }) {
  const val = parseFloat(pct);
  const up = val >= 0;
  return (
    <span
      className="text-[12px] font-bold"
      style={{ color: up ? "#16a34a" : "#c8102e" }}
    >
      {up ? "+" : ""}{val.toFixed(2)}%
    </span>
  );
}

export default function CotacaoWidget() {
  const [data, setData] = useState<QuotesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchQuotes = () => {
    setLoading(true);
    fetch("/api/quotes")
      .then((r) => r.json())
      .then((json: QuotesData) => {
        setData(json);
        setLoading(false);
        setError(false);
      })
      .catch(() => {
        setLoading(false);
        setError(true);
      });
  };

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const moedas = [
    { label: "Dólar",  q: data?.fx?.USDBRL },
    { label: "Euro",   q: data?.fx?.EURBRL  },
    { label: "Libra",  q: data?.fx?.GBPBRL  },
  ];

  const cryptos = [
    { label: "Bitcoin",  q: data?.crypto?.BTCBRL },
    { label: "Ethereum", q: data?.crypto?.ETHBRL  },
  ];

  const lastUpdate = data?.ts
    ? new Date(data.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-3 mb-6">

      {/* ── Moedas ── */}
      <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[18px] font-bold text-[#1a1a1a]">Moedas</h3>
          {lastUpdate && (
            <button onClick={fetchQuotes} title="Atualizar"
              className="text-gray-300 hover:text-gray-500 text-[13px] transition-colors">
              ↻
            </button>
          )}
        </div>

        {loading && (
          <div className="space-y-2 animate-pulse">
            {[1,2,3].map(i => (
              <div key={i} className="flex justify-between">
                <div className="h-3 bg-gray-100 rounded w-16" />
                <div className="h-3 bg-gray-100 rounded w-20" />
                <div className="h-3 bg-gray-100 rounded w-20" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-3 text-[10px] text-gray-400 uppercase tracking-wider mb-2 pb-1 border-b border-gray-100">
              <span>Moeda</span>
              <span className="text-right">Compra</span>
              <span className="text-right">Venda</span>
            </div>
            {moedas.map(({ label, q }) => (
              <div key={label} className="grid grid-cols-3 py-1.5 items-center">
                <span className="text-[13px] font-semibold text-[#1d4ed8]">{label}</span>
                <span className="text-right text-[12px] text-gray-700">
                  {q ? `R$ ${fmt2(q.bid)}` : "—"}
                </span>
                <span className="text-right text-[12px] text-gray-700">
                  {q ? `R$ ${fmt2(q.ask)}` : "—"}
                </span>
              </div>
            ))}
          </>
        )}

        {error && !loading && (
          <p className="text-[11px] text-gray-400 text-center py-2">
            Indisponível —{" "}
            <button onClick={fetchQuotes} className="text-[#1d4ed8] hover:underline">
              tentar novamente
            </button>
          </p>
        )}
      </div>

      {/* ── Criptoativos ── */}
      <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
        <h3 className="text-[18px] font-bold text-[#1a1a1a] mb-3">Criptoativos</h3>

        {loading && (
          <div className="space-y-2 animate-pulse">
            {[1,2].map(i => (
              <div key={i} className="flex justify-between">
                <div className="h-3 bg-gray-100 rounded w-20" />
                <div className="h-3 bg-gray-100 rounded w-14" />
                <div className="h-3 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-1">
            {cryptos.map(({ label, q }) => (
              <div key={label} className="flex items-center justify-between py-1.5">
                <span className="text-[13px] font-semibold text-[#1d4ed8] w-24 shrink-0">
                  {label}
                </span>
                <PctBadge pct={q?.pctChange ?? "0"} />
                <span className="text-[12px] text-gray-700 text-right">
                  {q ? `R$ ${fmtCrypto(q.bid)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="text-[11px] text-gray-400 text-center py-2">Indisponível</p>
        )}
      </div>

    </div>
  );
}
