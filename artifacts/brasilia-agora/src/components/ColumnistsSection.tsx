import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Pen } from "lucide-react";

type Specialty = "Todos" | "Política" | "Esporte" | "Economia" | "Cultura" | "Segurança Pública" | "Social" | "Outro";

interface Columnist {
  id: string;
  name: string;
  bio: string;
  specialty: Specialty;
  avatarBase64: string;
  active: boolean;
}

const SPECIALTY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Política":          { bg: "bg-[#0b3d91]/10", text: "text-[#0b3d91]",  border: "border-[#0b3d91]" },
  "Esporte":           { bg: "bg-[#c8102e]/10", text: "text-[#c8102e]",  border: "border-[#c8102e]" },
  "Economia":          { bg: "bg-green-100",     text: "text-green-700",  border: "border-green-400" },
  "Cultura":           { bg: "bg-teal-100",      text: "text-teal-700",   border: "border-teal-400" },
  "Segurança Pública": { bg: "bg-orange-100",    text: "text-orange-700", border: "border-orange-400" },
  "Social":            { bg: "bg-purple-100",    text: "text-purple-700", border: "border-purple-400" },
  "Outro":             { bg: "bg-gray-100",      text: "text-gray-600",   border: "border-gray-400" },
};

const TABS: Specialty[] = ["Todos", "Política", "Esporte", "Economia", "Cultura", "Segurança Pública", "Social"];

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ").filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`
    : (parts[0]?.slice(0, 2) ?? "?");
  return <span className="text-xl font-bold text-white">{initials.toUpperCase()}</span>;
}

const BG_PALETTE = [
  "bg-[#0b3d91]", "bg-[#c8102e]", "bg-green-600", "bg-teal-600",
  "bg-orange-500", "bg-purple-600", "bg-indigo-600",
];

export default function ColumnistsSection() {
  const [columnists, setColumnists] = useState<Columnist[]>([]);
  const [active, setActive] = useState<Specialty>("Todos");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/columnists")
      .then((r) => r.json())
      .then((d) => setColumnists(d.columnists ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = active === "Todos"
    ? columnists
    : columnists.filter((c) => c.specialty === active);

  if (loading) return null;
  if (columnists.length === 0) return null;

  return (
    <section className="py-10 bg-[#f8f8f8] border-t border-gray-100">
      <div className="max-w-[1280px] mx-auto px-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="w-1 h-7 bg-[#c8102e] rounded-full" />
            <div className="flex items-center gap-2">
              <Pen size={18} className="text-[#1a2448]" />
              <h2 className="font-['Merriweather',serif] font-bold text-[#1a2448] text-2xl leading-tight">
                Colunistas
              </h2>
            </div>
          </div>
          <Link href="/colunas" className="flex items-center gap-1 text-xs font-semibold text-[#c8102e] uppercase tracking-wider hover:underline">
            Ver todas as colunas <ChevronRight size={14} />
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-8 -mx-0.5">
          {TABS.map((tab) => {
            const count = tab === "Todos" ? columnists.length : columnists.filter((c) => c.specialty === tab).length;
            if (tab !== "Todos" && count === 0) return null;
            const colors = tab !== "Todos" ? SPECIALTY_COLORS[tab] : null;
            return (
              <button
                key={tab}
                onClick={() => setActive(tab)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all
                  ${active === tab
                    ? colors
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : "bg-[#1a2448] text-white border-[#1a2448]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                  }`}
              >
                {tab}
                {tab !== "Todos" && (
                  <span className="ml-1 opacity-60">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {filtered.map((columnist, idx) => {
            const colors = SPECIALTY_COLORS[columnist.specialty] ?? SPECIALTY_COLORS["Outro"]!;
            const bgClass = BG_PALETTE[idx % BG_PALETTE.length]!;
            return (
              <Link key={columnist.id} href="/colunas" className="group flex flex-col bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all overflow-hidden">
                  <div className="flex items-start gap-4 p-5">
                    {/* Avatar */}
                    <div className="shrink-0">
                      {columnist.avatarBase64 ? (
                        <img
                          src={columnist.avatarBase64}
                          alt={columnist.name}
                          className="w-16 h-16 rounded-full object-cover border-2 border-gray-100"
                        />
                      ) : (
                        <div className={`w-16 h-16 rounded-full ${bgClass} flex items-center justify-center border-2 border-white shadow-sm`}>
                          <Initials name={columnist.name} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-1.5 ${colors.bg} ${colors.text}`}>
                        {columnist.specialty}
                      </span>
                      <h3 className="font-['Merriweather',serif] font-bold text-[#1a2448] text-base leading-snug group-hover:text-[#c8102e] transition-colors">
                        {columnist.name}
                      </h3>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-0 border-t border-gray-50">
                    <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mt-3">
                      {columnist.bio}
                    </p>
                    <div className="flex items-center gap-1 mt-3 text-xs font-semibold text-[#c8102e] group-hover:gap-2 transition-all">
                      Ver coluna <ChevronRight size={12} />
                    </div>
                  </div>
              </Link>
            );
          })}
        </div>

      </div>
    </section>
  );
}
