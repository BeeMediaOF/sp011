---
name: Dependências problemáticas do api-server
description: Pacotes que causam crash no startup do api-server e como lidar com eles
---

## @replit/object-storage

**Problema:** Tem `@google-cloud/storage` como dependência transitiva, que não fica instalada no ambiente Replit. Ao ser marcado como `external` pelo esbuild (por estar em `dependencies`), o Node.js tenta resolvê-lo em runtime e crasha com `ERR_MODULE_NOT_FOUND: Cannot find package '@google-cloud/storage'`.

**Solução:** Nunca adicionar `@replit/object-storage` ao `dependencies` do api-server. Para upload de imagens de anúncios, usar URL de imagem (campo `imageUrl`) em vez de upload direto.

**How to apply:** Se o usuário pedir upload de imagens, sugerir URL externa ou usar o object-storage skill para verificar disponibilidade antes de adicionar a dependência.

## geoip-lite v2.x

**Problema:** A versão 2.x **não inclui** os arquivos de dados GeoIP no pacote — eles precisam ser baixados separadamente via MaxMind. Crasha no startup com `ENOENT: no such file or directory, open '.../data/geoip-country.dat'`. O erro acontece no `require` síncrono do módulo (preload).

**Solução:** Se precisar de geolocalização de IP, usar `geoip-lite` v1.x (que inclui os dados) ou simplesmente retornar `{}` sem geolocalização (feature não crítica). O admin login está em `/api/admin/login` (não `/api/auth/login`).

**How to apply:** Ao adicionar geoip-lite, usar v1 e verificar se os .dat files estão presentes. Se inviável, stub a função retornando `{}`.

## Limpeza de dist após mudanças de dependência

Quando uma dependência é removida mas o `dist/` já estava buildado com ela, o pnpm run build pode usar o cache do esbuild (Done in ~1s em vez de ~3s) e reempacotar o bundle antigo. Sempre fazer `rm -rf artifacts/api-server/dist && pnpm run build` após remoção de dependências externas.
