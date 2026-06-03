import React from "react";
import { Link } from "wouter";
import avatar1 from "../assets/images/avatar1.png";
import avatar2 from "../assets/images/avatar2.png";
import avatar3 from "../assets/images/avatar3.png";

const colunistas = [
  {
    id: "col-1",
    nome: "Márcio Apolinário",
    avatar: avatar1,
    titulo: "João Fonseca: de promessa a ativo valioso",
    slug: "joao-fonseca-promessa-ativo-valioso",
  },
  {
    id: "col-2",
    nome: "Eduardo Mendes",
    avatar: avatar2,
    titulo: "NBA e o paradoxo do limite do novo contrato bilionário",
    slug: "nba-paradoxo-limite-contrato-bilionario",
  },
  {
    id: "col-3",
    nome: "Marina Borges",
    avatar: avatar3,
    titulo: "O que o Expense Ratio em seguradoras revela",
    slug: "expense-ratio-seguradoras-revela",
  },
];

export default function ColunistasSection() {
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-[#c8102e]" />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
              Colunistas
            </h2>
          </div>
        </div>

        <div className="bg-white rounded border border-gray-100 p-5 max-w-sm">
          <div className="flex flex-col gap-5">
            {colunistas.map((col, i) => (
              <div key={col.id}>
                <Link href={`/artigo/${col.slug}`} className="flex items-start gap-3 group">
                  <img
                    src={col.avatar}
                    alt={col.nome}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 grayscale"
                  />
                  <div className="flex flex-col">
                    <span className="text-[12px] text-gray-500 mb-0.5">{col.nome}</span>
                    <span className="text-[14px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors">
                      {col.titulo}
                    </span>
                  </div>
                </Link>
                {i < colunistas.length - 1 && (
                  <hr className="mt-5 border-gray-100" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/colunas"
              className="inline-block bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-[13px] font-semibold px-6 py-2 rounded-full transition-colors"
            >
              Ver mais
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
