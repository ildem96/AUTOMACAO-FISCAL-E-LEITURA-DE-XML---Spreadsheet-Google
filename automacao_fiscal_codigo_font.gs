/*
  ============================================================================
  SISTEMA DE AUTOMAÇÃO FISCAL E LEITURA DE XML (NF-E / NFC-E / NFS-E) v3.0
  ============================================================================
 */

const NFE_NS = XmlService.getNamespace('http://www.portalfiscal.inf.br/nfe');
const URL_CONSULTA_SEFAZ = 'https://www.nfe.fazenda.gov.br/portal/consultaRecibo.aspx?tipoConsulta=completa&tipoConteudo=XbSeqxE8pl8%3D&nfe=';

/*
 1. INTERFACE DO USUÁRIO
  - Cria o menu na tela do google sheets
 */
function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('📄 NF-e Automatoções')
        .addItem('🚀 Processar XMLs da Pasta', 'processarNotasFiscais')
        .addItem('📬 Buscar XMLs no Gmail e Processar', 'buscarXmlsGmailEProcessar')
        .addSeparator()
        .addItem('⚙️ Configurar Pastas e E-mail', 'configurarPastas')
        .addItem('🛠️ Inicializar Estrutura da Planilha', 'inicializarPlanilhas')
        .addSeparator()
        .addSubMenu(ui.createMenu('⏱️ Automação Diária (Gatilhos)')
            .addItem('Ativar Execução Diária (às 08h)', 'criarGatilhoDiario')
            .addItem('Desativar Execução Automática', 'removerGatilhos'))
        .addSeparator()
        .addItem('📋 Ver Log de Processamento', 'verLog')
        .addItem('❓ Como Usar / Ajuda', 'mostrarComoUsar')
        .addToUi();
}

/**
 * 2. CONFIGURAÇÕES DO SISTEMA
 */
function configurarPastas() {
    const ui = SpreadsheetApp.getUi();
    inicializarPlanilhas();
    const abaConfig = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');

    const configs = [
        { linha: 2, chave: 'PASTA_ORIGEM', nome: 'Pasta de Origem (XMLs novos)' },
        { linha: 3, chave: 'PASTA_PROCESSADOS', nome: 'Pasta de Processados (Sucesso)' },
        { linha: 4, chave: 'PASTA_ERROS', nome: 'Pasta de Erros (XMLs inválidos)' },
        { linha: 5, chave: 'EMAIL_ALERTA', nome: 'E-mail para alertas de erro no processamento' }
    ];

    let atualizados = 0;
    for (const item of configs) {
        const valorAtual = abaConfig.getRange(item.linha, 2).getValue();
        const resposta = ui.prompt(
            'Configuração de Parâmetros',
            `Insira o valor para: ${item.nome}\n(Valor atual: ${valorAtual || 'Não configurado'})`,
            ui.ButtonSet.OK_CANCEL
        );

        if (resposta.getSelectedButton() === ui.Button.OK) {
            const novoValor = resposta.getResponseText().trim();
            if (novoValor) {
                abaConfig.getRange(item.linha, 2).setValue(novoValor);
                atualizados++;
            }
        } else {
            break;
        }
    }

    if (atualizados > 0) {
        Browser.msgBox('Sucesso', 'Configurações salvas com sucesso!', Browser.Buttons.OK);
    }
}

/**
 * 3. INTEGRAÇÃO COM GMAIL
 */
function buscarXmlsGmail() {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const abaConfig = planilha.getSheetByName('Config');
    if (!abaConfig) throw new Error('Aba Config não encontrada.');

    const idOrigem = abaConfig.getRange('B2').getValue().toString().trim();
    if (!idOrigem) throw new Error('ID da Pasta de Origem não configurado.');

    const pastaOrigem = DriveApp.getFolderById(idOrigem);
    const threads = GmailApp.search('has:attachment is:unread (filename:xml OR subject:"nota fiscal" OR subject:"nfe" OR subject:"nfse")');

    let arquivosSalvos = 0;
    for (const thread of threads) {
        const mensagens = thread.getMessages();
        let threadProcessada = false;

        for (const msg of mensagens) {
            if (msg.isUnread()) {
                const anexos = msg.getAttachments();
                for (const anexo of anexos) {
                    if (anexo.getName().toLowerCase().endsWith('.xml')) {
                        pastaOrigem.createFile(anexo.copyBlob());
                        arquivosSalvos++;
                        threadProcessada = true;
                    }
                }
            }
        }
        if (threadProcessada) thread.markRead();
    }

    if (arquivosSalvos > 0) {
        registrarLog('Gmail', 'Integração E-mail', `${arquivosSalvos} arquivo(s) XML baixado(s) para o Google Drive.`);
    }
    return arquivosSalvos;
}

function buscarXmlsGmailEProcessar() {
    try {
        const qtd = buscarXmlsGmail();
        if (qtd > 0) {
            processarNotasFiscais();
        } else {
            Browser.msgBox('Gmail', 'Nenhum novo arquivo XML encontrado em e-mails não lidos.', Browser.Buttons.OK);
        }
    } catch (e) {
        Browser.msgBox('Erro no Gmail', `Falha ao buscar e-mails: ${e.message}`, Browser.Buttons.OK);
    }
}

/**
 * 4. MOTOR PRINCIPAL DE PROCESSAMENTO E ROTEAMENTO
 */
function processarNotasFiscais() {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    inicializarPlanilhas();

    const abaDados = planilha.getSheetByName('Dados_Fiscais');
    const abaItens = planilha.getSheetByName('Detalhes_Itens');
    const abaConfig = planilha.getSheetByName('Config');

    const idOrigem = abaConfig.getRange('B2').getValue().toString().trim();
    const idProcessados = abaConfig.getRange('B3').getValue().toString().trim();
    const idErros = abaConfig.getRange('B4').getValue().toString().trim();
    const emailAlerta = abaConfig.getRange('B5').getValue().toString().trim();

    if (!idOrigem || !idProcessados) {
        Browser.msgBox('Atenção', 'Configure os IDs das pastas de Origem e Processados antes de executar.', Browser.Buttons.OK);
        return;
    }

    let pastaOrigem, pastaProcessados, pastaErros;
    try {
        pastaOrigem = DriveApp.getFolderById(idOrigem);
        pastaProcessados = DriveApp.getFolderById(idProcessados);
        if (idErros) pastaErros = DriveApp.getFolderById(idErros);
    } catch (e) {
        Browser.msgBox('Erro no Drive', 'Falha ao acessar pastas. Verifique as permissões e IDs.', Browser.Buttons.OK);
        return;
    }

    const chavesExistentes = carregarChavesExistentes(abaDados);
    const arquivos = pastaOrigem.getFiles();

    let totalProcessados = 0;
    let totalDuplicados = 0;
    let totalErros = 0;
    const novasLinhasDados = [];
    const novasLinhasItens = [];

    while (arquivos.hasNext()) {
        const arquivo = arquivos.next();
        const nomeArquivo = arquivo.getName();

        if (!nomeArquivo.toLowerCase().endsWith('.xml')) continue;

        try {
            const xmlString = arquivo.getBlob().getDataAsString('UTF-8');
            // ROTEADOR: Identifica e extrai tanto NF-e (Produtos) quanto NFS-e (Serviços)
            const notasExtraidas = rotearEExtrairXML(xmlString);

            if (!notasExtraidas || notasExtraidas.length === 0) {
                throw new Error('Nenhuma estrutura de Nota Fiscal (Produto ou Serviço) válida foi encontrada no XML.');
            }

            let arquivoTemDuplicidade = false;

            for (const nota of notasExtraidas) {
                // Previne duplicidade por Chave de Acesso ou Cód. Verificação / RPS
                const identificadorUnico = nota.chaveOuCodigo || `${nota.numNota}_${nota.cnpjEmitente}`;

                if (verificarDuplicidade(identificadorUnico, chavesExistentes)) {
                    registrarLog('Duplicado', nomeArquivo, `Documento ${identificadorUnico} já consta na planilha.`);
                    totalDuplicados++;
                    arquivoTemDuplicidade = true;
                    continue;
                }

                // Monta o Link Oficial SEFAZ se for nota de Produto; caso contrário entra o texto normal
                let celulaIdentificador = identificadorUnico;
                if (nota.tipo === 'PRODUTO' && identificadorUnico.length === 44) {
                    celulaIdentificador = `=HYPERLINK("${URL_CONSULTA_SEFAZ}${identificadorUnico}"; "${identificadorUnico}")`;
                }

                // Linha contábil unificada (23 colunas)
                const linhaDados = [
                    new Date(),                   // 1. Data Processamento
                    nota.tipo,                    // 2. Tipo (PRODUTO / SERVIÇO)
                    celulaIdentificador,          // 3. Chave Acesso / Cód. Verificação
                    nota.numNota,                 // 4. Num Nota / RPS
                    nota.dataEmissao,             // 5. Data Emissão
                    nota.cnpjEmitente,            // 6. CNPJ/CPF Prestador ou Emitente
                    nota.nomeFornecedor,          // 7. Nome Emitente / Prestador
                    nota.vProdServ,               // 8. Valor Produtos / Serviços
                    nota.vFreteDeduc,             // 9. Valor Frete / Deduções
                    nota.vSeg,                    // 10. Valor Seguro
                    nota.vDesc,                   // 11. Valor Desconto
                    nota.vII_IR_INSS,             // 12. Vl. II / IR / INSS
                    nota.vIPI,                    // 13. Valor IPI
                    nota.vPIS,                    // 14. Valor PIS
                    nota.vCOFINS,                 // 15. Valor COFINS
                    nota.vOutroCSLL,              // 16. Outras Despesas / CSLL
                    nota.vTotalLiquido,           // 17. Valor Total / Líquido
                    nota.vTotTrib,                // 18. Tributos Aproximados
                    nota.vIcmsIss,                // 19. Valor ICMS / ISS
                    nota.vBaseCalc,               // 20. Base Cálculo ICMS / ISS
                    nota.issRetido || '-',        // 21. ISS Retido? (Sim/Não)
                    nota.discriminacaoAlerta,     // 22. Discriminação do Serviço / Alertas
                    'Processado'                  // 23. Status
                ];

                novasLinhasDados.push(linhaDados);
                chavesExistentes.add(identificadorUnico);

                // Se houver itens de produto, insere na aba de Estoque
                if (nota.itens && nota.itens.length > 0) {
                    for (const item of nota.itens) {
                        novasLinhasItens.push([
                            new Date(),
                            identificadorUnico,
                            nota.numNota,
                            nota.dataEmissao,
                            nota.nomeFornecedor,
                            item.cProd,
                            item.cEAN,
                            item.xProd,
                            item.NCM,
                            item.CFOP,
                            item.uCom,
                            item.qCom,
                            item.vUnCom,
                            item.vProd,
                            item.vICMS
                        ]);
                    }
                }

                totalProcessados++;
            }

            moverArquivo(arquivo, pastaProcessados);

            if (!arquivoTemDuplicidade) {
                registrarLog('Sucesso', nomeArquivo, `XML processado (${notasExtraidas.length} doc(s) do tipo ${notasExtraidas[0].tipo}).`);
            }

        } catch (erro) {
            totalErros++;
            registrarLog('Erro', nomeArquivo, `Falha: ${erro.message}`);
            if (pastaErros) moverArquivo(arquivo, pastaErros);
            enviarAlertaEmail(emailAlerta, nomeArquivo, erro.message);
        }
    }

    // Gravação em Lote (Batch) na aba Dados_Fiscais
    if (novasLinhasDados.length > 0) {
        const ultimaLinhaDados = Math.max(abaDados.getLastRow(), 1);
        const rangeDados = abaDados.getRange(ultimaLinhaDados + 1, 1, novasLinhasDados.length, novasLinhasDados[0].length);
        rangeDados.setValues(novasLinhasDados);
        // Formatação monetária (colunas H até T -> índice 8 ao 20)
        abaDados.getRange(ultimaLinhaDados + 1, 8, novasLinhasDados.length, 13).setNumberFormat('#,##0.00');
    }

    // Gravação em Lote (Batch) na aba Detalhes_Itens
    if (novasLinhasItens.length > 0) {
        const ultimaLinhaItens = Math.max(abaItens.getLastRow(), 1);
        const rangeItens = abaItens.getRange(ultimaLinhaItens + 1, 1, novasLinhasItens.length, novasLinhasItens[0].length);
        rangeItens.setValues(novasLinhasItens);
        abaItens.getRange(ultimaLinhaItens + 1, 12, novasLinhasItens.length, 4).setNumberFormat('#,##0.0000');
        abaItens.getRange(ultimaLinhaItens + 1, 14, novasLinhasItens.length, 2).setNumberFormat('#,##0.00');
    }

    const msgFinal = `Resumo da Execução Contábil:\n\n` +
        `✅ Documentos Lançados: ${totalProcessados}\n` +
        `⚠️ Duplicados (Ignorados): ${totalDuplicados}\n` +
        `❌ Erros de Leitura: ${totalErros}`;

    if (SpreadsheetApp.getActiveSpreadsheet()) {
        try { Browser.msgBox('Processamento Concluído', msgFinal, Browser.Buttons.OK); } catch (e) { }
    }
}

/**
 * 5. ROTEADOR XML E PARSERS (PRODUTOS E SERVIÇOS)
 */

function rotearEExtrairXML(xmlString) {
    const document = XmlService.parse(xmlString);
    const root = document.getRootElement();
    const rootName = root.getName();

    // 1. Tenta identificar NF-e de Produtos (SEFAZ)
    if (rootName === 'NFe' || rootName === 'nfeProc' || rootName === 'enviNFe' || rootName === 'procEventoNFe') {
        const nosNFe = localizarNosNFe(root);
        if (nosNFe.length > 0) return extrairNFeProduto(nosNFe);
    }

    // 2. Tenta identificar NFS-e de Serviços (Prefeituras, Ginfes, Betha, ABRASF, Lotes RPS)
    // Como cada município tem uma tag raiz diferente, fazemos uma busca agnóstica por "nós" <InfNfse> ou <ChaveNFeRPS>[cite: 1]
    const nosNFSe = buscarNosAgnosticos(root, 'InfNfse'); //
    if (nosNFSe.length > 0) {
        return extrairNFSeServico(nosNFSe, root);
    }

    // Fallback para retornos de Lote RPS que possuam apenas a confirmação ou alerta[cite: 1]
    const nosRps = buscarNosAgnosticos(root, 'ChaveNFeRPS'); //[cite: 1]
    if (nosRps.length > 0) {
        return extrairNFSeServico(nosRps, root);
    }

    // Se não foi pela raiz, tenta fallback geral de produtos
    const nosNFeFallback = localizarNosNFe(root);
    if (nosNFeFallback.length > 0) return extrairNFeProduto(nosNFeFallback);

    return [];
}

/**
 * Extrator de NF-e / NFC-e (Produtos - Padrão SEFAZ)
 */
function extrairNFeProduto(nosNFe) {
    const resultados = [];
    for (const nfeNode of nosNFe) {
        const infNFe = nfeNode.getChild('infNFe', NFE_NS);
        if (!infNFe) continue;

        let chave = infNFe.getAttribute('Id') ? infNFe.getAttribute('Id').getValue() : '';
        chave = chave.replace(/^NFe/i, '').trim();

        const ide = infNFe.getChild('ide', NFE_NS);
        const numNota = getXmlValue(ide, 'nNF');
        const dataEmissao = formatarData(getXmlValue(ide, 'dhEmi') || getXmlValue(ide, 'dEmi'));

        const emit = infNFe.getChild('emit', NFE_NS);
        const cnpj = getXmlValue(emit, 'CNPJ') || getXmlValue(emit, 'CPF') || '';
        const nome = getXmlValue(emit, 'xNome') || 'Nome não informado';

        const total = infNFe.getChild('total', NFE_NS);
        const icmsTot = total ? total.getChild('ICMSTot', NFE_NS) : null;

        // Extração de Itens para controle de estoque (<det>)
        const listaDet = infNFe.getChildren('det', NFE_NS);
        const itens = [];
        for (const det of listaDet) {
            const prod = det.getChild('prod', NFE_NS);
            const imp = det.getChild('imposto', NFE_NS);
            let vIcmsItem = 0.00;
            if (imp) {
                const icmsNode = imp.getChild('ICMS', NFE_NS);
                if (icmsNode && icmsNode.getChildren().length > 0) {
                    vIcmsItem = parseMonetario(getXmlValue(icmsNode.getChildren()[0], 'vICMS'));
                }
            }
            if (prod) {
                itens.push({
                    cProd: getXmlValue(prod, 'cProd') || '',
                    cEAN: getXmlValue(prod, 'cEAN') || 'SEM GTIN',
                    xProd: getXmlValue(prod, 'xProd') || '',
                    NCM: getXmlValue(prod, 'NCM') || '',
                    CFOP: getXmlValue(prod, 'CFOP') || '',
                    uCom: getXmlValue(prod, 'uCom') || 'UN',
                    qCom: parseMonetario(getXmlValue(prod, 'qCom')),
                    vUnCom: parseMonetario(getXmlValue(prod, 'vUnCom')),
                    vProd: parseMonetario(getXmlValue(prod, 'vProd')),
                    vICMS: vIcmsItem
                });
            }
        }

        resultados.push({
            tipo: 'PRODUTO',
            chaveOuCodigo: chave || `SEM_CHAVE_${numNota}`,
            numNota: numNota,
            dataEmissao: dataEmissao,
            cnpjEmitente: formatarCNPJ(cnpj),
            nomeFornecedor: nome,
            vProdServ: parseMonetario(getXmlValue(icmsTot, 'vProd')),
            vFreteDeduc: parseMonetario(getXmlValue(icmsTot, 'vFrete')),
            vSeg: parseMonetario(getXmlValue(icmsTot, 'vSeg')),
            vDesc: parseMonetario(getXmlValue(icmsTot, 'vDesc')),
            vII_IR_INSS: parseMonetario(getXmlValue(icmsTot, 'vII')),
            vIPI: parseMonetario(getXmlValue(icmsTot, 'vIPI')),
            vPIS: parseMonetario(getXmlValue(icmsTot, 'vPIS')),
            vCOFINS: parseMonetario(getXmlValue(icmsTot, 'vCOFINS')),
            vOutroCSLL: parseMonetario(getXmlValue(icmsTot, 'vOutro')),
            vTotalLiquido: parseMonetario(getXmlValue(icmsTot, 'vNF')),
            vTotTrib: parseMonetario(getXmlValue(icmsTot, 'vTotTrib')),
            vIcmsIss: parseMonetario(getXmlValue(icmsTot, 'vICMS')),
            vBaseCalc: parseMonetario(getXmlValue(icmsTot, 'vBC')),
            issRetido: '-',
            discriminacaoAlerta: 'Nota Fiscal de Venda / Produto',
            itens: itens
        });
    }
    return resultados;
}

/**
 * Extrator Agnóstico de NFS-e (Serviços - Compatível com Prefeituras/Ginfes)[cite: 2, 3]
 */
function extrairNFSeServico(nosNFSe, rootGerador) {
    const resultados = [];

    // Captura possíveis alertas de lote na raiz (ex: alíquota corrigida pela prefeitura)[cite: 1]
    let textoAlertaLote = '';
    const nosAlerta = buscarNosAgnosticos(rootGerador, 'Alerta'); //[cite: 1]
    if (nosAlerta.length > 0) {
        textoAlertaLote = '[Alerta Prefeitura]: ' + (getXmlValueAgnostico(nosAlerta[0], 'Descricao') || 'Divergência notificada') + '. '; //[cite: 1]
    }

    for (const node of nosNFSe) {
        // Busca flexível de número da nota e código de verificação[cite: 1, 2, 3]
        const numNota = getXmlValueAgnostico(node, 'Numero') || getXmlValueAgnostico(node, 'NumeroNFe') || getXmlValueAgnostico(node, 'NumeroRPS') || '000'; //[cite: 1, 2, 3]
        const codVerif = getXmlValueAgnostico(node, 'CodigoVerificacao') || `RPS_${numNota}`; //[cite: 1, 2, 3]
        const dataEmissao = formatarData(getXmlValueAgnostico(node, 'DataEmissao') || getXmlValueAgnostico(node, 'DataEmissaoRps')); //[cite: 2, 3]

        // Prestador de Serviço (Fornecedor)[cite: 2, 3]
        const prestador = buscarNosAgnosticos(node, 'PrestadorServico')[0] || buscarNosAgnosticos(node, 'ChaveNFe')[0] || node; //[cite: 1, 2, 3]
        const cnpj = getXmlValueAgnostico(prestador, 'Cnpj') || getXmlValueAgnostico(prestador, 'CNPJ') || getXmlValueAgnostico(prestador, 'InscricaoPrestador') || ''; //[cite: 1, 2, 3]
        const nome = getXmlValueAgnostico(prestador, 'RazaoSocial') || getXmlValueAgnostico(prestador, 'NomeFantasia') || 'Prestador de Serviço'; //[cite: 2, 3]

        // Valores e Impostos do Serviço[cite: 2, 3]
        const servico = buscarNosAgnosticos(node, 'Servico')[0] || node; //[cite: 2, 3]
        const val = buscarNosAgnosticos(servico, 'Valores')[0] || node; //[cite: 2, 3]

        const vServ = parseMonetario(getXmlValueAgnostico(val, 'ValorServicos') || getXmlValueAgnostico(node, 'ValorTotalServicos')); //[cite: 1, 2, 3]
        const vDeduc = parseMonetario(getXmlValueAgnostico(val, 'ValorDeducoes')); //[cite: 2, 3]
        const vPis = parseMonetario(getXmlValueAgnostico(val, 'ValorPis')); //
        const vCofins = parseMonetario(getXmlValueAgnostico(val, 'ValorCofins')); //[cite: 3]
        const vInss = parseMonetario(getXmlValueAgnostico(val, 'ValorInss')); //[cite: 3]
        const vIr = parseMonetario(getXmlValueAgnostico(val, 'ValorIr')); //[cite: 3]
        const vCsll = parseMonetario(getXmlValueAgnostico(val, 'ValorCsll')); //[cite: 3]
        const vIss = parseMonetario(getXmlValueAgnostico(val, 'ValorIss')); //[cite: 2, 3]
        const vBase = parseMonetario(getXmlValueAgnostico(val, 'BaseCalculo')); //[cite: 2, 3]

        // Valor Líquido (se não houver na tag, calcula: Serviço - Deduções - Retenções)[cite: 2, 3]
        let vLiq = parseMonetario(getXmlValueAgnostico(val, 'ValorLiquidoNfse')); //[cite: 2, 3]
        if (vLiq === 0 && vServ > 0) vLiq = vServ - vDeduc;

        // ISS Retido (Geralmente 1 = Sim, 2 = Não na ABRASF/Ginfes)[cite: 2, 3]
        const issRetidoRaw = getXmlValueAgnostico(val, 'IssRetido'); //[cite: 2, 3]
        let issRetidoFormatado = '-';
        if (issRetidoRaw === '1' || issRetidoRaw?.toLowerCase() === 'sim' || issRetidoRaw?.toLowerCase() === 'true') issRetidoFormatado = 'Sim (Retido)';
        if (issRetidoRaw === '2' || issRetidoRaw?.toLowerCase() === 'nao' || issRetidoRaw?.toLowerCase() === 'nao') issRetidoFormatado = 'Não (Sem Retenção)'; //[cite: 2, 3]

        // Discriminação / Detalhamento[cite: 2, 3]
        const discriminacao = getXmlValueAgnostico(servico, 'Discriminacao') || getXmlValueAgnostico(node, 'Discriminacao') || 'Serviço prestado sem discriminação'; //[cite: 2, 3]
        const textoCompletoDescricao = (textoAlertaLote + discriminacao).substring(0, 500); // Limita tamanho para não quebrar a planilha

        resultados.push({
            tipo: 'SERVIÇO',
            chaveOuCodigo: codVerif.trim(), //[cite: 2, 3]
            numNota: numNota, //[cite: 1, 2, 3]
            dataEmissao: dataEmissao, //[cite: 2, 3]
            cnpjEmitente: formatarCNPJ(cnpj), //[cite: 1, 2, 3]
            nomeFornecedor: nome, //[cite: 2, 3]
            vProdServ: vServ, //[cite: 1, 2, 3]
            vFreteDeduc: vDeduc, //[cite: 2, 3]
            vSeg: 0.00,
            vDesc: 0.00,
            vII_IR_INSS: vIr + vInss, // Soma IR e INSS retidos na coluna 12[cite: 3]
            vIPI: 0.00,
            vPIS: vPis, //[cite: 3]
            vCOFINS: vCofins, //[cite: 3]
            vOutroCSLL: vCsll, // CSLL vai para Outras Despesas[cite: 3]
            vTotalLiquido: vLiq, //[cite: 2, 3]
            vTotTrib: 0.00, //[cite: 3]
            vIcmsIss: vIss, //[cite: 2, 3]
            vBaseCalc: vBase, //[cite: 2, 3]
            issRetido: issRetidoFormatado, //[cite: 2, 3]
            discriminacaoAlerta: textoCompletoDescricao, //[cite: 1, 2, 3]
            itens: [] // Notas de serviço não vão para controle de estoque físico
        });
    }
    return resultados;
}

/**
 * 6. FUNÇÕES XML AGNÓSTICAS (RESOLVE CONFLITOS DE NAMESPACE MUNICIPAL)
 */
function buscarNosAgnosticos(elemento, nomeLocalBuscado) {
    const encontrados = [];
    const buscar = (node) => {
        if (node.getName().toLowerCase() === nomeLocalBuscado.toLowerCase()) {
            encontrados.push(node);
        }
        const filhos = node.getChildren();
        for (const filho of filhos) buscar(filho);
    };
    buscar(elemento);
    return encontrados;
}

function getXmlValueAgnostico(elementoPai, nomeLocalBuscado) {
    if (!elementoPai) return null;
    const filhos = elementoPai.getChildren();
    for (const filho of filhos) {
        if (filho.getName().toLowerCase() === nomeLocalBuscado.toLowerCase()) {
            return filho.getText().trim();
        }
    }
    return null;
}

function getXmlValue(parentElement, tagName) {
    if (!parentElement) return null;
    const child = parentElement.getChild(tagName, NFE_NS);
    return child ? child.getText().trim() : null;
}

function localizarNosNFe(root) {
    return buscarNosAgnosticos(root, 'NFe');
}

function parseMonetario(valorString) {
    if (!valorString) return 0.00;
    const val = parseFloat(valorString.toString().replace(',', '.')); //
    return isNaN(val) ? 0.00 : Number(val.toFixed(4));
}

/**
 * 7. UTILITÁRIOS, DUPLICIDADE E ALERTAS
 */
function carregarChavesExistentes(abaDados) {
    const chaves = new Set();
    const ultimaLinha = abaDados.getLastRow();
    if (ultimaLinha > 1) {
        const valores = abaDados.getRange(2, 3, ultimaLinha - 1, 1).getValues(); // Coluna C (3)
        const formulas = abaDados.getRange(2, 3, ultimaLinha - 1, 1).getFormulas();
        for (let i = 0; i < valores.length; i++) {
            let val = valores[i][0].toString().trim();
            let form = formulas[i][0].toString().trim();
            if (form && form.toUpperCase().includes('HYPERLINK')) {
                const match = form.match(/;\s*"?([^")]+)"?\s*\)/);
                if (match && match[1]) val = match[1];
            }
            if (val) chaves.add(val);
        }
    }
    return chaves;
}

function verificarDuplicidade(chave, setChaves) {
    if (!chave) return false;
    return setChaves.has(chave.toString().trim());
}

function moverArquivo(arquivo, pastaDestino) {
    if (!arquivo || !pastaDestino) return;
    try {
        arquivo.moveTo(pastaDestino);
    } catch (e) {
        pastaDestino.addFile(arquivo);
        const pais = arquivo.getParents();
        while (pais.hasNext()) pais.next().removeFile(arquivo);
    }
}

function registrarLog(status, nomeArquivo, mensagem) {
    try {
        const abaLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
        if (abaLog) abaLog.appendRow([new Date(), nomeArquivo, status, mensagem]);
    } catch (e) { console.error('Erro no log:', e); }
}
// Função de enviar o email ao registrar a não leitura de algum XML
function enviarAlertaEmail(emailDestino, nomeArquivo, mensagemErro) {
    if (!emailDestino || !emailDestino.includes('@')) return;
    try {
        const assunto = `[Alerta Contábil] Falha ao ler o arquivo XML: ${nomeArquivo}`;
        const corpo = `O sistema de automação fiscal falhou ao processar o arquivo:\n\n` +
            ` Nome do Arquivo: ${nomeArquivo}\n` +
            ` Data/Hora: ${new Date().toLocaleString('pt-BR')}\n` +
            `⚠️ Erro: ${mensagemErro}\n\n` +
            `O arquivo  foi isolado na pasta de Erros no Google Drive para análise contábil.`;
        GmailApp.sendEmail(emailDestino, assunto, corpo);
    } catch (e) { console.error('Erro no envio de e-mail:', e); }
}

/**
  8. GATILHOS E FORMATADORES
 */
function criarGatilhoDiario() {
    removerGatilhos();
    ScriptApp.newTrigger('buscarXmlsGmailEProcessar').timeBased().everyDays(1).atHour(8).create();
    Browser.msgBox('Automação Ativada', 'O sistema varrerá o Gmail e a pasta do Drive automaticamente todos os dias às 08h.', Browser.Buttons.OK);
}

function removerGatilhos() {
    const gatilhos = ScriptApp.getProjectTriggers();
    for (const gat of gatilhos) {
        if (gat.getHandlerFunction() === 'buscarXmlsGmailEProcessar' || gat.getHandlerFunction() === 'processarNotasFiscais') {
            ScriptApp.deleteTrigger(gat);
        }
    }
    if (SpreadsheetApp.getActiveSpreadsheet()) {
        try { Browser.msgBox('Automação Desativada', 'A execução automática foi removida.', Browser.Buttons.OK); } catch (e) { }
    }
}

function formatarData(dataIso) {
    if (!dataIso) return '';
    try {
        const data = new Date(dataIso); //[cite: 1, 2, 3]
        return isNaN(data.getTime()) ? dataIso : data;
    } catch (e) { return dataIso; }
}

function formatarCNPJ(cnpj) {
    const limpo = cnpj.replace(/\D/g, ''); //[cite: 1, 2, 3]
    if (limpo.length === 14) return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); //[cite: 1, 2, 3]
    if (limpo.length === 11) return limpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"); // Suporte a CPF do Tomador[cite: 2, 3]
    return cnpj;
}

function verLog() {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const abaLog = planilha.getSheetByName('Log');
    if (abaLog) planilha.setActiveSheet(abaLog);
    else Browser.msgBox('Atenção', 'A aba "Log" ainda não foi criada.', Browser.Buttons.OK);
}

/**
  9. INICIALIZAÇÃO DE ESTRUTURA CONTÁBIL UNIFICADA (23 COLUNAS)
 */
function inicializarPlanilhas() {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Aba Dados_Fiscais (Unificada para Produtos e Serviços)[cite: 1, 2, 3]
    let abaDados = planilha.getSheetByName('Dados_Fiscais');
    if (!abaDados) {
        abaDados = planilha.insertSheet('Dados_Fiscais');
        const headersDados = [
            'Data Processamento', 'Tipo (Produto/Serviço)', 'Chave / Cód. Verificação', 'Num Nota / RPS', 'Data Emissão',
            'CNPJ/CPF Emitente', 'Nome Emitente / Prestador', 'Valor Produtos / Serviços', 'Valor Frete / Deduções', 'Valor Seguro',
            'Valor Desconto', 'Vl. II / IR / INSS', 'Valor IPI', 'Valor PIS', 'Valor COFINS',
            'Outras Despesas / CSLL', 'Valor Total / Líquido', 'Tributos Aproximados', 'Valor ICMS / ISS',
            'Base Cálculo ICMS/ISS', 'ISS Retido?', 'Discriminação / Alertas', 'Status' //[cite: 1, 2, 3]
        ];
        abaDados.getRange(1, 1, 1, headersDados.length).setValues([headersDados])
            .setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
        abaDados.setFrozenRows(1);
    }

    // 2. Aba Detalhes_Itens (Controle de Estoque e Compras de Mercadorias)
    let abaItens = planilha.getSheetByName('Detalhes_Itens');
    if (!abaItens) {
        abaItens = planilha.insertSheet('Detalhes_Itens');
        const headersItens = [
            'Data Processamento', 'Chave Acesso / Identificador', 'Num Nota', 'Data Emissão', 'Nome Fornecedor',
            'Cód. Produto', 'EAN / GTIN', 'Descrição do Produto', 'NCM', 'CFOP',
            'Unidade', 'Quantidade', 'Valor Unitário', 'Valor Total Item', 'Vl. ICMS Item'
        ];
        abaItens.getRange(1, 1, 1, headersItens.length).setValues([headersItens])
            .setBackground('#e37400').setFontColor('#ffffff').setFontWeight('bold');
        abaItens.setFrozenRows(1);
    }

    // 3. Aba Config
    let abaConfig = planilha.getSheetByName('Config');
    if (!abaConfig) {
        abaConfig = planilha.insertSheet('Config');
        const configData = [
            ['Parâmetro', 'Valor Configurado / ID no Drive', 'Descrição / Instruções'],
            ['PASTA_ORIGEM', '', 'ID da pasta do Drive onde os arquivos XML são depositados'],
            ['PASTA_PROCESSADOS', '', 'ID da pasta onde os XMLs processados com sucesso serão movidos'],
            ['PASTA_ERROS', '', 'ID da pasta para isolar arquivos corrompidos ou não reconhecidos'],
            ['EMAIL_ALERTA', '', 'E-mail para receber alertas de erro ao processar documentos']
        ];
        abaConfig.getRange(1, 1, configData.length, 3).setValues(configData);
        abaConfig.getRange(1, 1, 1, 3).setBackground('#34a853').setFontColor('#ffffff').setFontWeight('bold');
        abaConfig.getRange(2, 1, 4, 1).setFontWeight('bold');
        abaConfig.setColumnWidth(1, 180);
        abaConfig.setColumnWidth(2, 280);
        abaConfig.setColumnWidth(3, 400);
    }

    // 4. Aba Log
    let abaLog = planilha.getSheetByName('Log');
    if (!abaLog) {
        abaLog = planilha.insertSheet('Log');
        const headersLog = ['Data e Hora', 'Nome do Arquivo', 'Status', 'Mensagem / Detalhes'];
        abaLog.getRange(1, 1, 1, headersLog.length).setValues([headersLog])
            .setBackground('#5f6368').setFontColor('#ffffff').setFontWeight('bold');
        abaLog.setFrozenRows(1);
        abaLog.setColumnWidth(1, 150);
        abaLog.setColumnWidth(2, 220);
        abaLog.setColumnWidth(3, 100);
        abaLog.setColumnWidth(4, 450);
    }
}

function mostrarComoUsar() {
    const LINK_INSTRUCOES = 'https://docs.google.com/document/d/17G-08Z9E5z5Pcx7a34Jw4c_tclRzh1j2oTIQ9WdQP6s/edit?usp=sharing';
    const htmlConteudo = `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; padding: 10px; color: #333;">
      <h3 style="color: #1a73e8; margin-top: 0; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">
        📖 Manual (NF-e + NFS-e)
      </h3>
      <p style="font-size: 13px; line-height: 1.5;">
        Esta versão foi projetada para lidar com múltiplos formatos de notas:
      </p>
      <ul style="font-size: 13px; line-height: 1.6; padding-left: 20px;">
        <li><b>Produtos (NF-e):</b> Extração de impostos e separação detalhada de itens para controle de estoque/compras.</li>
        <li><b>Serviços (NFS-e):</b> Compatível com diferentes prefeituras (ABRASF/Ginfes). Leitura de ISS retido, IR, INSS e descrição dos serviços.</li>
      </ul>
      <div style="background-color: #e8f0fe; border-left: 4px solid #1a73e8; padding: 10px; margin: 15px 0; font-size: 12px;">
        <b>💡 Dica para Contadores:</b> Utilize o filtro do Excel/Sheets na coluna "Tipo (Produto/Serviço)" para exportar dados separadamente para o seu sistema contábil (Domínio, Alterdata, etc.).
      </div>
      <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
      <div style="text-align: center;">
        <a href="${LINK_INSTRUCOES}" target="_blank" 
           style="background-color: #1a73e8; color: white; padding: 10px 18px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 13px; display: inline-block;">
          🔗 Abrir Documentação Completa
        </a>
      </div>
    </div>
  `;
    SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(htmlConteudo).setWidth(460).setHeight(390), 'Ajuda e Suporte - v3.0');
}