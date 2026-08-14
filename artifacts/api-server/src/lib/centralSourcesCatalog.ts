/**
 * Catálogo de fontes RSS do PAINEL CENTRAL, replicado para todo blog da rede.
 *
 * Por que existe: até 2026-08-14 um blog novo nascia com 25 feeds fixos do
 * sp011 (Agência Brasil – Política, Metrópoles – DF, Jovem Pan, Correio
 * Braziliense…) — marca de OUTRO portal dentro da imagem compartilhada, contra
 * a regra do CLAUDE.md §13. Agora todo blog nasce espelhando o catálogo da
 * central, INATIVO: quem coleta continua sendo a central (o pipeline interno do
 * blog segue dormente, CLAUDE.md §11), mas o operador vê no painel as mesmas
 * fontes da rede e liga o que quiser sem cadastrar nada à mão.
 *
 * Veículos como Agência Brasil e Metrópoles continuam na lista — não por
 * herança do sp011, mas porque a CENTRAL os coleta. Sumiram os feeds que eram
 * só do sp011 e a central não usa (Jovem Pan, Correio Braziliense por editoria,
 * Jornal de Brasília – DF, Notícias ao Minuto – Tech).
 *
 * ARQUIVO GERADO — não editar à mão. Regenerar a partir do banco central:
 *
 *   cd /opt/sp011
 *   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
 *   docker compose exec -T pg-blogs psql "$DBURL" -At -F '|' -c "SELECT name, url, category, language FROM central_sources ORDER BY category, name;"
 *
 * Fonte desta versão: dump de 2026-08-14 (127 linhas na central,
 * 126 URLs únicas — 1 duplicada(s) na origem).
 *
 * `category` é o slug de origem da CENTRAL (taxonomia de quem coleta), não uma
 * editoria do blog — como tudo nasce inativo, é só rótulo até alguém ligar a
 * fonte e escolher a categoria de destino no painel.
 */

export interface CentralSourceSeed {
  name: string;
  url: string;
  /** Slug de categoria como está na central (não é editoria do blog). */
  category: string;
  language: "pt-BR" | "en";
}

/** 126 fontes — ordenadas por categoria e nome. */
export const CENTRAL_SOURCES_CATALOG: readonly CentralSourceSeed[] = [
  { name: "simpleflying", url: "https://simpleflying.com/feed", category: "Aviação", language: "pt-BR" },
  { name: "Correio Braziliense (geral)", url: "https://www.correiobraziliense.com.br/feed", category: "cidade", language: "pt-BR" },
  { name: "Metrópoles – Distrito Federal", url: "https://www.metropoles.com/distrito-federal/feed", category: "cidade", language: "pt-BR" },
  { name: "ge - Copa do Mundo", url: "https://ge.globo.com/rss/ge/futebol/copa-do-mundo/", category: "copa-do-mundo", language: "pt-BR" },
  { name: "Agência Brasil – Cultura", url: "https://agenciabrasil.ebc.com.br/radioagencia-nacional/rss/cultura/feed.xml", category: "cultura", language: "pt-BR" },
  { name: "Metrópoles – Entretenimento", url: "https://www.metropoles.com/entretenimento/feed", category: "cultura", language: "pt-BR" },
  { name: "Metrópoles – Vida e Estilo", url: "https://www.metropoles.com/vida-e-estilo/feed", category: "cultura", language: "pt-BR" },
  { name: "ge - e-Sports", url: "https://ge.globo.com/rss/ge/esports/", category: "e-sports", language: "pt-BR" },
  { name: "Agência Brasil - Economia", url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml", category: "economia", language: "pt-BR" },
  { name: "Finsiders – Economia Open", url: "https://finsidersbrasil.com.br/economia-open/feed/", category: "economia", language: "pt-BR" },
  { name: "Finsiders – Negócios em Fintechs", url: "https://finsidersbrasil.com.br/negocios-em-fintechs/feed/", category: "economia", language: "pt-BR" },
  { name: "InvestNews – Economia", url: "https://investnews.com.br/economia/feed/", category: "economia", language: "pt-BR" },
  { name: "InvestNews – Finanças", url: "https://investnews.com.br/financas/feed/", category: "economia", language: "pt-BR" },
  { name: "InvestNews – Investimentos", url: "https://investnews.com.br/investimentos/feed/", category: "economia", language: "pt-BR" },
  { name: "InvestNews – Negócios", url: "https://investnews.com.br/negocios/feed/", category: "economia", language: "pt-BR" },
  { name: "Metrópoles – Negócios", url: "https://www.metropoles.com/negocios/feed", category: "economia", language: "pt-BR" },
  { name: "Agência Brasil - Esporte", url: "https://agenciabrasil.ebc.com.br/rss/esporte/feed.xml", category: "esportes", language: "pt-BR" },
  { name: "Metrópoles – Esportes", url: "https://www.metropoles.com/esportes/feed", category: "esportes", language: "pt-BR" },
  { name: "Dexerto - Esports & Gaming", url: "https://www.dexerto.com/feed/", category: "esports", language: "en" },
  { name: "Esports Insider", url: "https://esportsinsider.com/feed", category: "esports", language: "en" },
  { name: "ge - Fórmula 1", url: "https://ge.globo.com/rss/ge/motor/formula-1/", category: "f1", language: "pt-BR" },
  { name: "Motorsport.com Brasil - F1", url: "https://motorsport.uol.com.br/rss/f1/news/", category: "f1", language: "pt-BR" },
  { name: "Agência Brasil - Saúde", url: "https://agenciabrasil.ebc.com.br/rss/saude/feed.xml", category: "farmacia", language: "pt-BR" },
  { name: "Febrafar", url: "https://febrafar.com.br/feed/", category: "farmacia", language: "pt-BR" },
  { name: "Guia da Farmácia", url: "https://guiadafarmacia.com.br/feed/", category: "farmacia", language: "pt-BR" },
  { name: "ICTQ (validar endpoint)", url: "https://www.ictq.com.br/feed", category: "farmacia", language: "pt-BR" },
  { name: "Medicina S/A", url: "https://medicinasa.com.br/feed/", category: "farmacia", language: "pt-BR" },
  { name: "Panorama Farmacêutico", url: "https://panoramafarmaceutico.com.br/feed/", category: "farmacia", language: "pt-BR" },
  { name: "Portal Contábeis (validar endpoint)", url: "https://www.contabeis.com.br/rss/", category: "farmacia", language: "pt-BR" },
  { name: "Saúde Business", url: "https://www.saudebusiness.com/feed/", category: "farmacia", language: "pt-BR" },
  { name: "CNN Brasil - Economia", url: "https://www.cnnbrasil.com.br/economia/feed/", category: "financas", language: "pt-BR" },
  { name: "E-Investidor (Estadão)", url: "https://einvestidor.estadao.com.br/feed/", category: "financas", language: "pt-BR" },
  { name: "Exame", url: "https://exame.com/feed/", category: "financas", language: "pt-BR" },
  { name: "G1 Economia", url: "https://g1.globo.com/rss/g1/economia/", category: "financas", language: "pt-BR" },
  { name: "InfoMoney", url: "https://www.infomoney.com.br/feed/", category: "financas", language: "pt-BR" },
  { name: "Money Times", url: "https://www.moneytimes.com.br/feed/", category: "financas", language: "pt-BR" },
  { name: "Seu Dinheiro", url: "https://www.seudinheiro.com/feed/", category: "financas", language: "pt-BR" },
  { name: "Suno Notícias", url: "https://www.suno.com.br/noticias/feed/", category: "financas", language: "pt-BR" },
  { name: "UOL Economia", url: "https://rss.uol.com.br/feed/economia.xml", category: "financas", language: "pt-BR" },
  { name: "90min - Football", url: "https://www.90min.com/posts.rss", category: "football", language: "en" },
  { name: "BBC Sport - Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", category: "football", language: "en" },
  { name: "BBC Sport - Nigeria (Super Eagles)", url: "https://feeds.bbci.co.uk/sport/football/teams/nigeria/rss.xml", category: "football", language: "en" },
  { name: "CBS Sports - Soccer", url: "https://www.cbssports.com/rss/headlines/soccer/", category: "football", language: "en" },
  { name: "Daily Mail - Football", url: "https://www.dailymail.co.uk/sport/football/index.rss", category: "football", language: "en" },
  { name: "Mirror - Football", url: "https://www.mirror.co.uk/sport/football/rss.xml", category: "football", language: "en" },
  { name: "Sky Sports - Football", url: "https://www.skysports.com/rss/11095", category: "football", language: "en" },
  { name: "The Guardian - Football", url: "https://www.theguardian.com/football/rss", category: "football", language: "en" },
  { name: "Autosport - F1", url: "https://www.autosport.com/rss/feed/f1", category: "formula-1", language: "en" },
  { name: "BBC Sport - Formula 1", url: "https://feeds.bbci.co.uk/sport/formula1/rss.xml", category: "formula-1", language: "en" },
  { name: "Formula 1 (site oficial)", url: "https://www.formula1.com/content/fom-website/en/latest/all.xml", category: "formula-1", language: "en" },
  { name: "Motorsport.com - F1", url: "https://www.motorsport.com/rss/f1/news/", category: "formula-1", language: "en" },
  { name: "Sky Sports - Formula 1", url: "https://www.skysports.com/rss/12433", category: "formula-1", language: "en" },
  { name: "The Guardian - Formula 1", url: "https://www.theguardian.com/sport/formulaone/rss", category: "formula-1", language: "en" },
  { name: "ge - Futebol", url: "https://ge.globo.com/rss/ge/futebol/", category: "futebol", language: "pt-BR" },
  { name: "Trivela", url: "https://trivela.com.br/feed/", category: "futebol", language: "pt-BR" },
  { name: "ge - Futebol Americano", url: "https://ge.globo.com/rss/ge/futebol-americano/", category: "futebol-americano", language: "pt-BR" },
  { name: "IG", url: "https://www.ig.com.br/rss.xml", category: "geral", language: "pt-BR" },
  { name: "Metrópoles – Brasil", url: "https://www.metropoles.com/brasil/feed", category: "geral", language: "pt-BR" },
  { name: "Metrópoles – São Paulo", url: "https://www.metropoles.com/sao-paulo/feed", category: "geral", language: "pt-BR" },
  { name: "Notsports", url: "https://notsports.com.br/feed", category: "geral", language: "pt-BR" },
  { name: "Agência Brasil – Internacional", url: "https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml", category: "mundo", language: "pt-BR" },
  { name: "Brasil de Fato – Internacional", url: "https://www.brasildefato.com.br/editoria/interacional/feed/", category: "mundo", language: "pt-BR" },
  { name: "Carta Capital – Mundo", url: "https://www.cartacapital.com.br/mundo/feed/", category: "mundo", language: "pt-BR" },
  { name: "Jornal de Brasília – Mundo", url: "https://jornaldebrasilia.com.br/noticias/mundo/feed/", category: "mundo", language: "pt-BR" },
  { name: "Metrópoles – Mundo", url: "https://www.metropoles.com/mundo/feed", category: "mundo", language: "pt-BR" },
  { name: "CBS Sports - NFL", url: "https://www.cbssports.com/rss/headlines/nfl/", category: "nfl", language: "en" },
  { name: "NFL", url: "https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs/nfl", category: "nfl", language: "en" },
  { name: "ProFootballTalk (NBC Sports)", url: "https://profootballtalk.nbcsports.com/feed/", category: "nfl", language: "en" },
  { name: "Yahoo Sports - NFL", url: "https://sports.yahoo.com/nfl/rss.xml", category: "nfl", language: "en" },
  { name: "Aero Magazine", url: "https://aeromagazine.uol.com.br/feed/", category: "oc-aviacao", language: "pt-BR" },
  { name: "Aeroflap", url: "https://www.aeroflap.com.br/feed/", category: "oc-aviacao", language: "pt-BR" },
  { name: "Airway", url: "https://www.airway.com.br/feed.xml", category: "oc-aviacao", language: "pt-BR" },
  { name: "FlightGlobal", url: "https://www.flightglobal.com/feed", category: "oc-aviacao", language: "pt-BR" },
  { name: "FLYING Magazine", url: "https://www.flyingmag.com/feed", category: "oc-aviacao", language: "pt-BR" },
  { name: "Gazeta do Povo - Economia", url: "https://www.gazetadopovo.com.br/feed/rss/economia.xml", category: "oc-economia", language: "pt-BR" },
  { name: "InfoMoney - Economia", url: "https://www.infomoney.com.br/economia/feed/", category: "oc-economia", language: "pt-BR" },
  { name: "InfoMoney - Onde Investir", url: "https://www.infomoney.com.br/onde-investir/feed/", category: "oc-economia", language: "pt-BR" },
  { name: "Brazil Journal", url: "https://braziljournal.com/feed/", category: "oc-negocios", language: "pt-BR" },
  { name: "InfoMoney - Business", url: "https://www.infomoney.com.br/business/feed/", category: "oc-negocios", language: "pt-BR" },
  { name: "NeoFeed", url: "https://neofeed.com.br/feed/", category: "oc-negocios", language: "pt-BR" },
  { name: "Forbes Brasil - Turismo de Luxo", url: "https://forbes.com.br/noticias-sobre/turismo-de-luxo/feed/", category: "oc-turismo", language: "pt-BR" },
  { name: "Melhores Destinos", url: "https://www.melhoresdestinos.com.br/feed", category: "oc-turismo", language: "pt-BR" },
  { name: "Mercado & Eventos", url: "https://www.mercadoeeventos.com.br/feed/", category: "oc-turismo", language: "pt-BR" },
  { name: "PANROTAS", url: "https://www.panrotas.com.br/feed", category: "oc-turismo", language: "pt-BR" },
  { name: "BBC Sport - Basketball", url: "https://feeds.bbci.co.uk/sport/basketball/rss.xml", category: "others", language: "en" },
  { name: "BBC Sport - Top Stories", url: "https://feeds.bbci.co.uk/sport/rss.xml", category: "others", language: "en" },
  { name: "CBS Sports - Headlines", url: "https://www.cbssports.com/rss/headlines/", category: "others", language: "en" },
  { name: "Daily Mail - Sport", url: "https://www.dailymail.co.uk/sport/index.rss", category: "others", language: "en" },
  { name: "Daily Post Nigeria", url: "https://dailypost.ng/feed/", category: "others", language: "en" },
  { name: "Nigerian Embassy Korea - Sports", url: "http://www.nigerianembassy.or.kr/sports/feed/", category: "others", language: "en" },
  { name: "Punch Nigeria - Sports", url: "https://punchng.com/topics/sports/feed/", category: "others", language: "en" },
  { name: "Sky Sports - News", url: "https://www.skysports.com/rss/12040", category: "others", language: "en" },
  { name: "Sports247 Nigeria", url: "https://www.sports247.ng/category/nigeria-sports-news-nigeria/feed/", category: "others", language: "en" },
  { name: "The Guardian - Sport", url: "https://www.theguardian.com/uk/sport/rss", category: "others", language: "en" },
  { name: "The Guardian Nigeria - Sport", url: "https://guardian.ng/category/sport/feed/", category: "others", language: "en" },
  { name: "The Independent - Sport", url: "https://www.independent.co.uk/sport/rss", category: "others", language: "en" },
  { name: "The Nation Nigeria - Sports", url: "https://thenationonlineng.net/sports/feed/", category: "others", language: "en" },
  { name: "Vanguard Nigeria - Sports", url: "https://www.vanguardngr.com/category/sports/feed/", category: "others", language: "en" },
  { name: "Yahoo Sports - Top Stories", url: "https://sports.yahoo.com/rss/", category: "others", language: "en" },
  { name: "ESPN Brasil", url: "https://www.espn.com.br/rss/", category: "outros", language: "pt-BR" },
  { name: "Gazeta Esportiva", url: "https://www.gazetaesportiva.com/feed/", category: "outros", language: "pt-BR" },
  { name: "ge - Geral", url: "https://ge.globo.com/rss/ge/", category: "outros", language: "pt-BR" },
  { name: "The Playoffs (NFL/NBA/MLB)", url: "https://theplayoffs.news/feed/", category: "outros", language: "pt-BR" },
  { name: "UOL Esporte", url: "https://rss.uol.com.br/feed/esporte.xml", category: "outros", language: "pt-BR" },
  { name: "Agência Brasil – Política", url: "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml", category: "politica", language: "pt-BR" },
  { name: "Brasil de Fato – Política", url: "https://www.brasildefato.com.br/editoria/politica/feed/", category: "politica", language: "pt-BR" },
  { name: "Carta Capital – Política", url: "https://www.cartacapital.com.br/politica/feed/", category: "politica", language: "pt-BR" },
  { name: "InfoMoney – Política", url: "https://www.infomoney.com.br/politica/feed/", category: "politica", language: "pt-BR" },
  { name: "Notícias ao Minuto – Política", url: "https://www.noticiasaominuto.com.br/rss/politica", category: "politica", language: "pt-BR" },
  { name: "Revista Oeste – Política", url: "https://revistaoeste.com/politica/feed/", category: "politica", language: "pt-BR" },
  { name: "Metrópoles – Saúde", url: "https://www.metropoles.com/saude/feed", category: "saude", language: "pt-BR" },
  { name: "Agência Brasil – Justiça", url: "https://agenciabrasil.ebc.com.br/rss/justica/feed.xml", category: "seguranca", language: "pt-BR" },
  { name: "Finsiders – IA", url: "https://finsidersbrasil.com.br/ia/feed/", category: "tecnologia", language: "pt-BR" },
  { name: "Finsiders – Tecnologia FinTech", url: "https://finsidersbrasil.com.br/tecnologia-para-fintechs/feed/", category: "tecnologia", language: "pt-BR" },
  { name: "InvestNews – Tecnologia", url: "https://investnews.com.br/tecnologia/feed/", category: "tecnologia", language: "pt-BR" },
  { name: "Metrópoles – Ciência", url: "https://www.metropoles.com/ciencia/feed", category: "tecnologia", language: "pt-BR" },
  { name: "ge - Tênis", url: "https://ge.globo.com/rss/ge/tenis/", category: "tenis", language: "pt-BR" },
  { name: "TenisNews", url: "https://tenisnews.com.br/feed/", category: "tenis", language: "pt-BR" },
  { name: "BBC Sport - Tennis", url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml", category: "tennis", language: "en" },
  { name: "Tennis365", url: "https://www.tennis365.com/feed", category: "tennis", language: "en" },
  { name: "The Guardian - Tennis", url: "https://www.theguardian.com/sport/tennis/rss", category: "tennis", language: "en" },
  { name: "ge - Vôlei", url: "https://ge.globo.com/rss/ge/volei/", category: "volei", language: "pt-BR" },
  { name: "AVP Beach Volleyball", url: "https://avp.com/feed/", category: "volleyball", language: "en" },
  { name: "Off the Block - NCAA Volleyball", url: "https://offtheblockblog.com/feed/", category: "volleyball", language: "en" },
  { name: "BBC Sport - World Cup", url: "https://feeds.bbci.co.uk/sport/football/world-cup/rss.xml", category: "world-cup", language: "en" },
  { name: "The Guardian - World Cup 2026", url: "https://www.theguardian.com/football/world-cup-2026/rss", category: "world-cup", language: "en" },
];
