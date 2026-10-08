/* Partigiana HUB - Estoque v0.1 (protótipo LOCAL)
   Mantido isolado para facilitar migração posterior para o backend PostgreSQL.
   IMPORTANTE: a persistência desta demonstração não suporta escrita concorrente. */

const estoqueMoeda = n => Number(n || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const estoqueNum = n => Number(n || 0).toLocaleString('pt-BR', {maximumFractionDigits:3});
const estoqueArred = n => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const estoqueEscape = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
let estoqueAba = 'insumos';

function estoqueGarantirEstrutura() {
    if (!Array.isArray(db.stockIngredients)) db.stockIngredients = [];
    if (!Array.isArray(db.stockRecipes)) db.stockRecipes = [];
    if (!Array.isArray(db.stockMovements)) db.stockMovements = [];
    // Dados de demonstração aparecem SOMENTE na primeira abertura do banco local de TESTE.
    if (!db.stockDemoSeeded) {
        db.stockDemoSeeded = true;
        db.stockIngredients = [
            {id:91001,name:'Massa (bola)',unit:'un',qty:50,minQty:10,unitCost:3.1},
            {id:91002,name:'Muçarela',unit:'g',qty:5000,minQty:1000,unitCost:0.035},
            {id:91003,name:'Molho de tomate',unit:'g',qty:3000,minQty:600,unitCost:0.014}
        ];
        db.stockMovements = db.stockIngredients.map(ing => ({id:estoqueId(),ingredientId:ing.id,amount:ing.qty,reason:'Saldo inicial (teste)',date:new Date().toISOString(),orderId:null,cartId:null}));
        if (!db.products.length) {
            db.products.push({id:91010,name:'Pizza de Teste - Muçarela',price:35,image:'',categories:['Pizzas Salgadas']});
        }
        let p = db.products.find(p=>p.name==='Pizza de Teste - Muçarela');
        if (p) db.stockRecipes.push({kind:'product',entityId:p.id,lines:[{ingredientId:91001,qty:1},{ingredientId:91002,qty:120},{ingredientId:91003,qty:70}]});
        db.shiftOpen = true;
        saveDb();
    }
}

function estoqueId() { return Date.now() + Math.random(); }
function estoqueReceita(kind,id) { return (db.stockRecipes || []).find(r=>r.kind===kind && r.entityId===id); }

function estoqueConsumo(item) {
    const soma = new Map();
    function adicionar(receita, sinal=1) {
        if (!receita) return;
        for (const linha of (receita.lines || [])) {
            if (!db.stockIngredients.some(i=>i.id===linha.ingredientId)) continue;
            const anterior = soma.get(linha.ingredientId) || 0;
            soma.set(linha.ingredientId, estoqueArred(anterior + sinal * Number(linha.qty||0)));
        }
    }
    adicionar(estoqueReceita('product',item.id));
    for (const mod of (item.modifiers||[])) {
        // Exclusão: subtrai os insumos associados a "Sem X" do consumo original.
        adicionar(estoqueReceita('modifier',mod.id), mod.type==='exclusion' ? -1 : 1);
    }
    return [...soma.entries()].filter(([id,q])=>q>0).map(([ingredientId,qty])=>({ingredientId,qty}));
}

function estoqueMovimentar(ingredientId,amount,reason,extra={}) {
    const ing = db.stockIngredients.find(i=>i.id===ingredientId);
    if (!ing) return false;
    const valor = estoqueArred(amount);
    if (!Number.isFinite(valor) || valor===0) return false;
    ing.qty = estoqueArred(ing.qty + valor);
    db.stockMovements.push({id:estoqueId(),ingredientId,amount:valor,reason,date:new Date().toISOString(),operatorId:currentSessionUser?.id||null,...extra});
    return true;
}

function estoqueReservarItem(order,item) {
    if (item.stockBooked) return; // Não duplica baixa quando um pedido é editado.
    const snapshot = estoqueConsumo(item);
    item.stockUsage = snapshot.map(x=>({...x})); // Foto do consumo no momento do pedido.
    item.stockBooked = true;
    for (const uso of snapshot) {
        estoqueMovimentar(uso.ingredientId,-uso.qty,'Pedido registrado', {orderId:order.id,cartId:item.cartId,productName:item.name});
    }
}

function estoqueAntesDeSalvarPedido(orderId,cart) {
    if (!orderId) return true;
    const original = db.orders.find(o=>o.id===orderId);
    if (!original || original.status==='cancelado') {
        showCustomAlert('Pedido inexistente ou cancelado não pode ser editado.'); return false;
    }
    const novosIds = new Set(cart.map(i=>i.cartId));
    if (original.items.some(i=>!novosIds.has(i.cartId))) {
        showCustomAlert('Para retirar itens de um pedido salvo, use “Cancelar item” no Kanban. Assim você decide se devolve os ingredientes ao estoque. Depois, edite o pedido normalmente.','Proteção do estoque');
        return false;
    }
    return true;
}

function estoqueAposSalvarPedido(order) {
    for (const item of order.items) estoqueReservarItem(order,item);
}

function estoqueTemMovimentoPedido(id) { return db.stockMovements.some(m=>m.orderId===id); }

function estoqueCancelarItemAplicar(order,item,cozinhaComecou) {
    if (!order || !item || item.cancelled) return false;
    item.cancelled = true;
    item.cancelledAt = new Date().toISOString();
    item.kitchenStarted = !!cozinhaComecou;
    item.completed = false;
    if (!cozinhaComecou && !item.stockReturned) {
        for (const uso of (item.stockUsage||[])) {
            estoqueMovimentar(uso.ingredientId,uso.qty,'Estorno: item não preparado', {orderId:order.id,cartId:item.cartId,productName:item.name});
        }
        item.stockReturned = true;
    }
    order.total = estoqueArred(order.items.filter(i=>!i.cancelled).reduce((s,i)=>s+Number(i.price||0),0));
    if (order.items.every(i=>i.cancelled)) order.status = 'cancelado';
    order.lastStatusChange = Date.now();
    return true;
}

function estoquePerguntarCancelamento(pergunta,aoResponder) {
    // Duas escolhas explícitas, sem confundir "Cancelar operação" com "Não começou".
    const titulo = document.getElementById('dialog-title');
    titulo.innerText = 'Cancelamento e estoque';
    document.getElementById('dialog-message').innerText = pergunta + '\nA cozinha já começou a preparar?';
    document.getElementById('dialog-input').style.display = 'none';
    const botoes = document.getElementById('dialog-buttons');
    botoes.innerHTML = '';
    const btnNao = document.createElement('button');
    btnNao.className='btn-success'; btnNao.style.flex='1'; btnNao.textContent='NÃO — devolver';
    btnNao.onclick = () => {closeSystemDialog();aoResponder(false);};
    const btnSim = document.createElement('button');
    btnSim.style.cssText='padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:white;flex:1;cursor:pointer';
    btnSim.textContent='SIM — manter baixa';
    btnSim.onclick=()=>{closeSystemDialog();aoResponder(true);};
    const btnVoltar=document.createElement('button');
    btnVoltar.style.cssText='padding:10px;border:0;background:transparent;color:#aaa;flex-basis:100%;cursor:pointer';
    btnVoltar.textContent='Voltar sem cancelar';btnVoltar.onclick=closeSystemDialog;
    botoes.append(btnNao,btnSim,btnVoltar);
    document.getElementById('system-dialog').style.display='block';
}

function estoquePedirCancelarItem(orderId,cartId) {
    const order=db.orders.find(o=>o.id===orderId);
    const item=order?.items.find(i=>i.cartId===cartId);
    if (!item || item.cancelled) return;
    estoquePerguntarCancelamento('Cancelar “'+item.name+'”?',comecou=>{
        estoqueCancelarItemAplicar(order,item,comecou);
        saveDb();closeMiniModal();renderKanban();
        if (document.getElementById('reports-view').classList.contains('active')) renderReports();
    });
}

function estoquePedirCancelarPedido(orderId) {
    const order=db.orders.find(o=>o.id===orderId);
    if(!order || order.status==='cancelado') return;
    estoquePerguntarCancelamento('Cancelar todo o pedido #'+String(order.id).slice(-4)+'? A resposta valerá para todos os itens ainda ativos.',comecou=>{
        order.items.filter(i=>!i.cancelled).forEach(item=>estoqueCancelarItemAplicar(order,item,comecou));
        order.status='cancelado';order.lastStatusChange=Date.now();
        saveDb();renderKanban();
    });
}

function estoqueMudarAba(aba) { estoqueAba=aba;estoqueRenderizar(); }

function estoqueRenderizar() {
    const root=document.getElementById('stock-content-area');if(!root)return;
    document.querySelectorAll('[data-stock-tab]').forEach(el=>el.classList.toggle('active',el.dataset.stockTab===estoqueAba));
    if(estoqueAba==='insumos') {
        const painel=comprasRenderizarPainel();
        const itens=db.stockIngredients.filter(i=>comprasFiltroEstoque==='todos'||comprasSituacao(i)===comprasFiltroEstoque)
            .sort((a,b)=>{const ordem={critico:0,atencao:1,ok:2,sem_config:3};return ordem[comprasSituacao(a)]-ordem[comprasSituacao(b)]||a.name.localeCompare(b.name,'pt-BR');});
        const registros=itens.map(i=>`
            <div class="menu-item-card" style="cursor:default;gap:12px;flex-wrap:wrap">
                <div class="item-info" style="gap:6px"><span class="item-title">${estoqueEscape(i.name)} ${i.kind==='prepared'?'<small style="color:var(--primary);font-size:.65em">(PRÉ-PREPARO)</small>':''}</span>
                  ${comprasStatusHTML(i)}
                  <span class="item-subtitle">Custo: ${estoqueMoeda(i.unitCost)}/${estoqueEscape(i.unit)} • Mínimo: ${estoqueNum(i.minQty)} • Alerta 50%: ${estoqueNum((Number(i.targetQty)||0)/2)} • Ideal: ${estoqueNum(i.targetQty)} ${estoqueEscape(i.unit)}</span></div>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><strong style="color:${comprasCor(comprasSituacao(i))}">${estoqueNum(i.qty)} ${estoqueEscape(i.unit)}</strong>
                <button class="btn-success" style="font-size:13px;padding:8px" onclick="${i.kind==='prepared'?`estoqueMudarAba('preparos')`:`estoqueFormMovimento(${i.id})`}">${i.kind==='prepared'?'Produzir':'Movimentar'}</button>
                <button class="btn-home" onclick="estoqueFormInsumo(${i.id})">Editar</button></div>
            </div>`).join('');
        root.innerHTML=`${painel}<div class="menu-top-bar" style="gap:12px;flex-wrap:wrap"><h3 style="margin:0">Visão geral do estoque (${itens.length})</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-home" onclick="estoqueMudarAba('compras')">🛒 Abrir lista de compras</button><button class="btn-success" onclick="estoqueFormInsumo()">+ Novo insumo</button></div></div><div class="menu-list">${registros||'<p>Nenhum item encontrado neste filtro.</p>'}</div>`;
    } else if(estoqueAba==='compras') {
        comprasRenderizarLista();
    } else if (estoqueAba==='preparos') {
        preparosRenderizar();
    } else if (estoqueAba==='receitas') {
        const produtos=db.products.map(p=>{
            const rec=estoqueReceita('product',p.id);
            const custo=(rec?.lines||[]).reduce((s,l)=>s+(db.stockIngredients.find(i=>i.id===l.ingredientId)?.unitCost||0)*l.qty,0);
            return `<div class="menu-item-card" style="cursor:default;gap:12px"><div class="item-info"><span class="item-title">${estoqueEscape(p.name)}</span><span class="item-subtitle">${rec?rec.lines.length+' insumos • custo estimado '+estoqueMoeda(custo):'Sem ficha técnica'}</span></div><button class="btn-home" onclick="estoqueFormReceita('product',${p.id})">${rec?'Editar ficha':'Criar ficha'}</button></div>`;
        }).join('');
        const mods=db.modifiers.map(m=>`<div class="menu-item-card" style="cursor:default"><div class="item-info"><span class="item-title">${estoqueEscape(m.name)}</span><span class="item-subtitle">${m.type==='exclusion'?'Retirada de insumo':'Adicional de insumo'} • ${estoqueReceita('modifier',m.id)?'Ficha cadastrada':'Sem ficha técnica'}</span></div><button class="btn-home" onclick="estoqueFormReceita('modifier',${m.id})">Editar ficha</button></div>`).join('');
        root.innerHTML=`<h3>Fichas técnicas de produtos</h3><p style="font-size:.9em;color:#aaa">Para pizzas, use a quantidade de massa PRONTA (ex.: 1 bola). Farinha, água e sal já são baixados ao registrar a produção da massa em Pré-preparos.</p><div class="menu-list">${produtos||'<p>Cadastre primeiro os produtos no Cardápio.</p>'}</div><h3 style="margin-top:25px">Fichas de adicionais e retiradas</h3><p style="color:#aaa;font-size:.9em">Uma retirada desconta da receita base a quantidade indicada aqui; um adicional soma a quantidade.</p><div class="menu-list">${mods||'<p>Nenhum modificador cadastrado.</p>'}</div>`;
    } else {
        const rows=[...db.stockMovements].reverse().slice(0,300).map(m=>{
            const ing=db.stockIngredients.find(i=>i.id===m.ingredientId);
            return `<tr><td>${new Date(m.date).toLocaleString('pt-BR')}</td><td>${estoqueEscape(ing?.name||'#'+m.ingredientId)}</td><td style="color:${m.amount<0?'var(--danger)':'var(--primary)'}">${m.amount>0?'+':''}${estoqueNum(m.amount)} ${ing?.unit||''}</td><td>${estoqueEscape(m.reason)}</td><td>${m.orderId?'Pedido #'+String(m.orderId).slice(-4):m.batchId?'Lote #'+String(m.batchId).slice(-6):'—'}</td></tr>`;
        }).join('');
        root.innerHTML=`<h3>Histórico de movimentações</h3><p style="color:#aaa">Últimos 300 registros. Movimentações não são apagadas ao editar uma ficha técnica.</p><div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Insumo</th><th>Quantidade</th><th>Motivo</th><th>Origem</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Sem movimentações.</td></tr>'}</tbody></table></div>`;
    }
}

function estoqueAbrirModal(titulo,html,btnLabel,onSave) {
    document.getElementById('mini-modal-title').innerText=titulo;
    document.getElementById('mini-modal-body').innerHTML=html;
    const footer=document.getElementById('mini-modal-footer');footer.innerHTML='';
    const fechar=document.createElement('button');fechar.className='btn-home';fechar.textContent='Voltar';fechar.onclick=closeMiniModal;
    const salvar=document.createElement('button');salvar.className='btn-success';salvar.textContent=btnLabel;salvar.onclick=onSave;
    footer.append(fechar,salvar);document.getElementById('mini-modal').style.display='block';
}

function estoqueLerNumero(id) { const v=Number(document.getElementById(id).value);return Number.isFinite(v)?v:NaN; }

function estoqueFormInsumo(id=null) {
    const i=id?db.stockIngredients.find(x=>x.id===id):null;
    estoqueAbrirModal(i?'Editar insumo':'Cadastrar insumo',`
        <div class="form-group"><label>Nome do insumo</label><input id="stk-name" maxlength="80" value="${estoqueEscape(i?.name||'')}" placeholder="Ex.: Muçarela"></div>
        <div class="form-group"><label>Unidade de controle</label><select id="stk-unit" ${i?'disabled':''}><option value="g" ${i?.unit==='g'?'selected':''}>Gramas (g)</option><option value="ml" ${i?.unit==='ml'?'selected':''}>Mililitros (ml)</option><option value="un" ${i?.unit==='un'?'selected':''}>Unidades (un)</option></select></div>
        ${i?`<p>Saldo atual: <strong>${estoqueNum(i.qty)} ${i.unit}</strong> (para corrigir, use Movimentar).</p>`:`<div class="form-group"><label>Quantidade inicial</label><input type="number" min="0" step="0.001" id="stk-qty" value="0"></div>`}
        <div class="form-group"><label>Estoque mínimo (alerta vermelho)</label><input type="number" min="0" step="0.001" id="stk-min" value="${i?.minQty??0}"></div>
        <div class="form-group"><label>Estoque ideal (reposição / lista de compras)</label><input type="number" min="0" step="0.001" id="stk-target" value="${i?.targetQty??0}"></div>
        <p style="color:#aaa;font-size:.8em">🟡 Alerta amarelo ao chegar a 50% do ideal, desde que esteja acima do mínimo. 🔴 Vermelho ao atingir o mínimo. Para ver os dois alertas, configure o ideal <b>acima do dobro do mínimo</b>.</p>
        <div class="form-group"><label>Custo por unidade (R$ por g/ml/un)</label><input type="number" min="0" step="0.00001" id="stk-cost" value="${i?.unitCost||0}" ${i?.kind==='prepared'?'disabled':''}></div>${i?.kind==='prepared'?'<p style="font-size:.82em;color:#aaa">O custo médio do pré-preparo é atualizado automaticamente a cada produção.</p>':''}`, 'Salvar',()=>{
        const name=document.getElementById('stk-name').value.trim();
        const minQty=estoqueLerNumero('stk-min'),targetQty=estoqueLerNumero('stk-target'),unitCost=estoqueLerNumero('stk-cost');
        const qty=i?0:estoqueLerNumero('stk-qty');
        if(!name||minQty<0||targetQty<0||unitCost<0||qty<0||![minQty,targetQty,unitCost,qty].every(Number.isFinite))return showCustomAlert('Confira o nome e os valores do insumo.');
        if(targetQty===0 && minQty>0)return showCustomAlert('Informe um estoque ideal maior que o mínimo.');
        if(targetQty>0 && targetQty<=minQty*2 && minQty>0)return showCustomAlert('O estoque ideal precisa ser MAIOR que o dobro do mínimo, para existir um nível amarelo antes do vermelho.');
        if(i?.unit==='un' && (!Number.isInteger(targetQty)||!Number.isInteger(minQty)))return showCustomAlert('Para unidades, estoque mínimo e ideal devem ser números inteiros.');
        if(!i && document.getElementById('stk-unit').value==='un' && (![qty,minQty,targetQty].every(Number.isInteger)))return showCustomAlert('Para unidades, use apenas números inteiros.');
        if(i){Object.assign(i,{name,minQty,targetQty,unitCost});}
        else {const novo={id:estoqueId(),name,unit:document.getElementById('stk-unit').value,qty:0,minQty,targetQty,unitCost};db.stockIngredients.push(novo);estoqueMovimentar(novo.id,qty,'Saldo inicial');}
        saveDb();closeMiniModal();estoqueRenderizar();
    });
}

function estoqueFormMovimento(id) {
    const i=db.stockIngredients.find(x=>x.id===id);if(!i)return;
    estoqueAbrirModal('Movimentar: '+i.name,`
        <p>Saldo atual: <strong>${estoqueNum(i.qty)} ${i.unit}</strong></p>
        ${i.kind==='prepared'?'<p style="font-size:.87em;color:#ffcc80">Para produzir unidades novas com baixa dos ingredientes, use a aba Pré-preparos. Aqui registre somente correções e contagens físicas.</p>':''}
        <div class="form-group"><label>Operação</label><select id="stk-mov-type"><option value="entrada">Entrada de estoque (+)</option><option value="perda">Perda / consumo não registrado (-)</option><option value="ajuste">Ajustar saldo para a contagem física (=)</option></select></div>
        <div class="form-group"><label>Quantidade (${i.unit})</label><input id="stk-mov-qty" type="number" min="0" step="0.001" value="0"></div>
        <div class="form-group"><label>Observação (opcional)</label><input id="stk-mov-note" maxlength="120" placeholder="Ex.: Compra fornecedor"></div>`, 'Confirmar movimentação',()=>{
        const qtd=estoqueLerNumero('stk-mov-qty'),tipo=document.getElementById('stk-mov-type').value;
        if(!Number.isFinite(qtd)||qtd<0)return showCustomAlert('Quantidade inválida.');
        const delta=tipo==='entrada'?qtd:tipo==='perda'?-qtd:estoqueArred(qtd-i.qty);
        if(delta===0)return showCustomAlert('Nenhuma diferença para registrar.');
        const note=document.getElementById('stk-mov-note').value.trim();
        const motivo={entrada:'Entrada manual',perda:'Perda manual',ajuste:'Ajuste por contagem'}[tipo];
        estoqueMovimentar(i.id,delta,motivo,{note});saveDb();closeMiniModal();estoqueRenderizar();
    });
}

function estoqueFormReceita(kind,id) {
    const entity=(kind==='product'?db.products:db.modifiers).find(x=>x.id===id);if(!entity)return;
    const recipe=estoqueReceita(kind,id);
    const linhas=db.stockIngredients.map(i=>{
        const q=recipe?.lines.find(l=>l.ingredientId===i.id)?.qty||0;
        return `<div class="form-group" style="display:flex;align-items:center;gap:12px"><label style="flex:1;margin:0">${estoqueEscape(i.name)} (${i.unit})</label><input type="number" id="rec-${i.id}" min="0" step="0.001" value="${q}" style="width:115px"></div>`;
    }).join('');
    estoqueAbrirModal('Ficha técnica: '+entity.name,`<p style="color:#aaa;font-size:.9em">Informe a quantidade usada em 1 item. Zero = não utilizado. Mudanças valem para pedidos futuros.</p>${linhas||'<p>Cadastre insumos antes.</p>'}`, 'Salvar ficha',()=>{
        const lines=[];
        for(const ing of db.stockIngredients){
            const qty=estoqueLerNumero('rec-'+ing.id);
            if(!Number.isFinite(qty)||qty<0)return showCustomAlert('Quantidade inválida: '+ing.name);
            if(qty>0)lines.push({ingredientId:ing.id,qty:estoqueArred(qty)});
        }
        if(recipe)recipe.lines=lines;else db.stockRecipes.push({kind,entityId:id,lines});
        saveDb();closeMiniModal();estoqueRenderizar();
    });
}

function estoqueExportar() {
    const data={exportadoEm:new Date().toISOString(),ingredients:db.stockIngredients,recipes:db.stockRecipes,movements:db.stockMovements,preparations:db.stockPreparations||[],batches:db.stockBatches||[],shoppingState:db.stockShoppingState||{},shoppingExtras:db.stockShoppingExtras||[],orders:db.orders};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='partigiana-estoque.json';a.click();URL.revokeObjectURL(url);
}

function estoqueResetarDemo() {
    showCustomConfirm('Apagar os dados deste navegador e retornar ao cadastro inicial? Exporte as informações importantes antes de continuar.',()=>{
        localStorage.removeItem('pdv_db_demo_20261007');sessionStorage.removeItem('pdv_demo_user_id');location.reload();
    },'Limpar dados locais');
}

// Mantém esta nova funcionalidade independente do arquivo principal.
if(typeof document!=='undefined') {
    estoqueGarantirEstrutura();
    // Login da demonstração: sem integração com serviço externo.
    saveDb();
}
