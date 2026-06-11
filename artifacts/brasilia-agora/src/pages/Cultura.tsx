import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import festivalImg from "../assets/images/festival.webp";
import culture2Img from "../assets/images/culture2.webp";

const articles = [
  { id: "cultura-1", title: "Festival de Inverno começa neste fim de semana no Plano Piloto", subtitle: "Evento contará com shows gratuitos e feira gastronômica", time: "8 horas atrás", imageUrl: festivalImg, tag: "CULTURA", tagColor: "#0d9488" },
  { id: "cultura-2", title: "Museu Nacional expõe obras inéditas de artistas brasilienses", subtitle: "Exposição fica em cartaz até o fim do mês que vem", time: "11 horas atrás", imageUrl: culture2Img, tag: "CULTURA", tagColor: "#0d9488" },
  { id: "cultura-3", title: "Teatro Nacional recebe espetáculo de dança contemporânea", subtitle: "Companhia internacional faz turnê pelo Brasil e passa pelo DF", time: "14 horas atrás", imageUrl: festivalImg, tag: "CULTURA", tagColor: "#0d9488" },
  { id: "cultura-4", title: "Editais de fomento à cultura têm prazo prorrogado", subtitle: "Artistas independentes ganham mais tempo para submeter projetos", time: "1 dia atrás", imageUrl: culture2Img, tag: "CULTURA", tagColor: "#0d9488" },
  { id: "cultura-5", title: "Cine Brasília sedia mostra de curtas independentes", subtitle: "Produções focam em temas urbanos da capital federal", time: "1 dia atrás", imageUrl: festivalImg, tag: "CULTURA", tagColor: "#0d9488" },
  { id: "cultura-6", title: "Feira do Livro de Brasília confirma presença de autores premiados", subtitle: "Evento acontece no pavilhão do Parque da Cidade", time: "2 dias atrás", imageUrl: culture2Img, tag: "CULTURA", tagColor: "#0d9488" },
  { id: "cultura-7", title: "Samba na praça reúne dezenas de sambistas locais", subtitle: "Roda de samba tradicional anima o domingo na Vila Planalto", time: "2 dias atrás", imageUrl: festivalImg, tag: "CULTURA", tagColor: "#0d9488" },
  { id: "cultura-8", title: "Projeto 'Música no Parque' volta com força total", subtitle: "Apresentações acústicas embalam o fim de tarde no Parque Águas Claras", time: "3 dias atrás", imageUrl: culture2Img, tag: "CULTURA", tagColor: "#0d9488" }
];

export default function Cultura() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <CategoryPage category="CULTURA" color="#0d9488" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}