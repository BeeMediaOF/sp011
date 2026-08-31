/**
 * Testes do módulo de Transferências (rumores) — validação, ordenação e tetos.
 *
 * O foco é o que NÃO pode acontecer: rumor com clube apagado ir ao ar quebrado,
 * probabilidade fora de 0–100 sair do painel, clube duplicado por diferença de
 * caixa/acento, e — o mais sutil — a ordenação DIVERGIR entre duas chamadas
 * (SSR e cliente pintam a mesma lista; ordem instável quebra a hidratação).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRumor, normalizeClub, applyClubPatch, publicRumors, rumorsUsingClub,
  clubSlug, MAX_CLUBS, PUBLIC_LIMIT,
  type TransferClub, type TransferRumor,
} from "../src/lib/transfers.ts";

const NOW = new Date("2026-08-31T12:00:00.000Z");

const CLUBS: TransferClub[] = [
  { id: "real-madrid", name: "Real Madrid", country: "Espanha", createdAt: NOW.toISOString() },
  { id: "manchester-city", name: "Manchester City", country: "Inglaterra", createdAt: NOW.toISOString() },
  { id: "flamengo", name: "Flamengo", country: "Brasil", createdAt: NOW.toISOString() },
];

function rumor(over: Partial<TransferRumor> = {}): TransferRumor {
  return {
    id: over.id ?? "r1",
    playerName: "Rodrygo",
    position: "winger",
    fromClubId: "real-madrid",
    toClubId: "manchester-city",
    probability: 70,
    status: "active",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

// ─── normalizeRumor ───────────────────────────────────────────────────────────

test("recorta probabilidade e idade em vez de aceitar lixo do formulario", () => {
  const a = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b", probability: 180, age: 9 }, undefined, NOW);
  assert.equal(a.ok, true);
  assert.equal(a.rumor?.probability, 100);
  assert.equal(a.rumor?.age, 14);
  const b = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b", probability: -5, age: 200 }, undefined, NOW);
  assert.equal(b.rumor?.probability, 0);
  assert.equal(b.rumor?.age, 60);
  // probabilidade ausente cai no meio do caminho, nunca em 0 (que seria "não vai acontecer")
  const c = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b" }, undefined, NOW);
  assert.equal(c.rumor?.probability, 50);
});

test("os campos obrigatorios recusam com mensagem, sem gravar meia entrada", () => {
  assert.equal(normalizeRumor({ position: "forward", fromClubId: "a", toClubId: "b" }, undefined, NOW).ok, false);
  assert.equal(normalizeRumor({ playerName: "X", position: "atacante", fromClubId: "a", toClubId: "b" }, undefined, NOW).ok, false);
  assert.equal(normalizeRumor({ playerName: "X", position: "forward", toClubId: "b" }, undefined, NOW).ok, false);
  assert.equal(normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a" }, undefined, NOW).ok, false);
  // origem igual ao destino não é transferência
  const mesmo = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "a" }, undefined, NOW);
  assert.equal(mesmo.ok, false);
});

test("infoDate nasce com hoje — e uma edicao NAO o traz de volta ao topo", () => {
  const novo = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b" }, undefined, NOW);
  assert.equal(novo.rumor?.infoDate, "2026-08-31");

  /* Corrigir um erro de digitação num rumor de 3 meses atrás não pode
     republicá-lo no alto da home: o critério é a data da INFORMAÇÃO. */
  const antigo = rumor({ infoDate: "2026-05-25" });
  const depois = new Date("2026-08-31T18:00:00.000Z");
  const editado = normalizeRumor({ playerName: "Rodrygo Goes", position: "winger", fromClubId: "real-madrid", toClubId: "manchester-city" }, antigo, depois);
  assert.equal(editado.rumor?.infoDate, "2026-05-25");
  assert.equal(editado.rumor?.id, "r1");
  assert.equal(editado.rumor?.createdAt, NOW.toISOString());
  assert.equal(editado.rumor?.updatedAt, depois.toISOString());
});

test("infoDate aceita ISO com hora e recusa data impossivel", () => {
  const comHora = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b", infoDate: "2026-05-25T23:30:00Z" }, undefined, NOW);
  assert.equal(comHora.rumor?.infoDate, "2026-05-25");
  const ruim = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b", infoDate: "25/05/2026" }, undefined, NOW);
  assert.equal(ruim.rumor?.infoDate, "2026-08-31"); // cai no default de hoje
  const mes13 = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b", infoDate: "2026-13-01" }, undefined, NOW);
  assert.equal(mes13.rumor?.infoDate, "2026-08-31");
});

test("moeda invalida e descartada em vez de chegar ao formatador", () => {
  const r = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b", currency: "BTC", transferValue: "80000000" }, undefined, NOW);
  assert.equal(r.rumor?.currency, undefined);
  assert.equal(r.rumor?.transferValue, 80_000_000); // string numérica do <input> é aceita
});

test("status desconhecido vira active — nunca some do painel em silencio", () => {
  const r = normalizeRumor({ playerName: "X", position: "forward", fromClubId: "a", toClubId: "b", status: "arquivado" }, undefined, NOW);
  assert.equal(r.rumor?.status, "active");
});

// ─── Clubes ───────────────────────────────────────────────────────────────────

test("clubSlug e deterministico com acento, ponto e apostrofo", () => {
  assert.equal(clubSlug("Real Madrid"), "real-madrid");
  assert.equal(clubSlug("Atlético-MG"), "atletico-mg");
  assert.equal(clubSlug("F.C. Porto"), "fc-porto");
  assert.equal(clubSlug("  São Paulo  "), "sao-paulo");
  assert.equal(clubSlug("Bayern de Munique"), "bayern-de-munique");
  // é o mesmo clube, escrito de dois jeitos
  assert.equal(clubSlug("REAL MADRID"), clubSlug("real madrid"));
});

test("nome duplicado devolve o cadastro existente, nao um segundo clube", () => {
  const r = normalizeClub({ name: "real  madrid", country: "Espanha" }, CLUBS, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.existing, true);
  assert.equal(r.club?.id, "real-madrid");
  assert.equal(r.club?.name, "Real Madrid"); // preserva o nome já cadastrado
});

test("clube novo nasce com slug do nome e sem escudo", () => {
  const r = normalizeClub({ name: "Vasco da Gama", country: "Brasil" }, CLUBS, NOW);
  assert.equal(r.existing, undefined);
  assert.equal(r.club?.id, "vasco-da-gama");
  assert.equal(r.club?.crestUrl, undefined);
  assert.equal(normalizeClub({ name: "   " }, CLUBS, NOW).ok, false);
  assert.equal(normalizeClub({ name: "///" }, CLUBS, NOW).ok, false);
});

test("teto de clubes recusa o proximo — o blob de settings e reescrito inteiro", () => {
  const cheio: TransferClub[] = Array.from({ length: MAX_CLUBS }, (_, i) => ({
    id: `clube-${i}`, name: `Clube ${i}`, createdAt: NOW.toISOString(),
  }));
  const r = normalizeClub({ name: "Mais Um" }, cheio, NOW);
  assert.equal(r.ok, false);
  // ...mas um nome JÁ cadastrado continua resolvendo, mesmo no teto
  assert.equal(normalizeClub({ name: "Clube 3" }, [...cheio, CLUBS[0]!], NOW).ok, true);
});

test("editar clube nunca muda o id — os rumores guardam essa chave", () => {
  const out = applyClubPatch(CLUBS[0]!, { name: "Real Madrid CF", country: "", crestUrl: "/api/uploads/rm.png" });
  assert.equal(out.id, "real-madrid");
  assert.equal(out.name, "Real Madrid CF");
  assert.equal(out.country, undefined); // string vazia APAGA o campo
  assert.equal(out.crestUrl, "/api/uploads/rm.png");
  // campo ausente no patch não é tocado
  assert.equal(applyClubPatch(CLUBS[0]!, { name: "X" }).country, "Espanha");
});

test("rumorsUsingClub conta origem e destino", () => {
  const rs = [rumor({ id: "a" }), rumor({ id: "b", fromClubId: "flamengo", toClubId: "real-madrid" })];
  assert.equal(rumorsUsingClub(rs, "real-madrid"), 2);
  assert.equal(rumorsUsingClub(rs, "flamengo"), 1);
  assert.equal(rumorsUsingClub(rs, "santos"), 0);
});

// ─── publicRumors ─────────────────────────────────────────────────────────────

test("so os ativos vao ao ar", () => {
  const rs = [
    rumor({ id: "a", status: "active" }),
    rumor({ id: "b", status: "draft" }),
    rumor({ id: "c", status: "done" }),
    rumor({ id: "d", status: "dropped" }),
  ];
  assert.deepEqual(publicRumors(rs, CLUBS).map((r) => r.id), ["a"]);
});

test("clube apagado descarta O RUMOR, sem derrubar a lista", () => {
  const rs = [
    rumor({ id: "a" }),
    rumor({ id: "b", toClubId: "clube-que-nao-existe" }),
    rumor({ id: "c", fromClubId: "clube-que-nao-existe" }),
  ];
  const out = publicRumors(rs, CLUBS);
  assert.deepEqual(out.map((r) => r.id), ["a"]);
  assert.equal(out[0]?.from.name, "Real Madrid");
  assert.equal(out[0]?.to.country, "Inglaterra");
});

test("ordena por data da informacao (desc), NAO por probabilidade", () => {
  const rs = [
    rumor({ id: "velho", infoDate: "2026-01-10", probability: 99 }),
    rumor({ id: "novo", infoDate: "2026-08-30", probability: 10 }),
    rumor({ id: "meio", infoDate: "2026-05-25", probability: 55 }),
  ];
  assert.deepEqual(publicRumors(rs, CLUBS).map((r) => r.id), ["novo", "meio", "velho"]);
});

test("rumor sem infoDate cai no updatedAt — nunca no fim da fila em silencio", () => {
  const rs = [
    rumor({ id: "com-data", infoDate: "2026-01-10" }),
    rumor({ id: "sem-data", updatedAt: "2026-08-30T10:00:00.000Z" }),
  ];
  const semInfo = { ...rs[1]! };
  delete semInfo.infoDate;
  assert.deepEqual(publicRumors([rs[0]!, semInfo], CLUBS).map((r) => r.id), ["sem-data", "com-data"]);
});

test("empate de data desempata por updatedAt e depois por id — ordem estavel", () => {
  const rs = [
    rumor({ id: "b2", infoDate: "2026-05-25", updatedAt: "2026-05-25T10:00:00.000Z" }),
    rumor({ id: "a1", infoDate: "2026-05-25", updatedAt: "2026-05-25T10:00:00.000Z" }),
    rumor({ id: "c3", infoDate: "2026-05-25", updatedAt: "2026-05-26T10:00:00.000Z" }),
  ];
  const ordem = publicRumors(rs, CLUBS).map((r) => r.id);
  assert.deepEqual(ordem, ["c3", "a1", "b2"]);
  // duas execuções com a MESMA entrada produzem a MESMA ordem (SSR = cliente)
  assert.deepEqual(publicRumors([...rs].reverse(), CLUBS).map((r) => r.id), ordem);
});

test("o payload publico nao carrega campo interno", () => {
  const rs = [rumor({ notes: "falar com o empresario", infoDate: "2026-05-25", source: "Marca" })];
  const out = publicRumors(rs, CLUBS)[0]!;
  assert.equal("notes" in out, false);
  assert.equal("status" in out, false);
  assert.equal("createdAt" in out, false);
  assert.equal("fromClubId" in out, false);
  assert.equal(out.source, "Marca"); // a fonte é jornalismo, essa aparece
});

test("teto do payload publico", () => {
  const rs = Array.from({ length: PUBLIC_LIMIT + 12 }, (_, i) =>
    rumor({ id: `r${String(i).padStart(3, "0")}`, infoDate: "2026-05-25" }));
  assert.equal(publicRumors(rs, CLUBS).length, PUBLIC_LIMIT);
  assert.equal(publicRumors(rs, CLUBS, 5).length, 5);
  assert.equal(publicRumors(rs, CLUBS, 0).length, rs.length); // 0 = sem corte
});

test("blog sem rumor nenhum devolve lista vazia (custo zero nos outros dez)", () => {
  assert.deepEqual(publicRumors([], []), []);
  assert.deepEqual(publicRumors([rumor()], []), []);
});
