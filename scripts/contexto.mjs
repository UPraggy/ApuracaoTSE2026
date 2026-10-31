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
  try {
    await sh('curl', ['-sS', '-f', '-L', '--ssl-no-revoke', '--retry', '3', '-A', UA, '-o', p, url], { maxBuffer: 1 << 20 });
  } catch (e) { await fsp.rm(p, { force: true }); throw e; }
  return p;
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
// TabNet (DATASUS): POST do formulário, saída "prn" (CSV com ;). Devolve { cabecalho, linhas: [[cod6, ...números]] }.
const encLatin1 = s => [...Buffer.from(s, 'latin1')].map(b => (/[A-Za-z0-9_.\-*]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '%' + b.toString(16).toUpperCase().padStart(2, '0'))).join('');
async function tabnet(nome, def, campos) {
  const p = path.join(BRUTOS, `tabnet_${nome}.txt`);
  let pre;
  if (!FORCAR && fs.existsSync(p)) pre = await fsp.readFile(p, 'utf8');
  else {
    const body = campos.map(([k, v]) => encLatin1(k) + '=' + encLatin1(v)).join('&');
    const resp = await fetch(`http://tabnet.datasus.gov.br/cgi/tabcgi.exe?${def}`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(300_000) });
    const t = new TextDecoder('latin1').decode(await resp.arrayBuffer());
    pre = t.match(/<PRE>([\s\S]*?)<\/PRE>/i)?.[1];
    if (!pre) throw new Error('TabNet sem tabela: ' + def + ' ' + t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));
    await fsp.writeFile(p, pre);
  }
  const ls = pre.trim().split(/\r?\n/).filter(l => l.startsWith('"'));
  const cabecalho = ls[0].replace(/&[a-z]+;/gi, '_').split(';').map(x => x.replace(/"/g, ''));
  const linhas = [];
  for (const l of ls.slice(1)) {
    const f = l.split(';');
    const m = /^"(\d{6}) /.exec(f[0]);
    if (!m || m[1] === '000000') continue;
    linhas.push([m[1], ...f.slice(1).map(v => (v === '-' ? 0 : Number(v)))]);
  }
  return { cabecalho, linhas };
}
async function tabnetOpcoes(def) { // anos/meses disponíveis no formulário e anos marcados como preliminares
  const nome = 'form_' + def.replace(/[^a-z0-9]/gi, '_') + '.html';
  const p = path.join(BRUTOS, nome);
  let html;
  if (!FORCAR && fs.existsSync(p)) html = await fsp.readFile(p, 'utf8');
  else {
    const resp = await fetch(`http://tabnet.datasus.gov.br/cgi/deftohtm.exe?${def}`, { signal: AbortSignal.timeout(120_000) });
    html = new TextDecoder('latin1').decode(await resp.arrayBuffer());
    await fsp.writeFile(p, html);
  }
  const arquivos = [...html.matchAll(/OPTION VALUE="([a-z]+\d+\.dbf)"/gi)].map(m => m[1]);
  const prelim = [...html.matchAll(/Dados de (\d{4})[^<]{0,20}Preliminar/gi)].map(m => m[1]);
  return { arquivos, prelim };
}

// ---------- SIDRA ----------
const SIDRA = 'https://apisidra.ibge.gov.br/values';
// Convenção do SIDRA: "-" = zero absoluto; "..", "..." = não se aplica / não disponível; "X" = sigilo.
const nulo = v => (v === '-' ? 0 : v == null || v === '' || /^[.X]+$/.test(v) ? null : Number(v));
// IBGE Cidades (api/v1/pesquisas) usa "-" para "sem dado" e escreve o zero como "0".
const nuloCid = v => (v == null || v === '' || /^[-.X]+$/.test(v) ? null : Number(v));
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
for (const x of pibpcBruto[0].res) pibpc6.set(x.localidade, nuloCid(x.res?.[ANO_PIB]));
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

// =====================================================================
// Indicadores sociais (colunas acrescentadas no fim): saneamento e internet (Censo 2022),
// Bolsa Família e BPC (Portal da Transparência/CGU), saúde (Ministério da Saúde) e IDHM 2010.
// =====================================================================
console.log('Indicadores sociais...');
const cod6para7 = new Map(ibgeDoSite.map(c => [String(c).slice(0, 6), String(c)]));
const ufDe = loc => COD_UF[Number(String(loc).slice(0, 2))];
// Razão categoria / total numa tabela SIDRA (devolve Map loc -> {num, tot})
function razao(linhas, catTot, catNum) {
  const m = new Map();
  for (const l of linhas) {
    const o = m.get(l.loc) ?? { num: null, tot: null };
    if (l.c.includes(catNum)) o.num = l.val; else if (l.c.includes(catTot)) o.tot = l.val;
    m.set(l.loc, o);
  }
  return m;
}
const pctR = o => (o && o.num != null && o.tot ? pct(o.num, o.tot) : null);
// Saneamento: moradores em domicílios particulares permanentes ocupados (v382), idade e cor = Total
const SAN = {
  agua: [6894, '/v/382/p/2022/c1821/72129,72144/c58/95253/c86/95251', '72129', '72144'],
  esgoto: [7555, '/v/382/p/2022/c11558/46292,46290/c58/95253/c86/95251', '46292', '46290'],
  lixo: [9541, '/v/382/p/2022/c67/10972,2520/c58/95253/c86/95251', '10972', '2520'],
  banheiro: [9397, '/v/382/p/2022/c458/72117,12032/c11558/46292/c58/95253/c86/95251', '72117', '12032'],
  internet: [9936, '/v/381/p/2022/c2072/77584,77585/c63/95826/c125/2932', '77584', '77585'], // domicílios
};
const SM = {}, SU = {};
for (const [k, [t, q, tot, num]] of Object.entries(SAN)) {
  SM[k] = razao(await sidra(`${t}_n6`, `/t/${t}/n6/all${q}`), tot, num);
  SU[k] = razao(await sidra(`${t}_n3n1`, `/t/${t}/n3/all/n1/all${q}`), tot, num);
}
const pctSemBanheiro = o => (o && o.num != null && o.tot ? r(100 - (100 * o.num) / o.tot, 1) : null);

// Lê um CSV do Portal da Transparência dentro do ZIP e soma por UF|código SIAFI as linhas do mês de
// competência (MÊS REFERÊNCIA = MÊS COMPETÊNCIA; parcelas retroativas ficam fora da contagem).
async function agregaPortal(zipPath, rotulo) {
  const cache = zipPath.replace(/\.zip$/, '_agregado.json');
  const tam = fs.statSync(zipPath).size;
  if (!FORCAR && fs.existsSync(cache)) { const c = JSON.parse(await fsp.readFile(cache, 'utf8')); if (c.zipBytes === tam) return c; }
  const z = await zipEntradas(zipPath);
  const ent = [...z.keys()].find(n => /\.csv$/i.test(n));
  const rl = readline.createInterface({ input: await z.ler(ent), crlfDelay: Infinity });
  let idx = null, lidas = 0, retro = 0, competencia = null;
  const mun = {};
  const t0 = Date.now();
  for await (const linha of rl) {
    if (!linha) continue;
    const f = linha.split(';');
    for (let i = 0; i < f.length; i++) if (f[i].charCodeAt(0) === 34) f[i] = f[i].slice(1, -1);
    if (!idx) { idx = Object.fromEntries(f.map((h, i) => [h, i])); continue; }
    lidas++;
    const comp = f[idx['MÊS COMPETÊNCIA']];
    competencia ??= comp;
    if (f[idx['MÊS REFERÊNCIA']] !== comp) { retro++; continue; }
    const chave = f[idx.UF] + '|' + f[idx['CÓDIGO MUNICÍPIO SIAFI']];
    const o = (mun[chave] ??= { n: 0, valor: 0, nome: f[idx['NOME MUNICÍPIO']] });
    o.n++;
    o.valor += Number(f[idx['VALOR PARCELA']].replace(/\./g, '').replace(',', '.')) || 0;
    if (lidas % 5_000_000 === 0) process.stdout.write(`  ${rotulo}: ${(lidas / 1e6).toFixed(0)} mi linhas\r`);
  }
  await z.fechar();
  console.log(`  ${rotulo}: ${lidas} linhas (${retro} retroativas fora) em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const out = { zipBytes: tam, competencia, lidas, retro, mun };
  await fsp.writeFile(cache, JSON.stringify(out));
  return out;
}
// Mapeamento SIAFI -> IBGE pelo nome (UF + nome sem acento/pontuação); exceções conhecidas abaixo.
const normNome = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ibgePorNome = new Map();
for (const m of JSON.parse(await fsp.readFile(path.join(DIR_IBGE, 'municipios_nomes.json'), 'utf8'))) ibgePorNome.set(ufDe(m.id) + '|' + normNome(m.nome), String(m.id));
// 'UF|NOME DO PORTAL' -> código IBGE: grafias antigas/diferentes do cadastro SIAFI (conferidas uma a uma pelo nome e UF).
const SIAFI_EXCECOES = {
  'BA|MUQUEM DE SAO FRANCISCO': '2922250', 'BA|SANTA TERESINHA': '2928505', 'CE|ITAPAGE': '2306306',
  'MG|BARAO DE MONTE ALTO': '3105509', 'MG|BRASOPOLIS': '3108909', 'MG|DONA EUSEBIA': '3122900', 'MG|SAO THOME DAS LETRAS': '3165206',
  'MT|POXOREO': '5107008', 'MT|SANTO ANTONIO DO LEVERGER': '5107800', 'PA|ELDORADO DOS CARAJAS': '1502954', 'PA|SANTA ISABEL DO PARA': '1506500',
  'PB|SAO DOMINGOS DE POMBAL': '2513968', 'PB|SERIDO': '2515401', 'PE|BELEM DE SAO FRANCISCO': '2601607',
  'PE|DISTRITO ESTADUAL DE FERNANDO DE NORONHA': '2605459', 'PE|IGUARACI': '2606903', 'PE|LAGOA DO ITAENGA': '2608503',
  'RJ|PARATI': '3303807', 'RJ|TRAJANO DE MORAIS': '3305901', 'RN|ACU': '2400208', 'RN|ARES': '2401206',
  'RN|CAMPO GRANDE (EX-AUGUSTO SEVERO)': '2401305', 'RN|SERRA CAIADA (EX-PRESIDENTE JUSCELINO)': '2410306', 'RR|SAO LUIZ': '1400605',
  'SE|AMPARO DE SAO FRANCISCO': '2800100', 'SE|GRACHO CARDOSO': '2802601', 'SP|FLORINIA': '3516101', 'SP|SAO LUIS DO PARAITINGA': '3550001',
  'TO|COUTO DE MAGALHAES': '1706001', 'TO|FORTALEZA DO TABOCAO': '1708254', 'TO|SAO VALERIO DA NATIVIDADE': '1720499',
};
function portalPorIbge(ag) {
  const out = new Map(), sem = [];
  for (const [chave, o] of Object.entries(ag.mun)) {
    const uf = chave.split('|')[0];
    const ibge = SIAFI_EXCECOES[uf + '|' + o.nome] ?? ibgePorNome.get(uf + '|' + normNome(o.nome));
    if (!ibge) { sem.push(`${chave} ${o.nome} (${o.n})`); continue; }
    const s = out.get(ibge) ?? { n: 0, valor: 0 };
    s.n += o.n; s.valor += o.valor;
    out.set(ibge, s);
  }
  return { mapa: out, sem };
}
async function ultimoPortal(tipo, sufixo) { // tenta do mês corrente para trás
  const hoje = new Date();
  for (let k = 0; k < 8; k++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    try { return { ym, zip: await baixarArquivo(`https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/${tipo}/${ym}_${sufixo}.zip`, `${ym}_${sufixo}.zip`) }; }
    catch { /* mês ainda não publicado */ }
  }
  throw new Error('nenhum arquivo do Portal da Transparência: ' + tipo);
}
const bfArq = await ultimoPortal('novo-bolsa-familia', 'NovoBolsaFamilia');
const bfAg = await agregaPortal(bfArq.zip, 'Bolsa Família ' + bfArq.ym);
const BF = portalPorIbge(bfAg);
const bpcArq = await ultimoPortal('bpc', 'BPC');
const bpcAg = await agregaPortal(bpcArq.zip, 'BPC ' + bpcArq.ym);
const BPC = portalPorIbge(bpcAg);

// Cobertura da APS (Ministério da Saúde, Relatórios Públicos da APS / e-Gestor): competência mais recente com dados
let apsComp = null, apsLista = null;
{
  const hoje = new Date();
  for (let k = 0; k < 14 && !apsLista; k++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const txt = await baixarTexto(`https://relatorioaps-prd.saude.gov.br/cobertura/aps?unidadeGeografica=MUNICIPIO&nuCompInicio=${ym}&nuCompFim=${ym}`, `aps_cobertura_${ym}.json`).catch(() => '[]');
    const j = JSON.parse(txt);
    if (Array.isArray(j) && j.length > 1000) { apsComp = ym; apsLista = j; }
  }
}
const APS = new Map(); // ibge7 -> {pop, cap}
for (const x of apsLista ?? []) {
  const c7 = cod6para7.get(String(x.coMunicipioIbge));
  if (c7) APS.set(c7, { pop: x.qtPopulacao, cap: Math.min(x.qtCapacidadeEquipe, x.qtPopulacao), ano: x.nuAnoReferencia });
}

// SINASC (TabNet): % de nascidos vivos com 7+ consultas de pré-natal, último ano não preliminar
const nvOp = await tabnetOpcoes('sinasc/cnv/nvbr.def');
const anoAtual = new Date().getFullYear();
const anosNV = nvOp.arquivos.map(a => 2000 + Number(/(\d\d)\.dbf/.exec(a)[1]) - (Number(/(\d\d)\.dbf/.exec(a)[1]) > 90 ? 100 : 0));
const ANO_NV = Math.max(...anosNV.filter(a => a < anoAtual && !nvOp.prelim.includes(String(a))));
const nv = await tabnet(`sinasc_consultas_${ANO_NV}`, 'sinasc/cnv/nvbr.def', [['Linha', 'Município'], ['Coluna', 'Consult_pré-natal'], ['Incremento', 'Nascim_p/resid.mãe'], ['Arquivos', `nvbr${String(ANO_NV).slice(2)}.dbf`], ['SMunicípio', 'TODAS_AS_CATEGORIAS__'], ['formato', 'prn'], ['mostre', 'Mostra'], ['zeradas', 'exibirlz']]);
const iNV7 = nv.cabecalho.indexOf('7 ou mais consultas'), iNVt = nv.cabecalho.indexOf('Total');
const PRENATAL = new Map(nv.linhas.map(l => [cod6para7.get(l[0]) ?? l[0], { num: l[iNV7], tot: l[iNVt] }]));

// Mortalidade infantil: óbitos < 1 ano (SIM) / nascidos vivos (SINASC), triênio até ANO_NV (IBGE Cidades, pesquisa 39)
const ANOS_MI = [ANO_NV - 2, ANO_NV - 1, ANO_NV];
const nvCid = JSON.parse(await baixarTexto('https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/78159/resultados/xxxxxx', 'cidades_78159_nascidos.json'));
const obCid = JSON.parse(await baixarTexto('https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/78160/resultados/xxxxxx', 'cidades_78160_obitos1ano.json'));
const MI = new Map();
for (const [arr, campo] of [[nvCid, 'nv'], [obCid, 'ob']]) for (const x of arr[0].res) {
  const c7 = cod6para7.get(x.localidade); if (!c7) continue;
  const o = MI.get(c7) ?? { nv: 0, ob: 0, falta: 0 };
  for (const a of ANOS_MI) { const v = nuloCid(x.res?.[a]); if (v == null) o.falta++; else o[campo] += v; }
  MI.set(c7, o);
}
const MI_MIN_NV = 100; // abaixo disso a taxa é ruído (1 óbito muda dezenas de pontos)

// Leitos de internação SUS (CNES, TabNet): competência mais recente
const ltOp = await tabnetOpcoes('cnes/cnv/leiintbr.def');
const ARQ_LT = ltOp.arquivos[0];
const COMP_LT = '20' + /(\d{4})\.dbf/.exec(ARQ_LT)[1];
const lt = await tabnet(`cnes_leitos_${COMP_LT}`, 'cnes/cnv/leiintbr.def', [['Linha', 'Município'], ['Coluna', '--Não-Ativa--'], ['Incremento', 'Quantidade_SUS'], ['Arquivos', ARQ_LT], ['SMunicípio', 'TODAS_AS_CATEGORIAS__'], ['formato', 'prn'], ['mostre', 'Mostra'], ['zeradas', 'exibirlz']]);
const LEITOS = new Map(lt.linhas.map(l => [cod6para7.get(l[0]) ?? l[0], l[1]]));

// IDHM 2010 (PNUD/Atlas Brasil, via IBGE Cidades, indicador 329756)
const idhCid = JSON.parse(await baixarTexto('https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/329756/resultados/xxxxxx', 'cidades_329756_idhm.json'));
const IDHM = new Map();
for (const x of idhCid[0].res) { const c7 = cod6para7.get(x.localidade); if (c7) IDHM.set(c7, nuloCid(x.res?.['2010'])); }

// Valores sociais de um município (loc = ibge7) ou de um agregado (UF/BR, somando municípios)
const SOCIAIS = ['pctAguaRede', 'pctEsgotoRede', 'pctLixoColetado', 'pctSemBanheiroExclusivo', 'pctDomInternet', 'bfFamilias', 'bfPctDomicilios', 'bfValorMedio', 'bpcBeneficiarios', 'bpcPctPop', 'apsCobertura', 'preNatal7mais', 'mortInfantil', 'leitosSusPorMil', 'idhm2010'];
function soma(mapa, locs, campos) {
  const s = Object.fromEntries(campos.map(c => [c, 0])); let n = 0;
  for (const l of locs) { const o = mapa.get(l); if (o == null) continue; n++; if (typeof o === 'number') s[campos[0]] += o; else for (const c of campos) s[c] += o[c] ?? 0; }
  return n ? s : null;
}
function valoresSociais(S, loc, locs, popEst) {
  const um = locs.length === 1;
  const dom = S.internet.get(loc)?.tot;
  const bf = um ? BF.mapa.get(locs[0]) : soma(BF.mapa, locs, ['n', 'valor']);
  const bpc = um ? BPC.mapa.get(locs[0]) : soma(BPC.mapa, locs, ['n', 'valor']);
  const aps = um ? APS.get(locs[0]) : soma(APS, locs, ['pop', 'cap']);
  const pn = um ? PRENATAL.get(locs[0]) : soma(PRENATAL, locs, ['num', 'tot']);
  const mi = um ? MI.get(locs[0]) : soma(MI, locs, ['nv', 'ob']);
  const lei = um ? LEITOS.get(locs[0]) : soma(LEITOS, locs, ['n'])?.n;
  return [
    pctR(S.agua.get(loc)), pctR(S.esgoto.get(loc)), pctR(S.lixo.get(loc)), pctSemBanheiro(S.banheiro.get(loc)), pctR(S.internet.get(loc)),
    bf ? bf.n : null, bf && dom ? pct(bf.n, dom) : null, bf && bf.n ? Math.round(bf.valor / bf.n) : null,
    bpc ? bpc.n : null, bpc && popEst ? pct(bpc.n, popEst) : null,
    aps && aps.pop ? pct(aps.cap, aps.pop) : null,
    pn && pn.tot ? pct(pn.num, pn.tot) : null,
    mi && (um ? !mi.falta : true) && mi.nv >= MI_MIN_NV ? r((1000 * mi.ob) / mi.nv, 1) : null,
    lei != null && popEst ? r((1000 * lei) / popEst, 2) : null,
    um ? r(IDHM.get(locs[0]), 3) : null,
  ];
}

// =====================================================================
// Segurança pública (colunas acrescentadas no fim, 30/10/2026):
//  - homicidiosPor100k (município e UF): SIM/DATASUS, óbitos por agressão (CID-10 X85–Y09) por município de
//    residência, soma dos 3 últimos anos FINAIS (preliminares e prévias ficam fora) ÷ 3 ÷ população média do triênio.
//  - mviPor100k, roubosVeiculosPor100k, estuprosPor100k (só UF): MJSP, Sinesp VDE (base de dados dos gestores
//    estaduais), último ano com os 12 meses de todas as UFs, ÷ estimativa de população do IBGE do mesmo ano.
// =====================================================================
console.log('Segurança pública...');
const ANO_CENSO_POP = 2022;
const { lerXlsx } = await import('./xlsx.mjs');
// SIM: anos finais disponíveis no TabNet
const extOp = await tabnetOpcoes('sim/cnv/ext10br.def');
const extHtml = await fsp.readFile(path.join(BRUTOS, 'form_sim_cnv_ext10br_def.html'), 'utf8');
const extNaoFinal = [...extHtml.matchAll(/Dados de (\d{4})[^<]{0,30}?(Preliminar|pr.via)/gi)].map(m => Number(m[1]));
const anosExt = extOp.arquivos.map(a => 2000 + Number(/(\d\d)\.dbf/.exec(a)[1])).filter(a => a < anoAtual && !extNaoFinal.includes(a));
const ANO_HOM = Math.max(...anosExt), ANOS_HOM = [ANO_HOM - 2, ANO_HOM - 1, ANO_HOM];
const nomeHom = `sim_agressoes_${ANOS_HOM.join('_')}`;
const hom = await tabnet(nomeHom, 'sim/cnv/ext10br.def', [['Linha', 'Município'], ['Coluna', '--Não-Ativa--'], ['Incremento', 'Óbitos_p/Residênc'], ...ANOS_HOM.map(a => ['Arquivos', `extbr${String(a).slice(2)}.dbf`]), ['SMunicípio', 'TODAS_AS_CATEGORIAS__'], ['SGrande_Grupo_CID10', '4'], ['formato', 'prn'], ['mostre', 'Mostra'], ['zeradas', 'exibirlz']]);
const HOM = new Map(hom.linhas.map(l => [cod6para7.get(l[0]) ?? l[0], l[1]]));
// "MUNICIPIO IGNORADO - UF": residentes na UF sem município informado (entram só no total da UF)
const homIgn = {};
for (const m of (await fsp.readFile(path.join(BRUTOS, `tabnet_${nomeHom}.txt`), 'utf8')).matchAll(/"\s*MUNICIPIO IGNORADO - ([A-Z]{2})";(\d+|-)/g)) homIgn[m[1]] = m[2] === '-' ? 0 : Number(m[2]);
// População média do triênio: Censo 2022 no ano do Censo, estimativa do IBGE (tabela 6579) nos anos com estimativa,
// interpolação linear nos anos sem nenhuma das duas (ex.: 2023).
const anosEst = per6579.map(p => Number(p.id));
const ESTS = {};
for (const a of new Set([...ANOS_HOM, ...anosEst.filter(x => x > Math.min(...ANOS_HOM) - 4 && x < Math.max(...ANOS_HOM) + 4)])) {
  if (a === ANO_CENSO_POP || !anosEst.includes(a)) continue;
  ESTS[a] = { m: indexar(await sidra(`6579_${a}_n6`, `/t/6579/n6/all/v/9324/p/${a}`)), u: indexar(await sidra(`6579_${a}_n3n1`, `/t/6579/n3/all/n1/all/v/9324/p/${a}`)) };
}
function popAno(nivel, loc, a) {
  const conhecido = x => (x === ANO_CENSO_POP ? (nivel === 'm' ? M : U).pop.get(loc) : ESTS[x]?.[nivel].get(loc)) ?? null;
  const v = conhecido(a); if (v != null) return v;
  const disp = [ANO_CENSO_POP, ...Object.keys(ESTS).map(Number)].filter(x => conhecido(x) != null).sort((x, y) => x - y);
  const antes = disp.filter(x => x < a).pop(), depois = disp.find(x => x > a);
  if (antes == null || depois == null) return null;
  return conhecido(antes) + ((conhecido(depois) - conhecido(antes)) * (a - antes)) / (depois - antes);
}
const popMediaHom = (nivel, loc) => { const ps = ANOS_HOM.map(a => popAno(nivel, loc, a)); return ps.some(p => p == null) ? null : ps.reduce((x, y) => x + y, 0) / ps.length; };
const taxaHom = (obitos, pop) => (obitos == null || !pop ? null : r((100000 * obitos) / ANOS_HOM.length / pop, 1));

// Sinesp VDE (MJSP): planilha anual; usa o ano mais recente com 12 meses de homicídio doloso em todas as UFs
const SINESP_URL = a => `https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica/download/dnsp-base-de-dados/bancovde-${a}.xlsx/@@download/file`;
const EV_MVI = ['Homicídio doloso', 'Feminicídio', 'Roubo seguido de morte (latrocínio)', 'Lesão corporal seguida de morte', 'Morte por intervenção de Agente do Estado'];
const EV_ESTUPRO = ['Estupro', 'Estupro de vulnerável'];
async function sinespAno(a) {
  const cache = path.join(BRUTOS, `sinesp_vde_${a}_agregado.json`);
  const xlsx = await baixarArquivo(SINESP_URL(a), `sinesp_bancovde-${a}.xlsx`);
  const tam = fs.statSync(xlsx).size;
  if (!FORCAR && fs.existsSync(cache)) { const c = JSON.parse(await fsp.readFile(cache, 'utf8')); if (c.xlsxBytes === tam) return c; }
  const wb = await lerXlsx(xlsx);
  const L = wb.linhas(wb.nomes[0]);
  const ix = Object.fromEntries(L[0].map((h, i) => [h, i]));
  const uf = {}, meses = {};
  for (const l of L.slice(1)) {
    const ev = l[ix.evento], u = l[ix.uf];
    if (!ev || !u) continue;
    const v = (l[ix.total_vitima] ?? 0) + (l[ix.total] ?? 0); // eventos de vítima usam total_vitima; ocorrências usam total
    const o = (uf[u] ??= {});
    o[ev] = (o[ev] ?? 0) + v;
    if (ev === 'Homicídio doloso' && v > 0) ((meses[u] ??= {})[l[ix.data_referencia]] = 1);
  }
  const out = { xlsxBytes: tam, ano: a, uf, mesesHomicidio: Object.fromEntries(Object.entries(meses).map(([u, m]) => [u, Object.keys(m).length])) };
  await fsp.writeFile(cache, JSON.stringify(out));
  return out;
}
let SIN = null;
for (let a = anoAtual - 1; a >= anoAtual - 3 && !SIN; a--) {
  try { const s = await sinespAno(a); if (UFS.every(u => s.mesesHomicidio[u] === 12)) SIN = s; else console.log(`  Sinesp ${a}: incompleto`); }
  catch (e) { console.warn(`  Sinesp ${a}: ${e.message.split('\n')[0]}`); }
}
const ANO_SIN = SIN?.ano ?? null;
const popSin = ANO_SIN && anosEst.includes(ANO_SIN) ? indexar(await sidra(`6579_${ANO_SIN}_n3n1`, `/t/6579/n3/all/n1/all/v/9324/p/${ANO_SIN}`)) : null;
function valoresSinesp(ufs, loc) {
  if (!SIN || !popSin) return [null, null, null];
  const pop = popSin.get(loc); if (!pop) return [null, null, null];
  const soma = evs => ufs.reduce((t, u) => t + evs.reduce((s, ev) => s + (SIN.uf[u]?.[ev] ?? 0), 0), 0);
  return [r((100000 * soma(EV_MVI)) / pop, 1), r((100000 * soma(['Roubo de veículo'])) / pop, 1), r((100000 * soma(EV_ESTUPRO)) / pop, 1)];
}
const SEGURANCA_MUN = ['homicidiosPor100k'];
const SEGURANCA_UF = ['homicidiosPor100k', 'mviPor100k', 'roubosVeiculosPor100k', 'estuprosPor100k'];

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
const mesTxt = ym => `${String(ym).slice(4, 6)}/${String(ym).slice(0, 4)}`;
const fBF = { nome: `CGU, Portal da Transparência, Novo Bolsa Família, pagamentos de ${mesTxt(bfAg.competencia)} (parcelas do próprio mês; município pelo nome)`, ano: Number(String(bfAg.competencia).slice(0, 4)), mes: mesTxt(bfAg.competencia), url: `https://portaldatransparencia.gov.br/download-de-dados/novo-bolsa-familia/${bfArq.ym}` };
const fBPC = { nome: `CGU, Portal da Transparência, BPC, pagamentos de ${mesTxt(bpcAg.competencia)} (parcelas do próprio mês)`, ano: Number(String(bpcAg.competencia).slice(0, 4)), mes: mesTxt(bpcAg.competencia), url: `https://portaldatransparencia.gov.br/download-de-dados/bpc/${bpcArq.ym}` };
const CAMPOS_SOCIAIS = [
  ['pctAguaRede', '% dos moradores', { nome: 'IBGE, Censo 2022, tabela 6894 (v382; possui ligação à rede geral de água e a usa como forma principal)', ano: ANO_CENSO, url: sidraUrl(6894) }],
  ['pctEsgotoRede', '% dos moradores', { nome: 'IBGE, Censo 2022, tabela 7555 (v382; esgoto por rede geral, rede pluvial ou fossa ligada à rede)', ano: ANO_CENSO, url: sidraUrl(7555) }],
  ['pctLixoColetado', '% dos moradores', { nome: 'IBGE, Censo 2022, tabela 9541 (v382; lixo coletado no domicílio ou em caçamba)', ano: ANO_CENSO, url: sidraUrl(9541) }],
  ['pctSemBanheiroExclusivo', '% dos moradores', { nome: 'IBGE, Censo 2022, tabela 9397 (v382; 100 − "tinham banheiro de uso exclusivo do domicílio")', ano: ANO_CENSO, url: sidraUrl(9397) }],
  ['pctDomInternet', '% dos domicílios', { nome: 'IBGE, Censo 2022, tabela 9936 (v381; domicílios com conexão domiciliar à Internet)', ano: ANO_CENSO, url: sidraUrl(9936) }],
  ['bfFamilias', 'famílias', fBF],
  ['bfPctDomicilios', 'famílias por 100 domicílios (Censo 2022)', { ...fBF, nome: fBF.nome + ' ÷ domicílios particulares permanentes ocupados do Censo 2022 (tabela 9936)' }],
  ['bfValorMedio', 'R$ por família no mês', fBF],
  ['bpcBeneficiarios', 'benefícios', fBPC],
  ['bpcPctPop', `% da população estimada ${ANO_EST}`, { ...fBPC, nome: fBPC.nome + ` ÷ população estimada ${ANO_EST} (tabela 6579)` }],
  ['apsCobertura', '% (limitada a 100)', { nome: `Ministério da Saúde, SAPS, Relatórios Públicos da APS, Histórico de Cobertura da APS, competência ${mesTxt(apsComp)} (capacidade de cadastro das equipes ÷ população)`, ano: Number(String(apsComp).slice(0, 4)), mes: mesTxt(apsComp), url: 'https://relatorioaps.saude.gov.br/cobertura/aps' }],
  ['preNatal7mais', '% dos nascidos vivos', { nome: `Ministério da Saúde, SINASC (TabNet), nascidos vivos por residência da mãe com 7 ou mais consultas de pré-natal, ${ANO_NV}`, ano: ANO_NV, url: 'http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sinasc/cnv/nvbr.def' }],
  ['mortInfantil', 'óbitos < 1 ano por mil nascidos vivos', { nome: `Ministério da Saúde (SIM/SINASC) via IBGE Cidades, pesquisa 39 (indicadores 78160 ÷ 78159), triênio ${ANOS_MI[0]}–${ANO_NV}; null se < ${MI_MIN_NV} nascidos vivos no triênio`, ano: ANO_NV, url: 'https://servicodados.ibge.gov.br/api/v1/pesquisas/39/periodos/all/indicadores' }],
  ['leitosSusPorMil', `leitos por mil hab. (pop. ${ANO_EST})`, { nome: `Ministério da Saúde, CNES (TabNet), leitos de internação — quantidade SUS, ${mesTxt(COMP_LT)}, por município do estabelecimento`, ano: Number(COMP_LT.slice(0, 4)), mes: mesTxt(COMP_LT), url: 'http://tabnet.datasus.gov.br/cgi/deftohtm.exe?cnes/cnv/leiintbr.def' }],
  ['idhm2010', 'índice 0-1', { nome: 'PNUD/Atlas Brasil, IDHM 2010 (via IBGE Cidades, indicador 329756); só município', ano: 2010, url: 'https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/329756/resultados/xxxxxx' }],
];
if (CAMPOS_SOCIAIS.map(c => c[0]).join() !== SOCIAIS.join()) throw new Error('CAMPOS_SOCIAIS fora de ordem');
const colunasBase = CAMPOS.map(c => c[0]);
const colunas = [...colunasBase, ...SOCIAIS, ...SEGURANCA_MUN];
const fHom = { nome: `Ministério da Saúde, SIM (TabNet), óbitos por agressão (CID-10 X85–Y09) por município de residência, média de ${ANOS_HOM[0]}–${ANO_HOM} (anos finais) ÷ população média do triênio (Censo 2022, estimativas do IBGE da tabela 6579 e interpolação linear no ano sem nenhuma das duas). UF = soma dos municípios + residentes com município ignorado`, ano: ANO_HOM, anos: ANOS_HOM, url: 'http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sim/cnv/ext10br.def', unidade: 'óbitos por 100 mil hab. por ano' };
const fSin = (o, extra) => ({ nome: `Ministério da Justiça e Segurança Pública, Sinesp VDE ${ANO_SIN} (base dos gestores estaduais, bancovde-${ANO_SIN}.xlsx): ${extra} ÷ estimativa de população ${ANO_SIN} do IBGE (tabela 6579)`, ano: ANO_SIN, url: 'https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica/dados-nacionais-1/base-de-dados-e-notas-metodologicas-dos-gestores-estaduais-sinesp-vde-2022-e-2023', unidade: o });
const fontesSeg = {
  homicidiosPor100k: fHom,
  mviPor100k: fSin('vítimas por 100 mil hab.', 'mortes violentas intencionais = vítimas de homicídio doloso + feminicídio + latrocínio + lesão corporal seguida de morte + morte por intervenção de agente do Estado (polícias estaduais, PF e PRF)'),
  roubosVeiculosPor100k: fSin('ocorrências por 100 mil hab.', 'ocorrências de roubo de veículo'),
  estuprosPor100k: fSin('vítimas por 100 mil hab.', 'vítimas de estupro + estupro de vulnerável'),
};
const fontes = Object.fromEntries([...CAMPOS, ...CAMPOS_SOCIAIS].map(([k, u, f]) => [k, { ...f, unidade: u }]));
fontes.homicidiosPor100k = fHom;

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
  const v = [...valoresIBGE(M, loc, pibpc), ...valoresTSE(tsePorIbge.get(loc)), ...valoresSociais(SM, loc, [loc], M.est.get(loc)), taxaHom(HOM.get(loc), popMediaHom('m', loc))];
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
const locsUF = uf => ibgeDoSite.map(String).filter(c => ufDe(c) === uf);
dadosUF.BR = [...valoresIBGE(U, '1', pibBR.pib / pibBR.pop), ...valoresTSE(somaTSE(u => u !== 'ZZ'))];
dadosUF.ZZ = [...Array(11).fill(null), ...valoresTSE(somaTSE(u => u === 'ZZ'))];
// Ordem das colunas de UF: base, giniRendaPc (já existia nessa posição) e depois os indicadores sociais.
const colunasUF = [...colunasBase, 'giniRendaPc', ...SOCIAIS, ...SEGURANCA_UF];
for (const [uf, v] of Object.entries(dadosUF)) {
  v.push(uf === 'ZZ' ? null : r(gini.get(uf === 'BR' ? '1' : String(UF_COD[uf])), 3));
  if (uf === 'ZZ') v.push(...Array(SOCIAIS.length).fill(null));
  else if (uf === 'BR') v.push(...valoresSociais(SU, '1', ibgeDoSite.map(String), U.est.get('1')));
  else v.push(...valoresSociais(SU, String(UF_COD[uf]), locsUF(uf), U.est.get(String(UF_COD[uf]))));
  // Segurança: homicídios (SIM, soma dos municípios + ignorados da UF) e Sinesp VDE por UF
  if (uf === 'ZZ') { v.push(...Array(SEGURANCA_UF.length).fill(null)); continue; }
  const ufsAqui = uf === 'BR' ? UFS : [uf], loc = uf === 'BR' ? '1' : String(UF_COD[uf]);
  const locs = uf === 'BR' ? ibgeDoSite.map(String) : locsUF(uf);
  const obitos = locs.reduce((t, c) => t + (HOM.get(c) ?? 0), 0) + ufsAqui.reduce((t, u) => t + (homIgn[u] ?? 0), 0);
  v.push(taxaHom(obitos, popMediaHom('u', loc)), ...valoresSinesp(ufsAqui, loc));
}
const fontesUF = { ...fontes, ...fontesSeg, giniRendaPc: { nome: 'IBGE, Censo 2022, tabela 10301 (v13418 Índice de Gini do rendimento domiciliar per capita)', ano: ANO_CENSO, url: sidraUrl(10301), unidade: 'índice 0-1' } };

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
console.log(`Bolsa Família ${bfAg.competencia}: ${[...BF.mapa.values()].reduce((a, o) => a + o.n, 0)} famílias mapeadas; sem IBGE: ${BF.sem.join('; ') || 'nenhum'}`);
console.log(`BPC ${bpcAg.competencia}: ${[...BPC.mapa.values()].reduce((a, o) => a + o.n, 0)} benefícios mapeados; sem IBGE: ${BPC.sem.join('; ') || 'nenhum'}`);
console.log(`Homicídios (SIM) ${ANOS_HOM.join('-')}: ${[...HOM.values()].reduce((a, b) => a + b, 0)} óbitos em municípios + ${Object.values(homIgn).reduce((a, b) => a + b, 0)} com município ignorado; BR ${dadosUF.BR[colunasUF.indexOf('homicidiosPor100k')]}/100 mil. Sinesp VDE ${ANO_SIN}: MVI BR ${dadosUF.BR[colunasUF.indexOf('mviPor100k')]}, roubo de veículo ${dadosUF.BR[colunasUF.indexOf('roubosVeiculosPor100k')]}, estupro ${dadosUF.BR[colunasUF.indexOf('estuprosPor100k')]} por 100 mil`);
console.log(`APS ${apsComp}; SINASC ${ANO_NV} (preliminares: ${nvOp.prelim.join(',') || '-'}); mortalidade ${ANOS_MI.join('-')}; leitos ${COMP_LT}`);
for (const f of ['contexto-municipios.json', 'contexto-uf.json']) console.log(`  site/dados/${f}: ${(fs.statSync(path.join(SAIDA, f)).size / 1024).toFixed(0)} KB`);
