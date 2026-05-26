import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";

export interface Article {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  category: string;
  tag: string;
  imageUrl: string;
  author: string;
  publishedAt: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  order: number;
  visible: boolean;
}

export interface SiteSettings {
  siteName: string;
  tagline: string;
  logoBase64?: string;
  mobileEnabled: boolean;
  desktopEnabled: boolean;
}

interface StoreData {
  articles: Article[];
  menuItems: MenuItem[];
  settings: SiteSettings;
}

const STORE_FILE = "/tmp/brasilia-store.json";

const defaultStore: StoreData = {
  articles: [
    {
      id: "hero-1",
      title: "Câmara Legislativa aprova projeto que cria o programa Morar DF",
      subtitle: "Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.",
      content: "A Câmara Legislativa do Distrito Federal aprovou nesta semana o projeto de lei que institui o programa Morar DF. A iniciativa prevê subsídio direto para famílias de baixa renda que desejam adquirir imóveis na capital. O programa deve beneficiar cerca de 15 mil famílias nos próximos dois anos.",
      category: "politica",
      tag: "POLÍTICA",
      imageUrl: "",
      author: "Redação Brasília Hoje",
      publishedAt: new Date().toISOString(),
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "hero-2",
      title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília",
      subtitle: "Motoristas devem ficar atentos às mudanças no tráfego durante o período de obras.",
      content: "O Departamento de Trânsito do DF informou que obras de manutenção no Eixo Monumental vão alterar o trânsito neste fim de semana. A interdição parcial ocorre entre as vias N2 e S2.",
      category: "transporte",
      tag: "TRÂNSITO",
      imageUrl: "",
      author: "Redação Brasília Hoje",
      publishedAt: new Date().toISOString(),
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  menuItems: [
    { id: "1", label: "HOME",      path: "/",          order: 0, visible: true },
    { id: "2", label: "POLÍTICA",  path: "/politica",  order: 1, visible: true },
    { id: "3", label: "CIDADE",    path: "/cidade",    order: 2, visible: true },
    { id: "4", label: "SEGURANÇA", path: "/seguranca", order: 3, visible: true },
    { id: "5", label: "TRANSPORTE",path: "/transporte",order: 4, visible: true },
    { id: "6", label: "SAÚDE",     path: "/saude",     order: 5, visible: true },
    { id: "7", label: "EDUCAÇÃO",  path: "/educacao",  order: 6, visible: true },
    { id: "8", label: "CULTURA",   path: "/cultura",   order: 7, visible: true },
    { id: "9", label: "ESPORTES",  path: "/esportes",  order: 8, visible: true },
    { id: "10",label: "COLUNAS",   path: "/colunas",   order: 9, visible: true },
  ],
  settings: {
    siteName: "Brasília Hoje",
    tagline: "A notícia da nossa capital, agora.",
    mobileEnabled: true,
    desktopEnabled: true,
  },
};

function loadStore(): StoreData {
  try {
    if (existsSync(STORE_FILE)) {
      return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as StoreData;
    }
  } catch { /* ignore */ }
  return structuredClone(defaultStore);
}

function saveStore(data: StoreData): void {
  try {
    writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch { /* ignore */ }
}

let _store: StoreData = loadStore();

export const store = {
  // Articles
  getArticles: () => [..._store.articles],
  getArticle: (id: string) => _store.articles.find((a) => a.id === id) ?? null,
  createArticle: (data: Omit<Article, "id" | "createdAt" | "updatedAt">): Article => {
    const article: Article = {
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _store.articles.unshift(article);
    saveStore(_store);
    return article;
  },
  updateArticle: (id: string, data: Partial<Omit<Article, "id" | "createdAt">>): Article | null => {
    const idx = _store.articles.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    _store.articles[idx] = { ..._store.articles[idx]!, ...data, updatedAt: new Date().toISOString() };
    saveStore(_store);
    return _store.articles[idx]!;
  },
  deleteArticle: (id: string): boolean => {
    const before = _store.articles.length;
    _store.articles = _store.articles.filter((a) => a.id !== id);
    const deleted = _store.articles.length < before;
    if (deleted) saveStore(_store);
    return deleted;
  },

  // Menu
  getMenuItems: () => [..._store.menuItems].sort((a, b) => a.order - b.order),
  updateMenuItems: (items: MenuItem[]): MenuItem[] => {
    _store.menuItems = items;
    saveStore(_store);
    return [..._store.menuItems];
  },

  // Settings
  getSettings: () => ({ ..._store.settings }),
  updateSettings: (data: Partial<SiteSettings>): SiteSettings => {
    _store.settings = { ..._store.settings, ...data };
    saveStore(_store);
    return { ..._store.settings };
  },
};
