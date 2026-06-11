import { Link } from "wouter";
import { Play } from "lucide-react";
import heroImg from "../assets/images/hero.webp";
import trafficImg from "../assets/images/traffic.webp";
import policeImg from "../assets/images/police.webp";
import parkImg from "../assets/images/park.webp";
import festivalImg from "../assets/images/festival.webp";

const videos = [
  { id: "v-1", title: "Câmara Legislativa aprova programa Morar DF", thumb: heroImg, duration: "2:45" },
  { id: "v-2", title: "Obras no Eixão alteram trânsito em Brasília", thumb: trafficImg, duration: "1:30" },
  { id: "v-3", title: "Polícia Civil prende grupo de furtos", thumb: policeImg, duration: "3:10" },
  { id: "v-4", title: "Parques do DF têm programação especial", thumb: parkImg, duration: "1:55" },
  { id: "v-5", title: "Festival de Inverno bate recorde de público", thumb: festivalImg, duration: "4:20" },
];

export default function VideoSection() {
  return (
    <section className="bg-[#1a1a1a] py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-[#c8102e]" />
            <h2 className="text-[15px] font-bold text-white uppercase tracking-wider">Vídeos e Multimídia</h2>
          </div>
          <Link href="/videos" className="text-[11px] font-bold text-[#c8102e] hover:underline uppercase tracking-wider">
            Ver todos →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {videos.map((item) => (
            <Link key={item.id} href={`/video/${item.id}`} className="block group">
              <div className="relative overflow-hidden bg-gray-800 mb-2">
                <img
                  src={item.thumb}
                  alt={item.title}
                  className="w-full h-[130px] object-cover group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-100"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 text-[#1a1a1a] ml-0.5" />
                  </div>
                </div>
                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {item.duration}
                </span>
              </div>
              <h4 className="font-serif text-white text-[14px] font-bold leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2">
                {item.title}
              </h4>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
