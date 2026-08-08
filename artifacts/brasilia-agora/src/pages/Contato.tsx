import React, { useState } from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { Send, CheckCircle, Mail, Phone, MapPin } from "lucide-react";
import { useSite } from "../hooks/useSite";
import { useT } from "../lib/i18n";

export default function Contato() {
  const { settings } = useSite();
  const { lang } = useT();
  const en = lang === "en";
  // Nunca a marca padrão (BRAND.name): vazio até /api/site responder, depois o nome real.
  const siteName = settings?.siteName ?? "";
  // Contato dirigido por settings. Sem reserva embutida: os antigos padrões
  // (e-mail, telefone e endereço de Brasília) eram de OUTRO portal da rede e
  // apareciam como se fossem deste blog. Não configurado = campo omitido.
  const contact = settings?.contact;
  const contactEmail = contact?.displayEmail?.trim() ?? "";
  const contactPhone = contact?.phone?.trim() ?? "";
  const contactAddress = contact?.address?.trim() ?? "";
  const privacyEmail = contact?.privacyEmail?.trim();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !message) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = await res.json();
      if (data.ok) {
        setSent(true);
        setName(""); setEmail(""); setSubject(""); setMessage("");
      } else {
        alert(data.error || "Erro ao enviar");
      }
    } catch (err) {
      alert((err as Error).message);
    } finally { setSending(false); }
  }

  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />

      <main className="flex-1 bg-white py-12">
        <div className="max-w-[1280px] mx-auto px-4">
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-black text-[#1a2448] uppercase tracking-tight mb-3">{en ? "Contact Us" : "Fale Conosco"}</h1>
            <p className="text-gray-500 max-w-2xl mx-auto min-h-[1.5rem]">{settings ? (en
              ? `Send your message to the ${siteName} newsroom. We will reply as soon as possible.`
              : `Envie sua mensagem para a redação do ${siteName}. Responderemos o mais breve possível.`) : ""}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Formulário */}
            <div className="lg:col-span-2">
              {sent ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                  <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
                  <h3 className="text-xl font-bold text-green-700 mb-2">{en ? "Message sent!" : "Mensagem enviada!"}</h3>
                  <p className="text-green-600 mb-4">{en ? "Thank you for reaching out. We will get back to you soon." : "Obrigado pelo contato. Em breve entraremos em contato."}</p>
                  <button onClick={() => setSent(false)} className="px-6 py-2 bg-[#1a2448] text-white rounded-lg font-semibold text-sm hover:bg-[#2a3458]">
                    {en ? "Send another message" : "Enviar nova mensagem"}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{en ? "Name *" : "Nome *"}</label>
                      <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{en ? "Subject" : "Assunto"}</label>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{en ? "Message *" : "Mensagem *"}</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
                  </div>
                  <div className="text-xs text-gray-400">{en ? "* Required fields" : "* Campos obrigatórios"}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {contactEmail ? <>{en ? "Sent to" : "Enviar para"}: <b>{contactEmail}</b></> : null}
                    </span>
                    <button type="submit" disabled={sending} className="flex items-center gap-2 px-6 py-2 bg-[#F5A623] text-[#1a2448] rounded-lg font-semibold text-sm hover:bg-[#e09520] disabled:opacity-50">
                      <Send size={16} /> {sending ? (en ? "Sending..." : "Enviando...") : (en ? "Send Message" : "Enviar Mensagem")}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Sidebar Info */}
            <div className="space-y-6">
              {(contactEmail || privacyEmail) && (
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                  <h3 className="font-bold text-[#1a2448] mb-4 flex items-center gap-2"><Mail size={18} /> {en ? "Email" : "E-mail"}</h3>
                  {contactEmail && <p className="text-sm text-gray-600">{contactEmail}</p>}
                  {privacyEmail && (
                    <p className="text-sm text-gray-500 mt-1">{en ? "Privacy" : "Privacidade"}: {privacyEmail}</p>
                  )}
                </div>
              )}
              {contactPhone && (
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                  <h3 className="font-bold text-[#1a2448] mb-4 flex items-center gap-2"><Phone size={18} /> {en ? "Phone" : "Telefone"}</h3>
                  <p className="text-sm text-gray-600">{contactPhone}</p>
                </div>
              )}
              {contactAddress && (
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                  <h3 className="font-bold text-[#1a2448] mb-4 flex items-center gap-2"><MapPin size={18} /> {en ? "Address" : "Endereço"}</h3>
                  <p className="text-sm text-gray-600">{contactAddress}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
