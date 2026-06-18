<?php
// maa-mass.php — Gerador em Massa (pautas) com fila + persistência + Gemini/OpenAI
if (!defined('ABSPATH')) exit;

if (!class_exists('MAA_Mass_Generator')) :

final class MAA_Mass_Generator {
    const UA        = 'Mozilla/5.0 (compatible; MAA-Bot/1.0; +https://example.com/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
    const MAX       = 20;
    const INBOX_OPT = 'maa_mass_queue_inbox'; // inbox comum usada por YouTube, Estrategista etc.

    public static function init() {
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_assets']);
        add_action('rest_api_init',         [__CLASS__, 'register_rest_routes']);

        // Permite que outros módulos enfileirem:
        // - YouTube PRO: do_action('maa_mass_enqueue_from_youtube', $payload)
        // - Qualquer módulo: do_action('maa_mass_enqueue', $payload)
        add_action('maa_mass_enqueue_from_youtube', [__CLASS__, 'enqueue_server'], 10, 1);
        add_action('maa_mass_enqueue',              [__CLASS__, 'enqueue_server'], 10, 1);
    }

    /** ========== Helpers de Inbox/Enfileiramento (servidor) ========== */

    /** Enfileira um payload no servidor (option). Usado pelo hook e pela função global. */
   public static function enqueue_server($payload) {
  $san = self::sanitize_payload($payload);
  if (!$san) return 0;

  // Hash estável: IGNORA campos voláteis
  $hash_source = $san;
  unset($hash_source['created_at'], $hash_source['status'], $hash_source['priority']);

  // Se for youtube, use identificadores mais estáveis
  if (($hash_source['type'] ?? '') === 'youtube_transcript') {
    $hash_source = [
      'type'     => 'youtube_transcript',
      'video_id' => $san['video_id'] ?? '',
      'srt_url'  => $san['srt_url'] ?? '',
      'srt_path' => $san['srt_path'] ?? '',
      'title'    => $san['title'] ?? '',
    ];
  }

  $san['_hash'] = md5( wp_json_encode($hash_source) );

  $inbox = get_option(self::INBOX_OPT, []);
  if (!is_array($inbox)) $inbox = [];

  foreach ($inbox as $it) {
    if (is_array($it) && isset($it['_hash']) && $it['_hash'] === $san['_hash']) {
      return 2; // DUPLICADO
    }
  }

  $inbox[] = $san;
  $ok = update_option(self::INBOX_OPT, $inbox, false);

  return $ok ? 1 : 0; // 1=ADICIONADO, 0=FALHA
}


    /** Sanitize básico do payload aceito (atual: youtube_transcript | manual). */
    protected static function sanitize_payload($p) {
        if (!is_array($p)) return null;
        $type = isset($p['type']) ? sanitize_key($p['type']) : 'manual';

        if ($type === 'youtube_transcript') {
            // Campos esperados do módulo YouTube PRO
            return [
                'type'       => 'youtube_transcript',
                'created_at' => isset($p['created_at']) ? intval($p['created_at']) : time(),
                'video_url'  => isset($p['video_url'])  ? esc_url_raw($p['video_url']) : '',
                'video_id'   => isset($p['video_id'])   ? sanitize_text_field($p['video_id']) : '',
                'srt_path'   => isset($p['srt_path'])   ? sanitize_text_field($p['srt_path']) : '',
                'srt_url'    => isset($p['srt_url'])    ? esc_url_raw($p['srt_url']) : '',
                'title'      => isset($p['title'])      ? sanitize_text_field($p['title']) : '',
                // Campos opcionais futuros
                'priority'   => isset($p['priority'])   ? sanitize_key($p['priority']) : 'normal',
                'status'     => 'queued',
            ];
        }

        // fallback: manual simples (inclui manual vindo do Estrategista)
        return [
            'type'  => 'manual',
            'pauta' => isset($p['pauta']) ? sanitize_textarea_field($p['pauta']) : '',
            'fonte' => isset($p['fonte']) ? wp_kses_post($p['fonte']) : '',
            // aceita tanto 'kw' quanto 'palavra_chave_alvo' vindos do Estrategista
            'kw'    => isset($p['kw'])
                ? sanitize_text_field($p['kw'])
                : ( isset($p['palavra_chave_alvo']) ? sanitize_text_field($p['palavra_chave_alvo']) : '' ),
        ];
    }

    /** Lê e zera inbox (atomicamente) */
   public static function drain_inbox() {
        $items = get_option(self::INBOX_OPT, []);
        if (!is_array($items)) $items = [];
        update_option(self::INBOX_OPT, [], false);
        return $items;
    }

    /** Apenas lê inbox (não zera) */
    protected static function peek_inbox() {
        $items = get_option(self::INBOX_OPT, []);
        return is_array($items) ? $items : [];
    }

    /** Converte conteúdo SRT para texto simples (remove contadores e timestamps) */
    protected static function srt_to_text($srt) {
        $lines = preg_split("/\r\n|\n|\r/", (string)$srt);
        $out = [];
        foreach ($lines as $ln) {
            $l = trim($ln);
            if ($l === '') { $out[]=''; continue; }
            // remove linhas que são apenas números (índice)
            if (preg_match('/^\d+$/', $l)) continue;
            // remove linhas de timestamp
            if (preg_match('/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/', $l)) continue;
            $out[] = $l;
        }
        $txt = trim(preg_replace("/(\R){2,}/", "\n\n", implode("\n", $out)));
        return $txt;
    }

    /** ---------- UI ---------- */
    public static function render_page() {
        // aba ativa via query-string (?sub=manual|noticias|video|estrat)
        $active = isset($_GET['sub']) ? sanitize_key($_GET['sub']) : 'manual';
        if (!in_array($active, ['manual','noticias','video','estrat'], true)) {
            $active = 'manual';
        }

        // URLs das abas
        $base = admin_url('admin.php');
        $url  = function($sub) use ($base) {
            return add_query_arg(['page' => 'maa-main', 'sub' => $sub], $base);
        };

        echo '<div class="wrap"><h1 style="display:none;">Artigos Automáticos</h1>'; ?>

        <div class="maa3">
          <div class="header">
            <div>
              <h2>Artigos Automáticos</h2>
              <div class="hint">Versão instalada: <strong><?php echo esc_html(MAA_AutoArticles::VERSION); ?></strong></div>
            </div>
            <span class="chip">Processa em fila • 1 por vez</span>
          </div>

          <!-- Navegação (cada aba abre nova URL) -->
          <nav class="maa-topnav" aria-label="Seções de Artigos Automáticos">
            <a class="tab <?php echo $active==='manual'   ? 'is-active' : ''; ?>"   href="<?php echo esc_url($url('manual'));   ?>">Geração manual</a>
            <a class="tab <?php echo $active==='noticias' ? 'is-active' : ''; ?>"   href="<?php echo esc_url($url('noticias')); ?>">Notícias Automáticas</a>
            <a class="tab <?php echo $active==='video'    ? 'is-active' : ''; ?>"   href="<?php echo esc_url($url('video'));    ?>">Geração via vídeo</a>
            <a class="tab <?php echo $active==='estrat'   ? 'is-active' : ''; ?>"   href="<?php echo esc_url($url('estrat'));   ?>">Estrategista de conteúdos</a>
          </nav>

          <?php if ($active === 'manual'): ?>
          <!-- ============ ABA 1: Geração manual ============ -->
          <section id="maa-tab-manual" class="tabpanel" role="tabpanel">
            <div class="grid-top">
              <div class="card">
                <label for="maa-pauta">1) Pauta</label>
                <textarea id="maa-pauta" rows="4" placeholder="Ex.: Governo anuncia novo programa..."></textarea>

                <label for="maa-fonte">Conteúdo da fonte</label>
                <textarea id="maa-fonte" rows="6" placeholder="Cole o texto de referência, transcrição, release, etc."></textarea>

                <div class="row-inline">
                  <button id="maa-add-pauta" class="btn">
                    <span class="dashicons dashicons-plus-alt2"></span>
                    Adicionar à fila
                  </button>
                  <span class="hint">Limite: <strong><?php echo esc_html(self::MAX); ?></strong> itens por execução.</span>
                </div>
              </div>

              <div class="card">
                <label for="maa-estilo">2) Fila de geração – Estilo</label>
                <select id="maa-estilo">
                  <option value="conteudo_viral_padrao">Conteúdo viral padrão</option>
                  <option value="jornalistico">Jornalístico</option>
                  <option value="artigo_blog">Artigo de blog</option>
                  <option value="noticia_curta">Notícia curta</option>
                  <option value="review">Review</option>
                  <option value="nota">Nota</option>
                </select>

                <label>IA</label>
                <div class="seg" role="tablist" aria-label="Seleção de IA">
                  <button type="button" id="prov-gemini" aria-pressed="true">Gemini (Google)</button>
                  <button type="button" id="prov-openai" aria-pressed="false">OpenAI</button>
                </div>
                <input type="hidden" id="maa-provider" value="gemini" />

                <label for="maa-model" class="mt-10">Modelo</label>
                <select id="maa-model"></select>

                <!-- Prompt personalizado (PRO) -->
                <div class="mt-12" id="mass-adv-wrap">
                  <label style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="mass-use-custom-prompt" />
                    <span><strong>Usar prompt personalizado</strong> <small style="color:#a00;">— ⚠ Avançado: use com cuidado; pode causar erro na geração.</small></span>
                  </label>
                  <p id="mass-pro-msg" class="hint" style="margin:6px 0 0;display:none;">Recurso PRO – ative sua licença PRO para poder editar o prompt.</p>
                  <textarea id="mass-custom-prompt" rows="10" style="width:100%;margin-top:8px;display:none;"></textarea>
                </div>

                <!-- Campos globais -->
                <div class="grid-top" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
                  <div>
                    <label for="maa-idioma">Idioma do conteúdo</label>
                    <input id="maa-idioma" type="text" class="maa-yt-input" value="pt-BR" placeholder="pt-BR">
                  </div>
                  <div>
                    <label for="maa-pais">País</label>
                    <input id="maa-pais" type="text" class="maa-yt-input" value="Brasil" placeholder="Brasil">
                  </div>
                </div>

                <!-- Imagens de destaque -->
                <div class="mt-12">
                  <label>Imagens de destaque</label>
                  <div class="seg" role="radiogroup" aria-label="Imagens de destaque">
                    <button type="button" id="maa-img-none" aria-pressed="true">Sem imagens</button>
                    <button type="button" id="maa-img-ai" aria-pressed="false">Gerar com IA</button>
                  </div>
                  <input type="hidden" id="maa-img-mode" value="none" />
                </div>

                <div id="maa-img-config" class="mt-10" style="display:none;">
                  <div style="margin-bottom:8px;">
                    <label for="maa-img-provider">Provedor de imagem</label>
                    <select id="maa-img-provider" style="width:100%;">
                      <option value="gemini" selected>Gemini (Google – Imagen / Gemini 3)</option>
                      <option value="openai">OpenAI (gpt-image-1 / DALL·E 3)</option>
                    </select>
                  </div>
                  <div style="margin-bottom:8px;">
                    <label for="maa-img-model">Modelo de imagem</label>
                    <select id="maa-img-model" style="width:100%;"></select>
                  </div>
                  <div id="maa-img-quality-wrap" style="margin-bottom:8px;display:none;">
                    <label for="maa-img-quality" id="maa-img-quality-title">Qualidade</label>
                    <select id="maa-img-quality" style="width:100%;"></select>
                  </div>
                  <p class="hint" style="margin-top:4px;">
                    O prompt da imagem será criado automaticamente pela IA com base na pauta e na fonte,
                    em formato horizontal otimizado para Google Discover.
                  </p>
                </div>

                <div class="mt-12">
                  <label for="maa-post-status">Status do artigo após criação</label>
                  <select id="maa-post-status">
                    <option value="draft" selected>Rascunho</option>
                    <option value="publish">Publicado</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>

                <div class="row-inline mt-12">
                  <button id="maa-save-queue" class="btn"><span class="dashicons dashicons-archive"></span>Salvar fila</button>
                  <button id="maa-reset-queue" class="btn"><span class="dashicons dashicons-update"></span>Resetar fila</button>
                </div>
              </div>
            </div>

            <div class="queue-wrap card">
              <label>Fila de geração</label>
              <div id="maa-queue" class="q-list">
                <div class="q-empty">Fila vazia.</div>
              </div>
            </div>

            <div class="exec">
              <div class="card">
                <div class="row-inline">
                  <button id="maa-start" class="btn primary">
                    <span class="dashicons dashicons-controls-play"></span>
                    Iniciar geração
                  </button>
                  <span id="maa-run-status" class="hint"></span>
                </div>

                <div id="maa-progress" class="mt-12" style="display:none;">
                  <div class="bar"><i id="maa-progressbar-inner" style="width:0%"></i></div>
                  <div class="stat mt-6">
                    Concluídos: <span id="maa-done">0</span> / <span id="maa-total">0</span> • Restantes: <span id="maa-left">0</span>
                  </div>
                  <div id="maa-log" class="history mt-8"><em>Nenhuma execução ainda.</em></div>
                </div>
              </div>

              <div class="card">
                <label>Histórico desta sessão</label>
                <div id="maa-history" class="history"><em>Nenhuma execução ainda.</em></div>
              </div>
            </div>
          </section>

          <?php elseif ($active === 'noticias'): ?>
          <!-- ============ ABA 2: Notícias Automáticas (PRO) ============ -->
          <section id="maa-tab-noticias" class="tabpanel" role="tabpanel">
            <?php
              $pro_licensed = class_exists('MAA_AutoArticles') ? MAA_AutoArticles::is_pro_license_active() : false;

              if ( $pro_licensed ) {
                  // 1) Preferência por hook (modular)
                  if ( has_action('maa_render_news_tab') ) {
                      do_action('maa_render_news_tab');

                  // 2) Fallback: chamada direta ao módulo PRO, se existir
                  } elseif ( class_exists('MAA_PRO_News_Module') ) {
                      if ( method_exists('MAA_PRO_News_Module','render_admin_tab') ) {
                          MAA_PRO_News_Module::render_admin_tab();
                      } elseif ( method_exists('MAA_PRO_News_Module','render_admin') ) {
                          MAA_PRO_News_Module::render_admin();
                      } elseif ( method_exists('MAA_PRO_News_Module','render_page') ) {
                          MAA_PRO_News_Module::render_page();
                      } else {
                          echo '<div class="card"><h3 style="margin:0 0 8px;">Notícias Automáticas</h3>
                                <p class="hint">Módulo PRO instalado, mas sem método de renderização compatível. Verifique sua versão do PRO.</p></div>';
                      }

                  // 3) Sem hook e sem classe encontrada
                  } else {
                      echo '<div class="card"><h3 style="margin:0 0 8px;">Notícias Automáticas</h3>
                            <p class="hint">Módulo não encontrado. Verifique a instalação do PRO.</p></div>';
                  }

              } else {
                  // Sem licença: cartão simples com CTA (padrão igual às outras abas)
                  $cta = self::pro_cta();
                  echo '<div class="card">
                          <h3 style="margin:0 0 8px;">Notícias Automáticas</h3>
                          <p class="hint">Conecte feeds/RSS e fontes para gerar notícias contínuas com extração, fila e publicação programada. Recurso disponível no plano PRO.</p>
                          <a class="button button-primary" href="'.esc_url($cta['url']).'" target="_blank" rel="noopener">'.esc_html($cta['label']).'</a>
                        </div>';
              }
            ?>
          </section>

          <?php elseif ($active === 'video'): ?>
          <!-- ============ ABA 3: Geração via vídeo (hookável / PRO) ============ -->
          <section id="maa-tab-video" class="tabpanel" role="tabpanel">
            <?php
              $pro_inst     = class_exists('MAA_AutoArticles') ? MAA_AutoArticles::is_pro_active()         : false;
              $pro_licensed = class_exists('MAA_AutoArticles') ? MAA_AutoArticles::is_pro_license_active() : false;

              if ( $pro_licensed ) {
                  // Com licença PRO válida, renderiza o módulo real via hook
                  if ( has_action('maa_render_video_tab') ) {
                      do_action('maa_render_video_tab');
                  } else {
                      echo '<div class="card"><h3 style="margin:0 0 8px;">Geração via vídeo</h3>
                            <p class="hint">Módulo não encontrado. Verifique a instalação do PRO.</p></div>';
                  }
              } else {
                  // Sem licença: cartão simples para o usuário final
                  $cta = self::pro_cta();
                  echo '<div class="card">
                          <h3 style="margin:0 0 8px;">Geração via Vídeo (YouTube)</h3>
                          <p class="hint">Baixe legendas automaticamente e gere pautas/rascunhos a partir de vídeos do YouTube. Recurso disponível no plano PRO.</p>
                          <a class="button button-primary" href="'.esc_url($cta['url']).'" target="_blank" rel="noopener">'.esc_html($cta['label']).'</a>
                        </div>';
              }
            ?>
          </section>

          <?php else: ?>
          <!-- ============ ABA 4: Estrategista de conteúdos (PRO) ============ -->
          <section id="maa-tab-estrat" class="tabpanel" role="tabpanel">
            <?php
              $pro_licensed = class_exists('MAA_AutoArticles') ? MAA_AutoArticles::is_pro_license_active() : false;

              if ( $pro_licensed && has_action('maa_render_estrat_tab') ) {
                  // Com licença PRO válida, renderiza o módulo PRO
                  do_action('maa_render_estrat_tab');
              } else {
                  // Sem licença: cartão simples com CTA
                  $cta = self::pro_cta();
                  echo '<div class="card">
                          <h3 style="margin:0 0 8px;">Estrategista de conteúdos</h3>
                          <p class="hint">Gere clusters, briefings e um grafo de linkagem interna para aumentar sua autoridade temática no Google.</p>
                          <a class="button button-primary" href="'.esc_url($cta['url']).'" target="_blank" rel="noopener">'.esc_html($cta['label']).'</a>
                        </div>';
              }
            ?>
          </section>
          <?php endif; ?>
        </div>
        <?php
        echo '</div>';
    }

    /** ---------- Assets ---------- */
    public static function enqueue_assets($hook) {
        // Detecta a tela do gerador (submenu "maa-main")
        $is_mass_page = false;

        if ( function_exists('get_current_screen') ) {
            $screen = get_current_screen();
            if ( $screen && strpos($screen->id, 'maa-main') !== false ) $is_mass_page = true;
        }
        if ( isset($_GET['page']) && $_GET['page'] === 'maa-main' ) $is_mass_page = true;
        if ( strpos((string)$hook, 'maa-main') !== false ) $is_mass_page = true;

        if ( ! $is_mass_page ) return;

        // CSS externo (sempre)
        wp_enqueue_style(
            'maa-mass-css',
            plugins_url('maa-mass.css', __FILE__),
            [],
            MAA_AutoArticles::VERSION
        );

        // JS só na aba "manual" (fila visível)
        $active = isset($_GET['sub']) ? sanitize_key($_GET['sub']) : 'manual';
        if ($active !== 'manual') return;

        wp_register_script('maa-mass-js', false, ['wp-api-fetch','wp-data'], MAA_AutoArticles::VERSION, true);
        wp_enqueue_script('maa-mass-js');

        // Prompt padrão e status PRO
        $default_prompt = '';
        if (class_exists('MAA_AutoArticles') && method_exists('MAA_AutoArticles','load_main_prompt')) {
            $default_prompt = (string) MAA_AutoArticles::load_main_prompt();
        }
        $pro_active = false;
        if (function_exists('maa_pro_is_license_active')) $pro_active = (bool) call_user_func('maa_pro_is_license_active');
        $pro_active = (bool) apply_filters('maa_pro_license_is_active', $pro_active);

        wp_localize_script('maa-mass-js', 'MAA_MASS', [
            'nonce'           => wp_create_nonce('wp_rest'),
            'restGenerateOne' => esc_url_raw(rest_url(MAA_AutoArticles::REST_NS . '/mass/generate_one')),
            'restInbox'       => esc_url_raw(rest_url(MAA_AutoArticles::REST_NS . '/mass/inbox')),
            'maxBatch'        => self::MAX,
            'defaultPrompt'   => $default_prompt,
            'proActive'       => $pro_active ? 1 : 0,
            'restInboxClear' => esc_url_raw(rest_url(MAA_AutoArticles::REST_NS . '/mass/inbox/clear')),
        ]);

        $inline = <<<JS
(function(wp){
  if(!wp || !wp.apiFetch) return;
  try { wp.apiFetch.use( wp.apiFetch.createNonceMiddleware( MAA_MASS.nonce ) ); } catch(e){}

  const STORAGE_KEY = 'MAA_QUEUE_V1';
  const q = (id)=>document.getElementById(id);
  const setText=(id,t)=>{ const el=q(id); if(el) el.textContent=t; };
  const addLog=(id,line)=>{ const el=q(id); if(!el) return; if(!el.textContent || el.querySelector('em')) el.textContent=''; el.textContent = (el.textContent||'') + (el.textContent?'\\n':'') + line; };

  let QUEUE = [];
  let HISTORY = [];
  const MAX = MAA_MASS.maxBatch;

  // ---------- Provider & modelos (TEXTO) ----------
  const MODELS_BY_PROVIDER = {
  gemini: [
      {v:'gemini-2.5-flash-lite',             label:'gemini-2.5-flash-lite'},
      {v:'gemini-2.5-flash',                  label:'gemini-2.5-flash'},
      {v:'gemini-2.5-pro',                    label:'gemini-2.5-pro'},
      {v:'gemini-2.5-flash-preview-09-2025',  label:'gemini-2.5-flash-preview-09-2025'},
      {v:'gemini-3-pro-preview',              label:'gemini-3-pro-preview'}
  ],
  openai: [
      {v:'gpt-5-mini',    label:'gpt-5-mini'},
      {v:'gpt-5',         label:'gpt-5'},
      {v:'gpt-5-nano',    label:'gpt-5-nano'},
      {v:'gpt-4.1',       label:'gpt-4.1'},
      {v:'gpt-4.1-mini',  label:'gpt-4.1-mini'},
      {v:'gpt-4.1-nano',  label:'gpt-4.1-nano'},
      {v:'gpt-4o',        label:'gpt-4o'}
  ]
};

  // ---------- Modelos de IMAGEM (espelhando módulo de imagens) ----------
  const IMG_MODELS = {
    openai: [
      { v:'gpt-image-1', label:'gpt-image-1 (1536×1024)' },
      { v:'dall-e-3',    label:'DALL·E 3 (1792×1024)' }
    ],
    gemini: [
      { v:'gemini-3-pro-image-preview',    label:'Gemini 3 Pro Image (preview)' },
      { v:'imagen-4.0-generate-001',       label:'Imagen 4 – generate' },
      { v:'imagen-4.0-ultra-generate-001', label:'Imagen 4 – ultra' },
      { v:'imagen-4.0-fast-generate-001',  label:'Imagen 4 – fast' },
      { v:'imagen-3.0-generate-002',       label:'Imagen 3' }
    ]
  };

  function populateModels(provider){
    var sel = q('maa-model');
    if(!sel) return;
    var list = MODELS_BY_PROVIDER[provider] || [];
    sel.innerHTML = '';
    list.forEach(function(m){
      var opt = document.createElement('option');
      opt.value = m.v; opt.textContent = m.label;
      sel.appendChild(opt);
    });
    if(provider==='gemini'){ sel.value = 'gemini-2.5-flash-lite'; }
  }

  function setProvider(p){
    const hidden = q('maa-provider');
    const g = q('prov-gemini'); const o = q('prov-openai');
    if(hidden) hidden.value = p;
    if(g && o){
      g.setAttribute('aria-pressed', String(p==='gemini'));
      o.setAttribute('aria-pressed', String(p==='openai'));
    }
    populateModels(p);
  }

  // ---------- Imagens: helpers ----------
  function populateImgModels(provider){
    var sel = q('maa-img-model');
    if(!sel) return;
    sel.innerHTML = '';
    var list = IMG_MODELS[provider] || IMG_MODELS.gemini;
    list.forEach(function(m){
      var opt = document.createElement('option');
      opt.value = m.v;
      opt.textContent = m.label;
      sel.appendChild(opt);
    });
    if(provider==='gemini'){ sel.value = 'imagen-4.0-generate-001'; }
    if(provider==='openai'){ sel.value = 'gpt-image-1'; }
    populateImgQuality(provider, sel.value);
  }

  function populateImgQuality(provider, model){
    var wrap  = q('maa-img-quality-wrap');
    var sel   = q('maa-img-quality');
    var title = q('maa-img-quality-title');
    if(!wrap || !sel || !title) return;

    if(provider === 'gemini'){
      wrap.style.display = 'none';
      sel.innerHTML = '';
      return;
    }

    wrap.style.display = 'block';
    sel.innerHTML = '';
    var opts = [];

    if(model === 'gpt-image-1'){
      title.textContent = 'Qualidade (gpt-image-1)';
      opts = [
        {v:'low',    t:'Low'},
        {v:'medium', t:'Medium'},
        {v:'high',   t:'High'}
      ];
    } else if(model === 'dall-e-3'){
      title.textContent = 'Qualidade (DALL·E 3)';
      opts = [
        {v:'standard', t:'Standard'},
        {v:'hd',       t:'HD'}
      ];
    } else {
      title.textContent = 'Qualidade';
    }

    opts.forEach(function(o){
      var op = document.createElement('option');
      op.value = o.v;
      op.textContent = o.t;
      sel.appendChild(op);
    });
    if(sel.options.length){ sel.value = sel.options[0].value; }
  }

  function setImgMode(mode){
    const hidden = q('maa-img-mode');
    const noneBtn = q('maa-img-none');
    const aiBtn   = q('maa-img-ai');
    const cfg     = q('maa-img-config');
    if(hidden) hidden.value = mode;
    if(noneBtn && aiBtn){
      noneBtn.setAttribute('aria-pressed', String(mode==='none'));
      aiBtn.setAttribute('aria-pressed', String(mode==='ai'));
    }
    if(cfg) cfg.style.display = (mode==='ai') ? 'block' : 'none';
  }

  // --- Prompt personalizado (UI) + inicialização ---
  document.addEventListener('DOMContentLoaded', function(){
    setProvider(q('maa-provider')?.value || 'gemini');

    // eventos dos botões de provider de TEXTO
    const btnGem = q('prov-gemini');
    const btnOai = q('prov-openai');
    if(btnGem){
      btnGem.addEventListener('click', function(ev){ ev.preventDefault(); setProvider('gemini'); });
    }
    if(btnOai){
      btnOai.addEventListener('click', function(ev){ ev.preventDefault(); setProvider('openai'); });
    }

    // Imagens: estado inicial
    setImgMode('none');
    const imgProvSel = q('maa-img-provider');
    if(imgProvSel){
      populateImgModels(imgProvSel.value || 'gemini');
      imgProvSel.addEventListener('change', function(){
        populateImgModels(this.value || 'gemini');
      });
    }
    const imgModelSel = q('maa-img-model');
    if(imgModelSel){
      imgModelSel.addEventListener('change', function(){
        const prov = (q('maa-img-provider')||{value:'gemini'}).value || 'gemini';
        populateImgQuality(prov, this.value);
      });
    }
    const imgNone = q('maa-img-none');
    const imgAi   = q('maa-img-ai');
    if(imgNone){
      imgNone.addEventListener('click', function(ev){ ev.preventDefault(); setImgMode('none'); });
    }
    if(imgAi){
      imgAi.addEventListener('click', function(ev){ ev.preventDefault(); setImgMode('ai'); });
    }

    // fila armazenada e inbox
    loadQueueFromStorage();
    importInboxAndMerge();

    // Prompt default + bloqueio PRO
    const chk = q('mass-use-custom-prompt');
    const ta  = q('mass-custom-prompt');
    const pro = Number(MAA_MASS.proActive) === 1;
    const msg = q('mass-pro-msg');
    if(ta && typeof MAA_MASS.defaultPrompt === 'string'){ ta.value = MAA_MASS.defaultPrompt; }
    if(chk){
      if(!pro){
        chk.disabled = true;
        if(msg) msg.style.display='block';
      }
      chk.addEventListener('change', ()=>{ if(ta) ta.style.display = chk.checked ? 'block' : 'none'; });
    }
  });

  // ---------- Inbox do servidor ----------  
async function clearServerInbox(){
  return wp.apiFetch({ url: MAA_MASS.restInboxClear, method:'POST' });
}




  
  async function importInboxAndMerge(){
  try{
    const url = MAA_MASS.restInbox + '?drain=1';
    const inbox = await wp.apiFetch({ url, method:'GET' });

    if(Array.isArray(inbox) && inbox.length){
      const seen = new Set(
        (QUEUE || []).map(it => it && it._hash ? String(it._hash) : '').filter(Boolean)
      );

      let added = 0;

      inbox.forEach(function(p){
        const h = p && p._hash ? String(p._hash) : '';
        if(h && seen.has(h)) return;

        if(p && p.type === 'youtube_transcript'){
          QUEUE.push({
            _hash: h,
            type: 'youtube_transcript',
            title: p.title || ('YouTube ' + (p.video_id||'')),
            video_url: p.video_url || '',
            video_id: p.video_id || '',
            srt_url: p.srt_url || '',
            srt_path: p.srt_path || '',
            kw: ''
          });
          if(h) seen.add(h);
          added++;
        } else if (p && p.type === 'manual') {
          QUEUE.push({
            _hash: h,
            type: 'manual',
            pauta: p.pauta || '',
            fonte: p.fonte || '',
            kw: (p.kw || p.palavra_chave_alvo || '')
          });
          if(h) seen.add(h);
          added++;
        }
      });

      renderQueue();
      saveQueueToStorage();
      addLog('maa-log','✔ Inbox importada: '+added+' novo(s).');
    }
  }catch(e){
    addLog('maa-log','✖ Falha ao importar inbox: ' + (e?.message || String(e)));
  }
}


  // ---------- Persistência ----------  
  function saveQueueToStorage(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(QUEUE)); }catch(e){}
  }
  function loadQueueFromStorage(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const arr = JSON.parse(raw);
        if(Array.isArray(arr)){ QUEUE = arr; }
      }
    }catch(e){}
    renderQueue();
  }
 async function resetQueue(){
  QUEUE = [];
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  try{
    await clearServerInbox();
    addLog('maa-log','🧹 Inbox do servidor limpa.');
  }catch(err){
    addLog('maa-log','⚠️ Falha ao limpar inbox do servidor: ' + (err?.message || String(err)));
  }
  renderQueue();
}


  // ---------- Ações ----------  
  document.addEventListener('click', async (e)=>{
  const btnSave  = e.target.closest('#maa-save-queue');
  const btnReset = e.target.closest('#maa-reset-queue');

  if(btnSave){
    e.preventDefault();
    saveQueueToStorage();
    alert('Fila salva com sucesso.');
    return;
  }

  if(btnReset){
    e.preventDefault();
    if(confirm('Tem certeza que deseja resetar a fila?')){
      await resetQueue(); // agora é async
    }
    return;
  }
});


  // Adicionar Pauta (manual)
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='maa-add-pauta'){
      e.preventDefault();
      const pauta = (q('maa-pauta')||{}).value || '';
      const fonte = (q('maa-fonte')||{}).value || '';
      if(!pauta && !fonte){ alert('Informe pelo menos a pauta ou a fonte.'); return; }
      if(QUEUE.length >= MAX){ alert('Limite de '+MAX+' itens por execução.'); return; }
      QUEUE.push({ type:'manual', pauta, fonte, kw: '' });
      renderQueue();
      if(q('maa-pauta')) q('maa-pauta').value='';
      if(q('maa-fonte')) q('maa-fonte').value='';
      saveQueueToStorage();
    }
  });

  // Remover item
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.classList.contains('maa-q-remove')){
      e.preventDefault();
      const idx = parseInt(e.target.getAttribute('data-idx'),10);
      if(!isNaN(idx)){ QUEUE.splice(idx,1); renderQueue(); saveQueueToStorage(); }
    }
  });

  // Atualizar palavra-chave por item (input dinâmico)
  document.addEventListener('input', (e)=>{
    if(e.target && e.target.classList.contains('maa-kw')){
      const idx = parseInt(e.target.getAttribute('data-idx'),10);
      if(!isNaN(idx) && QUEUE[idx]){
        QUEUE[idx].kw = e.target.value || '';
        saveQueueToStorage();
      }
    }
  });

  // ---------- Iniciar geração ----------  
  document.addEventListener('click', async (e)=>{
    if(e.target && e.target.id==='maa-start'){
      e.preventDefault();
      if(!QUEUE.length){ alert('Adicione itens à fila.'); return; }
      if(QUEUE.length > MAX){ alert('Limite de '+MAX+' itens por execução.'); return; }

      const estilo   = (q('maa-estilo')||{}).value || 'conteudo_viral_padrao';
      const provider = (q('maa-provider')||{}).value || 'gemini';
      const model    = (q('maa-model')||{}).value    || (provider==='gemini' ? 'gemini-2.5-flash-lite' : 'gpt-5-mini');

      // Globais
      const idioma  = (q('maa-idioma')?.value  || 'pt-BR').trim();
      const pais    = (q('maa-pais')?.value    || 'Brasil').trim();

      // Imagens
      const imgMode    = (q('maa-img-mode')||{}).value || 'none';
      const imgProv    = (q('maa-img-provider')||{}).value || 'gemini';
      const imgModel   = (q('maa-img-model')||{}).value || (imgProv==='gemini' ? 'imagen-4.0-generate-001' : 'gpt-image-1');
      const imgQuality = (q('maa-img-quality')||{}).value || '';
      const postStatus = (q('maa-post-status')||{}).value || 'draft';

      // Custom prompt (PRO)
      const useCustom    = (q('mass-use-custom-prompt')||{}).checked || false;
      const customPrompt = (q('mass-custom-prompt')||{}).value || '';
      const dataExtra    = {};
      if(useCustom && customPrompt.trim()!==''){ dataExtra.custom_prompt = customPrompt; }

      if(q('maa-progress')) q('maa-progress').style.display='block';
      setText('maa-done','0'); setText('maa-total', String(QUEUE.length)); setText('maa-left', String(QUEUE.length));
      setText('maa-run-status','Processando… não feche esta página.');

      let done = 0;
      for(let i=0;i<QUEUE.length;i++){
        const item = QUEUE[i];
        const stamp = new Date().toLocaleString();
        try{
          const res = await wp.apiFetch({
            url: MAA_MASS.restGenerateOne,
            method:'POST',
            data:Object.assign({
              item,
              estilo,
              provider,
              model,
              idioma,
              pais,
              // palavra-chave ALVO por item:
              palavra_chave_alvo: (item.kw||'').trim(),
              // imagens
              img_mode:    imgMode,
              img_provider: imgProv,
              img_model:    imgModel,
              img_quality:  imgQuality,
              // status final
              post_status: postStatus
            }, dataExtra)
          });
          done++; setText('maa-done', String(done)); setText('maa-left', String(QUEUE.length - done));
          addLog('maa-log','✔ '+(res.title||'Post')+' (ID '+(res.post_id||'?')+') criado.');
          HISTORY.unshift({ts: stamp, status:'ok', title: (res.title||'Post'), post_id: res.post_id||null});
          renderHistory();
        }catch(err){
          done++; setText('maa-done', String(done)); setText('maa-left', String(QUEUE.length - done));
          const msg = (err && err.message) ? err.message : 'erro desconhecido';
          addLog('maa-log','✖ Falha: '+msg);
          const t = (item.title||item.pauta||'') ? (item.title||item.pauta||'').slice(0,140) : 'Sem título';
          HISTORY.unshift({ts: stamp, status:'err', title: t, error: msg});
          renderHistory();
        }
        paintProgress();
      }
      setText('maa-run-status','Concluído. Revise os artigos gerados no painel de posts.');
    }
  });

  // ---------- Renderização ----------  
  function renderQueue(){
    const box = q('maa-queue');
    if(!box) return;
    if(!QUEUE.length){ box.innerHTML = '<div class="q-empty">Fila vazia.</div>'; return; }

    let html = '';
    QUEUE.forEach((it,i)=>{
      const kwInput =
        '<div class="q-footer" style="margin-top:8px;">' +
          '<label style="display:block;margin-bottom:6px;">Palavra-chave alvo (opcional)</label>' +
          '<input type="text" class="maa-yt-input maa-kw" data-idx="'+i+'" ' +
          'value="'+escapeHtml(it.kw||'')+'" placeholder="ex.: iPhone 16 Pro">' +
        '</div>';

      if(it.type === 'youtube_transcript'){
        const title = it.title ? it.title : ('YouTube '+(it.video_id||''));
        const meta  = (it.video_url||'') + (it.srt_url ? '\\nSRT: '+it.srt_url : '');
        html += '<div class="q-card" id="maa-li-'+i+'">'+
                  '<div class="q-head">'+
                    '<div class="q-title"><span class="badge">YOUTUBE</span> '+escapeHtml(title)+'</div>'+
                    '<div class="q-actions"><a href="#" class="maa-q-remove" data-idx="'+i+'">remover</a></div>'+
                  '</div>'+
                  '<div class="q-body">'+ (meta ? escapeHtml(meta) : '<em>Sem metadados.</em>') +'</div>'+
                  kwInput +
                '</div>';
      } else {
        const title = (it.pauta && it.pauta.trim()) ? it.pauta.trim() : (it.fonte||'').slice(0,120);
        const fonte = (it.fonte||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        html += '<div class="q-card" id="maa-li-'+i+'">'+
                  '<div class="q-head">'+
                    '<div class="q-title"><span class="badge">MANUAL</span> '+escapeHtml(title)+'</div>'+
                    '<div class="q-actions"><a href="#" class="maa-q-remove" data-idx="'+i+'">remover</a></div>'+
                  '</div>'+
                  '<div class="q-body">'+ (fonte ? fonte : '<em>Sem conteúdo de fonte.</em>') +'</div>'+
                  kwInput +
                '</div>';
      }
    });
    box.innerHTML = html;
  }

  function renderHistory(){
    const box = q('maa-history');
    if(!box) return;
    if(!HISTORY.length){ box.innerHTML = '<em>Nenhuma execução ainda.</em>'; return; }
    let lines = HISTORY.map(h=>{
      if(h.status==='ok'){
        const pid = h.post_id ? ' (ID '+h.post_id+')' : '';
        return '<div class="ok">🟢 ['+h.ts+'] Sucesso: '+escapeHtml(h.title)+pid+'</div>';
      } else {
        return '<div class="err">🔴 ['+h.ts+'] Falha: '+escapeHtml(h.title)+' — '+escapeHtml(h.error||'')+'</div>';
      }
    });
    box.innerHTML = lines.join('');
  }

  function paintProgress(){
    var inner = q('maa-progressbar-inner');
    if(!inner) return;
    var d = parseInt((q('maa-done')||{}).textContent||'0',10);
    var t = parseInt((q('maa-total')||{}).textContent||'0',10);
    var pct = (!t?0:Math.min(100, Math.round(d*100/t)));
    inner.style.width = pct + '%';
    inner.setAttribute('aria-valuenow', pct);
  }

  function escapeHtml(s){ return (String(s||'')).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

})(window.wp);
JS;
        wp_add_inline_script('maa-mass-js', $inline, 'after');
    }

    /** ---------- REST ---------- */
    public static function register_rest_routes() {
        // Gera 1 rascunho com base no item da fila
        register_rest_route(MAA_AutoArticles::REST_NS, '/mass/generate_one', [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_generate_one'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args'     => [
                'item'               => ['type'=>'object','required'=>true],
                'estilo'             => ['type'=>'string','required'=>true],
                'provider'           => ['type'=>'string','required'=>false],
                'model'              => ['type'=>'string','required'=>true],
                'idioma'             => ['type'=>'string','required'=>false],
                'pais'               => ['type'=>'string','required'=>false],
                'palavra_chave_alvo' => ['type'=>'string','required'=>false],
                'custom_prompt'      => ['type'=>'string','required'=>false],
                'img_mode'           => ['type'=>'string','required'=>false],
                'img_provider'       => ['type'=>'string','required'=>false],
                'img_model'          => ['type'=>'string','required'=>false],
                'img_quality'        => ['type'=>'string','required'=>false],
                'post_status'        => ['type'=>'string','required'=>false],
            ]
        ]);

register_rest_route(MAA_AutoArticles::REST_NS, '/mass/inbox/clear', [
  'methods'  => 'POST',
  'callback' => function(){ MAA_Mass_Generator::drain_inbox(); return new \WP_REST_Response(['ok'=>true], 200); },
  'permission_callback' => function(){ return current_user_can('edit_posts'); },
]);

        // Inbox de itens vindos de outros módulos — leitura e drenagem
        register_rest_route(MAA_AutoArticles::REST_NS, '/mass/inbox', [
            'methods'  => 'GET',
            'callback' => [__CLASS__, 'rest_inbox'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args'     => [
                'drain' => ['type'=>'boolean','required'=>false],
            ]
        ]);
    }

    /** GET /mass/inbox — retorna itens da inbox; se drain=1, esvazia após retornar */
    public static function rest_inbox(\WP_REST_Request $req) {
        $drain = (bool) $req->get_param('drain');
        $items = $drain ? self::drain_inbox() : self::peek_inbox();
        return new \WP_REST_Response($items, 200);
    }

    /** POST /mass/generate_one — gera 1 post com base no item da fila */
    public static function rest_generate_one(\WP_REST_Request $req) {
        $item     = $req->get_param('item');
        $estilo   = sanitize_text_field($req->get_param('estilo')   ?: 'conteudo_viral_padrao');
        $provider = sanitize_text_field($req->get_param('provider') ?: 'gemini');
        $model    = sanitize_text_field($req->get_param('model')    ?: ($provider==='gemini' ? 'gemini-2.5-flash-lite' : 'gpt-5-mini'));
        $idioma   = sanitize_text_field($req->get_param('idioma') ?: 'pt-BR');
        $pais     = sanitize_text_field($req->get_param('pais')   ?: 'Brasil');
        $keyword  = sanitize_text_field($req->get_param('palavra_chave_alvo') ?: '');
        $custom   = $req->get_param('custom_prompt');
        $custom   = is_string($custom) ? trim( (string) wp_kses_post( $custom ) ) : '';

        $img_mode     = sanitize_key( $req->get_param('img_mode') ?: 'none' );
        $img_provider = sanitize_text_field( $req->get_param('img_provider') ?: 'gemini' );
        $img_model    = sanitize_text_field( $req->get_param('img_model') ?: '' );
        $img_quality  = sanitize_text_field( $req->get_param('img_quality') ?: '' );
        $post_status  = sanitize_key( $req->get_param('post_status') ?: 'draft' );

        if ( ! in_array( $post_status, ['draft','publish','pending'], true ) ) {
            $post_status = 'draft';
        }
        if ( $img_mode !== 'ai' ) {
            $img_mode = 'none';
        }

        if ($img_provider === 'gemini' && $img_model === '') {
            $img_model = 'imagen-4.0-generate-001';
        } elseif ($img_provider === 'openai' && $img_model === '') {
            $img_model = 'gpt-image-1';
        }

        if (!is_array($item)) return new \WP_Error('bad_item','Item inválido.', ['status'=>400]);

        // Bloqueio PRO para custom prompt
        if ($custom !== '' && ! self::has_pro_license()) {
            return new \WP_Error('pro_only','Prompt personalizado exige licença PRO ativa.', ['status'=>403]);
        }

        $type = isset($item['type']) ? sanitize_key($item['type']) : 'manual';

        // ---------- Normalização de entrada conforme o tipo ----------
        $pauta = '';
        $fonte = '';

        if ($type === 'youtube_transcript') {
            // Recebido do módulo YouTube PRO
            $title    = isset($item['title'])     ? sanitize_text_field($item['title']) : '';
            $srt_path = isset($item['srt_path'])  ? sanitize_text_field($item['srt_path']) : '';
            $srt_url  = isset($item['srt_url'])   ? esc_url_raw($item['srt_url']) : '';
            $video_id = isset($item['video_id'])  ? sanitize_text_field($item['video_id']) : '';
            $video_url= isset($item['video_url']) ? esc_url_raw($item['video_url']) : '';

            $pauta = $title ?: ('YouTube ' . ($video_id ?: ''));
            $srt_content = '';

            // 1) tenta path local
            if ($srt_path && file_exists($srt_path) && is_readable($srt_path)) {
                $srt_content = @file_get_contents($srt_path);
            }
            // 2) tenta URL
            if (!$srt_content && $srt_url) {
                $resp = wp_remote_get($srt_url, ['timeout'=>20]);
                if (!is_wp_error($resp) && wp_remote_retrieve_response_code($resp) === 200) {
                    $srt_content = wp_remote_retrieve_body($resp);
                }
            }

            if (!$srt_content) {
                return new \WP_Error('no_srt', 'Não foi possível ler a legenda SRT para este item.', ['status'=>400]);
            }

            $fonte = self::srt_to_text($srt_content);
            if (!$fonte) {
                return new \WP_Error('srt_to_txt_fail', 'Falha ao converter SRT em texto.', ['status'=>500]);
            }

        } else {
            // MANUAL (ou outros tipos simples, incluindo Estrategista)
            $pauta = sanitize_textarea_field($item['pauta'] ?? '');
            $fonte = wp_kses_post($item['fonte'] ?? '');
            if (!$pauta && !$fonte) return new \WP_Error('missing','Informe pelo menos a pauta ou a fonte.', ['status'=>400]);
        }

        // ---------- Prompt do artigo ----------
        $prompt_tpl = ($custom !== '')
            ? $custom
            : ( method_exists('MAA_AutoArticles','load_main_prompt')
                ? MAA_AutoArticles::load_main_prompt()
                : (method_exists('MAA_AutoArticles','sample_main_prompt') ? MAA_AutoArticles::sample_main_prompt() : '') );

        $map = [
            '{{pauta}}'              => $pauta,
            '{{fonte_conteudo1}}'    => $fonte,
            '{{fonte_conteudo2}}'    => '',
            '{{fonte_conteudo3}}'    => '',
            '{{estilo}}'             => $estilo,

            // palavra-chave (duas chaves por compatibilidade)
            '{{palavra_chave_alvo}}' => $keyword,
            '{{palavra-chave-alvo}}' => $keyword,

            // novos do prompt
            '{{idioma}}'             => $idioma,
            '{{pais}}'               => $pais,
        ];

        $user_prompt   = strtr($prompt_tpl, $map);

        $s = MAA_AutoArticles::get_settings();
        $system_prompt = $s['system_prompt'];

        // ---------- Roteamento: Gemini x OpenAI (ARTIGO) ----------
        if ($provider === 'gemini' || stripos($model, 'gemini') === 0) {
            if (!class_exists('MAA_Gemini_Module')) {
                return new \WP_Error('gemini_module_missing', 'Módulo Gemini não encontrado (module-gemini.php).', ['status'=>500]);
            }
            $resp = MAA_Gemini_Module::call(
                $model,
                $system_prompt,
                $user_prompt,
                [ 'temperature'=>0.7, 'topP'=>0.95, 'topK'=>40 ]
            );
            if (is_wp_error($resp)) return $resp;
            $text = $resp;

        } else {
            // -------- OpenAI --------
            $api_key = MAA_AutoArticles::decrypt_from_storage($s['openai_key_enc'] ?? '');
            if (!$api_key) return new \WP_Error('no_api_key', 'Configure sua OpenAI API Key em MAA → Configurações ou selecione Gemini.', ['status'=>400]);

            $payload = [
                'model'    => $model,
                'messages' => [
                    [ 'role'=>'system', 'content'=> $system_prompt ],
                    [ 'role'=>'user',   'content'=> $user_prompt ],
                ],
            ];

            $response = wp_remote_post('https://api.openai.com/v1/chat/completions', [
                'headers'=>[
                    'Authorization' => 'Bearer ' . $api_key,
                    'Content-Type'  => 'application/json',
                ],
                'timeout'=> 90,
                'body'   => wp_json_encode($payload),
            ]);

            if (is_wp_error($response)) return new \WP_Error('openai_request_failed', $response->get_error_message(), ['status'=>500]);
            $code = wp_remote_retrieve_response_code($response);
            $body = wp_remote_retrieve_body($response);
            if ($code<200 || $code>=300) return new \WP_Error('openai_http_error','Erro da API OpenAI: '.$body,['status'=>$code]);

            $data = json_decode($body,true);
            $text = $data['choices'][0]['message']['content'] ?? '';
            if (!$text) return new \WP_Error('openai_empty','Resposta vazia da OpenAI.',['status'=>500]);
        }

        // ---------- Parse e criação do post ----------
        $parsed = self::parse_ai_output($text);
        $title  = $parsed['title'] ?: ($pauta ?: 'Rascunho');

        $html   = $parsed['content_html'] ?: $parsed['raw'];

        $post_id = wp_insert_post([
            'post_type'   => 'post',
            'post_status' => $post_status,
            'post_title'  => wp_strip_all_tags($title),
            'post_content'=> $html,
        ], true);
        if (is_wp_error($post_id)) return new \WP_Error('post_err', $post_id->get_error_message(), ['status'=>500]);

        // ---------- Imagem de destaque com IA (opcional) ----------
        $img_info   = null;
        $img_prompt = '';

        if ( $img_mode === 'ai' && class_exists('MAA_PRO_Image_Module') ) {
            // 1) gera um prompt de imagem via IA de TEXTO (Gemini 2.5-flash-lite ou gpt-5-nano)
            $img_prompt = self::generate_image_prompt_via_ai( $pauta, $fonte, $provider );
            if ( $img_prompt ) {
                try {
                    $req_img = new \WP_REST_Request( 'POST', '/' . MAA_PRO_Image_Module::REST_NS . '/generate' );
                    $req_img->set_param( 'post_id',  $post_id );
                    $req_img->set_param( 'prompt',   $img_prompt );
                    $req_img->set_param( 'keyword',  $keyword );
                    if ( $img_quality ) {
                        $req_img->set_param( 'quality', $img_quality );
                    }
                    $req_img->set_param( 'provider', $img_provider );
                    $req_img->set_param( 'model',    $img_model );

                    $res_img = MAA_PRO_Image_Module::rest_generate( $req_img );
                    if ( ! is_wp_error( $res_img ) && $res_img instanceof \WP_REST_Response ) {
                        $img_info = $res_img->get_data();
                    }
                } catch ( \Throwable $e ) {
                    // silencioso – falha em imagem não impede o post
                }
            }
        }

        $resp_data = [
            'post_id' => $post_id,
            'title'   => get_the_title($post_id),
        ];
        if ( $img_info ) {
            $resp_data['image']        = $img_info;
            $resp_data['image_prompt'] = $img_prompt;
        }

        return new \WP_REST_Response($resp_data, 200);
    }

    /**
     * Gera automaticamente um prompt de imagem (capa horizontal para Discover)
     * usando a IA de texto (Gemini 2.5-flash-lite OU OpenAI gpt-5-nano),
     * com base na pauta e na fonte.
     */
    protected static function generate_image_prompt_via_ai( $pauta, $fonte, $provider_for_prompt ) {
        $pauta = wp_strip_all_tags( (string) $pauta );
        $fonte_plain = wp_strip_all_tags( (string) $fonte );

        // Limita o tamanho do contexto para evitar estourar tokens
        if ( function_exists('mb_substr') ) {
            $fonte_plain = mb_substr( $fonte_plain, 0, 4000 );
        } else {
            $fonte_plain = substr( $fonte_plain, 0, 4000 );
        }

        $base_prompt = <<<PROMPT
Você é um diretor de arte especializado em capas para portais de notícias e Google Discover.

Com base na pauta e no conteúdo abaixo, crie APENAS um prompt de imagem, em português, para ser usado em um gerador de imagens de IA.

Regras fundamentais:
- A imagem deve ser horizontal, proporção 16:9, em alta resolução, ideal para capas de notícias e Google Discover.
- Não pode haver NENHUM texto escrito na imagem (sem frases, manchetes, legendas ou palavras em placas).
- Foque em uma única cena principal clara, com poucos elementos, visualmente forte e fácil de entender em miniatura.
- Descreva o enquadramento, o cenário, os elementos principais, a iluminação e o clima da cena.
- Não explique o que está fazendo, apenas forneça a descrição da cena.

Pauta / ideia central:
"{$pauta}"

Trecho de referência do conteúdo:
"{$fonte_plain}"

Agora responda apenas com o prompt da imagem, em um único parágrafo contínuo.
PROMPT;

        $provider_for_prompt = ($provider_for_prompt === 'gemini') ? 'gemini' : 'openai';

        if ( $provider_for_prompt === 'gemini' ) {
            if ( ! class_exists( 'MAA_Gemini_Module' ) ) {
                return '';
            }
            $model = 'gemini-2.5-flash-lite';
            $resp  = MAA_Gemini_Module::call(
                $model,
                '',
                $base_prompt,
                [ 'temperature' => 0.9, 'topP' => 0.95, 'topK' => 40 ]
            );
            if ( is_wp_error( $resp ) ) {
                return '';
            }
            return trim( (string) $resp );
        }

        // OpenAI — usa sempre gpt-5-nano para esse job de prompt
        $settings = MAA_AutoArticles::get_settings();
        $api_key  = MAA_AutoArticles::decrypt_from_storage( $settings['openai_key_enc'] ?? '' );
        if ( ! $api_key ) {
            return '';
        }

        $payload = [
            'model'    => 'gpt-5-nano',
            'messages' => [
                [
                    'role'    => 'system',
                    'content' => 'Você é um diretor de arte especializado em capas de notícias para Google Discover. Sempre responda apenas com a descrição da cena da imagem, sem explicações extras.'
                ],
                [
                    'role'    => 'user',
                    'content' => $base_prompt,
                ],
            ],
        ];

        $response = wp_remote_post(
            'https://api.openai.com/v1/chat/completions',
            [
                'headers' => [
                    'Authorization' => 'Bearer ' . $api_key,
                    'Content-Type'  => 'application/json',
                ],
                'timeout' => 60,
                'body'    => wp_json_encode( $payload ),
            ]
        );
        if ( is_wp_error( $response ) ) {
            return '';
        }
        $code = wp_remote_retrieve_response_code( $response );
        $body = wp_remote_retrieve_body( $response );
        if ( $code < 200 || $code >= 300 ) {
            return '';
        }
        $data = json_decode( $body, true );
        $txt  = $data['choices'][0]['message']['content'] ?? '';
        return trim( (string) $txt );
    }

    /**
     * Remove tags de idioma (pt-BR, en-US, es-ES etc.) no INÍCIO de uma string.
     * Cobre casos como:
     * - "pt-BR>Cuidar da saúde..."
     * - "pt-BR: Cuidar da saúde..."
     * - "<p>pt-BR></p><h2>..."
     */
    protected static function clean_leading_language_tag( $str ) {
        if ( ! is_string( $str ) || $str === '' ) {
            return $str;
        }

        // Remove espaços iniciais
        $str = ltrim( $str );

        // Caso 1: <p>pt-BR></p> logo no começo
        $str = preg_replace(
            '/^<p>\s*([a-z]{2}-[A-Z]{2})\s*[>\:\-\–—]?\s*<\/p>\s*/u',
            '',
            $str,
            1
        );

        // Remove espaços de novo
        $str = ltrim( $str );

        // Caso 2: "pt-BR>", "pt-BR:", "pt-BR -" solto no início
        $str = preg_replace(
            '/^([a-z]{2}-[A-Z]{2})\s*[>\:\-\–—]?\s*/u',
            '',
            $str,
            1
        );

        // Espaços finais do corte
        return ltrim( $str );
    }

    /** ---------- Parser ---------- */
    protected static function parse_ai_output($text) {
        $clean = trim($text);
        $clean = preg_replace('/^```(json)?/i','', $clean);
        $clean = preg_replace('/```$/','', $clean);

        $out = ['title'=>'','subtitle'=>'','content_html'=>'','raw'=>$text];

        $json = json_decode($clean,true);
        if (json_last_error()!==JSON_ERROR_NONE) {
            $start = strpos($clean,'{');
            $end   = strrpos($clean,'}');
            if ($start!==false && $end!==false && $end>$start) {
                $maybe = substr($clean,$start,$end-$start+1);
                $json  = json_decode($maybe,true);
            }
        }

        if (is_array($json) && json_last_error()===JSON_ERROR_NONE) {
            // Pega bruto
            $title    = isset($json['title'])        ? (string) $json['title']        : '';
            $subtitle = isset($json['subtitle'])     ? (string) $json['subtitle']     : '';
            $content  = isset($json['content_html']) ? (string) $json['content_html'] : '';

            // LIMPA "pt-BR>", "en-US>", etc no início de cada campo
            $title    = self::clean_leading_language_tag( $title );
            $subtitle = self::clean_leading_language_tag( $subtitle );
            $content  = self::clean_leading_language_tag( $content );

            // Sanitiza pra WordPress
            $out['title']        = wp_strip_all_tags( $title );
            $out['subtitle']     = wp_strip_all_tags( $subtitle );
            $out['content_html'] = wp_kses_post( $content );

        } else {
            // Fallback textual: ainda assim limpamos possível tag de idioma no início
            $text_clean = self::clean_leading_language_tag( (string) $text );
            $out['content_html'] = '<p>'. esc_html( $text_clean ) .'</p>';
        }

        return $out;
    }

    /** ---------- Licença PRO helper ---------- */
    protected static function has_pro_license(){
        $ok = false;
        if (function_exists('maa_pro_is_license_active')) $ok = (bool) call_user_func('maa_pro_is_license_active');
        return (bool) apply_filters('maa_pro_license_is_active', $ok);
    }

    /** CTA dinâmico (ativar licença se PRO instalado, senão ir para upgrade) */
    protected static function pro_cta(): array {
        $upgrade = class_exists('MAA_AutoArticles')
            ? apply_filters('maa_pro_upgrade_url', MAA_AutoArticles::PRO_URL)
            : 'https://pay.hotmart.com/T102395674U?off=wwxwlcr1&bid=1761078243584';

        $pro_inst = class_exists('MAA_AutoArticles') ? MAA_AutoArticles::is_pro_active() : false;
        $licensed = class_exists('MAA_AutoArticles') ? MAA_AutoArticles::is_pro_license_active() : false;

        if ($pro_inst && ! $licensed) {
            $license_url = apply_filters('maa_pro_license_page_url', admin_url('admin.php?page=maa-pro-license'));
            return ['url' => $license_url, 'label' => 'Ativar licença PRO'];
        }
        return ['url' => $upgrade, 'label' => 'Conheça o plano PRO'];
    }
}

MAA_Mass_Generator::init();

/**
 * Função global para enfileirar payloads externamente.
 * Qualquer módulo (YouTube, Estrategista, etc.) pode chamar diretamente.
 */
if (!function_exists('maa_mass_enqueue')) {
    function maa_mass_enqueue($payload) {
        return MAA_Mass_Generator::enqueue_server($payload);
    }
}

endif;
