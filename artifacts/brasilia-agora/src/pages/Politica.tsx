import TopBar from "../components/TopBar";
import Header from "../components/Header";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import heroImg from "../assets/images/hero.webp";
import politics2Img from "../assets/images/politics2.webp";

const articles = [
  { id: "politica-1", title: "Câmara Legislativa aprova projeto que cria o programa Morar DF", subtitle: "Iniciativa prevê subsídio para famílias de baixa renda", time: "2 horas atrás", imageUrl: heroImg, tag: "POLÍTICA", tagColor: "#1d4ed8" },
  { id: "politica-2", title: "Governador anuncia novo pacote de obras para infraestrutura", subtitle: "Investimentos chegam a R$ 500 milhões em diversas RAs", time: "4 horas atrás", imageUrl: politics2Img, tag: "POLÍTICA", tagColor: "#1d4ed8" },
  { id: "politica-3", title: "Comissão de Ética da CLDF avalia representações contra distritais", subtitle: "Reunião está marcada para a próxima terça-feira", time: "6 horas atrás", imageUrl: heroImg, tag: "POLÍTICA", tagColor: "#1d4ed8" },
  { id: "politica-4", title: "GDF encaminha à Câmara LDO de 2025 com previsão de reajustes", subtitle: "Texto base mantém previsão de concursos e reestruturação de carreiras", time: "8 horas atrás", imageUrl: politics2Img, tag: "POLÍTICA", tagColor: "#1d4ed8" },
  { id: "politica-5", title: "Novas regras para licitações no DF entram em vigor", subtitle: "Mudanças visam dar mais transparência aos contratos", time: "12 horas atrás", imageUrl: heroImg, tag: "POLÍTICA", tagColor: "#1d4ed8" },
  { id: "politica-6", title: "Bancada do DF no Congresso debate emendas de bancada", subtitle: "Saúde e segurança são as principais prioridades", time: "1 dia atrás", imageUrl: politics2Img, tag: "POLÍTICA", tagColor: "#1d4ed8" },
  { id: "politica-7", title: "Tribunal de Contas do DF aponta irregularidades em contratos antigos", subtitle: "Relatório sugere devolução de R$ 15 milhões aos cofres públicos", time: "1 dia atrás", imageUrl: heroImg, tag: "POLÍTICA", tagColor: "#1d4ed8" },
  { id: "politica-8", title: "Secretaria de Planejamento detalha novas medidas de arrecadação", subtitle: "Foco é evitar aumento de impostos para o contribuinte", time: "2 dias atrás", imageUrl: politics2Img, tag: "POLÍTICA", tagColor: "#1d4ed8" }
];

export default function Politica() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <main className="flex-1 bg-white">
        <CategoryPage category="POLÍTICA" color="#1d4ed8" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}