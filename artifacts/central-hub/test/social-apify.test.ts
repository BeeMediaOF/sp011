import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectPlatform,
  normalizeActorId,
  buildDownloadInput,
  pickVideoUrl,
  isTokenLimitError,
  isActorNotFoundError,
  DEFAULT_TIKTOK_ACTOR,
  DEFAULT_INSTAGRAM_ACTOR,
} from "../src/lib/social/apify.ts";

describe("detectPlatform", () => {
  it("reconhece tiktok e instagram, rejeita o resto", () => {
    assert.equal(detectPlatform("https://www.tiktok.com/@user/video/123"), "tiktok");
    assert.equal(detectPlatform("https://www.instagram.com/reel/abc/"), "instagram");
    assert.equal(detectPlatform("https://youtube.com/watch?v=1"), null);
  });
});

describe("normalizeActorId", () => {
  it("vazio/null cai no default da plataforma", () => {
    assert.equal(normalizeActorId("", "tiktok"), DEFAULT_TIKTOK_ACTOR);
    assert.equal(normalizeActorId(null, "instagram"), DEFAULT_INSTAGRAM_ACTOR);
  });

  it("aceita owner/actor e owner~actor", () => {
    assert.equal(normalizeActorId("foo/bar", "tiktok"), "foo/bar");
    assert.equal(normalizeActorId("foo~bar", "tiktok"), "foo/bar");
  });

  it("aceita URL da API com /acts/", () => {
    assert.equal(
      normalizeActorId("https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=x", "tiktok"),
      "clockworks/tiktok-scraper",
    );
  });

  it("aceita URL do console apify.com", () => {
    assert.equal(normalizeActorId("https://apify.com/apify/instagram-scraper", "instagram"), "apify/instagram-scraper");
  });

  it("remove prefixo acts/ e sufixo run-sync", () => {
    assert.equal(normalizeActorId("acts/foo~bar/run-sync-get-dataset-items?x=1", "tiktok"), "foo/bar");
  });
});

describe("buildDownloadInput", () => {
  it("tiktok pede o post com download de vídeo", () => {
    const input = buildDownloadInput("tiktok", "https://tiktok.com/v/1") as Record<string, unknown>;
    assert.deepEqual(input["postURLs"], ["https://tiktok.com/v/1"]);
    assert.equal(input["shouldDownloadVideos"], true);
  });

  it("instagram usa directUrls com details", () => {
    const input = buildDownloadInput("instagram", "https://instagram.com/reel/a") as Record<string, unknown>;
    assert.deepEqual(input["directUrls"], ["https://instagram.com/reel/a"]);
    assert.equal(input["resultsType"], "details");
  });
});

describe("pickVideoUrl", () => {
  it("tiktok: cascata de campos (videoMeta.downloadAddr)", () => {
    const out = pickVideoUrl(
      [{ videoMeta: { downloadAddr: "https://cdn/x.mp4", coverUrl: "https://cdn/c.jpg" }, text: "legenda", authorMeta: { name: "autor" } }],
      "tiktok",
    );
    assert.equal(out.videoUrl, "https://cdn/x.mp4");
    assert.equal(out.caption, "legenda");
    assert.equal(out.creator, "autor");
    assert.equal(out.thumb, "https://cdn/c.jpg");
  });

  it("tiktok: mediaUrls[0] como fallback", () => {
    assert.equal(pickVideoUrl([{ mediaUrls: ["https://cdn/m.mp4"] }], "tiktok").videoUrl, "https://cdn/m.mp4");
  });

  it("instagram: videoUrl direto e childPosts como fallback", () => {
    assert.equal(pickVideoUrl([{ videoUrl: "https://ig/v.mp4", ownerUsername: "dono" }], "instagram").videoUrl, "https://ig/v.mp4");
    assert.equal(pickVideoUrl([{ childPosts: [{ videoUrl: "https://ig/c.mp4" }] }], "instagram").videoUrl, "https://ig/c.mp4");
  });

  it("lista vazia → objeto vazio", () => {
    assert.deepEqual(pickVideoUrl([], "tiktok"), {});
  });
});

describe("isTokenLimitError / isActorNotFoundError", () => {
  it("detecta quota/limite/auth", () => {
    assert.equal(isTokenLimitError("Apify x 402: payment required"), true);
    assert.equal(isTokenLimitError("monthly-usage-hard-limit-exceeded"), true);
    assert.equal(isTokenLimitError("HTTP 429 too many"), true);
    assert.equal(isTokenLimitError("user-or-token-not-found"), true);
    assert.equal(isTokenLimitError("timeout de rede"), false);
  });

  it("actor inexistente", () => {
    assert.equal(isActorNotFoundError("Apify foo/bar 404: record-not-found"), true);
    assert.equal(isActorNotFoundError("500 internal"), false);
  });
});
