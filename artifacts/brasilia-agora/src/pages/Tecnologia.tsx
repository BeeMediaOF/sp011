import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import especialImg from "../assets/images/especial.webp";
import brasilImg from "../assets/images/brasil.webp";
import busImg from "../assets/images/bus.webp";
import studentsImg from "../assets/images/students.webp";
import health2Img from "../assets/images/health2.webp";
import security2Img from "../assets/images/security2.webp";

const articles = [
  { id: "tec-1", title: "Brasília se torna polo de inteligência artificial com nova incubadora", subtitle: "Hub tecnológico vai acelerar 50 startups de IA até o final de 2026", time: "1 hora atrás", imageUrl: especialImg, tag: "TECNOLOGIA", tagColor: "#0284c7" },
  { id: "tec-2", title: "5G chega a 100% do Distrito Federal com cobertura completa", subtitle: "Todas as regiões administrativas agora contam com sinal de quinta geração", time: "3 horas atrás", imageUrl: brasilImg, tag: "TECNOLOGIA", tagColor: "#0284c7" },
  { id: "tec-3", title: "App de transporte brasiliense integra metrô, ônibus e bicicleta", subtitle: "Plataforma unificada permite planejar rotas multimodais em tempo real", time: "5 horas atrás", imageUrl: busImg, tag: "TECNOLOGIA", tagColor: "#0284c7" },
  { id: "tec-4", title: "Universidade de Brasília desenvolve chip brasileiro para IoT", subtitle: "Componente nacional reduz custo de sensores inteligentes em 40%", time: "7 horas atrás", imageUrl: studentsImg, tag: "TECNOLOGIA", tagColor: "#0284c7" },
  { id: "tec-5", title: "GDF lança plataforma digital para agendamento de consultas públicas", subtitle: "Sistema elimina filas e permite marcação online em toda a rede de saúde", time: "9 horas atrás", imageUrl: health2Img, tag: "TECNOLOGIA", tagColor: "#0284c7" },
  { id: "tec-6", title: "Centro de cibersegurança do DF bloqueia 50 mil tentativas de ataque", subtitle: "Infraestrutura de proteção digital foi reforçada após investimento de R$ 10 milhões", time: "11 horas atrás", imageUrl: security2Img, tag: "TECNOLOGIA", tagColor: "#0284c7" },
];

export default function Tecnologia() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <CategoryPage category="TECNOLOGIA" color="#0284c7" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}
