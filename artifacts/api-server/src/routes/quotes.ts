import { Router } from "express";

const router = Router();

const CACHE_TTL = 5 * 60 * 1000;
let cache: { data: unknown; ts: number } | null = null;

router.get("/", async (_req, res) => {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return res.json(cache.data);
  }

  try {
    const [fxRes, cryptoRes] = await Promise.all([
      fetch("https://api.frankfurter.app/latest?from=BRL&to=USD,EUR,GBP"),
      fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl&include_24hr_change=true"
      ),
    ]);

    if (!fxRes.ok || !cryptoRes.ok) {
      throw new Error("Upstream error");
    }

    const [fxJson, cryptoJson] = await Promise.all([fxRes.json(), cryptoRes.json()]);

    const inv = (rate: number | undefined) =>
      rate ? (1 / rate).toFixed(4) : null;

    const usd = inv(fxJson.rates?.USD);
    const eur = inv(fxJson.rates?.EUR);
    const gbp = inv(fxJson.rates?.GBP);

    const pct = (v: number | undefined) =>
      v != null ? String(v.toFixed(2)) : "0";

    const result = {
      fx: {
        USDBRL: usd ? { bid: usd, ask: usd, pctChange: "0" } : undefined,
        EURBRL: eur ? { bid: eur, ask: eur, pctChange: "0" } : undefined,
        GBPBRL: gbp ? { bid: gbp, ask: gbp, pctChange: "0" } : undefined,
      },
      crypto: {
        BTCBRL: cryptoJson.bitcoin
          ? {
              bid: String(cryptoJson.bitcoin.brl),
              pctChange: pct(cryptoJson.bitcoin.brl_24h_change),
            }
          : undefined,
        ETHBRL: cryptoJson.ethereum
          ? {
              bid: String(cryptoJson.ethereum.brl),
              pctChange: pct(cryptoJson.ethereum.brl_24h_change),
            }
          : undefined,
      },
      ts: Date.now(),
    };

    cache = { data: result, ts: Date.now() };
    return res.json(result);
  } catch {
    if (cache) {
      return res.json({ ...cache.data as object, cached: true });
    }
    return res.status(502).json({ error: "Quotes unavailable" });
  }
});

export default router;
