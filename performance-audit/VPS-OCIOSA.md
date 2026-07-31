# Deixar a VPS ociosa para medir

Toda medição de TEMPO (TTFB, FCP, LCP, TBT, Lighthouse/PageSpeed) só vale com a
máquina calma. Em 2026-07-29 quatro metas do PRD-PERF-05 foram registradas como
**reprovadas** porque a medição rodou com o `ollama` em **1576% de CPU**
reescrevendo notícias; repetida com a VPS ociosa, todas passaram. Número de tempo
medido em máquina ocupada não é um número ruim — é um número falso.

Quem come a máquina:

| serviço | o que é | por que atrapalha |
|---|---|---|
| `ollama` | LLM self-hosted (`qwen2.5:7b-instruct`) | ~13,5 GB residentes e picos de 1500%+ de CPU durante a reescrita |
| `central-api` | collector, rewriter, distributor, localizer, deliveryWorker | é ele que ALIMENTA o ollama; sem parar os dois, o trabalho volta em 1 min (tick do collector) |
| `central-web` | SPA do painel central | irrelevante em CPU; para junto só para o painel não ficar meio no ar |

**Não pare** `caddy` (serve todos os domínios), `pg-blogs` (banco dos blogs
replicados), nem o `api`/`web` do blog que você vai medir.

---

## 1. Deixar ociosa

Para os três serviços e espera a carga cair de fato — não confie no relógio,
confie no `load average`. O laço sai sozinho quando a carga de 1 minuto fica
abaixo de 1,0 (a VPS tem 8 vCPU) ou depois de 5 minutos, o que vier antes.

```bash
cd /opt/sp011
docker compose stop ollama central-api central-web
for i in $(seq 1 30); do
  L=$(cut -d' ' -f1 /proc/loadavg)
  echo "$(date +%H:%M:%S)  load 1min: $L"
  awk -v l="$L" 'BEGIN{exit !(l<1.0)}' && break
  sleep 10
done
uptime
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' | sort -k2 -rn | head -12
```

Só siga para a medição se a última linha do laço mostrar **load abaixo de 1,0** e
o `docker stats` não tiver nenhum container acima de ~50%. Se algum blog estiver
alto, é tráfego real ou trabalho pendente — espere mais um pouco.

## 2. Medir

Perfil fixo do baseline (mobile 412×823 DPR 1.75, 1,6 Mbps, RTT 150 ms, CPU 4×).
Troque as URLs pelas rotas que interessam; a mediana de 5 leituras é o que vale.

```bash
cd /opt/sp011
docker compose cp performance-audit/medir-campo.mjs api:/app/artifacts/api-server/medir.mjs
docker compose exec -T -e REPS=5 api node medir.mjs https://sp011.com.br/ https://sp011.com.br/politica
```

O container `api` é o único da stack com Playwright + Chromium instalados — por
isso a medição roda de dentro dele, e não da sua máquina.

## 3. Restaurar — NÃO ESQUEÇA

Enquanto a central está parada, a rede **não coleta, não reescreve e não entrega
notícia a nenhum dos 8 blogs**, e `central.midia.run` responde 502. Nada se
perde (as entregas pendentes ficam na fila e o collector volta no próximo tick),
mas o catálogo para de crescer.

```bash
cd /opt/sp011
docker compose up -d ollama central-api central-web
sleep 20
docker compose ps --format '{{.Service}}\t{{.State}}\t{{.Status}}'
curl -s -o /dev/null -w 'central: %{http_code}\n' https://central.midia.run/
```

Os três precisam aparecer como `running`. O `ollama` recarrega o modelo na
primeira requisição (alguns segundos) — é esperado.

## Conferir depois se esqueceu

```bash
cd /opt/sp011
docker compose ps -a --format '{{.Service}}\t{{.State}}' | grep -v running
```

Saída vazia = está tudo de pé.
