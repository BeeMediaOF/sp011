import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import CategoryPage from "../components/CategoryPage";
import RedacaoBanner from "../components/RedacaoBanner";
import Footer from "../components/Footer";
import parkImg from "../assets/images/park.png";
import cityImg from "../assets/images/city.png";

const articles = [
  { id: "cidade-1", title: "Parques do DF terão programação especial no Dia do Meio Ambiente", subtitle: "Eventos gratuitos em todas as regiões administrativas", time: "5 horas atrás", imageUrl: parkImg, tag: "CIDADE", tagColor: "#2563eb" },
  { id: "cidade-2", title: "Nova praça é inaugurada em Águas Claras", subtitle: "Espaço conta com quadras poliesportivas e área infantil", time: "7 horas atrás", imageUrl: cityImg, tag: "CIDADE", tagColor: "#2563eb" },
  { id: "cidade-3", title: "Revitalização do Eixão do Lazer atrai milhares no domingo", subtitle: "Food trucks e apresentações musicais marcam a reabertura", time: "10 horas atrás", imageUrl: parkImg, tag: "CIDADE", tagColor: "#2563eb" },
  { id: "cidade-4", title: "Feira de adoção de animais acontece neste fim de semana", subtitle: "Mais de 100 cães e gatos estarão disponíveis para adoção", time: "1 dia atrás", imageUrl: cityImg, tag: "CIDADE", tagColor: "#2563eb" },
  { id: "cidade-5", title: "Obras de recapeamento alteram trânsito na Asa Sul", subtitle: "Motoristas devem buscar rotas alternativas nos próximos 15 dias", time: "1 dia atrás", imageUrl: parkImg, tag: "CIDADE", tagColor: "#2563eb" },
  { id: "cidade-6", title: "Comércio local aposta em promoções de inverno", subtitle: "Lojas do centro de Brasília esperam aumento de 20% nas vendas", time: "2 dias atrás", imageUrl: cityImg, tag: "CIDADE", tagColor: "#2563eb" },
  { id: "cidade-7", title: "Ação de zeladoria remove toneladas de entulho no Gama", subtitle: "SLU realiza mutirão de limpeza em diversos bairros", time: "2 dias atrás", imageUrl: parkImg, tag: "CIDADE", tagColor: "#2563eb" },
  { id: "cidade-8", title: "Novos abrigos de ônibus começam a ser instalados", subtitle: "Estruturas modernas oferecem mais conforto aos passageiros", time: "3 dias atrás", imageUrl: cityImg, tag: "CIDADE", tagColor: "#2563eb" }
];

export default function Cidade() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <CategoryPage category="CIDADE" color="#2563eb" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <RedacaoBanner />
      <Footer />
    </div>
  );
}