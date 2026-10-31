# Votos depois das 17h: o que os logs das urnas mostram (2º turno de 2026, Presidente)

Gerado por `scripts/logs-urna.mjs` a partir dos **logs das urnas** publicados pelo TSE. Os números estão em `site/dados/votos-apos-17h.json`.

**Resposta curta.** O boletim de urna (BU) só tem a hora de abertura e a de encerramento. A hora de cada voto está no **log da urna**, que registra cada "O voto do eleitor foi computado" com data e hora. Lendo 16.038 logs:

- **No país, cerca de 35 mil votos foram computados depois das 17h de Brasília** (estimativa 35.164, erro padrão ±3.339). Isso é 0,028% do comparecimento. O TSE divulgou **34.393**, número dentro da margem.
- **Depois das 18h foram 1.993 votos, e depois das 19h, 11.** Esses números não são estimativa: todas as seções que fecharam depois das 18h foram lidas. O TSE divulgou 1.994 e 13.
- **As 6.352 urnas que fecharam depois das 19h receberam só 4.492 votos depois das 17h**, 0,7 voto por urna. Em 3.339 delas (53%) não entrou nenhum voto depois das 17h. Em 6.115 (96%) houve uma pausa de pelo menos 1 hora sem nenhum voto entre 16h30 e o encerramento. O último voto mediano foi às **16:59**.
- **O degrau das 19h se explica pela prorrogação.** O ministro Cristiano Zanin (STF) prorrogou a votação por até 2 horas, até as 19h, nas seções que ainda estavam abertas. Nessas seções, a urna ficou ligada e quase parada até as 19h. Em 743 delas, a mesa chegou a iniciar o encerramento por volta das 17h e o **cancelou**. Depois, encerrou entre 18h50 e 19h10. Não houve fila: foram poucos eleitores avulsos (2.511 urnas tiveram de 1 a 3 votos depois das 17h10).
- **Sem biometria depois das 17h:** cerca de **1.200 eleitores** foram liberados depois das 17h sem a digital reconhecida (estimativa 1.193 ± 298), e cerca de 3.100 que não têm biometria no cadastro também votaram nesse horário. Depois das 19h, nenhum eleitor foi liberado sem a digital. A taxa sem a digital depois das 17h (5,5% nas urnas das 19h e 7,2% no controle) é igual à do resto do dia (6,4% e 6,9%).
- **O log não diz em quem a pessoa votou.** Tudo aqui é comparecimento no tempo. O voto fica no RDV (embaralhado, sem hora).

---

## 1. De onde vêm os dados

| Arquivo | O que tem |
|---|---|
| `bu_imgbu_logjez_rdv_vscmr_2026_2t_UF.zip` ([dataset do TSE](https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao)) | Um ZIP por UF (de 310 MB em RR a 24,6 GB em SP; 120 GB no Brasil). Cada seção tem 5 arquivos: `-bu.dat`, `-imgbu.dat`, `-rdv.dat`, `-vota.vsc` e `-log.jez` |
| `o03221` + `uf` + município TSE (5) + zona (4) + seção (4) + `-log.jez` | O log da seção. Por exemplo, `o03221rj60011012200002-log.jez` é Rio de Janeiro, zona 122, seção 2 |
| `-log.jez` | Um ZIP (deflate) com `logd.dat`, um texto em latin1 com colunas separadas por TAB: `dd/mm/aaaa hh:mm:ss`, nível, nº da urna, aplicação (`VOTA`, `GAP`, `SCUE`, `LOGD`…), mensagem e hash. Ele cobre a urna desde a carga (carga, 1º turno, 2º turno), então só as linhas de 25/10/2026 são usadas |
| Urna de contingência | O `-log.jez` traz, além do `logd.dat` da urna nova, o log da urna substituída como outro `.jez` aninhado ("Arquivo …jez referente ao log da ME"). O script abre tudo recursivamente, tira linhas repetidas e ordena pelo horário. Sem isso, 61 seções perdiam votos |

**Como baixar sem baixar 120 GB.** O servidor aceita `Range`. O script lê o fim do ZIP (EOCD, inclusive ZIP64) e o diretório central (de 1 MB no AC a algumas dezenas de MB em SP). Depois baixa, também por `Range`, só os bytes de cada `-log.jez` (cerca de 170 KB cada). Ao todo foram 2,8 GB para 16.038 seções, guardados em `dados/logs/jez/` (fora do git). Não precisa de 7-Zip: o deflate é o do `zlib` do Node.

**Horário.** Os logs estão na hora local da urna. O fuso de cada município foi inferido pela abertura do BU (8h de Brasília): AC +2h; AM, RO, RR, MT e MS +1h; os 11 municípios do oeste do AM +2h; Fernando de Noronha −1h.

**Conferência: 100%.** Em todas as 16.038 seções, o número de "O voto do eleitor foi computado" no log é **igual ao comparecimento do BU**, e o número de eleitores liberados sem a digital (ver item 5) é **igual a `QT_ELEI_BIOM_SEM_HABILITACAO`** do BU.

## 2. Amostra

| Grupo | Seções lidas | Para quê |
|---|---|---|
| Todas as que fecharam a partir das 19h (alerta `fecha_19h`) | 6.352 (todas) | A pergunta principal |
| Todas as que fecharam entre 18h e 19h | 734 (todas) | Junto com as das 19h, dá a contagem exata depois das 18h |
| Controle: fecharam entre 17:00 e 17:05 | 2.400 (100 sorteadas por UF, menos AC/AP/RR) | Seções normais |
| Fecharam entre 17:05–17:10, 17:10–17:20, 17:20–17:30 e 17:30–18:00 | 200 + 200 + 200 + 250 sorteadas | Estimativa nacional |
| AC, AP e RR inteiras | 5.703 | Validação (contagem completa de 3 UFs) |
| **Total** | **16.038** | |

A estimativa nacional expande cada estrato (horário de encerramento × UF) pelo seu peso. Os estratos de 18h em diante e as 3 UFs entram com peso 1. O sorteio usa semente fixa (20261025), então refazer dá as mesmas seções. Quase todo o erro vem das ~490 mil seções que fecharam até 17h05, onde há poucos votos depois das 17h espalhados.

## 3. Números

### 3.1 Brasil

| | Logs (este trabalho) | TSE ([notícia de 27/10](https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/eleicoes-2026-mais-de-34-mil-votos-foram-registrados-apos-as-17h-no-2o-turno)) |
|---|---|---|
| Votos depois das 17h | **35.164 ± 3.339** (34.911 ajustando pelo comparecimento) | 34.393 |
| 17h–18h | ≈ 33.171 | 32.399 |
| 18h–19h | **1.982** (contagem completa) | 1.981 |
| Depois das 19h | **11** (contagem completa; último voto às 19:06:21) | 13 (último às 19h06 segundo a CNN) |
| Seções que fecharam depois das 19h | 6.336 (6.352 a partir de 19:00:00), pelo BU | 6.766 |
| Votos depois das 17h nessas seções | 4.492 | 4.773 |

A diferença nas seções "depois das 19h" (6.352 × 6.766) deve ser de definição. O TSE pode ter usado a hora do encerramento no log, ou do BU com outro fuso, ou incluído o exterior. Este trabalho não lê o exterior (ZZ).

**Onde caíram os ~35 mil, por estrato:** 20,3 mil nas seções que fecharam entre 17:00 e 17:05 (a fila que já estava lá às 17h), 7,4 mil nas que fecharam entre 17:05 e 17:10, 1,6 mil entre 17:10 e 17:20, 0,9 mil entre 17:20 e 19:00, 4,5 mil nas que fecharam depois das 19h e 0,4 mil em AC/AP/RR. **Cerca de 80% dos votos depois das 17h estão em seções que encerraram até 17h10, ou seja, são da fila que já estava lá às 17h.**

### 3.2 Por UF

Os valores "contados" vêm só dos logs lidos. A "estimativa" expande a amostra: para as UFs fora de AC/AP/RR, o erro dela é grande (dezenas de %), porque cada UF tem só 100 seções de controle.

| UF | Votos depois das 17h, contados (seções lidas) | Seções das 19h | Votos depois das 17h nelas | Depois das 19h | Estimativa da UF depois das 17h |
|---|---|---|---|---|---|
| RJ | 1.986 (3.430) | 2.805 | 1.790 | 4 | ≈ 3.200 |
| SP | 1.651 (2.135) | 1.571 | 1.414 | 5 | ≈ 9.400 |
| BA | 883 (1.210) | 936 | 786 | 2 | ≈ 4.100 |
| PE | 314 (851) | 657 | 284 | 0 | ≈ 2.500 |
| PB | 150 (424) | 275 | 120 | 0 | ≈ 1.100 |
| SE | 24 (156) | 51 | 21 | 0 | ≈ 130 |
| AC (inteira) | 158 (2.270) | 1 | 0 | 0 | 158 (exato) |
| AP (inteira) | 142 (1.914) | 0 | — | 0 | 142 (exato) |
| RR (inteira) | 145 (1.519) | 0 | — | 0 | 145 (exato) |
| Outras 18 UFs | 461 (2.479) | 57 | 81 | 0 | ver `porUf` |

Para comparar, a Tribuna de Jundiaí (dados do TSE) dá SP 8.855, BA 4.188 e RJ 4.146 votos entre 17h e 19h. As estimativas de SP e BA batem; a do RJ fica abaixo, mas dentro do erro. O Diário do Pará dá 152 votos no PA, e a estimativa daqui (≈ 2.250) é muito incerta (26 votos depois das 17h em 140 seções lidas), então não serve para contestar o número do PA.

**Onde se votou depois das 17h nas seções das 19h** (contagem completa):

| Município | Seções das 19h | Votos depois das 17h | Depois das 18h | Depois das 19h |
|---|---|---|---|---|
| Rio de Janeiro (RJ) | 1.978 | 1.414 | 618 | 4 |
| São Paulo (SP) | 1.481 | 1.343 | 566 | 5 |
| Salvador (BA) | 730 | 649 | 237 | 2 |
| Petrópolis (RJ) | 285 | 142 | 67 | 0 |
| Itaboraí (RJ) | 237 | 116 | 54 | 0 |
| João Pessoa (PB) | 265 | 114 | 37 | 0 |
| Recife (PE) | 220 | 106 | 37 | 0 |
| São Gonçalo (RJ) | 108 | 45 | 26 | 0 |

Zonas com mais votos depois das 17h: São Paulo Z381 (254 seções, 351 votos), Rio Z238 (249 seções, 193 votos), Salvador Z5 (202 seções, 189 votos), Rio Z122 (196 seções, 146 votos), Rio Z245, Rio Z234 e Petrópolis Z65 (142 a 144 cada). A lista completa por zona está em `secoes19h.zonas`, e por município em `porMunicipio`.

## 4. O degrau das 19h: o que os logs mostram

O documento `ANALISE-INCONSISTENCIAS.md` (item 2.2) deixava duas hipóteses em aberto: **votação de fato prorrogada** (com eleitores entre 17h e 19h) ou **encerramento adiado** (urna parada). Os logs mostram uma prorrogação formal em que quase ninguém apareceu para votar:

| Nas 6.352 seções que fecharam depois das 19h | |
|---|---|
| Votos no dia | 1.861.259 (igual ao BU) |
| Votos depois das 17h / 17h10 / 18h / 19h | 4.492 / 3.494 / 1.860 / 11 |
| Nenhum voto depois das 17h | 3.339 seções (53%) |
| Só a fila das 17h (nenhum voto depois das 17h10) | 469 |
| De 1 a 3 votos depois das 17h10 | 2.511 |
| De 4 a 10 votos depois das 17h10 | 31 |
| Mais de 10 votos depois das 17h10 | 2 (AL Ouro Branco Z50 S79, com uma fila real até ~17h30; MA Pedro do Rosário Z106 S163) |
| Último voto (mediana) | 16:59 |
| Pausa ≥ 60 min sem votos depois das 16h30 | 6.115 (96%); ≥ 2 h em 3.581 |
| 1ª vez que a mesa selecionou "Encerrar votação" (depois das 16h50) | 17:00–17:20 em 540 seções; **18:50–19:10 em 5.775** |
| Mesa iniciou o encerramento e o cancelou | 743 seções (428 delas entre 17:00 e 17:20) |
| Urna de contingência no dia | 45 (no controle: 5 em 2.400) |
| Eventos de falha (urna desligada e religada, reinício da votação, bateria) | 3–4% das seções, contra ~2% no controle, numa janela 2 h mais longa. Nenhum padrão de pane |

**Leitura.** Às 17h, a mesa dessas seções fez o que se faz em qualquer seção: atendeu a fila e, em parte delas, começou a encerrar. Então veio a ordem de manter a votação aberta até as 19h (o pedido ao STF foi feito por volta das 16h20, e o TSE confirmou às 18h44 que valia só para as seções ainda não encerradas). A mesa cancelou o encerramento ou nem o começou. A urna ficou ligada, com 0 a 3 eleitores avulsos em duas horas, e às 19h todas encerraram juntas, com o mesmo formato de pico minuto a minuto do encerramento das 17h. É por isso que o pico das 19h parece um "segundo horário programado": foi um horário de encerramento determinado por decisão judicial. A falta de BU recebido entre 17h10 e 19h00 (item 2.3 do outro documento) também se explica: o TSE **suspendeu o recebimento e a totalização** até as 19h.

**Por que só RJ, SP, BA, PE e PB?** Os logs não dizem. Eles mostram que a prorrogação foi aplicada nas seções ainda abertas quando a orientação chegou à mesa, e isso se concentra em zonas inteiras (Rio Z122 com 98% das urnas, Z238 com 93%, Salvador Z5 com 87%). Isso é compatível com uma orientação dada por zona ou TRE. As atas e as comunicações dos TREs respondem.

**Trechos de log** (hora de Brasília; linhas de rotina do eleitor omitidas; números de título de mesário trocados por `***`):

Rio de Janeiro Z122 S2 (BU: encerramento 19:04). O último voto foi às 17:01, a urna ficou 2 horas parada e encerrou às 19h:
```
17:01:13  VOTA  Eleitor foi habilitado
17:01:25  VOTA  O voto do eleitor foi computado
17:09:42  VOTA  Inspeção da urna iniciada
17:20:09  VOTA  Urna ligada conectada na rede CA em [135.36V] ...
18:25:58  VOTA  Inspeção da urna iniciada
18:27:16  VOTA  Eleitor não encontrado para o identificador informado
19:03:43  VOTA  Operador selecionou: Encerrar votação
19:03:46  VOTA  Todas as pessoas presentes já votaram? SIM
19:04:01  VOTA  Procedimento de encerramento confirmado
19:05:47  VOTA  Inicio do Encerramento
```

São Paulo Z346 S573. A mesa começou a encerrar às 17:07, cancelou, recebeu 3 eleitores avulsos e encerrou às 19:02:
```
17:07:57  VOTA  Operador selecionou: Encerrar votação
17:08:02  VOTA  Todas as pessoas presentes já votaram? SIM
17:08:35  VOTA  Operador cancelou o encerramento da votação
17:12:57  VOTA  O voto do eleitor foi computado
18:04:01  VOTA  O voto do eleitor foi computado
18:05:13  VOTA  O voto do eleitor foi computado
19:02:17  VOTA  Operador selecionou: Encerrar votação
19:02:39  VOTA  Procedimento de encerramento confirmado
```

São Paulo Z350 S604, um dos 11 votos depois das 19h:
```
18:43:35  VOTA  O voto do eleitor foi computado
19:00:57  VOTA  O voto do eleitor foi computado
19:03:25  VOTA  Operador selecionou: Encerrar votação
```

Os 11 votos depois das 19h estão em 11 seções diferentes (5 em São Paulo, 4 no Rio e 2 em Salvador), um em cada, todos entre 19:00 e 19:06.

## 5. Biometria depois das 17h

**Como o log registra a habilitação** (mensagens exatas de 2026, aplicação `VOTA`):

| Tipo | Sequência no log | No BU |
|---|---|---|
| Por biometria | `Identificador do eleitor digitado pelo mesário` → `Solicita digital. Tentativa [n] de [4]` / `Capturada a digital…` → **`Tipo de habilitação do eleitor [biométrica]`** → `Eleitor foi habilitado` | — |
| **Sem a digital, tendo biometria** (digital não reconhecida) | … tentativas … → **`Solicitação de dado pessoal do eleitor para habilitação manual`** → `Dado digitado confere` → `Solicita digital do mesário` → `Biometria do mesário … encontrada…` / `Mesário … habilitou o eleitor` / `Digital coletada bate com uma digital gravada após o registro inicial de mesário…` → `Eleitor foi habilitado` | `QT_ELEI_BIOM_SEM_HABILITACAO` |
| Sem biometria no cadastro | `Identificador…` → **`Ano de nascimento digitado é igual ao do cadastro`** → `Eleitor foi habilitado` (sem pedir a digital) | não entra no campo |

Cada voto computado recebe o tipo da habilitação que o precedeu. **Conferência:** em todas as 16.038 seções, a contagem "sem a digital, tendo biometria" do log é igual a `QT_ELEI_BIOM_SEM_HABILITACAO`. Ficaram sem tipo identificado só 76 votos nas seções das 19h e 21 no controle.

| | Sem a digital (tendo biometria) | Sem biometria no cadastro | Votos | % sem a digital | % sem biometria (os dois) |
|---|---|---|---|---|---|
| **Brasil, depois das 17h (estimativa)** | **1.193 ± 298** | 3.068 | ≈ 35.164 | 3,4% | 12,1% |
| Brasil, dia todo (estimativa / BU) | 8,75 mi / **8,63 mi** (BU) | 7,63 mi | 127,9 mi | 6,75% | ≈ 12,7% |
| Seções das 19h, antes das 17h | 118.025 | 121.375 | 1.856.767 | 6,36% | 12,89% |
| Seções das 19h, depois das 17h | **245** | 332 | 4.492 | 5,45% | 12,85% |
| Seções das 19h, depois das 19h | **0** | 1 | 11 | 0% | 9,1% |
| Controle, dia todo | 41.850 | 31.810 | 605.481 | 6,91% | 12,17% |
| Controle, depois das 17h | 9 | 14 | 125 | 7,2% | 18,4% |

**Leitura.** Depois das 17h, a liberação sem a digital não aumentou: nas urnas das 19h ela foi até um pouco menor que no resto do dia (5,45% × 6,36%). No controle, os 125 votos depois das 17h são poucos demais para uma taxa estável (9 casos). Por UF e por seção, os números estão em `porUf[UF].biometria`, `porUf[UF].biometria19h` e nas colunas `semBioFalhaDigital_*` de `secoes`.

## 6. A curva do dia (simulação desde as 8h)

`curvaDia` traz os votos computados **por bloco de 15 minutos** (Brasília, 7:00 a 20:00): `controle` (2.400 seções normais), `secoes19h` (6.352), `porUf[UF].votos` (seções lidas da UF, menos as das 19h), `porUf[UF].estimadaUf` (perfil da UF escalado ao comparecimento da UF) e `nacionalEstimada` (soma ponderada dos perfis, calibrada para o comparecimento do BU com fator 0,993). Ela permite "tocar" a chegada dos eleitores ao longo do dia. **Só comparecimento**: o log não diz o voto.

| Hora (Brasília) | Votos no Brasil (estimativa) | % do dia | % no controle | % nas seções das 19h |
|---|---|---|---|---|
| 8h | 21.468.583 | 16,8% | 17,5% | 15,3% |
| 9h | 20.211.136 | 15,8% | 16,4% | 14,3% |
| 10h | 19.217.168 | 15,0% | 15,2% | 14,8% |
| 11h | 16.238.459 | 12,7% | 12,3% | 13,9% |
| 12h | 12.895.150 | 10,1% | 9,4% | 11,7% |
| 13h | 11.016.023 | 8,6% | 8,1% | 9,5% |
| 14h | 10.471.810 | 8,2% | 8,0% | 8,2% |
| 15h | 9.676.583 | 7,6% | 7,8% | 7,2% |
| 16h | 6.624.809 | 5,2% | 5,3% | 4,8% |
| 17h | 32.933 | 0,03% | 0,02% | 0,14% |
| 18h | 1.968 | 0,002% | 0 | 0,10% |
| 19h | 11 | — | 0 | 0,0006% |

A primeira meia hora (8:00–8:30) é a de maior movimento do dia, com ≈ 5,6 milhões de votos em cada bloco de 15 min. A seção típica atinge **50% do comparecimento às 11:02** (controle) e às 11:24 (seções das 19h), e **90% às 15:22** e 15:16. As seções das 19h, que são grandes capitais, têm a manhã um pouco menos concentrada, mas o mesmo final de tarde. Por seção, a hora dos 50% e dos 90% está nas colunas `hora50pct_bsb` e `hora90pct_bsb`.

## 7. Limitações

- **O log não identifica o voto** (nem candidato, nem eleitor). Só dá para medir quantos votaram e quando.
- A estimativa nacional depois das 17h tem erro padrão de ±3,3 mil, vindo das seções que fecharam até 17h05. Os números depois das 18h e das 19h são contagens completas. As estimativas por UF (fora AC/AP/RR) são grosseiras.
- O fuso vem da abertura do BU. Se o relógio de uma urna estivesse errado, a conversão erraria junto. Nenhuma urna lida teve votos fora do horário de votação.
- O exterior (ZZ) não foi lido.
- 6.352 (BU) × 6.766 (TSE) seções "depois das 19h": critério diferente, não esclarecido.
- Não foram lidas as atas das mesas, nem a decisão do STF ou as comunicações dos TREs. A cronologia da prorrogação (pedido por volta das 16h20, esclarecimento do TSE às 18h44, totalização retomada às 19h) vem do noticiário e das notícias do TSE citadas abaixo, e não do log.

## Refazer

```bash
node --max-old-space-size=6000 scripts/logs-urna.mjs tudo     # índice + amostra + download (~2,8 GB, ~5 min) + análise (~6 min)
node scripts/logs-urna.mjs ver RJ 60011 122 2 16:55            # imprime o log de 25/10 de uma seção (município pelo código TSE)
```

## Fontes

- TSE, dados abertos: [arquivos transmitidos para totalização (2026)](https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao) e [boletim de urna](https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna).
- TSE: [Eleições 2026: cerca de 34 mil votos foram registrados após as 17h no 2º turno](https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/eleicoes-2026-mais-de-34-mil-votos-foram-registrados-apos-as-17h-no-2o-turno) e [Esclarecimento sobre prorrogação da votação](https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/esclarecimento-sobre-prorrogacao-da-votacao). O site do TSE recusou a leitura automática (HTTP 403), e os números foram conferidos pelos resumos da busca e pelas matérias abaixo.
- Justiça Eleitoral, Fato ou Boato: [relatório apócrifo distorce dados](https://www.justicaeleitoral.jus.br/fato-ou-boato/checagens/2026/relatorio-apocrifo-distorce-dados-para-sugerir-fraude-nas-eleicoes-2026) e [falso que 2 milhões de votos tenham sido lançados na Bahia após as 17h](https://www.justicaeleitoral.jus.br/fato-ou-boato/checagens/2026/e-falso-que-2-milhoes-de-votos-tenham-sido-lancados-manualmente-na-bahia-apos-as-17h).
- Imprensa: [Gazeta do Povo](https://www.gazetadopovo.com.br/republica/tse-informa-o-registro-de-343-mil-votos-apos-as-17h-no-segundo-turno/) (34.393; 32.399 / 1.981 / 13; 6.766 seções depois das 19h com 4.773 votos), [CNN Brasil](https://www.cnnbrasil.com.br/eleicoes/dados-tse-votacao-apos-prorrogacao/) (prorrogação de Zanin; 29.001 votos entre 17h00 e 17h05; último voto às 19h06), [Correio da Manhã](https://www.correiodamanha.com.br/politica/2026/10/329719-tse-retoma-contagem-dos-votos-as-19h-apos-suspensao-provocada-por-decisao-de-zanin.html) (suspensão e retomada às 19h), [Tribuna de Jundiaí](https://tribunadejundiai.com.br/politica/eleicoes-2026/apenas-35-mil-pessoas-votaram-apos-as-17h-lula-venceu-por-4-4-milhoes/) (por UF) e [Diário do Pará](https://diariodopara.com.br/para/152-pessoas-votaram-apos-as-17h-no-para-entenda-por-que-isso-aconteceu/) (PA).

Alerta automático não é prova de irregularidade. Associação estatística não demonstra fraude.
