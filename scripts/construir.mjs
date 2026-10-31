// Lê os boletins de urna (bweb) e o cadastro de locais de votação do TSE e gera os JSON do site.
// Uso: node scripts/construir.mjs   (lê dados/extraidos e dados/ibge; escreve em site/dados)
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DIR_BWEB = path.join(RAIZ, 'dados/extraidos/bweb');
const DIR_LOCAIS = path.join(RAIZ, 'dados/extraidos/locais');
const DIR_IBGE = path.join(RAIZ, 'dados/ibge');
const SAIDA = path.join(RAIZ, 'site/dados');

// Fuso de cada UF em relação a Brasília (horas a somar ao horário local da urna).
// Simplificação: o oeste do Amazonas (UTC-5) e Fernando de Noronha (UTC-2) ficam com o fuso da UF.
const FUSO = { AC: 2, AM: 1, RO: 1, RR: 1, MT: 1, MS: 1 };
const REGIAO = { N: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'], NE: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], CO: ['DF', 'GO', 'MS', 'MT'], SE: ['ES', 'MG', 'RJ', 'SP'], S: ['PR', 'RS', 'SC'] };

function parseLinha(linha) {
  const out = [];
  let cur = '', aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (aspas && linha[i + 1] === '"') { cur += '"'; i++; } else aspas = !aspas; }
    else if (c === ';' && !aspas) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
// Caminho rápido: quase todas as linhas não têm ';' dentro de aspas.
function campos(linha, n) {
  const f = linha.split(';');
  if (f.length !== n) return parseLinha(linha);
  for (let i = 0; i < f.length; i++) { const v = f[i]; if (v.charCodeAt(0) === 34) f[i] = v.slice(1, -1); }
  return f;
}
const num = v => { if (v === '' || v == null) return null; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
// "2026-10-25 15:00:48" -> minutos do dia (com segundos em fração)
const minutos = v => { const m = /(\d\d):(\d\d):(\d\d)/.exec(v || ''); return m ? +m[1] * 60 + +m[2] + +m[3] / 60 : null; };

async function* linhas(arquivo) {
  const rl = readline.createInterface({ input: fs.createReadStream(arquivo, { encoding: 'latin1', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  for await (const l of rl) if (l) yield l;
}
async function csvs(dir) {
  const out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await csvs(p));
    else if (e.name.toLowerCase().endsWith('.csv')) out.push(p);
  }
  return out.sort();
}

// ---------- IBGE: códigos, nomes e regiões ----------
const tseIbge = new Map();
for (const l of (await fsp.readFile(path.join(DIR_IBGE, 'municipios_tse_ibge.csv'), 'utf8')).trim().split(/\r?\n/).slice(1)) {
  const [tse, uf, , , ibge] = l.split(',');
  tseIbge.set(uf + '|' + Number(tse), Number(ibge));
}
// Município criado depois da tabela de correspondência (instalado em 2025): procurado pelo nome no 2º passo.
const IBGE_POR_NOME = { 'MT|BOA ESPERANÇA DO NORTE': 5101837 };
const ibgeInfo = new Map();
for (const m of JSON.parse(await fsp.readFile(path.join(DIR_IBGE, 'municipios_nomes.json'), 'utf8'))) {
  const ri = m['regiao-imediata'];
  ibgeInfo.set(m.id, { nome: m.nome, interm: ri?.['regiao-intermediaria']?.nome ?? '', imed: ri?.nome ?? '' });
}

// ---------- Boletins: uma entrada por seção (cargo Presidente) ----------
const secoes = new Map();
const candidatos = new Map(); // nr -> nome
let linhasLidas = 0;
const arquivosBweb = await csvs(DIR_BWEB);
for (const arq of arquivosBweb) {
  let idx = null, n = 0;
  for await (const l of linhas(arq)) {
    if (!idx) { const h = parseLinha(l); n = h.length; idx = Object.fromEntries(h.map((x, i) => [x, i])); continue; }
    linhasLidas++;
    const f = campos(l, n);
    if (f[idx.CD_CARGO_PERGUNTA] !== '1') continue; // 1 = Presidente
    const uf = f[idx.SG_UF], mun = Number(f[idx.CD_MUNICIPIO]), zona = Number(f[idx.NR_ZONA]), sec = Number(f[idx.NR_SECAO]);
    const chave = uf + '|' + mun + '|' + zona + '|' + sec;
    let s = secoes.get(chave);
    if (!s) {
      s = {
        uf, mun, munNome: f[idx.NM_MUNICIPIO], zona, sec, local: Number(f[idx.NR_LOCAL_VOTACAO]),
        aptos: num(f[idx.QT_APTOS]), comp: num(f[idx.QT_COMPARECIMENTO]), abst: num(f[idx.QT_ABSTENCOES]),
        biom: num(f[idx.QT_ELEI_BIOM_SEM_HABILITACAO]), tipoUrna: f[idx.DS_TIPO_URNA],
        abre: minutos(f[idx.DT_ABERTURA]), fecha: minutos(f[idx.DT_ENCERRAMENTO]), recebido: f[idx.DT_BU_RECEBIDO],
        agregadas: f[idx.DS_SECOES_AGREGADAS] !== '#NULO#' && f[idx.DS_SECOES_AGREGADAS] !== '',
        votos: {}, branco: 0, nulo: 0
      };
      secoes.set(chave, s);
    }
    const tipo = f[idx.DS_TIPO_VOTAVEL], q = num(f[idx.QT_VOTOS]) || 0;
    if (tipo === 'Nominal') { const nr = f[idx.NR_VOTAVEL]; candidatos.set(nr, f[idx.NM_VOTAVEL]); s.votos[nr] = (s.votos[nr] || 0) + q; }
    else if (tipo === 'Branco') s.branco += q;
    else s.nulo += q; // Nulo (e eventuais anulados) — tudo que não é válido nem branco
  }
  console.log('lido', path.basename(arq), secoes.size, 'seções até aqui');
}

// Candidatos em ordem de número (ordem fixa = cor fixa).
const CAND = [...candidatos.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([nr, nome]) => ({ nr, nome }));
if (CAND.length !== 2) console.warn('Atenção: esperava 2 candidatos no 2º turno, achei', CAND.length);
const [A, B] = CAND.map(c => c.nr);

// ---------- Locais de votação (nome, bairro, coordenadas) ----------
const locais = new Map(); // uf|mun|zona|local -> info
for (const arq of await csvs(DIR_LOCAIS)) {
  if (/BRASIL/i.test(arq)) continue;
  let idx = null, n = 0;
  for await (const l of linhas(arq)) {
    if (!idx) { const h = parseLinha(l); n = h.length; idx = Object.fromEntries(h.map((x, i) => [x, i])); continue; }
    const f = campos(l, n);
    if (f[idx.NR_TURNO] !== '2') continue;
    const chave = f[idx.SG_UF] + '|' + Number(f[idx.CD_MUNICIPIO]) + '|' + Number(f[idx.NR_ZONA]) + '|' + Number(f[idx.NR_LOCAL_VOTACAO]);
    if (locais.has(chave)) continue;
    const lat = num(f[idx.NR_LATITUDE]), lon = num(f[idx.NR_LONGITUDE]);
    locais.set(chave, {
      nome: f[idx.NM_LOCAL_VOTACAO], bairro: (f[idx.NM_BAIRRO] || '').trim(), end: (f[idx.DS_ENDERECO] || '').trim(), tipo: f[idx.DS_TIPO_LOCAL],
      lat: lat && lat !== -1 ? Math.round(lat * 1e5) / 1e5 : null, lon: lon && lon !== -1 ? Math.round(lon * 1e5) / 1e5 : null
    });
  }
}
console.log('locais com cadastro:', locais.size);

// ---------- Indicadores por seção ----------
const brasilia = s => s.fecha == null || s.uf === 'ZZ' ? null : s.fecha + 60 * (FUSO[s.uf] || 0);
const todas = [...secoes.values()];
for (const s of todas) {
  s.a = s.votos[A] || 0; s.b = s.votos[B] || 0; s.val = s.a + s.b;
  s.fechaBsb = brasilia(s);
  s.q17 = s.fechaBsb != null && s.fechaBsb > 17 * 60 ? 1 : 0;
  s.q1705 = s.fechaBsb != null && s.fechaBsb > 17 * 60 + 5 ? 1 : 0;
  s.q1730 = s.fechaBsb != null && s.fechaBsb > 17 * 60 + 30 ? 1 : 0;
  s.q19 = s.fechaBsb != null && s.fechaBsb > 19 * 60 ? 1 : 0;
  s.ibge = tseIbge.get(s.uf + '|' + s.mun) ?? IBGE_POR_NOME[s.uf + '|' + s.munNome] ?? null;
  s.chaveLocal = s.uf + '|' + s.mun + '|' + s.zona + '|' + s.local;
}

// Média do local de votação (mesma escola = eleitorado parecido), para comparações "dentro do local".
const porLocal = new Map();
for (const s of todas) {
  let L = porLocal.get(s.chaveLocal);
  if (!L) porLocal.set(s.chaveLocal, L = { secoes: [], aptos: 0, comp: 0, biom: 0, a: 0, b: 0, br: 0, nu: 0, q17: 0, q1730: 0, q19: 0, q1705: 0 });
  L.secoes.push(s); L.aptos += s.aptos || 0; L.comp += s.comp || 0; L.biom += s.biom || 0; L.a += s.a; L.b += s.b; L.br += s.branco; L.nu += s.nulo; L.q17 += s.q17; L.q1730 += s.q1730; L.q19 += s.q19; L.q1705 += s.q1705;
}
const porMun = new Map();
for (const s of todas) {
  const k = s.uf + '|' + s.mun;
  let M = porMun.get(k);
  if (!M) porMun.set(k, M = { uf: s.uf, mun: s.mun, nome: s.munNome, ibge: s.ibge, zonas: new Set(), secoes: 0, aptos: 0, comp: 0, biom: 0, a: 0, b: 0, br: 0, nu: 0, alertas: 0, q17: 0, q1730: 0, q19: 0, q1705: 0 });
  M.zonas.add(s.zona); M.secoes++; M.aptos += s.aptos || 0; M.comp += s.comp || 0; M.biom += s.biom || 0; M.a += s.a; M.b += s.b; M.br += s.branco; M.nu += s.nulo; M.q17 += s.q17; M.q1730 += s.q1730; M.q19 += s.q19; M.q1705 += s.q1705;
}

// ---------- Alertas por seção (sinais para olhar de perto; nenhum prova irregularidade) ----------
const TIPOS_ALERTA = {
  comp_maior_aptos: 'Comparecimento maior que o número de aptos',
  aptos_nao_fecham: 'Aptos ≠ comparecimento + abstenções',
  votos_nao_fecham: 'Votos (válidos + brancos + nulos) ≠ comparecimento',
  biom_maior_comp: 'Campo de biometria maior que o comparecimento',
  unanime: 'Um candidato com 100% dos válidos (≥ 50 válidos)',
  biom_alta: '≥ 50% do comparecimento sem habilitação biométrica (≥ 50 votantes)',
  destoa_local: 'Resultado ≥ 30 pontos diferente da média do mesmo local (≥ 3 seções, ≥ 100 válidos)',
  comp_destoa_local: 'Comparecimento ≥ 25 pontos diferente da média do mesmo local (≥ 3 seções)',
  fecha_19h: 'Urna encerrada depois das 19h de Brasília',
  urna_nao_apurada: 'Tipo de urna diferente de "Apurada"',
  sem_horario: 'Sem horário de abertura/encerramento'
};
const contagemAlertas = Object.fromEntries(Object.keys(TIPOS_ALERTA).map(k => [k, 0]));
const alertasSecoes = [];
const alertasPorUf = {};
for (const s of todas) {
  const al = [];
  if (s.aptos != null && s.comp != null && s.comp > s.aptos) al.push('comp_maior_aptos');
  if (s.aptos != null && s.comp != null && s.abst != null && s.comp + s.abst !== s.aptos) al.push('aptos_nao_fecham');
  if (s.comp != null && s.val + s.branco + s.nulo !== s.comp) al.push('votos_nao_fecham');
  if (s.biom != null && s.comp != null && s.biom > s.comp) al.push('biom_maior_comp');
  if (s.val >= 50 && (s.a === 0 || s.b === 0)) al.push('unanime');
  if (s.comp >= 50 && s.biom / s.comp >= 0.5) al.push('biom_alta');
  const L = porLocal.get(s.chaveLocal);
  if (L.secoes.length >= 3) {
    const outrosA = L.a - s.a, outrosVal = L.a + L.b - s.val;
    if (s.val >= 100 && outrosVal > 0 && Math.abs(s.a / s.val - outrosA / outrosVal) >= 0.30) al.push('destoa_local');
    const outrosComp = L.comp - s.comp, outrosAptos = L.aptos - s.aptos;
    if (s.aptos > 0 && outrosAptos > 0 && Math.abs(s.comp / s.aptos - outrosComp / outrosAptos) >= 0.25) al.push('comp_destoa_local');
  }
  if (s.fechaBsb != null && s.fechaBsb >= 19 * 60) al.push('fecha_19h');
  if (s.tipoUrna && s.tipoUrna !== 'Apurada') al.push('urna_nao_apurada');
  if (s.fecha == null) al.push('sem_horario');
  s.alertas = al;
  for (const k of al) { contagemAlertas[k]++; const u = alertasPorUf[s.uf] ||= {}; u[k] = (u[k] || 0) + 1; }
  if (al.length) {
    porMun.get(s.uf + '|' + s.mun).alertas++;
    const info = locais.get(s.chaveLocal);
    alertasSecoes.push([s.uf, s.ibge, s.munNome, s.zona, s.sec, info?.nome ?? '', s.aptos, s.comp, s.biom, s.a, s.b, s.branco, s.nulo, s.fechaBsb == null ? null : Math.round(s.fechaBsb), al.join(',')]);
  }
}

// ---------- Totais e agregações ----------
const soma = lista => lista.reduce((t, s) => { t.secoes++; t.aptos += s.aptos || 0; t.comp += s.comp || 0; t.abst += s.abst || 0; t.biom += s.biom || 0; t.a += s.a; t.b += s.b; t.br += s.branco; t.nu += s.nulo; t.alertas += s.alertas.length ? 1 : 0; t.q17 += s.q17; t.q1730 += s.q1730; t.q19 += s.q19; t.q1705 += s.q1705; return t; }, { secoes: 0, aptos: 0, comp: 0, abst: 0, biom: 0, a: 0, b: 0, br: 0, nu: 0, alertas: 0, q17: 0, q1730: 0, q19: 0, q1705: 0 });
const ufs = [...new Set(todas.map(s => s.uf))].sort();
const porUf = Object.fromEntries(ufs.map(uf => [uf, soma(todas.filter(s => s.uf === uf))]));
const total = soma(todas);
const totalBr = soma(todas.filter(s => s.uf !== 'ZZ'));

// ---------- Biometria: compara seções por faixa do campo de biometria ----------
// "Bruto" mistura lugares diferentes; "dentro do local" compara cada seção com as outras seções da mesma escola,
// o que tira a maior parte do efeito de região, renda e idade (eleitorado da mesma escola é parecido).
const FAIXAS = [0, 0.01, 0.02, 0.04, 0.06, 0.08, 0.10, 0.15, 0.20, 0.30, 1.01];
function faixasBiometria(lista) {
  const fx = FAIXAS.slice(0, -1).map((ini, i) => ({ ini, fim: FAIXAS[i + 1], secoes: 0, comp: 0, biom: 0, a: 0, val: 0, difLocal: 0, valLocal: 0, difMun: 0 }));
  for (const s of lista) {
    if (!s.comp || s.uf === 'ZZ') continue;
    const t = s.biom / s.comp, f = fx.find(x => t >= x.ini && t < x.fim);
    if (!f) continue;
    f.secoes++; f.comp += s.comp; f.biom += s.biom; f.a += s.a; f.val += s.val;
    const L = porLocal.get(s.chaveLocal), M = porMun.get(s.uf + '|' + s.mun);
    if (L.secoes.length >= 2) {
      const oa = L.a - s.a, ov = L.a + L.b - s.val;
      if (ov > 0 && s.val > 0) { f.difLocal += s.a - s.val * oa / ov; f.valLocal += s.val; }
    }
    if (M.a + M.b > 0) f.difMun += s.a - s.val * M.a / (M.a + M.b);
  }
  return fx.map(f => ({ ini: f.ini, fim: Math.min(f.fim, 1), secoes: f.secoes, comp: f.comp, biom: f.biom, pctA: f.val ? f.a / f.val : null, ppMun: f.val ? 100 * f.difMun / f.val : null, ppLocal: f.valLocal ? 100 * f.difLocal / f.valLocal : null, valLocal: f.valLocal }));
}
// Inclinação com efeito fixo de local (mínimos quadrados ponderados pelos votos válidos):
// quanto muda a % do candidato A quando a taxa do campo de biometria sobe 10 pontos dentro da mesma escola.
function inclinacao(lista) {
  let sxy = 0, sxx = 0, n = 0;
  const grupos = new Map();
  for (const s of lista) {
    if (!s.comp || !s.val || s.uf === 'ZZ') continue;
    let g = grupos.get(s.chaveLocal); if (!g) grupos.set(s.chaveLocal, g = []);
    g.push(s);
  }
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    let w = 0, mx = 0, my = 0;
    for (const s of g) { w += s.val; mx += s.val * s.biom / s.comp; my += s.a; }
    mx /= w; my /= w;
    for (const s of g) { const x = s.biom / s.comp - mx, y = s.a / s.val - my; sxy += s.val * x * y; sxx += s.val * x * x; n++; }
  }
  return { ppPor10: sxx ? 10 * sxy / sxx : null, secoes: n };
}
const biometria = {
  nacional: faixasBiometria(todas),
  inclinacao: inclinacao(todas),
  porUf: Object.fromEntries(ufs.filter(u => u !== 'ZZ').map(uf => { const l = todas.filter(s => s.uf === uf); return [uf, { inclinacao: inclinacao(l), faixas: faixasBiometria(l) }]; })),
  zeroVsAlgum: (() => {
    const z = soma(todas.filter(s => s.uf !== 'ZZ' && s.biom === 0)), p = soma(todas.filter(s => s.uf !== 'ZZ' && s.biom > 0));
    return { zero: z, algum: p };
  })()
};

// ---------- Horários (convertidos para Brasília) ----------
const hist = new Map(); // bloco de 5 min -> {secoes, a, val}
const horario = { apos17: 0, apos1705: 0, apos1730: 0, apos18: 0, apos19: 0, bruto_apos17: 0, bruto_apos19: 0, semHorario: 0 };
const faixaHora = [[0, 17 * 60 + 5], [17 * 60 + 5, 17 * 60 + 30], [17 * 60 + 30, 18 * 60], [18 * 60, 19 * 60], [19 * 60, 24 * 60]].map(([ini, fim]) => ({ ini, fim, secoes: 0, comp: 0, a: 0, val: 0, difMun: 0 }));
for (const s of todas) {
  if (s.fecha == null) { horario.semHorario++; continue; }
  if (s.fecha > 17 * 60) horario.bruto_apos17++;
  if (s.fecha > 19 * 60) horario.bruto_apos19++;
  const t = s.fechaBsb; if (t == null) continue;
  if (t > 17 * 60) horario.apos17++;
  if (t > 17 * 60 + 5) horario.apos1705++;
  if (t > 17 * 60 + 30) horario.apos1730++;
  if (t > 18 * 60) horario.apos18++;
  if (t > 19 * 60) horario.apos19++;
  const blk = Math.floor(Math.min(Math.max(t, 16 * 60 + 30), 21 * 60) / 5) * 5;
  const h = hist.get(blk) || { secoes: 0, a: 0, val: 0 }; h.secoes++; h.a += s.a; h.val += s.val; hist.set(blk, h);
  const f = faixaHora.find(x => t >= x.ini && t < x.fim);
  if (f) { const M = porMun.get(s.uf + '|' + s.mun); f.secoes++; f.comp += s.comp; f.a += s.a; f.val += s.val; if (M.a + M.b) f.difMun += s.a - s.val * M.a / (M.a + M.b); }
}
horario.histograma = [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([m, h]) => ({ min: m, secoes: h.secoes, pctA: h.val ? h.a / h.val : null }));
horario.faixas = faixaHora.map(f => ({ ini: f.ini, fim: f.fim, secoes: f.secoes, comp: f.comp, pctA: f.val ? f.a / f.val : null, ppMun: f.val ? 100 * f.difMun / f.val : null }));

// ---------- Linha do tempo da apuração (recebimento do BU) ----------
const blocosApur = new Map();
for (const s of todas) {
  const m = /(\d{4}-\d\d-\d\d) (\d\d):(\d\d)/.exec(s.recebido || '');
  if (!m) continue;
  const dia = m[1] === '2026-10-25' ? 0 : 1;
  const min = Math.floor((dia * 1440 + +m[2] * 60 + +m[3]) / 5) * 5;
  let b = blocosApur.get(min); if (!b) blocosApur.set(min, b = {});
  // [secoes, a, b, aptos, comp, biom, branco, nulo, secoesComAlerta, fecharamApos1705, fecharamApos19]
  const u = b[s.uf] || (b[s.uf] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  u[0]++; u[1] += s.a; u[2] += s.b; u[3] += s.aptos || 0; u[4] += s.comp || 0; u[5] += s.biom || 0; u[6] += s.branco; u[7] += s.nulo; u[8] += s.alertas.length ? 1 : 0; u[9] += s.q1705; u[10] += s.q19;
}
const apuracao = [...blocosApur.entries()].sort((a, b) => a[0] - b[0]).map(([min, ufsB]) => ({ min, ufs: ufsB }));

// ---------- Arquivos do site ----------
await fsp.mkdir(path.join(SAIDA, 'locais'), { recursive: true });
await fsp.mkdir(path.join(SAIDA, 'geo'), { recursive: true });
await fsp.mkdir(path.join(SAIDA, 'secoes'), { recursive: true });

const municipios = [...porMun.values()].map(M => {
  const info = ibgeInfo.get(M.ibge) || {};
  return [M.ibge, M.uf, info.nome || M.nome, M.mun, [...M.zonas].sort((a, b) => a - b).join(' '), M.secoes, M.aptos, M.comp, M.biom, M.a, M.b, M.br, M.nu, M.alertas, info.interm || '', info.imed || '', M.q17, M.q1730, M.q19, M.q1705];
}).sort((x, y) => x[1].localeCompare(y[1]) || x[2].localeCompare(y[2]));

const zonas = new Map();
for (const s of todas) {
  const k = s.uf + '|' + s.zona;
  let Z = zonas.get(k); if (!Z) zonas.set(k, Z = { uf: s.uf, zona: s.zona, muns: new Set(), secoes: 0, aptos: 0, comp: 0, biom: 0, a: 0, b: 0, br: 0, nu: 0, alertas: 0, q17: 0, q1730: 0, q19: 0, q1705: 0 });
  Z.muns.add(s.ibge ?? s.munNome); Z.secoes++; Z.aptos += s.aptos || 0; Z.comp += s.comp || 0; Z.biom += s.biom || 0; Z.a += s.a; Z.b += s.b; Z.br += s.branco; Z.nu += s.nulo; Z.alertas += s.alertas.length ? 1 : 0; Z.q17 += s.q17; Z.q1730 += s.q1730; Z.q19 += s.q19; Z.q1705 += s.q1705;
}

const resumo = {
  meta: {
    gerado: new Date().toISOString(), eleicao: 'Eleição Geral Federal 2026 · 2º turno (25/10/2026) · Presidente',
    fonte: 'https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna', arquivosBweb: arquivosBweb.length, linhasLidas,
    colunas: {
      municipio: ['ibge', 'uf', 'nome', 'tse', 'zonas', 'secoes', 'aptos', 'comp', 'biom', 'a', 'b', 'branco', 'nulo', 'secoesComAlerta', 'regiaoIntermediaria', 'regiaoImediata', 'fechouApos17', 'fechouApos1730', 'fechouApos19', 'fechouApos1705'],
      zona: ['uf', 'zona', 'municipios', 'secoes', 'aptos', 'comp', 'biom', 'a', 'b', 'branco', 'nulo', 'secoesComAlerta', 'fechouApos17', 'fechouApos1730', 'fechouApos19', 'fechouApos1705'],
      local: ['id', 'ibge', 'zona', 'local', 'nome', 'bairro', 'endereco', 'tipo', 'lat', 'lon', 'secoes', 'aptos', 'comp', 'biom', 'a', 'b', 'branco', 'nulo', 'secoesComAlerta', 'tse', 'fechouApos17', 'fechouApos1730', 'fechouApos19', 'fechouApos1705'],
      secao: ['zona', 'secao', 'localId', 'aptos', 'comp', 'abst', 'biom', 'a', 'b', 'branco', 'nulo', 'aberturaLocalMin', 'encerramentoLocalMin', 'encerramentoBsbMin', 'recebidoMin(+1440 = dia seguinte)', 'tipoUrnaSeNaoApurada', 'agregada', 'alertas'],
      alerta: ['uf', 'ibge', 'municipio', 'zona', 'secao', 'local', 'aptos', 'comp', 'biom', 'a', 'b', 'branco', 'nulo', 'encerramentoBsbMin', 'tipos']
    }
  },
  candidatos: CAND, total, totalBrasil: totalBr, porUf, regioes: REGIAO, alertasPorUf,
  alertas: { tipos: TIPOS_ALERTA, contagem: contagemAlertas, secoesComAlerta: alertasSecoes.length },
  biometria, horario, apuracao
};
await fsp.writeFile(path.join(SAIDA, 'resumo.json'), JSON.stringify(resumo));
await fsp.writeFile(path.join(SAIDA, 'municipios.json'), JSON.stringify(municipios));
await fsp.writeFile(path.join(SAIDA, 'zonas.json'), JSON.stringify([...zonas.values()].map(Z => [Z.uf, Z.zona, [...Z.muns], Z.secoes, Z.aptos, Z.comp, Z.biom, Z.a, Z.b, Z.br, Z.nu, Z.alertas, Z.q17, Z.q1730, Z.q19, Z.q1705])));

// Locais por UF + índice de busca nacional: { UF: [bairros[], [nome, índiceDoBairro][]] } (posição = id do local).
const busca = {};
for (const uf of ufs) {
  const lista = [], bairros = [], idxBairro = new Map(), nomes = [];
  for (const [k, L] of porLocal) {
    if (!k.startsWith(uf + '|')) continue;
    const s0 = L.secoes[0], info = locais.get(k) || {};
    const bairro = info.bairro || '';
    if (!idxBairro.has(bairro)) { idxBairro.set(bairro, bairros.length); bairros.push(bairro); }
    lista.push([lista.length, s0.ibge, s0.zona, s0.local, info.nome || 'Local ' + s0.local, bairro, info.end || '', info.tipo || '', info.lat ?? null, info.lon ?? null, L.secoes.length, L.aptos, L.comp, L.biom, L.a, L.b, L.br, L.nu, L.secoes.filter(s => s.alertas.length).length, s0.mun, L.q17, L.q1730, L.q19, L.q1705]);
    nomes.push([info.nome || '', idxBairro.get(bairro), s0.ibge, L.comp]);
  }
  busca[uf] = [bairros, nomes];
  await fsp.writeFile(path.join(SAIDA, 'locais', uf + '.json'), JSON.stringify(lista));
  // Seções da UF (um "boletim" resumido por urna), para a busca por zona e seção. Carregado só quando pedido.
  const idDoLocal = new Map();
  let id = 0;
  for (const k of porLocal.keys()) if (k.startsWith(uf + '|')) idDoLocal.set(k, id++);
  const hm = m => m == null ? null : Math.round(m);
  const receb = v => { const m = /(\d{4}-\d\d-\d\d) (\d\d):(\d\d)/.exec(v || ''); return m ? (m[1] === '2026-10-25' ? 0 : 1440) + +m[2] * 60 + +m[3] : null; };
  const secs = todas.filter(s => s.uf === uf).map(s => [s.zona, s.sec, idDoLocal.get(s.chaveLocal), s.aptos, s.comp, s.abst, s.biom, s.a, s.b, s.branco, s.nulo, hm(s.abre), hm(s.fecha), hm(s.fechaBsb), receb(s.recebido), s.tipoUrna === 'Apurada' ? '' : s.tipoUrna, s.agregadas ? 1 : 0, s.alertas.join(',')]);
  secs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  await fsp.writeFile(path.join(SAIDA, 'secoes', uf + '.json'), JSON.stringify(secs));
}
await fsp.writeFile(path.join(SAIDA, 'busca-locais.json'), JSON.stringify(busca));
await fsp.writeFile(path.join(SAIDA, 'alertas.json'), JSON.stringify(alertasSecoes));

// Malhas do IBGE: UFs inteiras + municípios separados por UF (carregados sob demanda).
const COD_UF = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
const ufGeo = JSON.parse(await fsp.readFile(path.join(DIR_IBGE, 'brasil_uf.geojson'), 'utf8'));
for (const f of ufGeo.features) f.properties = { uf: COD_UF[f.properties.codarea] };
await fsp.writeFile(path.join(SAIDA, 'geo', 'uf.json'), JSON.stringify(ufGeo));
const munGeo = JSON.parse(await fsp.readFile(path.join(DIR_IBGE, 'municipios.geojson'), 'utf8'));
const porUfGeo = {};
for (const f of munGeo.features) {
  const uf = COD_UF[String(f.properties.codarea).slice(0, 2)];
  (porUfGeo[uf] ||= []).push({ type: 'Feature', properties: { ibge: Number(f.properties.codarea) }, geometry: f.geometry });
}
for (const [uf, feats] of Object.entries(porUfGeo)) await fsp.writeFile(path.join(SAIDA, 'geo', 'mun-' + uf + '.json'), JSON.stringify({ type: 'FeatureCollection', features: feats }));

const semIbge = [...porMun.values()].filter(M => M.uf !== 'ZZ' && !M.ibge).map(M => M.uf + ' ' + M.nome);
const semCoord = [...porLocal.keys()].filter(k => !k.startsWith('ZZ') && !locais.get(k)?.lat).length;
console.log(JSON.stringify({ candidatos: CAND, secoes: total.secoes, comp: total.comp, biom: total.biom, municipios: municipios.length, semIbge, locais: porLocal.size, locaisSemCoordenada: semCoord, alertas: contagemAlertas, secoesComAlerta: alertasSecoes.length, inclinacao: biometria.inclinacao, horario: { ...horario, histograma: undefined, faixas: undefined } }, null, 1));
