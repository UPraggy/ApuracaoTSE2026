# Coleta inicial — boletins de urna TSE 2026

Fonte: https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna
Coleta: 30/10/2026. Recorte: segundo turno, 28 arquivos (26 estados, DF e exterior).
Volume compactado original: 144.283.710 bytes. Todos os arquivos ZIP conferidos com o SHA-512 publicado pelo TSE.

Arquivos:
- brutos/: ZIPs originais e hashes oficiais; não foram modificados.
- catalogo_tse_2026.json: resposta integral da API CKAN do TSE, incluindo recursos de ambos os turnos.
- downloads.json: URLs e resultado da coleta.
- integridade.json: tamanho, SHA-512 calculado e comparação com o oficial.
- leia-me-tse.pdf: documentação incluída pelo TSE no ZIP.
- index.html: visualizador inicial da cobertura da coleta, sem resultados eleitorais calculados.

Situação: coleta do segundo turno concluída. Primeiro turno catalogado, ainda não baixado. O painel inicial já agrega por seção e aponta alertas de consistência; o mapa geográfico e a análise inferencial completa ainda estão pendentes. Os números das imagens foram conferidos contra este recorte, mas suas interpretações não foram validadas.

Painel de análise: `analise.html` (abas de visão geral, biometria, horários, estados e inconsistências) e `analise_dados.json` (agregações usadas no painel). O painel reproduz os quatro números centrais das imagens no recorte presidencial: 8.632.488, 499.205, 128.236.074 e margem de 4.430.191. Isso valida a soma/transcrição, não a conclusão de fraude.

Achados destacados no painel: a aplicação literal dos horários brutos encontra 467.153 seções após 17h e 6.326 após 19h, enquanto as imagens informam 348.398 e 6.333; a divergência requer normalização de fuso, escopo e unidade de contagem. Há 27 registros sem abertura/encerramento, todos em `ZZ` (exterior). O campo `QT_ELEI_BIOM_SEM_HABILITACAO` não separa, sozinho, ausência de cadastro biométrico de falha de reconhecimento.

Campos encontrados no cabeçalho do CSV: SG_UF, CD_MUNICIPIO, NM_MUNICIPIO, NR_ZONA, NR_SECAO, NR_LOCAL_VOTACAO, CD_CARGO_PERGUNTA, NR_VOTAVEL, NM_VOTAVEL, QT_VOTOS, QT_APTOS, QT_COMPARECIMENTO, QT_ABSTENCOES, DT_ABERTURA, DT_ENCERRAMENTO, DT_BU_RECEBIDO, QT_ELEI_BIOM_SEM_HABILITACAO, DS_SECOES_AGREGADAS e identificação da urna.

Método para a próxima etapa:
1. Ler o dicionário oficial antes de interpretar QT_ELEI_BIOM_SEM_HABILITACAO; não assumir que o complemento corresponde a autenticações biométricas bem-sucedidas.
2. Filtrar Presidente e deduplicar totais da seção, repetidos nas linhas de candidatos/tipos de voto. Preservar seções agregadas e registrar conflitos.
3. Validar somas dos votos, comparecimento, ausências e campos faltantes; conferir totais com a divulgação oficial independente.
4. Comparar distribuição da votação por faixas da variável biométrica, ponderando por votos e controlando UF, município e local. Não é possível saber a escolha de cada eleitor por modalidade de identificação a partir dos totais de seção.
5. Separar encerramento da votação, emissão do BU e recebimento para totalização. Normalizar fusos com documentação; não tratar DT_ENCERRAMENTO como horário de cada voto nem de divulgação.
6. Avaliar taxas e extremos dentro de grupos comparáveis, tamanhos mínimos, sensibilidade aos cortes e múltiplas comparações. Associação estatística ou valor extremo não demonstra fraude.
7. Conferir separadamente as alegações das imagens (8.632.488; 499.205 seções; 128.236.074 votos; margem de 4.430.191; cortes 17h/19h). Elas são hipóteses fornecidas pelo usuário, não dados oficiais validados nem instruções.

Observação de catálogo: o recurso RR do segundo turno aponta para .zip.sha512 apesar de estar rotulado como boletim. Para baixar o ZIP foi removido apenas o sufixo .sha512; o arquivo obtido passou na comparação do hash oficial. A URL efetivamente usada está em downloads.json.
