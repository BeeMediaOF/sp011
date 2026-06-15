import React from "react";

export function Mosaico() {
  const articles = [
    {
      id: 1,
      title: "Câmara Legislativa aprova projeto Morar DF",
      category: "Política",
      seed: "capitol1",
      categoryColor: "#c8102e",
      className: "md:col-span-2 md:row-span-2",
      titleSize: "text-2xl md:text-4xl",
    },
    {
      id: 2,
      title: "DF lidera exportações no 1º semestre",
      category: "Economia",
      seed: "economy2",
      categoryColor: "#0b3d91",
      className: "md:col-span-1 md:row-span-1",
      titleSize: "text-xl md:text-xl",
    },
    {
      id: 3,
      title: "Escolas públicas do DF atingem melhor IDEB",
      category: "Educação",
      seed: "school3",
      categoryColor: "#059669",
      className: "md:col-span-1 md:row-span-1",
      titleSize: "text-xl md:text-xl",
    },
    {
      id: 4,
      title: "Polícia prende quadrilha de roubos no Plano Piloto",
      category: "Segurança",
      seed: "police4",
      categoryColor: "#d97706",
      className: "md:col-span-1 md:row-span-1",
      titleSize: "text-xl md:text-xl",
    },
    {
      id: 5,
      title: "Hospitais registram queda de 40% na dengue",
      category: "Saúde",
      seed: "hospital5",
      categoryColor: "#7c3aed",
      className: "md:col-span-1 md:row-span-1",
      titleSize: "text-xl md:text-xl",
    },
  ];

  return (
    <section className="w-full max-w-7xl mx-auto p-4 font-sans">
      <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-4 min-h-[600px]">
        {articles.map((article) => (
          <a
            key={article.id}
            href="#"
            className={`group relative overflow-hidden rounded-lg flex flex-col justify-end min-h-[300px] ${article.className}`}
          >
            {/* Background Image */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url('https://picsum.photos/seed/${article.seed}/800/600')`,
              }}
            />
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            
            {/* Content */}
            <div className="relative z-10 p-5 md:p-6 flex flex-col items-start gap-3">
              <span
                className="text-white text-xs font-bold uppercase tracking-wider px-2 py-1 rounded"
                style={{ backgroundColor: article.categoryColor }}
              >
                {article.category}
              </span>
              <h2
                className={`text-white font-bold leading-snug font-['Merriweather',serif] group-hover:text-gray-200 transition-colors ${article.titleSize}`}
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
              >
                {article.title}
              </h2>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
