/**
 * Cache das permissões do perfil Editor logado.
 *
 * Fonte ÚNICA usada por dois consumidores:
 *  - o chrome do painel (`AdminLayout`) para montar o menu lateral;
 *  - os guardas de rota (`RequirePermission` em `pages/Admin.tsx`) para bloquear
 *    o acesso direto por URL.
 *
 * Ter os dois lendo do MESMO cache em memória garante que menu, rota e (no
 * backend) API concordem sobre o que o editor pode acessar. Admin nunca passa
 * por aqui — ele enxerga tudo por definição.
 */
import { useState, useEffect, useCallback } from "react";
import { adminApi } from "./adminApi";

const LS_PERMS = "editor_permissions_cache";

let _cachedPerms: Set<string> | null = null;
let _permPromise: Promise<void> | null = null;

/** Lê o cache do localStorage de forma síncrona (sem bater na API). */
export function getCachedPermsSync(): Set<string> {
  if (_cachedPerms) return _cachedPerms;
  try {
    const raw = localStorage.getItem(LS_PERMS);
    if (raw) return new Set<string>(JSON.parse(raw) as string[]);
  } catch {}
  return new Set<string>();
}

/** Zera o cache (usado no logout e ao trocar de conta). */
export function invalidatePermissionsCache(): void {
  _cachedPerms = null;
  _permPromise = null;
  try { localStorage.removeItem(LS_PERMS); } catch {}
}

/**
 * Carrega (uma vez) as permissões do editor logado. Para admin devolve conjunto
 * vazio com `loaded=true` de imediato — o consumidor deve liberar tudo antes de
 * consultar o conjunto.
 */
export function useEditorPermissions(role: string): { permSet: Set<string>; loaded: boolean } {
  const [permSet, setPermSet] = useState<Set<string>>(() => {
    if (role !== "editor") return new Set<string>();
    return getCachedPermsSync();
  });
  const [loaded, setLoaded] = useState(role !== "editor" || _cachedPerms !== null);

  const fetchPerms = useCallback(() => {
    if (role !== "editor") return;
    if (_cachedPerms) { setPermSet(_cachedPerms); setLoaded(true); return; }
    if (!_permPromise) {
      _permPromise = adminApi.getMyPermissions()
        .then(({ permissions }) => {
          _cachedPerms = new Set(permissions);
          try { localStorage.setItem(LS_PERMS, JSON.stringify(permissions)); } catch {}
        })
        .catch(() => { _permPromise = null; });
    }
    // TODA instância se inscreve na promise compartilhada. Se só quem a cria
    // recebesse setState, o outro consumidor (menu lateral ou guarda de rota,
    // conforme a ordem de montagem) ficaria em "Carregando permissões..." para
    // sempre. Em falha, `loaded=true` com o cache local — a próxima montagem
    // tenta de novo (a promise foi zerada no catch).
    _permPromise.then(() => {
      if (_cachedPerms) setPermSet(_cachedPerms);
      setLoaded(true);
    });
  }, [role]);

  useEffect(() => { fetchPerms(); }, [fetchPerms]);

  return { permSet, loaded };
}
