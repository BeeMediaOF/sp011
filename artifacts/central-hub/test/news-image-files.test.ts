import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  newImageFileName,
  isValidImageFileName,
  IMAGE_EXT_BY_MIME,
} from "../src/lib/newsImageFiles.ts";

describe("newImageFileName / isValidImageFileName", () => {
  it("nomes gerados sempre validam (todos os MIME aceitos)", () => {
    for (const mime of Object.keys(IMAGE_EXT_BY_MIME)) {
      const name = newImageFileName(mime);
      assert.ok(name, mime);
      assert.equal(isValidImageFileName(name!), true, name!);
    }
  });

  it("MIME desconhecido → null (upload recusado antes de gravar)", () => {
    assert.equal(newImageFileName("image/svg+xml"), null); // SVG = vetor de XSS
    assert.equal(newImageFileName("application/pdf"), null);
    assert.equal(newImageFileName(""), null);
  });

  it("dois nomes gerados nunca colidem (sufixo aleatório)", () => {
    assert.notEqual(newImageFileName("image/jpeg"), newImageFileName("image/jpeg"));
  });

  it("rejeita traversal e formatos fora do padrão", () => {
    assert.equal(isValidImageFileName("../etc/passwd"), false);
    assert.equal(isValidImageFileName("..%2f..%2fsecret.jpg"), false);
    assert.equal(isValidImageFileName("capa.jpg"), false);
    assert.equal(isValidImageFileName("abcdef01-1234-1234-1234-123456789abc-deadbeef.jpg"), true);
    assert.equal(isValidImageFileName("abcdef01-1234-1234-1234-123456789abc-deadbeef.webp"), true);
    assert.equal(isValidImageFileName("abcdef01-1234-1234-1234-123456789abc-deadbeef.svg"), false);
    assert.equal(isValidImageFileName("abcdef01-1234-1234-1234-123456789abc-deadbeef.jpg.exe"), false);
    assert.equal(isValidImageFileName("ABCDEF01-1234-1234-1234-123456789ABC-DEADBEEF.JPG"), false);
    assert.equal(isValidImageFileName(""), false);
  });
});
