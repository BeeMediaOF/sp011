import { Link } from "wouter";
import { proxyUrl, buildSrcSet, THUMB_WIDTHS } from "../lib/newsImage";

interface ArticleCardProps {
  id: string;
  slug?: string;
  title: string;
  subtitle?: string;
  time: string;
  imageUrl: string;
  tag: string;
  tagColor: string;
}

export default function ArticleCard({
  id,
  slug,
  title,
  subtitle,
  time,
  imageUrl,
  tag,
  tagColor,
}: ArticleCardProps) {
  return (
    <Link href={`/artigo/${slug || id}`}>
      <div className="flex gap-5 group cursor-pointer py-5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
        <div className="w-[110px] h-[80px] sm:w-[180px] sm:h-[120px] shrink-0 overflow-hidden relative rounded-sm">
          {/* loading="lazy" não é só economia: com o SSR da editoria
              (PRD-PERF-05) o React 19 emite um <link rel=preload as=image>
              para toda <img> que NÃO seja lazy — seriam ~58 preloads
              disputando banda com a imagem do destaque (o LCP da página). */}
          {/* A miniatura é exibida a 110–180 px de largura, mas ia CRUA da origem:
              a editoria do esporteagora baixava fotos de agência em tamanho
              original (`...HighRes...jpg`) direto do site da fonte. Medido em
              2026-07-31 a 1,6 Mbps: LCP de 10 s e três requisições que não
              terminavam em 45 s. O proxy já existia e a origem já estava na
              allowlist — só a editoria não o usava (a home sempre usou). */}
          <img
            src={proxyUrl(imageUrl, THUMB_WIDTHS[THUMB_WIDTHS.length - 1]!)}
            srcSet={buildSrcSet(imageUrl, THUMB_WIDTHS) || undefined}
            sizes="(max-width: 640px) 110px, 180px"
            alt={title}
            width={180}
            height={120}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
        <div className="flex flex-col justify-center flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[11px] font-bold text-white px-2 py-0.5 rounded-sm"
              style={{ backgroundColor: tagColor }}
            >
              {tag}
            </span>
            {/* Tempo RELATIVO ("3 h atrás") calculado de Date.now(): o HTML da
                editoria é cacheado por até 60 s, então o texto que o servidor
                escreveu já virou outro quando o cliente hidrata — "agora mesmo"
                do servidor contra "1 min atrás" do cliente. Era o React #418 que
                aparecia SÓ na editoria (a home e o artigo usam data absoluta).
                O destaque do CategoryPage já tinha esta marca; os ~58 cards da
                lista, não. */}
            <span className="text-[12px] text-gray-500 font-medium" suppressHydrationWarning>{time}</span>
          </div>
          <h3 className="font-serif font-bold text-[19px] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2 text-[#000000]">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[13px] text-gray-500 line-clamp-2 mt-1.5">{subtitle}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
