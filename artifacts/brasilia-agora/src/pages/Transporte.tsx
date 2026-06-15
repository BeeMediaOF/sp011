import TopBar from "../components/TopBar";
import Header from "../components/Header";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import busImg from "../assets/images/bus.webp";
import transport2Img from "../assets/images/transport2.webp";

const articles = [
  { id: "transporte-1", title: "GDF anuncia mais 124 ônibus para reforçar o transporte", subtitle: "Novos veículos vão atender principalmente a região oeste do DF", time: "6 horas atrás", imageUrl: busImg, tag: "TRANSPORTE", tagColor: "#0284c7" },
  { id: "transporte-2", title: "Estações do BRT passam por reforma no fim de semana", subtitle: "Passageiros devem ficar atentos às mudanças nos embarques", time: "8 horas atrás", imageUrl: transport2Img, tag: "TRANSPORTE", tagColor: "#0284c7" },
  { id: "transporte-3", title: "Metrô DF amplia horário de funcionamento no feriado", subtitle: "Trens vão rodar até meia-noite para atender público de eventos", time: "10 horas atrás", imageUrl: busImg, tag: "TRANSPORTE", tagColor: "#0284c7" },
  { id: "transporte-4", title: "Avançam as obras do viaduto na saída de Águas Claras", subtitle: "Previsão é que o trânsito seja liberado até dezembro", time: "14 horas atrás", imageUrl: transport2Img, tag: "TRANSPORTE", tagColor: "#0284c7" },
  { id: "transporte-5", title: "Novas ciclovias são entregues no Plano Piloto", subtitle: "Malha cicloviária do DF chega a 650 quilômetros", time: "1 dia atrás", imageUrl: busImg, tag: "TRANSPORTE", tagColor: "#0284c7" },
  { id: "transporte-6", title: "Aplicativo de mobilidade do GDF ganha novas funções", subtitle: "Usuários podem agora recarregar o cartão pelo celular", time: "1 dia atrás", imageUrl: transport2Img, tag: "TRANSPORTE", tagColor: "#0284c7" },
  { id: "transporte-7", title: "Licitação para expansão do Metrô atrai consórcios internacionais", subtitle: "Novas estações em Samambaia e Ceilândia estão previstas", time: "2 dias atrás", imageUrl: busImg, tag: "TRANSPORTE", tagColor: "#0284c7" },
  { id: "transporte-8", title: "Detran intensifica fiscalização nas faixas exclusivas", subtitle: "Multas por invasão de corredor de ônibus aumentaram 20%", time: "3 dias atrás", imageUrl: transport2Img, tag: "TRANSPORTE", tagColor: "#0284c7" }
];

export default function Transporte() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <main className="flex-1 bg-white">
        <CategoryPage category="TRANSPORTE" color="#0284c7" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}