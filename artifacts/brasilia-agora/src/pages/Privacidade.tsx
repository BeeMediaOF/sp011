import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { Link } from "wouter";
import { Shield, Eye, Lock, Database, UserCheck, Mail, RefreshCw, ChevronRight } from "lucide-react";

const LAST_UPDATE = "23 de junho de 2025";

interface Section {
  id: string;
  icon: React.ElementType;
  color: string;
  title: string;
  content: string;
}

import React from "react";

const SECTIONS: Section[] = [
  {
    id: "quem-somos",
    icon: Shield,
    color: "#0B2A66",
    title: "1. Quem somos",
    content: `O <strong>Brasília Agora</strong> é um portal de notícias dedicado à cobertura jornalística do Distrito Federal e do Brasil, operado pela redação localizada em Brasília – DF. Somos o controlador dos dados pessoais coletados neste site, nos termos da Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).`,
  },
  {
    id: "dados-coletados",
    icon: Database,
    color: "#0284c7",
    title: "2. Dados que coletamos",
    content: `Coletamos apenas os dados estritamente necessários para o funcionamento do portal e a melhoria da sua experiência de leitura:<br/><br/>
    <strong>a) Dados fornecidos voluntariamente</strong><br/>
    • <em>Formulário de contato:</em> nome, e-mail e mensagem, utilizados exclusivamente para responder à sua solicitação.<br/>
    • <em>Newsletter:</em> endereço de e-mail para envio de destaques editoriais. Você pode cancelar a qualquer momento.<br/><br/>
    <strong>b) Dados coletados automaticamente</strong><br/>
    • Endereço IP (anonimizado após 24 h), tipo de navegador, sistema operacional, páginas visitadas e tempo de permanência — usados para análise de audiência e melhoria do conteúdo.<br/>
    • Cookies técnicos necessários ao funcionamento do site (sessão, preferências de tema e LGPD consent).<br/>
    • Cookies analíticos de terceiros (Google Analytics / Plausible), se você consentir.`,
  },
  {
    id: "finalidades",
    icon: Eye,
    color: "#16a34a",
    title: "3. Para que usamos seus dados",
    content: `Os dados pessoais coletados são utilizados exclusivamente para:<br/><br/>
    • <strong>Prestação do serviço jornalístico</strong> — exibição de notícias, personalização de conteúdo e funcionamento técnico do portal.<br/>
    • <strong>Comunicação com o leitor</strong> — resposta a mensagens enviadas pelo formulário de contato e envio de newsletters solicitadas.<br/>
    • <strong>Segurança e prevenção a fraudes</strong> — identificação de acessos abusivos e proteção da integridade da plataforma.<br/>
    • <strong>Análise de audiência</strong> — estatísticas agregadas e anonimizadas para orientação editorial e melhoria do portal.<br/>
    • <strong>Cumprimento de obrigações legais</strong> — atendimento a requisições de autoridades competentes, quando exigido por lei.`,
  },
  {
    id: "base-legal",
    icon: UserCheck,
    color: "#7c3aed",
    title: "4. Base legal para o tratamento",
    content: `O tratamento dos seus dados se fundamenta nas seguintes bases legais previstas no art. 7º da LGPD:<br/><br/>
    • <strong>Consentimento</strong> (art. 7º, I): cookies analíticos e envio de newsletter — você concede e pode revogar a qualquer momento.<br/>
    • <strong>Legítimo interesse</strong> (art. 7º, IX): análise de audiência anonimizada, segurança do portal e envio de alertas editoriais urgentes.<br/>
    • <strong>Execução de contrato ou procedimentos preliminares</strong> (art. 7º, V): resposta às mensagens enviadas pelo formulário de contato.<br/>
    • <strong>Cumprimento de obrigação legal</strong> (art. 7º, II): conservação de registros de acesso conforme o Marco Civil da Internet (Lei nº 12.965/2014).`,
  },
  {
    id: "compartilhamento",
    icon: Lock,
    color: "#dc2626",
    title: "5. Compartilhamento de dados",
    content: `<strong>Não vendemos, alugamos nem comercializamos seus dados pessoais.</strong><br/><br/>
    Podemos compartilhar informações nas seguintes situações:<br/><br/>
    • <strong>Prestadores de serviço essenciais</strong> — provedores de hospedagem, serviço de e-mail e ferramentas analíticas contratadas, que atuam como operadores de dados e estão vinculados a contratos de confidencialidade e segurança.<br/>
    • <strong>Redes de entrega de conteúdo (CDN)</strong> — para otimização de carregamento de imagens e vídeos jornalísticos.<br/>
    • <strong>Obrigação legal ou ordem judicial</strong> — quando exigido por autoridade competente, com ciência do titular sempre que legalmente possível.<br/>
    • <strong>Proteção de direitos</strong> — em casos de investigação de atividade ilícita, fraude ou ameaça à segurança do portal.`,
  },
  {
    id: "cookies",
    icon: RefreshCw,
    color: "#b45309",
    title: "6. Cookies e tecnologias similares",
    content: `Utilizamos cookies para garantir o funcionamento correto do portal e para compreender como os leitores utilizam o conteúdo:<br/><br/>
    <strong>Cookies necessários</strong> — essenciais ao funcionamento técnico (autenticação, sessão, preferências). Não podem ser desativados.<br/><br/>
    <strong>Cookies analíticos</strong> — coletam dados anonimizados de navegação para estatísticas de audiência. Exigem seu consentimento.<br/><br/>
    <strong>Cookies de terceiros</strong> — inseridos por plataformas de vídeo embutido (YouTube) e redes sociais (botões de compartilhamento), sujeitos às políticas de privacidade de cada serviço.<br/><br/>
    Você pode gerenciar ou revogar o consentimento a qualquer momento pelo <em>banner de cookies</em> exibido na sua primeira visita, ou nas configurações do seu navegador.`,
  },
  {
    id: "seus-direitos",
    icon: UserCheck,
    color: "#0d9488",
    title: "7. Seus direitos como titular",
    content: `Nos termos dos arts. 17 a 22 da LGPD, você tem direito a:<br/><br/>
    • <strong>Confirmação</strong> — saber se tratamos dados seus.<br/>
    • <strong>Acesso</strong> — obter uma cópia dos dados que mantemos sobre você.<br/>
    • <strong>Correção</strong> — solicitar a atualização de dados incompletos, inexatos ou desatualizados.<br/>
    • <strong>Anonimização, bloqueio ou eliminação</strong> — de dados desnecessários ou tratados em desconformidade com a LGPD.<br/>
    • <strong>Portabilidade</strong> — receber seus dados em formato estruturado e interoperável.<br/>
    • <strong>Eliminação</strong> — solicitar a exclusão dos dados tratados com base no consentimento.<br/>
    • <strong>Informação</strong> — conhecer com quais entidades compartilhamos seus dados.<br/>
    • <strong>Revogação do consentimento</strong> — retirar o consentimento a qualquer momento, sem prejuízo às operações anteriores.<br/><br/>
    Para exercer qualquer desses direitos, entre em contato pelo e-mail <strong>privacidade@brasiliaagora.com.br</strong>. Responderemos em até <strong>15 dias úteis</strong>.`,
  },
  {
    id: "retencao",
    icon: Database,
    color: "#6b21a8",
    title: "8. Retenção de dados",
    content: `Mantemos seus dados apenas pelo tempo necessário para as finalidades descritas nesta política ou para cumprimento de obrigações legais:<br/><br/>
    • <strong>Registros de acesso (IPs)</strong> — 6 meses, conforme exigido pelo Marco Civil da Internet.<br/>
    • <strong>Mensagens de contato</strong> — 2 anos após a última interação, ou mediante solicitação de exclusão.<br/>
    • <strong>Dados de newsletter</strong> — enquanto a assinatura estiver ativa; excluídos até 30 dias após cancelamento.<br/>
    • <strong>Cookies analíticos</strong> — período configurado em cada ferramenta, geralmente 13 meses.<br/><br/>
    Após os prazos estabelecidos, os dados são excluídos permanentemente ou anonimizados de forma irreversível.`,
  },
  {
    id: "seguranca",
    icon: Lock,
    color: "#0B2A66",
    title: "9. Segurança das informações",
    content: `Adotamos medidas técnicas e organizacionais compatíveis com as melhores práticas do setor para proteger seus dados contra acesso não autorizado, perda, alteração ou divulgação indevida, incluindo:<br/><br/>
    • Transmissão criptografada via HTTPS/TLS em todas as páginas.<br/>
    • Controle de acesso baseado em funções (RBAC) para sistemas internos.<br/>
    • Autenticação de dois fatores (2FA) para a equipe editorial e administradores.<br/>
    • Monitoramento de logs de segurança e auditorias periódicas.<br/><br/>
    Em caso de incidente que afete seus dados, notificaremos a ANPD e os titulares afetados conforme previsto na LGPD.`,
  },
  {
    id: "alteracoes",
    icon: RefreshCw,
    color: "#ea580c",
    title: "10. Alterações nesta política",
    content: `Esta Política de Privacidade pode ser atualizada periodicamente para refletir mudanças em nossas práticas, na legislação ou nos serviços oferecidos. A versão vigente sempre estará disponível nesta página, com a data da última atualização indicada no topo.<br/><br/>
    Alterações significativas serão comunicadas com destaque no portal ou por e-mail aos leitores cadastrados em nossa newsletter, com antecedência mínima de 15 dias.`,
  },
  {
    id: "contato-dpo",
    icon: Mail,
    color: "#0B2A66",
    title: "11. Encarregado pelo tratamento de dados (DPO)",
    content: `O Brasília Agora designou um Encarregado pelo Tratamento de Dados (Data Protection Officer) para atender às solicitações dos titulares e comunicar-se com a Autoridade Nacional de Proteção de Dados (ANPD).<br/><br/>
    <strong>Contato do DPO:</strong><br/>
    • E-mail: <strong>privacidade@brasiliaagora.com.br</strong><br/>
    • Endereço: Brasília, Distrito Federal, Brasil<br/><br/>
    Você também pode encaminhar reclamações diretamente à <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> pelo portal <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" class="text-[#0B2A66] underline hover:text-[#c8102e]">www.gov.br/anpd</a>.`,
  },
];

export default function Privacidade() {
  return (
    <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col">
      <TopBar />
      <Header />

      <main className="flex-1">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="bg-[#0B2A66] text-white py-14">
          <div className="max-w-[1280px] mx-auto px-4">
            <div className="flex items-center gap-2 text-[12px] text-white/50 mb-4">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <ChevronRight size={12} />
              <span className="text-white/80">Política de Privacidade</span>
            </div>
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <Shield size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">Política de Privacidade</h1>
                <p className="text-white/70 text-[15px] max-w-2xl leading-relaxed">
                  Transparência sobre como coletamos, usamos e protegemos suas informações, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
                </p>
                <p className="mt-3 text-[12px] text-white/50">
                  Última atualização: <span className="text-white/70 font-semibold">{LAST_UPDATE}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <div className="max-w-[1280px] mx-auto px-4 py-12">
          <div className="flex flex-col lg:flex-row gap-8 items-start">

            {/* Sidebar — índice */}
            <aside className="lg:w-[260px] shrink-0 lg:sticky lg:top-6">
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm">
                <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-3">Índice</p>
                <nav className="space-y-0.5">
                  {SECTIONS.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="flex items-center gap-2 py-1.5 px-2 rounded-lg text-[13px] text-[#475569] hover:text-[#0B2A66] hover:bg-[#EFF6FF] transition-colors group"
                    >
                      <s.icon size={13} className="shrink-0 text-[#94A3B8] group-hover:text-[#0B2A66] transition-colors" />
                      <span className="leading-snug">{s.title}</span>
                    </a>
                  ))}
                </nav>
                <div className="mt-5 pt-4 border-t border-[#E2E8F0]">
                  <Link
                    href="/contato"
                    className="flex items-center gap-2 w-full py-2 px-3 bg-[#0B2A66] text-white text-[13px] font-semibold rounded-xl hover:bg-[#0a2255] transition-colors justify-center"
                  >
                    <Mail size={13} /> Falar com o DPO
                  </Link>
                </div>
              </div>
            </aside>

            {/* Artigo principal */}
            <article className="flex-1 min-w-0 space-y-5">

              {/* Resumo rápido */}
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-6">
                <h2 className="text-[15px] font-black text-[#1E3A8A] mb-3 flex items-center gap-2">
                  <Shield size={16} /> Resumo — o que você precisa saber
                </h2>
                <ul className="space-y-2 text-[13px] text-[#1E40AF] leading-relaxed">
                  {[
                    "Não vendemos seus dados a terceiros, jamais.",
                    "Coletamos apenas o mínimo necessário para o serviço jornalístico.",
                    "Você pode acessar, corrigir ou excluir seus dados a qualquer momento.",
                    "Usamos HTTPS e autenticação em dois fatores para proteger nossos sistemas.",
                    "Cumprimos integralmente a LGPD (Lei nº 13.709/2018).",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Seções */}
              {SECTIONS.map((s) => (
                <section
                  key={s.id}
                  id={s.id}
                  className="bg-white rounded-2xl border border-[#E2E8F0] p-7 scroll-mt-6"
                  style={{ boxShadow: "0 2px 12px rgba(15,23,42,0.04)" }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: s.color + "18" }}
                    >
                      <s.icon size={17} style={{ color: s.color }} />
                    </div>
                    <h2 className="text-[17px] font-black text-[#0F172A]">{s.title}</h2>
                  </div>
                  <div
                    className="text-[14px] text-[#374151] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: s.content }}
                  />
                </section>
              ))}

              {/* Rodapé do artigo */}
              <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold text-[#0F172A]">Dúvidas sobre esta política?</p>
                  <p className="text-[12px] text-[#64748B] mt-0.5">Fale com nossa equipe de privacidade pelo formulário de contato.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link
                    href="/contato"
                    className="flex items-center gap-2 px-4 py-2 bg-[#0B2A66] text-white text-[13px] font-semibold rounded-xl hover:bg-[#0a2255] transition-colors"
                  >
                    <Mail size={13} /> Contato
                  </Link>
                  <Link
                    href="/termos"
                    className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[13px] font-semibold text-[#475569] rounded-xl hover:bg-white transition-colors"
                  >
                    Termos de Uso
                  </Link>
                </div>
              </div>

            </article>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
