# Dados de contexto por município e por UF

Gerados por `node scripts/contexto.mjs` (Node, sem dependências). O script baixa só o que ainda não está em `dados/contexto/brutos/` e é idempotente; `--forcar` baixa tudo de novo. Rodada completa sem cache: cerca de 3 min (perfil do TSE, Bolsa Família e BPC somam ~5,5 GB de CSV dentro dos ZIPs, lidos em stream sem extrair). Com cache: poucos segundos, mais uma tentativa rápida de achar mês novo no Portal da Transparência.

## Saída

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `site/dados/contexto-municipios.json` | ~944 KB | 5.571 municípios (chave = código IBGE de 7 dígitos, os mesmos de `municipios.json`) |
| `site/dados/contexto-uf.json` | ~14 KB | 27 UFs + `BR` (Brasil) + `ZZ` (exterior, só campos do TSE) |

Formato: `{ gerado, notas, colunas: [...], fontes: { campo: { nome, ano, url, unidade } }, dados: { "<chave>": [valores na ordem de colunas] } }`. `null` = sem dado na fonte. Percentuais com 1 casa decimal.

Os brutos (`dados/contexto/brutos/`, ~930 MB: ZIP do TSE 408 MB, Bolsa Família 329 MB, BPC 193 MB) estão no `.gitignore`. Os CSV do Portal da Transparência trazem nome e CPF mascarado dos beneficiários; o script só guarda contagens e somas por município (`*_agregado.json`), e nada pessoal vai para o site.

**Ordem das colunas.** Município: as 19 colunas-base e depois as 15 sociais (34 no total). UF: as 19 de base, `giniRendaPc` (posição 20, como antes) e depois as mesmas 15 sociais (35 no total). Colunas novas entram sempre no fim.

## Campos e fontes exatas

| Campo | Unidade | Fonte | Consulta (API) | Ano |
|---|---|---|---|---|
| `pop2022` | pessoas | IBGE, Censo 2022, SIDRA [4714](https://sidra.ibge.gov.br/tabela/4714), v93 População residente | `apisidra.ibge.gov.br/values/t/4714/n6/all/v/93,6318,614/p/2022` | 2022 |
| `areaKm2` | km² (1 casa) | SIDRA 4714, v6318 Área da unidade territorial | idem | 2022 |
| `densidade` | hab/km² (2 casas abaixo de 10, senão 1) | SIDRA 4714, v614 Densidade demográfica | idem | 2022 |
| `popEstimada` | pessoas | IBGE, Estimativas de População, SIDRA [6579](https://sidra.ibge.gov.br/tabela/6579), v9324 | `/t/6579/n6/all/v/9324/p/2026` | **2026** (1º/jul, publicada em 28/08/2026; o script pega sempre o período mais recente) |
| `pct60mais` | % da pop. | IBGE, Censo 2022, SIDRA [9514](https://sidra.ibge.gov.br/tabela/9514), v93, sexo Total (c2=6794), forma de declaração Total (c286=113635); soma das idades 60–64…95–99 e 100+ (c287 = 93095, 93096, 93097, 93098, 49108, 49109, 60040, 60041, 6653) / Total (100362) | `/t/9514/n6/in n3 {UF}/v/93/p/2022/c2/6794/c287/.../c286/113635` (uma consulta por UF) | 2022 |
| `pct16a29` | % da pop. | SIDRA 9514, idades 16, 17, 18, 19 anos (6573, 6574, 6575, 6576) + 20–24 (93087) + 25–29 (93088) / Total | idem | 2022 |
| `alfabetizacao15` | % | IBGE, Censo 2022, SIDRA [9543](https://sidra.ibge.gov.br/tabela/9543), v2513 Taxa de alfabetização das pessoas de 15 anos ou mais; sexo, cor/raça e idade = Total | `/t/9543/n6/all/v/2513/p/2022/c2/6794/c86/95251/c287/100362` | 2022 |
| `pibMilhoes` | R$ milhões correntes (1 casa) | IBGE, PIB dos Municípios, SIDRA [5938](https://sidra.ibge.gov.br/tabela/5938), v37 PIB a preços correntes (mil R$ ÷ 1000) | `/t/5938/n6/all/v/37/p/2023` | **2023** (último disponível; o script pega o período mais recente) |
| `pibPerCapita` | R$ correntes | IBGE Cidades, pesquisa 38 (PIB dos Municípios), indicador 47001 "PIB per capita – série revisada". O SIDRA não tem PIB per capita municipal. | `servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/47001/resultados/xxxxxx` (código de 6 dígitos) | 2023 |
| `rendaPcMedia` | R$/mês (inteiro) | IBGE, Censo 2022, SIDRA [10295](https://sidra.ibge.gov.br/tabela/10295), v13431 Rendimento nominal **médio** mensal domiciliar per capita; sexo, cor/raça e grupo de idade = Total | `/t/10295/n6/all/v/13431,13534/p/2022/c2/6794/c86/95251/c58/95253` | 2022 |
| `rendaPcMediana` | R$/mês | SIDRA 10295, v13534 Rendimento nominal **mediano** mensal domiciliar per capita | idem | 2022 |
| `eleitores` | eleitores | TSE, [perfil do eleitorado 2026](https://dadosabertos.tse.jus.br/dataset/eleitorado-atual), `cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitorado/perfil_eleitorado_2026.zip`, arquivo `perfil_eleitorado_2026_BRASIL.csv`, soma de QT_ELEITORES | — | 2026 (gerado em 14/07/2026) |
| `eleitPctFeminino` | % do eleitorado | CD_GENERO = 4 (FEMININO) | — | 2026 |
| `eleitPct16a17` | % | CD_FAIXA_ETARIA 1600 e 1700 | — | 2026 |
| `eleitPct60mais` | % | CD_FAIXA_ETARIA ≥ 6064 (60–64 até 100+) | — | 2026 |
| `eleitPctSuperior` | % | CD_GRAU_ESCOLARIDADE = 8 (SUPERIOR COMPLETO) | — | 2026 |
| `eleitPctAnalfabeto` | % | CD_GRAU_ESCOLARIDADE = 1 (ANALFABETO) | — | 2026 |
| `eleitPctLeEscreve` | % | CD_GRAU_ESCOLARIDADE = 2 (LÊ E ESCREVE) | — | 2026 |
| `eleitPctBiometria` | % | soma de QT_ELEITORES_BIOMETRIA / QT_ELEITORES | — | 2026 |
| `giniRendaPc` (só no arquivo de UF) | índice 0–1 (3 casas) | IBGE, Censo 2022, SIDRA [10301](https://sidra.ibge.gov.br/tabela/10301), v13418 Gini do rendimento domiciliar per capita (não existe por município) | `/t/10301/n3/all/n1/all/v/13418/p/2022` | 2022 |

Todas as consultas SIDRA usam `/h/n/f/c` (sem cabeçalho, só códigos). Convenção do SIDRA aplicada: `-` = zero absoluto (aparece nas idades 95+ e 100+ de municípios pequenos); `..`, `...` e `X` viram `null`.

## Como cada nível é montado

- **Município**: valores do nível territorial N6 do SIDRA / indicador do IBGE Cidades. O TSE é ligado ao IBGE pela tabela `dados/ibge/municipios_tse_ibge.csv` (UF + código TSE) e, para Boa Esperança do Norte (MT), pelo nome → 5101837, como no `construir.mjs`.
- **UF e BR (IBGE)**: pegos direto do nível N3 (UF) e N1 (Brasil) do SIDRA, não somados. Assim taxas e medianas (alfabetização, renda mediana, Gini) são as oficiais; a densidade é a do IBGE (população ÷ área da UF). A soma da população municipal confere com a da UF (ex.: SP 44.411.238 nos dois).
- **PIB per capita de UF e BR**: o IBGE Cidades não publica por UF. Calculado como Σ PIB dos municípios ÷ Σ (PIB ÷ PIB per capita) de cada município, isto é, PIB dividido pela mesma população que o IBGE usou no per capita municipal. Brasil 2023 = R$ 53.887.
- **UF e BR (TSE)**: soma dos municípios. `BR` exclui o exterior; `ZZ` = eleitores no exterior (só os 8 campos do TSE).

## Cobertura (municípios de `municipios.json` com código IBGE: 5.571)

| Campos | Com valor | Sem valor |
|---|---|---|
| `popEstimada` e os 8 campos do TSE | 5.571 | — |
| `pop2022`, `areaKm2`, `densidade`, `pct60mais`, `pct16a29`, `alfabetizacao15`, `pibMilhoes`, `pibPerCapita`, `rendaPcMedia`, `rendaPcMediana` | 5.570 | 5101837 Boa Esperança do Norte (MT) |

UFs: 27/27 em todos os campos; BR completo; ZZ só TSE.

Conferência: a soma de `eleitores` (157.826.587 no Brasil) bate com a soma dos aptos do 2º turno em `municipios.json` (157.828.819; diferença de 0,001%) e nenhum município difere mais de 3%. Exterior: 918.876 no perfil × 916.158 aptos.

## Indicadores sociais (acrescentados em 30/10/2026)

| Campo | Unidade | Fonte exata | Ano/mês |
|---|---|---|---|
| `pctAguaRede` | % dos moradores | IBGE, Censo 2022, SIDRA [6894](https://sidra.ibge.gov.br/tabela/6894), v382 moradores em domicílios particulares permanentes ocupados; c1821 = 72144 "possui ligação à rede geral e a utiliza como forma principal" ÷ 72129 Total; idade (c58=95253) e cor (c86=95251) Total | 2022 |
| `pctEsgotoRede` | % dos moradores | SIDRA [7555](https://sidra.ibge.gov.br/tabela/7555), v382; c11558 = 46290 "rede geral, rede pluvial ou fossa ligada à rede" ÷ 46292 Total | 2022 |
| `pctLixoColetado` | % dos moradores | SIDRA [9541](https://sidra.ibge.gov.br/tabela/9541), v382; c67 = 2520 "Coletado" (no domicílio ou em caçamba) ÷ 10972 Total | 2022 |
| `pctSemBanheiroExclusivo` | % dos moradores | SIDRA [9397](https://sidra.ibge.gov.br/tabela/9397), v382; 100 − (c458 = 12032 "tinham banheiro de uso exclusivo" ÷ 72117 Total). Inclui quem só tinha banheiro de uso comum, só sanitário/buraco ou nada | 2022 |
| `pctDomInternet` | % dos domicílios | SIDRA [9936](https://sidra.ibge.gov.br/tabela/9936), v381 domicílios particulares permanentes ocupados; c2072 = 77585 "Sim" ÷ 77584 Total; condição de ocupação e tipo = Total | 2022 |
| `bfFamilias` | famílias | CGU, Portal da Transparência, [Novo Bolsa Família](https://portaldatransparencia.gov.br/download-de-dados/novo-bolsa-familia/202609), `202609_NovoBolsaFamilia.csv`: linhas com MÊS REFERÊNCIA = MÊS COMPETÊNCIA (1 linha por família paga no mês). As 42.724 parcelas retroativas do arquivo ficam fora | set/2026 |
| `bfPctDomicilios` | famílias por 100 domicílios | `bfFamilias` ÷ domicílios particulares permanentes ocupados do Censo 2022 (SIDRA 9936, Total) × 100 | set/2026 ÷ 2022 |
| `bfValorMedio` | R$ por família | soma de VALOR PARCELA das mesmas linhas ÷ `bfFamilias` | set/2026 |
| `bpcBeneficiarios` | benefícios | CGU, Portal da Transparência, [BPC](https://portaldatransparencia.gov.br/download-de-dados/bpc/202609), `202609_BPC.csv`, linhas do mês (idoso e pessoa com deficiência juntos; o arquivo não separa) | set/2026 |
| `bpcPctPop` | % da população | `bpcBeneficiarios` ÷ população estimada 2026 (SIDRA 6579) × 100 | set/2026 ÷ 2026 |
| `apsCobertura` | % (máx. 100) | Ministério da Saúde/SAPS, [Relatórios Públicos da APS, Histórico de Cobertura da APS](https://relatorioaps.saude.gov.br/cobertura/aps) (API `relatorioaps-prd.saude.gov.br/cobertura/aps?unidadeGeografica=MUNICIPIO&nuCompInicio=AAAAMM&nuCompFim=AAAAMM`): qtCapacidadeEquipe ÷ qtPopulacao (população de referência 2025, DOU), limitada a 100. UF/BR = Σ min(capacidade, pop) ÷ Σ pop | ago/2026 (a mais recente publicada) |
| `preNatal7mais` | % dos nascidos vivos | Ministério da Saúde, SINASC via [TabNet](http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sinasc/cnv/nvbr.def): nascidos vivos por residência da mãe, coluna "7 ou mais consultas" ÷ Total (os ignorados ficam no denominador) | 2024 (2025 é preliminar e fica de fora) |
| `mortInfantil` | óbitos < 1 ano por mil nascidos vivos | Ministério da Saúde (SIM e SINASC) publicados pelo IBGE Cidades, pesquisa 39: Σ óbitos < 1 ano (indicador 78160) ÷ Σ nascidos vivos (78159) de 2022 a 2024 × 1000. `null` quando o triênio tem menos de 100 nascidos vivos | 2022–2024 |
| `leitosSusPorMil` | leitos por mil hab. | Ministério da Saúde, CNES via [TabNet](http://tabnet.datasus.gov.br/cgi/deftohtm.exe?cnes/cnv/leiintbr.def), leitos de internação "Quantidade SUS" por município do estabelecimento ÷ população estimada 2026 × 1000 | set/2026 |
| `idhm2010` | índice 0–1 | PNUD/Atlas Brasil, IDHM 2010, publicado no IBGE Cidades (pesquisa 10111, indicador 329756). Só município; nas UFs fica `null` | 2010 |

O script escolhe sozinho o período mais recente: o mês do Portal da Transparência (tenta do mês corrente para trás), a competência da APS com dados, o último ano do SINASC não marcado como preliminar no TabNet e o primeiro arquivo do formulário de leitos do CNES.

**UF e BR.** Saneamento e internet vêm direto do nível UF/Brasil do SIDRA. Bolsa Família, BPC, APS, pré-natal, mortalidade e leitos são somas dos municípios: numerador e denominador são somados separadamente, sem média de percentuais.

**Valores ausentes no IBGE Cidades.** Nessa API, `-` quer dizer "sem dado" e o zero vem escrito como `0`. No SIDRA, `-` é zero absoluto. O script trata as duas convenções separadamente.

### Cobertura (de 5.571 municípios)

| Campo | Com valor | Sem valor |
|---|---|---|
| `pctAguaRede`, `pctEsgotoRede`, `pctLixoColetado`, `pctSemBanheiroExclusivo`, `pctDomInternet`, `bfPctDomicilios`, `preNatal7mais` | 5.570 | 5101837 Boa Esperança do Norte (MT): sem Censo 2022 e sem linha no SINASC 2024 |
| `bfFamilias`, `bfValorMedio`, `leitosSusPorMil` | 5.571 | — |
| `bpcBeneficiarios`, `bpcPctPop` | 5.570 | 3541109 Presidente Alves (SP): nenhuma linha no arquivo de set/2026 |
| `apsCobertura` | 5.570 | 4310652 (RS): ausente do relatório da APS |
| `mortInfantil` | 4.997 | 574 municípios com menos de 100 nascidos vivos em 2022–2024 |
| `idhm2010` | 5.565 | 6 municípios criados depois de 2010 (1504752, 4212650, 4220000, 4314548, 5006275, 5101837) |

Brasil: 18.652.854 famílias no Bolsa Família (set/2026), 6.620.994 BPC, cobertura APS de 83,1%, 79,1% dos nascidos vivos de 2024 com 7+ consultas, mortalidade infantil de 12,6 por mil (2022–2024) e 1,49 leito SUS por mil habitantes.

**Nomes do Portal da Transparência.** O arquivo traz o código SIAFI, não o do IBGE. A ligação é por UF + nome (sem acento e pontuação). Os 31 municípios com grafia diferente no SIAFI (Itapagé/Itapajé, Parati/Paraty, Açu/Assú, Seridó/São Vicente do Seridó, Fernando de Noronha etc.) estão na tabela `SIAFI_EXCECOES` do script. Hoje 100% das famílias e dos benefícios ficam ligados a um código IBGE.

### Limitações dos indicadores sociais

- **`bfPctDomicilios` passa de 100 em municípios do Amazonas e de outros lugares** (máximo 145,9). O denominador é o domicílio do Censo 2022 e o numerador é a "família" do CadÚnico: um domicílio pode ter mais de uma família cadastrada, e o número de domicílios cresceu desde 2022. Leia como "famílias beneficiárias por 100 domicílios", não como percentual de domicílios.
- **Bolsa Família não tem contagem de pessoas** no arquivo público, por isso não há "% da população beneficiária". `bfValorMedio` inclui todos os complementos pagos à família no mês.
- **BPC** está contado no município de pagamento informado pelo INSS. A fração da população (`bpcPctPop`) usa a estimativa de 2026.
- **Cobertura da APS** é cobertura *potencial* (capacidade de cadastro das equipes de Saúde da Família e de Atenção Primária ÷ população), não pessoas efetivamente cadastradas. O valor 100 significa "100 ou mais".
- **Mortalidade infantil pelo método direto** (óbitos registrados ÷ nascidos registrados) subestima a taxa onde há sub-registro de óbitos, principalmente no Norte e no Nordeste. Mesmo somando três anos, municípios com poucos nascimentos variam muito.
- **Leitos SUS** ficam no município do hospital: 1.999 municípios têm 0 porque a população é atendida em outro.
- **O IDHM é de 2010**, o último calculado por município pelo PNUD, e está bem mais velho que os demais campos.
- **Pré-natal 2024 e mortalidade 2022–2024** são dados finais; 2025 está marcado como preliminar no DATASUS.

### O que ficou de fora e por quê

- **CadÚnico (% de famílias cadastradas) e demais dados do MDS (VIS DATA, MI Social).** Em 30/10/2026, todos os endereços `aplicacoes.mds.gov.br/sagi/...` redirecionam para um aviso do MDS de "serviço temporariamente indisponível", por manutenção preventiva de segurança após um alerta de 21/10/2026. O Bolsa Família veio do Portal da Transparência (CGU), cujos downloads não exigem chave. O CadÚnico não tem fonte alternativa aberta e ficou de fora; dá para acrescentar quando o MDS voltar.
- **API do Portal da Transparência** (`api-de-dados`): exige chave e não foi usada. Os arquivos de download são públicos.
- **IDHM por UF**: o IBGE Cidades só publica o municipal; não há fonte oficial aberta via API sem baixar a planilha do Atlas.

## Limitações (colunas-base)

- **Boa Esperança do Norte (MT)** foi instalado em 2025 a partir de partes de Sorriso e Nova Ubiratã. Não existe no Censo 2022 nem no PIB 2023; só tem estimativa de população (5.983 em 2026) e dados do TSE. A população dele em 2022 está dentro dos municípios de origem.
- **Anos diferentes**: Censo 2022 (população, idade, alfabetização, renda), estimativa 2026, PIB 2023, eleitorado de julho de 2026. Não misturar como se fossem do mesmo momento; `popEstimada` 2026 é a referência mais próxima da eleição.
- **Renda do Censo** é rendimento nominal de 2022 (julho/2022), só de moradores em domicílios particulares permanentes ocupados (exclui pensionista, empregado doméstico e parente dele). Não é corrigida pela inflação.
- **PIB per capita** de municípios com grande indústria extrativa ou usina (ex.: máximo de R$ 722 mil) não reflete a renda dos moradores; para renda, usar `rendaPcMedia`/`rendaPcMediana`.
- **Perfil do eleitorado** é a fotografia do cadastro gerada em 14/07/2026 (após o fechamento do cadastro para 2026). Escolaridade e gênero são autodeclarados e raramente atualizados: `eleitPctAnalfabeto` e `eleitPctLeEscreve` refletem o que o eleitor declarou ao se alistar, muitas vezes décadas atrás, e não se comparam diretamente com `alfabetizacao15` do Censo. Percentuais do TSE têm o total de eleitores como denominador (inclui "não informado"; faixa etária "Inválida" fica fora dos numeradores).
- **Idade**: `pct60mais` e `pct16a29` do Censo usam toda a população como denominador; `eleitPct60mais` usa o eleitorado. Por isso o percentual de 60+ entre eleitores é sempre maior.
- **Biometria do perfil** é cadastral (eleitor com digitais coletadas), diferente do campo de biometria dos boletins de urna (eleitor que votou liberado pela digital).
