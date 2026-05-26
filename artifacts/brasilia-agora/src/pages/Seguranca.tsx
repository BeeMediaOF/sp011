import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import CategoryPage from "../components/CategoryPage";
import RedacaoBanner from "../components/RedacaoBanner";
import Footer from "../components/Footer";
import policeImg from "../assets/images/police.png";
import security2Img from "../assets/images/security2.png";

const articles = [
  { id: "seguranca-1", title: "Polícia Civil prende grupo suspeito de furtos em comércios", subtitle: "Operação foi deflagrada no Plano Piloto e em cidades satélites", time: "3 horas atrás", imageUrl: policeImg, tag: "SEGURANÇA", tagColor: "#dc2626" },
  { id: "seguranca-2", title: "Bombeiros controlam incêndio em área de cerrado no Lago Sul", subtitle: "Fogo ameaçava residências próximas; não houve feridos", time: "5 horas atrás", imageUrl: security2Img, tag: "SEGURANÇA", tagColor: "#dc2626" },
  { id: "seguranca-3", title: "Operação da PM combate tráfico de drogas na Rodoviária", subtitle: "Dez pessoas foram presas e entorpecentes apreendidos", time: "7 horas atrás", imageUrl: policeImg, tag: "SEGURANÇA", tagColor: "#dc2626" },
  { id: "seguranca-4", title: "Corpo de Bombeiros recebe novos equipamentos de resgate", subtitle: "Investimento milionário visa modernizar o atendimento no DF", time: "12 horas atrás", imageUrl: security2Img, tag: "SEGURANÇA", tagColor: "#dc2626" },
  { id: "seguranca-5", title: "Polícia reforça patrulhamento próximo a escolas públicas", subtitle: "Medida visa garantir segurança de alunos e professores", time: "1 dia atrás", imageUrl: policeImg, tag: "SEGURANÇA", tagColor: "#dc2626" },
  { id: "seguranca-6", title: "Apreensão de armas de fogo ilegais cresce 15% este ano", subtitle: "Dados da SSP mostram eficácia das blitzes nas rodovias do DF", time: "1 dia atrás", imageUrl: security2Img, tag: "SEGURANÇA", tagColor: "#dc2626" },
  { id: "seguranca-7", title: "Programa Vizinhança Segura é expandido para Sobradinho", subtitle: "Moradores interagem com a PM por meio de aplicativos", time: "2 dias atrás", imageUrl: policeImg, tag: "SEGURANÇA", tagColor: "#dc2626" },
  { id: "seguranca-8", title: "Treinamento conjunto prepara forças para grandes eventos", subtitle: "Simulações ocorreram no Estádio Mané Garrincha", time: "2 dias atrás", imageUrl: security2Img, tag: "SEGURANÇA", tagColor: "#dc2626" }
];

export default function Seguranca() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <CategoryPage category="SEGURANÇA" color="#dc2626" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <RedacaoBanner />
      <Footer />
    </div>
  );
}