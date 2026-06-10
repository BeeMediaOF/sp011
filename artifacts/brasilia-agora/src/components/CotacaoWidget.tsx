import React, { useState, useEffect } from "react";

interface Quote {
  code: string;
  bid: string;
  pctChange: string;
  high: string;
  low: string;
}

interface QuoteData {
  usd: Quote | null;
  eur: Quote | null;
  lastUpdate: Date | null;
}

const CURRENCIES = [
  { key: "USDBRL", label: "Dólar", symbol: "US$", flag: "🇺🇸" },
  { key: "EURBRL", label: "Euro",  symbol: "€",   flag: "🇪🇺" },
];

function Arrow({ pct }: { pct: string }) {
  const val = parseFloat(pct);
  if (val > 0)
    return <span className="text-[#16a34a] text-[11px] font-bold">▲ {Math.abs(val).toFixed(2)}%</span>;
  if (val < 0)
    return <span className="text-[#c8102e] text-[11px] font-bold">▼ {Math.abs(val).toFixed(2)}%</span>;
  return <span className="text-gray-400 text-[11px] font-bold">— 0.00%</span>;
}

export default function CotacaoWidget() {
  const [data, setData] = useState<QuoteData>({ usd: null, eur: null, lastUpdate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchQuotes = () => {
    fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL")
      .then((r) => r.json())
      .then((json) => {
        setData({
          usd: json.USDBRL ?? null,
          eur: json.EURBRL ?? null,
          lastUpdate: new Date(),
        });
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

  const fmt = (val: string) =>
    parseFloat(val).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="border border-gray-100 rounded-sm overflow-hidden mb-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between bg-[#0f0f4a] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-[#c8102e]" />
          <span className="text-white text-[12px] font-bold uppercase tracking-wider">Cotações</span>
        </div>
        {data.lastUpdate && (
          <span className="text-white/40 text-[9px]">
            {data.lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Conteúdo */}
      <div className="divide-y divide-gray-100 bg-white">
        {loading && (
          <div className="px-4 py-4 flex gap-3 animate-pulse">
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-100 rounded w-1/2" />
              <div className="h-5 bg-gray-200 rounded w-2/3" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-100 rounded w-1/2" />
              <div className="h-5 bg-gray-200 rounded w-2/3" />
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="px-4 py-3 text-center">
            <p className="text-[11px] text-gray-400">Cotação indisponível</p>
            <button
              onClick={fetchQuotes}
              className="text-[11px] text-[#1d4ed8] hover:underline mt-1"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            {[
              { meta: CURRENCIES[0], quote: data.usd },
              { meta: CURRENCIES[1], quote: data.eur },
            ].map(({ meta, quote }) => (
              <div key={meta.key} className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base leading-none">{meta.flag}</span>
                  <span className="text-[11px] text-gray-500 font-semibold">{meta.label}</span>
                </div>
                {quote ? (
                  <>
                    <div className="text-[18px] font-black text-[#1a1a1a] leading-none mb-1">
                      R$ {fmt(quote.bid)}
                    </div>
                    <Arrow pct={quote.pctChange} />
                    <div className="text-[9px] text-gray-300 mt-1">
                      {fmt(quote.low)} / {fmt(quote.high)}
                    </div>
                  </>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-50 px-4 py-1.5 flex items-center justify-between">
        <span className="text-[9px] text-gray-300 uppercase tracking-wider">Fonte: AwesomeAPI</span>
        <button
          onClick={fetchQuotes}
          className="text-[9px] text-gray-400 hover:text-[#1d4ed8] transition-colors uppercase tracking-wider"
        >
          ↻ Atualizar
        </button>
      </div>
    </div>
  );
}
