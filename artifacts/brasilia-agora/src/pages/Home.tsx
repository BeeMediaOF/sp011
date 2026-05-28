import React from "react";
import { Link } from "wouter";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import MaisLidasSection from "../components/MaisLidasSection";
import RedacaoBanner from "../components/RedacaoBanner";
import Footer from "../components/Footer";
import AdCentral from "../components/ads/AdCentral";

import policeImg from "../assets/images/police.png";
import security2Img from "../assets/images/security2.png";
import sportsImg from "../assets/images/sports.png";
import parkImg from "../assets/images/park.png";
import festivalImg from "../assets/images/festival.png";
import culturaFeatImg from "../assets/images/cultura_feat.png";
import culture2Img from "../assets/images/culture2.png";
import heroImg from "../assets/images/hero.png";
import politicaFeatImg from "../assets/images/politica_feat.png";
import politics2Img from "../assets/images/politics2.png";
import brasilImg from "../assets/images/brasil.png";
import especialImg from "../assets/images/especial.png";
import mundoImg from "../assets/images/mundo.png";
import trafficImg from "../assets/images/traffic.png";
import busImg from "../assets/images/bus.png";
import hospitalImg from "../assets/images/hospital.png";
import studentsImg from "../assets/images/students.png";
import cityImg from "../assets/images/city.png";
import avatar1 from "../assets/images/avatar1.png";
import avatar2 from "../assets/images/avatar2.png";
import avatar3 from "../assets/images/avatar3.png";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-[#f4f4f4] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />

      <main className="flex-1">

        {/* ═══════════════════════════════════════════════
            HERO — Mosaico de 5 cards assimétricos
        ═══════════════════════════════════════════════ */}
        <section className="bg-[#0d1633] py-6">
          <div className="max-w-[1280px] mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:h-[520px]">

              {/* Card principal — ocupa 7 colunas e toda a altura */}
              <Link href="/artigo/hero-1" className="lg:col-span-7 block group relative overflow-hidden bg-gray-900">
                <img src={heroImg} alt="Principal" className="w-full h-[300px] lg:h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6 w-full">
                  <span className="inline-block bg-[#c8102e] text-white text-[11px] font-bold px-3 py-1 mb-3 uppercase tracking-wide">Política</span>
                  <h2 className="text-white text-3xl lg:text-4xl font-black leading-tight mb-3 group-hover:text-blue-200 transition-colors">
                    Câmara Legislativa aprova projeto que cria o programa Morar DF
                  </h2>
                  <p className="text-gray-300 text-sm leading-relaxed mb-3 max-w-xl">
                    Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.
                  </p>
                  <span className="text-gray-400 text-xs">2 horas atrás</span>
                </div>
              </Link>

              {/* Coluna direita — 5 colunas dividida em 2 linhas */}
              <div className="lg:col-span-5 grid grid-cols-2 grid-rows-2 gap-3 h-full">

                {/* Card 2 — topo esquerda */}
                <Link href="/artigo/hero-2" className="block group relative overflow-hidden bg-gray-900">
                  <img src={trafficImg} alt="Trânsito" className="w-full h-full min-h-[140px] object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-3 w-full">
                    <span className="block text-[10px] font-bold text-[#f59e0b] uppercase mb-1">Trânsito</span>
                    <h3 className="text-white text-sm font-bold leading-snug line-clamp-3 group-hover:text-yellow-200 transition-colors">
                      Obras no Eixão alteram trânsito neste fim de semana em Brasília
                    </h3>
                    <span className="text-gray-400 text-[11px] mt-1 block">1 hora atrás</span>
                  </div>
                </Link>

                {/* Card 3 — topo direita */}
                <Link href="/artigo/hero-3" className="block group relative overflow-hidden bg-gray-900">
                  <img src={policeImg} alt="Segurança" className="w-full h-full min-h-[140px] object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-3 w-full">
                    <span className="block text-[10px] font-bold text-[#c8102e] uppercase mb-1">Segurança</span>
                    <h3 className="text-white text-sm font-bold leading-snug line-clamp-3 group-hover:text-red-200 transition-colors">
                      Polícia Civil prende grupo suspeito de furtos no Plano Piloto
                    </h3>
                    <span className="text-gray-400 text-[11px] mt-1 block">3 horas atrás</span>
                  </div>
                </Link>

                {/* Card 4 — baixo esquerda */}
                <Link href="/artigo/hero-4" className="block group relative overflow-hidden bg-gray-900">
                  <img src={hospitalImg} alt="Saúde" className="w-full h-full min-h-[140px] object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-3 w-full">
                    <span className="block text-[10px] font-bold text-[#16a34a] uppercase mb-1">Saúde</span>
                    <h3 className="text-white text-sm font-bold leading-snug line-clamp-3 group-hover:text-green-200 transition-colors">
                      Hospitais do DF registram queda nos casos de dengue em maio
                    </h3>
                    <span className="text-gray-400 text-[11px] mt-1 block">4 horas atrás</span>
                  </div>
                </Link>

                {/* Card 5 — baixo direita */}
                <Link href="/artigo/hero-5" className="block group relative overflow-hidden bg-gray-900">
                  <img src={studentsImg} alt="Educação" className="w-full h-full min-h-[140px] object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-3 w-full">
                    <span className="block text-[10px] font-bold text-[#7c3aed] uppercase mb-1">Educação</span>
                    <h3 className="text-white text-sm font-bold leading-snug line-clamp-3 group-hover:text-purple-200 transition-colors">
                      Escolas públicas do DF alcançam melhores índices no IDEB 2023
                    </h3>
                    <span className="text-gray-400 text-[11px] mt-1 block">5 horas atrás</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            BARRA RÁPIDA — manchetes em linha
        ═══════════════════════════════════════════════ */}
        <div className="bg-[#0d1633] border-y border-white/10">
          <div className="max-w-[1280px] mx-auto px-4 flex items-center gap-6 py-2">
            <span className="bg-[#c8102e] text-white text-[10px] font-black px-2 py-1 uppercase tracking-widest shrink-0">Manchetes</span>
            <div className="overflow-hidden flex-1">
              <div className="flex gap-6 text-white/70 text-xs font-medium whitespace-nowrap overflow-x-auto no-scrollbar">
                <span>GDF entrega 758 unidades habitacionais no Sol Nascente</span>
                <span className="text-white/20">|</span>
                <span>DF registra menor índice de homicídios dos últimos 10 anos</span>
                <span className="text-white/20">|</span>
                <span>Concurso da Educação terá edital publicado em junho</span>
                <span className="text-white/20">|</span>
                <span>Metrô do DF anuncia novas grades de horário a partir de junho</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            SEÇÃO PRINCIPAL — 3 colunas: lista + destaque + opinião
        ═══════════════════════════════════════════════ */}
        <div className="max-w-[1280px] mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Coluna esquerda — Últimas Notícias */}
            <div className="lg:col-span-3">
              <div className="flex items-center mb-5">
                <div className="w-1 h-6 bg-[#c8102e] mr-3" />
                <h2 className="text-[15px] font-black text-[#0d1633] uppercase tracking-wide">Últimas Notícias</h2>
              </div>
              <div className="flex flex-col divide-y divide-gray-200">
                {[
                  { id: "ult-1", time: "09:45", text: "GDF entrega 758 unidades habitacionais no Sol Nascente" },
                  { id: "ult-2", time: "08:30", text: "Mais de 1,2 mil vagas de emprego estão abertas nas agências" },
                  { id: "ult-3", time: "07:15", text: "DF registra menor índice de homicídios dos últimos 10 anos" },
                  { id: "ult-4", time: "06:50", text: "Concurso da Educação do DF terá edital publicado em junho" },
                  { id: "ult-5", time: "06:20", text: "Programação gratuita em espaços do DF neste fim de semana" },
                  { id: "ult-6", time: "05:40", text: "Metrô do DF anuncia novas grades de horário a partir de junho" },
                ].map((item) => (
                  <Link key={item.id} href={`/artigo/${item.id}`} className="block py-3 group">
                    <div className="flex gap-3">
                      <span className="text-[#c8102e] font-black text-xs min-w-[38px] pt-0.5 shrink-0">{item.time}</span>
                      <p className="text-[13px] text-[#0d1633] font-semibold leading-snug group-hover:text-[#1d4ed8] transition-colors">
                        {item.text}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/">
                <button className="w-full mt-4 py-2.5 bg-[#0d1633] text-white font-bold text-xs uppercase tracking-wide hover:bg-[#c8102e] transition-colors">
                  Ver Todas
                </button>
              </Link>
            </div>

            {/* Coluna central — Especial */}
            <div className="lg:col-span-6">
              <Link href="/artigo/especial-1" className="block group">
                <div className="relative overflow-hidden mb-4">
                  <img src={especialImg} alt="Especial" className="w-full aspect-[16/9] object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute top-0 left-0 bg-[#ca8a04] text-white text-xs font-black px-4 py-1.5 uppercase tracking-wide">
                    Especial
                  </div>
                </div>
                <h2 className="text-2xl lg:text-3xl font-black text-[#0d1633] mb-3 leading-tight group-hover:text-[#1d4ed8] transition-colors">
                  Os 64 anos de Brasília: a capital que inspira o futuro
                </h2>
                <p className="text-gray-600 text-sm mb-3 leading-relaxed">
                  Confira a história, os desafios e as perspectivas da cidade que é patrimônio de todos os brasileiros.
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-xs">10 horas atrás</span>
                  <span className="w-1 h-1 rounded-full bg-gray-300" />
                  <span className="text-[#1d4ed8] text-xs font-bold hover:underline">Leia mais →</span>
                </div>
              </Link>

              {/* 2 notícias menores abaixo */}
              <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-200">
                {[
                  { id: "mid-1", img: cityImg, tag: "Cidade", color: "#2563eb", title: "Parques do DF terão programação especial no Dia do Meio Ambiente", time: "5h atrás" },
                  { id: "mid-2", img: busImg, tag: "Transporte", color: "#0284c7", title: "GDF anuncia mais 124 ônibus para reforçar o transporte público", time: "6h atrás" },
                ].map((item) => (
                  <Link key={item.id} href={`/artigo/${item.id}`} className="block group">
                    <div className="overflow-hidden mb-2">
                      <img src={item.img} alt={item.tag} className="w-full aspect-[16/9] object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <span className="text-[11px] font-bold uppercase" style={{ color: item.color }}>{item.tag}</span>
                    <h4 className="text-[#0d1633] font-bold text-sm leading-snug mt-1 group-hover:text-[#1d4ed8] transition-colors line-clamp-3">
                      {item.title}
                    </h4>
                    <span className="text-gray-400 text-xs">{item.time}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Coluna direita — Opinião */}
            <div className="lg:col-span-3">
              <div className="flex items-center mb-5">
                <div className="w-1 h-6 bg-[#c8102e] mr-3" />
                <h2 className="text-[15px] font-black text-[#0d1633] uppercase tracking-wide">Opinião</h2>
              </div>

              <div className="flex flex-col gap-5">
                {[
                  { id: "col-1", avatar: avatar1, name: "Denise Rothenburg", role: "Colunista", desc: "Os bastidores da política que impactam o DF e o país" },
                  { id: "col-2", avatar: avatar2, name: "Ana Maria Campos", role: "Colunista", desc: "Mobilidade urbana: os caminhos e desafios da capital" },
                  { id: "col-3", avatar: avatar3, name: "Carlos Alexandre", role: "Colunista", desc: "Segurança pública: avanços e pontos de atenção" },
                ].map((item) => (
                  <Link key={item.id} href="/colunas" className="block group">
                    <div className="flex gap-3 items-start p-3 border border-gray-200 hover:border-[#c8102e] transition-colors bg-white">
                      <img src={item.avatar} alt={item.name} className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 shrink-0 grayscale group-hover:grayscale-0 transition-all duration-300" />
                      <div>
                        <span className="text-[10px] font-bold text-[#c8102e] uppercase tracking-wide">{item.role}</span>
                        <h4 className="font-black text-[#0d1633] text-sm group-hover:text-[#1d4ed8] transition-colors leading-tight">{item.name}</h4>
                        <p className="text-xs text-gray-500 italic leading-snug mt-1">"{item.desc}"</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Mini-banner lateral */}
              <div className="mt-6 bg-[#0d1633] p-4 text-center">
                <p className="text-white text-xs font-bold uppercase tracking-wider mb-1">Newsletter</p>
                <p className="text-gray-400 text-xs mb-3">Receba as principais notícias do DF no seu e-mail</p>
                <input type="email" placeholder="seu@email.com" className="w-full px-3 py-2 text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 mb-2 focus:outline-none focus:border-[#c8102e]" />
                <button className="w-full py-2 bg-[#c8102e] text-white text-xs font-bold uppercase tracking-wide hover:bg-red-700 transition-colors">
                  Assinar
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            AD CENTRAL
        ═══════════════════════════════════════════════ */}
        <div className="max-w-[1280px] mx-auto px-4 py-4">
          <AdCentral />
        </div>

        {/* ═══════════════════════════════════════════════
            SEGURANÇA — Layout numerado (ranking style)
        ═══════════════════════════════════════════════ */}
        <section className="bg-white border-t border-gray-200 py-8">
          <div className="max-w-[1280px] mx-auto px-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-[#dc2626]" />
                <h2 className="text-xl font-black text-[#0d1633] uppercase">Segurança</h2>
              </div>
              <Link href="/seguranca" className="text-xs font-bold text-[#dc2626] hover:underline uppercase tracking-wide">Ver mais →</Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Featured grande */}
              <Link href="/artigo/seg-destaque" className="lg:col-span-5 block group relative overflow-hidden bg-gray-900">
                <img src={security2Img} alt="Segurança" className="w-full h-[280px] object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="absolute bottom-0 left-0 p-5 w-full">
                  <span className="text-[11px] font-bold text-[#dc2626] bg-white px-2 py-0.5 mb-3 inline-block uppercase">Destaque</span>
                  <h3 className="text-white font-black text-xl leading-snug group-hover:text-red-200 transition-colors">
                    Polícia Civil do DF registra queda de 18% nos crimes contra o patrimônio em maio
                  </h3>
                  <span className="text-gray-400 text-xs mt-2 block">30 minutos atrás</span>
                </div>
              </Link>
              {/* Lista numerada */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
                {[
                  { id: "seg-1", num: "01", img: policeImg, title: "Operação prende 12 suspeitos de tráfico no Recanto das Emas", time: "1 hora atrás" },
                  { id: "seg-2", num: "02", img: security2Img, title: "PMDF reforça policiamento nos parques do DF neste fim de semana", time: "2 horas atrás" },
                  { id: "seg-3", num: "03", img: policeImg, title: "Câmeras de monitoramento ajudam a reduzir crimes no Plano Piloto", time: "5 horas atrás" },
                ].map((item) => (
                  <Link key={item.id} href={`/artigo/${item.id}`} className="block group p-4 hover:bg-gray-50 transition-colors">
                    <div className="overflow-hidden mb-3">
                      <img src={item.img} alt={item.title} className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <div className="text-4xl font-black text-gray-100 leading-none mb-2 select-none">{item.num}</div>
                    <h4 className="font-bold text-[#0d1633] text-sm leading-snug group-hover:text-[#dc2626] transition-colors line-clamp-3">
                      {item.title}
                    </h4>
                    <span className="text-gray-400 text-xs mt-2 block">{item.time}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            ESPORTES — Cards horizontais largos
        ═══════════════════════════════════════════════ */}
        <section className="bg-[#f7f7f7] border-t border-gray-200 py-8">
          <div className="max-w-[1280px] mx-auto px-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-[#b45309]" />
                <h2 className="text-xl font-black text-[#0d1633] uppercase">Esportes</h2>
              </div>
              <Link href="/esportes" className="text-xs font-bold text-[#b45309] hover:underline uppercase tracking-wide">Ver mais →</Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Principal — card horizontal grande */}
              <Link href="/artigo/esp-destaque" className="block group lg:row-span-2 relative overflow-hidden bg-gray-900">
                <img src={sportsImg} alt="Esportes" className="w-full h-[320px] lg:h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6 w-full">
                  <span className="inline-block bg-[#b45309] text-white text-[11px] font-bold px-3 py-1 mb-3 uppercase">Esportes</span>
                  <h3 className="text-white font-black text-2xl leading-snug mb-2 group-hover:text-yellow-200 transition-colors">
                    GDF anuncia investimento de R$ 50 milhões na reforma do Estádio Mané Garrincha
                  </h3>
                  <span className="text-gray-400 text-xs">1 hora atrás</span>
                </div>
              </Link>
              {/* Cards menores à direita */}
              {[
                { id: "esp-1", img: sportsImg, title: "Mané Garrincha recebe jogo da Série B neste domingo com mais de 40 mil torcedores", time: "2 horas atrás" },
                { id: "esp-2", img: parkImg, title: "Brasília FC entra na briga pelo acesso à Série A com vitória por 2 a 0", time: "4 horas atrás" },
              ].map((item) => (
                <Link key={item.id} href={`/artigo/${item.id}`} className="block group flex gap-4 bg-white p-3 hover:shadow-sm transition-shadow">
                  <div className="w-[120px] h-[90px] shrink-0 overflow-hidden">
                    <img src={item.img} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="flex flex-col justify-center min-w-0">
                    <span className="text-[11px] font-bold text-[#b45309] uppercase mb-1">Esportes</span>
                    <h4 className="font-bold text-[#0d1633] text-sm leading-snug group-hover:text-[#b45309] transition-colors line-clamp-3">
                      {item.title}
                    </h4>
                    <span className="text-gray-400 text-xs mt-1">{item.time}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            CULTURA — Grade de 3 colunas com card destaque topo
        ═══════════════════════════════════════════════ */}
        <section className="bg-white border-t border-gray-200 py-8">
          <div className="max-w-[1280px] mx-auto px-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-[#0d9488]" />
                <h2 className="text-xl font-black text-[#0d1633] uppercase">Cultura</h2>
              </div>
              <Link href="/cultura" className="text-xs font-bold text-[#0d9488] hover:underline uppercase tracking-wide">Ver mais →</Link>
            </div>
            {/* Faixa de destaque — topo full width */}
            <Link href="/artigo/cul-destaque" className="block group mb-4 relative overflow-hidden bg-gray-900">
              <img src={culturaFeatImg} alt="Cultura" className="w-full h-[200px] object-cover object-center group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
              <div className="absolute inset-0 flex items-center p-8">
                <div className="max-w-xl">
                  <span className="inline-block bg-[#0d9488] text-white text-[11px] font-bold px-3 py-1 mb-3 uppercase">Cultura</span>
                  <h3 className="text-white font-black text-2xl lg:text-3xl leading-tight group-hover:text-teal-200 transition-colors">
                    Festival de Inverno de Brasília bate recorde de público com mais de 80 mil visitantes
                  </h3>
                  <span className="text-gray-400 text-xs mt-2 block">45 minutos atrás</span>
                </div>
              </div>
            </Link>
            {/* 3 cards menores abaixo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { id: "cul-1", img: culture2Img, title: "Museu Nacional inaugura exposição inédita de arte contemporânea", time: "3 horas atrás" },
                { id: "cul-2", img: festivalImg, title: "Cine Brasília celebra 60 anos com programação especial e entrada gratuita", time: "5 horas atrás" },
                { id: "cul-3", img: culturaFeatImg, title: "Orquestra Sinfônica apresenta concerto ao ar livre no Parque da Cidade", time: "7 horas atrás" },
              ].map((item) => (
                <Link key={item.id} href={`/artigo/${item.id}`} className="block group">
                  <div className="overflow-hidden mb-3">
                    <img src={item.img} alt={item.title} className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <span className="text-[11px] font-bold text-[#0d9488] uppercase">Cultura</span>
                  <h4 className="font-bold text-[#0d1633] text-sm leading-snug mt-1 group-hover:text-[#0d9488] transition-colors line-clamp-3">
                    {item.title}
                  </h4>
                  <span className="text-gray-400 text-xs mt-1 block">{item.time}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            POLÍTICA — 1 hero grande + lista lateral + 2 mini cards
        ═══════════════════════════════════════════════ */}
        <section className="bg-[#f7f7f7] border-t border-gray-200 py-8">
          <div className="max-w-[1280px] mx-auto px-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-[#1d4ed8]" />
                <h2 className="text-xl font-black text-[#0d1633] uppercase">Política</h2>
              </div>
              <Link href="/politica" className="text-xs font-bold text-[#1d4ed8] hover:underline uppercase tracking-wide">Ver mais →</Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Hero grande */}
              <Link href="/artigo/pol-destaque" className="lg:col-span-6 block group relative overflow-hidden bg-gray-900">
                <img src={politicaFeatImg} alt="Política" className="w-full h-[340px] object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6 w-full">
                  <span className="inline-block bg-[#1d4ed8] text-white text-[11px] font-bold px-3 py-1 mb-3 uppercase">Política</span>
                  <h3 className="text-white font-black text-2xl leading-snug mb-2 group-hover:text-blue-200 transition-colors">
                    Governador do DF lança pacote de obras que vai modernizar 15 regiões administrativas
                  </h3>
                  <span className="text-gray-400 text-xs">1 hora atrás</span>
                </div>
              </Link>
              {/* Lista 3 notícias + 2 mini cards em L */}
              <div className="lg:col-span-6 flex flex-col gap-4">
                {[
                  { id: "pol-1", img: heroImg, title: "Câmara Legislativa aprova projeto que cria o programa Morar DF", time: "2 horas atrás" },
                  { id: "pol-2", img: politics2Img, title: "GDF encaminha à CLDF proposta do orçamento para 2025 com R$ 48 bilhões", time: "4 horas atrás" },
                  { id: "pol-3", img: politicaFeatImg, title: "Bancada do DF no Congresso articula emendas para transporte e saúde", time: "6 horas atrás" },
                ].map((item) => (
                  <Link key={item.id} href={`/artigo/${item.id}`} className="block group flex gap-4 bg-white p-3 hover:shadow-sm transition-shadow">
                    <div className="w-[100px] h-[72px] shrink-0 overflow-hidden">
                      <img src={item.img} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                      <span className="text-[11px] font-bold text-[#1d4ed8] uppercase mb-1">Política</span>
                      <h4 className="font-bold text-[#0d1633] text-sm leading-snug group-hover:text-[#1d4ed8] transition-colors line-clamp-2">
                        {item.title}
                      </h4>
                      <span className="text-gray-400 text-xs mt-1">{item.time}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            BRASIL & MUNDO — duas seções lado a lado
        ═══════════════════════════════════════════════ */}
        <section className="bg-white border-t border-gray-200 py-8">
          <div className="max-w-[1280px] mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:divide-x divide-gray-200">

              {/* BRASIL */}
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 bg-[#16a34a]" />
                    <h2 className="text-xl font-black text-[#0d1633] uppercase">Brasil</h2>
                  </div>
                  <Link href="/" className="text-xs font-bold text-[#16a34a] hover:underline uppercase">Ver mais →</Link>
                </div>
                {/* Primeiro item grande */}
                <Link href="/artigo/bra-destaque" className="block group mb-4">
                  <div className="overflow-hidden mb-3">
                    <img src={brasilImg} alt="Brasil" className="w-full h-[180px] object-cover group-hover:scale-105 transition-transform duration-700" />
                  </div>
                  <span className="text-[11px] font-bold text-[#16a34a] uppercase">Brasil</span>
                  <h3 className="font-black text-[#0d1633] text-lg leading-tight mt-1 mb-1 group-hover:text-[#16a34a] transition-colors">
                    Governo Federal anuncia novo programa habitacional com 1 milhão de moradias até 2026
                  </h3>
                  <span className="text-gray-400 text-xs">2 horas atrás</span>
                </Link>
                {/* Lista de 3 menores */}
                <div className="flex flex-col divide-y divide-gray-100">
                  {[
                    { id: "bra-1", title: "STF retoma julgamento de casos relacionados ao setor de telecomunicações", time: "3h atrás" },
                    { id: "bra-2", title: "Inflação recua para 3,8% em maio, menor índice desde 2020, aponta IBGE", time: "5h atrás" },
                    { id: "bra-3", title: "Ministério da Saúde lança campanha nacional de vacinação contra influenza", time: "7h atrás" },
                  ].map((item) => (
                    <Link key={item.id} href={`/artigo/${item.id}`} className="block group py-3">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a] mt-1.5 shrink-0" />
                        <div>
                          <h4 className="font-semibold text-[#0d1633] text-sm leading-snug group-hover:text-[#16a34a] transition-colors">
                            {item.title}
                          </h4>
                          <span className="text-gray-400 text-xs">{item.time}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* MUNDO */}
              <div className="lg:pl-8">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 bg-[#6b21a8]" />
                    <h2 className="text-xl font-black text-[#0d1633] uppercase">Mundo</h2>
                  </div>
                  <Link href="/" className="text-xs font-bold text-[#6b21a8] hover:underline uppercase">Ver mais →</Link>
                </div>
                {/* Primeiro item grande */}
                <Link href="/artigo/mun-destaque" className="block group mb-4">
                  <div className="overflow-hidden mb-3">
                    <img src={mundoImg} alt="Mundo" className="w-full h-[180px] object-cover group-hover:scale-105 transition-transform duration-700" />
                  </div>
                  <span className="text-[11px] font-bold text-[#6b21a8] uppercase">Mundo</span>
                  <h3 className="font-black text-[#0d1633] text-lg leading-tight mt-1 mb-1 group-hover:text-[#6b21a8] transition-colors">
                    Cúpula do G7 debate crise climática e promete corte de 50% nas emissões até 2035
                  </h3>
                  <span className="text-gray-400 text-xs">1 hora atrás</span>
                </Link>
                {/* Lista de 3 menores */}
                <div className="flex flex-col divide-y divide-gray-100">
                  {[
                    { id: "mun-1", title: "ONU alerta para avanço dos conflitos armados em três regiões da África", time: "2h atrás" },
                    { id: "mun-2", title: "União Europeia aprova pacote de sanções econômicas contra novos países", time: "4h atrás" },
                    { id: "mun-3", title: "NASA confirma lançamento de missão tripulada à Lua para o segundo semestre", time: "6h atrás" },
                  ].map((item) => (
                    <Link key={item.id} href={`/artigo/${item.id}`} className="block group py-3">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#6b21a8] mt-1.5 shrink-0" />
                        <div>
                          <h4 className="font-semibold text-[#0d1633] text-sm leading-snug group-hover:text-[#6b21a8] transition-colors">
                            {item.title}
                          </h4>
                          <span className="text-gray-400 text-xs">{item.time}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            MAIS LIDAS
        ═══════════════════════════════════════════════ */}
        <div className="max-w-[1280px] mx-auto px-4">
          <MaisLidasSection />
        </div>

      </main>

      <RedacaoBanner />
      <Footer />
    </div>
  );
}
