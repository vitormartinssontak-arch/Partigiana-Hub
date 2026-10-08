/* Partigiana HUB v0.9 — baixas manuais a partir do KDS.
   NÃO vincula baixas manuais a pedidos existentes. Pedidos feitos no PDV já
   baixam estoque e não devem ser lançados novamente nesta tela.
   Persistência local de demonstração; servidor PostgreSQL requer transações.
*/
const KDS_BAIXA = {mode:'insumos', category:'todos', search:'', current:null, busy:false, returnFocus:null};

function kdsBaixaProduto(id) { return (db.products||[]).find(p=>String(p.id)===String(id)); }
function kdsBaixaInsumo(id) { return (db.stockIngredients||[]).find(i=>String(i.id)===String(id)); }
function kdsBaixaCategorias() {
    const values = (db.categories||[]).map(c=>typeof c==='string'?c:c?.name).filter(Boolean);
    return [...new Set(values)];
}
function kdsBaixaNaCategoria(p,cat) {
    if(cat==='todos') return true;
    const names = Array.isArray(p.categories)?p.categories : (p.category?[p.category]:[]);
    return names.includes(cat);
}
function kdsBaixaMensagem(msg,title='Baixa de estoque') { showCustomAlert(msg,title); }

// Retorna um resumo verificável ANTES de alterar qualquer saldo.
function kdsBaixaValidar(kind,id,qtd) {
    const quantidade=Number(qtd);
    if (!Number.isFinite(quantidade)||quantidade<=0||estoqueArred(quantidade)!==quantidade) {
        return {ok:false,message:'Digite uma quantidade positiva, com no máximo 3 casas decimais.'};
    }
    if(kind==='insumo') {
        const ing=kdsBaixaInsumo(id);
        if(!ing) return {ok:false,message:'Insumo não encontrado.'};
        if(ing.unit==='un' && !Number.isInteger(quantidade)) return {ok:false,message:'Este insumo é controlado por unidades inteiras (un).'};
        const amount=estoqueArred(quantidade);
        if(Number(ing.qty)<amount) return {ok:false,message:`Saldo insuficiente de ${ing.name}: disponível ${estoqueNum(ing.qty)} ${ing.unit}.`};
        return {ok:true,name:ing.name,amount,rows:[{ingredientId:ing.id,qty:amount,ingredient:ing}]};
    }
    if(kind==='produto') {
        const product=kdsBaixaProduto(id);
        if(!product) return {ok:false,message:'Produto não encontrado no cardápio.'};
        if(!Number.isInteger(quantidade)) return {ok:false,message:'Itens do cardápio devem ser retirados em unidades inteiras.'};
        const recipe=estoqueConsumo({id:product.id,modifiers:[]});
        if(!recipe.length) return {ok:false,message:`${product.name} não possui ficha técnica com insumos vinculados. Cadastre-a em Estoque → Fichas técnicas antes de fazer a baixa.`};
        const rows=[];
        for(const r of recipe) {
            const ingredient=kdsBaixaInsumo(r.ingredientId);
            if(!ingredient) return {ok:false,message:'A ficha técnica contém um insumo que não existe mais.'};
            const amount=estoqueArred(Number(r.qty)*quantidade);
            if(!Number.isFinite(amount)||amount<=0) return {ok:false,message:'Quantidade inválida na ficha técnica de '+product.name};
            if(ingredient.unit==='un' && !Number.isInteger(amount)) return {ok:false,message:`A ficha técnica de ${product.name} consome uma fração inválida de ${ingredient.name} (un).`};
            if(Number(ingredient.qty)<amount) return {ok:false,message:`Saldo insuficiente de ${ingredient.name}: precisa ${estoqueNum(amount)} ${ingredient.unit}, disponível ${estoqueNum(ingredient.qty)} ${ingredient.unit}.`};
            rows.push({ingredientId:ingredient.id,qty:amount,ingredient});
        }
        return {ok:true,name:product.name,amount:quantidade,rows};
    }
    return {ok:false,message:'Tipo de baixa desconhecido.'};
}
// Registra cada insumo do consumo em um único lote de baixa manual.
function kdsBaixaAplicar(kind,id,qty,reason='Consumo interno',note='') {
    const check=kdsBaixaValidar(kind,id,qty);
    if(!check.ok) return check;
    const allowed=['Consumo interno','Perda / desperdício','Correção de saída','Cortesia não lançada'];
    const motive=allowed.includes(reason)?reason:'Consumo interno';
    const eventId='kds-manual-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
    for(const row of check.rows) {
        estoqueMovimentar(row.ingredientId,-row.qty,`Baixa manual KDS — ${motive}`,{
            source:'kds_manual',manualBatchId:eventId,manualKind:kind,manualEntityId:id,
            productName:check.name,quantity:check.amount,note:String(note||'').slice(0,140)
        });
    }
    saveDb();
    return {...check,eventId};
}

function kdsBaixaMoverParaContexto() {
    // Dentro do modo tela cheia, elementos fora da área fullscreen ficam invisíveis.
    const target = document.fullscreenElement?.contains?.(document.getElementById('kds-view'))
        ? document.fullscreenElement : (document.fullscreenElement||document.body);
    for(const id of ['kds-stock-overlay','kds-stock-quantity-overlay']) {
        const el=document.getElementById(id);
        if(el && el.parentElement!==target) target.appendChild(el);
    }
}
function kdsBaixaAbrir() {
    const el=document.getElementById('kds-stock-overlay'); if(!el)return;
    KDS_BAIXA.returnFocus=document.activeElement;
    KDS_BAIXA.mode='insumos'; KDS_BAIXA.category='todos';KDS_BAIXA.search='';
    KDS_BAIXA.current=null;
    kdsBaixaMoverParaContexto();
    document.getElementById('kds-stock-search-input').value='';
    kdsBaixaRenderizar();
    el.hidden=false;
    document.getElementById('kds-stock-search-input').focus();
}
function kdsBaixaFechar() {
    kdsBaixaQuantidadeFechar();
    document.getElementById('kds-stock-overlay').hidden=true;
    // Ao sair do modo tela cheia, devolve o modal à raiz do documento.
    if(!document.fullscreenElement) for(const id of ['kds-stock-overlay','kds-stock-quantity-overlay']) {
        const el=document.getElementById(id);if(el&&el.parentElement!==document.body)document.body.append(el);
    }
    KDS_BAIXA.returnFocus?.focus?.();
}
function kdsBaixaModo(mode) {
    if(!['insumos','cardapio'].includes(mode))return;
    KDS_BAIXA.mode=mode;KDS_BAIXA.category='todos';KDS_BAIXA.search='';
    document.getElementById('kds-stock-search-input').value='';
    kdsBaixaRenderizar();
}
function kdsBaixaCategoria(cat) {
    if(cat!=='todos'&&!kdsBaixaCategorias().includes(cat)) return;
    KDS_BAIXA.category=cat;KDS_BAIXA.search='';
    document.getElementById('kds-stock-search-input').value='';
    kdsBaixaRenderizar();
}
function kdsBaixaPesquisa(value) {KDS_BAIXA.search=String(value||'').trim().toLocaleLowerCase('pt-BR');kdsBaixaRenderizar();}
function kdsBaixaRenderizar() {
    document.querySelectorAll('[data-stock-mode]').forEach(b=>b.classList.toggle('active',b.dataset.stockMode===KDS_BAIXA.mode));
    const catBox=document.getElementById('kds-stock-categories');
    if(KDS_BAIXA.mode==='cardapio') {
        const categories=['todos',...kdsBaixaCategorias()];
        catBox.innerHTML=categories.map((name,i)=>`<button type="button" class="kds-stock-category ${KDS_BAIXA.category===name?'active':''}" data-category-index="${i}">${estoqueEscape(name==='todos'?'Todos os produtos':name)}</button>`).join('');
        catBox.querySelectorAll('button').forEach(b=>b.onclick=()=>kdsBaixaCategoria(categories[Number(b.dataset.categoryIndex)]));
    } else catBox.replaceChildren();
    const isInsumo=KDS_BAIXA.mode==='insumos';
    const entries=isInsumo?(db.stockIngredients||[]):(db.products||[]).filter(p=>kdsBaixaNaCategoria(p,KDS_BAIXA.category));
    const filtered=entries.filter(x=>String(x.name||'').toLocaleLowerCase('pt-BR').includes(KDS_BAIXA.search));
    document.getElementById('kds-stock-results-title').textContent=`${isInsumo?'Insumos':(KDS_BAIXA.category==='todos'?'Cardápio':KDS_BAIXA.category)} • ${filtered.length} ${filtered.length===1?'item':'itens'}`;
    const grid=document.getElementById('kds-stock-grid');
    grid.innerHTML=filtered.map(entry=>{
        const recipe=isInsumo?null:estoqueConsumo({id:entry.id,modifiers:[]});
        const hasRecipe=isInsumo||recipe.length>0;
        const subtitle=isInsumo?`Saldo: ${estoqueNum(entry.qty)} ${estoqueEscape(entry.unit)}`:(hasRecipe?'Baixa pela ficha técnica':'⚠ Sem ficha técnica');
        return `<button type="button" class="kds-stock-product ${hasRecipe?'':'kds-stock-no-recipe'}" data-kind="${isInsumo?'insumo':'produto'}" data-id="${estoqueEscape(entry.id)}"><span class="kds-stock-product-icon">${isInsumo?'📦':'🍕'}</span><strong>${estoqueEscape(entry.name)}</strong><small>${subtitle}</small></button>`;
    }).join('')||'<div class="kds-stock-empty">Nenhum item encontrado nesta categoria.</div>';
    grid.querySelectorAll('.kds-stock-product').forEach(b=>b.onclick=()=>kdsBaixaQuantidadeAbrir(b.dataset.kind,b.dataset.id));
}
function kdsBaixaQuantidadeAbrir(kind,id) {
    const entity=kind==='insumo'?kdsBaixaInsumo(id):kdsBaixaProduto(id);
    if(!entity)return;
    if(kind==='produto'&&!estoqueConsumo({id:entity.id,modifiers:[]}).length) {
        return kdsBaixaMensagem(`Para dar baixa de ${entity.name}, configure os ingredientes na ficha técnica em Estoque → Fichas técnicas.`, 'Ficha técnica necessária');
    }
    KDS_BAIXA.current={kind,id:entity.id};
    document.getElementById('kds-stock-qty-name').textContent=entity.name;
    document.getElementById('kds-stock-qty-current').textContent=kind==='insumo'?`Saldo disponível: ${estoqueNum(entity.qty)} ${entity.unit}`:'A baixa vai consumir os ingredientes previstos na ficha técnica.';
    const input=document.getElementById('kds-stock-qty-input');
    input.step=kind==='insumo'&&entity.unit!=='un'?'0.001':'1';
    input.min=kind==='insumo'&&entity.unit!=='un'?'0.001':'1';
    input.value='1';
    document.getElementById('kds-stock-qty-unit').textContent=kind==='insumo'?entity.unit:'un';
    document.getElementById('kds-stock-qty-reason').value='Consumo interno';
    document.getElementById('kds-stock-qty-note').value='';
    kdsBaixaPrever();
    document.getElementById('kds-stock-quantity-overlay').hidden=false;
    input.focus();input.select();
}
function kdsBaixaPrever() {
    const current=KDS_BAIXA.current;if(!current)return;
    const qty=Number(document.getElementById('kds-stock-qty-input').value);
    const result=kdsBaixaValidar(current.kind,current.id,qty);
    const output=document.getElementById('kds-stock-qty-usage');
    if(!result.ok) {output.innerHTML=`<p class="kds-stock-error">${estoqueEscape(result.message)}</p>`;return;}
    output.innerHTML=`<strong>Será retirado do estoque:</strong>${result.rows.map(r=>`<div class="kds-stock-impact"><span>${estoqueEscape(r.ingredient.name)}</span><strong>− ${estoqueNum(r.qty)} ${estoqueEscape(r.ingredient.unit)}</strong></div>`).join('')}`;
}
function kdsBaixaQuantidadeFechar() {
    const overlay=document.getElementById('kds-stock-quantity-overlay');if(overlay)overlay.hidden=true;
    KDS_BAIXA.current=null;
}
function kdsBaixaConfirmar() {
    if(KDS_BAIXA.busy||!KDS_BAIXA.current)return;
    const btn=document.getElementById('kds-stock-confirm');
    KDS_BAIXA.busy=true;btn.disabled=true;
    try {
        const current=KDS_BAIXA.current;
        const result=kdsBaixaAplicar(current.kind,current.id,Number(document.getElementById('kds-stock-qty-input').value),
            document.getElementById('kds-stock-qty-reason').value,document.getElementById('kds-stock-qty-note').value);
        if(!result.ok) {kdsBaixaPrever();kdsBaixaMensagem(result.message,'Baixa não registrada');return;}
        kdsBaixaQuantidadeFechar();
        kdsBaixaRenderizar();
        kdsBaixaMensagem(`Saída registrada: ${estoqueNum(result.amount)} ${current.kind==='insumo'?result.rows[0].ingredient.unit:'un'} de ${result.name}.`, 'Baixa registrada');
    } finally {KDS_BAIXA.busy=false;btn.disabled=false;}
}
if(typeof document!=='undefined') {
    document.getElementById('kds-stock-qty-input')?.addEventListener('input',kdsBaixaPrever);
    document.addEventListener('keydown',e=>{
        if(e.key!=='Escape')return;
        if(!document.getElementById('kds-stock-quantity-overlay')?.hidden) {e.preventDefault();kdsBaixaQuantidadeFechar();}
        else if(!document.getElementById('kds-stock-overlay')?.hidden) {e.preventDefault();kdsBaixaFechar();}
    });
    document.addEventListener('fullscreenchange',()=>{
        if(!document.getElementById('kds-stock-overlay')?.hidden)kdsBaixaMoverParaContexto();
    });
}
