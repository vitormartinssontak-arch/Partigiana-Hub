# Partigiana HUB — publicação no GitHub Pages

Versão web estática do Partigiana HUB, baseada na v1.2. Os arquivos da aplicação estão **na raiz do repositório**, com `index.html` como página inicial. Os módulos de PDV, Kanban, estoque, pré-preparos, lotes, compras, KDS, fila de espera e mapa de mesas permanecem disponíveis.

## Publicar sem instalar ferramentas

1. Crie um **repositório separado** do Rails/PostgreSQL do seu sócio.
2. No repositório, escolha **Add file → Upload files** e envie **o conteúdo desta pasta**, incluindo `index.html`, todos os arquivos `.js`, `.css` e `.nojekyll`. Não envie só o ZIP e não deixe o `index.html` dentro de uma subpasta.
3. Faça **Commit changes**.
4. Em **Settings → Pages**, selecione **Deploy from a branch**, branch `main` e diretório `/(root)`; salve.
5. Aguarde a publicação e acesse `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

É possível abrir `index.html` diretamente no Chrome; para reproduzir o uso web, prefira o endereço do GitHub Pages.

## Primeiro acesso

- **Usuário inicial:** `teste`
- **Senha inicial:** `teste123`

Você pode editar usuários e permissões dentro da interface, mas **isso não é autenticação segura**: a aplicação é inteiramente client-side. Quem acessa os arquivos públicos consegue inspecionar e modificar o código. **Não use senhas reais nem informações pessoais de clientes nessa publicação.** A senha inicial é apenas uma conveniência de navegação.

## Onde ficam os dados?

**No armazenamento local do navegador (`localStorage`)**, identificado pelo endereço do site e pelo dispositivo. O GitHub Pages não fornece banco de dados ou login de servidor. Portanto:

- As alterações de um computador **não aparecem em outro**. Abra o sistema no mesmo navegador para recuperar seus dados.
- Navegadores distintos ou limpeza de dados podem apagar os registros locais.
- No módulo Estoque, use **Exportar dados do estoque (JSON)** antes de limpar os dados. Essa exportação não é um backup completo de todos os módulos.
- A publicação **não se conecta** ao Firebase antigo nem ao PostgreSQL do seu sócio.

## Impressão de comandas com QZ Tray

1. Instale e execute o **QZ Tray** no computador ligado à impressora (por exemplo, Elgin i9).
2. Tenha a impressora instalada no Windows e confirme que consegue imprimir por lá.
3. Abra o site do Partigiana HUB **no próprio computador que está executando o QZ Tray**.
4. Acesse **Impressão (KDS)** em Configurações.
5. Clique em **Buscar impressoras**, selecione a impressora e clique em **Usar esta impressora**.
6. Clique em **Imprimir comanda de teste**. A comanda é identificada como teste, sem criar venda.
7. Para imprimir ao registrar um pedido, marque **Imprimir comanda na cozinha (QZ Tray)** na janela do PDV.

A página utiliza a biblioteca `qz-tray` por CDN, portanto a internet deve estar disponível. O QZ Tray pode solicitar autorização ou mostrar avisos de assinatura para impressões não assinadas. A autorização de impressão deve ser concedida **apenas para a sua publicação confiável**. Para implantação comercial silenciosa, será necessário configurar assinatura digital de mensagens do QZ Tray e um backend apropriado.

Esta versão envia comandas **não fiscais** via ESC/POS; não emite NFC-e nem se comunica com a SEFAZ.

## Segurança e limites técnicos

O sistema abre com aparência e ferramentas de uso normal, sem travas de demonstração, mas **a publicação estática não é adequada para registrar vendas reais ou operar com diversos funcionários**: não há autenticação no servidor, banco de dados compartilhado, concorrência transacional, backups remotos, controle de permissões confiável ou integração fiscal. Essas capacidades dependem da futura adaptação para Rails/PostgreSQL.

Evite subir para um repositório público certificados `.pfx`/`.p12`, chaves da SEFAZ, arquivos `.env`, senhas, dados pessoais ou qualquer segredo da pizzaria.

## Código e compatibilidade

As alterações específicas para publicação estão concentradas em `index.html`, `impressao-web.js`, `salao.css` e textos do módulo `estoque.js`. O restante da base v1.2 foi preservado para facilitar comparação e migração posterior.
