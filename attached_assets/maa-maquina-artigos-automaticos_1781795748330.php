<?php
/**
 * Plugin Name: MAA | Máquina Automática de Artigos
 * Description: MAA | Máquina Automática de Artigos
 * Version: 1.2.8
 * Author: Jefferson SLV
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( ! class_exists( 'MAA_AutoArticles' ) ) :

final class MAA_AutoArticles {
    const VERSION            = '1.2.8';
    const OPTION_KEY         = 'maa_settings';
    const REST_NS            = 'maa/v1';
    const KEY_SENTINEL       = '__MAA_KEY_SAVED__'; // mantido por compatibilidade
    const PRO_URL            = 'https://pay.hotmart.com/T102395674U?off=wwxwlcr1&bid=1761078243584';
    const REMOTE_NOTICE_TRANSIENT = 'maa_remote_notice_html';
    const REMOTE_NOTICE_TTL  = 300;
    const REMOTE_IFRAME_URL  = 'https://jeffersonslv.com/maa-avisos.html';

    public static function init() {
        add_action( 'admin_menu',            array( __CLASS__, 'register_admin_menu' ) );
        add_action( 'admin_init',            array( __CLASS__, 'register_settings' ) );
        add_action( 'add_meta_boxes',        array( __CLASS__, 'register_metabox' ) );
        add_action( 'add_meta_boxes',        array( __CLASS__, 'register_image_stub_metabox' ) );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
        add_action( 'rest_api_init',         array( __CLASS__, 'register_rest_routes' ) );
        add_action( 'init', array( __CLASS__, 'maybe_migrate_prompts_to_storage' ), 5 );

        // Metas por post (idioma/país)
        add_action( 'init', array( __CLASS__, 'register_post_metas' ) );

        add_filter( 'maa_pro_upgrade_url', array( __CLASS__, 'filter_pro_upgrade_url' ) );
    }

    public static function filter_pro_upgrade_url( $url ) { return self::PRO_URL; }

    /* ------------------------- PRO helpers ------------------------- */
    public static function is_pro_active() : bool {
        return ( defined('MAA_PRO_ACTIVE') || class_exists('MAA_Pro_Core') || defined('MAA_PRO_VERSION') );
    }

    /** Retorna se a licença PRO está realmente ativa (usa o filtro exposto no PRO). */
    public static function is_pro_license_active() : bool {
        $licensed = apply_filters('maa_pro_license_is_active', false);
        return (bool) $licensed;
    }

    public static function is_pro_image_module_available() : bool {
        if ( defined('MAA_PRO_IMAGE_ENABLED') ) return true;
        if ( class_exists('MAA_PRO_Image_Module') ) return true;
        return false;
    }

    /* ------------------------- Settings ------------------------- */
    public static function defaults() {
        return array(
            // NOVO: armazenamento simples/visível
            'openai_key' => '',
            'google_key' => '',

            // Legado (mantidos só p/ compatibilidade com módulos antigos)
            'openai_key_enc' => '',
            'google_key_enc' => '',

            'system_prompt'        => "Você é um redator jornalístico e sempre responde em JSON válido. Retorne apenas {\"title\",\"subtitle\",\"content_html\"}. Escreva com clareza, factualidade e boa legibilidade.",
            // Guarda a última versão do prompt principal (mas quem manda é o arquivo em /prompts)
            'main_prompt_template' => '',
            // NOVO: índice de presets de prompt
            'prompt_presets'       => array(),
        );
    }

    public static function get_settings() {
        $opts = get_option( self::OPTION_KEY, array() );
        if ( ! is_array( $opts ) ) { $opts = array(); }
        $defaults = self::defaults();
        $opts = wp_parse_args( $opts, $defaults );

        // MIGRAÇÃO automática: se a chave nova estiver vazia mas a antiga existir, preenche a nova (apenas em memória)
        if ( empty($opts['openai_key']) && !empty($opts['openai_key_enc']) ) {
            $opts['openai_key'] = self::decrypt_from_storage( $opts['openai_key_enc'] );
        }
        if ( empty($opts['google_key']) && !empty($opts['google_key_enc']) ) {
            $opts['google_key'] = self::decrypt_from_storage( $opts['google_key_enc'] );
        }
        return $opts;
    }

    // Helpers para recuperar chaves (prioriza formato novo, faz fallback p/ legado)
    protected static function get_openai_key() {
        $s = self::get_settings();
        if ( !empty($s['openai_key']) ) return $s['openai_key'];
        return self::decrypt_from_storage( $s['openai_key_enc'] ?? '' );
    }

    protected static function get_google_key() {
        $s = self::get_settings();
        if ( !empty($s['google_key']) ) return $s['google_key'];
        return self::decrypt_from_storage( $s['google_key_enc'] ?? '' );
    }

/* ------------------------- Prompt storage (persistente) ------------------------- */

/**
 * Pasta persistente para prompts (não é afetada por update do plugin).
 * Default: wp-content/uploads/maa-prompts/
 */
protected static function prompts_storage_dir() : string {
    $u = wp_upload_dir(null, false);
    $dir = trailingslashit($u['basedir']) . 'maa-prompts/';
    $dir = apply_filters('maa_prompts_storage_dir', $dir);

    if ( function_exists('wp_mkdir_p') ) {
        wp_mkdir_p($dir);
    }
    return trailingslashit($dir);
}

protected static function prompts_storage_path(string $filename) : string {
    $filename = ltrim($filename, "/\\");
    return self::prompts_storage_dir() . $filename;
}

/**
 * Lê prompt de arquivo.
 * - .php (legado): include que retorna string
 * - outros: file_get_contents
 */
protected static function read_prompt_file(string $path) : string {
    if ( !file_exists($path) || !is_file($path) ) return '';

    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if ( $ext === 'php' ) {
        $v = include $path;
        return is_string($v) ? $v : '';
    }

    $txt = @file_get_contents($path);
    return is_string($txt) ? $txt : '';
}

/**
 * Escreve prompt no path informado.
 * - .php: escreve retorno seguro via var_export (legado)
 * - outros (.txt): escreve texto puro
 */
protected static function write_prompt_file_to_path( string $path, string $prompt ) : bool {
    if ( function_exists( 'wp_mkdir_p' ) ) {
        wp_mkdir_p( dirname( $path ) );
    }

    $prompt = str_replace("\r\n", "\n", $prompt);

    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if ( $ext === 'php' ) {
        $php = "<?php\nreturn " . var_export( $prompt, true ) . ";\n";
        $written = @file_put_contents( $path, $php );
    } else {
        $written = @file_put_contents( $path, $prompt );
    }

    if ($written !== false) {
        @chmod($path, 0644);
        return true;
    }
    return false;
}

/**
 * Migra prompts antigos (dentro do plugin) para o storage persistente (uploads),
 * e ainda reconstrói o índice (prompt_presets) se necessário.
 */
public static function maybe_migrate_prompts_to_storage() : void {
    if ( !is_admin() ) return;

    static $ran = false;
    if ($ran) return;
    $ran = true;

    $storageDir = self::prompts_storage_dir();

    $settings = get_option(self::OPTION_KEY, array());
    if ( !is_array($settings) ) $settings = array();

    $changed = false;

    // ------------------ MAIN PROMPT (global) ------------------
    $mainStorage = apply_filters('maa_main_prompt_storage_path', self::prompts_storage_path('main_prompt.txt'));

    if ( !file_exists($mainStorage) || trim((string)@file_get_contents($mainStorage)) === '' ) {
        // 1) Preferir o que está salvo no option (persistente no banco)
        $tpl = '';
        if ( isset($settings['main_prompt_template']) && is_string($settings['main_prompt_template']) ) {
            $tpl = trim(str_replace("\r\n", "\n", $settings['main_prompt_template']));
        }

        if ( $tpl !== '' ) {
            self::write_prompt_file_to_path($mainStorage, $tpl);
        } else {
            // 2) fallback: arquivo default/legado dentro do plugin
            $legacy = apply_filters('maa_prompt_file_path', plugin_dir_path(__FILE__) . 'prompts/main_prompt.php');
            $legacyStr = self::read_prompt_file($legacy);
            if ( trim($legacyStr) !== '' ) {
                self::write_prompt_file_to_path($mainStorage, $legacyStr);
            }
        }
    }

    // ------------------ PRESETS (modelos adicionais) ------------------
    if ( !isset($settings['prompt_presets']) || !is_array($settings['prompt_presets']) ) {
        $settings['prompt_presets'] = array();
        $changed = true;
    }

    // 1) Migra os que estão indexados no option
    foreach ( $settings['prompt_presets'] as $slug => $info ) {
        if ( !is_array($info) ) continue;

        $file = isset($info['file']) ? basename((string)$info['file']) : '';
        if ($file === '') continue;

        // Converte legado .php -> .txt no storage (mais robusto)
        $newFile = preg_replace('/\.php$/i', '.txt', $file);
        if ($newFile === '') $newFile = $file;

        $dst = self::prompts_storage_path($newFile);

        if ( !file_exists($dst) ) {
            $src = plugin_dir_path(__FILE__) . 'prompts/' . $file;
            $srcStr = self::read_prompt_file($src);
            if ( trim($srcStr) !== '' ) {
                self::write_prompt_file_to_path($dst, $srcStr);
            }
        }

        if ( ($settings['prompt_presets'][$slug]['file'] ?? '') !== $newFile ) {
            $settings['prompt_presets'][$slug]['file'] = $newFile;
            $changed = true;
        }
    }

    // 2) Se por algum motivo o índice sumiu/foi resetado, reconstrói a partir dos arquivos no storage
    $storageFiles = @glob($storageDir . 'maa-prompt-*.*') ?: array();
    foreach ( $storageFiles as $full ) {
        $bn = basename($full);
        if ( !preg_match('/^maa-prompt-(.+)\.(txt|php)$/i', $bn, $m) ) continue;

        $slug = sanitize_key($m[1]);
        if ($slug === '') continue;

        if ( !isset($settings['prompt_presets'][$slug]) || !is_array($settings['prompt_presets'][$slug]) ) {
            $settings['prompt_presets'][$slug] = array(
                'name' => ucwords(str_replace('-', ' ', $slug)),
                'file' => $bn,
            );
            $changed = true;
        }
    }

    if ($changed) {
        update_option(self::OPTION_KEY, $settings);
    }
}


    /* -------- Prompt base (fallback local). O oficial vem do arquivo em /prompts -------- */
    public static function sample_main_prompt() {
        return <<<EOT
(Pauta={{pauta}})
(fonte_conteudo1={{fonte_conteudo1}})
(fonte_conteudo2={{fonte_conteudo2}})
(fonte_conteudo3={{fonte_conteudo3}})
(tipo={{estilo}})
(estilo={{estilo}})
(palavra-chave-alvo:{{palavra_chave_alvo}})

##
- Não escreva códigos de idioma como "pt-BR", "pt-BR>", "pt", "en-US" ou similares em NENHUMA parte da resposta.
- Não coloque "pt-BR", "pt-BR>" ou qualquer código de idioma antes do título, do subtítulo ou de qualquer parágrafo.
- Comece SEMPRE o título diretamente com o conteúdo, sem prefixos de idioma.

## Você é um jornalista que escreve notícias no idioma {{idioma}} do país {{pais}} com base em fontes recebidas. Pegue o conteúdo acima e produza uma matéria original e fácil de entender. Você é especialista em rankear artigos no Discover.
##Para a pauta e o conteúdo acima, elabore um título de cauda longa altamente chamativo e otimizado para SEO de entidades e interesses para o Google Discover.
##Com base nas fontes acima, escreva uma notícia original e bem elaborada com cerca da mesma quantidade de palavras do fonte_conteudo1 e estruturada em título h1, subtítulo h2 e até no máximo 4 subtítulos h3. Foque em escrever de forma fácil de compreender e escaneável.

## RESPOSTA (JSON):
{
  "title": "...",
  "subtitle": "...",
  "content_html": "<p>...</p>"
}
EOT;
    }

    public static function load_main_prompt() {
    // Novo: storage persistente
    $storage = apply_filters('maa_main_prompt_storage_path', self::prompts_storage_path('main_prompt.txt'));

    $str = self::read_prompt_file($storage);
    if ( is_string($str) && trim($str) !== '' ) {
        return apply_filters('maa_prompt_string', $str);
    }

    // Se o arquivo não existe (ou está vazio), tenta restaurar via option (DB)
    $s = self::get_settings();
    if ( !empty($s['main_prompt_template']) && is_string($s['main_prompt_template']) ) {
        $tpl = trim(str_replace("\r\n","\n",$s['main_prompt_template']));
        if ( $tpl !== '' ) {
            self::write_prompt_file_to_path($storage, $tpl);
            return apply_filters('maa_prompt_string', $tpl);
        }
    }

    // fallback: arquivo default do plugin
    $legacy = plugin_dir_path(__FILE__) . 'prompts/main_prompt.php';
    $legacy = apply_filters('maa_prompt_file_path', $legacy);

    if ( file_exists($legacy) ) {
        $legacyStr = self::read_prompt_file($legacy);
        if ( is_string($legacyStr) && trim($legacyStr) !== '' ) {
            // “fixa” no storage para não depender do plugin em updates futuros
            self::write_prompt_file_to_path($storage, $legacyStr);
            return apply_filters('maa_prompt_string', $legacyStr);
        }
    }

    $fallback = self::sample_main_prompt();
    self::write_prompt_file_to_path($storage, $fallback);
    return $fallback;
}


    /**
     * Sobrescreve o arquivo prompts/main_prompt.php com o prompt informado.
     * Assim todos os módulos que incluem esse arquivo passam a usar o novo prompt.
     */
 protected static function write_main_prompt_file( string $prompt ) : bool {
    $storage = apply_filters('maa_main_prompt_storage_path', self::prompts_storage_path('main_prompt.txt'));
    return self::write_prompt_file_to_path( $storage, $prompt );
}


    /**
     * Retorna índice de presets salvos nas configurações.
     */
    protected static function get_prompt_presets_index() : array {
        $settings = self::get_settings();
        $list = isset( $settings['prompt_presets'] ) && is_array( $settings['prompt_presets'] )
            ? $settings['prompt_presets']
            : array();
        return $list;
    }

    /**
     * Lista de presets formatada para uso no JS (inclui o corpo do prompt).
     */
    public static function get_prompt_presets_for_js() : array {
        $out   = array();
        $index = self::get_prompt_presets_index();

        foreach ( $index as $slug => $info ) {
            if ( ! is_array( $info ) ) {
                continue;
            }
            $name = isset( $info['name'] ) && is_string( $info['name'] ) && $info['name'] !== '' ? $info['name'] : $slug;
            $body = self::load_prompt_by_id( $slug );

            $out[] = array(
                'id'    => $slug,
                'label' => $name,
                'body'  => $body,
            );
        }

        return $out;
    }

    /**
     * Carrega o corpo de um prompt baseado em um ID/slug salvo.
     * Se não encontrar, volta para o prompt principal.
     */
    public static function load_prompt_by_id( string $id ) : string {
    $id = sanitize_key( $id );
    if ( $id === '' || $id === 'default' || $id === 'main' ) {
        return self::load_main_prompt();
    }

    $index = self::get_prompt_presets_index();
    if ( empty( $index[ $id ] ) || ! is_array( $index[ $id ] ) ) {
        return self::load_main_prompt();
    }

    $file = isset( $index[ $id ]['file'] ) ? trim( (string) $index[ $id ]['file'] ) : '';
    if ( $file === '' ) {
        return self::load_main_prompt();
    }

    $file = basename($file);

    // Novo: busca primeiro no storage persistente
    $path = self::prompts_storage_path($file);
    $str  = self::read_prompt_file($path);
    if ( is_string($str) && trim($str) !== '' ) {
        return $str;
    }

    // fallback legado: dentro do plugin (se existir, copia pro storage)
    $legacy = plugin_dir_path(__FILE__) . 'prompts/' . $file;
    if ( file_exists($legacy) ) {
        $legacyStr = self::read_prompt_file($legacy);
        if ( is_string($legacyStr) && trim($legacyStr) !== '' ) {
            self::write_prompt_file_to_path($path, $legacyStr);
            return $legacyStr;
        }
    }

    return self::load_main_prompt();
}


    /**
     * Cria/atualiza um arquivo de preset de prompt dentro de /prompts.
     */
   protected static function create_prompt_preset_file( string $filename, string $prompt ) : bool {
    $filename = basename($filename);

    $path = self::prompts_storage_path($filename);
    return self::write_prompt_file_to_path( $path, $prompt );
}


    /* ------------------------- Abas UI ------------------------- */
    public static function render_admin_tabs( string $active = 'settings' ) {
        $tabs = array(
            'settings'  => array('label' => 'Configurações',       'slug' => 'maa-settings'),
            'generator' => array('label' => 'Artigos Automáticos', 'slug' => 'maa-main'),
            'prompts'   => array('label' => 'Prompts',             'slug' => 'maa-prompts'),
        );
        echo '<h2 class="nav-tab-wrapper" style="margin-top:12px;">';
        foreach ($tabs as $key => $t) {
            $class = 'nav-tab' . ( $active === $key ? ' nav-tab-active' : '' );
            $url   = admin_url('admin.php?page=' . $t['slug']);
            printf('<a href="%s" class="%s">%s</a>', esc_url($url), esc_attr($class), esc_html($t['label']));
        }
        echo '</h2>';
    }

    /* ------------------------- Menu ------------------------- */
    public static function register_admin_menu() {
        add_menu_page(
            'MAA - Máquina de Artigos Automáticos',
            'MAA – Artigos Automáticos',
            'manage_options',
            'maa-settings',
            [__CLASS__, 'render_settings_page'],
            'dashicons-media-document',
            26
        );

        add_submenu_page(
            'maa-settings',
            'Configurações',
            'Configurações',
            'manage_options',
            'maa-settings',
            [__CLASS__, 'render_settings_page']
        );

        add_submenu_page(
            'maa-settings',
            'Artigos Automáticos',
            'Artigos Automáticos',
            'manage_options',
            'maa-main',
            [__CLASS__, 'render_auto_articles_page']
        );

        add_submenu_page(
            'maa-settings',
            'Prompts',
            'Prompts',
            'manage_options',
            'maa-prompts',
            [__CLASS__, 'render_prompts_page']
        );
    }

    public static function render_auto_articles_page() {
        // Mantém o comportamento antigo do módulo em massa
        if ( class_exists('MAA_Mass_Generator') && is_callable( array('MAA_Mass_Generator','render_page') ) ) {
            MAA_Mass_Generator::render_page();
            return;
        }
        echo '<div class="wrap"><h1>MAA - Máquina de Artigos Automáticos</h1>';
        echo '<p style="margin-top:4px;color:#666;">Versão instalada: <strong>'.esc_html(self::VERSION).'</strong></p>';
        echo '<hr/><p>Erro: módulo de Artigos Automáticos não encontrado (verifique maa-mass.php).</p></div>';
    }

    /* ------------------------- Settings Page ------------------------- */
    public static function render_settings_page() {
        echo '<div class="wrap">';

        if ( ! self::is_pro_active() ) : ?>
            <style>
              .maa-avisos-wrap{ margin: 10px 0 16px 0; background:#fff; border:1px solid #dcdcde; border-radius:6px; overflow:hidden; }
              .maa-avisos-toolbar{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; background:#f6f7f7; border-bottom:1px solid #e2e4e7; }
              .maa-avisos-toolbar .left{ font-weight:600; color:#333; }
              .maa-avisos-toolbar .right a{ margin-left:8px; text-decoration:none; }
              #maa-avisos-frame{ width:100%; border:0; display:block; height:380px; }
              @media (min-height: 100px){ #maa-avisos-frame{ height:120px; } }
            </style>
            <div class="maa-avisos-wrap">
              <div class="maa-avisos-toolbar">
                <div class="left">Avisos & comunicados</div>
              </div>
              <iframe id="maa-avisos-frame" src="<?php echo esc_url( self::REMOTE_IFRAME_URL ); ?>" loading="lazy" referrerpolicy="no-referrer"></iframe>
            </div>
            <script>
              (function(){
                var btn = document.getElementById('maa-avisos-reload');
                var fr  = document.getElementById('maa-avisos-frame');
                if(btn && fr){
                  btn.addEventListener('click', function(e){
                    e.preventDefault();
                    try{
                      var url = new URL(fr.src);
                      url.searchParams.set('_t', Date.now().toString());
                      fr.src = url.toString();
                    }catch(err){
                      fr.src = fr.src;
                    }
                  });
                }
              })();
            </script>
        <?php endif;

        echo '<h1>Configurações – MAA</h1>';
        echo '<p style="margin-top:4px;color:#666;">Versão instalada: <strong>' . esc_html(self::VERSION) . '</strong></p>';

        self::render_admin_tabs('settings');

        echo '<form method="post" action="options.php">';
        settings_fields( 'maa_group' );
        do_settings_sections( 'maa-settings' );
        submit_button();
        echo '</form></div>';
    }

    public static function render_prompts_page() {
        echo '<div class="wrap">';
        echo '<h1>Prompts – MAA</h1>';
        echo '<p style="margin-top:4px;color:#666;">Versão instalada: <strong>' . esc_html(self::VERSION) . '</strong></p>';

        self::render_admin_tabs('prompts');

        echo '<form method="post" action="options.php">';
        settings_fields( 'maa_group' );
        do_settings_sections( 'maa-prompts' );
        submit_button();
        echo '</form></div>';
    }

    public static function register_settings() {
        register_setting(
            'maa_group',
            self::OPTION_KEY,
            array(
                'type'              => 'array',
                'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ),
                'default'           => self::defaults(),
                'show_in_rest'      => false,
            )
        );

        // Aba de configurações gerais
        add_settings_section( 'maa_main', 'Configurações do MAA', '__return_false', 'maa-settings' );

        add_settings_field(
            'openai_key',
            'OpenAI API Key',
            array( __CLASS__, 'field_openai_key' ),
            'maa-settings',
            'maa_main'
        );

        add_settings_field(
            'google_key',
            'Google AI Studio API Key (Gemini – Cota de uso gratuito)',
            array( __CLASS__, 'field_google_key' ),
            'maa-settings',
            'maa_main'
        );

        // Aba de prompts – prompt global
        add_settings_section(
            'maa_prompts_global',
            'Prompt base dos artigos (global)',
            '__return_false',
            'maa-prompts'
        );

        add_settings_field(
            'main_prompt_template',
            'Conteúdo do prompt global',
            array( __CLASS__, 'field_main_prompt_template' ),
            'maa-prompts',
            'maa_prompts_global'
        );

        // Aba de prompts – modelos adicionais
        add_settings_section(
            'maa_prompts_presets',
            'Modelos de prompt adicionais',
            '__return_false',
            'maa-prompts'
        );

        add_settings_field(
            'prompt_presets_manager',
            'Modelos de prompt',
            array( __CLASS__, 'field_prompt_presets_manager' ),
            'maa-prompts',
            'maa_prompts_presets'
        );
    }

public static function sanitize_settings( $input ) {
    $current = self::get_settings();
    $out     = $current;

    // NOVO formato: texto puro, sempre visível
    if ( array_key_exists( 'openai_key', $input ) ) {
        $raw                = trim( (string) $input['openai_key'] );
        $out['openai_key']  = $raw;
        // Compatibilidade: também grava o campo legado em formato "plain:" para módulos antigos
        $out['openai_key_enc'] = $raw !== '' ? ( 'plain:' . base64_encode( $raw ) ) : '';
    }

    if ( array_key_exists( 'google_key', $input ) ) {
        $raw                 = trim( (string) $input['google_key'] );
        $out['google_key']   = $raw;
        // Compatibilidade: grava legado
        $out['google_key_enc'] = $raw !== '' ? ( 'plain:' . base64_encode( $raw ) ) : '';
    }

    if ( isset( $input['system_prompt'] ) ) {
        $sp                   = trim( (string) $input['system_prompt'] );
        $out['system_prompt'] = ( $sp === '' ) ? self::defaults()['system_prompt'] : $sp;
    } elseif ( empty( $out['system_prompt'] ) ) {
        $out['system_prompt'] = self::defaults()['system_prompt'];
    }

    // NOVO: prompt base global
    if ( array_key_exists( 'main_prompt_template', $input ) ) {
        $tpl = (string) $input['main_prompt_template'];
        $tpl = str_replace( "\r\n", "\n", $tpl );
        $tpl = trim( $tpl );

        if ( $tpl === '' ) {
            // Se o usuário apagar tudo, volta para o prompt padrão de exemplo
            $tpl = self::sample_main_prompt();
        }

        $out['main_prompt_template'] = $tpl;

        // Grava também no arquivo físico em /prompts/main_prompt.php
        if ( ! self::write_main_prompt_file( $tpl ) && function_exists( 'add_settings_error' ) ) {
            add_settings_error(
                self::OPTION_KEY,
                'maa_main_prompt_write_fail',
                'Não foi possível salvar o prompt no arquivo prompts/main_prompt.php. Verifique as permissões de escrita no servidor.',
                'error'
            );
        }
    }

    // ==================== PRESETS DE PROMPT ====================
    // Estado atual dos presets
    $existing = isset( $out['prompt_presets'] ) && is_array( $out['prompt_presets'] ) ? $out['prompt_presets'] : array();

    // Verifica se o botão "Excluir este modelo" foi clicado
    $delete_slug = '';
    if ( isset( $_POST['maa_delete_preset'] ) ) {
        $delete_slug = sanitize_key( wp_unslash( $_POST['maa_delete_preset'] ) );
    }

    // Edição de presets existentes
    if ( isset( $input['prompt_presets'] ) && is_array( $input['prompt_presets'] ) ) {
        foreach ( $input['prompt_presets'] as $slug => $data ) {
            $slug = sanitize_key( $slug );
            if ( $slug === '' || ! isset( $existing[ $slug ] ) || ! is_array( $existing[ $slug ] ) ) {
                continue;
            }

            // Se será excluído, não precisa tentar atualizar arquivo
            if ( $delete_slug && $slug === $delete_slug ) {
                continue;
            }

            $name = isset( $data['name'] ) ? sanitize_text_field( $data['name'] ) : ( $existing[ $slug ]['name'] ?? $slug );
            $body = isset( $data['body'] ) ? (string) $data['body'] : '';
            $body = str_replace( "\r\n", "\n", $body );
            $body = trim( $body );
            if ( $body === '' ) {
                $body = self::sample_main_prompt();
            }

            $filename = isset( $existing[ $slug ]['file'] ) ? (string) $existing[ $slug ]['file'] : '';

            if ( $filename !== '' ) {
                if ( self::create_prompt_preset_file( $filename, $body ) ) {
                    $existing[ $slug ]['name'] = $name;
                } elseif ( function_exists( 'add_settings_error' ) ) {
                    add_settings_error(
                        self::OPTION_KEY,
                        'maa_prompt_preset_update_fail_' . $slug,
                        'Não foi possível atualizar o modelo de prompt "' . $name . '". Verifique as permissões de escrita na pasta /prompts.',
                        'error'
                    );
                }
            }
        }
    }

    // Exclusão de preset, se solicitado
    if ( $delete_slug && isset( $existing[ $delete_slug ] ) ) {
        $filename = isset( $existing[ $delete_slug ]['file'] ) ? (string) $existing[ $delete_slug ]['file'] : '';
        if ( $filename !== '' ) {
            $filename = basename( $filename );
            $filepath = self::prompts_storage_path( $filename );
            if ( file_exists( $filepath ) && is_file( $filepath ) ) {
                @unlink( $filepath );
            }
        }
        unset( $existing[ $delete_slug ] );
    }

    // Criação de novo preset de prompt
    if ( ! empty( $input['new_prompt_name'] ) ) {
        $name = sanitize_text_field( $input['new_prompt_name'] );
        $body = isset( $input['new_prompt_body'] ) ? (string) $input['new_prompt_body'] : '';
        $body = str_replace( "\r\n", "\n", $body );
        $body = trim( $body );

        if ( $body === '' ) {
            $body = self::sample_main_prompt();
        }

        // Gera slug único
        $slug = sanitize_title( $name );
        if ( $slug === '' ) {
            $slug = 'preset-' . wp_generate_password( 6, false, false );
        }

        $base = $slug;
        $i    = 2;
        while ( isset( $existing[ $slug ] ) ) {
            $slug = $base . '-' . $i;
            $i++;
        }

        $filename = 'maa-prompt-' . $slug . '.txt';

        if ( self::create_prompt_preset_file( $filename, $body ) ) {
            $existing[ $slug ] = array(
                'name' => $name,
                'file' => $filename,
            );
        } elseif ( function_exists( 'add_settings_error' ) ) {
            add_settings_error(
                self::OPTION_KEY,
                'maa_prompt_preset_write_fail',
                'Não foi possível salvar o novo modelo de prompt. Verifique as permissões de escrita na pasta /prompts.',
                'error'
            );
        }
    }

    $out['prompt_presets'] = $existing;

    return $out;
}


public static function field_openai_key() {
    $s       = self::get_settings();
    $raw     = isset( $s['openai_key'] ) ? (string) $s['openai_key'] : '';
    $has_key = $raw !== '';

    $display_value = $has_key ? self::mask_api_key( $raw, 6 ) : '';
    $placeholder   = $has_key
        ? 'Chave já salva – digite outra para substituir'
        : 'Cole aqui sua OpenAI API Key';

    ?>
    <input
        type="text"
        id="maa-openai-key"
        name="<?php echo esc_attr( self::OPTION_KEY ); ?>[openai_key]"
        value="<?php echo esc_attr( $display_value ); ?>"
        autocomplete="off"
        placeholder="<?php echo esc_attr( $placeholder ); ?>"
        style="width:480px;"
        oncopy="return false"
        oncut="return false"
        oncontextmenu="return false"
        data-maa-mask="<?php echo esc_attr( $display_value ); ?>"
    />
    <?php if ( $has_key ) : ?>
        <p class="description">
            A chave atual está salva. Apenas os primeiros caracteres são exibidos.
            Para alterar, digite ou cole uma nova chave e salve as configurações.
        </p>
    <?php else : ?>
        <p class="description">
            Cole aqui sua OpenAI API Key.
        </p>
    <?php endif; ?>

    <script>
    (function(){
        var input = document.getElementById('maa-openai-key');
        if (!input) return;

        var mask = input.getAttribute('data-maa-mask') || '';
        var form = input.form;
        if (!form) return;

        form.addEventListener('submit', function () {
            // Se o valor no submit for exatamente o valor mascarado,
            // quer dizer que o usuário NÃO alterou o campo.
            if (mask && input.value === mask) {
                // Remove o "name" para o WP não enviar esse campo
                // e não sobrescrever a chave salva com o texto mascarado.
                input.removeAttribute('name');
            }
        });
    })();
    </script>
    <?php
}



public static function field_google_key() {
    $s       = self::get_settings();
    $raw     = isset( $s['google_key'] ) ? (string) $s['google_key'] : '';
    $has_key = $raw !== '';

    $display_value = $has_key ? self::mask_api_key( $raw, 6 ) : '';
    $placeholder   = $has_key
        ? 'Chave já salva – digite outra para substituir'
        : 'Cole aqui sua Google AI Studio API Key (Gemini)';

    ?>
    <input
        type="text"
        id="maa-google-key"
        name="<?php echo esc_attr( self::OPTION_KEY ); ?>[google_key]"
        value="<?php echo esc_attr( $display_value ); ?>"
        autocomplete="off"
        placeholder="<?php echo esc_attr( $placeholder ); ?>"
        style="width:480px;"
        oncopy="return false"
        oncut="return false"
        oncontextmenu="return false"
        data-maa-mask="<?php echo esc_attr( $display_value ); ?>"
    />
    <?php if ( $has_key ) : ?>
        <p class="description">
            A chave atual está salva. Apenas os primeiros caracteres são exibidos.
            Para alterar, digite ou cole uma nova chave e salve as configurações.
        </p>
    <?php else : ?>
        <p class="description">
            Cole aqui sua Google AI Studio API Key (Gemini).
        </p>
    <?php endif; ?>

    <script>
    (function(){
        var input = document.getElementById('maa-google-key');
        if (!input) return;

        var mask = input.getAttribute('data-maa-mask') || '';
        var form = input.form;
        if (!form) return;

        form.addEventListener('submit', function () {
            if (mask && input.value === mask) {
                input.removeAttribute('name');
            }
        });
    })();
    </script>
    <?php
}



    /**
     * Campo de edição do prompt global na tela de Prompts.
     * Ao salvar, o conteúdo é gravado em prompts/main_prompt.php
     * e passa a ser o padrão em TODOS os módulos que usam esse arquivo.
     */
    public static function field_main_prompt_template() {
        // Mostra o que está realmente em uso como prompt global
        $current = self::load_main_prompt();

        echo '<textarea name="' . esc_attr( self::OPTION_KEY ) . '[main_prompt_template]" rows="16" style="width:100%;font-family:monospace;">';
        echo esc_textarea( $current );
        echo '</textarea>';

        echo '<p class="description" style="max-width:800px;">';
        echo 'Cuidados ao editar o prompt global:';
        echo '<br/>- Não remova variáveis como {{pauta}}, {{fonte_conteudo1}}, {{fonte_conteudo2}} e {{fonte_conteudo3}}.';
        echo '<br/>- Edite apenas o que tiver com ## na frente, pode remover, adicionar e etc.. NÃO remova a parte do modelo JSON, se fizer isso vai bugar tudo';
        echo '</p>';
    }

    /**
     * Campo para gerenciar presets de prompt (criação e edição).
     */
public static function field_prompt_presets_manager() {
    $presets = self::get_prompt_presets_index();

    if ( ! empty( $presets ) ) {
        echo '<p><strong>Modelos existentes</strong></p>';
        foreach ( $presets as $slug => $info ) {
            if ( ! is_array( $info ) ) {
                continue;
            }
            $name = isset( $info['name'] ) && $info['name'] !== '' ? $info['name'] : $slug;
            $body = self::load_prompt_by_id( $slug );

            echo '<div class="maa-preset-block" style="margin-bottom:16px;padding:10px;border:1px solid #dcdcde;border-radius:4px;background:#fafafa;">';
            echo '<p><strong>Slug:</strong> <code>' . esc_html( $slug ) . '</code></p>';

            echo '<p>';
            echo '<label><strong>Nome do modelo</strong></label><br />';
            echo '<input type="text" name="' . esc_attr( self::OPTION_KEY ) . '[prompt_presets][' . esc_attr( $slug ) . '][name]" value="' . esc_attr( $name ) . '" style="width:320px;" />';
            echo '</p>';

            echo '<p>';
            echo '<label><strong>Conteúdo do prompt</strong></label><br />';
            echo '<textarea name="' . esc_attr( self::OPTION_KEY ) . '[prompt_presets][' . esc_attr( $slug ) . '][body]" rows="10" style="width:100%;font-family:monospace;">';
            echo esc_textarea( $body );
            echo '</textarea>';
            echo '</p>';

            echo '<p style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">';
            // Botão de salvar (apenas dá submit no formulário)
            echo '<button type="submit" class="button button-secondary">Salvar este modelo</button>';
            // Botão de excluir (marca qual slug excluir)
            echo '<button type="submit" name="maa_delete_preset" value="' . esc_attr( $slug ) . '" class="button button-link-delete" onclick="return confirm(\'Tem certeza que deseja excluir este modelo de prompt?\');">Excluir este modelo</button>';
            echo '</p>';

            echo '</div>';
        }
    } else {
        echo '<p>Nenhum modelo adicional de prompt cadastrado ainda.</p>';
    }

    $default_body = self::load_main_prompt();

    echo '<hr style="margin:12px 0;" />';
    echo '<p><strong>Novo modelo de prompt</strong></p>';

    echo '<p>';
    echo '<button type="button" class="button" id="maa-show-new-prompt">Adicionar novo prompt</button>';
    echo '</p>';

    echo '<div id="maa-new-prompt-wrap" style="display:none;margin-top:10px;">';

    echo '<p>';
    echo '<label for="maa-new-prompt-name">Nome do prompt</label><br />';
    echo '<input type="text" id="maa-new-prompt-name" name="' . esc_attr( self::OPTION_KEY ) . '[new_prompt_name]" style="width: 320px;" placeholder="Ex.: Notícia educacional pt-BR" />';
    echo '</p>';

    echo '<p>';
    echo '<label for="maa-new-prompt-body">Conteúdo do prompt</label><br />';
    echo '<textarea id="maa-new-prompt-body" name="' . esc_attr( self::OPTION_KEY ) . '[new_prompt_body]" rows="12" style="width:100%;font-family:monospace;">';
    echo esc_textarea( $default_body );
    echo '</textarea>';
    echo '</p>';

    echo '<p class="description" style="max-width:800px;">';
    echo 'Cuidados ao criar ou editar modelos:';
    echo '<br/>- Não remova os placeholders {{pauta}}, {{fonte_conteudo1}}, {{fonte_conteudo2}} e {{fonte_conteudo3}}.';
    echo '</p>';

    echo '</div>';

    // JS simples para mostrar/ocultar o formulário de novo prompt
    echo '<script>
    document.addEventListener("DOMContentLoaded", function(){
        var btn  = document.getElementById("maa-show-new-prompt");
        var wrap = document.getElementById("maa-new-prompt-wrap");
        if (btn && wrap) {
            btn.addEventListener("click", function(e){
                e.preventDefault();
                if (wrap.style.display === "none" || wrap.style.display === "") {
                    wrap.style.display = "block";
                    btn.textContent = "Ocultar formulário";
                } else {
                    wrap.style.display = "none";
                    btn.textContent = "Adicionar novo prompt";
                }
            });
        }
    });
    </script>';
}


    /* ------------------------- Metas por Post ------------------------- */
    public static function register_post_metas() {
        register_post_meta( 'post', 'maa_idioma', array(
            'type'              => 'string',
            'single'            => true,
            'show_in_rest'      => true,
            'sanitize_callback' => 'sanitize_text_field',
            'auth_callback'     => function() { return current_user_can( 'edit_posts' ); }
        ) );
        register_post_meta( 'post', 'maa_pais', array(
            'type'              => 'string',
            'single'            => true,
            'show_in_rest'      => true,
            'sanitize_callback' => 'sanitize_text_field',
            'auth_callback'     => function() { return current_user_can( 'edit_posts' ); }
        ) );
    }

    /* ------------------------- Metabox no editor ------------------------- */
    public static function register_metabox() {
        add_meta_box(
            'maa_box',
            'MAA – Gerar Conteúdo com IA (Gemini / OpenAI)',
            array( __CLASS__, 'render_metabox' ),
            array( 'post' ),
            'normal',
            'high'
        );
    }

    public static function register_image_stub_metabox() {
        if ( self::is_pro_image_module_available() ) return;
        add_meta_box(
            'maa_image_stub',
            'MAA – Geração de Imagens (PRO)',
            array( __CLASS__, 'render_image_stub_metabox' ),
            array( 'post' ),
            'side',
            'high'
        );
    }

    public static function render_image_stub_metabox( $post ) {
        $pro_url = esc_url( self::PRO_URL ); ?>
        <style>
          #maa_image_stub .maa-police-tape{ margin:-10px -12px 10px; padding:12px; color:#111; font-weight:600; text-align:center; background: repeating-linear-gradient(-45deg,#111 0 12px,#ffd100 12px 24px); border-bottom:1px solid #e2e4e7; }
          #maa_image_stub .maa-police-tape strong{ background:#ffd100; padding:2px 6px; border-radius:4px; }
          #maa_image_stub fieldset[disabled]{opacity:.6}
          #maa_image_stub .maa-stub-preview{ height:120px; background:#f6f7f7; border:1px dashed #d0d4d9; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#777; }
          #maa_image_stub .desc{color:#666; font-size:12px; margin:6px 0 0;}
        </style>
        <div class="maa-police-tape">
          <strong>Atualize para o PRO para desbloquear a geração de imagens</strong>
          <a class="button button-primary" href="<?php echo $pro_url; ?>" target="_blank" rel="noopener">Clique para ativar</a>
        </div>
        <fieldset disabled="disabled" aria-disabled="true">
          <p><label><strong>Prompt da imagem (capa, sem texto)</strong></label><br/>
          <textarea rows="4" style="width:100%;" placeholder="Ex.: Foto realista de ... iluminada por ... em ..."></textarea></p>
          <p style="margin:8px 0;">
            <label><input type="radio" checked> Escrever meu prompt</label><br/>
            <label><input type="radio"> Sugerir ideias (gpt-5-nano)</label>
          </p>
          <p style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="button">Gerar ideias</button>
            <button type="button" class="button button-primary">Gerar imagem</button>
          </p>
          <div class="maa-stub-preview"><em>Pré-visualização da capa</em></div>
          <p class="desc">Requer o módulo PRO instalado e ativo para funcionar.</p>
        </fieldset>
        <?php
    }

    public static function render_metabox( $post ) {
        wp_nonce_field( 'maa_metabox', 'maa_nonce' );

        $styles = array(
            'conteudo_viral_padrao' => 'Conteúdo viral padrão',
            'jornalistico'          => 'Jornalístico',
            'artigo_blog'           => 'Artigo de blog',
            'noticia_curta'         => 'Notícia curta',
            'review'                => 'Review',
            'nota'                  => 'Nota',
        );

        $seo_slug   = get_post_meta( $post->ID, 'maa_seo_slug', true );
        $seo_meta   = get_post_meta( $post->ID, 'maa_seo_meta', true );
        $seo_tags   = get_post_meta( $post->ID, 'maa_seo_tags', true );
        $seo_titles = get_post_meta( $post->ID, 'maa_seo_titles', true );
        if ( is_array($seo_tags) )   { $seo_tags   = implode(', ', $seo_tags); }
        if ( is_array($seo_titles) ) { $seo_titles = implode("\n", $seo_titles); }

        // Idioma/País salvos no post (defaults)
        $maa_idioma = get_post_meta( $post->ID, 'maa_idioma', true );
        $maa_pais   = get_post_meta( $post->ID, 'maa_pais', true );
        if ( empty( $maa_idioma ) ) $maa_idioma = 'pt-BR';
        if ( empty( $maa_pais ) )   $maa_pais   = 'Brasil';

        // Estado PRO (licença)
        $pro_active = self::is_pro_license_active();
        $pro_url    = esc_url( apply_filters('maa_pro_upgrade_url', self::PRO_URL) );

        // Presets de prompt disponíveis
        $prompt_presets = self::get_prompt_presets_index();

        echo '<p style="margin:0 0 8px 0;color:#666;">Versão do plugin: <strong>'.esc_html(self::VERSION).'</strong></p>'; ?>
        <div id="maa-panel">
            <p><label><strong>Pauta / Sugestão de Ângulo</strong></label><br/>
            <textarea id="maa-pauta" rows="3" style="width:100%;"></textarea></p>

            <!-- Fontes dinâmicas: 1 inicial + botão para adicionar até 3 no total -->
            <div id="maa-fontes-wrap" style="display:grid;grid-template-columns:1fr;gap:8px">
                <p class="maa-fonte-item">
                    <label><strong>Fonte – Conteúdo 1</strong></label><br/>
                    <textarea class="maa-fonte" rows="5" style="width:100%;"></textarea>
                </p>
            </div>
            <p style="margin:6px 0 0;">
                <button type="button" class="button" id="maa-add-fonte">Adicionar fonte (+2 máx.)</button>
            </p>

            <p style="display:grid; grid-template-columns:repeat(6, minmax(120px,1fr)); gap:12px; align-items:end;">
                <span>
                    <label><strong>Estilo</strong></label><br/>
                    <select id="maa-estilo">
                        <?php foreach ( $styles as $k => $v ) { echo '<option value="'.esc_attr($k).'">'.esc_html($v).'</option>'; } ?>
                    </select>
                </span>
                <span>
                    <label><strong>Palavra-chave destaque</strong></label><br/>
                    <input id="maa-keyword" type="text" placeholder="ex.: indústria de defesa"/>
                </span>
                <span>
                    <label><strong>Idioma do conteúdo</strong></label><br/>
                    <input id="maa-idioma" type="text" value="<?php echo esc_attr($maa_idioma); ?>" placeholder="ex.: pt-BR, en-US"/>
                </span>
                <span>
                    <label><strong>País</strong></label><br/>
                    <input id="maa-pais" type="text" value="<?php echo esc_attr($maa_pais); ?>" placeholder="ex.: Brasil, Portugal"/>
                </span>
                <span>
                    <label><strong>IA</strong></label><br/>
                    <select id="maa-provider">
                        <option value="gemini" selected>Gemini (Google)</option>
                        <option value="openai">OpenAI</option>
                    </select>
                </span>
                <span>
                    <label><strong>Modelo</strong></label><br/>
                    <select id="maa-model"></select>
                </span>
            </p>

            <p style="margin-top:8px;">
                <label><strong>Modelo de prompt</strong></label><br/>
                <select id="maa-prompt-preset" style="min-width:260px;">
                    <option value="default">Prompt padrão global</option>
                    <?php
                    if ( ! empty( $prompt_presets ) && is_array( $prompt_presets ) ) {
                        foreach ( $prompt_presets as $slug => $info ) {
                            if ( ! is_array( $info ) ) {
                                continue;
                            }
                            $name = isset( $info['name'] ) && $info['name'] !== '' ? $info['name'] : $slug;
                            echo '<option value="' . esc_attr( $slug ) . '">' . esc_html( $name ) . '</option>';
                        }
                    }
                    ?>
                </select>
            </p>

            <!-- PROMPT PERSONALIZADO (PRO) -->
            <div id="maa-advanced-wrap" style="margin:10px 0 6px;">
              <label style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="maa-use-custom-prompt" <?php echo $pro_active ? '' : 'disabled="disabled"'; ?> />
                <span><strong>Usar prompt personalizado</strong> <small style="color:#a00;">— ⚠ Avançado: use com cuidado; pode causar erro na geração.</small></span>
              </label>
              <?php if ( ! $pro_active ) : ?>
                <p id="maa-custom-prompt-note" class="description" style="margin:6px 0 0;">
                  <strong>Recurso PRO</strong> — ative sua licença PRO para poder editar o prompt.
                  <a href="<?php echo $pro_url; ?>" target="_blank" rel="noopener">Saiba mais</a>
                </p>
              <?php endif; ?>
              <textarea id="maa-custom-prompt" rows="12" style="width:100%;margin-top:8px;display:none;" <?php echo $pro_active ? '' : 'disabled="disabled"'; ?>></textarea>
            </div>

            <p style="margin-top:6px;">
                <button type="button" class="button button-primary" id="maa-generate">Gerar conteúdo</button>
                <span id="maa-status" style="margin-left:10px;"></span>
            </p>

            <hr style="margin:16px 0;"/>

            <h3>SEO automático</h3>
            <p class="description">
                Gera slug, metadescrição, tags e opções de título com IA usando o conteúdo atual do post.
            </p>

            <p style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-top:8px;">
                <span>
                    <label><strong>IA (SEO)</strong></label><br/>
                    <select id="maa-seo-provider">
                        <option value="gemini" selected>Gemini (Google)</option>
                        <option value="openai">OpenAI</option>
                    </select>
                </span>
                <span>
                    <label><strong>Modelo (SEO)</strong></label><br/>
                    <select id="maa-seo-model"></select>
                </span>

                <span>
                    <label><strong>Idioma (SEO)</strong></label><br/>
                    <input id="maa-seo-idioma" type="text" value="<?php echo esc_attr($maa_idioma); ?>" placeholder="ex.: pt-BR, en-US" />
                </span>
                <span>
                    <label><strong>País (SEO)</strong></label><br/>
                    <input id="maa-seo-pais" type="text" value="<?php echo esc_attr($maa_pais); ?>" placeholder="ex.: Brasil, Portugal, Estados Unidos" />
                </span>

                <button type="button" class="button" id="maa-gen-seo">Gerar SEO (slug/meta/tags/títulos)</button>
                <span id="maa-seo-status" style="margin-left:10px;"></span>
            </p>

            <div id="maa-seo-output" style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;">
                <p><label><strong>Slug (sugerido)</strong></label><br/>
                <input type="text" id="maa-seo-slug" value="<?php echo esc_attr($seo_slug); ?>" style="width:100%;" readonly /></p>

                <p><label><strong>Metadescrição (160 máx.)</strong></label><br/>
                <textarea id="maa-seo-meta" rows="3" style="width:100%;" readonly><?php echo esc_textarea($seo_meta); ?></textarea></p>

                <p><label><strong>Tags (separadas por vírgula)</strong></label><br/>
                <input type="text" id="maa-seo-tags" value="<?php echo esc_attr($seo_tags); ?>" style="width:100%;" readonly /></p>

                <p><label><strong>Títulos virais (1 por linha)</strong></label><br/>
                <textarea id="maa-seo-titles" rows="4" style="width:100%;" readonly><?php echo esc_textarea($seo_titles); ?></textarea></p>
            </div>

            <p class="description">Os campos acima ficam salvos no post (metadados) e podem ser copiados.</p>
        </div>
        <?php
    }

    public static function enqueue_assets( $hook ) {
        if ( ! in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) { return; }

        // Script "vazio" + inline (funciona no Gutenberg e no Clássico)
        wp_register_script( 'maa-editor', '', array(), self::VERSION, true );
        wp_enqueue_script( 'maa-editor' );

        wp_localize_script( 'maa-editor', 'MAA_CFG', array(
            'restGen'        => esc_url_raw( rest_url( self::REST_NS . '/generate' ) ),
            'restSEO'        => esc_url_raw( rest_url( self::REST_NS . '/seo' ) ),
            'nonce'          => wp_create_nonce( 'wp_rest' ),
            'defaultPrompt'  => self::load_main_prompt(),
            'promptPresets'  => self::get_prompt_presets_for_js(),
            'proActive'      => self::is_pro_license_active(),
            'proUrl'         => esc_url_raw( apply_filters('maa_pro_upgrade_url', self::PRO_URL) ),
        ) );

        $inline = <<<JS
(function(w){
  function el(id){ return document.getElementById(id); }
  function setStatus(id,msg){ var s = el(id); if(s){ s.textContent = msg||''; } }
  function notice(type,msg){
    try{
      if(w.wp && wp.data){ wp.data.dispatch('core/notices').createNotice(type, msg, { isDismissible: true }); return; }
    }catch(e){}
    // Fallback para Clássico
    if(type==='error'){ alert(msg); } else { console.log(type.toUpperCase()+': '+msg); }
  }
  function isGB(){
    try{ return !!(w.wp && wp.data && wp.data.select && wp.data.select('core/editor')); }catch(e){ return false; }
  }

  // === REST POST robusto: força esquema, usa nonce fallback e mostra erro real ===
  async function restPost(url, dataObj){
    try{
      var u = new URL(url, w.location.origin);
      // força o mesmo esquema da página para evitar bloqueio http/https
      u.protocol = w.location.protocol;
      url = u.toString();
    }catch(e){}

    var nonce = (w.MAA_CFG && MAA_CFG.nonce) || (w.wpApiSettings && wpApiSettings.nonce) || '';
    var res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': nonce
      },
      body: JSON.stringify(dataObj || {})
    });

    var text = '';
    try{ text = await res.text(); }catch(e){}

    if(!res.ok){
      // tenta extrair JSON de erro do WP
      var msg = 'HTTP '+res.status;
      try{
        var j = JSON.parse(text);
        if(j && j.message){ msg += ' — ' + j.message + (j.code ? ' ['+j.code+']' : ''); }
      }catch(e){
        if(text){ msg += ' — ' + text.substring(0,200); }
      }
      throw new Error(msg);
    }

    try{ return JSON.parse(text); }
    catch(e){ throw new Error('JSON inválido da API: ' + text.substring(0,200)); }
  }

  // ====== BLOCO UI (mesmo que você já tinha) ======
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

  function populateModels(selectEl, provider){
    if(!selectEl) return;
    const list = MODELS_BY_PROVIDER[provider] || MODELS_BY_PROVIDER.gemini;
    selectEl.innerHTML = '';
    list.forEach(function(m){
      var opt = document.createElement('option');
      opt.value = m.v; opt.textContent = m.label;
      selectEl.appendChild(opt);
    });
    if(provider==='gemini'){ selectEl.value = 'gemini-2.5-flash-lite'; }
  }

  function getPromptBodyById(id){
    var base = (w.MAA_CFG && typeof MAA_CFG.defaultPrompt === 'string') ? MAA_CFG.defaultPrompt : '';
    if(!id || id === 'default' || id === 'main'){ return base; }
    var list = (w.MAA_CFG && Array.isArray(MAA_CFG.promptPresets)) ? MAA_CFG.promptPresets : [];
    for(var i=0;i<list.length;i++){
      if(list[i].id === id){ return (list[i].body || base || ''); }
    }
    return base;
  }

  function addFonteItem() {
    var wrap = document.getElementById('maa-fontes-wrap');
    if(!wrap) return;
    var items = wrap.querySelectorAll('.maa-fonte-item').length;
    if(items >= 3) return;
    var idx = items + 1;
    var p = document.createElement('p');
    p.className = 'maa-fonte-item';
    p.innerHTML =
      '<label><strong>Fonte – Conteúdo '+idx+'</strong></label><br/>' +
      '<textarea class="maa-fonte" rows="5" style="width:100%;"></textarea>';
    wrap.appendChild(p);
    if(idx >= 3){
      var btn = document.getElementById('maa-add-fonte');
      if(btn){ btn.setAttribute('disabled','disabled'); btn.textContent = 'Limite de fontes atingido'; }
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    var provContent = el('maa-provider');
    var modelContent = el('maa-model');
    if(provContent){ populateModels(modelContent, provContent.value || 'gemini'); provContent.addEventListener('change', function(){ populateModels(modelContent, provContent.value); }); }

    var provSEO = el('maa-seo-provider');
    var modelSEO = el('maa-seo-model');
    if(provSEO){ populateModels(modelSEO, provSEO.value || 'gemini'); provSEO.addEventListener('change', function(){ populateModels(modelSEO, provSEO.value); }); }

    var chkCustom = el('maa-use-custom-prompt');
    var taCustom  = el('maa-custom-prompt');
    var selectPreset = el('maa-prompt-preset');

    if(taCustom){
      var initialId = (selectPreset && selectPreset.value) ? selectPreset.value : 'default';
      taCustom.value = getPromptBodyById(initialId);
    }

    if(chkCustom && taCustom){
      chkCustom.addEventListener('change', function(){
        if(!MAA_CFG.proActive){ chkCustom.checked = false; return; }
        if(chkCustom.checked){
          var id = (selectPreset && selectPreset.value) ? selectPreset.value : 'default';
          taCustom.value = getPromptBodyById(id);
        }
        taCustom.style.display = chkCustom.checked ? 'block' : 'none';
      });
      if(!MAA_CFG.proActive){
        chkCustom.checked = false;
        taCustom.style.display = 'none';
        taCustom.setAttribute('disabled','disabled');
      }
    }

    if(selectPreset && chkCustom && taCustom){
      selectPreset.addEventListener('change', function(){
        if(chkCustom.checked){
          var id = selectPreset.value || 'default';
          taCustom.value = getPromptBodyById(id);
        }
      });
    }

    var btnAddFonte = document.getElementById('maa-add-fonte');
    if(btnAddFonte){
      btnAddFonte.addEventListener('click', function(e){
        e.preventDefault();
        addFonteItem();
      });
    }
  });

  // ====== Geração de conteúdo ======
  async function generateContent(){
    function val(id){ var x=el(id); return x ? x.value||'' : ''; }
    var pauta   = val('maa-pauta');
    var fontes = Array.from(document.querySelectorAll('#maa-fontes-wrap .maa-fonte')).map(function(t){ return (t.value || '').trim(); });
    var f1 = fontes[0] || ''; var f2 = fontes[1] || ''; var f3 = fontes[2] || '';
    var estilo  = val('maa-estilo') || 'conteudo_viral_padrao';
    var keyword = val('maa-keyword');
    var idioma  = val('maa-idioma') || 'pt-BR';
    var pais    = val('maa-pais')   || 'Brasil';
    var provider= val('maa-provider') || 'gemini';
    var model   = val('maa-model') || (provider==='gemini' ? 'gemini-2.5-flash-lite' : 'gpt-5-mini');
    var promptId = (function(){
      var s = el('maa-prompt-preset');
      return s && s.value ? s.value : '';
    })();

    // tenta pegar o ID do post (Gutenberg ou Clássico)
    var postId = 0;
    if(isGB()){
      try{ postId = wp.data.select('core/editor').getCurrentPostId() || 0; }catch(e){ postId = 0; }
    }else{
      var pid = el('post_ID'); if(pid){ postId = parseInt(pid.value,10) || 0; }
    }

    var useCustom   = !!(el('maa-use-custom-prompt') && el('maa-use-custom-prompt').checked);
    var customPrompt= (el('maa-custom-prompt')||{}).value || '';

    var btn = el('maa-generate');
    if(btn) btn.setAttribute('disabled','disabled');
    setStatus('maa-status','Gerando…');

    try{
      var data = {
        post_id: postId, pauta: pauta,
        fonte_conteudo1: f1, fonte_conteudo2: f2, fonte_conteudo3: f3,
        estilo: estilo, keyword: keyword, idioma: idioma, pais: pais,
        provider: provider, model: model
      };
      if(promptId){ data.prompt_id = promptId; }
      if(MAA_CFG.proActive && useCustom && (customPrompt||'').trim()!==''){ data.custom_prompt = customPrompt; }

      var res = await restPost(MAA_CFG.restGen, data);

      var title = res.title || '';
      var subtitle = res.subtitle || '';
      var html = res.content_html || res.raw || '';

      // Inserção no editor (Gutenberg OU Clássico)
      if(isGB()){
        try{
          wp.data.dispatch('core/editor').editPost({ title: title });
          wp.data.dispatch('core/editor').editPost({ content: html });
          try { wp.data.dispatch('core/editor').editPost({ meta: { maa_idioma: idioma, maa_pais: pais } }); } catch(e){}
        }catch(e){
          // fallback para Clássico
          var t = el('title'); if(t){ t.value = title; }
          
          if(w.tinyMCE && tinyMCE.get && tinyMCE.get('content') && !tinyMCE.get('content').isHidden()){
            tinyMCE.get('content').setContent(html||'');
          }else{
            var ta = el('content'); if(ta){ ta.value = html||''; }
          }
        }
      }else{
        var t = el('title'); if(t){ t.value = title; }
        
        if(w.tinyMCE && tinyMCE.get && tinyMCE.get('content') && !tinyMCE.get('content').isHidden()){
          tinyMCE.get('content').setContent(html||'');
        }else{
          var ta = el('content'); if(ta){ ta.value = html||''; }
        }
      }

      notice('success','Conteúdo gerado e inserido.');
      setStatus('maa-status','');
    }catch(err){
      notice('error', 'Erro ao gerar conteúdo: ' + err.message);
      setStatus('maa-status','Falhou');
    }finally{
      if(btn) btn.removeAttribute('disabled');
    }
  }

  // ====== SEO ======
  async function generateSEO(){
    function val(id){ var x=el(id); return x ? x.value||'' : ''; }
    var keyword = val('maa-keyword');
    var seoProvider = val('maa-seo-provider') || 'gemini';
    var seoModel    = val('maa-seo-model') || (seoProvider==='gemini' ? 'gemini-2.5-flash-lite' : 'gpt-5-nano');
    var seoIdioma   = val('maa-seo-idioma') || '';
    var seoPais     = val('maa-seo-pais')   || '';

    var title='', content='', postId=0;
    if(isGB()){
      try{
        title   = wp.data.select('core/editor').getEditedPostAttribute('title') || '';
        content = wp.data.select('core/editor').getEditedPostAttribute('content') || '';
        postId  = wp.data.select('core/editor').getCurrentPostId() || 0;
      }catch(e){}
    }
    if(!title){ var t = el('title'); if(t){ title = t.value||''; } }
    if(!content){
      if(w.tinyMCE && tinyMCE.get && tinyMCE.get('content') && !tinyMCE.get('content').isHidden()){
        content = tinyMCE.get('content').getContent() || '';
      }else{
        var ta = el('content'); if(ta){ content = ta.value||''; }
      }
    }
    if(!postId){ var pid = el('post_ID'); if(pid){ postId = parseInt(pid.value,10)||0; } }

    if(!title || !content){
      notice('warning','Salve título e conteúdo antes de gerar o SEO.');
      return;
    }

    var btn = el('maa-gen-seo');
    if(btn) btn.setAttribute('disabled','disabled');
    setStatus('maa-seo-status','Gerando SEO…');

    try{
      var payload = { post_id: postId, title: title, content: content, keyword: keyword, provider: seoProvider, model: seoModel };
      if(seoIdioma) payload.idioma = seoIdioma;
      if(seoPais)   payload.pais   = seoPais;

      var res = await restPost(MAA_CFG.restSEO, payload);

      el('maa-seo-slug').value   = res.slug || '';
      el('maa-seo-meta').value   = res.meta_description || '';
      el('maa-seo-tags').value   = (res.tags||[]).join(', ');
      el('maa-seo-titles').value = (res.title_options||[]).join('\\n');

      notice('success','SEO gerado e salvo nos metadados.');
      setStatus('maa-seo-status','');
    }catch(err){
      notice('error','Erro ao gerar SEO: ' + err.message);
      setStatus('maa-seo-status','Falhou');
    }finally{
      if(btn) btn.removeAttribute('disabled');
    }
  }

  // Eventos
  document.addEventListener('click', function(e){
    if(e && e.target && e.target.id === 'maa-generate'){
      e.preventDefault(); generateContent();
    }
    if(e && e.target && e.target.id === 'maa-gen-seo'){
      e.preventDefault(); generateSEO();
    }
  });
})(window);
JS;
        wp_add_inline_script( 'maa-editor', $inline, 'after' );
    }

    /* ------------------------- REST ------------------------- */
    public static function register_rest_routes() {
        register_rest_route( self::REST_NS, '/generate', array(
            'methods'  => 'POST',
            'callback' => array( __CLASS__, 'rest_generate' ),
            'permission_callback' => function() { return current_user_can( 'edit_posts' ); },
            'args' => array(
                'post_id'         => array( 'type'=>'integer','required'=>false ),
                'pauta'           => array( 'type' => 'string', 'required' => false ),
                'fonte_conteudo1' => array( 'type' => 'string', 'required' => false ),
                'fonte_conteudo2' => array( 'type' => 'string', 'required' => false ),
                'fonte_conteudo3' => array( 'type' => 'string', 'required' => false ),
                'estilo'          => array( 'type' => 'string', 'required' => true ),
                'keyword'         => array( 'type' => 'string', 'required' => false ),
                'idioma'          => array( 'type' => 'string', 'required' => false ),
                'pais'            => array( 'type' => 'string', 'required' => false ),
                'provider'        => array( 'type' => 'string', 'required' => false ),
                'model'           => array( 'type' => 'string', 'required' => true ),
                'custom_prompt'   => array( 'type' => 'string', 'required' => false ),
                'prompt_id'       => array( 'type' => 'string', 'required' => false ),
            ),
        ) );

        register_rest_route( self::REST_NS, '/seo', array(
            'methods'  => 'POST',
            'callback' => array( __CLASS__, 'rest_seo' ),
            'permission_callback' => function() { return current_user_can( 'edit_posts' ); },
            'args' => array(
                'post_id' => array( 'type' => 'integer', 'required' => true ),
                'title'   => array( 'type' => 'string',  'required' => true ),
                'content' => array( 'type' => 'string',  'required' => true ),
                'keyword' => array( 'type' => 'string',  'required' => false ),
                'provider'=> array( 'type' => 'string',  'required' => false ),
                'model'   => array( 'type' => 'string',  'required' => false ),
                'idioma'  => array( 'type' => 'string',  'required' => false ),
                'pais'    => array( 'type' => 'string',  'required' => false ),
            ),
        ) );
    }

    // Geração de conteúdo — Gemini ou OpenAI
    public static function rest_generate( WP_REST_Request $req ) {
        $post_id = intval( $req->get_param('post_id') ?? 0 );

        $pauta   = sanitize_textarea_field( $req->get_param('pauta') ?? '' );
        $f1      = wp_kses_post( $req->get_param('fonte_conteudo1') ?? '' );
        $f2      = wp_kses_post( $req->get_param('fonte_conteudo2') ?? '' );
        $f3      = wp_kses_post( $req->get_param('fonte_conteudo3') ?? '' );
        $estilo  = sanitize_text_field( $req->get_param('estilo') ?? 'conteudo_viral_padrao' );
        $keyword = sanitize_text_field( $req->get_param('keyword') ?? '' );
        $idioma  = sanitize_text_field( $req->get_param('idioma') ?? 'pt-BR' );
        $pais    = sanitize_text_field( $req->get_param('pais') ?? 'Brasil' );
        $provider= sanitize_text_field( $req->get_param('provider') ?? '' );
        $model   = sanitize_text_field( $req->get_param('model') ?? '' );
        $custom  = $req->get_param('custom_prompt');
        $custom  = is_string($custom) ? trim( (string) wp_kses_post( $custom ) ) : '';
        $prompt_id = sanitize_key( $req->get_param('prompt_id') ?? '' );

        if ( $model === '' ) {
            $model = ( $provider === 'gemini' ) ? 'gemini-2.5-flash-lite' : 'gpt-5-mini';
        }

        // Bloqueio de prompt personalizado para quem não tem PRO
        if ( $custom !== '' && ! self::is_pro_license_active() ) {
            $upgrade = apply_filters('maa_pro_upgrade_url', self::PRO_URL);
            return new WP_Error(
                'pro_only',
                'Prompt personalizado é um recurso PRO. Ative sua licença PRO para utilizar este recurso: ' . esc_url( $upgrade ),
                array( 'status' => 403 )
            );
        }

        // Persiste idioma/país no post (se houver)
        if ( $post_id && current_user_can( 'edit_post', $post_id ) ) {
            update_post_meta( $post_id, 'maa_idioma', $idioma );
            update_post_meta( $post_id, 'maa_pais',   $pais );
        }

        $s = self::get_settings();

        // template: custom se fornecido; senão, preset; senão, o global
        if ( $custom !== '' ) {
            $prompt_tpl = $custom;
        } elseif ( $prompt_id !== '' ) {
            $prompt_tpl = self::load_prompt_by_id( $prompt_id );
        } else {
            $prompt_tpl = self::load_main_prompt();
        }

        $map = array(
            '{{pauta}}'              => $pauta,
            '{{fonte_conteudo1}}'    => $f1,
            '{{fonte_conteudo2}}'    => $f2,
            '{{fonte_conteudo3}}'    => $f3,
            '{{estilo}}'             => $estilo,
            '{{palavra_chave_alvo}}' => $keyword,
            '{{palavra-chave-alvo}}' => $keyword,
            '{{idioma}}'             => $idioma,
            '{{pais}}'               => $pais,
        );
        $user_prompt = strtr( $prompt_tpl, $map );

        if ( $provider === 'gemini' || stripos($model, 'gemini') === 0 ) {
            if ( ! class_exists('MAA_Gemini_Module') ) {
                return new WP_Error('gemini_module_missing', 'Módulo Gemini não encontrado (module-gemini.php).', array('status'=>500));
            }
            // Módulo Gemini pega a chave internamente. Mantivemos compat (google_key_enc como "plain:")
            $resp = MAA_Gemini_Module::call(
                $model,
                $s['system_prompt'],
                $user_prompt,
                array('temperature'=>0.7,'topP'=>0.95,'topK'=>40)
            );
            if ( is_wp_error($resp) ) return $resp;
            $text = $resp;
        } else {
            $api_key = self::get_openai_key();
            if ( ! $api_key ) {
                return new WP_Error( 'no_api_key', 'Configure sua OpenAI API Key em MAA → Configurações ou selecione Gemini.', array( 'status' => 400 ) );
            }

            $payload = array(
                'model'    => $model,
                'messages' => array(
                    array( 'role' => 'system', 'content' => $s['system_prompt'] ),
                    array( 'role' => 'user',   'content' => $user_prompt ),
                ),
            );

            $response = wp_remote_post( 'https://api.openai.com/v1/chat/completions', array(
                'headers' => array(
                    'Authorization' => 'Bearer ' . $api_key,
                    'Content-Type'  => 'application/json',
                ),
                'timeout' => 60,
                'body'    => wp_json_encode( $payload ),
            ) );

            if ( is_wp_error( $response ) ) {
                return new WP_Error( 'openai_request_failed', $response->get_error_message(), array( 'status' => 500 ) );
            }

            $code = wp_remote_retrieve_response_code( $response );
            $body = wp_remote_retrieve_body( $response );
            if ( $code < 200 || $code >= 300 ) {
                return new WP_Error( 'openai_http_error', 'Erro da API OpenAI: ' . $body, array( 'status' => $code ) );
            }

            $data = json_decode( $body, true );
            $text = $data['choices'][0]['message']['content'] ?? '';
            if ( ! $text ) {
                return new WP_Error( 'openai_empty', 'Resposta vazia da OpenAI.', array( 'status' => 500 ) );
            }
        }

        $parsed = self::parse_ai_output( $text );
        return new WP_REST_Response( $parsed, 200 );
    }

    // Geração de SEO
    public static function rest_seo( WP_REST_Request $req ) {
        $post_id = intval( $req->get_param('post_id') );
        $title   = sanitize_text_field( $req->get_param('title') ?? '' );
        $content = wp_kses_post( $req->get_param('content') ?? '' );
        $keyword = sanitize_text_field( $req->get_param('keyword') ?? '' );
        $provider= sanitize_text_field( $req->get_param('provider') ?? '' );
        $model   = sanitize_text_field( $req->get_param('model') ?? '' );
        $idioma_req = sanitize_text_field( $req->get_param('idioma') ?? '' );
        $pais_req   = sanitize_text_field( $req->get_param('pais') ?? '' );

        if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
            return new WP_Error( 'perm', 'Sem permissão para editar este post.', array( 'status' => 403 ) );
        }
        if ( $title === '' || trim( wp_strip_all_tags( $content ) ) === '' ) {
            return new WP_Error( 'missing', 'Salve um título e conteúdo antes de gerar o SEO.', array( 'status' => 400 ) );
        }

        if ( $model === '' ) {
            $model = ( $provider === 'openai' ) ? 'gpt-5-nano' : 'gemini-2.5-flash-lite';
        }

        $idioma = $idioma_req !== '' ? $idioma_req : ( get_post_meta( $post_id, 'maa_idioma', true ) ?: 'pt-BR' );
        $pais   = $pais_req   !== '' ? $pais_req   : ( get_post_meta( $post_id, 'maa_pais', true )   ?: 'Brasil' );

        $seo_prompt = <<<PROMPT
Você é um assistente de SEO que deve otimizar para o contexto:
- Idioma do conteúdo: {$idioma}
- País de publicação/descoberta: {$pais}

Otimize SEO para o post abaixo. Gere EXCLUSIVAMENTE JSON com:
- slug (kebab-case, curto, com a palavra-chave, sem stopwords; respeite o idioma {$idioma})
- meta_description (até 160 caracteres, clara e atrativa no idioma {$idioma})
- tags (lista com 5 a 8 termos curtos e relevantes no idioma {$idioma})
- title_options (lista com 5 títulos virais, 120–160 caracteres, no idioma {$idioma})

Incorpore e otimize para a palavra-chave: "{$keyword}"

Diretrizes adicionais:
- Considera nuances de {$pais} (vocabulário, entidades locais, moeda/abreviações).
- Não extrapole além do conteúdo; apenas otimize texto e estrutura.

POST
TÍTULO: {$title}
CONTEÚDO (HTML permitido): {$content}

RETORNO (JSON):
{
  "slug": "...",
  "meta_description": "...",
  "tags": ["...", "..."],
  "title_options": ["...", "..."]
}
PROMPT;

        $s = self::get_settings();

        if ( $provider === 'gemini' || stripos($model, 'gemini') === 0 ) {
            if ( ! class_exists('MAA_Gemini_Module') ) {
                return new WP_Error('gemini_module_missing', 'Módulo Gemini não encontrado (module-gemini.php).', array('status'=>500));
            }
            $system = 'Você é um assistente de SEO que SEMPRE retorna JSON válido e nada além do JSON.';
            $resp = MAA_Gemini_Module::call(
                $model,
                $system,
                $seo_prompt,
                array('temperature'=>0.6,'topP'=>0.9,'topK'=>40)
            );
            if ( is_wp_error($resp) ) return $resp;
            $text = $resp;

        } else {
            $api_key = self::get_openai_key();
            if ( ! $api_key ) {
                return new WP_Error( 'no_api_key', 'Configure sua OpenAI API Key em MAA → Configurações ou selecione Gemini.', array( 'status' => 400 ) );
            }

            $payload = array(
                'model'    => $model ?: 'gpt-5-nano',
                'messages' => array(
                    array( 'role' => 'system', 'content' => 'Você é um assistente de SEO que SEMPRE retorna JSON válido, sem texto extra.' ),
                    array( 'role' => 'user',   'content' => $seo_prompt ),
                ),
            );

            $response = wp_remote_post( 'https://api.openai.com/v1/chat/completions', array(
                'headers' => array(
                    'Authorization' => 'Bearer ' . $api_key,
                    'Content-Type'  => 'application/json',
                ),
                'timeout' => 60,
                'body'    => wp_json_encode( $payload ),
            ) );

            if ( is_wp_error( $response ) ) {
                return new WP_Error( 'openai_request_failed', $response->get_error_message(), array( 'status' => 500 ) );
            }

            $code = wp_remote_retrieve_response_code( $response );
            $body = wp_remote_retrieve_body( $response );
            if ( $code < 200 || $code >= 300 ) {
                return new WP_Error( 'openai_http_error', 'Erro da API OpenAI: ' . $body, array( 'status' => $code ) );
            }

            $raw = json_decode( $body, true );
            $text = $raw['choices'][0]['message']['content'] ?? '';
            if ( ! $text ) {
                return new WP_Error( 'openai_empty', 'Resposta vazia da OpenAI.', array( 'status' => 500 ) );
            }
        }

        $clean = trim( preg_replace('/^```(json)?/i','', $text) );
        $clean = preg_replace('/```$/','', $clean);
        $json  = json_decode( $clean, true );
        if ( ! is_array($json) ) {
            $start = strpos($clean,'{'); $end = strrpos($clean,'}');
            if ($start!==false && $end!==false && $end>$start) {
                $json = json_decode(substr($clean,$start,$end-$start+1), true);
            }
        }
        if ( ! is_array($json) ) {
            return new WP_Error( 'bad_json', 'Não foi possível ler o JSON de SEO.', array( 'status' => 500 ) );
        }

        $slug   = sanitize_title( $json['slug'] ?? '' );
        $meta   = wp_strip_all_tags( $json['meta_description'] ?? '' );
        $tags   = array();
        if ( ! empty($json['tags']) && is_array($json['tags']) ) {
            foreach ($json['tags'] as $t) { $tags[] = sanitize_text_field($t); }
        }
        $titles = array();
        if ( ! empty($json['title_options']) && is_array($json['title_options']) ) {
            foreach ($json['title_options'] as $t) { $titles[] = wp_strip_all_tags($t); }
        }

        update_post_meta( $post_id, 'maa_seo_slug',   $slug );
        update_post_meta( $post_id, 'maa_seo_meta',   $meta );
        update_post_meta( $post_id, 'maa_seo_tags',   $tags );
        update_post_meta( $post_id, 'maa_seo_titles', $titles );

        return new WP_REST_Response( array(
            'slug'            => $slug,
            'meta_description'=> $meta,
            'tags'            => $tags,
            'title_options'   => $titles,
        ), 200 );
    }
    /**
     * Retorna a chave mascarada: mostra só os primeiros $visible caracteres
     * e oculta o restante.
     */
    protected static function mask_api_key( string $key, int $visible = 6 ) : string {
        $key = trim( $key );
        if ( $key === '' ) {
            return '';
        }

        // pega os primeiros caracteres
        $prefix = mb_substr( $key, 0, $visible, 'UTF-8' );

        // o resto vira bolinhas (tamanho fixo, só pra indicar que tem mais coisa)
        return $prefix . '••••••••••';
    }

    /* ------------------------- Utils ------------------------- */
    protected static function parse_ai_output( $text ) {
        $clean = trim( $text );
        $clean = preg_replace( '/^```(json)?/i', '', $clean );
        $clean = preg_replace( '/```$/', '', $clean );

        $out = array( 'title'=>'', 'subtitle'=>'', 'content_html'=>'', 'raw'=>$text );

        $json = json_decode( $clean, true );
        if ( json_last_error() !== JSON_ERROR_NONE ) {
            $start = strpos( $clean, '{' );
            $end   = strrpos( $clean, '}' );
            if ( $start !== false && $end !== false && $end > $start ) {
                $maybe = substr( $clean, $start, $end - $start + 1 );
                $json  = json_decode( $maybe, true );
            }
        }

        if ( is_array( $json ) && json_last_error() === JSON_ERROR_NONE ) {
            $out['title']    = isset( $json['title'] ) ? wp_strip_all_tags( $json['title'] ) : '';
            $out['subtitle'] = isset( $json['subtitle'] ) ? wp_strip_all_tags( $json['subtitle'] ) : '';

            $content = isset( $json['content_html'] ) ? (string) $json['content_html'] : '';

            // Limpa "pt-BR", "en-US" etc do começo
            $content = self::clean_leading_language_tag( $content );

            $out['content_html'] = wp_kses_post( $content );
        } else {
            // Fallback textual: ainda assim limpamos possível tag de idioma no início
            $text_clean = self::clean_leading_language_tag( (string) $text );
            $out['content_html'] = '<p>' . esc_html( $text_clean ) . '</p>';
        }

        return $out;
    }

    protected static function crypto_key() {
        $salt = defined('AUTH_SALT') ? AUTH_SALT : ( defined('LOGGED_IN_SALT') ? LOGGED_IN_SALT : 'maa_fallback_salt' );
        return hash( 'sha256', $salt . ABSPATH );
    }

    /**
     * Remove tags de idioma (pt-BR, en-US, es-ES etc.) no INÍCIO do content_html.
     * Cobre casos como:
     * - "pt-BR<h2>..."
     * - "pt-BR\n<h2>..."
     * - "<p>pt-BR</p><h2>..."
     */
    protected static function clean_leading_language_tag( $html ) {
        if ( ! is_string( $html ) || $html === '' ) {
            return $html;
        }

        // Tira espaços iniciais
        $html = ltrim( $html );

        // Caso 1: <p>pt-BR</p> logo no começo
        $html = preg_replace(
            '/^<p>\s*([a-z]{2}-[A-Z]{2})\s*[:\\-–—]?\s*<\/p>\s*/u',
            '',
            $html,
            1
        );

        // Tira espaços de novo
        $html = ltrim( $html );

        // Caso 2: "pt-BR" solto no início, antes de qualquer tag
        $html = preg_replace(
            '/^([a-z]{2}-[A-Z]{2})\s*[:\\-–—]?\s*/u',
            '',
            $html,
            1
        );

        // Espaços finais do corte
        return ltrim( $html );
    }

    // Mantidos por compatibilidade com dados antigos:
    public static function encrypt_for_storage( $plain ) {
        if ( $plain === '' ) return '';
        if ( function_exists( 'openssl_encrypt' ) ) {
            $key = self::crypto_key();
            $iv  = function_exists('random_bytes') ? random_bytes(16) : openssl_random_pseudo_bytes(16);
            $cipher = openssl_encrypt( $plain, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv );
            if ( $cipher === false ) { return 'plain:' . base64_encode( $plain ); }
            return 'v1:' . base64_encode($iv) . ':' . base64_encode($cipher);
        }
        return 'plain:' . base64_encode( $plain );
    }

    public static function decrypt_from_storage( $stored ) {
        if ( empty( $stored ) ) return '';
        if ( strpos( $stored, 'v1:' ) === 0 && function_exists('openssl_decrypt') ) {
            $parts = explode( ':', $stored );
            if ( count( $parts ) !== 3 ) return '';
            list( $v, $iv_b64, $ct_b64 ) = $parts;
            $iv = base64_decode( $iv_b64 );
            $ct = base64_decode( $ct_b64 );
            $key = self::crypto_key();
            $plain = openssl_decrypt( $ct, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv );
            return $plain !== false ? $plain : '';
        }
        if ( strpos( $stored, 'plain:' ) === 0 ) {
            return base64_decode( substr( $stored, 6 ) );
        }
        return '';
    }
}

MAA_AutoArticles::init();

/* --------- módulos opcionais --------- */
require_once plugin_dir_path(__FILE__) . 'module-gemini.php';

/* DEMO YouTube (visual) */
if ( file_exists( plugin_dir_path(__FILE__) . 'maa-youtube-demo.php' ) ) {
    ob_start();
    require_once plugin_dir_path(__FILE__) . 'maa-youtube-demo.php';
    ob_end_clean();
}

/* Gerador em massa */
ob_start();
require_once plugin_dir_path(__FILE__) . 'maa-mass.php';
ob_end_clean();

endif; // class_exists