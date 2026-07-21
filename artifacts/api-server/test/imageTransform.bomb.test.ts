import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "../src/lib/imageTransform.ts";

/** PRD-11 — anti-bomba de decompressão: o limitInputPixels do sharp está em vigor. */

test("MAX_INPUT_PIXELS é um teto razoável (~50 MP)", () => {
  assert.ok(MAX_INPUT_PIXELS >= 10_000_000 && MAX_INPUT_PIXELS <= 100_000_000, String(MAX_INPUT_PIXELS));
});

test("limitInputPixels barra decodificação acima do cap e libera abaixo", async () => {
  // 2000×2000 = 4 MP
  const buf = await sharp({
    create: { width: 2000, height: 2000, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).png().toBuffer();
  // cap 1 MP < 4 MP → deve lançar
  await assert.rejects(sharp(buf, { limitInputPixels: 1_000_000 }).resize({ width: 100 }).toBuffer());
  // cap 5 MP > 4 MP → sucesso
  const out = await sharp(buf, { limitInputPixels: 5_000_000 }).resize({ width: 100 }).webp().toBuffer();
  assert.ok(out.length > 0);
});
