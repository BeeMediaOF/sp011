export function Trio() {
  const articles = [
    {
      id: 1,
      img: "https://picsum.photos/seed/brasilia-capitol/800/500",
      chapeu: "Política",
      chapeuColor: "#1d4ed8",
      title: "Câmara Legislativa aprova projeto que cria o programa Morar DF",
      summary: "Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.",
      time: "2 horas atrás",
    },
    {
      id: 2,
      img: "https://picsum.photos/seed/brasilia-economy/800/500",
      chapeu: "Economia",
      chapeuColor: "#b45309",
      title: "DF bate recorde de exportações no primeiro semestre e lidera crescimento nacional",
      summary: "Brasília é eleita melhor cidade para investir no Brasil em 2025 segundo ranking nacional.",
      time: "3 horas atrás",
    },
    {
      id: 3,
      img: "https://picsum.photos/seed/brasilia-school/800/500",
      chapeu: "Educação",
      chapeuColor: "#0b3d91",
      title: "Escolas públicas do DF alcançam melhores índices no IDEB 2023",
      summary: "Resultado coloca o Distrito Federal entre os três melhores sistemas educacionais do país.",
      time: "5 horas atrás",
    },
  ];

  return (
    <div className="min-h-screen bg-white p-4 flex items-start justify-center pt-8">
      <div style={{ maxWidth: 1280, width: "100%" }}>
        {/* 3 cards side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {articles.map((item) => (
            <div
              key={item.id}
              className="group cursor-pointer"
              style={{ position: "relative", overflow: "hidden", background: "#111" }}
            >
              {/* Image */}
              <div style={{ height: 320, overflow: "hidden", position: "relative" }}>
                <img
                  src={item.img}
                  alt={item.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transition: "transform 0.7s ease",
                  }}
                  className="group-hover:scale-[1.04]"
                />
                {/* Gradient overlay */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)",
                  }}
                />
                {/* Content over image */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 18px" }}>
                  {/* Chapéu */}
                  <span
                    style={{
                      display: "inline-block",
                      backgroundColor: item.chapeuColor,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 8,
                    }}
                  >
                    {item.chapeu}
                  </span>
                  {/* Title */}
                  <h2
                    style={{
                      fontFamily: "'Merriweather', serif",
                      color: "#ffffff",
                      fontSize: 18,
                      fontWeight: 900,
                      lineHeight: 1.3,
                      margin: "0 0 8px",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {item.title}
                  </h2>
                  {/* Summary */}
                  <p
                    style={{
                      color: "rgba(255,255,255,0.65)",
                      fontSize: 12,
                      lineHeight: 1.5,
                      margin: "0 0 10px",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {item.summary}
                  </p>
                  {/* Meta */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>Redação</span>
                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }} />
                    <span>{item.time}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
