import { Router } from "express";

const router = Router();

const CACHE_TTL     = 5 * 60 * 1000;   // 5 min — fresh window
const STALE_TTL     = 60 * 60 * 1000;  // 60 min — serve stale rather than blank
const FETCH_TIMEOUT = 8_000;

interface FxQuote   { bid: string; ask: string; pctChange: string }
interface CryptoQuote { bid: string; pctChange: string }
interface FxResult   { USDBRL?: FxQuote; EURBRL?: FxQuote; GBPBRL?: FxQuote }
interface CryptoResult { BTCBRL?: CryptoQuote; ETHBRL?: CryptoQuote }

let fxCache:     { data: FxResult;     ts: number } | null = null;
let cryptoCache: { data: CryptoResult; ts: number } | null = null;

function race<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

function isFresh(c: { ts: number } | null)  { return !!c && Date.now() - c.ts < CACHE_TTL;  }
function isUsable(c: { ts: number } | null) { return !!c && Date.now() - c.ts < STALE_TTL; }

// ── BCB PTAX — Banco Central do Brasil (official, no key, high reliability) ──
async function fetchFx(): Promise<FxResult> {
  // Try today then walk back up to 4 weekdays to handle weekends/holidays
  const dates: string[] = [];
  for (let d = new Date(), i = 0; i < 5; i++) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    dates.push(`${mm}-${dd}-${yyyy}`);
    d.setDate(d.getDate() - 1);
  }

  async function bcbRate(moeda: string): Promise<{ compra: number; venda: number } | null> {
    for (const date of dates) {
      const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda=%27${moeda}%27&@dataCotacao=%27${date}%27&$format=json&$top=1`;
      try {
        const r = await race(fetch(url), FETCH_TIMEOUT);
        if (!r.ok) continue;
        type BCBEntry = { cotacaoCompra: number; cotacaoVenda: number };
        const json = await r.json() as { value: BCBEntry[] };
        if (json.value?.length) {
          return { compra: json.value[0]!.cotacaoCompra, venda: json.value[0]!.cotacaoVenda };
        }
      } catch { /* try next date */ }
    }
    return null;
  }

  const [usd, eur, gbp] = await Promise.all([
    bcbRate("USD"),
    bcbRate("EUR"),
    bcbRate("GBP"),
  ]);

  return {
    USDBRL: usd ? { bid: usd.compra.toFixed(4), ask: usd.venda.toFixed(4), pctChange: "0" } : undefined,
    EURBRL: eur ? { bid: eur.compra.toFixed(4), ask: eur.venda.toFixed(4), pctChange: "0" } : undefined,
    GBPBRL: gbp ? { bid: gbp.compra.toFixed(4), ask: gbp.venda.toFixed(4), pctChange: "0" } : undefined,
  };
}

// ── Coinpaprika — no key, BRL native, reliable from Replit servers ─────────
async function fetchCrypto(): Promise<CryptoResult> {
  const pct = (v: number | null | undefined) =>
    v != null && !isNaN(v) ? v.toFixed(2) : "0";

  type PaprikaQuote = { price: number; percent_change_24h: number };
  type PaprikaTicker = { quotes: { BRL: PaprikaQuote } };

  const [btcRes, ethRes] = await Promise.allSettled([
    race(fetch("https://api.coinpaprika.com/v1/tickers/btc-bitcoin?quotes=BRL"), FETCH_TIMEOUT)
      .then((r) => (r.ok ? r.json() as Promise<PaprikaTicker> : Promise.reject())),
    race(fetch("https://api.coinpaprika.com/v1/tickers/eth-ethereum?quotes=BRL"), FETCH_TIMEOUT)
      .then((r) => (r.ok ? r.json() as Promise<PaprikaTicker> : Promise.reject())),
  ]);

  const btc = btcRes.status === "fulfilled" ? btcRes.value.quotes.BRL : null;
  const eth = ethRes.status === "fulfilled" ? ethRes.value.quotes.BRL : null;

  return {
    BTCBRL: btc ? { bid: String(Math.round(btc.price)),    pctChange: pct(btc.percent_change_24h) } : undefined,
    ETHBRL: eth ? { bid: String(Math.round(eth.price)),    pctChange: pct(eth.percent_change_24h) } : undefined,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  const [fxResult, cryptoResult] = await Promise.allSettled([
    isFresh(fxCache)
      ? Promise.resolve(fxCache!.data)
      : fetchFx().then((d) => { fxCache = { data: d, ts: Date.now() }; return d; }),
    isFresh(cryptoCache)
      ? Promise.resolve(cryptoCache!.data)
      : fetchCrypto().then((d) => { cryptoCache = { data: d, ts: Date.now() }; return d; }),
  ]);

  const fx:     FxResult     = fxResult.status     === "fulfilled" ? fxResult.value     : (isUsable(fxCache)     ? fxCache!.data     : {});
  const crypto: CryptoResult = cryptoResult.status === "fulfilled" ? cryptoResult.value : (isUsable(cryptoCache) ? cryptoCache!.data : {});

  if (!Object.keys(fx).length && !Object.keys(crypto).length) {
    return res.status(502).json({ error: "Quotes unavailable" });
  }

  return res.json({
    fx,
    crypto,
    stale: fxResult.status === "rejected" || cryptoResult.status === "rejected",
    ts: Date.now(),
  });
});

export default router;
