/**
 * Ícone padrão de cada editoria (bloco "Categorias" da home).
 *
 * O bloco monta a navegação a partir das categorias do blog; cada uma aparece
 * num círculo com o ícone daqui, e o painel deixa trocar por uma imagem
 * enviada (`categoryItems[].imageUrl`). O mapa cobre os slugs que já existem
 * na rede: as editorias clássicas do engine, os slugs de esporte (pt e en) e
 * os dos blogs de nicho.
 *
 * Sem React nem DOM de propósito: o `vite.config.ts` faz SSR da home e este
 * módulo roda dos dois lados.
 *
 * Emojis SEMPRE em escape `\u{...}`: Edit/Write normalizam o arquivo em NFC e
 * isso corromperia os seletores de variação (FE0F). Bandeiras ficaram de fora
 * porque o Windows não as desenha (🇧🇷 vira as letras "BR").
 */

const ICONS: Readonly<Record<string, string>> = {
  // Editorias clássicas do engine (FIXED_CATEGORIES + sugeridas no painel)
  politica: "\u{1F4E3}",
  cidade: "\u{1F3D9}\u{FE0F}",
  seguranca: "\u{1F6A8}",
  transporte: "\u{1F68C}",
  saude: "\u{1F3E5}",
  educacao: "\u{1F393}",
  cultura: "\u{1F3AD}",
  esportes: "\u{26BD}",
  colunas: "\u{270D}\u{FE0F}",
  colunistas: "\u{270D}\u{FE0F}",
  brasil: "\u{1F5FA}\u{FE0F}",
  mundo: "\u{1F30E}",
  economia: "\u{1F4C8}",
  tecnologia: "\u{1F4BB}",
  turismo: "\u{1F9F3}",
  "meio-ambiente": "\u{1F331}",
  geral: "\u{1F4F0}",
  outros: "\u{1F4F0}",
  others: "\u{1F4F0}",

  // Esporte (pt-BR — Esporte Agora e irmãos)
  "copa-do-mundo": "\u{1F3C6}",
  futebol: "\u{26BD}",
  volei: "\u{1F3D0}",
  tenis: "\u{1F3BE}",
  f1: "\u{1F3CE}\u{FE0F}",
  "futebol-americano": "\u{1F3C8}",
  "e-sports": "\u{1F3AE}",
  basquete: "\u{1F3C0}",

  // Esporte (en — KSports)
  "world-cup": "\u{1F3C6}",
  football: "\u{26BD}",
  volleyball: "\u{1F3D0}",
  tennis: "\u{1F3BE}",
  "formula-1": "\u{1F3CE}\u{FE0F}",
  nfl: "\u{1F3C8}",
  esports: "\u{1F3AE}",

  // Negócios / aviação / turismo (O Comandante)
  negocios: "\u{1F4BC}",
  aviacao: "\u{2708}\u{FE0F}",

  // Educação financeira (Crédito.vc)
  "sair-das-dividas": "\u{1F4B0}",
  credito: "\u{1F4B3}",
  score: "\u{1F3AF}",
  "organizar-financas": "\u{1F4CA}",
  "renda-extra": "\u{1F4BC}",
  "planejar-o-futuro": "\u{1F4C5}",
  investimentos: "\u{1F4C8}",

  // Setor farmacêutico (PontoFarma)
  gestao: "\u{1F5C2}\u{FE0F}",
  "fiscal-tributario": "\u{1F9FE}",
  legislacao: "\u{2696}\u{FE0F}",
  mercado: "\u{1F4C8}",
  vendas: "\u{1F6D2}",
  equipe: "\u{1F465}",
  "saude-categorias": "\u{1F48A}",
};

/** Slugs com ícone próprio — o painel usa para dizer "padrão" na lista. */
export function hasCategoryIcon(slug: string): boolean {
  return Object.hasOwn(ICONS, slug.trim().toLowerCase());
}

/**
 * Ícone de uma editoria. Sem entrada no mapa, devolve as iniciais do rótulo
 * (até 2 letras) — nunca um emoji genérico errado nem um quadrado vazio.
 */
export function categoryIcon(slug: string, label?: string): string {
  const hit = ICONS[slug.trim().toLowerCase()];
  if (hit) return hit;
  const words = (label ?? slug).trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "\u{1F4F0}";
  const initials = words.length === 1
    ? words[0]!.slice(0, 2)
    : words[0]!.charAt(0) + words[1]!.charAt(0);
  return initials.toLocaleUpperCase();
}
