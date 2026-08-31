/**
 * Painel → Transferências: cadastro MANUAL de possíveis transferências.
 *
 * Duas abas no mesmo arquivo:
 *  - **Rumores**: lista + o formulário "Cadastro manual" (jogador, times,
 *    informações da transferência, status).
 *  - **Clubes**: o catálogo. É aqui que o operador sobe o escudo — o seed
 *    (`deploy/transferencias/clubes_seed.sql`) traz só nome e país, porque
 *    escudo é marca de terceiro e não entra no repo.
 *
 * O módulo existe em TODO blog assim que a imagem sobe (a imagem é uma só);
 * quem decide se ele aparece no site é o operador, adicionando o bloco
 * "Transferências" na home. Sem rumor ativo, o bloco não é renderizado.
 *
 * A busca de clube é filtrada NO CLIENTE: o catálogo inteiro (~100 itens) chega
 * na mesma requisição da lista, então não há endpoint de autocomplete para
 * manter em pé.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi } from "../../lib/adminApi";
import { useCan } from "../../lib/permissionsCache";
import { invalidateSiteCache } from "../../hooks/useSite";
import {
  clubMonogram, formatMoney,
  TRANSFER_CURRENCIES, TRANSFER_POSITIONS,
  type TransferClub, type TransferCurrency, type TransferPosition,
  type TransferRumor, type TransferStatus,
} from "../../lib/transfers";
import {
  ArrowLeftRight, ArrowRight, ChevronRight, Info, Pencil, Plus, Search,
  Shield, Trash2, Upload, X,
} from "lucide-react";

const CARD = "bg-white rounded-2xl border border-slate-200 p-5";
const INPUT = "w-full px-3 py-2 text-[13px] rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#0B2A66]";
const LABEL = "block text-[11px] font-semibold text-slate-600 mb-1.5";

/** Rótulos do painel — pt-BR, como todas as abas só-admin (CLAUDE.md §15). */
const POSITION_LABEL: Record<TransferPosition, string> = {
  goalkeeper: "Goleiro",
  defender: "Zagueiro",
  fullback: "Lateral",
  midfielder: "Meio-campista",
  attacking_mid: "Meia-atacante",
  winger: "Ponta",
  forward: "Atacante",
  coach: "Técnico",
};

const STATUS_LABEL: Record<TransferStatus, string> = {
  active: "Ativa",
  draft: "Rascunho",
  done: "Concretizada",
  dropped: "Descartada",
};

const STATUS_COLOR: Record<TransferStatus, { bg: string; text: string }> = {
  active: { bg: "#ECFDF5", text: "#15803d" },
  draft: { bg: "#F9FAFB", text: "#6b7280" },
  done: { bg: "#EFF6FF", text: "#1d4ed8" },
  dropped: { bg: "#FEF2F2", text: "#b91c1c" },
};

const CURRENCY_LABEL: Record<TransferCurrency, string> = {
  EUR: "€ Euro", USD: "US$ Dólar", BRL: "R$ Real", GBP: "£ Libra",
};

/** Sem acento e sem caixa: "sao paulo" acha "São Paulo". */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function hoje(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function ptDate(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

interface Form {
  playerName: string;
  playerPhotoUrl: string;
  position: TransferPosition;
  nationality: string;
  age: string;
  marketValue: string;
  fromClubId: string;
  toClubId: string;
  probability: number;
  transferValue: string;
  currency: TransferCurrency;
  source: string;
  infoDate: string;
  notes: string;
  status: TransferStatus;
}

function emptyForm(): Form {
  return {
    playerName: "", playerPhotoUrl: "", position: "forward", nationality: "", age: "",
    marketValue: "", fromClubId: "", toClubId: "", probability: 70,
    transferValue: "", currency: "EUR", source: "", infoDate: hoje(), notes: "",
    status: "active",
  };
}

function formFrom(r: TransferRumor): Form {
  return {
    playerName: r.playerName,
    playerPhotoUrl: r.playerPhotoUrl ?? "",
    position: r.position,
    nationality: r.nationality ?? "",
    age: r.age ? String(r.age) : "",
    marketValue: r.marketValue ? String(r.marketValue) : "",
    fromClubId: r.fromClubId,
    toClubId: r.toClubId,
    probability: r.probability,
    transferValue: r.transferValue ? String(r.transferValue) : "",
    currency: r.currency ?? "EUR",
    source: r.source ?? "",
    infoDate: r.infoDate ?? hoje(),
    notes: r.notes ?? "",
    status: r.status,
  };
}

/** Número do formulário → número da API. Campo vazio vira `undefined` (o
 *  servidor então NÃO grava a chave), não 0 — "sem valor" e "de graça" são
 *  coisas diferentes num rumor de transferência. */
function numOrUndef(v: string): number | undefined {
  const t = v.replace(/[^\d]/g, "");
  return t === "" ? undefined : Number(t);
}

// ─── Escudo (ou monograma) ────────────────────────────────────────────────────
function Crest({ club, size = 22 }: { club?: TransferClub; size?: number }) {
  if (club?.crestUrl) {
    return <img src={club.crestUrl} alt="" width={size} height={size}
      className="object-contain shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-500 font-bold"
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.42)) }}>
      {clubMonogram(club?.name ?? "")}
    </span>
  );
}

// ─── Busca de clube com cadastro inline ───────────────────────────────────────
/**
 * O item "➕ Cadastrar «X»" no fim da lista é o que impede que todo clube fora
 * do seed vire pedido de suporte. Nome já cadastrado não cria outro registro: o
 * servidor devolve o existente (o id é o slug do nome).
 */
function ClubPicker({ label, value, clubs, onPick, onCreate, disabled }: {
  label: string;
  value: string;
  clubs: TransferClub[];
  onPick: (id: string) => void;
  onCreate: (name: string, country: string) => Promise<TransferClub | null>;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [novoPais, setNovoPais] = useState("");
  const [criando, setCriando] = useState(false);
  const escolhido = clubs.find((c) => c.id === value);

  const achados = useMemo(() => {
    const n = norm(q);
    if (!n) return clubs.slice(0, 8);
    return clubs.filter((c) => norm(c.name).includes(n)).slice(0, 8);
  }, [clubs, q]);

  const exato = achados.some((c) => norm(c.name) === norm(q));

  async function criar() {
    if (!q.trim() || criando) return;
    setCriando(true);
    try {
      const c = await onCreate(q.trim(), novoPais.trim());
      if (c) { onPick(c.id); setQ(""); setNovoPais(""); setAberto(false); }
    } finally { setCriando(false); }
  }

  return (
    <div>
      <label className={LABEL}>{label} <span className="text-red-500">*</span></label>

      {escolhido ? (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50">
          <Crest club={escolhido} size={28} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-800 truncate">{escolhido.name}</p>
            <p className="text-[11px] text-slate-400">{escolhido.country || "País não informado"}</p>
          </div>
          {!disabled && (
            <button type="button" onClick={() => { onPick(""); setAberto(true); }}
              className="text-slate-400 hover:text-slate-600" aria-label="Trocar clube">
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              disabled={disabled}
              onChange={(e) => { setQ(e.target.value); setAberto(true); }}
              onFocus={() => setAberto(true)}
              placeholder="Buscar clube..."
              className={`${INPUT} pl-8`}
            />
          </div>

          {aberto && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              {achados.map((c) => (
                <button key={c.id} type="button"
                  onClick={() => { onPick(c.id); setQ(""); setAberto(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left">
                  <Crest club={c} />
                  <span className="text-[13px] text-slate-700 flex-1 truncate">{c.name}</span>
                  <span className="text-[11px] text-slate-400">{c.country}</span>
                </button>
              ))}

              {q.trim() && !exato && (
                <div className="border-t border-slate-100 p-2.5 bg-slate-50/60">
                  <p className="text-[11px] text-slate-500 mb-1.5">
                    Nenhum clube com esse nome. Cadastrar <strong>«{q.trim()}»</strong>?
                  </p>
                  <div className="flex gap-2">
                    <input value={novoPais} onChange={(e) => setNovoPais(e.target.value)}
                      placeholder="País (opcional)" className={`${INPUT} flex-1`} />
                    <button type="button" onClick={() => void criar()} disabled={criando}
                      className="px-3 py-2 rounded-xl bg-[#0B2A66] text-white text-[12px] font-semibold whitespace-nowrap disabled:opacity-50">
                      <Plus size={12} className="inline mr-1" />
                      {criando ? "Salvando..." : "Cadastrar"}
                    </button>
                  </div>
                </div>
              )}

              {achados.length === 0 && !q.trim() && (
                <p className="px-3 py-3 text-[12px] text-slate-400">
                  Catálogo vazio. Rode <code>deploy/transferencias/clubes_seed.sql</code> ou digite um nome para cadastrar.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Módulo ───────────────────────────────────────────────────────────────────
export default function TransfersManager() {
  const { can } = useCan();
  const canManage = can("transfers.manage");

  const [aba, setAba] = useState<"rumores" | "clubes">("rumores");
  const [rumors, setRumors] = useState<TransferRumor[]>([]);
  const [clubs, setClubs] = useState<TransferClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [modo, setModo] = useState<"lista" | "form">("lista");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | TransferStatus>("todos");

  /* Upload é permissão SEPARADA (`upload.images`): um editor com
     `transfers.manage` e sem ela toma 403 ao subir a foto. Em vez de "erro",
     o formulário troca o botão por um campo de URL. */
  const [uploadBloqueado, setUploadBloqueado] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const crestRef = useRef<HTMLInputElement>(null);
  const [crestAlvo, setCrestAlvo] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const d = await adminApi.getTransfers();
      setRumors(d.rumors);
      setClubs(d.clubs);
      setErro("");
    } catch (e) { setErro((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void carregar(); }, []);

  const clubById = useMemo(() => {
    const m = new Map<string, TransferClub>();
    for (const c of clubs) m.set(c.id, c);
    return m;
  }, [clubs]);

  const lista = useMemo(() => {
    const l = filtro === "todos" ? rumors : rumors.filter((r) => r.status === filtro);
    /* Mesma ordem do site: data da informação, mais recente primeiro. O painel
       mentiria sobre a home se ordenasse de outro jeito. */
    return [...l].sort((a, b) => {
      const ka = a.infoDate ?? a.updatedAt.slice(0, 10);
      const kb = b.infoDate ?? b.updatedAt.slice(0, 10);
      if (ka !== kb) return ka < kb ? 1 : -1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
  }, [rumors, filtro]);

  const ativos = rumors.filter((r) => r.status === "active").length;

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function subirFoto(file: File) {
    if (file.size > 5 * 1024 * 1024) { setErro("Arquivo maior que 5MB."); return; }
    try {
      const r = await adminApi.uploadImage(file, form.playerName || "jogador");
      set("playerPhotoUrl", r.url);
      setErro("");
    } catch (e) {
      if ((e as { status?: number }).status === 403) {
        setUploadBloqueado(true);
        setErro("O administrador não liberou upload de imagens para o seu perfil. Cole a URL da foto no campo ao lado.");
      } else {
        setErro((e as Error).message);
      }
    }
  }

  async function subirEscudo(file: File, clubId: string) {
    if (file.size > 2 * 1024 * 1024) { setErro("Arquivo maior que 2MB."); return; }
    try {
      const up = await adminApi.uploadImage(file, `escudo-${clubId}`);
      const r = await adminApi.updateTransferClub(clubId, { crestUrl: up.url });
      setClubs((prev) => prev.map((c) => c.id === clubId ? r.club : c));
      invalidateSiteCache();
      setErro("");
    } catch (e) {
      if ((e as { status?: number }).status === 403) setUploadBloqueado(true);
      setErro((e as Error).message);
    }
  }

  async function criarClube(name: string, country: string): Promise<TransferClub | null> {
    try {
      const r = await adminApi.createTransferClub({ name, country: country || undefined });
      setClubs((prev) => prev.some((c) => c.id === r.club.id) ? prev : [...prev, r.club]);
      return r.club;
    } catch (e) { setErro((e as Error).message); return null; }
  }

  function novo() {
    setEditingId(null);
    setForm(emptyForm());
    setModo("form");
    setErro("");
  }

  function editar(r: TransferRumor) {
    setEditingId(r.id);
    setForm(formFrom(r));
    setModo("form");
    setErro("");
  }

  async function excluir(r: TransferRumor) {
    if (!canManage) return;
    if (!confirm(`Excluir o rumor de ${r.playerName}?`)) return;
    try {
      await adminApi.deleteTransfer(r.id);
      setRumors((prev) => prev.filter((x) => x.id !== r.id));
      invalidateSiteCache();
    } catch (e) { setErro((e as Error).message); }
  }

  async function excluirClube(c: TransferClub) {
    if (!canManage) return;
    try {
      await adminApi.deleteTransferClub(c.id);
      setClubs((prev) => prev.filter((x) => x.id !== c.id));
      invalidateSiteCache();
    } catch (e) {
      const msg = (e as Error).message;
      /* 409: o clube está em uso. A contagem vem na mensagem — o operador
         decide, e os rumores NÃO são apagados junto (eles só somem do site). */
      if (/rumor/i.test(msg) && confirm(`${msg}\n\nExcluir mesmo assim? Os rumores continuam no cadastro, mas somem do site até você escolher outro clube.`)) {
        try {
          await adminApi.deleteTransferClub(c.id, true);
          setClubs((prev) => prev.filter((x) => x.id !== c.id));
          invalidateSiteCache();
        } catch (e2) { setErro((e2 as Error).message); }
      } else { setErro(msg); }
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || salvando) return;
    if (!form.playerName.trim()) { setErro("Informe o nome do jogador."); return; }
    if (!form.fromClubId || !form.toClubId) { setErro("Escolha os clubes de origem e destino."); return; }
    if (form.fromClubId === form.toClubId) { setErro("O clube de destino precisa ser diferente do de origem."); return; }

    const payload: Partial<TransferRumor> = {
      playerName: form.playerName.trim(),
      playerPhotoUrl: form.playerPhotoUrl.trim() || undefined,
      position: form.position,
      nationality: form.nationality.trim() || undefined,
      age: numOrUndef(form.age),
      marketValue: numOrUndef(form.marketValue),
      fromClubId: form.fromClubId,
      toClubId: form.toClubId,
      probability: form.probability,
      transferValue: numOrUndef(form.transferValue),
      currency: form.currency,
      source: form.source.trim() || undefined,
      infoDate: form.infoDate || undefined,
      notes: form.notes.trim() || undefined,
      status: form.status,
    };

    setSalvando(true);
    try {
      if (editingId) {
        const r = await adminApi.updateTransfer(editingId, payload);
        setRumors((prev) => prev.map((x) => x.id === editingId ? r.rumor : x));
      } else {
        const r = await adminApi.createTransfer(payload);
        setRumors((prev) => [...prev, r.rumor]);
      }
      invalidateSiteCache();
      setModo("lista");
      setErro("");
    } catch (e2) { setErro((e2 as Error).message); }
    finally { setSalvando(false); }
  }

  // ── Formulário ─────────────────────────────────────────────────────────────
  if (modo === "form") {
    return (
      <AdminLayout title="Transferências">
        <div className="max-w-[900px] mx-auto space-y-4">
          {/* Trilha */}
          <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
            <button type="button" onClick={() => setModo("lista")} className="hover:text-slate-600">Transferências</button>
            <ChevronRight size={12} />
            <span className="text-slate-700 font-semibold">{editingId ? "Editar" : "Cadastro manual"}</span>
          </div>

          <h1 className="text-[20px] font-bold text-slate-800">
            {editingId ? "Editar possível transferência" : "Cadastro manual de possível transferência"}
          </h1>

          {erro && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[12px] text-amber-800">
              {erro}
            </div>
          )}

          <form onSubmit={(e) => void salvar(e)} className="space-y-4">
            {/* ── Dados do jogador ── */}
            <div className={CARD}>
              <h2 className="text-[14px] font-bold text-slate-800 mb-4">Dados do jogador</h2>

              <div className="flex flex-col sm:flex-row gap-5">
                <div className="sm:w-[160px] shrink-0">
                  <label className={LABEL}>Foto</label>
                  {form.playerPhotoUrl ? (
                    <div className="relative">
                      <img src={form.playerPhotoUrl} alt="" className="w-full aspect-square object-cover rounded-xl border border-slate-200" />
                      <button type="button" onClick={() => set("playerPhotoUrl", "")}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500">
                        <X size={12} />
                      </button>
                    </div>
                  ) : uploadBloqueado ? (
                    <input value={form.playerPhotoUrl} onChange={(e) => set("playerPhotoUrl", e.target.value)}
                      placeholder="https://... (URL da imagem)" className={INPUT} />
                  ) : (
                    <button type="button" onClick={() => fotoRef.current?.click()} disabled={!canManage}
                      className="w-full aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:border-slate-300 disabled:opacity-50">
                      <Upload size={18} />
                      <span className="text-[11px]">Enviar foto</span>
                      <span className="text-[9px]">JPG, PNG ou WEBP · máx 5MB</span>
                    </button>
                  )}
                  <input ref={fotoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirFoto(f); e.target.value = ""; }} />
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={LABEL}>Nome do jogador <span className="text-red-500">*</span></label>
                    <input value={form.playerName} onChange={(e) => set("playerName", e.target.value)}
                      className={INPUT} placeholder="Ex: Rodrygo" required />
                  </div>
                  <div>
                    <label className={LABEL}>Posição <span className="text-red-500">*</span></label>
                    <select value={form.position} onChange={(e) => set("position", e.target.value as TransferPosition)} className={INPUT}>
                      {TRANSFER_POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Nacionalidade</label>
                    <input value={form.nationality} onChange={(e) => set("nationality", e.target.value)}
                      className={INPUT} placeholder="Ex: Brasil" />
                  </div>
                  <div>
                    <label className={LABEL}>Idade</label>
                    <input value={form.age} onChange={(e) => set("age", e.target.value.replace(/[^\d]/g, ""))}
                      className={INPUT} placeholder="Ex: 23" inputMode="numeric" />
                  </div>
                  <div>
                    <label className={LABEL}>Valor de mercado estimado</label>
                    <input value={form.marketValue} onChange={(e) => set("marketValue", e.target.value.replace(/[^\d]/g, ""))}
                      className={INPUT} placeholder="Ex: 90000000" inputMode="numeric" />
                    {form.marketValue && (
                      <p className="text-[10px] text-slate-400 mt-1">{formatMoney(Number(form.marketValue), form.currency)}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Times envolvidos ── */}
            <div className={CARD}>
              <h2 className="text-[14px] font-bold text-slate-800 mb-4">Times envolvidos</h2>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                <ClubPicker label="Clube de origem" value={form.fromClubId} clubs={clubs}
                  onPick={(id) => set("fromClubId", id)} onCreate={criarClube} disabled={!canManage} />
                <div className="hidden md:flex items-center justify-center pb-3 text-slate-300">
                  <ArrowRight size={18} />
                </div>
                <ClubPicker label="Clube de destino" value={form.toClubId} clubs={clubs}
                  onPick={(id) => set("toClubId", id)} onCreate={criarClube} disabled={!canManage} />
              </div>
            </div>

            {/* ── Informações da transferência ── */}
            <div className={CARD}>
              <h2 className="text-[14px] font-bold text-slate-800 mb-4">Informações da transferência</h2>

              <div className="mb-4">
                <label className={LABEL}>Probabilidade <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-3">
                  <input type="range" min={0} max={100} step={1} value={form.probability}
                    onChange={(e) => set("probability", Number(e.target.value))}
                    className="flex-1 accent-[#0B2A66]" />
                  <div className="flex items-center gap-1 shrink-0">
                    <input type="number" min={0} max={100} value={form.probability}
                      onChange={(e) => set("probability", Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-16 px-2 py-1.5 text-[13px] text-center rounded-lg border border-slate-200 tabular-nums" />
                    <span className="text-[13px] text-slate-500">%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Valor estimado da transferência</label>
                  <div className="flex gap-2">
                    <select value={form.currency} onChange={(e) => set("currency", e.target.value as TransferCurrency)}
                      className="px-2 py-2 text-[13px] rounded-xl border border-slate-200 bg-white shrink-0">
                      {TRANSFER_CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
                    </select>
                    <input value={form.transferValue} onChange={(e) => set("transferValue", e.target.value.replace(/[^\d]/g, ""))}
                      className={INPUT} placeholder="Ex: 80000000" inputMode="numeric" />
                  </div>
                  {form.transferValue && (
                    <p className="text-[10px] text-slate-400 mt-1">{formatMoney(Number(form.transferValue), form.currency)}</p>
                  )}
                </div>
                <div>
                  <label className={LABEL}>Fonte da informação</label>
                  <input value={form.source} onChange={(e) => set("source", e.target.value)}
                    className={INPUT} placeholder="Ex: Jornal Marca" />
                </div>
                <div>
                  <label className={LABEL}>Data da informação</label>
                  <input type="date" value={form.infoDate} onChange={(e) => set("infoDate", e.target.value)} className={INPUT} />
                  <p className="text-[10px] text-slate-400 mt-1">
                    É por esta data que o bloco da home ordena — a mais recente aparece no topo.
                  </p>
                </div>
                <div>
                  <label className={LABEL}>Observações</label>
                  <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
                    rows={2} className={INPUT} placeholder="Anotação interna da redação" />
                  <p className="text-[10px] text-slate-400 mt-1">Uso interno — não aparece no site.</p>
                </div>
              </div>
            </div>

            {/* ── Status ── */}
            <div className={CARD}>
              <h2 className="text-[14px] font-bold text-slate-800 mb-4">Status</h2>
              <div className="max-w-[280px]">
                <select value={form.status} onChange={(e) => set("status", e.target.value as TransferStatus)} className={INPUT}>
                  {(Object.keys(STATUS_LABEL) as TransferStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Só as transferências <strong>Ativas</strong> aparecem no site.
                </p>
              </div>
            </div>

            {/* ── Ações ── */}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={!canManage || salvando}
                className="px-5 py-2.5 rounded-xl bg-[#0B2A66] text-white text-[13px] font-semibold disabled:opacity-50">
                {salvando ? "Salvando..." : "Salvar transferência"}
              </button>
              <button type="button" onClick={() => { setModo("lista"); setErro(""); }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[13px] font-semibold">
                Cancelar
              </button>
            </div>
          </form>

          {/* ── Dicas ── */}
          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-blue-900 mb-1.5">
              <Info size={13} /> Dicas
            </p>
            <ul className="text-[11px] text-blue-900/80 space-y-1 list-disc pl-4">
              <li>A probabilidade é a leitura da redação — use a fonte para justificar o número.</li>
              <li>O bloco da home mostra os rumores mais recentes primeiro, pela data da informação.</li>
              <li>Clube sem escudo aparece com as iniciais. Suba o escudo na aba <strong>Clubes</strong>.</li>
              <li>Rumor que não se confirmou vira <strong>Descartada</strong> — sai do site sem perder o histórico.</li>
            </ul>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Transferências">
      <div className="max-w-[1100px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-slate-800">Possíveis transferências</h1>
            <p className="text-[12px] text-slate-400">
              {rumors.length} cadastrada(s) · {ativos} ativa(s) no site · {clubs.length} clube(s) no catálogo
            </p>
          </div>
          {canManage && aba === "rumores" && (
            <button type="button" onClick={novo}
              className="px-4 py-2.5 rounded-xl bg-[#0B2A66] text-white text-[13px] font-semibold flex items-center gap-1.5">
              <Plus size={14} /> Cadastro manual
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          {(["rumores", "clubes"] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAba(a)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border ${
                aba === a ? "bg-[#0B2A66] text-white border-[#0B2A66]" : "bg-white text-slate-500 border-slate-200"
              }`}>
              {a === "rumores" ? "Rumores" : "Clubes"}
            </button>
          ))}
        </div>

        {erro && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[12px] text-amber-800">{erro}</div>
        )}

        {loading ? (
          <div className="py-20 text-center text-slate-400 text-[13px]">Carregando...</div>
        ) : aba === "rumores" ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {(["todos", "active", "draft", "done", "dropped"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFiltro(f)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${
                    filtro === f ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"
                  }`}>
                  {f === "todos" ? "Todos" : STATUS_LABEL[f]}
                </button>
              ))}
            </div>

            {lista.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
                <ArrowLeftRight size={22} className="mx-auto text-slate-300 mb-2" />
                <p className="text-[13px] text-slate-500 font-semibold">Nenhuma transferência cadastrada</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Cadastre a primeira e adicione o bloco "Transferências" na home.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {lista.map((r) => {
                  const de = clubById.get(r.fromClubId);
                  const para = clubById.get(r.toClubId);
                  const orfao = !de || !para;
                  const cor = STATUS_COLOR[r.status];
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                      {r.playerPhotoUrl ? (
                        <img src={r.playerPhotoUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-slate-100" />
                      ) : (
                        <span className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">
                          {clubMonogram(r.playerName)}
                        </span>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 truncate">{r.playerName}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
                          <Crest club={de} size={16} />
                          <span className="truncate">{de?.name ?? "clube removido"}</span>
                          <ArrowRight size={11} className="text-slate-300 shrink-0" />
                          <Crest club={para} size={16} />
                          <span className="truncate">{para?.name ?? "clube removido"}</span>
                        </div>
                      </div>

                      {orfao && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                          fora do site
                        </span>
                      )}

                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0 hidden sm:block">{ptDate(r.infoDate)}</span>
                      <span className="text-[13px] font-bold text-slate-700 tabular-nums shrink-0 w-11 text-right">{r.probability}%</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: cor.bg, color: cor.text }}>
                        {STATUS_LABEL[r.status]}
                      </span>

                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => editar(r)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label="Editar">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => void excluir(r)} className="p-1.5 text-slate-400 hover:text-red-600" aria-label="Excluir">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-[11px] text-slate-500">
              O catálogo chega pelo SQL <code>deploy/transferencias/clubes_seed.sql</code>, com nome e país.
              <strong> Escudo é marca de terceiro e não vem no seed</strong> — suba só os dos clubes que você
              realmente usar. Sem escudo, o site desenha as iniciais.
            </div>

            {clubs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
                <Shield size={22} className="mx-auto text-slate-300 mb-2" />
                <p className="text-[13px] text-slate-500 font-semibold">Catálogo vazio</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Rode o seed, ou cadastre clubes direto no formulário de transferência.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {[...clubs].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0">
                    <Crest club={c} size={26} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{c.name}</p>
                      <p className="text-[11px] text-slate-400">{c.country || "País não informado"}</p>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0 hidden sm:block">
                      {rumors.filter((r) => r.fromClubId === c.id || r.toClubId === c.id).length} rumor(es)
                    </span>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => { setCrestAlvo(c.id); crestRef.current?.click(); }}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600">
                          {c.crestUrl ? "Trocar escudo" : "Enviar escudo"}
                        </button>
                        <button type="button" onClick={() => void excluirClube(c)}
                          className="p-1.5 text-slate-400 hover:text-red-600" aria-label="Excluir clube">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <input ref={crestRef} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && crestAlvo) void subirEscudo(f, crestAlvo);
                e.target.value = "";
                setCrestAlvo(null);
              }} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
