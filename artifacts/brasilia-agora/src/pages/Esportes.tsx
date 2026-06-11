import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import sportsImg from "../assets/images/sports.webp";

const articles = [
  { id: "esportes-1", title: "Mané Garrincha receberá clássico Flamengo x Botafogo", subtitle: "Ingressos já estão à venda e expectativa é de casa cheia", time: "1 hora atrás", imageUrl: sportsImg, tag: "ESPORTES", tagColor: "#b45309" },
  { id: "esportes-2", title: "Brasiliense vence e se aproxima da liderança no regional", subtitle: "Vitória no sufoco anima a torcida do Jacaré", time: "5 horas atrás", imageUrl: sportsImg, tag: "ESPORTES", tagColor: "#b45309" },
  { id: "esportes-3", title: "Meia maratona de Brasília altera trânsito no Eixo Monumental", subtitle: "Corredores de todo o país participam da prova neste domingo", time: "8 horas atrás", imageUrl: sportsImg, tag: "ESPORTES", tagColor: "#b45309" },
  { id: "esportes-4", title: "Time feminino do Minas Brasília estreia com goleada", subtitle: "As jogadoras dominaram a partida do início ao fim", time: "12 horas atrás", imageUrl: sportsImg, tag: "ESPORTES", tagColor: "#b45309" },
  { id: "esportes-5", title: "Campeonato de natação movimenta as piscinas do Clube de Regatas", subtitle: "Jovens talentos buscam índices para torneios nacionais", time: "1 dia atrás", imageUrl: sportsImg, tag: "ESPORTES", tagColor: "#b45309" },
  { id: "esportes-6", title: "Novo complexo de skate é inaugurado no Guará", subtitle: "Espaço atende a pedidos antigos da comunidade skatista", time: "1 dia atrás", imageUrl: sportsImg, tag: "ESPORTES", tagColor: "#b45309" },
  { id: "esportes-7", title: "Atletas de Brasília conquistam medalhas em campeonato de judô", subtitle: "Equipe do DF brilhou na competição regional no Centro-Oeste", time: "2 dias atrás", imageUrl: sportsImg, tag: "ESPORTES", tagColor: "#b45309" },
  { id: "esportes-8", title: "Ginásio Nilson Nelson sedia torneio de vôlei amador", subtitle: "Competição reúne equipes de todas as idades", time: "3 dias atrás", imageUrl: sportsImg, tag: "ESPORTES", tagColor: "#b45309" }
];

export default function Esportes() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <CategoryPage category="ESPORTES" color="#b45309" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}