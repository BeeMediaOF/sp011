import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import hospitalImg from "../assets/images/hospital.png";
import health2Img from "../assets/images/health2.png";

const articles = [
  { id: "saude-1", title: "Hospitais do DF registram queda nos casos de dengue em maio", subtitle: "Ações de prevenção nos bairros têm surtido efeito positivo", time: "4 horas atrás", imageUrl: hospitalImg, tag: "SAÚDE", tagColor: "#16a34a" },
  { id: "saude-2", title: "Nova UPA em Ceilândia entra em fase final de construção", subtitle: "Unidade deve desafogar atendimento no Hospital Regional", time: "6 horas atrás", imageUrl: health2Img, tag: "SAÚDE", tagColor: "#16a34a" },
  { id: "saude-3", title: "Campanha de vacinação contra a gripe foca nos idosos", subtitle: "Postos funcionam com horário estendido no fim de semana", time: "9 horas atrás", imageUrl: hospitalImg, tag: "SAÚDE", tagColor: "#16a34a" },
  { id: "saude-4", title: "GDF contrata mais 150 médicos para a rede pública", subtitle: "Profissionais começam a atuar na próxima segunda-feira", time: "12 horas atrás", imageUrl: health2Img, tag: "SAÚDE", tagColor: "#16a34a" },
  { id: "saude-5", title: "Mutirão de cirurgias eletivas zera fila de espera na ortopedia", subtitle: "Ação foi concentrada no Hospital de Base", time: "1 dia atrás", imageUrl: hospitalImg, tag: "SAÚDE", tagColor: "#16a34a" },
  { id: "saude-6", title: "Doação de sangue tem queda e hemocentro faz apelo", subtitle: "Estoque de tipos negativos está em nível crítico", time: "1 dia atrás", imageUrl: health2Img, tag: "SAÚDE", tagColor: "#16a34a" },
  { id: "saude-7", title: "Nova ala pediátrica é inaugurada no HRAN", subtitle: "Espaço conta com decoração especial para humanizar atendimento", time: "2 dias atrás", imageUrl: hospitalImg, tag: "SAÚDE", tagColor: "#16a34a" },
  { id: "saude-8", title: "Secretaria de Saúde lança app para marcação de consultas", subtitle: "Tecnologia deve facilitar acesso a especialistas nas UBS", time: "3 dias atrás", imageUrl: health2Img, tag: "SAÚDE", tagColor: "#16a34a" }
];

export default function Saude() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <CategoryPage category="SAÚDE" color="#16a34a" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}