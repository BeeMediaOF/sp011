<?php
/**
 * MAA - YouTube Demo (somente visual, sem funcionalidade)
 * Arquivo para o plugin BASE.
 *
 * Este demo:
 *  - Enfileira o CSS apenas na aba "Geração via vídeo".
 *  - NÃO aparece quando o PRO estiver ativo (auto-detecção).
 *  - Também se anexa ao hook opcional `maa_render_video_tab` se existir.
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('MAA_Youtube_Demo')):

final class MAA_Youtube_Demo {

    const VERSION = '1.1.0';

    /** Bootstrap */
    public static function init() {
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_styles']);

        // Se seu router usar um hook para desenhar a aba, anexamos também.
        add_action('maa_render_video_tab', [__CLASS__, 'render']);
    }

    /** Detecta se o PRO está ativo (várias estratégias) */
    protected static function is_pro_active() : bool {
        // 1) PRO define constante e classe de licenciamento
        if ( defined('MAA_PRO_ACTIVE') && class_exists('MAA_Pro_Licensing') ) {
            if ( is_callable(['MAA_Pro_Licensing','is_active']) && \MAA_Pro_Licensing::is_active() ) {
                return true;
            }
        }
        // 2) Base pode expor um helper
        if ( class_exists('MAA_AutoArticles') && is_callable(['MAA_AutoArticles','is_pro_active']) ) {
            try { return (bool) \MAA_AutoArticles::is_pro_active(); } catch(\Throwable $e) {}
        }
        return false;
    }

    /** Checa se estamos na aba correta do admin */
    protected static function is_video_tab() : bool {
        if ( ! is_admin() ) return false;
        // Típico slug do menu principal do MAA: 'maa-main'
        $page = isset($_GET['page']) ? sanitize_text_field($_GET['page']) : '';
        if ( $page !== 'maa-main' ) return false;

        // Sub-aba via query ?sub=video (ajuste se seu router for diferente)
        $sub  = isset($_GET['sub']) ? sanitize_text_field($_GET['sub']) : '';
        if ( $sub && $sub !== 'video' ) return false;

        return true;
    }

    /** Decide se devemos renderizar o DEMO */
    protected static function should_render() : bool {
        if ( self::is_pro_active() ) return false;  // PRO ativo? Esconde o demo.
        return self::is_video_tab();
    }

    /** Enfileira CSS somente quando for necessário */
    public static function enqueue_styles($hook) {
        if ( ! self::should_render() ) return;

        wp_enqueue_style(
            'maa-youtube-demo',
            plugin_dir_url(__FILE__) . 'maa-youtube.demo.css',
            [],
            self::VERSION
        );
    }

    /**
     * Renderização do conteúdo visual bloqueado para PRO.
     * Nenhum campo envia dados; tudo está desabilitado.
     */
    public static function render() {
        // Se não for a aba (ou se PRO ativo), não mostra nada.
        if ( ! self::should_render() ) return;

        // URL de upsell (pode ser filtrada pelo tema/bridge)
        $upgrade_url = '';
        if ( defined('MAA_PRO_UPSELL') ) {
            $upgrade_url = MAA_PRO_UPSELL;
        } elseif ( class_exists('MAA_AutoArticles') && defined('MAA_AutoArticles::PRO_URL') ) {
            $upgrade_url = \MAA_AutoArticles::PRO_URL;
        }
        $upgrade_url = apply_filters('maa_pro_upgrade_url', $upgrade_url ?: '#');
        ?>
        <div id="maa-ytdemo-wrap" class="maa-ytdemo" aria-disabled="true">
            <div class="maa-ytdemo__badge" aria-hidden="true">PRO</div>

            <header class="maa-ytdemo__header">
                <h2 class="maa-ytdemo__title">Geração via Vídeo (YouTube)</h2>
                <p class="maa-ytdemo__subtitle">
                    Extraia legendas automaticamente e gere artigos otimizados a partir de vídeos do YouTube.
                    <strong>Recurso disponível somente para assinantes PRO.</strong>
                </p>
            </header>

            <section class="maa-ytdemo__content">
                <div class="maa-ytdemo__grid">
                    <div class="maa-ytdemo__card">
                        <h3 class="maa-ytdemo__card-title">Entrada</h3>

                        <div class="maa-ytdemo__field">
                            <label class="maa-ytdemo__label">URL do YouTube</label>
                            <input type="url" class="maa-ytdemo__input" placeholder="https://www.youtube.com/watch?v=..." disabled />
                            <p class="maa-ytdemo__hint">Cole a URL do vídeo para iniciar a análise.</p>
                        </div>

                        <div class="maa-ytdemo__row">
                            <div class="maa-ytdemo__field">
                                <label class="maa-ytdemo__label">Idioma preferido</label>
                                <select class="maa-ytdemo__select" disabled>
                                    <option>pt-BR</option>
                                    <option>pt</option>
                                    <option>en</option>
                                    <option>es</option>
                                </select>
                            </div>

                            <div class="maa-ytdemo__field">
                                <label class="maa-ytdemo__label">Modo de captura</label>
                                <select class="maa-ytdemo__select" disabled>
                                    <option>Preferir legendas (quando houver)</option>
                                    <option>Forçar transcrição por IA (Whisper)</option>
                                </select>
                            </div>
                        </div>

                        <div class="maa-ytdemo__options">
                            <label class="maa-ytdemo__check">
                                <input type="checkbox" disabled checked />
                                <span>Gerar TXT limpo</span>
                            </label>
                            <label class="maa-ytdemo__check">
                                <input type="checkbox" disabled />
                                <span>Gerar SRT com timestamps</span>
                            </label>
                            <label class="maa-ytdemo__check">
                                <input type="checkbox" disabled />
                                <span>Criar artigo automaticamente (rascunho)</span>
                            </label>
                        </div>

                        <div class="maa-ytdemo__actions">
                            <button class="button button-primary" disabled>
                                Extrair e Gerar Artigo (PRO)
                            </button>
                            <button class="button" disabled>
                                Pré-visualizar Transcrição
                            </button>
                        </div>
                    </div>

                    <div class="maa-ytdemo__card">
                        <h3 class="maa-ytdemo__card-title">Como funciona</h3>
                        <ol class="maa-ytdemo__steps">
                            <li>Detecta e baixa as <strong>legendas</strong> do YouTube (quando disponíveis).</li>
                            <li>Se não houver legendas, usa <strong>IA (Whisper)</strong> para transcrever o áudio.</li>
                            <li>Gera saída em <strong>TXT</strong> e, opcionalmente, <strong>SRT</strong>.</li>
                            <li>Cria um <strong>rascunho de artigo</strong> com SEO básico.</li>
                        </ol>

                        <div class="maa-ytdemo__upsell">
                            <a class="button button-primary maa-ytdemo__cta" href="<?php echo esc_url($upgrade_url); ?>" target="_blank" rel="noopener">
                                Desbloquear agora – Tornar-se PRO
                            </a>
                            <p class="maa-ytdemo__upsell-note">
                                Assinantes PRO têm acesso à extração automática, transcrição por IA, criação de rascunhos e muito mais.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Faixas visuais "acesso restrito" -->
            <div class="maa-ytdemo__tape" role="note" aria-label="Acesso restrito">
                <span class="maa-ytdemo__tape-text">ACESSO RESTRITO — APENAS ASSINANTES PRO</span>
            </div>
            <div class="maa-ytdemo__tape maa-ytdemo__tape--alt" aria-hidden="true">
                <span class="maa-ytdemo__tape-text">ACESSO RESTRITO — APENAS ASSINANTES PRO</span>
            </div>

            <footer class="maa-ytdemo__footer">
                <p>
                    Recurso bloqueado. Para habilitar, ative uma <strong>licença PRO</strong>.
                </p>
            </footer>
        </div>
        <?php
    }
}

MAA_Youtube_Demo::init();

endif;
