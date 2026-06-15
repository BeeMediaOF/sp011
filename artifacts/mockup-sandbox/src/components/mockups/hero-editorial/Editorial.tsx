import React from 'react';

export function Editorial() {
  return (
    <div className="font-sans text-[#1a1a1a] min-h-screen bg-[#f8f9fa] flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900&display=swap');
      `}} />
      
      {/* Header/Logo area */}
      <header className="border-b-4 border-[#c8102e] bg-white py-6 px-4 md:px-8 flex justify-center items-center shadow-sm">
        <h1 className="font-['Merriweather',serif] text-4xl md:text-5xl font-black text-[#1a1a1a] uppercase tracking-tight">
          SBC <span className="text-[#c8102e]">Agora</span>
        </h1>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 md:px-8 py-8 md:py-12 flex flex-col gap-10">
        
        {/* Top Section: 60/40 Split */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          
          {/* Main Article (60%) */}
          <article className="lg:w-[60%] relative group cursor-pointer overflow-hidden rounded shadow-md h-[450px] md:h-[550px] lg:h-[650px] flex flex-col justify-end">
            <img 
              src="https://picsum.photos/seed/brasilia1/1200/800" 
              alt="Câmara Legislativa" 
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent"></div>
            
            <div className="relative z-10 p-6 md:p-10 text-white">
              <span className="inline-block bg-[#0b3d91] text-white text-xs md:text-sm font-bold px-3 py-1 mb-4 uppercase tracking-widest shadow-sm">
                Política
              </span>
              <h2 className="font-['Merriweather',serif] text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-4 group-hover:text-gray-200 transition-colors">
                Câmara Legislativa aprova projeto Morar DF com subsídio para baixa renda
              </h2>
              <p className="text-gray-300 md:text-lg mb-6 line-clamp-2 md:line-clamp-3 font-light leading-relaxed">
                Novo programa habitacional prevê auxílio financeiro para famílias com renda de até três salários mínimos na aquisição da casa própria em diversas regiões administrativas.
              </p>
              <div className="flex items-center text-sm text-gray-400 font-medium">
                <span className="text-white">Por João Silva</span>
                <span className="mx-2 text-gray-500">•</span>
                <span>2h atrás</span>
              </div>
            </div>
          </article>

          {/* Secondary Articles (40%) */}
          <div className="lg:w-[40%] flex flex-col justify-between gap-8">
            
            {/* Secondary 1 */}
            <article className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-5 group cursor-pointer h-full border-b border-gray-200 pb-8 lg:border-none lg:pb-0">
              <div className="w-full sm:w-2/5 lg:w-full xl:w-[45%] aspect-[4/3] relative overflow-hidden rounded shadow-sm flex-shrink-0">
                <img 
                  src="https://picsum.photos/seed/economia/600/450" 
                  alt="Economia DF" 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-col justify-center flex-grow">
                <span className="text-[#d97706] text-xs font-bold mb-3 uppercase tracking-widest">
                  Economia
                </span>
                <h3 className="font-['Merriweather',serif] text-xl md:text-2xl lg:text-xl xl:text-2xl font-bold leading-snug mb-3 group-hover:text-[#c8102e] transition-colors text-[#1a1a1a]">
                  DF bate recorde de exportações e lidera crescimento nacional no 1º semestre
                </h3>
                <div className="flex items-center text-xs text-gray-500 mt-auto pt-2">
                  <span className="font-semibold text-gray-700">Por Maria Alves</span>
                  <span className="mx-2">•</span>
                  <span>3h atrás</span>
                </div>
              </div>
            </article>

            <div className="hidden lg:block w-full h-[1px] bg-gray-200"></div>

            {/* Secondary 2 */}
            <article className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-5 group cursor-pointer h-full">
              <div className="w-full sm:w-2/5 lg:w-full xl:w-[45%] aspect-[4/3] relative overflow-hidden rounded shadow-sm flex-shrink-0">
                <img 
                  src="https://picsum.photos/seed/educacao/600/450" 
                  alt="Educação DF" 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-col justify-center flex-grow">
                <span className="text-[#1e3a8a] text-xs font-bold mb-3 uppercase tracking-widest">
                  Educação
                </span>
                <h3 className="font-['Merriweather',serif] text-xl md:text-2xl lg:text-xl xl:text-2xl font-bold leading-snug mb-3 group-hover:text-[#c8102e] transition-colors text-[#1a1a1a]">
                  Escolas públicas do DF alcançam melhores índices do IDEB em 2023
                </h3>
                <div className="flex items-center text-xs text-gray-500 mt-auto pt-2">
                  <span className="font-semibold text-gray-700">Por Carlos Mendes</span>
                  <span className="mx-2">•</span>
                  <span>5h atrás</span>
                </div>
              </div>
            </article>

          </div>
        </div>

        {/* Bottom Section: Quick Headlines Strip */}
        <div className="border-t-2 border-b-2 border-gray-100 py-6 mt-4 bg-white px-2 shadow-sm rounded">
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200">
            
            <div className="flex-1 px-6 py-4 md:py-2 cursor-pointer group">
              <span className="text-[#c8102e] text-xs font-bold mb-2 block uppercase tracking-wider">Trânsito</span>
              <h4 className="font-['Merriweather',serif] text-base font-bold group-hover:text-[#0b3d91] transition-colors line-clamp-3 leading-snug text-[#1a1a1a]">
                Novas faixas exclusivas começam a operar na W3 Sul a partir desta segunda
              </h4>
            </div>

            <div className="flex-1 px-6 py-4 md:py-2 cursor-pointer group">
              <span className="text-[#0b3d91] text-xs font-bold mb-2 block uppercase tracking-wider">Saúde</span>
              <h4 className="font-['Merriweather',serif] text-base font-bold group-hover:text-[#c8102e] transition-colors line-clamp-3 leading-snug text-[#1a1a1a]">
                GDF anuncia licitação para construção de novo hospital regional no Gama
              </h4>
            </div>

            <div className="flex-1 px-6 py-4 md:py-2 cursor-pointer group">
              <span className="text-gray-500 text-xs font-bold mb-2 block uppercase tracking-wider">Cultura</span>
              <h4 className="font-['Merriweather',serif] text-base font-bold group-hover:text-[#0b3d91] transition-colors line-clamp-3 leading-snug text-[#1a1a1a]">
                Festival de Cinema de Brasília abre inscrições para mostras competitivas
              </h4>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
