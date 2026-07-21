import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useSite } from "../hooks/useSite";
import { useT } from "../lib/i18n";
import { sanitizeArticleHtml } from "../lib/sanitize";

export default function Termos() {
  const { settings } = useSite();
  const { lang } = useT();
  // Nunca cai na marca padrão (BRAND.name): enquanto /api/site não responde fica
  // vazio; ao carregar, exibe o nome real do blog. Corrige o vazamento persistente
  // de "SBC Agora" no corpo pt-BR (que antes usava BRAND.name direto).
  const siteName = settings?.siteName ?? "";

  // Termos próprios do blog definidos no painel → substituem o texto padrão.
  const customTerms = settings?.contact?.termsOfUse?.trim();
  if (customTerms) {
    return (
      <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
        <TopBar />
        <Header />
        <main className="flex-1 bg-white py-12">
          <div className="max-w-[860px] mx-auto px-4">
            <div style={{ borderColor: "#c8102e" }} className="border-l-4 pl-5 mb-8">
              <h1 className="text-3xl md:text-4xl font-black text-[#1a2448] uppercase tracking-tight">
                {lang === "en" ? "Terms of Use" : "Termos de Uso"}
              </h1>
            </div>
            <div
              className="prose prose-lg max-w-none text-[#1a1a1a] space-y-4"
              dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(customTerms) }}
            />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Versão EN genérica (site público em inglês); pt-BR mantém o texto original.
  if (lang === "en") {
    return (
      <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
        <TopBar />
        <Header />

        <main className="flex-1 bg-white py-12">
          <div className="max-w-[860px] mx-auto px-4">
            <div style={{ borderColor: "#c8102e" }} className="border-l-4 pl-5 mb-8">
              <h1 className="text-3xl md:text-4xl font-black text-[#1a2448] uppercase tracking-tight">
                Terms of Use
              </h1>
            </div>

            <div className="prose prose-lg max-w-none text-[#1a1a1a] space-y-6">
              <p>
                By accessing and using <strong>{siteName}</strong>, you agree to these Terms of
                Use. If you do not agree with any provision, please do not use this site.
              </p>

              <h2 className="text-xl font-bold text-[#1a2448] mt-8">1. Use of content</h2>
              <p>
                All content published on {siteName} — texts, photos, videos and infographics — is
                protected by copyright. Reproduction, in whole or in part, without express
                authorization from the newsroom is prohibited, except for sharing on social media
                with attribution.
              </p>

              <h2 className="text-xl font-bold text-[#1a2448] mt-8">2. Editorial responsibility</h2>
              <p>
                {siteName} strives for the accuracy of the information it publishes. In case of
                error, a correction will be issued promptly. Opinions expressed in columns are the
                sole responsibility of their authors.
              </p>

              <h2 className="text-xl font-bold text-[#1a2448] mt-8">3. Comments and participation</h2>
              <p>
                Reader-submitted content must comply with applicable law. Posting offensive,
                discriminatory, illegal content or content that violates third-party rights is
                prohibited. The newsroom reserves the right to remove inappropriate content.
              </p>

              <h2 className="text-xl font-bold text-[#1a2448] mt-8">4. External links</h2>
              <p>
                This site may contain links to third-party websites. {siteName} is not responsible
                for the content or privacy practices of those sites.
              </p>

              <h2 className="text-xl font-bold text-[#1a2448] mt-8">5. Changes</h2>
              <p>
                These Terms of Use may be updated at any time. We recommend reviewing this page
                periodically to stay informed about changes.
              </p>

              <h2 className="text-xl font-bold text-[#1a2448] mt-8">6. Contact</h2>
              <p>
                For questions about these terms, reach us through our{" "}
                <a href="/contato" className="text-[#1d4ed8] hover:underline">contact form</a>.
              </p>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />

      <main className="flex-1 bg-white py-12">
        <div className="max-w-[860px] mx-auto px-4">
          <div style={{ borderColor: "#c8102e" }} className="border-l-4 pl-5 mb-8">
            <h1 className="text-3xl md:text-4xl font-black text-[#1a2448] uppercase tracking-tight">
              Termos de Uso
            </h1>
            <p className="text-gray-500 mt-2 text-sm">Última atualização: junho de 2026</p>
          </div>

          <div className="prose prose-lg max-w-none text-[#1a1a1a] space-y-6">
            <p>
              Ao acessar e utilizar o portal <strong>{siteName}</strong>, você concorda com os
              presentes Termos de Uso. Caso não concorde com qualquer disposição, pedimos que não
              utilize o portal.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">1. Uso do conteúdo</h2>
            <p>
              Todo o conteúdo publicado no {siteName} — textos, fotos, vídeos e infográficos — é
              protegido por direitos autorais. É proibida a reprodução, total ou parcial, sem
              autorização expressa da redação, exceto para compartilhamento em redes sociais com
              indicação da fonte.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">2. Responsabilidade editorial</h2>
            <p>
              O {siteName} zela pela veracidade das informações publicadas. Em caso de erro, a
              correção será feita prontamente com nota de retificação. Opiniões expressas em colunas
              são de responsabilidade exclusiva de seus autores.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">3. Comentários e participação</h2>
            <p>
              Conteúdos enviados por leitores devem respeitar a legislação brasileira e as normas de
              convivência. É proibida a publicação de mensagens ofensivas, discriminatórias, ilegais
              ou que violem direitos de terceiros. A redação reserva-se o direito de remover conteúdos
              inadequados.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">4. Links externos</h2>
            <p>
              O portal pode conter links para sites de terceiros. O {siteName} não se responsabiliza
              pelo conteúdo ou práticas de privacidade desses sites.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">5. Alterações</h2>
            <p>
              Estes Termos de Uso podem ser atualizados a qualquer momento. Recomendamos a leitura
              periódica desta página para se manter informado sobre eventuais mudanças.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">6. Contato</h2>
            <p>
              Para esclarecimentos sobre estes termos, entre em contato pelo nosso{" "}
              <a href="/contato" className="text-[#1d4ed8] hover:underline">formulário de contato</a>{" "}
              ou pelo e-mail{" "}
              <a href="mailto:redacao@brasiliaagora.com.br" className="text-[#1d4ed8] hover:underline">
                redacao@brasiliaagora.com.br
              </a>.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
