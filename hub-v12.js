/* PARTIGIANA HUB 1.2 | PROTÓTIPO LOCAL — NÃO USAR EM PRODUÇÃO
 * Integrações com Rails/PostgreSQL, concorrência e segurança exigem implementação no servidor.
 * Todo registro de demonstração fica somente na chave local de banco da versão anterior.
 */
const HUBV12={mode:'queue',floorMode:'operate',drawing:null,dragging:null,kdsPresetId:null};
const hubEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hubId=()=>Date.now()+Math.random();
const hubDate=t=>t?new Date(t).toLocaleString('pt-BR'):'—';
const hubTime=t=>{const s=Math.max(0,Math.floor((Date.now()-new Date(t).getTime())/1000));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
function hubCanManage(){return typeof getMyPerms==='function' && getMyPerms().includes('settings-view');}
function hubSave(){saveDb();}
function hubInit(){
  if(!db.hubWaitlist) db.hubWaitlist=[];
  if(!db.hubAvailability) db.hubAvailability={products:{},ingredients:{},modifiers:{},history:[]};
  if(!Array.isArray(db.hubAvailability.history))db.hubAvailability.history=[];
  if(!db.hubFloor || !Array.isArray(db.hubFloor.tables)) db.hubFloor={tables:[],walls:[],layouts:[],width:1000,height:560};
  if(!db.hubPlans)db.hubPlans=[];
  if(!Array.isArray(db.hubPlans))db.hubPlans=[];
  if(!db.hubKdsPresets)db.hubKdsPresets=[
    {id:'cozinha',name:'Cozinha',mode:'production',categories:kdsCategoriasPadrao('cozinha'),fontSize:20,visibleItems:3,columns:5,rows:2},
    {id:'bar',name:'Bar',mode:'production',categories:kdsCategoriasPadrao('bar'),fontSize:20,visibleItems:3,columns:5,rows:2},
    {id:'salao',name:'Salão',mode:'delivery',categories:kdsCategoriasDisponiveis(),fontSize:20,visibleItems:3,columns:5,rows:2}
  ];
  hubFloorSync();
  try{HUBV12.kdsPresetId=localStorage.getItem('partigiana_kds_preset_v12')||db.hubKdsPresets[0]?.id||'cozinha';}catch(e){HUBV12.kdsPresetId='cozinha';}
  if(!db.hubKdsPresets.some(p=>p.id===HUBV12.kdsPresetId))HUBV12.kdsPresetId=db.hubKdsPresets[0]?.id;
  hubKdsMountSelectors();
  hubTick();setInterval(hubTick,1000);
  hubSave();
}
function hubRefresh(){
  if(document.getElementById('waitlist-view')?.classList.contains('active')) hubQueueRender();
  if(document.getElementById('floor-view')?.classList.contains('active'))hubFloorRender();
  if(document.getElementById('availability-view')?.classList.contains('active'))hubAvailabilityRender();
  if(document.getElementById('production-view')?.classList.contains('active'))hubProductionRender();
}
function hubTick(){document.querySelectorAll('[data-hub-time]').forEach(el=>{el.textContent=hubTime(el.dataset.hubTime);const seconds=(Date.now()-new Date(el.dataset.hubTime).getTime())/1000;if(el.dataset.hubCalled==='true'){el.classList.toggle('hub-late',seconds>=1200);el.classList.toggle('hub-warn',seconds>=600&&seconds<1200);}});}
function hubAfterView(view){if(view==='waitlist-view')hubQueueRender();if(view==='floor-view')hubFloorRender();if(view==='availability-view')hubAvailabilityRender();if(view==='production-view')hubProductionRender();}
function hubGo(view){switchViewAndClose(view);}

// KDS ÚNICO: visualizações compartilhadas no banco, preferência ativa e filtro somente no navegador.
function hubKdsPreset(){return db.hubKdsPresets.find(p=>p.id===HUBV12.kdsPresetId)||db.hubKdsPresets[0];}
function hubKdsCategories(p=hubKdsPreset()){
  const valid=kdsCategoriasDisponiveis();let value=null;
  try{const raw=localStorage.getItem('partigiana_kds_override_v12_'+p.id);if(raw)value=JSON.parse(raw);}catch(e){}
  if(!Array.isArray(value))value=p.categories||[];
  return [...new Set(value.filter(name=>valid.includes(name)))];
}
function hubKdsMountSelectors(){
  for(const id of ['kds-preset-control','salao-preset-control']){
    const el=document.getElementById(id);if(!el)continue;
    el.innerHTML=`<label for="${id}-select">Visualização</label><select id="${id}-select" onchange="hubKdsEscolher(this.value)">${db.hubKdsPresets.map(p=>`<option value="${hubEsc(p.id)}" ${p.id===HUBV12.kdsPresetId?'selected':''}>${hubEsc(p.name)} · ${p.mode==='delivery'?'Entrega':'Produção'}</option>`).join('')}</select>`;
  }
}
function hubKdsOpen(){
  let p=hubKdsPreset();if(!p)return;
  const allowed=mode=>(mode==='delivery'?getMyPerms().includes('salao-view'):getMyPerms().includes('kds-view'));
  if(!allowed(p.mode)){const fallback=db.hubKdsPresets.find(x=>allowed(x.mode));if(fallback){HUBV12.kdsPresetId=fallback.id;p=fallback;}else return showCustomAlert('Seu perfil não tem acesso a nenhuma visualização KDS.');}
  if(p.mode==='delivery' && !getMyPerms().includes('salao-view'))return showCustomAlert('Seu perfil não possui acesso ao modo Entrega.');
  if(p.mode==='production'&&!getMyPerms().includes('kds-view'))return showCustomAlert('Seu perfil não possui acesso ao modo Produção.');
  hubKdsMountSelectors();
  if(p.mode==='delivery'){
    SALAO.filter='todos';SALAO.page=0;
    switchViewAndClose('salao-view');
    document.getElementById('hub-delivery-title').textContent='🛎️ KDS — '+p.name;
    salaoRenderizar();
  }else{
    KDS.mode='cozinha';KDS.station='selecionadas';KDS.view='pendentes';KDS.page=0;
    KDS.categorySelections.cozinha=hubKdsCategories(p);
    switchViewAndClose('kds-view');
    document.getElementById('kds-mode-heading').textContent='🍕 KDS — '+p.name;
    kdsRenderizar();
  }
}
function hubKdsEscolher(id){
  if(!db.hubKdsPresets.some(p=>p.id===id))return;
  HUBV12.kdsPresetId=id;
  try{localStorage.setItem('partigiana_kds_preset_v12',id);}catch(e){}
  hubKdsOpen();
}
function hubKdsDeliveryCategoriesOpen(){
 const p=hubKdsPreset();if(!p||p.mode!=='delivery')return;
 const selected=new Set(hubKdsCategories(p));
 const html=`<p>Escolha uma ou mais categorias para filtrar APENAS este dispositivo. As seleções ficam destacadas e só entram em vigor ao confirmar.</p><div class="hub-categories">${kdsCategoriasDisponiveis().map(c=>`<label class="hub-category-pill" data-delivery-label><input type="checkbox" value="${hubEsc(c)}" ${selected.has(c)?'checked':''} onchange="this.parentElement.classList.toggle('hub-selected',this.checked)">${hubEsc(c)}</label>`).join('')}</div>`;
 estoqueAbrirModal('Categorias — KDS de entrega',html,'Confirmar filtro',()=>{
  const chosen=[...document.querySelectorAll('[data-delivery-label] input:checked')].map(e=>e.value);
  if(!chosen.length)return showCustomAlert('Selecione ao menos uma categoria.');
  try{localStorage.setItem('partigiana_kds_override_v12_'+p.id,JSON.stringify(chosen));}catch(e){}
  closeMiniModal();SALAO.page=0;salaoRenderizar();
 });
}
function hubKdsApplyManualFilter(){
  const p=hubKdsPreset();if(!p)return;
  if(KDS.station!=='selecionadas')return;
  try{localStorage.setItem('partigiana_kds_override_v12_'+p.id,JSON.stringify(kdsCategoriasSelecionadas()));}catch(e){}
}
function hubKdsConfigForMode(mode){
  const p=hubKdsPreset();if(!p||p.mode!==mode)return null;
  return Object.fromEntries(['fontSize','visibleItems','columns','rows'].map(k=>[k,Number(p[k])]));
}
function hubKdsDeliveryItems(order){const p=hubKdsPreset(),cats=hubKdsCategories(p);
  return (order.items||[]).filter(i=>!i.cancelled && kdsCategoriasItem(i).some(c=>cats.includes(c)));
}
function hubKdsPresetEditor(){
  const area=document.getElementById('admin-list-area');if(!area)return;
  const rows=db.hubKdsPresets.map(p=>`<div class="menu-item-card" style="cursor:default"><div class="item-info"><strong>${hubEsc(p.name)}</strong><span class="item-subtitle">${p.mode==='delivery'?'Entrega':'Produção'} • ${(p.categories||[]).map(hubEsc).join(', ')||'Sem categorias'} • ${p.columns}×${p.rows}</span></div><div class="item-actions"><button onclick="hubKdsPresetForm('${hubEsc(p.id)}')">Editar</button><button onclick="hubKdsPresetRemove('${hubEsc(p.id)}')">Excluir</button></div></div>`).join('');
  area.innerHTML=`<div class="hub-panel"><div class="hub-heading"><div><h3>Visualizações do KDS</h3><p>Compartilhadas no cadastro. O filtro ativo de cada computador fica local.</p></div><button class="btn-success" onclick="hubKdsPresetForm()">+ Visualização</button></div>${rows}</div>`;
}
function hubKdsPresetForm(id){
  if(!hubCanManage())return showCustomAlert('Somente administradores alteram visualizações.');
  const p=db.hubKdsPresets.find(x=>x.id===id);
  const cats=kdsCategoriasDisponiveis();
  const html=`<div class="form-group"><label>Nome da visualização</label><input id="hub-preset-name" maxlength="45" value="${hubEsc(p?.name||'')}"></div>
    <div class="form-group"><label>Modo</label><select id="hub-preset-mode"><option value="production" ${p?.mode!=='delivery'?'selected':''}>Produção (Pronto)</option><option value="delivery" ${p?.mode==='delivery'?'selected':''}>Entrega (Entregue)</option></select></div>
    <div class="hub-categories">${cats.map(c=>`<label class="hub-category-pill"><input type="checkbox" data-preset-cat value="${hubEsc(c)}" ${(p?.categories||[]).includes(c)?'checked':''}>${hubEsc(c)}</label>`).join('')}</div>
    <div class="hub-form-grid">${[['fontSize','Letra (14–28)',20,14,28],['visibleItems','Itens visíveis (1–10)',3,1,10],['columns','Colunas (1–8)',5,1,8],['rows','Linhas (1–4)',2,1,4]].map(([k,label,def,min,max])=>`<div class="form-group"><label>${label}</label><input type="number" id="hub-preset-${k}" min="${min}" max="${max}" value="${p?.[k]||def}"></div>`).join('')}</div>`;
  estoqueAbrirModal(p?'Editar visualização':'Nova visualização',html,'Salvar',()=>{
    const name=document.getElementById('hub-preset-name').value.trim();const mode=document.getElementById('hub-preset-mode').value;
    const categories=[...document.querySelectorAll('[data-preset-cat]:checked')].map(i=>i.value);
    const cfg={};let ok=true;
    for(const [key,min,max] of [['fontSize',14,28],['visibleItems',1,10],['columns',1,8],['rows',1,4]]){const n=Number(document.getElementById('hub-preset-'+key).value);if(!Number.isInteger(n)||n<min||n>max)ok=false;cfg[key]=n;}
    if(!name||!categories.length||!ok)return showCustomAlert('Informe nome, categorias e medidas válidas.');
    if(p)Object.assign(p,{name,mode,categories,...cfg});else db.hubKdsPresets.push({id:String(hubId()),name,mode,categories,...cfg});
    hubSave();closeMiniModal();hubKdsPresetEditor();hubKdsMountSelectors();
  });
}
function hubKdsPresetRemove(id){
  if(!hubCanManage())return;
  if(db.hubKdsPresets.length<=1)return showCustomAlert('Deixe ao menos uma visualização cadastrada.');
  showCustomConfirm('Remover esta visualização? Os filtros de outros dispositivos não serão alterados.',()=>{
    db.hubKdsPresets=db.hubKdsPresets.filter(p=>p.id!==id);if(HUBV12.kdsPresetId===id)HUBV12.kdsPresetId=db.hubKdsPresets[0].id;
    hubSave();hubKdsPresetEditor();hubKdsMountSelectors();
  });
}

// FILA DE ESPERA — ordem original preservada e prioridade sugerida por capacidade.
function hubQueueActive(status){return [...db.hubWaitlist].filter(x=>x.status===status).sort((a,b)=>new Date(a.arrivedAt)-new Date(b.arrivedAt));}
function hubQueueNext(capacity=Infinity){return hubQueueActive('waiting').find(x=>x.people<=capacity)||null;}
function hubQueueAdd(name,people,phone){
  name=String(name||'').trim();phone=String(phone||'').trim();people=Number(people);
  if(!name||!phone||!Number.isInteger(people)||people<1||people>100)return {ok:false,error:'Informe nome, telefone e quantidade válida de pessoas.'};
  const item={id:hubId(),name,people,phone,status:'waiting',arrivedAt:new Date().toISOString(),calledAt:null,seatedAt:null,tableId:null,history:[{action:'Entrada na fila',at:new Date().toISOString(),operatorId:currentSessionUser?.id||null}]};
  db.hubWaitlist.push(item);hubSave();return {ok:true,item};
}
function hubQueueTransition(id,status,tableId=null){
  const item=db.hubWaitlist.find(x=>x.id===id);if(!item||!['waiting','called','seated','left'].includes(status))return false;
  if(item.status==='seated'||item.status==='left')return false;
  if(status==='seated'){
    if(item.status!=='called')return false;
    const table=db.hubFloor.tables.find(t=>t.id===tableId);
    if(!table||table.status!=='free'||item.people>table.capacity)return false;
    table.status='occupied';item.seatedAt=new Date().toISOString();item.tableId=table.id;
  }
  if(status==='called'){item.calledAt=new Date().toISOString();}
  if(status==='waiting'){item.calledAt=null;}
  item.status=status;item.history.push({action:{called:'Chamado',waiting:'Voltou para espera',seated:'Sentou na mesa',left:'Desistiu/não compareceu'}[status],at:new Date().toISOString(),operatorId:currentSessionUser?.id??null,tableId:tableId||null});
  hubSave();hubQueueRender();if(status==='seated' && document.getElementById('floor-view')?.classList.contains('active'))hubFloorRender();return true;
}
function hubQueueAddFromForm(){const r=hubQueueAdd(document.getElementById('hub-w-name')?.value,document.getElementById('hub-w-people')?.value,document.getElementById('hub-w-phone')?.value);if(!r.ok)return showCustomAlert(r.error);document.getElementById('hub-w-name').value='';document.getElementById('hub-w-phone').value='';hubQueueRender();}
function hubQueueSeatPrompt(id){
  const entry=db.hubWaitlist.find(x=>x.id===id);if(!entry||entry.status!=='called')return;
  const tables=db.hubFloor.tables.filter(t=>t.status==='free'&&t.capacity>=entry.people);
  if(!tables.length)return showCustomAlert('Nenhuma mesa livre com capacidade suficiente.');
  estoqueAbrirModal('Encaminhar '+entry.name+' para mesa',`<div class="form-group"><label>Mesa disponível</label><select id="hub-seat-table">${tables.map(t=>`<option value="${t.id}">${hubEsc(t.name)} • ${t.capacity} lugares</option>`).join('')}</select></div><p>O grupo sairá da fila e a mesa ficará ocupada. A comanda poderá ser aberta pelo PDV.</p>`,'Confirmar ocupação',()=>{
    if(!hubQueueTransition(id,'seated',document.getElementById('hub-seat-table').value))return showCustomAlert('A mesa deixou de estar livre ou não comporta o grupo.');
    closeMiniModal();hubQueueRender();
  });
}
function hubQueueRender(){
  const area=document.getElementById('hub-wait-area');if(!area)return;
  const waiting=hubQueueActive('waiting'),called=hubQueueActive('called');
  const free=db.hubFloor.tables.filter(t=>t.status==='free');const capacity=Math.max(0,...free.map(t=>t.capacity));
  const next=hubQueueNext(capacity);
  const card=(p,status)=>`<article class="hub-ticket"><div class="hub-ticket-main"><div><strong>${hubEsc(p.name)}</strong><small>${p.people} pessoa(s) • <a href="tel:${hubEsc(String(p.phone).replace(/[^0-9+]/g,''))}">${hubEsc(p.phone)}</a></small></div><div class="hub-ticket-clock"><span>Na fila: <b data-hub-time="${hubEsc(p.arrivedAt)}">${hubTime(p.arrivedAt)}</b></span>${p.calledAt?`<span>Chamado há: <b data-hub-called="true" data-hub-time="${hubEsc(p.calledAt)}">${hubTime(p.calledAt)}</b></span>`:''}${next?.id===p.id&&status==='waiting'?'<span class="hub-chip hub-success">Próximo compatível</span>':''}</div></div><div class="hub-actions">
    ${status==='waiting'?`<button class="btn-success" onclick="hubQueueTransition(${p.id},'called')">📣 Chamar</button>`:
      `<button class="btn-home" onclick="hubQueueTransition(${p.id},'called')">Chamar novamente</button><button class="btn-success" onclick="hubQueueSeatPrompt(${p.id})">✓ Encaminhar à mesa</button><button class="btn-home" onclick="hubQueueTransition(${p.id},'waiting')">Voltar à fila</button>`}
    <button class="btn-home hub-danger-outline" onclick="hubQueueLeave(${p.id})">Registrar desistência</button></div></article>`;
  area.innerHTML=`<div class="hub-stats"><div><small>Aguardando</small><strong>${waiting.length}</strong></div><div><small>Chamados</small><strong>${called.length}</strong></div><div><small>Mesas livres</small><strong>${free.length}</strong></div><div><small>Próximo na fila</small><strong class="hub-stat-small">${waiting.length?hubEsc(waiting[0].name):'—'}</strong><small>${next?'Compatível: '+hubEsc(next.name):'Sem mesa compatível livre'}</small></div></div>
   <div class="hub-form-card"><h3>Nova entrada</h3><div class="hub-form-grid"><div class="form-group"><label>Nome</label><input id="hub-w-name" maxlength="80" placeholder="Responsável pelo grupo"></div><div class="form-group"><label>Pessoas</label><input id="hub-w-people" type="number" min="1" max="100" value="2"></div><div class="form-group"><label>Telefone</label><input id="hub-w-phone" type="tel" maxlength="24" placeholder="(61) 99999-9999"></div><button class="btn-success" onclick="hubQueueAddFromForm()">+ Colocar na fila</button></div></div>
   <div class="hub-two-col"><section><div class="hub-section-title"><h3>⏳ Aguardando (${waiting.length})</h3><small>Ordem de entrada preservada</small></div>${waiting.map(p=>card(p,'waiting')).join('')||'<div class="hub-empty">Nenhum grupo aguardando.</div>'}</section><section><div class="hub-section-title"><h3>📣 Chamados (${called.length})</h3><small>Somente o atendente encerra a chamada</small></div>${called.map(p=>card(p,'called')).join('')||'<div class="hub-empty">Nenhum grupo chamado.</div>'}</section></div>
   <details class="hub-form-card"><summary>Histórico de atendimentos (${db.hubWaitlist.filter(x=>['seated','left'].includes(x.status)).length})</summary><div class="hub-history">${[...db.hubWaitlist].filter(x=>['seated','left'].includes(x.status)).reverse().slice(0,50).map(x=>`<div>${hubEsc(x.name)} · ${x.people} pessoa(s) · ${x.status==='seated'?'Sentou':'Desistiu'} · ${hubDate(x.arrivedAt)}</div>`).join('')||'Ainda sem atendimentos encerrados.'}</div></details>`;
}
function hubQueueLeave(id){const p=db.hubWaitlist.find(x=>x.id===id);if(!p)return;showCustomConfirm('Registrar que '+p.name+' desistiu ou não compareceu?',()=>hubQueueTransition(id,'left'),'Encerrar espera');}

// DISPONIBILIDADE: alertas por estoque NÃO bloqueiam. Bloqueios explícitos sim.
function hubAvailabilityReasons(product){
  if(!product)return ['Produto não encontrado'];
  const a=db.hubAvailability||{};const reasons=[];
  if(a.products?.[product.id]?.blocked)reasons.push('Produto bloqueado: '+(a.products[product.id].reason||'indisponível'));
  const recipe=estoqueReceita('product',product.id);
  for(const line of recipe?.lines||[]){const ing=db.stockIngredients.find(i=>i.id===line.ingredientId);
    if(ing && a.ingredients?.[ing.id]?.blocked)reasons.push('Insumo bloqueado: '+ing.name);
  }
  return reasons;
}
function hubStockWarnings(product){
  const recipe=estoqueReceita('product',product.id);if(!recipe?.lines?.length)return ['Ficha técnica não cadastrada'];
  const warnings=[];
  for(const line of recipe.lines){const ing=db.stockIngredients.find(x=>x.id===line.ingredientId);if(!ing)warnings.push('Insumo não encontrado');else if(Number(ing.qty)<Number(line.qty))warnings.push(ing.name+' insuficiente');}
  return warnings;
}
function hubModifierReasons(mod){
 if(!mod)return ['Adicional não encontrado'];
 const reasons=[];const direct=db.hubAvailability?.modifiers?.[mod.id];
 if(direct?.blocked)reasons.push('Modificador bloqueado: '+(direct.reason||'indisponível'));
 const r=estoqueReceita('modifier',mod.id);
 for(const line of r?.lines||[]){const ing=db.stockIngredients.find(i=>i.id===line.ingredientId);
 if(ing && db.hubAvailability?.ingredients?.[ing.id]?.blocked)reasons.push('Insumo bloqueado: '+ing.name);
 }
 return reasons;
}
function hubAvailabilityItem(item){
  const product=db.products.find(x=>String(x.id)===String(item.id));return product?hubAvailabilityReasons(product):[];
}
function hubAvailabilityToggle(kind,id,blocked){
  if(!getMyPerms().includes('stock-view')&&!hubCanManage())return showCustomAlert('Sem permissão para disponibilidade.');
  const entity=kind==='ingredients'?db.stockIngredients.find(i=>String(i.id)===String(id)):kind==='modifiers'?db.modifiers.find(m=>String(m.id)===String(id)):db.products.find(p=>String(p.id)===String(id));
  if(!entity)return;
  if(!blocked){delete db.hubAvailability[kind][id];db.hubAvailability.history.push({kind,id,blocked:false,operatorId:currentSessionUser?.id||null,date:new Date().toISOString()});hubSave();hubAvailabilityRender();return;}
  showCustomPrompt('Motivo do bloqueio de '+entity.name+':','',reason=>{
    reason=String(reason||'').trim();if(!reason)return showCustomAlert('Informe um motivo para o bloqueio.');
    db.hubAvailability[kind][id]={blocked:true,reason:reason.slice(0,180),at:new Date().toISOString(),operatorId:currentSessionUser?.id||null};
    db.hubAvailability.history.push({kind,id,blocked:true,reason:reason.slice(0,180),operatorId:currentSessionUser?.id||null,date:new Date().toISOString()});hubSave();hubAvailabilityRender();
  },'Bloquear '+entity.name);
}
function hubAvailabilityRender(){
  const area=document.getElementById('hub-availability-area');if(!area)return;
  const makeRow=(entity,kind)=>{const state=db.hubAvailability[kind]?.[entity.id];const blocked=!!state?.blocked;
    const warnings=kind==='products'?hubStockWarnings(entity):kind==='ingredients'&&Number(entity.qty)<=Number(entity.minQty)?['Estoque mínimo atingido']:[];
    const reasons=kind==='products'?hubAvailabilityReasons(entity):kind==='modifiers'?hubModifierReasons(entity):[];
    return `<div class="hub-availability-row"><div><strong>${hubEsc(entity.name)}</strong><small>${kind==='ingredients'?`${estoqueNum(entity.qty)} ${hubEsc(entity.unit)} em estoque`:`${(entity.categories||[]).map(hubEsc).join(', ')}`}</small>${warnings.length?`<span class="hub-chip hub-warning">⚠ ${hubEsc(warnings.join(' • '))} — apenas alerta</span>`:''}${reasons.length?`<span class="hub-chip hub-danger">⛔ ${hubEsc(reasons.join(' • '))}</span>`:''}</div><button class="${blocked?'btn-home':'btn-success'}" onclick="hubAvailabilityToggle('${kind}',${entity.id},${blocked?'false':'true'})">${blocked?'✓ Desbloquear':'Bloquear'}</button></div>`;};
  area.innerHTML=`<div class="hub-panel"><div class="hub-heading"><h3>Disponibilidade e alertas</h3><p>Falta de estoque apenas AVISA. O bloqueio depende de ação autorizada. Produtos bloqueados continuam visíveis no PDV.</p></div></div>
   <div class="hub-two-col"><section class="hub-panel"><h3>Insumos</h3>${db.stockIngredients.map(x=>makeRow(x,'ingredients')).join('')}</section><section class="hub-panel"><h3>Produtos do cardápio</h3>${db.products.map(x=>makeRow(x,'products')).join('')}</section></div><section class="hub-panel"><h3>Adicionais e retiradas</h3>${db.modifiers.map(x=>makeRow(x,'modifiers')).join('')||'<p class="hub-muted">Nenhum modificador cadastrado.</p>'}</section>`;
}

// MAPA DE MESAS — coordenadas são independentes da identidade da mesa.
function hubFloorSync(){
  const f=db.hubFloor;
  db.tables.forEach((name,index)=>{
    if(!f.tables.some(t=>t.name===name))f.tables.push({id:'mesa-'+String(hubId()),name,capacity:4,status:'free',x:115+(index%5)*174,y:112+Math.floor(index/5)*140,baseX:115+(index%5)*174,baseY:112+Math.floor(index/5)*140,shape:'square',rotation:0});
  });
}
function hubFloorData(){return db.hubFloor;}
function hubFloorIsBusy(name){return db.orders.some(o=>!o.archived && o.status==='preparo'&&o.table===name);}
function hubFloorPoint(event){const svg=document.getElementById('hub-floor-svg');if(!svg)return {x:0,y:0};const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const m=svg.getScreenCTM();if(!m)return {x:0,y:0};const v=p.matrixTransform(m.inverse());return {x:Math.max(10,Math.min(990,v.x)),y:Math.max(10,Math.min(550,v.y))};}
function hubFloorDraw(){
  const f=hubFloorData(),svg=document.getElementById('hub-floor-svg');if(!svg)return;
  const edit=HUBV12.floorMode==='edit';
  svg.innerHTML=`<defs><pattern id="hub-floor-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#92a99d" stroke-opacity=".25" stroke-width="1"/></pattern></defs>
     <rect x="2" y="2" width="996" height="556" rx="12" fill="#fbfaf6" stroke="#d6ded8" stroke-width="3"/><rect width="1000" height="560" fill="url(#hub-floor-grid)" pointer-events="none"/>
     ${(f.walls||[]).map((w,i)=>`<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${w.kind==='door'?'#dc9c45':'#567066'}" stroke-width="${w.kind==='door'?7:9}" stroke-linecap="round" ${w.kind==='door'?'stroke-dasharray="22 9"':''}/>`).join('')}
     ${HUBV12.drawing?`<circle cx="${HUBV12.drawing.x}" cy="${HUBV12.drawing.y}" r="9" fill="#d98a39"/>`:''}
     ${f.tables.map(t=>{const x=edit?t.baseX:t.x,y=edit?t.baseY:t.y;const busy=hubFloorIsBusy(t.name);const color=busy?'#cc8d3a':({free:'#138d66',occupied:'#cc8d3a',cleaning:'#808d94',reserved:'#4778b2'}[t.status]||'#138d66');
       return `<g class="hub-floor-table" data-table="${hubEsc(t.id)}" style="cursor:${HUBV12.floorMode==='wall'?'crosshair':'grab'}" transform="translate(${x},${y}) rotate(${t.rotation||0})"><rect x="-52" y="-35" width="104" height="70" rx="${t.shape==='round'?35:10}" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="3"/><text text-anchor="middle" y="-1" font-size="18" font-weight="700" fill="#24483c">${hubEsc(t.name)}</text><text text-anchor="middle" y="21" font-size="13" fill="#476154">${busy?'Com pedido':{free:'Livre',occupied:'Ocupada',cleaning:'Limpeza',reserved:'Reservada'}[t.status]}</text></g>`;}).join('')}`;
}
function hubFloorRender(){
  const area=document.getElementById('hub-floor-area');if(!area)return;hubFloorSync();
  const edit=HUBV12.floorMode==='edit';
  area.innerHTML=`<div class="hub-panel"><div class="hub-heading"><div><h3>Mapa do salão</h3><p>Mesas mantêm identificação e pedidos ao mudar de lugar. Edição não altera a planta da operação até aplicar.</p></div><div class="hub-actions"><button class="${!edit&&HUBV12.floorMode!=='wall'?'btn-success':'btn-home'}" onclick="hubFloorMode('operate')">🏠 Operação</button><button class="${edit?'btn-success':'btn-home'}" onclick="hubFloorMode('edit')">📐 Editar planta padrão</button><button class="${HUBV12.floorMode==='wall'?'btn-success':'btn-home'}" onclick="hubFloorMode('wall')">╱ Desenhar parede</button><button class="${HUBV12.floorMode==='door'?'btn-success':'btn-home'}" onclick="hubFloorMode('door')">🚪 Porta / abertura</button></div></div>
     <div class="hub-actions hub-floor-tools"><button class="btn-home" onclick="hubFloorSaveLayout()">💾 Salvar disposição</button><button class="btn-home" onclick="hubFloorLayouts()">📂 Disposições salvas</button><button class="btn-home" onclick="hubFloorRestore()">↺ Restaurar planta padrão</button><button class="btn-success" onclick="hubFloorNewTable()">+ Mesa</button>${HUBV12.floorMode==='wall'?'<button class="btn-home" onclick="hubFloorUndoWall()">↶ Remover última parede</button>':''}</div>
     <p class="hub-muted">${edit?'Arraste mesas para definir o layout permanente.':HUBV12.floorMode==='wall'?'Clique nos dois pontos de início e fim de cada parede. O desenho vale para a planta padrão.':'Arraste uma mesa para mudar a disposição de hoje; clique na mesa para definir capacidade e situação.'}</p>
     <div class="hub-floor-scroll"><svg id="hub-floor-svg" viewBox="0 0 1000 560" role="img" aria-label="Planta editável da pizzaria" tabindex="0"></svg></div></div>
     <div class="hub-panel"><h3>Legenda</h3><div class="hub-actions"><span class="hub-chip hub-success">● Livre</span><span class="hub-chip hub-warning">● Ocupada</span><span class="hub-chip">● Aguardando limpeza</span><span class="hub-chip">● Reservada</span></div><p class="hub-muted">O status da mesa não fecha contas ou entrega pedidos automaticamente.</p></div>`;
  hubFloorDraw();hubFloorBind();
}
function hubFloorMode(mode){if(!['operate','edit','wall','door'].includes(mode))return;if(mode!=='operate'&&!hubCanManage())return showCustomAlert('Somente administradores editam a planta.');HUBV12.floorMode=mode;HUBV12.drawing=null;hubFloorRender();}
function hubFloorBind(){
  const svg=document.getElementById('hub-floor-svg');if(!svg)return;
  svg.addEventListener('pointerdown',e=>{
    const target=e.target.closest('[data-table]');
    if(['wall','door'].includes(HUBV12.floorMode))return;
    if(!target||e.button!==0)return;
    const table=db.hubFloor.tables.find(t=>t.id===target.dataset.table);if(!table)return;
    HUBV12.dragging={id:table.id,started:hubFloorPoint(e),changed:false,mode:HUBV12.floorMode};
    svg.setPointerCapture(e.pointerId);e.preventDefault();
  });
  svg.addEventListener('pointermove',e=>{
    const drag=HUBV12.dragging;if(!drag)return;
    const table=db.hubFloor.tables.find(t=>t.id===drag.id);if(!table)return;
    const pt=hubFloorPoint(e);const deltaX=pt.x-drag.started.x,deltaY=pt.y-drag.started.y;
    if(Math.abs(deltaX)+Math.abs(deltaY)<3)return;
    drag.changed=true;
    const keyX=drag.mode==='edit'?'baseX':'x',keyY=drag.mode==='edit'?'baseY':'y';
    table[keyX]=Math.max(58,Math.min(942,(drag.originX??=table[keyX])+deltaX));
    table[keyY]=Math.max(40,Math.min(520,(drag.originY??=table[keyY])+deltaY));
    hubFloorDraw();
  });
  svg.addEventListener('pointerup',e=>{
    if(['wall','door'].includes(HUBV12.floorMode)){
      const point=hubFloorPoint(e);
      if(!HUBV12.drawing){HUBV12.drawing=point;hubFloorDraw();}
      else {const start=HUBV12.drawing;HUBV12.drawing=null;if(Math.hypot(start.x-point.x,start.y-point.y)>8){db.hubFloor.walls.push({x1:Math.round(start.x),y1:Math.round(start.y),x2:Math.round(point.x),y2:Math.round(point.y),kind:HUBV12.floorMode});hubSave();}hubFloorDraw();}
      return;
    }
    const drag=HUBV12.dragging;HUBV12.dragging=null;if(!drag)return;
    if(drag.changed){hubSave();}else hubFloorTableForm(drag.id);
  });
  svg.addEventListener('pointercancel',()=>{HUBV12.dragging=null;});
}
function hubFloorTableForm(id){
  const t=db.hubFloor.tables.find(x=>x.id===id);if(!t)return;
  const statuses={free:'Livre',occupied:'Ocupada',cleaning:'Aguardando limpeza',reserved:'Reservada'};
  const active=hubFloorIsBusy(t.name);
  estoqueAbrirModal('Mesa: '+t.name,`<p>Identificador permanente: <strong>${hubEsc(t.name)}</strong></p><div class="form-group"><label>Capacidade (pessoas)</label><input type="number" id="hub-table-cap" min="1" max="30" value="${t.capacity}"></div>
    <div class="form-group"><label>Formato</label><select id="hub-table-shape"><option value="square" ${t.shape==='square'?'selected':''}>Retangular</option><option value="round" ${t.shape==='round'?'selected':''}>Redonda</option></select></div>
    <div class="form-group"><label>Situação da mesa</label><select id="hub-table-status">${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('')}</select></div>
    <p class="hub-muted">${active?'Há uma comanda em preparo nesta mesa. Não é permitido liberá-la.':'A situação é operacional e não altera o histórico de vendas.'}</p><button class="btn-home" type="button" onclick="hubFloorRotate('${hubEsc(id)}')">⟳ Girar mesa 90°</button>${active?'':`<button class="btn-home hub-danger-outline" onclick="hubFloorDelete('${hubEsc(id)}')">Remover mesa</button>`}`,'Salvar mesa',()=>{
      const cap=Number(document.getElementById('hub-table-cap').value),status=document.getElementById('hub-table-status').value;
      if(!Number.isInteger(cap)||cap<1||cap>30)return showCustomAlert('Capacidade inválida.');
      if(!statuses[status])return;
      if(status==='free'&&hubFloorIsBusy(t.name))return showCustomAlert('Há um pedido ativo nessa mesa.');
      t.capacity=cap;t.status=status;t.shape=document.getElementById('hub-table-shape').value;hubSave();closeMiniModal();hubFloorRender();
    });
}
function hubFloorRotate(id){const t=db.hubFloor.tables.find(x=>x.id===id);if(!t)return;t.rotation=((Number(t.rotation)||0)+90)%360;hubSave();closeMiniModal();hubFloorRender();}
function hubFloorNewTable(){
 if(!hubCanManage())return showCustomAlert('Apenas administradores adicionam mesas.');
 showCustomPrompt('Nome/número da nova mesa:','Mesa '+String(db.tables.length+1).padStart(2,'0'),name=>{
   name=String(name||'').trim();if(!name||db.tables.includes(name))return showCustomAlert('Nome vazio ou já cadastrado.');
   db.tables.push(name);hubFloorSync();hubSave();hubFloorRender();
 },'Adicionar mesa');
}
function hubFloorDelete(id){if(!hubCanManage())return;const t=db.hubFloor.tables.find(x=>x.id===id);if(!t||hubFloorIsBusy(t.name))return showCustomAlert('Não é possível excluir mesa com pedido ativo.');showCustomConfirm('Excluir permanentemente '+t.name+' do cadastro de mesas?',()=>{
  db.hubFloor.tables=db.hubFloor.tables.filter(x=>x.id!==id);db.tables=db.tables.filter(x=>x!==t.name);hubSave();closeMiniModal();hubFloorRender();
});}
function hubFloorUndoWall(){if(!hubCanManage())return;db.hubFloor.walls.pop();HUBV12.drawing=null;hubSave();hubFloorRender();}
function hubFloorRestore(){showCustomConfirm('Restaurar a posição padrão de todas as mesas, sem alterar pedidos ou situação?',()=>{db.hubFloor.tables.forEach(t=>{t.x=t.baseX;t.y=t.baseY;});hubSave();hubFloorRender();});}
function hubFloorSaveLayout(){
  showCustomPrompt('Nome da disposição para salvar:','Dia de chuva',name=>{
    name=String(name||'').trim();if(!name)return;
    db.hubFloor.layouts.push({id:hubId(),name:name.slice(0,55),date:new Date().toISOString(),positions:db.hubFloor.tables.map(t=>({id:t.id,x:t.x,y:t.y}))});hubSave();hubFloorRender();
  },'Salvar disposição');
}
function hubFloorLayouts(){
  const layouts=db.hubFloor.layouts;estoqueAbrirModal('Disposições salvas',layouts.map(l=>`<div class="hub-availability-row"><strong>${hubEsc(l.name)}</strong><button class="btn-home" onclick="hubFloorApplyLayout(${l.id})">Aplicar</button></div>`).join('')||'<p>Nenhuma disposição salva.</p>','Fechar',closeMiniModal);
}
function hubFloorApplyLayout(id){const layout=db.hubFloor.layouts.find(x=>x.id===id);if(!layout)return;showCustomConfirm('Aplicar disposição '+layout.name+'? Mesas e pedidos manterão suas identidades.',()=>{
 for(const pos of layout.positions){const t=db.hubFloor.tables.find(x=>x.id===pos.id);if(t){t.x=pos.x;t.y=pos.y;}}hubSave();closeMiniModal();hubFloorRender();
});}

// PLANEJAMENTO DE PRODUÇÃO — produção real, transferência para espera e liberação auditada.
function hubProductionDef(id){return preparosDefinicao(id);}
function hubProductionHours(outputId){const d=hubProductionDef(outputId),ing=preparosItem(outputId);return Math.max(0,Number(d?.fermentationHours??(/massa/i.test(ing?.name||'')?48:0)));}
function hubProductionAwaiting(id){return db.stockBatches.filter(b=>String(b.outputIngredientId)===String(id)&&b.hubStatus==='fermenting').reduce((sum,b)=>sum+Number(b.hubRemaining??b.outputQty),0);}
function hubProductionDemand(id,dateStr){
  const day=new Date(dateStr+'T12:00:00').getDay();
  const from=Date.now()-42*86400000;
  const map=new Map();
  for(const o of db.orders){const when=new Date(o.date);if(when.getTime()<from||o.status==='cancelado')continue;
    const key=`${when.getFullYear()}-${String(when.getMonth()+1).padStart(2,'0')}-${String(when.getDate()).padStart(2,'0')}`;const used=(o.items||[]).filter(x=>!x.cancelled).reduce((sum,item)=>{
      const recipe=estoqueReceita('product',item.id);return sum+(recipe?.lines||[]).filter(x=>String(x.ingredientId)===String(id)).reduce((s,l)=>s+Number(l.qty),0);
    },0);map.set(key,(map.get(key)||0)+used);
  }
  const byDay=[...map.entries()].filter(([date])=>new Date(date+'T12:00:00').getDay()===day).map(([,n])=>n);
  const all=[...map.values()];return Math.ceil(byDay.length?byDay.reduce((a,b)=>a+b,0)/byDay.length:all.length?all.reduce((a,b)=>a+b,0)/all.length:0);
}
function hubProductionSuggest(id,dateStr,safety=15){
 const item=preparosItem(id);if(!item)return 0;
 const predicted=hubProductionDemand(id,dateStr)*(1+Number(safety)/100);
 const ready=Number(item.qty)||0;const pending=hubProductionAwaiting(id);
 return Math.max(0,Math.ceil(predicted-ready-pending));
}
function hubProductionPlan(outputIngredientId,targetQty,needDate,margin=15,note=''){
  const item=preparosItem(outputIngredientId),q=Number(targetQty),date=new Date(needDate);
  if(!item||!hubProductionDef(item.id)||!Number.isFinite(q)||q<=0||(item.unit==='un'&&!Number.isInteger(q))||!Number.isFinite(date.getTime()))return {ok:false,error:'Informe preparo, quantidade e data válidos.'};
  const plan={id:hubId(),outputIngredientId,expectedQty:q,neededAt:date.toISOString(),margin:Number(margin)||0,status:'planned',createdAt:new Date().toISOString(),note:String(note).slice(0,180),operatorId:currentSessionUser?.id||null};
  db.hubPlans.push(plan);hubSave();return {ok:true,plan};
}
function hubProductionOpenPlan(){
 const selects=db.stockPreparations.map(p=>{const ing=preparosItem(p.outputIngredientId);return ing?`<option value="${ing.id}">${hubEsc(ing.name)}</option>`:'';}).join('');
 if(!selects)return showCustomAlert('Cadastre pré-preparos no estoque antes de planejar.');
 const tomorrow=new Date(Date.now()+2*86400000);const local=new Date(tomorrow.getTime()-tomorrow.getTimezoneOffset()*60000).toISOString().slice(0,16);
 estoqueAbrirModal('Planejar produção',`<div class="form-group"><label>Pré-preparo</label><select id="hub-plan-item" onchange="hubProductionUpdateSuggestion()">${selects}</select></div>
 <div class="hub-form-grid"><div class="form-group"><label>Data necessária</label><input id="hub-plan-date" type="datetime-local" value="${local}" onchange="hubProductionUpdateSuggestion()"></div><div class="form-group"><label>Margem de segurança (%)</label><input id="hub-plan-margin" type="number" min="0" max="100" value="15" oninput="hubProductionUpdateSuggestion()"></div></div>
 <div class="hub-alert" id="hub-plan-suggestion"></div><div class="form-group"><label>Quantidade que deseja produzir</label><input type="number" id="hub-plan-target" min="0.001" step="0.001"></div>
 <div class="form-group"><label>Observação</label><input id="hub-plan-note" maxlength="180" placeholder="Ex.: sexta-feira movimentada"></div>`,'Criar planejamento',()=>{
  const itemId=Number(document.getElementById('hub-plan-item').value),target=Number(document.getElementById('hub-plan-target').value);
  const r=hubProductionPlan(itemId,target,document.getElementById('hub-plan-date').value,Number(document.getElementById('hub-plan-margin').value),document.getElementById('hub-plan-note').value);
  if(!r.ok)return showCustomAlert(r.error);closeMiniModal();hubProductionRender();
 });hubProductionUpdateSuggestion();
}
function hubProductionUpdateSuggestion(){
 const item=preparosItem(Number(document.getElementById('hub-plan-item')?.value));if(!item)return;
 const date=document.getElementById('hub-plan-date')?.value;const margin=Number(document.getElementById('hub-plan-margin')?.value)||0;
 const demand=hubProductionDemand(item.id,date?.slice(0,10));const suggestion=hubProductionSuggest(item.id,date?.slice(0,10),margin);
 document.getElementById('hub-plan-suggestion').innerHTML=`Estimativa baseada nas vendas registradas (se houver): <b>${estoqueNum(demand)} ${hubEsc(item.unit)}</b>. Disponível: <b>${estoqueNum(item.qty)}</b>. Fermentando: <b>${estoqueNum(hubProductionAwaiting(item.id))}</b>. Quantidade sugerida: <b>${estoqueNum(suggestion)}</b>.<br><small>Se não houver histórico suficiente, ajuste manualmente a quantidade.</small>`;
 const target=document.getElementById('hub-plan-target');if(target&&!target.dataset.userEdited){target.value=Math.max(suggestion,item.unit==='un'?1:0.001);target.oninput=()=>{target.dataset.userEdited='yes';};}
}
function hubProductionBeginPlan(id){
 const p=db.hubPlans.find(x=>x.id===id);
 if(!p||p.status!=='planned')return {ok:false,error:'Planejamento não está aguardando início.'};
 p.status='in_progress';p.startedAt=new Date().toISOString();p.startedBy=currentSessionUser?.id??null;hubSave();hubProductionRender();return {ok:true};
}
function hubProductionOpenStart(planId=null,outputId=null){
 const plan=db.hubPlans.find(p=>p.id===planId);const id=plan?.outputIngredientId??outputId;const item=preparosItem(id),def=hubProductionDef(id);
 if(!item||!def)return showCustomAlert('Pré-preparo não cadastrado.');
 if(plan && !['planned','in_progress'].includes(plan.status))return showCustomAlert('Este planejamento já foi concluído.');
 const lines=def.defaultInputs||[];
 estoqueAbrirModal('Registrar produção real: '+item.name,`<p>Informe quantos produtos REALMENTE foram produzidos e o consumo real de ingredientes. A receita é só referência.</p>
 <div class="hub-form-grid"><div class="form-group"><label>Quantidade produzida (${hubEsc(item.unit)})</label><input id="hub-batch-qty" type="number" min="0.001" step="${item.unit==='un'?'1':'0.001'}" value="${plan?.expectedQty??def.referenceYield??''}"></div>
 <div class="form-group"><label>Tempo previsto de fermentação/descanso (horas)</label><input id="hub-batch-hours" type="number" min="0" max="720" step="0.5" value="${hubProductionHours(item.id)}"></div></div>
 <h4>Insumos realmente consumidos</h4><div id="hub-batch-lines" class="hub-input-lines"></div><button type="button" class="btn-home" onclick="hubProductionAddLine(${id})">+ Ingrediente</button>
 <div class="form-group"><label>Observações do lote</label><textarea id="hub-batch-note" rows="2" placeholder="Ex.: fermentação mais lenta"></textarea></div>
 <p class="hub-alert">Após registrar, os insumos serão baixados imediatamente, mas o pré-preparo ficará em espera. Só ficará disponível para vendas após liberação autorizada.</p>`,'Registrar lote e iniciar descanso',()=>{
  const q=Number(document.getElementById('hub-batch-qty').value),hours=Number(document.getElementById('hub-batch-hours').value);
  const inputs=[...document.querySelectorAll('#hub-batch-lines .hub-batch-line')].map(row=>({ingredientId:Number(row.querySelector('select').value),qty:Number(row.querySelector('input').value)}));
  const r=hubProductionRegister(planId,id,q,inputs,hours,document.getElementById('hub-batch-note').value);
  if(!r.ok)return showCustomAlert(r.error,'Produção não registrada');closeMiniModal();hubProductionRender();
 });
 for(const line of lines)hubProductionAddLine(id,line);if(!lines.length)hubProductionAddLine(id);
}
function hubProductionAddLine(outputId,line){
 const root=document.getElementById('hub-batch-lines');if(!root)return;
 const options=db.stockIngredients.filter(i=>i.id!==outputId).map(i=>`<option value="${i.id}" ${i.id===line?.ingredientId?'selected':''}>${hubEsc(i.name)} (${hubEsc(i.unit)} · saldo ${estoqueNum(i.qty)})</option>`).join('');
 root.insertAdjacentHTML('beforeend',`<div class="hub-batch-line"><select>${options}</select><input type="number" min="0.001" step="0.001" placeholder="Qtd." value="${line?.qty??''}"><button type="button" class="btn-home" onclick="this.parentElement.remove()">✕</button></div>`);
}
function hubProductionRegister(planId,outputId,outputQty,inputs,hours,note=''){
 const plan=db.hubPlans.find(p=>p.id===planId);if(planId!=null &&(!plan||!['planned','in_progress'].includes(plan.status)||plan.outputIngredientId!==outputId))return {ok:false,error:'Planejamento indisponível ou já concluído.'};
 if(!Number.isFinite(hours)||hours<0||hours>720)return {ok:false,error:'Duração inválida.'};
 const result=preparosRegistrarLote(outputId,outputQty,inputs,{note});if(!result.ok)return result;
 const b=result.batch,ing=preparosItem(outputId);const transfer=estoqueMovimentar(outputId,-b.outputQty,'Transferência para fermentação/descanso (indisponível)',{batchId:b.id,batchRole:'pending'});
 if(!transfer)throw Error('Falha ao transferir produto para espera.');
 b.hubStatus='fermenting';b.hubRemaining=b.outputQty;b.hubHours=hours;b.hubReleaseAt=new Date(Date.now()+hours*3600000).toISOString();b.hubProductionAt=new Date().toISOString();b.hubEvents=[{event:'Produção iniciada',at:b.hubProductionAt,operatorId:currentSessionUser?.id??null}];
 if(plan){plan.status='fermenting';plan.batchId=b.id;}
 hubSave();return {ok:true,batch:b};
}
function hubProductionCanRelease(){return hubCanManage()||getMyPerms().includes('production-release');}
function hubProductionRelease(batchId,reason=''){
 if(!hubProductionCanRelease())return {ok:false,error:'Seu perfil não possui permissão para liberar lotes.'};
 const batch=db.stockBatches.find(b=>b.id===batchId);if(!batch||batch.hubStatus!=='fermenting')return {ok:false,error:'Lote não está aguardando liberação.'};
 const early=new Date(batch.hubReleaseAt).getTime()>Date.now();if(early&&!String(reason).trim())return {ok:false,error:'Liberação antecipada exige justificativa.'};
 const qty=Number(batch.hubRemaining);if(qty<=0)return {ok:false,error:'Lote sem quantidade restante.'};
 if(!estoqueMovimentar(batch.outputIngredientId,qty,'Liberação do lote para consumo',{batchId:batch.id,batchRole:'release',operatorId:currentSessionUser?.id??null}))return {ok:false,error:'Não foi possível disponibilizar o lote.'};
 batch.hubStatus='released';batch.hubRemaining=0;batch.hubReleasedAt=new Date().toISOString();batch.hubReleasedBy=currentSessionUser?.id??null;batch.hubReleaseNote=String(reason).trim();
 batch.hubEvents.push({event:'Liberado para consumo',at:batch.hubReleasedAt,operatorId:batch.hubReleasedBy,reason:batch.hubReleaseNote});
 const plan=db.hubPlans.find(p=>p.batchId===batch.id);if(plan)plan.status='released';hubSave();return {ok:true};
}
function hubProductionReleasePrompt(id){
 const b=db.stockBatches.find(x=>x.id===id);if(!b)return;
 if(!hubProductionCanRelease())return showCustomAlert('Somente funcionários autorizados podem liberar lotes.');
 const early=Date.now()<new Date(b.hubReleaseAt).getTime();
 showCustomPrompt(early?'O prazo previsto ainda não terminou. Informe a justificativa obrigatória:':'Observações da conferência (opcional):','',reason=>{
   const r=hubProductionRelease(id,reason);if(!r.ok)return showCustomAlert(r.error);hubProductionRender();
 },'Liberar lote');
}
function hubProductionDiscard(id,qty,reason){
 const b=db.stockBatches.find(x=>x.id===id);const q=Number(qty);
 if(!b||b.hubStatus!=='fermenting'||!Number.isFinite(q)||q<=0||q>b.hubRemaining||(b.outputUnit==='un'&&!Number.isInteger(q))||!String(reason||'').trim())return {ok:false,error:'Quantidade ou justificativa inválida.'};
 b.hubRemaining=estoqueArred(b.hubRemaining-q);b.hubEvents.push({event:'Descarte durante fermentação',at:new Date().toISOString(),operatorId:currentSessionUser?.id??null,qty:q,reason:String(reason).slice(0,180)});
 if(b.hubRemaining<=0){b.hubStatus='discarded';const p=db.hubPlans.find(x=>x.batchId===b.id);if(p)p.status='discarded';}hubSave();return {ok:true};
}
function hubProductionDiscardPrompt(id){const b=db.stockBatches.find(x=>x.id===id);if(!b)return;
 estoqueAbrirModal('Descartar parte do lote',`<p>Lote: ${hubEsc(b.outputName)}. Em espera: ${estoqueNum(b.hubRemaining)} ${hubEsc(b.outputUnit)}.</p><div class="form-group"><label>Quantidade descartada</label><input id="hub-discard-qty" type="number" min="0.001" step="${b.outputUnit==='un'?'1':'0.001'}" max="${b.hubRemaining}"></div><div class="form-group"><label>Motivo</label><input id="hub-discard-reason" maxlength="180"></div>`,'Registrar descarte',()=>{
 const r=hubProductionDiscard(id,document.getElementById('hub-discard-qty').value,document.getElementById('hub-discard-reason').value);if(!r.ok)return showCustomAlert(r.error);closeMiniModal();hubProductionRender();
 });
}
function hubProductionCancelPlan(id){const p=db.hubPlans.find(x=>x.id===id);if(!p||p.status!=='planned')return;
 showCustomConfirm('Cancelar este planejamento ainda não iniciado?',()=>{p.status='cancelled';hubSave();hubProductionRender();});
}
function hubProductionRender(){
 const area=document.getElementById('hub-production-area');if(!area)return;
 const plans=[...db.hubPlans].reverse().filter(p=>p.status!=='cancelled');
 const pending=[...db.stockBatches].filter(b=>b.hubStatus==='fermenting').reverse();
 const ready=[...db.stockBatches].filter(b=>b.hubStatus==='released').reverse().slice(0,12);
 const products=db.stockPreparations.map(p=>preparosItem(p.outputIngredientId)).filter(Boolean);
 area.innerHTML=`<div class="hub-panel"><div class="hub-heading"><div><h3>Planejamento de produção</h3><p>Registre quantidades reais. Lotes em descanso não ficam disponíveis até a liberação manual.</p></div><button class="btn-success" onclick="hubProductionOpenPlan()">+ Planejar lote</button></div>
 <div class="hub-stats"><div><small>Planejados</small><strong>${plans.filter(p=>['planned','in_progress'].includes(p.status)).length}</strong></div><div><small>Em descanso</small><strong>${pending.length}</strong></div><div><small>Tipos de pré-preparo</small><strong>${products.length}</strong></div></div></div>
 <div class="hub-two-col"><section class="hub-panel"><h3>🗓 Planejamentos</h3>${plans.map(p=>{
   const i=preparosItem(p.outputIngredientId);if(!i)return '';return `<article class="hub-ticket"><strong>${hubEsc(i.name)} · ${estoqueNum(p.expectedQty)} ${hubEsc(i.unit)}</strong><small>Necessário em ${hubDate(p.neededAt)} · ${p.status==='planned'?'Aguardando produção':p.status==='in_progress'?'Em produção':p.status==='fermenting'?'Em descanso':p.status==='released'?'Liberado':'Encerrado'}</small>
   ${p.status==='planned'?`<div class="hub-actions"><button class="btn-success" onclick="hubProductionBeginPlan(${p.id})">▶ Iniciar produção</button><button class="btn-home" onclick="hubProductionCancelPlan(${p.id})">Cancelar plano</button></div>`:p.status==='in_progress'?`<div class="hub-actions"><button class="btn-success" onclick="hubProductionOpenStart(${p.id})">✓ Registrar produção real e iniciar descanso</button></div>`:''}</article>`;
 }).join('')||'<div class="hub-empty">Ainda não há planejamentos.</div>'}</section>
 <section class="hub-panel"><h3>🍞 Lotes em fermentação ou descanso</h3>${pending.map(b=>`<article class="hub-ticket"><strong>${hubEsc(b.outputName)} · ${estoqueNum(b.hubRemaining)} ${hubEsc(b.outputUnit)}</strong><small>Produzido: ${hubDate(b.date)} · Prazo previsto: ${hubDate(b.hubReleaseAt)}</small><span class="hub-chip ${Date.now()>=new Date(b.hubReleaseAt).getTime()?'hub-success':'hub-warning'}">${Date.now()>=new Date(b.hubReleaseAt).getTime()?'Pronto para conferência':'Aguardando prazo'}</span>
 <div class="hub-actions"><button class="btn-success" onclick="hubProductionReleasePrompt(${b.id})">✓ Liberar lote</button><button class="btn-home" onclick="hubProductionDiscardPrompt(${b.id})">Registrar perda</button></div></article>`).join('')||'<div class="hub-empty">Nenhum lote aguardando liberação.</div>'}</section></div>
 <section class="hub-panel"><h3>Registrar produção sem planejamento prévio</h3><div class="hub-actions">${products.map(p=>`<button class="btn-home" onclick="hubProductionOpenStart(null,${p.id})">+ ${hubEsc(p.name)}</button>`).join('')||'<p>Cadastre um pré-preparo no Estoque primeiro.</p>'}</div></section>
 <section class="hub-panel"><h3>Últimos lotes liberados</h3>${ready.map(b=>`<div class="hub-availability-row"><span>${hubEsc(b.outputName)} · ${estoqueNum(b.outputQty)} ${hubEsc(b.outputUnit)}</span><span class="hub-chip hub-success">Liberado ${hubDate(b.hubReleasedAt)}</span></div>`).join('')||'<div class="hub-empty">Nenhum lote liberado nesta versão.</div>'}</section>`;
}
