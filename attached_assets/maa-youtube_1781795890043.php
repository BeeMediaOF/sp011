<?php
/**
 * MAA PRO — Geração via Vídeo (YouTube) — via youtube-transcript.io
 * v3.6.0 — Fluxo: URL -> Baixar Transcrição -> (Inserir/gerar pauta) -> Gerar Artigo
 * Novidades 3.6.0:
 * - Prompt personalizado (checkbox + textarea com aviso ⚠ Avançado)
 * - Envio opcional de custom_prompt para a rota /yt/generate_article
 * - Backend usa o custom_prompt quando presente; caso contrário, usa o prompt padrão
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('MAA_Youtube_Pro')):

final class MAA_Youtube_Pro {
    const VERSION         = '3.6.0';
    const ACTION_SAVEKEY  = 'maa_youtube_savekey';
    const UP_SUBDIR       = 'maa-youtube';
    const NOTICE_KEY_BASE = 'maa_yt_notice_';
    const API_ENDPOINT    = 'https://www.youtube-transcript.io/api/transcripts';
    const OPT_API_TOKEN   = 'maa_yt_api_token';
    const USER_META_CACHE = 'maa_yt_cached_transcript';

    // REST
    const REST_NS          = 'maa/v1';
    const R_FETCH_TRANSCR  = '/yt/fetch_transcript';
    const R_GEN_PAUTAS     = '/yt/generate_pautas';
    const R_GEN_ARTIGO     = '/yt/generate_article';
    const R_CLEAR_TRANSCR  = '/yt/clear_transcript';
    const R_FETCH_TRANSCR_AUX = '/yt/fetch_transcript_aux';


    public static function init() {
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_assets']);
        add_action('admin_post_' . self::ACTION_SAVEKEY, [__CLASS__, 'handle_save_key']);
        add_action('rest_api_init', [__CLASS__, 'register_rest']);
        add_action('maa_render_video_tab', [__CLASS__, 'render'], 1);
    }

    /** =================== UI =================== */
    public static function render() {
        if (!self::has_license()) {
            if (class_exists('MAA_Youtube_Demo')) return MAA_Youtube_Demo::render();
            return self::render_locked_fallback();
        }

        $notice    = self::pull_notice();
        $api_token = get_option(self::OPT_API_TOKEN, '');

        $cache = self::cache_get();
        $cached_txt  = $cache['txt']      ?? '';
        $cached_url  = $cache['srt_url']  ?? '';
        $cached_vid  = $cache['video_id'] ?? '';

        $has_trans = !empty($cached_txt);
        ?>
        <div class="maa3">
            <div class="header">
                <h2>Geração via vídeo (YouTube)</h2>
                <span class="chip">Sem fila • 1 por vez</span>
            </div>

            <?php if ($notice): ?>
            <div class="card" style="border-color:<?php echo $notice['type']==='ok'?'#c7f0d7':'#fecaca'; ?>; background:#fff;">
                <p style="margin:0; color:<?php echo $notice['type']==='ok'?'#065f46':'#991b1b'; ?>;">
                    <?php echo esc_html($notice['msg']); ?>
                </p>
            </div>
            <?php endif; ?>

            <div class="grid-top" style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <!-- Configurar API -->
                <div class="card">
                    <h3 style="margin:0 0 8px;">Configurar API</h3>
                    <form action="<?php echo esc_url(admin_url('admin-post.php')); ?>" method="post">
                        <?php wp_nonce_field(self::ACTION_SAVEKEY); ?>
                        <input type="hidden" name="action" value="<?php echo esc_attr(self::ACTION_SAVEKEY); ?>">
                        <label for="maa_yt_api_token">Chave (API Token) — youtube-transcript.io</label>
                        <input type="password" id="maa_yt_api_token" name="maa_yt_api_token" class="maa-yt-input" placeholder="cole aqui seu token" value="<?php echo esc_attr($api_token); ?>" autocomplete="off">
                        <p class="hint" style="margin-top:6px;">
  Uso gratuito: <strong>25 usos gratuitos por mês</strong> — 
  <a href="https://www.youtube-transcript.io/profile" target="_blank" rel="noopener">
    clique aqui para pegar sua chave API grátis
  </a>.
</p>

                        <div class="maa-yt-actions"><button class="btn" type="submit">Salvar chave</button></div>
                    </form>
                </div>

                <!-- Como usar -->
                <div class="card">
                    <h3 style="margin:0 0 8px;">Como usar</h3>
                    <ol style="margin:0 0 10px 18px; color:#334155;">
                        <li>Salve sua <strong>chave da API</strong> acima.</li>
                        <li>Cole a <strong>URL do vídeo do YouTube</strong> e clique em <strong>Baixar transcrição/legenda</strong>.</li>
                        <li>Com a transcrição visível, escolha <strong>Inserir pauta</strong> ou <strong>Gerar pautas</strong> (3 sugestões).</li>
                        <li>Selecione a <strong>IA / modelo</strong> e o <strong>estilo</strong> e clique em <strong>Gerar artigo</strong>.</li>
                        <li>O artigo é criado como <strong>rascunho</strong> e a transcrição continua disponível para reaproveitar.</li>
                    </ol>
                    <div class="maa-yt-tip"><span>ℹ️</span> A transcrição fica armazenada localmente (por usuário) para evitar gastar a API novamente.</div>
                </div>
            </div>

            <!-- URL + Baixar transcrição -->
            <div class="card">
                <label for="maa_yt_url">URL do YouTube</label>
                <input type="url" id="maa_yt_url" class="maa-yt-input" placeholder="https://www.youtube.com/watch?v=..." required>

                <div class="row-inline mt-12">
                    <button id="maa_yt_btn_fetch" class="btn">Baixar transcrição/legenda</button>
                    <span id="maa_yt_status_fetch" class="hint"></span>
                </div>
            </div>

            <!-- TRANSCRIÇÃO -->
            <div class="card" id="card-trans" style="<?php echo $has_trans?'':'display:none;'; ?>">
                <div class="yt-transcript-head">
                    <div>
                        <label>Transcrição atual <small id="yt-trans-meta"><?php echo $cached_vid ? esc_html('• vídeo: '.$cached_vid) : ''; ?></small></label>
                        <p class="hint">Ela é reaproveitada nos próximos passos. Baixar de outra URL substitui este conteúdo.</p>
                    </div>
                    <div class="mini-actions">
                        <a id="yt-btn-copy" href="#" class="btn xs">Copiar</a>
                        <a id="yt-btn-download" href="<?php echo esc_url($cached_url ?: '#'); ?>" class="btn xs<?php echo $cached_url?'':' is-disabled'; ?>" target="_blank" rel="noopener">Baixar .srt</a>
                        <a id="yt-btn-clear" href="#" class="btn xs danger">Remover</a>
                    </div>
                </div>
                <textarea id="yt-transcript" rows="10" class="yt-textarea" placeholder="Nenhuma transcrição ainda."><?php echo esc_textarea($cached_txt); ?></textarea>
            </div>

            <!-- PAUTA + IA: só habilita depois que houver transcrição -->
            <div id="card-pautas-artigo" style="<?php echo $has_trans?'':'display:none;'; ?>">
                <div class="card">
                    <!-- Modo de pauta -->
                    <label>Como definir a pauta?</label>
                    <div class="seg" role="tablist" aria-label="Modo de pauta">
                        <button type="button" id="mode-insert"  aria-pressed="true">Inserir pauta</button>
                        <button type="button" id="mode-suggest" aria-pressed="false">Gerar pautas</button>
                    </div>

                    <!-- Inserir pauta -->
                    <div id="box-insert" class="mt-12">
                        <label for="maa_yt_pauta_manual">Pauta</label>
                        <textarea id="maa_yt_pauta_manual" rows="3" placeholder="Ex.: 5 aprendizados deste vídeo sobre..."></textarea>
                    </div>

                    <!-- Gerar pautas -->
                    <div id="box-suggest" class="mt-12" style="display:none;">
                        <div class="grid-top" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div>
                                <label>IA para Pautas</label>
                                <div class="seg" role="tablist" aria-label="Seleção de IA para pautas">
                                    <button type="button" id="provp-gemini" aria-pressed="true">Gemini (Google)</button>
                                    <button type="button" id="provp-openai" aria-pressed="false">OpenAI</button>
                                </div>
                                <input type="hidden" id="maa-pp-provider" value="gemini" />
                                <label for="maa-pp-model" class="mt-8">Modelo (pautas)</label>
                                <select id="maa-pp-model"></select>
                                <label class="mt-8" style="display:flex;gap:8px;align-items:center;">
                                    <input type="checkbox" id="sync-ai" />
                                    <span>Usar a mesma IA do artigo para sugerir pautas</span>
                                </label>
                            </div>
                            <div>
                                <label>&nbsp;</label>
                                <div class="row-inline">
                                    <button id="maa_yt_btn_pautas" class="btn">Gerar pautas</button>
                                    <span id="maa_yt_status" class="hint"></span>
                                </div>
                            </div>
                        </div>

                        <div id="maa_yt_pautas_box" class="mt-14" style="display:none;">
                            <label>Escolha uma pauta</label>
                            <div id="maa_yt_pautas_list" class="q-list"></div>
                        </div>
                    </div>
                </div>

                <div class="card" id="card-extras" style="<?php echo $has_trans?'':'display:none;'; ?>">
  <label>Fontes adicionais (opcional)</label>
  <p class="hint" style="margin-top:4px;">Você pode adicionar até <strong>2</strong> fontes extras: colar um texto ou transcrever outro vídeo do YouTube. Elas preencherão <code>{{fonte_conteudo2}}</code> e <code>{{fonte_conteudo3}}</code>.</p>

  <div class="row-inline mt-8">
    <button id="btn-add-source" class="btn">+ Adicionar fonte</button>
    <span id="extras-status" class="hint"></span>
  </div>

  <div id="extras-editor" class="mt-12" style="display:none; border:1px dashed var(--line); padding:12px; border-radius:8px;">
    <div class="seg" role="tablist" aria-label="Tipo de fonte">
      <button type="button" id="src-type-text"   aria-pressed="true">Colar texto</button>
      <button type="button" id="src-type-video"  aria-pressed="false">Outro vídeo</button>
    </div>

    <div id="src-box-text" class="mt-10">
      <label for="extra-textarea">Texto da fonte</label>
      <textarea id="extra-textarea" rows="6" placeholder="Cole aqui o texto da fonte adicional..."></textarea>
    </div>

    <div id="src-box-video" class="mt-10" style="display:none;">
      <label for="extra-video-url">URL do YouTube</label>
      <input type="url" id="extra-video-url" class="maa-yt-input" placeholder="https://www.youtube.com/watch?v=...">
      <div class="row-inline mt-8">
        <button id="btn-fetch-extra" class="btn">Transcrever vídeo</button>
        <span id="extra-fetch-status" class="hint"></span>
      </div>
      <textarea id="extra-video-text" rows="6" class="mt-8" placeholder="A transcrição aparecerá aqui (editável)."></textarea>
    </div>

    <div class="row-inline mt-10">
      <button id="btn-confirm-extra" class="btn primary">Adicionar à lista</button>
      <button id="btn-cancel-extra" class="btn">Cancelar</button>
    </div>
  </div>

  <div id="extras-list" class="mt-12">
    <em class="hint">Nenhuma fonte extra adicionada.</em>
  </div>
</div>


                <!-- IA/estilo para ARTIGO -->
                <div class="card">
                    <div class="grid-top" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <label for="maa-estilo">Estilo</label>
                            <select id="maa-estilo">
                                <option value="conteudo_viral_padrao">Conteúdo viral padrão</option>
                                <option value="jornalistico">Jornalístico</option>
                                <option value="artigo_blog">Artigo de blog</option>
                                <option value="noticia_curta">Notícia curta</option>
                                <option value="review">Review</option>
                                <option value="nota">Nota</option>
                            </select>
                        </div>
                        <div>
                            <label>IA para Artigo</label>
                            <div class="seg" role="tablist" aria-label="Seleção de IA">
                                <button type="button" id="prov-gemini" aria-pressed="true">Gemini (Google)</button>
                                <button type="button" id="prov-openai" aria-pressed="false">OpenAI</button>
                            </div>
                            <input type="hidden" id="maa-provider" value="gemini" />
                            <label for="maa-model" class="mt-8">Modelo (artigo)</label>
                            <select id="maa-model"></select>
                        </div>
                    </div>

                    <!-- Prompt personalizado -->
                    <div class="mt-12" id="yt-adv-wrap">
                        <label style="display:flex;align-items:center;gap:8px;">
                            <input type="checkbox" id="yt-use-custom-prompt" />
                            <span><strong>Usar prompt personalizado</strong> <small style="color:#a00;">— ⚠ Avançado: use com cuidado; pode causar erro na geração.</small></span>
                        </label>
                        <textarea id="yt-custom-prompt" rows="10" style="width:100%;margin-top:8px;display:none;"></textarea>
                    </div>

                    <div class="row-inline mt-12">
                        <button id="maa_yt_btn_artigo" class="btn primary">Gerar artigo</button>
                        <span id="maa_yt_status2" class="hint"></span>
                    </div>
                </div>
            </div>

            <div class="card">
                <label>Histórico desta sessão</label>
                <div id="maa_yt_history" class="history"><em>Nenhuma execução ainda.</em></div>
            </div>
        </div>
        <?php
    }

    /** =================== Assets =================== */
    public static function enqueue_assets($hook) {
        $is_page = isset($_GET['page']) && $_GET['page'] === 'maa-main' && (isset($_GET['sub']) ? $_GET['sub']==='video' : true);
        if (!$is_page) return;

        wp_enqueue_style('maa-youtube-pro', plugin_dir_url(__FILE__) . 'maa-youtube.css', [], self::VERSION);
        wp_register_script('maa-yt-js', false, ['wp-api-fetch'], self::VERSION, true);
        wp_enqueue_script('maa-yt-js');

        // Carrega o prompt padrão do núcleo
        $default_prompt = '';
        if (class_exists('MAA_AutoArticles') && method_exists('MAA_AutoArticles','load_main_prompt')) {
            $default_prompt = (string) MAA_AutoArticles::load_main_prompt();
        }

        wp_localize_script('maa-yt-js', 'MAA_YT', [
            'nonce'        => wp_create_nonce('wp_rest'),
            'restFetch'    => esc_url_raw( rest_url(self::REST_NS . self::R_FETCH_TRANSCR) ),
            'restPautas'   => esc_url_raw( rest_url(self::REST_NS . self::R_GEN_PAUTAS) ),
            'restArtigo'   => esc_url_raw( rest_url(self::REST_NS . self::R_GEN_ARTIGO) ),
            'restClear'    => esc_url_raw( rest_url(self::REST_NS . self::R_CLEAR_TRANSCR) ),
            'restFetchAux' => esc_url_raw( rest_url(self::REST_NS . self::R_FETCH_TRANSCR_AUX) ),
            'defaultPrompt'=> $default_prompt,
        ]);

        $inline = <<<'JS'
(function(wp){
  if(!wp || !wp.apiFetch) return;
  try { wp.apiFetch.use( wp.apiFetch.createNonceMiddleware(MAA_YT.nonce) ); } catch(e){}

  const q = (id)=>document.getElementById(id);
  const set=(id,t)=>{ const el=q(id); if(el) el.textContent=t; };
  const hist=q('maa_yt_history');

  // Modelos
  const MODELS = {
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

  // Provider/modelos helpers
  function setProvider(selId, btnGemId, btnOpenId, hiddenId, def){
    const hidden=q(hiddenId), sel=q(selId);
    return function(p){
      if(hidden) hidden.value=p;
      const g=document.getElementById(btnGemId), o=document.getElementById(btnOpenId);
      if(g && o){ g.setAttribute('aria-pressed', String(p==='gemini')); o.setAttribute('aria-pressed', String(p==='openai')); }
      if(sel){
        sel.innerHTML='';
        (MODELS[p]||[]).forEach(m=>{ const opt=document.createElement('option'); opt.value=m.v; opt.textContent=m.label; sel.appendChild(opt); });
        if(p==='gemini') sel.value = def || 'gemini-2.5-flash-lite';
      }
    };
  }
  const setProvPautas = setProvider('maa-pp-model','provp-gemini','provp-openai','maa-pp-provider','gemini-2.5-flash-lite');
  const setProvArtigo = setProvider('maa-model','prov-gemini','prov-openai','maa-provider','gemini-2.5-flash-lite');

  function showAfterTranscript(){
    const ct=q('card-trans'); const pa=q('card-pautas-artigo');
    if(ct) ct.style.display='block';
    if(pa) pa.style.display='block';
    setProvPautas('gemini'); setProvArtigo('gemini');
  }

  function hasTranscript(){
    const area=q('yt-transcript');
    return !!(area && area.value && area.value.trim().length);
  }

  function cleanErr(e){
    const raw = (e && e.message) ? e.message : 'falha desconhecida';
    const tmp = document.createElement('div'); tmp.innerHTML = String(raw);
    return (tmp.textContent || tmp.innerText || raw);
  }

  // Toggle prompt personalizado
  document.addEventListener('DOMContentLoaded', function(){
    const chk = q('yt-use-custom-prompt');
    const ta  = q('yt-custom-prompt');
    if(ta && typeof MAA_YT.defaultPrompt === 'string'){ ta.value = MAA_YT.defaultPrompt; }
    if(chk && ta){
      chk.addEventListener('change', ()=>{ ta.style.display = chk.checked ? 'block' : 'none'; });
    }
  });

document.addEventListener('DOMContentLoaded', function(){
  setProvPautas('gemini'); setProvArtigo('gemini');
  renderExtras();
  const sync=q('sync-ai');
  if(sync) sync.addEventListener('change', ()=>{ if(sync.checked) setProvPautas((q('maa-provider')||{}).value || 'gemini'); });
});


  // Delegação
  document.addEventListener('click', (ev)=>{
    const id = ev.target && ev.target.id ? ev.target.id : '';

    if(id==='provp-gemini'){ ev.preventDefault(); setProvPautas('gemini'); }
    if(id==='provp-openai'){ ev.preventDefault(); setProvPautas('openai'); }

    if(id==='prov-gemini'){ ev.preventDefault(); setProvArtigo('gemini'); if(q('sync-ai')?.checked) setProvPautas('gemini'); }
    if(id==='prov-openai'){ ev.preventDefault(); setProvArtigo('openai'); if(q('sync-ai')?.checked) setProvPautas('openai'); }

    if(id==='mode-insert'){
      ev.preventDefault();
      q('mode-insert').setAttribute('aria-pressed','true');
      q('mode-suggest').setAttribute('aria-pressed','false');
      q('box-insert').style.display='block';
      q('box-suggest').style.display='none';
    }
    if(id==='mode-suggest'){
      ev.preventDefault();
      q('mode-suggest').setAttribute('aria-pressed','true');
      q('mode-insert').setAttribute('aria-pressed','false');
      q('box-insert').style.display='none';
      q('box-suggest').style.display='block';
    }

    if(id==='yt-btn-copy'){
      ev.preventDefault();
      const area=q('yt-transcript'); if(!area) return;
      area.select(); try{ document.execCommand('copy'); ev.target.textContent='Copiado!'; setTimeout(()=>ev.target.textContent='Copiar',1200);}catch(e){}
    }
    if(id==='yt-btn-clear'){
      ev.preventDefault();
      (async ()=>{
        try{
          await wp.apiFetch({ url: MAA_YT.restClear, method:'POST' });
          const area=q('yt-transcript'); if(area) area.value='';
          const meta=q('yt-trans-meta'); if(meta) meta.textContent='';
          const aDl=q('yt-btn-download'); if(aDl){ aDl.classList.add('is-disabled'); aDl.setAttribute('href','#'); }
          q('card-pautas-artigo').style.display='none';
        }catch(e){}
      })();
    }
  });

  document.addEventListener('DOMContentLoaded', function(){
    setProvPautas('gemini'); setProvArtigo('gemini');

    const sync=q('sync-ai');
    if(sync) sync.addEventListener('change', ()=>{ if(sync.checked) setProvPautas((q('maa-provider')||{}).value || 'gemini'); });
  });

  // Baixar transcrição
  document.addEventListener('click', async (e)=>{
    if(e.target && e.target.id==='maa_yt_btn_fetch'){
      e.preventDefault();
      const url = (q('maa_yt_url')||{}).value||'';
      if(!url){ alert('Cole a URL do vídeo.'); return; }
      set('maa_yt_status_fetch','Baixando…');
      try{
        const res = await wp.apiFetch({ url: MAA_YT.restFetch, method:'POST', data:{ url } });
        if(res.transcript_text){ const area=q('yt-transcript'); if(area) area.value=res.transcript_text; }
        const meta=q('yt-trans-meta'); if(meta) meta.textContent = res.video_id ? ('• vídeo: ' + res.video_id) : '';
        const aDl=q('yt-btn-download'); if(aDl){ if(res.srt_url){ aDl.classList.remove('is-disabled'); aDl.setAttribute('href', res.srt_url); } else { aDl.classList.add('is-disabled'); aDl.setAttribute('href','#'); } }
        showAfterTranscript();
        set('maa_yt_status_fetch','Pronto! Transcrição carregada.');
      }catch(err){
        set('maa_yt_status_fetch', 'Erro: '+cleanErr(err));
      }
    }
  });

  // Gerar pautas (usa cache)
  document.addEventListener('click', async (e)=>{
    if(e.target && e.target.id==='maa_yt_btn_pautas'){
      e.preventDefault();
      if(!hasTranscript()){ alert('Baixe a transcrição do vídeo primeiro.'); return; }
      const provider_pautas = (q('maa-pp-provider')||{}).value || 'gemini';
      const model_pautas    = (q('maa-pp-model')||{}).value    || (provider_pautas==='gemini'?'gemini-2.5-flash-lite':'gpt-5-mini');
      set('maa_yt_status','Processando…');
      q('maa_yt_pautas_box').style.display='none';
      try{
        const res = await wp.apiFetch({ url: MAA_YT.restPautas, method:'POST', data:{ provider_pautas, model_pautas } });
        const pautas = Array.isArray(res.pautas) ? res.pautas : [];
        if(!pautas.length) throw new Error('Nenhuma pauta sugerida.');
        const list = q('maa_yt_pautas_list'); list.innerHTML='';
        pautas.forEach((p,i)=>{
          const id='pauta_'+i;
          const wrap=document.createElement('div');
          wrap.className='q-card';
          wrap.innerHTML = '<label style="display:flex; gap:8px; align-items:flex-start;">'+
                             '<input type="radio" name="maa_yt_pauta" id="'+id+'" value="'+escapeHtml(p)+'" '+(i===0?'checked':'')+' />'+
                             '<span>'+escapeHtml(p)+'</span>'+
                           '</label>';
          list.appendChild(wrap);
        });
        q('maa_yt_pautas_box').style.display='block';
        set('maa_yt_status','Pronto. Escolha uma pauta.');
      }catch(err){
        set('maa_yt_status', 'Erro: '+cleanErr(err));
      }
    }
  });

  // Gerar artigo (usa cache)
  document.addEventListener('click', async (e)=>{
    if(e.target && e.target.id==='maa_yt_btn_artigo'){
      e.preventDefault();
      if(!hasTranscript()){ alert('Baixe a transcrição do vídeo primeiro.'); return; }

      let pauta = (q('box-insert').style.display!=='none') ? (q('maa_yt_pauta_manual')||{}).value||'' : '';
      if(!pauta){
        const radio = document.querySelector('input[name="maa_yt_pauta"]:checked');
        pauta = radio ? radio.value : '';
      }
      if(!pauta){ alert('Informe ou escolha uma pauta.'); return; }

      const estilo   = (q('maa-estilo')||{}).value || 'conteudo_viral_padrao';
      const provider = (q('maa-provider')||{}).value || 'gemini';
      const model    = (q('maa-model')||{}).value || (provider==='gemini'?'gemini-2.5-flash-lite':'gpt-5-mini');

      const useCustom = (q('yt-use-custom-prompt')||{}).checked || false;
      const customPrompt = (q('yt-custom-prompt')||{}).value || '';

      set('maa_yt_status2','Gerando rascunho…');
      try{
        const data = { pauta, estilo, provider, model };
        if(useCustom && customPrompt.trim()!==''){ data.custom_prompt = customPrompt; }
        // inclui fontes extras (até 2)
if (Array.isArray(EXTRA_SOURCES) && EXTRA_SOURCES.length) {
  // só enviamos o .text
  data.extra_sources = EXTRA_SOURCES.slice(0,2).map(x => x.text || '');
}

        
        const res = await wp.apiFetch({ url: MAA_YT.restArtigo, method:'POST', data });
        
        const line = '🟢 Rascunho criado: '+escapeHtml(res.title||'Post')+' (ID '+(res.post_id||'?')+')';
        if(hist){ if(hist.querySelector('em')) hist.innerHTML=''; hist.innerHTML = '<div class="ok">'+line+'</div>' + hist.innerHTML; }
        set('maa_yt_status2','Concluído! Revise em Posts → Todos os Posts.');
      }catch(err){
        const msg = cleanErr(err);
        if(hist){ if(hist.querySelector('em')) hist.innerHTML=''; hist.innerHTML = '<div class="err">🔴 Erro: '+escapeHtml(msg)+'</div>' + hist.innerHTML; }
        set('maa_yt_status2','Erro: '+msg);
      }
    }
  });

  function escapeHtml(s){ return (String(s||'')).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
// ===== Fontes adicionais =====
const EXTRAS_LIMIT = 2;
let EXTRA_SOURCES = []; // cada item: { type: 'text'|'video', text: '...' }

function renderExtras() {
  const box = document.getElementById('extras-list');
  const status = document.getElementById('extras-status');
  if (!box) return;

  if (!EXTRA_SOURCES.length) {
    box.innerHTML = '<em class="hint">Nenhuma fonte extra adicionada.</em>';
  } else {
    box.innerHTML = EXTRA_SOURCES.map((src, idx) => {
      const preview = escapeHtml((src.text || '').slice(0, 220)) + (src.text.length > 220 ? '…' : '');
      const tag = src.type === 'video' ? '🎬 Vídeo' : '📝 Texto';
      return `
        <div class="q-card" style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;">
          <div><strong>${tag}</strong><div class="hint" style="margin-top:4px;max-width:720px;white-space:pre-wrap;">${preview}</div></div>
          <button data-rm="${idx}" class="btn xs danger">Remover</button>
        </div>
      `;
    }).join('');
  }

  // feedback/disable
  if (status) status.textContent = EXTRA_SOURCES.length >= EXTRAS_LIMIT ? 'Limite máximo de 2 fontes atingido.' : '';
  const addBtn = document.getElementById('btn-add-source');
  if (addBtn) addBtn.disabled = EXTRA_SOURCES.length >= EXTRAS_LIMIT;

  // attach remove
  box.querySelectorAll('button[data-rm]').forEach(b=>{
    b.addEventListener('click', (ev)=>{
      const i = parseInt(ev.currentTarget.getAttribute('data-rm'),10);
      if (!isNaN(i)) {
        EXTRA_SOURCES.splice(i,1);
        renderExtras();
      }
    });
  });
}

document.addEventListener('click', (ev)=>{
  const id = ev.target && ev.target.id ? ev.target.id : '';

  if (id === 'btn-add-source') {
    ev.preventDefault();
    if (EXTRA_SOURCES.length >= EXTRAS_LIMIT) return;
    const ed = document.getElementById('extras-editor');
    if (ed) ed.style.display = 'block';
  }

  if (id === 'btn-cancel-extra') {
    ev.preventDefault();
    const ed = document.getElementById('extras-editor');
    if (ed) ed.style.display = 'none';
  }

  if (id === 'src-type-text') {
    ev.preventDefault();
    document.getElementById('src-type-text').setAttribute('aria-pressed','true');
    document.getElementById('src-type-video').setAttribute('aria-pressed','false');
    document.getElementById('src-box-text').style.display='block';
    document.getElementById('src-box-video').style.display='none';
  }

  if (id === 'src-type-video') {
    ev.preventDefault();
    document.getElementById('src-type-video').setAttribute('aria-pressed','true');
    document.getElementById('src-type-text').setAttribute('aria-pressed','false');
    document.getElementById('src-box-text').style.display='none';
    document.getElementById('src-box-video').style.display='block';
  }

  if (id === 'btn-fetch-extra') {
    ev.preventDefault();
    const url = (document.getElementById('extra-video-url')||{}).value || '';
    const st  = document.getElementById('extra-fetch-status');
    if (!url) { alert('Cole a URL do vídeo.'); return; }
    if (st) st.textContent = 'Transcrevendo…';
    (async ()=>{
      try{
        const res = await wp.apiFetch({ url: MAA_YT.restFetchAux, method:'POST', data:{ url } });
        const area = document.getElementById('extra-video-text');
        if (area && res && res.transcript_text) area.value = res.transcript_text;
        if (st) st.textContent = 'OK. Você pode editar antes de adicionar.';
      }catch(e){
        if (st) st.textContent = 'Erro: ' + cleanErr(e);
      }
    })();
  }

  if (id === 'btn-confirm-extra') {
    ev.preventDefault();
    if (EXTRA_SOURCES.length >= EXTRAS_LIMIT) return;

    const isVideo = document.getElementById('src-type-video').getAttribute('aria-pressed') === 'true';
    let text = '';
    if (isVideo) {
      text = (document.getElementById('extra-video-text')||{}).value || '';
    } else {
      text = (document.getElementById('extra-textarea')||{}).value || '';
    }
    text = (text||'').trim();
    if (!text) { alert('A fonte está vazia.'); return; }

    EXTRA_SOURCES.push({ type: isVideo ? 'video' : 'text', text });
    // reset UI
    const ed = document.getElementById('extras-editor');
    if (ed) ed.style.display = 'none';
    if (document.getElementById('extra-textarea')) document.getElementById('extra-textarea').value='';
    if (document.getElementById('extra-video-url')) document.getElementById('extra-video-url').value='';
    if (document.getElementById('extra-video-text')) document.getElementById('extra-video-text').value='';
    renderExtras();
  }
});

// injeta as extras no POST de geração
(function hookGenerateWithExtras(){
  const origHandler = document.addEventListener;
})();

// PATCH no envio do "Gerar artigo": adicione pouco antes de chamar wp.apiFetch(...)

})(window.wp);
JS;
        wp_add_inline_script('maa-yt-js', $inline, 'after');
    }

    /** =================== REST =================== */
    public static function register_rest() {
        // 1) Baixar transcrição (salva cache)
        register_rest_route(self::REST_NS, self::R_FETCH_TRANSCR, [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_fetch_transcript'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => [
                'url' => ['type'=>'string','required'=>true],
            ]
        ]);

        // 1b) Baixar transcrição auxiliar (NÃO salva no cache principal)
register_rest_route(self::REST_NS, self::R_FETCH_TRANSCR_AUX, [
    'methods'  => 'POST',
    'callback' => [__CLASS__, 'rest_fetch_transcript_aux'],
    'permission_callback' => function(){ return current_user_can('edit_posts'); },
    'args' => [
        'url' => ['type'=>'string','required'=>true],
    ]
]);

        // 2) Sugerir pautas (usa SOMENTE cache)
        register_rest_route(self::REST_NS, self::R_GEN_PAUTAS, [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_generate_pautas'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => [
                'provider_pautas'  => ['type'=>'string','required'=>false],
                'model_pautas'     => ['type'=>'string','required'=>false],
            ]
        ]);

        // 3) Gerar artigo (usa SOMENTE cache)
        register_rest_route(self::REST_NS, self::R_GEN_ARTIGO, [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_generate_artigo'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => [
                'pauta'          => ['type'=>'string','required'=>true],
                'estilo'         => ['type'=>'string','required'=>true],
                'provider'       => ['type'=>'string','required'=>false],
                'model'          => ['type'=>'string','required'=>true],
                'custom_prompt'  => ['type'=>'string','required'=>false],
            ]
        ]);

        // 4) Limpar cache
        register_rest_route(self::REST_NS, self::R_CLEAR_TRANSCR, [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_clear_transcript'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
        ]);
    }

public static function rest_fetch_transcript_aux(\WP_REST_Request $req) {
    $url = esc_url_raw($req->get_param('url') ?: '');
    if (!$url) return new \WP_Error('no_url','Informe a URL do vídeo.',['status'=>400]);

    $video_id  = self::parse_video_id($url);
    if (!$video_id) return new \WP_Error('bad_url','URL de YouTube inválida.',['status'=>400]);

    $api_token = trim((string) get_option(self::OPT_API_TOKEN, ''));
    if ($api_token === '') return new \WP_Error('no_api','Configure sua chave da API primeiro.',['status'=>400]);

    $resp = self::call_api_transcript($api_token, $video_id);
    if (!$resp['ok']) {
        $msg = ($resp['code']===429) ? 'Limite da API atingido. Tente em alguns segundos.' : 'Falha ao consultar a API (HTTP '.$resp['code'].').';
        return new \WP_Error('api_fail', $msg, ['status'=>500]);
    }

    $srt = self::normalize_to_srt($resp['body'], $video_id, 'single');
    if (!$srt && !empty($resp['raw']) && is_string($resp['raw'])) $srt = self::build_srt_single_block($resp['raw']);
    if (!$srt) return new \WP_Error('srt_empty','Não foi possível interpretar a transcrição.',['status'=>500]);

    $txt = self::srt_to_text($srt);
    if (!$txt) return new \WP_Error('txt_empty','Falha ao converter a transcrição.',['status'=>500]);

    // Restringe o payload só ao necessário
    $txt_short = function_exists('mb_substr') ? mb_substr($txt, 0, 80000) : substr($txt, 0, 80000);

    return new \WP_REST_Response([
        'video_id'        => $video_id,
        'transcript_text' => $txt_short,
    ], 200);
}


    /** --------- REST impls ---------- */
    public static function rest_fetch_transcript(\WP_REST_Request $req) {
        $url = esc_url_raw($req->get_param('url') ?: '');
        if (!$url) return new \WP_Error('no_url','Informe a URL do vídeo.',['status'=>400]);

        $video_id  = self::parse_video_id($url);
        if (!$video_id) return new \WP_Error('bad_url','URL de YouTube inválida.',['status'=>400]);

        $api_token = trim((string) get_option(self::OPT_API_TOKEN, ''));
        if ($api_token === '') return new \WP_Error('no_api','Configure sua chave da API primeiro.',['status'=>400]);

        // Chama API
        $resp = self::call_api_transcript($api_token, $video_id);
        if (!$resp['ok']) {
            $msg = ($resp['code']===429) ? 'Limite da API atingido. Tente em alguns segundos.' : 'Falha ao consultar a API (HTTP '.$resp['code'].').';
            return new \WP_Error('api_fail', $msg, ['status'=>500]);
        }

        // Normaliza SRT e texto
        $srt = self::normalize_to_srt($resp['body'], $video_id, 'single');
        if (!$srt && !empty($resp['raw']) && is_string($resp['raw'])) $srt = self::build_srt_single_block($resp['raw']);
        if (!$srt) return new \WP_Error('srt_empty','Não foi possível interpretar a transcrição.',['status'=>500]);

        $txt = self::srt_to_text($srt);
        if (!$txt) return new \WP_Error('txt_empty','Falha ao converter a transcrição.',['status'=>500]);

        // Persiste arquivo e cache
        $dir  = self::uploads_dir();
        $path = trailingslashit($dir).sanitize_file_name(($video_id?:'yt') . '-' . time() . '.srt');
        file_put_contents($path, $srt);
        $srt_url = trailingslashit(self::uploads_url()) . basename($path);

        self::cache_set([
            'video_id' => $video_id,
            'srt_path' => $path,
            'srt_url'  => $srt_url,
            'txt'      => $txt,
            'ts'       => time(),
        ]);

        $txt_short = function_exists('mb_substr') ? mb_substr($txt, 0, 80000) : substr($txt, 0, 80000);

return new \WP_REST_Response([
    'video_id'        => $video_id,
    'srt_path'        => $path,
    'srt_url'         => $srt_url,
    'transcript_text' => $txt_short,
], 200);
    }

    public static function rest_generate_pautas(\WP_REST_Request $req) {
        // Somente cache
        $prov  = sanitize_text_field($req->get_param('provider_pautas') ?: 'gemini');
        $model = sanitize_text_field($req->get_param('model_pautas')    ?: ($prov==='gemini'?'gemini-2.5-flash-lite':'gpt-5-mini'));

        $cache = self::cache_get();
        $txt = (string)($cache['txt'] ?? '');
        if ($txt === '') return new \WP_Error('no_cache','Baixe a transcrição do vídeo primeiro.',['status'=>400]);

        $pautas = self::suggest_pautas($txt, $prov, $model);
        if (is_wp_error($pautas)) return $pautas;

        return new \WP_REST_Response([
            'video_id'        => $cache['video_id'] ?? '',
            'pautas'          => $pautas,
            'transcript_text' => $txt,
            'srt_url'         => $cache['srt_url'] ?? '',
        ], 200);
    }

    public static function rest_generate_artigo(\WP_REST_Request $req) {
        // Somente cache
        $pauta    = sanitize_text_field($req->get_param('pauta') ?: '');
        $estilo   = sanitize_text_field($req->get_param('estilo') ?: 'conteudo_viral_padrao');
        $provider = sanitize_text_field($req->get_param('provider') ?: 'gemini');
        $model    = sanitize_text_field($req->get_param('model') ?: ($provider==='gemini' ? 'gemini-2.5-flash-lite' : 'gpt-5-mini'));
        $custom   = $req->get_param('custom_prompt');
        $custom   = is_string($custom) ? trim( (string) wp_kses_post( $custom ) ) : '';
        $extras = $req->get_param('extra_sources');
$extras = is_array($extras) ? array_values(array_filter($extras, 'strlen')) : [];
// Sanitiza e limita a 2
$extras = array_map([__CLASS__, 'sanitize_source_text'], array_slice($extras, 0, 2));


        if (!$pauta) return new \WP_Error('missing','Informe ou escolha uma pauta.',['status'=>400]);

        if ($custom !== '' && ! self::has_license()){
            return new \WP_Error('pro_only','Prompt personalizado exige licença PRO ativa.',['status'=>403]);
        }

        $cache   = self::cache_get();
        $txt     = (string)($cache['txt'] ?? '');
        $video_id= (string)($cache['video_id'] ?? '');
        $srt_url = (string)($cache['srt_url'] ?? '');
        if ($txt === '') return new \WP_Error('no_cache','Baixe a transcrição do vídeo primeiro.',['status'=>400]);

        // Template do prompt (custom > padrão)
        $prompt_tpl = ($custom !== '')
            ? $custom
            : ( method_exists('MAA_AutoArticles','load_main_prompt')
                ? MAA_AutoArticles::load_main_prompt()
                : (method_exists('MAA_AutoArticles','sample_main_prompt') ? MAA_AutoArticles::sample_main_prompt() : '') );

        $map = [
    '{{pauta}}'              => $pauta,
    '{{fonte_conteudo1}}'    => $txt,
    '{{fonte_conteudo2}}'    => $extras[0] ?? '',
    '{{fonte_conteudo3}}'    => $extras[1] ?? '',
    '{{estilo}}'             => $estilo,
    '{{palavra_chave_alvo}}' => '',
    '{{palavra-chave-alvo}}' => '',
    '{{idioma}}'             => 'pt-BR',
    '{{pais}}'               => 'Brasil',
];

        $user_prompt   = strtr($prompt_tpl, $map);

        $s = MAA_AutoArticles::get_settings();
        $system_prompt = $s['system_prompt'];

        if ($provider === 'gemini' || stripos($model, 'gemini') === 0) {
            if (!class_exists('MAA_Gemini_Module')) return new \WP_Error('gemini_missing','Módulo Gemini não encontrado.',['status'=>500]);
            $resp_text = MAA_Gemini_Module::call($model, $system_prompt, $user_prompt, ['temperature'=>0.7,'topP'=>0.95,'topK'=>40]);
            if (is_wp_error($resp_text)) return $resp_text;
        } else {
            $api_key = MAA_AutoArticles::decrypt_from_storage($s['openai_key_enc'] ?? '');
            if (!$api_key) return new \WP_Error('no_openai_key','Configure sua OpenAI API Key em MAA → Configurações ou selecione Gemini.',['status'=>400]);
            $payload = [
                'model'    => $model,
                'messages' => [
                    ['role'=>'system','content'=>$system_prompt],
                    ['role'=>'user','content'=>$user_prompt],
                ],
            ];
            $r = wp_remote_post('https://api.openai.com/v1/chat/completions',[
                'headers'=>['Authorization'=>'Bearer '.$api_key,'Content-Type'=>'application/json'],
                'timeout'=>90,'body'=>wp_json_encode($payload)
            ]);
            if (is_wp_error($r)) return new \WP_Error('openai_http',$r->get_error_message(),['status'=>500]);
            $code=wp_remote_retrieve_response_code($r); $body=wp_remote_retrieve_body($r);
            if ($code<200 || $code>=300) return new \WP_Error('openai_err','Erro da API OpenAI: '.$body,['status'=>$code]);
            $data=json_decode($body,true);
            $resp_text=$data['choices'][0]['message']['content'] ?? '';
            if(!$resp_text) return new \WP_Error('openai_empty','Resposta vazia da OpenAI.',['status'=>500]);
        }

        // Parse e cria rascunho
        $parsed = self::parse_ai_output($resp_text);
        $title  = $parsed['title'] ?: $pauta;
        
        $html   = $parsed['content_html'] ?: $parsed['raw'];

        $post_id = wp_insert_post([
            'post_type'   => 'post',
            'post_status' => 'draft',
            'post_title'  => wp_strip_all_tags($title),
            
            'post_content'=> $html,
        ], true);
        if (is_wp_error($post_id)) return new \WP_Error('post_err', $post_id->get_error_message(), ['status'=>500]);

        return rest_ensure_response([
    'post_id' => (int) $post_id,
    'title'   => self::json_safe_str( get_the_title($post_id) ),
]);
    }

    public static function rest_clear_transcript(\WP_REST_Request $req) {
        self::cache_clear();
        return new \WP_REST_Response(['ok'=>true], 200);
    }

    /** =================== Helpers =================== */
    private static function has_license() {
        $ok = false;
        if (function_exists('maa_pro_is_license_active')) $ok = (bool) call_user_func('maa_pro_is_license_active');
        return (bool) apply_filters('maa_pro_license_is_active', $ok);
    }

    private static function uploads_dir() {
        $u = wp_get_upload_dir();
        $p = trailingslashit($u['basedir']) . self::UP_SUBDIR;
        if (!file_exists($p)) wp_mkdir_p($p);
        return $p;
    }
    private static function uploads_url() {
        $u = wp_get_upload_dir();
        return trailingslashit($u['baseurl']) . self::UP_SUBDIR;
    }

    private static function parse_video_id($url) {
        $host = parse_url($url, PHP_URL_HOST) ?: '';
        $host = strtolower($host);
        $path = (string)parse_url($url, PHP_URL_PATH);
        if (strpos($host,'youtu.be') !== false) { $id = ltrim($path, '/'); return preg_replace('~[^A-Za-z0-9_\-]~','',$id); }
        parse_str((string)parse_url($url, PHP_URL_QUERY), $qs);
        if (!empty($qs['v'])) return preg_replace('~[^A-Za-z0-9_\-]~','',(string)$qs['v']);
        if (strpos($path, '/shorts/') !== false)  { $id = trim(str_replace('/shorts/','',$path),'/'); return preg_replace('~[^A-Za-z0-9_\-]~','',$id); }
        if (strpos($path, '/embed/')  !== false)  { $id = trim(str_replace('/embed/','',$path),'/');  return preg_replace('~[^A-Za-z0-9_\-]~','',$id); }
        return '';
    }

    private static function call_api_transcript($api_token, $video_id) {
        $args = [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Basic ' . $api_token,
                'Content-Type'  => 'application/json',
            ],
            'body'    => wp_json_encode(['ids' => [$video_id]]),
        ];
        $resp = wp_remote_post(self::API_ENDPOINT, $args);
        if (is_wp_error($resp)) { return ['ok'=>false,'code'=>0,'body'=>null,'err'=>$resp->get_error_message()]; }
        $code = (int) wp_remote_retrieve_response_code($resp);
        $raw  = (string) wp_remote_retrieve_body($resp);
        if ($code===429) return ['ok'=>false,'code'=>429,'body'=>null,'err'=>'rate_limit'];
        if ($code<200 || $code>=300) return ['ok'=>false,'code'=>$code,'body'=>$raw,'err'=>'http'];
        $json = json_decode($raw,true);
        return ['ok'=>true,'code'=>$code,'body'=>$json,'raw'=>$raw];
    }

    private static function build_srt_single_block($text){
        $text = trim((string)$text); if($text==='') return '';
        return "1\r\n00:00:00,000 --> 99:59:59,000\r\n".preg_replace('/\\s+/u',' ',$text)."\r\n";
    }
    private static function srt_time($sec){
        $sec=max(0,(float)$sec); $h=floor($sec/3600); $m=floor(($sec%3600)/60); $s=floor($sec%60); $ms=(int)round(($sec-floor($sec))*1000);
        return sprintf("%02d:%02d:%02d,%03d",$h,$m,$s,$ms);
    }
    private static function build_srt_from_segments(array $segments){
        $i=1;$out=[];
        foreach($segments as $seg){
            if(!isset($seg['text'])) continue;
            $txt=trim((string)$seg['text']); if($txt==='') continue;
            $start=isset($seg['start'])?(float)$seg['start']:0.0;
            $dur=isset($seg['duration'])?(float)$seg['duration']:2.0;
            $end=$start+max(0.5,$dur);
            $out[]=$i++; $out[]=self::srt_time($start).' --> '.self::srt_time($end); $out[]=preg_replace('/\\s+/u',' ',$txt); $out[]='';
        }
        return $out?implode("\r\n",$out):'';
    }
    private static function normalize_to_srt($body,$video_id,$plaintext_strategy='single'){
        if(is_array($body) && isset($body[$video_id]) && is_array($body[$video_id])){
            $srt=self::build_srt_from_segments($body[$video_id]); if($srt) return $srt;
        }
        if(is_array($body)){
            foreach($body as $item){
                if(is_array($item) && isset($item['id']) && $item['id']===$video_id && isset($item['segments']) && is_array($item['segments'])){
                    $srt=self::build_srt_from_segments($item['segments']); if($srt) return $srt;
                }
                if(is_array($item) && isset($item['id']) && $item['id']===$video_id && isset($item['transcript'])){
                    return self::build_srt_single_block((string)$item['transcript']);
                }
                if(is_string($item) && $item!==''){ return self::build_srt_single_block($item); }
            }
        }
        if(is_string($body) && $body!==''){ return self::build_srt_single_block($body); }
        if(is_array($body) && isset($body['transcript'])){ return self::build_srt_single_block((string)$body['transcript']); }
        return '';
    }

    private static function srt_to_text($srt){
        $lines=preg_split("/\r\n|\n|\r/",(string)$srt); $out=[];
        foreach($lines as $ln){
            $l=trim($ln); if($l===''){ $out[]=''; continue; }
            if(preg_match('/^\d+$/',$l)) continue;
            if(preg_match('/^\d{2}:\d{2}:\d{2},\d{3}\\s*-->\\s*\\d{2}:\d{2}:\d{2},\d{3}$/',$l)) continue;
            $out[]=$l;
        }
        $txt=trim(preg_replace("/(\\R){2,}/","\n\n",implode("\n",$out)));
        return $txt;
    }

    private static function json_safe_str($s){
    $s = is_string($s) ? $s : (string)$s;
    // remove tags e bytes inválidos/controles
    $s = wp_strip_all_tags($s);
    $s = wp_check_invalid_utf8($s, true);
    $s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s);
    return $s;
}
private static function sanitize_source_text($s){
    $s = is_string($s) ? $s : (string)$s;
    $s = wp_strip_all_tags($s);
    $s = wp_check_invalid_utf8($s, true);
    $s = preg_replace('/[\x00-\x1F\x7F]/u','',$s); // remove controles
    // Limite de segurança
    if (function_exists('mb_substr')) $s = mb_substr($s, 0, 30000);
    else $s = substr($s, 0, 30000);
    return trim($s);
}

    /** ------- Sugerir pautas ------- */
    private static function suggest_pautas($texto, $provider='gemini', $model='gemini-2.5-flash-lite'){
        $system = 'Você é um editor experiente. Gere três pautas curtas, objetivas e atraentes para um artigo, baseadas na transcrição dada. Responda SOMENTE em JSON no formato {"pautas":["...","...","..."]}.';

        try {
            if ($provider === 'gemini' || stripos($model,'gemini')===0) {
                if (class_exists('MAA_Gemini_Module')) {
                    $resp = MAA_Gemini_Module::call(
                        $model,
                        $system,
                        "Transcrição:\n\n".$texto,
                        ['temperature'=>0.7,'topP'=>0.9,'topK'=>40]
                    );
                    if (!is_wp_error($resp)) {
                        $json = self::try_json($resp);
                        if (!empty($json['pautas']) && is_array($json['pautas'])) {
                            return array_slice(array_map('wp_strip_all_tags',$json['pautas']), 0, 3);
                        }
                    }
                }
            } else {
                $s = MAA_AutoArticles::get_settings();
                $api_key = MAA_AutoArticles::decrypt_from_storage($s['openai_key_enc'] ?? '');
                if ($api_key) {
                    $payload = [
                        'model'    => $model,
                        'messages' => [
                            ['role'=>'system','content'=>$system],
                            ['role'=>'user','content'=>"Transcrição:\n\n".$texto],
                        ],
                    ];
                    $r = wp_remote_post('https://api.openai.com/v1/chat/completions',[
                        'headers'=>['Authorization'=>'Bearer '.$api_key,'Content-Type'=>'application/json'],
                        'timeout'=>60,'body'=>wp_json_encode($payload)
                    ]);
                    if (!is_wp_error($r) && (int)wp_remote_retrieve_response_code($r)>=200 && (int)wp_remote_retrieve_response_code($r)<300){
                        $data = json_decode(wp_remote_retrieve_body($r), true);
                        $resp_text = $data['choices'][0]['message']['content'] ?? '';
                        $json = self::try_json($resp_text);
                        if (!empty($json['pautas']) && is_array($json['pautas'])) {
                            return array_slice(array_map('wp_strip_all_tags',$json['pautas']), 0, 3);
                        }
                    }
                }
            }
        } catch (\Throwable $e) {}

        // Fallback local
        $snippet = function_exists('mb_substr') ? mb_substr($texto, 0, 1000) : substr($texto, 0, 1000);
        $cands = array_filter(array_map('trim', preg_split('/[\.!\?]\s+/u', (string)$snippet)));
        $cands = array_slice($cands, 0, 3);
        if (!$cands) {
            $cands = [
                'Resumo e principais pontos do vídeo',
                'Por que este tema importa agora',
                'O que muda para o leitor'
            ];
        }
        return $cands;
    }

    /** -------- Cache por usuário -------- */
    private static function cache_set(array $data){
        update_user_meta(get_current_user_id(), self::USER_META_CACHE, $data);
    }
    private static function cache_get(){
        $v = get_user_meta(get_current_user_id(), self::USER_META_CACHE, true);
        return is_array($v) ? $v : [];
    }
    private static function cache_clear(){
        delete_user_meta(get_current_user_id(), self::USER_META_CACHE);
    }

    /** ---------- Parser ---------- */
    private static function try_json($text){
        $clean=trim($text); $clean=preg_replace('/^```(json)?/i','',$clean); $clean=preg_replace('/```$/','',$clean);
        $j=json_decode($clean,true);
        if(json_last_error()!==JSON_ERROR_NONE){
            $s=strpos($clean,'{'); $e=strrpos($clean,'}');
            if($s!==false && $e!==false && $e>$s){ $maybe=substr($clean,$s,$e-$s+1); $j=json_decode($maybe,true); }
        }
        return is_array($j)?$j:[];
    }
    private static function parse_ai_output($text){
        $clean=trim($text); $clean=preg_replace('/^```(json)?/i','',$clean); $clean=preg_replace('/```$/','',$clean);
        $out=['title'=>'','subtitle'=>'','content_html'=>'','raw'=>$text];
        $json=json_decode($clean,true);
        if(json_last_error()!==JSON_ERROR_NONE){
            $s=strpos($clean,'{'); $e=strrpos($clean,'}');
            if($s!==false && $e!==false && $e>$s){ $maybe=substr($clean,$s,$e-$s+1); $json=json_decode($maybe,true); }
        }
        if(is_array($json) && json_last_error()===JSON_ERROR_NONE){
            $out['title']        = isset($json['title']) ? wp_strip_all_tags($json['title']) : '';
            $out['subtitle']     = isset($json['subtitle']) ? wp_strip_all_tags($json['subtitle']) : '';
            $out['content_html'] = isset($json['content_html']) ? wp_kses_post($json['content_html']) : '';
        } else {
            $out['content_html'] = '<p>'. esc_html($text) .'</p>';
        }
        return $out;
    }

    /** =================== Notices & Locked =================== */
    private static function push_notice($type,$msg){ set_transient(self::NOTICE_KEY_BASE.get_current_user_id(),['type'=>$type,'msg'=>$msg],180); }
    private static function pull_notice(){ $k=self::NOTICE_KEY_BASE.get_current_user_id(); $v=get_transient($k); if($v) delete_transient($k); return $v; }

    public static function handle_save_key() {
        if (!current_user_can('manage_options')) wp_die('Permissão negada.');
        check_admin_referer(self::ACTION_SAVEKEY);
        $token = isset($_POST['maa_yt_api_token']) ? trim((string)$_POST['maa_yt_api_token']) : '';
        update_option(self::OPT_API_TOKEN, $token, false);
        self::push_notice('ok', $token ? 'Chave salva com sucesso.' : 'Chave removida.');
        wp_safe_redirect(wp_get_referer() ?: admin_url()); exit;
    }

    private static function render_locked_fallback() {
        ?>
        <div class="maa3">
            <div class="header"><h2>Geração via Vídeo (YouTube)</h2><span class="chip">Recurso PRO</span></div>
            <div class="card" style="position:relative; overflow:hidden;">
                <p class="hint" style="margin:6px 0 0;">Este módulo está disponível apenas para assinantes <strong>PRO</strong>.</p>
                <div style="margin-top:12px; height:120px; border:1px dashed var(--line); border-radius:10px; display:grid; place-items:center;">
                    <strong>Acesso restrito — apenas assinantes PRO</strong>
                </div>
            </div>
        </div>
        <?php
    }
}
MAA_Youtube_Pro::init();
endif;
