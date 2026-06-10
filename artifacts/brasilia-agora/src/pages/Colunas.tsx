import { Link } from "wouter";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import avatar1 from "../assets/images/avatar1.png";
import avatar2 from "../assets/images/avatar2.png";
import avatar3 from "../assets/images/avatar3.png";

const columnists = [
  { id: "1", name: "Denise Rothenburg", title: "Analista Política", desc: "Bastidores e nos corredores do poder no DF", image: avatar1, color: "bg-blue-600", recent: "As movimentações na CLDF para aprovação do orçamento" },
  { id: "2", name: "Ana Maria Campos", title: "Urbanista", desc: "Cidades inteligentes e mobilidade urbana", image: avatar2, color: "bg-teal-600", recent: "Como o novo BRT vai impactar a rotina do trabalhador" },
  { id: "3", name: "Carlos Alexandre", title: "Segurança Pública", desc: "Análise da criminalidade e políticas de segurança", image: avatar3, color: "bg-red-600", recent: "A importância do monitoramento por câmeras no centro" },
  { id: "4", name: "Ricardo Mendes", title: "Economista", desc: "Economia do DF: tendências e impactos", color: "bg-amber-600", initials: "RM", recent: "Inflação local: o que esperar para o próximo semestre" },
  { id: "5", name: "Juliana Paiva", title: "Educação", desc: "O futuro das escolas públicas do DF", color: "bg-purple-600", initials: "JP", recent: "Tecnologia em sala de aula: desafios e oportunidades" },
  { id: "6", name: "Paulo Sérgio", title: "Esportes", desc: "O esporte brasiliense em perspectiva", color: "bg-green-600", initials: "PS", recent: "O renascimento do futebol local e seus ídolos" }
];

const recentArticles = [
  { time: "09:45", title: "As movimentações na CLDF para aprovação do orçamento", author: "Denise Rothenburg" },
  { time: "08:30", title: "Como o novo BRT vai impactar a rotina do trabalhador", author: "Ana Maria Campos" },
  { time: "07:15", title: "Inflação local: o que esperar para o próximo semestre", author: "Ricardo Mendes" },
  { time: "06:50", title: "A importância do monitoramento por câmeras no centro", author: "Carlos Alexandre" },
  { time: "06:20", title: "Tecnologia em sala de aula: desafios e oportunidades", author: "Juliana Paiva" }
];

export default function Colunas() {
  const featured = columnists[2]; // Carlos Alexandre

  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      
      <main className="flex-1 bg-white">
        {/* Section header bar */}
        <div className="w-full bg-[#1a2448] py-6">
          <div className="max-w-[1280px] mx-auto px-4">
            <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">
              COLUNAS
            </h1>
          </div>
        </div>

        <div className="max-w-[1280px] mx-auto px-4 mt-8 pb-16">
          {/* Page title section */}
          <div className="flex flex-col items-center justify-center text-center mb-12">
            <h2 className="text-3xl font-bold text-[#1a2448] mb-3">
              Opiniões e análises dos nossos colunistas
            </h2>
            <div className="w-16 h-1.5 bg-[#1d4ed8]"></div>
          </div>

          {/* Featured columnist */}
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-8 mb-16 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
              <div className="w-40 h-40 shrink-0">
                <img src={featured.image} alt={featured.name} className="w-full h-full rounded-full object-cover border-4 border-white shadow-md grayscale hover:grayscale-0 transition-all duration-500" />
              </div>
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[#dc2626] font-bold text-xs uppercase tracking-wider bg-red-50 px-2 py-1 rounded">DESTAQUE</span>
                </div>
                <h3 className="text-3xl font-bold text-[#1a2448] mb-1">{featured.name}</h3>
                <p className="text-gray-500 font-medium mb-4">{featured.title} — {featured.desc}</p>
                <div className="bg-white p-6 rounded-md border border-gray-100 mt-2">
                  <span className="text-xs text-gray-400 font-bold mb-2 block">ÚLTIMA COLUNA • HOJE</span>
                  <Link href={`/artigo/coluna-${featured.id}`}>
                    <h4 className="text-xl font-bold text-[#1a2448] hover:text-[#1d4ed8] transition-colors cursor-pointer leading-tight mb-2">
                      {featured.recent}
                    </h4>
                  </Link>
                  <p className="text-gray-600 text-sm">
                    A ampliação da rede de câmeras no centro da capital já mostra resultados na inibição de delitos, mas esbarra em questões de privacidade que precisam ser debatidas pela sociedade e poder público...
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-12">
            {/* Grid of columnists */}
            <div className="w-full lg:w-2/3">
              <div className="flex items-center mb-6">
                <div className="w-1.5 h-6 bg-[#6b7280] mr-3"></div>
                <h2 className="text-xl font-bold text-[#1a2448]">TODOS OS COLUNISTAS</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {columnists.map((col) => (
                  <div key={col.id} className="border border-gray-100 rounded-lg p-6 bg-white hover:border-gray-300 hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-4 mb-4">
                      {col.image ? (
                        <img src={col.image} alt={col.name} className="w-16 h-16 rounded-full object-cover grayscale group-hover:grayscale-0 transition-all duration-300" />
                      ) : (
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold ${col.color}`}>
                          {col.initials}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-[#1a2448] text-lg leading-tight">{col.name}</h3>
                        <p className="text-[#1d4ed8] text-xs font-bold">{col.title}</p>
                      </div>
                    </div>
                    <div className="border-t border-gray-50 pt-4 mt-2">
                      <p className="text-sm font-medium text-gray-800 mb-4 line-clamp-2">
                        "{col.recent}"
                      </p>
                      <Link href={`/artigo/coluna-${col.id}`}>
                        <button className="text-xs font-bold text-[#1d4ed8] hover:text-[#1a2448] transition-colors border border-[#1d4ed8] hover:border-[#1a2448] px-4 py-1.5 rounded-full w-full">
                          LER COLUNA
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent columns list */}
            <div className="w-full lg:w-1/3">
              <div className="flex items-center mb-6">
                <div className="w-1.5 h-6 bg-[#1a2448] mr-3"></div>
                <h2 className="text-xl font-bold text-[#1a2448]">ÚLTIMAS PUBLICAÇÕES</h2>
              </div>
              
              <div className="flex flex-col space-y-4">
                {recentArticles.map((item, i) => (
                  <div key={i} className="flex flex-col group cursor-pointer border-b border-gray-100 pb-4 last:border-0">
                    <Link href={`/artigo/rec-${i}`}>
                      <span className="text-gray-500 text-xs font-bold mb-1 flex items-center gap-2">
                        {item.time} • <span className="text-[#1d4ed8]">{item.author}</span>
                      </span>
                      <p className="text-[15px] text-[#1a2448] font-bold leading-snug group-hover:text-[#c8102e] transition-colors">
                        {item.title}
                      </p>
                    </Link>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 py-2 border border-[#1a2448] text-[#1a2448] font-bold text-sm hover:bg-[#1a2448] hover:text-white transition-colors">
                VER TODAS
              </button>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}