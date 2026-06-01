import { Link } from "wouter";
import { useArticles } from "../hooks/useArticles";
import cityImg from "../assets/images/city.png";
import busImg from "../assets/images/bus.png";
import hospitalImg from "../assets/images/hospital.png";
import parkImg from "../assets/images/park.png";
import trafficImg from "../assets/images/traffic.png";
import policeImg from "../assets/images/police.png";
import heroImg from "../assets/images/hero.png";
import studentsImg from "../assets/images/students.png";

const latestNews = [
  {
    id: "lat-1",
    title: "GDF investe R$ 3 bilhões em infraestrutura para 2026",
    summary: "Recursos serão aplicados em estradas, saneamento e iluminação pública.",
    image: cityImg,
    chapeu: "DF",
    time: "10 minutos atrás",
  },
  {
    id: "lat-2",
    title: "Parque Nacional de Brasília recebe certificação internacional de sustentabilidade",
    summary: "Reconhecimento da UNESCO valoriza preservação ambiental da capital.",
    image: parkImg,
    chapeu: "Meio Ambiente",
    time: "25 minutos atrás",
  },
  {
    id: "lat-3",
    title: "Eixo Monumental ganha projeto de revitalização urbanística",
    summary: "Plano inclui ciclovias, praças e mobiliário moderno na via principal.",
    image: trafficImg,
    chapeu: "Urbanismo",
    time: "40 minutos atrás",
  },
  {
    id: "lat-4",
    title: "DF amplia rede de coleta seletiva para todas as regiões administrativas",
    summary: "Programa de reciclagem vai atender 100% da população até dezembro.",
    image: busImg,
    chapeu: "Sustentabilidade",
    time: "55 minutos atrás",
  },
  {
    id: "lat-5",
    title: "Brasília completa 66 anos com programação especial de aniversário",
    summary: "Concertos, exposições e eventos culturais marcam a data em toda a cidade.",
    image: parkImg,
    chapeu: "Cultura",
    time: "1 hora atrás",
  },
  {
    id: "lat-6",
    title: "GDF moderniza sistema de iluminação pública com LED em toda a capital",
    summary: "Substituição de 200 mil luminárias reduz consumo de energia em 60%.",
    image: cityImg,
    chapeu: "Infraestrutura",
    time: "1 hora atrás",
  },
  {
    id: "lat-7",
    title: "Hospitais do DF registram queda de 30% nos casos de dengue em junho",
    summary: "Campanha de prevenção e vacinação mostra resultados positivos na capital.",
    image: hospitalImg,
    chapeu: "Saúde",
    time: "1 hora atrás",
  },
  {
    id: "lat-8",
    title: "GDF inaugura nova unidade de pronto atendimento no Gama",
    summary: "Estrutura moderna vai atender 500 pacientes por dia na região sul.",
    image: hospitalImg,
    chapeu: "Saúde",
    time: "2 horas atrás",
  },
  {
    id: "lat-9",
    title: "Brasília recebe 1 milhão de doses de vacina bivalente contra COVID",
    summary: "Doses serão distribuídas para grupos prioritários em todas as RAs.",
    image: hospitalImg,
    chapeu: "Saúde",
    time: "2 horas atrás",
  },
  {
    id: "lat-10",
    title: "DF amplia fiscalização contra desmatamento ilegal nas áreas de preservação",
    summary: "Operação conjunta com Ibama e Polícia Militar intensifica patrulhamento.",
    image: policeImg,
    chapeu: "Segurança",
    time: "3 horas atrás",
  },
  {
    id: "lat-11",
    title: "Nova rodoviária interestadual de Brasília deve ficar pronta em 2026",
    summary: "Terminal moderno terá capacidade para 100 mil passageiros por dia.",
    image: trafficImg,
    chapeu: "Infraestrutura",
    time: "3 horas atrás",
  },
  {
    id: "lat-12",
    title: "Brasília se torna polo de inteligência artificial com nova incubadora",
    summary: "Hub tecnológico vai acelerar 50 startups de IA até o final de 2026.",
    image: heroImg,
    chapeu: "Tecnologia",
    time: "4 horas atrás",
  },
  {
    id: "lat-13",
    title: "5G chega a 100% do Distrito Federal com cobertura completa",
    summary: "Todas as regiões administrativas agora contam com sinal de quinta geração.",
    image: cityImg,
    chapeu: "Tecnologia",
    time: "4 horas atrás",
  },
  {
    id: "lat-14",
    title: "Universidade de Brasília abre 2 mil vagas em cursos de tecnologia",
    summary: "Novas turmas de ciência da computação, engenharia e IA começam em agosto.",
    image: studentsImg,
    chapeu: "Educação",
    time: "5 horas atrás",
  },
  {
    id: "lat-15",
    title: "Brasília é eleita melhor cidade para investir no Brasil em 2025",
    summary: "Ranking considera infraestrutura, qualidade de vida e ambiente de negócios.",
    image: cityImg,
    chapeu: "Economia",
    time: "5 horas atrás",
  },
];

export default function LatestNews() {
  const { articles } = useArticles();

  const realLatest = articles.filter((a) => a.category.toLowerCase().includes("df") || a.tag.toLowerCase().includes("df")).slice(0, 15);

  const allNews = realLatest.length > 0
    ? realLatest.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.subtitle,
        image: a.imageUrl || cityImg,
        chapeu: a.tag,
        time: new Date(a.publishedAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }),
      }))
    : latestNews;

  return (
    <div className="bg-white border-t border-b border-gray-200 py-6">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1 h-5 bg-[#0b3d91]" />
          <h2 className="text-[15px] font-bold text-[#1a1a1a] uppercase tracking-wider">Últimas Notícias</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {allNews.slice(0, 15).map((item) => (
            <Link key={item.id} href={`/artigo/${item.id}`} className="block group">
              <div className="flex items-start gap-3">
                <div className="w-[80px] h-[60px] shrink-0 overflow-hidden bg-gray-100">
                  <img
                    src={item.image}
                    alt={item.chapeu}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#0b3d91]">
                    {item.chapeu}
                  </span>
                  <h4 className="font-serif text-[#1a1a1a] text-[13px] font-bold leading-snug group-hover:text-[#0b3d91] transition-colors line-clamp-3">
                    {item.title}
                  </h4>
                  <span className="text-[10px] text-gray-400">{item.time}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
