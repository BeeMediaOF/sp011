import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import brasilImg from "../assets/images/brasil.webp";
import politics2Img from "../assets/images/politics2.webp";

const articles = [
  { id: "brasil-1", title: "Senado aprova marco regulatório para inteligência artificial no Brasil", subtitle: "Texto prevê direitos e deveres para uso de IA em serviços públicos", time: "1 hora atrás", imageUrl: brasilImg, tag: "BRASIL", tagColor: "#16a34a" },
  { id: "brasil-2", title: "Inflação recua para 3,8% em maio, menor índice desde 2020, aponta IBGE", subtitle: "Resultado positivo reforça expectativa de cortes na taxa Selic", time: "3 horas atrás", imageUrl: politics2Img, tag: "BRASIL", tagColor: "#16a34a" },
  { id: "brasil-3", title: "Governo federal anuncia investimentos de R$ 12 bilhões em infraestrutura", subtitle: "Recursos serão destinados a rodovias, ferrovias e portos", time: "5 horas atrás", imageUrl: brasilImg, tag: "BRASIL", tagColor: "#16a34a" },
  { id: "brasil-4", title: "STF decide que Estados devem regularizar dívidas de ICMS", subtitle: "Julgamento unânime muda regras de cobrança tributária", time: "7 horas atrás", imageUrl: politics2Img, tag: "BRASIL", tagColor: "#16a34a" },
  { id: "brasil-5", title: "Ministério da Saúde amplia vacinação contra dengue em 10 estados", subtitle: "Campanha prioritária atinge regiões com maior incidência", time: "9 horas atrás", imageUrl: brasilImg, tag: "BRASIL", tagColor: "#16a34a" },
  { id: "brasil-6", title: "Conselho Nacional de Educação define novas diretrizes curriculares", subtitle: "Mudanças devem ser implementadas a partir de 2025", time: "12 horas atrás", imageUrl: politics2Img, tag: "BRASIL", tagColor: "#16a34a" },
  { id: "brasil-7", title: "Petrobras anuncia novas descobertas na Bacia de Santos", subtitle: "Potencial produtivo estimado supera 2 bilhões de barris", time: "1 dia atrás", imageUrl: brasilImg, tag: "BRASIL", tagColor: "#16a34a" },
  { id: "brasil-8", title: "Caixa reduz taxas de juros para crédito imobiliário", subtitle: "Medida visa aquecer o mercado imobiliário", time: "1 dia atrás", imageUrl: politics2Img, tag: "BRASIL", tagColor: "#16a34a" }
];

export default function Brasil() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <CategoryPage category="BRASIL" color="#16a34a" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}
