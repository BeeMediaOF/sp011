---
name: otplib v13 API funcional
description: otplib v13 não exporta o singleton `authenticator`; API é funcional e assíncrona
---

O pacote `otplib` na versão 13.x mudou completamente a API. Não existe mais o `authenticator` singleton.

**Correto (v13):**
```typescript
import { generateSecret, verifySync, generateURI } from "otplib";

const secret = generateSecret();
const otpauth = generateURI({ label: user.email, issuer: "Nome do App", secret });
const isValid = verifySync({ token: code, secret, strategy: "totp" });
```

**Incorreto (causa TS2305):**
```typescript
import { authenticator } from "otplib"; // ❌ não existe mais
authenticator.generateSecret();
```

**Why:** A v13 substituiu a classe Authenticator por funções puras para melhor tree-shaking.

**How to apply:** Sempre que precisar gerar/verificar TOTP neste projeto, use as funções nomeadas acima, nunca o `authenticator`.
