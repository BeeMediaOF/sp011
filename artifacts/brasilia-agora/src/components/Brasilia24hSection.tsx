import { Link } from "wouter";
import { useArticles } from "../hooks/useArticles";
import cityImg from "../assets/images/city.png";
import hospitalImg from "../assets/images/hospital.png";
import busImg from "../assets/images/bus.png";
import studentsImg from "../assets/images/students.png";
import parkImg from "../assets/images/park.png";
import trafficImg from "../assets/images/traffic.png";
import policeImg from "../assets/images/police.png";
import heroImg from "../assets/images/hero.png";

const brasiliaExtraNews = [
  {
    id: "bsb-1",
    title: "Asa Sul ganha novo centro de convivência com praça e ciclovia",
    summary: "Espaço revitalizado no Quádra 112 será inaugurado na próxima semana.",
    image: parkImg,
    chapeu: "Urbanismo",
    time: "15 minutos atrás",
  },
  {
    id: "bsb-2",
    title: "Metrô do DF anuncia ampliação para 50 trens nas linhas verde e laranja",
    summary: "Novas composições vão reduzir tempo de espera em horários de pico.",
    image: busImg,
    chapeu: "Transporte",
    time: "35 minutos atrás",
  },
  {
    id: "bsb-3",
    title: "Hospital da Asa Norte inaugura nova UTI Neonatal com 20 leitos",
    summary: "Investimento de R$ 8 milhões vai atender prematuros de toda a região.",
    image: hospitalImg,
    chapeu: "Saúde",
    time: "1 hora atrás",
  },
  {
    id: "bsb-4",
    title: "DF lidera ranking de cidades com mais áreas verdes por habitante",
    summary: "Levantamento do IBGE destaca Brasília com 60 m² de verde por pessoa.",
    image: parkImg,
    chapeu: "Meio Ambiente",
    time: "1 hora atrás",
  },
  {
    id: "bsb-5",
    title: "Brasília Shopping inaugura expansão com 30 novas lojas e 8 restaurantes",
    summary: "Reforma traz novas marcas de luxo e área gastronômica no setor de entretenimento.",
    image: cityImg,
    chapeu: "Comércio",
    time: "2 horas atrás",
  },
  {
    id: "bsb-6",
    title: "Universidade de Brasília abre 2 mil vagas em cursos de tecnologia",
    summary: "Novas turmas de ciência da computação, engenharia e IA começam em agosto.",
    image: studentsImg,
    chapeu: "Educação",
    time: "2 horas atrás",
  },
  {
    id: "bsb-7",
    title: "DF amplia fiscalização contra desmatamento ilegal nas áreas de preservação",
    summary: "Operação conjunta com Ibama e Polícia Militar intensifica patrulhamento.",
    image: policeImg,
    chapeu: "Segurança",
    time: "3 horas atrás",
  },
  {
    id: "bsb-8",
    title: "Nova rodoviária interestadual de Brasília deve ficar pronta em 2026",
    summary: "Terminal moderno terá capacidade para 100 mil passageiros por dia.",
    image: trafficImg,
    chapeu: "Infraestrutura",
    time: "3 horas atrás",
  },
];

export default function Brasilia24hSection() {
  const { articles } = useArticles();

  const realDF = articles.filter((a) =>
    a.category.toLowerCase().includes("df") ||
    a.category.toLowerCase().includes("brasília") ||
    a.tag.toLowerCase().includes("df") ||
    a.tag.toLowerCase().includes("brasília")
  );

  const allNews = realDF.length > 0
    ? realDF.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.subtitle,
        image: a.imageUrl || cityImg,
        chapeu: a.tag,
        time: new Date(a.publishedAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }),
      }))
    : brasiliaExtraNews;

  return (
    <section className="bg-[#0b3d91] py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-white" />
            <h2 className="text-[18px] font-bold text-white uppercase tracking-wider">Brasília 24h</h2>
          </div>
          <Link
            href="/df"
            className="text-[11px] font-bold hover:underline uppercase tracking-wider text-white/80"
          >
            Ver mais →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {allNews.slice(0, 8).map((item) => (
            <Link key={item.id} href={`/artigo/${item.id}`} className="block group">
              <div className="overflow-hidden bg-white/10 mb-3">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-[160px] object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                {item.chapeu}
              </span>
              <h3 className="font-serif text-white text-[17px] font-bold leading-snug mt-1 group-hover:text-white/80 transition-colors line-clamp-3">
                {item.title}
              </h3>
              <p className="text-white/60 text-sm leading-relaxed mt-1.5 line-clamp-2">
                {item.summary}
              </p>
              <div className="text-[11px] text-white/50 mt-2">
                {item.time}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
