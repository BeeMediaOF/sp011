---
name: Modelo Gemini padrão para reescrita RSS
description: Qual modelo Gemini usar no pipeline RSS e por quê o 2.0-flash falha
---

# Modelo Gemini do pipeline RSS

O default de modelo no `rewriteWithAI` (rssProcessor.ts) é `settings.rssAiModel || "gemini-2.5-flash"`.

**Por quê:** `gemini-2.0-flash` no tier grátis do Google AI Studio retorna 429 (quota esgotada) de forma persistente — não é mais viável para o fluxo de produção da VPS. `gemini-2.5-flash` funciona normalmente no mesmo tier grátis com a mesma `GEMINI_API_KEY`.

**Como aplicar:** se a reescrita por IA voltar a falhar com 429/quota ou com erros 401/OAuth confusos do Google, confirme primeiro o modelo. A chave pode ser válida (testar via REST `GET /v1beta/models?key=...` e `POST .../{model}:generateContent`) e ainda assim o modelo específico estar sem quota. Trocar o modelo costuma resolver. `settings.rssAiModel` (DB, tabela `settings`) sobrescreve o default quando presente.

**Provider:** com `GEMINI_API_KEY` setada e sem `rssAiProvider` no banco, o default é `gemini_direct` (chamada direta ao Google via SDK `@google/genai`, sem proxy Replit) — exatamente o que a VPS deve usar.
