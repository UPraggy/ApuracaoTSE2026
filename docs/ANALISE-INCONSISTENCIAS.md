# Inconsistências e "coisas estranhas" nos boletins de urna: 2º turno de 2026, Presidente

Gerado por `scripts/investigar.mjs` a partir dos boletins de urna (BU) publicados pelo TSE: 28 arquivos `bweb`, 2.088.107 linhas, 499.205 seções (497.897 no Brasil e 1.308 no exterior). Também usa o cadastro de locais de votação (`eleitorado_local_votacao_2026_*`, turno 2). Os números detalhados estão em `dados/investigacao.json`.

**Como ler este documento.** Cada achado traz quatro coisas: o número, onde ele acontece, a explicação mais provável e se é ou não indício de problema. **Nada aqui prova fraude e nada aqui prova que não houve.** Uma conta estranha é um motivo para ir olhar o documento original. Ela não é uma conclusão. Para conferir uma seção específica, o caminho é sempre o mesmo:

- o **BU impresso** (afixado na seção e com QR code), para ver se os números do arquivo batem com o papel;
- o **RDV** (Registro Digital do Voto), que guarda cada voto embaralhado e permite recontar a seção;
- o **log da urna**, que registra com hora cada evento: abertura, cada eleitor habilitado (por biometria ou não), cada voto e o encerramento;
- a **ata da mesa receptora** e as decisões do TRE/zona eleitoral, para substituição de urna, prorrogação de horário, etc.

Os três arquivos da urna (BU, RDV e log) ficam na página de resultados do TSE, em "dados de urna", buscando por UF, município, zona e seção.

Rodar: `node --max-old-space-size=6000 scripts/investigar.mjs` (≈ 35 s de leitura, ≈ 2 min no total). Para repetir sem reler os CSV, use `INVESTIGAR_CACHE=<arquivo>`.

---

## Resumo em uma tabela

| # | Achado | Número | Indício de problema? | O que conferir |
|---|---|---|---|---|
| 1 | Encerramentos por volta das 19h (Brasília) | 6.352 seções; 6.316 entre 19:00 e 19:15; só 59 entre 18:30 e 18:55 | **Precisa de explicação oficial.** O padrão não parece fila comum | Log das urnas (hora do último voto), atas e decisões dos TREs de RJ, SP, BA, PE e PB |
| 2 | BU emitido mais de 1 h depois do encerramento | 368 seções, 355 delas nas mesmas zonas do item 1 | Faz parte do mesmo evento do item 1 | Log da urna |
| 3 | Nenhum BU chegou ao TSE entre 17h10 e 19h00 | 1.092 chegaram até 17h10; o próximo só às 19h00 | Estranho no campo de tempo, mas não nos votos | Perguntar ao TSE o que `DT_BU_RECEBIDO` mede |
| 4 | Mesma "urna" em várias seções | 2 números, em 27 seções do exterior (9 + 18), todas sem horário | Provavelmente número genérico (sem urna eletrônica) | Atas desses postos no exterior (831 votantes) |
| 5 | Aptos do BU ≠ cadastro do local | 311.344 seções, mas +446.267 e −444.035 quase se anulam | Não; o voto em trânsito e os presos provisórios mudam os aptos | Lista de transferência temporária |
| 6 | Seção abrindo tarde (depois das 9h) | 84 seções; 16 depois das 10h; 1 às 13h08 | Caso a caso. Inácio Martins (PR) chama atenção | Atas: em PR Inácio Martins Z34 S133 só 18 de 215 votaram |
| 7 | Seções unânimes ou quase | 91 com 100% (88 para o 13, 3 para o 22); 371 com ≥ 98% | Esperado (aldeias, assentamentos) | BU impresso dos casos maiores |
| 8 | Seção destoando muito das vizinhas do mesmo local | 420 com \|z\| > 4 (já descontada a variação natural); 216 delas são a seção de número mais alto do local (72 seriam esperadas) | Na maior parte, explicação conhecida (seção nova). Os extremos valem conferência | BU impresso / RDV dos extremos |
| 9 | Último dígito dos votos | 13: p = 0,88; 22: p = 0,23 (uniforme) | Não | — |
| 10 | Brancos + nulos = 0 com ≥ 150 votantes | 2.178 (esperado pelo acaso: entre 1.545 e 3.599) | Não; concentrado onde se anula pouco (PA, AP, RO, RR) | — |
| 11 | Biometria: campo zerado com ≥ 200 votantes | 134 seções; 485 zeradas no total | Não sistemático; 64 das zeradas são presídios | Log da urna |
| 12 | Biometria: ≥ 50% liberados sem a digital | 96 seções; caso extremo 225 de 227 (PR Tomazina S55) | Indica leitor com defeito ou procedimento da mesa | Log da urna (cada habilitação fica registrada) |
| 13 | Governador × Presidente na mesma seção | 1.818 seções com comparecimento diferente, **sempre** maior para Presidente (+24.727) | Não; é o eleitor em trânsito de outra UF, que só vota para Presidente | — |
| 14 | Carga das urnas | 99,3% antes do 1º turno; 709 na véspera; 5 no dia da eleição | Não; os casos do dia são substituições antes da abertura | Ata da substituição |

---

## 1. Integridade e unicidade

| Verificação | Resultado |
|---|---|
| Linhas repetidas (mesma seção e mesmo votável duas vezes) | **0** |
| Seção com aptos, comparecimento, horários ou urna diferentes entre as próprias linhas | **0** |
| Tipo de urna diferente de "Apurada" | **0** (todas apuradas) |
| Votos anulados e apurados em separado (votável 97) | 0 |
| Cadastro: seção principal ativa sem BU | **0** (499.248 principais no cadastro) |
| Seção agregada que também tem BU próprio | **0** |
| Seção agregada listada em duas urnas | **0** |
| Agregada do cadastro que não aparece na lista da urna principal | **0** |
| Urnas com seções agregadas | 16.142 urnas, que somam 17.931 seções agregadas (até 10 numa urna) |
| Números de urna distintos | 499.180 para 499.205 seções |
| Códigos de carga distintos | 499.180 (o código repete exatamente onde a urna repete) |

**Urna repetida (2 números, 27 seções, só no exterior).** A urna `1762246` aparece em 9 seções (Bissau, Windhoek, Kiev, Abidjã, Moscou, Hanói, Argel, Mumbai e Túnis) e a `1808076` em 18 (Nassau, Havana, Mascate, Sófia, Díli, Teerã, Lagos e outras). Uma urna física não pode estar em Moscou e em Hanói no mesmo dia. Essas 27 seções são exatamente as 27 que não têm horário de abertura nem de encerramento, e todas têm a mesma data de carga. A explicação mais provável é que esses postos votaram sem urna eletrônica (em cédula, por exemplo) e o número é um preenchimento genérico do sistema. Somam 831 votantes. Também há 2 linhas com cargo `#NULO#` (exterior, 30 e 72 aptos, comparecimento 0, "urna" `1808076`): seções em que ninguém votou. **Conferir:** as atas desses postos no exterior.

**Aptos do BU × cadastro de eleitores.** Só 186.553 seções (37%) têm o número de aptos do BU igual ao `QT_ELEITOR_SECAO` do cadastro. Parece muito, mas a conta fecha:

| Tipo de local | Seções com diferença | Soma da diferença |
|---|---|---|
| Convencional, BU com menos aptos | 226.557 | −440.603 |
| Convencional, BU com mais aptos | 82.116 | +383.294 |
| Seções de voto em trânsito (146 com cadastro = 0) | 152 | +46.789 |
| Seções de presos provisórios (cadastro = 0) | 243 | +14.736 |
| Temporário | 2.276 | −1.984 |
| **Total** | 311.344 | **+2.232** |

As perdas (quase sempre −1 ou −2 por seção) e os ganhos quase se anulam. É o retrato do eleitor que pediu para votar em trânsito: ele sai da seção de origem e entra numa seção de destino (muitas vezes convencional, em capital). O cadastro de locais mostra a seção "de casa" e não conta essa mudança. As seções com agregadas batem na mesma proporção das demais (37,9% × 37,5%), então a soma das agregadas está correta. **Não é indício de problema.** Para conferir um caso, use a lista oficial de transferências temporárias.

**Local de votação diferente do cadastro (7.315 seções).** Em todas as 7.315, o número de local do BU é o `NR_LOCAL_VOTACAO_ORIGINAL` do cadastro. A seção mudou de prédio no cadastro e o BU guarda o número original. Não é problema.

---

## 2. Horários

O horário de votação é unificado: das 8h às 17h de Brasília. Os horários do BU estão na hora local da urna. O script **descobre o fuso de cada município** pela hora mediana de abertura e encontrou 12 municípios com fuso diferente do da UF: 11 no oeste do Amazonas, que abrem às 6h locais como o Acre (Tabatinga, Benjamin Constant, Atalaia do Norte, Eirunepé, Envira, Guajará, Ipixuna, Itamarati, Jutaí, Amaturá e São Paulo de Olivença), e Fernando de Noronha, que abre às 9h locais. Essa correção não muda a contagem das 19h.

> Sobre 6.336 × 6.352: a diferença é só de definição. São 6.336 seções **depois** das 19:00:00 e 6.352 **a partir de** 19:00:00; 16 urnas encerraram exatamente às 19:00:00.

### 2.1 Checagens básicas: todas limpas ou quase

| Verificação | Resultado |
|---|---|
| Encerramento antes das 17h de Brasília | **0** |
| Abertura antes das 7h30 de Brasília | **0** |
| Encerramento antes da abertura, ou horário fora do dia 25 | **0** |
| Emissão do BU antes do encerramento | **0** |
| BU recebido antes de ser emitido | **8** (7 no PA, 1 no PR), sempre por menos de 1 minuto (ex.: PA Afuá Z16 S77: emitido 17:07:09, recebido 17:06:20). Indica relógio da urna alguns segundos adiantado. Irrelevante |
| Abertura depois das 9h | 84 seções (BA 16, RJ 14, MG 8, PR 8, SP 6…); 16 depois das 10h; 1 depois das 12h |
| Duração da votação | mediana de 9h02; 99% entre 8h57 e 11h01 |
| Eleitores por hora | mediana de 29; máximo de 53. Nenhuma seção com ritmo impossível (> 75/h) |
| Emissão do BU depois do encerramento | mediana de 2 min; 99% em até 5 min; 368 seções levaram mais de 1 h (ver 2.2) |
| BU recebido no dia 26 ou depois | **0** (o último chegou às 23h21 de Brasília) |

**Aberturas tardias que valem uma olhada.** Em **PR Inácio Martins (Z34)**, 5 seções abriram entre 10h02 e 10h59, enquanto o resto do município abriu às 8h00. Uma delas, a **S133**, teve só **18 votantes de 215 aptos (8,4%)**, contra cerca de 80% nas outras: é o menor comparecimento do país entre seções com ≥ 100 aptos. A S117 teve 52%. Outros casos: MG Itajubá Z134 S295 abriu às 13h08 (25 aptos, 9 votantes), ES Ecoporanga Z33 S49 e PA Óbidos Z22 S259 abriram às 11h00, e BA Santo Amaro Z178 S118 às 10h23. Só 3 dessas 84 tiveram a urna carregada no próprio dia; nas outras, o atraso não veio de troca de urna registrada. **Conferir:** as atas das mesas (problema no local, falta de mesário, urna que não ligava).

### 2.2 O pico das 19h: o achado mais estranho

**O que os números mostram:**

| Encerramento (Brasília) | Seções |
|---|---|
| 17:00 – 17:30 | 490.285 |
| 17:30 – 18:00 | 526 |
| 18:00 – 18:30 | 313 |
| 18:30 – 18:55 | 59 |
| 18:55 – 19:00 | 362 |
| **19:00 – 19:15** | **6.316** |
| 19:15 em diante | 36 (2 depois das 20h: RJ Duas Barras Z42 S108 às 20h45 e MG Chapada Gaúcha Z320 S185 às 23h04) |

A fila do fim do dia produz uma cauda contínua e decrescente a partir das 17h. Aqui a cauda praticamente some entre 18h e 18h55 e então surge um segundo pico, abrupto, às 19h00. O formato desse pico, minuto a minuto, é quase o mesmo do pico normal das 17h:

| Minuto após o horário | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| % das que fecharam depois das 17:00 | 25,7 | 31,6 | 17,0 | 9,8 | 6,0 | 3,9 | 2,4 | 1,4 |
| % das que fecharam depois das 19:00 | 31,6 | 23,4 | 14,8 | 10,8 | 7,7 | 4,5 | 3,0 | 1,8 |

Isso parece um **segundo horário de encerramento às 19h**, e não gente na fila. Outros detalhes:

- **Onde:** RJ 2.805, SP 1.571, BA 936, PE 657, PB 275, SE 51; quase nada no resto. Por município: Rio de Janeiro 1.978, São Paulo 1.481, Salvador 730, Petrópolis 285, João Pessoa 265, Itaboraí 237, Recife 220. São 1.131 locais em 274 zonas. Em 10 zonas, mais da metade das urnas fechou depois das 19h: Rio Z122 (98%), Z238 (93%), Z234 (92,5%), Salvador Z5 (87%), Petrópolis Z65 (83%), Rio Z245 (82%), Z120 (82%) e Itaboraí Z104 (81%), entre outras. Essas 10 zonas concentram 1.888 das 6.352 seções. No resto, é uma fração pequena de cada zona.
- **Abertura normal:** a mediana é 08:00, igual às outras seções. Um relógio da urna errado deslocaria a abertura também, então essa explicação fica improvável.
- **Mesmo comparecimento e mesmo resultado:** nos 716 locais com seções que fecharam às 19h e seções que fecharam antes das 18h, as "tardias" tiveram comparecimento só **+0,12 ponto** acima e a % do 13 só **−0,26 ponto** abaixo das vizinhas do mesmo prédio. Duas horas a mais de votação aberta, com gente chegando, deveriam aumentar o comparecimento. Isso não aconteceu.
- **Seções um pouco maiores:** em média 293 votantes contra 256. Fecharam depois das 19h 8,7% das seções com 350 a 399 votantes, contra 0,9% das seções com 200 a 299. A fila explica parte do fenômeno, mas não o degrau exato às 19h.
- **BU emitido com atraso nas mesmas zonas:** 368 seções encerraram por volta das 17h mas só emitiram o BU entre 18h e 19h30. Delas, 355 estão nas mesmas zonas do pico. Exemplo, Rio Z122: as seções 29, 30 e 304 encerraram às 17:04–17:05 e emitiram o BU às 19:11–19:16, enquanto as outras 196 seções da zona "encerraram" às 19:00–19:01. Tudo indica que algo nessas zonas segurou o encerramento ou a emissão do BU até as 19h.
- **16 urnas encerraram exatamente às 19:00:00**, com zero segundos (Salvador, Lauro de Freitas, Encruzilhada, João Pessoa, Rio e São Paulo). Nenhuma encerrou exatamente às 17:00:00.
- **A chegada ao TSE não decide a questão.** Todas chegaram depois do encerramento registrado, mas em várias capitais as "tardias" chegaram quase junto com as normais (Rio: 21h08 × 21h04). Ver item 2.3.

**Explicação provável:** um evento operacional por zona: prorrogação do horário de votação por decisão judicial (por fila, falta de energia ou transporte), ou encerramento e emissão do BU adiados por instrução da zona. **É indício de problema?** Não diz nada sobre os votos, porque o resultado dessas seções é igual ao das vizinhas. Mas é uma irregularidade de **procedimento** que precisa de explicação documentada. **Conferir:** (1) o **log da urna** de algumas seções da Rio Z122, Z238 e Z234, Petrópolis Z65 e Salvador Z5, que mostra a hora do último voto. Se o último voto foi por volta das 17h e nada aconteceu até as 19h, foi encerramento adiado; se houve votos entre 17h e 19h, a votação foi de fato prorrogada. (2) As atas das mesas e eventuais decisões dos TREs de RJ, SP, BA, PE e PB sobre prorrogação.

### 2.3 Chegada dos BU ao TSE: um buraco de duas horas

| Chegada (Brasília) | BU |
|---|---|
| 17:00 – 17:10 | 1.092 |
| 17:10 – 19:00 | **0** |
| 19:00 – 20:00 | 110.008 |
| 20:00 – 21:00 | 330.395 |
| 21:00 – 21:10 | 53.152 |
| depois das 21:10 | 3.250 |

Depois dos primeiros 1.092 BU, nenhum chega por quase duas horas. Depois chegam num ritmo quase constante de ~5.500 a cada 10 minutos até 21h10, como uma fila sendo processada na velocidade máxima. RJ, SP e SE não têm nenhum BU antes das 19h. Além disso, a mediana entre emissão e chegada é de 3h20, longa para uma transmissão. A explicação provável é que `DT_BU_RECEBIDO` registra o processamento no sistema de totalização (talvez com uma pausa ou uma fila), e não a chegada física. Os 100 BU que levaram mais de 5 h estão quase todos em zonas remotas de MG (Machacalis, Pavão, Santa Helena de Minas e Fronteira dos Vales, nas zonas 4 e 270) e chegaram por volta das 22h30, o que é compatível com mídia levada por estrada. **É indício de problema?** Não nos votos. É uma pergunta para o TSE sobre o que o campo mede e por que houve a pausa.

---

## 3. Carga das urnas

| Data da carga | Urnas |
|---|---|
| 15/09 a 03/10 (antes do 1º turno, 04/10) | 495.642 (99,3%) |
| 04/10 (dia do 1º turno) | 10 |
| 05/10 a 23/10 | 1.531 |
| 24/10 (véspera) | 709 |
| 25/10 (dia da eleição) | 5 |

- A carga de quase todas as urnas é anterior ao 1º turno: a mesma carga serviu aos dois turnos. Isso é compatível com a preparação única das urnas, mas vale confirmar na resolução de atos preparatórios de 2026.
- As 1.531 cargas entre os turnos e as 709 da véspera parecem reposição de urnas e urnas de contingência. As da véspera estão sobretudo em capitais (São Paulo 28, Brasília 20, Manaus 12, Salvador 12, Rio 11). As de entre turnos se agrupam em zonas (Pradópolis Z197 com 29, São Paulo Z418 com 26, Praia Grande Z317 com 21, São Gonçalo Z68 com 20). Têm comparecimento (80,8%) e biometria (7,2%) normais.
- As **5 cargas no dia da eleição** foram todas antes da abertura daquela urna, o que é compatível com troca de urna pela manhã: MS Campo Grande Z8 S486 (carga às 06:55, abertura às 07:26 locais), MS Três Lagoas Z51 S44, PR Carlópolis Z56 S37 (carga às 09:20, abertura às 10:02), PR Guarapuava Z43 S397 e SP Atibaia Z16 S436. **Nenhuma carga depois da abertura.**
- 23.170 códigos de flashcard de carga (cada flash carrega várias urnas; o mais usado aparece em 125). Normal.
- A carga acontece em horário comercial (a maioria das 8h às 17h). 60 urnas foram carregadas entre 0h e 6h, o que é curioso, mas pode ser turno noturno de preparação. Conferir na ata da cerimônia de carga, se interessar.

**Indício de problema?** Não. Para as 5 trocas no dia, a ata da mesa deve registrar a substituição.

---

## 4. Distribuição dos votos

### 4.1 Último dígito (teste de manipulação manual de números)

Quando alguém inventa números, alguns dígitos finais aparecem mais que outros. Nos números reais, cada dígito final aparece ~10% das vezes.

| Contagem (seções com ≥ 10) | Seções | Qui-quadrado (9 g.l.) | p | Conclusão |
|---|---|---|---|---|
| Votos no 13 | 497.722 | 4,51 | 0,875 | uniforme |
| Votos no 22 | 495.292 | 11,80 | 0,225 | uniforme |
| Comparecimento | 497.896 | 9,64 | 0,381 | uniforme |
| Abstenções | 496.222 | 12,15 | 0,205 | uniforme |

Por UF, os 54 testes (27 UFs × 2 candidatos) têm p entre 0,018 e 0,95. Os poucos abaixo de 0,05 (DF-22, MT-13 e RO-13) são o que se espera por acaso em 54 testes. **Não é indício de problema.** Dois testes ficaram de fora por não valerem aqui: o de brancos e nulos (quase sempre menos de 20 por seção, e números pequenos não têm dígito final uniforme) e o dos "dois últimos dígitos" (os votos por seção vão só de 0 a ~350, faixa estreita demais, e o teste reprovaria até dados perfeitos).

### 4.2 Comparecimento extremo (seções com ≥ 100 aptos)

| | Seções | Onde |
|---|---|---|
| > 95% | 468 | CE 64, BA 57, PE 44, PI 32, MG 31… |
| = 100% | 3 | CE Dep. Irapuan Pinheiro Z55 S160 (127/127), MG Jaíba Z63 S194 (103/103), RN Caraúbas Z36 S69 (163/163) |
| < 40% | 18 | espalhadas; PR Inácio Martins S133 (8%), MS Aquidauana Z10 S130 (11%), RJ Mangaratiba Z54 S140 (14%), CE Pacatuba S324 (presídio, 18%) |

Destoando do próprio local: GO Trindade Z49 S213 (41% contra 78% no prédio), RR Normandia Z9 S77 (19% contra 80%), SP Sorocaba Z342 S338 (33% contra 74%). **Conferir** as atas desses casos (seção que mudou de prédio, problema de acesso). As seções com comparecimento acima de 95% são, em geral, pequenas e rurais. Nenhuma tem comparecimento maior que o número de aptos.

### 4.3 Seções unânimes e o "padrão Klimek"

- **91 seções** com 100% dos válidos para um só candidato (≥ 50 válidos): 88 para o 13 e 3 para o 22 (RS Arroio do Padre Z34 S433, com 116 votos; RS Cândido Godói Z166 S81, com 82; PA Jacareacanga Z102 S44, com 50). Ficam sobretudo no AM (30), MA (17), PA (13), RR e TO (6 cada). Pelo menos 37 estão em locais com "indígena", "aldeia" ou "polo base" no nome; outras ficam em assentamentos (PR Ortigueira, "Assentamento Maila Sabrina", com 314 a 0).
- 371 seções com ≥ 98% para um lado (AM 120, MA 78).
- **97 seções** com comparecimento ≥ 95% **e** ≥ 90% para um candidato (92 para o 13 e 5 para o 22). É o cruzamento usado como "impressão digital" de enchimento de urna. Aqui elas estão em aldeias e comunidades rurais, onde o voto em bloco é conhecido.

**Indício de problema?** Não em si. O padrão é conhecido e concentrado em comunidades indígenas e rurais. Os casos grandes podem ser conferidos no BU impresso.

### 4.4 Distribuição da % do 13 por seção

O histograma nacional, em faixas de 5 pontos, tem **um único pico** (45–50%) e é largo. Não há bimodalidade "estranha" nem degraus. Também não há picos isolados em valores redondos. A moda de cada UF acompanha o resultado da UF: 75–80% em BA, PB e PI; 20–25% em RO e RR.

### 4.5 Seções muito diferentes das vizinhas do mesmo local

Cada seção (≥ 50 válidos) foi comparada às outras seções do mesmo prédio (locais com ≥ 3 seções): 450.588 testes.

- A variação entre seções vizinhas é **1,72 vez maior** que a do sorteio puro. É normal: as seções de uma escola não são sorteadas, e cada uma junta eleitores de idade e data de inscrição parecidas.
- Descontado isso, 420 seções ficam a mais de 4 desvios das vizinhas (32 a mais de 6). Para o lado do 13 são 292; para o lado do 22, 128. SP 82, MG 41, RS 40, SC 40, BA 37…
- **216 dessas 420 são a seção de número mais alto do prédio**, quando o acaso daria ~72. Seção de número alto costuma ser a mais nova, com eleitores recém-inscritos ou transferidos (mais jovens, recém-chegados). É a explicação mais provável para boa parte dos casos.
- Só 8 das 420 têm número de local diferente do cadastro: troca de prédio não explica.

Casos mais extremos: **MA Açailândia Z71, local 1767 (Escola Municipal Oziel Alves)**, onde a S468 deu 36,6% para o 13 enquanto as outras duas seções do prédio deram 84,1% e 74,4% (a S468 é a mais nova). Também SP Botucatu Z26 S402 (75,9% × 41,0%), MG Belo Horizonte Z32 S336 (84,5% × 54,4%), SP Bauru Z23 S463 (72,4% × 39,6%) e PR Bom Sucesso do Sul Z73 S170 (54,2% × 25,2%). **Conferir:** BU impresso e RDV desses extremos. É barato e encerra a dúvida.

### 4.6 Brancos + nulos = 0

Há 2.178 seções com ≥ 150 votantes e nenhum branco ou nulo. Com a taxa média nacional (3,24%), o acaso daria só ~302. Mas a taxa varia muito: PA 1,99%, AP 1,94%, RR 1,76%, RO 1,99%, contra 4–4,7% em SP, ES, TO e AC. Usando a taxa do próprio município, o esperado é ~1.545; usando a do próprio local, ~3.599. O observado fica entre os dois e se concentra exatamente onde se anula pouco: PA 526, MA 321, Cametá 24, Abaetetuba 18. **Não é indício de problema.**

### 4.7 Resultados repetidos

- **Mesmo local, votos idênticos** (13, 22, brancos e nulos iguais, ≥ 100 válidos): 53 pares. Uma simulação em que cada seção sorteia seus votos com as proporções do próprio local dá entre 41 e 64 pares. **Dentro do acaso.**
- Seções de lugares diferentes com o mesmo resultado completo (aptos, comparecimento, 13, 22, brancos, nulos): 1.162 grupos, nenhum suspeito. Com 500 mil seções, coincidências assim são esperadas (efeito aniversário).

---

## 5. Biometria (`QT_ELEI_BIOM_SEM_HABILITACAO`)

O campo conta eleitores **que têm biometria cadastrada** mas foram liberados sem ela, porque a digital não foi reconhecida e o mesário liberou por outro meio. Total: 8.632.488, ou 6,75% de quem votou no Brasil.

| Verificação | Resultado |
|---|---|
| Seções com o campo = 0 | 485 (0,1%), das quais 64 em presídios; 134 com ≥ 200 votantes |
| Onde ficam as zeradas com ≥ 200 votantes | SP 25, AM 12, PA 11, BA e DF 9; Brasília 9 seções. Ex.: AL Maceió Z54 S236 (372 votantes), SP Jacareí Z396 S254 (352) |
| Município inteiro zerado | **nenhum** |
| % de seções zeradas por UF | de 0,01% (RN) a 0,99% (RR); maior no Norte (PA 0,46%, AP 0,42%) |
| Seções com campo > comparecimento | 0 |
| Seções com campo = comparecimento | 0 |
| Seções com ≥ 50% liberados sem biometria | 96, com BA à frente (Lauro de Freitas 9, Simões Filho 4, Candeias 4) |

**Extremos:** PR Tomazina Z19 S55 (225 de 227 votantes sem biometria, 99%), SP São Paulo Z408 S361 (272 de 278), PE Caruaru Z105 S390 (135 de 139) e PR Ubiratã Z98 S100 (201 de 207). Quando quase ninguém passa na digital numa seção e a vizinha está normal, a explicação mais provável é **leitor biométrico com defeito** ou mesa que liberou todo mundo para andar com a fila. **Conferir:** o log da urna registra cada habilitação e mostra se houve tentativa de digital antes da liberação.

**Por região.** A taxa da UF vai de 4,1% (RR) a 9,0% (PI). Nos municípios (≥ 1.000 votantes), 1% têm até 3,7% e 1% têm 16,4% ou mais. Os mais altos são cidades pequenas do RS (Cotiporã 26,4%, Santo Expedito do Sul 23,4%, Linha Nova 23,2%) e do PI (Jatobá do Piauí 21,2%, Sigefredo Pacheco 21,0%). Algumas **zonas** inteiras ficam com o dobro da média da UF: CE Z72 (Jaguaretama, 18,2% × 7,1%), PI Z7 (18,9% × 9,0%), RS Z39 (Rosário do Sul, 18,2% × 8,5%) e BA Z61 (Coribe/Cocos, 16,7% × 7,5%). O agrupamento por zona sugere causa operacional (equipamento, treinamento ou orientação da zona) somada à idade do eleitorado e ao trabalho braçal, que gastam a digital.

**Relação com abstenção:** fraca. A correlação é 0,05 entre todas as seções e 0,09 dentro do mesmo local. A taxa fica entre 6,6% e 7,4% em todas as faixas de abstenção. Nas urnas que fecharam depois das 19h, a taxa é 6,35%, contra 6,8% nas demais.

**Indício de problema?** Não há padrão sistemático (municípios zerados, campo maior que o comparecimento). Os extremos por seção pedem conferência no log da urna.

---

## 6. Outras observações

- **Governador × Presidente** (AC, AM, DF, ES, RN e TO tiveram 2º turno para governador): das 39.739 seções com os dois cargos, 1.818 têm comparecimento diferente, e **sempre** o de Presidente é maior (+24.727 no total; AM 626, RN 533, DF 397). Aptos, biometria e número da urna são iguais nos dois cargos. É o eleitor em trânsito vindo de outra UF, que só pode votar para Presidente. Coerente.
- **Tipo de local:** as seções de voto em trânsito têm 91,5% de comparecimento, o que é esperado, porque quem pede trânsito pretende votar. As de presos provisórios têm 73,7% de comparecimento e 75,7% para o 13. As temporárias têm 80,8%.
- **Juntas apuradoras:** `NR_JUNTA_APURADORA` e `NR_TURMA_APURADORA` são −1 em todas as seções. Nenhuma seção foi apurada por junta (voto em cédula) no Brasil.
- **Abertura às 08:00:01:** 460.688 urnas (92,5%) registram abertura exatamente no segundo 1 do horário de início local, o que indica abertura automática programada. Encerramentos se espalham pelos segundos, o que indica ação manual. Nada anormal.
- Nenhuma seção com 0 aptos, 0 comparecimento, menos de 20 aptos, ou comparecimento sem nenhum voto válido.

---

## 7. O que realmente precisaria de conferência (prioridade)

1. **Pico das 19h (item 2.2).** Pegar 10 a 20 seções da Rio Z122, Z238 e Z234, Petrópolis Z65, Salvador Z5 e São Paulo Z381 e abrir o **log da urna** para ver a hora do último voto e do comando de encerramento. Pedir aos TREs de RJ, SP, BA, PE e PB as decisões de prorrogação ou as ocorrências do dia.
2. **Pausa na chegada dos BU (17h10–19h, item 2.3).** Perguntar ao TSE o que `DT_BU_RECEBIDO` mede.
3. **27 seções do exterior com "urna" genérica (item 1).** Atas dos postos.
4. **Aberturas tardias com comparecimento muito baixo:** PR Inácio Martins Z34 S133 (8%) e S117, e MG Itajubá Z134 S295. Atas das mesas.
5. **Extremos de biometria:** PR Tomazina Z19 S55, SP São Paulo Z408 S361, PE Caruaru Z105 S390. Log da urna.
6. **Extremos de resultado dentro do local:** MA Açailândia Z71 S468, SP Botucatu Z26 S402, MG Belo Horizonte Z32 S336, SP Bauru Z23 S463. BU impresso (QR code) contra o arquivo, e RDV para recontar.

## Limitações

- O arquivo traz totais por seção. Não dá para saber em quem votou quem passou ou não pela biometria, nem a hora de cada voto (isso está no log da urna, que não foi baixado aqui).
- Correlação não é causa, e valor extremo não é fraude. Com 500 mil seções, centenas de casos "raros" aparecem por puro acaso. Por isso cada teste foi comparado com o esperado.
- Os fusos foram inferidos pela abertura. Municípios com seções em dois fusos teriam uma parte mal convertida, mas não apareceu nenhum caso.
- O cadastro de locais foi gerado às 15h27 de 25/10 e pode ter pequenas diferenças em relação ao cadastro usado na carga das urnas.
