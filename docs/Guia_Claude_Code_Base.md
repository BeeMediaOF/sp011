# Guia para o Claude Code

Use os arquivos abaixo como **base de referência** para qualquer tarefa
relacionada a esta interface.

## Objetivo

-   Não recrie a estrutura do zero.
-   Preserve identidade visual, hierarquia, espaçamentos e organização.
-   Adapte apenas o necessário para o projeto solicitado.

## Arquivo 1 --- HTML de referência

``` html
*HTML:*

<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ponto Farma</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{
      --green:#18a957;
      --green-dark:#0c8b46;
      --blue:#0e2341;
      --text:#1f2a37;
      --muted:#6b7280;
      --border:#e5e7eb;
      --bg:#f7f9fb;
      --white:#ffffff;
      --radius:18px;
      --shadow:0 8px 28px rgba(15,23,42,.06);
      --container:1280px;
    }

    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Inter',sans-serif;
      background:var(--bg);
      color:var(--text);
      line-height:1.4;
    }

    a{text-decoration:none;color:inherit}
    img{max-width:100%;display:block}
    ul{list-style:none}

    .container{
      width:min(var(--container), calc(100% - 40px));
      margin:0 auto;
    }

    .topbar{
      background:#fff;
      border-bottom:1px solid var(--border);
      position:sticky;
      top:0;
      z-index:100;
    }

    .topbar-inner{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:20px;
      min-height:88px;
    }

    .logo{
      display:flex;
      align-items:center;
      gap:12px;
      font-weight:800;
      color:var(--blue);
      font-size:30px;
    }

    .logo-mark{
      width:48px;
      height:48px;
      border:3px solid var(--blue);
      border-radius:14px;
      display:grid;
      place-items:center;
      color:var(--green);
      font-size:24px;
      font-weight:800;
    }

    .logo small{
      display:block;
      font-size:11px;
      color:var(--muted);
      font-weight:500;
      margin-top:2px;
    }

    .nav{
      display:flex;
      align-items:center;
      gap:28px;
      font-size:15px;
      font-weight:600;
      color:#334155;
      flex:1;
      justify-content:center;
    }

    .top-actions{
      display:flex;
      align-items:center;
      gap:14px;
    }

    .search-icon{
      width:42px;
      height:42px;
      border-radius:12px;
      border:1px solid var(--border);
      display:grid;
      place-items:center;
      background:#fff;
    }

    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      padding:14px 22px;
      border-radius:14px;
      font-weight:700;
      border:none;
      cursor:pointer;
    }

    .btn-primary{
      background:var(--green);
      color:#fff;
      box-shadow:var(--shadow);
    }

    .hero{
      padding:38px 0 26px;
    }

    .hero-grid{
      display:grid;
      grid-template-columns: 1.05fr 1.55fr;
      gap:28px;
      align-items:stretch;
    }

    .hero-copy{
      background:#fff;
      border:1px solid var(--border);
      border-radius:var(--radius);
      padding:34px;
      box-shadow:var(--shadow);
      display:flex;
      flex-direction:column;
      justify-content:center;
    }

    .eyebrow{
      color:var(--green);
      font-weight:800;
      letter-spacing:.08em;
      font-size:14px;
      margin-bottom:18px;
      text-transform:uppercase;
    }

    h1{
      font-size:58px;
      line-height:1.03;
      color:var(--blue);
      margin-bottom:18px;
    }

    .hero-copy p{
      color:var(--muted);
      font-size:18px;
      margin-bottom:24px;
      max-width:560px;
    }

    .search-box{
      display:flex;
      background:#fff;
      border:1px solid var(--border);
      border-radius:16px;
      overflow:hidden;
      margin-bottom:18px;
    }

    .search-box input{
      flex:1;
      border:none;
      outline:none;
      padding:18px 18px;
      font-size:15px;
    }

    .search-box button{
      width:62px;
      border:none;
      background:var(--green);
      color:#fff;
      font-size:18px;
      cursor:pointer;
    }

    .newsletter-note{
      display:flex;
      justify-content:space-between;
      gap:16px;
      color:var(--muted);
      font-size:14px;
    }

    .newsletter-note a{
      color:var(--green);
      font-weight:700;
    }

    .hero-featured{
      display:grid;
      grid-template-columns: 2fr 1fr;
      gap:18px;
    }

    .stack{
      display:grid;
      gap:18px;
    }

    .card{
      background:#fff;
      border-radius:var(--radius);
      overflow:hidden;
      border:1px solid var(--border);
      box-shadow:var(--shadow);
    }

    .card-image{
      aspect-ratio: 16/10;
      background:#dfe7ef;
      position:relative;
    }

    .card-image img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .card-body{
      padding:18px;
    }

    .tag{
      display:inline-block;
      padding:7px 10px;
      border-radius:999px;
      background:rgba(24,169,87,.12);
      color:var(--green);
      font-size:12px;
      font-weight:800;
      text-transform:uppercase;
      letter-spacing:.03em;
      margin-bottom:10px;
    }

    .card h3{
      font-size:22px;
      line-height:1.2;
      margin-bottom:10px;
      color:var(--blue);
    }

    .card p{
      color:var(--muted);
      font-size:15px;
      margin-bottom:12px;
    }

    .meta{
      color:#64748b;
      font-size:13px;
      display:flex;
      gap:10px;
      flex-wrap:wrap;
    }

    .section{
      padding:18px 0 10px;
    }

    .section-header{
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin-bottom:18px;
    }

    .section-title{
      font-size:38px;
      line-height:1.1;
      color:var(--blue);
      font-weight:800;
    }

    .see-all{
      color:var(--green);
      font-weight:700;
      font-size:15px;
    }

    .grid-5{
      display:grid;
      grid-template-columns:repeat(5,1fr);
      gap:18px;
    }

    .grid-4{
      display:grid;
      grid-template-columns:repeat(4,1fr);
      gap:18px;
    }

    .mini-card .card-image{
      aspect-ratio: 4/3;
    }

    .mini-card .card-body{
      padding:14px;
    }

    .mini-card h4{
      font-size:18px;
      line-height:1.22;
      color:var(--blue);
      margin-bottom:8px;
    }

    .topics{
      display:grid;
      grid-template-columns:repeat(8,1fr);
      gap:18px;
      margin-top:8px;
    }

    .topic{
      background:#fff;
      border:1px solid var(--border);
      border-radius:18px;
      padding:22px 14px;
      text-align:center;
      box-shadow:var(--shadow);
    }

    .topic-icon{
      width:64px;
      height:64px;
      border-radius:50%;
      margin:0 auto 12px;
      display:grid;
      place-items:center;
      border:1px solid var(--border);
      background:#f8fafc;
      color:var(--green);
      font-size:26px;
      font-weight:800;
    }

    .topic span{
      display:block;
      font-weight:600;
      color:#334155;
      font-size:14px;
    }

    .essential{
      display:grid;
      grid-template-columns:1.5fr .9fr .9fr;
      gap:18px;
    }

    .list-panel{
      background:#fff;
      border:1px solid var(--border);
      border-radius:var(--radius);
      padding:16px;
      box-shadow:var(--shadow);
      display:grid;
      gap:12px;
    }

    .list-item{
      display:grid;
      grid-template-columns:100px 1fr;
      gap:12px;
      align-items:center;
      padding-bottom:12px;
      border-bottom:1px solid var(--border);
    }

    .list-item:last-child{
      border-bottom:none;
      padding-bottom:0;
    }

    .list-thumb{
      width:100px;
      height:74px;
      border-radius:12px;
      overflow:hidden;
      background:#dfe7ef;
    }

    .list-thumb img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .list-item h4{
      color:var(--blue);
      font-size:16px;
      line-height:1.24;
      margin-bottom:6px;
    }

    .cta-box{
      background:linear-gradient(180deg,#0f2446,#0a1630);
      color:#fff;
      border-radius:var(--radius);
      padding:24px;
      min-height:100%;
      display:flex;
      flex-direction:column;
      justify-content:space-between;
      box-shadow:var(--shadow);
    }

    .cta-box .tag{
      background:rgba(255,255,255,.12);
      color:#d1fae5;
    }

    .cta-box h3{
      font-size:34px;
      line-height:1.08;
      margin-bottom:12px;
    }

    .cta-box p{
      color:#cbd5e1;
      margin-bottom:18px;
      font-size:16px;
    }

    .cols{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:18px;
    }

    .authors{
      display:grid;
      grid-template-columns:repeat(6,1fr);
      gap:16px;
    }

    .author{
      background:#fff;
      border:1px solid var(--border);
      border-radius:18px;
      padding:16px;
      text-align:center;
      box-shadow:var(--shadow);
    }

    .author img{
      width:74px;
      height:74px;
      border-radius:50%;
      object-fit:cover;
      margin:0 auto 10px;
    }

    .author h5{
      font-size:16px;
      color:var(--blue);
      margin-bottom:6px;
    }

    .author p{
      color:var(--muted);
      font-size:13px;
    }

    .newsletter{
      margin-top:30px;
      background:linear-gradient(90deg,#0e2341,#0c1630);
      color:#fff;
      border-radius:24px;
      padding:30px;
      display:grid;
      grid-template-columns: 1.2fr 1fr;
      gap:30px;
      align-items:center;
      box-shadow:var(--shadow);
    }

    .newsletter-left{
      display:flex;
      align-items:center;
      gap:18px;
    }

    .newsletter-icon{
      min-width:72px;
      width:72px;
      height:72px;
      border-radius:18px;
      background:#0ec76d;
      display:grid;
      place-items:center;
      font-size:32px;
      color:#fff;
      font-weight:800;
    }

    .newsletter h3{
      font-size:34px;
      line-height:1.08;
      margin-bottom:8px;
    }

    .newsletter p{
      color:#d6dee8;
      font-size:15px;
    }

    .newsletter-form{
      display:flex;
      gap:12px;
    }

    .newsletter-form input{
      flex:1;
      border:none;
      outline:none;
      padding:16px 18px;
      border-radius:14px;
      font-size:15px;
    }

    footer{
      padding:34px 0 60px;
    }

    .footer-grid{
      display:grid;
      grid-template-columns:1.3fr repeat(4,1fr);
      gap:28px;
      margin-top:26px;
    }

    .footer-brand p,
    .footer-col li{
      color:var(--muted);
      font-size:14px;
      margin-bottom:10px;
    }

    .footer-col h4{
      color:var(--blue);
      font-size:16px;
      margin-bottom:12px;
    }

    .socials{
      display:flex;
      gap:10px;
      margin-top:16px;
    }

    .socials a{
      width:38px;
      height:38px;
      border-radius:50%;
      display:grid;
      place-items:center;
      border:1px solid var(--border);
      background:#fff;
    }

    .copyright{
      border-top:1px solid var(--border);
      margin-top:28px;
      padding-top:18px;
      font-size:13px;
      color:var(--muted);
      text-align:center;
    }

    @media (max-width: 1200px){
      .hero-grid,
      .essential,
      .cols,
      .newsletter{
        grid-template-columns:1fr;
      }

      .grid-5{
        grid-template-columns:repeat(2,1fr);
      }

      .grid-4{
        grid-template-columns:repeat(2,1fr);
      }

      .topics{
        grid-template-columns:repeat(4,1fr);
      }

      .authors{
        grid-template-columns:repeat(3,1fr);
      }

      .footer-grid{
        grid-template-columns:1fr 1fr;
      }
    }

    @media (max-width: 820px){
      .nav{display:none}
      h1{font-size:40px}
      .section-title{font-size:28px}
      .hero-featured{
        grid-template-columns:1fr;
      }
      .grid-5,
      .grid-4,
      .topics,
      .authors,
      .footer-grid{
        grid-template-columns:1fr;
      }
      .newsletter-form{
        flex-direction:column;
      }
    }
  </style>
</head>
<body>

  <header class="topbar">
    <div class="container topbar-inner">
      <a href="#" class="logo">
        <span class="logo-mark">P</span>
        <span>
          Ponto<span style="color:var(--green)">Farma</span>
          <small>conteúdo que gera resultado</small>
        </span>
      </a>

      <nav class="nav">
        <a href="#">Gestão</a>
        <a href="#">Fiscal & Tributário</a>
        <a href="#">Legislação</a>
        <a href="#">Mercado</a>
        <a href="#">Vendas</a>
        <a href="#">Equipe</a>
        <a href="#">Tecnologia</a>
        <a href="#">Saúde & Categorias</a>
      </nav>

      <div class="top-actions">
        <a href="#" class="search-icon">🔍</a>
        <a href="#" class="btn btn-primary">Receber conteúdos</a>
      </div>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <div class="eyebrow">Bem-vindo ao Ponto Farma</div>
          <h1>Conteúdo estratégico para farmácias</h1>
          <p>
            Insights práticos sobre gestão, regulação, mercado e operação
            para tomar melhores decisões e fazer sua farmácia crescer.
          </p>

          <form class="search-box">
            <input type="text" placeholder="Buscar artigos, guias e temas..." />
            <button type="submit">🔍</button>
          </form>

          <div class="newsletter-note">
            <span>✉️ Receba conteúdos exclusivos no seu e-mail.</span>
            <a href="#">Quero me inscrever →</a>
          </div>
        </div>

        <div class="hero-featured">
          <article class="card">
            <div class="card-image">
              <img src="https://placehold.co/900x560" alt="Destaque principal">
            </div>
            <div class="card-body">
              <span class="tag">Gestão em destaque</span>
              <h3>Planejamento estratégico para farmácias: saia do operacional e foque no que importa</h3>
              <p>Como estruturar metas, processos e indicadores para sustentar o crescimento.</p>
              <div class="meta">
                <span>Ponto Farma</span>
                <span>7 min de leitura</span>
                <span>16 de mai. de 2024</span>
              </div>
            </div>
          </article>

          <div class="stack">
            <article class="card">
              <div class="card-image">
                <img src="https://placehold.co/500x300" alt="Mercado">
              </div>
              <div class="card-body">
                <span class="tag">Mercado</span>
                <h3>Genéricos em alta: como aproveitar a tendência com margem</h3>
                <div class="meta">
                  <span>5 min</span>
                  <span>15 de mai. de 2024</span>
                </div>
              </div>
            </article>

            <article class="card">
              <div class="card-image">
                <img src="https://placehold.co/500x300" alt="Legislação">
              </div>
              <div class="card-body">
                <span class="tag">Legislação</span>
                <h3>Publicidade em farmácias: o que é permitido e o que evitar</h3>
                <div class="meta">
                  <span>6 min</span>
                  <span>14 de mai. de 2024</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Mais Recentes</h2>
          <a href="#" class="see-all">Ver todos →</a>
        </div>

        <div class="grid-5">
          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Gestão</span>
              <h4>Precificação inteligente: como proteger sua margem sem perder competitividade</h4>
              <div class="meta"><span>6 min</span><span>16 de mai. de 2024</span></div>
            </div>
          </article>

          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Fiscal & Tributário</span>
              <h4>CBS 2027: o que muda para farmácias no dia a dia</h4>
              <div class="meta"><span>7 min</span><span>15 de mai. de 2024</span></div>
            </div>
          </article>

          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Legislação</span>
              <h4>ANVISA: principais exigências que sua operação precisa revisar</h4>
              <div class="meta"><span>6 min</span><span>14 de mai. de 2024</span></div>
            </div>
          </article>

          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Vendas</span>
              <h4>Mix de produtos: como vender melhor sem aumentar o estoque</h4>
              <div class="meta"><span>5 min</span><span>14 de mai. de 2024</span></div>
            </div>
          </article>

          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Tecnologia</span>
              <h4>ERP para farmácias: o que avaliar antes de contratar</h4>
              <div class="meta"><span>5 min</span><span>13 de mai. de 2024</span></div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Temas em Destaque</h2>
        </div>

        <div class="topics">
          <div class="topic"><div class="topic-icon">📈</div><span>Gestão</span></div>
          <div class="topic"><div class="topic-icon">🧾</div><span>Fiscal & Tributário</span></div>
          <div class="topic"><div class="topic-icon">⚖️</div><span>Legislação</span></div>
          <div class="topic"><div class="topic-icon">📊</div><span>Mercado</span></div>
          <div class="topic"><div class="topic-icon">🛒</div><span>Vendas</span></div>
          <div class="topic"><div class="topic-icon">👥</div><span>Equipe</span></div>
          <div class="topic"><div class="topic-icon">💻</div><span>Tecnologia</span></div>
          <div class="topic"><div class="topic-icon">➕</div><span>Saúde & Categorias</span></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Leitura Essencial</h2>
          <a href="#" class="see-all">Ver todos →</a>
        </div>

        <div class="essential">
          <article class="card">
            <div class="card-image">
              <img src="https://placehold.co/900x560" alt="">
            </div>
            <div class="card-body">
              <span class="tag">Guia completo</span>
              <h3>Guia prático de gestão para farmácias mais lucrativas</h3>
              <p>Os fundamentos da gestão eficiente aplicados à realidade da farmácia independente.</p>
              <div class="meta">
                <span>10 min de leitura</span>
                <span>Atualizado em 10 de mai. de 2024</span>
              </div>
            </div>
          </article>

          <div class="list-panel">
            <div class="list-item">
              <div class="list-thumb"><img src="https://placehold.co/200x150" alt=""></div>
              <div>
                <h4>SNGPC sem mistério: rotinas para evitar erros</h4>
                <div class="meta"><span>6 min</span><span>15 de mai. de 2024</span></div>
              </div>
            </div>

            <div class="list-item">
              <div class="list-thumb"><img src="https://placehold.co/200x150" alt=""></div>
              <div>
                <h4>Controlados: pontos de atenção no balcão e no estoque</h4>
                <div class="meta"><span>6 min</span><span>14 de mai. de 2024</span></div>
              </div>
            </div>

            <div class="list-item">
              <div class="list-thumb"><img src="https://placehold.co/200x150" alt=""></div>
              <div>
                <h4>Indicadores que todo gestor de farmácia deveria acompanhar</h4>
                <div class="meta"><span>7 min</span><span>13 de mai. de 2024</span></div>
              </div>
            </div>
          </div>

          <div class="cta-box">
            <div>
              <span class="tag">Material gratuito</span>
              <h3>Planilha de CMV e margem para farmácias</h3>
              <p>Calcule seu custo, margem e preço ideal com uma planilha prática e fácil de usar.</p>
            </div>
            <a href="#" class="btn btn-primary">Baixar agora</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Escolha do Editor</h2>
          <a href="#" class="see-all">Ver todos →</a>
        </div>

        <div class="grid-4">
          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Fiscal & Tributário</span>
              <h4>Reforma Tributária: riscos e oportunidades para o varejo farmacêutico</h4>
              <div class="meta"><span>7 min</span><span>12 de mai. de 2024</span></div>
            </div>
          </article>

          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Vendas</span>
              <h4>Ticket médio: estratégias para aumentar com ética</h4>
              <div class="meta"><span>6 min</span><span>11 de mai. de 2024</span></div>
            </div>
          </article>

          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Mercado</span>
              <h4>Distribuidoras e laboratórios: como negociar melhor</h4>
              <div class="meta"><span>6 min</span><span>10 de mai. de 2024</span></div>
            </div>
          </article>

          <article class="card mini-card">
            <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
            <div class="card-body">
              <span class="tag">Equipe</span>
              <h4>Treinamento de equipe: erros que custam caro</h4>
              <div class="meta"><span>6 min</span><span>9 de mai. de 2024</span></div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container cols">
        <div>
          <div class="section-header">
            <h2 class="section-title">Negócios & Operação</h2>
            <a href="#" class="see-all">Ver todos →</a>
          </div>

          <div class="grid-4">
            <article class="card mini-card">
              <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
              <div class="card-body">
                <h4>DRE da farmácia: como interpretar seus números</h4>
                <div class="meta"><span>6 min</span><span>12 de mai. de 2024</span></div>
              </div>
            </article>

            <article class="card mini-card">
              <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
              <div class="card-body">
                <h4>Sazonalidade: como se preparar para picos de demanda</h4>
                <div class="meta"><span>5 min</span><span>11 de mai. de 2024</span></div>
              </div>
            </article>

            <article class="card mini-card">
              <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
              <div class="card-body">
                <h4>Automação no PDV: ganhos reais na rotina</h4>
                <div class="meta"><span>5 min</span><span>9 de mai. de 2024</span></div>
              </div>
            </article>
          </div>
        </div>

        <div>
          <div class="section-header">
            <h2 class="section-title">Compliance & Regulação</h2>
            <a href="#" class="see-all">Ver todos →</a>
          </div>

          <div class="grid-4">
            <article class="card mini-card">
              <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
              <div class="card-body">
                <h4>Boas Práticas Farmacêuticas: checklist essencial</h4>
                <div class="meta"><span>6 min</span><span>12 de mai. de 2024</span></div>
              </div>
            </article>

            <article class="card mini-card">
              <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
              <div class="card-body">
                <h4>Obrigações acessórias: calendário para não perder prazos</h4>
                <div class="meta"><span>5 min</span><span>11 de mai. de 2024</span></div>
              </div>
            </article>

            <article class="card mini-card">
              <div class="card-image"><img src="https://placehold.co/500x350" alt=""></div>
              <div class="card-body">
                <h4>Controlados e auditoria: onde mais acontecem falhas</h4>
                <div class="meta"><span>6 min</span><span>10 de mai. de 2024</span></div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Colunistas & Especialistas</h2>
          <a href="#" class="see-all">Ver todos →</a>
        </div>

        <div class="authors">
          <div class="author">
            <img src="https://placehold.co/200x200" alt="">
            <h5>Renata M. Coelho</h5>
            <p>Especialista em Gestão e Estratégia</p>
          </div>
          <div class="author">
            <img src="https://placehold.co/200x200" alt="">
            <h5>Bruno Salgado</h5>
            <p>Consultor Fiscal & Tributário</p>
          </div>
          <div class="author">
            <img src="https://placehold.co/200x200" alt="">
            <h5>Carla Menezes</h5>
            <p>Advogada especialista em Legislação</p>
          </div>
          <div class="author">
            <img src="https://placehold.co/200x200" alt="">
            <h5>Paulo Henrique</h5>
            <p>Analista de Mercado e Sell-Out</p>
          </div>
          <div class="author">
            <img src="https://placehold.co/200x200" alt="">
            <h5>Juliana Prado</h5>
            <p>Especialista em Tecnologia</p>
          </div>
          <div class="author">
            <img src="https://placehold.co/200x200" alt="">
            <h5>Tiago Nunes</h5>
            <p>Consultor de Vendas e Performance</p>
          </div>
        </div>

        <div class="newsletter">
          <div class="newsletter-left">
            <div class="newsletter-icon">✉</div>
            <div>
              <h3>Inscreva-se para receber conteúdos exclusivos</h3>
              <p>Artigos, guias e ferramentas práticas para ajudar sua farmácia a crescer todos os dias.</p>
            </div>
          </div>

          <form class="newsletter-form">
            <input type="email" placeholder="Seu melhor e-mail">
            <button class="btn btn-primary" type="submit">Quero receber</button>
          </form>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="#" class="logo" style="font-size:28px">
            <span class="logo-mark">P</span>
            <span>
              Ponto<span style="color:var(--green)">Farma</span>
              <small>Portal de conteúdo para gestão e operação farmacêutica.</small>
            </span>
          </a>
          <div class="socials">
            <a href="#">in</a>
            <a href="#">ig</a>
            <a href="#">yt</a>
            <a href="#">fb</a>
          </div>
        </div>

        <div class="footer-col">
          <h4>Conteúdos</h4>
          <ul>
            <li>Gestão</li>
            <li>Fiscal & Tributário</li>
            <li>Legislação</li>
            <li>Mercado</li>
            <li>Vendas</li>
            <li>Equipe</li>
            <li>Tecnologia</li>
            <li>Saúde & Categorias</li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Ferramentas</h4>
          <ul>
            <li>Calculadoras</li>
            <li>Modelos de Planilha</li>
            <li>Indicadores</li>
            <li>Checklists</li>
            <li>Guia de Fornecedores</li>
            <li>Glossário</li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Institucional</h4>
          <ul>
            <li>Sobre o Ponto Farma</li>
            <li>Para Parceiros</li>
            <li>Anuncie</li>
            <li>Eventos</li>
            <li>Fale Conosco</li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Legal</h4>
          <ul>
            <li>Política de Privacidade</li>
            <li>Termos de Uso</li>
            <li>Política de Cookies</li>
            <li>Código de Conduta</li>
          </ul>
        </div>
      </div>

      <div class="copyright">
        © 2024 Ponto Farma. Todos os direitos reservados.
      </div>
    </div>
  </footer>

</body>
</html>
```

------------------------------------------------------------------------

## Arquivo 2 --- Estrutura de conteúdo (JSON)

``` json
*JSON:*

{
  "site": {
    "name": "Ponto Farma",
    "domain": "pontofarma.com",
    "tagline": "conteúdo que gera resultado",
    "description": "Portal de conteúdo para gestão e operação farmacêutica.",
    "theme": {
      "primary": "#18a957",
      "primaryDark": "#0c8b46",
      "secondary": "#0e2341",
      "background": "#f7f9fb",
      "text": "#1f2a37",
      "muted": "#6b7280",
      "white": "#ffffff"
    }
  },
  "navigation": {
    "headerMenu": [
      "Gestão",
      "Fiscal & Tributário",
      "Legislação",
      "Mercado",
      "Vendas",
      "Equipe",
      "Tecnologia",
      "Saúde & Categorias"
    ],
    "cta": {
      "label": "Receber conteúdos",
      "url": "/newsletter"
    }
  },
  "hero": {
    "eyebrow": "Bem-vindo ao Ponto Farma",
    "title": "Conteúdo estratégico para farmácias",
    "description": "Insights práticos sobre gestão, regulação, mercado e operação para tomar melhores decisões e fazer sua farmácia crescer.",
    "searchPlaceholder": "Buscar artigos, guias e temas...",
    "newsletterText": "Receba conteúdos exclusivos no seu e-mail.",
    "newsletterLink": {
      "label": "Quero me inscrever",
      "url": "/newsletter"
    },
    "featured": {
      "main": {
        "category": "Gestão em destaque",
        "title": "Planejamento estratégico para farmácias: saia do operacional e foque no que importa",
        "excerpt": "Como estruturar metas, processos e indicadores para sustentar o crescimento.",
        "image": "/images/hero-planejamento.jpg",
        "author": "Ponto Farma",
        "readingTime": "7 min de leitura",
        "date": "2024-05-16"
      },
      "side": [
        {
          "category": "Mercado",
          "title": "Genéricos em alta: como aproveitar a tendência com margem",
          "image": "/images/mercado-genericos.jpg",
          "readingTime": "5 min",
          "date": "2024-05-15"
        },
        {
          "category": "Legislação",
          "title": "Publicidade em farmácias: o que é permitido e o que evitar",
          "image": "/images/legislacao-publicidade.jpg",
          "readingTime": "6 min",
          "date": "2024-05-14"
        }
      ]
    }
  },
  "sections": [
    {
      "id": "mais-recentes",
      "title": "Mais Recentes",
      "viewAllUrl": "/artigos",
      "layout": "grid-5",
      "posts": [
        {
          "category": "Gestão",
          "title": "Precificação inteligente: como proteger sua margem sem perder competitividade",
          "image": "/images/posts/precificacao.jpg",
          "readingTime": "6 min",
          "date": "2024-05-16"
        },
        {
          "category": "Fiscal & Tributário",
          "title": "CBS 2027: o que muda para farmácias no dia a dia",
          "image": "/images/posts/cbs-2027.jpg",
          "readingTime": "7 min",
          "date": "2024-05-15"
        },
        {
          "category": "Legislação",
          "title": "ANVISA: principais exigências que sua operação precisa revisar",
          "image": "/images/posts/anvisa.jpg",
          "readingTime": "6 min",
          "date": "2024-05-14"
        },
        {
          "category": "Vendas",
          "title": "Mix de produtos: como vender melhor sem aumentar o estoque",
          "image": "/images/posts/mix-produtos.jpg",
          "readingTime": "5 min",
          "date": "2024-05-14"
        },
        {
          "category": "Tecnologia",
          "title": "ERP para farmácias: o que avaliar antes de contratar",
          "image": "/images/posts/erp.jpg",
          "readingTime": "5 min",
          "date": "2024-05-13"
        }
      ]
    },
    {
      "id": "temas-destaque",
      "title": "Temas em Destaque",
      "layout": "icon-grid",
      "topics": [
        { "name": "Gestão", "icon": "chart" },
        { "name": "Fiscal & Tributário", "icon": "receipt" },
        { "name": "Legislação", "icon": "scale" },
        { "name": "Mercado", "icon": "pie-chart" },
        { "name": "Vendas", "icon": "cart" },
        { "name": "Equipe", "icon": "users" },
        { "name": "Tecnologia", "icon": "monitor" },
        { "name": "Saúde & Categorias", "icon": "plus" }
      ]
    },
    {
      "id": "leitura-essencial",
      "title": "Leitura Essencial",
      "viewAllUrl": "/guias",
      "layout": "feature-list-cta",
      "featuredPost": {
        "category": "Guia completo",
        "title": "Guia prático de gestão para farmácias mais lucrativas",
        "excerpt": "Os fundamentos da gestão eficiente aplicados à realidade da farmácia independente.",
        "image": "/images/guias/guia-gestao.jpg",
        "readingTime": "10 min de leitura",
        "updatedAt": "2024-05-10"
      },
      "listPosts": [
        {
          "title": "SNGPC sem mistério: rotinas para evitar erros",
          "image": "/images/posts/sngpc-rotinas.jpg",
          "readingTime": "6 min",
          "date": "2024-05-15"
        },
        {
          "title": "Controlados: pontos de atenção no balcão e no estoque",
          "image": "/images/posts/controlados.jpg",
          "readingTime": "6 min",
          "date": "2024-05-14"
        },
        {
          "title": "Indicadores que todo gestor de farmácia deveria acompanhar",
          "image": "/images/posts/indicadores.jpg",
          "readingTime": "7 min",
          "date": "2024-05-13"
        }
      ],
      "ctaCard": {
        "eyebrow": "Material gratuito",
        "title": "Planilha de CMV e margem para farmácias",
        "description": "Calcule seu custo, margem e preço ideal com uma planilha prática e fácil de usar.",
        "buttonLabel": "Baixar agora",
        "buttonUrl": "/materiais/planilha-cmv"
      }
    },
    {
      "id": "escolha-do-editor",
      "title": "Escolha do Editor",
      "viewAllUrl": "/editoria/escolha-do-editor",
      "layout": "grid-4",
      "posts": [
        {
          "category": "Fiscal & Tributário",
          "title": "Reforma Tributária: riscos e oportunidades para o varejo farmacêutico",
          "image": "/images/posts/reforma-tributaria.jpg",
          "readingTime": "7 min",
          "date": "2024-05-12"
        },
        {
          "category": "Vendas",
          "title": "Ticket médio: estratégias para aumentar com ética",
          "image": "/images/posts/ticket-medio.jpg",
          "readingTime": "6 min",
          "date": "2024-05-11"
        },
        {
          "category": "Mercado",
          "title": "Distribuidoras e laboratórios: como negociar melhor",
          "image": "/images/posts/distribuidoras.jpg",
          "readingTime": "6 min",
          "date": "2024-05-10"
        },
        {
          "category": "Equipe",
          "title": "Treinamento de equipe: erros que custam caro",
          "image": "/images/posts/treinamento-equipe.jpg",
          "readingTime": "6 min",
          "date": "2024-05-09"
        }
      ]
    },
    {
      "id": "negocios-operacao",
      "title": "Negócios & Operação",
      "viewAllUrl": "/editoria/negocios-operacao",
      "layout": "grid-3",
      "posts": [
        {
          "title": "DRE da farmácia: como interpretar seus números",
          "image": "/images/posts/dre.jpg",
          "readingTime": "6 min",
          "date": "2024-05-12"
        },
        {
          "title": "Sazonalidade: como se preparar para picos de demanda",
          "image": "/images/posts/sazonalidade.jpg",
          "readingTime": "5 min",
          "date": "2024-05-11"
        },
        {
          "title": "Automação no PDV: ganhos reais na rotina",
          "image": "/images/posts/automacao-pdv.jpg",
          "readingTime": "5 min",
          "date": "2024-05-09"
        }
      ]
    },
    {
      "id": "compliance-regulacao",
      "title": "Compliance & Regulação",
      "viewAllUrl": "/editoria/compliance-regulacao",
      "layout": "grid-3",
      "posts": [
        {
          "title": "Boas Práticas Farmacêuticas: checklist essencial",
          "image": "/images/posts/boas-praticas.jpg",
          "readingTime": "6 min",
          "date": "2024-05-12"
        },
        {
          "title": "Obrigações acessórias: calendário para não perder prazos",
          "image": "/images/posts/obrigacoes-acessorias.jpg",
          "readingTime": "5 min",
          "date": "2024-05-11"
        },
        {
          "title": "Controlados e auditoria: onde mais acontecem falhas",
          "image": "/images/posts/auditoria-controlados.jpg",
          "readingTime": "6 min",
          "date": "2024-05-10"
        }
      ]
    }
  ],
  "authors": {
    "title": "Colunistas & Especialistas",
    "viewAllUrl": "/colunistas",
    "items": [
      {
        "name": "Renata M. Coelho",
        "role": "Especialista em Gestão e Estratégia",
        "avatar": "/images/authors/renata.jpg"
      },
      {
        "name": "Bruno Salgado",
        "role": "Consultor Fiscal & Tributário",
        "avatar": "/images/authors/bruno.jpg"
      },
      {
        "name": "Carla Menezes",
        "role": "Advogada especialista em Legislação",
        "avatar": "/images/authors/carla.jpg"
      },
      {
        "name": "Paulo Henrique",
        "role": "Analista de Mercado e Sell-Out",
        "avatar": "/images/authors/paulo.jpg"
      },
      {
        "name": "Juliana Prado",
        "role": "Especialista em Tecnologia",
        "avatar": "/images/authors/juliana.jpg"
      },
      {
        "name": "Tiago Nunes",
        "role": "Consultor de Vendas e Performance",
        "avatar": "/images/authors/tiago.jpg"
      }
    ]
  },
  "newsletter": {
    "title": "Inscreva-se para receber conteúdos exclusivos",
    "description": "Artigos, guias e ferramentas práticas para ajudar sua farmácia a crescer todos os dias.",
    "placeholder": "Seu melhor e-mail",
    "buttonLabel": "Quero receber",
    "privacyNote": "Sem spam. Você pode cancelar quando quiser."
  },
  "footer": {
    "brandDescription": "Portal de conteúdo para gestão e operação farmacêutica.",
    "socialLinks": [
      { "name": "LinkedIn", "url": "#" },
      { "name": "Instagram", "url": "#" },
      { "name": "YouTube", "url": "#" },
      { "name": "Facebook", "url": "#" }
    ],
    "columns": [
      {
        "title": "Conteúdos",
        "links": [
          "Gestão",
          "Fiscal & Tributário",
          "Legislação",
          "Mercado",
          "Vendas",
          "Equipe",
          "Tecnologia",
          "Saúde & Categorias"
        ]
      },
      {
        "title": "Ferramentas",
        "links": [
          "Calculadoras",
          "Modelos de Planilha",
          "Indicadores",
          "Checklists",
          "Guia de Fornecedores",
          "Glossário"
        ]
      },
      {
        "title": "Institucional",
        "links": [
          "Sobre o Ponto Farma",
          "Para Parceiros",
          "Anuncie",
          "Eventos",
          "Fale Conosco"
        ]
      },
      {
        "title": "Legal",
        "links": [
          "Política de Privacidade",
          "Termos de Uso",
          "Política de Cookies",
          "Código de Conduta"
        ]
      }
    ],
    "copyright": "© 2024 Ponto Farma. Todos os direitos reservados."
  }
}
```

------------------------------------------------------------------------

## Regras

1.  Utilize o HTML como referência visual e estrutural.
2.  Utilize o JSON como fonte de conteúdo e organização das seções.
3.  Mantenha responsividade, acessibilidade e código limpo.
4.  Reutilize componentes quando possível.
5.  Preserve a identidade visual geral, adaptando apenas o necessário
    para a nova tarefa.
6.  Caso exista conflito entre HTML e JSON, priorize a estrutura do HTML
    e o conteúdo do JSON.
