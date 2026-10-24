

##  Sistema de Automação Fiscal e Leitura de XML (NF-e / NFC-e / NFS-E) v3.0

Solução automatizada desenvolvida em **Google Apps Script** para o **Google Planilhas**. O sistema realiza a leitura, parseamento e consolidação contábil de arquivos XML de notas fiscais de produtos (NF-e/NFC-e) e serviços (NFS-e), com suporte a busca automática no **Gmail** e integração com pastas do **Google Drive**.

---

##  Índice
- [Recursos Principais](#-recursos-principais)
- [Estrutura da Planilha](#-estrutura-da-planilha)
- [Como Instalar](#-como-instalar)
- [Como Configurar](#-como-configurar)
- [Como Usar](#-como-usar)
- [Visão Geral do Código](#-visão-geral-do-código)
- [Tratamento de Erros e Logs](#-tratamento-de-erros-e-logs)

---

##  Recursos Principais

- **Leitura Híbrida de XML:**
  - **NF-e / NFC-e (Produtos):** Extrai totais, impostos (ICMS, IPI, PIS, COFINS) e quebra detalhada de itens para estoque.
  - **NFS-e (Serviços):** Leitura agnóstica de padrões municipais (ABRASF, Ginfes, Betha, etc.), capturando ISS, retentores (IR, INSS, CSLL) e discriminação do serviço.
- **Integração com Gmail:** Varre e-mails não lidos buscando anexos XML e salva diretamente na pasta do Drive.
- **Anti-Duplicidade:** Verifica chaves de acesso (44 dígitos) ou códigos de verificação/RPS antes do lançamento.
- **Hyperlinks Automáticos:** Gera link direto para consulta pública da NF-e no portal da SEFAZ(beta).
- **Execução Automática (Gatilhos):** Configuração em um clique para rodar diariamente às 08h.
- **Isolamento de Erros & Alertas:** Move arquivos corrompidos para a pasta de erro e envia e-mail de notificação.

---

##  Estrutura da Planilha

O script inicializa e gerencia automaticamente **4 abas** na sua planilha:

| Aba | Descrição |
| :--- | :--- |
| `Dados_Fiscais` | Consolidação contábil unificada (23 colunas) com valores, impostos e status. |
| `Detalhes_Itens` | Detalhamento de produtos contidos nas NF-es (Código, EAN, NCM, CFOP, Qtde, Valores e ICMS). |
| `Config` | Armazena os IDs das pastas do Google Drive e o e-mail de alerta. |
| `Log` | Histórico de execução contendo data, nome do arquivo, status e detalhes. |
![pag-init](https://github.com/ildem96/AUTOMACAO-FISCAL-E-LEITURA-DE-XML---Spreadsheet-Google/blob/main/src/tela_01_dados_dados_fiscais.png?raw=true)

---

##  Como Instalar

1. Abra sua planilha no **Google Planilhas**.
2. No menu superior, acesse **Extensões** > **Apps Script**.
3. Apague o código padrão que estiver no editor (`Code.gs`) e cole o código fonte desse repositório.
4. Cole o código-fonte completo do sistema no console do google apps script.
5. Clique no ícone de **Salvar** ou pressione `Ctrl + S`.
6. Atualize a página da sua planilha. O menu **`📄 NF-e Automações`** aparecerá na barra superior conforme imagem.
7. ![botao-menu](https://github.com/ildem96/AUTOMACAO-FISCAL-E-LEITURA-DE-XML---Spreadsheet-Google/blob/main/src/menu_automacao.png?raw=true)

---

##  Como Configurar?

### 1. Criar as Pastas no Google Drive com os mesmos nomes que estão planilha na aba "Config" na coluna A(Parâmetros).
Crie **3 pastas** no seu Google Drive (ou utilize pastas existentes) da seguinte maneira:
   1. **Origem:** Onde você/clientes depositam os XMLs novos.
   2. **Processados:** Para onde os XMLs lidos com sucesso serão movidos.
   3. **Erros:** Para onde os XMLs inválidos ou corrompidos serão isolados.

### 2. Obter os IDs das Pastas

O ID da pasta é o código alfanumérico ao final da URL no navegador:
- Exemplo pasta no Drive: `https://drive.google.com/drive/folders/`**`1698123456789-4`**
![id-googleDrive](https://github.com/ildem96/AUTOMACAO-FISCAL-E-LEITURA-DE-XML---Spreadsheet-Google/blob/main/src/id_pasta_drive_exemplo.png?raw=true)

- Exemplo na planilha: `https://docs.google.com/spreadsheets/d/`**`1698123456789-4`**`/edit?gid=35111204#gid=35111204`
![id-googleDrive](https://github.com/ildem96/AUTOMACAO-FISCAL-E-LEITURA-DE-XML---Spreadsheet-Google/blob/main/src/id_sheets.png?raw=true)

### 3. Salvar as Configurações na Planilha

1. Na planilha, acesse o menu **`📄 NF-e Automações` > `⚙️ Configurar Pastas e E-mail`**.
2. Preencha os campos solicitados no prompt do sistema:
   - **PASTA_ORIGEM:** ID da pasta de novos XMLs.
   - **PASTA_PROCESSADOS:** ID da pasta de sucessos.
   - **PASTA_ERROS:** ID da pasta de falhas.
   - **EMAIL_ALERTA:** Seu e-mail para receber notificações de erro.

> 💡 *Você também pode clicar em `🛠️ Inicializar Estrutura da Planilha` para criar as abas manualmente antes de configurar dentro do Menu `NF-e Automações`.*
![menu](https://github.com/ildem96/AUTOMACAO-FISCAL-E-LEITURA-DE-XML---Spreadsheet-Google/blob/main/src/menu_automacao.png?raw=true)
---

##  Como Usar

### Menu Personalizado (`📄 NF-e Automações`)

- **`🚀 Processar XMLs da Pasta`:** Processa manualmente todos os arquivos `.xml` presentes na pasta de Origem do Drive configurado anteriormente.
- **`📬 Buscar XMLs no Gmail e Processar`:** Baixa anexos XML de e-mails não lidos no Gmail cadastrado na aba "Config" e roda o processamento em seguida.
- **`⏱️ Automação Diária (Gatilhos)`:**
  - *Ativar Execução Diária:* Executa a busca no Gmail e processamento no Drive automaticamente todos os dias às 08h.
  - *Desativar Execução Automática:* Remove os gatilhos agendados.
- **`📋 Ver Log de Processamento`:** Redireciona rapidamente para a aba de logs para verificar quais XMLs foram processadas e quais deram erro.
- **`❓ Como Usar / Ajuda`:** Abre a janela de documentação e uso.

---

##  Visão Geral do Código

| Função | Finalidade |
| :--- | :--- |
| `onOpen()` | Constrói o menu dinâmico no Google Sheets. |
| `configurarPastas()` | Modal interativo para inserir e salvar os IDs na aba `Config`. |
| `buscarXmlsGmail()` | Busca no Gmail por filtros (`has:attachment`, `filename:xml`, etc.) e salva no Drive. |
| `processarNotasFiscais()` | Motor principal: lê a pasta, aciona o roteador, insere em lote (batch) e move os arquivos. |
| `rotearEExtrairXML()` | Identifica se o documento é **NF-e (SEFAZ)** ou **NFS-e (Municipal)** e aciona o parser adequado. |
| `extrairNFeProduto()` | Extrai dados de produtos, totais fiscais e a lista de itens (`<det>`). |
| `extrairNFSeServico()` | Parser agnóstico para serviços, capturando impostos retidos e alertas do lote. |
| `buscarNosAgnosticos()` | Navega recursivamente pelo XML ignorando *namespaces* das prefeituras. |
| `carregarChavesExistentes()` | Carrega as chaves já cadastradas para impedir duplicação. |
| `criarGatilhoDiario()` | Configura o gatilho de tempo (`Time-driven`) no Apps Script. |

---

##  Tratamento de Erros e Logs

- **Aba `Log`:** Registra execuções bem-sucedidas, arquivos duplicados ignorados e mensagens de erro de leitura.
- **Isolamento de Arquivos:** XMLs com erro são movidos automaticamente para a pasta definida em `PASTA_ERROS`.
- **Alertas por E-mail:** Se a função `enviarAlertaEmail()` for acionada, um e-mail detalhado contendo a data/hora e a causa do erro é enviado para o endereço cadastrado na aba `Config`.
- ![mensagem-erro](https://github.com/ildem96/AUTOMACAO-FISCAL-E-LEITURA-DE-XML---Spreadsheet-Google/blob/main/src/email_erro.png?raw=true)

## Script Rodando
![planilha-rodando](https://github.com/ildem96/AUTOMACAO-FISCAL-E-LEITURA-DE-XML---Spreadsheet-Google/blob/main/src/animacao_funcionamento.gif?raw=true)

