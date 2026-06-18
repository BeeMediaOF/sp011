<?php
if (!defined('ABSPATH')) exit;

// Não carrega o módulo se a licença PRO não estiver ativa
if ( ! class_exists('MAA_Pro_Licensing') || ! MAA_Pro_Licensing::is_active() ) {
  return;
}

if (!class_exists('MAA_PRO_Image_Module')):

final class MAA_PRO_Image_Module {
    const VERSION      = '1.3.2';
    const REST_NS      = 'maaimg/v1';

    /* ------------ Endpoints ------------ */
    // OpenAI (imagem e texto p/ ideias/metadados)
    const OAI_IMG_ENDPOINT = 'https://api.openai.com/v1/images/generations';
    const OAI_TXT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

    // Google Gemini (Imagen e texto)
    const GGL_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

    /* ------------ Modelos default ------------ */
    // OpenAI
    const OAI_IMG_MODEL      = 'gpt-image-1';
    const OAI_DALLE3_MODEL   = 'dall-e-3';
    const OAI_TXT_MODEL      = 'gpt-4.1-nano';
    // Gemini (texto p/ ideias)
    const GGL_TXT_MODEL = 'gemini-2.5-flash-lite';

    /* ------------ Saída ------------ */
    // OpenAI (tamanhos por modelo)
    const OAI_IMG_SIZE_GPTI1 = '1536x1024';
    const OAI_IMG_SIZE_DALLE = '1792x1024';
    const IMG_Q_DEFAULT      = 'low';
    const IMG_FMT_WEBP_QLTY  = 85;

    /* ------------ Timeouts ------------ */
    const TIMEOUT_LONG    = 160;
    const CONNECT_TIMEOUT = 20;

    public static function init() {
        add_filter('upload_mimes', [__CLASS__, 'allow_webp']);
        add_action('add_meta_boxes',        [__CLASS__, 'register_metabox']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_assets']);
        add_action('rest_api_init',         [__CLASS__, 'register_routes']);

        add_action('plugins_loaded', function () {
            if (!class_exists('MAA_AutoArticles')) {
                add_action('admin_notices', ['MAA_PRO_Image_Module', 'admin_notice_missing_maa']);
            }
        });

        add_filter('http_request_timeout', [__CLASS__, 'force_http_timeout'], 99, 1);
        add_action('http_api_curl', [__CLASS__, 'tune_curl_for_openai'], 10, 3);
    }

    /* ===================== UI ===================== */
    public static function register_metabox() {
        add_meta_box(
            'maa_img_box',
            'MAA – Imagem de Destaque (IA)',
            [__CLASS__, 'render_metabox'],
            ['post'],
            'side',
            'high'
        );
    }

    public static function render_metabox($post) {
        wp_nonce_field('maa_img_box', 'maa_img_nonce');
        $kw = self::guess_keyword_for_post($post->ID);
        ?>
        <div id="maa-img-box" style="font-size:13px;line-height:1.45;">
            <p style="margin:0 0 6px;"><strong>Palavra-chave principal</strong></p>
            <input type="text" id="maaimg-keyword" value="<?php echo esc_attr($kw); ?>" placeholder="ex.: indústria de defesa" style="width:100%;"/>

            <hr style="margin:10px 0;"/>

            <p style="margin:0 0 6px;"><strong>Provedor e modelo</strong></p>
            <label style="display:block;margin-bottom:6px;">
              <select id="maaimg-provider" style="width:100%;">
                <option value="gemini" selected>Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label style="display:block;margin-bottom:8px;">
              <select id="maaimg-model" style="width:100%;"></select>
            </label>

            <!-- Custo estimado -->
            <div id="maaimg-price-wrap" style="margin:6px 0 10px;padding:8px;border:1px solid #e2e4e7;border-radius:6px;background:#f8fafc;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong>Custo estimado*</strong>
                <span id="maaimg-price-line" style="font-weight:600;">—</span>
              </div>
              <div id="maaimg-price-note" class="description" style="margin-top:4px;color:#64748b;">
                * Valores médios por imagem. Podem variar e são definidos pelo provedor.
              </div>
            </div>

            <div id="maaimg-quality-wrap">
              <p id="maaimg-quality-title" style="margin:0 0 4px;"><strong>Qualidade</strong></p>
              <select id="maaimg-quality" style="display:block;width:100%;max-width:100%;box-sizing:border-box;margin-bottom:4px;"></select>
            </div>

            <p style="margin:0 0 6px;"><strong>Modo</strong></p>
            <label style="display:block;margin-bottom:4px;">
                <input type="radio" name="maaimg-mode" value="prompt" checked> Usar prompt (manual)
            </label>
            <label style="display:block;margin-bottom:8px;">
                <input type="radio" name="maaimg-mode" value="ideas"> Gerar ideias a partir do artigo
            </label>

            <div id="maaimg-mode-prompt">
                <p style="margin:0 0 6px;"><strong>Prompt da imagem</strong></p>
                <textarea id="maaimg-prompt" rows="4" style="width:100%;" placeholder="Descreva a cena representativa da capa, sem textos na arte."></textarea>
                <button type="button" class="button button-primary" id="maaimg-generate" style="margin-top:6px;width:100%;">Gerar & definir como destaque</button>
            </div>

            <div id="maaimg-mode-ideas" style="display:none;">
                <p style="margin:0 4px 6px 0;"><strong>IA para Sugerir Ideias</strong></p>
                <select id="maaimg-ideas-aimodel" style="width:100%;margin-bottom:8px;">
  <option value="openai:gpt-4.1-nano" selected>OpenAI — gpt-4.1-nano (rápido)</option>
  <option value="openai:gpt-4o">OpenAI — gpt-4o</option>
  <option value="openai:gpt-5-nano">OpenAI — gpt-5-nano</option>
  <option value="gemini:gemini-2.5-flash-lite">Gemini — 2.5-flash-lite</option>
</select>

                <p class="description" style="margin-top:0;">Sugestões em 3 estilos (Fotojornalismo, Ilustração editorial, Render 3D realista), sem texto na imagem.</p>
                <button type="button" class="button" id="maaimg-suggest" style="width:100%;">Sugerir ideias</button>
                <div id="maaimg-ideas" style="margin-top:8px;"></div>
                <button type="button" class="button button-primary" id="maaimg-generate-from-idea" style="display:none;margin-top:6px;width:100%;">Gerar & definir como destaque</button>
            </div>

            <div id="maaimg-status" style="margin-top:8px;color:#444;"></div>
            <div id="maaimg-preview" style="margin-top:8px;"></div>
        </div>
        <?php
    }

    public static function enqueue_assets($hook) {
        if (!in_array($hook, ['post.php','post-new.php'], true)) return;

        wp_register_script('maaimg-js', '', [], self::VERSION, true);
        wp_enqueue_script('maaimg-js');

        wp_localize_script('maaimg-js', 'MAAIMG_CFG', [
            'nonce'        => wp_create_nonce('wp_rest'),
            'restSuggest'  => esc_url_raw( rest_url( self::REST_NS . '/suggest' ) ),
            'restGenerate' => esc_url_raw( rest_url( self::REST_NS . '/generate' ) ),
        ]);

        $inline = <<<JS
(function(w){
  function el(id){ return document.getElementById(id); }
  function isGB(){ try{ return !!(w.wp && wp.data && wp.data.select && wp.data.select('core/editor')); }catch(e){ return false; } }
  function sameProto(url){ try{ var u=new URL(url,w.location.origin); u.protocol=w.location.protocol; return u.toString(); }catch(e){ return url; } }
  function status(m){ var s=el('maaimg-status'); if(s) s.textContent=m||''; }
  function notice(type,msg){
    try{ if(w.wp && wp.data){ wp.data.dispatch('core/notices').createNotice(type,msg,{isDismissible:true}); return; } }catch(e){}
    if(type==='error'){ alert(msg); } else { console.log(type.toUpperCase()+':', msg); }
  }
  async function restPost(url, data){
    url = sameProto(url);
    var nonce = (w.MAAIMG_CFG && MAAIMG_CFG.nonce) || (w.wpApiSettings && wpApiSettings.nonce) || '';
    var res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type':'application/json', 'X-WP-Nonce': nonce },
      body: JSON.stringify(data||{})
    });
    var text = ''; try{ text = await res.text(); }catch(e){}
    if(!res.ok){
      var msg = 'HTTP '+res.status;
      try{ var j=JSON.parse(text); if(j && j.message){ msg += ' — ' + j.message + (j.code?' ['+j.code+']':''); } }
      catch(e){ if(text){ msg += ' — ' + text.substring(0,200); } }
      throw new Error(msg);
    }
    try{ return JSON.parse(text); }catch(e){ throw new Error('JSON inválido: ' + text.substring(0,200)); }
  }
  function getPost(){
    if(isGB()){
      try{
        return {
          id: wp.data.select('core/editor').getCurrentPostId(),
          title: wp.data.select('core/editor').getEditedPostAttribute('title')||'',
          excerpt: wp.data.select('core/editor').getEditedPostAttribute('excerpt')||'',
          content: wp.data.select('core/editor').getEditedPostAttribute('content')||''
        };
      }catch(e){}
    }
    var id = parseInt((el('post_ID')||{value:0}).value,10)||0;
    var title = (el('title')||{value:''}).value||'';
    var content = '';
    if(w.tinyMCE && tinyMCE.get && tinyMCE.get('content') && !tinyMCE.get('content').isHidden()){
      content = tinyMCE.get('content').getContent()||'';
    }else{
      var ta = el('content'); if(ta){ content = ta.value||''; }
    }
    var exEl = el('excerpt') || document.querySelector('#postexcerpt textarea');
    var excerpt = exEl ? (exEl.value||'') : '';
    return { id:id, title:title, excerpt:excerpt, content:content };
  }
  async function ensurePostId(){
    var p = getPost();
    if(p.id && p.id > 0) return p.id;
    var title = p.title || (el('title') ? el('title').value : '') || ('Rascunho ' + new Date().toLocaleString());
    var created = await restPost(sameProto('/wp-json/wp/v2/posts'), { title: title, status: 'draft' });
    var newId = created && created.id ? created.id : 0;
    if(newId > 0){
      var pid = el('post_ID'); if(pid){ pid.value = newId; }
    }
    return newId;
  }

  // Modelos disponíveis no UI (imagem)
  const IMG_MODELS = {
    openai: [
      {v:'gpt-image-1', label:'gpt-image-1'},
      {v:'dall-e-3',    label:'DALL·E 3 (1792×1024)'}
    ],
    gemini: [
      {v:'gemini-3-pro-image-preview',    label:'Gemini 3 Pro'},
      {v:'gemini-2.5-flash-image',   label:'Gemini 2.5 Flash Image'},
      {v:'imagen-4.0-generate-001',       label:'Imagen 4 – generate'},
      {v:'imagen-4.0-ultra-generate-001', label:'Imagen 4 – ultra'},
      {v:'imagen-4.0-fast-generate-001',  label:'Imagen 4 – fast'},
      {v:'imagen-3.0-generate-002',       label:'Imagen 3'}
    ]
  };

  // Preços médios (USD)
  // gpt-image-1: low 0.016, medium 0.063, high 0.25
  // DALL·E 3: standard 0.08, hd 0.12
  const OPENAI_PRICES = {
    'gpt-image-1': { low:0.016, medium:0.063, high:0.25 },
    'dall-e-3':    { standard:0.08, hd:0.12 }
  };
  const GEMINI_PRICES = {
    'imagen-4.0-fast-generate-001':   0.02,
    'imagen-4.0-generate-001':        0.04,
    'imagen-4.0-ultra-generate-001':  0.06,
    'imagen-3.0-generate-002':        0.03,
      'gemini-2.5-flash-image':       0.04,
    'gemini-3-pro-image-preview':     0.134
  };

  function populateModels(provider){
    var sel = el('maaimg-model');
    if(!sel) return;
    sel.innerHTML = '';
    var list = IMG_MODELS[provider] || IMG_MODELS.gemini;
    list.forEach(function(m){
      var opt = document.createElement('option');
      opt.value = m.v; opt.textContent = m.label;
      sel.appendChild(opt);
    });
    if(provider==='gemini'){ sel.value = 'imagen-4.0-generate-001'; }
    if(provider==='openai'){ sel.value = 'gpt-image-1'; }
    populateQuality(provider, sel.value);
  }

  function populateQuality(provider, model){
    var box = el('maaimg-quality-wrap');
    var title = el('maaimg-quality-title');
    var sel = el('maaimg-quality');
    if(!box || !sel) return;

    if(provider==='gemini'){
      box.style.display = 'none';
      sel.innerHTML = '';
      return;
    }

    box.style.display = 'block';
    sel.innerHTML = '';
    var opts = [];

    if(model === 'gpt-image-1'){
      title.innerHTML = '<strong>Qualidade (gpt-image-1)</strong>';
      opts = [
        {v:'low',    t:'Low'},
        {v:'medium', t:'Medium'},
        {v:'high',   t:'High'}
      ];
      sel.value = 'low';
    } else if(model === 'dall-e-3'){
      title.innerHTML = '<strong>Qualidade (DALL·E 3)</strong>';
      opts = [
        {v:'standard', t:'Standard'},
        {v:'hd',       t:'HD'}
      ];
      sel.value = 'standard';
    } else {
      title.innerHTML = '<strong>Qualidade</strong>';
    }

    opts.forEach(function(o){
      var op=document.createElement('option'); op.value=o.v; op.textContent=o.t; sel.appendChild(op);
    });
  }

  function setText(id, value){ var dom = document.getElementById(id); if(dom){ dom.textContent=value; } }
  function fmtUSD(n){
    var s = (Math.round(n*1000)/1000).toString();
    if(s.indexOf('.')>=0){ while(s.endsWith('0')) s=s.slice(0,-1); if(s.endsWith('.')) s=s.slice(0,-1); }
    return 'US$ ' + s + ' / imagem';
  }
  function showPricing(){
    var provider = (el('maaimg-provider')||{}).value || 'gemini';
    var model    = (el('maaimg-model')||{}).value || '';
    var quality  = (el('maaimg-quality')||{}).value || 'low';

    if(provider === 'gemini'){
      var p = GEMINI_PRICES[model];
      setText('maaimg-price-line', (typeof p === 'number') ? fmtUSD(p) : '—');
    }else{
      var table = OPENAI_PRICES[model] || {};
      var p2 = table[quality];
      setText('maaimg-price-line', (typeof p2 === 'number') ? fmtUSD(p2) : '—');
    }
  }

  document.addEventListener('change', function(e){
    if(e.target && e.target.name==='maaimg-mode'){
      var mode = e.target.value;
      var a = el('maaimg-mode-prompt'), b = el('maaimg-mode-ideas');
      if(a) a.style.display = (mode==='prompt')?'block':'none';
      if(b) b.style.display = (mode==='ideas')?'block':'none';
    }
    if(e.target && e.target.id==='maaimg-provider'){
      populateModels(e.target.value||'gemini');
      showPricing();
    }
    if(e.target && e.target.id==='maaimg-model'){
      populateQuality((el('maaimg-provider')||{value:'gemini'}).value, e.target.value);
      showPricing();
    }
    if(e.target && e.target.id==='maaimg-quality'){
      showPricing();
    }
  });

  document.addEventListener('DOMContentLoaded', function(){
    var provider = (el('maaimg-provider')||{value:'gemini'}).value || 'gemini';
    populateModels(provider);
    showPricing();
  });

  // Sugerir ideias
  document.addEventListener('click', async function(e){
    if(!(e.target && e.target.id==='maaimg-suggest')) return;
    e.preventDefault();
    var p = getPost();
    var keyword = (el('maaimg-keyword')||{}).value || '';
    if(!p.title && !p.content){ notice('warning','Escreva título ou conteúdo para sugerir ideias.'); return; }

    var aim = (el('maaimg-ideas-aimodel')||{value:'openai:gpt-5-nano'}).value.split(':');
    var suggest_provider = (aim[0]||'openai');
    var suggest_model    = (aim[1]||'gpt-5-nano');

    try{
      var ensuredId = await ensurePostId();
      if(!ensuredId){ throw new Error('Sem ID do post'); }
      status('Sugerindo ideias…');
      var res = await restPost(MAAIMG_CFG.restSuggest, {
        post_id: ensuredId,
        title: p.title, excerpt: p.excerpt, content: p.content, keyword: keyword,
        suggest_provider: suggest_provider, suggest_model: suggest_model
      });
      var ideas = (res && res.ideas) ? res.ideas : [];
      var box = el('maaimg-ideas'); if(box){ box.innerHTML=''; }
      if(!ideas.length){ if(box) box.innerHTML='<em>Nenhuma ideia gerada.</em>'; status(''); return; }
      var html = '<div style="border:1px solid #e2e4e7;border-radius:6px;padding:8px;">';
      ideas.forEach(function(it,idx){
        html += '<label style="display:block;border-bottom:1px solid #eee;padding:6px 0;">';
        html += '<input type="radio" name="maaimg-idea" value="'+idx+'" '+(idx===0?'checked':'')+'> ';
        html += '<strong>'+ (it.style||('Ideia '+(idx+1))) +':</strong><br/>';
        html += '<span style="white-space:pre-wrap;display:block;margin-top:4px;">'+ (it.prompt||'') +'</span>';
        html += '</label>';
      });
      html += '</div>';
      if(box) box.innerHTML = html;
      var btn = el('maaimg-generate-from-idea'); if(btn) btn.style.display='block';
      status('3 ideias prontas. Selecione uma e gere a imagem.');
    }catch(err){
      notice('error', 'Erro ao sugerir ideias: ' + err.message);
      status('Falhou ao sugerir.');
    }
  });

  // Gerar imagem (prompt manual ou ideia)
  document.addEventListener('click', async function(e){
    if(e.target && (e.target.id==='maaimg-generate' || e.target.id==='maaimg-generate-from-idea')){
      e.preventDefault();
      var provider = (el('maaimg-provider')||{}).value || 'gemini';
      var model    = (el('maaimg-model')||{}).value || (provider==='gemini' ? 'imagen-4.0-generate-001' : 'gpt-image-1');
      var keyword  = (el('maaimg-keyword')||{}).value || '';
      var quality  = (el('maaimg-quality')||{}).value || 'low';

      var prompt='';
      if(e.target.id==='maaimg-generate'){
        prompt = (el('maaimg-prompt')||{}).value || '';
        if(!prompt){ notice('warning','Informe um prompt.'); return; }
      }else{
        var radios = document.querySelectorAll('input[name="maaimg-idea"]');
        radios.forEach(function(r){ if(r.checked){ var span=r.closest('label').querySelector('span'); prompt = span ? span.textContent : ''; } });
        if(!prompt){ notice('warning','Selecione uma ideia.'); return; }
      }

      try{
        var ensuredId = await ensurePostId();
        if(!ensuredId){ throw new Error('Sem ID do post'); }
        status('Gerando imagem…');
        var res = await restPost(MAAIMG_CFG.restGenerate, { post_id:ensuredId, prompt:prompt, keyword:keyword, quality:quality, provider:provider, model:model });
        var prev = el('maaimg-preview');
        if(prev){
          var img = document.createElement('img');
          img.src = res.attachment_url;
          img.style.maxWidth = '100%';
          img.style.border = '1px solid #e2e4e7';
          img.style.borderRadius = '6px';
          img.style.marginTop = '6px';
          prev.innerHTML = '';
          prev.appendChild(img);
        }
        notice('success', res.featured_set ? 'Imagem definida como destaque.' : 'Imagem gerada.');
        status(res.featured_set ? 'Imagem definida como destaque.' : 'Imagem gerada.');
      }catch(err){
        notice('error','Erro ao gerar imagem: ' + err.message);
        status('Falhou ao gerar.');
      }
    }
  });
})(window);
JS;
        wp_add_inline_script('maaimg-js', $inline, 'after');
    }

    /* ===================== REST ===================== */
    public static function register_routes() {
        register_rest_route(self::REST_NS, '/suggest', [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_suggest'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => [
                'post_id'          => ['type'=>'integer','required'=>true],
                'title'            => ['type'=>'string','required'=>false],
                'excerpt'          => ['type'=>'string','required'=>false],
                'content'          => ['type'=>'string','required'=>false],
                'keyword'          => ['type'=>'string','required'=>false],
                'suggest_provider' => ['type'=>'string','required'=>false],
                'suggest_model'    => ['type'=>'string','required'=>false],
            ],
        ]);

        register_rest_route(self::REST_NS, '/generate', [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_generate'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => [
                'post_id' => ['type'=>'integer','required'=>true],
                'prompt'  => ['type'=>'string','required'=>true],
                'keyword' => ['type'=>'string','required'=>false],
                'quality' => ['type'=>'string','required'=>false, 'enum'=>['low','medium','high','standard','hd']],
                'provider'=> ['type'=>'string','required'=>false],
                'model'   => ['type'=>'string','required'=>false],
            ],
        ]);
    }

    /** Sugerir 3 ideias (OpenAI OU Gemini, conforme escolha do usuário) */
    public static function rest_suggest(WP_REST_Request $req) {
        $post_id = intval($req->get_param('post_id'));
        if (!$post_id || !current_user_can('edit_post', $post_id)) {
            return new WP_Error('perm','Sem permissão.', ['status'=>403]);
        }
        $title   = sanitize_text_field($req->get_param('title') ?? '');
        $excerpt = wp_strip_all_tags($req->get_param('excerpt') ?? '');
        $content = wp_strip_all_tags($req->get_param('content') ?? '');
        $keyword = sanitize_text_field($req->get_param('keyword') ?? '');
        $prov    = sanitize_text_field($req->get_param('suggest_provider') ?? '');
        $smodel  = sanitize_text_field($req->get_param('suggest_model') ?? '');

        if ($prov !== 'gemini') { $prov = 'openai'; }
        if ($prov === 'openai' && !$smodel) $smodel = self::OAI_TXT_MODEL;
        if ($prov === 'gemini' && !$smodel) $smodel = self::GGL_TXT_MODEL;

        $kw = $keyword ?: self::guess_keyword_for_post($post_id);
        $brief = "TÍTULO: {$title}\nRESUMO: {$excerpt}\nCONTEÚDO: {$content}";
        $prompt = <<<PROMPT
Você é diretor de arte. Gere EXCLUSIVAMENTE JSON com 3 ideias de imagem de capa (sem texto na arte) para um artigo em português brasileiro.
Cada ideia:
- "style": um de ["Fotojornalismo", "Ilustração editorial", "Render 3D realista"]
- "prompt": descrição da cena, enquadramento horizontal 1536x1024, cores e elementos. Nada de texto impresso na imagem.
Tema:
{$brief}
Palavra-chave: "{$kw}"

RETORNO (JSON):
{"ideas":[{"style":"Fotojornalismo","prompt":"..."},{"style":"Ilustração editorial","prompt":"..."},{"style":"Render 3D realista","prompt":"..."}]}
PROMPT;

        /* --------- OpenAI (chat.completions) ---------- */
        if ($prov === 'openai') {
            $api_key = self::get_openai_key();
            if (!$api_key) return new WP_Error('no_api_key','Configure sua OpenAI API Key em MAA → Configurações.', ['status'=>400]);

            $payload = [
                'model'    => $smodel,
                'messages' => [
                    ['role'=>'system','content'=>'Você SEMPRE retorna JSON válido, sem texto extra.'],
                    ['role'=>'user','content'=>$prompt],
                ],
            ];
            $res = self::post_json_openai(self::OAI_TXT_ENDPOINT, $payload, $api_key, 40);
            if (is_wp_error($res)) return $res;

            $body = json_decode(wp_remote_retrieve_body($res), true);
            $text = $body['choices'][0]['message']['content'] ?? '';
            if (!$text) return new WP_Error('openai_empty','Resposta vazia da OpenAI.',['status'=>500]);

            $clean = trim(preg_replace('/^```(json)?/i','', $text));
            $clean = preg_replace('/```$/','', $clean);
            $json  = json_decode($clean, true);
            if (!is_array($json) || empty($json['ideas'])) {
                $json = ['ideas'=>[
                    ['style'=>'Fotojornalismo','prompt'=>'Cenário real do tema com símbolos fortes; luz natural; composição horizontal 1536x1024; sem textos.'],
                    ['style'=>'Ilustração editorial','prompt'=>'Ilustração vetorial minimalista com ícones do tema; contraste alto; 1536x1024; sem textos.'],
                    ['style'=>'Render 3D realista','prompt'=>'Cena 3D realista simbólica do assunto; iluminação cinematográfica; 1536x1024; sem textos.'],
                ]];
            }
            return new WP_REST_Response(['ideas'=>$json['ideas']], 200);
        }

        /* --------- Gemini (generateContent) ---------- */
        $gkey = self::get_google_key();
        if (!$gkey) return new WP_Error('no_google_key','Configure sua Google AI Studio API Key (Gemini) em MAA → Configurações.', ['status'=>400]);

        $url = self::GGL_ENDPOINT_BASE . $smodel . ':generateContent';
        $payload = [
            'contents' => [
                [
                    'role'  => 'user',
                    'parts' => [ ['text' => "Você SEMPRE retorna JSON válido, sem texto extra.\n".$prompt] ]
                ]
            ],
        ];
        $res = self::post_json_google($url, $payload, $gkey, 40);
        if (is_wp_error($res)) return $res;

        $body = json_decode(wp_remote_retrieve_body($res), true);
        $text = '';
        if (!empty($body['candidates'][0]['content']['parts'][0]['text'])) {
            $text = $body['candidates'][0]['content']['parts'][0]['text'];
        } elseif (!empty($body['candidates'][0]['content']['parts'][0]['text'])) {
            $text = $body['candidates'][0]['content']['parts'][0]['text'];
        }

        if (!$text) {
            $fallback = ['ideas'=>[
                ['style'=>'Fotojornalismo','prompt'=>'Cenário real do tema com símbolos fortes; luz natural; composição horizontal 1536x1024; sem textos.'],
                ['style'=>'Ilustração editorial','prompt'=>'Ilustração vetorial minimalista com ícones do tema; contraste alto; 1536x1024; sem textos.'],
                ['style'=>'Render 3D realista','prompt'=>'Cena 3D realista simbólica do assunto; iluminação cinematográfica; 1536x1024; sem textos.'],
            ]];
            return new WP_REST_Response(['ideas'=>$fallback['ideas']], 200);
        }

        $clean = trim(preg_replace('/^```(json)?/i','', $text));
        $clean = preg_replace('/```$/','', $clean);
        $json  = json_decode($clean, true);
        if (!is_array($json) || empty($json['ideas'])) {
            $json = ['ideas'=>[
                ['style'=>'Fotojornalismo','prompt'=>'Cenário real do tema com símbolos fortes; luz natural; composição horizontal 1536x1024; sem textos.'],
                ['style'=>'Ilustração editorial','prompt'=>'Ilustração vetorial minimalista com ícones do tema; contraste alto; 1536x1024; sem textos.'],
                ['style'=>'Render 3D realista','prompt'=>'Cena 3D realista simbólica do assunto; iluminação cinematográfica; 1536x1024; sem textos.'],
            ]];
        }
        return new WP_REST_Response(['ideas'=>$json['ideas']], 200);
    }

    /** Gera imagem (OpenAI OU Gemini) e define como destaque */
    public static function rest_generate(WP_REST_Request $req) {
        $post_id = intval($req->get_param('post_id'));
        $prompt  = sanitize_textarea_field($req->get_param('prompt') ?? '');
        $keyword = sanitize_text_field($req->get_param('keyword') ?? '');
        $quality = sanitize_text_field($req->get_param('quality') ?? '');
        $provider= sanitize_text_field($req->get_param('provider') ?? '');
        $model   = sanitize_text_field($req->get_param('model') ?? '');

        if (!$post_id || !current_user_can('edit_post', $post_id)) {
            return new WP_Error('perm','Sem permissão.', ['status'=>403]);
        }
        if (!$prompt) return new WP_Error('missing','Informe um prompt.', ['status'=>400]);
        if (function_exists('set_time_limit')) @set_time_limit(300);

        $kw = $keyword ?: self::guess_keyword_for_post($post_id);

        // ================= Gemini (Imagen + Gemini 3 Pro Image) =================
        // ================= Gemini (Imagen + Gemini 3 Pro Image + Gemini 2.5 Flash Image) =================
if (
    $provider === 'gemini'
    || stripos($model, 'imagen-') === 0
    || stripos($model, 'gemini-3-pro-image-preview') === 0
    || stripos($model, 'gemini-2.5-flash-image') === 0
) {
            if ($model === '') {
                $model = 'imagen-4.0-generate-001';
            }

            $gkey = self::get_google_key();
            if (!$gkey) {
                return new WP_Error('no_google_key','Configure sua Google AI Studio API Key (Gemini) em MAA → Configurações.', ['status'=>400]);
            }

            $raw = null;
$body = null;

// Modelos "nativos" Gemini de imagem (generateContent)
if ($model === 'gemini-3-pro-image-preview' || $model === 'gemini-2.5-flash-image') {
    $payload = [
        'contents' => [
            [
                'parts' => [
                    [ 'text' => $prompt ]
                ]
            ]
        ],
        'generationConfig' => [
            'imageConfig' => [
                'aspectRatio' => '16:9',
                'imageSize'   => '1K',
            ]
        ],
    ];
    
     // 🔹 Remover imageSize no modelo Gemini 2.5 Flash Image (opcional, recomendado pela doc)
    if ($model === 'gemini-2.5-flash-image') {
        $payload['generationConfig'] = [
            'imageConfig' => [
                'aspectRatio' => '16:9',
            ]
        ];
    }
    
    $url = self::GGL_ENDPOINT_BASE . $model . ':generateContent';
    $res = self::post_json_google($url, $payload, $gkey, self::TIMEOUT_LONG);
    if (is_wp_error($res)) return $res;

    $body = json_decode(wp_remote_retrieve_body($res), true);
    $b64  = '';

    if (!empty($body['candidates'][0]['content']['parts']) && is_array($body['candidates'][0]['content']['parts'])) {
        foreach ($body['candidates'][0]['content']['parts'] as $part) {
            if (!empty($part['inlineData']['data'])) {
                $b64 = $part['inlineData']['data'];
                break;
            }
        }
    }

    if (!$b64) {
        return new WP_Error('gemini_empty','Sem imagem retornada pela API Gemini (modelo nativo).', ['status'=>500, 'body'=>$body]);
    }

    $raw = base64_decode($b64);
    if (!$raw) {
        return new WP_Error('decode','Falha ao decodificar a imagem (Gemini).', ['status'=>500]);
    }

} else {
                // Fluxo antigo: Imagen 3/4 via predict (mantido)
                $payload = [
                    'instances'  => [ [ 'prompt' => $prompt ] ],
                    'parameters' => [
                        'sampleCount'      => 1,
                        'aspectRatio'      => '16:9',
                        'imageSize'        => '1K',
                        'personGeneration' => 'allow_adult'
                    ]
                ];

                $url = self::GGL_ENDPOINT_BASE . $model . ':predict';
                $res = self::post_json_google($url, $payload, $gkey, self::TIMEOUT_LONG);
                if (is_wp_error($res)) return $res;

                $body = json_decode(wp_remote_retrieve_body($res), true);

                $b64 = '';
                if (isset($body['predictions'][0]['bytesBase64Encoded'])) {
                    $b64 = $body['predictions'][0]['bytesBase64Encoded'];
                } elseif (isset($body['predictions'][0]['images'][0]['bytesBase64Encoded'])) {
                    $b64 = $body['predictions'][0]['images'][0]['bytesBase64Encoded'];
                }

                if (!$b64) return new WP_Error('gemini_empty','Sem imagem retornada pela API Gemini.', ['status'=>500, 'body'=>$body]);
                $raw = base64_decode($b64);
                if (!$raw) return new WP_Error('decode','Falha ao decodificar a imagem (Gemini).', ['status'=>500]);
            }

            // Converte para WEBP
            $conv  = self::to_webp_with_fallback($raw, self::IMG_FMT_WEBP_QLTY);
            $ext   = $conv['ext'];
            $bytes = $conv['bytes'];

            $meta = self::build_image_metadata_via_openai($post_id, $kw, $prompt);
            if (!is_array($meta)) {
                $meta = ['title'=>'Imagem do artigo','alt'=>'Imagem ilustrativa','description'=>'Imagem gerada para ilustrar o conteúdo.'];
            }

            $saved = self::save_image_to_media($bytes, $ext, $post_id, $meta);
            if (is_wp_error($saved)) return $saved;

            return new WP_REST_Response([
                'attachment_id'  => $saved['id'],
                'attachment_url' => $saved['url'],
                'meta'           => $meta,
                'provider'       => 'gemini',
                'model'          => $model,
                'featured_set'   => !empty($saved['featured_set']),
            ], 200);
        }

       // ================= OpenAI (gpt-image-1 OU DALL·E 3) =================
$api_key = self::get_openai_key();
if (!$api_key) return new WP_Error('no_api_key','Configure sua OpenAI API Key em MAA → Configurações.', ['status'=>400]);

$selected_model = $model ?: self::OAI_IMG_MODEL;

// Monta payload conforme o modelo
$img_payload = [ 'model' => $selected_model, 'prompt' => $prompt ];

if ($selected_model === self::OAI_DALLE3_MODEL) {
    // DALL·E 3: 1792x1024, qualidades standard/hd, e pedimos base64 explicitamente
    $img_payload['size']             = self::OAI_IMG_SIZE_DALLE; // '1792x1024'
    $img_payload['quality']          = in_array($quality, ['standard','hd'], true) ? $quality : 'standard';
    $img_payload['response_format']  = 'b64_json'; // força base64
    // Dica: DALL·E 3 ignora 'n'>1; não enviar 'n' evita 400
} else {
    // gpt-image-1 (mantém comportamento anterior)
    $q = in_array($quality, ['low','medium','high'], true) ? $quality : self::IMG_Q_DEFAULT;
    $img_payload['n']                 = 1;
    $img_payload['size']              = self::OAI_IMG_SIZE_GPTI1; // '1536x1024'
    $img_payload['quality']           = $q;
    $img_payload['output_format']     = 'webp';
    $img_payload['output_compression']= self::IMG_FMT_WEBP_QLTY;
}

$img_res  = self::post_json_openai(self::OAI_IMG_ENDPOINT, $img_payload, $api_key, self::TIMEOUT_LONG);
if (is_wp_error($img_res)) return $img_res;

$body_raw = wp_remote_retrieve_body($img_res);
$img_body = json_decode($body_raw, true);

// 1) Tenta base64 (gpt-image-1 e DALL·E 3 quando pedimos b64_json)
$record   = $img_body['data'][0] ?? [];
$b64      = isset($record['b64_json']) ? $record['b64_json'] : '';
$bytes_raw = $b64 ? base64_decode($b64) : '';

// 2) Se não veio base64, tenta URL (algumas contas/versões ainda retornam URL por padrão)
if (!$bytes_raw && !empty($record['url'])) {
    $get  = wp_remote_get($record['url'], ['timeout'=>self::TIMEOUT_LONG, 'sslverify'=>true]);
    if (is_wp_error($get)) return $get;
    $bytes_raw = wp_remote_retrieve_body($get);
    if (!$bytes_raw) return new WP_Error('openai_empty','Sem bytes na URL retornada.', ['status'=>500]);
}

if (!$bytes_raw) {
    // Repasse a resposta da API para facilitar debug
    return new WP_Error('openai_empty','Sem imagem retornada.', ['status'=>500, 'body'=>$img_body]);
}

// Se for DALL·E 3, converte PNG→WEBP; se for gpt-image-1 já vem WEBP
$ext   = 'webp';
$bytes = $bytes_raw;

if ($selected_model === self::OAI_DALLE3_MODEL){
    $conv  = self::to_webp_with_fallback($bytes_raw, self::IMG_FMT_WEBP_QLTY);
    $ext   = $conv['ext'];
    $bytes = $conv['bytes'];
}

// Metadados via OpenAI texto
$meta = self::build_image_metadata_via_openai($post_id, $kw, $prompt);
if (!is_array($meta)) {
    $meta = ['title'=>'Imagem do artigo','alt'=>'Imagem ilustrativa','description'=>'Imagem gerada para ilustrar o conteúdo.'];
}

$saved = self::save_image_to_media($bytes, $ext, $post_id, $meta);
if (is_wp_error($saved)) return $saved;

return new WP_REST_Response([
    'attachment_id'  => $saved['id'],
    'attachment_url' => $saved['url'],
    'meta'           => $meta,
    'provider'       => 'openai',
    'model'          => $selected_model,
    'quality_used'   => $img_payload['quality'] ?? '',
    'featured_set'   => !empty($saved['featured_set']),
], 200);

    }

    /* ===================== Helpers ===================== */

    public static function allow_webp($mimes) { $mimes['webp'] = 'image/webp'; return $mimes; }

    protected static function get_openai_key() {
        if (!class_exists('MAA_AutoArticles')) return '';
        $s = MAA_AutoArticles::get_settings();
        return (string)($s['openai_key'] ?? '');
    }
    protected static function get_google_key() {
        if (!class_exists('MAA_AutoArticles')) return '';
        $s = MAA_AutoArticles::get_settings();
        return (string)($s['google_key'] ?? '');
    }

    public static function force_http_timeout($seconds) { return max((int)$seconds, self::TIMEOUT_LONG); }

    public static function tune_curl_for_openai($handle, $r, $url) {
        if (strpos($url, 'api.openai.com') === false) return;
        if (function_exists('curl_setopt')) {
            @curl_setopt($handle, CURLOPT_TIMEOUT, self::TIMEOUT_LONG);
            @curl_setopt($handle, CURLOPT_CONNECTTIMEOUT, self::CONNECT_TIMEOUT);
            @curl_setopt($handle, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
            @curl_setopt($handle, CURLOPT_TCP_KEEPALIVE, 1);
            @curl_setopt($handle, CURLOPT_TCP_KEEPIDLE, 30);
            @curl_setopt($handle, CURLOPT_TCP_KEEPINTVL, 15);
        }
    }

    protected static function post_json_openai($url, $payload, $api_key, $timeout) {
        $headers = [
            'Authorization' => 'Bearer ' . $api_key,
            'Content-Type'  => 'application/json',
            'Accept'        => 'application/json',
            'User-Agent'    => 'MAA-Image/'.self::VERSION.'; '.home_url('/'),
            'Expect'        => '',
        ];
        $args = [ 'headers'=>$headers, 'timeout'=>$timeout, 'sslverify'=>true, 'blocking'=>true, 'body'=> wp_json_encode($payload) ];
        $res = wp_remote_post($url, $args);
        if (is_wp_error($res)) return $res;
        $code = wp_remote_retrieve_response_code($res);
        if ($code < 200 || $code >= 300) {
            return new WP_Error('openai_http', 'Erro da API OpenAI: ' . wp_remote_retrieve_body($res), ['status'=>$code]);
        }
        return $res;
    }

    protected static function post_json_google($url, $payload, $api_key, $timeout) {
        $headers = [
            'x-goog-api-key' => $api_key,
            'Content-Type'   => 'application/json',
            'Accept'         => 'application/json',
            'User-Agent'     => 'MAA-Image-Gemini/'.self::VERSION.'; '.home_url('/'),
            'Expect'         => '',
        ];
        $args = [ 'headers'=>$headers, 'timeout'=>$timeout, 'sslverify'=>true, 'blocking'=>true, 'body'=> wp_json_encode($payload) ];
        $res = wp_remote_post($url, $args);
        if (is_wp_error($res)) return $res;
        $code = wp_remote_retrieve_response_code($res);
        if ($code < 200 || $code >= 300) {
            return new WP_Error('gemini_http', 'Erro da API Gemini: ' . wp_remote_retrieve_body($res), ['status'=>$code]);
        }
        return $res;
    }

    /** Gera metadados (título/alt/descrição) via OpenAI texto para manter consistência. */
    protected static function build_image_metadata_via_openai($post_id, $kw, $img_prompt){
        $api_key = self::get_openai_key();
        if (!$api_key) return false;

        $post = get_post($post_id);
        $tt   = $post ? get_the_title($post) : '';
        $txt_prompt = <<<PROMPT
Crie metadados em PT-BR para a imagem de capa gerada a partir do prompt abaixo.
Inclua naturalmente a palavra-chave em todos os campos.

Palavra-chave: "{$kw}"
Título do artigo: "{$tt}"
Prompt da imagem: "{$img_prompt}"

Retorne EXCLUSIVAMENTE JSON:
{
  "title": "Título curto e descritivo (até 80 caracteres)",
  "alt": "Texto alternativo descritivo (até 120 caracteres)",
  "description": "Descrição objetiva de 1–2 frases (até 240 caracteres)"
}
PROMPT;
        $payload = [
            'model'    => self::OAI_TXT_MODEL,
            'messages' => [
                ['role'=>'system','content'=>'Você SEMPRE retorna JSON válido, sem texto extra.'],
                ['role'=>'user','content'=>$txt_prompt],
            ],
        ];
        $txt_res = self::post_json_openai(self::OAI_TXT_ENDPOINT, $payload,  $api_key, 40);
        if (is_wp_error($txt_res)) return false;

        $txt_body = json_decode(wp_remote_retrieve_body($txt_res), true);
        $txt_raw  = $txt_body['choices'][0]['message']['content'] ?? '';
        $meta = ['title'=>'Imagem do artigo','alt'=>'Imagem ilustrativa','description'=>'Imagem gerada para ilustrar o conteúdo.'];
        if ($txt_raw) {
            $clean = trim(preg_replace('/^```(json)?/i','', $txt_raw));
            $clean = preg_replace('/```$/','', $clean);
            $j = json_decode($clean, true);
            if (is_array($j)) {
                $meta['title']       = isset($j['title']) ? wp_strip_all_tags($j['title']) : $meta['title'];
                $meta['alt']         = isset($j['alt']) ? wp_strip_all_tags($j['alt']) : $meta['alt'];
                $meta['description'] = isset($j['description']) ? wp_strip_all_tags($j['description']) : $meta['description'];
            }
        }
        return $meta;
    }

    /** Converte bytes para WEBP; se não conseguir, retorna fallback PNG. */
    protected static function to_webp_with_fallback($rawBytes, $quality = 85){
        // Tenta GD
        if (function_exists('imagecreatefromstring') && function_exists('imagewebp')) {
            $im = @imagecreatefromstring($rawBytes);
            if ($im !== false) {
                if (function_exists('imagepalettetotruecolor')) @imagepalettetotruecolor($im);
                @imagealphablending($im, true);
                @imagesavealpha($im, true);
                ob_start();
                @imagewebp($im, null, (int)$quality);
                $data = ob_get_clean();
                @imagedestroy($im);
                if ($data && strlen($data) > 0) {
                    return ['bytes'=>$data, 'ext'=>'webp'];
                }
            }
        }
        // Tenta Imagick
        if (class_exists('Imagick')) {
            try{
                $img = new \Imagick();
                $img->readImageBlob($rawBytes);
                $img->setImageFormat('webp');
                $img->setImageCompressionQuality((int)$quality);
                $data = $img->getImagesBlob();
                $img->destroy();
                if ($data && strlen($data)>0) {
                    return ['bytes'=>$data, 'ext'=>'webp'];
                }
            }catch(\Throwable $e){}
        }
        // Fallback (mantém bytes – salva como PNG)
        return ['bytes'=>$rawBytes, 'ext'=>'png'];
    }

    protected static function guess_keyword_for_post($post_id) {
        $tags = get_post_meta($post_id, 'maa_seo_tags', true);
        if (is_array($tags) && !empty($tags[0])) return sanitize_text_field($tags[0]);
        $title = get_the_title($post_id);
        if (!$title) return '';
        $title = mb_strtolower(wp_strip_all_tags($title));
        $stop  = ['de','da','do','dos','das','e','em','um','uma','o','a','os','as','para','no','na','nos','nas','com','sem','por','sobre'];
        $parts = preg_split('/[^a-z0-9á-úà-ùâ-ûã-õç]+/iu', $title);
        $ok = [];
        foreach($parts as $p){ $p = trim($p); if($p && !in_array($p,$stop,true)) $ok[] = $p; }
        $ok = array_slice(array_unique($ok), 0, 4);
        return implode(' ', $ok);
    }

    protected static function save_image_to_media($bytes, $ext, $post_id, $meta) {
        if (!$post_id || $post_id <= 0) {
            return new WP_Error('no_post', 'ID do post inválido ao salvar imagem.');
        }

        if ( ! function_exists('media_handle_sideload') ) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
            require_once ABSPATH . 'wp-admin/includes/media.php';
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }

        $tmp = wp_tempnam('maaimg');
        if (!$tmp) { return new WP_Error('tmp', 'Falha ao criar arquivo temporário.'); }
        $ok = file_put_contents($tmp, $bytes);
        if ($ok === false) { @unlink($tmp); return new WP_Error('write_tmp', 'Falha ao escrever imagem temporária.'); }

        $ext   = strtolower($ext ?: 'webp');
        $mime  = 'image/' . ($ext === 'jpg' ? 'jpeg' : $ext);
        if ($mime === 'image/jpg') $mime = 'image/jpeg';

        $filename = 'maaimg-post-' . intval($post_id) . '-' . date('Ymd-His') . '.' . $ext;
        $file_array = array(
            'name'     => $filename,
            'tmp_name' => $tmp,
            'type'     => $mime,
            'size'     => strlen($bytes),
            'error'    => 0,
        );

        $desc = isset($meta['description']) ? wp_kses_post($meta['description']) : '';

        $attach_id = media_handle_sideload( $file_array, $post_id, $desc, array(
            'post_mime_type' => $mime,
            'post_title'     => wp_strip_all_tags( $meta['title'] ?? 'Imagem do artigo' ),
            'post_status'    => 'inherit',
        ));

        if ( is_wp_error($attach_id) ) { @unlink($tmp); return $attach_id; }

        if ( ! empty( $meta['alt'] ) ) {
            update_post_meta( $attach_id, '_wp_attachment_image_alt', wp_strip_all_tags( $meta['alt'] ) );
        }

        $att = get_post( $attach_id );
        if ( $att && (int)$att->post_parent !== (int)$post_id ) {
            wp_update_post( array( 'ID' => $attach_id, 'post_parent' => (int)$post_id ) );
        }

        $featured_ok = false;
        if ( function_exists('set_post_thumbnail') ) { $featured_ok = set_post_thumbnail( $post_id, $attach_id ); }
        if ( ! $featured_ok ) {
            update_post_meta( $post_id, '_thumbnail_id', $attach_id );
            $featured_ok = ((int)get_post_meta($post_id, '_thumbnail_id', true) === (int)$attach_id);
            if ($featured_ok) { clean_post_cache($post_id); }
        }

        $url = wp_get_attachment_url( $attach_id );

        return array(
            'id'           => (int)$attach_id,
            'url'          => $url,
            'path'         => get_attached_file( $attach_id ),
            'featured_set' => (bool)$featured_ok,
        );
    }

    public static function admin_notice_missing_maa() {
        if (current_user_can('manage_options')) {
            echo '<div class="notice notice-error"><p><strong>MAA – Imagens (PRO):</strong> o plugin base <em>MAA – Máquina de Artigos Automáticos</em> não está ativo. Ative-o para usar este módulo.</p></div>';
        }
    }
    
}

MAA_PRO_Image_Module::init();

endif;
