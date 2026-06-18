<?php
/**
 * Plugin Name: MAA | Máquina Automática de Artigos PRO
 * Description: Versão PRO do plugin Máquina Automática de Artigos.
 * Version: 1.2.8
 * Author: Jefferson SLV
 */

if ( ! defined('ABSPATH') ) exit;

/* =========================
 * Constantes do PRO
 * ========================= */
define('MAA_PRO_ACTIVE',   true);
define('MAA_PRO_VERSION',  '1.2.8');
define('MAA_PRO_DIR',      plugin_dir_path(__FILE__));
define('MAA_PRO_URL',      plugin_dir_url(__FILE__));
define('MAA_PRO_BASENAME', plugin_basename(__FILE__));
define('MAA_PRO_UPSELL',   'https://jeffersonslv.com/maa-pro');

/* ===== MODO PERMISSIVO (BYPASS) =====
 * Enquanto ajusta o servidor, o PRO ficará sempre “Ativo”.
 * Depois, troque para false para voltar ao fluxo normal.
 */
if (!defined('MAA_PRO_DEV_BYPASS')) {
  define('MAA_PRO_DEV_BYPASS', true);
}

/* ===== LICENCIAMENTO (AJUSTE A URL DO SEU SITE) =====
 * A URL deve apontar para o seu License Server com /wp-json/maa-lic/v1
 */
define('MAA_LIC_API',        'https://jeffersonslv.com/wp-json/maa-lic/v1');
define('MAA_LIC_PRODUCT',    'maa-pro-1');
define('MAA_LIC_SITE_LIMIT', 3); // informativo local
define('MAA_LIC_OPT',        'maa_pro_license');

/* ===== Polyfill útil ===== */
if (!function_exists('str_ends_with')) {
  function str_ends_with($haystack, $needle){
    $len = strlen($needle);
    if ($len === 0) return true;
    return substr($haystack, -$len) === $needle;
  }
}

/* ====================================================
 * LICENCIAMENTO
 * ==================================================== */
if ( ! class_exists('MAA_Pro_Licensing') ):
final class MAA_Pro_Licensing {

  public static function init(){
    // Menu (tenta ancorar no menu do MAA; cria fallback se não achar)
    add_action('admin_menu',  [__CLASS__, 'add_menu_smart'], 99);

    // Processamento seguro via admin-post
    add_action('admin_post_maa_pro',        [__CLASS__, 'handle_admin_post']);
    add_action('admin_post_nopriv_maa_pro', [__CLASS__, 'handle_admin_post']);

    // Checks e cron
    add_action('admin_init',  [__CLASS__, 'maybe_soft_check']);
    add_action('maa_pro_license_cron', [__CLASS__, 'cron_check']);
    if ( ! wp_next_scheduled('maa_pro_license_cron') ) {
      wp_schedule_event(time()+3600, 'daily', 'maa_pro_license_cron');
    }

    // Link rápido na listagem de plugins
    add_filter('plugin_action_links_' . MAA_PRO_BASENAME, [__CLASS__, 'plugin_action_links']);

    // SEÇÃO “Gerencie sua licença” embutida em maa-settings
    add_action('admin_print_footer_scripts', [__CLASS__, 'inject_settings_inline_panel'], 20);
  }

  /* ---------- Helpers ---------- */
  protected static function activation_page_url(){
    return admin_url('admin.php?page=maa-pro-activation');
  }
  protected static function form_action_url(){
    return admin_url('admin-post.php');
  }
  protected static function is_bypass(){
    return defined('MAA_PRO_DEV_BYPASS') && MAA_PRO_DEV_BYPASS;
  }

  /* ---------- Estado ---------- */
  public static function get(){
    $lic = get_option(MAA_LIC_OPT, []);
    return is_array($lic) ? $lic : [];
  }
  protected static function save($arr){
    if (!is_array($arr)) $arr = [];
    update_option(MAA_LIC_OPT, $arr, false);
  }
  public static function is_active(){
    // BYPASS: sempre ativo
    if ( self::is_bypass() ) return true;

    $lic = self::get();
    if (empty($lic['status']) || empty($lic['token'])) return false;
    if ($lic['status'] !== 'active') return false;
    if (!empty($lic['expires']) && time() > intval($lic['expires'])) return false;
    if (empty($lic['site']) || untrailingslashit($lic['site']) !== untrailingslashit(home_url('/'))) return false;
    return true;
  }

  /* ---------- Menu: tentativa inteligente de ancorar no MAA ---------- */
  public static function add_menu_smart(){
    $added = false;
    $candidates = ['maa-main','maa-settings','maa','edit.php?post_type=maa'];

    foreach ($candidates as $parent) {
      $hook = add_submenu_page(
        $parent,
        'Ativação do MAA PRO',
        'Ativar Licença PRO',
        'manage_options',
        'maa-pro-activation',
        [__CLASS__, 'render_activation_page']
      );
      if ( $hook !== false ) { $added = true; break; }
    }

    if ( ! $added ) {
      add_menu_page(
        'MAA PRO – Licença',
        'MAA PRO (Licença)',
        'manage_options',
        'maa-pro-activation',
        [__CLASS__, 'render_activation_page'],
        'dashicons-admin-network',
        58
      );
    }
  }

  public static function render_activation_page(){
    if (!current_user_can('manage_options')) return;

    echo '<div class="wrap"><h1>Ativação do MAA PRO</h1>';

    if (method_exists('MAA_AutoArticles','render_admin_tabs')) {
      MAA_AutoArticles::render_admin_tabs('settings');
    }

    $lic    = self::get();
    $active = self::is_active();

    self::render_activation_flash();
    self::render_activation_box($active, $lic);
    self::render_sites_section();
    echo '</div>';
  }

  protected static function render_activation_flash(){
    if ( isset($_GET['maa_pro_msg']) ) {
      $m = sanitize_text_field($_GET['maa_pro_msg']);
      if ($m === 'activated')   echo '<div class="notice notice-success"><p>Licença ativada com sucesso.</p></div>';
      if ($m === 'deactivated') echo '<div class="notice notice-warning"><p>Licença desativada neste site.</p></div>';
      if ($m === 'error')       echo '<div class="notice notice-error"><p>Falha ao validar a licença. Confira e tente novamente.</p></div>';
      if ($m === 'reissued')    echo '<div class="notice notice-success"><p>Token reemitido com sucesso.</p></div>';
    }
  }

  protected static function render_activation_box($active, $lic){
    $action_url = self::form_action_url();

    echo '<div class="maa-pro-activation" style="padding:12px 14px;border:1px solid #ccd0d4;border-radius:6px;background:#fff;margin:8px 0 16px;">';

    if ($active){
      // Exibe como ATIVO mesmo sem validação (modo permissivo)
      $key_preview = '';
      $raw_key = $lic['key'] ?? '';
      if (is_string($raw_key) && $raw_key !== '') {
        $key_preview = esc_html(substr($raw_key, 0, 6)) . '••••';
      }

      echo '<p><strong>Status:</strong> <span style="color:#008a00">Ativo</span></p>';
      echo '<p><strong>Licença:</strong> '.($key_preview ?: '—').'  | <strong>Válida até:</strong> '.
           ( !empty($lic['expires']) ? date('d/m/Y H:i', intval($lic['expires'])) : '—' ).'</p>';

      echo '<form method="post" action="'.esc_url($action_url).'" style="margin:0">';
      wp_nonce_field('maa_pro_activate', 'maa_pro_nonce');
      echo '<input type="hidden" name="action" value="maa_pro" />';
      echo '<input type="hidden" name="maa_pro_action" value="deactivate" />';
      echo '<button type="submit" class="button button-small button-link-delete">'.
           esc_html__('Desativar licença neste site','maa').'</button>';
      echo '</form>';

    } else {
      echo '<p>Ative com o e-mail da compra e a chave recebida. '.
           '<a href="'.esc_url(MAA_PRO_UPSELL).'" target="_blank" rel="noopener">Não tem chave?</a></p>';

      echo '<form method="post" action="'.esc_url($action_url).'" style="margin:0">';
      wp_nonce_field('maa_pro_activate', 'maa_pro_nonce');
      echo '<input type="hidden" name="action" value="maa_pro" />';
      echo '<table class="form-table" role="presentation"><tbody>';
      echo '<tr><th><label for="maa_pro_email">E-mail da compra</label></th>'.
           '<td><input type="email" name="maa_pro_email" id="maa_pro_email" class="regular-text" required /></td></tr>';
      echo '<tr><th><label for="maa_pro_key">Código compra Hotmart (HP123...)</label></th>'.
           '<td><input type="text" name="maa_pro_key" id="maa_pro_key" class="regular-text" required /></td></tr>';
      echo '</tbody></table>';
      echo '<input type="hidden" name="maa_pro_action" value="activate" />';
      echo '<p><button type="submit" class="button button-primary button-small">'.
           esc_html__('Ativar licença','maa').'</button></p>';
      echo '</form>';
    }

    echo '</div>';
  }

  /* ---------- SEÇÃO embutida na página `maa-settings` ---------- */
  public static function inject_settings_inline_panel(){
    if ( empty($_GET['page']) || $_GET['page'] !== 'maa-settings' ) return;
    if ( ! current_user_can('manage_options') ) return;

    $active  = self::is_active();
    $lic     = self::get();
    $expires = !empty($lic['expires']) ? date('d/m/Y H:i', intval($lic['expires'])) : '—';

    $status  = $active ? '<span style="color:#008a00;font-weight:600">Licença ativa</span>'.($expires !== '—' ? ' • válida até '.$expires : '')
                       : 'Ative sua licença para liberar os módulos PRO.';
    $html  = '<div class="maa-pro-license-section" style="border:1px solid #ccd0d4;border-radius:6px;padding:14px;background:#fff;margin:14px 0;">'
           . '<h2 style="margin:0 0 8px 0;">Gerencie sua licença</h2>'
           . '<p style="margin:0 0 10px 0;">'.$status.'</p>'
           . '<a class="button button-primary" href="'.esc_url(self::activation_page_url()).'">Abrir gerenciamento de licença</a>'
           . '</div>';

    echo '<script>(function(){try{'
       . 'if(new URLSearchParams(window.location.search).get("page")!=="maa-settings")return;'
       . 'var wrap=document.querySelector(".wrap"); if(!wrap)return;'
       . 'var html='.wp_json_encode($html).';'
       . 'var holder=document.createElement("div"); holder.innerHTML=html; var panel=holder.firstElementChild;'
       . 'var tabs=wrap.querySelector(".nav-tab-wrapper");'
       . 'var target=null; var hs=wrap.querySelectorAll("h2,h3");'
       . 'for(var i=0;i<hs.length;i++){var t=(hs[i].textContent||"").trim().toLowerCase(); if(t==="configurações do maa"){target=hs[i];break;}}'
       . 'if(target){target.parentNode.insertBefore(panel,target);}'
       . 'else if(tabs){tabs.parentNode.insertBefore(panel,tabs.nextSibling);}'
       . 'else{wrap.insertBefore(panel,wrap.firstChild);}'
       . '}catch(e){console&&console.warn&&console.warn("MAA PRO panel:",e);}})();</script>';
  }

  /* ---------- Seção: Gerenciamento de sites ---------- */
  public static function render_sites_section(){
    if ( ! self::is_active() ){
      echo '<p class="description">Ative a licença PRO para gerenciar os sites autorizados.</p>';
      return;
    }

    $lic        = self::get();

    // BYPASS: não chama servidor; mostra infos locais
    if ( self::is_bypass() && empty($lic['token']) ) {
      $limit = intval(MAA_LIC_SITE_LIMIT);
      $left  = $limit;
      echo '<div class="maa-pro-sites" style="padding:12px 14px;border:1px solid #ccd0d4;border-radius:6px;background:#fff;margin:8px 0 16px;">';
      echo '<p><strong>Limite:</strong> '.intval($limit).' site'.($limit>1?'s':'').' • Restantes: <strong>'.intval($left).'</strong></p>';
      echo '<p><em>Nenhum site vinculado ainda.</em></p>';
      echo '</div>';
      return;
    }

    // Fluxo normal (quando houver token)
    $info       = self::remote('license', ['token'=>$lic['token']]); // {ok,status,expires,limit,sites,message}
    if (!is_array($info)) $info = [];
    $sites_raw  = $info['sites'] ?? [];
    $sites      = is_array($sites_raw) ? array_values(array_unique(array_map('strval',$sites_raw))) : [];
    $limit      = max(1, intval($info['limit'] ?? 1));
    $count      = count($sites);
    $left       = max(0, $limit - $count);
    $action_url = self::form_action_url();
    $current    = untrailingslashit(home_url('/'));

    echo '<div class="maa-pro-sites" style="padding:12px 14px;border:1px solid #ccd0d4;border-radius:6px;background:#fff;margin:8px 0 16px;">';
    echo '<p><strong>Limite:</strong> '.intval($limit).' site'.($limit>1?'s':'').' • Restantes: <strong>'.intval($left).'</strong></p>';

    if ( empty($info['ok']) && !empty($info['message']) && stripos((string)$info['message'], 'token') !== false ) {
      echo '<p class="notice notice-error" style="padding:8px 10px;margin-top:10px"><strong>'.esc_html($info['message']).'</strong></p>';
    }

    if ($sites){
      echo '<table class="widefat striped" style="max-width:880px"><thead><tr><th style="width:60%">Site</th><th>Ações</th></tr></thead><tbody>';
      foreach($sites as $s){
        $is_current = untrailingslashit($s) === $current;
        echo '<tr><td>'.esc_html($s).($is_current ? ' <em>(este site)</em>' : '').'</td><td style="white-space:nowrap">';

        if ($is_current){
          echo '<span class="description">Para trocar este site, use “Desativar licença” e ative no novo domínio.</span>';
        } else {
          echo '<form method="post" action="'.esc_url($action_url).'" style="display:inline;margin-right:8px" onsubmit="return confirm(\'Remover este site da licença?\')">';
          wp_nonce_field('maa_pro_activate', 'maa_pro_nonce');
          echo '<input type="hidden" name="action" value="maa_pro" />';
          echo '<input type="hidden" name="maa_pro_action" value="site_remove"/>';
          echo '<input type="hidden" name="site" value="'.esc_attr($s).'"/>';
          echo '<button class="button-link-delete">'.esc_html__('Remover','maa').'</button>';
          echo '</form>';

          echo '<form method="post" action="'.esc_url($action_url).'" style="display:inline">';
          wp_nonce_field('maa_pro_activate', 'maa_pro_nonce');
          echo '<input type="hidden" name="action" value="maa_pro" />';
          echo '<input type="hidden" name="maa_pro_action" value="site_replace"/>';
          echo '<input type="hidden" name="old_site" value="'.esc_attr($s).'"/>';
          echo '<input type="url" name="new_site" class="regular-text" placeholder="https://novo-site.com" required />';
          echo ' <button class="button">'.esc_html__('Substituir','maa').'</button>';
          echo '</form>';
        }

        echo '</td></tr>';
      }
      echo '</tbody></table>';
    } else {
      echo '<p><em>Nenhum site vinculado ainda.</em></p>';
    }

    echo '</div>';
  }

  /* ---------- Processamento central via admin-post ---------- */
  public static function handle_admin_post(){
    if ( ! current_user_can('manage_options') ) wp_die('Permissão insuficiente.');
    if ( ! isset($_POST['maa_pro_nonce']) || ! wp_verify_nonce($_POST['maa_pro_nonce'], 'maa_pro_activate') ) wp_die('Nonce inválido.');

    $action = sanitize_text_field($_POST['maa_pro_action'] ?? '');
    $go     = function($msg=''){
      wp_safe_redirect( add_query_arg('maa_pro_msg', $msg ? $msg : null, self::activation_page_url()) );
      exit;
    };

    try {
      if ($action === 'activate'){
        $email = sanitize_email($_POST['maa_pro_email'] ?? '');
        $key   = sanitize_text_field($_POST['maa_pro_key'] ?? '');
        if (!$email || !$key) $go('error');
        $resp  = self::remote('activate', ['email'=>$email, 'key'=>$key]);
        if (!empty($resp['ok']) && !empty($resp['license'])) {
          self::save($resp['license']);
          $go('activated');
        }
        $go('error');
      }

      if ($action === 'deactivate'){
        $lic = self::get();
        if (!empty($lic['token']) && !self::is_bypass()) {
          $curr = home_url('/');
          self::remote('sites/remove', ['token'=>$lic['token'], 'site'=>$curr]);
          self::remote('deactivate',   ['token'=>$lic['token']]);
          self::remote('license',      ['token'=>$lic['token']]);
        }
        delete_option(MAA_LIC_OPT);
        $go('deactivated');
      }

      if ($action === 'reissue_token'){
        $lic = self::get();
        if (!empty($lic['email']) && !empty($lic['key'])) {
          $resp = self::remote('activate', ['email'=>$lic['email'], 'key'=>$lic['key']]);
          if (!empty($resp['ok']) && !empty($resp['license'])) {
            self::save($resp['license']);
            $go('reissued');
          }
        }
        $go('error');
      }

      // ------- Sites -------
      $lic = self::get();
      if (empty($lic['token'])) $go();

      if ($action === 'site_add'){
        $site = esc_url_raw($_POST['site'] ?? '');
        if ($site) self::remote('sites/add', ['token'=>$lic['token'], 'site'=>$site]);
        $lic['last_check'] = 0; self::save($lic);
        $go();
      }
      if ($action === 'site_remove'){
        $site = esc_url_raw($_POST['site'] ?? '');
        if ($site) self::remote('sites/remove', ['token'=>$lic['token'], 'site'=>$site]);
        $lic['last_check'] = 0; self::save($lic);
        $go();
      }
      if ($action === 'site_replace'){
        $old = esc_url_raw($_POST['old_site'] ?? '');
        $new = esc_url_raw($_POST['new_site'] ?? '');
        if ($old && $new) self::remote('sites/replace', ['token'=>$lic['token'], 'old'=>$old, 'new'=>$new]);
        $lic['last_check'] = 0; self::save($lic);
        $go();
      }

      $go();

    } catch (\Throwable $e) {
      error_log('MAA PRO (admin-post) erro: '.$e->getMessage());
      $go('error');
    }
  }

  /* ---------- Checagens ---------- */
  public static function maybe_soft_check(){
    if ( self::is_bypass() ) return; // não pinga servidor em modo permissivo
    $lic = self::get();
    if (empty($lic['token'])) return;
    $last = intval($lic['last_check'] ?? 0);
    if (time() - $last < DAY_IN_SECONDS) return;

    $resp = self::remote('ping', ['token'=>$lic['token']]);
    if (!empty($resp['ok']) && !empty($resp['license'])) {
      self::save(array_merge($lic, $resp['license']));
    }
  }
  public static function cron_check(){ self::maybe_soft_check(); }

  public static function plugin_action_links($links){
    $links[] = '<a href="'.esc_url(self::activation_page_url()).'">'.esc_html__('Licença PRO','maa').'</a>';
    return $links;
  }

  /* ---------- HTTP helper ---------- */
  public static function remote($action, $data){
    // Mapeia ações sensíveis para as rotas tolerantes a mídia (“-any”)
    $map_any = [
      'activate' => 'activate-any',
      'ping'     => 'ping-any',
      'deactivate'=> 'deactivate-any',
      'license'  => 'license-any',
    ];

    $base     = trailingslashit(MAA_LIC_API);
    $path_in  = ltrim((string)$action,'/');
    $path     = isset($map_any[$path_in]) ? $map_any[$path_in] : $path_in; // usa -any quando disponível
    $endpoint = $base . $path;
    $allows_get_fallback = str_ends_with($path, '-any'); // só para -any faremos GET final

    $payload  = array_merge([
      'product_id' => MAA_LIC_PRODUCT,
      'site'       => home_url('/'),
      'version'    => MAA_PRO_VERSION,
    ], is_array($data) ? $data : []);

    // 1ª tentativa: JSON
    $res = wp_remote_post($endpoint, [
      'timeout' => 25,
      'headers' => ['Content-Type'=>'application/json','Accept'=>'application/json'],
      'body'    => wp_json_encode($payload),
      'user-agent' => 'MAA-PRO/'.MAA_PRO_VERSION.'; '.home_url('/'),
    ]);

    $need_form_fallback = false;
    if (is_wp_error($res)) {
      $need_form_fallback = true;
    } else {
      $code = (int) wp_remote_retrieve_response_code($res);
      if ($code === 415) $need_form_fallback = true; // Unsupported Media Type
    }

    // 2ª tentativa: form-url-encoded (fallback)
    if ($need_form_fallback) {
      $res = wp_remote_post($endpoint, [
        'timeout' => 25,
        'body'    => $payload, // WP envia como application/x-www-form-urlencoded
        'user-agent' => 'MAA-PRO/'.MAA_PRO_VERSION.'; '.home_url('/'),
      ]);
    }

    // 3ª tentativa: GET com querystring (apenas para rotas -any)
    if ( !is_wp_error($res) ) {
      $code = (int) wp_remote_retrieve_response_code($res);
      if ($allows_get_fallback && ($code === 415 || $code === 405 || $code === 406)) {
        $res = new WP_Error('maa_retry', 'Forçando GET fallback'); // força bloco abaixo
      }
    }
    if (is_wp_error($res) && $allows_get_fallback) {
      $url = add_query_arg($payload, $endpoint);
      $res = wp_remote_get($url, [
        'timeout' => 25,
        'user-agent' => 'MAA-PRO/'.MAA_PRO_VERSION.'; '.home_url('/'),
      ]);
    }

    if (is_wp_error($res)) {
      return ['ok'=>false,'message'=>$res->get_error_message()];
    }

    $code = (int) wp_remote_retrieve_response_code($res);
    $body = (string) wp_remote_retrieve_body($res);
    $json = json_decode($body, true);
    if (!is_array($json)) $json = [];
    if (!array_key_exists('ok',$json)) $json['ok'] = ($code >= 200 && $code < 300);
    if ($code >= 400 && empty($json['message'])) $json['message'] = 'Erro '.$code.' no servidor de licença.';

    if (!empty($json['license']) && is_array($json['license'])) {
      $json['license']['site']       = home_url('/');
      $json['license']['last_check'] = time();
      self::save(array_merge(self::get(), $json['license']));
    }

    return $json;
  }

}
MAA_Pro_Licensing::init();

// ==== Ponte pública de licença para módulos PRO (YouTube etc.)
if (!function_exists('maa_pro_is_license_active')) {
  function maa_pro_is_license_active(){
    return class_exists('MAA_Pro_Licensing') && MAA_Pro_Licensing::is_active();
  }
}

// Permite override por filtro: com BYPASS fica sempre true
add_filter('maa_pro_license_is_active', function($ok){
  if (defined('MAA_PRO_DEV_BYPASS') && MAA_PRO_DEV_BYPASS) return true;
  return $ok ?: maa_pro_is_license_active();
}, 1);

endif;

/* ====================================================
 * NÚCLEO DO PRO (carregamento de módulos)
 * ==================================================== */
if ( ! class_exists('MAA_Pro_Core') ):
final class MAA_Pro_Core {
  public static function init() {
    add_action('plugins_loaded', [__CLASS__, 'load_modules'], 5);
    add_action('admin_notices',  [__CLASS__, 'maybe_warn_base_missing']);
  }

  public static function load_modules() {
    if ( ! class_exists('MAA_Pro_Licensing') || ! MAA_Pro_Licensing::is_active() ) return;

    if ( ! defined('MAA_PRO_IMAGE_ENABLED') ) define('MAA_PRO_IMAGE_ENABLED', true);

    $image_module = MAA_PRO_DIR . 'maa-image.php';
    if ( file_exists($image_module ) ) require_once $image_module;

    foreach ( glob(MAA_PRO_DIR . 'maa-*.php') as $file ) {
      if ( basename($file) === basename(__FILE__) ) continue;
      if ( $file === $image_module ) continue;
      require_once $file;
    }
  }

  public static function maybe_warn_base_missing() {
    if ( class_exists('MAA_AutoArticles') ) return;
    if ( ! current_user_can('manage_options') ) return;
    echo '<div class="notice notice-warning"><p><strong>MAA PRO:</strong> o plugin base <em>MAA – Máquina de Artigos Automáticos</em> não está ativo. '
       . 'Ative o base para usar todos os recursos do PRO (API Key, etc.).</p></div>';
  }
}
MAA_Pro_Core::init();
endif;

/* ====================================================
 * Hooks de ciclo de vida
 * ==================================================== */
if ( ! function_exists('maa_pro_on_deactivate') ) {
  function maa_pro_on_deactivate(){
    if ( class_exists('MAA_Pro_Licensing') ) {
      $lic = MAA_Pro_Licensing::get();
      if (!empty($lic['token']) && !(defined('MAA_PRO_DEV_BYPASS') && MAA_PRO_DEV_BYPASS)) {
        $curr = home_url('/');
        // usa o helper remoto (com -any e fallbacks) para evitar 415
        MAA_Pro_Licensing::remote('sites/remove', [
          'product_id'=>MAA_LIC_PRODUCT,
          'token'=>$lic['token'],
          'site'=>$curr,
        ]);
        MAA_Pro_Licensing::remote('deactivate', [
          'product_id'=>MAA_LIC_PRODUCT,
          'token'=>$lic['token'],
          'site'=>$curr,
        ]);
      }
    }
  }
}
register_deactivation_hook(__FILE__, 'maa_pro_on_deactivate');

if ( ! function_exists('maa_pro_uninstall') ) {
  function maa_pro_uninstall(){
    delete_option(MAA_LIC_OPT);
    wp_clear_scheduled_hook('maa_pro_license_cron');
  }
}
register_uninstall_hook(__FILE__, 'maa_pro_uninstall');
register_activation_hook(__FILE__, function(){ /* noop */ });