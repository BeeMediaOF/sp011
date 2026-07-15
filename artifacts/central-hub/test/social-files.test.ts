import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  newVideoFileName,
  isValidVideoFileName,
  statusAfterDownload,
} from "../src/lib/social/videoFiles.ts";

describe("newVideoFileName / isValidVideoFileName", () => {
  it("nomes gerados sempre validam", () => {
    for (let i = 0; i < 20; i++) {
      const name = newVideoFileName();
      assert.equal(isValidVideoFileName(name), true, name);
      assert.ok(name.endsWith(".mp4"));
    }
  });

  it("dois nomes gerados nunca colidem (sufixo aleatório)", () => {
    assert.notEqual(newVideoFileName(), newVideoFileName());
  });

  it("rejeita traversal e formatos fora do padrão", () => {
    assert.equal(isValidVideoFileName("../etc/passwd"), false);
    assert.equal(isValidVideoFileName("..%2f..%2fsecret.mp4"), false);
    assert.equal(isValidVideoFileName("video.mp4"), false);
    assert.equal(isValidVideoFileName("ABCDEF01-1234-1234-1234-123456789abc-deadbeef.mp4"), false); // maiúsculas
    assert.equal(isValidVideoFileName("abcdef01-1234-1234-1234-123456789abc-deadbeef.mp4"), true);
    assert.equal(isValidVideoFileName("abcdef01-1234-1234-1234-123456789abc-deadbeef.mp4.exe"), false);
    assert.equal(isValidVideoFileName(""), false);
  });
});

describe("statusAfterDownload", () => {
  it("com horário → scheduled; sem → ready", () => {
    assert.equal(statusAfterDownload(new Date()), "scheduled");
    assert.equal(statusAfterDownload(null), "ready");
    assert.equal(statusAfterDownload(undefined), "ready");
  });
});
