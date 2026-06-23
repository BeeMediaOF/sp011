---
name: Object Storage GCS — uploads
description: Como os uploads de imagem/mídia são armazenados no GCS (Replit App Storage) sem usar o pacote @google-cloud/storage
---

## Regra
Uploads de imagem e mídia vão para GCS via sidecar HTTP — **não** usar `@google-cloud/storage` npm (falhou na instalação) nem salvar em disco local (apagado a cada deploy).

**Why:** `@google-cloud/storage` e `google-auth-library` não instalam no ambiente (`pnpm install` trava/crasha). O sidecar do Replit expõe a mesma API de signed URLs via HTTP em `http://127.0.0.1:1106`.

## Como aplicar

### Upload (POST)
1. `multer.memoryStorage()` recebe o arquivo em memória
2. Chama `POST http://127.0.0.1:1106/object-storage/signed-object-url` com `method: "PUT"`, `bucket_name: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `object_name: "uploads/<filename>"`, `expires_at: +15min`
3. Faz `fetch(signedUrl, { method: "PUT", body: buffer, headers: { "Content-Type": mime } })` diretamente para o GCS
4. Retorna `/api/uploads/<filename>` como URL pública

### Serve (GET)
1. Gera signed GET URL via sidecar (TTL 1h)
2. Faz `fetch(signedUrl)` e passa o buffer para `res.send()`
3. `Cache-Control: public, max-age=31536000, immutable` — browser faz cache por 1 ano
4. **Fallback**: se GCS não retornar o arquivo, tenta `data/uploads/<filename>` em disco (para arquivos pré-migração)

### Env vars necessárias
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — ID do bucket (gerado pelo `setupObjectStorage()`)
- `PUBLIC_OBJECT_SEARCH_PATHS` — definido automaticamente
- `PRIVATE_OBJECT_DIR` — definido automaticamente (não usado na implementação atual)

### Bucket provisionado
`replit-objstore-758dd711-de7c-4565-9e8b-609d21683c3e` — criado em 2026-06-23

## Arquivos relevantes
- `artifacts/api-server/src/routes/uploads.ts` — implementação completa
