import React from "react";
import { Link } from "wouter";
import avatar1 from "../assets/images/avatar1.png";
import avatar2 from "../assets/images/avatar2.png";
import avatar3 from "../assets/images/avatar3.png";

const colunistas = [
  {
    id: "col-1",
    nome: "Marcio Apolinario",
    avatar: avatar1,
    titulo: "Joao Fonseca: de promessa a ativo valioso",
    slug: "joao-fonseca-promessa-ativo-valioso",
  },
  {
    id: "col-2",
    nome: "Eduardo Mendes",
    avatar: avatar2,
    titulo: "NBA e o paradoxo do limite do novo contrato bilionario",
    slug: "nba-paradoxo-limite-contrato-bilionario",
  },
  {
    id: "col-3",
    nome: "Marina Borges",
    avatar: avatar3,
    titulo: "O que o Expense Ratio em seguradoras revela",
    slug: "expense-ratio-seguradoras-revela",
  },
  {
    id: "col-4",
    nome: "Marcio Apolinario",
    avatar: avatar1,
    titulo: "O impacto das reformas tributarias no setor de tecnologia",
    slug: "reformas-tributarias-tecnologia",
  },
  {
    id: "col-5",
    nome: "Eduardo Mendes",
    avatar: avatar2,
    titulo: "Copa do Mundo 2026: os favoritos e as surpresas do torneio",
    slug: "copa-mundo-2026-favoritos-surpresas",
  },
  {
    id: "col-6",
    nome: "Marina Borges",
    avatar: avatar3,
    titulo: "Mercado imobiliario de Brasilia bate recordes no primeiro semestre",
    slug: "mercado-imobiliario-brasilia-recordes",
  },
];

export default function ColunistasSection() {
  return (
    <section className="border-t border-gray-200 py-8 bg-[#f8f9fa]">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-[#c8102e]" />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
              Colunistas
            </h2>
          </div>
          <Link
            href="/colunas"
            className="inline-block bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-[11px] font-semibold px-4 py-1.5 rounded-full transition-colors"
          >
            Ver mais
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {colunistas.map((col, i) => (
            <Link
              key={col.id + i}
              href={`/artigo/${col.slug}`}
              className="group flex flex-col items-center text-center gap-3 bg-white rounded-lg p-4 border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <img
                src={col.avatar}
                alt={col.nome}
                className="w-14 h-14 rounded-full object-cover grayscale"
              />
              <div>
                <p className="text-[11px] text-gray-400 mb-1">{col.nome}</p>
                <p className="text-[13px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3">
                  {col.titulo}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
