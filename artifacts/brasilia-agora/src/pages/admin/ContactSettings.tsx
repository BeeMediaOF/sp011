import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type ContactInfo } from "../../lib/adminApi";
import { Mail, Save } from "lucide-react";

export default function ContactSettings() {
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getContactInfo().then((d) => { setInfo(d.contactInfo); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  function update<K extends keyof ContactInfo>(field: K, value: ContactInfo[K]) {
    setInfo((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  async function handleSave() {
    if (!info) return;
    setSaving(true);
    try {
      await adminApi.updateContactInfo(info);
      alert("Informações salvas com sucesso!");
    } catch (err) {
      alert((err as Error).message);
    } finally { setSaving(false); }
  }

  if (loading || !info) return <AdminLayout title="Contato"><div className="text-center py-12 text-gray-400">Carregando...</div></AdminLayout>;

  const fields: { key: keyof ContactInfo; label: string; placeholder: string; type?: string }[] = [
    { key: "supportEmail", label: "E-mail de Suporte (Redação)", placeholder: "suporte@beemedia.ai" },
    { key: "displayEmail", label: "E-mail de Exibição", placeholder: "redacao@brasiliaagora.com.br" },
    { key: "phone", label: "Telefone", placeholder: "(61) 99888-0000" },
    { key: "whatsapp", label: "WhatsApp", placeholder: "(61) 99888-0000" },
    { key: "facebook", label: "Facebook URL", placeholder: "https://facebook.com/..." },
    { key: "instagram", label: "Instagram URL", placeholder: "https://instagram.com/..." },
    { key: "x", label: "X / Twitter URL", placeholder: "https://x.com/..." },
    { key: "youtube", label: "YouTube URL", placeholder: "https://youtube.com/..." },
    { key: "tiktok", label: "TikTok URL", placeholder: "https://tiktok.com/@..." },
    { key: "address", label: "Endereço", placeholder: "Brasília, Distrito Federal" },
    { key: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00" },
    { key: "legalInfo", label: "Informações Legais (Texto)", placeholder: "Editor responsável, dados legais..." },
    { key: "privacyPolicy", label: "Política de Privacidade (Texto)", placeholder: "Conteúdo da política..." },
    { key: "termsOfUse", label: "Termos de Uso (Texto)", placeholder: "Conteúdo dos termos..." },
  ];

  return (
    <AdminLayout title="Informações de Contato">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Mail className="text-[#F5A623]" size={24} />
          <h2 className="text-xl font-bold text-[#1a2448]">Informações de Contato e Redes Sociais</h2>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          {fields.map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              {(key === "legalInfo" || key === "privacyPolicy" || key === "termsOfUse") ? (
                <textarea value={info[key]} onChange={(e) => update(key, e.target.value)} rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" placeholder={placeholder} />
              ) : (
                <input type={type || "text"} value={info[key]} onChange={(e) => update(key, e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" placeholder={placeholder} />
              )}
            </div>
          ))}

          <div className="flex justify-end pt-4">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-[#1a2448] text-white rounded-lg font-semibold text-sm hover:bg-[#2a3458] disabled:opacity-50">
              <Save size={16} /> {saving ? "Salvando..." : "Salvar Tudo"}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
