# Identidade de busca por blog — tagline e meta descrição

> **Data:** 2026-08-22 · Medido em produção nos 11 domínios.
>
> **Problema que este documento resolve:** `tagline = "Notícia. Agora. Sempre."`
> em **10 dos 11 blogs** (o KSports usa `" News. Now. Always."`, a tradução da
> mesma frase, com um espaço sobrando no início). Como `seoDescription` está
> **vazio em 10 deles**, essa frase é hoje:
>
> - o sufixo do `<title>` da home dos 11 domínios;
> - a `<meta name="description">` da home dos 11 domínios;
> - a `<meta name="description">` de **todas as editorias** de todos eles.
>
> Só o `sp011` tem `seoDescription` preenchido (`"Informação com credibilidade
> sobre SP"`, 37 de 160 caracteres).

## Onde se aplica

Painel de cada blog → **Configurações**:

| Campo no painel | Chave | Onde aparece |
|---|---|---|
| **Tagline / Slogan** | `tagline` | `<title>` da home, como `{Nome do site} — {tagline}`; e o `<h1>` (sr-only) da home |
| **Meta descrição** | `seoDescription` | `<meta name="description">` da home **e das editorias**. Contador de 160 no painel |

Regra de precedência no código (`vite.config.ts:119`):
`seoDescription || tagline || siteName`. Por isso preencher a meta descrição é o
que efetivamente separa um blog do outro aos olhos do buscador.

Sem deploy. O app relê `site_settings` a cada 15 s.

## Valores propostos

Os `<title>` resultantes ficam todos abaixo de 60 caracteres. As descrições,
abaixo de 160.

### SP011 — `sp011.com.br` · notícias gerais de São Paulo

- **Tagline:** `Notícia que conecta São Paulo`
- **Título resultante:** `SP011 — Notícia que conecta São Paulo`
- **Meta descrição:** `Notícias de São Paulo em tempo real: cidade, política, economia, segurança, saúde e cultura, apuradas e publicadas todos os dias.`

### KSports — `ksports.midia.run` · EN, esporte, foco Nigéria

- **Tagline:** `Sport from a Nigerian newsroom`
- **Título resultante:** `KSports — Sport from a Nigerian newsroom`
- **Meta descrição:** `Football, the Super Eagles and world sport covered daily from a Nigerian newsroom: match reports, transfers, results and analysis.`
- ⚠️ Corrigir também o espaço sobrando no início da tagline atual.

### Esporte Agora — `esporteagora.midia.run` · esporte, velocidade

- **Tagline:** `O placar antes de todo mundo`
- **Título resultante:** `Esporte Agora — O placar antes de todo mundo`
- **Meta descrição:** `Futebol, Fórmula 1, vôlei, tênis e NFL com resultado, escalação e repercussão no mesmo minuto em que a partida acontece.`

### De olho na zebra — `resenhavip.midia.run` · esporte, análise

- **Tagline:** `Análise esportiva sem torcida`
- **Título resultante:** `De olho na zebra — Análise esportiva sem torcida`
- **Meta descrição:** `Futebol, vôlei, tênis, F1 e NFL com leitura tática, contexto e números: a análise que explica o resultado, sem torcida e sem palpite.`
- ⚠️ Este é o domínio com histórico de flag "Páginas enganosas" no Search
  Console (`CLAUDE.md §19.3`). A copy foi escrita de propósito **sem** verbo de
  ganho e **sem** promessa de acerto. Não substituir por texto que prometa
  resultado de aposta.
- ⚠️ O `siteName` em produção é **"De olho na zebra"**, não "Resenha Vip" — o
  `CLAUDE.md §4` está desatualizado nesse ponto.

### OleySports — `oleysports.com.br` · esporte

- **Tagline:** `Esporte com contexto e números`
- **Título resultante:** `OleySports — Esporte com contexto e números`
- **Meta descrição:** `Futebol nacional e internacional, F1, NFL e vôlei: resultados, bastidores e a análise que explica o que aconteceu em campo.`

### BeeEsportes — `beeesportes.midia.run` · esporte, formato curto

- **Tagline:** `O dia no esporte, em minutos`
- **Título resultante:** `BeeEsportes — O dia no esporte, em minutos`
- **Meta descrição:** `O resumo diário do esporte: futebol, vôlei, tênis, F1, NFL e e-sports em textos curtos, checados e direto ao ponto.`

### Ponto Farma — `pontofarma.com` · B2B farmacêutico

- **Tagline:** `Gestão de farmácia que gera resultado`
- **Título resultante:** `Ponto Farma — Gestão de farmácia que gera resultado`
- **Meta descrição:** `Gestão, fiscal, legislação e vendas para donos e gerentes de farmácia: o que muda na regra e o que fazer no balcão.`

### Crédito.vc — `credito.vc` · educação financeira e crédito

- **Tagline:** `Crédito, score e finanças pessoais`
- **Título resultante:** `Crédito.vc — Crédito, score e finanças pessoais`
- **Meta descrição:** `Crédito, score, dívidas e organização financeira explicados sem jargão: guias práticos para você decidir melhor com o seu dinheiro.`
- **Por que não "Educação financeira para a vida real":** essa frase é a marca e
  já está no hero da home, onde cumpre o papel de posicionamento. O `<title>` é
  onde a intenção de busca importa, e "crédito", "score" e "finanças pessoais"
  são os termos que o leitor digita. As duas convivem: marca no hero, termos no
  título.

### ApostaGanha — `apostaganha.midia.run` · esporte

- **Tagline:** `Esporte e mercado, lado a lado`
- **Título resultante:** `ApostaGanha — Esporte e mercado, lado a lado`
- **Meta descrição:** `Futebol, F1, NFL e vôlei com escalações, resultados e leitura de mercado: informação para acompanhar o jogo com clareza.`

### RecebaBet — `recebabet.midia.run` · esporte

- **Tagline:** `O jogo explicado, do apito ao placar`
- **Título resultante:** `RecebaBet — O jogo explicado, do apito ao placar`
- **Meta descrição:** `Cobertura diária de futebol e esportes: escalações, lesões, resultados e o contexto que muda a leitura da partida.`

### O Comandante News — `ocomandantenews.com.br` · negócios, economia, aviação, turismo

- **Tagline:** `No comando de negócios e aviação`
- **Título resultante:** `O Comandante News — No comando de negócios e aviação`
- **Meta descrição:** `Negócios, economia, aviação e turismo: o que move as empresas, o mercado e o setor aéreo no Brasil, com apuração própria.`
- Mantém o trocadilho de marca registrado no `CLAUDE.md §4` ("No comando da
  notícia") e acrescenta o nicho, que é o que faltava.

## Nota sobre as marcas de aposta

`ApostaGanha`, `RecebaBet`, `De olho na zebra` e `OleySports` são marcas
adjacentes a apostas. As descrições acima descrevem **cobertura editorial** e
evitam de propósito verbo de ganho, promessa de acerto e chamada para apostar.
Isso não é preciosismo: o `resenhavip` já foi marcado como "Páginas enganosas"
no Search Console, e copy de promessa de retorno é exatamente o padrão que
dispara essa classificação.

## O que isto NÃO resolve

Preencher os dois campos acaba com a duplicação **entre os 11 domínios**. Sobra a
duplicação **dentro de cada blog**: as 7 (ou 8) editorias de um mesmo site
continuam compartilhando a mesma `description`, porque não existe metadata por
rota. Isso é o `F-06` do OleySports / `CVC-09` do Crédito.vc, está no **P1 do
PRD do Oley** e exige código na imagem compartilhada.

## Conferência

```bash
for d in sp011.com.br ksports.midia.run esporteagora.midia.run \
         resenhavip.midia.run oleysports.com.br beeesportes.midia.run \
         pontofarma.com credito.vc apostaganha.midia.run \
         recebabet.midia.run ocomandantenews.com.br; do
  t=$(curl -s --max-time 20 "https://$d/" | grep -o '<title>[^<]*</title>' | head -1)
  m=$(curl -s --max-time 20 "https://$d/" | grep -o '<meta name="description" content="[^"]*"' | head -1)
  printf '%-24s %s\n%-24s %s\n\n' "$d" "$t" "" "$m"
done
```

Critério: **11 títulos distintos e 11 descrições distintas**, nenhuma contendo
`Notícia. Agora. Sempre.` nem `News. Now. Always.`

### Estado verificado

**Títulos — conferidos em produção nos 11 domínios (2026-08-22): PASSA.** Os 11
são distintos e idênticos aos propostos acima; nenhum traço da frase antiga; o
espaço sobrando no início da tagline do KSports saiu junto.

**Descrições — conferidas em produção nos 11 domínios (2026-08-22): PASSA.** As
11 são distintas e idênticas às propostas. Isso importava mais que os títulos:
pela precedência `seoDescription || tagline || siteName`
(`vite.config.ts:119`), um blog com `seoDescription` vazio serviria a tagline
como `<meta description>` da home **e de todas as editorias**, e ainda assim
teria `<title>` distinto — título distinto não provava descrição distinta.

Com as duas medições, `CVC-03` está fechado: **a duplicação de identidade entre
os 11 domínios acabou.**

Comando de reconferência:

```bash
for d in sp011.com.br ksports.midia.run esporteagora.midia.run          resenhavip.midia.run oleysports.com.br beeesportes.midia.run          pontofarma.com credito.vc apostaganha.midia.run          recebabet.midia.run ocomandantenews.com.br; do
  printf '%-24s %s
' "$d" "$(curl -s --max-time 20 "https://$d/" | grep -o 'name="description" content="[^"]*"' | head -1)"
done
```

## Documentos relacionados

- `docs/PRD-SEO-CREDITOVC-CRUZAMENTO-OLEYSPORTS.md` — `CVC-03` (identidade) e o
  roadmap do Crédito.vc.
- `docs/PRD-SEO-TECHNICAL-OLEYSPORTS-V2.md` — `F-06`, a metadata por rota que
  fecha a duplicação interna.
- `CLAUDE.md §4` (identidade de cada blog) e `§13` (nenhuma marca embutida na
  imagem compartilhada).
