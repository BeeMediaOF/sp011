/**
 * Medição de campo das rotas públicas — FCP, LCP, bytes e erros de console.
 *
 * Perfil FIXO, igual ao do baseline de 2026-07-27 (STATUS.md §Baseline): mobile
 * 412×823 DPR 1.75, 1,6 Mbps de download, 150 ms de RTT e CPU 4× mais lenta. Não
 * mude estes números sem trocar o baseline junto — comparar medição com perfil
 * diferente é a origem clássica de conclusão errada nesta auditoria.
 *
 * Vive no repo de propósito: o script anterior era temporário, foi apagado com o
 * scratchpad da sessão, e a série de "long tasks" ficou incomparável por causa
 * disso (STATUS.md, fechamento do PRD-02).
 *
 * Roda dentro do container `api`, o único da stack com Playwright + Chromium:
 *
 *   cd /opt/sp011
 *   docker compose cp performance-audit/medir-campo.mjs api:/app/artifacts/api-server/medir.mjs
 *   docker compose exec -T api node medir.mjs https://sp011.com.br/ https://sp011.com.br/politica
 *
 * Cada rota é carregada 3× (ou o que estiver em REPS) e o relatório traz a
 * MEDIANA: a primeira carga de uma rota com SSR paga o cache de HTML frio e não
 * representa o que o visitante vê.
 */
import { chromium } from "playwright";

const REPS = Number(process.env.REPS ?? 3);
const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("uso: node medir.mjs <url> [url...]");
  process.exit(1);
}

/* Perfil de rede/CPU do baseline. 1,6 Mbps em bytes/s; o upload não importa
   para leitura de página, mas o CDP exige o campo. */
const THROTTLE = {
  offline: false,
  downloadThroughput: (1600 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};
const CPU_RATE = 4;

/**
 * Instalado ANTES da navegação (addInitScript). LCP e CLS não saem por
 * `getEntriesByType` — só por PerformanceObserver; pedi-los pelo caminho errado
 * devolve lista vazia E imprime "Deprecated API for given entry type" no
 * console, o que ainda por cima contamina o gate de hidratação deste relatório.
 */
function observeWebVitals() {
  window.__lcp = 0;
  window.__cls = 0;
  window.__tasks = [];
  window.__scripts = {};
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__lcp = Math.max(window.__lcp, e.renderTime || e.loadTime || e.startTime);
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      // Só deslocamento não provocado por interação conta para o CLS.
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    // Tarefas longas (>50 ms): é delas que sai o TBT, o número que mede o custo
    // de HIDRATAR. O PRD-PERF-02 cortou BYTES de JavaScript; TBT mede TRABALHO,
    // que é coisa diferente — um bundle pequeno pode travar a thread do mesmo
    // jeito. Guardar a duração de cada uma (e não só a soma) permite ver se o
    // problema é uma tarefa monolítica ou muitas pequenas.
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__tasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: "longtask", buffered: true });
    // Atribuição por script (Chrome 123+): diz QUAL arquivo e QUAL função
    // gastaram o tempo. Sem isto sobra adivinhação sobre bundle minificado.
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        for (const s of e.scripts ?? []) {
          const nome = `${(s.sourceURL || "?").split("/").pop()}:${s.sourceFunctionName || "(anônima)"}`;
          window.__scripts[nome] = (window.__scripts[nome] ?? 0) + s.duration;
        }
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch { /* navegador sem suporte: fica 0 */ }
}

/** Coletado DENTRO da página, depois do load + um respiro para o LCP fechar. */
function collect() {
  return new Promise((resolve) => {
    const out = { fcp: 0, transfer: 0, decoded: 0, jsDecoded: 0, requests: 0 };
    out.lcp = Math.round(window.__lcp ?? 0);
    out.cls = Math.round((window.__cls ?? 0) * 1000) / 1000;
    for (const e of performance.getEntriesByType("paint")) {
      if (e.name === "first-contentful-paint") out.fcp = Math.round(e.startTime);
    }
    for (const r of performance.getEntriesByType("resource")) {
      out.requests++;
      out.transfer += r.transferSize || 0;
      out.decoded += r.decodedBodySize || 0;
      if (r.initiatorType === "script" || /\.js(\?|$)/.test(r.name)) out.jsDecoded += r.decodedBodySize || 0;
    }
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav) {
      out.transfer += nav.transferSize || 0;
      out.decoded += nav.decodedBodySize || 0;
      out.ttfb = Math.round(nav.responseStart);
      out.load = Math.round(nav.loadEventEnd);
    }
    /* TBT: soma do que passa de 50 ms em cada tarefa longa iniciada depois do
       FCP. NÃO é idêntico ao do Lighthouse (que fecha a janela na TTI e usa o
       próprio traçado); serve para comparar ESTA série com ela mesma ao longo
       da auditoria, e não para bater com o número do PageSpeed. */
    const tarefas = (window.__tasks ?? []).filter((t) => t.start >= out.fcp);
    out.tbt = Math.round(tarefas.reduce((s, t) => s + Math.max(0, t.dur - 50), 0));
    out.longTasks = tarefas.length;
    out.maiorTask = Math.round(tarefas.reduce((m, t) => Math.max(m, t.dur), 0));
    out.scripts = window.__scripts ?? {};
    resolve(out);
  });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
const kb = (n) => `${Math.round(n / 1024)} KB`;

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

const report = [];
for (const url of urls) {
  const runs = [];
  const problems = [];
  /* Aquece o cache de HTML do servidor. A 1ª leitura de uma rota com SSR paga
     os fetches de API + renderToString e não representa o visitante; sem isto
     ela entra na amostra e puxa a mediana (foi o que aconteceu na 1ª medição do
     PRD-05: uma leitura de 3.720 ms contra 2.396 e 2.516). O caminho frio é
     medido à parte, por curl, onde dá para separar handshake de servidor. */
  try {
    await fetch(url, { headers: { "user-agent": "medir-campo/warmup" } });
  } catch { /* API fora: as leituras vão mostrar */ }
  for (let i = 0; i < REPS; i++) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 823 },
      deviceScaleFactor: 1.75,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Mobile Safari/537.36",
    });
    const page = await context.newPage();
    await page.addInitScript(observeWebVitals);
    /* Erro/aviso de console é o gate de hidratação do PRD-05: o React em
       produção loga o #418/#423 minificado quando descarta o HTML do servidor. */
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`[${m.type()}] ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", THROTTLE);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });

    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    // O LCP só é definitivo depois que o usuário poderia ter interagido; 2,5 s
    // de folga cobrem a imagem do topo chegando pela rede estrangulada.
    await page.waitForTimeout(2500);
    runs.push(await page.evaluate(collect));
    await context.close();
  }
  report.push({ url, runs, problems });
}
await browser.close();

console.log(`\nperfil: 412x823 DPR1.75 · ${Math.round(THROTTLE.downloadThroughput * 8 / 1024)} kbps · ` +
  `RTT ${THROTTLE.latency} ms · CPU ${CPU_RATE}x · ${REPS} execuções (mediana)\n`);
console.log("rota                            FCP     LCP    TTFB     CLS     TBT  tarefas  maior  transfer   reqs");
for (const { url, runs } of report) {
  const p = (k) => median(runs.map((r) => r[k] ?? 0));
  const path = new URL(url).pathname.slice(0, 29).padEnd(29);
  console.log(
    `${path} ${String(p("fcp")).padStart(6)}  ${String(p("lcp")).padStart(6)}  ` +
    `${String(p("ttfb")).padStart(5)}  ${String(p("cls")).padStart(6)}  ` +
    `${String(p("tbt")).padStart(6)}  ${String(p("longTasks")).padStart(7)}  ` +
    `${String(p("maiorTask")).padStart(5)}  ${kb(p("transfer")).padStart(8)}  ${String(p("requests")).padStart(4)}`,
  );
}
console.log("\nleituras individuais (FCP/LCP/TBT):");
for (const { url, runs } of report) {
  console.log(`  ${new URL(url).pathname}: ${runs.map((r) => `${r.fcp}/${r.lcp}/${r.tbt}`).join("  ")}`);
}

/* Quem gastou a thread. Vazio = Chromium sem long-animation-frame (< 123);
   os tempos de TBT acima continuam válidos, só falta o "de quem é a culpa". */
console.log("\nmaiores consumidores da thread principal (soma das execuções, ms):");
for (const { url, runs } of report) {
  const total = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.scripts ?? {})) {
    total[k] = (total[k] ?? 0) + v / runs.length;
  }
  const top = Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`  ${new URL(url).pathname}: ${top.length === 0 ? "(sem atribuição neste Chromium)" : ""}`);
  for (const [nome, ms] of top) console.log(`      ${String(Math.round(ms)).padStart(6)} ms  ${nome}`);
}
console.log("\nconsole (esperado: vazio):");
for (const { url, problems } of report) {
  const uniq = [...new Set(problems)];
  console.log(`  ${new URL(url).pathname}: ${uniq.length === 0 ? "limpo" : ""}`);
  for (const p of uniq.slice(0, 8)) console.log(`      ${p}`);
}
