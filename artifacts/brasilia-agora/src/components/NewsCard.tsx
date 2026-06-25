import { Link } from "wouter";
import { useSite } from "../hooks/useSite";
import { buildSrcSet, CARD_WIDTHS } from "@/lib/newsImage";

interface NewsCardProps {
  id: string;
  slug?: string;
  title: string;
  summary: string;
  image: string;
  chapeu: string;
  chapeuColor: string;
  author: string;
  time: string;
}

export default function NewsCard({ id, slug, title, summary, image, chapeu, chapeuColor, author, time }: NewsCardProps) {
  const { settings } = useSite();
  const bylineName = settings?.bylineName || settings?.siteName || "Redação";
  const bylineLogo = settings?.bylineLogoBase64 || settings?.logoBase64 || settings?.faviconBase64 || "/favicon.jpg";
  const href = `/artigo/${slug || id}`;
  const srcset = buildSrcSet(image, CARD_WIDTHS);

  return (
    <Link href={href} className="block group">
      {/*
        Container com aspect-ratio fixo → reserva espaço ANTES da imagem carregar.
        Isso elimina o CLS: o browser sabe a altura exata antes do download.
      */}
      <div
        className="overflow-hidden bg-gray-100 mb-3"
        style={{ aspectRatio: "16/9", position: "relative" }}
      >
        <img
          src={image || undefined}
          srcSet={srcset || undefined}
          sizes={srcset ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" : undefined}
          alt={title.replace(/<[^>]*>/g, "")}
          width={480}
          height={270}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: chapeuColor }}>
        {chapeu}
      </span>
      <h3 className="font-serif text-[#1a1a1a] text-[17px] font-bold leading-snug mt-1 group-hover:text-[#c8102e] transition-colors line-clamp-3"
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <p className="text-gray-700 text-sm leading-relaxed mt-1.5 line-clamp-2">
        {summary}
      </p>
      <div className="flex items-center gap-2 text-[11px] text-gray-600 mt-2">
        <img src={bylineLogo} alt={bylineName} width={16} height={16} className="w-4 h-4 rounded-full object-cover shrink-0" loading="lazy" />
        <span className="font-medium text-gray-600">{bylineName}</span>
        <span className="w-1 h-1 rounded-full bg-gray-300" />
        <span>{time}</span>
      </div>
    </Link>
  );
}
