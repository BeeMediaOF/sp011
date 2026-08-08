/**
 * Cache das permissões do USUÁRIO logado (perfis Editor e Colunista).
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
  // Admin é o único que não passa por aqui. Todo o resto (editor, colunista e
  // qualquer perfil futuro) resolve pelo conjunto do PRÓPRIO usuário.
  const managed = role !== "" && role !== "admin";
  const [permSet, setPermSet] = useState<Set<string>>(() => {
    if (!managed) return new Set<string>();
    return getCachedPermsSync();
  });
  const [loaded, setLoaded] = useState(!managed || _cachedPerms !== null);

  const fetchPerms = useCallback(() => {
    if (!managed) return;
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
  }, [managed]);

  useEffect(() => { fetchPerms(); }, [fetchPerms]);

  return { permSet, loaded };
}

/**
 * Permissão fina para ESCONDER ações na UI (botões de criar/editar/excluir/etc.).
 * Admin sempre pode; editor depende do conjunto carregado. Lê o papel direto do
 * localStorage (mesma chave de `getStoredRole` em `pages/Admin.tsx`) para não criar
 * ciclo de import lib↔page. É fail-closed: enquanto o conjunto não carrega, `can`
 * devolve `false` para editor (o botão só aparece depois de confirmada a permissão).
 * As chaves são as de ESCRITA que o backend já exige (ex.: `ads.manage`,
 * `articles.create`), nunca as `*.view`.
 */
export function useCan(): { can: (key: string) => boolean; loaded: boolean } {
  const role = (typeof localStorage !== "undefined" && localStorage.getItem("admin_role")) || "";
  const { permSet, loaded } = useEditorPermissions(role);
  const isAdmin = role === "admin";
  const can = useCallback((key: string) => isAdmin || permSet.has(key), [isAdmin, permSet]);
  return { can, loaded };
}
