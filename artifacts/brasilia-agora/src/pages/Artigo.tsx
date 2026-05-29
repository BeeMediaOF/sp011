import React from "react";
import { useParams, Link } from "wouter";
import { FaFacebook, FaTwitter, FaWhatsapp } from "react-icons/fa";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { useArticle } from "../hooks/useArticles";

export default function Artigo() {
  const { slug } = useParams();
  const { article, loading } = useArticle(slug ?? "");

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-white flex flex-col">
        <TopBar />
        <Header />
        <NavBar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-gray-400 text-lg">Carregando artigo...</div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen w-full bg-white flex flex-col">
        <TopBar />
        <Header />
        <NavBar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-gray-400 text-lg">Artigo não encontrado.</div>
        </main>
        <Footer />
      </div>
    );
  }

  const paragraphs = article.subtitle
    ? [article.subtitle, article.content]
    : [article.content];

  return (
    <div className="min-h-screen w-full bg-white flex flex-col">
      <TopBar />
      <Header />
      <NavBar />

      <main className="flex-1 bg-white pb-16">
        <div className="max-w-[1280px] mx-auto px-4 mt-6">
          <div className="flex flex-col lg:flex-row gap-10">
            <article className="w-full lg:w-2/3">
              <div className="text-gray-500 text-xs font-medium mb-4 flex items-center gap-1">
                <Link href="/" className="hover:text-[#1d4ed8]">Início</Link> &gt;
                <Link href={`/${article.category}`} className="hover:text-[#1d4ed8]">{article.tag}</Link> &gt;
                <span className="text-gray-400">Artigo</span>
              </div>

              <span className="inline-block text-white text-xs font-bold px-2.5 py-1 rounded-sm mb-4 bg-[#1d4ed8]">
                {article.tag}
              </span>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#1a2448] leading-tight mb-4 tracking-tight">{article.title}</h1>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-y border-gray-100 mb-8 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                    <span className="text-gray-500 font-bold">BA</span>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#1a2448]">Por {article.author}</div>
                    <div className="text-xs text-gray-500">{new Date(article.publishedAt).toLocaleDateString("pt-BR")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 mr-2">COMPARTILHE:</span>
                  <button className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700"><FaFacebook size={14} /></button>
                  <button className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600"><FaTwitter size={14} /></button>
                  <button className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600"><FaWhatsapp size={14} /></button>
                </div>
              </div>

              <div className="w-full aspect-[16/9] mb-8 rounded-sm overflow-hidden bg-gray-100">
                {article.imageUrl ? (
                  <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">Sem imagem</div>
                )}
              </div>

              <div className="prose prose-lg max-w-none text-gray-800">
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="mb-6 leading-relaxed">{paragraph}</p>
                ))}
              </div>
            </article>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
