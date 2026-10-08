/* PARTIGIANA HUB — KDS v0.4 (protótipo local)
   kdsReady representa a finalização na estação. Não altera order.status,
   item.completed nem os movimentos de estoque.
   Sem comunicação entre computadores: a versão real necessita backend.
*/
const KDS = {
    station: 'cozinha', // compatibilidade com filtros antigos e testes existentes
    mode: 'cozinha',
    categorySelections: Object.create(null),
    draftCategories: new Set(),
    view: 'pendentes',
    warnMinutes: 10,
    criticalMinutes: 20,
    sound: false,
    seen: new Set(),
    initialized: false,
    clock: null,
    page: 0
};

// Preferências locais do KDS, armazenadas com a base de demonstração.
function kdsPreferencias() {
    const c = typeof hubKdsConfigForMode==='function' ? (hubKdsConfigForMode('production')||db?.kdsConfig||{}) : (db?.kdsConfig||{});
    const fontSize = Math.max(14, Math.min(28, Number(c.fontSize) || 20));
    const visibleItems = Math.max(1, Math.min(10, Math.round(Number(c.visibleItems) || 3)));
    const columns = Math.max(1, Math.min(8, Math.round(Number(c.columns) || 5)));
    const rows = Math.max(1, Math.min(4, Math.round(Number(c.rows) || 2)));
    return {fontSize, visibleItems, columns, rows};
}
function kdsRenderizarConfiguracoes(area) {
    const cfg = kdsPreferencias();
    area.innerHTML = `<div class="kds-config-card">
      <h3>🍕 Visualização dos pedidos na cozinha</h3>
      <p>Personalize a grade fixa da cozinha. Por exemplo: 5 colunas × 2 linhas = 10 pedidos por página. As setas laterais mostram os próximos pedidos; dentro dos cartões, você rola os itens.</p>
      <div class="kds-config-grid">
        <div class="form-group"><label for="kds-setting-font">Tamanho da letra dos itens</label>
          <select id="kds-setting-font">
            ${[14,16,18,20,22,24,26,28].map(n=>`<option value="${n}" ${cfg.fontSize===n?'selected':''}>${n} px${n===20?' (padrão)':''}</option>`).join('')}
          </select><small>Textos maiores facilitam a leitura de longe.</small></div>
        <div class="form-group"><label for="kds-setting-visible">Quantidade de itens na visualização inicial</label>
          <select id="kds-setting-visible">
            ${Array.from({length:10},(_,i)=>i+1).map(n=>`<option value="${n}" ${cfg.visibleItems===n?'selected':''}>${n} ${n===1?'item':'itens'}${n===3?' (padrão)':''}</option>`).join('')}
          </select><small>Quantidade desejada; se não couber na altura da tela, haverá rolagem apenas dentro do cartão.</small></div>
        <div class="form-group"><label for="kds-setting-columns">Cartões na horizontal (colunas)</label>
          <select id="kds-setting-columns">
            ${Array.from({length:8},(_,i)=>i+1).map(n=>`<option value="${n}" ${cfg.columns===n?'selected':''}>${n} ${n===1?'coluna':'colunas'}${n===5?' (padrão)':''}</option>`).join('')}
          </select><small>Em telas estreitas, o painel adapta a quantidade de colunas para manter os cartões legíveis.</small></div>
        <div class="form-group"><label for="kds-setting-rows">Cartões na vertical (linhas)</label>
          <select id="kds-setting-rows">
            ${Array.from({length:4},(_,i)=>i+1).map(n=>`<option value="${n}" ${cfg.rows===n?'selected':''}>${n} ${n===1?'linha':'linhas'}${n===2?' (padrão)':''}</option>`).join('')}
          </select><small>Os cartões terão altura uniforme, sem rolagem da página inteira.</small></div>
      </div>
      <button type="button" class="btn-success" onclick="kdsSalvarConfiguracoes()">Salvar configuração do KDS</button>
      <p class="kds-config-tip">Para conferir o resultado, abra ☰ → KDS — Cozinha. As alterações não modificam os pedidos, os preços nem o estoque.</p>
    </div>`;
}
function kdsSalvarConfiguracoes() {
    const fontSize = Number(document.getElementById('kds-setting-font')?.value);
    const visibleItems = Number(document.getElementById('kds-setting-visible')?.value);
    const columns = Number(document.getElementById('kds-setting-columns')?.value);
    const rows = Number(document.getElementById('kds-setting-rows')?.value);
    if (![14,16,18,20,22,24,26,28].includes(fontSize) || !Number.isInteger(visibleItems) || visibleItems < 1 || visibleItems > 10
        || !Number.isInteger(columns) || columns < 1 || columns > 8 || !Number.isInteger(rows) || rows < 1 || rows > 4) {
        showCustomAlert('Selecione valores válidos para o KDS.');return false;
    }
    db.kdsConfig = {fontSize, visibleItems, columns, rows};
    saveDb();
    kdsRenderizar();
    showCustomAlert('Configurações do KDS salvas. Abra o painel da cozinha para conferir.','KDS atualizado');
    return true;
}


function kdsEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Cozinha e bar usam o mesmo painel e estado dos itens, mas preservam filtros distintos.
// Filtros são locais por navegador: uma mudança feita no computador do bar não troca os filtros da cozinha.
function kdsCategoriasDisponiveis() {
    return [...new Set((db.categories||[]).map(c=>typeof c==='string'?c:c?.name).filter(Boolean))];
}
function kdsCategoriasPadrao(mode) {
    const categories = db.categories||[];
    if(mode==='bar') {
        const drinks=categories.filter(c=>/drink|coquetel|cocktail|bar/i.test(typeof c==='string'?c:c?.name||'')).map(c=>typeof c==='string'?c:c.name);
        if(drinks.length) return drinks;
        return categories.filter(c=>/bebida|suco|refrigerante/i.test(typeof c==='string'?c:c?.name||'')).map(c=>typeof c==='string'?c:c.name);
    }
    return categories.filter(c=>typeof c==='object' && c.imprimeCozinha===true).map(c=>c.name)
        .concat(categories.filter(c=>/pizza/i.test(typeof c==='string'?c:c?.name||'')).map(c=>typeof c==='string'?c:c.name));
}
function kdsCategoriasSelecionadas(mode=KDS.mode) {
    if (!['bar','cozinha'].includes(mode)) mode='cozinha';
    if (!KDS.categorySelections[mode]) {
        let stored=null;
        try {
            const raw=localStorage.getItem('partigiana_kds_categorias_'+mode+'_v11');
            if(raw!==null) {const parsed=JSON.parse(raw);if(Array.isArray(parsed))stored=parsed;}
        } catch(e) { /* navegador sem armazenamento */ }
        const available=kdsCategoriasDisponiveis();
        const fallback=kdsCategoriasPadrao(mode).filter(x=>available.includes(x));
        KDS.categorySelections[mode]=[...new Set((stored&&stored.some(x=>available.includes(x))?stored:fallback).filter(x=>available.includes(x)))];
    }
    const available=kdsCategoriasDisponiveis();
    KDS.categorySelections[mode]=KDS.categorySelections[mode].filter(name=>available.includes(name));
    return KDS.categorySelections[mode];
}
function kdsCategoriasItem(item) {
    if(Array.isArray(item.categories) && item.categories.length) return item.categories;
    const prod=(db.products||[]).find(p=>String(p.id)===String(item.id));
    return Array.isArray(prod?.categories)?prod.categories:[];
}
function kdsContarPizzasPendentes() {
    return (db.orders||[])
        .filter(order=>!order.archived && order.status==='preparo')
        .flatMap(order=>order.items||[])
        .filter(item=>!item.cancelled && !item.completed && !item.kitchenReady)
        .filter(item=>kdsCategoriasItem(item).some(name=>/pizza/i.test(name)) || /^pizza\b/i.test(item.name||''))
        .length;
}
function kdsAbrirPainel(mode) {
    if(!['cozinha','bar'].includes(mode)) return;
    // Reusa a permissão do KDS de produção. O KDS do salão mantém uma permissão separada.
    if(typeof getMyPerms==='function' && !getMyPerms().includes('kds-view')) {
        showCustomAlert('Acesso negado ao KDS de produção.'); return;
    }
    KDS.mode=mode;
    KDS.station='selecionadas';
    KDS.page=0;
    KDS.view='pendentes';
    kdsFecharCategorias();
    switchViewAndClose('kds-view');
}
function kdsAtualizarControleCategorias() {
    const selected=kdsCategoriasSelecionadas();
    const count=document.getElementById('kds-category-count');
    if(count)count.textContent=`(${selected.length})`;
    const button=document.getElementById('kds-category-button');
    if(button) button.title=selected.length?selected.join(', '):'Nenhuma categoria selecionada';
    const heading=document.getElementById('kds-mode-heading');
    if(heading)heading.textContent=typeof hubKdsPreset==='function'?'🍕 KDS — '+hubKdsPreset().name:(KDS.mode==='bar'?'🍹 KDS — Painel do bar':'🍕 KDS — Painel da cozinha');
    const counter=document.getElementById('kds-pizza-counter');
    if(counter)counter.hidden=false;
}
function kdsAbrirCategorias() {
    const panel=document.getElementById('kds-category-panel');
    if(!panel) return;
    if(!panel.hidden) {kdsFecharCategorias();return;}
    KDS.draftCategories=new Set(kdsCategoriasSelecionadas());
    const error=document.getElementById('kds-category-error');
    if(error)error.hidden=true;
    const options=document.getElementById('kds-category-options');
    if(options) options.innerHTML=kdsCategoriasDisponiveis().map(name=>{
        const checked=KDS.draftCategories.has(name);
        return `<label class="kds-category-option ${checked?'selected':''}"><input type="checkbox" value="${kdsEscape(name)}" ${checked?'checked':''} onchange="kdsAlterarCategoria(this.value,this.checked,this)"><span class="kds-category-name">${kdsEscape(name)}</span><span class="kds-category-check" aria-hidden="true">${checked?'✓':'+'}</span></label>`;
    }).join('') || '<p>Cadastre categorias no cardápio para filtrar os produtos.</p>';
    panel.hidden=false;
    document.getElementById('kds-category-button')?.setAttribute('aria-expanded','true');
}
function kdsAlterarCategoria(name,checked,input) {
    if(checked)KDS.draftCategories.add(name);else KDS.draftCategories.delete(name);
    const error=document.getElementById('kds-category-error');
    if(error && KDS.draftCategories.size) error.hidden=true;
    input?.closest('.kds-category-option')?.classList.toggle('selected',checked);
    const marker=input?.closest('.kds-category-option')?.querySelector('.kds-category-check');
    if(marker)marker.textContent=checked?'✓':'+';
}
function kdsFecharCategorias() {
    const panel=document.getElementById('kds-category-panel');
    if(panel)panel.hidden=true;
    document.getElementById('kds-category-button')?.setAttribute('aria-expanded','false');
}
function kdsConfirmarCategorias() {
    if(!KDS.draftCategories.size) {
        const error=document.getElementById('kds-category-error');
        if(error)error.hidden=false;
        return false;
    }
    KDS.categorySelections[KDS.mode]=[...KDS.draftCategories];
    try {localStorage.setItem('partigiana_kds_categorias_'+KDS.mode+'_v11',JSON.stringify(KDS.categorySelections[KDS.mode]));}catch(e){}
    if(typeof hubKdsApplyManualFilter==='function')hubKdsApplyManualFilter();
    KDS.station='selecionadas';
    KDS.page=0;
    kdsFecharCategorias();
    kdsRenderizar();
    return true;
}

function kdsNumero(v) { return Number(v||0).toLocaleString('pt-BR'); }
function kdsTempo(startTime) {
    const epoch = new Date(startTime).getTime();
    if (!Number.isFinite(epoch)) return '—';
    const min = Math.max(0, Math.floor((Date.now() - epoch)/60000));
    return min >= 60 ? `${Math.floor(min/60)}h ${String(min%60).padStart(2,'0')}min` : `${min}min`;
}
function kdsId(item) { return item.cartId; }
function kdsEstacaoItem(item) {
    // Herda a mesma configuração de categorias utilizada pela impressão na cozinha.
    const categories = Array.isArray(item.categories) ? item.categories : [];
    if (!categories.length) return 'cozinha'; // categoria antiga/desconhecida: não esconder pedidos
    const flags = categories.map(name => db.categories.find(c => c.name === name)?.imprimeCozinha);
    if (flags.some(x=>x===true)) return 'cozinha';
    if (flags.every(x=>x===false)) return 'bebidas';
    return 'cozinha';
}
function kdsPertence(item,station=KDS.station) {
    if(station==='todos') return true;
    if(station==='selecionadas') {
        const selected=kdsCategoriasSelecionadas();
        const cats=kdsCategoriasItem(item);
        // Evita sumir com pedidos antigos sem categorias no KDS da cozinha.
        if(!cats.length) return KDS.mode==='cozinha';
        return cats.some(name=>selected.includes(name));
    }
    return kdsEstacaoItem(item)===station;
}
function kdsItens(order,station=KDS.station) {
    return (order.items||[]).filter(item=>!item.cancelled && !item.completed && kdsPertence(item,station));
}
function kdsPedidos(station=KDS.station) {
    return (db.orders||[]).filter(order=>!order.archived && order.status==='preparo' && kdsItens(order,station).length>0)
        .sort((a,b)=>(new Date(a.date).getTime()||0) - (new Date(b.date).getTime()||0));
}
function kdsPronto(item) { return !!item.kitchenReady; }
function kdsEstadoPedido(order,station=KDS.station) {
    const items=kdsItens(order,station);
    if (!items.length) return 'vazio';
    return items.every(kdsPronto) ? 'prontos' : 'pendentes';
}
function kdsDefinirEstacao(station) {
    if (!['cozinha','bebidas','todos'].includes(station)) return;
    KDS.station=station; // compatibilidade com testes legados
    KDS.page=0;
    kdsRenderizar();
}
function kdsDefinirAba(tab) {
    if (!['pendentes','prontos'].includes(tab)) return;
    KDS.view=tab;
    KDS.page=0;
    kdsRenderizar();
}
function kdsMarcarItem(orderId,cartId,ready) {
    const order=db.orders.find(o=>o.id===orderId && !o.archived && o.status==='preparo');
    const item=order?.items.find(i=>i.cartId===cartId && !i.cancelled && !i.completed);
    if (!item) return false;
    if (!!item.kitchenReady===!!ready) return false;
    item.kitchenReady=!!ready;
    item.kitchenReadyAt=ready ? new Date().toISOString() : null;
    item.kitchenReadyBy=ready ? (currentSessionUser?.id??null) : null;
    saveDb();
    kdsRenderizar();
    if (typeof renderKanban==='function' && document.getElementById('kanban-view')?.classList.contains('active')) renderKanban();
    return true;
}
function kdsMarcarPedido(orderId,ready) {
    const order=db.orders.find(o=>o.id===orderId && !o.archived && o.status==='preparo');
    if (!order) return false;
    const items=kdsItens(order);
    if (!items.length) return false;
    const now=new Date().toISOString();
    let changed=false;
    for (const item of items) {
        if (!!item.kitchenReady===!!ready) continue;
        item.kitchenReady=!!ready;
        item.kitchenReadyAt=ready ? now : null;
        item.kitchenReadyBy=ready ? (currentSessionUser?.id??null) : null;
        changed=true;
    }
    if (!changed) return false;
    saveDb();
    kdsRenderizar();
    return true;
}
function kdsKanbanInfo(order) {
    if (!order || order.status!=='preparo') return '';
    const items=(order.items||[]).filter(i=>!i.cancelled && !i.completed && kdsEstacaoItem(i)==='cozinha');
    if (!items.length) return '';
    const ready=items.filter(i=>i.kitchenReady).length;
    if (ready===0) return '';
    if (ready===items.length) return '<div class="kds-kanban-ready">✅ Cozinha: tudo pronto para retirada</div>';
    return `<div class="kds-kanban-progress">🍕 Cozinha: ${ready}/${items.length} itens prontos</div>`;
}
function kdsSeloTempo(order) {
    const epoch=new Date(order.date).getTime();
    const elapsed=Number.isFinite(epoch)?Math.max(0,(Date.now()-epoch)/60000):0;
    const level=elapsed>=KDS.criticalMinutes?'critico':elapsed>=KDS.warnMinutes?'atencao':'normal';
    return `<span class="kds-clock kds-clock-${level}" data-kds-epoch="${Number.isFinite(epoch)?epoch:0}">⏱ ${kdsTempo(order.date)}</span>`;
}
function kdsCard(order) {
    const items=kdsItens(order);
    const done=items.filter(kdsPronto).length;
    const allReady=done===items.length;
    const rendered=items.map(item=>{
        const ready=!!item.kitchenReady;
        const mods=(item.modifiers||[]).map(mod=>{
            const sign=mod.type==='exclusion'?'−':'+';
            return `<span class="kds-mod ${mod.type==='exclusion'?'kds-mod-minus':'kds-mod-plus'}">${sign} ${kdsEscape(mod.name)}</span>`;
        }).join('');
        const obs=item.obs ? `<div class="kds-obs">📝 ${kdsEscape(item.obs)}</div>`:'';
        return `<div class="kds-item ${ready?'kds-item-ready':''}">
            <div class="kds-item-head"><div class="kds-item-name">${kdsEscape(item.name)}</div>
            <label class="kds-check-label" title="${ready?'Desmarcar item pronto':'Marcar item como pronto'}">
                <input type="checkbox" class="kds-ready-checkbox" data-kds-action="item" data-order="${order.id}" data-item="${kdsId(item)}" data-ready="${ready?'false':'true'}" ${ready?'checked':''} aria-label="${ready?'Reabrir':'Marcar pronto'}: ${kdsEscape(item.name)}">
                <span>Pronto</span>
            </label></div>
            ${mods?`<div class="kds-mods">${mods}</div>`:''}${obs}
        </div>`;
    }).join('');
    const orderId=String(order.id).slice(-4);
    return `<article class="kds-card ${allReady?'kds-card-ready':''}" data-kds-order-id="${kdsEscape(order.id)}">
        <div class="kds-card-top">
            <div><span class="kds-ticket">#${kdsEscape(orderId)}</span><span class="kds-table">${kdsEscape(order.table||'Sem mesa')}</span></div>
            ${kdsSeloTempo(order)}
        </div>
        <div class="kds-client">${kdsEscape(order.client==='Não Informado'?'Cliente não informado':order.client||'Cliente não informado')}</div>
        <div class="kds-card-meta"><span>${done}/${items.length} prontos</span><span>${new Date(order.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></div>
        <div class="kds-items" tabindex="0" aria-label="Itens do pedido ${kdsEscape(orderId)}. Role para ver todos os itens.">${rendered}</div>
        <button type="button" class="kds-all-btn ${allReady?'kds-all-undo':''}" data-kds-action="all" data-order="${order.id}" data-ready="${allReady?'false':'true'}">${allReady?'↩ Reabrir todos os itens':'✓ Marcar todos como prontos'}</button>
    </article>`;
}
// Adapta colunas apenas se a largura do dispositivo não comportar a grade desejada.
function kdsColunasEfetivas(cfg, width) {
    if (!Number.isFinite(width) || width <= 0) return cfg.columns; // testes sem layout real
    return Math.max(1, Math.min(cfg.columns, Math.floor((width + 10) / 207)));
}
function kdsMudarPagina(direction) {
    if (!Number.isInteger(direction) || Math.abs(direction)!==1) return;
    KDS.page=Math.max(0,KDS.page+direction);
    kdsRenderizar();
}
function kdsRenderizar() {
    const root=document.getElementById('kds-content');
    if(!root || !document.getElementById('kds-view')?.classList.contains('active')) return;
    // Mantém a posição dos itens durante alterações na mesma página.
    const scrollPositions = new Map(Array.from(root.querySelectorAll?.('.kds-card')||[]).map(card=>[
        card.dataset.kdsOrderId, card.querySelector('.kds-items')?.scrollTop || 0
    ]));
    const cfg = kdsPreferencias();
    // Reserva largura das setas nas medições para evitar oscilar o número de colunas entre páginas.
    const stageWidth=Number(root.parentElement?.clientWidth) || Number(root.clientWidth) || Number(window.innerWidth)-32;
    const columns=kdsColunasEfetivas(cfg, stageWidth - 84);
    const pageSize=columns*cfg.rows;
    root.style?.setProperty('--kds-item-font-size', cfg.fontSize + 'px');
    root.style?.setProperty('--kds-visible-items', String(cfg.visibleItems));
    root.style?.setProperty('--kds-columns', String(columns));
    root.style?.setProperty('--kds-rows', String(cfg.rows));
    const orders=kdsPedidos();
    const pending=orders.filter(order=>kdsEstadoPedido(order)==='pendentes');
    const ready=orders.filter(order=>kdsEstadoPedido(order)==='prontos');
    const subset=KDS.view==='pendentes'?pending:ready;
    const totalPages=Math.max(1,Math.ceil(subset.length/pageSize));
    KDS.page=Math.max(0,Math.min(KDS.page,totalPages-1));
    const visibleOrders=subset.slice(KDS.page*pageSize,(KDS.page+1)*pageSize);
    const totalItems=orders.reduce((s,o)=>s+kdsItens(o).length,0);
    document.getElementById('kds-pending-count').textContent=pending.length;
    document.getElementById('kds-ready-count').textContent=ready.length;
    document.getElementById('kds-total-count').textContent=totalItems;
    const pizzaCount=document.getElementById('kds-pizza-count');
    if(pizzaCount)pizzaCount.textContent=kdsContarPizzasPendentes();
    kdsAtualizarControleCategorias();
    document.querySelectorAll('[data-kds-tab]').forEach(b=>b.classList.toggle('active',b.dataset.kdsTab===KDS.view));
    const summary=document.getElementById('kds-page-summary');
    if(summary) summary.textContent=`Página ${KDS.page+1} de ${totalPages} • ${subset.length} ${subset.length===1?'pedido':'pedidos'}`;
    const prev=document.getElementById('kds-page-prev');
    const next=document.getElementById('kds-page-next');
    if(prev) prev.hidden=KDS.page===0;
    if(next) next.hidden=KDS.page>=totalPages-1;
    const names={cozinha:'cozinha',bebidas:'bebidas',todos:'todas as estações',selecionadas:KDS.mode==='bar'?'bar':'categorias selecionadas'};
    root.innerHTML=visibleOrders.length
        ? visibleOrders.map(kdsCard).join('')
        : `<div class="kds-empty"><span class="kds-empty-icon">${KDS.view==='pendentes'?'👨‍🍳':'✅'}</span><strong>${KDS.view==='pendentes'?'Nenhum pedido pendente':'Nenhum pedido pronto aguardando retirada'}</strong><p>Os pedidos de ${names[KDS.station]} aparecerão aqui automaticamente.</p></div>`;
    root.querySelectorAll?.('.kds-card').forEach(card=>{
        const previous = scrollPositions.get(card.dataset.kdsOrderId);
        if (previous != null) card.querySelector('.kds-items').scrollTop = previous;
    });
    kdsAtualizarRelogios();
}
function kdsAtualizarRelogios() {
    if (!document.getElementById('kds-view')?.classList.contains('active')) return;
    document.querySelectorAll('[data-kds-epoch]').forEach(el=>{
        const epoch=Number(el.dataset.kdsEpoch);
        if (!epoch) {el.textContent='⏱ —';return;}
        const elapsed=Math.max(0,Math.floor((Date.now()-epoch)/60000));
        const level=elapsed>=KDS.criticalMinutes?'critico':elapsed>=KDS.warnMinutes?'atencao':'normal';
        el.textContent='⏱ '+kdsTempo(epoch);
        el.className='kds-clock kds-clock-'+level;
    });
}
function kdsTelaCheia() {
    const el=document.getElementById('kds-view');
    if (!document.fullscreenElement && el?.requestFullscreen) el.requestFullscreen().catch(()=>{});
    else if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
}
function kdsInit() {
    if(KDS.initialized) return;
    KDS.initialized=true;
    document.getElementById('kds-view')?.addEventListener('click',event=>{
        const button=event.target.closest('[data-kds-action]');
        if(!button)return;
        const id=Number(button.dataset.order),ready=button.dataset.ready==='true';
        if(button.dataset.kdsAction==='item') kdsMarcarItem(id,Number(button.dataset.item),ready);
        if(button.dataset.kdsAction==='all') kdsMarcarPedido(id,ready);
    });
    // Abas do MESMO navegador/perfil; não representa sincronização pela internet.
    window.addEventListener('storage',event=>{
        if(event.key!=='pdv_db_demo_20261007' || !event.newValue) return;
        try {
            const data=JSON.parse(event.newValue);
            if (!data || !Array.isArray(data.orders)) return;
            db=data;
            kdsRenderizar();
            if (typeof salaoRenderizar === 'function') salaoRenderizar();
            if(document.getElementById('kanban-view')?.classList.contains('active'))renderKanban();
        }catch(err){console.warn('KDS: falha em ler alteração de outra aba',err);}
    });
    window.addEventListener('resize',()=>{
        if(document.getElementById('kds-view')?.classList.contains('active')) kdsRenderizar();
    });
    document.addEventListener?.('pointerdown', event=>{
        if(!document.getElementById('kds-categories-wrapper')?.contains(event.target)) kdsFecharCategorias();
    });
    document.addEventListener?.('keydown', event=>{if(event.key==='Escape')kdsFecharCategorias();});
    KDS.clock=setInterval(kdsAtualizarRelogios,1000);
}
kdsInit();
