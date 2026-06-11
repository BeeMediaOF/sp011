import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import CategoryPage from "../components/CategoryPage";
import Footer from "../components/Footer";
import studentsImg from "../assets/images/students.webp";
import education2Img from "../assets/images/education2.webp";

const articles = [
  { id: "educacao-1", title: "Escolas públicas do DF alcançam melhores índices no IDEB", subtitle: "Secretaria credita avanço a novos programas de reforço escolar", time: "7 horas atrás", imageUrl: studentsImg, tag: "EDUCAÇÃO", tagColor: "#7c3aed" },
  { id: "educacao-2", title: "UnB anuncia abertura de novas vagas para cursos noturnos", subtitle: "Iniciativa atende demanda de trabalhadores", time: "10 horas atrás", imageUrl: education2Img, tag: "EDUCAÇÃO", tagColor: "#7c3aed" },
  { id: "educacao-3", title: "Novo edital para concurso de professores é publicado", subtitle: "Estão previstas mais de 2.000 vagas para a rede pública", time: "14 horas atrás", imageUrl: studentsImg, tag: "EDUCAÇÃO", tagColor: "#7c3aed" },
  { id: "educacao-4", title: "Feira de Ciências reúne projetos inovadores no Parque da Cidade", subtitle: "Alunos do ensino médio apresentam soluções sustentáveis", time: "1 dia atrás", imageUrl: education2Img, tag: "EDUCAÇÃO", tagColor: "#7c3aed" },
  { id: "educacao-5", title: "Governo amplia repasse para merenda escolar", subtitle: "Aumento visa incluir mais frutas e verduras no cardápio", time: "1 dia atrás", imageUrl: studentsImg, tag: "EDUCAÇÃO", tagColor: "#7c3aed" },
  { id: "educacao-6", title: "Escolas técnicas abrem inscrições para cursos gratuitos", subtitle: "Vagas são para áreas de tecnologia e administração", time: "2 dias atrás", imageUrl: education2Img, tag: "EDUCAÇÃO", tagColor: "#7c3aed" },
  { id: "educacao-7", title: "Programa de alfabetização de adultos ganha novos polos", subtitle: "Aulas ocorrerão em 15 regiões administrativas no período noturno", time: "2 dias atrás", imageUrl: studentsImg, tag: "EDUCAÇÃO", tagColor: "#7c3aed" },
  { id: "educacao-8", title: "Reforma de bibliotecas escolares é concluída", subtitle: "Espaços ganharam acervos atualizados e computadores", time: "3 dias atrás", imageUrl: education2Img, tag: "EDUCAÇÃO", tagColor: "#7c3aed" }
];

export default function Educacao() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <CategoryPage category="EDUCAÇÃO" color="#7c3aed" articles={articles.slice(1)} featuredArticle={articles[0]} />
      </main>
      <Footer />
    </div>
  );
}