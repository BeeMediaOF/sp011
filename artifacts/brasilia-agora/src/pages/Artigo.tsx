import React from "react";
import { useParams, Link } from "wouter";
import { FaFacebook, FaTwitter, FaWhatsapp } from "react-icons/fa";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import RedacaoBanner from "../components/RedacaoBanner";
import Footer from "../components/Footer";
import ArticleCard from "../components/ArticleCard";
import AdSidebar from "../components/ads/AdSidebar";

import heroImg from "../assets/images/hero.png";
import politics2Img from "../assets/images/politics2.png";
import parkImg from "../assets/images/park.png";
import busImg from "../assets/images/bus.png";
import hospitalImg from "../assets/images/hospital.png";

export default function Artigo() {
  const { slug } = useParams();

  const article = {
    title: "Câmara Legislativa aprova projeto que cria o programa Morar DF",
    subtitle: "Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal e entorno.",
    category: "POLÍTICA",
    categoryColor: "#1d4ed8",
    author: "Redação Brasília Agora",
    date: "14 de Maio de 2024 às 14:30",
    image: heroImg,
    content: [
      "A Câmara Legislativa do Distrito Federal (CLDF) aprovou em segundo turno, na tarde desta terça-feira (14), o projeto de lei que institui o programa Morar DF. A iniciativa do Governo do Distrito Federal (GDF) visa facilitar o acesso à casa própria para famílias de baixa renda por meio de subsídios diretos.",
      "O texto base, que recebeu amplo apoio dos parlamentares, prevê que famílias com renda mensal de até três salários mínimos poderão receber auxílios que variam de R$ 15 mil a R$ 25 mil para utilizarem como entrada em financiamentos imobiliários. Segundo o relator do projeto, o objetivo é diminuir o déficit habitacional da capital, estimado em mais de 100 mil moradias.",
      "O programa será gerido pela Companhia de Desenvolvimento Habitacional do Distrito Federal (Codhab), que ficará responsável pelo cadastramento e seleção dos beneficiários. As inscrições devem ser abertas no próximo mês, após a sanção do governador e a publicação das regras no Diário Oficial do DF.",
      "Além do subsídio para a entrada, o Morar DF também prevê isenção de taxas cartoriais para a primeira habitação, o que, de acordo com especialistas do setor imobiliário, pode aquecer o mercado da construção civil na região, gerando novos empregos. A oposição na CLDF apresentou emendas para garantir que pelo menos 30% das moradias fossem destinadas a mães solo, medida que também foi acatada pelo plenário.",
      "O GDF afirmou que os recursos para o programa já estão previstos no orçamento deste ano e provêm do Fundo de Desenvolvimento Urbano do Distrito Federal (Fundurb). A expectativa é beneficiar cerca de 10 mil famílias apenas neste primeiro ano de implementação."
    ]
  };

  const relatedArticles = [
    { id: "rel-1", title: "Governador anuncia novo pacote de obras", time: "4 horas atrás", imageUrl: politics2Img, tag: "POLÍTICA", tagColor: "#1d4ed8" },
    { id: "rel-2", title: "GDF encaminha à Câmara LDO de 2025", time: "8 horas atrás", imageUrl: politics2Img, tag: "POLÍTICA", tagColor: "#1d4ed8" },
    { id: "rel-3", title: "Bancada do DF no Congresso debate emendas", time: "1 dia atrás", imageUrl: politics2Img, tag: "POLÍTICA", tagColor: "#1d4ed8" },
    { id: "rel-4", title: "Novas regras para licitações no DF", time: "12 horas atrás", imageUrl: heroImg, tag: "POLÍTICA", tagColor: "#1d4ed8" }
  ];

  const moreArticles = [
    { id: "m-1", title: "Parques do DF terão programação especial", time: "5 horas atrás", imageUrl: parkImg, tag: "CIDADE", tagColor: "#2563eb" },
    { id: "m-2", title: "GDF anuncia mais 124 ônibus", time: "6 horas atrás", imageUrl: busImg, tag: "TRANSPORTE", tagColor: "#0284c7" },
    { id: "m-3", title: "Queda nos casos de dengue em maio", time: "4 horas atrás", imageUrl: hospitalImg, tag: "SAÚDE", tagColor: "#16a34a" },
    { id: "m-4", title: "Concurso da Saúde tem edital publicado", time: "2 dias atrás", imageUrl: hospitalImg, tag: "SAÚDE", tagColor: "#16a34a" },
    { id: "m-5", title: "Obras no Eixão alteram trânsito", time: "1 hora atrás", imageUrl: parkImg, tag: "CIDADE", tagColor: "#2563eb" },
    { id: "m-6", title: "Estações do BRT passam por reforma", time: "8 horas atrás", imageUrl: busImg, tag: "TRANSPORTE", tagColor: "#0284c7" }
  ];

  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />

      <main className="flex-1 bg-white pb-16">
        <div className="max-w-[1280px] mx-auto px-4 mt-6 flex gap-6">
          <AdSidebar />

          <div className="flex-1 min-w-0">
            <div className="flex flex-col lg:flex-row gap-10">
              <article className="w-full lg:w-2/3">
              {/* Breadcrumb */}
              <div className="text-gray-500 text-xs font-medium mb-4 flex items-center gap-1">
                <Link href="/" className="hover:text-[#1d4ed8]">Início</Link> &gt;
                <Link href="/politica" className="hover:text-[#1d4ed8]">{article.category}</Link> &gt;
                <span className="text-gray-400">Artigo</span>
              </div>

              <span className="inline-block text-white text-xs font-bold px-2.5 py-1 rounded-sm mb-4" style={{ backgroundColor: article.categoryColor }}>
                {article.category}
              </span>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#1a2448] leading-tight mb-4 tracking-tight">{article.title}</h1>
              <p className="text-lg md:text-xl text-gray-600 mb-6 font-medium leading-relaxed">{article.subtitle}</p>

              {/* Author bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-y border-gray-100 mb-8 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                    <span className="text-gray-500 font-bold">BA</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#1a2448]">Por {article.author}</div>
                    <div className="text-xs text-gray-500">{article.date}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 mr-2">COMPARTILHE:</span>
                  <button className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"><FaFacebook size={14} /></button>
                  <button className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600 transition-colors"><FaTwitter size={14} /></button>
                  <button className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors"><FaWhatsapp size={14} /></button>
                </div>
              </div>

              {/* Hero Image */}
              <div className="w-full aspect-[16/9] mb-8 rounded-sm overflow-hidden">
                <img src={article.image} alt={article.title} className="w-full h-full object-cover" />
                <div className="text-right text-[10px] text-gray-400 mt-1">Foto: Divulgação / Brasília Agora</div>
              </div>

              {/* Body */}
              <div className="prose prose-lg max-w-none text-gray-800">
                {article.content.map((paragraph, index) => (
                  <p key={index} className="mb-6 leading-relaxed">{paragraph}</p>
                ))}
              </div>
            </article>

            {/* Sidebar */}
            <aside className="w-full lg:w-1/3">
              <div className="sticky top-24 space-y-6">
                {/* Ônico anúncio discreto no sidebar */}
                <div className="w-full h-[250px] bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center">
                  <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade — 336 × 280</p>
                </div>

                {/* Related */}
                <div className="bg-gray-50 p-6 rounded-sm border border-gray-100">
                  <h3 className="font-bold text-[#1a2448] text-lg mb-5 flex items-center gap-2 uppercase">MAIS EM {article.category}</h3>
                  <div className="flex flex-col space-y-4">
                    {relatedArticles.map((rel) => (
                      <Link key={rel.id} href={`/artigo/${rel.id}`}>
                        <div className="flex gap-3 group cursor-pointer border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                          <img src={rel.imageUrl} alt={rel.title} className="w-20 h-16 object-cover rounded-sm group-hover:opacity-80 transition-opacity shrink-0" />
                          <div className="flex flex-col justify-center">
                            <span className="text-[10px] font-bold text-gray-500 mb-1">{rel.time}</span>
                            <h4 className="text-sm font-bold text-[#1a2448] group-hover:text-[#1d4ed8] transition-colors leading-snug line-clamp-2">{rel.title}</h4>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Leia Também */}
                <div>
                  <h3 className="font-bold text-[#1a2448] text-lg mb-5 flex items-center gap-2">
                    <div className="w-1.5 h-5 bg-[#F5A623]" />
                    LEIA TAMBÉM
                  </h3>
                  <div className="flex flex-col space-y-4">
                    {moreArticles.slice(0, 3).map((item) => (
                      <Link key={item.id} href={`/artigo/${item.id}`}>
                        <div className="group cursor-pointer">
                          <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-sm inline-block mb-1" style={{ backgroundColor: item.tagColor }}>{item.tag}</span>
                          <h4 className="text-[15px] font-bold text-[#1a2448] group-hover:text-[#1d4ed8] transition-colors leading-snug">{item.title}</h4>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
                </div>
              </aside>
            </div>
          </div>

          <AdSidebar />
        </div>

        {/* Banner acima do rodapé */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <div className="w-full h-[90px] bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center">
            <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade — 728 × 90</p>
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="max-w-[1280px] mx-auto px-4 mt-16 pt-10 border-t border-gray-200">
          <div className="flex items-center mb-6">
            <div className="w-1.5 h-6 bg-[#1a2448] mr-3" />
            <h2 className="text-xl font-bold text-[#1a2448] uppercase">MAIS NOTÍCIAS</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {moreArticles.map((a) => (
              <ArticleCard key={a.id} {...a} />
            ))}
          </div>
        </div>
      </main>

      <RedacaoBanner />
      <Footer />
    </div>
  );
}
