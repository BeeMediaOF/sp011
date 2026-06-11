import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";

export default function Termos() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />

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
              Ao acessar e utilizar o portal <strong>Brasília Agora</strong>, você concorda com os
              presentes Termos de Uso. Caso não concorde com qualquer disposição, pedimos que não
              utilize o portal.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">1. Uso do conteúdo</h2>
            <p>
              Todo o conteúdo publicado no Brasília Agora — textos, fotos, vídeos e infográficos — é
              protegido por direitos autorais. É proibida a reprodução, total ou parcial, sem
              autorização expressa da redação, exceto para compartilhamento em redes sociais com
              indicação da fonte.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">2. Responsabilidade editorial</h2>
            <p>
              O Brasília Agora zela pela veracidade das informações publicadas. Em caso de erro, a
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
              O portal pode conter links para sites de terceiros. O Brasília Agora não se responsabiliza
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
