<?php
/**
 * MAA PRO — Estrategista de Conteúdos (Topical Authority)
 * v1.3.4 — Apenas Gemini; default gemini-2.5-flash; timeout 5m; persistência + limpar + envio p/ fila manual
 */
if (!defined('ABSPATH')) exit;

if (!class_exists('MAA_Estrat_Pro')):

final class MAA_Estrat_Pro {
    const VERSION = '1.3.4';
    const REST_NS = 'maa/v1';
    const R_GEN   = '/estrat/generate';
    const R_PUSH  = '/estrat/push_to_mass';

    public static function init() {
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_assets']);
        add_action('maa_render_estrat_tab', [__CLASS__, 'render'], 1);
        add_action('rest_api_init', [__CLASS__, 'register_rest']);
    }

    /* ================= UI ================= */
    public static function render() {
        if (!self::has_license()) { return self::render_locked_fallback(); } ?>
        <div class="maa3 est-wrap">
          <div class="header est-header">
            <div><h2>Estrategista de conteúdos</h2></div>
          </div>

          <div class="card est-card">
            <div class="est-form">
              <div class="est-left">
                <div class="est-field">
                  <label for="est-topic">Tópico/Nicho principal</label>
                  <input id="est-topic" class="maa-yt-input" type="text" placeholder="Ex.: Forças Armadas; pizza napolitana; exploração espacial">
                </div>

                <div class="est-grid-2">
                  <div class="est-field">
                    <label for="est-idioma">Idioma</label>
                    <input id="est-idioma" class="maa-yt-input" type="text" value="pt-BR" placeholder="pt-BR">
                  </div>
                  <div class="est-field">
                    <label for="est-pais">País</label>
                    <input id="est-pais" class="maa-yt-input" type="text" value="Brasil" placeholder="Brasil">
                  </div>
                </div>

                <div class="est-grid-2">
                  <div class="est-field">
                    <label for="est-site">Tipo de site</label>
                    <select id="est-site">
                      <option value="jornalistico">Jornalístico / notícias</option>
                      <option value="enciclopedico">Enciclopédico / educativo</option>
                      <option value="receitas">Receitas / culinária</option>
                      <option value="especializado">Especializado / técnico</option>
                    </select>
                  </div>
                  <div class="est-field">
                    <label for="est-level">Nível técnico</label>
                    <select id="est-level">
                      <option value="basico">Básico</option>
                      <option value="intermediario" selected>Intermediário</option>
                      <option value="avancado">Avançado</option>
                    </select>
                  </div>
                </div>

                <div class="est-grid-2">
                  <div class="est-field">
                    <label for="est-count">Número de conteúdos</label>
                    <input id="est-count" type="number" class="maa-yt-input" value="50" min="1" max="500">
                    <div class="hint">Mínimo recomendado: <strong>50</strong></div>
                  </div>
                </div>
              </div>

              <!-- IA/Modelo e ação -->
              <div class="est-right">
                <div class="est-field">
                  <label>IA</label>
                  <div class="hint" style="font-weight:600;">Gemini (Google)</div>
                </div>

                <div class="est-field">
                  <label for="est-model">Modelo (Gemini)</label>
                  <select id="est-model">
                    <option value="">Carregando modelos…</option>
                  </select>
                </div>

                <div class="est-actions">
                  <button id="est-generate" class="btn primary">Gerar estratégia</button>
                  <button id="est-clear" class="btn">Limpar estratégia</button>
                  <span id="est-status" class="hint"></span>
                </div>

                <p class="hint" style="margin:8px 0 0;color:#9a3412;">
                  Dica: exporte (TXT/CSV) antes de limpar para guardar uma cópia.
                </p>

                <!-- Loader local -->
                <div id="est-inline-loading" class="est-inline-loading" style="display:none;" aria-live="polite" aria-busy="true">
                  <div class="spinner"></div>
                  <div class="loading-text"><span id="est-loading-phrase">analisando nicho…</span></div>
                </div>
              </div>
            </div>
          </div>

          <div id="est-results" class="est-results" style="display:none;">
            <div class="est-results-grid">
              <div class="card">
                <div class="est-results-head">
                  <h3>Resumo da estratégia & orientações</h3>
                  <div class="row-inline est-tools">
                    <button id="est-push-all" class="btn xs">Enviar plano para fila de geração</button>
                    <button id="est-copy" class="btn xs">Copiar TXT</button>
                    <button id="est-export-txt" class="btn xs">Exportar TXT</button>
                    <button id="est-export-csv" class="btn xs">Exportar CSV</button>
                  </div>
                </div>
                <div id="est-summary" class="est-summary"></div>
              </div>

              <div class="card">
                <h3>Plano de conteúdos (C1..CN)</h3>
                <div id="est-items" class="q-list est-items"></div>
              </div>
            </div>
          </div>
        </div>
        <?php
    }

    public static function enqueue_assets($hook) {
        $is_page = isset($_GET['page']) && $_GET['page'] === 'maa-main' && (isset($_GET['sub']) ? $_GET['sub']==='estrat' : false);
        if (!$is_page) return;

        wp_register_style('maa-estrat', false, [], self::VERSION);
        wp_enqueue_style('maa-estrat');
        $css = <<<'CSS'
/* Layout */
.est-wrap .est-card{padding:14px}
.est-wrap .est-form{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;align-items:start}
.est-wrap .est-left,.est-wrap .est-right{display:grid;gap:12px}
.est-wrap .est-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:1100px){.est-wrap .est-form{grid-template-columns:1fr}.est-wrap .est-grid-2{grid-template-columns:1fr}}
.est-wrap .est-field label{display:block;font-weight:600;margin-bottom:6px}
.est-wrap .est-field .maa-yt-input,.est-wrap .est-field select{width:100%}

/* Loader local */
.est-wrap .est-inline-loading{display:flex;align-items:center;gap:12px;margin-top:10px}
.est-wrap .spinner{width:26px;height:26px;border-radius:999px;border:3px solid #e5e7eb;border-top-color:#6366f1;animation:estspin 1.2s linear infinite}
@keyframes estspin{to{transform:rotate(360deg)}}
.est-wrap .loading-text{font-weight:600;letter-spacing:0.2px;line-height:1.9}

/* Resultados */
.est-wrap .est-results{margin-top:14px}
.est-wrap .est-results-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:16px}
@media (max-width:1200px){.est-wrap .est-results-grid{grid-template-columns:1fr}}
.est-wrap .est-results-head{display:flex;justify-content:space-between;align-items:center}
.est-wrap .est-tools{gap:8px}

/* Itens C1..CN */
.est-wrap .cluster-card{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:10px 0;background:#fff}
.est-wrap .cluster-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.est-wrap .badge{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:2px 8px;font-size:12px;color:#334155}
.est-wrap .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.est-wrap .chip-sm{background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:2px 6px;font-size:11px}
.est-wrap .hint.sm{font-size:12px;color:#64748b}
.est-wrap .est-summary{white-space:pre-wrap}
.est-wrap .cluster-footer{margin-top:8px;display:flex;justify-content:flex-end}
CSS;
        wp_add_inline_style('maa-estrat', $css);

        wp_register_script('maa-estrat-js', false, ['wp-api-fetch'], self::VERSION, true);
        wp_enqueue_script('maa-estrat-js');
        wp_localize_script('maa-estrat-js', 'MAA_ESTRAT', [
            'nonce'   => wp_create_nonce('wp_rest'),
            'restGen' => esc_url_raw( rest_url(self::REST_NS . self::R_GEN) ),
            'restPush'=> esc_url_raw( rest_url(self::REST_NS . self::R_PUSH) ),
        ]);

        $inline = <<<'JS'
(function(wp){
  if(!wp || !wp.apiFetch) return;
  try{ wp.apiFetch.use( wp.apiFetch.createNonceMiddleware(MAA_ESTRAT.nonce) ); }catch(e){}

  const q=(id)=>document.getElementById(id);
  const set=(id,t)=>{ const el=q(id); if(el) el.textContent = t||''; };

  const STORAGE_JSON = 'MAA_ESTRAT_LAST';
  const STORAGE_FORM = 'MAA_ESTRAT_FORM';

  // Somente Gemini
  const MODELS = [
    { v:'gemini-2.5-flash',      label:'gemini-2.5-flash (padrão)' },
    { v:'gemini-2.5-pro',        label:'gemini-2.5-pro' },
    { v:'gemini-2.5-flash-lite', label:'gemini-2.5-flash-lite' }
  ];

  function populateModels(){
    const sel=q('est-model'); if(!sel) return;
    sel.innerHTML='';
    MODELS.forEach(function(m){
      const o=document.createElement('option');
      o.value=m.v;
      o.textContent=m.label;
      sel.appendChild(o);
    });
    sel.value='gemini-2.5-flash';
  }

  // Fallback: se o select estiver vazio quando focado/clique, repopula
  ['focus','mousedown'].forEach(function(ev){
    document.addEventListener(ev, function(e){
      const sel = document.getElementById('est-model');
      if(!sel) return;
      if(e.target === sel && sel.options.length === 0){
        populateModels();
      }
    }, true);
  });

  // ----- Persistência -----
  function saveForm(){
    const data = {
      topic: q('est-topic') ? q('est-topic').value : '',
      idioma: q('est-idioma') ? q('est-idioma').value : 'pt-BR',
      pais: q('est-pais') ? q('est-pais').value : 'Brasil',
      site: q('est-site') ? q('est-site').value : 'jornalistico',
      level: q('est-level') ? q('est-level').value : 'intermediario',
      total: q('est-count') ? q('est-count').value : '50',
      model: q('est-model') ? q('est-model').value : 'gemini-2.5-flash'
    };
    try{ localStorage.setItem(STORAGE_FORM, JSON.stringify(data)); }catch(_){}
  }
  function restoreForm(){
    try{
      const raw = localStorage.getItem(STORAGE_FORM);
      if(!raw) return;
      const f = JSON.parse(raw);
      if(f.topic!=null && q('est-topic'))   q('est-topic').value = f.topic;
      if(f.idioma!=null && q('est-idioma'))  q('est-idioma').value = f.idioma;
      if(f.pais!=null && q('est-pais'))    q('est-pais').value = f.pais;
      if(f.site!=null && q('est-site'))    q('est-site').value = f.site;
      if(f.level!=null && q('est-level'))   q('est-level').value = f.level;
      if(f.total!=null && q('est-count'))   q('est-count').value = f.total;
      // garante que os modelos já foram populados
      const sel=q('est-model');
      if(sel && f.model && Array.prototype.slice.call(sel.options).some(function(o){return o.value===f.model;})){
        sel.value=f.model;
      }
    }catch(_){}
  }
  function saveStrategyJSON(data){
    try{ localStorage.setItem(STORAGE_JSON, JSON.stringify(data)); }catch(_){}
  }
  function restoreStrategyJSON(){
    try{
      const raw = localStorage.getItem(STORAGE_JSON);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(_){ return null; }
  }
  function clearSaved(){
    try{
      localStorage.removeItem(STORAGE_JSON);
    }catch(_){}
  }

  // Loader local (frases mais lentas)
  const PHRASES = [
    'analisando nicho…',
    'analisando palavra-chave…',
    'mapeando entidades…',
    'avaliando intenção de busca…',
    'gerando ideias…',
    'elaborando estratégia…',
    'montando plano C1..CN…'
  ];
  let phraseTimer=null, phraseIdx=0;
  function startLoading(){
    const box = q('est-inline-loading'); if(!box) return;
    box.style.display='flex';
    const txt = q('est-loading-phrase');
    phraseIdx=0; if(phraseTimer) clearInterval(phraseTimer);
    if(txt) txt.textContent = PHRASES[0];
    phraseTimer = setInterval(function(){
      phraseIdx=(phraseIdx+1)%PHRASES.length;
      if(txt) txt.textContent = PHRASES[phraseIdx];
    }, 2400);
  }
  function stopLoading(){
    const box = q('est-inline-loading'); if(!box) return;
    box.style.display='none';
    if(phraseTimer) clearInterval(phraseTimer);
  }

  function cleanErr(e){
    let raw = (e && e.message)? e.message : (typeof e==='string'? e : 'falha desconhecida');
    try{
      const tmp=document.createElement('div');
      tmp.innerHTML=String(raw);
      raw = tmp.textContent || tmp.innerText || raw;
    }catch(_){}
    if(/cURL error 28|timeout/i.test(raw)) raw = 'Tempo excedido. Tente novamente.';
    return raw;
  }

  // Render summary
  function renderSummary(data){
    const box=q('est-summary'); if(!box) return;
    const s = String(data.summary || '').trim();
    box.textContent = s || 'Sem resumo.';
  }

  // Render items (C1..CN)
  function renderItems(data){
    const box=q('est-items'); if(!box) return;
    const items = Array.isArray(data.items)? data.items : [];
    if(!items.length){
      box.innerHTML = '<div class="hint">Sem itens.</div>';
      return;
    }
    box.innerHTML='';
    items.forEach(function(it){
      const id = String(it.id||'');
      const pillar = it.pillar || '—';
      const kw = it.keyword || '';
      const ents = Array.isArray(it.entities_topics)? it.entities_topics : [];
      const brief = it.brief || '';
      const links = Array.isArray(it.links_to)? it.links_to : [];
      const wave = it.wave!=null ? String(it.wave) : '';
      const title = it.title || '(sem título)';

      const card = document.createElement('div');
      card.className = 'cluster-card';
      card.innerHTML =
        '<div class="cluster-head">'+
          '<div>'+
            '<div class="chips">'+
              '<span class="chip-sm">ID: '+escapeHtml(id)+'</span>'+
              (pillar?'<span class="chip-sm">Pilar: '+escapeHtml(pillar)+'</span>':'')+
              (wave?'<span class="chip-sm">Onda: '+escapeHtml(wave)+'</span>':'')+
            '</div>'+
            '<div style="margin-top:6px;font-weight:600">'+escapeHtml(title)+'</div>'+
            (kw?('<div class="hint sm" style="margin-top:2px">KW alvo: '+escapeHtml(kw)+'</div>'):'')+
            (ents.length?('<div class="chips" style="margin-top:6px">'+ents.slice(0,10).map(function(e){return '<span class="badge">'+escapeHtml(e)+'</span>';}).join('')+'</div>'):'')+
            (brief?('<div class="hint" style="margin-top:6px">'+escapeHtml(brief)+'</div>'):'')+
            (links.length?('<div class="hint sm" style="margin-top:6px">Links sugeridos: '+links.map(function(l){return escapeHtml(String(l));}).join(', ')+'</div>'):'')+
          '</div>'+
        '</div>'+
        '<div class="cluster-footer">'+
          '<button type="button" class="btn xs est-push-one" data-id="'+escapeAttr(id)+'">Enviar este conteúdo para fila</button>'+
        '</div>';
      box.appendChild(card);
    });
  }

  function renderAll(resp){
    const r = q('est-results');
    if(r) r.style.display='block';
    renderSummary(resp);
    renderItems(resp);
  }

  function makeTXT(data){
    let out = '';
    if(data.summary) out += String(data.summary).trim() + "\\n\\n";
    const items = Array.isArray(data.items)? data.items : [];
    items.forEach(function(it){
      out += (it.id||'') + ' — ' + (it.title||'') + "\\n";
      out += '  Pilar: ' + (it.pillar||'—') + ' | Onda: ' + (it.wave!=null?it.wave:'—') + "\\n";
      if(it.keyword) out += '  KW: ' + it.keyword + "\\n";
      if(Array.isArray(it.entities_topics) && it.entities_topics.length) out += '  Entidades/assuntos: ' + it.entities_topics.join('; ') + "\\n";
      if(it.brief) out += '  Brief: ' + it.brief + "\\n";
      if(Array.isArray(it.links_to) && it.links_to.length) out += '  Links: ' + it.links_to.join(', ') + "\\n";
      out += "\\n";
    });
    return out;
  }

  function makeCSV(data){
    const items = Array.isArray(data.items)? data.items : [];
    const head = ['id','title','pillar','wave','keyword','entities_topics','brief','links_to'];
    const rows = [head.join(',')];
    items.forEach(function(it){
      const ents  = (Array.isArray(it.entities_topics)? it.entities_topics.join('; ') : '').replace(/"/g,'""');
      const links = (Array.isArray(it.links_to)? it.links_to.join('; ') : '').replace(/"/g,'""');
      const row = [
        (it.id||''),(it.title||''),(it.pillar||''),(it.wave!=null?it.wave:''),(it.keyword||''),
        ents,(it.brief||''),links
      ].map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
      rows.push(row);
    });
    return rows.join('\\n');
  }

  // --- Enviar itens para a fila de geração manual ---
async function pushItemsToMass(items, single){
  if(!items || !items.length){
    alert('Nenhum item disponível para enviar.');
    return;
  }
  try{
    const res = await wp.apiFetch({
      url: MAA_ESTRAT.restPush,
      method:'POST',
      data: { items: items }
    });

    const added  = (res && typeof res.added !== 'undefined') ? Number(res.added) : 0;
    const dupes  = (res && typeof res.duplicates !== 'undefined') ? Number(res.duplicates) : 0;
    const failed = (res && typeof res.failed !== 'undefined') ? Number(res.failed) : 0;

    let msg = `✅ Enviado para a fila: ${added} adicionado(s).`;
    if(dupes)  msg += `\nℹ️ ${dupes} já estavam na fila (duplicados).`;
    if(failed) msg += `\n⚠️ ${failed} falharam.`;

    // se for envio unitário, mantém a mensagem curta, mas sem mentir
    if(single && added === 1 && dupes === 0 && failed === 0){
      msg = '✅ Conteúdo enviado para a fila de geração manual.';
    }

    alert(msg);
  }catch(err){
    alert('Falha ao enviar para a fila: '+cleanErr(err));
  }
}


  // Export & Copy
  document.addEventListener('click', function(e){
    if(e.target && e.target.id==='est-export-txt'){
      e.preventDefault();
      try{
        const data = window.__EST_LAST_JSON || {};
        const blob = new Blob([makeTXT(data)], {type:'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'estrategia-topical.txt';
        a.click();
      }catch(err){}
    }
    if(e.target && e.target.id==='est-export-csv'){
      e.preventDefault();
      try{
        const data = window.__EST_LAST_JSON || {};
        const blob = new Blob([makeCSV(data)], {type:'text/csv'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'plano-conteudos.csv';
        a.click();
      }catch(err){}
    }
    if(e.target && e.target.id==='est-copy'){
      e.preventDefault();
      try{
        const data = window.__EST_LAST_JSON || {};
        navigator.clipboard.writeText(makeTXT(data));
        e.target.textContent='Copiado!';
        setTimeout(function(){ e.target.textContent='Copiar TXT'; }, 1200);
      }catch(err){}
    }
  });

  // Limpar estratégia
  document.addEventListener('click', function(e){
    if(e.target && e.target.id==='est-clear'){
      e.preventDefault();
      const ok = window.confirm('Limpar estratégia atual? Dica: exporte (TXT/CSV) antes de limpar para guardar uma cópia.');
      if(!ok) return;
      clearSaved();
      window.__EST_LAST_JSON = {};
      const boxItems = q('est-items'); if(boxItems) boxItems.innerHTML='';
      const boxSummary = q('est-summary'); if(boxSummary) boxSummary.textContent='';
      const results = q('est-results'); if(results) results.style.display='none';
      set('est-status','Estratégia limpa.');
    }
  });

  // Enviar plano inteiro para a fila
  document.addEventListener('click', function(e){
    if(e.target && e.target.id === 'est-push-all'){
      e.preventDefault();
      const data = window.__EST_LAST_JSON || {};
      const items = Array.isArray(data.items)? data.items : [];
      if(!items.length){
        alert('Nenhum item na estratégia atual para enviar.');
        return;
      }
      const ok = window.confirm('Enviar TODOS os conteúdos deste plano para a fila da geração manual?');
      if(!ok) return;
      pushItemsToMass(items, false);
    }
  });

  // Enviar item individual para a fila
  document.addEventListener('click', function(e){
    if(e.target && e.target.classList.contains('est-push-one')){
      e.preventDefault();
      const id = e.target.getAttribute('data-id') || '';
      const data = window.__EST_LAST_JSON || {};
      const items = Array.isArray(data.items)? data.items : [];
      if(!id || !items.length) return;
      const found = items.find(function(it){ return String(it.id||'') === id; });
      if(!found){
        alert('Item não encontrado na estratégia atual.');
        return;
      }
      pushItemsToMass([found], true);
    }
  });

  // Auto-salvar formulário
  ['input','change'].forEach(function(ev){
    document.addEventListener(ev, function(e){
      if(!e || !e.target) return;
      const ids = ['est-topic','est-idioma','est-pais','est-site','est-level','est-count','est-model'];
      if(ids.indexOf(e.target.id) !== -1){ saveForm(); }
    }, true);
  });

  // Generate
  document.addEventListener('click', async function(e){
    if(e.target && e.target.id==='est-generate'){
      e.preventDefault();
      const topicEl = q('est-topic');
      const topic = topicEl ? String(topicEl.value||'').trim() : '';
      if(!topic){ alert('Informe o tópico principal.'); return; }
      const idioma = q('est-idioma') ? String(q('est-idioma').value||'pt-BR').trim() : 'pt-BR';
      const pais   = q('est-pais')   ? String(q('est-pais').value||'Brasil').trim()   : 'Brasil';
      const site_type = q('est-site') ? String(q('est-site').value||'jornalistico').trim() : 'jornalistico';
      const level     = q('est-level')? String(q('est-level').value||'intermediario').trim() : 'intermediario';
      const total     = Math.max(1, parseInt(q('est-count') ? (q('est-count').value||'50') : '50',10));
      const model     = q('est-model')? String(q('est-model').value||'gemini-2.5-flash') : 'gemini-2.5-flash';

      set('est-status','Gerando…');
      startLoading();
      saveForm();

      try{
        const res = await wp.apiFetch({
          url: MAA_ESTRAT.restGen,
          method:'POST',
          data: { topic: topic, idioma: idioma, pais: pais, site_type: site_type, level: level, total: total, model: model }
        });
        window.__EST_LAST_JSON = res || {};
        saveStrategyJSON(window.__EST_LAST_JSON);
        renderAll(res || {});
        set('est-status','Concluído');
      }catch(err){
        set('est-status','Erro: '+cleanErr(err));
      }finally{
        stopLoading();
      }
    }
  });

  // Inicialização
  document.addEventListener('DOMContentLoaded', function(){
    populateModels();
    restoreForm();
    const saved = restoreStrategyJSON();
    if(saved && (Array.isArray(saved.items)? saved.items.length : 0) > 0){
      window.__EST_LAST_JSON = saved;
      renderAll(saved);
    }
  });

  function escapeHtml(s){
    return (String(s||'')).replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c;
    });
  }
  function escapeAttr(s){
    return (String(s||'')).replace(/"/g,'&quot;');
  }

})(window.wp);
JS;
        wp_add_inline_script('maa-estrat-js', $inline, 'after');
    }

    /* ================ REST ================ */
    public static function register_rest() {
        // Geração da estratégia
        register_rest_route(self::REST_NS, self::R_GEN, [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_generate'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => [
                'topic'     => ['type'=>'string','required'=>true],
                'idioma'    => ['type'=>'string','required'=>false],
                'pais'      => ['type'=>'string','required'=>false],
                'site_type' => ['type'=>'string','required'=>false],
                'level'     => ['type'=>'string','required'=>false],
                'total'     => ['type'=>'integer','required'=>false],
                'model'     => ['type'=>'string','required'=>false], // Gemini only
            ]
        ]);

        // Envio de itens para a fila da geração manual
        register_rest_route(self::REST_NS, self::R_PUSH, [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'rest_push_to_mass'],
            'permission_callback' => function(){ return current_user_can('edit_posts'); },
            'args' => [
                'items' => [
                    'type'     => 'array',
                    'required' => true,
                ],
            ],
        ]);
    }

    public static function rest_generate(\WP_REST_Request $req) {
        if (!self::has_license()) {
            return new \WP_Error('license', 'Recurso disponível apenas para PRO.', ['status'=>403]);
        }

        $topic  = sanitize_text_field($req->get_param('topic') ?: '');
        $idioma = sanitize_text_field($req->get_param('idioma') ?: 'pt-BR');
        $pais   = sanitize_text_field($req->get_param('pais')   ?: 'Brasil');
        $site_type = sanitize_text_field($req->get_param('site_type') ?: 'jornalistico');
        $level     = sanitize_text_field($req->get_param('level')     ?: 'intermediario');
        $total     = max(1, intval($req->get_param('total') ?: 50));
        $model     = sanitize_text_field($req->get_param('model')    ?: 'gemini-2.5-flash');
        if (!$topic) return new \WP_Error('missing','Informe o tópico principal.',['status'=>400]);

        @set_time_limit(310); // segurança
        $system = 'Você é um estrategista de conteúdo SEO. Retorne apenas JSON válido; nada além do JSON. Foque em autoridade temática, completude semântica e linkagem interna entre os próprios conteúdos.';

        $user_prompt = self::build_strategy_prompt([
            'topic'=>$topic,'idioma'=>$idioma,'pais'=>$pais,
            'site_type'=>$site_type,'level'=>$level,'total'=>$total
        ]);

        // Chamada SEMPRE via Gemini
        if (!class_exists('MAA_Gemini_Module')) {
            return new \WP_Error('gemini_missing','Módulo Gemini não encontrado.',['status'=>500]);
        }

        // Timeout global de 5 min
        $f = function($t){ return max(300, (int)$t); };
        add_filter('http_request_timeout', $f, 99, 1);

        // Ajuste para o modelo PRO: exige thinking mode
        $opts = ['temperature'=>0.7,'topP'=>0.95,'topK'=>40];
        if (stripos($model, 'pro') !== false) {
            $opts['thinkingBudget'] = 1000; // evita INVALID_ARGUMENT "Budget 0 is invalid"
        }

        try{
            $resp = MAA_Gemini_Module::call($model, $system, $user_prompt, $opts);
        } finally {
            remove_filter('http_request_timeout', $f, 99);
        }
        if (is_wp_error($resp)) return $resp;
        $text = (string)$resp;

        $json = self::try_json($text);
        if (!is_array($json) || empty($json)) {
            return new \WP_Error('bad_json','Não foi possível interpretar o JSON retornado.',['status'=>500,'debug'=>$text]);
        }

        return new \WP_REST_Response([
            'topic'   => (string)($json['topic'] ?? $topic),
            'summary' => (string)($json['summary'] ?? ''),
            'items'   => is_array($json['items'] ?? null) ? $json['items'] : [],
        ], 200);
    }

    /**
     * Recebe itens do plano (JSON vindo do JS) e enfileira como "manual"
     * na inbox do gerador em massa (MAA_Mass_Generator / maa_mass_enqueue).
     */
public static function rest_push_to_mass(\WP_REST_Request $req) {
    if (!self::has_license()) {
        return new \WP_Error('license', 'Recurso disponível apenas para PRO.', ['status'=>403]);
    }

    if (!function_exists('maa_mass_enqueue') && !class_exists('MAA_Mass_Generator')) {
        return new \WP_Error(
            'mass_missing',
            'Módulo de geração manual não encontrado. Abra a aba "Geração manual" para confirmar se o módulo está ativo.',
            ['status'=>500]
        );
    }

    $items = $req->get_param('items');
    if (!is_array($items) || empty($items)) {
        return new \WP_Error('no_items', 'Nenhum item recebido para enfileirar.', ['status'=>400]);
    }

    $max   = 500; // limite de segurança
    $seen  = 0;

    // contadores novos
    $added = 0;
    $dupes = 0;
    $fail  = 0;

    foreach ($items as $raw) {
        if ($seen >= $max) {
            break;
        }
        if (!is_array($raw)) {
            continue;
        }

        $title   = isset($raw['title']) ? sanitize_text_field($raw['title']) : '';
        $id      = isset($raw['id']) ? sanitize_text_field($raw['id']) : '';
        $brief   = isset($raw['brief']) ? sanitize_textarea_field($raw['brief']) : '';
        $keyword = isset($raw['keyword']) ? sanitize_text_field($raw['keyword']) : '';

        $ents = [];
        if (!empty($raw['entities_topics']) && is_array($raw['entities_topics'])) {
            foreach ($raw['entities_topics'] as $e) {
                $ents[] = sanitize_text_field($e);
            }
        }

        if ($title === '' && $brief === '' && $keyword === '') {
            continue;
        }

        $pauta = $title !== '' ? $title : ($id ?: 'Conteúdo do plano de estratégia');

        $pieces = [];
        if ($brief !== '') {
            $pieces[] = 'Brief: ' . $brief;
        }
        if ($keyword !== '') {
            $pieces[] = 'Palavra-chave alvo: ' . $keyword;
        }
        if (!empty($ents)) {
            $pieces[] = 'Entidades/assuntos: ' . implode(', ', $ents);
        }

        $fonte = implode("\n\n", $pieces);

        $payload = [
            'type'  => 'manual',
            'pauta' => $pauta,
            'fonte' => $fonte,
            'kw'                 => $keyword,
            'palavra_chave_alvo' => $keyword, // compat
        ];

        // >>> chamado retorna: 1=adicionado, 2=duplicado, 0=falha (ou true/false p/ compat)
        if (function_exists('maa_mass_enqueue')) {
            $r = maa_mass_enqueue($payload);
        } else {
            $r = \MAA_Mass_Generator::enqueue_server($payload);
        }

        if ($r === 1 || $r === true) {
            $added++;
        } elseif ($r === 2) {
            $dupes++;
        } else {
            $fail++;
        }

        $seen++;
    }

    // Se nada foi adicionado e só teve duplicado, ainda assim é "ok"
    if ($added === 0 && $dupes === 0) {
        return new \WP_Error('enqueue_fail', 'Não foi possível enfileirar nenhum item.', ['status'=>500]);
    }

    return new \WP_REST_Response([
        'added'      => $added,
        'duplicates' => $dupes,
        'failed'     => $fail,
    ], 200);
}


    /* ============== Helpers ============== */
    private static function has_license() {
        $ok = false;
        if (function_exists('maa_pro_is_license_active')) {
            $ok = (bool)call_user_func('maa_pro_is_license_active');
        }
        return (bool) apply_filters('maa_pro_license_is_active', $ok);
    }

    private static function build_strategy_prompt(array $p): string {
        $topic = $p['topic']; $idioma=$p['idioma']; $pais=$p['pais'];
        $site  = $p['site_type']; $level=$p['level']; $total=(int)$p['total'];

        return <<<PROMPT
Crie uma ESTRATÉGIA para aumentar autoridade temática no tópico "{$topic}".
Idioma: {$idioma}. País: {$pais}. Tipo de site: {$site}. Nível: {$level}.
Quantidade total de conteúdos a PRODUZIR: {$total} (mínimo recomendado 50).

Diretrizes:
- Estruture em ONDAS: Onda 1 = 3–5 conteúdos-pilar; Onda 2 = ~20% do total (ex.: 10 em 50) apontando para os pilares; Onda 3 = restante cobrindo o assunto de forma abrangente e apontando para os anteriores.
- Cada item deve ter título, palavra-chave alvo e uma lista de 6–12 ENTIDADES/ASSUNTOS a tratar. (Não inclua outline).
- Sempre sugira links internos via IDs (ex.: ["C1","C2"]). Não use URLs.
- Não use métricas de prioridade.
- Produza EXATAMENTE {$total} itens, nomeando-os sequencialmente "C1", "C2", ..., "C{$total}".

RETORNE EXCLUSIVAMENTE JSON, neste formato:
{
  "topic": "{$topic}",
  "summary": "Texto curto (3–6 parágrafos) explicando a lógica das ondas, por que os pilares foram escolhidos e como a linkagem interna sustenta a topical authority.",
  "items": [
    {
      "id": "C1",
      "wave": 1,
      "pillar": "Nome do pilar principal",
      "title": "Título do conteúdo",
      "keyword": "palavra-chave alvo",
      "entities_topics": ["entidade/assunto 1", "entidade/assunto 2", "..."],
      "brief": "Breve orientação editorial (tom, ângulo, limites).",
      "links_to": ["C2","C3"]
    }
  ]
}
PROMPT;
    }

    private static function try_json($text) {
        $clean = trim((string)$text);
        $clean = preg_replace('/^```(json)?/i','', $clean);
        $clean = preg_replace('/```$/','', $clean);
        $j = json_decode($clean, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $s = strpos($clean,'{'); $e = strrpos($clean,'}');
            if ($s!==false && $e!==false && $e>$s) {
                $maybe = substr($clean,$s,$e-$s+1);
                $j = json_decode($maybe, true);
            }
        }
        return is_array($j) ? $j : [];
    }

    private static function render_locked_fallback() { ?>
        <div class="maa3 est-wrap">
          <div class="header"><h2>Estrategista de conteúdos</h2><span class="chip">Recurso PRO</span></div>
          <div class="card" style="position:relative; overflow:hidden;">
            <p class="hint" style="margin:6px 0 0;">Este módulo está disponível apenas para assinantes <strong>PRO</strong>.</p>
            <div style="margin-top:12px; height:120px; border:1px dashed var(--line); border-radius:10px; display:grid; place-items:center;">
              <strong>Acesso restrito — apenas assinantes PRO</strong>
            </div>
          </div>
        </div>
    <?php }
}

MAA_Estrat_Pro::init();
endif;
