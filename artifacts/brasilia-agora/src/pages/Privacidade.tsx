import TopBar from "../components/TopBar";
import { BRAND } from "../brand";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { Link } from "wouter";
import { Shield, Eye, Lock, Database, UserCheck, Mail, RefreshCw, ChevronRight } from "lucide-react";
import { useT } from "../lib/i18n";

const LAST_UPDATE = "23 de junho de 2025";
const LAST_UPDATE_EN = "June 23, 2025";

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
    content: `O <strong>${BRAND.name}</strong> é um portal de notícias dedicado à cobertura jornalística local e regional. Somos o controlador dos dados pessoais coletados neste site, nos termos da Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).`,
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
    content: `O ${BRAND.name} designou um Encarregado pelo Tratamento de Dados (Data Protection Officer) para atender às solicitações dos titulares e comunicar-se com a Autoridade Nacional de Proteção de Dados (ANPD).<br/><br/>
    <strong>Contato do DPO:</strong><br/>
    • E-mail: <strong>privacidade@brasiliaagora.com.br</strong><br/>
    • Endereço: Brasília, Distrito Federal, Brasil<br/><br/>
    Você também pode encaminhar reclamações diretamente à <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> pelo portal <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" class="text-[#0B2A66] underline hover:text-[#c8102e]">www.gov.br/anpd</a>.`,
  },
];

// Versão EN genérica (site público em inglês): política de cookies/privacidade
// sem o enquadramento LGPD/ANPD, que é legislação brasileira.
const SECTIONS_EN: Section[] = [
  {
    id: "quem-somos",
    icon: Shield,
    color: "#0B2A66",
    title: "1. Who we are",
    content: `<strong>${BRAND.name}</strong> is a news website. We are the controller of the personal data collected on this site.`,
  },
  {
    id: "dados-coletados",
    icon: Database,
    color: "#0284c7",
    title: "2. Data we collect",
    content: `We only collect the data strictly necessary to run the site and improve your reading experience:<br/><br/>
    <strong>a) Data you provide voluntarily</strong><br/>
    • <em>Contact form:</em> name, email and message, used exclusively to answer your request.<br/>
    • <em>Newsletter:</em> email address used to send editorial highlights. You can unsubscribe at any time.<br/><br/>
    <strong>b) Data collected automatically</strong><br/>
    • IP address (anonymized), browser type, operating system, pages visited and time on page — used for audience analytics and content improvement.<br/>
    • Technical cookies required for the site to work (session, theme preferences, cookie consent).<br/>
    • Third-party analytics cookies, if you consent.`,
  },
  {
    id: "finalidades",
    icon: Eye,
    color: "#16a34a",
    title: "3. How we use your data",
    content: `The personal data we collect is used exclusively for:<br/><br/>
    • <strong>Delivering our journalism</strong> — displaying news, personalizing content and running the site.<br/>
    • <strong>Communicating with readers</strong> — answering messages sent through the contact form and sending requested newsletters.<br/>
    • <strong>Security and fraud prevention</strong> — detecting abusive access and protecting the integrity of the platform.<br/>
    • <strong>Audience analytics</strong> — aggregated, anonymized statistics that guide our editorial decisions.<br/>
    • <strong>Legal compliance</strong> — responding to requests from competent authorities when required by law.`,
  },
  {
    id: "compartilhamento",
    icon: Lock,
    color: "#dc2626",
    title: "4. Data sharing",
    content: `<strong>We do not sell, rent or trade your personal data.</strong><br/><br/>
    We may share information in the following situations:<br/><br/>
    • <strong>Essential service providers</strong> — hosting, email and analytics providers, bound by confidentiality and security agreements.<br/>
    • <strong>Content delivery networks (CDN)</strong> — to optimize the loading of images and videos.<br/>
    • <strong>Legal obligation or court order</strong> — when required by a competent authority.<br/>
    • <strong>Protection of rights</strong> — in investigations of unlawful activity, fraud or threats to the security of the site.`,
  },
  {
    id: "cookies",
    icon: RefreshCw,
    color: "#b45309",
    title: "5. Cookies and similar technologies",
    content: `We use cookies to keep the site working properly and to understand how readers use our content:<br/><br/>
    <strong>Necessary cookies</strong> — essential for technical operation (authentication, session, preferences). They cannot be disabled.<br/><br/>
    <strong>Analytics cookies</strong> — collect anonymized browsing data for audience statistics. They require your consent.<br/><br/>
    <strong>Third-party cookies</strong> — set by embedded video platforms (YouTube) and social networks (share buttons), subject to each service's privacy policy.<br/><br/>
    You can manage or withdraw consent at any time through the <em>cookie banner</em> shown on your first visit, or in your browser settings.`,
  },
  {
    id: "seus-direitos",
    icon: UserCheck,
    color: "#0d9488",
    title: "6. Your rights",
    content: `You have the right to:<br/><br/>
    • <strong>Access</strong> — obtain a copy of the data we hold about you.<br/>
    • <strong>Correction</strong> — request updates to incomplete, inaccurate or outdated data.<br/>
    • <strong>Deletion</strong> — request the removal of data processed on the basis of consent.<br/>
    • <strong>Portability</strong> — receive your data in a structured, interoperable format.<br/>
    • <strong>Information</strong> — know which parties we share your data with.<br/>
    • <strong>Withdrawal of consent</strong> — withdraw consent at any time.<br/><br/>
    To exercise any of these rights, reach us through the <a href="/contato" class="text-[#0B2A66] underline hover:text-[#c8102e]">contact form</a>.`,
  },
  {
    id: "retencao",
    icon: Database,
    color: "#6b21a8",
    title: "7. Data retention",
    content: `We keep your data only for as long as necessary for the purposes described in this policy or to comply with legal obligations:<br/><br/>
    • <strong>Access logs (IPs)</strong> — up to 6 months.<br/>
    • <strong>Contact messages</strong> — up to 2 years after the last interaction, or upon deletion request.<br/>
    • <strong>Newsletter data</strong> — while the subscription is active; deleted within 30 days of cancellation.<br/>
    • <strong>Analytics cookies</strong> — as configured in each tool, typically 13 months.<br/><br/>
    After these periods, data is permanently deleted or irreversibly anonymized.`,
  },
  {
    id: "seguranca",
    icon: Lock,
    color: "#0B2A66",
    title: "8. Security",
    content: `We adopt technical and organizational measures aligned with industry best practices to protect your data against unauthorized access, loss, alteration or improper disclosure, including:<br/><br/>
    • Encrypted transmission via HTTPS/TLS on all pages.<br/>
    • Role-based access control (RBAC) for internal systems.<br/>
    • Two-factor authentication (2FA) for editors and administrators.<br/>
    • Security log monitoring and periodic audits.`,
  },
  {
    id: "alteracoes",
    icon: RefreshCw,
    color: "#ea580c",
    title: "9. Changes to this policy",
    content: `This Privacy Policy may be updated periodically to reflect changes in our practices, in legislation or in the services we offer. The current version will always be available on this page.`,
  },
];

const SUMMARY_PT = [
  "Não vendemos seus dados a terceiros, jamais.",
  "Coletamos apenas o mínimo necessário para o serviço jornalístico.",
  "Você pode acessar, corrigir ou excluir seus dados a qualquer momento.",
  "Usamos HTTPS e autenticação em dois fatores para proteger nossos sistemas.",
  "Cumprimos integralmente a LGPD (Lei nº 13.709/2018).",
];

const SUMMARY_EN = [
  "We never sell your data to third parties.",
  "We collect only the minimum necessary to deliver our journalism.",
  "You can access, correct or delete your data at any time.",
  "We use HTTPS and two-factor authentication to protect our systems.",
];

export default function Privacidade() {
  const { lang } = useT();
  const en = lang === "en";
  const sections = en ? SECTIONS_EN : SECTIONS;
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
              <span className="text-white/80">{en ? "Privacy Policy" : "Política de Privacidade"}</span>
            </div>
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <Shield size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">{en ? "Privacy Policy" : "Política de Privacidade"}</h1>
                <p className="text-white/70 text-[15px] max-w-2xl leading-relaxed">
                  {en
                    ? "Transparency about how we collect, use and protect your information."
                    : "Transparência sobre como coletamos, usamos e protegemos suas informações, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)."}
                </p>
                <p className="mt-3 text-[12px] text-white/50">
                  {en ? "Last updated" : "Última atualização"}: <span className="text-white/70 font-semibold">{en ? LAST_UPDATE_EN : LAST_UPDATE}</span>
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
                <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-3">{en ? "Contents" : "Índice"}</p>
                <nav className="space-y-0.5">
                  {sections.map((s) => (
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
                    <Mail size={13} /> {en ? "Contact us" : "Falar com o DPO"}
                  </Link>
                </div>
              </div>
            </aside>

            {/* Artigo principal */}
            <article className="flex-1 min-w-0 space-y-5">

              {/* Resumo rápido */}
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-6">
                <h2 className="text-[15px] font-black text-[#1E3A8A] mb-3 flex items-center gap-2">
                  <Shield size={16} /> {en ? "Summary — what you need to know" : "Resumo — o que você precisa saber"}
                </h2>
                <ul className="space-y-2 text-[13px] text-[#1E40AF] leading-relaxed">
                  {(en ? SUMMARY_EN : SUMMARY_PT).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Seções */}
              {sections.map((s) => (
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
                  <p className="text-[13px] font-semibold text-[#0F172A]">{en ? "Questions about this policy?" : "Dúvidas sobre esta política?"}</p>
                  <p className="text-[12px] text-[#64748B] mt-0.5">{en ? "Reach our team through the contact form." : "Fale com nossa equipe de privacidade pelo formulário de contato."}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link
                    href="/contato"
                    className="flex items-center gap-2 px-4 py-2 bg-[#0B2A66] text-white text-[13px] font-semibold rounded-xl hover:bg-[#0a2255] transition-colors"
                  >
                    <Mail size={13} /> {en ? "Contact" : "Contato"}
                  </Link>
                  <Link
                    href="/termos"
                    className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[13px] font-semibold text-[#475569] rounded-xl hover:bg-white transition-colors"
                  >
                    {en ? "Terms of Use" : "Termos de Uso"}
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
