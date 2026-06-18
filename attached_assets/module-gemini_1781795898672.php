<?php
/**
 * MAA — Módulo Gemini (Google AI Studio)
 * Permite chamadas ao endpoint generateContent usando modelos Gemini
 * MODELOS ATIVOS: gemini-2.5-flash-lite (padrão) e gemini-2.5-flash
 */
if (!defined('ABSPATH')) exit;

if (!class_exists('MAA_Gemini_Module')) :

final class MAA_Gemini_Module {
    /** Modelo padrão */
    const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

    /**
     * Modelos suportados (lite + flash).
     * Mantido filtro para extensibilidade futura.
     */
    public static function models() : array {
        $models = array(
            'gemini-2.5-flash-lite' => 'gemini-2.5-flash-lite (FREE • padrão)',
            'gemini-2.5-flash'      => 'gemini-2.5-flash',
        );
        /**
         * Filtro: maa_gemini_models
         * Ex.: add_filter('maa_gemini_models', function($m){ $m['outro-modelo']='label'; return $m; });
         */
        return apply_filters('maa_gemini_models', $models);
    }

    /** Verifica se há chave Google AI Studio salva */
    public static function is_available() : bool {
        if (!class_exists('MAA_AutoArticles')) return false;
        $s = MAA_AutoArticles::get_settings();
        $key = MAA_AutoArticles::decrypt_from_storage($s['google_key_enc'] ?? '');
        return !empty($key);
    }

    /**
     * Chamada ao Gemini generateContent
     *
     * @param string $model           Ex.: gemini-2.5-flash-lite | gemini-2.5-flash
     * @param string $system_prompt   Instrução de sistema
     * @param string $user_prompt     Conteúdo do usuário (texto)
     * @param array  $opts            [
     *    'temperature'=> float, 'topP'=>float, 'topK'=>int, 'stopSequences'=>array,
     *    'thinkingBudget'=>int (0 desativa "pensamento" nos modelos 2.5),
     * ]
     * @return string|WP_Error        Texto bruto retornado pelo modelo ou erro
     */
// module-gemini.php — dentro da classe MAA_Gemini_Module

public static function call( string $model, string $system_prompt, string $user_prompt, array $opts = array() ) {
    if (!class_exists('MAA_AutoArticles')) {
        return new WP_Error('gemini_dep', 'Classe base MAA_AutoArticles não encontrada.', array('status'=>500));
    }

    $s   = MAA_AutoArticles::get_settings();
    $key = MAA_AutoArticles::decrypt_from_storage($s['google_key_enc'] ?? '');
    if (!$key) {
        return new WP_Error('no_google_key', 'Configure sua Google AI Studio API Key em MAA → Configurações.', array('status'=>400));
    }

    $model = trim($model) !== '' ? $model : self::DEFAULT_MODEL;

    // ---- Generation config ----
    $genCfg = array();
    if (isset($opts['temperature']))   $genCfg['temperature']   = (float)$opts['temperature'];
    if (isset($opts['topP']))          $genCfg['topP']          = (float)$opts['topP'];
    if (isset($opts['topK']))          $genCfg['topK']          = (int)$opts['topK'];
    if (isset($opts['stopSequences']) && is_array($opts['stopSequences'])) {
        $genCfg['stopSequences'] = array_values(array_filter(array_map('strval', $opts['stopSequences'])));
    }

    // >>> ThinkingConfig (correção):
    // - NÃO enviar 0 (causa erro em 2.5-pro).
    // - Para gemini-2.5-pro, usar um budget pequeno e estável por padrão (1024).
    if (isset($opts['thinkingBudget'])) {
        $budget = max(1, (int)$opts['thinkingBudget']);
        $genCfg['thinkingConfig'] = array('thinkingBudget' => $budget);
    } else {
        if (stripos($model, '2.5-pro') !== false) {
            $genCfg['thinkingConfig'] = array('thinkingBudget' => 1024);
        }
        // para flash/flash-lite não enviamos thinkingConfig
    }

    $payload = array(
        'system_instruction' => array(
            'parts' => array( array('text' => (string)$system_prompt) )
        ),
        'contents' => array(
            array(
                'role'  => 'user',
                'parts' => array( array('text' => (string)$user_prompt) )
            )
        ),
    );
    if (!empty($genCfg)) $payload['generationConfig'] = $genCfg;

    $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent';

    $response = wp_remote_post($endpoint, array(
        'headers' => array(
            'Content-Type'   => 'application/json',
            'x-goog-api-key' => $key,
        ),
        'timeout' => 300, // 5 minutos
        'body'    => wp_json_encode($payload),
    ));

    if (is_wp_error($response)) return $response;

    $code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);

    if ($code < 200 || $code >= 300) {
        return new WP_Error('gemini_http_error', 'Erro da API Gemini: ' . $body, array('status'=>$code));
    }

    $raw = json_decode($body, true);
    if (isset($raw['error'])) {
        $msg = $raw['error']['message'] ?? 'Erro desconhecido do Gemini';
        return new WP_Error('gemini_error', $msg, array('status'=>500));
    }

    $text = '';
    if (!empty($raw['candidates'][0]['content']['parts'])) {
        $parts = $raw['candidates'][0]['content']['parts'];
        $buf   = array();
        foreach ($parts as $p) { if (isset($p['text'])) $buf[] = $p['text']; }
        $text = trim(implode("\n", $buf));
    }

    if (!$text) return new WP_Error('gemini_empty', 'Resposta vazia do Gemini.', array('status'=>500));
    return $text;
}

}

endif;
