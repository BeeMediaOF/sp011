<?php
/**
 * MAA PRO – Notícias Automáticas
 * Arquivo: maa-news-pro.php
 * Classe: MAA_News_Pro
 */
if (!defined('ABSPATH')) exit;

// Carrega apenas se a licença PRO estiver ativa
if ( ! class_exists('MAA_Pro_Licensing') || ! MAA_Pro_Licensing::is_active() ) {
  return;
}

if (!class_exists('MAA_News_Pro')):

final class MAA_News_Pro {
    const VERSION   = '1.1.0'; // bump
    const REST_NS   = 'maanews/v1';
    // Diffbot Article API
    const DIFFBOT_ENDPOINT = 'https://api.diffbot.com/v3/article';

    // options
    const OPT_SETTINGS = 'maa_news_settings';
    const OPT_FEEDS    = 'maa_news_feeds';     // array de feeds
    const OPT_HISTORY  = 'maa_news_history';   // array de itens publicados (dedupe)
    const OPT_STATE    = 'maa_news_state';

    // cron
    const CRON_HOOK = 'maa_news_tick_5min';

    // imagens (IA)
        const IMG_MODEL = 'gpt-image-1';
    const IMG_SIZE  = '1536x1024';
    const IMG_Q_DEFAULT = 'low'; // low|medium|high
    const IMG_FMT   = 'webp';
    const IMG_COMPR = 85;

    // Largura mínima para imagem de capa compatível com Discover
    const IMG_MIN_WIDTH = 0;


    /** ============ BOOT ============ */
    public static function init() {
        add_action('maa_render_news_tab', [__CLASS__, 'render_admin_tab']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_assets']);
        add_action('rest_api_init', [__CLASS__, 'register_rest']);
        add_filter('rest_pre_serve_request', [__CLASS__, 'rest_no_cache_headers'], 10, 4);

        // Rodar o "wipe" apenas no admin e apenas 1x por versão
        add_action('admin_init', [__CLASS__, 'maybe_upgrade_and_wipe']);

// Cron: intervalo de 5 minutos (agenda de forma segura)
        add_filter('cron_schedules', function($s){
            if (!isset($s['maa5'])) {
                $s['maa5'] = ['interval'=>300, 'display'=>'MAA 5 minutos'];
            }
            return $s;
        });
        self::schedule_if_needed();
        add_action(self::CRON_HOOK, [__CLASS__, 'cron_runner']);

        // *** Aceitar AVIF (e garantir WEBP) no upload ***
        add_filter('upload_mimes', [__CLASS__, 'allow_avif_mime']);
    }

    /** Permite AVIF/WebP no upload */
    public static function allow_avif_mime($mimes){
        if (!isset($mimes['avif'])) $mimes['avif'] = 'image/avif';
        if (!isset($mimes['webp'])) $mimes['webp'] = 'image/webp';
        return $mimes;
    }

    /** ============ LOG ============ */
    protected static function log($event, array $ctx = []) {
        $who = get_current_user_id();
        $line = '[MAA_News] '.date('c').' uid='.$who.' event='.$event.' ctx='.wp_json_encode($ctx, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        error_log($line);
    }

    /** ============ SETTINGS & STORAGE ============ */
    protected static function get_settings(){
        $s = get_option(self::OPT_SETTINGS, []);
        if (!is_array($s)) $s = [];
        $s += [
            // token global da API Diffbot
            'diffbot_token'         => '',

            'default_ai_provider'   => 'gemini',
            'default_gemini_model'  => 'gemini-2.5-flash-lite',
            'default_openai_model'  => 'gpt-5-mini',
            'default_style'         => 'conteudo_viral_padrao',
            'default_lang'          => 'pt-BR',
            'default_country'       => 'Brasil',
            'default_img_quality'   => self::IMG_Q_DEFAULT,
               'default_img_provider'  => 'openai',
        'default_img_model'     => 'gpt-image-1',
            'history_max'           => 2000,

            // padrões de publicação
            'default_post_status'   => 'publish',
            'default_post_author'   => get_current_user_id(),
            'default_post_categories'=> [],
        ];
        return $s;
    }

    protected static function save_settings($s){ update_option(self::OPT_SETTINGS, is_array($s)?$s:[], false); }

    protected static function get_feeds(){
        $f = get_option(self::OPT_FEEDS, []);
        return is_array($f) ? $f : [];
    }
    protected static function save_feeds($arr){
        if (!is_array($arr)) $arr = [];
        $out = [];
        foreach ($arr as $k=>$v){
            if (is_array($v) && !empty($v['id'])) $out[(string)$v['id']] = $v;
        }
        update_option(self::OPT_FEEDS, $out, false);
    }

    protected static function get_history(){
        $h = get_option(self::OPT_HISTORY, []);
        return is_array($h) ? $h : [];
    }
    protected static function save_history($arr){
        $arr = array_values($arr);
        update_option(self::OPT_HISTORY, $arr, false);
    }
    protected static function clear_history(){
        update_option(self::OPT_HISTORY, [], false);
    }
    protected static function history_has($url){
        $url = self::normalize_url($url);
        foreach (self::get_history() as $row){
            if (isset($row['src_link']) && self::normalize_url($row['src_link']) === $url) return true;
        }
        return false;
    }
    protected static function history_add($row){
        $hist = self::get_history();
        $hist[] = [
            'ts'        => current_time('timestamp'),
            'feed_id'   => sanitize_text_field($row['feed_id'] ?? ''),
            'feed_name' => sanitize_text_field($row['feed_name'] ?? ''),
            'src_link'  => esc_url_raw($row['src_link'] ?? ''),
            'post_id'   => intval($row['post_id'] ?? 0),
            'post_title'=> sanitize_text_field($row['post_title'] ?? ''),
            'published' => intval($row['published'] ?? 0) ?: ( $row['post_id'] ? intval(get_post_time('U', false, $row['post_id'])) : current_time('timestamp') ),
        ];
        $s = self::get_settings();
        $max = max(200, intval($s['history_max']));
        if (count($hist) > $max) $hist = array_slice($hist, -$max);
        self::save_history($hist);
        self::log('history_add', ['feed_name'=>$row['feed_name']??'', 'post_id'=>$row['post_id']??0]);
    }
    protected static function normalize_url($u){
        $u = trim((string)$u);
        if (!$u) return '';
        $parts = wp_parse_url($u);
        if (!$parts || empty($parts['host'])) return $u;

        $q = [];
        if (!empty($parts['query'])) parse_str($parts['query'], $q);
        foreach (array_keys($q) as $k) {
            if (stripos($k, 'utm_') === 0 || in_array($k, ['fbclid','gclid','mc_cid','mc_eid'], true)) unset($q[$k]);
        }
        $query = $q ? http_build_query($q) : '';
        $scheme = isset($parts['scheme']) ? $parts['scheme'].'://' : '';
        $path = isset($parts['path']) ? untrailingslashit($parts['path']) : '';
        $port = isset($parts['port']) ? ':'.$parts['port'] : '';
        $out = $scheme.$parts['host'].$port.$path . ($query ? '?'.$query : '');
        return $out;
    }

    /** ============ HELPERS DE FEEDS (ID/VALIDAÇÃO) ============ */
    protected static function make_feed_id($name, $url){
        $base = trim($name) ?: (parse_url($url, PHP_URL_HOST) ?: 'feed');
        $base = strtolower( remove_accents( $base ) );
        $base = preg_replace('/[^a-z0-9\-_]+/','-', $base);
        $base = trim($base, '-_');
        if (!$base) $base = 'feed';
        $id = $base;
        $feeds = self::get_feeds();
        $i = 2;
        while (isset($feeds[$id])) {
            $id = $base.'-'.$i; $i++;
        }
        return $id;
    }

    protected static function get_state(){
        $st = get_option(self::OPT_STATE, []);
        if (!is_array($st)) $st = [];
        $st += [
            'installed_version' => '0.0.0',
        ];
        return $st;
    }
    protected static function save_state($st){
        update_option(self::OPT_STATE, is_array($st)?$st:[], false);
    }
    protected static function unschedule_all(){
        $ts = wp_next_scheduled(self::CRON_HOOK);
        while ($ts) { wp_unschedule_event($ts, self::CRON_HOOK, []); $ts = wp_next_scheduled(self::CRON_HOOK); }
        wp_unschedule_hook(self::CRON_HOOK);
    }
    protected static function schedule_if_needed(){
        if ( ! wp_next_scheduled(self::CRON_HOOK) ) {
            wp_schedule_event(time()+60, 'maa5', self::CRON_HOOK);
        }
    }
    /**
     * Lock simples por feed para evitar duas execuções concorrentes no mesmo feed.
     */
    protected static function acquire_feed_lock($feed_id){
        $feed_id = sanitize_key((string) $feed_id);
        if (!$feed_id) {
            return true; // sem id, não tenta lock
        }

        $key = 'maa_news_lock_' . $feed_id;

        if ( get_transient($key) ) {
            // Já tem outro processo mexendo neste feed
            return false;
        }

        // Lock por até 2 minutos (mais que o suficiente para uma execução normal)
        set_transient($key, 1, 2 * MINUTE_IN_SECONDS);
        return true;
    }

    protected static function release_feed_lock($feed_id){
        $feed_id = sanitize_key((string) $feed_id);
        if (!$feed_id) {
            return;
        }
        $key = 'maa_news_lock_' . $feed_id;
        delete_transient($key);
    }

    /** Wipe controlado: roda 1x por versão e só no admin */
    public static function maybe_upgrade_and_wipe(){
        if ( ! is_admin() ) return;
        if ( ! current_user_can('manage_options') ) return;

        $st   = self::get_state();
        $prev = $st['installed_version'] ?? '0.0.0';

        if ( version_compare($prev, self::VERSION, '<') ) {
            self::log('upgrade_wipe', ['from'=>$prev, 'to'=>self::VERSION]);

            // NÃO limpamos histórico; apenas garantimos re-agendamento limpo
            self::unschedule_all();

            // Marcar versão instalada para não repetir o wipe
            $st['installed_version'] = self::VERSION;
            self::save_state($st);

            // Reagenda o cron limpo
            self::schedule_if_needed();
        }
    }

    protected static function find_feed_id_by_url($url){
        $urlN = self::normalize_url($url);
        foreach (self::get_feeds() as $id=>$f){
            if (self::normalize_url($f['url'] ?? '') === $urlN) return $id;
        }
        return null;
    }

    /** ============ ADMIN UI ============ */
    protected static function base_prompt_text(){
        $prompt = '';
        if (method_exists('MAA_AutoArticles','load_main_prompt')) {
            $prompt = (string) MAA_AutoArticles::load_main_prompt();
        } elseif (method_exists('MAA_AutoArticles','sample_main_prompt')) {
            $prompt = (string) MAA_AutoArticles::sample_main_prompt();
        }
        return $prompt;
    }

    public static function enqueue_assets($hook){
        $is_mass = false;
        if (function_exists('get_current_screen')) {
            $sc = get_current_screen();
            $is_mass = $sc && strpos($sc->id, 'maa-main') !== false;
        }
        if (!$is_mass) return;

        wp_enqueue_style( 'maa-news-pro-css', plugins_url('maa-news-pro.css', __FILE__), [], self::VERSION );

        // ===== autores e categorias =====
        $authors = [];
        $users = get_users([
            'role__in' => ['administrator','editor','author','contributor'],
            'fields' => ['ID','display_name'],
            'orderby' => 'display_name',
            'order' => 'ASC',
        ]);
        foreach ($users as $u){
            $authors[] = ['id'=>intval($u->ID), 'name'=> $u->display_name ?: ('user#'.$u->ID)];
        }
        $categories = [];
        foreach (get_categories(['hide_empty'=>false]) as $c){
            $categories[] = ['id'=>intval($c->term_id), 'name'=>$c->name];
        }

        wp_register_script('maa-news-pro-js', false, ['wp-api-fetch','wp-data'], self::VERSION, true);

        wp_enqueue_script('maa-news-pro-js');

          $IMG_MODELS = [
    'gemini' => [
        // SOMENTE modelos no formato novo
        ['v'=>'gemini-2.5-flash-image',      'label'=>'Gemini 2.5 Flash Image'],
        ['v'=>'gemini-3-pro-image-preview',  'label'=>'Gemini 3 Pro Image (preview)'],
    ],
    'openai' => [
        ['v'=>'gpt-image-1', 'label'=>'gpt-image-1 (1536×1024)'],
        ['v'=>'dall-e-3',    'label'=>'DALL·E 3 (1792×1024)'],
    ],
];

        $def = self::get_settings();


        $MODELS = [
            'gemini' => [
                ['v'=>'gemini-2.5-flash-lite','label'=>'gemini-2.5-flash-lite'],
                ['v'=>'gemini-2.5-flash-preview-09-2025','label'=>'gemini-2.5-flash-preview'],
                ['v'=>'gemini-2.5-pro','label'=>'gemini-2.5-pro'],
                ['v'=>'gemini-3-pro-preview','label'=>'gemini-3-pro-preview'],
                ['v'=>'gemini-2.5-flash','label'=>'gemini-2.5-flash']
            ],
            'openai' => [
                ['v'=>'gpt-5-mini','label'=>'gpt-5-mini'],
                ['v'=>'gpt-5','label'=>'gpt-5'],
                ['v'=>'gpt-5-nano','label'=>'gpt-5-nano'],
                ['v'=>'gpt-4.1','label'=>'gpt-4.1'],
                ['v'=>'gpt-4.1-mini','label'=>'gpt-4.1-mini'],
                ['v'=>'gpt-4.1-nano','label'=>'gpt-4.1-nano'],
                ['v'=>'gpt-4o','label'=>'gpt-4o'],
            ],
        ];
        $def = self::get_settings();

        wp_localize_script('maa-news-pro-js','MAANEWS',[
            'nonce' => wp_create_nonce('wp_rest'),
            'restFeeds' => esc_url_raw(rest_url(self::REST_NS.'/feeds')),
             'restSaveSettings'=> esc_url_raw(rest_url(self::REST_NS.'/settings')),
            'restSaveFeed' => esc_url_raw(rest_url(self::REST_NS.'/feed/save')),
            'restDeleteFeed' => esc_url_raw(rest_url(self::REST_NS.'/feed/delete')),
            'restToggleFeed' => esc_url_raw(rest_url(self::REST_NS.'/feed/toggle')),
            'restScan' => esc_url_raw(rest_url(self::REST_NS.'/feed/scan')),
            'restExtract' => esc_url_raw(rest_url(self::REST_NS.'/extract')),
            'restPublish' => esc_url_raw(rest_url(self::REST_NS.'/publish')),
            'restHistory' => esc_url_raw(rest_url(self::REST_NS.'/history')),
            'restHistoryClear' => esc_url_raw(rest_url(self::REST_NS.'/history/clear')),
            'models' => $MODELS,
            'imgModels' => $IMG_MODELS, // NOVO
            'authors' => $authors,
            'categories' => $categories,
            'basePrompt' => self::base_prompt_text(),
            // token atual do Diffbot
            'diffbotToken' => $def['diffbot_token'] ?? '',
            'defaults' => [
                'provider' => $def['default_ai_provider'],
                'gmodel'   => $def['default_gemini_model'],
                'omodel'   => $def['default_openai_model'],
                'style'    => $def['default_style'],
                'lang'     => $def['default_lang'],
                'country'  => $def['default_country'],
                'imgq'     => $def['default_img_quality'],
                'country'  => $def['default_country'],
             'imgq'     => $def['default_img_quality'],
             'imgProvider' => $def['default_img_provider'],
             'imgModel'    => $def['default_img_model'],

                // publicação
                'postStatus' => $def['default_post_status'],
                'postAuthor' => intval($def['default_post_author']),
                'postCats'   => array_map('intval', (array)$def['default_post_categories']),
            ],
        ]);

        $inline = <<<JS
(function(){
  if(!window.wp || !wp.apiFetch) return;
  try{ wp.apiFetch.use( wp.apiFetch.createNonceMiddleware(MAANEWS.nonce) ); }catch(e){}

  const $ = s=>document.querySelector(s);
  const $$ = s=>Array.from(document.querySelectorAll(s));

  function notice(msg, type){
    const root = document.querySelector('.maa-news');
    if(!root){ alert(msg); return; }
    const el = document.createElement('div');
    el.className = 'maa-notice ' + (type||'success');
    el.textContent = msg;
    root.prepend(el);
    setTimeout(()=>{ el.classList.add('hide'); setTimeout(()=>el.remove(), 400); }, 4000);
  }
  function toast(msg){
    try{ wp.data.dispatch('core/notices').createNotice('success', msg, {isDismissible:true}); }
    catch(e){ notice(msg, 'success'); }
  }
  function escapeHtml(s){ return (String(s||'')).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function hostFromUrl(u){ try{ return (new URL(u)).host; }catch(_){ return ''; } }

  function setBusy(btn, msg){
    if(!btn) return;
    const id = 'busy-'+Math.random().toString(16).slice(2);
    btn.dataset.busyId = id;
    btn.insertAdjacentHTML('afterend', '<span id="'+id+'" class="maa-busy">'+escapeHtml(msg||'Carregando…')+'</span>');
    btn.disabled = true;
  }
  function clearBusy(btn){
    if(!btn) return;
    const id = btn.dataset.busyId;
    if(id){
      const el = document.getElementById(id);
      if(el) el.remove();
      delete btn.dataset.busyId;
    }
    btn.disabled = false;
  }

  function fillModelSelect(provider, select){
    const list = (MAANEWS.models[provider]||[]);
    select.innerHTML = '';
    list.forEach(m=>{
      const o=document.createElement('option');
      o.value=m.v; o.textContent=m.label; select.appendChild(o);
    });
    if(provider==='gemini') select.value = MAANEWS.defaults.gmodel;
    else select.value = MAANEWS.defaults.omodel;
  }

   // NOVO: modelos de imagem (Gemini / OpenAI)
  const IMG_MODELS = MAANEWS.imgModels || {};
  function fillImgModelSelect(provider, select){
    if(!select) return;
    const list = IMG_MODELS[provider] || [];
    select.innerHTML = '';
    list.forEach(function(m){
      const o = document.createElement('option');
      o.value = m.v;
      o.textContent = m.label;
      select.appendChild(o);
    });
    // Não forçamos valor aqui; quem chama define o .value depois, se quiser
  }


    function toggleImgQuality(){
  const wrap = $('#img-quality-wrap'); if(!wrap) return;
  const mm = ($('#img-mode')||{}).value || 'source';
  const provider = ($('#img-provider')||{}).value || (MAANEWS.defaults.imgProvider || 'openai');
  const iq = $('#img-quality');

  const isAI = (mm === 'ai');
  const showQuality = isAI && provider === 'openai';

  // Qualidade só aparece para OpenAI + modo "Gerar com IA"
  wrap.style.display = showQuality ? 'block' : 'none';
  if (iq) iq.disabled = !showQuality;

  // Bloco com provedor + modelo de imagem continua só quando img-mode = ai
  const aiWrap = $('#img-ai-wrap');
  if (aiWrap){
    aiWrap.style.display = isAI ? 'grid' : 'none';
    aiWrap.querySelectorAll('select').forEach(el=>{
      el.disabled = !isAI;
    });
  }
}


  function toggleAI(){
    const wrap = $('#ai-wrap');
    const isSource = ($('#pub-mode')||{}).value === 'source';
    if(wrap){
      wrap.style.display = isSource ? 'none' : 'grid';
      wrap.querySelectorAll('input,select,textarea').forEach(el=>{ el.disabled = isSource; });
    }
  }
   function ex_toggleImgQuality(){
  const wrap = $('#ex-img-quality-wrap'); if(!wrap) return;
  const mm = ($('#ex-img-mode')||{}).value || 'source';
  const provider = ($('#ex-img-provider')||{}).value || (MAANEWS.defaults.imgProvider || 'openai');
  const iq = $('#ex-img-quality');

  const isAI = (mm === 'ai');
  const showQuality = isAI && provider === 'openai';

  wrap.style.display = showQuality ? 'block' : 'none';
  if (iq) iq.disabled = !showQuality;

  const aiWrap = $('#ex-img-ai-wrap');
  if (aiWrap){
    aiWrap.style.display = isAI ? 'grid' : 'none';
    aiWrap.querySelectorAll('select').forEach(el=>{
      el.disabled = !isAI;
    });
  }
}


  function ex_toggleAI(){
    const wrap = $('#ex-ai-wrap');
    const isSource = ($('#ex-pub-mode')||{}).value === 'source';
    if(wrap){
      wrap.style.display = isSource ? 'none' : 'grid';
      wrap.querySelectorAll('input,select,textarea').forEach(el=>{ el.disabled = isSource; });
    }
  }
  function ex_fillModel(){
    const provider = ($$('input[name="ex-ai-provider"]').find(r=>r.checked)||{value:'gemini'}).value;
    fillModelSelect(provider, $('#ex-ai-model'));
  }
  function htmlToText(html){
    const div = document.createElement('div'); div.innerHTML = html||'';
    return (div.textContent||div.innerText||'').trim();
  }
  function nocache(u){
    const sep = u.includes('?') ? '&' : '?';
    return u + sep + '_ts=' + Date.now();
  }

  function populateAuthorsAndCats(){
    const selA = $('#post-author');
    const selS = $('#post-status');
    const selC = $('#post-cats');

    if(selA){
      selA.innerHTML = '';
      (MAANEWS.authors||[]).forEach(a=>{
        const o=document.createElement('option');
        o.value = String(a.id); o.textContent = a.name; selA.appendChild(o);
      });
      selA.value = String(MAANEWS.defaults.postAuthor||'') || (selA.options[0] && selA.options[0].value) || '';
    }
    if(selS){ selS.value = MAANEWS.defaults.postStatus || 'publish'; }
    if(selC){
      selC.innerHTML = '';
      (MAANEWS.categories||[]).forEach(c=>{
        const o=document.createElement('option');
        o.value = String(c.id); o.textContent = c.name; selC.appendChild(o);
      });
      (MAANEWS.defaults.postCats||[]).forEach(id=>{
        const opt = Array.from(selC.options).find(o=>o.value===String(id));
        if(opt) opt.selected = true;
      });
    }

    const exA = $('#ex-post-author');
    const exS = $('#ex-post-status');
    const exC = $('#ex-post-cats');

    if(exA){
      exA.innerHTML = '';
      (MAANEWS.authors||[]).forEach(a=>{
        const o=document.createElement('option');
        o.value = String(a.id); o.textContent = a.name; exA.appendChild(o);
      });
      exA.value = String(MAANEWS.defaults.postAuthor||'') || (exA.options[0] && exA.options[0].value) || '';
    }
    if(exS){ exS.value = MAANEWS.defaults.postStatus || 'publish'; }
    if(exC){
      exC.innerHTML = '';
      (MAANEWS.categories||[]).forEach(c=>{
        const o=document.createElement('option');
        o.value = String(c.id); o.textContent = c.name; exC.appendChild(o);
      });
      (MAANEWS.defaults.postCats||[]).forEach(id=>{
        const opt = Array.from(exC.options).find(o=>o.value===String(id));
        if(opt) opt.selected = true;
      });
    }
  }
  function getSelectedCategories(selId){
    const sel = document.querySelector(selId||'#post-cats'); if(!sel) return [];
    return Array.from(sel.selectedOptions).map(o=>parseInt(o.value,10)).filter(n=>!isNaN(n));
  }

  function refreshFeeds(){
    wp.apiFetch({url: nocache(MAANEWS.restFeeds)}).then(data=>{
      const box = document.getElementById('maa-news-feeds'); if(!box) return;
      if(!Array.isArray(data) || !data.length){
        box.innerHTML = '<div class="empty">Nenhum feed cadastrado.</div>'; return;
      }
      box.innerHTML = data.map(f=>{
        const on = Number(f.active)===1;
        const next = f.next_due ? (' • Próx: '+f.next_due) : '';
        const name = (f.name||'').trim() || hostFromUrl(f.url) || '(sem nome)';
        return ('<div class="feed-card">'
          +'<div class="head"><strong>'+escapeHtml(name)+'</strong>'+ (f.url?'<span class="muted url">'+escapeHtml(f.url||'')+'</span>':'')+'</div>'
          +'<div class="meta">'
            +'Intervalo: '+(f.interval_minutes||30)+' min • Ativo: '+escapeHtml(f.active_from||'00:00')+'–'+escapeHtml(f.active_to||'23:59')
            +' • Janela máx.: '+(f.max_age_hours||24)+'h'+next
          +'</div>'
          +'<div class="actions">'
            +'<button class="btn tiny status '+(on?'on':'off')+'" data-act="toggle" data-id="'+f.id+'">'+(on?'Ativo':'Inativo')+'</button>'
            +'<button class="btn tiny" data-act="scan" data-id="'+f.id+'">Buscar notícia</button>'
            +'<button class="btn tiny" data-act="edit" data-id="'+f.id+'">Editar</button>'
            +'<button class="btn tiny danger" data-act="delete" data-id="'+f.id+'">Excluir</button>'
          +'</div>'
        +'</div>');
      }).join('');
    }).catch(e=>console.error('MAA/feeds list error', e));
  }

  function resetForm(){

    $('#feed-id').value = '';
    $('#feed-name').value = '';
    $('#feed-url').value = '';
    $('#feed-interval').value = '30';
    $('#feed-active-from').value = '06:00';
    $('#feed-active-to').value = '23:59';
    $('#feed-max-age').value = '24';
    $('#feed-active').checked = false;

    $('#pub-mode').value   = 'ai';
    $('#img-mode').value   = 'source';
    $('#img-quality').value= MAANEWS.defaults.imgq;
    $('#news-style').value = MAANEWS.defaults.style;
        if($('#img-provider')){
      $('#img-provider').value = MAANEWS.defaults.imgProvider || 'openai';
      fillImgModelSelect($('#img-provider').value, $('#img-model'));
      if(MAANEWS.defaults.imgModel){
        $('#img-model').value = MAANEWS.defaults.imgModel;
      }
    }

    $('#news-lang').value  = MAANEWS.defaults.lang;
    $('#news-country').value=MAANEWS.defaults.country;

    const provRadios = $$('input[name="ai-provider"]');
    provRadios.forEach(r=>r.checked = (r.value===MAANEWS.defaults.provider));
    fillModelSelect(MAANEWS.defaults.provider, $('#ai-model'));

    $('#post-status').value = MAANEWS.defaults.postStatus || 'publish';
    $('#post-author').value = String(MAANEWS.defaults.postAuthor||'');
    Array.from($('#post-cats').options).forEach(o=>o.selected=false);
    (MAANEWS.defaults.postCats||[]).forEach(id=>{
      const opt = Array.from($('#post-cats').options).find(o=>o.value===String(id));
      if(opt) opt.selected = true;
    });

    $('#use-custom-prompt').checked = false;
    $('#custom-prompt').style.display='none';
    $('#custom-prompt').value = '';

    toggleImgQuality();
    toggleAI();

    $('#ex-pauta').value = '';
    $('#ex-pub-mode').value = 'ai';
    $('#ex-img-mode').value = 'source';
    $('#ex-img-quality').value = MAANEWS.defaults.imgq;
        if($('#ex-img-provider')){
      $('#ex-img-provider').value = MAANEWS.defaults.imgProvider || 'openai';
      fillImgModelSelect($('#ex-img-provider').value, $('#ex-img-model'));
      if(MAANEWS.defaults.imgModel){
        $('#ex-img-model').value = MAANEWS.defaults.imgModel;
      }
    }

    $('#ex-news-style').value = MAANEWS.defaults.style;
    $('#ex-news-lang').value = MAANEWS.defaults.lang;
    $('#ex-news-country').value = MAANEWS.defaults.country;
    $$('input[name="ex-ai-provider"]').forEach(r=>r.checked = (r.value===MAANEWS.defaults.provider));
    ex_fillModel();
    $('#ex-use-custom-prompt').checked = false;
    $('#ex-custom-prompt').style.display='none';
    $('#ex-custom-prompt').value = '';
    ex_toggleImgQuality();
    ex_toggleAI();

    if($('#ex-post-status')) $('#ex-post-status').value = MAANEWS.defaults.postStatus || 'publish';
    if($('#ex-post-author')) $('#ex-post-author').value = String(MAANEWS.defaults.postAuthor||'');
    if($('#ex-post-cats')){
      Array.from($('#ex-post-cats').options).forEach(o=>o.selected=false);
      (MAANEWS.defaults.postCats||[]).forEach(id=>{
        const opt = Array.from($('#ex-post-cats').options).find(o=>o.value===String(id));
        if(opt) opt.selected = true;
      });
    }

    $('#ex-sources').innerHTML = '<div class="muted tiny">Nenhuma fonte adicional adicionada ainda.</div>';
    $('#ex-add-source').disabled = false;
  }

  /** ============ HISTÓRICO (Paginação) ============ */
  const HIST = {limit:10, offset:0, total:0, page:1, pages:1};
  async function loadHistory(page){
    if(!page) page = 1;
    HIST.page = page; HIST.offset = (page-1)*HIST.limit;
    try{
      const url = nocache(MAANEWS.restHistory + '?offset=' + HIST.offset + '&limit=' + HIST.limit);
      const data = await wp.apiFetch({url});
      HIST.total = data.total||0;
      HIST.pages = Math.max(1, Math.ceil(HIST.total/HIST.limit));
      renderHistoryTable(data.items||[]);
      $('#hist-page').textContent = String(HIST.page);
      $('#hist-pages').textContent = String(HIST.pages);
      $('#hist-prev').disabled = (HIST.page<=1);
      $('#hist-next').disabled = (HIST.page>=HIST.pages);
    }catch(e){ console.error('MAA/history error', e); }
  }
  function renderHistoryTable(items){
    const tb = $('#hist-table'); if(!tb) return;
    if(!Array.isArray(items) || !items.length){
      tb.innerHTML = '<thead><tr><th>Quando</th><th>Fonte</th><th>Título</th><th>Link da fonte</th></tr></thead><tbody><tr><td colspan="4"><em>Sem itens.</em></td></tr></tbody>';
      return;
    }
    const rows = items.map(h=>{
      const when = h.when || '';
      const src = escapeHtml(h.feed_name||'');
      const pt  = escapeHtml(h.post_title||'');
      const lnk = escapeHtml(h.src_link||'');
      return '<tr><td>'+when+'</td><td>'+src+'</td><td>'+pt+'</td><td><a href="'+lnk+'" target="_blank" rel="noopener">'+lnk+'</a></td></tr>';
    }).join('');
    tb.innerHTML = '<thead><tr><th>Quando</th><th>Fonte</th><th>Título</th><th>Link da fonte</th></tr></thead><tbody>'+rows+'</tbody>';
  }

  function ex_currentSourceCount(){ return $$('#ex-sources .ex-src').length; }
  function ex_updateAddButton(){
    const maxExtras = 2;
    $('#ex-add-source').disabled = (ex_currentSourceCount() >= maxExtras);
    if (ex_currentSourceCount()===0 && !$('#ex-sources .muted')){
      $('#ex-sources').innerHTML = '<div class="muted tiny">Nenhuma fonte adicional adicionada ainda.</div>';
    } else if (ex_currentSourceCount()>0){
      const m = $('#ex-sources .muted'); if (m) m.remove();
    }
  }
  function ex_addSourceBlock(){
    const idx = Date.now();
    const html = '<div class="ex-src" id="ex-src-'+idx+'">'
      +'<div class="grid-3">'
      +  '<div><label>Tipo</label>'
      +    '<select class="ex-kind">'
      +      '<option value="url">Link</option>'
      +      '<option value="text">Texto colado</option>'
      +    '</select>'
      +  '</div>'
      +  '<div class="ex-url-wrap">'
      +    '<label>URL</label>'
      +    '<input type="url" class="ex-url" placeholder="https://exemplo.com/noticia" />'
      +  '</div>'
      +  '<div class="ex-actions">'
      +    '<label>&nbsp;</label>'
      +    '<div class="flex gap-6">'
      +      '<button class="btn tiny ex-extract">Extrair</button>'
      +      '<button class="btn tiny danger ex-remove">Remover</button>'
      +    '</div>'
      +  '</div>'
      +'</div>'
      +'<div class="ex-text-wrap" style="display:none">'
      +  '<label>Texto</label>'
      +  '<textarea class="ex-text" rows="6" placeholder="Cole o conteúdo aqui…"></textarea>'
      +'</div>'
      +'<input type="hidden" class="ex-payload" />'
      +'</div>';
    const cont = $('#ex-sources');
    if (cont) {
      if (ex_currentSourceCount()===0 && cont.firstElementChild && cont.firstElementChild.classList.contains('muted')) cont.innerHTML='';
      cont.insertAdjacentHTML('beforeend', html);
      ex_updateAddButton();
    }
  }

  document.addEventListener('change', function(e){
    if(e.target && e.target.name==='ai-provider'){ fillModelSelect(e.target.value, $('#ai-model')); }
    if(e.target && e.target.id==='use-custom-prompt'){
      const ta = $('#custom-prompt'); ta.style.display = e.target.checked ? 'block' : 'none';
      if(e.target.checked && !ta.value){ ta.value = (MAANEWS.basePrompt||''); }
    }
    if(e.target && e.target.id==='img-mode'){ toggleImgQuality(); }
    if(e.target && e.target.id==='pub-mode'){ toggleAI(); }

    if(e.target && e.target.name==='ex-ai-provider'){ ex_fillModel(); }
    if(e.target && e.target.id==='ex-use-custom-prompt'){
      const ta = $('#ex-custom-prompt'); ta.style.display = e.target.checked ? 'block' : 'none';
      if(e.target.checked && !ta.value){ ta.value = (MAANEWS.basePrompt||''); }
    }
    if(e.target && e.target.id==='ex-img-mode'){ ex_toggleImgQuality(); }
    if(e.target && e.target.id==='ex-pub-mode'){ ex_toggleAI(); }
    if(e.target && e.target.id==='img-provider'){
  fillImgModelSelect(e.target.value, $('#img-model'));
  toggleImgQuality();        // Atualiza visibilidade da qualidade
}

if(e.target && e.target.id==='ex-img-provider'){
  fillImgModelSelect(e.target.value, $('#ex-img-model'));
  ex_toggleImgQuality();     // Atualiza visibilidade da qualidade
}


    if(e.target && e.target.classList.contains('ex-kind')){
      const root = e.target.closest('.ex-src'); if(!root) return;
      const isText = (e.target.value==='text');
      root.querySelector('.ex-url-wrap').style.display = isText ? 'none' : 'block';
      root.querySelector('.ex-text-wrap').style.display = isText ? 'block' : 'none';
    }
  });

  document.addEventListener('click', async function(e){
    const b = e.target.closest('button'); if(!b) return;
 // === SALVAR TOKEN DIFFBOT ===
  if (b.id === 'save-diffbot-token') {
    e.preventDefault();
    const input = document.getElementById('diffbot-token');
    const token = (input && input.value) ? input.value.trim() : '';

    setBusy(b, 'Salvando…');
    try {
      await wp.apiFetch({
        url: MAANEWS.restSaveSettings,
        method: 'POST',
        data: { diffbot_token: token }
      });
      toast('Token Diffbot salvo.');
    } catch (err) {
      console.error('MAA/save-settings error', err);
      alert('Falha ao salvar token: ' + (err.message || 'erro'));
    }
    clearBusy(b);
    return;
  }
    if(b.id==='save-feed'){
      e.preventDefault();
      const provider = ($$('input[name="ai-provider"]').find(r=>r.checked)||{value:'gemini'}).value;
      const payload = {
        id: $('#feed-id').value || null,
        name: $('#feed-name').value.trim(),
        url: $('#feed-url').value.trim(),
        interval_minutes: parseInt($('#feed-interval').value||'30',10),
        active_from: $('#feed-active-from').value||'00:00',
        active_to: $('#feed-active-to').value||'23:59',
        max_age_hours: parseInt($('#feed-max-age').value||'24',10),
        active: $('#feed-active').checked ? 1 : 0,

        post_status: ($('#post-status')||{}).value || 'publish',
        post_author: parseInt(($('#post-author')||{}).value||'0',10)||0,
        post_cats: getSelectedCategories('#post-cats'),

        pub_mode: $('#pub-mode').value,
        img_mode: $('#img-mode').value,
        img_quality: $('#img-quality').value,
                img_mode: $('#img-mode').value,
        img_quality: $('#img-quality').value,
        img_provider: ($('#img-provider')||{}).value || MAANEWS.defaults.imgProvider,
        img_model:    ($('#img-model')||{}).value    || MAANEWS.defaults.imgModel,
        ai_provider: provider,

        ai_provider: provider,
        ai_model: $('#ai-model').value,
        style: $('#news-style').value,
        lang: $('#news-lang').value,
        country: $('#news-country').value,
        use_custom_prompt: $('#use-custom-prompt').checked ? 1 : 0,
        custom_prompt: $('#custom-prompt').value || '',
        // token Diffbot vindo do input
        diffbot_token: (document.getElementById('diffbot-token') || {}).value || ''
      };
      try{
        await wp.apiFetch({url: MAANEWS.restSaveFeed, method:'POST', data: payload});
        resetForm(); refreshFeeds(); toast('Feed salvo.');
      }catch(err){
        console.error('MAA/save-feed error', err);
        const msg = (err && err.message) ? err.message : 'erro ao salvar (verifique logs do WP)';
        alert('Falha ao salvar: '+ msg);
      }
    }

    if(b.dataset && b.dataset.act){
      e.preventDefault();
      const id = b.dataset.id;

      if(b.dataset.act==='delete'){
        if(!confirm('Excluir este feed?')) return;
        try{
          await wp.apiFetch({url:MAANEWS.restDeleteFeed, method:'POST', data:{id}});
          refreshFeeds(); toast('Feed excluído.');
        }catch(err){ console.error('MAA/delete error',err); alert('Falha ao excluir'); }
      }

      if(b.dataset.act==='toggle'){
        try{ await wp.apiFetch({url:MAANEWS.restToggleFeed, method:'POST', data:{id}}); }
        catch(err){ console.error('MAA/toggle error',err); alert('Falha ao alterar status'); }
        refreshFeeds(); toast('Status alterado.');
      }

      if(b.dataset.act==='scan'){
        setBusy(b,'Buscando…');
        b.textContent='Buscando…';
        try{
          const r = await wp.apiFetch({url: MAANEWS.restScan, method:'POST', data:{id}});
          if(r && r.post_id){
            toast('Publicado: ID '+r.post_id);
            notice('Artigo enviado para a publicação com sucesso (ID '+r.post_id+').','success');
          } else if(r && r.preview){
            toast('Encontrado: '+(r.preview.title||'sem título')+' — nada novo para publicar?');
          } else {
            toast('Nenhuma notícia elegível neste momento.');
          }
        }catch(err){
          console.error('MAA/scan error',err);
          alert('Falha: '+(err.message||'erro'));
        }
        clearBusy(b);
        b.textContent='Buscar notícia';
        refreshFeeds();
      }

      if(b.dataset.act==='edit'){
        try{
          const data = await wp.apiFetch({url: nocache(MAANEWS.restFeeds)});
          const f = (data||[]).find(x=>String(x.id)===String(id)); if(!f) return;
          $('#feed-id').value = f.id||'';
          $('#feed-name').value = f.name||'';
          $('#feed-url').value = f.url||'';
          $('#feed-interval').value = f.interval_minutes||30;
          $('#feed-active-from').value = f.active_from||'06:00';
          $('#feed-active-to').value = f.active_to||'23:59';
          $('#feed-max-age').value = f.max_age_hours||24;
          $('#feed-active').checked = Number(f.active)===1;

          $('#post-status').value = f.post_status||MAANEWS.defaults.postStatus||'publish';
          $('#post-author').value = String(f.post_author||MAANEWS.defaults.postAuthor||'');
          Array.from($('#post-cats').options).forEach(o=>o.selected=false);
          (f.post_cats||[]).forEach(id=>{
            const opt = Array.from($('#post-cats').options).find(o=>o.value===String(id));
            if(opt) opt.selected = true;
          });

              $('#pub-mode').value = f.pub_mode||'ai';
          $('#img-mode').value = f.img_mode||'source';
          $('#img-quality').value = f.img_quality||'low';

          // NOVO: provedor/modelo de imagem
          if($('#img-provider')){
            $('#img-provider').value = f.img_provider || MAANEWS.defaults.imgProvider || 'openai';
            fillImgModelSelect($('#img-provider').value, $('#img-model'));
            if(f.img_model){
              $('#img-model').value = f.img_model;
            } else if(MAANEWS.defaults.imgModel){
              $('#img-model').value = MAANEWS.defaults.imgModel;
            }
          }

          toggleImgQuality(); toggleAI();

          $('#news-style').value   = f.style||MAANEWS.defaults.style;
          $('#news-lang').value    = f.lang||MAANEWS.defaults.lang;
          $('#news-country').value = f.country||MAANEWS.defaults.country;

          const prov = f.ai_provider||MAANEWS.defaults.provider;
          $$('input[name="ai-provider"]').forEach(r=>r.checked = (r.value===prov));
          fillModelSelect(prov, $('#ai-model'));
          $('#ai-model').value = f.ai_model || (prov==='gemini'?MAANEWS.defaults.gmodel:MAANEWS.defaults.omodel);

          $('#use-custom-prompt').checked = Number(f.use_custom_prompt||0)===1;
          $('#custom-prompt').value = f.custom_prompt || ( $('#use-custom-prompt').checked ? (MAANEWS.basePrompt||'') : '' );
          $('#custom-prompt').style.display = $('#use-custom-prompt').checked ? 'block' : 'none';

          window.scrollTo({top:0,behavior:'smooth'});
        }catch(e){ console.error('MAA/edit error',e); }
      }
    }

    if(b.id==='extract-go'){
      e.preventDefault();
      const link = ($('#extract-url')||{}).value || '';
      if(!link){ alert('Informe um link.'); return; }
      $('#extract-result').textContent='Extraindo…';
      setBusy(b,'Extraindo…');
      try{
        const r = await wp.apiFetch({url:MAANEWS.restExtract, method:'POST', data:{url:link}});
        $('#extract-result').textContent='';
        $('#extract-title').textContent = r.title||'(sem título)';
        
        $('#extract-image').innerHTML   = r.image ? ('<img src="'+r.image+'" style="max-width:100%;">') : '<em>sem imagem</em>';
        const cont = r.content_html || '';
        document.getElementById('extract-content').innerHTML = cont || '<em>sem conteúdo</em>';
        $('#extract-payload').value = JSON.stringify(r||{});
        $('#ex-pauta').value = r.title || '';
        $('#publish-from-extract').disabled = false;
        $('#extract-close').style.display = 'inline-block';
      }catch(err){
        console.error('MAA/extract error', err);
        $('#extract-result').textContent = 'Falha: '+(err.message||'erro');
      }
      clearBusy(b);
    }

    if(b.id==='extract-close'){
      e.preventDefault();
      $('#extract-title').textContent = '';
      $('#extract-desc').textContent  = '';
      $('#extract-image').innerHTML   = '';
      $('#extract-content').innerHTML = '';
      $('#extract-payload').value     = '';
      $('#publish-from-extract').disabled = true;
      $('#extract-close').style.display = 'none';
      $('#ex-pauta').value = '';
      $('#ex-sources').innerHTML = '<div class="muted tiny">Nenhuma fonte adicional adicionada ainda.</div>';
      ex_updateAddButton();
    }

    if(b.id==='ex-add-source'){
      e.preventDefault(); if (ex_currentSourceCount() >= 2) return; ex_addSourceBlock();
    }

    if(b.classList.contains('ex-extract')){
      e.preventDefault();
      const root = b.closest('.ex-src'); if(!root) return;
      const url = (root.querySelector('.ex-url')||{}).value || '';
      if(!url){ alert('Informe a URL da fonte.'); return; }
      b.disabled = true; b.textContent='Extraindo…';
      try{
        const r = await wp.apiFetch({url:MAANEWS.restExtract, method:'POST', data:{url}});
        const text = htmlToText(r.content_html||'');
        root.querySelector('.ex-text').value = text || (r.description||'');
        root.querySelector('.ex-payload').value = JSON.stringify(r||{});
        toast('Fonte extra extraída.');
      }catch(err){
        console.error('MAA/extract extra error', err);
        alert('Falha ao extrair esta fonte: '+(err.message||'erro'));
      }
      b.disabled = false; b.textContent='Extrair';
    }
    if(b.classList.contains('ex-remove')){
      e.preventDefault(); const root = b.closest('.ex-src'); if(root) root.remove(); ex_updateAddButton();
    }

    if(b.id==='publish-from-extract'){
      e.preventDefault();
      setBusy(b,'Gerando…');
      try{
        const base = JSON.parse($('#extract-payload').value||'{}');
        if(!base.url || !base.title){ alert('Faça a extração primeiro.'); clearBusy(b); return; }

        const extras = [];
        $$('#ex-sources .ex-src').forEach((el)=>{
          if (extras.length>=2) return;
          const kindSel = el.querySelector('.ex-kind');
          const kind = (kindSel && kindSel.value) || 'url';
          if (kind==='url'){
            const url = (el.querySelector('.ex-url')||{}).value || '';
            const text = (el.querySelector('.ex-text')||{}).value || '';
            if (url) extras.push({kind:'url', url:url, text:text});
          } else {
            const text = (el.querySelector('.ex-text')||{}).value || '';
            if (text) extras.push({kind:'text', text:text});
          }
        });

        const provider = ($$('input[name="ex-ai-provider"]').find(r=>r.checked)||{value:'gemini'}).value;
        const inferredName = $('#feed-name').value.trim() || hostFromUrl(base.url) || '';
                const data = {
          src: base,
          pauta: ($('#ex-pauta')||{}).value || base.title || '',
          pub_mode: $('#ex-pub-mode').value,
          img_mode: $('#ex-img-mode').value,
          img_quality: $('#ex-img-quality').value,
          img_provider: ($('#ex-img-provider')||{}).value || MAANEWS.defaults.imgProvider,
          img_model:    ($('#ex-img-model')||{}).value    || MAANEWS.defaults.imgModel,
          ai_provider: provider,
          ai_model: $('#ex-ai-model').value,

          style: $('#ex-news-style').value,
          lang: $('#ex-news-lang').value,
          country: $('#ex-news-country').value,
          use_custom_prompt: $('#ex-use-custom-prompt').checked ? 1 : 0,
          custom_prompt: $('#ex-custom-prompt').value || '',
          feed_id: $('#feed-id').value || '',
          feed_name: inferredName,
          extras: extras,

          post_status: ($('#ex-post-status')||{}).value || ($('#post-status')||{}).value || 'publish',
          post_author: parseInt( (($('#ex-post-author')||{}).value || ($('#post-author')||{}).value || '0'), 10) || 0,
          post_cats: (document.querySelector('#ex-post-cats') ? getSelectedCategories('#ex-post-cats') : getSelectedCategories('#post-cats'))
        };

        const res = await wp.apiFetch({url: MAANEWS.restPublish, method:'POST', data});
        if(res && res.post_id){
          toast('Publicado ID '+res.post_id);
          notice('Artigo enviado para a publicação com sucesso (ID '+res.post_id+').','success');
        } else if (res && res.skipped === 'duplicate') {
          alert('Nada foi publicado: notícia já havia sido trabalhada (duplicado).');
        } else {
          alert('Nada foi publicado.');
        }
      }catch(err){
        console.error('MAA/publish-from-extract error', err);
        alert('Falha ao publicar: '+(err.message||'erro'));
      }
      clearBusy(b);
    }

    if(b.id==='hist-prev'){ if(HIST.page>1) loadHistory(HIST.page-1); }
    if(b.id==='hist-next'){ if(HIST.page<HIST.pages) loadHistory(HIST.page+1); }
    if(b.id==='history-refresh'){ loadHistory(HIST.page||1); }
    if(b.id==='history-clear'){
      if(!confirm('Tem certeza que deseja apagar TODO o histórico? Esta ação não pode ser desfeita.')) return;
      try{
        await wp.apiFetch({url: MAANEWS.restHistoryClear, method:'POST', data:{}});
        loadHistory(1); toast('Histórico limpo.');
      }catch(err){ console.error('MAA/history clear',err); alert('Falha ao limpar histórico'); }
    }
  });

  document.addEventListener('DOMContentLoaded', function(){
    populateAuthorsAndCats();
    resetForm();
    refreshFeeds();
    loadHistory(1);
  });
})();
JS;

        wp_add_inline_script('maa-news-pro-js', $inline, 'after');
    }

    public static function render_admin_tab(){
        $def = self::get_settings();
        $prov = $def['default_ai_provider'];
        ?>
        <style>
        .maa-news .card{ overflow:hidden; }
        .maa-news table.widefat{ table-layout:fixed; }
        .maa-news table.widefat td, .maa-news table.widefat th{ word-break:break-word; overflow-wrap:anywhere; }
        .maa-news .toolbar{ display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .maa-news .toolbar .right{ display:flex; gap:8px; align-items:center; }
        .maa-news .muted{ color:#6b7280; }
        .maa-news .tiny{ font-size:12px; }
        .maa-news .btn.danger{ background:#ef4444; color:#fff; }
        .maa-news .btn.secondary{ background:#f3f4f6; }
        .maa-news .grid-2-col{ display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); grid-auto-flow: dense; gap:16px; align-items:start; }
        .maa-news .flex{ display:flex; }
        .maa-news .gap-6{ gap:6px; }

        .maa-notice{ padding:10px 12px; margin:8px 0; border-radius:6px; border:1px solid; transition:opacity .4s ease; }
        .maa-notice.success{ background:#ecfdf5; border-color:#34d399; color:#065f46; }
        .maa-notice.error{ background:#fef2f2; border-color:#fca5a5; color:#7f1d1d; }
        .maa-notice.hide{ opacity:0; }
        </style>

        <div class="maa-news">
          <div class="grid-2-col">
              <div class="card" id="diffbot-card" style="grid-column:1 / span 2;">
  <h3>Token da API Diffbot</h3>
  <p class="muted tiny">
    Cole aqui o token da sua conta Diffbot.
  </p>

  <div class="grid-2">
    <div>
      <label>Token Diffbot</label>
      <input
        id="diffbot-token"
        type="password"
        style="width:100%;"
        placeholder="Cole aqui seu token Diffbot"
        value="<?php echo esc_attr( $def['diffbot_token'] ?? '' ); ?>"
      />
      <div class="muted tiny">
  <a href="https://app.diffbot.com/login/" target="_blank" rel="noopener noreferrer">
    clique aqui para gerar seu token gratuitamente
  </a>
</div>
    </div>
  </div>
  <!-- NOVO: botão de salvar o token -->
  <div class="actions mt">
    <button class="btn primary" id="save-diffbot-token">Salvar token</button>
  </div>
</div>

            <div class="card" id="feed-card" style="grid-column:1 / span 1;">
              <h3>Cadastrar / Editar feed</h3>
              <input type="hidden" id="feed-id" />
              <div class="grid-2">
                <div>
                  <label>Nome da fonte</label>
                  <input id="feed-name" type="text" placeholder="Ex.: BBC Brasil" />
                </div>
                <div>
                  <label>URL do RSS/Atom</label>
                  <input id="feed-url" type="url" placeholder="https://site.com/feed" />
                </div>
              </div>

              <div class="grid-4">
                <div>
                  <label>Intervalo entre publicações (min)</label>
                  <input id="feed-interval" type="number" min="5" step="1" value="30" />
                </div>
                <div>
                  <label>Ativo de</label>
                  <input id="feed-active-from" type="time" value="06:00" />
                </div>
                <div>
                  <label>até</label>
                  <input id="feed-active-to" type="time" value="23:59" />
                </div>
                <div>
                  <label>Janela de busca (H)</label>
                  <input id="feed-max-age" type="number" min="1" step="1" value="24" />
                </div>
              </div>

              <div class="grid-3">
                <div>
                  <label>Publicação</label>
                  <select id="pub-mode">
                    <option value="ai">Reescrever com IA</option>
                  </select>
                </div>
                <div>
                  <label>Imagem</label>
                  <select id="img-mode">
                    <option value="source">Usar da fonte</option>
                    <option value="ai">Gerar com IA</option>
                    <option value="none">Sem imagem</option>
                  </select>
                </div>
                <div id="img-quality-wrap">
                  <label>Qualidade da imagem (IA)</label>
                  <select id="img-quality">
                    <option value="low" selected>Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <div class="muted tiny">Low ≈ US$0,01 • Medium ≈ US$0,04 • High ≈ US$0,17</div>
                </div>
              </div>
              <div class="grid-2" id="img-ai-wrap" style="display:none;">
                <div>
                  <label>IA da imagem</label>
                  <select id="img-provider">
                    <option value="gemini">Gemini (Google)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>
                <div>
                  <label>Modelo de imagem</label>
                  <select id="img-model"></select>
                  <div class="muted tiny">Usado apenas quando "Gerar com IA" estiver selecionado.</div>
                </div>
              </div>

              <div class="grid-3">
                <div>
                  <label>Status do post</label>
                  <select id="post-status">
                    <option value="publish">Publicado</option>
                    <option value="draft">Rascunho</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>
                <div>
                  <label>Autor</label>
                  <select id="post-author"></select>
                </div>
                <div>
                  <label>Categorias</label>
                  <select id="post-cats" multiple size="4" style="min-height:94px"></select>
                  <div class="muted tiny">Segure Ctrl/Cmd para selecionar várias</div>
                </div>
              </div>

              <div class="grid-3" id="ai-wrap">
                <div>
                  <label>IA</label>
                  <div class="seg">
                    <label><input type="radio" name="ai-provider" value="gemini" <?php checked($prov,'gemini'); ?>/> Gemini (Google)</label>
                    <label><input type="radio" name="ai-provider" value="openai" <?php checked($prov,'openai'); ?>/> OpenAI</label>
                  </div>
                </div>
                <div>
                  <label>Modelo</label>
                  <select id="ai-model"></select>
                </div>
                <div>
                  <label>Estilo</label>
                  <select id="news-style">
                    <option value="conteudo_viral_padrao">Conteúdo viral padrão</option>
                    <option value="jornalistico">Jornalistico</option>
                    <option value="artigo_blog">Artigo de blog</option>
                    <option value="noticia_curta">Notícia curta</option>
                    <option value="review">Review</option>
                    <option value="nota">Nota</option>
                  </select>
                </div>
              </div>

              <div class="grid-2">
                <div>
                  <label>Idioma</label>
                  <input id="news-lang" type="text" value="<?php echo esc_attr($def['default_lang']); ?>" />
                </div>
                <div>
                  <label>País</label>
                  <input id="news-country" type="text" value="<?php echo esc_attr($def['default_country']); ?>" />
                </div>
              </div>

              <label class="inline">
                <input type="checkbox" id="feed-active" />
                <span>Ativar feed</span>
              </label>

              <div class="mt">
                <label class="inline">
                  <input type="checkbox" id="use-custom-prompt" />
                  <strong>Usar prompt personalizado</strong>
                </label>
                <textarea id="custom-prompt" rows="8" style="display:none"></textarea>
              </div>

              <div class="actions mt">
                <button class="btn primary" id="save-feed">Salvar feed</button>
              </div>
            </div>

            <div class="card" id="extract-card" style="grid-column:2 / span 1;">
              <h3>Extrair conteúdo de link</h3>
              <div class="grid-4">
                <input id="extract-url" type="url" placeholder="Cole o link da matéria" />
                <button class="btn" id="extract-go">Extrair</button>
                <button class="btn secondary" id="extract-close" style="display:none">Fechar prévia</button>
                <button class="btn primary" id="publish-from-extract" disabled>Publicar a partir da extração</button>
              </div>

              <div class="mt">
                <label>Pauta (título do artigo)</label>
                <input id="ex-pauta" type="text" placeholder="Será preenchido com o título extraído. Edite se quiser." />
              </div>

              <div class="grid-3 mt">
                <div>
                  <label>Publicação</label>
                  <select id="ex-pub-mode">
                    <option value="ai">Reescrever com IA</option>
                  </select>
                </div>
                <div>
                  <label>Imagem</label>
                  <select id="ex-img-mode">
                    <option value="source">Usar da fonte</option>
                    <option value="ai">Gerar com IA</option>
                    <option value="none">Sem imagem</option>
                  </select>
                </div>
                <div id="ex-img-quality-wrap">
                  <label>Qualidade da imagem (IA)</label>
                  <select id="ex-img-quality">
                    <option value="low" selected>Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <div class="muted tiny">Low ≈ US$0,01 • Medium ≈ US$0,04 • High ≈ US$0,17</div>
                </div>
              </div>
              <div class="grid-2" id="ex-img-ai-wrap" style="display:none;">
                <div>
                  <label>IA da imagem</label>
                  <select id="ex-img-provider">
                    <option value="gemini">Gemini (Google)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>
                <div>
                  <label>Modelo de imagem</label>
                  <select id="ex-img-model"></select>
                </div>
              </div>

              <div class="grid-3" id="ex-ai-wrap">
                <div>
                  <label>IA</label>
                  <div class="seg">
                    <label><input type="radio" name="ex-ai-provider" value="gemini" <?php checked($prov,'gemini'); ?>/> Gemini (Google)</label>
                    <label><input type="radio" name="ex-ai-provider" value="openai" <?php checked($prov,'openai'); ?>/> OpenAI</label>
                  </div>
                </div>
                <div>
                  <label>Modelo</label>
                  <select id="ex-ai-model"></select>
                </div>
                <div>
                  <label>Estilo</label>
                  <select id="ex-news-style">
                    <option value="conteudo_viral_padrao">Conteúdo viral padrão</option>
                    <option value="jornalistico">Jornalistico</option>
                    <option value="artigo_blog">Artigo de blog</option>
                    <option value="noticia_curta">Notícia curta</option>
                    <option value="review">Review</option>
                    <option value="nota">Nota</option>
                  </select>
                </div>
              </div>

              <div class="grid-3">
                <div>
                  <label>Status do post</label>
                  <select id="ex-post-status">
                    <option value="publish">Publicado</option>
                    <option value="draft">Rascunho</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>
                <div>
                  <label>Autor</label>
                  <select id="ex-post-author"></select>
                </div>
                <div>
                  <label>Categorias</label>
                  <select id="ex-post-cats" multiple size="4" style="min-height:94px"></select>
                  <div class="muted tiny">Segure Ctrl/Cmd para selecionar várias</div>
                </div>
              </div>

              <div class="grid-2">
                <div>
                  <label>Idioma</label>
                  <input id="ex-news-lang" type="text" value="<?php echo esc_attr($def['default_lang']); ?>" />
                </div>
                <div>
                  <label>País</label>
                  <input id="ex-news-country" type="text" value="<?php echo esc_attr($def['default_country']); ?>" />
                </div>
              </div>

              <div class="mt">
                <label class="inline">
                  <input type="checkbox" id="ex-use-custom-prompt" />
                  <strong>Usar prompt personalizado</strong>
                </label>
                <textarea id="ex-custom-prompt" rows="6" style="display:none"></textarea>
              </div>

              <div id="extract-result" class="muted mt"></div>

              <div class="extract-preview mt">
                <div><strong id="extract-title"></strong><div class="muted" id="extract-desc"></div></div>
                <div id="extract-image" class="mt"></div>
                <pre id="extract-content" class="pre"></pre>
              </div>
              <input type="hidden" id="extract-payload" />

              <hr class="mt" />
              <h4>Fontes adicionais</h4>
              <p class="muted tiny">Você pode adicionar até 2 fontes extras.</p>
              <div id="ex-sources" class="mt">
                <div class="muted tiny">Nenhuma fonte adicional adicionada ainda.</div>
              </div>
              <div class="mt">
                <button class="btn" id="ex-add-source">Adicionar fonte</button>
              </div>
            </div>

            <div class="card" id="feeds-card" style="grid-column:1 / span 1;">
              <h3>Feeds cadastrados</h3>
              <div id="maa-news-feeds" class="feeds"></div>
            </div>
          </div>

          <div class="card">
            <div class="toolbar">
              <h3>Histórico</h3>
              <div class="right">
                <button class="btn secondary" id="history-refresh">Atualizar</button>
                <button class="btn danger" id="history-clear">Limpar histórico</button>
                <span class="muted tiny">Página <span id="hist-page">1</span> de <span id="hist-pages">1</span></span>
                <button class="btn tiny" id="hist-prev">&lt; Anterior</button>
                <button class="btn tiny" id="hist-next">Próxima &gt;</button>
              </div>
            </div>
            <table id="hist-table" class="widefat striped"></table>
          </div>
        </div>
        <?php
    }

    /** ============ REST ============ */
    public static function register_rest(){
        register_rest_route(self::REST_NS, '/feeds', [
            'methods' => 'GET',
            'callback' => function(){
                $feeds = array_values(self::get_feeds());
                foreach ($feeds as &$f){ $f['next_due'] = self::human_next_due($f); }
                return new WP_REST_Response($feeds, 200);
            },
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
        ]);
register_rest_route(self::REST_NS, '/settings', [
    'methods'  => 'POST',
    'callback' => [__CLASS__, 'rest_save_settings'],
    'permission_callback' => function(){
        return current_user_can('manage_options');
    },
]);

        register_rest_route(self::REST_NS, '/feed/save', [
            'methods' => 'POST',
            'callback' => [__CLASS__, 'rest_save_feed'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
        ]);

        register_rest_route(self::REST_NS, '/feed/delete', [
            'methods' => 'POST',
            'callback' => function(WP_REST_Request $r){
                $id = sanitize_text_field($r->get_param('id') ?? '');
                $feeds = self::get_feeds();
                if (!isset($feeds[$id])) return new WP_Error('nf','Feed não encontrado',['status'=>404]);
                unset($feeds[$id]);
                self::save_feeds($feeds);
                self::log('feed_delete', ['id'=>$id]);
                return ['ok'=>1];
            },
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
        ]);

        register_rest_route(self::REST_NS, '/feed/toggle', [
            'methods' => 'POST',
            'callback' => function(WP_REST_Request $r){
                $id = sanitize_text_field($r->get_param('id') ?? '');
                $feeds = self::get_feeds();
                if (!isset($feeds[$id])) return new WP_Error('nf','Feed não encontrado',['status'=>404]);

                $feeds[$id]['active'] = empty($feeds[$id]['active']) ? 1 : 0;

                if (!empty($feeds[$id]['active'])) {
                    $now = current_time('timestamp');
                    $interval = max(5, intval($feeds[$id]['interval_minutes'] ?? 30)) * 60;
                    $next = $now + $interval;
                    if ( ! self::is_within_active_window($feeds[$id]) ) {
                        $next = self::next_window_start_ts($feeds[$id], $now);
                    }
                    $feeds[$id]['next_due_ts'] = $next;
                } else {
                    $feeds[$id]['next_due_ts'] = 0;
                }

                self::save_feeds($feeds);
                self::log('feed_toggle', ['id'=>$id, 'active'=>$feeds[$id]['active']]);
                return ['ok'=>1,'active'=>$feeds[$id]['active']];
            },
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
        ]);

        register_rest_route(self::REST_NS, '/feed/scan', [
            'methods' => 'POST',
            'callback' => [__CLASS__, 'rest_scan_feed'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
        ]);

        register_rest_route(self::REST_NS, '/extract', [
            'methods' => 'POST',
            'callback' => [__CLASS__, 'rest_extract'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => ['url'=>['type'=>'string','required'=>true]],
        ]);

        register_rest_route(self::REST_NS, '/publish', [
            'methods' => 'POST',
            'callback' => [__CLASS__, 'rest_publish_from_extract'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
        ]);

        register_rest_route(self::REST_NS, '/history', [
            'methods' => 'GET',
            'callback' => [__CLASS__, 'rest_history_list'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => [
                'offset'=>['type'=>'integer','required'=>false,'default'=>0],
                'limit' =>['type'=>'integer','required'=>false,'default'=>20],
            ],
        ]);

        register_rest_route(self::REST_NS, '/history/clear', [
            'methods' => 'POST',
            'callback' => function(){
                self::clear_history(); return ['ok'=>1];
            },
            'permission_callback' => function(){
                return current_user_can('manage_options') || current_user_can('edit_others_posts');
            },
        ]);
    }
public static function rest_save_settings(WP_REST_Request $r){
    $settings = self::get_settings();

    if ($r->has_param('diffbot_token')) {
        $settings['diffbot_token'] = trim((string) $r->get_param('diffbot_token'));
    }

    self::save_settings($settings);

    return [
        'ok' => 1,
    ];
}

    public static function rest_no_cache_headers($served, $result, $request, $server){
        $route = $request->get_route();
        if (strpos($route, '/' . self::REST_NS . '/') !== false || strpos($route, self::REST_NS) !== false) {
            nocache_headers();
            header('Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0');
            header('Pragma: no-cache');
            header('Expires: Wed, 11 Jan 1984 05:00:00 GMT');
            header('X-LiteSpeed-Cache-Control: no-cache');
            header('Vary: Cookie');
            do_action('litespeed_control_set_nocache');
        }
        return $served;
    }

    /** Salvar feed (garante next_due_ts por feed) */
    public static function rest_save_feed(WP_REST_Request $r){
        $url = esc_url_raw( $r->get_param('url') ?? '' );
        if (!$url) { return new WP_Error('missing_url','Informe a URL do feed.',['status'=>400]); }
        $p = wp_parse_url($url);
        if (!$p || empty($p['scheme']) || !in_array($p['scheme'], ['http','https'], true)) {
            return new WP_Error('invalid_url','URL inválida ou sem http/https.',['status'=>400]);
        }

        // Token Diffbot vindo do admin (campo global)
        $diffbot_token = (string) $r->get_param('diffbot_token');
        $settings = self::get_settings();
        $settings['diffbot_token'] = trim($diffbot_token);
        self::save_settings($settings);

        $name = sanitize_text_field($r->get_param('name') ?? '');
        $interval_min = max(5, intval($r->get_param('interval_minutes') ?? 30));
        $active_from = sanitize_text_field($r->get_param('active_from') ?? '06:00');
        $active_to   = sanitize_text_field($r->get_param('active_to')   ?? '23:59');
        $max_age_hours = max(1, intval($r->get_param('max_age_hours') ?? 24));
        $active = intval($r->get_param('active') ?? 0);

        $post_status = sanitize_text_field($r->get_param('post_status') ?? 'publish');
        if (!in_array($post_status, ['publish','draft','pending'], true)) $post_status = 'publish';
        $post_author = intval($r->get_param('post_author') ?? get_current_user_id());
        $cats_in = $r->get_param('post_cats'); $post_cats = [];
        if (is_array($cats_in)) {
            foreach ($cats_in as $cid) { $cid = intval($cid); if ($cid>0) $post_cats[] = $cid; }
        }

                $pub_mode    = sanitize_text_field($r->get_param('pub_mode') ?? 'ai');
        $img_mode    = sanitize_text_field($r->get_param('img_mode') ?? 'source');
        $img_quality = sanitize_text_field($r->get_param('img_quality') ?? self::IMG_Q_DEFAULT);

        // NOVO: provedor/modelo de imagem
        $img_provider = sanitize_text_field(
            $r->get_param('img_provider') ?? ($settings['default_img_provider'] ?? 'openai')
        );
        $img_model    = sanitize_text_field(
            $r->get_param('img_model') ?? ($settings['default_img_model'] ?? 'gpt-image-1')
        );

        $ai_provider = sanitize_text_field($r->get_param('ai_provider') ?? 'gemini');
        $ai_model    = sanitize_text_field($r->get_param('ai_model') ?? 'gemini-2.5-flash-lite');

        $style   = sanitize_text_field($r->get_param('style') ?? 'conteudo_viral_padrao');
        $lang    = sanitize_text_field($r->get_param('lang') ?? 'pt-BR');
        $country = sanitize_text_field($r->get_param('country') ?? 'Brasil');
        $use_custom    = intval($r->get_param('use_custom_prompt') ?? 0);
        $custom_prompt = wp_kses_post($r->get_param('custom_prompt') ?? '');

        $feeds = self::get_feeds();
        $editing_id = sanitize_text_field($r->get_param('id') ?? '');
        $is_edit = $editing_id && isset($feeds[$editing_id]);

        $dup_id = self::find_feed_id_by_url($url);
        if ($dup_id && (!$is_edit || $dup_id !== $editing_id)) {
            return new WP_Error('duplicate_url','Já existe um feed com essa URL.',['status'=>409]);
        }

        if (!$name) {
            $host = parse_url($url, PHP_URL_HOST);
            $name = $host ?: 'Feed';
        }

        if ($is_edit){
            $id = $editing_id; $last_run = intval($feeds[$id]['last_run'] ?? 0);
        } else {
            $id = self::make_feed_id($name, $url); $last_run = 0;
        }

        $now = current_time('timestamp');
        $interval_sec = $interval_min * 60;

        if ($is_edit) {
            $next_due_ts = intval($feeds[$id]['next_due_ts'] ?? 0);
            if (!empty($active)) {
                if ($next_due_ts <= 0) {
                    $next_due_ts = $now + $interval_sec;
                    $tmpF = ['active_from'=>$active_from, 'active_to'=>$active_to];
                    if ( ! self::is_within_active_window($tmpF) ) {
                        $next_due_ts = self::next_window_start_ts($tmpF, $now);
                    }
                }
            } else {
                $next_due_ts = 0;
            }
        } else {
            if (!empty($active)) {
                $next_due_ts = $now + $interval_sec;
                $tmpF = ['active_from'=>$active_from, 'active_to'=>$active_to];
                if ( ! self::is_within_active_window($tmpF) ) {
                    $next_due_ts = self::next_window_start_ts($tmpF, $now);
                }
            } else {
                $next_due_ts = 0;
            }
        }

        $feed = [
            'id' => $id, 'name' => $name, 'url' => $url,
            'interval_minutes' => $interval_min,
            'active_from' => $active_from, 'active_to' => $active_to,
            'max_age_hours' => $max_age_hours, 'active' => $active,

            'post_status' => $post_status,
            'post_author' => $post_author,
            'post_cats'   => $post_cats,

                        'pub_mode'    => $pub_mode,
            'img_mode'    => $img_mode,
            'img_quality' => $img_quality,
            'img_provider'=> $img_provider,
            'img_model'   => $img_model,
            'ai_provider' => $ai_provider,
            'ai_model'    => $ai_model,

            'style' => $style,
            'lang'  => $lang,
            'country'=> $country,
            'use_custom_prompt'=> $use_custom,
            'custom_prompt' => $custom_prompt,
            'last_run' => $last_run,

            'next_due_ts' => intval($next_due_ts),
        ];

        $feeds[$id] = $feed;
        self::save_feeds($feeds);
        self::log('feed_save_ok', ['id'=>$id, 'name'=>$name, 'is_edit'=>$is_edit?1:0, 'next_due'=>date_i18n('H:i', $next_due_ts)]);
        return ['ok'=>1,'id'=>$id,'edited'=>$is_edit?1:0];
    }

    /**
     * Extrai artigo usando Diffbot Article API
     * Retorna um array normalizado que serve tanto para a prévia
     * quanto para o publish_from_extract.
     */
    protected static function extract_with_diffbot($url){
        $url = esc_url_raw((string)$url);
        if (!$url) {
            return new WP_Error('invalid_url', 'URL inválida.', ['status' => 400]);
        }

        $settings = self::get_settings();
        $token = trim($settings['diffbot_token'] ?? '');
        if (!$token) {
            return new WP_Error(
                'no_diffbot_token',
                'Configure o token da API Diffbot em Notícias Automáticas antes de extrair artigos.',
                ['status' => 400]
            );
        }

        $api_url = add_query_arg([
            'token' => $token,
            'url'   => $url,
        ], self::DIFFBOT_ENDPOINT);

        $resp = wp_remote_get($api_url, [
            'timeout' => 90,
            'headers' => [
                'Accept' => 'application/json',
            ],
        ]);

        if (is_wp_error($resp)) {
            return new WP_Error(
                'diffbot_http_error',
                'Erro ao chamar a API Diffbot: '.$resp->get_error_message(),
                ['status' => 500]
            );
        }

        $code = wp_remote_retrieve_response_code($resp);
        $body = wp_remote_retrieve_body($resp);

        if ($code !== 200) {
            $json_err = json_decode($body, true);
            $msg = '';
            if (is_array($json_err)) {
                $msg = $json_err['error'] ?? $json_err['errorMessage'] ?? '';
            }
            if (!$msg) {
                $msg = 'Diffbot retornou HTTP '.$code;
            }
            return new WP_Error('diffbot_bad_status', $msg, ['status' => $code]);
        }

        $json = json_decode($body, true);
        if (!is_array($json) || empty($json['objects']) || empty($json['objects'][0])) {
            return new WP_Error(
                'diffbot_bad_payload',
                'Resposta inesperada da Diffbot (sem objeto de artigo).',
                ['status' => 500]
            );
        }

        $obj = $json['objects'][0];

             $obj = $json['objects'][0];

        // HTML bruto do artigo vindo da Diffbot
        $html = isset($obj['html']) ? (string)$obj['html'] : '';
        $text = isset($obj['text']) ? (string)$obj['text'] : '';

        // 1ª tentativa: pegar a imagem da <figure> do HTML (capa correta)
        $primary_img = '';
        if ($html) {
            $primary_img = self::extract_figure_image_src(
                $html,
                $obj['pageUrl'] ?? $url
            );
        }

        // 2ª tentativa (fallback): usar lista de imagens da Diffbot
        if (!$primary_img && !empty($obj['images']) && is_array($obj['images'])) {
            foreach ($obj['images'] as $img) {
                if (!empty($img['primary']) && !empty($img['url'])) {
                    $primary_img = $img['url'];
                    break;
                }
            }
            if (!$primary_img) {
                foreach ($obj['images'] as $img) {
                    if (!empty($img['url'])) {
                        $primary_img = $img['url'];
                        break;
                    }
                }
            }
        }

        // Depois de capturar a capa, removemos as imagens internas do corpo
        if ($html) {
            $html = self::remove_inline_images($html);
        }

        if (!$text && $html) {
            $text = wp_strip_all_tags($html);
        }

        // Gera uma descrição curta a partir do texto
        $description = '';
        if ($text) {
            $plain = trim(preg_replace('/\s+/', ' ', $text));
            if (function_exists('mb_substr')) {
                $description = mb_substr($plain, 0, 320);
            } else {
                $description = substr($plain, 0, 320);
            }
        }

        $out = [
            'url'           => $obj['pageUrl'] ?? $url,
            'resolved_url'  => $obj['resolvedPageUrl'] ?? '',
            'title'         => $obj['title'] ?? '',
            'description'   => $description,

            'content_html'  => $html ?: ( $text ? '<p>'.esc_html($text).'</p>' : '' ),
            'content_text'  => $text,

            'image'         => $primary_img,
            'images'        => $obj['images'] ?? [],

            'author'        => $obj['author'] ?? '',
            'author_url'    => $obj['authorUrl'] ?? '',
            'site_name'     => $obj['siteName'] ?? '',
            'icon'          => $obj['icon'] ?? '',
            'date'          => $obj['date'] ?? '',
            'humanLanguage' => $json['humanLanguage'] ?? ($obj['humanLanguage'] ?? ''),

            'tags'          => $obj['tags'] ?? [],
            'categories'    => $obj['categories'] ?? [],

            'diffbot_raw'   => $obj,
        ];

        return $out;
    }

    public static function rest_scan_feed(WP_REST_Request $r){
        $id = sanitize_text_field($r->get_param('id') ?? '');
        $feeds = self::get_feeds();
        if (!isset($feeds[$id])) return new WP_Error('nf','Feed não encontrado',['status'=>404]);
        $res = self::scan_and_maybe_publish($feeds[$id], true);
        return $res ? $res : ['ok'=>1];
    }

    /**
     * REST: extrair conteúdo de um link usando Diffbot
     */
    public static function rest_extract(WP_REST_Request $r){
        $url = $r->get_param('url');
        $res = self::extract_with_diffbot($url);

        if (is_wp_error($res)) {
            $data = $res->get_error_data();
            $status = 500;
            if (is_array($data) && isset($data['status']) && is_int($data['status'])) {
                $status = $data['status'];
            }
            return new WP_Error(
                $res->get_error_code(),
                $res->get_error_message(),
                ['status' => $status]
            );
        }

        return new WP_REST_Response($res, 200);
    }

    public static function rest_publish_from_extract(WP_REST_Request $r){
        $src = $r->get_param('src');
        if (!is_array($src) || empty($src['url'])) return new WP_Error('bad','payload inválido',['status'=>400]);

        $pauta = sanitize_text_field($r->get_param('pauta') ?? ($src['title'] ?? ''));
                $cfg = [
            'pauta' => $pauta,
            'pub_mode'    => sanitize_text_field($r->get_param('pub_mode') ?? 'ai'),
            'img_mode'    => sanitize_text_field($r->get_param('img_mode') ?? 'source'),
            'img_quality' => sanitize_text_field($r->get_param('img_quality') ?? self::IMG_Q_DEFAULT),
            'img_provider'=> sanitize_text_field($r->get_param('img_provider') ?? 'openai'),
            'img_model'   => sanitize_text_field($r->get_param('img_model')   ?? 'gpt-image-1'),
            'ai_provider' => sanitize_text_field($r->get_param('ai_provider') ?? 'gemini'),
            'ai_model'    => sanitize_text_field($r->get_param('ai_model')    ?? 'gemini-2.5-flash-lite'),

            'style' => sanitize_text_field($r->get_param('style') ?? 'conteudo_viral_padrao'),
            'lang'  => sanitize_text_field($r->get_param('lang') ?? 'pt-BR'),
            'country'=> sanitize_text_field($r->get_param('country') ?? 'Brasil'),
            'use_custom_prompt' => intval($r->get_param('use_custom_prompt') ?? 0),
            'custom_prompt' => wp_kses_post($r->get_param('custom_prompt') ?? ''),
            'feed_id'   => sanitize_text_field($r->get_param('feed_id') ?? ''),
            'feed_name' => sanitize_text_field($r->get_param('feed_name') ?? ''),

            'post_status'=> (in_array($r->get_param('post_status'),['publish','draft','pending'],true) ? $r->get_param('post_status') : 'publish'),
            'post_author'=> intval($r->get_param('post_author') ?? 0),
            'post_cats'  => array_map('intval', (array)$r->get_param('post_cats')),
        ];
        if (empty($cfg['feed_name'])) { $cfg['feed_name'] = parse_url($src['url'], PHP_URL_HOST) ?: ''; }

        $extras = $r->get_param('extras'); $extraTexts = [];
        if (is_array($extras)){
            foreach ($extras as $ex){
                if (count($extraTexts)>=2) break;
                $kind = sanitize_text_field($ex['kind'] ?? '');
                if ($kind==='url'){
                    $u = esc_url_raw($ex['url'] ?? '');
                    if ($u){
                        $x = self::extract_with_diffbot($u);
                        if (!is_wp_error($x) && !empty($x['content_html'])){
                            $extraTexts[] = wp_strip_all_tags($x['content_html']);
                        } elseif (!empty($ex['text'])) {
                            $extraTexts[] = wp_strip_all_tags($ex['text']);
                        }
                    }
                } elseif ($kind==='text' && !empty($ex['text'])){
                    $extraTexts[] = wp_strip_all_tags($ex['text']);
                }
            }
        }
        $cfg['extra_sources'] = $extraTexts;

               if ( self::history_has($src['url']) ) {
    self::log('publish_skip_duplicate', ['url'=>$src['url']]);
    return ['ok'=>1, 'skipped'=>'duplicate'];
}

// Primeiro tenta gerar o post normalmente
$post_id = self::produce_post_from_extract($src, $cfg);
if (is_wp_error($post_id)) {
    return $post_id;
}

// Só depois de criar o post com sucesso é que registramos no histórico
self::history_add([
    'feed_id'   => $cfg['feed_id'],
    'feed_name' => $cfg['feed_name'],
    'src_link'  => $src['url'],
    'post_id'   => $post_id,
    'post_title'=> $pauta ?: ($src['title'] ?? ''),
    'published' => current_time('timestamp'),
]);

self::log('publish_from_extract', ['post_id'=>$post_id,'feed'=>$cfg['feed_name']]);
return ['ok'=>1,'post_id'=> $post_id];


    }

    /** Histórico (GET com paginação) */
    public static function rest_history_list(WP_REST_Request $r){
        $offset = max(0, intval($r->get_param('offset') ?? 0));
        $limit  = max(1, min(100, intval($r->get_param('limit') ?? 20)));

        $hist = array_reverse(self::get_history()); // mais recentes primeiro
        $total = count($hist);
        $slice = array_slice($hist, $offset, $limit);

        $items = [];
        foreach ($slice as $h){
            $when_ts = 0;
            if (!empty($h['post_id'])) $when_ts = intval(get_post_time('U', false, $h['post_id']));
            if (!$when_ts) $when_ts = intval($h['published'] ?: $h['ts']);

            $items[] = [
                'when'       => date_i18n('d/m/Y H:i', $when_ts),
                'feed_name'  => $h['feed_name'] ?? '',
                'post_title' => $h['post_title'] ?? '',
                'src_link'   => $h['src_link'] ?? '',
                'post_id'    => intval($h['post_id'] ?? 0),
                'ts'         => $when_ts,
            ];
        }

        return [
            'total'  => $total,
            'offset' => $offset,
            'limit'  => $limit,
            'items'  => $items,
        ];
    }

    /** ============ CRON RUNNER (100% POR FEED) ============ */
    public static function cron_runner(){
        $feeds = self::get_feeds();
        $now = current_time('timestamp');
        $changed = false;

        foreach ($feeds as $id => $feed){
            if (empty($feed['active'])) continue;

            $interval = max(5, intval($feed['interval_minutes'] ?? 30)) * 60;
            $next = intval($feed['next_due_ts'] ?? 0);

            if ($next <= 0) {
                $next = $now + $interval;
                if ( ! self::is_within_active_window($feed) ) {
                    $next = self::next_window_start_ts($feed, $now);
                }
                $feeds[$id]['next_due_ts'] = $next;
                $changed = true;
                self::log('cron_bootstrap', ['feed'=>$feed['name'],'next'=>date_i18n('H:i',$next)]);
                continue;
            }

            if ($now < $next) {
                continue;
            }

            if ( ! self::is_within_active_window($feed) ) {
                $feeds[$id]['next_due_ts'] = self::next_window_start_ts($feed, $now);
                $changed = true;
                self::log('cron_outside_window', ['feed'=>$feed['name'],'resched'=>date_i18n('H:i',$feeds[$id]['next_due_ts'])]);
                continue;
            }

            $ok = self::scan_and_maybe_publish($feed, false);

            do { $next += $interval; } while ($next <= $now);
            $feeds[$id]['next_due_ts'] = $next;

            $feeds[$id]['last_run'] = $now;
            if (is_array($ok) && !empty($ok['post_id'])) {
                $feeds[$id]['last_pub'] = $now;
            }

            $changed = true;
            self::log('cron_run', [
                'feed' => $feed['name'],
                'ok'   => $ok ? 1 : 0,
                'next' => date_i18n('H:i', $feeds[$id]['next_due_ts'])
            ]);
        }

        if ($changed) self::save_feeds($feeds);
    }

    protected static function human_next_due($f){
        $t = intval($f['next_due_ts'] ?? 0);
        return $t ? date_i18n('H:i', $t) : '';
    }

    protected static function is_within_active_window($f){
        $from = self::hm_to_minutes($f['active_from'] ?? '00:00');
        $to   = self::hm_to_minutes($f['active_to']   ?? '23:59');
        $now = intval(current_time('timestamp'));
        $m = intval( date_i18n('G', $now) )*60 + intval( date_i18n('i', $now) );
        if ($from <= $to) return ($m >= $from && $m <= $to);
        return ($m >= $from || $m <= $to);
    }
    protected static function hm_to_minutes($hm){
        if (!preg_match('/^(\d{1,2}):(\d{2})$/',$hm,$m)) return 0;
        return min(1439, max(0, intval($m[1])*60 + intval($m[2])));
    }

    protected static function next_window_start_ts($f, $ref_ts){
        $from = self::hm_to_minutes($f['active_from'] ?? '00:00');
        $to   = self::hm_to_minutes($f['active_to']   ?? '23:59');

        $m = intval( date_i18n('G', $ref_ts) ) * 60 + intval( date_i18n('i', $ref_ts) );
        $base = strtotime( date_i18n('Y-m-d 00:00:00', $ref_ts) );

        if ($from <= $to) {
            if ($m < $from) return $base + $from * 60;
            return $base + DAY_IN_SECONDS + $from * 60;
        } else {
            if ($m > $to && $m < $from) return $base + $from * 60;
            return $base + DAY_IN_SECONDS + $from * 60;
        }
    }

    /** ============ CORE ============ */
protected static function scan_and_maybe_publish(array $feed, bool $manual){
    // Tenta adquirir lock para este feed (evita duas execuções paralelas)
    $feed_id = $feed['id'] ?? '';
    if (!self::acquire_feed_lock($feed_id)) {
        self::log('feed_lock_skip', [
            'feed_id'   => $feed_id,
            'feed_name' => $feed['name'] ?? '',
            'manual'    => $manual ? 1 : 0,
        ]);
        return null;
    }

    try {
        include_once ABSPATH.'wp-includes/feed.php';
        $rss = fetch_feed($feed['url']);
        if (is_wp_error($rss)) return null;

        $maxitems = $rss->get_item_quantity(20);
        $items    = $rss->get_items(0, $maxitems);
        if (!$items) return null;

        // Usa timestamp do WordPress (respeita fuso configurado no site)
        $now_ts  = current_time('timestamp');
        $max_age = max(1, intval($feed['max_age_hours'] ?? 24));
        $limit_ts = $now_ts - $max_age * HOUR_IN_SECONDS;

        $candidate = null;

        foreach ($items as $it){
            $link = $it->get_permalink();
            $ts   = intval($it->get_date('U'));

            // Aceita datas futuras sem bloquear publicação.
            // Só ignora itens realmente antigos (fora da janela configurada).
            if ($ts > 0 && $ts < $limit_ts) {
                continue;
            }

            if (self::history_has($link)) continue;

            $candidate = [
                'url'   => $link,
                'title' => wp_strip_all_tags($it->get_title()),
                'date'  => $ts,
            ];
            break;
        }

        if (!$candidate) return $manual ? ['preview'=>['title'=>'(nenhuma novidade)']] : null;

        $ext = self::extract_with_diffbot($candidate['url']);
        if (is_wp_error($ext) || !$ext) return null;

        $cfg = [
            'pauta' => $ext['title'] ?? '',
            'pub_mode'    => $feed['pub_mode'],
            'img_mode'    => $feed['img_mode'],
            'img_quality' => $feed['img_quality'] ?: self::IMG_Q_DEFAULT,
            'img_provider'=> $feed['img_provider'] ?? 'openai',
            'img_model'   => $feed['img_model']   ?? 'gpt-image-1',
            'ai_provider' => $feed['ai_provider'],
            'ai_model'    => $feed['ai_model'],
            'style'       => $feed['style'],
            'lang'        => $feed['lang'],
            'country'     => $feed['country'],

            'use_custom_prompt' => intval($feed['use_custom_prompt'] ?? 0),
            'custom_prompt'     => $feed['custom_prompt'] ?? '',
            'feed_id'   => $feed['id'],
            'feed_name' => $feed['name'],
            'extra_sources' => [],

            'post_status'=> (in_array($feed['post_status'],['publish','draft','pending'],true) ? $feed['post_status'] : 'publish'),
            'post_author'=> intval($feed['post_author'] ?? 0),
            'post_cats'  => array_map('intval',(array)($feed['post_cats'] ?? [])),
        ];

        if ( self::history_has($ext['url']) ) {
            return $manual ? ['preview'=>['title'=>'(duplicado)']] : null;
        }

        // Primeiro tenta gerar o post
        $post_id = self::produce_post_from_extract($ext, $cfg);
        if (is_wp_error($post_id)) {
            return $manual ? ['preview' => ['title' => '(erro ao publicar)']] : null;
        }

        // Só grava no histórico se o post foi criado com sucesso
        self::history_add([
            'feed_id'   => $feed['id'],
            'feed_name' => $feed['name'],
            'src_link'  => $ext['url'],
            'post_id'   => $post_id,
            'post_title'=> $ext['title'] ?? ($candidate['title'] ?? ''),
            'published' => $candidate['date'] ?: $now_ts,
        ]);

        return ['ok'=>1,'post_id'=>$post_id];
    } finally {
        // Libera o lock mesmo que dê erro em qualquer lugar
        self::release_feed_lock($feed_id);
    }
}


    /** gera post a partir de extração + cfg — sem preencher o RESUMO (post_excerpt) */
    protected static function produce_post_from_extract(array $src, array $cfg){
        $title  = $src['title'] ?: '(sem título)';
        $html   = $src['content_html'] ?: '<p></p>';
        $pauta  = !empty($cfg['pauta']) ? $cfg['pauta'] : $title;

        if ($cfg['pub_mode']==='source'){
            $host = parse_url($src['url'], PHP_URL_HOST);
            $credit = '<p><em>Fonte: <a href="'.esc_url($src['url']).'" target="_blank" rel="nofollow noopener">'. esc_html($host ?: ($cfg['feed_name']?:'link')).'</a></em></p>';
            $final_html = $html . "\n\n" . $credit;
        } else {
            $fonte1 = wp_strip_all_tags($html);
            $fonte2 = isset($cfg['extra_sources'][0]) ? (string)$cfg['extra_sources'][0] : '';
            $fonte3 = isset($cfg['extra_sources'][1]) ? (string)$cfg['extra_sources'][1] : '';
            $ai = self::rewrite_with_ai([
    'pauta'        => $pauta,
    'fonte'        => $fonte1,
    'fonte2'       => $fonte2,
    'fonte3'       => $fonte3,
    'style'        => $cfg['style'],
    'lang'         => $cfg['lang'],
    'country'      => $cfg['country'],
    'provider'     => $cfg['ai_provider'],
    'model'        => $cfg['ai_model'],
    'custom_prompt'=> $cfg['use_custom_prompt'] ? ($cfg['custom_prompt'] ?: '') : '',
]);
if (is_wp_error($ai)) return $ai;

/**
 * Prioridade do título:
 * 1) Título sugerido pela IA
 * 2) Pauta (caso você tenha editado manualmente em PT-BR)
 * 3) Título original da fonte (src['title'])
 */
if (!empty($ai['title'])) {
    $title = $ai['title'];
} elseif (!empty($pauta)) {
    $title = $pauta;
}

// Conteúdo final: usamos sempre o content_html "limpo".
// Só cai em raw se, por algum motivo, o parser não preencher content_html.
$final_html = !empty($ai['content_html']) ? $ai['content_html'] : $ai['raw'];

        }
// >>> NOVO: limpeza final do conteúdo
// 1) remove imagens internas (<img>, <figure>, etc.)
// 2) remove qualquer H1 ou parágrafo no início que repita o título do post
$final_html = self::remove_inline_images($final_html);
$final_html = self::strip_title_from_content($final_html, $title);

// Importante: NÃO definir post_excerpt
$postarr = [
            'post_type'   => 'post',
            'post_status' => (in_array($cfg['post_status'],['publish','draft','pending'],true) ? $cfg['post_status'] : 'publish'),
            'post_title'  => wp_strip_all_tags($title),
            'post_content'=> $final_html,
            // 'post_excerpt' => (removido propositalmente)
        ];
        if (!empty($cfg['post_author'])) $postarr['post_author'] = intval($cfg['post_author']);
        if (!empty($cfg['post_cats']))   $postarr['post_category'] = array_map('intval', (array)$cfg['post_cats']);

    $post_id = wp_insert_post($postarr, true);
    if (is_wp_error($post_id)) return $post_id;

    // Imagem destacada conforme escolha
    if ($cfg['img_mode']==='source' && !empty($src['image'])){
        $ref     = !empty($src['canonical']) ? $src['canonical'] : $src['url'];
        $img_res = self::attach_image_from_url($src['image'], $post_id, $title, $ref);

        if (is_wp_error($img_res)) {
    self::log('post_img_attach_error', [
        'post_id' => $post_id,
        'url'     => $src['image'],
        'code'    => $img_res->get_error_code(),
        'msg'     => $img_res->get_error_message(),
    ]);
}

    } elseif ($cfg['img_mode']==='ai') {
        $img_provider = $cfg['img_provider'] ?? 'openai';
        $img_model    = $cfg['img_model']    ?? '';
        $img_quality  = $cfg['img_quality']  ?? self::IMG_Q_DEFAULT;

        // Tenta usar o módulo PRO de imagens (suporta Gemini e OpenAI)
        // Chama generate_image_for_post() diretamente (sem checagem de permissão),
        // permitindo que funcione tanto via REST (manual) quanto via cron (sem usuário logado).
        if ( class_exists('MAA_PRO_Image_Module') && method_exists('MAA_PRO_Image_Module', 'generate_image_for_post') ) {
            $prompt = 'Capa horizontal 16:9, sem textos escritos, representando: ' . $title . '.';

            try {
                $res_img = MAA_PRO_Image_Module::generate_image_for_post(
                    $post_id,
                    $prompt,
                    '',            // keyword
                    $img_quality,
                    $img_provider,
                    $img_model
                );

                if ( is_wp_error( $res_img ) ) {
                    self::log('post_img_ai_error', [
                        'post_id'  => $post_id,
                        'provider' => $img_provider,
                        'model'    => $img_model,
                        'code'     => $res_img->get_error_code(),
                        'msg'      => $res_img->get_error_message(),
                    ]);
                }
            } catch ( \Throwable $e ) {
                self::log('post_img_ai_exception', [
                    'post_id' => $post_id,
                    'error'   => $e->getMessage(),
                ]);
            }

        } else {
            // Fallback: comportamento antigo (OpenAI direto), caso o módulo PRO de imagens não exista
            self::generate_featured_image_ai($post_id, $title, $img_quality);
        }
    }

    update_post_meta($post_id, '_maa_source_link',  esc_url_raw($src['url']));
    update_post_meta($post_id, '_maa_source_title', sanitize_text_field($src['title']));
    return $post_id;

    update_post_meta($post_id, '_maa_source_title', sanitize_text_field($src['title']));
    return $post_id;
}


    /** IA — providers Gemini/OpenAI */
    protected static function rewrite_with_ai(array $args){
        $provider = $args['provider'] ?: 'gemini';
        $model = $args['model'] ?: ($provider==='gemini' ? 'gemini-2.5-flash-lite' : 'gpt-5-mini');

        $prompt_tpl = self::base_prompt_text();
        if (!empty($args['custom_prompt'])) $prompt_tpl = (string) $args['custom_prompt'];

        $map = [
            '{{pauta}}' => (string)$args['pauta'],
            '{{fonte_conteudo1}}' => (string)$args['fonte'],
            '{{fonte_conteudo2}}' => (string)($args['fonte2'] ?? ''),
            '{{fonte_conteudo3}}' => (string)($args['fonte3'] ?? ''),
            '{{estilo}}' => (string)$args['style'],
            '{{palavra_chave_alvo}}' => '',
            '{{palavra-chave-alvo}}' => '',
            '{{idioma}}' => (string)$args['lang'],
            '{{pais}}' => (string)$args['country'],
        ];
        $user_prompt = strtr($prompt_tpl, $map);

        $system_prompt = '';
        if (class_exists('MAA_AutoArticles')) {
            $s = MAA_AutoArticles::get_settings();
            $system_prompt = $s['system_prompt'] ?? '';
        }

        if ($provider === 'gemini' || stripos($model, 'gemini') === 0) {
            if (!class_exists('MAA_Gemini_Module')) {
                return new WP_Error('gemini_missing','Módulo Gemini não encontrado.');
            }
            $resp = MAA_Gemini_Module::call( $model, $system_prompt, $user_prompt, [
                'temperature' => 0.7, 'topP' => 0.95, 'topK' => 40
            ]);
            if (is_wp_error($resp)) return $resp;
            $text = is_array($resp) ? ($resp['text'] ?? $resp['content'] ?? implode("\n",(array)$resp)) : (string)$resp;
        } else {
            $api_key = '';
            if (class_exists('MAA_AutoArticles')) {
                $s = MAA_AutoArticles::get_settings();
                $api_key = MAA_AutoArticles::decrypt_from_storage($s['openai_key_enc'] ?? '');
            }
            if (!$api_key) return new WP_Error('openai_key','Configure a OpenAI API key no MAA → Configurações ou selecione Gemini.');

            $payload = [
                'model' => $model,
                'messages' => [
                    ['role'=>'system','content'=>$system_prompt],
                    ['role'=>'user','content'=>$user_prompt],
                ],
            ];
            $res = wp_remote_post('https://api.openai.com/v1/chat/completions', [
                'headers'=>[
                    'Authorization' => 'Bearer '.$api_key,
                    'Content-Type' => 'application/json',
                ],
                'timeout'=> 90,
                'body' => wp_json_encode($payload),
            ]);
            if (is_wp_error($res)) return $res;
            $body = json_decode(wp_remote_retrieve_body($res), true);
            $text = $body['choices'][0]['message']['content'] ?? '';
        }
        return self::parse_ai_output($text);
    }

protected static function parse_ai_output($text){
    $original = (string) $text;
    $clean    = trim($original);

    // Remove cercas de código ```json ... ```
    $clean = preg_replace('/^```(json)?\s*/i', '', $clean);
    $clean = preg_replace('/```[\s\r\n]*$/', '', $clean);

    $out = [
        'title'        => '',
        'subtitle'     => '',
        'content_html' => '',
        'raw'          => $original,
    ];

    // 1) Tentativa padrão: JSON direto
    $json = json_decode($clean, true);

    // 2) Se falhar, pega apenas o trecho entre o primeiro "{" e o último "}"
    if (json_last_error() !== JSON_ERROR_NONE) {
        $start = strpos($clean, '{');
        $end   = strrpos($clean, '}');
        if ($start !== false && $end !== false && $end > $start) {
            $maybe = substr($clean, $start, $end - $start + 1);
            $json  = json_decode($maybe, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $clean = $maybe;
            }
        }
    }

    // 3) Se ainda assim não for JSON válido, tenta um parser "solto"
    if (!is_array($json) || json_last_error() !== JSON_ERROR_NONE) {
        $json = self::parse_ai_output_loose_object($clean);
    }

    // Se conseguimos pelo menos um array com campos úteis
    if (is_array($json)) {
        $title    = isset($json['title'])    ? wp_strip_all_tags($json['title'])    : '';
        $subtitle = isset($json['subtitle']) ? wp_strip_all_tags($json['subtitle']) : '';
        $html     = '';

        if (isset($json['content_html']) && $json['content_html'] !== '') {
            // content_html veio como string JSON (com \n, \")
            $html = self::unescape_json_string((string) $json['content_html']);
            $html = wp_kses_post($html);
        } elseif (isset($json['content']) && $json['content'] !== '') {
            // fallback: alguns prompts podem usar "content" em vez de "content_html"
            $tmp  = self::unescape_json_string((string) $json['content']);
            $html = wpautop( esc_html($tmp) );
        }

        // Remove do conteúdo um parágrafo que seja só o subtítulo (caso exista helper)
        if ($subtitle && $html && method_exists(__CLASS__, 'strip_subtitle_from_content')) {
            $html = self::strip_subtitle_from_content($html, $subtitle);
        }

        $out['title']        = $title;
        $out['subtitle']     = $subtitle;
        $out['content_html'] = $html;

        return $out;
    }

    // 4) Fallback final: não conseguimos interpretar JSON
    //    → limpamos trechos de chave:valor e exibimos apenas o texto "humano".
    $plain = self::cleanup_broken_json_text($clean);
    $out['content_html'] = wpautop( esc_html($plain) );

    return $out;
}


/**
 * Tenta extrair um "objeto" a partir de uma string com cara de JSON,
 * mesmo que ela esteja levemente quebrada (vírgulas sobrando, etc).
 */
protected static function parse_ai_output_loose_object($clean){
    $clean = trim((string) $clean);

    // Se nem contém "title" ou "content_html", provavelmente não é JSON da IA
    if (stripos($clean, 'title') === false && stripos($clean, 'content_html') === false) {
        return null;
    }

    $res = [];

    // title
    if (preg_match('~"title"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"~su', $clean, $m)) {
        $res['title'] = stripcslashes($m[1]);
    } elseif (preg_match("~'title'\s*:\s*'((?:[^'\\\\]|\\\\.)*)'~su", $clean, $m)) {
        $res['title'] = stripcslashes($m[1]);
    }

    // subtitle
    if (preg_match('~"subtitle"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"~su', $clean, $m)) {
        $res['subtitle'] = stripcslashes($m[1]);
    } elseif (preg_match("~'subtitle'\s*:\s*'((?:[^'\\\\]|\\\\.)*)'~su", $clean, $m)) {
        $res['subtitle'] = stripcslashes($m[1]);
    }

    // content_html
    if (preg_match('~"content_html"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"~su', $clean, $m)) {
        $res['content_html'] = stripcslashes($m[1]);
    } elseif (preg_match("~'content_html'\s*:\s*'((?:[^'\\\\]|\\\\.)*)'~su", $clean, $m)) {
        $res['content_html'] = stripcslashes($m[1]);
    }

    // Se não achou nada útil, aborta
    if (empty($res['title']) && empty($res['content_html']) && empty($res['subtitle'])) {
        return null;
    }

    return $res;
}

/**
 * Desescapa uma string vinda de JSON (converte \n, \r, \" etc).
 */
protected static function unescape_json_string($s){
    $s = (string) $s;
    // Quebras de linha e tabulação
    $s = str_replace(
        ["\\r\\n", "\\n", "\\r", "\\t"],
        ["\n",      "\n",  "\r",  "\t"],
        $s
    );
    // \" \\/ \\
    $s = stripcslashes($s);
    return $s;
}

/**
 * Quando o JSON está muito quebrado e não conseguimos decodificar,
 * removemos as linhas que são claramente chave:valor ("title":, "content_html": etc)
 * e deixamos só o texto que interessa para o usuário.
 */
protected static function cleanup_broken_json_text($text){
    $text = trim((string) $text);

    // Se for um grande bloco entre { ... }, vamos limpar linha a linha
    if (strlen($text) > 2 && $text[0] === '{' && substr($text, -1) === '}') {
        $lines      = preg_split('/\r\n|\r|\n/', $text);
        $cleanLines = [];

        foreach ($lines as $ln) {
            // pula linhas que claramente são campos de JSON
            if (preg_match('~^\s*"?(title|subtitle|content_html|slug|tags|meta_description|meta_title)"?\s*:~i', $ln)) {
                continue;
            }
            $cleanLines[] = $ln;
        }

        $text = trim(implode("\n", $cleanLines));
    }

    return $text;
}


    private static function is_arc_resizer($url){
        return (bool) preg_match('~/(resizer|resizer/v2)/[^?]+\.(jpg|jpeg|png|webp|avif)~i', $url);
    }
    private static function arc_resizer_candidates($url){
        $cands = [$url];
        $hosts = ['www.defensenews.com','www.armytimes.com','www.militarytimes.com'];
        $parts = parse_url($url);
        if (!empty($parts['scheme']) && !empty($parts['host']) && !empty($parts['path'])) {
            $qs = isset($parts['query']) ? '?'.$parts['query'] : '';
            foreach ($hosts as $h) {
                if ($h !== $parts['host']) {
                    // FIX: concatenar com '.' em PHP (não '+')
                    $cands[] = $parts['scheme'].'://'.$h.$parts['path'].$qs;
                }
            }
        }
        return array_values(array_unique($cands));
    }

    protected static function attach_image_from_url($url, $post_id, $title='', $referer=''){
        if (!function_exists('media_handle_sideload')) {
            require_once ABSPATH.'wp-admin/includes/media.php';
            require_once ABSPATH.'wp-admin/includes/file.php';
            require_once ABSPATH.'wp-admin/includes/image.php';
        }

        $ua = self::ua();
        $tmp = wp_tempnam('maanews-img');

        $candidates = self::is_arc_resizer($url) ? self::arc_resizer_candidates($url) : [$url];

        $res = null; $ok = false; $lastErr = null; $lastCode = null;
        foreach ($candidates as $tryUrl) {
            $res = wp_remote_get($tryUrl, [
                'timeout'     => 30,
                'redirection' => 5,
                'stream'      => true,
                'filename'    => $tmp,
                'user-agent'  => $ua,
                'headers'     => [
                    'Accept'     => 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer'    => $referer ?: $tryUrl,
                    'Accept-Language' => 'en-US,en;q=0.9,pt-BR;q=0.8',
                ],
            ]);
            if (is_wp_error($res)) { $lastErr = $res->get_error_message(); continue; }
            $code = wp_remote_retrieve_response_code($res);
            if ($code >= 200 && $code < 300) { $ok = true; break; }
            $lastCode = $code;
        }
        if (!$ok) {
            if ($lastErr) {
                self::log('img_download_fail', ['url'=>$url, 'err'=>$lastErr]);
                @unlink($tmp); return new WP_Error('http', 'Falha ao baixar imagem: '.$lastErr);
            }
            self::log('img_http_fail', ['url'=>$url, 'code'=>$lastCode ?: 0]);
            @unlink($tmp); return new WP_Error('http', 'Falha HTTP ao baixar imagem: '.($lastCode ?: '0'));
        }

        $allowed = ['image/jpeg','image/png','image/webp','image/avif','image/gif','image/svg+xml'];
        $mime = strtolower((string)wp_remote_retrieve_header($res, 'content-type'));
        $pathExt = strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?: 'img', PATHINFO_EXTENSION));

        if (!$mime || stripos($mime,'text/html')!==false || !in_array($mime, $allowed, true)) {
            $ft = wp_check_filetype('x.'.($pathExt?:'jpg'), [
                'jpg|jpeg' => 'image/jpeg',
                'png'      => 'image/png',
                'webp'     => 'image/webp',
                'avif'     => 'image/avif',
                'gif'      => 'image/gif',
                'svg'      => 'image/svg+xml',
            ]);
            if (!empty($ft['type'])) $mime = $ft['type'];
            if ($pathExt === 'avif') $mime = 'image/avif';
            if (!$mime) $mime = 'image/jpeg';
            self::log('img_mime_fallback', ['url'=>$url, 'mime'=>$mime, 'ext'=>$pathExt]);
        }

        $srcPath   = $tmp;
        $finalMime = $mime;
        $webpTmp   = null;

        $shouldConvert = in_array($mime, ['image/jpeg','image/png'], true);
        if ($shouldConvert) {
            $editor = wp_get_image_editor($tmp);
            if (!is_wp_error($editor)) {
                if (method_exists($editor,'set_quality')) $editor->set_quality(intval(self::IMG_COMPR));
                $webpTmp = wp_tempnam('maanews-webp'); @unlink($webpTmp); $webpTmp .= '.webp';
                $saved = $editor->save($webpTmp, 'image/webp');
                if (!is_wp_error($saved) && !empty($saved['path'])) {
                    $srcPath   = $saved['path'];
                    $finalMime = 'image/webp';
                } else {
                    $webpTmp = null;
                }
            }
        }
        if ($mime === 'image/avif') {
            $finalMime = 'image/avif';
        }
        // Checagem de tamanho mínimo (largura >= IMG_MIN_WIDTH)
        $width  = 0;
        $height = 0;
        if ($srcPath && file_exists($srcPath)) {
            $info = @getimagesize($srcPath);
            if (is_array($info) && !empty($info[0])) {
                $width  = intval($info[0]);
                $height = intval($info[1] ?? 0);
            }
        }

        // Se a imagem for menor que o mínimo, não anexar e avisar o chamador
        if ($width > 0 && $width < self::IMG_MIN_WIDTH) {
            self::log('img_too_small', [
                'url'    => $url,
                'width'  => $width,
                'height' => $height,
                'min'    => self::IMG_MIN_WIDTH,
            ]);

            if (file_exists($tmp)) @unlink($tmp);
            if ($webpTmp && file_exists($webpTmp)) @unlink($webpTmp);

            return new WP_Error(
                'img_small',
                'Imagem menor que '.self::IMG_MIN_WIDTH.'px de largura.',
                ['width' => $width, 'height' => $height]
            );
        }

        $ext = ( $finalMime==='image/webp' ? 'webp' :
                ($finalMime==='image/png'  ? 'png'  :
                ($finalMime==='image/gif'  ? 'gif'  :
                ($finalMime==='image/avif' ? 'avif' :
                ($finalMime==='image/svg+xml' ? 'svg' : 'jpg')))));
        $file_array = [
            'name'     => 'news-'.intval($post_id).'-'.time().'.'.$ext,
            'tmp_name' => $srcPath,
            'type'     => $finalMime,
            'error'    => 0,
            'size'     => @filesize($srcPath) ?: null,
        ];

        $id = media_handle_sideload($file_array, $post_id, $title, [
            'post_mime_type' => $finalMime,
            'post_title'     => wp_strip_all_tags($title),
            'post_status'    => 'inherit',
        ]);

        if (file_exists($tmp)) @unlink($tmp);
        if ($webpTmp && file_exists($webpTmp)) @unlink($webpTmp);

        if (is_wp_error($id)) {
            self::log('img_attach_fail', ['url'=>$url, 'err'=>$id->get_error_message()]);
            return $id;
        }
        if (function_exists('set_post_thumbnail')) set_post_thumbnail($post_id, $id);
        else update_post_meta($post_id, '_thumbnail_id', $id);
        return $id;
    }

    /** gera imagem de capa com IA (OpenAI Images) */
    protected static function generate_featured_image_ai($post_id, $title, $quality){
        if (!class_exists('MAA_AutoArticles')) return new WP_Error('no_base','Base não encontrada');
        $s = MAA_AutoArticles::get_settings();
        $api_key = MAA_AutoArticles::decrypt_from_storage($s['openai_key_enc'] ?? '');
        if (!$api_key) return new WP_Error('no_key','API Key da OpenAI ausente');

        $prompt = 'Capa horizontal 1536x1024, sem textos, representando: ' . $title . '.';
        $payload = [
            'model'   => self::IMG_MODEL,
            'prompt'  => $prompt,
            'n'       => 1,
            'size'    => self::IMG_SIZE,
            'quality' => in_array($quality,['low','medium','high'],true) ? $quality : self::IMG_Q_DEFAULT,
            'output_format'      => self::IMG_FMT,
            'output_compression' => self::IMG_COMPR,
        ];
        $res = wp_remote_post('https://api.openai.com/v1/images/generations', [
            'headers'=>[
                'Authorization' => 'Bearer '.$api_key,
                'Content-Type'  => 'application/json',
                'Accept'        => 'application/json',
            ],
            'timeout'=>160,
            'body'=> wp_json_encode($payload),
        ]);
        if (is_wp_error($res)) return $res;
        $body = json_decode(wp_remote_retrieve_body($res), true);
        $b64 = $body['data'][0]['b64_json'] ?? '';
        if (!$b64) return new WP_Error('img','Sem imagem retornada');

        $bytes = base64_decode($b64);
        if (!$bytes) return new WP_Error('img','Falha ao decodificar imagem');

        if (!function_exists('media_handle_sideload')) {
            require_once ABSPATH.'wp-admin/includes/media.php';
            require_once ABSPATH.'wp-admin/includes/file.php';
            require_once ABSPATH.'wp-admin/includes/image.php';
        }

        $tmp = wp_tempnam('maanews');
        file_put_contents($tmp, $bytes);
        $file_array = [
            'name' => 'newsai-'.$post_id.'.webp',
            'tmp_name' => $tmp,
            'type' => 'image/webp',
            'size' => strlen($bytes),
            'error' => 0,
        ];
        $id = media_handle_sideload($file_array, $post_id, $title, [
            'post_mime_type' => 'image/webp',
            'post_title' => wp_strip_all_tags($title),
            'post_status'=> 'inherit',
        ]);
        if (is_wp_error($id)) { @unlink($tmp); return $id; }
        if (function_exists('set_post_thumbnail')) set_post_thumbnail($post_id, $id);
        else update_post_meta($post_id, '_thumbnail_id', $id);
        return $id;
    }
/** Busca corpo por containers típicos de temas de notícia (TagDiv/Newspaper, JNews, etc.) */
private static function extract_known_article_containers($html){
    $out = ['title'=>'','body'=>''];
    if (!$html || !class_exists('DOMDocument')) return $out;

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $loaded = $dom->loadHTML('<?xml encoding="utf-8" ?>'.$html);
    libxml_clear_errors();
    if (!$loaded) return $out;

    $xp = new DOMXPath($dom);

    // Títulos mais comuns
    $titleQueries = [
        '//h1[contains(@class,"entry-title") or contains(@class,"post-title") or contains(@class,"jeg_post_title") or contains(@class,"td-post-title") or contains(@class,"single-post-title")]',
        '//h1'
    ];
    foreach ($titleQueries as $q) {
        $nodes = $xp->query($q);
        if ($nodes && $nodes->length) { $out['title'] = trim($nodes->item(0)->textContent ?? ''); if ($out['title']) break; }
    }

    // Containers de artigo comuns
    $bodyQueries = [
        '//div[contains(@class,"td-post-content")]',
        '//div[contains(@class,"entry-content")]',
        '//div[contains(@class,"jeg_post_content") or contains(@class,"jnews_content") or contains(@class,"content-inner")]',
        '//div[contains(@class,"single-content") or contains(@id,"single-content")]',
        '//article//*[contains(@class,"content") or contains(@class,"post-content")]',
        '//div[contains(@class,"g1-content") or contains(@class,"g1-content-narrow")]',
    ];

    $best = null; $bestScore = 0;
    foreach ($bodyQueries as $q){
        $nodes = $xp->query($q);
        if (!$nodes) continue;
        foreach ($nodes as $node){
            if (!($node instanceof DOMElement)) continue;
            // inner HTML
            $inner = self::dom_inner_html($node);
            // conta blocos de texto úteis
            $pCount = substr_count($inner, '<p');
            $liCount = substr_count($inner, '<li');
            $bqCount = substr_count($inner, '<blockquote');
            $len = self::mb_strlen_u( wp_strip_all_tags($inner) );
            $score = ($pCount*200) + ($liCount*40) + ($bqCount*80) + $len;
            if ($score > $bestScore){
                $best = $inner; $bestScore = $score;
            }
        }
    }

    if ($best){
        // mantém somente blocos textuais
        if (preg_match_all('/<(p|h[2-4]|ul|ol|li|blockquote)[^>]*>.*?<\/\\1>/is', $best, $m) && !empty($m[0])){
            $out['body'] = implode("\n", $m[0]);
        } else {
            $out['body'] = strip_tags($best, '<p><strong><em><b><i><u><a><ul><ol><li><blockquote><br>');
        }
        // limpeza final
        $out['body'] = self::final_body_cleanup($out['body'], $out['title']);
    }

    return $out;
}

/** Pega articleBody de JSON-LD (schema.org/Article) quando existir */
private static function extract_articlebody_from_jsonld($html){
    if (!preg_match_all('~<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>~is', $html, $ms)) return '';
    foreach ($ms[1] as $json){
        $data = json_decode(trim($json), true);
        if (!$data) continue;
        $arr = (isset($data['@graph']) && is_array($data['@graph'])) ? $data['@graph'] : [$data];
        foreach ($arr as $node){
            if (!is_array($node)) continue;
            // Article, NewsArticle, BlogPosting…
            $type = is_string($node['@type'] ?? '') ? $node['@type'] : (is_array($node['@type'] ?? null) ? implode(',', $node['@type']) : '');
            if ($type && stripos($type, 'Article')===false && stripos($type, 'BlogPosting')===false) continue;
            $body = '';
            if (!empty($node['articleBody'])) $body = (string)$node['articleBody'];
            elseif (!empty($node['description'])) $body = (string)$node['description'];
            if ($body) {
                // split em parágrafos
                $paras = array_filter(array_map('trim', preg_split('/\n{2,}|\r\n{2,}/', $body)));
                $htmlBody = '';
                foreach ($paras as $p){ $htmlBody .= '<p>'.esc_html($p).'</p>'."\n"; }
                return self::final_body_cleanup($htmlBody);
            }
        }
    }
    return '';
}

/**
 * Remove do conteúdo qualquer bloco inicial que seja apenas o título
 * (H1 ou parágrafo em negrito), para evitar duplicar o H1 do tema.
 */
private static function strip_title_from_content($html, $title){
    if (!$html || !$title) {
        return $html;
    }

    // Título "limpo", sem tags e com espaços normalizados
    $t = trim( wp_strip_all_tags( $title ) );
    if ($t === '') {
        return $html;
    }

    // Escapa o título para regex e permite variação de espaços (\s+)
    $patternTitle = preg_quote($t, '~');
    $patternTitle = preg_replace('~\s+~', '\\s+', $patternTitle);

    // 1) Remove <h1> que seja só o título (com ou sem <strong>/<b>)
    $html = preg_replace(
        '~<h1\b[^>]*>\s*(?:<strong>|<b>)?\s*'.$patternTitle.'\s*(?:</strong>|</b>)?\s*</h1>~iu',
        '',
        $html,
        1
    );

    // 2) Remove <p> que seja só o título (com ou sem <strong>/<b>)
    $html = preg_replace(
        '~<p\b[^>]*>\s*(?:<strong>|<b>)?\s*'.$patternTitle.'\s*(?:</strong>|</b>)?\s*</p>~iu',
        '',
        $html,
        1
    );

    // 3) Limpa parágrafos vazios que podem sobrar (&nbsp; etc.)
    $html = preg_replace(
        '~<p>\s*(?:&nbsp;|\xC2\xA0|\s)*</p>~i',
        '',
        $html
    );

    // Remove espaços/brancos no início
    return ltrim($html);
}

/**
 * Remove imagens internas (<img>, <figure>, <picture>) do conteúdo HTML.
 * A capa continua vindo como imagem destacada do post.
 */
private static function remove_inline_images($html){
    if (!$html) {
        return $html;
    }

    // Remove <figure> e <picture> inteiros (imagem + legenda)
    $html = preg_replace('~<figure\b[^>]*>.*?</figure>~is', '', $html);
    $html = preg_replace('~<picture\b[^>]*>.*?</picture>~is', '', $html);

    // Remove <p> que contenham alguma <img> (some junto a legenda desse bloco)
    $html = preg_replace('~<p\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?</p>~i', '', $html);

    // Remove qualquer <img> solta que ainda tenha sobrado
    $html = preg_replace('~<img\b[^>]*>~i', '', $html);

    // Remove parágrafos vazios que sobrarem (&nbsp; ou espaços)
    $html = preg_replace('~<p>\s*(?:&nbsp;|\xC2\xA0|\s)*</p>~i', '', $html);

    return $html;
}
/**
 * Tenta encontrar a URL da imagem de capa dentro do primeiro <figure> do HTML.
 * Dá preferência a atributos data-src, data-lazy-src etc e converte URL relativa em absoluta.
 */
private static function extract_figure_image_src($html, $baseUrl = ''){
    if (!$html || !class_exists('DOMDocument')) {
        return '';
    }

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $loaded = $dom->loadHTML('<?xml encoding="utf-8" ?>'.$html);
    libxml_clear_errors();

    if (!$loaded) {
        return '';
    }

    $xp = new DOMXPath($dom);

    // Primeiro tenta <figure>; se não achar, tenta diretamente <picture>
    $figure = $xp->query('//figure')->item(0);
    $root   = $figure ?: $xp->query('//picture')->item(0);

    if (!$root instanceof DOMElement) {
        return '';
    }

    // Procura um <img> dentro do figure/picture
    $img = $xp->query('.//img', $root)->item(0);
    $src = '';

    if ($img instanceof DOMElement) {
        foreach (['data-src','data-lazy-src','data-orig-file','src'] as $attr) {
            if ($img->hasAttribute($attr)) {
                $src = trim($img->getAttribute($attr));
                if ($src) {
                    break;
                }
            }
        }

        // Se ainda não tiver src, tenta extrair do srcset
        if (!$src && $img->hasAttribute('srcset')) {
            $srcset = $img->getAttribute('srcset');
            $parts  = preg_split('/\s*,\s*/', $srcset);
            if (!empty($parts[0])) {
                $first = trim($parts[0]);
                $src   = preg_split('/\s+/', $first)[0];
            }
        }
    }

    // Se ainda não encontrou, tenta <source> dentro de <picture>
    if (!$src) {
        $source = $xp->query('.//source', $root)->item(0);
        if ($source instanceof DOMElement && $source->hasAttribute('srcset')) {
            $srcset = $source->getAttribute('srcset');
            $parts  = preg_split('/\s*,\s*/', $srcset);
            if (!empty($parts[0])) {
                $first = trim($parts[0]);
                $src   = preg_split('/\s+/', $first)[0];
            }
        }
    }

    if (!$src) {
        return '';
    }

    return self::make_absolute_url($src, $baseUrl);
}

/**
 * Converte uma URL relativa em absoluta com base na URL da página original.
 */
private static function make_absolute_url($src, $baseUrl){
    $src = trim((string)$src);
    if (!$src) {
        return '';
    }

    // Já é absoluta
    if (preg_match('~^https?://~i', $src)) {
        return $src;
    }

    // Esquema relativo: //site.com/img.jpg
    if (strpos($src, '//') === 0) {
        return 'https:'.$src;
    }

    if (!$baseUrl) {
        return $src;
    }

    $parts = wp_parse_url($baseUrl);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
        return $src;
    }

    $scheme = $parts['scheme'].'://';
    $host   = $parts['host'];
    $port   = !empty($parts['port']) ? ':'.$parts['port'] : '';

    // Caminho base da página
    $basePath = isset($parts['path']) ? $parts['path'] : '/';
    $basePath = preg_replace('~/[^/]*$~', '/', $basePath);

    // Caminho da imagem
    if (strpos($src, '/') === 0) {
        // Caminho absoluto no host
        $path = $src;
    } else {
        // Caminho relativo ao diretório da página
        $path = $basePath.$src;
    }

    return $scheme.$host.$port.$path;
}


/**
 * Remove do HTML o primeiro <p>/<h1-4> cujo texto bate com o subtítulo.
 * Assim o subtítulo não fica duplicado no corpo, só acima da imagem.
 */
private static function strip_subtitle_from_content($html, $subtitle){
    $subtitle = trim(wp_strip_all_tags((string) $subtitle));
    if (!$html || !$subtitle) {
        return $html;
    }
    if (!class_exists('DOMDocument')) {
        return $html;
    }

    // normaliza texto: tira HTML, pontuação, espaços extras e deixa em minúsculo
    $normalize = function($s){
        $s = trim(wp_strip_all_tags((string) $s));
        $s = preg_replace('/\s+/u', ' ', $s);
        $s = preg_replace('/[[:punct:]]+/u', '', $s);
        if (function_exists('mb_strtolower')) {
            $s = mb_strtolower($s, 'UTF-8');
        } else {
            $s = strtolower($s);
        }
        return $s;
    };

    $subtitleNorm = $normalize($subtitle);
    if ($subtitleNorm === '') {
        return $html;
    }

    $dom = new DOMDocument('1.0', 'UTF-8');
    libxml_use_internal_errors(true);
    $loaded = $dom->loadHTML('<?xml encoding="utf-8" ?>' . $html);
    libxml_clear_errors();
    if (!$loaded) {
        return $html;
    }

    $xpath = new DOMXPath($dom);
    $nodes = $xpath->query('//h1|//h2|//h3|//h4|//p');

    $checked = 0;
    if ($nodes) {
        foreach ($nodes as $node) {
            $textNorm = $normalize($node->textContent);

            if ($textNorm === $subtitleNorm) {
                if ($node->parentNode) {
                    $node->parentNode->removeChild($node);
                }
                break; // remove só a primeira ocorrência
            }

            // só olha os primeiros blocos de texto, pra não sair removendo coisa lá embaixo
            $checked++;
            if ($checked >= 10) {
                break;
            }
        }
    }

    $body = $dom->getElementsByTagName('body')->item(0);
    if (!$body) {
        return $html;
    }

    $out = '';
    foreach ($body->childNodes as $child) {
        $out .= $dom->saveHTML($child);
    }

    return $out;
}


    /** ============ Helpers DOM (limpeza) ============ */
    private static function dom_remove_by_tag(DOMElement $root, array $tags){
        foreach ($tags as $tag){
            $nodes = $root->getElementsByTagName($tag);
            // NodeList é vivo: copiar antes
            $toRemove = [];
            foreach ($nodes as $n) $toRemove[] = $n;
            foreach ($toRemove as $n) if ($n->parentNode) $n->parentNode->removeChild($n);
        }
    }
    private static function dom_remove_tags(DOMElement $root, array $tags){ self::dom_remove_by_tag($root, $tags); }
    private static function dom_remove_by_attr_match(DOMElement $root, $attr, $regex){
        $all = $root->getElementsByTagName('*');
        $toRemove = [];
        foreach ($all as $n){
            if (!($n instanceof DOMElement)) continue;
            $val = $n->getAttribute($attr);
            if ($val && preg_match($regex, $val)) $toRemove[] = $n;
        }
        foreach ($toRemove as $n) if ($n->parentNode) $n->parentNode->removeChild($n);
    }
    private static function dom_remove_paragraphs_matching(DOMElement $root, $regex){
        $pars = $root->getElementsByTagName('p');
        $toRemove = [];
        foreach ($pars as $p){
            $txt = trim($p->textContent ?? '');
            if ($txt && preg_match($regex, $txt)) $toRemove[] = $p;
        }
        foreach ($toRemove as $n) if ($n->parentNode) $n->parentNode->removeChild($n);
    }
    private static function dom_inner_html(DOMNode $node){
        $doc = $node->ownerDocument;
        $html = '';
        foreach ($node->childNodes as $child){
            $html .= $doc->saveHTML($child);
        }
        return $html;
    }

    protected static function ua(){
        return 'Mozilla/5.0 (compatible; MAA-NewsBot/1.0; +'.home_url('/').') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';
    }
    private static function mb_strlen_u($s){ return function_exists('mb_strlen') ? mb_strlen((string)$s,'UTF-8') : strlen(utf8_decode((string)$s)); }
private static function mb_strtolower_u($s){ return function_exists('mb_strtolower') ? mb_strtolower((string)$s,'UTF-8') : strtolower((string)$s); }
private static function mb_strpos_u($h, $n){ return function_exists('mb_strpos') ? mb_strpos((string)$h,(string)$n,0,'UTF-8') : strpos((string)$h,(string)$n); }

    private static function same_host($a, $b){
    $pa = wp_parse_url($a); $pb = wp_parse_url($b);
    return $pa && $pb && !empty($pa['host']) && !empty($pb['host']) && strtolower($pa['host'])===strtolower($pb['host']);
}
private static function http_get_follow($url, $referer=''){
    $args = [
        'timeout'     => 30,
        'redirection' => 8,
        'headers'     => [
            'User-Agent'      => self::ua(),
            'Accept'          => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language' => 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control'   => 'no-cache',
            'Pragma'          => 'no-cache',
            'Referer'         => $referer ?: home_url('/'),
        ],
    ];
    $res  = wp_remote_get($url, $args);
    if (is_wp_error($res)) return null;
    $code = wp_remote_retrieve_response_code($res);
    if ($code < 200 || $code >= 400) return null;

    $body = wp_remote_retrieve_body($res);
    $final = wp_remote_retrieve_header($res, 'x-final-url');
    if (!$final) $final = $url;
    return ['url'=>$final, 'body'=>$body];
}


}

MAA_News_Pro::init();
endif;
