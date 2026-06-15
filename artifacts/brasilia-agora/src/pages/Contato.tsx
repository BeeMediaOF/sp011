import React, { useState } from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { Send, CheckCircle, Mail, Phone, MapPin } from "lucide-react";

export default function Contato() {
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
            <h1 className="text-3xl md:text-4xl font-black text-[#1a2448] uppercase tracking-tight mb-3">Fale Conosco</h1>
            <p className="text-gray-500 max-w-2xl mx-auto">Envie sua mensagem para a redação do Brasília Agora. Responderemos o mais breve possível.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Formulário */}
            <div className="lg:col-span-2">
              {sent ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                  <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
                  <h3 className="text-xl font-bold text-green-700 mb-2">Mensagem enviada!</h3>
                  <p className="text-green-600 mb-4">Obrigado pelo contato. Em breve entraremos em contato.</p>
                  <button onClick={() => setSent(false)} className="px-6 py-2 bg-[#1a2448] text-white rounded-lg font-semibold text-sm hover:bg-[#2a3458]">
                    Enviar nova mensagem
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                      <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem *</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
                  </div>
                  <div className="text-xs text-gray-400">* Campos obrigatórios</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Enviar para: <b>suporte@beemedia.ai</b></span>
                    <button type="submit" disabled={sending} className="flex items-center gap-2 px-6 py-2 bg-[#F5A623] text-[#1a2448] rounded-lg font-semibold text-sm hover:bg-[#e09520] disabled:opacity-50">
                      <Send size={16} /> {sending ? "Enviando..." : "Enviar Mensagem"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Sidebar Info */}
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                <h3 className="font-bold text-[#1a2448] mb-4 flex items-center gap-2"><Mail size={18} /> E-mail</h3>
                <p className="text-sm text-gray-600">redacao@brasiliaagora.com.br</p>
                <p className="text-sm text-gray-500 mt-1">suporte@beemedia.ai</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                <h3 className="font-bold text-[#1a2448] mb-4 flex items-center gap-2"><Phone size={18} /> Telefone</h3>
                <p className="text-sm text-gray-600">(61) 99888-0000</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                <h3 className="font-bold text-[#1a2448] mb-4 flex items-center gap-2"><MapPin size={18} /> Endereço</h3>
                <p className="text-sm text-gray-600">Brasília, Distrito Federal</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
