import { Router } from "express";

const router = Router();

/** GET /api/quotes — moedas e criptoativos em BRL */
router.get("/", async (_req, res) => {
  try {
    const [fxRes, cryptoRes] = await Promise.all([
      fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,GBP-BRL"),
      fetch("https://economia.awesomeapi.com.br/json/last/BTC-BRL,ETH-BRL"),
    ]);

    const [fx, crypto] = await Promise.all([fxRes.json(), cryptoRes.json()]);

    res.json({ fx, crypto, ts: Date.now() });
  } catch {
    res.status(502).json({ error: "Quotes unavailable" });
  }
});

export default router;
