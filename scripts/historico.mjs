// Eleições anteriores (2º turno, Presidente) e o "fluxo normal" dos boletins de urna de 2022, para comparar com 2026.
// Uso: node --max-old-space-size=6000 scripts/historico.mjs
//   - baixa (uma vez) os boletins de urna do 2º turno de 2022, 2018 e 2014 e o detalhe da apuração por
//     município e zona, conferindo o hash publicado pelo TSE (dados/historico/, ignorado pelo git);
//   - lê os CSV direto de dentro dos ZIP (sem extrair) e guarda um cache por ano em dados/historico/cache/;
//   - escreve site/dados/historico-municipios.json e site/dados/historico-resumo.json.
// Sem dependências. Idempotente: arquivo baixado com hash certo não é baixado de novo; HISTORICO_SEM_CACHE=1 relê os CSV.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DIR = path.join(RAIZ, 'dados/historico');
const DIR_CACHE = path.join(DIR, 'cache');
const DIR_IBGE = path.join(RAIZ, 'dados/ibge');
const SAIDA = path.join(RAIZ, 'site/dados');
const CKAN = 'https://dadosabertos.tse.jus.br/api/3/action/package_show?id=';
const SEM_CACHE = process.env.HISTORICO_SEM_CACHE === '1';

// Mesmas regras de fuso do construir.mjs: horas a somar ao horário local da urna para chegar em Brasília.
const FUSO = { AC: 2, AM: 1, RO: 1, RR: 1, MT: 1, MS: 1 };

const ANOS = {
  2022: { pacote: 'resultados-2022-boletim-de-urna', dia: '30/10/2022', diaIso: '2022-10-30', detalhe: 'https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip' },
  2018: { pacote: 'resultados-2018-boletim-de-urna', dia: '28/10/2018', diaIso: '2018-10-28', detalhe: 'https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2018.zip' },
  2014: { pacote: 'resultados-2014-boletim-de-urna', dia: '26/10/2014', diaIso: '2014-10-26', detalhe: 'https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2014.zip' }
};
// Zonas com mais urnas encerradas depois das 19h em 2026 (docs/ANALISE-INCONSISTENCIAS.md, item 2.2): como fecharam em 2022?
const ZONAS_PICO_2026 = ['RJ|RIO DE JANEIRO|122', 'RJ|RIO DE JANEIRO|238', 'RJ|RIO DE JANEIRO|234', 'RJ|RIO DE JANEIRO|245', 'RJ|RIO DE JANEIRO|120', 'RJ|RIO DE JANEIRO|9', 'RJ|PETRÓPOLIS|65', 'RJ|ITABORAÍ|104', 'BA|SALVADOR|5', 'BA|SALVADOR|19', 'BA|SALVADOR|2', 'SP|SÃO PAULO|381', 'SP|SÃO PAULO|1', 'SP|SÃO PAULO|253', 'PB|JOÃO PESSOA|76'];

// ---------- CSV (igual ao construir.mjs) ----------
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
const num = v => { if (v === '' || v == null || v === '#NULO#') return null; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };

// "30/10/2022 17:34:43" ou "2022-10-30 17:34:43" -> minutos desde a 0h do dia da eleição (dia seguinte = +1440), com segundos em fração.
function minutosDesde(v, diaIso) {
  const m = /(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d):(\d\d)/.exec(v || '') || null;
  let iso, h, mi, s;
  if (m) { iso = m[3] + '-' + m[2] + '-' + m[1]; h = +m[4]; mi = +m[5]; s = +m[6]; }
  else {
    const k = /(\d{4}-\d\d-\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(v || '');
    if (!k) return null;
    iso = k[1]; h = +k[2]; mi = +k[3]; s = +k[4];
  }
  const dias = Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(diaIso + 'T00:00:00Z')) / 864e5);
  return dias * 1440 + h * 60 + mi + s / 60;
}

// ---------- Download com conferência de hash ----------
async function baixarTexto(url) {
  try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  catch (e) { return execFileSync('curl', ['-sSfL', '--ssl-no-revoke', '-m', '120', url], { encoding: 'utf8', maxBuffer: 1 << 28 }); }
}
async function baixarArquivo(url, destino) {
  const tmp = destino + '.parcial';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
  } catch (e) {
    console.warn('  fetch falhou (' + (e.cause?.code || e.message) + '), tentando curl:', path.basename(destino));
    execFileSync('curl', ['-sSfL', '--ssl-no-revoke', '-m', '1800', '-o', tmp, url]);
  }
  await fsp.rename(tmp, destino);
}
async function hashArquivo(arq, alg) {
  const h = crypto.createHash(alg);
  await pipeline(fs.createReadStream(arq), h);
  return h.digest('hex');
}
async function emParalelo(itens, n, fn) {
  const fila = [...itens]; const out = [];
  await Promise.all(Array.from({ length: n }, async () => { while (fila.length) { const it = fila.shift(); out.push(await fn(it)); } }));
  return out;
}

async function baixarAno(ano) {
  const cfg = ANOS[ano];
  const dir = path.join(DIR, String(ano));
  await fsp.mkdir(dir, { recursive: true });
  const arqCat = path.join(dir, 'catalogo.json');
  let recursos;
  if (fs.existsSync(arqCat)) recursos = JSON.parse(await fsp.readFile(arqCat, 'utf8'));
  else {
    const j = JSON.parse(await baixarTexto(CKAN + cfg.pacote));
    recursos = j.result.resources.filter(r => /segundo turno/i.test(r.name)).map(r => ({ nome: r.name, url: r.url }));
    await fsp.writeFile(arqCat, JSON.stringify(recursos, null, 1));
  }
  const zips = recursos.filter(r => /\.zip$/i.test(r.url));
  const hashes = new Map(recursos.filter(r => /\.(sha512|sha1)$/i.test(r.url)).map(r => [r.url.replace(/\.(sha512|sha1)$/i, ''), r.url]));
  const integridade = await emParalelo(zips, 4, async r => {
    const nome = path.basename(r.url), destino = path.join(dir, nome);
    const urlHash = hashes.get(r.url);
    const alg = urlHash?.toLowerCase().endsWith('.sha1') ? 'sha1' : 'sha512';
    let esperado = null;
    const arqHash = destino + '.' + alg;
    if (urlHash) {
      if (!fs.existsSync(arqHash)) await fsp.writeFile(arqHash, await baixarTexto(urlHash));
      esperado = (await fsp.readFile(arqHash, 'utf8')).trim().split(/\s+/)[0].toLowerCase();
    }
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (!fs.existsSync(destino)) { console.log('  baixando', nome); await baixarArquivo(r.url, destino); }
      const obtido = await hashArquivo(destino, alg);
      if (!esperado || obtido === esperado) return { arquivo: nome, uf: /_2t_([A-Z]{2})_/i.exec(nome)?.[1]?.toUpperCase(), bytes: (await fsp.stat(destino)).size, alg, hash: obtido, integridade: esperado ? true : null, url: r.url };
      console.warn('  hash não confere, baixando de novo:', nome);
      await fsp.unlink(destino);
    }
    throw new Error('hash não confere depois de 3 tentativas: ' + nome);
  });
  integridade.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
  await fsp.writeFile(path.join(dir, 'integridade.json'), JSON.stringify(integridade, null, 1));
  // Detalhe da apuração por município e zona (totalização oficial, ~4 MB): só para conferir os totais dos boletins.
  const det = path.join(dir, path.basename(cfg.detalhe));
  if (!fs.existsSync(det)) { console.log('  baixando', path.basename(det)); await baixarArquivo(cfg.detalhe, det); }
  return { integridade, detalhe: det };
}

// ---------- Leitor de ZIP (sem extrair): diretório central + inflateRaw por entrada ----------
async function entradasZip(arq) {
  const fh = await fsp.open(arq, 'r');
  try {
    const { size } = await fh.stat();
    const tam = Math.min(size, 65557 + 22 + 20);
    const fim = Buffer.alloc(tam);
    await fh.read(fim, 0, tam, size - tam);
    const eocd = fim.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error('ZIP sem diretório central: ' + arq);
    let n = fim.readUInt16LE(eocd + 10), cdTam = fim.readUInt32LE(eocd + 12), cdOff = fim.readUInt32LE(eocd + 16);
    if (n === 0xffff || cdOff === 0xffffffff || cdTam === 0xffffffff) {
      const loc = fim.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd);
      const z = Buffer.alloc(56);
      await fh.read(z, 0, 56, Number(fim.readBigUInt64LE(loc + 8)));
      n = Number(z.readBigUInt64LE(32)); cdTam = Number(z.readBigUInt64LE(40)); cdOff = Number(z.readBigUInt64LE(48));
    }
    const cd = Buffer.alloc(cdTam);
    await fh.read(cd, 0, cdTam, cdOff);
    const out = [];
    for (let p = 0, i = 0; i < n; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('diretório central inválido: ' + arq);
      const metodo = cd.readUInt16LE(p + 10);
      let comp = cd.readUInt32LE(p + 20), descomp = cd.readUInt32LE(p + 24), off = cd.readUInt32LE(p + 42);
      const nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      const nome = cd.toString('latin1', p + 46, p + 46 + nl);
      for (let e = p + 46 + nl; e < p + 46 + nl + el;) { // extra zip64
        const id = cd.readUInt16LE(e), t = cd.readUInt16LE(e + 2);
        if (id === 1) {
          let q = e + 4;
          if (descomp === 0xffffffff) { descomp = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (comp === 0xffffffff) { comp = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); q += 8; }
        }
        e += 4 + t;
      }
      out.push({ nome, metodo, comp, descomp, off });
      p += 46 + nl + el + cl;
    }
    for (const e of out) {
      const lh = Buffer.alloc(30);
      await fh.read(lh, 0, 30, e.off);
      e.inicio = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    }
    return out;
  } finally { await fh.close(); }
}
async function* linhasZip(arq, entrada) {
  if (entrada.comp === 0) return;
  const bruto = fs.createReadStream(arq, { start: entrada.inicio, end: entrada.inicio + entrada.comp - 1, highWaterMark: 1 << 20 });
  const fluxo = entrada.metodo === 8 ? bruto.pipe(zlib.createInflateRaw({ chunkSize: 1 << 20 })) : bruto;
  fluxo.setEncoding('latin1');
  const rl = readline.createInterface({ input: fluxo, crlfDelay: Infinity });
  for await (const l of rl) if (l) yield l;
}

// ---------- IBGE ----------
const tseIbge = new Map();
for (const l of (await fsp.readFile(path.join(DIR_IBGE, 'municipios_tse_ibge.csv'), 'utf8')).trim().split(/\r?\n/).slice(1)) {
  const [tse, uf, , , ibge] = l.split(',');
  tseIbge.set(uf + '|' + Number(tse), Number(ibge));
}
const IBGE_POR_NOME = { 'MT|BOA ESPERANÇA DO NORTE': 5101837 };
const ibgeDe = (uf, mun, nome) => tseIbge.get(uf + '|' + mun) ?? IBGE_POR_NOME[uf + '|' + nome] ?? null;

// ---------- Leitura dos boletins de um ano: uma entrada por seção (cargo Presidente) ----------
// Seção em cache: [uf, mun, munNome, zona, sec, local, aptos, comp, abst, biom, tipoUrna, abre, fecha, emis, receb, votos{nr:q}, branco, nulo]
const LAYOUT_2014 = { SG_UF: 4, CD_CARGO_PERGUNTA: 5, NR_ZONA: 7, NR_SECAO: 8, NR_LOCAL_VOTACAO: 9, CD_MUNICIPIO: 12, NM_MUNICIPIO: 13, QT_APTOS: 15, QT_ABSTENCOES: 16, QT_COMPARECIMENTO: 17, DS_TIPO_URNA: 20, NR_VOTAVEL: 21, NM_VOTAVEL: 22, QT_VOTOS: 23 };
async function lerAno(ano, integridade) {
  const cfg = ANOS[ano];
  await fsp.mkdir(DIR_CACHE, { recursive: true });
  const arqCache = path.join(DIR_CACHE, 'secoes_' + ano + '.json');
  const assinatura = integridade.map(i => i.arquivo + ':' + i.hash).join('|');
  if (!SEM_CACHE && fs.existsSync(arqCache)) {
    const c = JSON.parse(await fsp.readFile(arqCache, 'utf8'));
    if (c.assinatura === assinatura) { console.log(ano + ': cache', c.secoes.length, 'seções'); return c; }
  }
  const t0 = Date.now();
  const secoes = new Map(), candidatos = new Map();
  let linhasLidas = 0, linhasPresidente = 0;
  for (const it of integridade) {
    const arq = path.join(DIR, String(ano), it.arquivo);
    const entradas = (await entradasZip(arq)).filter(e => /\.(csv|txt)$/i.test(e.nome));
    for (const ent of entradas) {
      let idx = null, n = 0;
      for await (const l of linhasZip(arq, ent)) {
        if (!idx) {
          const h = parseLinha(l).map(x => x.replace(/\s+/g, ''));
          if (h[0] === 'DT_GERACAO') { n = h.length; idx = Object.fromEntries(h.map((x, i) => [x, i])); if (idx.QT_ELEITORES_BIOMETRIA_NH == null && idx.QT_ELEI_BIOM_SEM_HABILITACAO != null) idx.QT_ELEITORES_BIOMETRIA_NH = idx.QT_ELEI_BIOM_SEM_HABILITACAO; continue; }
          idx = LAYOUT_2014; n = parseLinha(l).length; // 2014: sem cabeçalho
        }
        linhasLidas++;
        const f = campos(l, n);
        if (f[idx.CD_CARGO_PERGUNTA] !== '1') continue;
        linhasPresidente++;
        const uf = f[idx.SG_UF], mun = Number(f[idx.CD_MUNICIPIO]), zona = Number(f[idx.NR_ZONA]), sec = Number(f[idx.NR_SECAO]);
        const chave = uf + '|' + mun + '|' + zona + '|' + sec;
        let s = secoes.get(chave);
        if (!s) {
          s = [uf, mun, f[idx.NM_MUNICIPIO], zona, sec, Number(f[idx.NR_LOCAL_VOTACAO]),
            num(f[idx.QT_APTOS]), num(f[idx.QT_COMPARECIMENTO]), num(f[idx.QT_ABSTENCOES]),
            idx.QT_ELEITORES_BIOMETRIA_NH != null ? num(f[idx.QT_ELEITORES_BIOMETRIA_NH]) : null, f[idx.DS_TIPO_URNA] ?? null,
            idx.DT_ABERTURA != null ? minutosDesde(f[idx.DT_ABERTURA], cfg.diaIso) : null,
            idx.DT_ENCERRAMENTO != null ? minutosDesde(f[idx.DT_ENCERRAMENTO], cfg.diaIso) : null,
            idx.DT_EMISSAO_BU != null ? minutosDesde(f[idx.DT_EMISSAO_BU], cfg.diaIso) : null,
            idx.DT_BU_RECEBIDO != null && idx !== LAYOUT_2014 ? minutosDesde(f[idx.DT_BU_RECEBIDO], cfg.diaIso) : null,
            {}, 0, 0];
          secoes.set(chave, s);
        }
        const nr = f[idx.NR_VOTAVEL], q = num(f[idx.QT_VOTOS]) || 0;
        if (nr === '' || nr == null) continue; // 2014: seção sem votos ou "NÃO INSTALADA" (linha só com aptos/faltosos)
        let tipo = idx.DS_TIPO_VOTAVEL != null ? f[idx.DS_TIPO_VOTAVEL] : (nr === '95' ? 'Branco' : nr === '96' ? 'Nulo' : Number(nr) >= 90 ? 'Outro' : 'Nominal');
        if (tipo === 'Nominal') { candidatos.set(nr, f[idx.NM_VOTAVEL]); s[15][nr] = (s[15][nr] || 0) + q; }
        else if (tipo === 'Branco') s[16] += q;
        else s[17] += q;
      }
    }
    process.stdout.write('  ' + ano + ' ' + it.arquivo + ' ' + secoes.size + ' seções\n');
  }
  const out = { assinatura, linhasLidas, linhasPresidente, candidatos: [...candidatos.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([nr, nome]) => ({ nr, nome })), secoes: [...secoes.values()] };
  await fsp.writeFile(arqCache, JSON.stringify(out));
  console.log(ano + ': lido em', Math.round((Date.now() - t0) / 1000), 's,', out.secoes.length, 'seções,', linhasLidas, 'linhas');
  return out;
}

// Converte o cache em objetos de seção com os mesmos nomes do construir.mjs.
function montarSecoes(bruto) {
  const [A, B] = bruto.candidatos.map(c => c.nr);
  return bruto.secoes.map(r => {
    const s = { uf: r[0], mun: r[1], munNome: r[2], zona: r[3], sec: r[4], local: r[5], aptos: r[6], comp: r[7], abst: r[8], biom: r[9], tipoUrna: r[10], abre: r[11], fecha: r[12], emis: r[13], receb: r[14], branco: r[16], nulo: r[17] };
    s.a = r[15][A] || 0; s.b = r[15][B] || 0; s.val = s.a + s.b;
    s.ibge = s.uf === 'ZZ' ? null : ibgeDe(s.uf, s.mun, s.munNome);
    s.chaveLocal = s.uf + '|' + s.mun + '|' + s.zona + '|' + s.local;
    return s;
  });
}

// ---------- Agregações ----------
const novoTotal = () => ({ secoes: 0, aptos: 0, comp: 0, abst: 0, biom: 0, a: 0, b: 0, br: 0, nu: 0 });
function somar(t, s) { t.secoes++; t.aptos += s.aptos || 0; t.comp += s.comp || 0; t.abst += s.abst || 0; t.biom += s.biom || 0; t.a += s.a; t.b += s.b; t.br += s.branco; t.nu += s.nulo; return t; }
function totais(lista, comBiom) {
  const total = novoTotal(), brasil = novoTotal(), porUf = {};
  for (const s of lista) { somar(total, s); if (s.uf !== 'ZZ') somar(brasil, s); somar(porUf[s.uf] ||= novoTotal(), s); }
  const limpar = t => { if (!comBiom) delete t.biom; return t; };
  return { total: limpar(total), totalBrasil: limpar(brasil), porUf: Object.fromEntries(Object.keys(porUf).sort().map(u => [u, limpar(porUf[u])])) };
}

// Histograma e contagens de encerramento: mesma estrutura do horario do resumo.json de 2026.
function horario(lista, paraBsb) {
  const porMun = new Map();
  for (const s of lista) { const k = s.uf + '|' + s.mun; const M = porMun.get(k) || { a: 0, b: 0 }; M.a += s.a; M.b += s.b; porMun.set(k, M); }
  const hist = new Map();
  const h = { apos17: 0, apos1705: 0, apos1730: 0, apos18: 0, apos19: 0, bruto_apos17: 0, bruto_apos19: 0, semHorario: 0 };
  const faixas = [[0, 17 * 60 + 5], [17 * 60 + 5, 17 * 60 + 30], [17 * 60 + 30, 18 * 60], [18 * 60, 19 * 60], [19 * 60, 24 * 60]].map(([ini, fim]) => ({ ini, fim, secoes: 0, comp: 0, a: 0, val: 0, difMun: 0 }));
  const tabela = [[0, 17 * 60], [17 * 60, 17 * 60 + 30], [17 * 60 + 30, 18 * 60], [18 * 60, 18 * 60 + 30], [18 * 60 + 30, 18 * 60 + 55], [18 * 60 + 55, 19 * 60], [19 * 60, 19 * 60 + 15], [19 * 60 + 15, 48 * 60]].map(([ini, fim]) => ({ ini, fim, secoes: 0 }));
  const minuto17 = new Array(8).fill(0), minuto19 = new Array(8).fill(0);
  const porUf = {};
  let exatas17 = 0, exatas19 = 0; const antes17PorUf = {};
  for (const s of lista) {
    if (s.fecha == null) { h.semHorario++; continue; }
    if (s.fecha > 17 * 60) h.bruto_apos17++;
    if (s.fecha > 19 * 60) h.bruto_apos19++;
    const t = paraBsb ? (s.uf === 'ZZ' ? null : s.fecha + 60 * (FUSO[s.uf] || 0)) : (s.uf === 'ZZ' ? null : s.fecha);
    if (t == null) continue;
    const u = porUf[s.uf] ||= [0, 0, 0, 0, 0, 0]; // secoes, >17:05, >17:30, >18:00, >19:00, 19:00–19:15
    u[0]++;
    if (t > 17 * 60) h.apos17++;
    if (t > 17 * 60 + 5) { h.apos1705++; u[1]++; }
    if (t > 17 * 60 + 30) { h.apos1730++; u[2]++; }
    if (t > 18 * 60) { h.apos18++; u[3]++; }
    if (t > 19 * 60) { h.apos19++; u[4]++; }
    if (t >= 19 * 60 && t < 19 * 60 + 15) u[5]++;
    if (t < 17 * 60) antes17PorUf[s.uf] = (antes17PorUf[s.uf] || 0) + 1;
    if (t === 17 * 60) exatas17++;
    if (t === 19 * 60) exatas19++;
    if (t >= 17 * 60 && t < 17 * 60 + 8) minuto17[Math.floor(t - 17 * 60)]++;
    if (t >= 19 * 60 && t < 19 * 60 + 8) minuto19[Math.floor(t - 19 * 60)]++;
    const blk = Math.floor(Math.min(Math.max(t, 16 * 60 + 30), 21 * 60) / 5) * 5;
    const hb = hist.get(blk) || { secoes: 0, a: 0, val: 0 }; hb.secoes++; hb.a += s.a; hb.val += s.val; hist.set(blk, hb);
    const f = faixas.find(x => t >= x.ini && t < x.fim);
    if (f) { const M = porMun.get(s.uf + '|' + s.mun); f.secoes++; f.comp += s.comp; f.a += s.a; f.val += s.val; if (M.a + M.b) f.difMun += s.a - s.val * M.a / (M.a + M.b); }
    const tb = tabela.find(x => t >= x.ini && t < x.fim); if (tb) tb.secoes++;
  }
  h.histograma = [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([m, x]) => ({ min: m, secoes: x.secoes, pctA: x.val ? x.a / x.val : null }));
  h.faixas = faixas.map(f => ({ ini: f.ini, fim: f.fim, secoes: f.secoes, comp: f.comp, pctA: f.val ? f.a / f.val : null, ppMun: f.val ? 100 * f.difMun / f.val : null }));
  h.tabela = tabela;
  const tot17 = h.apos17 + exatas17, tot19 = h.apos19 + exatas19;
  h.formatoMinuto = { aPartirDas17: minuto17.map(x => tot17 ? r2(100 * x / tot17) : null), aPartirDas19: minuto19.map(x => tot19 ? r2(100 * x / tot19) : null) };
  h.exatamente17h = exatas17; h.exatamente19h = exatas19; h.antes17PorUf = antes17PorUf;
  h.porUf = { colunas: ['secoes', 'apos1705', 'apos1730', 'apos18', 'apos19', 'de1900a1915'], ufs: porUf };
  return h;
}

// Linha do tempo do recebimento: mesmo formato do apuracao do resumo.json de 2026 + curva acumulada nacional.
function apuracao(lista) {
  const blocos = new Map();
  for (const s of lista) {
    if (s.receb == null) continue;
    const min = Math.floor(s.receb / 5) * 5;
    let b = blocos.get(min); if (!b) blocos.set(min, b = {});
    const u = b[s.uf] || (b[s.uf] = [0, 0, 0]);
    u[0]++; u[1] += s.a; u[2] += s.b;
  }
  return [...blocos.entries()].sort((a, b) => a[0] - b[0]).map(([min, ufs]) => ({ min, ufs }));
}
// semExterior: tira a UF ZZ (no exterior há postos que fecham de madrugada no horário de Brasília).
function curva(apurTodas, semExterior = true) {
  const ok = u => !semExterior || u !== 'ZZ';
  const apur = apurTodas.filter(bl => Object.keys(bl.ufs).some(ok));
  let tot = 0; for (const b of apur) for (const [k, u] of Object.entries(b.ufs)) if (ok(k)) tot += u[0];
  let sec = 0, a = 0, b = 0;
  const pontos = apur.map(bl => {
    for (const [k, u] of Object.entries(bl.ufs)) if (ok(k)) { sec += u[0]; a += u[1]; b += u[2]; }
    return { min: bl.min, secoes: sec, pctSecoes: r2(100 * sec / tot), pctA: a + b ? r2(100 * a / (a + b)) : null };
  });
  // Virada: último bloco em que a liderança no acumulado trocou de lado.
  let virada = null;
  for (let i = 1; i < pontos.length; i++) if ((pontos[i].pctA > 50) !== (pontos[i - 1].pctA > 50)) virada = { min: pontos[i].min, pctSecoes: pontos[i].pctSecoes, pctAAntes: pontos[i - 1].pctA, pctADepois: pontos[i].pctA };
  // Maior intervalo sem nenhum BU (em blocos de 5 min), entre o primeiro e o último bloco.
  let vazio = { ini: null, fim: null, min: 0 };
  for (let i = 1; i < apur.length; i++) { const d = apur[i].min - apur[i - 1].min - 5; if (d > vazio.min) vazio = { ini: apur[i - 1].min + 5, fim: apur[i].min, min: d }; }
  return { pontos, virada, maiorVazio5min: vazio, primeiroBloco: apur[0]?.min ?? null, ultimoBloco: apur.at(-1)?.min ?? null, total: tot };
}

// Alertas: mesmas 11 regras do construir.mjs.
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
function alertas(lista, temHorario) {
  const porLocal = new Map();
  for (const s of lista) { let L = porLocal.get(s.chaveLocal); if (!L) porLocal.set(s.chaveLocal, L = { n: 0, aptos: 0, comp: 0, a: 0, b: 0 }); L.n++; L.aptos += s.aptos || 0; L.comp += s.comp || 0; L.a += s.a; L.b += s.b; }
  const contagem = Object.fromEntries(Object.keys(TIPOS_ALERTA).map(k => [k, 0]));
  const porUf = {}; let com = 0;
  for (const s of lista) {
    const al = [];
    if (s.aptos != null && s.comp != null && s.comp > s.aptos) al.push('comp_maior_aptos');
    if (s.aptos != null && s.comp != null && s.abst != null && s.comp + s.abst !== s.aptos) al.push('aptos_nao_fecham');
    if (s.comp != null && s.val + s.branco + s.nulo !== s.comp) al.push('votos_nao_fecham');
    if (s.biom != null && s.comp != null && s.biom > s.comp) al.push('biom_maior_comp');
    if (s.val >= 50 && (s.a === 0 || s.b === 0)) al.push('unanime');
    if (s.biom != null && s.comp >= 50 && s.biom / s.comp >= 0.5) al.push('biom_alta');
    const L = porLocal.get(s.chaveLocal);
    if (L.n >= 3) {
      const outrosA = L.a - s.a, outrosVal = L.a + L.b - s.val;
      if (s.val >= 100 && outrosVal > 0 && Math.abs(s.a / s.val - outrosA / outrosVal) >= 0.30) al.push('destoa_local');
      const outrosComp = L.comp - s.comp, outrosAptos = L.aptos - s.aptos;
      if (s.aptos > 0 && outrosAptos > 0 && Math.abs(s.comp / s.aptos - outrosComp / outrosAptos) >= 0.25) al.push('comp_destoa_local');
    }
    if (temHorario && s.fecha != null && s.uf !== 'ZZ' && s.fecha + 60 * (FUSO[s.uf] || 0) >= 19 * 60) al.push('fecha_19h');
    if (s.tipoUrna && s.tipoUrna.toLowerCase() !== 'apurada') al.push('urna_nao_apurada');
    if (temHorario && s.fecha == null) al.push('sem_horario');
    for (const k of al) { contagem[k]++; const u = porUf[s.uf] ||= {}; u[k] = (u[k] || 0) + 1; }
    if (al.length) com++;
  }
  return { tipos: TIPOS_ALERTA, contagem, secoesComAlerta: com, porUf };
}

const r2 = x => x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100;
const pct = (x, y) => y ? 100 * x / y : null;
const mediana = arr => { const v = arr.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const quantis = (arr, qs) => { const v = arr.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b); return Object.fromEntries(qs.map(q => ['p' + Math.round(q * 1000) / 10, v.length ? r2(v[Math.min(v.length - 1, Math.floor(q * v.length))]) : null])); };

// Conferência com a totalização oficial (detalhe_votacao_munzona): Presidente, 2º turno.
async function oficial(arqDetalhe) {
  const ents = (await entradasZip(arqDetalhe)).filter(e => /\.csv$/i.test(e.nome));
  const br = ents.filter(e => /_BR\.csv$/i.test(e.nome));
  const usar = br.length ? br : ents.filter(e => !/_BRASIL\.csv$/i.test(e.nome));
  const brasil = { aptos: 0, comp: 0, abst: 0, br: 0, nu: 0, nominais: 0, secoes: 0 }, porUf = {}, porMun = new Map();
  for (const ent of usar) {
    let idx = null, n = 0;
    for await (const l of linhasZip(arqDetalhe, ent)) {
      if (!idx) { const h = parseLinha(l); n = h.length; idx = Object.fromEntries(h.map((x, i) => [x, i])); continue; }
      const f = campos(l, n);
      if (f[idx.CD_CARGO] !== '1' || f[idx.NR_TURNO] !== '2') continue;
      const uf = f[idx.SG_UF];
      const v = { aptos: num(f[idx.QT_APTOS]) || 0, comp: num(f[idx.QT_COMPARECIMENTO]) || 0, abst: num(f[idx.QT_ABSTENCOES]) || 0, br: num(f[idx.QT_VOTOS_BRANCOS]) || 0, nu: num(f[idx.QT_TOTAL_VOTOS_NULOS] ?? f[idx.QT_VOTOS_NULOS]) || 0, nominais: num(f[idx.QT_VOTOS_NOMINAIS_VALIDOS] ?? f[idx.QT_VOTOS_NOMINAIS]) || 0, secoes: num(f[idx.QT_TOTAL_SECOES]) || 0 };
      const alvos = [porUf[uf] ||= { aptos: 0, comp: 0, abst: 0, br: 0, nu: 0, nominais: 0, secoes: 0 }];
      if (uf !== 'ZZ') { alvos.push(brasil); const k = uf + '|' + Number(f[idx.CD_MUNICIPIO]); if (!porMun.has(k)) porMun.set(k, { aptos: 0, comp: 0, abst: 0, br: 0, nu: 0, nominais: 0, secoes: 0 }); alvos.push(porMun.get(k)); }
      for (const t of alvos) for (const c in v) t[c] += v[c];
    }
  }
  return { brasil, porUf, porMun };
}

// ---------- Execução ----------
await fsp.mkdir(DIR, { recursive: true });
const resultados = {};
for (const ano of [2022, 2018, 2014]) {
  console.log('== ' + ano);
  const { integridade, detalhe } = await baixarAno(ano);
  const bruto = await lerAno(ano, integridade);
  const secoes = montarSecoes(bruto);
  resultados[ano] = { integridade, detalhe, bruto, secoes };
}

const fontes = {};
const anos = {}; // historico-resumo.json -> anos
const munAnos = {}; // historico-municipios.json -> anos
const COLS_MUN = ['secoes', 'aptos', 'comp', 'a', 'b', 'branco', 'nulo'];
const conferencia = {};
for (const ano of [2014, 2018, 2022]) {
  const { integridade, detalhe, bruto, secoes } = resultados[ano];
  const temBiom = ano >= 2018;
  const t = totais(secoes, temBiom);
  anos[ano] = { data: ANOS[ano].diaIso, candidatos: bruto.candidatos, ...t };
  fontes[ano] = {
    boletins: 'https://dadosabertos.tse.jus.br/dataset/' + ANOS[ano].pacote, arquivos: integridade.length,
    exemplo: integridade.find(i => i.uf === 'SP')?.url, hash: integridade[0]?.alg, integridadeConferida: integridade.every(i => i.integridade === true),
    bytes: integridade.reduce((x, i) => x + i.bytes, 0), linhasLidas: bruto.linhasLidas, detalhe: ANOS[ano].detalhe
  };
  // Municípios
  const porMun = new Map(); const semIbge = new Set();
  for (const s of secoes) {
    if (s.uf === 'ZZ') continue;
    if (!s.ibge) { semIbge.add(s.uf + ' ' + s.munNome + ' (' + s.mun + ')'); continue; }
    somar(porMun.get(s.ibge) || porMun.set(s.ibge, novoTotal()).get(s.ibge), s);
  }
  munAnos[ano] = Object.fromEntries([...porMun.entries()].sort((a, b) => a[0] - b[0]).map(([ibge, M]) => [ibge, [M.secoes, M.aptos, M.comp, M.a, M.b, M.br, M.nu]]));
  // Conferência com a totalização
  const of = await oficial(detalhe);
  const B = t.totalBrasil;
  let munDif = 0; const exemplosDif = [];
  const porMunTse = new Map();
  for (const s of secoes) { if (s.uf === 'ZZ') continue; const k = s.uf + '|' + s.mun; somar(porMunTse.get(k) || porMunTse.set(k, novoTotal()).get(k), s); }
  for (const [k, o] of of.porMun) {
    const m = porMunTse.get(k);
    if (!m || m.comp !== o.comp || m.aptos !== o.aptos || m.br !== o.br || m.nu !== o.nu || m.a + m.b !== o.nominais) { munDif++; if (exemplosDif.length < 10) exemplosDif.push({ municipio: k, boletins: m ? { aptos: m.aptos, comp: m.comp, validos: m.a + m.b, br: m.br, nu: m.nu } : null, oficial: o }); }
  }
  conferencia[ano] = {
    boletins: { secoes: B.secoes, aptos: B.aptos, comp: B.comp, validos: B.a + B.b, br: B.br, nu: B.nu },
    oficial: of.brasil,
    diferenca: { aptos: B.aptos - of.brasil.aptos, comp: B.comp - of.brasil.comp, validos: B.a + B.b - of.brasil.nominais, br: B.br - of.brasil.br, nu: B.nu - of.brasil.nu },
    municipiosOficial: of.porMun.size, municipiosBoletins: porMunTse.size, municipiosComDiferenca: munDif, exemplosDif,
    municipiosSemIbge: [...semIbge]
  };
  console.log(ano, 'Brasil:', JSON.stringify({ secoes: B.secoes, aptos: B.aptos, comp: B.comp, a: B.a, b: B.b, br: B.br, nu: B.nu }), '| oficial:', JSON.stringify(of.brasil), '| municípios com diferença:', munDif, '| sem IBGE:', semIbge.size);
}

// 2026: lido do que o construir.mjs já gerou (somente leitura).
const r26 = JSON.parse(await fsp.readFile(path.join(SAIDA, 'resumo.json'), 'utf8'));
const mun26 = JSON.parse(await fsp.readFile(path.join(SAIDA, 'municipios.json'), 'utf8'));
anos[2026] = { data: '2026-10-25', candidatos: r26.candidatos, total: r26.total, totalBrasil: r26.totalBrasil, porUf: r26.porUf, fonte: 'site/dados/resumo.json (scripts/construir.mjs)' };
for (const k of ['total', 'totalBrasil']) delete anos[2026][k].alertas;
anos[2026].porUf = Object.fromEntries(Object.entries(r26.porUf).map(([u, v]) => { const { alertas: _, ...resto } = v; return [u, resto]; }));

// ---------- Fluxo 2022 ----------
const S22 = resultados[2022].secoes;
const ap22 = apuracao(S22);
const brS22 = S22.filter(s => s.uf !== 'ZZ');
const recebOrdenado = brS22.map(s => s.receb).filter(x => x != null).sort((a, b) => a - b);
let maiorVazioExato = { ini: null, fim: null, min: 0 };
for (let i = 1; i < recebOrdenado.length; i++) { const d = recebOrdenado[i] - recebOrdenado[i - 1]; if (d > maiorVazioExato.min) maiorVazioExato = { ini: r2(recebOrdenado[i - 1]), fim: r2(recebOrdenado[i]), min: r2(d) }; }
// Emissão com data absurda (relógio da urna errado, anos antes) é descartada: só vale entre o encerramento e +24 h.
const emisOk = s => s.emis != null && s.fecha != null && s.emis >= s.fecha - 60 && s.emis <= s.fecha + 1440;
const emisB = s => !emisOk(s) || s.uf === 'ZZ' ? null : s.emis + 60 * (FUSO[s.uf] || 0);
const fechaB = s => s.fecha == null || s.uf === 'ZZ' ? null : s.fecha + 60 * (FUSO[s.uf] || 0);
const biomUf = ss => { const o = {}; for (const s of ss) { if (s.uf === 'ZZ') continue; const u = o[s.uf] ||= [0, 0, 0, 0]; u[0] += s.biom || 0; u[1] += s.comp || 0; if (s.biom === 0) u[3]++; } for (const u of Object.values(o)) u[2] = r2(pct(u[0], u[1])); return o; };
const zonasPico = (ss) => Object.fromEntries(ZONAS_PICO_2026.map(z => {
  const [uf, nome, zona] = z.split('|');
  const l = ss.filter(s => s.uf === uf && s.munNome === nome && s.zona === Number(zona));
  const t = l.map(fechaB).filter(x => x != null);
  return [uf + ' ' + nome + ' Z' + zona, { secoes: l.length, apos1730: t.filter(x => x > 17 * 60 + 30).length, apos19: t.filter(x => x > 19 * 60).length, encerramentoMediano: mediana(t) == null ? null : r2(mediana(t)) }];
}));
const fluxo2022 = {
  horario: horario(S22, true),
  apuracao: ap22,
  curva: curva(ap22), curvaComExterior: { ...curva(ap22, false), pontos: undefined },
  recebimento: {
    primeiro: r2(recebOrdenado[0]), ultimo: r2(recebOrdenado.at(-1)), maiorVazioExato,
    ate1710: recebOrdenado.filter(x => x < 17 * 60 + 10).length, entre1710e1900: recebOrdenado.filter(x => x >= 17 * 60 + 10 && x < 19 * 60).length,
    porHora: Object.fromEntries([17, 18, 19, 20, 21, 22, 23].map(h => [h + 'h', recebOrdenado.filter(x => x >= h * 60 && x < (h + 1) * 60).length])),
    depoisDoDia: recebOrdenado.filter(x => x >= 1440).length,
    ufsSemBuAntesDas19h: [...new Set(brS22.map(s => s.uf))].filter(u => !brS22.some(s => s.uf === u && s.receb != null && s.receb < 19 * 60)).sort(),
    emissaoAteRecebimentoMin: quantis(brS22.map(s => s.receb != null && emisB(s) != null ? s.receb - emisB(s) : null), [0, 0.01, 0.1, 0.5, 0.9, 0.99, 1]),
    recebidoAntesDaEmissao: brS22.filter(s => s.receb != null && emisB(s) != null && s.receb < emisB(s)).length,
    emissaoMenosEncerramentoMin: quantis(S22.map(s => emisOk(s) ? s.emis - s.fecha : null), [0, 0.01, 0.5, 0.99, 1]),
    emissaoComDataAbsurda: S22.filter(s => s.emis != null && s.fecha != null && !emisOk(s)).length,
    emissaoMaisDe60minAposEncerrar: S22.filter(s => emisOk(s) && s.emis - s.fecha > 60).length
  },
  abertura: { mediana: r2(mediana(brS22.map(s => s.abre == null ? null : s.abre + 60 * (FUSO[s.uf] || 0)))), depoisDas9hBsb: brS22.filter(s => s.abre != null && s.abre + 60 * (FUSO[s.uf] || 0) > 9 * 60).length },
  biometria: { total: anos[2022].totalBrasil.biom, comp: anos[2022].totalBrasil.comp, pct: r2(pct(anos[2022].totalBrasil.biom, anos[2022].totalBrasil.comp)), secoesZeradas: brS22.filter(s => s.biom === 0).length, porUf: { colunas: ['biom', 'comp', 'pct', 'secoesZeradas'], ufs: biomUf(S22) } },
  alertas: alertas(S22, true),
  zonasDoPico2026: zonasPico(S22)
};
// Mesmos números de 2026, recalculados aqui do resumo.json para ficar lado a lado.
const cur26 = curva(r26.apuracao);
const cur26Ext = { ...curva(r26.apuracao, false), pontos: undefined };
const biom26 = Object.fromEntries(Object.entries(r26.porUf).filter(([u]) => u !== 'ZZ').map(([u, v]) => [u, [v.biom, v.comp, r2(pct(v.biom, v.comp))]]));
const fluxo2026 = { curva: cur26, curvaComExterior: cur26Ext, biometria: { total: r26.totalBrasil.biom, comp: r26.totalBrasil.comp, pct: r2(pct(r26.totalBrasil.biom, r26.totalBrasil.comp)), porUf: { colunas: ['biom', 'comp', 'pct'], ufs: biom26 } }, alertas: { contagem: r26.alertas.contagem, secoesComAlerta: r26.alertas.secoesComAlerta }, horario: { apos17: r26.horario.apos17, apos1705: r26.horario.apos1705, apos1730: r26.horario.apos1730, apos18: r26.horario.apos18, apos19: r26.horario.apos19 }, fonte: 'site/dados/resumo.json' };

// ---------- Fluxo 2018 (leve: sem horário de recebimento) ----------
// Em 2018 a votação era das 8h às 17h no horário LOCAL; por isso o histograma em horário local é o comparável.
const S18 = resultados[2018].secoes;
const fluxo2018 = {
  aviso: 'Em 2018 a votação ia das 8h às 17h no horário local de cada UF (o horário unificado de Brasília começou em 2022). O boletim de 2018 não traz DT_BU_RECEBIDO nem DT_EMISSAO_BU.',
  horarioLocal: horario(S18, false),
  horarioBrasilia: horario(S18, true),
  biometria: { total: anos[2018].totalBrasil.biom, comp: anos[2018].totalBrasil.comp, pct: r2(pct(anos[2018].totalBrasil.biom, anos[2018].totalBrasil.comp)), secoesZeradas: S18.filter(s => s.uf !== 'ZZ' && s.biom === 0).length, porUf: { colunas: ['biom', 'comp', 'pct', 'secoesZeradas'], ufs: biomUf(S18) } },
  alertas: alertas(S18, false),
  zonasDoPico2026: zonasPico(S18)
};
fluxo2018.alertas.obs = 'fecha_19h e sem_horario não se aplicam a 2018 (horário local).';
const S14 = resultados[2014].secoes;
const alertas2014 = alertas(S14, false);

// ---------- Comparações 2022 -> 2026 ----------
const ind = t => ({ compPct: pct(t.comp, t.aptos), aVal: pct(t.a, t.a + t.b), aComp: pct(t.a, t.comp), bComp: pct(t.b, t.comp), bnComp: pct(t.br + t.nu, t.comp) });
function variacao(t22, t26) {
  if (!t22 || !t26 || !t22.aptos || !t26.aptos || !t22.comp || !t26.comp) return null;
  const x = ind(t22), y = ind(t26);
  return { dComparecimentoPP: r2(y.compPct - x.compPct), dPctAValidosPP: r2(y.aVal - x.aVal), dPctAComparecPP: r2(y.aComp - x.aComp), dPctBComparecPP: r2(y.bComp - x.bComp), dBrancoNuloPP: r2(y.bnComp - x.bnComp), dAptosPct: r2(100 * (t26.aptos / t22.aptos - 1)), dVotantesPct: r2(100 * (t26.comp / t22.comp - 1)), dVotosA: t26.a - t22.a, dVotosB: t26.b - t22.b };
}
const COLS_VAR = ['dComparecimentoPP', 'dPctAValidosPP', 'dPctAComparecPP', 'dPctBComparecPP', 'dBrancoNuloPP', 'dAptosPct', 'dVotantesPct', 'dVotosA', 'dVotosB'];
const comparacaoUf = {};
for (const u of Object.keys(anos[2026].porUf)) {
  const t22 = anos[2022].porUf[u], t26 = anos[2026].porUf[u];
  comparacaoUf[u] = { ...variacao(t22, t26), compPct2022: r2(ind(t22).compPct), compPct2026: r2(ind(t26).compPct), pctA2022: r2(ind(t22).aVal), pctA2026: r2(ind(t26).aVal), bnPct2022: r2(ind(t22).bnComp), bnPct2026: r2(ind(t26).bnComp), biomPct2022: r2(pct(t22.biom, t22.comp)), biomPct2026: r2(pct(t26.biom, t26.comp)) };
}
const comparacaoBrasil = { ...variacao(anos[2022].totalBrasil, anos[2026].totalBrasil), compPct2022: r2(ind(anos[2022].totalBrasil).compPct), compPct2026: r2(ind(anos[2026].totalBrasil).compPct), pctA2022: r2(ind(anos[2022].totalBrasil).aVal), pctA2026: r2(ind(anos[2026].totalBrasil).aVal), bnPct2022: r2(ind(anos[2022].totalBrasil).bnComp), bnPct2026: r2(ind(anos[2026].totalBrasil).bnComp) };
const varMun = {}; let semPar = [];
const tot = (arr) => ({ secoes: arr[0], aptos: arr[1], comp: arr[2], a: arr[3], b: arr[4], br: arr[5], nu: arr[6] });
const faixasMun = { dComparecimentoPP: {}, dPctAValidosPP: {} };
const faixa = (x, passo) => x == null ? null : (Math.floor(x / passo) * passo).toString();
for (const m of mun26) {
  const ibge = m[0]; if (!ibge) continue;
  const v22 = munAnos[2022][ibge];
  if (!v22) { semPar.push(m[1] + ' ' + m[2]); continue; }
  const v = variacao(tot(v22), { secoes: m[5], aptos: m[6], comp: m[7], a: m[9], b: m[10], br: m[11], nu: m[12] });
  if (!v) continue;
  varMun[ibge] = COLS_VAR.map(c => v[c]);
  const fc = faixa(v.dComparecimentoPP, 2), fa = faixa(v.dPctAValidosPP, 2);
  faixasMun.dComparecimentoPP[fc] = (faixasMun.dComparecimentoPP[fc] || 0) + 1;
  faixasMun.dPctAValidosPP[fa] = (faixasMun.dPctAValidosPP[fa] || 0) + 1;
}
const listaVar = Object.entries(varMun);
const ordem = (i, dir) => listaVar.slice().sort((x, y) => dir * (x[1][i] - y[1][i])).slice(0, 10).map(([ibge, v]) => { const m = mun26.find(z => z[0] === Number(ibge)); return { ibge: Number(ibge), uf: m[1], nome: m[2], valor: v[i], votantes2026: m[7] }; });
const grandes = listaVar.filter(([ibge]) => (mun26.find(z => z[0] === Number(ibge))?.[7] || 0) >= 10000);
const medianaVar = i => r2(mediana(listaVar.map(x => x[1][i])));
const resumoMun = {
  municipiosComparados: listaVar.length, semPar2022: semPar,
  mediana: Object.fromEntries(COLS_VAR.slice(0, 7).map((c, i) => [c, medianaVar(i)])),
  municipiosQueSubiramA: listaVar.filter(x => x[1][1] > 0).length, municipiosQueCairamA: listaVar.filter(x => x[1][1] < 0).length,
  municipiosComparecimentoSubiu: listaVar.filter(x => x[1][0] > 0).length, municipiosComparecimentoCaiu: listaVar.filter(x => x[1][0] < 0).length,
  faixas2pp: faixasMun,
  maioresAltasA: ordem(1, -1), maioresQuedasA: ordem(1, 1),
  maioresAltasComparecimento: ordem(0, -1), maioresQuedasComparecimento: ordem(0, 1),
  obsGrandes: 'grandes = municípios com ≥ 10 mil votantes em 2026',
  grandesMaioresAltasA: grandes.slice().sort((x, y) => y[1][1] - x[1][1]).slice(0, 10).map(([ibge, v]) => { const m = mun26.find(z => z[0] === Number(ibge)); return { ibge: Number(ibge), uf: m[1], nome: m[2], valor: v[1], votantes2026: m[7] }; }),
  grandesMaioresQuedasA: grandes.slice().sort((x, y) => x[1][1] - y[1][1]).slice(0, 10).map(([ibge, v]) => { const m = mun26.find(z => z[0] === Number(ibge)); return { ibge: Number(ibge), uf: m[1], nome: m[2], valor: v[1], votantes2026: m[7] }; })
};

// ---------- Saídas ----------
const notas = [
  'A = candidato de número 13 (campo petista) em todos os anos; B = o outro finalista do 2º turno (2014: 45 Aécio Neves/PSDB; 2018: 17 Jair Bolsonaro/PSL; 2022: 22 Jair Bolsonaro/PL; 2026: 22 Flávio Bolsonaro).',
  'Números dos boletins de urna (bweb), cargo Presidente, uma linha por seção; "nulo" inclui tudo que não é voto nominal nem branco. totalBrasil exclui o exterior (UF ZZ).',
  'Municípios pelo código IBGE (dados/ibge/municipios_tse_ibge.csv). Boa Esperança do Norte (MT, 5101837) só existe a partir de 2025: em 2022 o território votou em Sorriso e Nova Ubiratã.',
  'Horários convertidos para Brasília com o fuso da UF (mesma regra do construir.mjs: oeste do AM e Fernando de Noronha ficam com o fuso da UF).',
  'pp = pontos percentuais. Variações 2022→2026 = valor de 2026 menos valor de 2022.'
];
const historicoResumo = {
  meta: { gerado: new Date().toISOString(), script: 'scripts/historico.mjs', notas, fontes, colunasApuracao: '[secoes, votosA, votosB] por UF em cada bloco de 5 min; min = minutos desde a 0h do dia da eleição (dia seguinte = +1440), horário de Brasília' },
  anos,
  conferencia,
  fluxo: { 2022: fluxo2022, 2018: fluxo2018, 2026: fluxo2026, 2014: { aviso: 'O boletim de 2014 não traz horários nem biometria.', alertas: alertas2014 } },
  comparacao: { '2022-2026': { brasil: comparacaoBrasil, porUf: comparacaoUf, municipios: resumoMun } }
};
const historicoMunicipios = {
  colunas: COLS_MUN,
  candidatos: Object.fromEntries([2014, 2018, 2022].map(a => [a, anos[a].candidatos])),
  fontes: Object.fromEntries([2014, 2018, 2022].map(a => [a, { url: fontes[a].boletins, ano: a, arquivos: fontes[a].arquivos }])),
  notas,
  anos: munAnos,
  variacao2022a2026: { colunas: COLS_VAR, municipios: varMun }
};
await fsp.writeFile(path.join(SAIDA, 'historico-resumo.json'), JSON.stringify(historicoResumo));
await fsp.writeFile(path.join(SAIDA, 'historico-municipios.json'), JSON.stringify(historicoMunicipios));
for (const f of ['historico-resumo.json', 'historico-municipios.json']) console.log(f, Math.round((await fsp.stat(path.join(SAIDA, f))).size / 1024), 'KB');
console.log(JSON.stringify({
  brasil2022: comparacaoBrasil,
  horario2022: { ...fluxo2022.horario, histograma: undefined, faixas: undefined, porUf: undefined },
  curva2022: { ...fluxo2022.curva, pontos: undefined }, curva2026: { ...cur26, pontos: undefined },
  recebimento2022: fluxo2022.recebimento, biometria2022: { ...fluxo2022.biometria, porUf: undefined }, alertas2022: fluxo2022.alertas.contagem,
  zonasDoPico2026_em2022: fluxo2022.zonasDoPico2026,
  horario2018Local: { ...fluxo2018.horarioLocal, histograma: undefined, faixas: undefined, porUf: undefined }
}, null, 1));
