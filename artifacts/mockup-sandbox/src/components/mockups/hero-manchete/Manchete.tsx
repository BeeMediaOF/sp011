import React from "react";

export function Manchete() {
  return (
    <div className="w-full flex flex-col font-sans" style={{ color: "#1a1a1a" }}>
      {/* Main Headline */}
      <div className="relative w-full h-[70vh] group cursor-pointer overflow-hidden bg-black">
        <img 
          src="https://picsum.photos/seed/df1/1920/1080" 
          alt="GDF anuncia plano emergencial" 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        {/* Strong bottom-to-top gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end items-center pb-16 px-4 md:px-8 text-center">
          <div className="mb-4">
            <span 
              className="inline-block px-3 py-1 text-xs md:text-sm font-bold tracking-widest text-white uppercase"
              style={{ backgroundColor: "#c8102e" }}
            >
              Última Hora
            </span>
          </div>
          <h1 
            className="text-white text-3xl md:text-5xl lg:text-6xl font-bold max-w-5xl leading-tight drop-shadow-xl"
            style={{ fontFamily: "'Merriweather', serif" }}
          >
            GDF anuncia plano emergencial para conter crise de abastecimento de água no DF
          </h1>
        </div>
      </div>

      {/* Secondary Strip */}
      <div className="w-full bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
            
            {/* Secondary 1 */}
            <article className="py-6 md:px-6 md:py-8 flex gap-4 items-center group cursor-pointer">
              <div className="w-24 h-24 flex-shrink-0 overflow-hidden">
                <img 
                  src="https://picsum.photos/seed/df2/400/400" 
                  alt="Polícia Civil prende quadrilha" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#c8102e" }}>
                  Segurança
                </span>
                <h2 
                  className="text-sm md:text-base font-bold leading-snug mb-2 group-hover:text-[#0b3d91] transition-colors line-clamp-3"
                  style={{ fontFamily: "'Merriweather', serif" }}
                >
                  Polícia Civil prende quadrilha responsável por série de roubos no Plano Piloto
                </h2>
                <time className="text-xs text-gray-500 font-medium">
                  Há 1 hora
                </time>
              </div>
            </article>

            {/* Secondary 2 */}
            <article className="py-6 md:px-6 md:py-8 flex gap-4 items-center group cursor-pointer">
              <div className="w-24 h-24 flex-shrink-0 overflow-hidden">
                <img 
                  src="https://picsum.photos/seed/df3/400/400" 
                  alt="Hospitais do DF registram queda" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#c8102e" }}>
                  Saúde
                </span>
                <h2 
                  className="text-sm md:text-base font-bold leading-snug mb-2 group-hover:text-[#0b3d91] transition-colors line-clamp-3"
                  style={{ fontFamily: "'Merriweather', serif" }}
                >
                  Hospitais do DF registram queda de 40% nos casos de dengue em maio
                </h2>
                <time className="text-xs text-gray-500 font-medium">
                  Há 2 horas
                </time>
              </div>
            </article>

            {/* Secondary 3 */}
            <article className="py-6 md:px-6 md:py-8 flex gap-4 items-center group cursor-pointer">
              <div className="w-24 h-24 flex-shrink-0 overflow-hidden">
                <img 
                  src="https://picsum.photos/seed/df4/400/400" 
                  alt="GDF anuncia 124 novos ônibus" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#c8102e" }}>
                  Transporte
                </span>
                <h2 
                  className="text-sm md:text-base font-bold leading-snug mb-2 group-hover:text-[#0b3d91] transition-colors line-clamp-3"
                  style={{ fontFamily: "'Merriweather', serif" }}
                >
                  GDF anuncia 124 novos ônibus para ampliar transporte público até dezembro
                </h2>
                <time className="text-xs text-gray-500 font-medium">
                  Há 4 horas
                </time>
              </div>
            </article>

          </div>
        </div>
      </div>
    </div>
  );
}
