# Apuração TSE 2026

Mapa e análise dos **boletins de urna do 2º turno de 2026** (Presidente), feitos a partir dos dados abertos do TSE e das malhas do IBGE.

- **Mapa de cor** por estado, município e local de votação (escola). A cor pode mostrar quem lidera, o campo de biometria, o comparecimento, brancos e nulos ou as seções com alerta.
- **Busca** por estado, região (macro, intermediária e imediata do IBGE), município, zona eleitoral, bairro e escola.
- **Reprodução da apuração**: o mapa na ordem de chegada dos boletins ao TSE.
- **Biometria**: comparação de seções com taxas diferentes, dentro do mesmo município e da mesma escola.
- **Horários** de encerramento convertidos para Brasília, **alertas** por seção (com CSV) e conferência dos números que circularam em imagens.
- Funciona no celular. Cores: Lula em vermelho e Flávio Bolsonaro em azul.

## Rodar localmente

```bash
npm run servir      # http://localhost:5174
```

## Refazer os dados

1. Baixe os ZIPs `bweb_2t_*` e `eleitorado_local_votacao_2026` (URLs em `dados/catalogo/downloads.json`) e extraia em `dados/extraidos/bweb/` e `dados/extraidos/locais/`.
2. `npm run construir`: lê os ~2 GB de CSV em cerca de 40 s e escreve `site/dados/*.json`.

## Publicar

`npm run deploy` copia `site/` para o branch `gh-pages`.

## Estrutura

| Pasta | O que tem |
|---|---|
| `site/` | o painel estático (HTML, CSS, JS, JSON gerados) |
| `scripts/construir.mjs` | boletins + locais + IBGE → JSON do site |
| `scripts/investigar.mjs` | investigação de inconsistências (relatório em `docs/`) |
| `dados/ibge`, `dados/catalogo` | malhas, tabela TSE↔IBGE, catálogo e hashes da coleta |
| `historico/` | o primeiro painel (com mapa 3D) e os scripts da coleta inicial |
| `docs/` | progresso e relatórios |

Fontes: [TSE, dados abertos](https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna) · [IBGE, malhas](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3) · [betafcc/Municipios-Brasileiros-TSE](https://github.com/betafcc/Municipios-Brasileiros-TSE).
Alerta automático não é prova de irregularidade. Associação estatística não demonstra fraude.
