/**
 * Planejamento de retenção de dados pessoais (PRD-12/LGPD) — módulo PURO (sem
 * I/O), testável com `node --test`. Só calcula O QUE seria expurgado/anonimizado
 * por idade; a EXECUÇÃO (dry-run por padrão, dupla trava p/ apply) vive em
 * `scripts/retentionSweep.ts`. Os registros de segurança/forense ficam FORA do
 * expurgo automático (retenção documentada + exclusão manual sob revisão).
 */

export interface RetentionAction {
  table: string;
  mode: "anonymize" | "delete";
  /** Colunas de PII a anular no modo anonymize. */
  columns?: string[];
  /** Coluna de idade usada no predicado (created_at / reset_at). */
  ageColumn: string;
  days: number;
  cutoff: Date;
  description: string;
}

export interface RetentionConfig {
  contactMessagesAnonymizeDays: number;
  /** null = deletar a linha inteira DESLIGADO por default. */
  contactMessagesDeleteDays: number | null;
  loginAttemptsDays: number;
  endpointRateLimitsDays: number;
}

export const DEFAULT_RETENTION: RetentionConfig = {
  contactMessagesAnonymizeDays: 180,
  contactMessagesDeleteDays: null,
  loginAttemptsDays: 7,
  endpointRateLimitsDays: 7,
};

const DAY_MS = 86_400_000;

/** Devolve as ações de retenção com os cutoffs (= now - dias). Função PURA. */
export function planRetention(now: Date, cfg: RetentionConfig = DEFAULT_RETENTION): RetentionAction[] {
  const cut = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const actions: RetentionAction[] = [
    {
      table: "contact_messages", mode: "anonymize", columns: ["ip_address", "user_agent"],
      ageColumn: "created_at", days: cfg.contactMessagesAnonymizeDays, cutoff: cut(cfg.contactMessagesAnonymizeDays),
      description: "Anonimiza IP/UA de mensagens de contato antigas (minimização, LGPD Art. 6).",
    },
    {
      table: "login_attempts", mode: "delete", ageColumn: "reset_at",
      days: cfg.loginAttemptsDays, cutoff: cut(cfg.loginAttemptsDays),
      description: "Remove estado de rate-limit de login já expirado (chaveado por IP).",
    },
    {
      table: "endpoint_rate_limits", mode: "delete", ageColumn: "reset_at",
      days: cfg.endpointRateLimitsDays, cutoff: cut(cfg.endpointRateLimitsDays),
      description: "Remove estado de rate-limit de endpoint já expirado.",
    },
  ];
  if (cfg.contactMessagesDeleteDays != null) {
    actions.push({
      table: "contact_messages", mode: "delete", ageColumn: "created_at",
      days: cfg.contactMessagesDeleteDays, cutoff: cut(cfg.contactMessagesDeleteDays),
      description: "Remove mensagens de contato muito antigas (desligado por default).",
    });
  }
  return actions;
}
