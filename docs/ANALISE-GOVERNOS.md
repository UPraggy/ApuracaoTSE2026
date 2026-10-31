# Análise dos governos (1995–2026): pobreza, Bolsa Família, saneamento, educação, renda

Aba **Governos** do painel (`site/js/governo.js`, `site/governo.css`). Dados em `site/dados/governo.json`, gerados por `node scripts/governo.mjs` (cache em `.cache/governo/`; `--forcar` baixa tudo de novo). Coleta feita em 30/10/2026.

O objetivo é responder a quatro perguntas com números oficiais e a mesma conta para todos os mandatos:

1. Quantas pessoas saíram da pobreza?
2. Quem deixou de depender do Bolsa Família?
3. O saneamento e a educação melhoraram?
4. O avanço foi suficiente?

"Suficiente" quer dizer só uma coisa aqui: o ritmo comparado com uma **meta oficial**. A análise não emite opinião nem atribui motivo político.

## 1. Regras de imparcialidade (as mesmas em todo o painel)

- **Oito mandatos, com as mesmas séries:**
  - FHC 1 (1995–1998) e FHC 2 (1999–2002).
  - Lula 1 (2003–2006) e Lula 2 (2007–2010).
  - Dilma 1 (2011–2014).
  - Dilma 2 + Temer (2015–2018). Michel Temer assume em 31/08/2016, e esse dia aparece marcado nos gráficos.
  - Bolsonaro (2019–2022).
  - Lula 3 (2023–2026), ainda em curso. A conta vai até o último dado.
- **Variação do mandato:** valor do último ano do mandato menos o valor do último ano do mandato anterior. Exemplo: Lula 1 = 2006 − 2002.
  - Se a série começa depois desse ano de partida, a conta parte do primeiro dado e a célula é marcada com `*`.
- **Ano sem dado:** é estimado por interpolação linear entre os vizinhos e marcado com `*`. Isso acontece em 2000 e 2010 (sem PNAD, anos de Censo) e nos anos sem prova do IDEB. A interpolação só é feita se os vizinhos estiverem a até 4 anos e não houver quebra de série entre eles.
- **Quebra de série:** quando o método muda (PNAD → PNAD Contínua, SNIS → SINISA), o salto do ano da troca não entra na conta. Somam-se só as variações dentro de cada método e a célula é marcada com `*`.
- **Ritmo:** variação ÷ anos com dado comparável.
  - O texto automático não usa no ranking ("maior/menor avanço") um período com menos de 2 anos de dado.
- **Metas:** quanto falta, qual o ritmo necessário até o prazo e em que ano a meta seria atingida em cada ritmo (reta simples, explicada como "não é previsão").
  - Os cenários são três: o ritmo do período atual, o ritmo médio de toda a série e o ritmo mais rápido entre os mandatos.
  - Os vereditos possíveis são só: "dentro do ritmo da meta", "abaixo do ritmo da meta", "meta alcançada" ou "prazo encerrado sem atingir a meta".
- **Cores:** as faixas dos mandatos são neutras (cinza alternado), sem cor de partido. Verde e vermelho só indicam o sentido do indicador (menos pobreza = verde).

## 2. Fontes

| Série (chave no JSON) | Fonte | Tabela / código | Anos |
|---|---|---|---|
| `extrema_ipea`, `pobreza_ipea` | IPEA, Ipeadata. Souza e Hecksher (2025), "Pobreza e desigualdade no Brasil no curto e no longo prazo". PNAD 1995–2011 multiplicada pelo fator que a iguala à PNAD Contínua em 2012 | `PNADS_PERCPOBRE300` (US$ 3,00 PPC 2021), `PNADS_PERCPOBRE830` (US$ 8,30) — http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='PNADS_PERCPOBRE300') | 1995–2025 |
| `gini`, `renda_media` | IPEA (mesma metodologia) | `PNADS_GINI`, `PNADS_RENDAMEDIA` (R$ de 2025) | 1995–2025 |
| `extrema_ibge`, `pobreza_ibge` | IBGE, Síntese de Indicadores Sociais 2025 (divulgada em 03/12/2025) | Tabela 2.18, colunas US$ 2,15 e US$ 6,85 PPC 2017 — https://ftp.ibge.gov.br/Indicadores_Sociais/Sintese_de_Indicadores_Sociais/Sintese_de_Indicadores_Sociais_2025/Tabelas/ods/2_Distribuicao_Renda_ods.zip | 2012–2024 |
| `extrema_sem_beneficio` | IBGE, SIS 2025 | Tabela 2.20 (sem os benefícios de programas sociais) | 2012–2024 |
| `extrema_bm`, `pobreza_bm` | Banco Mundial, Poverty and Inequality Platform (PPC 2017; sem ajuste PNAD/PNADC) | https://api.worldbank.org/pip/v1/pip?country=BRA&povline=2.15&ppp_version=2017 | 1995–2024 |
| `pop` | Banco Mundial, WDI | `SP.POP.TOTL` | 1994–2025 |
| `pbf_familias` | MDS via Portal da Transparência (Ipeadata) | `FAM_PBF`: benefícios em dezembro, sem os suspensos. Em 2026, out/2026: 19,3 milhões (Agência Brasil com dados do MDS, 20/10/2026) | 2004–2026 |
| `pbf_valor_real` | MDS via Portal da Transparência (Ipeadata, `VAL_PBF` ÷ `FAM_PBF`) + IPCA (SIDRA 1737) até set/2026 | 2025: R$ 691,37 em dez/2025 (Secom); 2026: R$ 782,92 em out/2026 | 2004–2026 |
| `agua_domicilios` | IBGE. PNAD: Síntese 2009, tab. 1 (1995–1999), e SIDRA 1955 (2001–2015). PNAD Contínua: SIDRA 6731 | % dos domicílios com rede geral | 1995–2025 |
| `esgoto_domicilios` | IBGE. PNAD: Síntese 2009, tab. 1 (1995–2008), e SIDRA 1956 (2009–2015). PNAD Contínua: SIDRA 6735 (2016–2018) e 7192 (2019–2025) | % dos domicílios com rede coletora ou fossa séptica ligada à rede | 1995–2025 |
| `agua_snis`, `esgoto_snis` | Ministério das Cidades. SNIS, Diagnóstico AE 2018 (2008, 2017 e 2018) e Diagnóstico AE 2022 (2021 e 2022); notícias do SNIS 2019 e 2020; SINISA 2024, ano de referência 2023 (IAG0001 e IES0001) | IN055, IN056 — https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/sinisa/resultados-sinisa | 2008, 2017–2023 |
| `ideb_ai`, `ideb_af`, `ideb_em` | INEP, resultados do Brasil, divulgação de 2025 (05/08/2026) | https://download.inep.gov.br/ideb/resultados/divulgacao_brasil_ideb_2025.zip (rede total) | 2005–2025 |
| `analfabetismo` | IBGE. PNAD: volumes Brasil, tab. 3.1 (1995–1999), e SIDRA 271 recalculada para 15+ (2001–2015). PNAD Contínua: SIDRA 7113 | taxa de analfabetismo, 15 anos ou mais | 1995–2025 |
| `crianca_alfabetizada` | INEP/MEC, Indicador Criança Alfabetizada (notícia de 23/03/2026) | 56% (2023), 59,2% (2024), 66% (2025) | 2023–2025 |
| `desemprego_oit` | Banco Mundial, WDI (estimativa modelada da OIT) | `SL.UEM.TOTL.ZS` | 1994–2025 |
| `desemprego_pnadc` | IBGE, SIDRA 4562 (média anual) | — | 2012–2025 |
| `ipca`, `pib` | IBGE, SIDRA 1737 (IPCA dez/dez) e Banco Mundial, WDI `NY.GDP.MKTP.KD.ZG` | contexto | 1995–2025 |

**Saídas do Bolsa Família** (MDS; não existe série comparável antes de 2023):

- **2023:** 590 mil famílias saíram ao superar meio salário mínimo por pessoa. [MDS, 22/01/2025](https://www.gov.br/mds/pt-br/noticias-e-conteudos/desenvolvimento-social/noticias-desenvolvimento-social/mais-de-1-3-milhao-de-familias-deixaram-o-bolsa-familia-em-2024-apos-melhorarem-de-renda)
- **2024:** 1,3 milhão saíram pelo mesmo motivo. Em 2023 e em 2024, 2,2 milhões de famílias por ano entraram na regra de proteção (mesma fonte).
- **jan–out/2025:** 2.069.776 saídas, assim divididas: 1.318.214 por aumento da renda, 726.799 por fim do prazo da regra de proteção e 24.763 por desligamento voluntário. [MDS/Senarc, 30/10/2025](https://www.gov.br/mds/pt-br/noticias-e-conteudos/desenvolvimento-social/noticias-desenvolvimento-social/bolsa-familia-2-milhoes-de-familias-deixam-o-programa-apos-aumento-de-renda-em-2025)
- **mar/2023–abr/2026:** mais de 5,1 milhões de lares "deixaram de necessitar" do benefício. [MDS, 27/05/2026](https://www.gov.br/mds/pt-br/noticias-e-conteudos/desenvolvimento-social/noticias-desenvolvimento-social/mais-de-5-1-milhoes-de-familias-saem-do-bolsa-familia-por-aumento-de-renda)
  - A nota mistura dados do Caged cruzados com o CadÚnico e um estudo da FGV Social. O número não é auditável pela série pública.

**Metas oficiais usadas:**

- **ODS 1.1 (ONU):** erradicar a extrema pobreza até 2030 (valor 0).
- **ODS 1.2 (ONU):** reduzir pelo menos à metade a proporção de pobres até 2030. A base adotada aqui é 2015: série IPEA 33,9% → meta 17,0%; série IBGE 31,7% → 15,9%.
- **Marco Legal do Saneamento (Lei 14.026/2020):** 99% com água potável e 90% com coleta e tratamento de esgoto até 31/12/2033.
- **PNE 2014–2024, meta 7:** IDEB de 6,0 (anos iniciais), 5,5 (anos finais) e 5,2 (médio) em 2021.
- **PNE 2014–2024, meta 9:** analfabetismo de 6,5% em 2015 e erradicado até 2024.
- **Compromisso Nacional Criança Alfabetizada:** 60% em 2024, 64% em 2025, 67% em 2026 e 80% em 2030.

## 3. Resultados: variação em cada mandato (ritmo por ano entre parênteses)

`*` = ajuste da regra (período parcial, ano estimado entre vizinhos ou troca de método). "mi" = milhões.

| Indicador | FHC 1 (1995–1998) | FHC 2 (1999–2002) | Lula 1 (2003–2006) | Lula 2 (2007–2010) | Dilma 1 (2011–2014) | Dilma 2 + Temer (2015–2018) | Bolsonaro (2019–2022) | Lula 3 (2023–2026) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Extrema pobreza (US$ 3,00) | −0,5 p.p. (−0,18)* | −0,9 p.p. (−0,22) | −7,1 p.p. (−1,78) | −5,3 p.p. (−1,33)* | −4,2 p.p. (−1,06)* | +2,4 p.p. (+0,60) | −1,8 p.p. (−0,44) | −3,0 p.p. (−1,01)* |
| Pessoas na extrema pobreza | +1,0 mi* | +0,7 mi | −11,3 mi | −9,2 mi* | −7,7 mi* | +5,3 mi | −3,3 mi | −6,2 mi* |
| Pobreza (US$ 8,30) | −1,2 p.p. (−0,39)* | +0,7 p.p. (+0,18) | −8,4 p.p. (−2,09) | −10,1 p.p. (−2,52)* | −9,1 p.p. (−2,28)* | +2,3 p.p. (+0,59) | −1,7 p.p. (−0,43) | −8,6 p.p. (−2,88)* |
| Pessoas na pobreza | +2,6 mi* | +6,9 mi | −10,7 mi | −15,9 mi* | −15,5 mi* | +6,8 mi | −2,1 mi | −17,5 mi* |
| Extrema pobreza IBGE (US$ 2,15) | — | — | — | — | −1,4 p.p.* | +2,2 p.p. | −1,5 p.p. | −2,4 p.p. (até 2024)* |
| Pobreza IBGE (US$ 6,85) | — | — | — | — | −3,8 p.p.* | +2,6 p.p. | −1,8 p.p. | −8,5 p.p. (até 2024)* |
| Famílias no Bolsa Família | — | — | +4,4 mi* | +1,8 mi | +1,3 mi | +0,1 mi | +6,8 mi | −1,7 mi |
| Benefício médio (R$ de set/2026) | — | — | −R$ 31* | +R$ 49 | +R$ 86 | −R$ 38 | +R$ 172 | +R$ 330 |
| Água da rede (domicílios) | +2,5 p.p.* | +3,1 p.p. | +1,5 p.p.* | +1,5 p.p.* | +0,9 p.p.* | +0,0 p.p.* | −0,3 p.p. | +0,6 p.p.* |
| Esgoto na rede (domicílios) | +4,3 p.p.* | +3,3 p.p. | +1,3 p.p. | +3,8 p.p.* | +2,6 p.p.* | +1,7 p.p.* | +1,2 p.p.* | +2,1 p.p.* |
| Água (SNIS/SINISA) | — | — | — | — | — | +0,1 p.p. (só 2017→2018)* | +1,3 p.p. | — (troca para SINISA) |
| Esgoto (SNIS/SINISA) | — | — | — | — | — | +0,8 p.p. (só 2017→2018)* | +2,8 p.p. | — (troca para SINISA) |
| Analfabetismo (15+) | −1,8 p.p.* | −1,9 p.p. | −1,2 p.p.* | −1,3 p.p.* | −0,9 p.p.* | −0,7 p.p.* | −0,7 p.p. | −0,7 p.p.* |
| IDEB anos iniciais | — | — | +0,2 (desde 2005)* | +0,8* | +0,5* | +0,5* | +0,1* | +0,4* |
| IDEB anos finais | — | — | +0,1* | +0,4* | +0,3* | +0,5* | +0,2* | +0,3* |
| IDEB ensino médio | — | — | +0,1* | +0,2* | +0,0* | +0,3* | +0,3* | +0,3* |
| Crianças alfabetizadas (2º ano) | — | — | — | — | — | — | — | +10,0 p.p. (2023→2025)* |
| Renda média por pessoa (R$ de 2025) | +R$ 32* | −R$ 35 | +R$ 136 | +R$ 217* | +R$ 290* | −R$ 11 | −R$ 71 | +R$ 454* |
| Gini | −0,001* | −0,011 | −0,028 | −0,027* | −0,022* | +0,019 | −0,028 | −0,006* |
| Desemprego (OIT) | +3,6 p.p. | +0,5 p.p. | −1,0 p.p. | −1,3 p.p. | −1,7 p.p. | +5,6 p.p. | −3,1 p.p. | −3,3 p.p.* |

Níveis principais (último dado):

- **Extrema pobreza (IPEA):** 4,6% em 2025, ou 9,9 milhões de pessoas. Era 25,1% em 1995 e 23,7% em 2002.
- **Pobreza (IPEA):** 25,2% em 2025 (53,7 milhões).
- **IBGE:**
  - Extrema pobreza: 3,5% em 2024, a menor da série iniciada em 2012.
  - Pobreza: 23,1% em 2024. Entre 2023 e 2024, 8,6 milhões de pessoas saíram da pobreza (número da própria SIS).
- **Bolsa Família:** 19,3 milhões de famílias em out/2026, com benefício médio de R$ 782,92. Em dez/2022 eram 21,0 milhões (Auxílio Brasil); em dez/2018, 14,2 milhões.
- **Sem os benefícios sociais,** a extrema pobreza seria de 10,0% em vez de 3,5% (2024). A diferença, 6,6 p.p., equivale a cerca de 14 milhões de pessoas.
- **Água da rede (PNAD Contínua):** 86,1% dos domicílios em 2025.
- **Esgoto (PNAD Contínua):** 71,4% dos domicílios em 2025 (rede coletora ou fossa ligada à rede).
- **SNIS/SINISA:**
  - Água: 84,9% em 2022 (SNIS) e 83,1% em 2023 (SINISA).
  - Esgoto: 56,0% em 2022 (SNIS) e 59,7% em 2023 (SINISA).
- **IDEB 2025:** 6,3 nos anos iniciais, 5,3 nos anos finais e 4,5 no ensino médio.
- **Analfabetismo:** 4,9% em 2025.
- **Crianças alfabetizadas:** 66% em 2025.

## 4. Foi suficiente? (contra as metas, no ritmo do último período)

| Indicador | Meta | Último dado | Ritmo necessário | Ritmo atual | Veredito | No ritmo atual chega em |
|---|---|---|---|---|---|---|
| Extrema pobreza (IPEA, US$ 3,00) | 0 até 2030 (ODS 1.1) | 4,6% (2025) | −0,93 p.p./ano | −1,01 (Lula 3) | dentro do ritmo | 2030 |
| Pobreza (IPEA, US$ 8,30) | 17,0% até 2030 (ODS 1.2) | 25,2% (2025) | −1,65 | −2,88 (Lula 3) | dentro do ritmo | 2028 |
| Extrema pobreza (IBGE, US$ 2,15) | 0 até 2030 | 3,5% (2024) | −0,58 | −1,20 (Lula 3) | dentro do ritmo | 2027 |
| Pobreza (IBGE, US$ 6,85) | 15,9% até 2030 | 23,1% (2024) | −1,21 | −4,27 (Lula 3, 2 anos) | dentro do ritmo | 2026 |
| Água (domicílios, IBGE) | 99% até 2033 | 86,1% (2025) | +1,61 | +0,20 (Lula 3) | abaixo do ritmo (8,1×) | 2090 |
| Esgoto (domicílios, IBGE) | 90% até 2033 | 71,4% (2025) | +2,32 | +0,70 (Lula 3) | abaixo do ritmo (3,3×) | 2052 |
| Água (SNIS/SINISA) | 99% até 2033 | 83,1% (2023) | +1,59 | +0,33 (último ritmo medido: Bolsonaro; Lula 3 ainda sem dado comparável) | abaixo do ritmo (4,9×) | 2072 |
| Esgoto (SNIS/SINISA) | 90% até 2033 | 59,7% (2023) | +3,03 | +0,70 (idem) | abaixo do ritmo (4,3×) | 2067 |
| IDEB anos iniciais | 6,0 em 2021 | 6,3 (2025) | — | — | meta alcançada em 2023 (depois do prazo) | — |
| IDEB anos finais | 5,5 em 2021 | 5,3 (2025) | — | +0,08/ano | prazo encerrado sem atingir | 2028 |
| IDEB ensino médio | 5,2 em 2021 | 4,5 (2025) | — | +0,08/ano | prazo encerrado sem atingir | 2034 |
| Analfabetismo 15+ | 0 até 2024 (6,5% em 2015) | 4,9% (2025) | — | −0,23/ano | prazo encerrado sem atingir (a meta de 2015 também não foi cumprida: 7,95%) | 2046 |
| Crianças alfabetizadas | 80% até 2030 | 66% (2025) | +2,8 | +5,0 (2023–2025) | dentro do ritmo (bateu 64% em 2025; ficou em 59,2% contra 60% em 2024) | 2028 |

Leitura:

- **Pobreza:** os ritmos recentes estão dentro das metas da ONU.
- **Saneamento:** está muito abaixo do ritmo do Marco Legal em qualquer uma das duas medidas e em qualquer período da série. Nem o ritmo mais rápido já registrado (FHC 1 nos domicílios) bastaria: a meta chegaria em 2041 (água) e 2038 (esgoto).
- **Educação:**
  - A meta do IDEB foi cumprida só nos anos iniciais.
  - A meta de erradicar o analfabetismo venceu sem ser cumprida.
  - O indicador de alfabetização infantil está acima da trajetória da meta.
- **Uma ressalva:** o período Lula 3 tem 2 ou 3 anos de dado. Um ritmo curto pode mudar.

## 5. Quebras de série e cuidados

- **PNAD → PNAD Contínua:**
  - A pobreza do IPEA já vem ajustada (fator de 2012).
  - Na série do Banco Mundial e no analfabetismo, a troca é tratada como quebra (2012 e 2016). Exemplo: em 2016 o analfabetismo era de 7,2% na PNAD antiga e de 6,7% na Contínua.
  - Água e esgoto têm quebra em 2016.
- **Área rural do Norte (RO, AC, AM, RR, PA, AP):** a PNAD só a cobre a partir de 2004. É quebra em 2004 (água, analfabetismo) e em 2009 (esgoto, porque 2001–2008 vêm da Síntese 2009 sem essa área).
- **Esgoto na PNAD Contínua:** a classificação mudou em 2019 (SIDRA 6735 até 2018, 7192 desde 2019; +1,5 p.p. de salto), e o salto é tratado como quebra. A meta pede coleta **e** tratamento; as séries medem só coleta.
- **SNIS → SINISA (2023):**
  - Outra base de cálculo e população do Censo 2022.
  - A amostra do SNIS cresceu muito: esgoto em 1.468 municípios em 2008 e em 5.150 em 2022.
  - Valores de 2009–2016 não foram incluídos (PDFs antigos fora do ar em 30/10/2026; os números de memória não foram usados).
  - Por isso a série domiciliar do IBGE é a usada para comparar os 8 governos.
  - O SINISA de referência 2024 ainda não estava publicado na página de resultados.
- **Pandemia:**
  - O auxílio emergencial derrubou a pobreza em 2020 (US$ 3,00: 7,9%), e ela subiu em 2021 (11,2%).
  - O IDEB de 2021 foi afetado (mais aprovação, menos alunos na prova).
  - A PNAD Contínua não fez o módulo de educação em 2020–2021.
- **Bolsa Família:**
  - Criado em out/2003 (MP 132, Lei 10.836/2004), juntando Bolsa Escola e Bolsa Alimentação (2001), Auxílio-Gás (2002) e Cartão Alimentação (2003). A série do Portal começa em dez/2004.
  - Virou Auxílio Brasil em nov/2021, com piso de R$ 600 desde ago/2022.
  - Voltou a se chamar Bolsa Família em mar/2023 (piso de R$ 600 + R$ 150 por criança), com revisão cadastral ("pente-fino") e a regra de proteção (Lei 14.601/2023).
    - Pela regra, a família que passa de R$ 218 por pessoa, até meio salário mínimo, recebe 50% por um tempo: 24 meses na regra de 2023 e 12 meses segundo o MDS em 2026.
  - Reajuste de 15,04% em out/2026.
  - Em dez/2022, o valor médio da série do Portal (cerca de R$ 381) parece não incluir o complemento extraordinário da EC 123/2022. É preciso ler 2022 com cautela.
- **Saídas por renda:** só há números oficiais desde 2023. Por isso não entram na tabela comparativa. O que é comparável entre governos é o número de famílias atendidas e o efeito dos benefícios sobre a extrema pobreza (IBGE, desde 2012).
- **Linhas de pobreza:** o Banco Mundial trocou as linhas em jun/2025 (US$ 3,00 e US$ 8,30, PPC 2021). O IPEA já usa as novas; o IBGE (SIS 2025) ainda usa as de 2017 (US$ 2,15 e US$ 6,85). Os níveis são diferentes, mas a direção é a mesma nas três fontes.
- **Pessoas na pobreza:** % × população do WDI. O "saíram" é saldo líquido: quem entrou e quem saiu se compensam.
- **Atribuição:** os números dizem o que aconteceu no período, não por quê. Economia mundial (2008–2009), recessão de 2014–2016, inflação de 2002, 2015 e 2021, preços de commodities, estados e municípios e decisões de governos anteriores entram em tudo.

## 6. Limitações conhecidas

- IDEB só existe desde 2005; não há como medir FHC.
- O Indicador Criança Alfabetizada só existe desde 2023. A ANA (2013, 2014, 2016) usava outra escala.
- O SNIS de 2009 a 2016 está fora do painel. Para incluir, baixar os Diagnósticos AE desses anos e preencher `SNIS_AGUA`/`SNIS_ESG` em `scripts/governo.mjs`.
- O valor de 2026 do Bolsa Família é de outubro (mês parcial), não de dezembro.
- Analfabetismo de 1995–1999: o cálculo pelos volumes da PNAD dá cerca de 0,05 p.p. acima da série publicada na Síntese 2009 (15,57 contra 15,5 em 1995).
- Projeções são retas: não consideram que reduzir os últimos pontos de pobreza ou levar rede a áreas rurais tende a ser mais lento.

## 7. Como atualizar

```bash
node scripts/governo.mjs --forcar   # baixa IPEA, Banco Mundial, SIDRA, SIS (FTP do IBGE) e IDEB (INEP)
```

O que precisa de atualização manual fica nas constantes de `scripts/governo.mjs`:

- PNAD 1995–1999;
- SNIS/SINISA;
- Indicador Criança Alfabetizada;
- Bolsa Família do último mês e as saídas por renda (MDS).

Para o próximo IDEB, troque a URL `URL_IDEB`. Para a próxima SIS, troque `URL_SIS`; as linhas de pobreza novas devem aparecer em outras colunas da tabela 2.18, então confira os índices em `col(sis218, …)`.
