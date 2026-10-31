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
