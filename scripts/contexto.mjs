// Dados oficiais de CONTEXTO por município e por UF (IBGE + perfil do eleitorado do TSE).
// Uso: node scripts/contexto.mjs [--forcar]
//   Baixa (só o que ainda não está em dados/contexto/brutos/) e escreve
//   site/dados/contexto-municipios.json e site/dados/contexto-uf.json.
//   --forcar baixa tudo de novo. Sem dependências: fetch do Node (com curl de reserva) e um leitor de ZIP próprio.
// Fontes e limitações: docs/CONTEXTO-DADOS.md
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const BRUTOS = path.join(RAIZ, 'dados/contexto/brutos');
const DIR_IBGE = path.join(RAIZ, 'dados/ibge');
const SAIDA = path.join(RAIZ, 'site/dados');
const FORCAR = process.argv.includes('--forcar');
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const UF_COD = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
const COD_UF = Object.fromEntries(Object.entries(UF_COD).map(([u, c]) => [c, u]));

// ---------- download com cache ----------
const sh = promisify(execFile);
async function baixarTexto(url, arquivo) {
  const p = path.join(BRUTOS, arquivo);
  if (!FORCAR && fs.existsSync(p) && fs.statSync(p).size > 2) return fsp.readFile(p, 'utf8');
  let texto;
  for (let tentativa = 1; tentativa <= 3 && texto == null; tentativa++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      texto = await r.text();
    } catch (e) {
      // Reserva: curl (o Avast desta máquina reassina o TLS e às vezes só o curl passa).
      try { texto = (await sh('curl', ['-sS', '-L', '--ssl-no-revoke', '-m', '300', url], { maxBuffer: 1 << 30 })).stdout; }
      catch (e2) { console.warn(`  tentativa ${tentativa} falhou (${e.message} / ${e2.message.split('\n')[0]})`); }
    }
  }
  if (texto == null) throw new Error('não baixou: ' + url);
  if (/^\s*</.test(texto) || /Par[aâ]metro|erro/i.test(texto.slice(0, 200)) && !/^\s*\[/.test(texto)) throw new Error(`resposta inesperada de ${url}: ${texto.slice(0, 200)}`);
  await fsp.writeFile(p, texto);
  return texto;
}
async function baixarArquivo(url, arquivo) {
  const p = path.join(BRUTOS, arquivo);
  if (!FORCAR && fs.existsSync(p) && fs.statSync(p).size > 1e6) return p;
  console.log('  baixando', url);
  await sh('curl', ['-sS', '-L', '--ssl-no-revoke', '--retry', '3', '-o', p, url], { maxBuffer: 1 << 20 });
  return p;
}

// ---------- SIDRA ----------
const SIDRA = 'https://apisidra.ibge.gov.br/values';
// Convenção do SIDRA: "-" = zero absoluto; "..", "..." = não se aplica / não disponível; "X" = sigilo.
const nulo = v => (v === '-' ? 0 : v == null || v === '' || /^[.X]+$/.test(v) ? null : Number(v));
// Devolve linhas {loc, v (código da variável), c: [códigos das classificações], val}
async function sidra(nome, consulta) {
  const url = `${SIDRA}${consulta}/h/n/f/c`;
  const linhas = JSON.parse(await baixarTexto(url, `sidra_${nome}.json`));
  return linhas.map(l => {
    const ks = Object.keys(l).filter(k => /^D\dC$/.test(k)).sort();
    // D1 = território, D2 = variável, D3 = período, D4.. = classificações
    return { loc: l[ks[0]], v: l[ks[1]], c: ks.slice(3).map(k => l[k]), val: nulo(l.V) };
  });
}
// Consulta municipal quebrada por UF (tabelas grandes passam do limite de valores por pedido).
async function sidraPorUF(nome, t, resto) {
  const out = [];
  for (const uf of UFS) out.push(...await sidra(`${nome}_${uf}`, `/t/${t}/n6/in n3 ${UF_COD[uf]}${resto}`));
  return out;
}

// ---------- leitor de ZIP (só o necessário: central directory, zip64, deflate) ----------
async function zipEntradas(arquivo) {
  const fh = await fsp.open(arquivo, 'r');
  const { size } = await fh.stat();
  const n = Math.min(size, 66000);
  const fim = Buffer.alloc(n);
  await fh.read(fim, 0, n, size - n);
  let e = -1;
  for (let i = n - 22; i >= 0; i--) if (fim.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('ZIP sem EOCD: ' + arquivo);
  let total = fim.readUInt16LE(e + 10), cdTam = fim.readUInt32LE(e + 12), cdOff = fim.readUInt32LE(e + 16);
  if (cdOff === 0xffffffff || total === 0xffff) { // zip64
    const loc = e - 20;
    if (fim.readUInt32LE(loc) !== 0x07064b50) throw new Error('zip64 sem localizador');
    const off64 = Number(fim.readBigUInt64LE(loc + 8));
    const b = Buffer.alloc(56); await fh.read(b, 0, 56, off64);
    total = Number(b.readBigUInt64LE(32)); cdTam = Number(b.readBigUInt64LE(40)); cdOff = Number(b.readBigUInt64LE(48));
  }
  const cd = Buffer.alloc(cdTam); await fh.read(cd, 0, cdTam, cdOff);
  const out = new Map();
  for (let p = 0, k = 0; k < total; k++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('central directory corrompido');
    const metodo = cd.readUInt16LE(p + 10);
    let comp = cd.readUInt32LE(p + 20), descomp = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42);
    const nome = cd.toString('latin1', p + 46, p + 46 + nl);
    for (let x = p + 46 + nl; x < p + 46 + nl + xl;) { // campo extra zip64
      const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2);
      if (id === 1) {
        let q = x + 4;
        if (descomp === 0xffffffff) { descomp = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (comp === 0xffffffff) { comp = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); q += 8; }
      }
      x += 4 + len;
    }
    out.set(nome, { metodo, comp, descomp, off });
    p += 46 + nl + xl + cl;
  }
  out.ler = async nome => {
    const en = out.get(nome);
    const lh = Buffer.alloc(30); await fh.read(lh, 0, 30, en.off);
    const ini = en.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const bruto = fs.createReadStream(arquivo, { start: ini, end: ini + en.comp - 1, highWaterMark: 1 << 20 });
    const s = en.metodo === 8 ? bruto.pipe(zlib.createInflateRaw({ chunkSize: 1 << 20 })) : bruto;
    s.setEncoding('latin1');
    return s;
  };
  out.fechar = () => fh.close();
  return out;
}

// ---------- utilidades ----------
const r = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const pct = (a, b) => (a == null || !b ? null : r((100 * a) / b, 1));
const dens = x => (x == null ? null : r(x, x < 10 ? 2 : 1));
function indexar(linhas, filtro = () => true) {
  const m = new Map();
  for (const l of linhas) if (filtro(l)) m.set(l.loc, l.val);
  return m;
}

await fsp.mkdir(BRUTOS, { recursive: true });

// ---------- municípios do site (chaves) e tabela TSE -> IBGE ----------
const municipiosSite = JSON.parse(await fsp.readFile(path.join(SAIDA, 'municipios.json'), 'utf8'));
const ibgeDoSite = municipiosSite.map(m => m[0]).filter(Boolean);
const tseIbge = new Map();
for (const l of (await fsp.readFile(path.join(DIR_IBGE, 'municipios_tse_ibge.csv'), 'utf8')).trim().split(/\r?\n/).slice(1)) {
  const [tse, uf, , , ibge] = l.split(',');
  tseIbge.set(uf + '|' + Number(tse), Number(ibge));
}
const IBGE_POR_NOME = { 'MT|BOA ESPERANÇA DO NORTE': 5101837 }; // instalado em 2025, fora da tabela de correspondência

// ---------- IBGE ----------
console.log('IBGE / SIDRA...');
// 1. Censo 2022: população, área, densidade (tabela 4714)
const t4714m = await sidra('4714_n6', '/t/4714/n6/all/v/93,6318,614/p/2022');
const t4714u = await sidra('4714_n3n1', '/t/4714/n3/all/n1/all/v/93,6318,614/p/2022');
// 2. Estimativa de população mais recente (tabela 6579)
const per6579 = JSON.parse(await baixarTexto('https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos', 'periodos_6579.json'));
const ANO_EST = Math.max(...per6579.map(p => Number(p.id)));
const t6579m = await sidra(`6579_${ANO_EST}_n6`, `/t/6579/n6/all/v/9324/p/${ANO_EST}`);
const t6579u = await sidra(`6579_${ANO_EST}_n3n1`, `/t/6579/n3/all/n1/all/v/9324/p/${ANO_EST}`);
// 3a. Censo 2022 por idade (tabela 9514): total, 60+ e 16-29, sexo total, forma de declaração total
const ID60 = ['93095', '93096', '93097', '93098', '49108', '49109', '60040', '60041', '6653'];
const ID1629 = ['6573', '6574', '6575', '6576', '93087', '93088'];
const IDS_IDADE = ['100362', ...ID60, ...ID1629].join(',');
const q9514 = `/v/93/p/2022/c2/6794/c287/${IDS_IDADE}/c286/113635`;
const t9514m = await sidraPorUF('9514_n6', 9514, q9514);
const t9514u = await sidra('9514_n3n1', `/t/9514/n3/all/n1/all${q9514}`);
// 3b. Taxa de alfabetização 15+ (tabela 9543), total de sexo, cor e idade
const q9543 = '/v/2513/p/2022/c2/6794/c86/95251/c287/100362';
const t9543m = await sidra('9543_n6', `/t/9543/n6/all${q9543}`);
const t9543u = await sidra('9543_n3n1', `/t/9543/n3/all/n1/all${q9543}`);
// 4. PIB municipal (tabela 5938) e PIB per capita oficial (IBGE Cidades, indicador 47001)
const per5938 = JSON.parse(await baixarTexto('https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos', 'periodos_5938.json'));
const ANO_PIB = Math.max(...per5938.map(p => Number(p.id)));
const t5938m = await sidra(`5938_${ANO_PIB}_n6`, `/t/5938/n6/all/v/37/p/${ANO_PIB}`);
const t5938u = await sidra(`5938_${ANO_PIB}_n3n1`, `/t/5938/n3/all/n1/all/v/37/p/${ANO_PIB}`);
const pibpcBruto = JSON.parse(await baixarTexto('https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/47001/resultados/xxxxxx', 'cidades_47001_pibpc.json'));
const pibpc6 = new Map(); // código de 6 dígitos -> valor do ANO_PIB
for (const x of pibpcBruto[0].res) pibpc6.set(x.localidade, nulo(x.res?.[ANO_PIB]));
// 5. Rendimento domiciliar per capita (Censo 2022, tabela 10295): médio e mediano; Gini só por UF (10301)
const q10295 = '/v/13431,13534/p/2022/c2/6794/c86/95251/c58/95253';
const t10295m = await sidra('10295_n6', `/t/10295/n6/all${q10295}`);
const t10295u = await sidra('10295_n3n1', `/t/10295/n3/all/n1/all${q10295}`);
const t10301u = await sidra('10301_n3n1', '/t/10301/n3/all/n1/all/v/13418/p/2022');

// Índices por localidade
function blocoIBGE(t4714, t6579, t9514, t9543, t5938, t10295) {
  const pop = indexar(t4714, l => l.v === '93'), area = indexar(t4714, l => l.v === '6318'), den = indexar(t4714, l => l.v === '614');
  const est = indexar(t6579);
  const idade = new Map();
  for (const l of t9514) {
    const o = idade.get(l.loc) ?? { tot: null, a60: 0, a1629: 0, falta: 0 };
    const id = l.c.find(x => x === '100362' || ID60.includes(x) || ID1629.includes(x));
    if (id === '100362') o.tot = l.val;
    else if (l.val == null) o.falta++;
    else if (ID60.includes(id)) o.a60 += l.val;
    else if (ID1629.includes(id)) o.a1629 += l.val;
    idade.set(l.loc, o);
  }
  const alf = indexar(t9543), pib = indexar(t5938);
  const rMed = indexar(t10295, l => l.v === '13431'), rMdn = indexar(t10295, l => l.v === '13534');
  return { pop, area, den, est, idade, alf, pib, rMed, rMdn };
}
const M = blocoIBGE(t4714m, t6579m, t9514m, t9543m, t5938m, t10295m);
const U = blocoIBGE(t4714u, t6579u, t9514u, t9543u, t5938u, t10295u);
const gini = indexar(t10301u);

// ---------- TSE: perfil do eleitorado ----------
console.log('TSE / perfil do eleitorado...');
const URL_PERFIL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitorado/perfil_eleitorado_2026.zip';
const zipPerfil = await baixarArquivo(URL_PERFIL, 'perfil_eleitorado_2026.zip');
const cacheTSE = path.join(BRUTOS, 'perfil_eleitorado_2026_agregado.json');
let tse; // { geracao, mun: {"UF|cdTse": {...}}, nomes: {...} }
const zipStat = fs.statSync(zipPerfil);
if (!FORCAR && fs.existsSync(cacheTSE) && JSON.parse(await fsp.readFile(cacheTSE, 'utf8')).zipBytes === zipStat.size) {
  tse = JSON.parse(await fsp.readFile(cacheTSE, 'utf8'));
} else {
  const z = await zipEntradas(zipPerfil);
  const nomes = [...z.keys()].filter(n => /\.csv$/i.test(n));
  const brasil = nomes.find(n => /_BRASIL\.csv$/i.test(n));
  const lista = brasil ? [brasil] : nomes;
  const mun = {}, nomesMun = {};
  let geracao = null, lidas = 0;
  const t0 = Date.now();
  for (const ent of lista) {
    const rl = readline.createInterface({ input: await z.ler(ent), crlfDelay: Infinity });
    let idx = null;
    for await (const linha of rl) {
      if (!linha) continue;
      const f = linha.split(';');
      for (let i = 0; i < f.length; i++) if (f[i].charCodeAt(0) === 34) f[i] = f[i].slice(1, -1);
      if (!idx) { idx = Object.fromEntries(f.map((h, i) => [h, i])); continue; }
      lidas++;
      geracao ??= f[idx.DT_GERACAO];
      const chave = f[idx.SG_UF] + '|' + Number(f[idx.CD_MUNICIPIO]);
      const q = Number(f[idx.QT_ELEITORES]) || 0;
      const o = (mun[chave] ??= { tot: 0, fem: 0, a1617: 0, a60: 0, sup: 0, analf: 0, le: 0, biom: 0 });
      nomesMun[chave] ??= f[idx.NM_MUNICIPIO];
      o.tot += q;
      o.biom += Number(f[idx.QT_ELEITORES_BIOMETRIA]) || 0;
      if (f[idx.CD_GENERO] === '4') o.fem += q;
      const fx = Number(f[idx.CD_FAIXA_ETARIA]);
      if (fx === 1600 || fx === 1700) o.a1617 += q;
      else if (fx >= 6064) o.a60 += q;
      const esc = f[idx.CD_GRAU_ESCOLARIDADE];
      if (esc === '8') o.sup += q; else if (esc === '1') o.analf += q; else if (esc === '2') o.le += q;
      if (lidas % 2_000_000 === 0) process.stdout.write(`  ${(lidas / 1e6).toFixed(0)} mi linhas\r`);
    }
  }
  await z.fechar();
  console.log(`  ${lidas} linhas em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  tse = { zipBytes: zipStat.size, geracao, lidas, mun, nomes: nomesMun };
  await fsp.writeFile(cacheTSE, JSON.stringify(tse));
}
// TSE -> IBGE
const tsePorIbge = new Map(), semIbge = [];
for (const [chave, o] of Object.entries(tse.mun)) {
  const uf = chave.split('|')[0];
  if (uf === 'ZZ') continue;
  const ibge = tseIbge.get(chave) ?? IBGE_POR_NOME[uf + '|' + tse.nomes[chave]];
  if (!ibge) { semIbge.push(chave + ' ' + tse.nomes[chave]); continue; }
  tsePorIbge.set(String(ibge), o);
}
function somaTSE(filtro) {
  const s = { tot: 0, fem: 0, a1617: 0, a60: 0, sup: 0, analf: 0, le: 0, biom: 0 };
  let n = 0;
  for (const [chave, o] of Object.entries(tse.mun)) if (filtro(chave.split('|')[0])) { n++; for (const k in s) s[k] += o[k]; }
  return n ? s : null;
}

// ---------- montagem ----------
const ANO_CENSO = 2022;
const sidraUrl = t => `https://sidra.ibge.gov.br/tabela/${t}`;
const fonteTSE = { nome: `TSE, perfil do eleitorado ${2026} (gerado em ${tse.geracao})`, ano: 2026, url: 'https://dadosabertos.tse.jus.br/dataset/eleitorado-atual' };
const CAMPOS = [
  ['pop2022', 'Pessoas', { nome: 'IBGE, Censo 2022, tabela 4714 (v93 População residente)', ano: ANO_CENSO, url: sidraUrl(4714) }],
  ['areaKm2', 'km²', { nome: 'IBGE, Censo 2022, tabela 4714 (v6318 Área da unidade territorial)', ano: ANO_CENSO, url: sidraUrl(4714) }],
  ['densidade', 'hab/km²', { nome: 'IBGE, Censo 2022, tabela 4714 (v614 Densidade demográfica)', ano: ANO_CENSO, url: sidraUrl(4714) }],
  ['popEstimada', 'Pessoas', { nome: `IBGE, Estimativas de População ${ANO_EST}, tabela 6579 (v9324)`, ano: ANO_EST, url: sidraUrl(6579) }],
  ['pct60mais', '% da população', { nome: 'IBGE, Censo 2022, tabela 9514 (v93; idade 60 anos ou mais / total)', ano: ANO_CENSO, url: sidraUrl(9514) }],
  ['pct16a29', '% da população', { nome: 'IBGE, Censo 2022, tabela 9514 (v93; idade 16 a 29 anos / total)', ano: ANO_CENSO, url: sidraUrl(9514) }],
  ['alfabetizacao15', '%', { nome: 'IBGE, Censo 2022, tabela 9543 (v2513 Taxa de alfabetização das pessoas de 15 anos ou mais)', ano: ANO_CENSO, url: sidraUrl(9543) }],
  ['pibMilhoes', 'R$ milhões correntes', { nome: `IBGE, PIB dos Municípios ${ANO_PIB}, tabela 5938 (v37 PIB a preços correntes)`, ano: ANO_PIB, url: sidraUrl(5938) }],
  ['pibPerCapita', 'R$ correntes', { nome: `IBGE, PIB dos Municípios ${ANO_PIB}, PIB per capita (IBGE Cidades, indicador 47001; UF = PIB / população implícita dos municípios)`, ano: ANO_PIB, url: 'https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/47001/resultados/xxxxxx' }],
  ['rendaPcMedia', 'R$/mês', { nome: 'IBGE, Censo 2022, tabela 10295 (v13431 Rendimento nominal médio mensal domiciliar per capita)', ano: ANO_CENSO, url: sidraUrl(10295) }],
  ['rendaPcMediana', 'R$/mês', { nome: 'IBGE, Censo 2022, tabela 10295 (v13534 Rendimento nominal mediano mensal domiciliar per capita)', ano: ANO_CENSO, url: sidraUrl(10295) }],
  ['eleitores', 'Eleitores', fonteTSE],
  ['eleitPctFeminino', '% do eleitorado', fonteTSE],
  ['eleitPct16a17', '% do eleitorado', fonteTSE],
  ['eleitPct60mais', '% do eleitorado', fonteTSE],
  ['eleitPctSuperior', '% do eleitorado (superior completo)', fonteTSE],
  ['eleitPctAnalfabeto', '% do eleitorado (declarou analfabeto)', fonteTSE],
  ['eleitPctLeEscreve', '% do eleitorado (declarou lê e escreve)', fonteTSE],
  ['eleitPctBiometria', '% do eleitorado com biometria', fonteTSE],
];
const colunas = CAMPOS.map(c => c[0]);
const fontes = Object.fromEntries(CAMPOS.map(([k, u, f]) => [k, { ...f, unidade: u }]));

function valoresTSE(o) {
  if (!o) return Array(8).fill(null);
  return [o.tot, pct(o.fem, o.tot), pct(o.a1617, o.tot), pct(o.a60, o.tot), pct(o.sup, o.tot), pct(o.analf, o.tot), pct(o.le, o.tot), pct(o.biom, o.tot)];
}
function valoresIBGE(B, loc, pibpc) {
  const id = B.idade.get(loc);
  const pib = B.pib.get(loc);
  return [
    B.pop.get(loc) ?? null, r(B.area.get(loc), 1), dens(B.den.get(loc)), B.est.get(loc) ?? null,
    id && !id.falta ? pct(id.a60, id.tot) : null, id && !id.falta ? pct(id.a1629, id.tot) : null,
    r(B.alf.get(loc), 1), pib == null ? null : r(pib / 1000, 1), pibpc == null ? null : Math.round(pibpc),
    r(B.rMed.get(loc), 0), r(B.rMdn.get(loc), 0),
  ];
}

// Municípios
const dadosMun = {};
const pibImplicito = {}; // por UF: soma de PIB e da população implícita (PIB / PIB per capita)
for (const ibge of ibgeDoSite) {
  const loc = String(ibge);
  const pibpc = pibpc6.get(loc.slice(0, 6)) ?? null;
  const v = [...valoresIBGE(M, loc, pibpc), ...valoresTSE(tsePorIbge.get(loc))];
  dadosMun[loc] = v;
  const pib = M.pib.get(loc);
  if (pib != null && pibpc) {
    const uf = COD_UF[Number(loc.slice(0, 2))];
    const s = (pibImplicito[uf] ??= { pib: 0, pop: 0 });
    s.pib += pib * 1000; s.pop += (pib * 1000) / pibpc;
  }
}
// UFs (IBGE direto do nível UF do SIDRA; TSE somado dos municípios) + BR + ZZ (exterior, só TSE)
const dadosUF = {};
const pibBR = Object.values(pibImplicito).reduce((a, s) => ({ pib: a.pib + s.pib, pop: a.pop + s.pop }), { pib: 0, pop: 0 });
for (const uf of UFS) {
  const s = pibImplicito[uf];
  dadosUF[uf] = [...valoresIBGE(U, String(UF_COD[uf]), s ? s.pib / s.pop : null), ...valoresTSE(somaTSE(u => u === uf))];
}
dadosUF.BR = [...valoresIBGE(U, '1', pibBR.pib / pibBR.pop), ...valoresTSE(somaTSE(u => u !== 'ZZ'))];
dadosUF.ZZ = [...Array(11).fill(null), ...valoresTSE(somaTSE(u => u === 'ZZ'))];
const colunasUF = [...colunas, 'giniRendaPc'];
for (const [uf, v] of Object.entries(dadosUF)) v.push(uf === 'ZZ' ? null : r(gini.get(uf === 'BR' ? '1' : String(UF_COD[uf])), 3));
const fontesUF = { ...fontes, giniRendaPc: { nome: 'IBGE, Censo 2022, tabela 10301 (v13418 Índice de Gini do rendimento domiciliar per capita)', ano: ANO_CENSO, url: sidraUrl(10301), unidade: 'índice 0-1' } };

const gerado = new Date().toISOString();
const notas = 'Valores null = sem dado na fonte. Percentuais com 1 casa. Ver docs/CONTEXTO-DADOS.md.';
await fsp.writeFile(path.join(SAIDA, 'contexto-municipios.json'), JSON.stringify({ gerado, notas, colunas, fontes, dados: dadosMun }));
await fsp.writeFile(path.join(SAIDA, 'contexto-uf.json'), JSON.stringify({ gerado, notas: notas + ' BR = Brasil (TSE sem o exterior); ZZ = exterior (só TSE).', colunas: colunasUF, fontes: fontesUF, dados: dadosUF }));

// ---------- relatório ----------
console.log('\nCobertura (municípios do site com valor, de ' + ibgeDoSite.length + '):');
colunas.forEach((c, i) => {
  const n = Object.values(dadosMun).filter(v => v[i] != null).length;
  const faltam = Object.entries(dadosMun).filter(([, v]) => v[i] == null).map(([k]) => k);
  console.log(`  ${c.padEnd(20)} ${n}${faltam.length && faltam.length <= 5 ? '  faltam: ' + faltam.join(', ') : ''}`);
});
if (semIbge.length) console.log('Municípios do TSE sem código IBGE:', semIbge.join('; '));
const somaEleitMun = [...tsePorIbge.values()].reduce((a, o) => a + o.tot, 0);
console.log(`TSE: ${tse.lidas} linhas, gerado em ${tse.geracao}; eleitores Brasil ${dadosUF.BR[11]}, exterior ${dadosUF.ZZ[11]}, mapeados p/ IBGE ${somaEleitMun}`);
console.log(`Estimativa de população: ${ANO_EST}; PIB: ${ANO_PIB}`);
for (const f of ['contexto-municipios.json', 'contexto-uf.json']) console.log(`  site/dados/${f}: ${(fs.statSync(path.join(SAIDA, f)).size / 1024).toFixed(0)} KB`);
