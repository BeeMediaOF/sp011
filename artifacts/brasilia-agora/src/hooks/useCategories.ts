import { useState, useEffect } from "react";

export interface Category {
  value: string;
  label: string;
  tag: string;
  count: number;
}

const COLOR_MAP: Record<string, string> = {
  politica:    "#1d4ed8",
  cidade:      "#2563eb",
  cidades:     "#2563eb",
  seguranca:   "#dc2626",
  saude:       "#16a34a",
  transporte:  "#0284c7",
  transito:    "#0284c7",
  cultura:     "#0d9488",
  esportes:    "#b45309",
  educacao:    "#6b21a8",
  economia:    "#ea580c",
  tecnologia:  "#0891b2",
  brasil:      "#15803d",
  mundo:       "#7c3aed",
  geral:       "#64748b",
  coluna:      "#7c3aed",
  colunas:     "#7c3aed",
};

function hashColor(s: string): string {
  const PALETTE = ["#1d4ed8","#dc2626","#16a34a","#b45309","#0d9488","#7c3aed","#0891b2","#ea580c","#15803d","#6b21a8"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function categoryColor(value: string): string {
  return COLOR_MAP[value.toLowerCase()] ?? hashColor(value);
}

let cache: Category[] | null = null;
let cacheTs = 0;
const CACHE_TTL = 30_000;

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(cache ?? []);
  const [loading, setLoading]       = useState(!cache);

  useEffect(() => {
    if (cache && Date.now() - cacheTs < CACHE_TTL) {
      setCategories(cache);
      setLoading(false);
      return;
    }
    fetch("/api/articles/categories")
      .then((r) => r.json())
      .then((d: { categories?: Category[] }) => {
        const cats = d.categories ?? [];
        cache = cats;
        cacheTs = Date.now();
        setCategories(cats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { categories, loading };
}
