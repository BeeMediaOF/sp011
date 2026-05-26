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
      <div className="flex gap-4 group cursor-pointer py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
        <div className="w-[120px] h-[80px] shrink-0 overflow-hidden relative rounded-sm">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
        <div className="flex flex-col justify-center flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-sm"
              style={{ backgroundColor: tagColor }}
            >
              {tag}
            </span>
            <span className="text-xs text-gray-500 font-medium">{time}</span>
          </div>
          <h3 className="font-bold text-[15px] leading-snug text-[#1a2448] group-hover:text-[#1d4ed8] transition-colors line-clamp-2">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-gray-600 line-clamp-1 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
