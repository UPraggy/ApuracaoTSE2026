// Brasil × mundo: indicadores internacionais oficiais, por país e por ano (1990 em diante).
// Uso: node scripts/mundo.mjs [--forcar]
//   Fontes: Banco Mundial (API v2, sem chave: WDI e Worldwide Governance Indicators), PNUD (Relatório de
//   Desenvolvimento Humano, CSV de séries) e OCDE (PISA 2022, Volume I, tabelas I.B1.5.4–6).
//   Brutos em dados/contexto/mundo/ (cache; --forcar baixa de novo). Saída: site/dados/mundo.json.
//   O cálculo de posição, percentil e mandatos fica em site/js/mundo-calc.js (o mesmo que o site usa).
// Método e limitações: docs/MUNDO.md
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { lerXlsx } from './xlsx.mjs';
import * as C from '../site/js/mundo-calc.js';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const BRUTOS = path.join(RAIZ, 'dados/contexto/mundo');
const SAIDA = path.join(RAIZ, 'site/dados/mundo.json');
const FORCAR = process.argv.includes('--forcar');
const ANO0 = 1990, ANO1 = new Date().getFullYear();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const sh = promisify(execFile);
await fsp.mkdir(BRUTOS, { recursive: true });

// ---------- download com cache (fetch; curl de reserva por causa do antivírus que reassina o TLS) ----------
async function baixar(url, arquivo, { binario = false } = {}) {
  const p = path.join(BRUTOS, arquivo);
  if (!FORCAR && fs.existsSync(p) && fs.statSync(p).size > 100) return p;
  console.log('  baixando', url);
  let ok = false;
  for (let t = 1; t <= 4 && !ok; t++) {
    try {
      await sh('curl', ['-sS', '-f', '-L', '--ssl-no-revoke', '-m', '240', '-A', UA, '-o', p, url], { maxBuffer: 1 << 20 });
      ok = fs.statSync(p).size > 100;
      if (ok && !binario) { const ini = fs.readFileSync(p, 'utf8').slice(0, 300); if (/<html|Request Error|"message"/i.test(ini)) { ok = false; console.warn('  resposta inválida:', ini.slice(0, 120)); } }
    } catch (e) { console.warn(`  tentativa ${t} falhou: ${e.message.split('\n')[0]}`); }
  }
  if (!ok) { await fsp.rm(p, { force: true }); throw new Error('não baixou: ' + url); }
  return p;
}
const lerJson = async p => JSON.parse(await fsp.readFile(p, 'utf8'));

// ---------- países (Banco Mundial; agregados regionais ficam fora) ----------
console.log('Banco Mundial: países...');
const metaPaises = (await lerJson(await baixar('https://api.worldbank.org/v2/country?format=json&per_page=400', 'wb_paises.json')))[1];
const nomePt = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const NOMES_FIXOS = { XKX: 'Kosovo', PSE: 'Palestina (Cisjordânia e Gaza)', TWN: 'Taiwan (Taipé Chinesa)', HKG: 'Hong Kong (China)', MAC: 'Macau (China)', CHI: 'Ilhas do Canal', KOR: 'Coreia do Sul', PRK: 'Coreia do Norte', COD: 'Congo (Rep. Dem.)', COG: 'Congo (Rep.)', CIV: 'Costa do Marfim', TUR: 'Turquia', CZE: 'Tchéquia' };
const PAISES = {}; // ISO3 -> [nome pt-BR, região do Banco Mundial, nome em inglês]
for (const p of metaPaises) {
  if (p.region.id === 'NA') continue;
  let nome = NOMES_FIXOS[p.id];
  if (!nome) { try { nome = nomePt.of(p.iso2Code); } catch { /* sem código */ } }
  if (!nome || nome === p.iso2Code) nome = p.name;
  PAISES[p.id] = [nome, p.region.id, p.name];
}
PAISES.TWN = [NOMES_FIXOS.TWN, 'EAS', 'Chinese Taipei']; // fora da lista do Banco Mundial; aparece só no PISA

// ---------- indicadores ----------
const WB = 'https://api.worldbank.org/v2/country/all/indicator/';
const fWB = (codigo, nome, extra = '') => ({ nome: `Banco Mundial, World Development Indicators, ${codigo}${extra ? ' (' + extra + ')' : ''}`, url: `https://data.worldbank.org/indicator/${codigo}`, codigo, nomeOriginal: nome });
const fWGI = (codigo) => ({ nome: `Banco Mundial, Worldwide Governance Indicators, ${codigo} (estimativa, escala ≈ −2,5 a +2,5)`, url: 'https://www.worldbank.org/en/publication/worldwide-governance-indicators', codigo });
const fHDR = campo => ({ nome: `PNUD, Relatório de Desenvolvimento Humano 2025, séries históricas (campo ${campo})`, url: 'https://hdr.undp.org/data-center/documentation-and-downloads', codigo: campo });
const fPISA = tab => ({ nome: `OCDE, PISA 2022 Results (Volume I), tabela ${tab}`, url: 'https://www.oecd.org/en/publications/pisa-2022-results-volume-i_53f23881-en/full-report/results-for-countries-and-economies_360c8f67.html', codigo: tab });

// tema, id, origem, código, nome, curto, unidade, sentido (+1 maior é melhor), casas, janela (anos para trás aceitos), média
const IND = [
  ['saneamento', 'esgotoGerenciado', 'wb', 'SH.STA.SMSS.ZS', 'Esgotamento sanitário gerenciado com segurança', 'Esgoto seguro', '% da população', 1, 1, 0, 'wld'],
  ['saneamento', 'esgotoBasico', 'wb', 'SH.STA.BASS.ZS', 'Saneamento ao menos básico (banheiro não compartilhado)', 'Saneamento básico', '% da população', 1, 1, 0, 'wld'],
  ['saneamento', 'aguaGerenciada', 'wb', 'SH.H2O.SMDW.ZS', 'Água potável gerenciada com segurança', 'Água segura', '% da população', 1, 1, 0, 'wld'],
  ['saneamento', 'aguaBasica', 'wb', 'SH.H2O.BASW.ZS', 'Água potável ao menos básica', 'Água básica', '% da população', 1, 1, 0, 'wld'],
  ['renda', 'pobrezaExtrema', 'wb', 'SI.POV.DDAY', 'Pobreza extrema (linha internacional de US$ 3,00/dia, PPC 2021)', 'Pobreza extrema', '% da população', -1, 1, 4, 'wld'],
  ['renda', 'pobrezaRendaMedia', 'wb', 'SI.POV.UMIC', 'Pobreza pela linha de países de renda média-alta (US$ 8,30/dia, PPC 2021)', 'Pobreza (US$ 8,30)', '% da população', -1, 1, 4, 'wld'],
  ['renda', 'gini', 'wb', 'SI.POV.GINI', 'Desigualdade de renda (índice de Gini)', 'Gini', 'índice 0–100', -1, 1, 4, 'simples'],
  ['renda', 'pibPcPpc', 'wb', 'NY.GDP.PCAP.PP.KD', 'PIB per capita em paridade de poder de compra', 'PIB per capita (PPC)', 'US$ internacionais de 2021', 1, 0, 0, 'wld'],
  ['renda', 'desemprego', 'wb', 'SL.UEM.TOTL.ZS', 'Desemprego (estimativa modelada da OIT)', 'Desemprego', '% da força de trabalho', -1, 1, 0, 'wld'],
  ['educacao', 'pisaMatematica', 'pisa', 'Table I.B1.5.4', 'PISA: nota média em matemática (alunos de 15 anos)', 'PISA matemática', 'pontos', 1, 0, 3, 'simples'],
  ['educacao', 'pisaLeitura', 'pisa', 'Table I.B1.5.5', 'PISA: nota média em leitura (alunos de 15 anos)', 'PISA leitura', 'pontos', 1, 0, 3, 'simples'],
  ['educacao', 'pisaCiencias', 'pisa', 'Table I.B1.5.6', 'PISA: nota média em ciências (alunos de 15 anos)', 'PISA ciências', 'pontos', 1, 0, 3, 'simples'],
  ['educacao', 'anosEstudo', 'hdr', 'mys', 'Média de anos de estudo (adultos de 25 anos ou mais)', 'Anos de estudo', 'anos', 1, 1, 0, 'hdr'],
  ['educacao', 'anosEsperados', 'hdr', 'eys', 'Anos esperados de escolaridade (criança que entra na escola)', 'Anos esperados de estudo', 'anos', 1, 1, 0, 'hdr'],
  ['saude', 'expectativaVida', 'wb', 'SP.DYN.LE00.IN', 'Expectativa de vida ao nascer', 'Expectativa de vida', 'anos', 1, 1, 0, 'wld'],
  ['saude', 'mortalidadeInfantil', 'wb', 'SP.DYN.IMRT.IN', 'Mortalidade infantil (menores de 1 ano)', 'Mortalidade infantil', 'por mil nascidos vivos', -1, 1, 0, 'wld'],
  ['desenvolvimento', 'idh', 'hdr', 'hdi', 'Índice de Desenvolvimento Humano (IDH)', 'IDH', 'índice 0–1', 1, 3, 0, 'hdr'],
  ['seguranca', 'homicidios', 'wb', 'VC.IHR.PSRC.P5', 'Homicídios intencionais (UNODC)', 'Homicídios', 'por 100 mil habitantes', -1, 1, 3, 'wld'],
  ['seguranca', 'estabilidadeViolencia', 'wgi', 'GOV_WGI_PV.EST', 'Estabilidade política e ausência de violência/terrorismo (percepção)', 'Ausência de violência', 'escala −2,5 a +2,5', 1, 2, 1, 'simples'],
  ['seguranca', 'estadoDeDireito', 'wgi', 'GOV_WGI_RL.EST', 'Estado de direito (percepção: contratos, polícia, tribunais, crime)', 'Estado de direito', 'escala −2,5 a +2,5', 1, 2, 1, 'simples'],
  ['seguranca', 'controleCorrupcao', 'wgi', 'GOV_WGI_CC.EST', 'Controle da corrupção (percepção)', 'Controle da corrupção', 'escala −2,5 a +2,5', 1, 2, 1, 'simples'],
  ['conectividade', 'internet', 'wb', 'IT.NET.USER.ZS', 'Pessoas que usam a internet', 'Uso de internet', '% da população', 1, 1, 2, 'wld'],
];

const nAnos = ANO1 - ANO0 + 1;
const vazioSerie = () => Array(nAnos).fill(null);
const arred = (x, casas) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** (casas + 1)) / 10 ** (casas + 1)); // 1 casa a mais que a exibida

async function lerWB(codigo, fonteWgi) {
  const arq = `wb_${codigo}.json`;
  const url = `${WB}${codigo}?format=json&per_page=20000&date=${ANO0}:${ANO1}${fonteWgi ? '&source=3' : ''}`;
  const j = await lerJson(await baixar(url, arq));
  if (!Array.isArray(j) || !j[1]) throw new Error('resposta inesperada para ' + codigo);
  if (j[0].pages > 1) throw new Error('mais de uma página: ' + codigo);
  const por = {}, nomeOriginal = j[1][0]?.indicator?.value;
  for (const x of j[1]) {
    if (x.value == null) continue;
    const iso = x.countryiso3code || x.country.id; const a = Number(x.date);
    if (a < ANO0 || a > ANO1) continue;
    (por[iso] ??= vazioSerie())[a - ANO0] = x.value;
  }
  return { por, nomeOriginal, atualizado: j[0].lastupdated };
}

// População (para a média ponderada quando o Banco Mundial não publica o agregado "WLD")
console.log('Banco Mundial: população...');
const POP = (await lerWB('SP.POP.TOTL')).por;

// PNUD
console.log('PNUD: séries do IDH...');
const hdrTxt = await fsp.readFile(await baixar('https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv', 'hdr25_series.csv'), 'utf8');
const hdrLin = hdrTxt.replace(/^﻿/, '').trim().split(/\r?\n/).map(l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; });
const hdrCab = hdrLin[0];
function lerHDR(campo) {
  const por = {};
  for (const l of hdrLin.slice(1)) {
    const iso = l[0] === 'ZZK.WORLD' ? 'WLD' : l[0];
    if (iso.startsWith('ZZ')) continue;
    for (let a = ANO0; a <= ANO1; a++) {
      const i = hdrCab.indexOf(`${campo}_${a}`); if (i < 0) continue;
      const v = l[i] === '' ? null : Number(l[i]);
      if (v != null && Number.isFinite(v)) (por[iso] ??= vazioSerie())[a - ANO0] = v;
    }
  }
  return por;
}
const iRank = hdrCab.findIndex(h => /^hdi_rank_\d{4}$/.test(h));
const ANO_RANK_HDR = Number(hdrCab[iRank].slice(-4));
const rankHdrBR = Number(hdrLin.find(l => l[0] === 'BRA')[iRank]);
const nRankHdr = hdrLin.slice(1).filter(l => !l[0].startsWith('ZZ') && l[iRank] !== '').length;

// OCDE / PISA (tabelas de tendência: um par média/erro-padrão por ciclo)
console.log('OCDE: PISA...');
const wbPisa = await lerXlsx(await baixar('https://stat.link/wh9d4z', 'pisa2022_vol1_tabelas_I.B1.5.xlsx', { binario: true }));
const ALIAS_PISA = { 'Türkiye': 'TUR', Korea: 'KOR', 'Czech Republic': 'CZE', 'Slovak Republic': 'SVK', 'Hong Kong (China)': 'HKG', 'Macao (China)': 'MAC', 'Chinese Taipei': 'TWN', 'Viet Nam': 'VNM', Moldova: 'MDA', Kosovo: 'XKX', 'Palestinian Authority': 'PSE', 'Brunei Darussalam': 'BRN', 'United States': 'USA', 'United Kingdom': 'GBR', 'North Macedonia': 'MKD' };
const PISA_FORA = ['Baku (Azerbaijan)', 'Ukrainian regions (18 of 27)']; // partes de país: fora do ranking de países
const normEn = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const isoPorNomeEn = new Map(Object.entries(PAISES).map(([iso, p]) => [normEn(p[2]), iso]));
function lerPISA(tabela) {
  const L = wbPisa.linhas(tabela);
  const iCab = L.findIndex(l => l.some(c => typeof c === 'string' && /^PISA \d{4}$/.test(c.trim())));
  const ciclos = [];
  L[iCab].forEach((c, i) => { const m = typeof c === 'string' && /^PISA (\d{4})$/.exec(c.trim()); if (m && L[iCab + 1][i] === 'Mean score') ciclos.push([Number(m[1]), i]); });
  const por = {}, semIso = [];
  for (const l of L.slice(iCab + 2)) {
    const nome = typeof l[0] === 'string' ? l[0].replace(/\*+$/, '').trim() : null;
    if (!nome || /average|^OECD$|^Partners$|^\d|Note|Caution|Information|Costa Rica,|For Cambodia/i.test(nome) || PISA_FORA.includes(nome)) continue;
    const iso = ALIAS_PISA[nome] ?? isoPorNomeEn.get(normEn(nome));
    if (!iso) { semIso.push(nome); continue; }
    for (const [a, i] of ciclos) if (typeof l[i] === 'number') (por[iso] ??= vazioSerie())[a - ANO0] = l[i];
  }
  if (semIso.length) throw new Error('PISA sem ISO3: ' + semIso.join(', '));
  return { por, ciclos: ciclos.map(c => c[0]) };
}

// ---------- montagem ----------
const TEMAS = [
  ['saneamento', 'Saneamento: esgoto e água'], ['renda', 'Renda, pobreza e trabalho'], ['educacao', 'Educação'],
  ['saude', 'Saúde'], ['desenvolvimento', 'Desenvolvimento humano'], ['seguranca', 'Segurança, violência e instituições'], ['conectividade', 'Conectividade'],
];
const indicadores = [];
for (const [tema, id, origem, codigo, nome, curto, unidade, sentido, casas, janela, media] of IND) {
  let por, fonte, extra = {};
  if (origem === 'wb' || origem === 'wgi') {
    console.log('Banco Mundial:', codigo);
    const r = await lerWB(codigo, origem === 'wgi');
    por = r.por; fonte = origem === 'wgi' ? fWGI(codigo) : fWB(codigo, r.nomeOriginal); fonte.atualizado = r.atualizado; fonte.nomeOriginal = r.nomeOriginal;
  } else if (origem === 'hdr') { por = lerHDR(codigo); fonte = fHDR(codigo); }
  else { const r = lerPISA(codigo); por = r.por; fonte = fPISA(codigo); extra.ciclos = r.ciclos; }

  // Média mundial: agregado oficial quando existe (WLD do Banco Mundial ou "World" do PNUD); senão média
  // ponderada pela população (pop) ou média simples dos países com dado no ano (simples).
  let mundo = vazioSerie(), metodoMedia;
  if ((media === 'wld' || media === 'hdr') && por.WLD) { mundo = por.WLD.slice(); metodoMedia = media === 'hdr' ? 'agregado mundial publicado pelo PNUD (ponderado pela população)' : 'agregado "World" publicado pelo Banco Mundial'; }
  else {
    metodoMedia = 'média simples dos países com dado no ano (cada país pesa igual)';
    for (let k = 0; k < nAnos; k++) {
      const vs = Object.entries(por).filter(([iso]) => PAISES[iso] && por[iso][k] != null).map(([, s]) => s[k]);
      mundo[k] = vs.length >= 10 ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    }
  }
  // só países (fora agregados) e só quem tem algum valor
  const v = {};
  for (const [iso, s] of Object.entries(por)) {
    if (!PAISES[iso]) continue;
    let ini = s.findIndex(x => x != null); if (ini < 0) continue;
    let fim = s.length - 1; while (s[fim] == null) fim--;
    v[iso] = [ini, ...s.slice(ini, fim + 1).map(x => arred(x, casas))];
  }
  const it = { id, tema, nome, curto, unidade, sentido, casas, janela, fonte, media: metodoMedia, mundo: mundo.map(x => arred(x, casas)), v, ...extra };
  if (id === 'idh') it.rankOficial = { ano: ANO_RANK_HDR, pos: rankHdrBR, n: nRankHdr, nota: 'classificação publicada pelo PNUD (empates e arredondamento do PNUD)' };
  indicadores.push(it);
}

const saida = {
  gerado: new Date().toISOString(),
  ano0: ANO0, ano1: ANO1,
  notas: 'v[ISO3] = [índice do primeiro ano (0 = ano0), valores ano a ano...]; null = sem dado. Posição e percentil calculados em site/js/mundo-calc.js. Ver docs/MUNDO.md.',
  paises: PAISES, temas: TEMAS, pares: C.PARES, mandatos: C.MANDATOS, indicadores,
};
await fsp.writeFile(SAIDA, JSON.stringify(saida));
console.log(`\nsite/dados/mundo.json: ${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB, ${indicadores.length} indicadores, ${Object.keys(PAISES).length} países/economias`);

// ---------- relatório: Brasil no ano mais recente e por mandato ----------
const D = C.preparar(saida);
for (const ind of D.indicadores) {
  const ano = C.anoRecenteBR(ind);
  const p = ano == null ? null : C.posicao(D, ind, ano);
  if (!p) { console.log(`  ${ind.id.padEnd(22)} sem dado do Brasil`); continue; }
  console.log(`  ${ind.id.padEnd(22)} ${String(p.v).padStart(8)} (${ano})  ${p.pos}º de ${p.n}  à frente de ${p.percentil}%  média ${C.mediaMundial(ind, ano)?.v ?? '—'}  mediana ${p.mediana}`);
}
