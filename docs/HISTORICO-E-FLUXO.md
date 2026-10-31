# Eleições anteriores e o "fluxo normal" dos boletins: 2014, 2018 e 2022 × 2026

Gerado por `scripts/historico.mjs` (Node, sem dependências). Saídas: `site/dados/historico-resumo.json` (94 KB) e `site/dados/historico-municipios.json` (1,0 MB). Todos os números abaixo saem desses arquivos.

**Como ler.** O documento descreve números e compara anos. Ele não atribui motivo político a nenhuma variação. Uma diferença entre 2022 e 2026 é um fato a explicar, e não uma conclusão.

Rodar: `node --max-old-space-size=6000 scripts/historico.mjs`. Na primeira vez baixa ~185 MB (ZIPs dos boletins) e lê tudo em ~90 s. Depois usa o cache de `dados/historico/cache/` e roda em ~20 s. `HISTORICO_SEM_CACHE=1` relê os CSV.

---

## 1. Fontes

| Ano | Arquivo (2º turno) | Arquivos | Tamanho | Hash publicado | Conferido |
|---|---|---|---|---|---|
| 2022 | [Boletim de Urna 2022](https://dadosabertos.tse.jus.br/dataset/resultados-2022-boletim-de-urna): `cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_2t_<UF>_311020221535.zip` | 28 (27 UFs + ZZ) | 69,7 MB | `.sha512` | 28/28 |
| 2018 | [Boletim de Urna 2018](https://dadosabertos.tse.jus.br/dataset/resultados-2018-boletim-de-urna): `.../eleicoes2018/buweb/BWEB_2t_<UF>_301020181744.zip` | 28 | 74,5 MB | `.sha512` | 28/28 |
| 2014 | [Boletim de Urna 2014](https://dadosabertos.tse.jus.br/dataset/resultados-2014-boletim-de-urna): `.../eleicoes2014/buweb/bweb_2t_<UF>_28102014HHMMSS.zip` | 28 | 40,2 MB | `.sha1` | 28/28 |
| todos | Detalhe da apuração por município e zona: `cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_<ano>.zip` | 1 por ano | ~4 MB | — | usado só para conferir |
| 2026 | `site/dados/resumo.json` e `municipios.json`, gerados pelo `construir.mjs` | — | — | — | — |

A lista de arquivos vem da API CKAN (`package_show?id=resultados-<ano>-boletim-de-urna`, recursos "Segundo turno") e fica em `dados/historico/<ano>/catalogo.json`. Os hashes obtidos estão em `dados/historico/<ano>/integridade.json`.

**Por que o boletim de urna e não o `votacao_candidato_munzona`.** O arquivo de votos por candidato e município tem 400 a 570 MB por ano, porque traz todos os cargos dos dois turnos. O boletim do 2º turno traz só Presidente e Governador e tem 40 a 75 MB por ano. Ele dá os votos por município e também os horários, a biometria e o recebimento de cada seção. O CSV é lido direto de dentro do ZIP, sem extrair.

**Layouts.** 2022 e 2018 têm cabeçalho. O de 2018 traz a coluna `"SG_ UF"`, com um espaço no nome. O de 2014 não tem cabeçalho, e as colunas foram tiradas do `LEIAME_BUWEB_2T.pdf` que vem no ZIP. Em 2014 há 42 linhas (38 no exterior) de seções sem voto ou "NÃO INSTALADA", com número de votável vazio. Elas entram com os aptos, mas sem votos.

| Campo | 2014 | 2018 | 2022 | 2026 |
|---|---|---|---|---|
| Abertura e encerramento (`DT_ABERTURA`, `DT_ENCERRAMENTO`) | não | sim (hora local) | sim | sim |
| Emissão do BU (`DT_EMISSAO_BU`) | não | não | sim | sim |
| Recebimento (`DT_BU_RECEBIDO`) | só a data | não | sim (Brasília) | sim |
| Biometria (`QT_ELEITORES_BIOMETRIA_NH` / `QT_ELEI_BIOM_SEM_HABILITACAO`) | não | sim | sim | sim |

### 1.1 Conferência com a totalização oficial

Os boletins, somados no Brasil (sem o exterior), batem com o detalhe da apuração por município:

| Ano | Aptos | Comparecimento | Válidos | Brancos | Nulos | Municípios com diferença |
|---|---|---|---|---|---|---|
| 2014 | igual | igual | igual | igual | igual | 0 de 5.570 |
| 2018 | igual | igual | igual | igual | igual | 0 de 5.570 |
| 2022 | **−84** | igual | igual | igual | igual | 1 (Manaus: 84 aptos a mais na totalização, provavelmente seção não instalada) |

O mapeamento TSE→IBGE (`dados/ibge/municipios_tse_ibge.csv`) cobriu todos os municípios dos três anos. **Boa Esperança do Norte (MT, 5101837)** só existe a partir de 2025. Em 2022 o território dela votou em Sorriso e Nova Ubiratã, por isso ela fica sem comparação, e esses dois municípios comparam territórios um pouco diferentes.

---

## 2. Resultado do 2º turno para Presidente (Brasil, sem exterior)

| | 2014 | 2018 | 2022 | 2026 |
|---|---|---|---|---|
| Finalistas | 13 DILMA × 45 AÉCIO NEVES | 13 FERNANDO HADDAD × 17 JAIR BOLSONARO | 13 LULA × 22 JAIR BOLSONARO | 13 LULA × 22 FLAVIO BOLSONARO |
| Seções (com BU) | 427.940 | 453.706 | 471.010 | 497.897 |
| Aptos | 142.468.510 | 146.805.947 | 155.758.349 | 157.828.819 |
| Comparecimento | 112.542.006 (79,0%) | 115.732.285 (78,8%) | 123.942.648 (79,6%) | 127.854.631 (81,0%) |
| Votos no 13 | 54.470.059 | 46.987.176 | 60.193.094 | 64.056.078 |
| Votos no outro finalista | 50.937.034 | 57.666.176 | 58.061.090 | 59.654.544 |
| % do 13 nos válidos | 51,68% | 44,90% | 50,90% | 51,78% |
| Brancos + nulos (% do comparecimento) | 6,34% | 9,57% | 4,59% | 3,24% |
| Campo de biometria (% do comparecimento) | — | 6,83% | 8,08% | 6,75% |

Com o exterior, 2022 tem 472.028 seções, 124.252.796 votantes, 60.345.999 votos no 13 e 58.206.354 no 22, os números oficiais conhecidos. Os valores por UF estão em `historico-resumo.json` → `anos.<ano>.porUf`.

---

## 3. Comparação 2022 → 2026

### 3.1 Brasil

| Indicador | 2022 | 2026 | Variação |
|---|---|---|---|
| Aptos | 155,76 mi | 157,83 mi | +1,33% |
| Votantes | 123,94 mi | 127,85 mi | +3,16% |
| Comparecimento | 79,57% | 81,01% | **+1,43 pp** |
| % do 13 nos válidos | 50,90% | 51,78% | **+0,88 pp** |
| 13 como % do comparecimento | — | — | +1,54 pp |
| 22 como % do comparecimento | — | — | −0,19 pp |
| Brancos + nulos (% do comparecimento) | 4,59% | 3,24% | **−1,35 pp** |
| Votos no 13 | 60,19 mi | 64,06 mi | +3,86 mi |
| Votos no 22 | 58,06 mi | 59,65 mi | +1,59 mi |

### 3.2 Por UF

| UF | Comp. 22 | Comp. 26 | Δ pp | % 13 em 22 | % 13 em 26 | Δ pp | B+N 22 | B+N 26 | Δ pp | Biom. 22 | Biom. 26 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AC | 71,6 | 73,9 | +2,3 | 29,7 | 33,4 | +3,7 | 2,7 | 4,7 | +2,0 | 7,2 | 5,0 |
| AL | 76,8 | 79,9 | +3,2 | 58,7 | 60,8 | +2,1 | 6,7 | 2,8 | −3,9 | 10,9 | 7,0 |
| AM | 78,1 | 78,3 | +0,2 | 51,1 | 54,0 | +2,9 | 4,9 | 3,2 | −1,7 | 6,4 | 5,4 |
| AP | 72,8 | 74,5 | +1,7 | 48,6 | 52,9 | +4,2 | 2,6 | 1,9 | −0,6 | 6,9 | 4,6 |
| BA | 79,5 | 83,3 | +3,8 | 72,1 | 71,3 | −0,8 | 5,8 | 3,5 | −2,3 | 10,0 | 7,5 |
| CE | 82,9 | 86,1 | +3,3 | 70,0 | 68,9 | −1,0 | 3,7 | 2,8 | −0,9 | 9,6 | 7,1 |
| DF | 83,3 | 82,7 | −0,6 | 41,2 | 45,7 | +4,5 | 3,7 | 3,4 | −0,3 | 5,1 | 4,5 |
| ES | 79,5 | 80,5 | +1,1 | 42,0 | 43,6 | +1,7 | 4,9 | 4,7 | −0,2 | 3,3 | 6,3 |
| GO | 79,3 | 79,7 | +0,4 | 41,3 | 40,3 | −1,0 | 3,2 | 2,9 | −0,4 | 9,4 | 6,6 |
| MA | 76,5 | 79,6 | +3,2 | 71,1 | 69,5 | −1,6 | 2,7 | 2,2 | −0,5 | 8,1 | 6,3 |
| MG | 79,0 | 79,7 | +0,7 | 50,2 | 50,4 | +0,2 | 4,2 | 3,5 | −0,7 | 7,6 | 6,8 |
| MS | 77,7 | 78,8 | +1,1 | 40,5 | 40,4 | −0,1 | 4,5 | 2,4 | −2,1 | 9,7 | 7,3 |
| MT | 77,5 | 79,1 | +1,6 | 34,9 | 33,9 | −1,0 | 2,3 | 1,9 | −0,4 | 7,5 | 6,6 |
| PA | 77,4 | 79,7 | +2,3 | 54,8 | 55,0 | +0,3 | 2,5 | 2,0 | −0,5 | 6,4 | 5,6 |
| PB | 83,3 | 84,5 | +1,2 | 66,6 | 67,5 | +0,8 | 6,6 | 3,1 | −3,5 | 8,0 | 7,3 |
| PE | 82,7 | 84,8 | +2,1 | 66,9 | 69,2 | +2,3 | 6,2 | 2,9 | −3,3 | 7,9 | 6,5 |
| PI | 81,3 | 82,8 | +1,6 | 76,9 | 75,9 | −1,0 | 3,4 | 2,7 | −0,7 | 11,3 | 9,0 |
| PR | 81,4 | 82,0 | +0,6 | 37,6 | 37,4 | −0,2 | 3,4 | 2,9 | −0,6 | 8,5 | 7,0 |
| RJ | 77,8 | 78,4 | +0,6 | 43,5 | 46,9 | +3,4 | 4,2 | 3,4 | −0,7 | 8,4 | 7,5 |
| RN | 82,6 | 83,9 | +1,4 | 65,1 | 65,7 | +0,6 | 3,4 | 3,7 | +0,3 | 11,2 | 8,1 |
| RO | 75,3 | 78,1 | +2,8 | 29,3 | 30,4 | +1,1 | 3,3 | 2,0 | −1,3 | 10,2 | 6,3 |
| RR | 78,1 | 76,9 | −1,2 | 23,9 | 27,5 | +3,6 | 2,0 | 1,8 | −0,2 | 3,3 | 4,1 |
| RS | 80,7 | 80,8 | +0,2 | 43,7 | 42,2 | −1,5 | 4,4 | 2,8 | −1,6 | 9,6 | 8,5 |
| SC | 82,6 | 83,0 | +0,5 | 30,7 | 30,6 | −0,2 | 3,2 | 2,6 | −0,6 | 8,5 | 7,5 |
| SE | 81,1 | 84,3 | +3,2 | 67,2 | 69,5 | +2,3 | 5,3 | 3,0 | −2,3 | 9,4 | 7,0 |
| SP | 78,9 | 80,2 | +1,3 | 44,8 | 46,2 | +1,4 | 6,0 | 4,0 | −2,0 | 6,8 | 6,0 |
| TO | 79,6 | 80,8 | +1,2 | 51,4 | 48,6 | −2,7 | 2,9 | 4,6 | +1,7 | 8,1 | 5,0 |
| Exterior | 44,6 | 41,6 | −3,0 | 51,3 | 53,9 | +2,6 | 3,9 | 2,6 | −1,3 | — | — |

AC, RN e TO têm brancos e nulos subindo. As três estão entre as seis UFs que também tiveram 2º turno para governador em 2026. DF, RR e o exterior têm o comparecimento caindo. No exterior os aptos cresceram 31,8%.

### 3.3 Por município (5.570 comparados)

Os dados estão em `historico-municipios.json` → `variacao2022a2026`, com as colunas `dComparecimentoPP, dPctAValidosPP, dPctAComparecPP, dPctBComparecPP, dBrancoNuloPP, dAptosPct, dVotantesPct, dVotosA, dVotosB`. O resumo está em `historico-resumo.json` → `comparacao["2022-2026"].municipios`.

- **Comparecimento** subiu em 4.128 municípios e caiu em 1.436. A mediana foi de +1,42 pp.
- **% do 13 nos válidos** subiu em 1.205 municípios e caiu em 4.359. A **mediana dos municípios foi de −2,04 pp**, enquanto o total do Brasil teve +0,88 pp. Os dois números não se contradizem. A alta se concentra em municípios grandes: Manaus +5,4, Macapá +5,9, Rio Branco +6,0, Nossa Senhora do Socorro +5,7, além do estado do RJ (+3,4) e do DF (+4,5). A queda é pequena e espalhada pelos municípios pequenos. Na distribuição, 1.543 municípios ficam entre −2 e 0 pp, 1.481 entre −4 e −2 e 856 entre −6 e −4.
- **Extremos de % do 13**: as maiores quedas ficam em municípios pequenos do RS (Passa Sete −15,8, Herveiras −15,6, Gramado Xavier −15,5, Canudos do Vale −15,4), em Senador José Porfírio (PA, −14,5) e em Jutaí (AM, −14,5). As maiores altas ficam em Pacaraima (RR, +7,6), Buerarema (BA, +7,4) e São Julião (PI, +7,2).
- **Extremos de comparecimento**: as maiores altas são de Amapá do Maranhão (+17,6 pp), Godofredo Viana (MA, +16,7) e Igrapiúna (BA, +15,6). As maiores quedas são de Cerro Grande (RS, −14,9) e Anhanguera (GO, −10,6).
- Brancos + nulos: a mediana foi de −0,83 pp.

---

## 4. O "fluxo normal": boletins de 2022 × 2026

As regras são as mesmas do `construir.mjs`: horário convertido para Brasília pelo fuso da UF, histograma em blocos de 5 min entre 16:30 e 21:00 e as mesmas contagens. Em 2022, assim como em 2026, a votação foi das 8h às 17h **de Brasília** em todo o país. A abertura mediana de 2022 foi 08:00 de Brasília.

> Efeito da simplificação de fuso nos dois anos: as seções do oeste do AM (UTC−5) aparecem como "encerradas antes das 17h". Em 2022 são 489 seções, todas no AM. Em 2026 são 556 (bloco das 16:30). O efeito é o mesmo nos dois anos e não muda as contagens depois das 17h.

### 4.1 Encerramento: o degrau das 19h **não existiu em 2022**

| Encerramento (Brasília) | 2022 | 2026 |
|---|---|---|
| 17:00 – 17:30 | 470.171 | 490.285 |
| 17:30 – 18:00 | 208 | 526 |
| 18:00 – 18:30 | 92 | 313 |
| 18:30 – 18:55 | 15 | 59 |
| 18:55 – 19:00 | 4 | 362 |
| **19:00 – 19:15** | **4** | **6.316** |
| 19:15 em diante | 17 | 36 |

A coluna de 2026 vem do `docs/ANALISE-INCONSISTENCIAS.md`, com o fuso inferido por município. As contagens das duas colunas usam o mesmo corte.

| Contagem (Brasília) | 2022 | 2026 |
|---|---|---|
| depois das 17:00 | 470.501 | 497.341 |
| depois das 17:05 | 46.053 (9,8%) | 57.030 (11,5%) |
| depois das 17:30 | 340 | 7.614 |
| depois das 18:00 | 132 | 7.089 |
| **depois das 19:00** | **21** | **6.336** |
| exatamente 19:00:00 | 0 | 16 |
| sem horário | 44 | 27 |

- **A cauda normal das 17h é parecida nos dois anos.** O encerramento das 17h segue o mesmo formato minuto a minuto: em 2022, 37,3%, 25,0%, 14,2%, 8,5% e 5,3% das urnas fecham nos minutos 0 a 4 depois das 17:00, contra 25,7%, 31,6%, 17,0%, 9,8% e 6,0% em 2026. Entre 17:05 e 17:30 fecharam 46 mil seções em 2022 e 50 mil em 2026.
- **A partir das 17:30 a cauda de 2022 cai continuamente até sumir**: 208, 92, 15, 4, 4. Nenhuma UF de 2022 tem mais de 4 seções depois das 19h (MA 4, MG 4, PA 3, AP 2, SP 2 e outras com 1). Em 2026 a cauda praticamente some e reaparece com 6.316 seções entre 19:00 e 19:15.
- **As mesmas zonas, em 2022 e em 2018.** Nas 15 zonas com mais urnas encerradas depois das 19h em 2026 (Rio Z122, Z238, Z234, Z245, Z120 e Z9, Petrópolis Z65, Itaboraí Z104, Salvador Z5, Z19 e Z2, São Paulo Z381, Z1 e Z253 e João Pessoa Z76), o encerramento mediano foi entre 17:01 e 17:05 nos dois anos. Em 2022 houve **1 seção** depois das 19h em todas essas zonas juntas (Petrópolis Z65) e 6 depois das 17:30. Em 2018, nenhuma depois das 19h. Em 2026, essas 15 zonas somam 2.876 seções depois das 19h (Rio Z122: 196 de 200).
- Emissão do BU mais de 1 h depois do encerramento: **21** seções em 2022, contra 368 em 2026. A mediana entre encerramento e emissão foi de 2,2 min em 2022 (99% em até 5,7 min), igual à de 2026 (2 min). Uma seção de 2022 tem data de emissão absurda (relógio da urna) e ficou de fora.

**Resposta:** o "degrau das 19h" não aparece em 2022 nem em 2018 (no horário local, ver item 5). Em 2022, 21 urnas encerraram depois das 19h. Em 2026 foram 6.336, concentradas em zonas que fecharam às 17h em 2022.

### 4.2 Recebimento dos BU (`DT_BU_RECEBIDO`): **o vazio das 17h10–19h00 também não existiu em 2022**

| Chegada (Brasília, Brasil sem exterior) | 2022 | 2026 |
|---|---|---|
| primeiro BU | 17:01:41 | ~17:05 |
| até 17:10 | 2.127 | 1.092 |
| **17:10 – 19:00** | **394.286 (83,7%)** | **0** |
| 17h–18h | 134.848 | — |
| 18h–19h | 261.565 | 0 |
| 19h–20h | 69.886 | 110.008 |
| 20h–21h | 4.265 | 330.395 |
| depois das 21h | 446 | 56.402 |
| maior intervalo sem nenhum BU (blocos de 5 min) | 75 min, só no fim da fila (23:00 → 00:15, um único BU retardatário) | **110 min (17:10 → 19:00)** |
| maior intervalo exato entre dois BU | 81 min (22:56 → 00:17) | — |
| UFs sem nenhum BU antes das 19h | nenhuma | RJ, SP, SE |
| emissão → recebimento, mediana | 1h22 (p10 29 min, p90 2h04, p99 2h55) | 3h20 |

- Em 2022 os BU chegaram desde as 17h, com o pico entre 18h e 19h. Em 2026 a chegada começa só às 19h e vai até ~21h10, num ritmo quase constante.
- Em 2022 há **16** BU com recebimento anterior à emissão (máximo de 49 min, relógio da urna), contra 8 em 2026.
- O campo de 2022 está no horário de Brasília: as seções do AC (UTC−5) chegam depois do próprio encerramento convertido.

### 4.3 A "virada" (curva acumulada de recebimento)

Curva acumulada no Brasil sem o exterior. A versão com o exterior está em `curvaComExterior`. Em 2022, alguns postos do exterior chegam de madrugada no horário de Brasília (o primeiro bloco é 01:20).

| % das seções recebidas | 2022: horário | 2022: % do 13 no acumulado | 2026: horário | 2026: % do 13 no acumulado |
|---|---|---|---|---|
| ~1% | 17:10 | 42,0% | 19:00 | 51,2% |
| ~8–11% | 17:30 | 48,0% | 19:30 | 50,4% |
| ~27–32% | 18:00 | 49,1% | 20:00 | 49,5% |
| ~59–60% | 18:30 | 49,9% | 20:30 | 50,5% |
| ~88–94% | 19:00 | 50,5% | 21:00 | 51,7% |
| 100% | 50,90% final | | 51,78% final | |

- **2022**: o 22 liderou o acumulado desde o início, e o 13 passou à frente **às 18:40, com 68,8% das seções** (49,92% → 50,01%). Essa é a virada conhecida da noite de 2022.
- **2026**: o 13 começou à frente (51,6% nos primeiros 1.092 BU), o 22 passou à frente entre 19:30 e 20:00 (entre 8% e 27% recebido) e o 13 voltou à frente **às 20:25, com 54,3% das seções** (49,99% → 50,27%). Com o exterior, a última troca é às 20:20, com 48,5%.

A ordem de chegada depende de quais UFs e zonas transmitem antes. Uma virada no acumulado é esperada quando os dois lados têm força em regiões diferentes e não indica nada sobre os votos. Os dados por UF e bloco estão em `fluxo.2022.apuracao`, no mesmo formato de `resumo.json`.

### 4.4 Biometria (campo de eleitores com biometria liberados sem a digital)

| | 2018 | 2022 | 2026 |
|---|---|---|---|
| Total (Brasil) | 7.898.943 | 10.011.347 | 8.632.488 |
| % do comparecimento | 6,83% | **8,08%** | **6,75%** |
| Seções com o campo = 0 | 128.794 | 5.735 | 485 |

- 2026 tem uma taxa **menor** que a de 2022 em 25 das 27 UFs. As exceções são ES (3,3% → 6,3%) e RR (3,3% → 4,1%). As maiores taxas de 2022 foram PI 11,3%, RN 11,2%, AL 10,9%, RO 10,2% e BA 10,0%. Em 2026, PI 9,0% e RS 8,5%.
- Em 2022 há muitas seções zeradas no ES (3.683) e no MT (845), o que explica a taxa baixa do ES naquele ano. Em 2018 o campo era zero em 82 mil seções de SP, onde o cadastro biométrico ainda não estava completo. Por isso 2018 não é comparável por UF.
- Os números por UF estão em `fluxo.<ano>.biometria.porUf`.

### 4.5 Alertas (mesmas regras do `construir.mjs`)

| Alerta | 2014 | 2018 | 2022 | 2026 |
|---|---|---|---|---|
| Comparecimento > aptos | 0 | 0 | 0 | 0 |
| Aptos ≠ comparecimento + abstenções | 0 | 0 | 0 | 0 |
| Votos ≠ comparecimento | 0 | 0 | 0 | 0 |
| Biometria > comparecimento | 0 | 0 | 0 | 0 |
| Unânime (≥ 50 válidos) | 146 | 263 | 119 | 91 |
| ≥ 50% sem a digital | — | 113 | 318 | 96 |
| Destoa do local (≥ 30 pp) | 5 | 8 | 5 | 5 |
| Comparecimento destoa do local (≥ 25 pp) | 54 | 83 | 51 | 41 |
| Encerrada depois das 19h de Brasília | — | (horário local) | **21** | **6.352** |
| Urna diferente de "Apurada" | 40 | 43 | 1 | 0 |
| Sem horário | — | 0 | 44 | 27 |
| **Seções com algum alerta** | 244 | 508 | 555 | 6.609 |

Sem o alerta das 19h, 2026 fica no mesmo patamar dos anos anteriores ou abaixo dele. Os únicos números de 2026 fora do padrão histórico são os do horário: o encerramento depois das 19h e o vazio de recebimento.

---

## 5. 2018 (versão leve)

Em 2018 a votação ia das 8h às 17h no **horário local**. O horário unificado de Brasília começou em 2022. O boletim de 2018 não traz recebimento nem emissão.

- **No horário local**, a cauda é normal: 30.116 seções depois das 17:05, 293 depois das 17:30, 122 depois das 18:00 e **34 depois das 19:00**. Entre 19:00 e 19:15 foram 8 seções. Não há degrau.
- **No horário de Brasília**, aparece um "degrau" de 1.924 seções às 19:00–19:15 e outro de 26.186 às 18:00–18:30. São o Acre (17h local = 19h em Brasília) e as UFs de UTC−4 (17h local = 18h). Esse degrau vem do fuso e não se compara com o de 2026, quando todos fecharam às 17h de Brasília.
- As zonas do pico de 2026 encerraram às 17:01–17:05 locais em 2018, sem nenhuma seção depois das 19h.

---

## 6. O que bate e o que difere (resumo)

**Bate com 2022 (e 2018):**
- A integridade das contas por seção: nenhum caso de comparecimento maior que os aptos ou de votos diferentes do comparecimento, em nenhum ano.
- O formato da cauda normal das 17h (5 a 10 minutos de fila) e a mediana de 2 minutos entre encerramento e emissão.
- Os alertas de conteúdo (unânimes, seções destoando do local), no mesmo patamar ou menores.
- A biometria: 6,75% em 2026 contra 8,08% em 2022, ou seja, menos liberações sem a digital.

**Difere de 2022:**
1. **Encerramento depois das 19h:** 21 seções em 2022, 6.336 em 2026, em zonas que fecharam às 17h em 2022 e em 2018.
2. **Recebimento:** em 2022, 83,7% dos BU chegaram entre 17h10 e 19h. Em 2026, nenhum. A mediana entre emissão e recebimento passou de 1h22 para 3h20.
3. **Emissão do BU com mais de 1 h de atraso:** 21 seções em 2022, 368 em 2026.
4. **Virada no acumulado:** em 2022, o 13 passou à frente às 18:40, com 68,8% recebido. Em 2026 o acumulado trocou de lado duas vezes, e a última troca foi às 20:25, com 54,3% recebido. A ordem de chegada mudou porque toda a chegada foi deslocada para depois das 19h.
5. **Resultado:** comparecimento +1,43 pp, brancos e nulos −1,35 pp e % do 13 +0,88 pp no Brasil. Nos municípios, a mediana da % do 13 foi de −2,04 pp. A alta se concentra em grandes cidades e em alguns estados (DF, AP, AC, RR, RJ e AM).

Os itens 1 a 3 não aparecem no histórico e continuam pedindo a explicação oficial já listada em `docs/ANALISE-INCONSISTENCIAS.md` (itens 2.2 e 2.3).

## 7. Limitações

- O fuso é o da UF, como no `construir.mjs`. O oeste do AM aparece antes das 17h nos dois anos.
- O recebimento de 2026 está em blocos de 5 min (lido do `resumo.json`), e o de 2022 está com precisão de segundos. O "maior vazio" usa blocos de 5 min nos dois anos, para ficar comparável.
- Os números de zona podem ter mudado entre os anos por rezoneamento. A comparação das zonas do pico usa município e número de zona.
- A comparação por município usa o território atual. Boa Esperança do Norte (MT) não tem par em 2022.
- O exterior (UF ZZ) fica fora do "Brasil" e dos municípios, mas está nos totais `total` e na UF ZZ.
