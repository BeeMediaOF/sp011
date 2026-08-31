/**
 * Módulo "Transferências" (rumores de mercado) — lado do SERVIDOR: tipos,
 * validação, ordenação e tetos. Funções puras (só `randomUUID` vem de fora),
 * testadas em `test/transfers.test.ts`.
 *
 * ⚠️ Os tipos são espelhados em `brasilia-agora/src/lib/transfers.ts`, que
 * cuida da apresentação (dinheiro, monograma, rótulos). Mudou aqui, mude LÁ.
 *
 * Onde os dados moram: duas chaves da tabela `settings` (`transfer_rumors` e
 * `transfer_clubs`), no mesmo padrão dos colunistas — entram no `SYNCED_KEYS`
 * do store e reidratam a cada 15 s em todo processo, sem restart e sem schema
 * novo. Por isso os TETOS abaixo não são decoração: o blob é reescrito inteiro
 * a cada edição, e é o teto que o mantém barato.
 */
import { randomUUID } from "node:crypto";

export type TransferPosition =
  | "goalkeeper" | "defender" | "fullback" | "midfielder"
  | "attacking_mid" | "winger" | "forward" | "coach";

const POSITIONS = new Set<string>([
  "goalkeeper", "defender", "fullback", "midfielder",
  "attacking_mid", "winger", "forward", "coach",
]);

/** Só "active" aparece no site. Os outros três são o ciclo de vida do rumor. */
export type TransferStatus = "active" | "draft" | "done" | "dropped";

const STATUSES = new Set<string>(["active", "draft", "done", "dropped"]);

export type TransferCurrency = "EUR" | "USD" | "BRL" | "GBP";

const CURRENCIES = new Set<string>(["EUR", "USD", "BRL", "GBP"]);

export interface TransferClub {
  id: string;
  name: string;
  country?: string;
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
  probability: number;
  transferValue?: number;
  currency?: TransferCurrency;
  source?: string;
  /** AAAA-MM-DD — chave de ordenação do bloco da home. */
  infoDate?: string;
  /** Uso interno da redação: NÃO entra no payload público. */
  notes?: string;
  status: TransferStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PublicTransferClub {
  name: string;
  country?: string;
  crestUrl?: string;
}

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

/** Tetos por blog. Recusados com 409 na rota — ver o cabeçalho. */
export const MAX_RUMORS = 200;
export const MAX_CLUBS = 300;

/** Quantos rumores o `/api/site` publica. O bloco da home mostra ~5; a página
 *  `/transferencias` mostra o resto. Acima disso é peso no payload de TODA
 *  requisição do site, inclusive a do SSR. */
export const PUBLIC_LIMIT = 30;

// ─── Helpers de recorte ───────────────────────────────────────────────────────

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s === "" ? undefined : s;
}

function num(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!isFinite(n)) return undefined;
  return Math.min(Math.max(Math.round(n), min), max);
}

/** Aceita "2026-05-25" e "2026-05-25T12:00:00Z"; devolve só a data. */
function isoDate(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return undefined;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Slug determinístico do nome do clube — é o id, e é o que torna o seed
 * idempotente (rodar duas vezes não duplica "Real Madrid").
 * "F.C. Porto" → "fc-porto" · "Atlético-MG" → "atletico-mg".
 */
export function clubSlug(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// ─── Clubes ───────────────────────────────────────────────────────────────────

export interface ClubResult {
  ok: boolean;
  error?: string;
  club?: TransferClub;
  /** true quando o nome já existia (normalizado) e devolvemos o cadastro atual. */
  existing?: boolean;
}

/**
 * Valida e normaliza um clube. Nome duplicado NÃO cria outro registro: devolve
 * o que já existe (`existing: true`). Sem isso, "Real Madrid" e "real madrid"
 * virariam dois clubes e um rumor apontaria para o escudo errado.
 */
export function normalizeClub(
  input: unknown,
  clubs: readonly TransferClub[],
  now: Date = new Date(),
): ClubResult {
  const o = (input ?? {}) as Record<string, unknown>;
  const name = str(o["name"], 80);
  if (!name) return { ok: false, error: "O nome do clube é obrigatório." };
  const id = clubSlug(name);
  if (!id) return { ok: false, error: "O nome do clube precisa ter letras ou números." };

  const found = clubs.find((c) => c.id === id);
  if (found) return { ok: true, club: found, existing: true };
  if (clubs.length >= MAX_CLUBS) {
    return { ok: false, error: `Limite de ${MAX_CLUBS} clubes atingido neste blog.` };
  }

  const club: TransferClub = {
    id,
    name,
    createdAt: now.toISOString(),
  };
  const country = str(o["country"], 60);
  if (country) club.country = country;
  const crest = str(o["crestUrl"], 500);
  if (crest) club.crestUrl = crest;
  return { ok: true, club };
}

/** Atualização de clube: só nome/país/escudo. O id (slug) NUNCA muda — ele é a
 *  chave que os rumores guardam, e renomear quebraria todos de uma vez. */
export function applyClubPatch(club: TransferClub, input: unknown): TransferClub {
  const o = (input ?? {}) as Record<string, unknown>;
  const out: TransferClub = { ...club };
  const name = str(o["name"], 80);
  if (name) out.name = name;
  if ("country" in o) {
    const country = str(o["country"], 60);
    if (country) out.country = country; else delete out.country;
  }
  if ("crestUrl" in o) {
    const crest = str(o["crestUrl"], 500);
    if (crest) out.crestUrl = crest; else delete out.crestUrl;
  }
  return out;
}

/** Quantos rumores (em qualquer status) referenciam este clube. */
export function rumorsUsingClub(rumors: readonly TransferRumor[], clubId: string): number {
  return rumors.filter((r) => r.fromClubId === clubId || r.toClubId === clubId).length;
}

// ─── Rumores ──────────────────────────────────────────────────────────────────

export interface RumorResult {
  ok: boolean;
  error?: string;
  rumor?: TransferRumor;
}

/**
 * Valida e normaliza um rumor vindo do painel.
 *
 * `prev` presente = edição (preserva id/createdAt). O `infoDate` NASCE com hoje
 * quando o formulário não manda nada: ele é a chave de ordenação do bloco, e um
 * rumor sem data cairia no fim da fila em silêncio.
 */
export function normalizeRumor(
  input: unknown,
  prev?: TransferRumor,
  now: Date = new Date(),
): RumorResult {
  const o = (input ?? {}) as Record<string, unknown>;

  const playerName = str(o["playerName"], 120);
  if (!playerName) return { ok: false, error: "O nome do jogador é obrigatório." };

  const rawPos = typeof o["position"] === "string" ? o["position"] : prev?.position;
  if (!rawPos || !POSITIONS.has(rawPos)) {
    return { ok: false, error: "Selecione uma posição válida." };
  }

  const fromClubId = str(o["fromClubId"], 60) ?? prev?.fromClubId;
  const toClubId = str(o["toClubId"], 60) ?? prev?.toClubId;
  if (!fromClubId) return { ok: false, error: "Selecione o clube de origem." };
  if (!toClubId) return { ok: false, error: "Selecione o clube de destino." };
  if (fromClubId === toClubId) {
    return { ok: false, error: "O clube de destino precisa ser diferente do de origem." };
  }

  const rawStatus = typeof o["status"] === "string" ? o["status"] : prev?.status;
  const status = (rawStatus && STATUSES.has(rawStatus) ? rawStatus : "active") as TransferStatus;

  const iso = now.toISOString();
  const rumor: TransferRumor = {
    id: prev?.id ?? randomUUID(),
    playerName,
    position: rawPos as TransferPosition,
    fromClubId,
    toClubId,
    probability: num(o["probability"], 0, 100) ?? prev?.probability ?? 50,
    status,
    createdAt: prev?.createdAt ?? iso,
    updatedAt: iso,
  };

  const photo = str(o["playerPhotoUrl"], 500);
  if (photo) rumor.playerPhotoUrl = photo;
  const nationality = str(o["nationality"], 60);
  if (nationality) rumor.nationality = nationality;
  const age = num(o["age"], 14, 60);
  if (age !== undefined) rumor.age = age;
  const marketValue = num(o["marketValue"], 0, 9_999_999_999);
  if (marketValue !== undefined) rumor.marketValue = marketValue;
  const transferValue = num(o["transferValue"], 0, 9_999_999_999);
  if (transferValue !== undefined) rumor.transferValue = transferValue;
  const currency = typeof o["currency"] === "string" && CURRENCIES.has(o["currency"])
    ? (o["currency"] as TransferCurrency) : undefined;
  if (currency) rumor.currency = currency;
  const source = str(o["source"], 200);
  if (source) rumor.source = source;
  const notes = str(o["notes"], 2000);
  if (notes) rumor.notes = notes;

  /* Data da informação: o que veio → o que já estava → hoje. */
  const infoDate = isoDate(o["infoDate"]) ?? prev?.infoDate ?? iso.slice(0, 10);
  rumor.infoDate = infoDate;

  return { ok: true, rumor };
}

/**
 * Chave de ordenação: a data da informação; sem ela, a data da última edição.
 * Decisão do usuário (2026-08-31): o bloco é um painel de ÚLTIMOS rumores, não
 * de "mais prováveis" — a probabilidade continua exibida, só não ordena.
 */
function sortKey(r: TransferRumor): string {
  return r.infoDate ?? r.updatedAt.slice(0, 10);
}

/**
 * O que o `/api/site` publica: ativos, com os clubes resolvidos, ordenados por
 * `infoDate` desc → `updatedAt` desc → `id` (desempate estável: SSR e cliente
 * precisam pintar na MESMA ordem, senão a hidratação descarta o HTML servido).
 *
 * Rumor cujo clube foi apagado é DESCARTADO — o cadastro continua lá para o
 * operador consertar, mas "undefined → Manchester City" não vai ao ar.
 */
export function publicRumors(
  rumors: readonly TransferRumor[],
  clubs: readonly TransferClub[],
  limit: number = PUBLIC_LIMIT,
): PublicTransfer[] {
  const byId = new Map<string, TransferClub>();
  for (const c of clubs) byId.set(c.id, c);

  const out: PublicTransfer[] = [];
  for (const r of rumors) {
    if (r.status !== "active") continue;
    const from = byId.get(r.fromClubId);
    const to = byId.get(r.toClubId);
    if (!from || !to) continue;
    const item: PublicTransfer = {
      id: r.id,
      playerName: r.playerName,
      position: r.position,
      probability: r.probability,
      from: publicClub(from),
      to: publicClub(to),
    };
    if (r.playerPhotoUrl) item.playerPhotoUrl = r.playerPhotoUrl;
    if (r.nationality) item.nationality = r.nationality;
    if (r.age !== undefined) item.age = r.age;
    if (r.marketValue !== undefined) item.marketValue = r.marketValue;
    if (r.transferValue !== undefined) item.transferValue = r.transferValue;
    if (r.currency) item.currency = r.currency;
    if (r.source) item.source = r.source;
    if (r.infoDate) item.infoDate = r.infoDate;
    out.push(item);
  }

  const rank = new Map<string, TransferRumor>();
  for (const r of rumors) rank.set(r.id, r);
  out.sort((a, b) => {
    const ra = rank.get(a.id)!;
    const rb = rank.get(b.id)!;
    const ka = sortKey(ra);
    const kb = sortKey(rb);
    if (ka !== kb) return ka < kb ? 1 : -1;
    if (ra.updatedAt !== rb.updatedAt) return ra.updatedAt < rb.updatedAt ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return limit > 0 ? out.slice(0, limit) : out;
}

function publicClub(c: TransferClub): PublicTransferClub {
  const out: PublicTransferClub = { name: c.name };
  if (c.country) out.country = c.country;
  if (c.crestUrl) out.crestUrl = c.crestUrl;
  return out;
}
