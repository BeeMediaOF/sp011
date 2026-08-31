/**
 * Modelo compartilhado do módulo "Transferências" (rumores de mercado) —
 * lado do NAVEGADOR: tipos + apresentação. Nada aqui toca rede ou DOM.
 *
 * ⚠️ Espelhado em `artifacts/api-server/src/lib/transfers.ts` (validação,
 * ordenação e tetos). Mudou o tipo aqui, mude LÁ — é a mesma convenção do
 * `HomeBlock`, que vive nos dois stores.
 *
 * Duas decisões que este arquivo materializa:
 *
 * 1. **Posição é enum, não texto livre.** A imagem é UMA para os 11 blogs e um
 *    deles (ksports) é EN: "Atacante" digitado à mão apareceria em português
 *    lá. Guarda-se a chave; o rótulo sai do i18n público.
 * 2. **Dinheiro é formatado SEM `Intl`.** O ICU do Node e o do navegador podem
 *    divergir na mesma versão de string, e divergência entre SSR e hidratação é
 *    o React #418 — que já custou o LCP da home uma vez. Agrupamento próprio,
 *    puro e testado, byte-idêntico dos dois lados.
 */

export type TransferPosition =
  | "goalkeeper" | "defender" | "fullback" | "midfielder"
  | "attacking_mid" | "winger" | "forward" | "coach";

/** Ordem do <select> do painel. */
export const TRANSFER_POSITIONS: readonly TransferPosition[] = [
  "goalkeeper", "defender", "fullback", "midfielder",
  "attacking_mid", "winger", "forward", "coach",
];

/** Só "active" aparece no site. Os outros três são o ciclo de vida do rumor. */
export type TransferStatus = "active" | "draft" | "done" | "dropped";

export const TRANSFER_STATUSES: readonly TransferStatus[] = ["active", "draft", "done", "dropped"];

export type TransferCurrency = "EUR" | "USD" | "BRL" | "GBP";

export const TRANSFER_CURRENCIES: readonly TransferCurrency[] = ["EUR", "USD", "BRL", "GBP"];

export interface TransferClub {
  /** Slug determinístico do nome — é o que torna o seed idempotente. */
  id: string;
  name: string;
  country?: string;
  /** /api/uploads/… — vazio desenha o monograma. */
  crestUrl?: string;
  createdAt: string;
}

export interface TransferRumor {
  id: string;
  playerName: string;
  playerPhotoUrl?: string;
  position: TransferPosition;
  nationality?: string;
  age?: number;
  marketValue?: number;
  fromClubId: string;
  toClubId: string;
  /** 0–100, inteiro. */
  probability: number;
  transferValue?: number;
  currency?: TransferCurrency;
  source?: string;
  /** AAAA-MM-DD. É a CHAVE DE ORDENAÇÃO do bloco da home. */
  infoDate?: string;
  /** Uso interno da redação — não vai para o site. */
  notes?: string;
  status: TransferStatus;
  createdAt: string;
  updatedAt: string;
}

/** Clube já resolvido dentro do payload público (o site não recebe o catálogo). */
export interface PublicTransferClub {
  name: string;
  country?: string;
  crestUrl?: string;
}

/**
 * O que o `/api/site` publica: rumor ATIVO, com os dois clubes resolvidos e
 * sem os campos internos (`notes`, `status`, `createdAt`). Blog que não usa o
 * módulo manda `transfers: []`.
 */
export interface PublicTransfer {
  id: string;
  playerName: string;
  playerPhotoUrl?: string;
  position: TransferPosition;
  nationality?: string;
  age?: number;
  marketValue?: number;
  probability: number;
  transferValue?: number;
  currency?: TransferCurrency;
  source?: string;
  infoDate?: string;
  from: PublicTransferClub;
  to: PublicTransferClub;
}

// ─── Dinheiro (sem Intl — ver cabeçalho) ──────────────────────────────────────

const SYMBOL: Record<TransferCurrency, string> = {
  EUR: "€", USD: "US$", BRL: "R$", GBP: "£",
};

/** Em inglês o dólar é "$" seco; as demais moedas usam o mesmo símbolo. */
const SYMBOL_EN: Record<TransferCurrency, string> = { ...SYMBOL, USD: "$" };

function symbolFor(currency: TransferCurrency, lang: string): string {
  return lang === "en" ? SYMBOL_EN[currency] : SYMBOL[currency];
}

/** Agrupa a parte inteira de 3 em 3 com o separador dado. Só dígitos entram. */
function group(digits: string, sep: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += sep;
    out += digits[i];
  }
  return out;
}

/**
 * "€ 80.000.000" (pt-BR) · "€80,000,000" (en). Valor inválido/ausente → "".
 * Casas decimais são descartadas: valor de transferência em centavos não existe
 * no jornalismo de mercado, e arredondar aqui evita "80.000.000,00" no card.
 */
export function formatMoney(
  value: number | undefined | null,
  currency: TransferCurrency = "EUR",
  lang = "pt-BR",
): string {
  if (typeof value !== "number" || !isFinite(value) || value < 0) return "";
  const digits = String(Math.round(value));
  const en = lang === "en";
  const body = group(digits, en ? "," : ".");
  return en ? `${symbolFor(currency, lang)}${body}` : `${symbolFor(currency, lang)} ${body}`;
}

/**
 * Forma curta para caber no card: "€ 80 mi" · "€ 1,5 bi" (pt) / "€80M" ·
 * "€1.5B" (en). Abaixo de 1 milhão cai no formato cheio — "€ 800 mil" seria
 * menos legível que "€ 800.000".
 */
export function formatMoneyShort(
  value: number | undefined | null,
  currency: TransferCurrency = "EUR",
  lang = "pt-BR",
): string {
  if (typeof value !== "number" || !isFinite(value) || value < 0) return "";
  if (value < 1_000_000) return formatMoney(value, currency, lang);
  const en = lang === "en";
  const bi = value >= 1_000_000_000;
  const n = value / (bi ? 1_000_000_000 : 1_000_000);
  // Uma casa decimal, e só quando ela diz alguma coisa (1.5 sim, 80.0 não).
  const rounded = Math.round(n * 10) / 10;
  const inteiro = Math.trunc(rounded);
  const dec = Math.round((rounded - inteiro) * 10);
  const num = dec === 0 ? String(inteiro) : `${inteiro}${en ? "." : ","}${dec}`;
  const suf = en ? (bi ? "B" : "M") : (bi ? " bi" : " mi");
  const sym = symbolFor(currency, lang);
  return en ? `${sym}${num}${suf}` : `${sym} ${num}${suf}`;
}

// ─── Apresentação ─────────────────────────────────────────────────────────────

/** Chave i18n do rótulo da posição (pt e en vivem em `lib/i18n.ts`). */
export function positionKey(pos: TransferPosition): string {
  return `transfers.pos.${pos}`;
}

/**
 * Iniciais para o círculo que substitui o escudo ausente.
 * "Real Madrid" → "RM" · "Vasco" → "VA" · "Atlético de Madrid" → "AM".
 *
 * Escudo é marca de terceiro: o seed não traz nenhum, e o operador só sobe os
 * dos clubes que realmente usar. Até lá o bloco desenha isto — nunca um buraco.
 */
const MONOGRAM_SKIP = new Set([
  "de", "da", "do", "das", "dos", "e", "of", "the", "fc", "cf", "sc", "ac", "afc", "cd", "ec", "se",
]);

export function clubMonogram(name: string | undefined | null): string {
  const limpo = (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!limpo) return "?";
  const partes = limpo.split(/[\s.]+/).filter(Boolean);
  const uteis = partes.filter((p) => !MONOGRAM_SKIP.has(p.toLowerCase()));
  const base = uteis.length > 0 ? uteis : partes;
  if (base.length === 1) return base[0]!.slice(0, 2).toUpperCase();
  return (base[0]![0]! + base[base.length - 1]![0]!).toUpperCase();
}

/**
 * Faixa de cor do selo de probabilidade. Não é paleta de marca: são três
 * degraus de opacidade sobre a cor de acento do PRÓPRIO blog, decidida no
 * componente. Aqui só a classificação.
 */
export function probabilityTier(p: number): "high" | "medium" | "low" {
  if (p >= 70) return "high";
  if (p >= 45) return "medium";
  return "low";
}

// ─── Imagens ──────────────────────────────────────────────────────────────────

/** Só o que o próprio blog hospeda pode ser redimensionado: a rota
 *  `/api/uploads/:filename` aceita `?w=&q=&fit=` e devolve WebP. URL de fora
 *  (o campo de reserva de quem não tem `upload.images`) passa intacta — pedir
 *  `?w=` a um host de terceiro só quebraria o link. */
function isUpload(url: string): boolean {
  return url.startsWith("/api/uploads/");
}

/**
 * Foto do jogador: quadrada e RECORTADA (`fit=cover`), porque o card a exibe
 * dentro de um círculo. `size` é o lado em CSS px; pedimos 2x para tela retina.
 */
export function transferPhotoUrl(url: string | undefined | null, size = 64): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (!isUpload(u)) return u;
  const px = size * 2;
  return `${u}?w=${px}&h=${px}&fit=cover&q=82`;
}

/** Escudo: NUNCA `cover` — recortar um escudo corta o brasão. `inside` cabe
 *  inteiro na caixa e a proporção é preservada. */
export function transferCrestUrl(url: string | undefined | null, size = 20): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (!isUpload(u)) return u;
  return `${u}?w=${size * 2}&q=82`;
}

/** "25/05/2025" (pt) · "05/25/2025" (en) a partir de AAAA-MM-DD, sem `Date`
 *  (uma data só-data virava o dia anterior em fuso negativo). */
export function formatInfoDate(iso: string | undefined | null, lang = "pt-BR"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  if (!m) return "";
  const [, y, mo, d] = m;
  return lang === "en" ? `${mo}/${d}/${y}` : `${d}/${mo}/${y}`;
}
