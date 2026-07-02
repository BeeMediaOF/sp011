/**
 * Editor completo do rodapé (aba "Rodapé" em Blocos da Home).
 *
 * Carrega o rodapé efetivo atual (config salva + defaults do hub de Contato e
 * do menu), permite editar textos, redes, colunas de links, contato,
 * newsletter, copyright e links legais — e salva tudo em settings.footerConfig.
 */
import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import {
  resolveFooterConfig, type FooterConfig, type FooterColumn, type FooterLink,
  type FooterSocialKey,
} from "../../lib/footerConfig";
import {
  ChevronDown, Plus, Trash2, Save, RefreshCw, GripVertical,
} from "lucide-react";

const INPUT = "w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] transition-colors";
const LABEL = "text-[11px] font-medium text-[#64748B] mb-1 block";

const SOCIAL_FIELDS: { key: FooterSocialKey; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "facebook",  label: "Facebook",  placeholder: "https://facebook.com/…" },
  { key: "x",         label: "X (Twitter)", placeholder: "https://x.com/…" },
  { key: "youtube",   label: "YouTube",   placeholder: "https://youtube.com/@…" },
  { key: "tiktok",    label: "TikTok",    placeholder: "https://tiktok.com/@…" },
  { key: "whatsapp",  label: "WhatsApp",  placeholder: "(61) 99999-9999 ou link wa.me" },
];

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function Section({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#E2E8F0] rounded-2xl bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-[#F8FAFC] transition-colors">
        <span className="text-[12px] font-bold text-[#0F172A]">{title}</span>
        <ChevronDown size={14} className={`text-[#94A3B8] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-[#F1F5F9]">{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className="relative inline-flex w-9 h-5 rounded-full transition-colors focus:outline-none shrink-0"
      style={{ backgroundColor: checked ? "#0B2A66" : "#CBD5E1" }}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function LinkListEditor({ links, onChange }: {
  links: FooterLink[]; onChange: (next: FooterLink[]) => void;
}) {
  function update(id: string, patch: Partial<FooterLink>) {
    onChange(links.map((l) => l.id === id ? { ...l, ...patch } : l));
  }
  function move(idx: number, dir: 1 | -1) {
    const to = idx + dir;
    if (to < 0 || to >= links.length) return;
    const next = [...links];
    [next[idx], next[to]] = [next[to]!, next[idx]!];
    onChange(next);
  }
  return (
    <div className="space-y-1.5">
      {links.map((l, idx) => (
        <div key={l.id} className="flex items-center gap-1.5">
          <button type="button" title="Mover para cima" onClick={() => move(idx, -1)} disabled={idx === 0}
            className="text-[#CBD5E1] hover:text-[#64748B] disabled:opacity-30 shrink-0">
            <GripVertical size={13} />
          </button>
          <input value={l.label} onChange={(e) => update(l.id, { label: e.target.value })}
            placeholder="Texto" className={`${INPUT} !px-2 !py-1.5 !text-xs flex-[2] min-w-0`} />
          <input value={l.href} onChange={(e) => update(l.id, { href: e.target.value })}
            placeholder="/pagina ou https://…" className={`${INPUT} !px-2 !py-1.5 !text-xs flex-[3] min-w-0 font-mono`} />
          <button type="button" title="Remover link" onClick={() => onChange(links.filter((x) => x.id !== l.id))}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button type="button"
        onClick={() => onChange([...links, { id: uid(), label: "", href: "" }])}
        className="flex items-center gap-1 text-[11px] font-semibold text-[#0B2A66] hover:underline">
        <Plus size={11} /> Adicionar link
      </button>
    </div>
  );
}

export default function FooterEditor({ onSave, saving }: {
  onSave: (cfg: FooterConfig) => Promise<void> | void;
  saving: boolean;
}) {
  const [cfg, setCfg] = useState<FooterConfig | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    Promise.all([adminApi.getSettings(), adminApi.getContactInfo(), adminApi.getMenu()])
      .then(([s, c, m]) => {
        const settings = s.settings;
        // Config efetiva (salva + defaults) vira o estado editável: o usuário
        // vê exatamente o que o site mostra hoje e edita a partir daí.
        const resolved = resolveFooterConfig({
          config: settings.footerConfig,
          contact: c.contactInfo,
          menuItems: m.menuItems.filter((i) => i.visible),
          siteName: settings.siteName,
          tagline: settings.tagline,
        });
        setCfg({
          description: resolved.description,
          showSocial: resolved.showSocial,
          social: Object.fromEntries(resolved.social.map((s2) => [s2.key, s2.href])),
          columns: resolved.columns.map((col) => ({
            ...col,
            links: col.links.map((l) => ({ ...l })),
          })),
          showContact: resolved.showContact,
          phone: resolved.phone,
          email: resolved.email,
          showNewsletter: resolved.showNewsletter,
          newsletterTitle: resolved.newsletterTitle,
          copyright: settings.footerConfig?.copyright ?? "© {year} {site}. Todos os direitos reservados.",
          legalLinks: resolved.legalLinks.map((l) => ({ ...l })),
        });
      })
      .catch(() => setLoadErr(true));
  }, []);

  if (loadErr) {
    return <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">Erro ao carregar o rodapé — recarregue a página.</p>;
  }
  if (!cfg) {
    return <div className="flex items-center gap-2 text-xs text-[#64748B] py-3"><RefreshCw size={12} className="animate-spin" /> Carregando conteúdo do rodapé…</div>;
  }

  function patch(p: Partial<FooterConfig>) {
    setCfg((c) => ({ ...(c ?? {}), ...p }));
  }

  function updateColumn(id: string, p: Partial<FooterColumn>) {
    patch({ columns: (cfg!.columns ?? []).map((c) => c.id === id ? { ...c, ...p } : c) });
  }

  async function save() {
    await onSave(cfg!);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2500);
  }

  const columns = cfg.columns ?? [];

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider pt-1">Conteúdo do rodapé</p>

      <Section title="Descrição e copyright" defaultOpen>
        <div>
          <label className={LABEL}>Texto abaixo da logo</label>
          <textarea value={cfg.description ?? ""} onChange={(e) => patch({ description: e.target.value })}
            rows={2} className={`${INPUT} resize-y`} />
        </div>
        <div>
          <label className={LABEL}>Direitos autorais — use {"{year}"} e {"{site}"}</label>
          <input value={cfg.copyright ?? ""} onChange={(e) => patch({ copyright: e.target.value })} className={INPUT} />
        </div>
      </Section>

      <Section title="Redes sociais">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-[#334155]">Exibir ícones de redes</span>
          <Toggle checked={cfg.showSocial ?? true} onChange={() => patch({ showSocial: !(cfg.showSocial ?? true) })} />
        </div>
        {(cfg.showSocial ?? true) && SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className={LABEL}>{label}</label>
            <input value={cfg.social?.[key] ?? ""} placeholder={placeholder}
              onChange={(e) => patch({ social: { ...(cfg.social ?? {}), [key]: e.target.value } })}
              className={INPUT} />
          </div>
        ))}
        <p className="text-[10px] text-[#94A3B8] leading-relaxed">Deixe vazio para ocultar a rede. Valores iniciais vêm do hub de Contato.</p>
      </Section>

      <Section title={`Colunas de links (${columns.length})`}>
        {columns.map((col) => (
          <div key={col.id} className="border border-[#F1F5F9] rounded-xl p-2.5 space-y-2 bg-[#FAFBFC]">
            <div className="flex items-center gap-1.5">
              <input value={col.title} onChange={(e) => updateColumn(col.id, { title: e.target.value })}
                placeholder="Título da coluna" className={`${INPUT} !py-1.5 !text-xs font-bold`} />
              <button type="button" title="Remover coluna"
                onClick={() => patch({ columns: columns.filter((c) => c.id !== col.id) })}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
            <LinkListEditor links={col.links} onChange={(links) => updateColumn(col.id, { links })} />
          </div>
        ))}
        <button type="button"
          onClick={() => patch({ columns: [...columns, { id: uid(), title: "Nova coluna", links: [] }] })}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-[#0B2A66] border border-dashed border-[#CBD5E1] rounded-xl hover:bg-[#F8FAFC] transition-colors">
          <Plus size={13} /> Adicionar coluna
        </button>
      </Section>

      <Section title="Contato">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-[#334155]">Exibir bloco de contato</span>
          <Toggle checked={cfg.showContact ?? true} onChange={() => patch({ showContact: !(cfg.showContact ?? true) })} />
        </div>
        {(cfg.showContact ?? true) && (
          <>
            <div>
              <label className={LABEL}>Telefone</label>
              <input value={cfg.phone ?? ""} onChange={(e) => patch({ phone: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>E-mail</label>
              <input value={cfg.email ?? ""} onChange={(e) => patch({ email: e.target.value })} className={INPUT} />
            </div>
          </>
        )}
      </Section>

      <Section title="Newsletter">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-[#334155]">Exibir captura de e-mails</span>
          <Toggle checked={cfg.showNewsletter ?? true} onChange={() => patch({ showNewsletter: !(cfg.showNewsletter ?? true) })} />
        </div>
        {(cfg.showNewsletter ?? true) && (
          <div>
            <label className={LABEL}>Título da chamada</label>
            <input value={cfg.newsletterTitle ?? ""} onChange={(e) => patch({ newsletterTitle: e.target.value })} className={INPUT} />
          </div>
        )}
      </Section>

      <Section title="Links legais (linha final)">
        <LinkListEditor links={cfg.legalLinks ?? []} onChange={(legalLinks) => patch({ legalLinks })} />
      </Section>

      {savedOk && (
        <p className="text-[12px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          Rodapé salvo — já visível no site e na prévia.
        </p>
      )}
      <button type="button" onClick={() => void save()} disabled={saving}
        className="w-full py-2.5 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
        {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
        {saving ? "Salvando…" : "Salvar rodapé"}
      </button>
    </div>
  );
}
