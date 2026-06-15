import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";

export default function Privacidade() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />

      <main className="flex-1 bg-white py-12">
        <div className="max-w-[860px] mx-auto px-4">
          <div style={{ borderColor: "#c8102e" }} className="border-l-4 pl-5 mb-8">
            <h1 className="text-3xl md:text-4xl font-black text-[#1a2448] uppercase tracking-tight">
              Política de Privacidade
            </h1>
            <p className="text-gray-500 mt-2 text-sm">Última atualização: junho de 2026</p>
          </div>

          <div className="prose prose-lg max-w-none text-[#1a1a1a] space-y-6">
            <p>
              O <strong>Brasília Agora</strong> respeita a privacidade de seus leitores e está comprometido com
              a proteção dos dados pessoais coletados durante o uso deste portal, em conformidade com a
              Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018).
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">1. Dados coletados</h2>
            <p>
              Coletamos apenas os dados necessários para o funcionamento do portal, incluindo: endereço de
              e-mail para inscrição na newsletter, nome e mensagem no formulário de contato, e dados
              técnicos de navegação (endereço IP, tipo de navegador, páginas visitadas) para fins
              estatísticos agregados.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">2. Uso dos dados</h2>
            <p>
              As informações coletadas são utilizadas exclusivamente para: envio da newsletter informativa,
              resposta a mensagens de contato, melhoria da experiência de navegação e análise de audiência
              de forma anonimizada.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">3. Compartilhamento</h2>
            <p>
              Não vendemos, alugamos nem compartilhamos dados pessoais com terceiros para fins comerciais.
              Podemos compartilhar informações com prestadores de serviços tecnológicos estritamente
              necessários para o funcionamento do portal, sempre sob obrigação de sigilo.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">4. Cookies</h2>
            <p>
              Utilizamos cookies técnicos e de análise para melhorar a experiência de navegação. Você pode
              desativar cookies no seu navegador, porém algumas funcionalidades do portal podem ser
              afetadas.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">5. Seus direitos</h2>
            <p>
              De acordo com a LGPD, você tem o direito de acessar, corrigir ou solicitar a exclusão de
              seus dados pessoais. Para exercer esses direitos, entre em contato pelo e-mail{" "}
              <a href="mailto:redacao@brasiliaagora.com.br" className="text-[#1d4ed8] hover:underline">
                redacao@brasiliaagora.com.br
              </a>.
            </p>

            <h2 className="text-xl font-bold text-[#1a2448] mt-8">6. Contato</h2>
            <p>
              Dúvidas sobre esta política devem ser enviadas para{" "}
              <a href="mailto:redacao@brasiliaagora.com.br" className="text-[#1d4ed8] hover:underline">
                redacao@brasiliaagora.com.br
              </a>{" "}
              ou pelo nosso{" "}
              <a href="/contato" className="text-[#1d4ed8] hover:underline">formulário de contato</a>.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
