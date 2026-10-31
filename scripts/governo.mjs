// Indicadores sociais por mandato presidencial (1995–2026): pobreza, Bolsa Família, saneamento, educação,
// renda e trabalho. Mesmas séries e mesma regra para todos os governos.
// Uso: node scripts/governo.mjs [--forcar]
//   Baixa das fontes oficiais (cache em .cache/governo/) e escreve site/dados/governo.json.
//   Sem dependências: fetch do Node (curl de reserva) e um leitor de ZIP/ODS próprio.
//   O que não tem API (IDEB numa planilha do INEP, Síntese do IBGE em ODS) também é lido aqui;
//   o que só existe em PDF ou notícia oficial (SNIS, SINISA, ICA, saídas do Bolsa Família, PNAD 1995–1999)
//   está em CONSTANTES abaixo, com a fonte de cada número.
// Fontes, quebras de série e limitações: docs/ANALISE-GOVERNOS.md
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CACHE = path.join(RAIZ, '.cache/governo');
const SAIDA = path.join(RAIZ, 'site/dados/governo.json');
const FORCAR = process.argv.includes('--forcar');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const sh = promisify(execFile);
fs.mkdirSync(CACHE, { recursive: true });

// ---------- download com cache ----------
async function baixar(url, arquivo, binario = false) {
  const p = path.join(CACHE, arquivo);
  if (!FORCAR && fs.existsSync(p) && fs.statSync(p).size > 50) return binario ? fsp.readFile(p) : fsp.readFile(p, 'utf8');
  let buf;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(180_000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    // Reserva: curl (o antivírus desta máquina reassina o TLS e às vezes só o curl passa).
    const { stdout } = await sh('curl', ['-sS', '-f', '-L', '--ssl-no-revoke', '-m', '300', '-A', UA, url], { encoding: 'buffer', maxBuffer: 1 << 28 });
    buf = stdout;
  }
  await fsp.writeFile(p, buf);
  return binario ? buf : buf.toString('utf8');
}
const json = async (url, arq) => JSON.parse(await baixar(url, arq));

// ---------- ZIP em memória e ODS (planilha do LibreOffice) ----------
function zip(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('ZIP sem EOCD');
  const total = buf.readUInt16LE(e + 10), cdOff = buf.readUInt32LE(e + 16);
  const m = new Map();
  for (let p = cdOff, k = 0; k < total; k++) {
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nl);
    m.set(nome, () => {
      const ini = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const d = buf.subarray(ini, ini + comp);
      return metodo === 8 ? zlib.inflateRawSync(d) : d;
    });
    p += 46 + nl + xl + cl;
  }
  return m;
}
const desesc = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
// Lê as abas de um .ods: { nomeDaAba: [[célula, ...], ...] } (número quando a célula é numérica).
function ods(buf) {
  const xml = zip(buf).get('content.xml')().toString('utf8');
  const abas = {};
  for (const t of xml.matchAll(/<table:table table:name="([^"]*)"[^>]*>([\s\S]*?)<\/table:table>/g)) {
    const linhas = [];
    for (const r of t[2].matchAll(/<table:table-row[^>]*?(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const cel = [];
      for (const c of (r[1] || '').matchAll(/<table:(?:covered-)?table-cell([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
        const rep = Math.min(50, +(/number-columns-repeated="(\d+)"/.exec(c[1])?.[1] || 1));
        const v = /office:value="([^"]*)"/.exec(c[1]);
        const val = v ? +v[1] : desesc((c[2] || '').replace(/<\/text:p>\s*<text:p[^>]*>/g, ' ')).trim();
        for (let i = 0; i < rep; i++) cel.push(val);
      }
      while (cel.length && cel.at(-1) === '') cel.pop();
      linhas.push(cel);
    }
    abas[desesc(t[1])] = linhas;
  }
  return abas;
}

// ---------- utilidades ----------
const r = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const ordenar = pts => pts.filter(p => p[1] != null && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
const deMapa = (m, d = 2, f = x => x) => ordenar(Object.entries(m).map(([a, v]) => [+a, r(f(v), d)]));

// ---------- fontes automáticas ----------
// IPEA (Ipeadata): séries de Souza e Hecksher (2025), PNAD 1995–2011 ajustada à PNAD Contínua 2012–2025; Bolsa Família (MDS via Portal da Transparência).
async function ipea(cod) {
  const j = await json(`http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='${cod}')`, `ipea_${cod}.json`);
  const m = {};
  for (const v of j.value) if (!v.NIVNOME || v.NIVNOME === 'Brasil') m[+v.VALDATA.slice(0, 4)] = +v.VALVALOR;
  return m;
}
// Banco Mundial: WDI (população, desemprego OIT, PIB) e PIP (pobreza, PPC 2017).
async function wdi(ind) {
  const j = await json(`https://api.worldbank.org/v2/country/BRA/indicator/${ind}?format=json&per_page=100&date=1994:2026`, `wdi_${ind}.json`);
  return Object.fromEntries(j[1].filter(x => x.value != null).map(x => [+x.date, x.value]));
}
async function pip(linha) {
  const j = await json(`https://api.worldbank.org/pip/v1/pip?country=BRA&year=all&povline=${linha}&ppp_version=2017&fill_gaps=false&format=json`, `pip_${linha}.json`);
  return Object.fromEntries(j.filter(x => x.reporting_year >= 1994).map(x => [x.reporting_year, 100 * x.headcount]));
}
// IBGE SIDRA: devolve as linhas (sem cabeçalho).
const sidra = async (q, arq) => (await json('https://apisidra.ibge.gov.br/values/' + q, `sidra_${arq}.json`)).slice(1);
const somaPorAno = linhas => { const m = {}; for (const l of linhas) { const v = +l.V; if (Number.isFinite(v)) m[+l.D3C] = (m[+l.D3C] || 0) + v; } return m; };

console.log('Baixando séries…');
const [pobre300, pobre830, gini, renda, famPBF, valPBF] = await Promise.all(['PNADS_PERCPOBRE300', 'PNADS_PERCPOBRE830', 'PNADS_GINI', 'PNADS_RENDAMEDIA', 'FAM_PBF', 'VAL_PBF'].map(ipea));
const [pop, desempOIT, pib] = await Promise.all(['SP.POP.TOTL', 'SL.UEM.TOTL.ZS', 'NY.GDP.MKTP.KD.ZG'].map(wdi));
const [pip215, pip685] = await Promise.all([pip(2.15), pip(6.85)]);

const [s7113, s271, s1955, s1956, s6731, s6735, s7192, s4562, s1737] = await Promise.all([
  sidra('t/7113/n1/all/v/10267/p/all/c2/6794/c58/2795', '7113'),
  sidra('t/271/n1/all/v/121/p/all/c1/0/c2/0/c59/all/c58/allxt', '271'),
  sidra('t/1955/n1/all/v/1000096/p/all/c12058/0/c1/0/c61/1033,1035', '1955'),
  sidra('t/1956/n1/all/v/1000096/p/all/c12058/0/c1/0/c7173/99663,9490', '1956'),
  sidra('t/6731/n1/all/v/9784/p/all/c1/6795/c825/46285', '6731'),
  sidra('t/6735/n1/all/v/9988/p/all/c1/6795/c11558/46290', '6735'),
  sidra('t/7192/n1/all/v/9988/p/all/c1/6795/c11558/47930,47931', '7192'),
  sidra('t/4562/n1/all/v/4099/p/all', '4562'),
  sidra('t/1737/n1/all/v/2266,2265/p/all', '1737')
]);

// Analfabetismo 15+ na PNAD anual (SIDRA 271): não alfabetizadas ÷ total, somando os grupos de 15 anos ou mais.
const G15 = ['1143', '1144', '1145', '3299', '3300', '3301', '3302'];
const analfPNAD = {};
{
  const t = {};
  for (const l of s271) { if (!G15.includes(l.D7C)) continue; const v = +l.V; if (!Number.isFinite(v)) continue; const a = +l.D3C; t[a] ??= { tot: 0, an: 0 }; if (l.D6C === '93024') t[a].tot += v; if (l.D6C === '1024') t[a].an += v; }
  for (const [a, x] of Object.entries(t)) if (x.tot) analfPNAD[a] = 100 * x.an / x.tot;
}
// Esgoto PNAD: rede coletora + fossa séptica ligada à rede (a SIDRA só separa a fossa ligada desde 2009).
const esgPNAD = {};
{ const t = {}; for (const l of s1956) { const v = +l.V; if (Number.isFinite(v)) (t[+l.D3C] ??= []).push([l.D6C, v]); } for (const [a, v] of Object.entries(t)) if (v.length === 2) esgPNAD[a] = v[0][1] + v[1][1]; }

// IPCA: número-índice de dezembro (e o último mês) e variação em 12 meses em dezembro.
const ipcaIdx = {}, ipcaAno = {};
let ipcaUlt = null;
for (const l of s1737) {
  const v = +l.V; if (!Number.isFinite(v)) continue;
  if (l.D2C === '2266') { if (l.D3C.endsWith('12')) ipcaIdx[+l.D3C.slice(0, 4)] = v; if (!ipcaUlt || l.D3C > ipcaUlt.mes) ipcaUlt = { mes: l.D3C, v }; }
  if (l.D2C === '2265' && l.D3C.endsWith('12')) ipcaAno[+l.D3C.slice(0, 4)] = v;
}
const mesUlt = ipcaUlt.mes.slice(4) + '/' + ipcaUlt.mes.slice(0, 4);

// IBGE, Síntese de Indicadores Sociais 2025 (planilhas ODS no FTP): tabelas 2.18 (pobreza), 2.20 (sem benefícios), 2.13 (Gini).
const URL_SIS = 'https://ftp.ibge.gov.br/Indicadores_Sociais/Sintese_de_Indicadores_Sociais/Sintese_de_Indicadores_Sociais_2025/Tabelas/ods/2_Distribuicao_Renda_ods.zip';
const sisZip = zip(await baixar(URL_SIS, 'sis2025_renda_ods.zip', true));
function sisBrasil(prefixo) {
  const nome = [...sisZip.keys()].find(k => k.startsWith(prefixo));
  const abas = ods(sisZip.get(nome)());
  const out = {};
  for (const [aba, linhas] of Object.entries(abas)) {
    if (!/^\d{4}$/.test(aba.trim())) continue; // abas "2024", "2023"… (as de CV ficam de fora)
    const br = linhas.find(l => l[0] === 'Brasil');
    if (br) out[+aba] = br.slice(1);
  }
  return out;
}
const sis218 = sisBrasil('Tabela 2.18'), sis220 = sisBrasil('Tabela 2.20'), sis213 = sisBrasil('Tabela 2.13');
// Colunas da 2.18/2.20: [população (mil), <US$2,15, <US$3,65, <US$6,85, …]
const col = (t, i) => Object.fromEntries(Object.entries(t).map(([a, v]) => [a, v[i]]));

// INEP: IDEB do Brasil (planilha oficial da divulgação de 2025, em ODS dentro do ZIP).
const URL_IDEB = 'https://download.inep.gov.br/ideb/resultados/divulgacao_brasil_ideb_2025.zip';
const idebZip = zip(await baixar(URL_IDEB, 'divulgacao_brasil_ideb_2025.zip', true));
const idebAbas = ods(idebZip.get([...idebZip.keys()].find(k => k.endsWith('.ods')))());
function ideb(aba) {
  const so = s => s.replace(/[\s_]+/g, '');
  const linhas = idebAbas[Object.keys(idebAbas).find(k => so(k).includes(so(aba)))];
  const cab = linhas.find(l => l.some(c => typeof c === 'string' && /^IDEB\s*\d{4}/.test(c)));
  const total = linhas.find(l => l[0] === 'Brasil' && l[1] === 'Total') || linhas.find(l => l[1] === 'Total');
  const m = {};
  cab.forEach((c, i) => { const a = typeof c === 'string' && /^IDEB\s*(\d{4})/.exec(c); if (a && Number.isFinite(total[i])) m[+a[1]] = total[i]; });
  return m;
}
const idebAI = ideb('Anos Iniciais'), idebAF = ideb('Anos Finais'), idebEM = ideb('(EM)');

// ---------- constantes (fontes sem API; ver docs/ANALISE-GOVERNOS.md) ----------
// PNAD 1995–1999 (antes da SIDRA): volumes Brasil de cada ano (analfabetismo, tab. 3.1) e Síntese 2009, tab. 1 (domicílios).
const ANALF_PNAD_ANTIGA = { 1995: 15.57, 1996: 14.66, 1997: 14.70, 1998: 13.78, 1999: 13.33 };
const AGUA_PNAD_ANTIGA = { 1995: 76.3, 1996: 77.7, 1997: 77.7, 1998: 78.8, 1999: 79.8 };
// Rede coletora + fossa ligada à rede, % dos domicílios (Síntese 2009, tab. 1; 2001–2008 sem a área rural do Norte).
const ESG_PNAD_ANTIGA = { 1995: 48.4, 1996: 51.1, 1997: 50.8, 1998: 52.7, 1999: 52.8, 2001: 54.6, 2002: 56.0, 2003: 56.6, 2004: 56.4, 2005: 56.4, 2006: 57.3, 2007: 59.0, 2008: 59.3 };
// SNIS (IN055 e IN056) e SINISA (IAG0001 e IES0001), % da população total atendida por rede pública.
// 2008, 2017, 2018: Diagnóstico AE 2018 (quadro 16.x e cap. 6). 2021, 2022: Diagnóstico AE 2022 (2021 = 2022 − variação informada).
// 2019 e 2020: balanços do SNIS divulgados pelo MDR (83,7%/54,1% e 84,1%/55,0%). 2023: SINISA 2024, relatórios de água e esgoto.
const SNIS_AGUA = { 2008: 81.2, 2017: 83.5, 2018: 83.6, 2019: 83.7, 2020: 84.1, 2021: 84.2, 2022: 84.9 };
const SNIS_ESG = { 2008: 43.2, 2017: 52.4, 2018: 53.2, 2019: 54.1, 2020: 55.0, 2021: 55.8, 2022: 56.0 };
const SINISA_AGUA = { 2023: 83.1 }, SINISA_ESG = { 2023: 59.7 };
// Indicador Criança Alfabetizada (INEP): % de crianças do 2º ano alfabetizadas; metas do Compromisso Nacional.
const ICA = { 2023: 56.0, 2024: 59.2, 2025: 66.0 };
const ICA_META = { 2024: 60, 2025: 64, 2026: 67, 2030: 80 };
// Bolsa Família em out/2026 (último mês divulgado; Agência Brasil com dados do MDS, 20/10/2026).
const PBF_2026 = { familias: 19.3e6, valorMedio: 782.92, mes: 'out/2026' };
const PBF_DEZ_2025 = 691.37; // valor médio em dez/2025 (Secom/MDS, 10/12/2025)
// Saídas do Bolsa Família por aumento de renda (MDS). Não existe série comparável antes de 2023.
const SAIDAS_PBF = [
  { periodo: '2023', valor: 590e3, texto: 'famílias que superaram meio salário mínimo por pessoa e saíram do programa', fonte: 'MDS, 22/01/2025', url: 'https://www.gov.br/mds/pt-br/noticias-e-conteudos/desenvolvimento-social/noticias-desenvolvimento-social/mais-de-1-3-milhao-de-familias-deixaram-o-bolsa-familia-em-2024-apos-melhorarem-de-renda' },
  { periodo: '2024', valor: 1.3e6, texto: 'famílias que superaram meio salário mínimo por pessoa e saíram do programa', fonte: 'MDS, 22/01/2025', url: 'https://www.gov.br/mds/pt-br/noticias-e-conteudos/desenvolvimento-social/noticias-desenvolvimento-social/mais-de-1-3-milhao-de-familias-deixaram-o-bolsa-familia-em-2024-apos-melhorarem-de-renda' },
  { periodo: 'jan–out/2025', valor: 2069776, texto: 'saídas: 1.318.214 por aumento da renda do domicílio, 726.799 por fim do prazo da regra de proteção e 24.763 por desligamento voluntário', fonte: 'MDS (Senarc), 30/10/2025', url: 'https://www.gov.br/mds/pt-br/noticias-e-conteudos/desenvolvimento-social/noticias-desenvolvimento-social/bolsa-familia-2-milhoes-de-familias-deixam-o-programa-apos-aumento-de-renda-em-2025' },
  { periodo: 'mar/2023–abr/2026', valor: 5.1e6, texto: 'lares que deixaram de precisar do benefício (acumulado, segundo o MDS)', fonte: 'MDS, 27/05/2026', url: 'https://www.gov.br/mds/pt-br/noticias-e-conteudos/desenvolvimento-social/noticias-desenvolvimento-social/mais-de-5-1-milhoes-de-familias-saem-do-bolsa-familia-por-aumento-de-renda' }
];
const ENTRADAS_PROTECAO = { 2023: 2.2e6, 2024: 2.2e6 }; // famílias que entraram na regra de proteção (MDS, 22/01/2025)

// ---------- montagem ----------
const F = {
  ipea: { nome: 'IPEA, Ipeadata: Souza e Hecksher (2025), PNAD 1995–2011 ajustada à PNAD Contínua 2012–2025', url: 'http://www.ipeadata.gov.br/' },
  sis: { nome: 'IBGE, Síntese de Indicadores Sociais 2025, tabela 2.18 (PNAD Contínua)', url: URL_SIS },
  sis220: { nome: 'IBGE, Síntese de Indicadores Sociais 2025, tabelas 2.18 e 2.20 (com e sem benefícios de programas sociais)', url: URL_SIS },
  pip: { nome: 'Banco Mundial, Poverty and Inequality Platform (PIP), PPC 2017', url: 'https://pip.worldbank.org/' },
  pbf: { nome: 'MDS via Portal da Transparência (Ipeadata, séries FAM_PBF e VAL_PBF, posição de dezembro)', url: 'http://www.ipeadata.gov.br/ExibeSerie.aspx?serid=290547434' },
  sidra: (t, desc) => ({ nome: `IBGE, SIDRA, tabela ${t} (${desc})`, url: `https://sidra.ibge.gov.br/tabela/${t}` }),
  snis: { nome: 'Ministério das Cidades: SNIS (Diagnósticos de Água e Esgotos 2018 e 2022; 2019 e 2020 pelos balanços divulgados do SNIS) e SINISA 2024 (ano de referência 2023)', url: 'https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/sinisa/resultados-sinisa' },
  ideb: { nome: 'INEP, IDEB: resultados do Brasil 1995–2025 (divulgação de 2025)', url: URL_IDEB },
  ica: { nome: 'INEP/MEC, Indicador Criança Alfabetizada (2023–2025)', url: 'https://www.gov.br/inep/pt-br/centrais-de-conteudo/noticias/avaliacao-da-alfabetizacao/brasil-e-20-unidades-da-federacao-alcancam-meta-de-alfabetizacao' },
  wdi: ind => ({ nome: `Banco Mundial, World Development Indicators (${ind})`, url: `https://data.worldbank.org/indicator/${ind}?locations=BR` })
};
const ANO = new Date().getFullYear();

const series = {};
const S = (k, o) => { series[k] = { ...o, fonte: { ...o.fonte, ano: o.fonte.ano ?? ANO } }; };

// --- Pobreza ---
const ODS11 = { valor: 0, ano: 2030, nome: 'ODS 1.1 (ONU): erradicar a extrema pobreza até 2030' };
const virg = (x, d = 1) => x.toFixed(d).replace('.', ',');
const meta12 = (serie, base = 2015) => ({ valor: r(serie[base] / 2, 2), ano: 2030, base, nome: `ODS 1.2 (ONU): reduzir pelo menos à metade, até 2030, a proporção de pobres de ${base} (${virg(serie[base])}% → ${virg(serie[base] / 2)}%)` });
S('extrema_ipea', { nome: 'Extrema pobreza: menos de US$ 3,00 PPC por pessoa por dia', curto: 'Extrema pobreza (US$ 3,00)', unidade: '%', casas: 1, sentido: -1, fonte: { ...F.ipea, serie: 'PNADS_PERCPOBRE300' }, pontos: deMapa(pobre300), meta: ODS11, quebra: 'Sem PNAD em 2000 e 2010. O IPEA multiplica a PNAD antiga (até 2011) por um fator que a iguala à PNAD Contínua em 2012, para a série não ter degrau.', pessoas: true });
S('pobreza_ipea', { nome: 'Pobreza: menos de US$ 8,30 PPC por pessoa por dia', curto: 'Pobreza (US$ 8,30)', unidade: '%', casas: 1, sentido: -1, fonte: { ...F.ipea, serie: 'PNADS_PERCPOBRE830' }, pontos: deMapa(pobre830), meta: meta12(pobre830), quebra: 'Sem PNAD em 2000 e 2010. PNAD antiga ajustada à PNAD Contínua pelo IPEA (fator de 2012).', pessoas: true });
S('extrema_ibge', { nome: 'Extrema pobreza (IBGE): menos de US$ 2,15 PPC 2017 por dia', curto: 'Extrema pobreza IBGE (US$ 2,15)', unidade: '%', casas: 1, sentido: -1, fonte: F.sis, pontos: deMapa(col(sis218, 1)), meta: ODS11, pessoas: true });
S('pobreza_ibge', { nome: 'Pobreza (IBGE): menos de US$ 6,85 PPC 2017 por dia', curto: 'Pobreza IBGE (US$ 6,85)', unidade: '%', casas: 1, sentido: -1, fonte: F.sis, pontos: deMapa(col(sis218, 3)), meta: meta12(col(sis218, 3)), pessoas: true });
S('extrema_bm', { nome: 'Extrema pobreza (Banco Mundial): menos de US$ 2,15 PPC 2017', curto: 'Extrema pobreza BM (US$ 2,15)', unidade: '%', casas: 1, sentido: -1, fonte: F.pip, pontos: deMapa(pip215), quebras: [{ ano: 2012, texto: 'PNAD → PNAD Contínua (sem ajuste)' }] });
S('pobreza_bm', { nome: 'Pobreza (Banco Mundial): menos de US$ 6,85 PPC 2017', curto: 'Pobreza BM (US$ 6,85)', unidade: '%', casas: 1, sentido: -1, fonte: F.pip, pontos: deMapa(pip685), quebras: [{ ano: 2012, texto: 'PNAD → PNAD Contínua (sem ajuste)' }] });
S('extrema_sem_beneficio', { nome: 'Extrema pobreza se não houvesse os benefícios sociais (US$ 2,15)', curto: 'Extrema pobreza sem benefícios', unidade: '%', casas: 1, sentido: -1, fonte: F.sis220, pontos: deMapa(col(sis220, 1)), pessoas: true });
S('pop', { nome: 'População residente', unidade: 'pessoas', casas: 0, sentido: 0, fonte: F.wdi('SP.POP.TOTL'), pontos: deMapa(pop, 0) });

// --- Bolsa Família ---
const famPts = deMapa(famPBF, 0);
famPts.push([2026, PBF_2026.familias]);
S('pbf_familias', { nome: 'Famílias no Bolsa Família (posição de dezembro)', curto: 'Famílias no Bolsa Família', unidade: 'familias', casas: 0, sentido: 0, fonte: F.pbf, pontos: famPts,
  marcos: [{ x: 2021.85, texto: 'nov/2021: o programa vira Auxílio Brasil' }, { x: 2023.2, texto: 'mar/2023: volta o Bolsa Família, com regra de proteção' }],
  quebra: 'Criado em out/2003 (MP 132, Lei 10.836/2004), juntando Bolsa Escola, Bolsa Alimentação, Auxílio-Gás e Cartão Alimentação. A série começa em dez/2004. 2026 = ' + PBF_2026.mes + ' (MDS via Agência Brasil). Exclui benefícios suspensos.' });
const valReal = {};
for (const [a, v] of Object.entries(valPBF)) if (famPBF[a] && ipcaIdx[a]) valReal[a] = 1000 * v / famPBF[a] * ipcaUlt.v / ipcaIdx[a];
// dez/2025: valor médio R$ 691,37 (Secom, 10/12/2025), pois a série do Ipeadata ainda não tem o valor pago em 2025.
if (!valReal[2025] && ipcaIdx[2025]) valReal[2025] = PBF_DEZ_2025 * ipcaUlt.v / ipcaIdx[2025];
const valPts = deMapa(valReal, 0);
valPts.push([2026, r(PBF_2026.valorMedio, 0)]); // out/2026, praticamente a preços do último IPCA
S('pbf_valor_real', { nome: `Benefício médio por família em dezembro, em R$ de ${mesUlt} (corrigido pelo IPCA)`, curto: 'Benefício médio (R$ de hoje)', unidade: 'R$', casas: 0, sentido: 0, fonte: { nome: F.pbf.nome + ' e IBGE (IPCA, SIDRA 1737)', url: F.pbf.url }, pontos: valPts,
  quebra: 'Valor total pago em dezembro ÷ famílias, corrigido pelo IPCA até ' + mesUlt + '. 2025 = valor médio de dez/2025 divulgado pela Secom (R$ 691,37); 2026 = valor médio de ' + PBF_2026.mes + ' (nominal). Cautela com 2022: o piso pago era de R$ 600, mas a série do Portal registra cerca de R$ 381 por família em dezembro, porque parece não incluir o complemento extraordinário da Emenda Constitucional 123/2022.' });

// --- Saneamento ---
const META_AGUA = { valor: 99, ano: 2033, base: 2020, nome: 'Marco Legal do Saneamento (Lei 14.026/2020): 99% da população com água potável até 31/12/2033' };
const META_ESG = { valor: 90, ano: 2033, base: 2020, nome: 'Marco Legal do Saneamento (Lei 14.026/2020): 90% da população com coleta e tratamento de esgoto até 31/12/2033' };
const aguaPts = ordenar([
  ...Object.entries(AGUA_PNAD_ANTIGA).map(([a, v]) => [+a, v]),
  ...Object.entries(somaPorAno(s1955)).map(([a, v]) => [+a, r(v, 2)]),
  ...s6731.map(l => [+l.D3C, +l.V])
]);
S('agua_domicilios', { nome: 'Domicílios com água da rede geral (PNAD e PNAD Contínua)', curto: 'Água da rede (domicílios)', unidade: '%', casas: 1, sentido: 1, fonte: { nome: 'IBGE: PNAD (Síntese 2009, tab. 1, para 1995–1999; SIDRA 1955 para 2001–2015) e PNAD Contínua (SIDRA 6731)', url: 'https://sidra.ibge.gov.br/tabela/6731' }, pontos: aguaPts, meta: META_AGUA,
  quebras: [{ ano: 2004, texto: 'PNAD passa a incluir a área rural do Norte' }, { ano: 2016, texto: 'PNAD → PNAD Contínua' }] });
const esgPts = ordenar([
  ...Object.entries(ESG_PNAD_ANTIGA).map(([a, v]) => [+a, v]),
  ...Object.entries(esgPNAD).filter(([a]) => +a >= 2009).map(([a, v]) => [+a, r(v, 2)]),
  ...s6735.map(l => [+l.D3C, +l.V]),
  ...Object.entries(somaPorAno(s7192)).map(([a, v]) => [+a, r(v, 1)])
]);
S('esgoto_domicilios', { nome: 'Domicílios com esgoto na rede coletora (ou fossa ligada à rede) — PNAD e PNAD Contínua', curto: 'Esgoto na rede (domicílios)', unidade: '%', casas: 1, sentido: 1, fonte: { nome: 'IBGE: PNAD (Síntese 2009, tab. 1, para 1995–2008; SIDRA 1956 para 2009–2015) e PNAD Contínua (SIDRA 6735 e 7192)', url: 'https://sidra.ibge.gov.br/tabela/7192' }, pontos: esgPts, meta: META_ESG,
  quebras: [{ ano: 2009, texto: 'PNAD passa a ter a área rural do Norte nesta série' }, { ano: 2016, texto: 'PNAD → PNAD Contínua' }, { ano: 2019, texto: 'PNAD Contínua muda a classificação do esgoto (SIDRA 6735 até 2018, 7192 desde 2019)' }],
  quebra: 'Coleta por rede não é o mesmo que tratamento: a meta de 2033 pede coleta E tratamento, então esta série mede só a primeira parte.' });
S('agua_snis', { nome: 'População atendida com rede de água (SNIS IN055; SINISA IAG0001 em 2023)', curto: 'Água (SNIS/SINISA)', unidade: '%', casas: 1, sentido: 1, fonte: F.snis, pontos: ordenar([...Object.entries(SNIS_AGUA), ...Object.entries(SINISA_AGUA)].map(([a, v]) => [+a, v])), meta: META_AGUA,
  quebras: [{ ano: 2023, texto: 'SNIS → SINISA (outra base de cálculo e população do Censo 2022)' }],
  quebra: 'Informado pelos prestadores; a amostra cresceu muito com o tempo (esgoto: 1.468 municípios em 2008, 5.150 em 2022). 2009–2016 não incluídos aqui (só em PDFs antigos fora do ar).' });
S('esgoto_snis', { nome: 'População atendida com rede coletora de esgoto (SNIS IN056; SINISA IES0001 em 2023)', curto: 'Esgoto (SNIS/SINISA)', unidade: '%', casas: 1, sentido: 1, fonte: F.snis, pontos: ordenar([...Object.entries(SNIS_ESG), ...Object.entries(SINISA_ESG)].map(([a, v]) => [+a, v])), meta: META_ESG,
  quebras: [{ ano: 2023, texto: 'SNIS → SINISA (outra base de cálculo e população do Censo 2022)' }],
  quebra: 'Mede coleta, não tratamento. Amostra do SNIS mudou muito com o tempo.' });

// --- Educação ---
const PNE7 = (v, etapa) => ({ valor: v, ano: 2021, nome: `PNE 2014–2024, meta 7: IDEB ${v.toFixed(1).replace('.', ',')} ${etapa} em 2021` });
const notaIdeb = 'Provas a cada 2 anos (anos sem prova ficam sem ponto). 2021 foi afetado pela pandemia (aprovação mais alta e menos alunos na prova).';
S('ideb_ai', { nome: 'IDEB — anos iniciais do fundamental (1º ao 5º ano)', curto: 'IDEB anos iniciais', unidade: 'nota', casas: 1, sentido: 1, fonte: F.ideb, pontos: deMapa(idebAI, 1), meta: PNE7(6.0, 'nos anos iniciais'), quebra: notaIdeb });
S('ideb_af', { nome: 'IDEB — anos finais do fundamental (6º ao 9º ano)', curto: 'IDEB anos finais', unidade: 'nota', casas: 1, sentido: 1, fonte: F.ideb, pontos: deMapa(idebAF, 1), meta: PNE7(5.5, 'nos anos finais'), quebra: notaIdeb });
S('ideb_em', { nome: 'IDEB — ensino médio', curto: 'IDEB ensino médio', unidade: 'nota', casas: 1, sentido: 1, fonte: F.ideb, pontos: deMapa(idebEM, 1), meta: PNE7(5.2, 'no ensino médio'), quebra: notaIdeb });
const analfPts = ordenar([
  ...Object.entries(ANALF_PNAD_ANTIGA).map(([a, v]) => [+a, v]),
  ...Object.entries(analfPNAD).map(([a, v]) => [+a, r(v, 2)]),
  ...s7113.map(l => [+l.D3C, +l.V])
]);
S('analfabetismo', { nome: 'Taxa de analfabetismo, 15 anos ou mais', curto: 'Analfabetismo (15+)', unidade: '%', casas: 1, sentido: -1, fonte: { nome: 'IBGE: PNAD (volumes 1995–1999; SIDRA 271 para 2001–2015) e PNAD Contínua (SIDRA 7113)', url: 'https://sidra.ibge.gov.br/tabela/7113' }, pontos: analfPts,
  meta: { valor: 0, ano: 2024, nome: 'PNE 2014–2024, meta 9: erradicar o analfabetismo absoluto até 2024 (meta intermediária: 6,5% em 2015)', intermediarias: [[2015, 6.5]] },
  quebras: [{ ano: 2004, texto: 'PNAD passa a incluir a área rural do Norte' }, { ano: 2016, texto: 'PNAD → PNAD Contínua (2016: 7,2% na PNAD antiga × 6,7% na Contínua)' }],
  quebra: 'Sem dado em 2000, 2010 (anos de Censo) e 2020–2021 (a PNAD Contínua não fez o módulo de educação na pandemia).' });
S('crianca_alfabetizada', { nome: 'Crianças alfabetizadas ao fim do 2º ano (Indicador Criança Alfabetizada)', curto: 'Crianças alfabetizadas (2º ano)', unidade: '%', casas: 1, sentido: 1, fonte: F.ica, pontos: deMapa(ICA, 1),
  meta: { valor: 80, ano: 2030, base: 2023, nome: 'Compromisso Nacional Criança Alfabetizada: 80% até 2030 (metas anuais: 60% em 2024, 64% em 2025, 67% em 2026)', intermediarias: Object.entries(ICA_META).map(([a, v]) => [+a, v]) },
  quebra: 'Indicador criado em 2023 (padrão de 743 pontos na escala do Saeb, Pesquisa Alfabetiza Brasil). Antes, a Avaliação Nacional da Alfabetização (2013, 2014, 2016) usava outra escala: não dá para comparar com governos anteriores.' });

// --- Renda e trabalho ---
S('renda_media', { nome: 'Renda domiciliar média por pessoa (todas as fontes), em R$ de 2025', curto: 'Renda média por pessoa', unidade: 'R$', casas: 0, sentido: 1, fonte: { ...F.ipea, serie: 'PNADS_RENDAMEDIA' }, pontos: deMapa(renda, 0), quebra: 'Sem PNAD em 2000 e 2010. PNAD antiga ajustada à PNAD Contínua pelo IPEA.' });
S('gini', { nome: 'Desigualdade de renda (índice de Gini, 0 a 1)', curto: 'Gini', unidade: 'indice', casas: 3, sentido: -1, fonte: { ...F.ipea, serie: 'PNADS_GINI' }, pontos: deMapa(gini, 4, x => x / 100), quebra: 'Sem PNAD em 2000 e 2010. PNAD antiga ajustada à PNAD Contínua pelo IPEA.' });
S('desemprego_oit', { nome: 'Desemprego (estimativa da OIT, série contínua)', curto: 'Desemprego (OIT)', unidade: '%', casas: 1, sentido: -1, fonte: F.wdi('SL.UEM.TOTL.ZS'), pontos: deMapa(desempOIT, 2), quebra: 'Estimativa modelada pela OIT a partir das pesquisas do IBGE, para ter uma série única desde 1995.' });
S('desemprego_pnadc', { nome: 'Desemprego, média do ano (PNAD Contínua)', curto: 'Desemprego (PNAD Contínua)', unidade: '%', casas: 1, sentido: -1, fonte: F.sidra(4562, 'taxa de desocupação, 14 anos ou mais, média anual'), pontos: s4562.map(l => [+l.D3C, +l.V]) });
S('ipca', { nome: 'Inflação do ano (IPCA, dezembro a dezembro)', curto: 'Inflação (IPCA)', unidade: '%', casas: 1, sentido: 0, fonte: F.sidra(1737, 'IPCA, variação em 12 meses'), pontos: deMapa(ipcaAno, 2).filter(p => p[0] >= 1995) });
S('pib', { nome: 'Crescimento do PIB no ano', curto: 'PIB (crescimento)', unidade: '%', casas: 1, sentido: 0, fonte: F.wdi('NY.GDP.MKTP.KD.ZG'), pontos: deMapa(pib, 2).filter(p => p[0] >= 1995) });

const periodos = [
  { id: 'fhc1', nome: 'FHC 1', titular: 'Fernando Henrique Cardoso', ini: 1995, fim: 1998 },
  { id: 'fhc2', nome: 'FHC 2', titular: 'Fernando Henrique Cardoso', ini: 1999, fim: 2002 },
  { id: 'lula1', nome: 'Lula 1', titular: 'Luiz Inácio Lula da Silva', ini: 2003, fim: 2006 },
  { id: 'lula2', nome: 'Lula 2', titular: 'Luiz Inácio Lula da Silva', ini: 2007, fim: 2010 },
  { id: 'dilma1', nome: 'Dilma 1', titular: 'Dilma Rousseff', ini: 2011, fim: 2014 },
  { id: 'dilma2temer', nome: 'Dilma 2 + Temer', titular: 'Dilma Rousseff e Michel Temer', ini: 2015, fim: 2018, marcos: [{ x: 2016.66, data: '31/08/2016', texto: 'Michel Temer assume após o impeachment de Dilma Rousseff' }] },
  { id: 'bolsonaro', nome: 'Bolsonaro', titular: 'Jair Bolsonaro', ini: 2019, fim: 2022 },
  { id: 'lula3', nome: 'Lula 3', titular: 'Luiz Inácio Lula da Silva', ini: 2023, fim: 2026, parcial: true }
];

const fatores = [
  { ano: 1999, texto: 'Desvalorização do real e crise cambial.' },
  { ano: 2001, texto: 'Racionamento de energia. Criados o Bolsa Escola e o Bolsa Alimentação federais.' },
  { ano: 2002, texto: 'Inflação de 12,5% e crise de confiança no ano eleitoral.' },
  { ano: 2003, texto: 'Out/2003: criado o Bolsa Família, que junta os programas anteriores.' },
  { ano: 2008, texto: 'Crise financeira mundial (2008–2009).' },
  { ano: 2014, texto: 'Início da recessão de 2014–2016; inflação de 10,7% em 2015.' },
  { ano: 2016, texto: '31/08/2016: Michel Temer assume a Presidência.' },
  { ano: 2020, texto: 'Pandemia. Auxílio emergencial (2020–2021) derruba a pobreza em 2020; ela volta a subir em 2021, com o fim do auxílio e inflação de 10,1%.' },
  { ano: 2021, texto: 'Nov/2021: Bolsa Família vira Auxílio Brasil.' },
  { ano: 2022, texto: 'Auxílio Brasil sobe para mínimo de R$ 600 em ago/2022 e o número de famílias passa de 14 para 21 milhões. Censo 2022 corrige a população para baixo (afeta o SNIS de 2022).' },
  { ano: 2023, texto: 'Mar/2023: volta o Bolsa Família (mínimo de R$ 600 + R$ 150 por criança), com revisão do cadastro ("pente-fino") e a regra de proteção. SNIS é substituído pelo SINISA.' },
  { ano: 2026, texto: 'Out/2026: benefícios reajustados em 15,04% (mínimo de R$ 691).' }
];

const notas = [
  'Mesma regra para todos: a variação de cada governo é o valor do último ano do mandato menos o valor do último ano do mandato anterior. Ano sem dado (2000, 2010, provas a cada 2 anos) é estimado por interpolação linear entre os vizinhos e marcado.',
  'Quando a série muda de método no meio do mandato (quebra), o salto do ano da troca não entra na conta: somam-se só as variações dentro de cada método.',
  'Ritmo anual = variação ÷ número de anos. Lula 3 está em curso: a conta vai até o último ano com dado.',
  '"Suficiente" é medido contra metas oficiais (ODS da ONU, Marco Legal do Saneamento, PNE, Compromisso Criança Alfabetizada), nunca por opinião. Projeção = reta simples no ritmo indicado; não é previsão.',
  'Os números descrevem o que aconteceu em cada período; não dizem quanto se deve a cada governo, à economia mundial, a estados e municípios ou a decisões anteriores.'
];

const out = {
  gerado: new Date().toLocaleDateString('sv-SE'),
  ipcaReferencia: mesUlt,
  periodos, series, fatores, notas,
  bolsaFamilia: { saidas: SAIDAS_PBF, entradasProtecao: ENTRADAS_PROTECAO, ultimo: PBF_2026 }
};
await fsp.writeFile(SAIDA, JSON.stringify(out));
console.log('ok:', path.relative(RAIZ, SAIDA), (fs.statSync(SAIDA).size / 1024).toFixed(1), 'kB ·', Object.keys(series).length, 'séries');
for (const [k, s] of Object.entries(series)) console.log(' ', k.padEnd(22), s.pontos.length, 'pontos', s.pontos[0]?.join(':'), '→', s.pontos.at(-1)?.join(':'));
