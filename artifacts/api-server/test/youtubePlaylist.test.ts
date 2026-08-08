import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePlaylistId, parsePlaylistFeed, PLAYLIST_MAX,
} from "../src/lib/youtubePlaylist.ts";

test("parsePlaylistId aceita id cru, URL de playlist e URL de vídeo na playlist", () => {
  assert.equal(parsePlaylistId("PLxAbc123_-defGHI"), "PLxAbc123_-defGHI");
  assert.equal(
    parsePlaylistId("https://www.youtube.com/playlist?list=PLxAbc123_-defGHI"),
    "PLxAbc123_-defGHI",
  );
  assert.equal(
    parsePlaylistId("https://www.youtube.com/watch?v=abc123&list=PLxAbc123_-defGHI&index=2"),
    "PLxAbc123_-defGHI",
  );
});

test("parsePlaylistId recusa lixo e URL sem list", () => {
  assert.equal(parsePlaylistId(""), null);
  assert.equal(parsePlaylistId(null), null);
  assert.equal(parsePlaylistId("https://www.youtube.com/watch?v=abc123"), null);
  assert.equal(parsePlaylistId("javascript:alert(1)"), null);
});

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>Bee Esportes TV</title>
  <entry>
    <yt:videoId>aaaaaaaaaaa</yt:videoId>
    <title>A TV aberta perdeu a Copa para a internet? FIM DA TV?</title>
    <published>2026-07-01T12:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>bbbbbbbbbbb</yt:videoId>
    <title>Messi &amp; Pel&#233;: a resposta</title>
    <published>2026-06-28T12:00:00+00:00</published>
  </entry>
  <entry>
    <title>Entrada sem videoId</title>
  </entry>
</feed>`;

test("parsePlaylistFeed lê título da playlist, ignora entrada sem videoId e monta a miniatura", () => {
  const feed = parsePlaylistFeed(FEED, "PLxAbc123_-defGHI");
  assert.equal(feed.id, "PLxAbc123_-defGHI");
  assert.equal(feed.title, "Bee Esportes TV");
  assert.equal(feed.videos.length, 2);
  assert.equal(feed.videos[0]!.id, "aaaaaaaaaaa");
  assert.equal(feed.videos[0]!.title, "A TV aberta perdeu a Copa para a internet? FIM DA TV?");
  assert.equal(feed.videos[0]!.thumb, "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg");
  assert.equal(feed.videos[0]!.publishedAt, "2026-07-01T12:00:00+00:00");
  // O título da 1ª entrada NÃO pode vazar para o da playlist (split no <entry).
  assert.notEqual(feed.title, feed.videos[0]!.title);
});

test("parsePlaylistFeed decodifica entidades XML no título do vídeo", () => {
  const feed = parsePlaylistFeed(FEED, "PL");
  assert.equal(feed.videos[1]!.title, "Messi & Pelé: a resposta");
});

test("parsePlaylistFeed corta em PLAYLIST_MAX", () => {
  const entries = Array.from({ length: PLAYLIST_MAX + 8 }, (_, i) =>
    `<entry><yt:videoId>vid${String(i).padStart(8, "0")}</yt:videoId><title>V${i}</title></entry>`,
  ).join("");
  const feed = parsePlaylistFeed(`<feed><title>X</title>${entries}</feed>`, "PL");
  assert.equal(feed.videos.length, PLAYLIST_MAX);
});

test("parsePlaylistFeed em feed vazio devolve lista vazia (bloco não renderiza)", () => {
  const feed = parsePlaylistFeed("<feed><title>Vazio</title></feed>", "PL");
  assert.deepEqual(feed.videos, []);
});
