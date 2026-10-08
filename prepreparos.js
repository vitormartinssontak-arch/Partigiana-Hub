/* Partigiana HUB — Pré-preparos v0.2 (AMBIENTE LOCAL DE DEMONSTRAÇÃO)
   Receita de REFERÊNCIA não obriga rendimento. Cada lote tem quantidades REAIS,
   entrada do produto pronto, baixa dos componentes e histórico imutável.
   Na migração PostgreSQL, a operação inteira deve ser uma transação no backend. */

function preparosArredCusto(valor) { return Math.round((Number(valor)+Number.EPSILON)*1e6)/1e6; }

function preparosGarantirEstrutura() {
    if (!Array.isArray(db.stockPreparations)) db.stockPreparations=[];
    if (!Array.isArray(db.stockBatches)) db.stockBatches=[];
    // Migração somente do exemplo local: transforma a massa de teste em pré-preparo
    // sem alterar saldos históricos nem duplicar registros em novas aberturas.
    const massa = db.stockIngredients.find(i=>i.id===91001 && i.name==='Massa (bola)');
    if (massa && !db.stockPreparations.some(p=>p.outputIngredientId===massa.id)) {
        massa.kind='prepared';
        const exemplo=[
            {id:91004,name:'Farinha (teste)',unit:'g',qty:10000,minQty:1000,unitCost:0.008},
            {id:91005,name:'Água (teste)',unit:'ml',qty:8000,minQty:1000,unitCost:0.0001},
            {id:91006,name:'Sal (teste)',unit:'g',qty:500,minQty:100,unitCost:0.005}
        ];
        for(const item of exemplo){
            if(!db.stockIngredients.some(x=>x.id===item.id)) {
                db.stockIngredients.push(item);
                db.stockMovements.push({id:estoqueId(),ingredientId:item.id,amount:item.qty,reason:'Saldo inicial (teste)',date:new Date().toISOString(),orderId:null,cartId:null});
            }
        }
        db.stockPreparations.push({id:estoqueId(),outputIngredientId:massa.id,referenceYield:40,
          defaultInputs:[{ingredientId:91004,qty:5000},{ingredientId:91005,qty:3000},{ingredientId:91006,qty:150}]});
        saveDb();
    }
    for(const prep of db.stockPreparations) {
        const item=db.stockIngredients.find(i=>i.id===prep.outputIngredientId);
        if(item)item.kind='prepared';
    }
}

function preparosDefinicao(id) { return db.stockPreparations.find(p=>p.outputIngredientId===id); }
function preparosItem(id) { return db.stockIngredients.find(i=>i.id===id); }
function preparosErro(msg) {return {ok:false,error:msg};}

/**
 * Cria um lote completo ou não altera nada em caso de validação inválida.
 * `inputs`: [{ingredientId, qty}] realmente consumidos; independem da receita de referência.
 * Pode usar outro pré-preparo como componente (ex. molho-base), mas não a si mesmo.
 */
function preparosRegistrarLote(outputIngredientId,outputQty,inputs,options={}) {
    const def=preparosDefinicao(outputIngredientId);
    const saida=preparosItem(outputIngredientId);
    if(!def || !saida || saida.kind!=='prepared')return preparosErro('Pré-preparo não cadastrado.');
    const quantidade=estoqueArred(outputQty);
    if(!Number.isFinite(Number(outputQty)) || Number(outputQty)<=0 || quantidade<=0 ||
       (saida.unit==='un' && !Number.isInteger(Number(outputQty))) || Math.abs(quantidade-Number(outputQty))>0.000001)
        return preparosErro('Informe uma quantidade produzida válida'+(saida.unit==='un'?' (unidades inteiras).':'.'));
    if(!Array.isArray(inputs) || !inputs.length)return preparosErro('Informe ao menos um insumo utilizado no lote.');
    const vistos=new Set(),consumos=[];
    let custoTotal=0;
    for(const dado of inputs){
        const insumo=preparosItem(Number(dado.ingredientId));
        const quantidadeInput=estoqueArred(dado.qty);
        if(!insumo)return preparosErro('Um dos insumos informados não existe.');
        if(insumo.id===saida.id)return preparosErro('O produto pronto não pode consumir a si mesmo.');
        if(vistos.has(insumo.id))return preparosErro('O insumo '+insumo.name+' aparece mais de uma vez.');
        vistos.add(insumo.id);
        if(!Number.isFinite(Number(dado.qty)) || Number(dado.qty)<=0 || quantidadeInput<=0 ||
           Math.abs(quantidadeInput-Number(dado.qty))>0.000001 || (insumo.unit==='un' && !Number.isInteger(Number(dado.qty))))
            return preparosErro('Quantidade inválida de '+insumo.name+'.');
        if(estoqueArred(insumo.qty-quantidadeInput)<0)return preparosErro('Estoque insuficiente: '+insumo.name+' (disponível '+estoqueNum(insumo.qty)+' '+insumo.unit+').');
        const custoUnitario=Number(insumo.unitCost)||0;
        const custoLinha=preparosArredCusto(quantidadeInput*custoUnitario);
        custoTotal+=custoLinha;
        consumos.push({ingredientId:insumo.id,qty:quantidadeInput,unitCost:custoUnitario,unit:insumo.unit,name:insumo.name,cost:custoLinha});
    }
    custoTotal=preparosArredCusto(custoTotal);
    const id=options.batchId??estoqueId();
    if(db.stockBatches.some(b=>b.id===id))return preparosErro('Este lote já foi registrado.');
    const now=new Date().toISOString();
    const anterior=Number(saida.qty)||0;
    const custoAnterior=Number(saida.unitCost)||0;
    const custoPorUnidade=preparosArredCusto(custoTotal/quantidade);
    const lote={id,outputIngredientId,outputName:saida.name,outputUnit:saida.unit,outputQty:quantidade,
        inputs:consumos,date:now,note:String(options.note||'').trim().slice(0,200),
        operatorId:currentSessionUser?.id||null,costTotal:custoTotal,unitCost:custoPorUnidade,
        referenceYield:def.referenceYield??null};
    // Validações acima são feitas ANTES de qualquer alteração. Única operação síncrona
    // em memória; os mecanismos transacionais reais serão adicionados no backend.
    const saldos=new Map(consumos.map(i=>[i.ingredientId,preparosItem(i.ingredientId).qty]));
    saldos.set(saida.id,saida.qty);
    const oldCost=saida.unitCost,prevMovementCount=db.stockMovements.length;
    try {
        for(const insumo of consumos){
            if(!estoqueMovimentar(insumo.ingredientId,-insumo.qty,'Produção: consumo do pré-preparo',
              {batchId:id,preparationId:outputIngredientId,batchRole:'input'}))throw Error('Falha ao movimentar '+insumo.name);
        }
        if(!estoqueMovimentar(saida.id,quantidade,'Produção: entrada do pré-preparo',
           {batchId:id,preparationId:outputIngredientId,batchRole:'output'}))throw Error('Falha ao creditar produção');
        // Custo médio ponderado de saldos positivos. Se havia saldo negativo de teste,
        // usa o custo do lote, para evitar médias distorcidas.
        saida.unitCost=anterior>0?
            preparosArredCusto((anterior*custoAnterior+custoTotal)/(anterior+quantidade)):
            custoPorUnidade;
        db.stockBatches.push(lote);
    }catch(err){
        for(const [ingId,saldo] of saldos)preparosItem(ingId).qty=saldo;
        saida.unitCost=oldCost;
        db.stockMovements.length=prevMovementCount;
        return preparosErro('O lote não foi registrado: '+err.message);
    }
    return {ok:true,batch:lote};
}

function preparosLinhasHtml(destino,linhas=[],ignorarId=null) {
    const itens=db.stockIngredients.filter(i=>i.id!==ignorarId);
    return `<div id="${destino}" style="display:flex;flex-direction:column;gap:8px;margin:10px 0"></div>
      <button type="button" class="btn-home" style="margin-top:4px" onclick="preparosAdicionarLinha('${destino}',null,${ignorarId===null?'null':ignorarId})">+ Adicionar ingrediente</button>`;
}

function preparosAdicionarLinha(destino,valor=null,ignorarId=null) {
    const elemento=document.getElementById(destino);if(!elemento)return;
    const itens=db.stockIngredients.filter(i=>i.id!==ignorarId);
    if(!itens.length)return showCustomAlert('Cadastre insumos antes de montar este pré-preparo.');
    const row=document.createElement('div');row.className='preparo-linha';
    row.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px';
    const select=document.createElement('select');select.className='prep-ingrediente';select.style.cssText='flex:2;min-width:165px;padding:9px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:6px';
    for(const item of itens){const op=document.createElement('option');op.value=String(item.id);op.textContent=item.name+' ('+item.unit+')';select.appendChild(op);}
    if(valor?.ingredientId!==undefined)select.value=String(valor.ingredientId);
    const qty=document.createElement('input');qty.className='prep-quantidade';qty.type='number';qty.min='0.001';qty.step='0.001';qty.placeholder='Quantidade';qty.value=valor?.qty??'';
    qty.style.cssText='flex:1;min-width:90px;padding:9px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:6px';
    const del=document.createElement('button');del.type='button';del.textContent='✕';del.title='Remover ingrediente';del.style.cssText='padding:8px 12px;background:transparent;color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer';del.onclick=()=>{row.remove();preparosAtualizarResumo();};
    row.append(select,qty,del);elemento.appendChild(row);
    select.addEventListener('change',preparosAtualizarResumo);qty.addEventListener('input',preparosAtualizarResumo);
    preparosAtualizarResumo();
}

function preparosLerLinhas(destino) {
    const linhas=[];
    document.querySelectorAll('#'+destino+' .preparo-linha').forEach(row=>linhas.push({ingredientId:Number(row.querySelector('.prep-ingrediente').value),qty:Number(row.querySelector('.prep-quantidade').value)}));
    return linhas;
}

function preparosAtualizarResumo() {
    const el=document.getElementById('preparo-previa');if(!el)return;
    const linhas=preparosLerLinhas('preparo-producao-linhas');
    const qty=Number(document.getElementById('preparo-qtd-pronta')?.value||0);
    let custo=0,insuficientes=[];
    for(const linha of linhas){const ing=preparosItem(linha.ingredientId);if(!ing)continue;
        if(linha.qty>0)custo+=linha.qty*(Number(ing.unitCost)||0);
        if(linha.qty>ing.qty)insuficientes.push(ing.name);
    }
    el.innerHTML=`<strong>Custo estimado do lote: ${estoqueMoeda(custo)}</strong>${qty>0?' • Por unidade: '+estoqueMoeda(custo/qty):''}
      ${insuficientes.length?'<p style="color:var(--danger)">Saldo insuficiente: '+insuficientes.map(estoqueEscape).join(', ')+'</p>':''}`;
}

function preparosAbrirCadastro(outputId=null) {
    const def=outputId?preparosDefinicao(outputId):null;
    const item=outputId?preparosItem(outputId):null;
    if(outputId && (!def||!item))return;
    const conteudo=`<p style="font-size:.9em;color:#aaa">Cadastre o produto que sai do pré-preparo e, se quiser, uma receita de referência. A produção real pode usar outras quantidades e render mais ou menos.</p>
      <div class="form-group"><label>Nome do pré-preparo</label><input id="preparo-nome" maxlength="80" value="${estoqueEscape(item?.name||'')}" placeholder="Ex.: Massa (bola)"></div>
      <div class="form-group"><label>Unidade do produto pronto</label><select id="preparo-unidade" ${item?'disabled':''}>
        <option value="un" ${item?.unit==='un'?'selected':''}>Unidades (ex.: bolas de massa)</option>
        <option value="g" ${item?.unit==='g'?'selected':''}>Gramas (ex.: molho pronto)</option>
        <option value="ml" ${item?.unit==='ml'?'selected':''}>Mililitros</option></select></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><div class="form-group" style="flex:1"><label>Mínimo do produto pronto (vermelho)</label><input id="preparo-minimo" type="number" step="0.001" min="0" value="${item?.minQty??0}"></div>
      <div class="form-group" style="flex:1"><label>Estoque ideal (alerta 50% e reposição)</label><input id="preparo-ideal" type="number" step="0.001" min="0" value="${item?.targetQty??0}"></div></div>
      <p style="font-size:.8em;color:#aaa">Amarelo: até metade do ideal e acima do mínimo. Vermelho: mínimo atingido. Para haver ambos, deixe o ideal acima de 2× o mínimo.</p>
      <div class="form-group"><label>Rendimento de referência (opcional)</label><input id="preparo-rendimento" type="number" step="0.001" min="0" value="${def?.referenceYield??''}" placeholder="Ex.: 40"></div></div>
      <h4 style="margin:10px 0 4px">Receita de referência (opcional)</h4>
      <p style="font-size:.84em;color:#aaa;margin:5px 0">Ela apenas preenche o lançamento da próxima produção. Você pode mudar cada quantidade e o rendimento real.</p>
      ${preparosLinhasHtml('preparo-cadastro-linhas',def?.defaultInputs||[],outputId)}`;
    estoqueAbrirModal(item?'Editar pré-preparo':'Novo pré-preparo',conteudo,'Salvar cadastro',()=>{
        const nome=document.getElementById('preparo-nome').value.trim();
        const minimo=estoqueLerNumero('preparo-minimo');
        const ideal=estoqueLerNumero('preparo-ideal');
        const rawRendimento=document.getElementById('preparo-rendimento').value.trim();
        const rendimento=rawRendimento===''?null:Number(rawRendimento);
        const unidade=document.getElementById('preparo-unidade').value;
        const linhas=preparosLerLinhas('preparo-cadastro-linhas');
        if(!nome || !Number.isFinite(minimo) || minimo<0 || !Number.isFinite(ideal)||ideal<0 ||
           (ideal===0 && minimo>0) || (minimo>0 && ideal>0 && ideal<=2*minimo) ||
           (rendimento!==null && (!Number.isFinite(rendimento)||rendimento<=0)) ||
           (unidade==='un' && rendimento!==null && !Number.isInteger(rendimento)) ||
           (unidade==='un' && (!Number.isInteger(minimo)||!Number.isInteger(ideal))))return showCustomAlert('Confira nome, mínimo, ideal e rendimento. O ideal deve ser superior ao dobro do mínimo.');
        if(db.stockIngredients.some(x=>x.id!==outputId && x.name.toLocaleLowerCase('pt-BR')===nome.toLocaleLowerCase('pt-BR')))
            return showCustomAlert('Já existe um insumo ou pré-preparo com esse nome.');
        const vistos=new Set();
        for(const linha of linhas){
            const ing=preparosItem(linha.ingredientId);
            if(!ing || ing.id===outputId || !Number.isFinite(linha.qty) || linha.qty<=0 || estoqueArred(linha.qty)<=0 ||
               Math.abs(estoqueArred(linha.qty)-linha.qty)>0.000001 || (ing.unit==='un'&&!Number.isInteger(linha.qty)) || vistos.has(ing.id))
                return showCustomAlert('Confira as quantidades e evite repetir um ingrediente na receita de referência.');
            vistos.add(ing.id);
        }
        if(item){item.name=nome;item.minQty=minimo;item.targetQty=ideal;def.referenceYield=rendimento;def.defaultInputs=linhas;}
        else {const id=estoqueId();db.stockIngredients.push({id,name:nome,unit:unidade,kind:'prepared',qty:0,minQty:minimo,targetQty:ideal,unitCost:0});
              db.stockPreparations.push({id:estoqueId(),outputIngredientId:id,referenceYield:rendimento,defaultInputs:linhas});}
        saveDb();closeMiniModal();estoqueRenderizar();
    });
    for(const line of def?.defaultInputs||[])preparosAdicionarLinha('preparo-cadastro-linhas',line,outputId);
}

function preparosAbrirProducao(outputId) {
    if(typeof hubProductionOpenStart==='function')return hubProductionOpenStart(null,outputId);
    const item=preparosItem(outputId),def=preparosDefinicao(outputId);if(!item||!def)return;
    estoqueAbrirModal('Registrar produção: '+item.name,`
       <p style="font-size:.9em;color:#aaa">Informe o que saiu de verdade deste lote. A receita de referência é só uma sugestão: 5 kg de farinha podem render 40 massas hoje e 41 amanhã.</p>
       ${def.referenceYield?`<p style="color:var(--primary)">Referência: ${estoqueNum(def.referenceYield)} ${item.unit} por receita padrão.</p>`:''}
       <div class="form-group"><label>Quantidade realmente produzida (${item.unit})</label><input id="preparo-qtd-pronta" type="number" min="0.001" step="${item.unit==='un'?'1':'0.001'}" placeholder="Ex.: 41"></div>
       <h4 style="margin:15px 0 4px">Quantidades realmente utilizadas</h4>
       <p style="font-size:.84em;color:#aaa;margin:5px 0">Estes insumos serão descontados do estoque; o produto pronto será adicionado.</p>
       ${preparosLinhasHtml('preparo-producao-linhas',def.defaultInputs,outputId)}
       <div id="preparo-previa" style="padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin:14px 0"></div>
       <div class="form-group"><label>Observação do lote (opcional)</label><input id="preparo-observacao" maxlength="200" placeholder="Ex.: Fornada da manhã, massa com hidratação ajustada"></div>`,
       'Confirmar produção',()=>{
           const btn=document.querySelector('#mini-modal-footer .btn-success');
           const outputQty=estoqueLerNumero('preparo-qtd-pronta');
           const inputs=preparosLerLinhas('preparo-producao-linhas');
           if(btn?.disabled)return;
           if(btn)btn.disabled=true;
           const result=preparosRegistrarLote(outputId,outputQty,inputs,{note:document.getElementById('preparo-observacao').value});
           if(!result.ok){if(btn)btn.disabled=false;return showCustomAlert(result.error,'Não foi possível registrar o lote');}
           saveDb();closeMiniModal();estoqueRenderizar();
           showCustomAlert(`Lote registrado! ${estoqueNum(result.batch.outputQty)} ${item.unit} de ${item.name} adicionadas ao estoque.\n${inputs.length} insumo(s) baixado(s).\nCusto total estimado: ${estoqueMoeda(result.batch.costTotal)}.`,'Produção registrada');
       });
    for(const line of def.defaultInputs||[])preparosAdicionarLinha('preparo-producao-linhas',line,outputId);
    document.getElementById('preparo-qtd-pronta').addEventListener('input',preparosAtualizarResumo);
    preparosAtualizarResumo();
}

function preparosVerLote(id) {
    const lote=db.stockBatches.find(x=>x.id===id);if(!lote)return;
    const rows=lote.inputs.map(x=>`<tr><td>${estoqueEscape(x.name)}</td><td>${estoqueNum(x.qty)} ${estoqueEscape(x.unit)}</td><td>${estoqueMoeda(x.cost)}</td></tr>`).join('');
    estoqueAbrirModal('Lote #'+String(id).slice(-6),`
      <p><strong>${estoqueEscape(lote.outputName)}</strong> — ${estoqueNum(lote.outputQty)} ${estoqueEscape(lote.outputUnit)}</p>
      <p style="color:#aaa;font-size:.9em">${new Date(lote.date).toLocaleString('pt-BR')}${lote.note?' • '+estoqueEscape(lote.note):''}</p>
      <div style="overflow:auto"><table><thead><tr><th>Componente</th><th>Uso real</th><th>Custo do uso</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p><strong>Custo do lote:</strong> ${estoqueMoeda(lote.costTotal)} • <strong>Por ${estoqueEscape(lote.outputUnit)}:</strong> ${estoqueMoeda(lote.unitCost)}</p>
      <small style="color:#aaa">Registro histórico. Editar a receita de referência não modifica lotes anteriores.</small>`,
      'Fechar',closeMiniModal);
}

function preparosRenderizar() {
    const registros=db.stockPreparations.map(p=>{
        const item=preparosItem(p.outputIngredientId);if(!item)return '';
        const situacao=comprasSituacao(item);
        const minimo=situacao==='critico';
        return `<div class="menu-item-card" style="cursor:default;gap:12px;flex-wrap:wrap">
          <div class="item-info"><span class="item-title">${estoqueEscape(item.name)}</span>
            <span class="item-subtitle">${p.defaultInputs.length} componente(s) de referência • ${p.referenceYield?`Referência: ${estoqueNum(p.referenceYield)} ${item.unit}`:'Rendimento livre'} • Custo médio: ${estoqueMoeda(item.unitCost)}/${item.unit}</span></div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><strong style="color:${comprasCor(situacao)}">${estoqueNum(item.qty)} ${item.unit}</strong> ${comprasStatusHTML(item)}
             <button class="btn-home" onclick="preparosAbrirCadastro(${item.id})">Editar receita</button>
             <button class="btn-success" onclick="preparosAbrirProducao(${item.id})">+ Registrar produção</button></div>
          </div>`;
    }).join('');
    const lotes=[...db.stockBatches].reverse().slice(0,100).map(b=>`<tr>
      <td>${new Date(b.date).toLocaleString('pt-BR')}</td><td>${estoqueEscape(b.outputName)}</td>
      <td>+${estoqueNum(b.outputQty)} ${estoqueEscape(b.outputUnit)}</td><td>${estoqueMoeda(b.costTotal)}</td>
      <td><button class="btn-home" style="padding:5px 10px" onclick="preparosVerLote(${b.id})">Detalhes</button></td></tr>`).join('');
    document.getElementById('stock-content-area').innerHTML=`
       <div class="menu-top-bar" style="gap:14px;flex-wrap:wrap"><div><h3 style="margin:0">Produção de pré-preparos</h3>
       <p style="color:#aaa;font-size:.87em;margin:8px 0 0">Transforme ingredientes em massa, molhos, recheios ou outros preparos. Informe sempre o rendimento e o consumo real do lote.</p></div>
       <button class="btn-success" onclick="preparosAbrirCadastro()">+ Novo pré-preparo</button></div>
       <div class="menu-list">${registros||'<p>Nenhum pré-preparo cadastrado. Clique em + Novo pré-preparo.</p>'}</div>
       <h3 style="margin:25px 0 0">Últimos lotes registrados</h3>
       <p style="font-size:.85em;color:#aaa">Cada lote movimenta seus ingredientes e o produto pronto. A ficha da pizza deve consumir a massa pronta, não a farinha novamente.</p>
       <div style="overflow:auto"><table><thead><tr><th>Data</th><th>Pré-preparo</th><th>Produzido</th><th>Custo</th><th></th></tr></thead><tbody>${lotes||'<tr><td colspan="5">Nenhuma produção registrada ainda.</td></tr>'}</tbody></table></div>`;
}

// A última importação no index.html ocorre depois de estoque.js e seu seed local.
if(typeof document!=='undefined'){preparosGarantirEstrutura();saveDb();}
