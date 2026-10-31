# Progresso — Apuração TSE 2026

## 30/10/2026 — projeto montado a partir da coleta em `Downloads\2026-10-30`

**Feito**
- Coleta antiga (outra ferramenta) copiada para cá: boletins do 2º turno (28 ZIPs conferidos por SHA-512), cadastro de locais, malhas do IBGE. O painel antigo (mapa 3D, Three.js) ficou em `historico/`.
- `scripts/construir.mjs`: lê ~2 GB de CSV em ~40 s. Gera, por seção do cargo Presidente, agregados por escola, bairro, zona, município, região do IBGE e UF, mais a linha do tempo da apuração, as faixas de biometria (bruto, comparado ao município e comparado à mesma escola, com inclinação de efeito fixo), os horários em Brasília e 11 tipos de alerta.
- Conferência: 499.205 seções, 128.236.074 votantes, 8.632.488 no campo de biometria e margem de 4.430.191 batem com as imagens. Os cortes 17h/19h dependem do critério: 6.336 depois das 19h de Brasília, contra 6.333 na imagem.
- Site estático (`site/`, Leaflet via cdnjs): mapa de cor UF → município → escolas (bolinhas que crescem com o zoom), ruas do OpenStreetMap ao aproximar, busca por estado/região/intermediária/imediata/município/zona/bairro/escola, botões ↑ (subir nível) e ⌂, botão Voltar do celular funcionando (pushState), reprodução da apuração, abas Visão geral, Biometria, Horários, Estados, Alertas (com CSV) e Método. Lula em vermelho e Flávio Bolsonaro em azul. Testado no navegador em desktop e celular (375 px), sem erros no console.
- Correção encontrada no teste: o CARTO passou a exigir chave, e as ruas foram trocadas pelo OpenStreetMap. A aba ativa não escondia o mapa (`[hidden]` perdia para `display:grid`).

- Investigação de inconsistências (`scripts/investigar.mjs` → `docs/ANALISE-INCONSISTENCIAS.md`). Principal achado: 6.311 urnas fecharam entre 19:00 e 19:15 de Brasília, como um segundo horário programado (RJ/SP/BA/PE/PB). O resultado delas é igual ao das vizinhas. Resumo publicado na aba Alertas.

**Próximos passos**
- Criar o repositório no GitHub (UPraggy/ApuracaoTSE2026, público para ter Pages grátis), `git remote add origin git@github.com:UPraggy/ApuracaoTSE2026.git`, `git push -u origin main`, `npm run deploy` e ligar Settings › Pages › gh-pages.
- Governadores do 2º turno e o 1º turno, que está catalogado mas ainda não foi baixado.
- Corrigir o fuso do oeste do AM (UTC-5) e de Fernando de Noronha (UTC-2).

## 30–31/10/2026 — no ar em https://apuracao.rafaelmr.com.br

**Feito**
- Repo público UPraggy/ApuracaoTSE2026, branch gh-pages com CNAME; Cloudflare: CNAME `apuracao` → upraggy.github.io com proxy (igual ao plantafacil/lnoffice). `npm run deploy` carimba versão em CSS, JS e também nos JSON (`VERSAO_DADOS`), porque o Pages guarda cache por 10 min.
- Aba Análise (verificações com selo Consistente/Pede explicação/Contexto), aba 2022 × 2026 (historico.mjs: 2014–2022 conferidos com a totalização), fonte sob cada bloco, chat de perguntas comuns no fim, busca estilo Maps (endereço via Nominatim, "Perto de mim"), busca por zona+seção com o boletim da urna, capitais no mapa, legenda de calor sobre o mapa, métricas aptos/votantes/abstenção/após 17h05/17h30/19h/variação 2022→2026, contexto IBGE no painel (contexto.mjs), ícones SVG e microinterações.
- Achado do histórico: o fechamento às 19h quase não existia em 2022 (21 urnas contra 6.336), e em 2022 havia 394 mil boletins recebidos entre 17:10 e 19:00, contra 0 em 2026.

**Em andamento (agentes)**
- `scripts/logs-urna.mjs`: votos depois das 17h, liberações sem biometria depois das 17h e curva do dia, a partir dos logs das urnas → `site/dados/votos-apos-17h.json` e `docs/VOTOS-APOS-17H.md`.
- `contexto.mjs`: saneamento, saúde e auxílios (em %).

**Próximos passos**
- Ligar `votos-apos-17h.json` no site (simulação do dia desde as 8h, votos depois das 17h por zona).
- Ligar os indicadores sociais novos no bloco "Quem mora e quem vota aqui".

## 31/10/2026 — logs das urnas, simulação e gráficos interativos

- **Votos depois das 17h** (`scripts/logs-urna.mjs`, 16.038 logs lidos; votos no log = comparecimento do BU em 100% dos casos): ≈ 34.911 ± 3.339 no país (TSE: 34.393), 1.979 depois das 18h (TSE: 1.981 entre 18h e 19h) e 11 depois das 19h (TSE: 13). Liberações sem a digital depois das 17h: ≈ 1.193, mesma taxa do resto do dia.
- **O degrau das 19h tem explicação oficial**, conferida na nota do TSE de 25/10, 18:44: o ministro Cristiano Zanin (STF) prorrogou a votação até as 19h nos locais ainda abertos às 17h, e o TSE suspendeu o recebimento dos BUs até as 19h. Nas 6.352 urnas desse grupo, o último voto mediano foi às 16:59 e 53% não tiveram nenhum voto depois das 17h.
- `scripts/resumo-logs.mjs` → `site/dados/logs-resumo.json` (21 KB) alimenta o site. O `votos-apos-17h.json` (5,9 MB) fica como dado aberto.
- **Site:**
  - Simular o dia (comparecimento por UF a cada 15 min).
  - Reprodução da apuração com o painel do Brasil ao vivo e qualquer cor do mapa. O BU traz, por bloco, os 11 campos.
  - Corrida da apuração de 2022 e 2026, com linha guia, dica, legenda clicável, botão Tocar e setas do teclado (`grafico.js`).
  - Proporção ao lado de todo número, indicadores sociais em %, tema escuro por padrão.

## 31/10/2026 (noite) — Início, Explorar, Candidatos, probabilidades

- Abas novas, feitas em paralelo:
  - **Início** (`inicio.js`): página limpa, aberta por padrão.
  - **Explorar** (`explorar.js`): 33 indicadores, ranking, dispersão ponderada e "bot" de análise com r, r² e outliers.
  - **Candidatos** (`candidatos.js`): perfil dos lugares de onde veio o voto, com média ponderada pelos votos de cada candidato e distribuição por região, porte e quintos de renda, Bolsa Família e 60+ pela população.
- `scripts/simular-apuracao.mjs` → `simulacao.json`.
  - **Sorteando urna por urna:** 0 viradas em 200.
  - **Sorteando municípios inteiros:** virada em 39% (2026) e 61% (2022).
  - A curva real se explica pela ordem regional de chegada.
- **Teste de "robô" e repetição:** 0 blocos repetidos. Urnas da mesma escola com votos idênticos: 1.835 pares, contra 1.994 a 2.122 pelo acaso. Os 302 pares consecutivos são urnas vizinhas da mesma escola, e nenhum é cópia completa.
- **Análise:** 6 verificações e 8 pontos de atenção, cada um com "chance por acaso". Os pontos de atenção:
  - boletim impresso tarde (368);
  - encerramento cancelado (743);
  - contagem TSE 6.766 × 6.352;
  - ≥50% sem digital (96);
  - urnas destoando das vizinhas (420);
  - aberturas tardias (84);
  - número de urna repetido no exterior;
  - unanimidades.
- **Revisão:** biometria sempre sem o exterior; abas com degradê e setas do teclado; topo compacto no celular; FAQ só na Início e no Método; marcas de hora cheia nos gráficos; "Flávio" com acento; rodapé completo. O deploy agora carimba todos os CSS e os `import()` dinâmicos.
