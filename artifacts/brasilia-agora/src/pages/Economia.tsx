import TopBar from "../components/TopBar";
import Header from "../components/Header";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import cityImg from "../assets/images/city.webp";
import busImg from "../assets/images/bus.webp";
import parkImg from "../assets/images/park.webp";
import studentsImg from "../assets/images/students.webp";
import brasilImg from "../assets/images/brasil.webp";
import especialImg from "../assets/images/especial.webp";

const articles = [
  { id: "eco-1", title: "DF bate recorde de exportações no primeiro semestre de 2025", subtitle: "Setor de tecnologia lidera crescimento com 30% de aumento", time: "1 hora atrás", imageUrl: cityImg, tag: "ECONOMIA", tagColor: "#b45309" },
  { id: "eco-2", title: "GDF libera R$ 500 milhões em crédito para micro e pequenas empresas", subtitle: "Linhas de financiamento com juros reduzidos para impulsionar o setor", time: "3 horas atrás", imageUrl: busImg, tag: "ECONOMIA", tagColor: "#b45309" },
  { id: "eco-3", title: "Feira de negócios de Brasília reúne mais de 500 empresas", subtitle: "Evento espera movimentar R$ 1 bilhão em contratos durante a semana", time: "5 horas atrás", imageUrl: parkImg, tag: "ECONOMIA", tagColor: "#b45309" },
  { id: "eco-4", title: "Setor de tecnologia do DF cria 2 mil novas vagas de emprego", subtitle: "Empresas de software e startups lideram expansão do mercado", time: "7 horas atrás", imageUrl: studentsImg, tag: "ECONOMIA", tagColor: "#b45309" },
  { id: "eco-5", title: "Brasília é eleita melhor cidade para investir no Brasil em 2025", subtitle: "Ranking considera infraestrutura, qualidade de vida e ambiente de negócios", time: "9 horas atrás", imageUrl: brasilImg, tag: "ECONOMIA", tagColor: "#b45309" },
  { id: "eco-6", title: "GDF anuncia incentivos fiscais para empresas de energia solar", subtitle: "Objetivo é tornar o DF referência nacional em energia renovável", time: "11 horas atrás", imageUrl: especialImg, tag: "ECONOMIA", tagColor: "#b45309" },
];

export default function Economia() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <main className="flex-1 bg-white">
        <CategoryPage category="ECONOMIA" color="#b45309" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}
