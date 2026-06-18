#!/usr/bin/env php
<?php
/**
 * patch-maanews.php
 *
 * Atualiza o módulo MAA_News_Pro para corrigir a extração de conteúdo:
 * - Ajusta regex agressivas que removiam parágrafos com a palavra "mais".
 * - Melhora o filtro de blocos "lixo" sem false positives.
 * - Adiciona um fallback DOM que tenta capturar o corpo por seletores comuns
 *   quando a extração principal retornar pouco texto.
 *
 * Uso:
 *   php patch-maanews.php /caminho/para/wp-content/plugins/maa-news-pro/maa-news-pro.php
 */

if (php_sapi_name() !== 'cli') {
    fwrite(STDERR, "Este script deve ser executado via CLI.\n");
    exit(1);
}

$target = $argv[1] ?? null;
if (!$target || !is_file($target)) {
    fwrite(STDERR, "Uso: php patch-maanews.php /caminho/para/maa-news-pro.php\n");
    exit(1);
}

$orig = file_get_contents($target);
if ($orig === false) {
    fwrite(STDERR, "Falha ao ler: {$target}\n");
    exit(1);
}

$backup = $target.'.bak-'.date('Ymd-His');
if (!file_put_contents($backup, $orig)) {
    fwrite(STDERR, "Falha ao criar backup: {$backup}\n");
    exit(1);
}

$updated = $orig;
$changes = [];

/**
 * 1) Substitui TODO o corpo do método extract_clean_article_body(...) por uma versão mais segura
 *    (remove o termo genérico 'mais' das regexs destrutivas e melhora limpeza).
 */
$pattern_clean = '~protected\s+static\s+function\s+extract_clean_article_body\(\s*\$html\s*,\s*\$page_title\s*=\s*\'\'\s*\)\s*\{.*?\}~is';

$replacement_clean = <<<'PHP'
protected static function extract_clean_article_body($html, $page_title='') {
    // 1. Remove tags indesejadas inteiras
    $html = preg_replace('#<(script|style|noscript|iframe|form|button|input|svg|video|audio|aside|nav|footer|header)[^>]*>.*?</\1>#is', '', $html);

    // 2. Remove APENAS blocos de lixo por classes/ids bem específicos (evitar "mais" genérico)
    $html = preg_replace('/<(?:(?:div|section|span))[^>]*(class|id)=["\']([^"\']*)(share|social|tags|tag-|related|leia-?tambem|newsletter|coment|comentarios|comentários|whatsapp|telegram|outbrain|teads|anunc|advert|ads|promo|breadcrumb|gallery|caption|credit|byline|cookie|veja-?mais|mais-?lidas|mais-?not|leia-?mais|continue-?lendo)[^"\']*["\'][^>]*>.*?<\/(?:div|section|span)>/is', '', $html);

    // 3. Captura blocos válidos (p e h1–h6) do documento inteiro
    preg_match_all('/<(p|h[1-6])[^>]*>.*?<\/\1>/is', $html, $matches);
    if (empty($matches[0])) return '';

    $body = implode("\n", $matches[0]);

    // 4. Remove atributos dos headings e p
    $body = preg_replace('/<h([1-6])[^>]*>/i', '<h$1>', $body);
    $body = preg_replace('/<p[^>]*>/i', '<p>', $body);

    // 5. Remove parágrafos “CTA” por padrão (sem pegar "mais" genérico)
    $ctaPattern = '/<p>\s*(?:<strong>)?\s*(?:leia\s+tamb[eé]m|continue?\s+lend[oa]|acompanhe|siga\s+no\s+(?:whatsapp|telegram)|inscreva-se\s+na\s+newsletter|google\s+news|tags?:)\b.*?<\/p>/is';
    $body = preg_replace($ctaPattern, '', $body);

    // 6. Parágrafos vazios / normalização
    $body = preg_replace('#<p>\s*</p>#i', '', $body);
    $body = preg_replace("/(\r?\n){2,}/", "\n\n", $body);

    // 7. Sanitização (texto básico)
    $allowed = [
        'p' => [],
        'h1' => [], 'h2' => [], 'h3' => [], 'h4' => [], 'h5' => [], 'h6' => [],
        'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [],
        'a' => ['href' => []]
    ];
    $body = wp_kses($body, $allowed);

    // 8. Retira o título se repetido no início
    $plainTitle = trim(mb_strtolower(preg_replace('/\s+/', ' ', strip_tags($page_title))));
    $firstPara  = trim(mb_strtolower(strip_tags(preg_replace('/\s+/', ' ', substr($body, 0, 400)))));
    if ($plainTitle && strpos($firstPara, $plainTitle) !== false) {
        $body = preg_replace('/^<h1>.*?<\/h1>/i', '', $body);
        $body = preg_replace('/^<p>.*?' . preg_quote($page_title, '/') . '.*?<\/p>/i', '', $body);
    }

    return trim($body);
}
PHP;

if (preg_match($pattern_clean, $updated)) {
    $updated = preg_replace($pattern_clean, $replacement_clean, $updated);
    $changes[] = 'extract_clean_article_body() atualizado';
} else {
    $changes[] = 'AVISO: extract_clean_article_body() não encontrado (nenhuma alteração aplicada nessa função).';
}

/**
 * 2) Suaviza o final_body_cleanup: remove menos agressivamente (não mexe em "mais" genérico)
 */
$pattern_final_cleanup = '~protected\s+static\s+function\s+final_body_cleanup\(\s*\$html\s*,\s*\$page_title\s*=\s*\'\'\s*\)\s*\{.*?\}~is';

$replacement_final_cleanup = <<<'PHP'
protected static function final_body_cleanup($html, $page_title=''){
    if (!$html) return '';

    // Remove mídias/embeds residuais
    $html = preg_replace('#<(figure|img|picture|svg|video|audio|iframe)[^>]*>.*?</\\1>#is','', $html);
    $html = preg_replace('#<(figure|img|picture|svg|video|audio|iframe)[^>]*\/?>#is','', $html);

    // Remove blocos de classes notoriamente não-conteúdo (sem "mais" genérico)
    $html = preg_replace('/<([a-z0-9]+)[^>]*class=["\'][^"\']*(share|social|related|advert|ads|promo|breadcrumb|gallery|caption|credit|byline|newsletter|comments|outbrain|teads|banner|cookie|veja-?mais|leia-?tambem)[^"\']*["\'][^>]*>.*?<\/\\1>/is','', $html);

    // Comentários e espaçamentos
    $html = preg_replace('/<!--.*?-->/s','', $html);
    $html = preg_replace('/\n{3,}/', "\n\n", $html);

    // Remove H1 remanescente
    $html = preg_replace('#<h1[^>]*>.*?</h1>#is','', $html);

    // Parágrafos vazios
    $html = preg_replace('#<p[^>]*>(?:\s|&nbsp;|<br ?/?>)*</p>#i','', $html);

    return trim($html);
}
PHP;

if (preg_match($pattern_final_cleanup, $updated)) {
    $updated = preg_replace($pattern_final_cleanup, $replacement_final_cleanup, $updated);
    $changes[] = 'final_body_cleanup() atualizado';
} else {
    $changes[] = 'AVISO: final_body_cleanup() não encontrado (nenhuma alteração aplicada nessa função).';
}

/**
 * 3) Injeta um fallback DOM (smart_dom_fallback) se não existir.
 */
if (strpos($updated, 'function smart_dom_fallback(') === false) {
    $injection_point = strrpos($updated, '}'); // antes do fechamento final da classe
    if ($injection_point !== false) {
        $fallback_fn = <<<'PHP'

    /**
     * Fallback DOM: quando o corpo extraído é curto, tenta localizar o conteúdo
     * por seletores comuns (article, .entry-content, .post-content, etc.).
     */
    protected static function smart_dom_fallback($html, $page_title=''){
        if (!class_exists('DOMDocument')) return '';
        libxml_use_internal_errors(true);
        $doc = new DOMDocument();
        if (!$doc->loadHTML('<?xml encoding="utf-8" ?>'.$html)) return '';
        $xp = new DOMXPath($doc);

        $selectors = [
            '//article',
            "//*[contains(@class,'entry-content')]",
            "//*[contains(@class,'post-content')]",
            "//*[contains(@class,'single-content')]",
            "//*[contains(@class,'td-post-content')]",
            "//*[@itemprop='articleBody']",
            "//*[contains(@class,'content')]//article",
        ];

        $bestHtml = '';
        foreach ($selectors as $q) {
            $nodes = $xp->query($q);
            foreach ($nodes as $node) {
                $frag = self::dom_inner_html($node);
                // filtra apenas p e h2-h6
                if (preg_match_all('/<(p|h[2-6])[^>]*>.*?<\/\1>/is', $frag, $mm)) {
                    $chunk = implode("\n", $mm[0]);
                    $chunk = preg_replace('/<h([2-6])[^>]*>/i', '<h$1>', $chunk);
                    $chunk = preg_replace('/<p[^>]*>/i', '<p>', $chunk);
                    $chunk = self::final_body_cleanup($chunk, $page_title);
                    $len   = mb_strlen(strip_tags($chunk), 'UTF-8');
                    if ($len > mb_strlen(strip_tags($bestHtml), 'UTF-8')) {
                        $bestHtml = $chunk;
                    }
                }
            }
            if ($bestHtml) break;
        }
        return trim($bestHtml);
    }
PHP;
        $updated = substr($updated, 0, $injection_point) . $fallback_fn . substr($updated, $injection_point);
        $changes[] = 'smart_dom_fallback() adicionado';
    } else {
        $changes[] = 'ERRO: não foi possível injetar smart_dom_fallback() (ponto de inserção não encontrado).';
    }
} else {
    $changes[] = 'smart_dom_fallback() já existia (nenhuma ação).';
}

/**
 * 4) Insere chamada ao fallback dentro de extract_from_link(),
 *    logo após calcular $body_len (primeira ocorrência).
 */
$needle_after_len = '$body_len  = mb_strlen( wp_strip_all_tags($body_html), \'UTF-8\');';
$insert_snippet = <<<'PHP'

// === Fallback DOM quando o corpo está curto ===
if ($body_len < 300) {
    $fb = self::smart_dom_fallback($clean0, $title);
    if (!$fb && isset($html)) { // tentar com HTML cru se $clean0 falhar
        $fb = self::smart_dom_fallback($html, $title);
    }
    if ($fb) {
        $body_html = $fb;
        $body_len  = mb_strlen( wp_strip_all_tags($body_html), 'UTF-8');
        self::log('extract_fallback_dom', ['len'=>$body_len]);
    }
}
PHP;

if (strpos($updated, $needle_after_len) !== false && strpos($updated, 'extract_fallback_dom') === false) {
    $updated = str_replace($needle_after_len, $needle_after_len . "\n" . $insert_snippet, $updated);
    $changes[] = 'Fallback DOM conectado em extract_from_link()';
} else {
    $changes[] = 'AVISO: não conectei o fallback DOM (trecho não encontrado ou já conectado).';
}

/**
 * 5) Salva se houve alteração real
 */
if ($updated === $orig) {
    echo "Nenhuma alteração aplicada. O arquivo já parece atualizado.\n";
    echo "Backup criado: {$backup}\n";
    foreach ($changes as $c) echo "- {$c}\n";
    exit(0);
}

if (!file_put_contents($target, $updated)) {
    fwrite(STDERR, "Falha ao escrever alterações em: {$target}\nArquivo original preservado em: {$backup}\n");
    exit(1);
}

echo "Patch aplicado com sucesso em: {$target}\n";
echo "Backup: {$backup}\n";
echo "Alterações:\n";
foreach ($changes as $c) echo "- {$c}\n";

exit(0);