/* Partigiana HUB v1.0 — KDS DO SALÃO (ambiente local)
   Este painel marca item.completed (entrega ao cliente); kitchenReady continua
   independente e pertence à cozinha. Não movimenta estoque novamente.
*/
const SALAO = { filter: 'todos', page: 0, timer: null, initialized: false };

function salaoPreferencias() {
    const c=(typeof hubKdsConfigForMode==='function'?hubKdsConfigForMode('delivery'):null)||db?.salaoConfig||{};
    const num=(v,defaultValue,min,max)=>Math.max(min,Math.min(max,Math.round(Number(v)||defaultValue)));
    return {
        fontSize:num(c.fontSize,20,14,28),
        visibleItems:num(c.visibleItems,3,1,10),
        columns:num(c.columns,5,1,8),
        rows:num(c.rows,2,1,4)
    };
}
function salaoRenderizarConfiguracoes(area) {
    const cfg=salaoPreferencias();
    const choices=(id,values,current,unit='')=>`<select id="${id}">${values.map(n=>`<option value="${n}" ${current===n?'selected':''}>${n}${unit}</option>`).join('')}</select>`;
    area.innerHTML=`<div class="kds-config-card">
      <h3>🛎️ Visualização e entregas no salão</h3>
      <p>Estas configurações são <strong>independentes</strong> do KDS da cozinha. O painel mostra as comandas em andamento e o garçom marca cada item como <strong>Entregue</strong>. Quando todos os itens ativos forem entregues, a comanda muda automaticamente para Entregues no Kanban.</p>
      <div class="kds-config-grid">
        <div class="form-group"><label for="salao-setting-font">Tamanho da letra dos itens</label>
        ${choices('salao-setting-font',[14,16,18,20,22,24,26,28],cfg.fontSize,' px')}</div>
        <div class="form-group"><label for="salao-setting-visible">Itens visíveis desejados antes da rolagem</label>
        ${choices('salao-setting-visible',Array.from({length:10},(_,i)=>i+1),cfg.visibleItems)}</div>
        <div class="form-group"><label for="salao-setting-columns">Cartões na horizontal</label>
        ${choices('salao-setting-columns',Array.from({length:8},(_,i)=>i+1),cfg.columns)}</div>
        <div class="form-group"><label for="salao-setting-rows">Cartões na vertical</label>
        ${choices('salao-setting-rows',[1,2,3,4],cfg.rows)}</div>
      </div>
      <button type="button" class="btn-success" onclick="salaoSalvarConfiguracoes()">Salvar configurações do salão</button>
      <p class="kds-config-tip">Abra o botão 🛎️ KDS Salão, ao lado do Kanban, para conferir a grade. Não altera as configurações da cozinha.</p>
    </div>`;
}
function salaoSalvarConfiguracoes() {
    const fields=['font','visible','columns','rows'].map(key=>Number(document.getElementById('salao-setting-'+key)?.value));
    const [fontSize,visibleItems,columns,rows]=fields;
    if(![14,16,18,20,22,24,26,28].includes(fontSize) || !Number.isInteger(visibleItems)||visibleItems<1||visibleItems>10 || !Number.isInteger(columns)||columns<1||columns>8||!Number.isInteger(rows)||rows<1||rows>4){
        showCustomAlert('Confira os valores escolhidos para o KDS do Salão.');return false;
    }
    db.salaoConfig={fontSize,visibleItems,columns,rows};
    saveDb();
    salaoRenderizar();
    showCustomAlert('Configurações do KDS do Salão salvas.','Salão atualizado');
    return true;
}
function salaoItensValidos(order) {return (order.items||[]).filter(i=>!i.cancelled);}
function salaoItensVisiveis(order){return typeof hubKdsDeliveryItems==='function'?hubKdsDeliveryItems(order):salaoItensValidos(order);}
function salaoPedidos() {
    return (db.orders||[]).filter(o=>!o.archived && o.status==='preparo' && salaoItensVisiveis(o).length>0)
        .sort((a,b)=>(new Date(a.date).getTime()||0)-(new Date(b.date).getTime()||0));
}
function salaoFiltrar(filter) {
    if(!['todos','prontos'].includes(filter))return;
    SALAO.filter=filter;SALAO.page=0;salaoRenderizar();
}
function salaoMudarPagina(direction){
    if(!Number.isInteger(direction)||Math.abs(direction)!==1)return;
    SALAO.page=Math.max(0,SALAO.page+direction);salaoRenderizar();
}
function salaoMarcarItem(orderId,cartId,delivered,confirmed=false) {
    const order=db.orders.find(o=>o.id===orderId && !o.archived && o.status==='preparo');
    const item=order?.items.find(i=>i.cartId===cartId && !i.cancelled);
    if(!item || !!item.completed===!!delivered)return false;
    if(delivered&&!item.kitchenReady&&!confirmed){
       showCustomConfirm('Este produto ainda não foi marcado como pronto. Confirma que já foi entregue ao cliente?',()=>salaoMarcarItem(orderId,cartId,delivered,true),'Entrega antes de pronto');
       return false;
    }
    if(delivered&&!item.kitchenReady){item.deliveredBeforeReadyAt=new Date().toISOString();item.deliveredBeforeReadyBy=currentSessionUser?.id??null;}
    // Estes campos representam ENTREGA, não conclusão do preparo.
    item.completed=!!delivered;
    item.deliveredAt=delivered?new Date().toISOString():null;
    item.deliveredBy=delivered?(currentSessionUser?.id??null):null;
    const allDelivered=salaoItensValidos(order).every(i=>i.completed);
    if(allDelivered){order.status='entregue';order.lastStatusChange=Date.now();}
    saveDb();
    // Aguarda o fim do evento do checkbox antes de reconstruir os cartões.
    // Ao remover a comanda imediatamente, um clique poderia alcançar a linha abaixo.
    // Pequeno atraso impede que o desaparecimento do último cartão receba
    // o restante do gesto de clique em um cartão vizinho.
    clearTimeout(SALAO.pendingRender);
    SALAO.pendingRender=setTimeout(()=>salaoRenderizar(),220);
    if(document.getElementById('kanban-view')?.classList.contains('active'))renderKanban();
    return true;
}
function salaoEntregarRestantes(orderId){
    const order=db.orders.find(o=>o.id===orderId&&!o.archived&&o.status==='preparo');
    if(!order)return false;
    const pendentes=salaoItensVisiveis(order).filter(i=>!i.completed);
    if(!pendentes.length)return false;
    const notReady=pendentes.filter(i=>!i.kitchenReady).length;
    showCustomConfirm(`Confirmar a entrega dos ${pendentes.length} ${pendentes.length===1?'item restante':'itens restantes'} de ${order.table||'esta comanda'}?${notReady?' Atenção: '+notReady+' ainda não constam como prontos.':''}`,()=>{
        // Validar de novo, pois a confirmação pode ocorrer depois de outras mudanças.
        const atualizado=db.orders.find(o=>o.id===orderId&&!o.archived&&o.status==='preparo');
        if(!atualizado){showCustomAlert('A comanda não está mais em preparo.');return;}
        const ativos=salaoItensValidos(atualizado);
        const restante=salaoItensVisiveis(atualizado).filter(i=>!i.completed);
        if(!restante.length)return;
        const now=new Date().toISOString();
        restante.forEach(i=>{i.completed=true;i.deliveredAt=now;i.deliveredBy=currentSessionUser?.id??null;if(!i.kitchenReady){i.deliveredBeforeReadyAt=now;i.deliveredBeforeReadyBy=currentSessionUser?.id??null;}});
        if(ativos.every(i=>i.completed)){atualizado.status='entregue';atualizado.lastStatusChange=Date.now();}
        saveDb();salaoRenderizar();
    },'Confirmar entrega');
    return true;
}
function salaoCard(order){
    const itens=salaoItensVisiveis(order);
    const entregues=itens.filter(i=>i.completed).length;
    const rows=itens.map(item=>{
        const entregue=!!item.completed;
        const pronto=!!item.kitchenReady;
        const label=entregue?'✓ Entregue':pronto?'✓ Pronto na cozinha':'⏳ Em preparo';
        const mods=(item.modifiers||[]).map(m=>`<span class="kds-mod ${m.type==='exclusion'?'kds-mod-minus':'kds-mod-plus'}">${m.type==='exclusion'?'−':'+'} ${kdsEscape(m.name)}</span>`).join('');
        return `<div class="kds-item salao-item ${entregue?'salao-item-delivered':''}">
          <div class="kds-item-head">
            <div class="salao-item-description"><div class="kds-item-name">${kdsEscape(item.name)}</div>
              <span class="salao-readiness ${entregue?'salao-done':pronto?'salao-ready':'salao-waiting'}">${label}</span></div>
            <div class="kds-check-label" title="${entregue?'Desfazer a entrega':'Marcar como entregue'}">
              <input type="checkbox" class="salao-delivery-checkbox" data-salao-action="item" data-order="${kdsEscape(order.id)}" data-item="${kdsEscape(item.cartId)}" data-delivered="${!entregue}" ${entregue?'checked':''} aria-label="${entregue?'Desfazer entrega':'Entregar'}: ${kdsEscape(item.name)}">
              <span>Entregue</span></div>
          </div>
          ${mods?`<div class="kds-mods">${mods}</div>`:''}
          ${item.obs?`<div class="kds-obs">📝 ${kdsEscape(item.obs)}</div>`:''}
        </div>`;
    }).join('');
    const id=String(order.id).slice(-4);
    const time=new Date(order.date);
    const hour=Number.isNaN(time.getTime())?'—':time.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return `<article class="kds-card salao-card" data-salao-order-id="${kdsEscape(order.id)}">
        <div class="kds-card-top"><div><span class="kds-ticket">#${kdsEscape(id)}</span><span class="kds-table">${kdsEscape(order.table||'Sem mesa')}</span></div>${kdsSeloTempo(order)}</div>
        <div class="kds-client">${kdsEscape(order.client==='Não Informado'?'Cliente não informado':order.client||'Cliente não informado')}</div>
        <div class="kds-card-meta"><span>${entregues}/${itens.length} entregues</span><span>${hour}</span></div>
        <div class="kds-items" tabindex="0" aria-label="Itens para entrega da comanda ${kdsEscape(id)}">${rows}</div>
        <button type="button" class="kds-all-btn salao-all-btn" data-salao-action="all" data-order="${kdsEscape(order.id)}">✓ Entregar todos os itens restantes</button>
    </article>`;
}
function salaoRenderizar(){
    const view=document.getElementById('salao-view');
    const root=document.getElementById('salao-content');
    if(!view?.classList.contains('active')||!root)return;
    const saved=new Map(Array.from(root.querySelectorAll('.salao-card')).map(card=>[card.dataset.salaoOrderId,card.querySelector('.kds-items')?.scrollTop||0]));
    const cfg=salaoPreferencias();
    const stageWidth=Number(root.parentElement?.clientWidth)||Number(root.clientWidth)||Number(window.innerWidth)-32;
    const columns=kdsColunasEfetivas(cfg,stageWidth-84);
    const pagesize=columns*cfg.rows;
    root.style.setProperty('--kds-columns',String(columns));
    root.style.setProperty('--kds-rows',String(cfg.rows));
    root.style.setProperty('--kds-item-font-size',cfg.fontSize+'px');
    root.style.setProperty('--kds-visible-items',String(cfg.visibleItems));
    const orders=salaoPedidos();
    const filtered=SALAO.filter==='prontos' ? orders.filter(o=>salaoItensVisiveis(o).some(i=>i.kitchenReady&&!i.completed)) : orders;
    const totalPages=Math.max(1,Math.ceil(filtered.length/pagesize));
    SALAO.page=Math.max(0,Math.min(SALAO.page,totalPages-1));
    const displayed=filtered.slice(SALAO.page*pagesize,(SALAO.page+1)*pagesize);
    const activeItems=orders.flatMap(salaoItensVisiveis).filter(i=>!i.completed);
    document.getElementById('salao-pending-count').textContent=orders.length;
    document.getElementById('salao-items-count').textContent=activeItems.length;
    document.getElementById('salao-ready-count').textContent=activeItems.filter(i=>i.kitchenReady).length;
    document.querySelectorAll('[data-salao-filter]').forEach(b=>b.classList.toggle('active',b.dataset.salaoFilter===SALAO.filter));
    document.getElementById('salao-page-summary').textContent=`Página ${SALAO.page+1} de ${totalPages} • ${filtered.length} ${filtered.length===1?'pedido':'pedidos'}`;
    document.getElementById('salao-page-prev').hidden=SALAO.page===0;
    document.getElementById('salao-page-next').hidden=SALAO.page===totalPages-1;
    root.innerHTML=displayed.length?displayed.map(salaoCard).join(''):
        `<div class="kds-empty"><span class="kds-empty-icon">🛎️</span><strong>${SALAO.filter==='prontos'?'Nenhum item pronto para retirada':'Nenhum pedido aguardando entrega'}</strong><p>As comandas ativas aparecem aqui. Entregar tudo move o pedido para Entregues no Kanban.</p></div>`;
    root.querySelectorAll('.salao-card').forEach(card=>{
        const previous=saved.get(card.dataset.salaoOrderId);
        if(previous!=null)card.querySelector('.kds-items').scrollTop=previous;
    });
    salaoAtualizarRelogios();
}
function salaoAtualizarRelogios(){
    if(!document.getElementById('salao-view')?.classList.contains('active'))return;
    document.querySelectorAll('#salao-view [data-kds-epoch]').forEach(el=>{
        const epoch=Number(el.dataset.kdsEpoch);
        if(!epoch)return;
        const elapsed=Math.max(0,(Date.now()-epoch)/60000);
        const level=elapsed>=KDS.criticalMinutes?'critico':elapsed>=KDS.warnMinutes?'atencao':'normal';
        el.className=`kds-clock kds-clock-${level}`;
        el.textContent='⏱ '+kdsTempo(epoch);
    });
}
function salaoTelaCheia(){
    const view=document.getElementById('salao-view');
    if(!document.fullscreenElement) view?.requestFullscreen?.().catch(()=>showCustomAlert('Não foi possível ativar a tela cheia.'));
    else if(document.fullscreenElement===view) document.exitFullscreen?.();
}
function salaoInit(){
    if(SALAO.initialized)return;
    SALAO.initialized=true;
    document.getElementById('salao-view')?.addEventListener('click',event=>{
        const trigger=event.target.closest('[data-salao-action="all"]');
        if(trigger)salaoEntregarRestantes(Number(trigger.dataset.order));
    });
    document.getElementById('salao-view')?.addEventListener('change',event=>{
        const checkbox=event.target.closest('[data-salao-action="item"]');
        if(!checkbox)return;
        const ok=salaoMarcarItem(Number(checkbox.dataset.order),Number(checkbox.dataset.item),checkbox.checked);
        if(!ok)checkbox.checked=!checkbox.checked;
    });
    window.addEventListener('resize',()=>salaoRenderizar());
    SALAO.timer=setInterval(salaoAtualizarRelogios,1000);
}
salaoInit();
