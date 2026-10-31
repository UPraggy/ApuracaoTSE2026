# Dados de contexto por município e por UF

Gerados por `node scripts/contexto.mjs` (Node, sem dependências). O script baixa só o que ainda não está em `dados/contexto/brutos/` e é idempotente; `--forcar` baixa tudo de novo. Rodada completa sem cache: cerca de 70 s (o perfil do TSE tem 2,2 GB de CSV dentro do ZIP e é lido em stream, sem extrair). Com cache: poucos segundos.

## Saída

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `site/dados/contexto-municipios.json` | ~578 KB | 5.571 municípios (chave = código IBGE de 7 dígitos, os mesmos de `municipios.json`) |
| `site/dados/contexto-uf.json` | ~8 KB | 27 UFs + `BR` (Brasil) + `ZZ` (exterior, só campos do TSE) |

Formato: `{ gerado, notas, colunas: [...], fontes: { campo: { nome, ano, url, unidade } }, dados: { "<chave>": [valores na ordem de colunas] } }`. `null` = sem dado na fonte. Percentuais com 1 casa decimal.

Os brutos (`dados/contexto/brutos/`, ~415 MB, dos quais 408 MB são o ZIP do TSE) estão no `.gitignore`.

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

## Limitações

- **Boa Esperança do Norte (MT)** foi instalado em 2025 a partir de partes de Sorriso e Nova Ubiratã. Não existe no Censo 2022 nem no PIB 2023; só tem estimativa de população (5.983 em 2026) e dados do TSE. A população dele em 2022 está dentro dos municípios de origem.
- **Anos diferentes**: Censo 2022 (população, idade, alfabetização, renda), estimativa 2026, PIB 2023, eleitorado de julho de 2026. Não misturar como se fossem do mesmo momento; `popEstimada` 2026 é a referência mais próxima da eleição.
- **Renda do Censo** é rendimento nominal de 2022 (julho/2022), só de moradores em domicílios particulares permanentes ocupados (exclui pensionista, empregado doméstico e parente dele). Não é corrigida pela inflação.
- **PIB per capita** de municípios com grande indústria extrativa ou usina (ex.: máximo de R$ 722 mil) não reflete a renda dos moradores; para renda, usar `rendaPcMedia`/`rendaPcMediana`.
- **Perfil do eleitorado** é a fotografia do cadastro gerada em 14/07/2026 (após o fechamento do cadastro para 2026). Escolaridade e gênero são autodeclarados e raramente atualizados: `eleitPctAnalfabeto` e `eleitPctLeEscreve` refletem o que o eleitor declarou ao se alistar, muitas vezes décadas atrás, e não se comparam diretamente com `alfabetizacao15` do Censo. Percentuais do TSE têm o total de eleitores como denominador (inclui "não informado"; faixa etária "Inválida" fica fora dos numeradores).
- **Idade**: `pct60mais` e `pct16a29` do Censo usam toda a população como denominador; `eleitPct60mais` usa o eleitorado. Por isso o percentual de 60+ entre eleitores é sempre maior.
- **Biometria do perfil** é cadastral (eleitor com digitais coletadas), diferente do campo de biometria dos boletins de urna (eleitor que votou liberado pela digital).
