import { Link } from "wouter";

interface ArticleCardProps {
  id: string;
  title: string;
  subtitle?: string;
  time: string;
  imageUrl: string;
  tag: string;
  tagColor: string;
}

export default function ArticleCard({
  id,
  title,
  subtitle,
  time,
  imageUrl,
  tag,
  tagColor,
}: ArticleCardProps) {
  return (
    <Link href={`/artigo/${id}`}>
      <div className="flex gap-5 group cursor-pointer py-5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
        <div className="w-[180px] h-[120px] shrink-0 overflow-hidden relative rounded-sm">
          <img
            src={imageUrl}
            alt={title}
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
            <span className="text-[12px] text-gray-500 font-medium">{time}</span>
          </div>
          <h3 className="font-bold text-[19px] leading-snug text-[#1a1a1a] group-hover:text-[#c8102e] transition-colors line-clamp-2" style={{ fontFamily: "'Merriweather', serif" }}>
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
