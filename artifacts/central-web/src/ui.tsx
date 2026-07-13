import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtNum } from "./charts";

export const PAGE_SIZE = 12;

/** Paginação no padrão da aba Artigos do painel do blog. */
export function Pager({ page, totalPages, total, onPage, noun }: {
  page: number; totalPages: number; total: number; onPage: (p: number) => void; noun: string;
}) {
  const nums: number[] = [];
  for (let i = 0; i < Math.min(5, totalPages); i++) {
    let p: number;
    if (totalPages <= 5) p = i + 1;
    else if (page <= 3) p = i + 1;
    else if (page >= totalPages - 2) p = totalPages - 4 + i;
    else p = page - 2 + i;
    nums.push(p);
  }
  return (
    <div className="pager">
      <p>
        Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {fmtNum(total)} {noun}
      </p>
      <div className="pg-btns">
        <button className="pg-btn" disabled={page === 1} onClick={() => onPage(Math.max(1, page - 1))} aria-label="Página anterior">
          <ChevronLeft size={15} />
        </button>
        {nums.map((p) => (
          <button key={p} className={`pg-btn ${p === page ? "active" : ""}`} onClick={() => onPage(p)}>{p}</button>
        ))}
        {totalPages > 5 && page < totalPages - 2 && (
          <>
            <span style={{ color: "var(--faint)", padding: "0 2px" }}>…</span>
            <button className="pg-btn" onClick={() => onPage(totalPages)}>{totalPages}</button>
          </>
        )}
        <button className="pg-btn" disabled={page === totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))} aria-label="Próxima página">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
