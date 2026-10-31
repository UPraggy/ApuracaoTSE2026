// Investigação de inconsistências e "coisas estranhas" nos boletins de urna (BU) do 2º turno de 2026.
// Uso: node --max-old-space-size=6000 scripts/investigar.mjs
//   Lê dados/extraidos/bweb (todos os cargos) e dados/extraidos/locais (cadastro, NR_TURNO=2).
//   Escreve dados/investigacao.json e imprime um resumo no terminal.
//   Opcional: INVESTIGAR_CACHE=<arquivo> guarda/relê as seções já lidas (para repetir a análise sem reler os CSV).
// Nada aqui prova irregularidade: são contagens e sinais para conferência no BU impresso / RDV / log da urna.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DIR_BWEB = path.join(RAIZ, 'dados/extraidos/bweb');
const DIR_LOCAIS = path.join(RAIZ, 'dados/extraidos/locais');
const SAIDA = path.join(RAIZ, 'dados/investigacao.json');
const CACHE = process.env.INVESTIGAR_CACHE || null;

// Fuso de cada UF em relação a Brasília (horas a somar ao horário local). O script também INFERE o fuso
// de cada município pela hora de abertura (seção "fusos"), para achar municípios com fuso diferente da UF.
const FUSO_UF = { AC: 2, AM: 1, RO: 1, RR: 1, MT: 1, MS: 1 };
const DIA0 = Date.UTC(2026, 9, 25); // 25/10/2026 00:00 (dia da eleição)

// ---------- leitura ----------
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
function campos(linha, n) {
  const f = linha.split(';');
  if (f.length !== n) return parseLinha(linha);
  for (let i = 0; i < f.length; i++) { const v = f[i]; if (v.charCodeAt(0) === 34) f[i] = v.slice(1, -1); }
  return f;
}
const num = v => { if (v === '' || v == null || v === '#NULO#' || v === '#NE#') return null; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
// "2026-10-25 15:00:48" -> minutos desde 25/10/2026 00:00 (negativo = antes; > 1440 = dia seguinte)
const tmin = v => {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/.exec(v || '');
  if (!m) return null;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - DIA0) / 60000 + +m[4] * 60 + +m[5] + +m[6] / 60;
};
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

async function lerBoletins() {
  const secoes = new Map();
  const outrosCargos = new Map(); // chave|cargo -> {comp, aptos, biom, urna, abre, fecha}
  const cargos = {}, tiposVotavel = {};
  let linhasLidas = 0, linhasDuplicadas = 0, camposDivergentes = 0;
  const exemplosDup = [], exemplosDiv = [];
  for (const arq of await csvs(DIR_BWEB)) {
    let idx = null, n = 0;
    for await (const l of linhas(arq)) {
      if (!idx) { const h = parseLinha(l); n = h.length; idx = Object.fromEntries(h.map((x, i) => [x, i])); continue; }
      linhasLidas++;
      const f = campos(l, n);
      const cargo = f[idx.CD_CARGO_PERGUNTA];
      cargos[cargo + ' ' + f[idx.DS_CARGO_PERGUNTA]] = (cargos[cargo + ' ' + f[idx.DS_CARGO_PERGUNTA]] || 0) + 1;
      const uf = f[idx.SG_UF], mun = Number(f[idx.CD_MUNICIPIO]), zona = Number(f[idx.NR_ZONA]), sec = Number(f[idx.NR_SECAO]);
      const chave = uf + '|' + mun + '|' + zona + '|' + sec;
      // assinatura dos campos "da seção" (devem ser iguais em todas as linhas da seção)
      const assin = [f[idx.QT_APTOS], f[idx.QT_COMPARECIMENTO], f[idx.QT_ABSTENCOES], f[idx.QT_ELEI_BIOM_SEM_HABILITACAO], f[idx.DT_ABERTURA], f[idx.DT_ENCERRAMENTO], f[idx.DT_EMISSAO_BU], f[idx.NR_URNA_EFETIVADA], f[idx.NR_LOCAL_VOTACAO]].join('|');
      if (cargo !== '1') {
        const k2 = chave + '|' + cargo;
        if (!outrosCargos.has(k2)) outrosCargos.set(k2, { cargo, comp: num(f[idx.QT_COMPARECIMENTO]), aptos: num(f[idx.QT_APTOS]), biom: num(f[idx.QT_ELEI_BIOM_SEM_HABILITACAO]), urna: f[idx.NR_URNA_EFETIVADA], abre: f[idx.DT_ABERTURA], fecha: f[idx.DT_ENCERRAMENTO], votos: 0 });
        outrosCargos.get(k2).votos += num(f[idx.QT_VOTOS]) || 0;
        continue;
      }
      let s = secoes.get(chave);
      if (!s) {
        s = {
          uf, mun, munNome: f[idx.NM_MUNICIPIO], zona, sec, local: Number(f[idx.NR_LOCAL_VOTACAO]),
          aptos: num(f[idx.QT_APTOS]), comp: num(f[idx.QT_COMPARECIMENTO]), abst: num(f[idx.QT_ABSTENCOES]),
          biom: num(f[idx.QT_ELEI_BIOM_SEM_HABILITACAO]), tipoUrna: f[idx.DS_TIPO_URNA],
          abreS: f[idx.DT_ABERTURA], fechaS: f[idx.DT_ENCERRAMENTO], emisS: f[idx.DT_EMISSAO_BU], recebS: f[idx.DT_BU_RECEBIDO], cargaS: f[idx.DT_CARGA_URNA_EFETIVADA],
          urna: f[idx.NR_URNA_EFETIVADA], carga1: f[idx.CD_CARGA_1_URNA_EFETIVADA], carga2: f[idx.CD_CARGA_2_URNA_EFETIVADA], flash: f[idx.CD_FLASHCARD_URNA_EFETIVADA],
          agreg: f[idx.DS_SECOES_AGREGADAS], junta: f[idx.NR_JUNTA_APURADORA], turma: f[idx.NR_TURMA_APURADORA],
          a: 0, b: 0, branco: 0, nulo: 0, anulado: 0, assin, vistos: '', linhas: 0
        };
        secoes.set(chave, s);
      } else if (s.assin !== assin) {
        camposDivergentes++; if (exemplosDiv.length < 10) exemplosDiv.push({ chave, a: s.assin, b: assin });
      }
      s.linhas++;
      const tipo = f[idx.DS_TIPO_VOTAVEL], nr = f[idx.NR_VOTAVEL], q = num(f[idx.QT_VOTOS]) || 0;
      tiposVotavel[tipo + ' ' + nr] = (tiposVotavel[tipo + ' ' + nr] || 0) + q;
      const marca = '[' + tipo + nr + ']';
      if (s.vistos.includes(marca)) { linhasDuplicadas++; if (exemplosDup.length < 10) exemplosDup.push({ chave, tipo, nr, q }); }
      else s.vistos += marca;
      if (tipo === 'Nominal') { if (nr === '13') s.a += q; else if (nr === '22') s.b += q; else s.outroNominal = (s.outroNominal || 0) + q; }
      else if (tipo === 'Branco') s.branco += q;
      else if (tipo === 'Nulo') s.nulo += q;
      else s.anulado += q;
    }
    console.log('lido', path.basename(arq), secoes.size, 'seções até aqui');
  }
  for (const s of secoes.values()) { delete s.assin; delete s.vistos; }
  return { secoes: [...secoes.entries()], outros: [...outrosCargos.entries()], meta: { linhasLidas, linhasDuplicadas, camposDivergentes, exemplosDup, exemplosDiv, cargos, tiposVotavel } };
}

async function lerCadastro() {
  const cad = new Map(); // uf|mun|zona|sec -> {tipo, principal, eleitores, local, situacao}
  for (const arq of await csvs(DIR_LOCAIS)) {
    if (/BRASIL/i.test(arq)) continue;
    let idx = null, n = 0;
    for await (const l of linhas(arq)) {
      if (!idx) { const h = parseLinha(l); n = h.length; idx = Object.fromEntries(h.map((x, i) => [x, i])); continue; }
      const f = campos(l, n);
      if (f[idx.NR_TURNO] !== '2') continue;
      const k = f[idx.SG_UF] + '|' + Number(f[idx.CD_MUNICIPIO]) + '|' + Number(f[idx.NR_ZONA]) + '|' + Number(f[idx.NR_SECAO]);
      cad.set(k, {
        tipo: f[idx.DS_TIPO_SECAO_AGREGADA], principal: Number(f[idx.NR_SECAO_PRINCIPAL]), eleitores: num(f[idx.QT_ELEITOR_SECAO]),
        federal: num(f[idx.QT_ELEITOR_ELEICAO_FEDERAL]), local: Number(f[idx.NR_LOCAL_VOTACAO]), localOriginal: Number(f[idx.NR_LOCAL_VOTACAO_ORIGINAL]),
        situacao: f[idx.DS_SITU_SECAO], nomeLocal: f[idx.NM_LOCAL_VOTACAO], tipoLocal: f[idx.DS_TIPO_LOCAL]
      });
    }
  }
  return [...cad.entries()];
}

let dados;
if (CACHE && fs.existsSync(CACHE)) { dados = v8.deserialize(fs.readFileSync(CACHE)); console.log('cache lido de', CACHE); }
else {
  const t0 = Date.now();
  const bu = await lerBoletins();
  const cad = await lerCadastro();
  dados = { bu, cad };
  console.log('leitura em', Math.round((Date.now() - t0) / 1000), 's');
  if (CACHE) fs.writeFileSync(CACHE, v8.serialize(dados));
}
const secoes = new Map(dados.bu.secoes);
const outros = new Map(dados.bu.outros);
const cad = new Map(dados.cad);
const META = dados.bu.meta;
const todas = [...secoes.values()];
const BR = todas.filter(s => s.uf !== 'ZZ');
const cadDe = s => cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec);
const INDIGENA = /IND[IÍ]GENA|ALDEIA|POLO BASE|TICUNA|TUKUNA/i;

// ---------- utilidades ----------
const R = {}; // resultado final
const pct = (a, b) => b ? Math.round(1e4 * a / b) / 100 : null;
const r1 = x => x == null ? null : Math.round(x * 10) / 10;
const r2 = x => x == null ? null : Math.round(x * 100) / 100;
const hhmm = m => { if (m == null) return null; const d = Math.floor(m / 1440), r = ((m % 1440) + 1440) % 1440; const h = Math.floor(r / 60), mi = Math.floor(r % 60); return (d ? (d > 0 ? '+' : '') + d + 'd ' : '') + String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); };
const id = s => `${s.uf} ${s.munNome} Z${s.zona} S${s.sec}`;
const contar = (lista, fn) => { const o = {}; for (const x of lista) { const k = fn(x); if (k == null) continue; o[k] = (o[k] || 0) + 1; } return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1])); };
const top = (o, n = 10) => Object.fromEntries(Object.entries(o).slice(0, n));
const mediana = arr => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const quantis = (arr, qs) => { const a = [...arr].sort((x, y) => x - y); return Object.fromEntries(qs.map(q => [q, a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null])); };
// p-valor da qui-quadrado (função gama incompleta regularizada superior)
function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const v of c) s += v / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function gammq(a, x) {
  if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
const quiQuadrado = (obs) => { const n = obs.reduce((a, b) => a + b, 0), e = n / obs.length; const x2 = obs.reduce((t, o) => t + (o - e) ** 2 / e, 0); return { n, x2: r2(x2), gl: obs.length - 1, p: Number(gammq((obs.length - 1) / 2, x2 / 2).toPrecision(3)) }; };
const PZ = z => { // P(|Z| > z) normal
  const t = 1 / (1 + 0.2316419 * z), d = 0.3989423 * Math.exp(-z * z / 2);
  return 2 * d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
};

// ---------- horários convertidos ----------
for (const s of todas) {
  s.abre = tmin(s.abreS); s.fecha = tmin(s.fechaS); s.emis = tmin(s.emisS); s.receb = tmin(s.recebS); s.carga = tmin(s.cargaS);
  s.val = s.a + s.b; s.bn = s.branco + s.nulo + s.anulado;
  s.chaveLocal = s.uf + '|' + s.mun + '|' + s.zona + '|' + s.local;
}

// ======================================================================
// 0. Sanidade da leitura
// ======================================================================
R.leitura = {
  linhasLidas: META.linhasLidas, secoesPresidente: todas.length, secoesBrasil: BR.length, secoesExterior: todas.length - BR.length,
  linhasDuplicadas: META.linhasDuplicadas, exemplosDuplicadas: META.exemplosDup,
  secoesComCamposDivergentesEntreLinhas: META.camposDivergentes, exemplosDivergentes: META.exemplosDiv,
  cargos: META.cargos, tiposVotavelPresidente: META.tiposVotavel,
  outroNominal: todas.filter(s => s.outroNominal).length,
  anuladoApuradoSeparado: todas.reduce((t, s) => t + s.anulado, 0),
  tipoUrna: contar(todas, s => s.tipoUrna),
  linhasPorSecao: contar(todas, s => s.linhas)
};

// ======================================================================
// 1. Unicidade: urna, carga, flashcard, seções, agregadas
// ======================================================================
{
  const porUrna = new Map(), porCarga = new Map();
  for (const s of todas) {
    (porUrna.get(s.urna) || porUrna.set(s.urna, []).get(s.urna)).push(s);
    const kc = s.carga1 + s.carga2; (porCarga.get(kc) || porCarga.set(kc, []).get(kc)).push(s);
  }
  const urnaRep = [...porUrna.entries()].filter(([, l]) => l.length > 1);
  const cargaRep = [...porCarga.entries()].filter(([, l]) => l.length > 1);
  const flashs = contar(todas, s => 'flash ' + s.flash);
  const flashPorUf = {};
  for (const s of todas) { const o = flashPorUf[s.uf] ||= {}; o[s.flash] = (o[s.flash] || 0) + 1; }
  const urnasNum = todas.map(s => Number(s.urna)).filter(Number.isFinite);
  // seção que aparece como agregada em outra E tem BU próprio
  const listaAgreg = [];
  for (const s of todas) {
    if (!s.agreg || s.agreg === '#NULO#') continue;
    const lst = s.agreg.split('/').map(x => Number(x.trim())).filter(Number.isFinite);
    s.agregLista = lst; listaAgreg.push(s);
  }
  const agregComBuProprio = [];
  const agregadaEmDuas = new Map();
  for (const s of listaAgreg) for (const n of s.agregLista) {
    const k = s.uf + '|' + s.mun + '|' + s.zona + '|' + n;
    if (secoes.has(k)) agregComBuProprio.push({ principal: id(s), agregada: n });
    agregadaEmDuas.set(k, (agregadaEmDuas.get(k) || 0) + 1);
  }
  // aptos do BU x cadastro (principal + agregadas)
  let comCad = 0, semCad = 0, iguais = 0, difs = [];
  const difPorUf = {};
  for (const s of BR) {
    const c = cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec);
    if (!c) { semCad++; continue; }
    comCad++;
    let ele = c.eleitores || 0, faltaAg = 0;
    for (const n of s.agregLista || []) { const ca = cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + n); if (ca) ele += ca.eleitores || 0; else faltaAg++; }
    s.cadEleitores = ele; s.cadLocal = c.local; s.cadTipo = c.tipo;
    const d = s.aptos - ele;
    if (d === 0) iguais++; else { difs.push({ s, d, faltaAg }); difPorUf[s.uf] = (difPorUf[s.uf] || 0) + 1; }
  }
  // seções do cadastro (principais, ativas) sem BU
  const semBu = [], cadTipos = {};
  for (const [k, c] of cad) {
    cadTipos[c.tipo + ' / ' + c.situacao] = (cadTipos[c.tipo + ' / ' + c.situacao] || 0) + 1;
    if (c.tipo === 'Principal' && !secoes.has(k) && !k.startsWith('ZZ')) semBu.push({ k, ...c });
  }
  // agregadas do cadastro cuja principal não lista a agregada no BU
  let agregCadNaoListada = 0; const exAgCad = [];
  for (const [k, c] of cad) {
    if (c.tipo === 'Principal' || k.startsWith('ZZ')) continue;
    const [uf, mun, zona, sec] = k.split('|');
    const p = secoes.get(uf + '|' + mun + '|' + zona + '|' + c.principal);
    if (!p || !(p.agregLista || []).includes(Number(sec))) { agregCadNaoListada++; if (exAgCad.length < 10) exAgCad.push({ secao: k, principal: c.principal, tipo: c.tipo, temBuDaPrincipal: !!p, listaNoBu: p?.agreg }); }
  }
  const localDif = BR.filter(s => s.cadLocal != null && s.cadLocal !== s.local);
  const localDifOriginal = localDif.filter(s => cadDe(s).localOriginal === s.local).length;
  // quebra das diferenças de aptos por tipo de local (voto em trânsito e presos provisórios entram no BU, não no QT_ELEITOR_SECAO)
  const difTipo = {};
  for (const x of difs) { const t = cadDe(x.s).tipoLocal + (x.d > 0 ? ' (+)' : ' (-)'); const o = difTipo[t] ||= { secoes: 0, soma: 0 }; o.secoes++; o.soma += x.d; }
  const comAg = BR.filter(s => s.agregLista), comAgIguais = comAg.filter(s => s.aptos === s.cadEleitores).length;
  difs.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  const distDif = contar(difs, x => x.d > 0 ? (x.d <= 2 ? '+1 a +2' : x.d <= 10 ? '+3 a +10' : '> +10') : (x.d >= -2 ? '-1 a -2' : x.d >= -10 ? '-3 a -10' : '< -10'));
  R.unicidade = {
    secoes: todas.length, urnasDistintas: porUrna.size, urnaEmMaisDeUmaSecao: urnaRep.length,
    exemplosUrnaRepetida: urnaRep.slice(0, 15).map(([u, l]) => ({ urna: u, secoes: l.map(id), carga: l[0].cargaS, semHorario: l.filter(s => !s.abreS || !/\d/.test(s.abreS)).length, aptos: l.reduce((t, s) => t + s.aptos, 0), comp: l.reduce((t, s) => t + s.comp, 0) })),
    exteriorSemHorario: todas.filter(s => s.uf === 'ZZ' && !/\d/.test(s.abreS || '')).length,
    exteriorSemHorarioComUrnaRepetida: todas.filter(s => s.uf === 'ZZ' && !/\d/.test(s.abreS || '') && porUrna.get(s.urna).length > 1).length,
    linhasCargoNulo: [...outros.entries()].filter(([k]) => k.endsWith('|-1')).map(([k, o]) => ({ secao: k, aptos: o.aptos, comp: o.comp, urna: o.urna })),
    cargasDistintas: porCarga.size, cargaEmMaisDeUmaSecao: cargaRep.length,
    exemplosCargaRepetida: cargaRep.slice(0, 10).map(([c, l]) => ({ carga: c, secoes: l.map(id) })),
    flashcardsDistintos: Object.keys(flashs).length, flashcardsMaisUsados: top(flashs, 5),
    flashcardsPorUf: Object.fromEntries(Object.entries(flashPorUf).map(([u, o]) => [u, Object.keys(o).length])),
    faixaNumeroUrna: { min: urnasNum.reduce((a, b) => Math.min(a, b), Infinity), max: urnasNum.reduce((a, b) => Math.max(a, b), -Infinity) },
    secoesComAgregadas: listaAgreg.length, secoesAgregadasTotal: listaAgreg.reduce((t, s) => t + s.agregLista.length, 0),
    maxAgregadasNumaUrna: listaAgreg.reduce((m, s) => Math.max(m, s.agregLista.length), 0),
    distribAgregadas: contar(listaAgreg, s => s.agregLista.length),
    agregadaComBuProprio: agregComBuProprio.length, exemplosAgregadaComBu: agregComBuProprio.slice(0, 10),
    agregadaListadaEmDuasUrnas: [...agregadaEmDuas.values()].filter(v => v > 1).length,
    cadastro: { secoesTurno2: cad.size, tipos: cadTipos, principaisAtivasSemBu: semBu.length, exemplosSemBu: semBu.slice(0, 15), agregadasDoCadastroNaoListadasNoBu: agregCadNaoListada, exemplosAgregNaoListada: exAgCad },
    aptosVsCadastro: { comparadas: comCad, semCadastro: semCad, iguais, diferentes: difs.length, distribuicao: distDif, porUf: difPorUf, somaDiferencas: difs.reduce((t, x) => t + x.d, 0),
      somaPositivas: difs.filter(x => x.d > 0).reduce((t, x) => t + x.d, 0), somaNegativas: difs.filter(x => x.d < 0).reduce((t, x) => t + x.d, 0),
      porTipoDeLocal: difTipo, secoesComCadastroZero: BR.filter(s => cadDe(s).eleitores === 0).length, cadastroZeroPorTipo: contar(BR.filter(s => cadDe(s).eleitores === 0), s => cadDe(s).tipoLocal),
      comAgregadas: comAg.length, comAgregadasIguais: comAgIguais, semAgregadasIguaisPct: pct(iguais - comAgIguais, comCad - comAg.length), comAgregadasIguaisPct: pct(comAgIguais, comAg.length),
      exemplos: difs.slice(0, 15).map(x => ({ secao: id(x.s), aptosBu: x.s.aptos, cadastro: x.s.cadEleitores, dif: x.d, agregadas: x.s.agreg, agregadaSemCadastro: x.faltaAg })) },
    localDiferenteDoCadastro: localDif.length, localDiferenteMasIgualAoOriginal: localDifOriginal, localDifPorUf: top(contar(localDif, s => s.uf), 10), exemplosLocalDif: localDif.slice(0, 10).map(s => ({ secao: id(s), localBu: s.local, localCad: s.cadLocal }))
  };
}

// ======================================================================
// 2. Horários
// ======================================================================
{
  // fuso inferido por município: mediana da abertura local (o horário de votação é 8h-17h de Brasília em todo o país)
  const porMun = new Map();
  for (const s of BR) { if (s.abre == null) continue; const k = s.uf + '|' + s.mun; (porMun.get(k) || porMun.set(k, []).get(k)).push(s); }
  const fusoMun = new Map(); const fusoDivergente = [];
  for (const [k, l] of porMun) {
    const med = mediana(l.map(s => s.abre));
    const fusoInf = Math.round((8 * 60 - med) / 60); // 8h local -> 0; 7h -> +1; 6h -> +2; 9h -> -1
    fusoMun.set(k, fusoInf);
    const uf = k.split('|')[0];
    if (fusoInf !== (FUSO_UF[uf] || 0)) fusoDivergente.push({ uf, municipio: l[0].munNome, secoes: l.length, aberturaMediana: hhmm(med), fusoUf: FUSO_UF[uf] || 0, fusoInferido: fusoInf });
  }
  for (const s of BR) {
    const fz = fusoMun.get(s.uf + '|' + s.mun) ?? (FUSO_UF[s.uf] || 0);
    s.fuso = fz;
    s.abreB = s.abre == null ? null : s.abre + 60 * fz;
    s.fechaB = s.fecha == null ? null : s.fecha + 60 * fz;
    s.fechaUfB = s.fecha == null ? null : s.fecha + 60 * (FUSO_UF[s.uf] || 0); // como o construir.mjs faz
    s.dur = s.abre != null && s.fecha != null ? s.fecha - s.abre : null;
    s.emisB = s.emis == null ? null : s.emis + 60 * fz; // DT_BU_RECEBIDO já é horário de Brasília
  }
  const comHora = BR.filter(s => s.abreB != null && s.fechaB != null);
  const histAbre = contar(comHora, s => hhmm(Math.floor(s.abreB / 15) * 15));
  const abreCedo = comHora.filter(s => s.abreB < 7 * 60 + 30);
  const abreTarde = comHora.filter(s => s.abreB > 9 * 60);
  const fechaCedo = comHora.filter(s => s.fechaB < 17 * 60);
  const emisAntes = comHora.filter(s => s.emis != null && s.emis < s.fecha);
  const recebAntes = BR.filter(s => s.receb != null && s.emisB != null && s.receb < s.emisB);
  const abreAposFecha = comHora.filter(s => s.fecha <= s.abre);
  const foraDoDia = BR.filter(s => [s.abre, s.fecha, s.emis].some(t => t != null && (t < 0 || t >= 1440)));
  const durs = comHora.map(s => s.dur);
  const emisDelay = comHora.filter(s => s.emis != null).map(s => s.emis - s.fecha);
  const recebDelay = BR.filter(s => s.receb != null && s.emisB != null).map(s => s.receb - s.emisB);
  // chegada dos BU ao TSE (Brasília) em blocos de 10 min: há buracos?
  const recebHist = Object.fromEntries(Object.entries(contar(BR.filter(s => s.receb != null), s => hhmm(Math.floor(s.receb / 10) * 10))).sort((a, b) => a[0].localeCompare(b[0])));
  const recebPorUf = Object.fromEntries([...new Set(BR.map(s => s.uf))].sort().map(u => { const l = BR.filter(s => s.uf === u && s.receb != null).map(s => s.receb).sort((a, b) => a - b); return [u, { primeiro: hhmm(l[0]), mediana: hhmm(l[l.length >> 1]), ultimo: hhmm(l[l.length - 1]) }]; }));
  // vazão: eleitores por hora de votação
  for (const s of comHora) s.vazao = s.dur > 0 ? s.comp / (s.dur / 60) : null;
  const vazaoAlta = comHora.filter(s => s.vazao != null && s.vazao > 75).sort((x, y) => y.vazao - x.vazao);

  // ---- pico 19h-20h ----
  const tarde = comHora.filter(s => s.fechaB >= 19 * 60);
  const normal = comHora.filter(s => s.fechaB < 19 * 60);
  const media = (l, f) => l.length ? l.reduce((t, s) => t + f(s), 0) / l.length : null;
  const resumoGrupo = l => ({
    secoes: l.length, aptosMedio: r1(media(l, s => s.aptos)), compMedio: r1(media(l, s => s.comp)), comparecimentoPct: r2(100 * l.reduce((t, s) => t + s.comp, 0) / l.reduce((t, s) => t + s.aptos, 0)),
    aberturaMediana: hhmm(mediana(l.map(s => s.abreB))), duracaoMedianaMin: Math.round(mediana(l.map(s => s.dur))), emissaoMenosEncerramentoMedianaMin: r1(mediana(l.filter(s => s.emis != null).map(s => s.emis - s.fecha))),
    biomPct: r2(100 * l.reduce((t, s) => t + (s.biom || 0), 0) / l.reduce((t, s) => t + s.comp, 0)),
    cargaNoDiaDaEleicao: l.filter(s => s.carga != null && s.carga >= 0).length,
    pctLula: r2(100 * l.reduce((t, s) => t + s.a, 0) / l.reduce((t, s) => t + s.val, 0))
  });
  const porUfTarde = contar(tarde, s => s.uf);
  const porMunTarde = contar(tarde, s => s.uf + ' ' + s.munNome);
  const porZonaTarde = contar(tarde, s => s.uf + ' ' + s.munNome + ' Z' + s.zona);
  const porLocalTarde = contar(tarde, s => s.chaveLocal);
  // quantas seções do mesmo local também fecharam tarde (fila no prédio x urna isolada)
  const porLocal = new Map();
  for (const s of comHora) (porLocal.get(s.chaveLocal) || porLocal.set(s.chaveLocal, []).get(s.chaveLocal)).push(s);
  let tardeIsolada = 0, tardeEmLocalTodoTarde = 0, tardeEmLocalMisto = 0;
  for (const s of tarde) {
    const L = porLocal.get(s.chaveLocal); const nT = L.filter(x => x.fechaB >= 18 * 60 + 30).length;
    if (L.length === 1) tardeIsolada++; else if (nT === L.length) tardeEmLocalTodoTarde++; else if (nT === 1) tardeIsolada++; else tardeEmLocalMisto++;
  }
  // relógio deslocado? seção com abertura E encerramento deslocados em relação aos vizinhos do local
  const relogio = [];
  for (const L of porLocal.values()) {
    if (L.length < 3) continue;
    const medA = mediana(L.map(s => s.abreB));
    for (const s of L) {
      const dA = s.abreB - medA;
      if (Math.abs(dA) >= 45) relogio.push({ s, dA });
    }
  }
  const relogioComFechaTarde = relogio.filter(x => x.dA > 0 && x.s.fechaB >= 19 * 60);
  // formato do pico: minutos depois das 19:00 x minutos depois das 17:00 (fila real deixaria uma cauda contínua 17h->19h)
  const minApos = (l, h0) => { const o = Array(15).fill(0); for (const s of l) { const m = Math.floor(s.fechaB - h0); if (m >= 0 && m < 15) o[m]++; } return o; };
  const curva17 = minApos(comHora, 17 * 60), curva19 = minApos(tarde, 19 * 60);
  const norm = a => { const t = a.reduce((x, y) => x + y, 0); return a.map(x => r1(100 * x / t)); };
  const faixasFecha = [[17 * 60, 17 * 60 + 30], [17 * 60 + 30, 18 * 60], [18 * 60, 18 * 60 + 30], [18 * 60 + 30, 18 * 60 + 55], [18 * 60 + 55, 19 * 60], [19 * 60, 19 * 60 + 15], [19 * 60 + 15, 24 * 60]]
    .map(([i, f]) => ({ faixa: hhmm(i) + '-' + (f >= 24 * 60 ? '24:00' : hhmm(f)), secoes: comHora.filter(s => s.fechaB >= i && s.fechaB < f).length }));
  // emissão do BU muito depois do encerramento: mesmas zonas do pico?
  const zonasTarde = new Set(tarde.map(s => s.uf + '|' + s.mun + '|' + s.zona));
  const emisAtrasada = comHora.filter(s => s.emis != null && s.emis - s.fecha > 60);
  // tardias x vizinhas que fecharam antes das 18h, no mesmo local (comparecimento e % do 13)
  let wv = 0, dComp = 0, dA = 0, nMist = 0;
  for (const L of porLocal.values()) {
    const T = L.filter(s => s.fechaB >= 19 * 60), N = L.filter(s => s.fechaB < 18 * 60);
    if (!T.length || !N.length) continue;
    const sm = (l, f) => l.reduce((t, s) => t + f(s), 0), w = sm(T, s => s.val);
    dComp += w * (sm(T, s => s.comp) / sm(T, s => s.aptos) - sm(N, s => s.comp) / sm(N, s => s.aptos));
    dA += w * (sm(T, s => s.a) / sm(T, s => s.val) - sm(N, s => s.a) / sm(N, s => s.val)); wv += w; nMist++;
  }
  // fração de cada zona (UF+zona) que fechou depois das 19h
  const porZonaUf = new Map();
  for (const s of comHora) { const k = s.uf + ' Z' + s.zona; const z = porZonaUf.get(k) || porZonaUf.set(k, { n: 0, t: 0 }).get(k); z.n++; if (s.fechaB >= 19 * 60) z.t++; }
  const zonasComTarde = [...porZonaUf.values()].filter(z => z.t > 0);
  const porZonaMun = new Map();
  for (const s of comHora) { const k = s.uf + ' ' + s.munNome + ' Z' + s.zona; const z = porZonaMun.get(k) || porZonaMun.set(k, { n: 0, t: 0 }).get(k); z.n++; if (s.fechaB >= 19 * 60) z.t++; }
  // curva do encerramento (Brasília) em blocos de 15 min a partir de 17h
  const histFecha = contar(comHora.filter(s => s.fechaB >= 16 * 60 + 45), s => hhmm(Math.min(Math.floor(s.fechaB / 15) * 15, 22 * 60)));
  const histFechaOrd = Object.fromEntries(Object.entries(histFecha).sort((a, b) => a[0].localeCompare(b[0])));
  // RJ: tarde por município
  const ufsTop = ['RJ', 'SP', 'BA', 'PE', 'PB'];
  const munPorUfTarde = Object.fromEntries(ufsTop.map(u => [u, top(contar(tarde.filter(s => s.uf === u), s => s.munNome), 8)]));
  // comparar com tamanho de seção: % de seções fechando tarde por faixa de comparecimento
  const faixasComp = [[0, 200], [200, 300], [300, 350], [350, 400], [400, 450], [450, 2000]].map(([i, f]) => {
    const l = comHora.filter(s => s.comp >= i && s.comp < f);
    return { faixaComparecimento: i + '-' + (f - 1), secoes: l.length, fechamTarde19h: l.filter(s => s.fechaB >= 19 * 60).length, pct: pct(l.filter(s => s.fechaB >= 19 * 60).length, l.length) };
  });
  // seções tardias: correlação com o resto do local (os outros do local também atrasaram?)
  const atrasoLocal = tarde.map(s => { const L = porLocal.get(s.chaveLocal); return L.length > 1 ? mediana(L.filter(x => x !== s).map(x => x.fechaB)) : null; }).filter(x => x != null);
  const zz = todas.filter(s => s.uf === 'ZZ');
  R.horarios = {
    observacao: 'Horário de votação unificado: 8h às 17h de Brasília. Fuso de cada município inferido pela mediana da abertura local.',
    municipiosComFusoDiferenteDaUf: fusoDivergente.length, fusoDivergente: fusoDivergente.slice(0, 40),
    secoesComFusoCorrigido: BR.filter(s => s.fuso !== (FUSO_UF[s.uf] || 0)).length,
    apos19hBsbPeloFusoDaUf: BR.filter(s => s.fechaUfB != null && s.fechaUfB >= 19 * 60).length,
    apos19hBsbPeloFusoInferido: tarde.length,
    semHorario: { brasil: BR.filter(s => s.abre == null || s.fecha == null).length, exterior: zz.filter(s => s.abre == null || s.fecha == null).length },
    aberturaBsbPor15min: histAbre,
    abreAntes0730Bsb: abreCedo.length, exemplosAbreCedo: abreCedo.sort((x, y) => x.abreB - y.abreB).slice(0, 10).map(s => ({ secao: id(s), abertura: s.abreS, encerramento: s.fechaS, fuso: s.fuso })),
    abreDepois09hBsb: abreTarde.length, abreDepoisPorUf: contar(abreTarde, s => s.uf), abreDepoisPorMunicipio: top(contar(abreTarde, s => s.uf + ' ' + s.munNome), 8),
    comparecimentoPctAbreDepois09h: pct(abreTarde.reduce((t, s) => t + s.comp, 0), abreTarde.reduce((t, s) => t + s.aptos, 0)),
    abreDepois09hComCargaNoDia: abreTarde.filter(s => s.carga != null && s.carga >= 0).length,
    abreDepois10hBsb: comHora.filter(s => s.abreB > 10 * 60).length, abreDepois12hBsb: comHora.filter(s => s.abreB > 12 * 60).length,
    exemplosAbreTarde: abreTarde.sort((x, y) => y.abreB - x.abreB).slice(0, 15).map(s => ({ secao: id(s), abertura: s.abreS, encerramento: s.fechaS, carga: s.cargaS, comp: s.comp, aptos: s.aptos })),
    fechaAntes17hBsb: fechaCedo.length, fechaAntesPorUf: contar(fechaCedo, s => s.uf),
    fechaAntes1655Bsb: comHora.filter(s => s.fechaB < 16 * 60 + 55).length,
    fechaAntes16hBsb: comHora.filter(s => s.fechaB < 16 * 60).length,
    exemplosFechaCedo: fechaCedo.sort((x, y) => x.fechaB - y.fechaB).slice(0, 15).map(s => ({ secao: id(s), abertura: s.abreS, encerramento: s.fechaS, fuso: s.fuso, aptos: s.aptos, comp: s.comp, compPct: pct(s.comp, s.aptos) })),
    fechaCedoComTodosVotando: fechaCedo.filter(s => s.comp === s.aptos).length,
    encerramentoBsbPor15min: histFechaOrd,
    emissaoAntesDoEncerramento: emisAntes.length, exemplosEmisAntes: emisAntes.slice(0, 10).map(s => ({ secao: id(s), encerramento: s.fechaS, emissao: s.emisS })),
    recebimentoAntesDaEmissao: recebAntes.length, exemplosRecebAntes: recebAntes.slice(0, 10).map(s => ({ secao: id(s), emissao: s.emisS, recebido: s.recebS })),
    encerramentoAntesDaAbertura: abreAposFecha.length,
    horarioForaDoDia25: foraDoDia.length, exemplosForaDoDia: foraDoDia.slice(0, 10).map(s => ({ secao: id(s), abertura: s.abreS, encerramento: s.fechaS, emissao: s.emisS })),
    duracaoMin: quantis(durs, [0, 0.001, 0.01, 0.5, 0.99, 0.999, 1]),
    emissaoMenosEncerramentoMin: quantis(emisDelay, [0, 0.01, 0.5, 0.99, 0.999, 1]),
    emissaoMaisDe60minAposEncerrar: emisDelay.filter(x => x > 60).length,
    recebimentoMenosEmissaoMin: quantis(recebDelay, [0, 0.01, 0.5, 0.9, 0.99, 0.999, 1]),
    recebidoNoDia26ouDepois: BR.filter(s => s.receb != null && s.receb >= 1440).length,
    recebidoAntesDoEncerramentoBsb: BR.filter(s => s.receb != null && s.fechaB != null && s.receb < s.fechaB).length,
    recebidoMaisDe5hAposEmissao: recebDelay.filter(x => x > 300).length,
    recebidoTardePorMunicipio: top(contar(BR.filter(s => s.receb != null && s.emisB != null && s.receb - s.emisB > 300), s => s.uf + ' ' + s.munNome + ' Z' + s.zona), 10),
    exemplosRecebidoTarde: BR.filter(s => s.receb != null && s.emisB != null && s.receb - s.emisB > 300).sort((x, y) => (y.receb - y.emisB) - (x.receb - x.emisB)).slice(0, 10).map(s => ({ secao: id(s), emissaoLocal: s.emisS, recebidoBsb: s.recebS })),
    chegadaDosBuBsbPor10min: recebHist, chegadaPorUf: recebPorUf,
    chegadaAntesDas18h: BR.filter(s => s.receb != null && s.receb < 18 * 60).length, chegadaEntre1730e1900: BR.filter(s => s.receb != null && s.receb >= 17 * 60 + 30 && s.receb < 19 * 60).length,
    vazaoEleitoresPorHora: quantis(comHora.filter(s => s.vazao != null).map(s => s.vazao), [0.5, 0.99, 0.999, 1]).valueOf(),
    vazaoAcima75porHora: vazaoAlta.length, exemplosVazao: vazaoAlta.slice(0, 10).map(s => ({ secao: id(s), comp: s.comp, abertura: s.abreS, encerramento: s.fechaS, porHora: r1(s.vazao) })),
    pico19h: {
      total: tarde.length, porUf: porUfTarde, municipiosTop: top(porMunTarde, 15), zonasTop: top(porZonaTarde, 15), locaisDistintos: Object.keys(porLocalTarde).length,
      maxSecoesTardiasNumLocal: Object.values(porLocalTarde).reduce((m, v) => Math.max(m, v), 0),
      municipiosPorUf: munPorUfTarde,
      padraoNoLocal: { isolada: tardeIsolada, localInteiroAtrasado: tardeEmLocalTodoTarde, localMisto: tardeEmLocalMisto },
      encerramentoMedianoDasOutrasSecoesDoMesmoLocal: hhmm(mediana(atrasoLocal)),
      tardias: resumoGrupo(tarde), normais: resumoGrupo(normal),
      porFaixaDeComparecimento: faixasComp,
      apos20h: comHora.filter(s => s.fechaB >= 20 * 60).length, apos21h: comHora.filter(s => s.fechaB >= 21 * 60).length,
      estritamenteDepoisDas19h: comHora.filter(s => s.fechaB > 19 * 60).length,
      encerramentoExatamente19h00m00s: comHora.filter(s => s.fechaB === 19 * 60).length, encerramentoExatamente17h00m00s: comHora.filter(s => s.fechaB === 17 * 60).length,
      exemplos19h00m00s: comHora.filter(s => s.fechaB === 19 * 60).map(id),
      encerramentoPorFaixa: faixasFecha,
      curvaMinutoApos17hPct: norm(curva17), curvaMinutoApos19hPct: norm(curva19),
      emissaoMaisDe60minAposEncerrar: emisAtrasada.length, emissaoAtrasadaEmZonaDoPico: emisAtrasada.filter(s => zonasTarde.has(s.uf + '|' + s.mun + '|' + s.zona)).length,
      horaDaEmissaoAtrasadaBsb: Object.fromEntries(Object.entries(contar(emisAtrasada, s => hhmm(Math.floor(s.emisB / 30) * 30))).sort()),
      exemplosEmissaoAtrasada: emisAtrasada.sort((x, y) => (y.emis - y.fecha) - (x.emis - x.fecha)).slice(0, 8).map(s => ({ secao: id(s), encerramento: s.fechaS, emissao: s.emisS, recebido: s.recebS })),
      tardiasMenosVizinhasDoMesmoLocal: { locais: nMist, comparecimentoPP: r2(100 * dComp / wv), pct13PP: r2(100 * dA / wv) },
      zonasComAlgumaTardia: zonasComTarde.length, zonasPorFracaoTardia: contar(zonasComTarde, z => z.t / z.n >= 0.9 ? '>=90%' : z.t / z.n >= 0.5 ? '50-90%' : z.t / z.n >= 0.1 ? '10-50%' : '<10%'),
      secoesEmZonasComMetadeOuMaisTardias: zonasComTarde.filter(z => z.t / z.n >= 0.5).reduce((t, z) => t + z.t, 0),
      zonasMaisAtingidas: [...porZonaMun.entries()].filter(([, z]) => z.t >= 50).sort((a, b) => b[1].t - a[1].t).slice(0, 15).map(([k, z]) => ({ zona: k, tardias: z.t, secoes: z.n, pct: pct(z.t, z.n) })),
      exemplosMaisTarde: [...tarde].sort((x, y) => y.fechaB - x.fechaB).slice(0, 12).map(s => ({ secao: id(s), abertura: s.abreS, encerramento: s.fechaS, fuso: s.fuso, comp: s.comp, aptos: s.aptos, carga: s.cargaS }))
    },
    aberturaDeslocada45minDoLocal: relogio.length, deslocadaParaDepois: relogio.filter(x => x.dA > 0).length, deslocadaParaAntes: relogio.filter(x => x.dA < 0).length,
    deslocadaDepoisEFechaApos19h: relogioComFechaTarde.length,
    exemplosRelogio: relogio.sort((x, y) => Math.abs(y.dA) - Math.abs(x.dA)).slice(0, 10).map(x => ({ secao: id(x.s), abertura: x.s.abreS, encerramento: x.s.fechaS, difMin: Math.round(x.dA), carga: x.s.cargaS }))
  };
}

// ======================================================================
// 3. Carga das urnas
// ======================================================================
{
  const porDia = contar(todas, s => (s.cargaS || '').slice(0, 10));
  const porDiaOrd = Object.fromEntries(Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0])));
  const noDia = BR.filter(s => s.carga != null && s.carga >= 0);
  const depoisDaVotacao = BR.filter(s => s.carga != null && s.abre != null && s.carga > s.abre);
  const antes1t = BR.filter(s => s.carga != null && s.carga < -21 * 1440); // antes de 04/10 (1º turno)
  const media = (l, f) => l.length ? l.reduce((t, s) => t + f(s), 0) / l.length : null;
  const g = l => ({ secoes: l.length, aberturaMedianaBsb: hhmm(mediana(l.filter(s => s.abreB != null).map(s => s.abreB))), encerramentoMedianoBsb: hhmm(mediana(l.filter(s => s.fechaB != null).map(s => s.fechaB))), biomPct: r2(100 * l.reduce((t, s) => t + (s.biom || 0), 0) / l.reduce((t, s) => t + s.comp, 0)), compPct: r2(100 * l.reduce((t, s) => t + s.comp, 0) / l.reduce((t, s) => t + s.aptos, 0)), fecha19h: l.filter(s => s.fechaB >= 19 * 60).length });
  // urna de contingência: carga em data diferente da maioria das urnas do mesmo município
  const porMun = new Map();
  for (const s of BR) { if (s.carga == null) continue; const k = s.uf + '|' + s.mun; (porMun.get(k) || porMun.set(k, []).get(k)).push(s); }
  const cargaDestoaMun = [];
  for (const l of porMun.values()) { const med = mediana(l.map(s => s.carga)); for (const s of l) if (Math.abs(s.carga - med) > 3 * 1440) cargaDestoaMun.push(s); }
  R.carga = {
    porDia: porDiaOrd, semData: todas.filter(s => s.carga == null).length,
    antesDe04_10: antes1t.length, cargaNoDiaDaEleicao: noDia.length, cargaNoDiaPorUf: contar(noDia, s => s.uf),
    cargaDepoisDaAbertura: depoisDaVotacao.length, exemplosCargaDepois: depoisDaVotacao.slice(0, 10).map(s => ({ secao: id(s), carga: s.cargaS, abertura: s.abreS })),
    cargaNoDia: g(noDia), cargaAntes: g(BR.filter(s => s.carga != null && s.carga < 0)),
    exemplosCargaNoDia: noDia.slice(0, 15).map(s => ({ secao: id(s), carga: s.cargaS, abertura: s.abreS, encerramento: s.fechaS, urna: s.urna, comp: s.comp })),
    cargaMaisDe3DiasDiferenteDoMunicipio: cargaDestoaMun.length, cargaDestoaPorUf: contar(cargaDestoaMun, s => s.uf),
    cargaEntre05e23_10: BR.filter(s => s.carga != null && s.carga >= -20 * 1440 && s.carga < -1440).length,
    cargaEntre05e23_10ZonasTop: top(contar(BR.filter(s => s.carga != null && s.carga >= -20 * 1440 && s.carga < -1440), s => s.uf + ' ' + s.munNome + ' Z' + s.zona), 10),
    cargaNaVespera24_10: BR.filter(s => s.carga != null && s.carga >= -1440 && s.carga < 0).length,
    cargaNaVesperaMunicipiosTop: top(contar(BR.filter(s => s.carga != null && s.carga >= -1440 && s.carga < 0), s => s.uf + ' ' + s.munNome), 12),
    cargaNaVespera: g(BR.filter(s => s.carga != null && s.carga >= -1440 && s.carga < 0)),
    horaDaCarga: Object.fromEntries(Object.entries(contar(BR, s => (s.cargaS || '').slice(11, 13) + 'h')).sort())
  };
}

// ======================================================================
// 4. Distribuição dos votos
// ======================================================================
{
  // último dígito
  const digitos = (lista, f, min) => { const o = Array(10).fill(0); for (const s of lista) { const v = f(s); if (v >= min) o[v % 10]++; } return o; };
  const ultDig = {};
  // (brancos e nulos ficam de fora: quase sempre < 20 por seção, e números pequenos não têm último dígito uniforme)
  for (const [nome, f] of [['lula13', s => s.a], ['flavio22', s => s.b], ['comparecimento', s => s.comp], ['abstencoes', s => s.abst]]) {
    const o = digitos(BR, f, 10); ultDig[nome] = { contagem: o, pctPorDigito: o.map(x => r2(100 * x / o.reduce((a, b) => a + b, 0))), ...quiQuadrado(o) };
  }
  const ultDigUf = {};
  for (const uf of [...new Set(BR.map(s => s.uf))].sort()) {
    const l = BR.filter(s => s.uf === uf);
    ultDigUf[uf] = { lula13: quiQuadrado(digitos(l, s => s.a, 10)).p, flavio22: quiQuadrado(digitos(l, s => s.b, 10)).p };
  }
  // (o teste dos DOIS últimos dígitos não vale aqui: os votos por seção ficam quase todos entre 0 e 350,
  //  faixa estreita demais para que 00..99 sejam igualmente prováveis — ele "reprova" até dados perfeitos.)
  // comparecimento extremo
  const comAptos = BR.filter(s => s.aptos >= 100);
  const compAlto = comAptos.filter(s => s.comp / s.aptos > 0.95), compBaixo = comAptos.filter(s => s.comp / s.aptos < 0.40);
  const comp100 = comAptos.filter(s => s.comp === s.aptos);
  // brancos+nulos zero com muitos votos
  const bnZero = BR.filter(s => s.comp >= 150 && s.bn === 0);
  // esperado de bn zero (Poisson) com a taxa nacional, a do município e a do local (sem a própria seção)
  const taxaBn = BR.reduce((t, s) => t + s.bn, 0) / BR.reduce((t, s) => t + s.comp, 0);
  const somaBn = new Map(), somaBnMun = new Map();
  for (const s of BR) {
    const L = somaBn.get(s.chaveLocal) || somaBn.set(s.chaveLocal, { bn: 0, c: 0 }).get(s.chaveLocal); L.bn += s.bn; L.c += s.comp;
    const k = s.uf + '|' + s.mun, M = somaBnMun.get(k) || somaBnMun.set(k, { bn: 0, c: 0 }).get(k); M.bn += s.bn; M.c += s.comp;
  }
  let espMun = 0, espLocal = 0;
  for (const s of BR) {
    if (s.comp < 150) continue;
    const M = somaBnMun.get(s.uf + '|' + s.mun), L = somaBn.get(s.chaveLocal);
    const rm = (M.bn - s.bn) / Math.max(1, M.c - s.comp); espMun += Math.exp(-s.comp * rm);
    espLocal += L.c - s.comp > 0 ? Math.exp(-s.comp * (L.bn - s.bn) / (L.c - s.comp)) : Math.exp(-s.comp * rm);
  }
  const bnTaxaUf = Object.fromEntries([...new Set(BR.map(s => s.uf))].sort().map(u => { const l = BR.filter(s => s.uf === u); return [u, pct(l.reduce((t, s) => t + s.bn, 0), l.reduce((t, s) => t + s.comp, 0))]; }));
  // histograma da % do 13 por seção
  const hist = Array(101).fill(0); const histVal = Array(101).fill(0);
  for (const s of BR) if (s.val >= 50) { const p = Math.round(100 * s.a / s.val); hist[p]++; histVal[p] += s.val; }
  // picos: bins que destoam dos vizinhos (média dos 2 de cada lado)
  const picos = [];
  for (let i = 2; i <= 98; i++) { const viz = (hist[i - 2] + hist[i - 1] + hist[i + 1] + hist[i + 2]) / 4; if (viz > 50 && Math.abs(hist[i] - viz) / Math.sqrt(viz) > 5) picos.push({ pct: i, secoes: hist[i], vizinhos: Math.round(viz) }); }
  // histograma nacional em faixas de 5 pontos e seus máximos locais (bimodalidade)
  const hist5 = Array(20).fill(0); for (let i = 0; i <= 100; i++) hist5[Math.min(19, Math.floor(i / 5))] += hist[i];
  const maximos5 = hist5.map((v, i) => (i > 0 && i < 19 && v > hist5[i - 1] && v > hist5[i + 1]) ? (i * 5) + '-' + (i * 5 + 5) + '%' : null).filter(Boolean);
  // bimodalidade por UF (a mistura de regiões gera dois picos?): moda por UF
  const modaUf = {};
  for (const uf of [...new Set(BR.map(s => s.uf))].sort()) {
    const h = Array(21).fill(0); for (const s of BR) if (s.uf === uf && s.val >= 50) h[Math.min(20, Math.floor(20 * s.a / s.val))]++;
    modaUf[uf] = { modaFaixa: h.indexOf(Math.max(...h)) * 5 + '-' + (h.indexOf(Math.max(...h)) * 5 + 5) + '%', histograma5pp: h };
  }
  // outliers de % dentro do local (binomial com a média das OUTRAS seções do local)
  const porLocal = new Map();
  for (const s of BR) (porLocal.get(s.chaveLocal) || porLocal.set(s.chaveLocal, []).get(s.chaveLocal)).push(s);
  const zs = []; let sz2 = 0, nz = 0;
  const zsComp = []; let szc2 = 0, nzc = 0;
  for (const L of porLocal.values()) {
    if (L.length < 3) continue;
    const A = L.reduce((t, s) => t + s.a, 0), V = L.reduce((t, s) => t + s.val, 0), C = L.reduce((t, s) => t + s.comp, 0), AP = L.reduce((t, s) => t + s.aptos, 0);
    for (const s of L) {
      const ov = V - s.val, oa = A - s.a;
      if (s.val >= 50 && ov >= 100) {
        const p = Math.min(Math.max(oa / ov, 0.001), 0.999), z = (s.a - s.val * p) / Math.sqrt(s.val * p * (1 - p));
        s.zLocal = z; zs.push(s); sz2 += z * z; nz++;
      }
      const oap = AP - s.aptos, oc = C - s.comp;
      if (s.aptos >= 50 && oap >= 100) {
        const p = Math.min(Math.max(oc / oap, 0.001), 0.999), z = (s.comp - s.aptos * p) / Math.sqrt(s.aptos * p * (1 - p));
        s.zComp = z; zsComp.push(s); szc2 += z * z; nzc++;
      }
    }
  }
  const disp = sz2 / nz; // fator de dispersão (1 = binomial puro)
  const contZ = (l, k, lim) => l.filter(s => Math.abs(s[k]) > lim).length;
  const exZ = [...zs].sort((x, y) => Math.abs(y.zLocal) - Math.abs(x.zLocal)).slice(0, 15).map(s => {
    const L = porLocal.get(s.chaveLocal); const oa = L.reduce((t, x) => t + x.a, 0) - s.a, ov = L.reduce((t, x) => t + x.val, 0) - s.val;
    return { secao: id(s), local: s.local, secoesNoLocal: L.length, val: s.val, pct13: r1(100 * s.a / s.val), pct13OutrasDoLocal: r1(100 * oa / ov), z: r1(s.zLocal), zAjustadoDispersao: r1(s.zLocal / Math.sqrt(disp)) };
  });
  const exZc = [...zsComp].sort((x, y) => Math.abs(y.zComp) - Math.abs(x.zComp)).slice(0, 10).map(s => {
    const L = porLocal.get(s.chaveLocal); const oc = L.reduce((t, x) => t + x.comp, 0) - s.comp, oap = L.reduce((t, x) => t + x.aptos, 0) - s.aptos;
    return { secao: id(s), aptos: s.aptos, comp: s.comp, compPct: pct(s.comp, s.aptos), compPctOutrasDoLocal: pct(oc, oap), z: r1(s.zComp) };
  });
  // a % de cada seção destoa mais em seções "especiais"? (ex.: as de número alto = seções novas/jovens) — sinal benigno conhecido
  // impressão digital turnout x share (Klimek): seções com comparecimento >= 95% E um candidato >= 90%
  const klimek = comAptos.filter(s => s.comp / s.aptos >= 0.95 && s.val > 0 && (s.a / s.val >= 0.9 || s.b / s.val >= 0.9));
  // resultados idênticos (aptos, comp, 13, 22, branco, nulo) entre seções diferentes
  const assin = new Map();
  for (const s of BR) if (s.comp >= 100) { const k = [s.aptos, s.comp, s.a, s.b, s.branco, s.nulo].join(','); (assin.get(k) || assin.set(k, []).get(k)).push(s); }
  const ident = [...assin.values()].filter(l => l.length > 1);
  const identMesmoLocal = ident.filter(l => new Set(l.map(s => s.chaveLocal)).size < l.length);
  // só votos (13, 22, br, nulo) idênticos no mesmo local
  const assinV = new Map();
  for (const s of BR) if (s.val >= 100) { const k = s.chaveLocal + '#' + [s.a, s.b, s.branco, s.nulo].join(','); (assinV.get(k) || assinV.set(k, []).get(k)).push(s); }
  const identVotosLocal = [...assinV.values()].filter(l => l.length > 1);
  const paresIdentObs = identVotosLocal.reduce((t, l) => t + l.length * (l.length - 1) / 2, 0);
  // quantos pares idênticos o ACASO produziria? simulação: cada seção sorteia seus votos com as proporções do próprio local
  let semente = 12345; // mulberry32: sorteio reprodutível
  const rand = () => { semente = (semente + 0x6D2B79F5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  const binom = (n, p) => { if (n <= 0 || p <= 0) return 0; if (p >= 1) return n; if (n < 30) { let k = 0; for (let i = 0; i < n; i++) if (rand() < p) k++; return k; } return Math.max(0, Math.min(n, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gauss()))); };
  const simIdent = [];
  for (let r = 0; r < 10; r++) {
    let c = 0;
    for (const L of porLocal.values()) {
      if (L.length < 2) continue;
      const C = L.reduce((t, s) => t + s.comp, 0); if (!C) continue;
      const pa = L.reduce((t, s) => t + s.a, 0) / C, pb = L.reduce((t, s) => t + s.b, 0) / C, pbr = L.reduce((t, s) => t + s.branco, 0) / C;
      const vistos = new Map();
      for (const s of L) {
        const a = binom(s.comp, pa), b = binom(s.comp - a, pb / Math.max(1e-9, 1 - pa)), br = binom(s.comp - a - b, pbr / Math.max(1e-9, 1 - pa - pb));
        if (a + b < 100) continue;
        const k = a + ',' + b + ',' + br + ',' + (s.comp - a - b - br); vistos.set(k, (vistos.get(k) || 0) + 1);
      }
      for (const v of vistos.values()) c += v * (v - 1) / 2;
    }
    simIdent.push(c);
  }
  // perfil dos outliers dentro do local: são a seção de número mais alto (seção nova) do local?
  const outl = zs.filter(s => Math.abs(s.zLocal) / Math.sqrt(disp) > 4);
  const maiorNum = outl.filter(s => porLocal.get(s.chaveLocal).every(x => x.sec <= s.sec)).length;
  const maiorNumEsperado = outl.reduce((t, s) => t + 1 / porLocal.get(s.chaveLocal).length, 0);
  const outlLocalDif = outl.filter(s => cadDe(s).local !== s.local).length;
  // unânimes / quase
  const unanimes = BR.filter(s => s.val >= 50 && (s.a === 0 || s.b === 0));
  const quase = BR.filter(s => s.val >= 100 && Math.min(s.a, s.b) / s.val < 0.02);
  // seções com 0 votos válidos mas comparecimento
  const zeroVal = BR.filter(s => s.comp > 0 && s.val === 0);
  // comparecimento ≤ 5 em seção com ≥ 100 aptos
  const quaseVazia = BR.filter(s => s.aptos >= 100 && s.comp <= 5);
  R.distribuicao = {
    ultimoDigito: ultDig, ultimoDigitoPValorPorUf: ultDigUf,
    comparecimento: {
      secoesCom100aptos: comAptos.length, acima95pct: compAlto.length, acima95PorUf: contar(compAlto, s => s.uf), igual100pct: comp100.length,
      abaixo40pct: compBaixo.length, abaixo40PorUf: contar(compBaixo, s => s.uf),
      exemplosAlto: compAlto.sort((x, y) => y.comp / y.aptos - x.comp / x.aptos).slice(0, 12).map(s => ({ secao: id(s), aptos: s.aptos, comp: s.comp, pct13: pct(s.a, s.val), biom: s.biom, tipoLocal: cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec)?.tipoLocal, nomeLocal: cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec)?.nomeLocal })),
      exemplosBaixo: compBaixo.sort((x, y) => x.comp / x.aptos - y.comp / y.aptos).slice(0, 12).map(s => ({ secao: id(s), aptos: s.aptos, comp: s.comp, nomeLocal: cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec)?.nomeLocal, tipoLocal: cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec)?.tipoLocal })),
      quaseVazias: quaseVazia.length, exemplosQuaseVazias: quaseVazia.slice(0, 10).map(s => ({ secao: id(s), aptos: s.aptos, comp: s.comp, nomeLocal: cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec)?.nomeLocal }))
    },
    brancoNuloZero: { secoesCom150votantes: BR.filter(s => s.comp >= 150).length, comZeroBrancoNulo: bnZero.length, taxaMediaBrancoNuloPct: r2(100 * taxaBn),
      esperadoComTaxaNacional: Math.round(BR.filter(s => s.comp >= 150).reduce((t, s) => t + Math.exp(-s.comp * taxaBn), 0)),
      esperadoComTaxaDoMunicipio: Math.round(espMun), esperadoComTaxaDoLocal: Math.round(espLocal), taxaBrancoNuloPorUf: bnTaxaUf,
      porUf: contar(bnZero, s => s.uf), municipiosTop: top(contar(bnZero, s => s.uf + ' ' + s.munNome), 10),
      exemplos: bnZero.sort((x, y) => y.comp - x.comp).slice(0, 10).map(s => ({ secao: id(s), comp: s.comp, a: s.a, b: s.b })) },
    histPct13PorSecao: hist, histNacional5pp: hist5, maximosLocaisHistograma5pp: maximos5, picosNoHistograma: picos, modaPorUf: modaUf,
    outlierDentroDoLocal: {
      secoesTestadas: nz, fatorDispersao: r2(disp),
      acimaZ4: contZ(zs, 'zLocal', 4), esperadoBinomialZ4: Math.round(nz * PZ(4)),
      acimaZ6: contZ(zs, 'zLocal', 6), acimaZ8: contZ(zs, 'zLocal', 8),
      acimaZ4AjustadoDispersao: zs.filter(s => Math.abs(s.zLocal) / Math.sqrt(disp) > 4).length,
      acimaZ6AjustadoDispersao: zs.filter(s => Math.abs(s.zLocal) / Math.sqrt(disp) > 6).length,
      lado: { mais13: zs.filter(s => s.zLocal / Math.sqrt(disp) > 4).length, mais22: zs.filter(s => s.zLocal / Math.sqrt(disp) < -4).length },
      porUfAjustadoZ4: contar(zs.filter(s => Math.abs(s.zLocal) / Math.sqrt(disp) > 4), s => s.uf),
      outliersQueSaoASecaoDeNumeroMaisAltoDoLocal: maiorNum, esperadoSeFosseAoAcaso: Math.round(maiorNumEsperado),
      outliersComLocalDiferenteDoCadastro: outlLocalDif,
      exemplos: exZ
    },
    outlierComparecimentoNoLocal: { secoesTestadas: nzc, fatorDispersao: r2(szc2 / nzc), acimaZ4: contZ(zsComp, 'zComp', 4), acimaZ6Ajust: zsComp.filter(s => Math.abs(s.zComp) / Math.sqrt(szc2 / nzc) > 6).length, exemplos: exZc },
    comparecimento95eUmCandidato90: klimek.length, klimekPorCandidato: { lula13: klimek.filter(s => s.a / s.val >= 0.9).length, flavio22: klimek.filter(s => s.b / s.val >= 0.9).length },
    exemplosKlimek: klimek.slice(0, 10).map(s => ({ secao: id(s), aptos: s.aptos, comp: s.comp, a: s.a, b: s.b, nomeLocal: cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec)?.nomeLocal })),
    resultadosIdenticos: { gruposSecoesDiferentes: ident.length, gruposNoMesmoLocal: identMesmoLocal.length, exemplos: ident.slice(0, 8).map(l => l.map(s => id(s) + ' [' + [s.aptos, s.comp, s.a, s.b, s.branco, s.nulo].join(',') + ']')) },
    votosIdenticosNoMesmoLocal: { grupos: identVotosLocal.length, paresObservados: paresIdentObs, paresEsperadosPorAcasoSimulacao: simIdent, exemplos: identVotosLocal.slice(0, 8).map(l => l.map(s => id(s) + ' [13=' + s.a + ' 22=' + s.b + ' br=' + s.branco + ' nu=' + s.nulo + ' aptos=' + s.aptos + ']')) },
    unanimes: { total: unanimes.length, para13: unanimes.filter(s => s.b === 0).length, para22: unanimes.filter(s => s.a === 0).length, porUf: contar(unanimes, s => s.uf),
      exemplos: unanimes.sort((x, y) => y.val - x.val).slice(0, 12).map(s => ({ secao: id(s), val: s.val, a: s.a, b: s.b, nomeLocal: cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec)?.nomeLocal })) },
    unanimesEmLocalIndigena: unanimes.filter(s => INDIGENA.test(cadDe(s)?.nomeLocal || '')).length,
    unanimesPara22: unanimes.filter(s => s.a === 0).map(s => ({ secao: id(s), val: s.val, nomeLocal: cadDe(s)?.nomeLocal })),
    klimekEmLocalIndigena: klimek.filter(s => INDIGENA.test(cadDe(s)?.nomeLocal || '')).length,
    quaseUnanimes98: quase.length, quaseUnanimesPorUf: contar(quase, s => s.uf),
    comparecimentoSemVotoValido: zeroVal.length
  };
}

// ======================================================================
// 5. Biometria (QT_ELEI_BIOM_SEM_HABILITACAO = eleitores COM biometria liberados sem ela)
// ======================================================================
{
  const com = BR.filter(s => s.comp > 0);
  const zero200 = BR.filter(s => s.biom === 0 && s.comp >= 200);
  const totalSec200 = BR.filter(s => s.comp >= 200).length;
  const porUf = {};
  for (const s of com) { const u = porUf[s.uf] ||= { secoes: 0, comp: 0, biom: 0, zero: 0, zero200: 0, acima50: 0 }; u.secoes++; u.comp += s.comp; u.biom += s.biom || 0; if (s.biom === 0) u.zero++; if (s.biom === 0 && s.comp >= 200) u.zero200++; if (s.comp >= 50 && s.biom / s.comp >= 0.5) u.acima50++; }
  for (const u of Object.values(porUf)) { u.taxaPct = pct(u.biom, u.comp); u.pctSecoesZero = pct(u.zero, u.secoes); }
  const porMun = new Map();
  for (const s of com) { const k = s.uf + '|' + s.mun; const m = porMun.get(k) || porMun.set(k, { uf: s.uf, nome: s.munNome, secoes: 0, comp: 0, biom: 0, zero: 0, aptos: 0, a: 0, val: 0 }).get(k); m.secoes++; m.comp += s.comp; m.biom += s.biom || 0; m.aptos += s.aptos; if (s.biom === 0) m.zero++; m.a += s.a; m.val += s.val; }
  const muns = [...porMun.values()].filter(m => m.comp >= 1000).map(m => ({ ...m, taxa: m.biom / m.comp }));
  muns.sort((x, y) => y.taxa - x.taxa);
  const taxasMun = muns.map(m => m.taxa);
  const qm = quantis(taxasMun, [0.01, 0.1, 0.5, 0.9, 0.99]);
  // concentração por zona: zona com taxa muito acima da UF
  const porZona = new Map();
  for (const s of com) { const k = s.uf + '|' + s.zona; const z = porZona.get(k) || porZona.set(k, { uf: s.uf, zona: s.zona, muns: new Set(), comp: 0, biom: 0, secoes: 0 }).get(k); z.muns.add(s.munNome); z.comp += s.comp; z.biom += s.biom || 0; z.secoes++; }
  const zonas = [...porZona.values()].filter(z => z.comp >= 5000).map(z => ({ uf: z.uf, zona: z.zona, municipios: [...z.muns].slice(0, 3).join(', '), secoes: z.secoes, comp: z.comp, taxaPct: pct(z.biom, z.comp), taxaUfPct: porUf[z.uf].taxaPct })).sort((x, y) => y.taxaPct / y.taxaUfPct - x.taxaPct / x.taxaUfPct);
  // relação com abstenção: dentro do local (efeito fixo), correlação entre taxa de biometria e taxa de abstenção
  const porLocal = new Map();
  for (const s of com) (porLocal.get(s.chaveLocal) || porLocal.set(s.chaveLocal, []).get(s.chaveLocal)).push(s);
  let sxy = 0, sxx = 0, syy = 0, n = 0, bxy = 0, bxx = 0, byy = 0;
  const pts = [];
  for (const L of porLocal.values()) {
    const xs = L.map(s => (s.biom || 0) / s.comp), ys = L.map(s => s.abst / s.aptos);
    pts.push(...L.map((s, i) => [xs[i], ys[i]]));
    if (L.length < 2) continue;
    const mx = xs.reduce((a, b) => a + b, 0) / L.length, my = ys.reduce((a, b) => a + b, 0) / L.length;
    for (let i = 0; i < L.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; n++; }
  }
  { const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length, my = pts.reduce((t, p) => t + p[1], 0) / pts.length; for (const [x, y] of pts) { bxy += (x - mx) * (y - my); bxx += (x - mx) ** 2; byy += (y - my) ** 2; } }
  // taxa de biometria por faixa de abstenção
  const faixasAbst = [[0, 0.1], [0.1, 0.15], [0.15, 0.2], [0.2, 0.25], [0.25, 0.3], [0.3, 0.4], [0.4, 1.01]].map(([i, f]) => { const l = com.filter(s => s.aptos >= 50 && s.abst / s.aptos >= i && s.abst / s.aptos < f); return { abstencao: Math.round(i * 100) + '-' + Math.round(f * 100) + '%', secoes: l.length, taxaBiomPct: pct(l.reduce((t, s) => t + (s.biom || 0), 0), l.reduce((t, s) => t + s.comp, 0)) }; });
  // por horário de encerramento e por carga no dia
  const fx = [[0, 17 * 60 + 5], [17 * 60 + 5, 18 * 60], [18 * 60, 19 * 60], [19 * 60, 99999]].map(([i, f]) => { const l = com.filter(s => s.fechaB != null && s.fechaB >= i && s.fechaB < f); return { encerramento: hhmm(i) + '-' + hhmm(Math.min(f, 1440)), secoes: l.length, taxaBiomPct: pct(l.reduce((t, s) => t + (s.biom || 0), 0), l.reduce((t, s) => t + s.comp, 0)) }; });
  const biomIgualComp = com.filter(s => s.comp >= 50 && s.biom === s.comp);
  // municípios inteiros com zero
  const munZero = [...porMun.values()].filter(m => m.biom === 0 && m.comp >= 500);
  // dígitos/valores redondos no campo (ex.: 0, 100)?
  const distBiom = contar(com, s => s.biom == null ? 'nulo' : s.biom >= 50 ? '50+' : s.biom >= 20 ? '20-49' : s.biom >= 10 ? '10-19' : String(s.biom));
  R.biometria = {
    total: BR.reduce((t, s) => t + (s.biom || 0), 0), taxaNacionalPct: pct(BR.reduce((t, s) => t + (s.biom || 0), 0), BR.reduce((t, s) => t + s.comp, 0)),
    distribuicaoPorSecao: distBiom,
    secoesComZero: com.filter(s => s.biom === 0).length, zeroCom200votantes: zero200.length, secoesCom200votantes: totalSec200,
    zero200PorUf: contar(zero200, s => s.uf), zero200MunicipiosTop: top(contar(zero200, s => s.uf + ' ' + s.munNome), 10),
    zeroPorTipoDeLocal: contar(com.filter(s => s.biom === 0), s => cadDe(s)?.tipoLocal),
    exemplosZero200: zero200.sort((x, y) => y.comp - x.comp).slice(0, 10).map(s => ({ secao: id(s), comp: s.comp, nomeLocal: cadDe(s)?.nomeLocal })),
    porUf: Object.fromEntries(Object.entries(porUf).sort((a, b) => b[1].taxaPct - a[1].taxaPct)),
    municipiosQuantis: Object.fromEntries(Object.entries(qm).map(([k, v]) => [k, r2(100 * v)])),
    municipiosMaiorTaxa: muns.slice(0, 15).map(m => ({ uf: m.uf, municipio: m.nome, secoes: m.secoes, comp: m.comp, taxaPct: r2(100 * m.taxa), taxaUfPct: porUf[m.uf].taxaPct, pct13: pct(m.a, m.val) })),
    municipiosMenorTaxa: muns.slice(-10).reverse().map(m => ({ uf: m.uf, municipio: m.nome, secoes: m.secoes, comp: m.comp, taxaPct: r2(100 * m.taxa), secoesZero: m.zero })),
    municipiosInteirosComZero: munZero.map(m => ({ uf: m.uf, municipio: m.nome, comp: m.comp, secoes: m.secoes })),
    zonasMaisAcimaDaUf: zonas.slice(0, 12),
    correlacaoBiomAbstencao: { bruta: r2(bxy / Math.sqrt(bxx * byy)), dentroDoLocal: r2(sxy / Math.sqrt(sxx * syy)), secoes: n },
    taxaPorFaixaDeAbstencao: faixasAbst, taxaPorHorarioDeEncerramento: fx,
    biomIgualComparecimento: biomIgualComp.length, exemplosBiomIgualComp: biomIgualComp.slice(0, 10).map(s => ({ secao: id(s), comp: s.comp, biom: s.biom, aptos: s.aptos })),
    acima50pct: com.filter(s => s.comp >= 50 && s.biom / s.comp >= 0.5).length,
    acima50MunicipiosTop: top(contar(com.filter(s => s.comp >= 50 && s.biom / s.comp >= 0.5), s => s.uf + ' ' + s.munNome), 10),
    exemplosAcima50: com.filter(s => s.comp >= 50 && s.biom / s.comp >= 0.5).sort((x, y) => y.biom / y.comp - x.biom / x.comp).slice(0, 12).map(s => ({ secao: id(s), comp: s.comp, biom: s.biom, taxaPct: pct(s.biom, s.comp), abertura: s.abreS, carga: s.cargaS }))
  };
}

// ======================================================================
// 6. Outros
// ======================================================================
{
  const junta = BR.filter(s => s.junta && s.junta !== '-1');
  const turma = BR.filter(s => s.turma && s.turma !== '-1');
  // consistência com o outro cargo do 2º turno (governador) na mesma seção
  let comparadas = 0, compDif = 0, aptosDif = 0, biomDif = 0, urnaDif = 0, votosDif = 0, presMaior = 0, presMenor = 0, somaDifComp = 0; const ex = [], ufDif = {};
  const cargosOutros = {};
  for (const [k, o] of outros) {
    const [uf, mun, zona, sec, cargo] = k.split('|');
    cargosOutros[cargo] = (cargosOutros[cargo] || 0) + 1;
    const s = secoes.get([uf, mun, zona, sec].join('|'));
    if (!s) { if (ex.length < 10) ex.push({ k, problema: 'governador sem presidente' }); continue; }
    comparadas++;
    if (o.comp !== s.comp) { if (s.comp > o.comp) presMaior++; else presMenor++; somaDifComp += s.comp - o.comp; ufDif[s.uf] = (ufDif[s.uf] || 0) + 1; }
    if (o.comp !== s.comp) { compDif++; if (ex.length < 10) ex.push({ secao: id(s), compPres: s.comp, compOutro: o.comp }); }
    if (o.aptos !== s.aptos) aptosDif++;
    if (o.biom !== s.biom) biomDif++;
    if (o.urna !== s.urna) urnaDif++;
    if (o.votos !== s.comp) votosDif++;
  }
  // seções pequenas / estranhas
  const aptos0 = BR.filter(s => !s.aptos);
  const comp0 = BR.filter(s => s.aptos > 0 && s.comp === 0);
  const pequenas = BR.filter(s => s.aptos > 0 && s.aptos < 20);
  // seção com número muito alto (seções especiais: presídios, hospitais?) — via tipo de local no cadastro
  const tipoLocal = {};
  for (const s of BR) { const c = cad.get(s.uf + '|' + s.mun + '|' + s.zona + '|' + s.sec); const t = c?.tipoLocal || '(sem cadastro)'; const o = tipoLocal[t] ||= { secoes: 0, aptos: 0, comp: 0, a: 0, val: 0, biom: 0 }; o.secoes++; o.aptos += s.aptos; o.comp += s.comp; o.a += s.a; o.val += s.val; o.biom += s.biom || 0; }
  for (const o of Object.values(tipoLocal)) { o.compPct = pct(o.comp, o.aptos); o.pct13 = pct(o.a, o.val); o.biomPct = pct(o.biom, o.comp); }
  // horários de abertura idênticos ao segundo em muitas urnas (normal se há programação automática)
  const aberturaSeg = contar(BR, s => 'seg ' + (s.abreS || '').slice(17, 19));
  const fechaSeg = contar(BR, s => 'seg ' + (s.fechaS || '').slice(17, 19));
  R.outros = {
    juntaApuradoraPreenchida: junta.length, juntaPorUf: contar(junta, s => s.uf), turmaPreenchida: turma.length,
    juntaTipoUrna: contar(junta, s => s.tipoUrna),
    exemplosJunta: junta.slice(0, 15).map(s => ({ secao: id(s), junta: s.junta, turma: s.turma, tipoUrna: s.tipoUrna, urna: s.urna, abertura: s.abreS, encerramento: s.fechaS, emissao: s.emisS, recebido: s.recebS, comp: s.comp, biom: s.biom })),
    juntaResumo: { comp: junta.reduce((t, s) => t + s.comp, 0), biom: junta.reduce((t, s) => t + (s.biom || 0), 0), semHorario: junta.filter(s => s.abre == null).length, fecha19h: junta.filter(s => s.fechaB >= 19 * 60).length },
    outroCargo: { cargos: cargosOutros, secoesComparadas: comparadas, comparecimentoDiferente: compDif, presidenteMaior: presMaior, presidenteMenor: presMenor, somaDiferenca: somaDifComp, porUf: ufDif, aptosDiferente: aptosDif, biomDiferente: biomDif, urnaDiferente: urnaDif, votosDoCargoDiferenteDoComparecimento: votosDif, exemplos: ex },
    aptosZero: aptos0.length, comparecimentoZero: comp0.length, secoesMenos20Aptos: pequenas.length, exemplosPequenas: pequenas.slice(0, 10).map(s => ({ secao: id(s), aptos: s.aptos, comp: s.comp, a: s.a, b: s.b })),
    porTipoDeLocal: tipoLocal,
    segundosDaAbertura: top(aberturaSeg, 8), segundosDoEncerramento: top(fechaSeg, 5),
    aberturaNoMinutoExato: BR.filter(s => /:00:0[0-2]$/.test(s.abreS || '')).length
  };
}

await fsp.writeFile(SAIDA, JSON.stringify(R, null, 1));
const H = R.horarios, P = H.pico19h, D = R.distribuicao, U = R.unicidade, B = R.biometria;
console.log('\n===== RESUMO =====');
console.log('seções (Presidente):', R.leitura.secoesPresidente, '| linhas duplicadas:', R.leitura.linhasDuplicadas, '| campos divergentes na mesma seção:', R.leitura.secoesComCamposDivergentesEntreLinhas);
console.log('urna em >1 seção:', U.urnaEmMaisDeUmaSecao, '(exterior sem horário:', U.exteriorSemHorario + ')', '| agregadas:', U.secoesComAgregadas, 'urnas /', U.secoesAgregadasTotal, 'seções | cadastro principal sem BU:', U.cadastro.principaisAtivasSemBu);
console.log('aptos BU = cadastro:', U.aptosVsCadastro.iguais, 'de', U.aptosVsCadastro.comparadas, '| soma +', U.aptosVsCadastro.somaPositivas, U.aptosVsCadastro.somaNegativas);
console.log('abre >9h:', H.abreDepois09hBsb, '| fecha <17h:', H.fechaAntes17hBsb, '| emissão < encerramento:', H.emissaoAntesDoEncerramento, '| recebido < emissão:', H.recebimentoAntesDaEmissao);
console.log('fecha >=19h:', P.total, '| exatamente 19:00:00:', P.encerramentoExatamente19h00m00s, '| faixas:', JSON.stringify(P.encerramentoPorFaixa));
console.log('tardias - vizinhas (pp):', JSON.stringify(P.tardiasMenosVizinhasDoMesmoLocal), '| emissão atrasada >60min:', P.emissaoMaisDe60minAposEncerrar, '(na zona do pico:', P.emissaoAtrasadaEmZonaDoPico + ')');
console.log('chegada BU 17:30-19:00:', H.chegadaEntre1730e1900, '| antes 18h:', H.chegadaAntesDas18h);
console.log('carga no dia:', R.carga.cargaNoDiaDaEleicao, '| véspera:', R.carga.cargaNaVespera24_10, '| antes de 04/10:', R.carga.antesDe04_10);
console.log('último dígito p 13/22:', D.ultimoDigito.lula13.p, D.ultimoDigito.flavio22.p, '| comp >95%:', D.comparecimento.acima95pct, '<40%:', D.comparecimento.abaixo40pct);
console.log('br+nulo zero:', D.brancoNuloZero.comZeroBrancoNulo, 'esperado mun/local:', D.brancoNuloZero.esperadoComTaxaDoMunicipio, D.brancoNuloZero.esperadoComTaxaDoLocal);
console.log('outliers no local |z|>4 ajust.:', D.outlierDentroDoLocal.acimaZ4AjustadoDispersao, '(maior nº do local:', D.outlierDentroDoLocal.outliersQueSaoASecaoDeNumeroMaisAltoDoLocal, 'esperado', D.outlierDentroDoLocal.esperadoSeFosseAoAcaso + ')');
console.log('pares idênticos no local:', D.votosIdenticosNoMesmoLocal.paresObservados, 'simulado:', JSON.stringify(D.votosIdenticosNoMesmoLocal.paresEsperadosPorAcasoSimulacao));
console.log('unânimes:', D.unanimes.total, '(indígena:', D.unanimesEmLocalIndigena + ')', '| biometria zero c/ >=200:', B.zeroCom200votantes, '| >=50%:', B.acima50pct, '| corr. abstenção:', JSON.stringify(B.correlacaoBiomAbstencao));
console.log('governador x presidente: comp diferente', R.outros.outroCargo.comparecimentoDiferente, '(pres maior', R.outros.outroCargo.presidenteMaior + ', menor', R.outros.outroCargo.presidenteMenor + ')');
console.log('\nescrito', SAIDA);
