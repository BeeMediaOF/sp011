import TopBar from "../components/TopBar";
import Header from "../components/Header";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import mundoImg from "../assets/images/mundo.webp";
import trafficImg from "../assets/images/traffic.webp";

const articles = [
  { id: "mundo-1", title: "Cúpula do G7 debate crise climática e promete corte de 50% nas emissões até 2035", subtitle: "Líderes concordam em acelerar transição energética global", time: "1 hora atrás", imageUrl: mundoImg, tag: "MUNDO", tagColor: "#9333ea" },
  { id: "mundo-2", title: "ONU alerta para avanço dos conflitos armados em três regiões da África", subtitle: "Organização pede mobilização internacional para conter escalada", time: "3 horas atrás", imageUrl: trafficImg, tag: "MUNDO", tagColor: "#9333ea" },
  { id: "mundo-3", title: "União Europeia aprova pacote de sanções econômicas contra novos países", subtitle: "Medidas visam pressionar regimes por violações de direitos humanos", time: "5 horas atrás", imageUrl: mundoImg, tag: "MUNDO", tagColor: "#9333ea" },
  { id: "mundo-4", title: "NASA confirma lançamento de missão tripulada à Lua para o segundo semestre", subtitle: "Artemis II terá astronautas pela primeira vez em órbita lunar desde 1972", time: "7 horas atrás", imageUrl: trafficImg, tag: "MUNDO", tagColor: "#9333ea" },
  { id: "mundo-5", title: "Economia chinesa registra crescimento acima das expectativas", subtitle: "PIB do primeiro trimestre supera projeções dos analistas", time: "9 horas atrás", imageUrl: mundoImg, tag: "MUNDO", tagColor: "#9333ea" },
  { id: "mundo-6", title: "Alemanha inaugura maior parque eólico offshore da Europa", subtitle: "Projeto fornecerá energia para 1,5 milhão de residências", time: "12 horas atrás", imageUrl: trafficImg, tag: "MUNDO", tagColor: "#9333ea" },
  { id: "mundo-7", title: "Coreia do Sul e Japão assinam acordo de cooperação tecnológica", subtitle: "Parceria abrange semicondutores e inteligência artificial", time: "1 dia atrás", imageUrl: mundoImg, tag: "MUNDO", tagColor: "#9333ea" },
  { id: "mundo-8", title: "Reino Unido anuncia nova política de imigração qualificada", subtitle: "Medida busca atrair profissionais de tecnologia e saúde", time: "1 dia atrás", imageUrl: trafficImg, tag: "MUNDO", tagColor: "#9333ea" }
];

export default function Mundo() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <main className="flex-1 bg-white">
        <CategoryPage category="MUNDO" color="#9333ea" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}
