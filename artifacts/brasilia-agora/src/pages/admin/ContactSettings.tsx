import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type ContactInfo } from "../../lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, Save, Phone, Globe, Instagram, Youtube,
  MapPin, Building2, FileText, MessageCircle,
} from "lucide-react";

const CARD = { background: "#FFFFFF", borderRadius: "16px", boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const PRIMARY = "#0B2A66";
const ACCENT  = "#E71D36";

const FIELD_GROUPS: {
  title: string;
  icon: React.ElementType;
  color: string;
  fields: { key: keyof ContactInfo; label: string; placeholder: string; multiline?: boolean }[];
}[] = [
  {
    title: "Contato",
    icon: Mail,
    color: PRIMARY,
    fields: [
      { key: "supportEmail",  label: "E-mail de Suporte (Redação)",  placeholder: "suporte@portal.com.br" },
      { key: "displayEmail",  label: "E-mail de Exibição",           placeholder: "redacao@portal.com.br" },
      { key: "phone",         label: "Telefone",                     placeholder: "(61) 99888-0000" },
      { key: "whatsapp",      label: "WhatsApp",                     placeholder: "(61) 99888-0000" },
    ],
  },
  {
    title: "Redes Sociais",
    icon: Globe,
    color: "#7c3aed",
    fields: [
      { key: "facebook",  label: "Facebook URL",   placeholder: "https://facebook.com/..." },
      { key: "instagram", label: "Instagram URL",  placeholder: "https://instagram.com/..." },
      { key: "x",         label: "X / Twitter URL",placeholder: "https://x.com/..." },
      { key: "youtube",   label: "YouTube URL",    placeholder: "https://youtube.com/..." },
      { key: "tiktok",    label: "TikTok URL",     placeholder: "https://tiktok.com/@..." },
    ],
  },
  {
    title: "Dados Legais",
    icon: Building2,
    color: "#0d9488",
    fields: [
      { key: "address",  label: "Endereço",  placeholder: "Brasília, Distrito Federal" },
      { key: "cnpj",     label: "CNPJ",      placeholder: "00.000.000/0000-00" },
    ],
  },
  {
    title: "Textos Legais",
    icon: FileText,
    color: "#ea580c",
    fields: [
      { key: "legalInfo",      label: "Informações Legais",         placeholder: "Editor responsável, dados legais...", multiline: true },
      { key: "privacyPolicy",  label: "Política de Privacidade",    placeholder: "Conteúdo da política...",            multiline: true },
      { key: "termsOfUse",     label: "Termos de Uso",              placeholder: "Conteúdo dos termos...",             multiline: true },
    ],
  },
];

const INPUT_CLS = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#0B2A66] focus:ring-2 focus:ring-[#0B2A66]/10 transition-colors placeholder:text-slate-400";

export default function ContactSettings() {
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    adminApi.getContactInfo()
      .then((d) => { setInfo(d.contactInfo); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function update<K extends keyof ContactInfo>(field: K, value: ContactInfo[K]) {
    setInfo((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  async function handleSave() {
    if (!info) return;
    setSaving(true);
    try {
      await adminApi.updateContactInfo(info);
      toast({ title: "Salvo com sucesso!", description: "Informações de contato atualizadas." });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !info) {
    return (
      <AdminLayout title="Contato">
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Carregando...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Contato">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Page header card */}
        <div style={CARD} className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#EEF2FF" }}>
              <Mail size={18} style={{ color: PRIMARY }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Informações de Contato e Redes Sociais</h2>
              <p className="text-xs text-slate-500 mt-0.5">Exibidas no rodapé, página de contato e nas metas do site</p>
            </div>
          </div>
        </div>

        {/* Groups */}
        {FIELD_GROUPS.map(({ title, icon: Icon, color, fields }) => (
          <div key={title} style={CARD} className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "18" }}>
                <Icon size={14} style={{ color }} />
              </div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">{title}</h3>
            </div>
            <div className="space-y-4">
              {fields.map(({ key, label, placeholder, multiline }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
                  {multiline ? (
                    <textarea
                      value={(info[key] as string) ?? ""}
                      onChange={(e) => update(key, e.target.value as ContactInfo[typeof key])}
                      rows={4}
                      className={INPUT_CLS + " resize-none"}
                      placeholder={placeholder}
                    />
                  ) : (
                    <input
                      type="text"
                      value={(info[key] as string) ?? ""}
                      onChange={(e) => update(key, e.target.value as ContactInfo[typeof key])}
                      className={INPUT_CLS}
                      placeholder={placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Save */}
        <div className="flex justify-end pb-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: PRIMARY }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#0a2255"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = PRIMARY; }}
          >
            <Save size={16} />
            {saving ? "Salvando..." : "Salvar Tudo"}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
