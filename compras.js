/* Partigiana HUB — alertas e lista de compras v0.3 (DEMO LOCAL)
 * Estão separados o nível mínimo (urgência) e o estoque ideal (reposição).
 * Atenção: entre o mínimo e 50% do ideal; Crítico: saldo <= mínimo.
 * Uma entrada de mercadoria é o único passo que altera o estoque: marcar
 * 'no carrinho' NÃO representa compra nem entrada física.
 */

let comprasFiltroEstoque = 'todos';

function comprasGarantirEstrutura() {
    if (!db.stockShoppingState || typeof db.stockShoppingState !== 'object' || Array.isArray(db.stockShoppingState)) db.stockShoppingState={};
    if (!Array.isArray(db.stockShoppingExtras)) db.stockShoppingExtras=[];
    if (!Array.isArray(db.stockIngredients)) return;
    for (const i of db.stockIngredients) {
        const minimo=Number(i.minQty)||0;
        // Retrocompatibilidade v0.1/v0.2: 4x o mínimo deixa margem para aviso em 50%.
        if (!Number.isFinite(Number(i.targetQty)) || Number(i.targetQty)<0 || i.targetQty===undefined || i.targetQty===null)
            i.targetQty = minimo>0 ? estoqueArred(minimo*4) : 0;
    }
}

function comprasSituacao(item) {
    const saldo=Number(item?.qty)||0, minimo=Number(item?.minQty)||0, ideal=Number(item?.targetQty)||0;
    // Sem configuração, não cria alertas de compras não solicitadas.
    if (minimo===0 && ideal===0) return 'sem_config';
    if (saldo<=minimo) return 'critico';
    if (ideal>0 && saldo<=ideal/2) return 'atencao';
    return 'ok';
}

function comprasQuantidadeSugerida(item) {
    const saldo=Number(item.qty)||0, ideal=Number(item.targetQty)||0;
    return estoqueArred(Math.max(0,ideal-saldo));
}

function comprasListaAutomatica() {
    return (db.stockIngredients||[]).filter(i=>i.kind!=='prepared' && comprasSituacao(i)==='critico' && comprasQuantidadeSugerida(i)>0)
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
function comprasListaProducao() {
    return (db.stockIngredients||[]).filter(i=>i.kind==='prepared' && comprasSituacao(i)==='critico' && comprasQuantidadeSugerida(i)>0)
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}

function comprasResumo() {
    const counts={critico:0,atencao:0,ok:0,sem_config:0};
    for(const i of db.stockIngredients||[]) counts[comprasSituacao(i)]++;
    return counts;
}

function comprasCor(status){return ({critico:'var(--danger)',atencao:'#ffbf47',ok:'var(--primary)',sem_config:'#aaa'})[status];}
function comprasEtiqueta(status){return ({critico:'🔴 MÍNIMO ATINGIDO',atencao:'🟡 METADE DO IDEAL',ok:'🟢 NORMAL',sem_config:'⚪ SEM ALERTA'})[status];}

function comprasStatusHTML(item) {
    const s=comprasSituacao(item), color=comprasCor(s);
    return `<span class="stock-alert-pill" style="color:${color};border:1px solid ${color};background:rgba(0,0,0,.16);padding:4px 7px;border-radius:9px;font-size:.73em;white-space:nowrap">${comprasEtiqueta(s)}</span>`;
}

function comprasDefinirFiltros(filtro) {
    if(!['todos','critico','atencao','ok','sem_config'].includes(filtro))return;
    comprasFiltroEstoque=filtro;
    estoqueRenderizar();
}

function comprasRenderizarPainel() {
    const c=comprasResumo();
    return `<div class="stock-indicators" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:14px 0">
       <button onclick="comprasDefinirFiltros('todos')" class="stock-metric" style="border:1px solid var(--border);background:var(--surface);border-radius:10px;text-align:left;padding:15px;color:var(--text);cursor:pointer"><span style="color:#aaa">Total de itens</span><strong style="display:block;font-size:1.7em">${(db.stockIngredients||[]).length}</strong></button>
       <button onclick="comprasDefinirFiltros('atencao')" class="stock-metric" style="border:1px solid #ffbf47;background:var(--surface);border-radius:10px;text-align:left;padding:15px;color:var(--text);cursor:pointer"><span style="color:#ffbf47">🟡 Atenção (50%)</span><strong style="display:block;font-size:1.7em">${c.atencao}</strong></button>
       <button onclick="comprasDefinirFiltros('critico')" class="stock-metric" style="border:1px solid var(--danger);background:var(--surface);border-radius:10px;text-align:left;padding:15px;color:var(--text);cursor:pointer"><span style="color:var(--danger)">🔴 Mínimo atingido</span><strong style="display:block;font-size:1.7em">${c.critico}</strong></button>
       <button onclick="estoqueMudarAba('compras')" class="stock-metric" style="border:1px solid var(--primary);background:var(--surface);border-radius:10px;text-align:left;padding:15px;color:var(--text);cursor:pointer"><span style="color:var(--primary)">🛒 Itens para comprar</span><strong style="display:block;font-size:1.7em">${comprasListaAutomatica().length}</strong></button>
    </div>
    <p style="color:#aaa;font-size:.83em;margin:0 0 12px">🟡 Atenção: saldo ≤ metade do <b>estoque ideal</b>, mas acima do mínimo. 🔴 Urgente: saldo ≤ mínimo. Clique nos indicadores para filtrar.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px">${[['todos','Todos'],['critico','🔴 Mínimo'],['atencao','🟡 Atenção'],['ok','🟢 Normal'],['sem_config','Sem alerta']].map(([id,label])=>`<button class="${comprasFiltroEstoque===id?'btn-success':'btn-home'}" style="padding:7px 10px;font-size:12px" onclick="comprasDefinirFiltros('${id}')">${label}</button>`).join('')}</div>`;
}

function comprasEstado(id) {
    comprasGarantirEstrutura();
    return db.stockShoppingState[String(id)] || {};
}

function comprasGuardarEstado(id,novos) {
    comprasGarantirEstrutura();
    db.stockShoppingState[String(id)]={...comprasEstado(id),...novos};
    saveDb();
}

function comprasQuantidadeEscolhida(item) {
    const estado=comprasEstado(item.id);
    // Quantidade personalizada continua válida enquanto o item permanece crítico.
    const selecionada=estado.qtyOverride;
    return selecionada!==undefined && selecionada!==null ? Number(selecionada) : comprasQuantidadeSugerida(item);
}

function comprasValidarQuantidade(item,valor) {
    const qtd=Number(valor);
    return Number.isFinite(qtd) && qtd>0 && Math.abs(estoqueArred(qtd)-qtd)<0.000001 && (item.unit!=='un' || Number.isInteger(qtd));
}

function comprasDefinirQuantidade(id, valor) {
    const item=db.stockIngredients.find(i=>i.id===id);
    if(!item || !comprasValidarQuantidade(item,valor)) {
        showCustomAlert('Informe uma quantidade positiva e válida (unidades devem ser inteiras).');
        comprasRenderizarLista();return false;
    }
    comprasGuardarEstado(id,{qtyOverride:estoqueArred(valor)});
    comprasRenderizarLista();return true;
}

function comprasMarcarCarrinho(id,marcado) {
    if(!db.stockIngredients.some(i=>i.id===id))return;
    comprasGuardarEstado(id,{checked:!!marcado});
    comprasRenderizarLista();
}

function comprasSalvarObservacao(id,nota) {
    if(!db.stockIngredients.some(i=>i.id===id))return;
    comprasGuardarEstado(id,{note:String(nota||'').slice(0,160)});
}

function comprasRestaurarSugestao(id) {
    const anterior=comprasEstado(id);
    delete anterior.qtyOverride;
    db.stockShoppingState[String(id)]=anterior;
    saveDb();comprasRenderizarLista();
}

function comprasEntradaDeMercadoria(ingredientId,qty,extra={}) {
    comprasGarantirEstrutura();
    const item=db.stockIngredients.find(i=>i.id===ingredientId);
    if(!item || item.kind==='prepared')return {ok:false,error:'Este produto não é um insumo comprado. Para pré-preparos, registre a produção.'};
    if(!comprasValidarQuantidade(item,qty))return {ok:false,error:'Quantidade recebida inválida.'};
    if(!estoqueMovimentar(item.id,Number(qty),'Compra recebida', {origin:'shopping-list', note:String(extra.note||'').slice(0,120)}))
        return {ok:false,error:'Não foi possível registrar a entrada.'};
    // Ao recompor o estoque, a lista é recalculada. A marcação do carrinho não gera baixas ou entradas.
    delete db.stockShoppingState[String(item.id)];
    return {ok:true,stock:item.qty};
}

function comprasAbrirEntrada(id) {
    const item=db.stockIngredients.find(i=>i.id===id && i.kind!=='prepared');if(!item)return;
    const q=comprasQuantidadeEscolhida(item);
    estoqueAbrirModal('Receber compra: '+item.name,`
      <p style="color:#aaa;font-size:.9em">Use somente após os ingredientes chegarem à pizzaria. Marcar na lista <b>não</b> altera o estoque.</p>
      <p>Saldo atual: <strong>${estoqueNum(item.qty)} ${estoqueEscape(item.unit)}</strong></p>
      <div class="form-group"><label>Quantidade realmente recebida (${estoqueEscape(item.unit)})</label><input id="compras-recebido" type="number" min="0.001" step="${item.unit==='un'?'1':'0.001'}" value="${q}"></div>
      <div class="form-group"><label>Observação (opcional)</label><input id="compras-observacao" maxlength="120" placeholder="Ex.: Comprado no atacadista"></div>`, 'Confirmar entrada',()=>{
        const qtd=estoqueLerNumero('compras-recebido');
        const res=comprasEntradaDeMercadoria(id,qtd,{note:document.getElementById('compras-observacao').value});
        if(!res.ok)return showCustomAlert(res.error);
        saveDb();closeMiniModal();comprasRenderizarLista();
        showCustomAlert(`Entrada registrada: +${estoqueNum(qtd)} ${item.unit} de ${item.name}. Novo saldo: ${estoqueNum(res.stock)} ${item.unit}.`,'Compra recebida');
    });
}

function comprasAdicionarAvulso(nome,quantidade,unidade) {
    const n=String(nome||'').trim().slice(0,100),q=Number(quantidade);
    if(!n || !Number.isFinite(q) || q<=0 || !['un','g','kg','ml','l'].includes(unidade))return false;
    if(unidade==='un' && !Number.isInteger(q))return false;
    if(Math.abs(estoqueArred(q)-q)>0.000001)return false;
    comprasGarantirEstrutura();
    db.stockShoppingExtras.push({id:estoqueId(),name:n,qty:estoqueArred(q),unit:unidade,checked:false});
    return true;
}
function comprasAbrirAvulso() {
    estoqueAbrirModal('Adicionar à lista',`
      <p style="font-size:.87em;color:#aaa">Itens avulsos não estão vinculados ao estoque. Use para compras eventuais.</p>
      <div class="form-group"><label>Nome</label><input id="lista-avulso-nome" maxlength="100" placeholder="Ex.: Detergente"></div>
      <div class="form-group"><label>Quantidade</label><input id="lista-avulso-qty" type="number" min="0.001" step="0.001" value="1"></div>
      <div class="form-group"><label>Unidade</label><select id="lista-avulso-unit"><option value="un">Unidades</option><option value="kg">kg</option><option value="g">g</option><option value="l">litros</option><option value="ml">ml</option></select></div>`, 'Adicionar',()=>{
        if(!comprasAdicionarAvulso(document.getElementById('lista-avulso-nome').value,
          document.getElementById('lista-avulso-qty').value,document.getElementById('lista-avulso-unit').value))
            return showCustomAlert('Preencha corretamente nome, quantidade e unidade.');
        saveDb();closeMiniModal();comprasRenderizarLista();
    });
}
function comprasMarcarAvulso(id,checked) {
    const item=db.stockShoppingExtras.find(x=>x.id===id);if(!item)return;
    item.checked=!!checked;saveDb();comprasRenderizarLista();
}
function comprasRemoverAvulso(id) {
    db.stockShoppingExtras=db.stockShoppingExtras.filter(x=>x.id!==id);saveDb();comprasRenderizarLista();
}

function comprasTextoLista() {
    const linhas=['LA PARTIGIANA — LISTA DE COMPRAS',new Date().toLocaleDateString('pt-BR'),''];
    const lista=comprasListaAutomatica();
    linhas.push('COMPRAR (ESTOQUE MÍNIMO):');
    if(!lista.length)linhas.push('Nenhum insumo abaixo do mínimo.');
    for(const i of lista){
        const estado=comprasEstado(i.id);
        linhas.push(`${estado.checked?'[x]':'[ ]'} ${i.name}: ${estoqueNum(comprasQuantidadeEscolhida(i))} ${i.unit}`+(estado.note?` — ${estado.note}`:''));
    }
    linhas.push('','OUTROS ITENS:');
    if(!db.stockShoppingExtras.length)linhas.push('Nenhum.');
    for(const x of db.stockShoppingExtras)linhas.push(`${x.checked?'[x]':'[ ]'} ${x.name}: ${estoqueNum(x.qty)} ${x.unit}`);
    linhas.push('','PRODUZIR NA COZINHA (NÃO COMPRAR):');
    const preparar=comprasListaProducao();
    if(!preparar.length)linhas.push('Nenhum.');
    for(const i of preparar)linhas.push(`- ${i.name}: faltam ${estoqueNum(comprasQuantidadeSugerida(i))} ${i.unit} para o ideal`);
    return linhas.join('\n');
}

function comprasExportarTexto() {
    const blob=new Blob([comprasTextoLista()],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='lista-de-compras-partigiana.txt';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
}

async function comprasCopiarTexto() {
    const texto=comprasTextoLista();
    try {
        if(!navigator.clipboard?.writeText)throw Error('Clipboard indisponível');
        await navigator.clipboard.writeText(texto);
        showCustomAlert('Lista copiada. Você pode colá-la no WhatsApp, Notas ou outro aplicativo.','Lista copiada');
    } catch(e) {
        // Se o navegador bloquear o clipboard, gera arquivo .txt para levar ao celular.
        comprasExportarTexto();
        showCustomAlert('Seu navegador não autorizou copiar. Baixei a lista em arquivo .txt.','Lista exportada');
    }
}

function comprasRenderizarLista() {
    comprasGarantirEstrutura();
    const root=document.getElementById('stock-content-area');if(!root)return;
    const lista=comprasListaAutomatica(),preparar=comprasListaProducao(),avulsos=db.stockShoppingExtras;
    const comprados=lista.filter(i=>comprasEstado(i.id).checked).length + avulsos.filter(i=>i.checked).length;
    const total=lista.length+avulsos.length;
    const rows=lista.map(i=>{
        const state=comprasEstado(i.id),qty=comprasQuantidadeEscolhida(i),checked=!!state.checked;
        return `<div class="menu-item-card" style="cursor:default;align-items:stretch;gap:10px;flex-wrap:wrap;${checked?'opacity:.7':''}">
           <label style="display:flex;align-items:center;gap:12px;flex:1;min-width:190px;cursor:pointer">
             <input type="checkbox" ${checked?'checked':''} onchange="comprasMarcarCarrinho(${i.id},this.checked)" style="width:23px;height:23px;accent-color:var(--primary);flex-shrink:0">
             <span class="item-info"><span class="item-title" style="${checked?'text-decoration:line-through':''}">${estoqueEscape(i.name)}</span>
             <small style="color:#aaa">Saldo: ${estoqueNum(i.qty)} ${estoqueEscape(i.unit)} • Mínimo: ${estoqueNum(i.minQty)} • Ideal: ${estoqueNum(i.targetQty)}</small></span>
           </label>
           <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
             <label style="font-size:.8em;color:#aaa">Comprar <input type="number" min="0.001" step="${i.unit==='un'?'1':'0.001'}" value="${qty}" onchange="comprasDefinirQuantidade(${i.id},this.value)" style="width:94px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px"> ${estoqueEscape(i.unit)}</label>
             <button class="btn-home" style="font-size:.8em;padding:8px" title="Voltar à quantidade sugerida" onclick="comprasRestaurarSugestao(${i.id})">↺</button>
             <button class="btn-success" style="padding:9px;font-size:.85em" onclick="comprasAbrirEntrada(${i.id})">+ Dar entrada</button>
           </div>
           <input value="${estoqueEscape(state.note||'')}" maxlength="160" onblur="comprasSalvarObservacao(${i.id},this.value)" placeholder="Observação de compra (opcional)" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:7px;color:var(--text)">
         </div>`;
    }).join('');
    const extrasRows=avulsos.map(x=>`<div class="menu-item-card" style="cursor:default;gap:10px;flex-wrap:wrap;opacity:${x.checked?.7:1}">
         <label style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer"><input type="checkbox" ${x.checked?'checked':''} onchange="comprasMarcarAvulso(${x.id},this.checked)" style="width:22px;height:22px;accent-color:var(--primary)">
         <span style="${x.checked?'text-decoration:line-through':''}">${estoqueEscape(x.name)} — ${estoqueNum(x.qty)} ${estoqueEscape(x.unit)}</span></label>
         <button class="btn-home" style="padding:7px" onclick="comprasRemoverAvulso(${x.id})">Remover</button>
       </div>`).join('');
    const prepRows=preparar.map(i=>`<div class="menu-item-card" style="cursor:default;gap:8px;flex-wrap:wrap">
       <div class="item-info"><span class="item-title">${estoqueEscape(i.name)}</span><small style="color:#aaa">Disponível: ${estoqueNum(i.qty)} ${estoqueEscape(i.unit)} • Objetivo: ${estoqueNum(i.targetQty)} • Faltam ${estoqueNum(comprasQuantidadeSugerida(i))}</small></div>
       <button class="btn-success" style="padding:9px;font-size:.85em" onclick="estoqueMudarAba('preparos')">Abrir produção</button></div>`).join('');
    root.innerHTML=`<div class="menu-top-bar" style="flex-wrap:wrap;gap:10px">
        <div><h3 style="margin:0">🛒 Lista de compras</h3><p style="font-size:.87em;color:#aaa;margin:6px 0 0">${comprados} de ${total} no carrinho • Lista automática: produtos no mínimo ou abaixo dele</p></div>
        <div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn-home" onclick="comprasCopiarTexto()">📋 Copiar lista</button><button class="btn-home" onclick="comprasExportarTexto()">⬇ Exportar .txt</button><button class="btn-success" onclick="comprasAbrirAvulso()">+ Item avulso</button></div></div>
       <p style="font-size:.9em;color:#aaa">A quantidade sugerida recompõe o <b>estoque ideal</b> (ideal − saldo atual). Você pode alterar a quantidade. Marcar a caixa serve só para suas compras no mercado; use <b>Dar entrada</b> quando a mercadoria chegar à pizzaria.</p>
       <h4 style="margin:18px 0 6px;color:var(--danger)">🔴 Comprar agora (${lista.length})</h4>
       <div class="menu-list">${rows||'<p style="color:var(--primary)">Nenhum insumo no nível mínimo. Sua lista automática está vazia.</p>'}</div>
       <h4 style="margin:24px 0 6px">Itens avulsos (${avulsos.length})</h4>
       <div class="menu-list">${extrasRows||'<p style="color:#aaa">Nenhum item extra adicionado.</p>'}</div>
       <h4 style="margin:24px 0 6px;color:#ffbf47">👨‍🍳 Produzir na cozinha (${preparar.length})</h4>
       <p style="color:#aaa;font-size:.84em">Pré-preparos abaixo do mínimo não entram nas compras de mercado: precisam ser produzidos a partir de seus ingredientes.</p>
       <div class="menu-list">${prepRows||'<p style="color:#aaa">Nenhum pré-preparo precisa ser reposto agora.</p>'}</div>`;
}

if(typeof document!=='undefined' && typeof db!=='undefined') {
    comprasGarantirEstrutura();
    saveDb();
}
