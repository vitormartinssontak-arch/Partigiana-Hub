/* Impressão ESC/POS por QZ Tray. Preferência de impressora SOMENTE neste navegador. */
(function () {
  'use strict';
  const KEY = 'partigiana_impressora_local_v1';
  window.impressaoNomeSelecionado = function () {
    try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; }
  };
  function status(m) {
    const el = document.getElementById('cfg-printer-status');
    if (el) el.textContent = m;
  }
  function qzConectar() {
    if (typeof qz === 'undefined') {
      return Promise.reject(new Error('Biblioteca QZ Tray indisponível. Verifique a conexão com a internet.'));
    }
    if (qz.websocket.isActive()) return Promise.resolve();
    return qz.websocket.connect();
  }
  window.impressaoConectar = qzConectar;
  window.impressaoListar = async function () {
    status('Procurando o QZ Tray...');
    try {
      await qzConectar();
      const found = await qz.printers.find();
      const printers = Array.isArray(found) ? found : (found ? [found] : []);
      const el = document.getElementById('cfg-printer-name');
      if (!el) return;
      const saved = impressaoNomeSelecionado();
      el.replaceChildren();
      el.add(new Option('Padrão do Windows', ''));
      for (const p of printers) el.add(new Option(String(p), String(p)));
      if (saved && !printers.includes(saved)) el.add(new Option(saved + ' (não localizada)', saved));
      el.value = saved;
      status(printers.length + ' impressora(s) encontrada(s). Selecione e clique em Usar esta impressora.');
    } catch (e) {
      status('Não foi possível consultar impressoras.');
      showCustomAlert('Abra o QZ Tray no Windows e tente novamente. Detalhe: ' + String(e?.message || e), 'Impressoras');
    }
  };
  window.impressaoSalvarDispositivo = function () {
    const el = document.getElementById('cfg-printer-name');
    if (!el) return;
    try { localStorage.setItem(KEY, el.value || ''); } catch(e) { return showCustomAlert('Não foi possível salvar a preferência neste navegador.'); }
    status(el.value ? 'Impressora escolhida: ' + el.value : 'Usando a impressora padrão do Windows.');
    showCustomAlert('Preferência de impressora salva neste navegador.', 'Impressora');
  };
  window.impressaoTestar = function () {
    if (!impressaoNomeSelecionado()) {
      status('Usando a impressora padrão. Você pode selecionar uma impressora específica.');
    }
    const available = (db.categories || []).find(c => c.imprimeCozinha);
    const testItem = {id: -1, name: 'COMANDA DE TESTE', categories: [available?.name || 'Pizzas Salgadas'], modifiers: [], obs: 'Teste de impressão ESC/POS'};
    printTicket({id: Date.now(), date: new Date().toISOString(), table: 'Teste de impressora', client: 'Partigiana HUB', payment: '-', items: [testItem], printTest: true});
  };
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('cfg-printer-name');
    if (select) {
      const saved = impressaoNomeSelecionado();
      if (saved) select.add(new Option(saved, saved, false, true));
      status(saved ? 'Impressora escolhida: ' + saved : 'Impressora padrão do Windows. Clique em Buscar impressoras para selecionar outra.');
    }
  });
})();
