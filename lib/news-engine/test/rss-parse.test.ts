import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rssParser, sourceFetchLimit, DEFAULT_FETCH_LIMIT } from "../src/rss.ts";
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
