# PRD-06a — SSRF no proxy de imagem público e util de fetch seguro compartilhado

> **Metadados:** Onda 1 | Prioridade: **Quick Win** | Esforço: **Médio** | Dependências: **nenhuma** | **CANÁRIO** (a allowlist / bloqueio de IP pode ficar estrita demais e virar placeholder legítimo em imagem válida — observar taxa de placeholder após o deploy).
>
> Este PRD é **autocontido**. Um agente futuro deve conseguir implementá-lo sem acesso à conversa que o gerou. Todas as referências `arquivo:linha` abaixo foram lidas e confirmadas no commit atual do repo (`c:/Users/Usuario(a) Master/sp011`).
>
> **Entregável reutilizável:** este PRD cria o util `safeFetch` que o **PRD-06b** (SSRF autenticado em `article-from-url`/`scrape`) vai reutilizar. Projete o util pensando nos dois consumidores.

---

## Objetivo

Fechar o SSRF público (não-autenticado) do proxy de imagem `GET /api/image`: hoje ele segue redirects sem revalidar o host de destino, aceita `http:`, e não bloqueia IPs privados/loopback/link-local/metadata — permitindo que um atacante externo alcance `169.254.169.254` (metadados), `pg-blogs`, `ollama` e `central:8090` a partir de um host allowlisted (ou de um open-redirect numa CDN da lista). A remediação cria um util de fetch seguro compartilhado (`safeFetch`) que resolve o DNS e bloqueia faixas privadas/reservadas **em cada hop de redirect**, reaplica a allowlist de host após redirect, exige `https` (ou allowlist estrita para `http`), e impõe limites de tempo e tamanho — e o aplica ao proxy de imagem.

---

## Contexto / Evidência de origem

**Achado F6** — *SSRF público no proxy de imagem* (mapa de riscos `security-audit/02-mapa-riscos.md`, linha 54: "SSRF público no proxy de imagem (segue redirect, IP privado) | `api-server/src/routes/image.ts:147-151` | **Alto**").
**Classificação** (`security-audit/04-plano-auditorias.md`, Domínio 3, linha 49): OWASP **A10:2021 (SSRF)**; OWASP **API07:2023 (SSRF)**; **CWE-918** (Server-Side Request Forgery); ATT&CK **T1090** (Proxy) / **T1552.005** (Cloud Instance Metadata API); **CVSS aproximado ~8.6 (não-autenticado)**.
**Attack path AP-2** (`security-audit/03-threat-model.md`, seção 4): "**AP-2 — SSRF público (proxy de imagem, F6).** Não-auth → segue redirect sem revalidar host, aceita http, sem bloqueio de IP privado → `169.254.169.254`/metadados, pg-blogs, ollama, central:8090. STRIDE: **I, S, D**. Mitiga: PRD-06a." Controle que falta na tabela STRIDE (seção 5, linha "Proxy de imagem"): "Allowlist + bloqueio IP privado + revalidar redirect + só https (06a)".

**Evidências concretas lidas no código** (`arquivo:linha` reais):

1. **`fetch` segue redirect sem revalidar o host de destino, com `http` permitido.**
   - `artifacts/api-server/src/routes/image.ts:141-159` → função `fetchOriginRaw(url)`. O `fetch` está em `image.ts:147-151`:
     ```ts
     const resp = await fetch(url, {
       headers: domainHeaders,
       signal: AbortSignal.timeout(6_000),
       redirect: "follow",      // ← image.ts:150 : segue redirect sem revalidar host
     });
     ```
   - A única validação de host acontece **antes** do fetch, na rota (`image.ts:226`: `if (!isAllowedImageHost(parsed.hostname))`), sobre a URL **inicial**. Como `fetch` usa `redirect: "follow"`, um `302 Location: http://169.254.169.254/...` (ou para `http://pg-blogs:5432`, `http://ollama:11434`, `http://central:8090`) é seguido **sem** reexecutar `isAllowedImageHost` no destino. **Complete Mediation quebrada.**
   - `image.ts:221` aceita `http:` além de `https:`:
     ```ts
     if (parsed.protocol !== "https:" && parsed.protocol !== "http:") { ... 400 ... }
     ```
   - **Não há** nenhuma resolução de DNS nem bloqueio de faixas privadas/loopback/link-local/metadata em `fetchOriginRaw` nem na rota. `AbortSignal.timeout(6_000)` limita tempo, mas **não** há limite de tamanho de corpo (`Buffer.from(await resp.arrayBuffer())` em `image.ts:158` lê tudo).

2. **Superfícies que chegam ao fetcher vulnerável.**
   - Rota pública **não-autenticada** `GET /api/image` → `image.ts:255` chama `resolveImage(key, () => fetchOriginRaw(rawUrl), w, q, fmt)`.
   - Warm cache no boot → `image.ts:184` também chama `fetchOriginRaw(url)` (mesmo fetcher; a correção em `fetchOriginRaw` cobre os dois).

3. **A allowlist é espelhada em DOIS arquivos** (CLAUDE.md §17 exige mudar nos dois):
   - `artifacts/api-server/src/routes/image.ts` → `ALLOWED_HOSTS` (linhas 45-72) + `ALLOWED_HOST_SUFFIXES` (linhas 77-94) + `isAllowedImageHost` (linhas 96-99, usa `endsWith`).
   - `artifacts/brasilia-agora/src/lib/newsImage.ts` → `PROXY_HOSTS` (linhas 16-43) + `PROXY_HOST_SUFFIXES` (linhas 48-62) + `isProxyableHost` (linhas 64-67, usa `endsWith`). Este arquivo decide no cliente **quais URLs viram `/api/image?...`** (`proxyUrl` em `newsImage.ts:73-95`); precisa continuar em sincronia com o backend para não gerar hotlink/placeholder desnecessário.

**Risco concreto:** um atacante externo chama `https://<host-allowlisted-com-open-redirect>/redir?to=http://169.254.169.254/latest/meta-data/...` (ou um host que ele controla e que casa por sufixo, ex.: um subdomínio de um `*.espncdn.com`/`*.glbimg.com` comprometido, retornando `302` para IP interno). O `fetch` segue o redirect, o backend lê a resposta do serviço interno e a devolve (ou vaza via mensagem de erro/timing). Isso alcança metadados de nuvem, o Postgres interno (`pg-blogs`), o Ollama (`ollama:11434`) e a API central (`central:8090`). STRIDE do AP-2: **I** (leitura de recurso interno), **S** (o servidor age como o atacante), **D** (pode martelar serviços internos).

> **Atenuante existente que ajuda no canário:** falha de fetch já degrada para um **placeholder** WebP com `X-Image-Cache: PLACEHOLDER` (`image.ts:256-271`), em vez de erro. Logo, uma rejeição de SSRF vira placeholder — sem quebra visível de UX além da imagem faltante. Isso torna a taxa de placeholder o sinal de canário.

---

## Pré-condições

- [ ] Criar branch: `git checkout -b fix/prd-06a-ssrf-proxy-imagem`
- [ ] Rodar e **registrar** o baseline de testes (devem passar ANTES de qualquer mudança):
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
  ```
- [ ] Ler estes arquivos ANTES de editar (todos já mapeados neste PRD):
  - `artifacts/api-server/src/routes/image.ts` — fetcher vulnerável (`fetchOriginRaw` 141-159; `redirect: "follow"` 150; aceite de `http` 221; check de host 226; allowlist 45-99; warm 184; uso na rota 255).
  - `artifacts/brasilia-agora/src/lib/newsImage.ts` — espelho da allowlist (`PROXY_HOSTS` 16-43; `PROXY_HOST_SUFFIXES` 48-62; `isProxyableHost` 64-67; `proxyUrl` 73-95).
  - `artifacts/api-server/src/lib/imageTransform.ts` — confirmar a assinatura de `resolveImage(key, fetcher, w, q, fmt)` e que o `fetcher` é a única porta de rede (para não haver outro caminho de fetch fora do util).
  - Um teste existente do api-server (ex.: `artifacts/api-server/test/*.test.ts`) para copiar o padrão `node --test` com import `.ts` explícito.
- [ ] Confirmar que `security-audit/STATUS.md` existe (criar se não existir — ver "Notas de execução para o agente").

---

## Escopo (ações em ordem)

> Localização do util: como o **outro** consumidor do futuro (`article-from-url`/`scrape`, F5/PRD-06b) também vive em `artifacts/api-server`, o util fica em `artifacts/api-server/src/lib/safeFetch.ts` (mesmo pacote — reutilizável sem tocar em `lib/*` composite). O util NÃO deve importar nada específico de imagem; a allowlist é passada por parâmetro.

1. **Criar `artifacts/api-server/src/lib/safeFetch.ts`** com uma função de classificação de IP e uma função de fetch seguro. Exportar, no mínimo:
   - `isPrivateOrReservedIp(ip: string): boolean` — retorna `true` para: IPv4 loopback `127.0.0.0/8`, link-local/metadata `169.254.0.0/16` (inclui `169.254.169.254`), privados `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` (CGNAT), `0.0.0.0/8`, broadcast `255.255.255.255`; IPv6 loopback `::1`, unspecified `::`, unique-local `fc00::/7`, link-local `fe80::/10`, e IPv4-mapped `::ffff:0:0/96` (deve desembrulhar e reclassificar o IPv4 embutido). Função **pura e testável sem rede**. **Regra do repo:** nunca usar caractere unicode literal em regex — se usar regex, escapar com `\uXXXX`.
   - `assertAllowedTarget(url: string, isAllowedHost: (hostname: string) => boolean, opts?): void` — valida SINCRONAMENTE, sem rede: (a) `new URL` parseia; (b) protocolo é `https:` (padrão) — só aceitar `http:` se `opts.allowHttp === true` (usado só se necessário e restrito à allowlist); (c) `isAllowedHost(hostname)` é `true`; (d) se o hostname for um **literal de IP**, `isPrivateOrReservedIp` deve ser `false`. Lança `Error` com código estável (`"ssrf_blocked"`, `"host_not_allowed"`, `"protocol_not_allowed"`) em falha. Não segue nada.
   - `safeFetch(url: string, init: { isAllowedHost, headers?, timeoutMs?, maxBytes?, allowHttp?, maxRedirects? }): Promise<{ status: number; headers: Headers; body: Buffer }>` — o fetch seguro de fato:
     1. Chama `assertAllowedTarget` na URL inicial.
     2. **Resolve o DNS do host** (`dns.promises.lookup(hostname, { all: true })`) e rejeita se **qualquer** endereço resolvido for privado/reservado (`isPrivateOrReservedIp`) — bloqueia DNS que aponta para IP interno.
     3. **Desabilita o redirect automático** (`redirect: "manual"`) e **refaz manualmente** cada hop (até `maxRedirects`, padrão 3): a cada `3xx` com `Location`, resolver a URL absoluta do destino e **reexecutar** `assertAllowedTarget` + a checagem de DNS (passos 1-2) no destino ANTES de segui-lo. Isso reaplica a allowlist de host e o bloqueio de IP **em cada hop**.
     4. Impõe `AbortSignal.timeout(timeoutMs)` (padrão 6000 ms) e um **limite de tamanho** (`maxBytes`, padrão ~10 MB): ler o corpo em streaming e abortar se exceder (não confiar só em `Content-Length`).
   - **Mitigação de DNS-rebinding (TOCTOU) — recomendada, não obrigatória para o Quick Win:** além de resolver+validar o DNS, "pinar" a conexão ao IP já validado passando um `lookup` customizado ao dispatcher do `undici` (`fetch(url, { dispatcher: new Agent({ connect: { lookup } }) })`) que rejeita IP privado no momento do connect. Se a versão do runtime não expuser isso de forma simples, documentar a limitação (janela TOCTOU entre resolve e connect) como resíduo aceito e registrar no STATUS. O bloqueio de redirect + resolução de DNS já fecha o vetor prático do AP-2.

2. **Reescrever `fetchOriginRaw` em `artifacts/api-server/src/routes/image.ts:141-159`** para delegar ao `safeFetch`:
   - Substituir o bloco `fetch(url, { headers, signal, redirect: "follow" })` (linhas 147-151) por `safeFetch(url, { isAllowedHost: isAllowedImageHost, headers: domainHeaders, timeoutMs: 6000, maxBytes: <limite>, allowHttp: <false ou true-restrito> })`.
   - Manter a validação `Content-Type` começa com `image/` (`image.ts:155-156`) sobre a resposta final do `safeFetch`, e a assinatura `(url: string): Promise<Buffer>` (para não tocar em `image.ts:184` warm nem `image.ts:255` rota).
   - Manter o `AbortSignal.timeout(6_000)` de efeito equivalente dentro do `safeFetch`.

3. **Decidir `http` vs `https` (ponto de canário).**
   - **Preferência:** exigir `https:` (`allowHttp: false`) e **remover `http:`** do aceite em `image.ts:221` (passar a rejeitar `http:` na rota, ou deixar o `safeFetch` rejeitar). Isso fecha o downgrade para serviços internos por `http://`.
   - **Se** a medição de canário (ver Comandos de verificação) mostrar imagens legítimas servidas por `http://` em hosts allowlisted, aí sim habilitar `allowHttp: true` **restrito à allowlist** (nunca `http` para IP/host arbitrário) e documentar a exceção. Não fazer isso preventivamente.

4. **Manter os dois espelhos da allowlist em sincronia.** Este PRD **não** precisa alterar as entradas da allowlist; mas SE qualquer entrada mudar durante a implementação (ex.: remover um host que só servia `http`), replicar a mudança IDÊNTICA em `artifacts/api-server/src/routes/image.ts` (`ALLOWED_HOSTS`/`ALLOWED_HOST_SUFFIXES`) **e** em `artifacts/brasilia-agora/src/lib/newsImage.ts` (`PROXY_HOSTS`/`PROXY_HOST_SUFFIXES`) — CLAUDE.md §17 exige mudar nos dois; drift gera hotlink/placeholder desnecessário.

5. **Escrever os testes** em `artifacts/api-server/test/safeFetch.test.ts` (`node --test`, import com extensão `.ts` explícita — padrão do repo). Cobrir, **sem rede** onde possível:
   - `isPrivateOrReservedIp`: tabela de literais → `true` para `169.254.169.254`, `127.0.0.1`, `10.1.2.3`, `172.16.0.1`, `172.31.255.255`, `192.168.0.1`, `100.64.0.1`, `0.0.0.0`, `::1`, `fc00::1`, `fe80::1`, `::ffff:127.0.0.1`; → `false` para IP público (ex.: `93.184.216.34`, `2606:2800:220:1:248:1893:25c8:1946`).
   - `assertAllowedTarget`: URL cujo host é IP privado literal (`http://169.254.169.254/`, `http://127.0.0.1/`) → lança (`ssrf_blocked`); URL de host FORA da allowlist → lança (`host_not_allowed`); URL `ftp://` ou `file://` → lança (`protocol_not_allowed`); URL `http://<host-allowlisted>/` com `allowHttp:false` → lança; URL `https://<host-allowlisted>/` → não lança.
   - **Redirect para IP interno rejeitado:** simular a lógica de hop reaplicando `assertAllowedTarget` sobre a URL de destino de um `Location` interno (ex.: `http://169.254.169.254/`) e assertar rejeição — pode ser um teste da função de "validar próximo hop" isolada, sem abrir socket real, para ser determinístico.
   - **DNS que resolve para IP interno rejeitado:** se viável, injetar um resolver fake (parametrizar o `lookup` que o `safeFetch` usa) que retorna `127.0.0.1`/`169.254.169.254` e assertar rejeição antes de qualquer fetch. Se não for viável sem rede, cobrir ao menos a checagem `isPrivateOrReservedIp` sobre os endereços retornados.

---

## Fora de escopo

- **SSRF autenticado** em `article-from-url`/`scrape` (`artifacts/api-server/src/routes/admin.ts:1215-1343`, achado **F5**) — é o **PRD-06b**, que **reutiliza** o `safeFetch` entregue aqui. NÃO tocar em `admin.ts` neste PRD.
- **Sanitização de HTML / gate de qualidade** (PRD-04a/04b/05). NÃO tocar.
- **Hardening de container / egress restrito / Chromium sandbox** (PRD-07). O egress do container não é alterado aqui.
- **Rate limit do proxy** (PRD-11). NÃO adicionar rate limit aqui.
- **NÃO** trocar `SESSION_SECRET` / `SETTINGS_ENCRYPTION_KEY`.
- **NÃO** reescrever o pipeline de cache/coalescing (`imageTransform.ts`) — apenas o fetcher que ele invoca.
- **NÃO** alterar o comportamento de placeholder (`image.ts:256-271`) — ele deve continuar sendo o degradê de falha (útil ao canário).
- **NÃO** expandir a allowlist para "resolver" imagens quebradas; qualquer mudança de allowlist é só sincronização dos dois espelhos.

---

## Comandos de verificação

```bash
# 0) Baseline já registrado nas pré-condições. Rodar tudo a partir da raiz do repo.
cd "c:/Users/Usuario(a) Master/sp011"

# 1) O util seguro existe e é a porta de rede do proxy.
#    SUCESSO: o arquivo existe.
ls artifacts/api-server/src/lib/safeFetch.ts

# 2) O proxy de imagem usa safeFetch e NÃO faz mais fetch cru com redirect:"follow".
#    SUCESSO: >=1 ocorrência de safeFetch em image.ts.
grep -rn "safeFetch" artifacts/api-server/src/routes/image.ts
#    SUCESSO: retorna 0 (o redirect:"follow" cru foi removido do proxy).
grep -rn "redirect:\s*\"follow\"" artifacts/api-server/src/routes/image.ts

# 3) A rota do proxy não faz um fetch() direto do global fora do util.
#    SUCESSO: 0 ocorrências de "await fetch(" em image.ts (todo fetch passa pelo safeFetch).
grep -rn "await fetch(" artifacts/api-server/src/routes/image.ts

# 4) http:// só é aceito de forma restrita (ou não aceito).
#    Inspecionar manualmente: image.ts:221 deve exigir https OU delegar a decisão ao safeFetch.
grep -n "protocol" artifacts/api-server/src/routes/image.ts

# 5) Testes do api-server (inclui safeFetch.test.ts) e typecheck.
#    SUCESSO: node --test com 0 failing; typecheck sem erro.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck

# 6) Espelhos da allowlist em sincronia (se alguma entrada mudou).
#    SUCESSO: a lista de hosts/sufixos em image.ts e newsImage.ts é a mesma
#    (comparar visualmente as duas saídas; devem coincidir entrada a entrada).
cd "c:/Users/Usuario(a) Master/sp011"
grep -n "\"\." artifacts/api-server/src/routes/image.ts | grep -v "//"
grep -n "\"\." artifacts/brasilia-agora/src/lib/newsImage.ts | grep -v "//"

# 7) (VPS, pós-deploy — CANÁRIO) Medir taxa de placeholder por ~24-72h.
#    Uma imagem legítima bloqueada por engano volta como placeholder:
#    SUCESSO: a proporção de respostas com header X-Image-Cache: PLACEHOLDER
#    NÃO sobe de forma relevante vs. o baseline pré-deploy.
#    Ex. (na VPS, contra o serviço api): amostrar logs/headers de /api/image e
#    contar PLACEHOLDER vs MEM/MISS. Registrar os números no STATUS.
```

> Nota de ambiente: o build do frontend (`vite`) NÃO roda no Windows — apenas a mudança de `newsImage.ts` (se houver) é validada no bundle na VPS (serviço `web`). O util e o proxy são api-server (esbuild/`node --test`), que rodam localmente.

---

## Critérios de aceite

- [ ] Existe `artifacts/api-server/src/lib/safeFetch.ts` exportando `isPrivateOrReservedIp`, `assertAllowedTarget` e `safeFetch`.
- [ ] `isPrivateOrReservedIp` retorna `true` para todos os literais da tabela (`169.254.169.254`, `127.0.0.1`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10`, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:` IPv4-mapped privado) e `false` para IP público — comprovado por `node --test` verde.
- [ ] `assertAllowedTarget` rejeita: host = IP privado literal; host fora da allowlist; protocolo não-`http(s)`; `http://` com `allowHttp:false`. Aceita `https://` de host allowlisted — comprovado por teste.
- [ ] `safeFetch` **não** usa `redirect: "follow"`; refaz cada hop reaplicando allowlist de host + bloqueio de IP; resolve DNS e rejeita se algum endereço resolvido for privado/reservado; impõe timeout e limite de bytes — comprovado por teste (redirect→IP interno rejeitado; DNS→IP interno rejeitado, ao menos via classificador).
- [ ] `grep -rn "redirect:\s*\"follow\"" artifacts/api-server/src/routes/image.ts` = 0; `grep -rn "await fetch(" artifacts/api-server/src/routes/image.ts` = 0; `grep -rn "safeFetch" artifacts/api-server/src/routes/image.ts` ≥ 1.
- [ ] `http:` só é aceito de forma restrita à allowlist (ou totalmente rejeitado) no proxy — decisão registrada e justificada.
- [ ] Se qualquer entrada de allowlist mudou, os dois espelhos (`image.ts` e `newsImage.ts`) foram atualizados identicamente.
- [ ] `node --test` do `artifacts/api-server` verde e `pnpm run typecheck` do `artifacts/api-server` sem erro.
- [ ] (VPS, canário) Taxa de `X-Image-Cache: PLACEHOLDER` medida pós-deploy não sobe de forma relevante vs. baseline — número registrado no STATUS.

---

## Definition of Done

`safeFetch` mergeado na `main`, o proxy `GET /api/image` roteando **todo** fetch de origem por ele (0 `redirect:"follow"`/`await fetch(` cru no `image.ts`), com bloqueio de IP privado/reservado revalidado em cada hop de redirect e por resolução de DNS, `https` exigido (ou `http` restrito à allowlist com justificativa), limites de tempo/tamanho aplicados, testes `node --test` do api-server verdes cobrindo a bateria (IP privado, redirect→interno, DNS→interno, protocolo/host inválidos, `http` bloqueado) e `pnpm run typecheck` sem erro. Espelhos de allowlist em sincronia. Canário de placeholder observado na VPS por ≥24h com número registrado em `security-audit/STATUS.md`.

---

## Dependências

- **Nenhuma dependência dura.** Pode rodar em paralelo com qualquer PRD da Onda 1.
- **Habilita o PRD-06b** (SSRF autenticado em `article-from-url`/`scrape`, F5): o 06b consome o `safeFetch` entregue aqui. Implementar 06a **antes** de 06b (ou ao menos entregar `safeFetch` antes).

---

## Prioridade e esforço

- **Prioridade:** **Quick Win** (Onda 1) — vetor externo não-autenticado, correção localizada num único fetcher + util novo, sem mudança de dados nem de auth.
- **Esforço:** **Médio** — a lógica de classificação de IP (IPv4/IPv6, IPv4-mapped, CIDRs), o refazer manual de redirects revalidando cada hop, e o streaming com limite de bytes exigem cuidado e testes; o restante é substituição pontual.

---

## Plano de rollback

- **Reverter código:** `git revert <hash-do-merge>` do branch `fix/prd-06a-ssrf-proxy-imagem`. Isso restaura o `fetchOriginRaw` anterior (com `redirect: "follow"`) e remove o `safeFetch`.
- **Rebuild direcionado na VPS** (mapeamento CLAUDE.md §5: `artifacts/api-server` → `api`; `artifacts/brasilia-agora` → `web` só se `newsImage.ts` mudou):
  ```bash
  cd /opt/sp011
  git pull
  docker compose build api
  docker compose up -d api
  # se newsImage.ts mudou:
  # docker compose build web && docker compose up -d web
  ```
- **Mitigação de canário sem revert total:** se a allowlist/`https-only` estiver bloqueando imagens legítimas (taxa de placeholder subiu), habilitar `allowHttp: true` **restrito à allowlist** e/ou reincluir o host legítimo removido, mantendo o bloqueio de IP privado e a revalidação de redirect (o núcleo de segurança do AP-2). Só reverter o PRD inteiro em último caso.

---

## Notas de execução para o agente

- Trabalhe **somente neste PRD** (PRD-06a). Não misture com 06b/07/11. Entregue o `safeFetch` genérico (allowlist por parâmetro) para o 06b poder reusar sem refatorar.
- **Projete `safeFetch` para dois consumidores:** proxy de imagem (allowlist estrita de CDNs) e, no 06b, `article-from-url`/`scrape` (que precisará de sua própria allowlist ou política). Não hardcode `isAllowedImageHost` dentro do util.
- **Regras do repo a respeitar:** imports de teste com extensão `.ts` explícita; `node --test` dentro do pacote `artifacts/api-server`; nunca unicode literal em regex (usar `\uXXXX`); commit direto na `main` (dev solo, sem PR) só após verificação verde.
- **Nunca** testar exploit ativo contra serviços internos reais; os testes de SSRF devem ser determinísticos e sem rede (classificador de IP + validação de hop/URL isolada; resolver injetável/fake).
- Se **qualquer** critério de aceite falhar após implementar, **NÃO marque como concluído**: registre o motivo exato (comando, saída, `arquivo:linha`) em `security-audit/STATUS.md` (criar o arquivo se não existir, uma entrada por PRD) e **PARE**.
- Ao concluir com sucesso, atualize `security-audit/STATUS.md` registrando: PRD-06a, hashes de commit, resultado dos comandos de verificação, decisão sobre `http`/`https`, eventual resíduo de DNS-rebinding TOCTOU aceito, e o número do canário de placeholder pós-deploy.
- **Sinalização de revisão humana:** este PRD é externo/não-auth mas de esforço Médio e não toca auth/segredos/dados sensíveis — não exige aprovação humana obrigatória para o merge do código. Porém a decisão de `https-only` e a observação do **canário** (placeholder) devem ser confirmadas em produção antes de considerar o PRD encerrado; sinalizar ao operador o momento do deploy para acompanhar a taxa de placeholder.
