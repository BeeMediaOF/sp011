import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rssParser, sourceFetchLimit, pickFreshItems, cleanFeedTitle, DEFAULT_FETCH_LIMIT } from "../src/rss.ts";
import { extractRssImage } from "../src/scrape.ts";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Portal Teste</title>
    <item>
      <title>Primeira notícia do feed</title>
      <link>https://portal.example/noticia-1</link>
      <guid isPermaLink="false">guid-123</guid>
      <pubDate>Fri, 04 Jul 2026 10:00:00 -0300</pubDate>
      <description>&lt;p&gt;Resumo da notícia&lt;/p&gt;</description>
      <media:content url="https://portal.example/img.jpg" medium="image"/>
    </item>
  </channel>
</rss>`;

describe("rssParser", () => {
  it("parseia guid, link e media:content", async () => {
    const feed = await rssParser.parseString(FIXTURE);
    assert.equal(feed.items.length, 1);
    const item = feed.items[0]!;
    assert.equal(item.title, "Primeira notícia do feed");
    assert.equal(item.guid, "guid-123");
    assert.equal(item.link, "https://portal.example/noticia-1");
    assert.equal(extractRssImage(item), "https://portal.example/img.jpg");
  });
});

describe("sourceFetchLimit", () => {
  const base = { id: "s1", name: "F", url: "https://x", category: "geral" };

  it("fonte > default do chamador > padrão", () => {
    assert.equal(sourceFetchLimit({ ...base, fetchLimit: 7 }, 5), 7);
    assert.equal(sourceFetchLimit(base, 5), 5);
    assert.equal(sourceFetchLimit(base), DEFAULT_FETCH_LIMIT);
  });

  it("aplica piso 1 e teto 20", () => {
    assert.equal(sourceFetchLimit({ ...base, fetchLimit: 0 }), DEFAULT_FETCH_LIMIT);
    assert.equal(sourceFetchLimit({ ...base, fetchLimit: -2 }), 1);
    assert.equal(sourceFetchLimit({ ...base, fetchLimit: 99 }), 20);
  });
});

describe("pickFreshItems", () => {
  const items = ["a", "b", "c", "d", "e"];
  const probe = (url: string) => ({ url });

  it("sem isKnown mantém o corte clássico slice(0, limit)", async () => {
    assert.deepEqual(await pickFreshItems(items, 2, probe), ["a", "b"]);
  });

  it("pula itens conhecidos e completa com os próximos novos", async () => {
    const known = new Set(["a", "b"]);
    const picked = await pickFreshItems(items, 2, probe, {
      isKnown: async (p) => known.has(p.url ?? ""),
      scanLimit: 10,
    });
    assert.deepEqual(picked, ["c", "d"]);
  });

  it("scanLimit limita a profundidade da varredura", async () => {
    const known = new Set(["a", "b", "c"]);
    const picked = await pickFreshItems(items, 2, probe, {
      isKnown: async (p) => known.has(p.url ?? ""),
      scanLimit: 3, // só examina a, b, c — todos conhecidos
    });
    assert.deepEqual(picked, []);
  });

  it("scanLimit nunca fica abaixo do limit", async () => {
    const picked = await pickFreshItems(items, 3, probe, {
      isKnown: async () => false,
      scanLimit: 1,
    });
    assert.deepEqual(picked, ["a", "b", "c"]);
  });

  it("item sem título, guid nem url não consome slot nem scrape", async () => {
    const picked = await pickFreshItems(
      ["", "x", "y"],
      2,
      (s) => ({ url: s || undefined }),
      { isKnown: async () => false, scanLimit: 10 },
    );
    assert.deepEqual(picked, ["x", "y"]);
  });
});

describe("cleanFeedTitle", () => {
  it("remove sufixo de @handle com separador", () => {
    assert.equal(
      cleanFeedTitle("Semi-finals set for World Cup glory but who will claim it - @BBCSportTopStories"),
      "Semi-finals set for World Cup glory but who will claim it",
    );
    assert.equal(cleanFeedTitle("Título | @portal.oficial"), "Título");
    assert.equal(cleanFeedTitle("Título @handle"), "Título");
  });

  it("preserva títulos legítimos com hífen, e-mail-like e @ no meio", () => {
    assert.equal(cleanFeedTitle("Flamengo vence - e assume a liderança"), "Flamengo vence - e assume a liderança");
    assert.equal(cleanFeedTitle("O que muda com o novo @ do Instagram na bio"), "O que muda com o novo @ do Instagram na bio");
    assert.equal(cleanFeedTitle("  Espaços   duplos  "), "Espaços duplos");
  });
});
