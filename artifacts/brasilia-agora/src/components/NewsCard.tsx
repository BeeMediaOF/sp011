import { Link } from "wouter";

interface NewsCardProps {
  id: string;
  title: string;
  summary: string;
  image: string;
  chapeu: string;
  chapeuColor: string;
  author: string;
  time: string;
}

export default function NewsCard({ id, title, summary, image, chapeu, chapeuColor, author, time }: NewsCardProps) {
  return (
    <Link href={`/artigo/${id}`} className="block group">
      <div className="overflow-hidden bg-gray-100 mb-3">
        <img
          src={image}
          alt={title}
          className="w-full h-[180px] object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: chapeuColor }}>
        {chapeu}
      </span>
      <h3 className="font-serif text-[#1a1a1a] text-[17px] font-bold leading-snug mt-1 group-hover:text-[#c8102e] transition-colors line-clamp-3">
        {title}
      </h3>
      <p className="text-gray-500 text-sm leading-relaxed mt-1.5 line-clamp-2">
        {summary}
      </p>
      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-2">
        <span className="font-medium text-gray-500">{author}</span>
        <span className="w-1 h-1 rounded-full bg-gray-300" />
        <span>{time}</span>
      </div>
    </Link>
  );
}
