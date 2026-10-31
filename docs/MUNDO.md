# Brasil × Mundo

Posição do Brasil entre os países do mundo em indicadores oficiais internacionais, do ano mais recente e desde 1994, com a posição no início e no fim de cada mandato presidencial.

- Dados: `node scripts/mundo.mjs` (Node, sem dependências; `--forcar` baixa tudo de novo) → `site/dados/mundo.json` (~660 KB; ~230 KB com gzip). Brutos em `dados/contexto/mundo/` (fora do git).
- Cálculos: `site/js/mundo-calc.js`. O site e o script usam o mesmo arquivo, então o relatório do script mostra exatamente o que o site mostra.
- Tela: `site/js/mundo.js` + `site/mundo.css`.

## Fontes (todas sem chave)

| Indicadores | Fonte | Como é baixado |
|---|---|---|
| Saneamento e água (`SH.STA.SMSS.ZS`, `SH.STA.BASS.ZS`, `SH.H2O.SMDW.ZS`, `SH.H2O.BASW.ZS`), pobreza (`SI.POV.DDAY`, `SI.POV.UMIC`), Gini (`SI.POV.GINI`), PIB per capita PPC (`NY.GDP.PCAP.PP.KD`), desemprego (`SL.UEM.TOTL.ZS`), expectativa de vida (`SP.DYN.LE00.IN`), mortalidade infantil (`SP.DYN.IMRT.IN`), homicídios (`VC.IHR.PSRC.P5`), internet (`IT.NET.USER.ZS`), população (`SP.POP.TOTL`) | Banco Mundial, World Development Indicators (os dados de água e esgoto são do JMP OMS/UNICEF; pobreza e Gini, da Poverty and Inequality Platform; desemprego, estimativa modelada da OIT; homicídios, do UNODC) | `https://api.worldbank.org/v2/country/all/indicator/{código}?format=json&per_page=20000&date=1990:{ano atual}` |
| Estabilidade política e ausência de violência (`GOV_WGI_PV.EST`), Estado de direito (`GOV_WGI_RL.EST`), Controle da corrupção (`GOV_WGI_CC.EST`) | Banco Mundial, Worldwide Governance Indicators (atualização de 25/09/2026, dados até 2025) | mesma API com `&source=3` |
| IDH, média de anos de estudo (25+), anos esperados de estudo | PNUD, Relatório de Desenvolvimento Humano 2025 (dados até 2023), CSV de séries históricas | `https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv` |
| PISA matemática, leitura e ciências | OCDE, *PISA 2022 Results (Volume I)*, tabelas I.B1.5.4, I.B1.5.5 e I.B1.5.6 (médias por ciclo, 2000–2022) | planilha `https://stat.link/wh9d4z` (o site da OCDE bloqueia robôs, o stat.link não) |

**Linhas de pobreza.** Em junho de 2025 o Banco Mundial passou para a PPC de 2021: a linha internacional de pobreza extrema virou **US$ 3,00/dia** (antes US$ 2,15, PPC 2017) e a dos países de renda média-alta virou **US$ 8,30/dia** (antes US$ 6,85). Os códigos `SI.POV.DDAY` e `SI.POV.UMIC` continuam os mesmos, com as linhas novas; a série inteira foi recalculada pelo Banco Mundial, então não há mistura de linhas.

**PISA.** A OCDE só publica o PISA de 3 em 3 anos (2022 foi adiado de 2021 pela pandemia; o de 2025 sai em dezembro de 2026). As tabelas de tendência listam os 81 participantes de 2022; ficam fora Baku (Azerbaijão) e as 18 regiões da Ucrânia (partes de país), restando 79. Os rankings de anos anteriores são, portanto, entre os participantes de 2022 que tinham resultado comparável naquele ciclo (China, Rússia, Índia e África do Sul não aparecem no PISA 2022). O PISA cobre sobretudo países de renda média e alta: estar em 63º de 79 não é o mesmo que estar em 63º do mundo.

**Outros crimes no mundo.** Roubo, furto e violência sexual por país (UNODC) não entram: o próprio UNODC alerta que esses números dependem da definição legal e da propensão a registrar, e não se comparam entre países. Homicídio é o crime com comparação internacional aceita. Para o resto, o painel usa as percepções de governança do Banco Mundial (ausência de violência, Estado de direito, corrupção), que são índices compostos de pesquisas e avaliações de especialistas, não contagens.

## Regras de cálculo (as mesmas para todos)

- **Países**: as 217 economias da lista do Banco Mundial (sem agregados regionais), mais Taiwan no PISA. "País" no texto = país ou economia (inclui territórios como Hong Kong e Porto Rico quando a fonte tem dado).
- **Sentido**: cada indicador diz se "maior é melhor" ou "menor é melhor"; a posição vai do melhor (1º) para o pior.
- **Valor de um país num ano**: o dado daquele ano; se não houver, o mais recente dos `janela` anos anteriores. Janela por indicador: 0 nas séries anuais completas (água, esgoto, PIB, desemprego, expectativa de vida, mortalidade, IDH e anos de estudo); 1 nos índices de governança (bienais até 2002); 2 em internet; 3 em homicídios e no PISA (pega só o ciclo mais recente); 4 em pobreza e Gini (pesquisas domiciliares irregulares). Quando o valor usado é de outro ano, o ano aparece entre parênteses.
- **Posição** = 1 + número de países com valor estritamente melhor (empate divide a posição). Os valores são comparados com a precisão publicada (uma casa a mais que a exibida); por isso, por exemplo, o Brasil aparece empatado em 1º em "água ao menos básica" em 2024 (99,99999% arredondado para 100,00%, como outros 44 países).
- **Percentil** ("melhor que X% dos demais") = países com valor estritamente pior ÷ (N − 1). É o número para comparar anos com N diferente.
- **Média mundial**: o agregado oficial "World" do Banco Mundial quando existe (pondera pela população) ou o agregado "World" do PNUD; no Gini, no PISA e nos índices de governança não há agregado oficial e o painel usa a média simples dos países com dado (cada país pesa igual). **Mediana**: dos países com dado no ano (com a janela).
- **Posição ao longo do tempo**: em cada ano com dado próprio do Brasil, posição e N daquele ano. O gráfico mostra o percentil (0–100%) porque N muda; a dica mostra "Nº de N".
- **Tabela por mandato** (FHC 1 1995–1998, FHC 2 1999–2002, Lula 1 2003–2006, Lula 2 2007–2010, Dilma 1 2011–2014, Dilma 2 + Temer 2015–2018, Bolsonaro 2019–2022, Lula 3 2023–2026 parcial): início = ano anterior à posse (situação recebida); fim = último ano do mandato (no mandato atual, o último ano com dado do Brasil). A posição é recalculada só entre os países com valor nos dois anos (N informado), então pode diferir da posição do cartão. Sem dado do Brasil num dos dois anos (com a janela), a linha diz "sem dado". A tabela descreve mudanças; não atribui causa (a posição depende também do que os outros países fizeram).
- **Grupo de pares** (fixo, o mesmo para todos os indicadores): Argentina, Chile, Colômbia, México, Peru, África do Sul, Índia, China, Rússia, Turquia, Indonésia, Estados Unidos e Portugal. A posição mostrada é a do mundo.
- **América Latina e Caribe**: região `LCN` do Banco Mundial.

## Brasil no último ano com dado (gerado em 30/10/2026)

| Tema | Indicador | Sentido | Brasil | Ano | Posição | Melhor que | Média mundial | Mediana |
|---|---|---|---|---|---|---|---|---|
| Saneamento | Esgoto gerenciado com segurança (% da pop.) | maior é melhor | 55,0 | 2024 | 78º de 141 | 45% | 58,5 | 62,2 |
| Saneamento | Saneamento ao menos básico (% da pop.) | maior é melhor | 92,4 | 2024 | 104º de 193 | 46% | 82,2 | 93,9 |
| Saneamento | Água gerenciada com segurança (% da pop.) | maior é melhor | 88,6 | 2024 | 65º de 148 | 56% | 73,7 | 80,7 |
| Saneamento | Água ao menos básica (% da pop.) | maior é melhor | 100,0 | 2024 | 1º de 202 (empate) | 80% | 91,5 | 97,4 |
| Renda | Pobreza extrema, US$ 3,00/dia (% da pop.) | menor é melhor | 3,0 | 2024 | 74º de 116 | 37% | 10,1 | 1,3 |
| Renda | Pobreza, US$ 8,30/dia (% da pop.) | menor é melhor | 20,6 | 2024 | 56º de 116 | 52% | 46,2 | 20,8 |
| Renda | Gini (0–100) | menor é melhor | 50,3 | 2024 | 113º de 116 | 3% | 39,2 (simples) | 34,0 |
| Renda | PIB per capita PPC (US$ int. de 2021) | maior é melhor | 20.025 | 2025 | 82º de 185 | 56% | 21.914 | 17.265 |
| Renda | Desemprego (% da força de trabalho) | menor é melhor | 6,0 | 2025 | 109º de 182 | 40% | 4,8 | 5,1 |
| Educação | PISA matemática (pontos) | maior é melhor | 379 | 2022 | 63º de 79 | 21% | 438 (simples) | 442 |
| Educação | PISA leitura | maior é melhor | 410 | 2022 | 51º de 79 | 36% | 436 (simples) | 440 |
| Educação | PISA ciências | maior é melhor | 403 | 2022 | 61º de 79 | 23% | 448 (simples) | 447 |
| Educação | Média de anos de estudo (25+) | maior é melhor | 8,4 | 2023 | 123º de 193 | 36% | 8,8 | 9,9 |
| Educação | Anos esperados de estudo | maior é melhor | 15,8 | 2023 | 51º de 195 | 74% | 13,0 | 13,3 |
| Saúde | Expectativa de vida (anos) | maior é melhor | 76,0 | 2024 | 99º de 217 | 55% | 73,5 | 74,7 |
| Saúde | Mortalidade infantil (por mil nascidos vivos) | menor é melhor | 12,3 | 2024 | 97º de 196 | 50% | 27,7 | 12,4 |
| Desenvolvimento | IDH | maior é melhor | 0,786 | 2023 | 84º de 193 (PNUD: 84º) | 56% | 0,756 | 0,762 |
| Segurança | Homicídios (por 100 mil, UNODC) | menor é melhor | 19,3 | 2023 | 120º de 136 | 12% | 5,2 | 2,3 |
| Segurança | Estabilidade política e ausência de violência (−2,5 a +2,5) | maior é melhor | −0,39 | 2025 | 143º de 207 | 31% | 0,05 (simples) | 0,14 |
| Segurança | Estado de direito | maior é melhor | −0,49 | 2025 | 134º de 207 | 35% | −0,05 (simples) | −0,12 |
| Segurança | Controle da corrupção | maior é melhor | −0,38 | 2025 | 123º de 207 | 41% | −0,03 (simples) | −0,20 |
| Conectividade | Uso de internet (% da pop.) | maior é melhor | 84,5 | 2024 | 84º de 185 | 55% | 71,2 | 82,4 |

## Tela (site/js/mundo.js)

- `iniciarMundo(R)`: desenha a aba completa em `#aba-mundo` (se o elemento existir): introdução, filtros (tema, indicador, visão, ano), o resumo "posição em cada quesito" (clicável) e os cartões. O estado do filtro vai para a URL: `#aba=mundo&tema=…&ind=…&vis=…&ano=…`.
- `blocoMundo(alvo, opcoes)`: desenha os cartões em qualquer elemento. Opções: `indicadores` (ids), `temas` (ids), `visao` (`ranking` | `pares` | `regiao` | `todos`), `ano` (número ou `null` = mais recente do Brasil em cada indicador), `compacto`, `detalhes` (gráficos e tabela de mandatos; padrão = `!compacto`), `titulos`, `resumo`. Devolve `{ atualizar(opcoes), dados }`.
- Ordem dos temas: saneamento (esgoto e água) primeiro; depois renda, educação, saúde, desenvolvimento humano, segurança e conectividade.
- Cada cartão: valor do Brasil, "Nº de N", percentil, média mundial e mediana; régua 1º…Nº com o Brasil marcado; texto por regras; lista com barras (visão escolhida); em "Evolução e mandatos", a série Brasil × média mundial e a posição relativa ano a ano (faixas de fundo por mandato) e a tabela por mandato; fonte com link.
- Visões: **Ranking** = 5 primeiros + 4 acima e 4 abaixo do Brasil, com "…" entre os blocos; **Grupo de pares**; **América Latina e Caribe**; **Todos os países** (lista rolável).
- Cores neutras (`--serie-1` para o Brasil, `--muted` para a média mundial), nunca as cores dos candidatos.

## Limitações

- O número de países com dado muda por indicador e por ano (de 79 no PISA a 217 na expectativa de vida). Compare percentis, não posições, entre indicadores ou anos distantes.
- Pobreza e Gini vêm de pesquisas domiciliares que cada país faz em anos diferentes; a janela de 4 anos põe na mesma lista dados de anos próximos, não iguais.
- Os índices de governança medem percepção (pesquisas e avaliações de especialistas) e têm margem de erro grande; diferenças pequenas entre países não são significativas.
- Valores do ano mais recente costumam ser revisados pelas fontes nas atualizações seguintes.
