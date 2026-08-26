# `caddy/verify/` — arquivos servidos na RAIZ de cada domínio

Um diretório por blog. Tudo que estiver em `caddy/verify/<BLOG_ID>/` é servido
na raiz do domínio daquele blog — e **só dele**.

```
caddy/verify/creditovc/google2242104f477c8204.html
   → https://credito.vc/google2242104f477c8204.html
```

Serve para verificação de propriedade (Google Search Console, Bing Webmaster,
Meta Business, Pinterest), `ads.txt`, `security.txt` e qualquer outro estático
de raiz que o app não gera.

## Por que não dá para pôr em `public/` do frontend

A imagem `blog-web` é **uma só** para os 11 blogs (CLAUDE.md §13). Um arquivo em
`artifacts/brasilia-agora/public/` apareceria na raiz de **todos** os domínios da
rede — o token do Search Console do credito.vc responderia também em
oleysports.com.br, ocomandantenews.com.br e nos outros oito.

E, desde a v98, nem funcionaria: o `staticExistsPlugin` (CLAUDE.md §17) devolve
404 para qualquer path com extensão que não exista em `dist/public`.

Aqui o arquivo mora **fora da imagem**, no host, isolado por blog.

## O caminho rápido: um comando

Instale o helper **uma vez** na VPS:

```bash
cd /opt/sp011
git pull
ln -sf /opt/sp011/deploy/verify-add.sh /usr/local/bin/verify-add
verify-add
```

Depois disso, publicar um arquivo em qualquer blog é uma linha:

```bash
verify-add credito.vc google2242104f477c8204.html
```

Ele aceita o **domínio ou o BLOG_ID** e descobre o outro lendo
`caddy/sites/*.caddy`; deriva o conteúdo sozinho quando o nome começa com
`google` (o arquivo do Search Console é sempre
`google-site-verification: <nome>`); escreve no diretório certo; e confere com
`curl` na origem **e** no domínio público, dizendo qual dos dois falhou.

Outros usos:

```bash
verify-add creditovc                                     # lista o que ja esta publicado
verify-add oleysports BingSiteAuth.xml '<?xml version="1.0"?>...'
verify-add ocomandante ads.txt 'google.com, pub-0000, DIRECT, f08c47fec0942fa0'
```

**Não precisa de rebuild, nem de `caddy reload`, nem de restart.** O
`file_server` do Caddy lê do disco a cada requisição: o arquivo passa a
responder no instante em que aparece no diretório.

O arquivo criado assim fica **não rastreado** no git. Sobrevive a `git pull`,
mas some se a VPS for reprovisionada — por isso o caminho abaixo também existe.

## O caminho permanente: pelo repositório

Para o arquivo ficar registrado e sobreviver a um reprovisionamento:

1. Crie o arquivo em `caddy/verify/<BLOG_ID>/<nome>`.
2. Commit + push.
3. Na VPS: `cd /opt/sp011 && git pull`.

Se o arquivo já estiver na VPS pelo `verify-add` quando o commit chegar, o
`git pull` reclama de "untracked working tree file";
`rm caddy/verify/<BLOG_ID>/<nome>` antes do pull resolve.

## Extensões aceitas

O matcher `@verify` do `Caddyfile` cobre `*.html`, `*.txt`, `*.xml` e `*.json` —
suficiente para tudo que os buscadores pedem:

| Serviço | Arquivo |
|---|---|
| Google Search Console | `google<hash>.html` |
| Bing Webmaster | `BingSiteAuth.xml` |
| Meta Business | `<hash>.html` |
| Pinterest | `pinterest-<hash>.html` |
| Anúncios | `ads.txt` |

Arquivo sem extensão não é servido — é proposital, para não abrir a raiz do site
inteira. Extensão nova exige uma linha no `path` do matcher.

## O que ele NÃO sombreia

O matcher só casa se o arquivo **existir** no diretório daquele blog. Enquanto
não existir, a requisição segue o caminho normal para o `web`. Ou seja: `/`,
`/artigo/<slug>` e as editorias nunca passam por aqui.

O outro lado disso é que um `robots.txt` ou `sitemap.xml` colocado aqui **vence**
o que o app gera. Só faça isso de propósito — o sitemap do app sai do banco e se
mantém sozinho (CLAUDE.md §17).

## Blog atrás do Cloudflare (hoje só o credito.vc)

O Cloudflare pode ter cacheado o 404 anterior. Se o `curl` direto na origem
responder 200 e o domínio público continuar em 404, purgue a URL no painel da
zona (Caching → Configuration → Purge Everything, ou purge por URL).

Para conferir a origem sem passar pelo Cloudflare, de dentro da própria VPS:

```bash
curl -sI --resolve credito.vc:443:127.0.0.1 -k https://credito.vc/google2242104f477c8204.html | head -3
```
