// Votos depois das 17h pelos LOGS DAS URNAS (2º turno de 2026, 25/10/2026).
//
// O boletim de urna (BU) só traz abertura e encerramento. O log da urna (arquivo -log.jez dentro dos
// "arquivos transmitidos para totalização" do TSE) registra cada evento com data e hora, inclusive cada
// "O voto do eleitor foi computado". O log NÃO diz em quem o eleitor votou: aqui só se mede comparecimento no tempo.
//
// Fonte: https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao
//   ZIP por UF: https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/arqurnatot/bu_imgbu_logjez_rdv_vscmr_2026_2t_UF.zip
//   (de 310 MB a 24 GB). Nada de baixar UF inteira: o script lê só o diretório central do ZIP (pedido HTTP Range
//   no fim do arquivo) e depois baixa, também por Range, só os -log.jez das seções escolhidas (~180 KB cada).
//   O .jez é outro ZIP (deflate) com logd.dat (texto latin1, colunas por TAB: "dd/mm/aaaa hh:mm:ss", nível,
//   nº da urna, aplicação, mensagem, hash). O log cobre a urna desde a carga (1º e 2º turno): só 25/10 é usado.
//
// Uso (Node 18+, sem dependências):
//   node scripts/logs-urna.mjs indice      # lê dados/extraidos/bweb -> dados/logs/secoes.json (1 linha por seção, Presidente)
//   node scripts/logs-urna.mjs amostra     # escolhe as seções (todas as das 19h, controle, estratos, UFs pequenas inteiras)
//   node scripts/logs-urna.mjs baixar      # diretórios centrais + -log.jez das seções escolhidas (dados/logs/, retomável)
//   node scripts/logs-urna.mjs analisar    # lê os logs -> site/dados/votos-apos-17h.json
//   node scripts/logs-urna.mjs tudo
//   node scripts/logs-urna.mjs ver UF MUNTSE ZONA SECAO [desde_hh:mm]   # imprime o log de 25/10 de uma seção
// Variáveis: LOGS_CONC=12 (downloads em paralelo).
// Dados brutos ficam em dados/logs/ (ignorado pelo git).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DIR_BWEB = path.join(RAIZ, 'dados/extraidos/bweb');
const DIR = path.join(RAIZ, 'dados/logs');
const DIR_CD = path.join(DIR, 'cd');
const DIR_JEZ = path.join(DIR, 'jez');
const ARQ_INDICE = path.join(DIR, 'secoes.json');
const ARQ_AMOSTRA = path.join(DIR, 'amostra.json');
const ARQ_RES = path.join(DIR, 'resultados.jsonl');
const SAIDA = path.join(RAIZ, 'site/dados/votos-apos-17h.json');
const URL_ZIP = uf => `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/arqurnatot/bu_imgbu_logjez_rdv_vscmr_2026_2t_${uf}.zip`;
const CONC = Number(process.env.LOGS_CONC || 12);
const DIA = '25/10/2026';
const FUSO_UF = { AC: 2, AM: 1, RO: 1, RR: 1, MT: 1, MS: 1 };

// Plano da amostra (seed fixa: refazer dá as mesmas seções)
const SEED = 20261025;
const UFS_INTEIRAS = ['AC', 'AP', 'RR'];              // UFs pequenas lidas por inteiro (validação do estimador)
const CONTROLE_POR_UF = 100;                          // seções normais (fecharam 17:00–17:05 de Brasília) por UF
// estratos pelo horário de encerramento (minutos de Brasília) e quantas seções sortear em cada um (Infinity = todas)
const ESTRATOS = [
  { id: 'e1700', de: 17 * 60, ate: 17 * 60 + 5, n: null },      // controle: sorteado por UF (CONTROLE_POR_UF)
  { id: 'e1705', de: 17 * 60 + 5, ate: 17 * 60 + 10, n: 200 },
  { id: 'e1710', de: 17 * 60 + 10, ate: 17 * 60 + 20, n: 200 },
  { id: 'e1720', de: 17 * 60 + 20, ate: 17 * 60 + 30, n: 200 },
  { id: 'e1730', de: 17 * 60 + 30, ate: 18 * 60, n: 250 },
  { id: 'e1800', de: 18 * 60, ate: 19 * 60, n: Infinity },
  { id: 'e1900', de: 19 * 60, ate: 48 * 60, n: Infinity },       // todas as que fecharam a partir das 19h (alertas fecha_19h)
];
const estratoDe = fechaB => { for (const e of ESTRATOS) if (fechaB >= e.de && fechaB < e.ate) return e.id; return fechaB < 17 * 60 ? 'antes17' : null; };

// ---------------------------------------------------------------- utilidades
const chaveSec = (uf, mun, zona, sec) => `${uf}|${mun}|${zona}|${sec}`;
const nomeEntrada = (uf, mun, zona, sec) => `o03221${uf.toLowerCase()}${String(mun).padStart(5, '0')}${String(zona).padStart(4, '0')}${String(sec).padStart(4, '0')}-log.jez`;
const hhmm = m => m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const hhmmss = s => s == null ? null : `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const mediana = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const r1 = x => Math.round(x * 10) / 10;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sortear(lista, n, rand) { const a = [...lista]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
const lerJson = async p => JSON.parse(await fsp.readFile(p, 'utf8'));

async function baixarRange(url, ini, fim, tentativas = 6) {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(url, { headers: { Range: `bytes=${ini}-${fim}` } });
      if (r.status !== 206) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (t >= tentativas) throw e;
      await new Promise(ok => setTimeout(ok, 1000 * t * t));
    }
  }
}
async function tamanho(url) {
  const r = await fetch(url, { method: 'HEAD' });
  if (!r.ok) throw new Error(`HEAD ${r.status} ${url}`);
  return Number(r.headers.get('content-length'));
}
async function emParalelo(itens, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => { while (i < itens.length) { const k = i++; await fn(itens[k], k); } }));
}

// ---------------------------------------------------------------- leitor de ZIP por Range (com ZIP64)
// Lê o fim do arquivo (EOCD / ZIP64 EOCD), depois o diretório central inteiro, e devolve as entradas -log.jez.
async function diretorioCentral(uf) {
  const cache = path.join(DIR_CD, `${uf}.json`);
  if (fs.existsSync(cache)) return lerJson(cache);
  const url = URL_ZIP(uf);
  const total = await tamanho(url);
  const cauda = await baixarRange(url, Math.max(0, total - 65536), total - 1);
  const base = Math.max(0, total - 65536);
  const iE = cauda.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  if (iE < 0) throw new Error('EOCD não encontrado em ' + uf);
  let nEnt = cauda.readUInt16LE(iE + 10), cdTam = cauda.readUInt32LE(iE + 12), cdOff = cauda.readUInt32LE(iE + 16);
  const iL = cauda.lastIndexOf(Buffer.from([0x50, 0x4b, 6, 7]), iE); // localizador ZIP64
  if (iL >= 0 && (cdOff === 0xffffffff || cdTam === 0xffffffff || nEnt === 0xffff)) {
    const off64 = Number(cauda.readBigUInt64LE(iL + 8));
    const rec = off64 >= base ? cauda.subarray(off64 - base) : await baixarRange(url, off64, off64 + 55);
    if (rec.readUInt32LE(0) !== 0x06064b50) throw new Error('ZIP64 EOCD inválido em ' + uf);
    nEnt = Number(rec.readBigUInt64LE(32)); cdTam = Number(rec.readBigUInt64LE(40)); cdOff = Number(rec.readBigUInt64LE(48));
  }
  const cd = await baixarRange(url, cdOff, cdOff + cdTam - 1);
  const ent = {};
  let p = 0, n = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const metodo = cd.readUInt16LE(p + 10);
    let cs = cd.readUInt32LE(p + 20), us = cd.readUInt32LE(p + 24);
    const fl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42);
    const nome = cd.toString('latin1', p + 46, p + 46 + fl);
    if (cs === 0xffffffff || us === 0xffffffff || off === 0xffffffff) { // campo extra ZIP64 (0x0001)
      let q = p + 46 + fl; const fimX = q + el;
      while (q + 4 <= fimX) {
        const id = cd.readUInt16LE(q), tam = cd.readUInt16LE(q + 2); let r = q + 4;
        if (id === 1) {
          if (us === 0xffffffff) { us = Number(cd.readBigUInt64LE(r)); r += 8; }
          if (cs === 0xffffffff) { cs = Number(cd.readBigUInt64LE(r)); r += 8; }
          if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(r)); r += 8; }
        }
        q += 4 + tam;
      }
    }
    n++;
    if (nome.endsWith('-log.jez')) ent[nome] = [off, cs, metodo, fl];
    p += 46 + fl + el + cl;
  }
  if (n !== nEnt) console.warn(`  ${uf}: diretório central com ${n} entradas, EOCD diz ${nEnt}`);
  const out = { uf, url, total, entradas: n, logs: ent };
  await fsp.mkdir(DIR_CD, { recursive: true });
  await fsp.writeFile(cache, JSON.stringify(out));
  return out;
}
// Baixa uma entrada (cabeçalho local + dados) e devolve os bytes descomprimidos.
async function baixarEntrada(url, [off, cs, metodo, fl]) {
  const b = await baixarRange(url, off, off + 30 + fl + 1024 + cs - 1);
  if (b.readUInt32LE(0) !== 0x04034b50) throw new Error('cabeçalho local inválido');
  const ini = 30 + b.readUInt16LE(26) + b.readUInt16LE(28);
  const dados = b.subarray(ini, ini + cs);
  if (dados.length < cs) throw new Error('entrada truncada');
  return metodo === 0 ? Buffer.from(dados) : metodo === 8 ? zlib.inflateRawSync(dados) : (() => { throw new Error('método ' + metodo); })();
}
// O .jez é um ZIP: devolve o conteúdo de cada arquivo interno (normalmente só logd.dat).
function abrirJez(buf) {
  const out = [];
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const flags = buf.readUInt16LE(p + 6), metodo = buf.readUInt16LE(p + 8);
    let cs = buf.readUInt32LE(p + 18);
    const fl = buf.readUInt16LE(p + 26), el = buf.readUInt16LE(p + 28);
    const nome = buf.toString('latin1', p + 30, p + 30 + fl);
    const ini = p + 30 + fl + el;
    if (flags & 8) { // tamanho só no descritor: procura pelo diretório central
      const iC = buf.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
      cs = (iC > 0 ? iC : buf.length) - ini - 16;
    }
    const d = buf.subarray(ini, ini + cs);
    let conteudo;
    if (metodo === 0) conteudo = d;
    else if (metodo === 8) conteudo = zlib.inflateRawSync(d);
    else throw new Error(`método ${metodo} dentro do .jez (${nome})`);
    out.push({ nome, conteudo });
    p = ini + cs + (flags & 8 ? 16 : 0);
  }
  return out;
}

// ---------------------------------------------------------------- 1. índice de seções (BU)
async function* linhas(arquivo) {
  const rl = readline.createInterface({ input: fs.createReadStream(arquivo, { encoding: 'latin1', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  for await (const l of rl) if (l) yield l;
}
const tminLocal = v => { const m = /^2026-10-(\d\d) (\d\d):(\d\d):(\d\d)/.exec(v || ''); return m ? (+m[1] - 25) * 1440 + +m[2] * 60 + +m[3] + +m[4] / 60 : null; };
async function indice() {
  const dirs = (await fsp.readdir(DIR_BWEB)).filter(d => d.startsWith('bweb_2t_'));
  const secoes = new Map();
  const ibgeDe = new Map((await lerJson(path.join(RAIZ, 'site/dados/municipios.json'))).map(m => [m[1] + '|' + m[3], m[0]]));
  for (const d of dirs.sort()) {
    const csv = (await fsp.readdir(path.join(DIR_BWEB, d))).find(f => f.endsWith('.csv'));
    let idx = null;
    for await (const l of linhas(path.join(DIR_BWEB, d, csv))) {
      const f = l.split(';').map(x => x.charCodeAt(0) === 34 ? x.slice(1, -1) : x);
      if (!idx) { idx = Object.fromEntries(f.map((x, i) => [x, i])); continue; }
      if (f[idx.CD_CARGO_PERGUNTA] !== '1' || f[idx.SG_UF] === 'ZZ') continue;
      const uf = f[idx.SG_UF], mun = +f[idx.CD_MUNICIPIO], zona = +f[idx.NR_ZONA], sec = +f[idx.NR_SECAO];
      const k = chaveSec(uf, mun, zona, sec);
      let s = secoes.get(k);
      if (!s) {
        s = { uf, mun, ibge: ibgeDe.get(uf + '|' + mun) ?? null, nome: f[idx.NM_MUNICIPIO], zona, sec, local: +f[idx.NR_LOCAL_VOTACAO],
          aptos: +f[idx.QT_APTOS], comp: +f[idx.QT_COMPARECIMENTO], biom: +f[idx.QT_ELEI_BIOM_SEM_HABILITACAO], abre: tminLocal(f[idx.DT_ABERTURA]), fecha: tminLocal(f[idx.DT_ENCERRAMENTO]),
          emis: tminLocal(f[idx.DT_EMISSAO_BU]), agreg: f[idx.DS_SECOES_AGREGADAS] === '#NULO#' ? '' : f[idx.DS_SECOES_AGREGADAS], a: 0, b: 0 };
        secoes.set(k, s);
      }
      const nv = f[idx.NR_VOTAVEL];
      if (nv === '13') s.a = +f[idx.QT_VOTOS]; else if (nv === '22') s.b = +f[idx.QT_VOTOS];
    }
    console.log(`  ${d}: ${secoes.size} seções acumuladas`);
  }
  // fuso por município: mediana da abertura local (votação 8h–17h de Brasília em todo o país)
  const porMun = new Map();
  for (const s of secoes.values()) { const k = s.uf + '|' + s.mun; if (!porMun.has(k)) porMun.set(k, []); if (s.abre != null) porMun.get(k).push(s.abre); }
  const fusoMun = new Map([...porMun].map(([k, l]) => [k, l.length ? Math.round((8 * 60 - mediana(l)) / 60) : null]));
  const cols = ['uf', 'mun', 'ibge', 'nome', 'zona', 'sec', 'local', 'aptos', 'comp', 'biom', 'a', 'b', 'abre', 'fecha', 'emis', 'fuso', 'fechaB', 'agreg'];
  const linhasOut = [];
  for (const s of secoes.values()) {
    s.fuso = fusoMun.get(s.uf + '|' + s.mun) ?? FUSO_UF[s.uf] ?? 0;
    s.fechaB = s.fecha == null ? null : Math.round((s.fecha + s.fuso * 60) * 100) / 100;
    s.abre = s.abre == null ? null : Math.round(s.abre * 100) / 100; s.fecha = s.fecha == null ? null : Math.round(s.fecha * 100) / 100; s.emis = s.emis == null ? null : Math.round(s.emis * 100) / 100;
    linhasOut.push(cols.map(c => s[c]));
  }
  await fsp.mkdir(DIR, { recursive: true });
  await fsp.writeFile(ARQ_INDICE, JSON.stringify({ cols, linhas: linhasOut }));
  console.log(`índice: ${linhasOut.length} seções (Brasil) -> ${path.relative(RAIZ, ARQ_INDICE)}`);
}
async function lerIndice() {
  const { cols, linhas: L } = await lerJson(ARQ_INDICE);
  return L.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

// ---------------------------------------------------------------- 2. amostra
async function amostra() {
  const secs = await lerIndice();
  const rand = rng(SEED);
  const escolhidas = new Map();
  const marca = (s, motivo) => { const k = chaveSec(s.uf, s.mun, s.zona, s.sec); const e = escolhidas.get(k); if (e) { if (!e.motivos.includes(motivo)) e.motivos.push(motivo); } else escolhidas.set(k, { uf: s.uf, mun: s.mun, zona: s.zona, sec: s.sec, motivos: [motivo] }); };
  const contagem = {};
  for (const s of secs) { s.estrato = s.fechaB == null ? null : estratoDe(s.fechaB); }
  // a) UFs pequenas inteiras
  for (const s of secs) if (UFS_INTEIRAS.includes(s.uf)) marca(s, 'uf_inteira');
  // b) estratos nacionais (fora das UFs inteiras)
  const resto = secs.filter(s => !UFS_INTEIRAS.includes(s.uf) && s.estrato);
  for (const e of ESTRATOS) {
    const l = resto.filter(s => s.estrato === e.id);
    contagem[e.id] = l.length;
    if (e.id === 'e1700') {
      const porUf = {};
      for (const s of l) (porUf[s.uf] ||= []).push(s);
      for (const [uf, lu] of Object.entries(porUf)) for (const s of sortear(lu, CONTROLE_POR_UF, rand)) marca(s, 'controle');
    } else for (const s of sortear(l, Math.min(e.n, l.length), rand)) marca(s, e.id === 'e1900' ? 'fecha_19h' : 'estrato');
  }
  // as 19h das UFs inteiras também entram como fecha_19h
  for (const s of secs) if (UFS_INTEIRAS.includes(s.uf) && s.estrato === 'e1900') marca(s, 'fecha_19h');
  const lista = [...escolhidas.values()];
  await fsp.writeFile(ARQ_AMOSTRA, JSON.stringify({ seed: SEED, ufsInteiras: UFS_INTEIRAS, controlePorUf: CONTROLE_POR_UF, estratos: ESTRATOS.map(e => ({ ...e, n: e.n === Infinity ? 'todas' : e.n })), populacao: contagem, secoes: lista }));
  const m = {}; for (const s of lista) for (const x of s.motivos) m[x] = (m[x] || 0) + 1;
  console.log(`amostra: ${lista.length} seções`, m);
}

// ---------------------------------------------------------------- 3. download
async function baixar() {
  const { secoes } = await lerJson(ARQ_AMOSTRA);
  const ufs = [...new Set(secoes.map(s => s.uf))].sort();
  const cds = {};
  for (const uf of ufs) { const t0 = Date.now(); cds[uf] = await diretorioCentral(uf); console.log(`  CD ${uf}: ${cds[uf].entradas} entradas, ${Object.keys(cds[uf].logs).length} logs (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  let feitos = 0, pulados = 0, faltam = 0, bytes = 0; const t0 = Date.now(); const erros = [];
  await emParalelo(secoes, CONC, async s => {
    const nome = nomeEntrada(s.uf, s.mun, s.zona, s.sec);
    const dest = path.join(DIR_JEZ, s.uf, nome);
    if (fs.existsSync(dest)) { pulados++; return; }
    const e = cds[s.uf].logs[nome];
    if (!e) { faltam++; erros.push(nome + ': sem log no ZIP'); return; }
    try {
      const buf = await baixarEntrada(cds[s.uf].url, e);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest + '.tmp', buf); await fsp.rename(dest + '.tmp', dest);
      bytes += buf.length; feitos++;
      if (feitos % 250 === 0) console.log(`  ${feitos + pulados}/${secoes.length} · ${(bytes / 1048576).toFixed(0)} MB · ${(bytes / 1048576 / ((Date.now() - t0) / 1000)).toFixed(1)} MB/s`);
    } catch (err) { erros.push(nome + ': ' + err.message); }
  });
  console.log(`download: ${feitos} novos, ${pulados} já existiam, ${faltam} sem log no ZIP, ${erros.length} erros, ${(bytes / 1048576).toFixed(0)} MB`);
  if (erros.length) { console.log(erros.slice(0, 20).join('\n')); await fsp.writeFile(path.join(DIR, 'erros-download.txt'), erros.join('\n')); }
}

// ---------------------------------------------------------------- 4. leitura de um log
const T = s => { const m = /^(\d\d):(\d\d):(\d\d)/.exec(s); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
function linhasDoDia(buf) {
  // Urna de contingência: o log.jez traz, além do logd.dat da urna nova, o log da urna substituída como outro
  // .jez aninhado ("Arquivo N-N.jez referente ao log da ME"). Abre tudo recursivamente, tira linhas repetidas
  // (a linha inteira inclui o hash) e ordena pelo horário.
  const out = [], vistas = new Set();
  let arq = 0;
  const ler = (b, prof) => {
    for (const { nome, conteudo } of abrirJez(b)) {
      if (/\.jez$/i.test(nome) && prof < 3) { try { ler(conteudo, prof + 1); } catch { /* .jez interno ilegível: ignora */ } continue; }
      if (!/\.dat$/i.test(nome)) continue;
      const txt = conteudo.toString('latin1'); arq++;
      let i = 0, k = 0;
      while (i < txt.length) {
        let j = txt.indexOf('\n', i); if (j < 0) j = txt.length;
        if (txt.startsWith(DIA, i)) {
          const linha = txt.slice(i, j).replace(/\r$/, '');
          if (!vistas.has(linha)) {
            vistas.add(linha);
            const f = linha.split('\t');
            out.push({ t: T(f[0].slice(11)), nivel: f[1], urna: f[2], app: f[3], msg: f[4] || '', o: arq * 1e7 + k++ });
          }
        }
        i = j + 1;
      }
    }
  };
  ler(buf, 0);
  return out.sort((a, b) => a.t - b.t || a.o - b.o);
}
// Mensagens do ciclo normal de cada eleitor (não interessam como "evento")
const ROTINA = [
  /^Tecla indevida/, /^Solicita digital/, /^Capturada a digital/, /^Aguardando digitação do identificador/, /^Identificador do eleitor digitado/,
  /^Voto confirmado para/, /^O voto do eleitor foi computado/, /^Eleitor foi habilitado/, /^Foto do eleitor/, /^Tipo de habilitação do eleitor/,
  /^Identificador digitado pelo mesário foi/, /^Número de tentativas de reconhecimento/, /^Quantidade de memória/, /^Espaço (livre|utilizado) na/,
  /^Urna ligada conectada na rede/, /^Tecla pressionada/, /^Eleitor corrigiu/, /^Solicitação de dado pessoal/, /^Solicita digital do mesário/,
  /^Dado digitado confere/, /^Mesário \d+ habilitou/, /^Biometria do mesário \d+ encontrada/, /^Ano de nascimento digitado/, /^Timeout de reconhecimento/,
  /^Batimento de digitais/, /^Identificador do eleitor digitado inválido/, /^Eleitor sem atividade/, /^Eleitor voltou a digitar/, /^Pedido de leitura da biometria do mesário/,
  /^Biometria coletada não é do mesário/, /^Mesário \d+ (não )?é eleitor/, /^Realizada a conferência da biometria/, /^Não encontrou digital coletada/, /^Justificativa recebida/,
  /^Dado digitado não confere/, /^Eleitor (cancelou|não)/, /^Voto (em branco|nulo|anulado)/, /^Digital capturada/, /^Mesário cancelou entrada/, /^Mesário indagado se eleitor está votando/,
  /^Verificação de assinatura/, /^Gerando (relatório|arquivo)/, /^Imprimindo/, /^Início de impressão/, /^Fim de impressão/,
];
const rotina = m => ROTINA.some(r => r.test(m));
// Mensagens ligadas a interrupção/contingência que valem destaque mesmo dentro do período de votação
const ALERTA = /suspen|contingência|substitu|desligad|ligada em|reinici|erro|falha|bateria|energia|travad|mídia|MV |pendente|retomad|interromp|cancel|Votação|horário|Encerra/i;
// números de título de eleitor/CPF de mesários (≥ 9 dígitos) nunca saem do script
const mascarar = m => m.replace(/\d{9,}/g, '***');
const norm = m => m.replace(/\d+/g, 'N');

function analisarLog(buf, s) {
  const L = linhasDoDia(buf);
  const off = s.fuso * 3600; // segundos a somar para chegar em Brasília
  const votos = [], tentativasEnc = [], cancelEnc = [], antesDaHora = [], contingencia = [];
  // habilitação de cada eleitor: 'bio' (digital reconhecida), 'manual' (tem biometria, digital não reconhecida: dado pessoal + digital do mesário;
  // é o que o BU conta em QT_ELEI_BIOM_SEM_HABILITACAO), 'semCad' (sem biometria no cadastro: ano de nascimento), 'outro'
  let flags = { bio: false, manual: false, ano: false }, habAtual = null;
  const votosHab = { bio: [], manual: [], semCad: [], outro: [] };
  const habs = { bio: 0, manual: 0, semCad: 0, outro: 0 };
  let pronta = null, encerrar = null, encConf = null, inicioEnc = null, todosVotaram = null;
  const urnas = new Set();
  for (const x of L) {
    urnas.add(x.urna);
    const tb = x.t + off;
    if (x.msg.startsWith('Identificador do eleitor digitado pelo mesário')) flags = { bio: false, manual: false, ano: false };
    else if (x.msg === 'Tipo de habilitação do eleitor [biométrica]') flags.bio = true;
    else if (x.msg.startsWith('Solicitação de dado pessoal do eleitor para habilitação manual')) flags.manual = true;
    else if (x.msg.startsWith('Ano de nascimento digitado é igual')) flags.ano = true;
    if (x.msg === 'Eleitor foi habilitado') { habAtual = flags.bio ? 'bio' : flags.manual ? 'manual' : flags.ano ? 'semCad' : 'outro'; habs[habAtual]++; flags = { bio: false, manual: false, ano: false }; }
    if (x.msg === 'O voto do eleitor foi computado') { votos.push(tb); votosHab[habAtual ?? 'outro'].push(tb); habAtual = null; }
    else if (x.msg === 'Urna pronta para receber votos' && pronta == null) pronta = tb;
    else if (x.msg.startsWith('Operador selecionou: Encerrar votação')) { encerrar = tb; if (tb >= 16 * 3600 + 50 * 60) tentativasEnc.push(tb); } // antes das 16h50 é tecla errada (a urna recusa antes das 17h)
    else if (x.msg.startsWith('Operador cancelou o encerramento') || x.msg.startsWith('Procedimento de encerramento abortado')) cancelEnc.push(tb);
    else if (x.msg.startsWith('Encerramento só pode ser solicitado')) antesDaHora.push(tb);
    else if (x.msg.startsWith('Início do procedimento de contingência') || x.msg.startsWith('Modo de carga da UE - Urna de contingência')) contingencia.push(tb);
    else if (x.msg === 'Procedimento de encerramento confirmado') encConf = tb;
    else if (x.msg === 'Inicio do Encerramento' || x.msg === 'Início do Encerramento') inicioEnc = inicioEnc ?? tb;
    else if (x.msg.startsWith('Todas as pessoas presentes já votaram?')) todosVotaram = x.msg.split('?')[1].trim();
  }
  votos.sort((a, b) => a - b);
  const n = votos.length;
  const H17 = 17 * 3600, H18 = 18 * 3600, H19 = 19 * 3600;
  const apos = h => n - lowerBound(votos, h);
  // maior intervalo sem votos entre o 1º voto do dia e o encerramento, e o maior depois das 16h30
  const fim = encerrar ?? inicioEnc ?? (n ? votos[n - 1] : null);
  let pausaMax = 0, pausaIni = null, pausaTarde = 0, pausaTardeIni = null;
  const pontos = n ? [...votos, ...(fim != null && fim > votos[n - 1] ? [fim] : [])] : [];
  for (let i = 1; i < pontos.length; i++) {
    const d = pontos[i] - pontos[i - 1];
    if (d > pausaMax) { pausaMax = d; pausaIni = pontos[i - 1]; }
    if (pontos[i] > 16.5 * 3600 && d > pausaTarde) { pausaTarde = d; pausaTardeIni = pontos[i - 1]; }
  }
  // eventos fora da rotina: no dia todo (tipos) e depois das 16h30 de Brasília (lista com hora)
  const tipos = {}, tarde = [];
  for (const x of L) {
    if (rotina(x.msg)) continue;
    const tb = x.t + off;
    const k = norm(x.msg);
    if (pronta != null && tb >= pronta && (fim == null || tb <= fim) && ALERTA.test(x.msg)) tipos[k] = (tipos[k] || 0) + 1;
    if (tb >= 16.5 * 3600 && (fim == null || tb <= fim + 60)) tarde.push([hhmmss(tb), x.app, mascarar(x.msg)]);
  }
  // curva: votos por bloco de 15 min de Brasília (07:00–20:00 = 52 blocos; antes/depois somam no 1º/último)
  const curva = new Array(52).fill(0);
  for (const v of votos) curva[Math.max(0, Math.min(51, Math.floor((v - 7 * 3600) / 900)))]++;
  const q = p => n ? votos[Math.min(n - 1, Math.ceil(p * n) - 1)] : null;
  // JSON ida e volta: copia as strings (fatias do texto do log prenderiam ~1 MB por seção na memória)
  return JSON.parse(JSON.stringify({
    hab: Object.fromEntries(Object.entries(votosHab).map(([k, l]) => [k, [l.length, l.filter(t => t < H17).length, l.filter(t => t >= H17).length, l.filter(t => t >= H19).length]])), habilitacoes: habs,
    primeiraTentativaEnc: tentativasEnc.length ? tentativasEnc[0] : null, tentativasEnc: tentativasEnc.length, cancelEnc: cancelEnc.length, primeiroCancelEnc: cancelEnc.length ? cancelEnc[0] : null,
    antesDaHora: antesDaHora.length, contingencia: contingencia.length ? contingencia[0] : null,
    n, comp: s.comp, pronta, encerrar, encConf, inicioEnc, todosVotaram, urnas: urnas.size,
    primeiro: n ? votos[0] : null, ultimo: n ? votos[n - 1] : null,
    apos17: apos(H17), apos1715: apos(H17 + 900), apos1730: apos(H17 + 1800), apos1710: apos(H17 + 600), apos18: apos(H18), apos19: apos(H19),
    entre1830e19: lowerBound(votos, H19) - lowerBound(votos, H18 + 1800),
    pausaMax, pausaIni, pausaTarde, pausaTardeIni, t50: q(0.5), t90: q(0.9), curva, tipos, tarde: tarde.slice(-60),
  }));
}
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }

// ---------------------------------------------------------------- 5. análise e saída
async function analisar() {
  const secs = await lerIndice();
  const porChave = new Map(secs.map(s => [chaveSec(s.uf, s.mun, s.zona, s.sec), s]));
  const am = await lerJson(ARQ_AMOSTRA);
  const res = [];
  let semArquivo = 0, falhas = 0;
  for (const a of am.secoes) {
    const s = porChave.get(chaveSec(a.uf, a.mun, a.zona, a.sec));
    const arq = path.join(DIR_JEZ, a.uf, nomeEntrada(a.uf, a.mun, a.zona, a.sec));
    if (!fs.existsSync(arq)) { semArquivo++; continue; }
    try { res.push({ s, motivos: a.motivos, r: analisarLog(await fsp.readFile(arq), s) }); }
    catch (e) { falhas++; console.warn('  falha', arq, e.message); }
  }
  console.log(`logs lidos: ${res.length} · sem arquivo: ${semArquivo} · falhas: ${falhas}`);
  await fsp.writeFile(ARQ_RES, res.map(x => JSON.stringify({ k: chaveSec(x.s.uf, x.s.mun, x.s.zona, x.s.sec), motivos: x.motivos, ...x.r })).join('\n'));
  return montarSaida(secs, am, res);
}

async function montarSaida(secs, am, res) {
  const estratoDaSec = s => s.fechaB == null ? null : estratoDe(s.fechaB);
  // populações por estrato de amostragem: UF inteira | (estrato nacional) | (UF × controle)
  const strato = s => UFS_INTEIRAS.includes(s.uf) ? 'UF:' + s.uf : estratoDaSec(s) === 'e1700' ? 'C:' + s.uf : estratoDaSec(s);
  const N = {}, nAm = {};
  for (const s of secs) { const k = strato(s); if (k) N[k] = (N[k] || 0) + 1; }
  const usados = res.filter(x => x.motivos.some(m => m !== 'controle' || true));
  for (const x of usados) { const k = strato(x.s); x.estrato = k; if (k) nAm[k] = (nAm[k] || 0) + 1; }
  // seções com estrato "antes17"/sem horário ficam fora da estimativa (são 0 ou quase, ver doc)
  const peso = x => (x.estrato && N[x.estrato] && nAm[x.estrato]) ? N[x.estrato] / nAm[x.estrato] : 0;

  const bate = res.filter(x => x.r.n === x.s.comp).length;
  const difs = res.filter(x => x.r.n !== x.s.comp).map(x => ({ sec: `${x.s.uf} ${x.s.nome} Z${x.s.zona} S${x.s.sec}`, log: x.r.n, bu: x.s.comp, agreg: x.s.agreg, urnas: x.r.urnas }));

  // estimativa nacional (Horvitz-Thompson por estrato)
  const est = { apos17: 0, apos18: 0, apos19: 0, comp: 0, votosLog: 0, manualApos17: 0, semCadApos17: 0, manualApos19: 0, manualDia: 0, semCadDia: 0, biomBU: 0 };
  const estPorUf = {};
  for (const x of res) {
    const w = peso(x); if (!w) continue;
    est.apos17 += w * x.r.apos17; est.apos18 += w * x.r.apos18; est.apos19 += w * x.r.apos19; est.comp += w * x.s.comp; est.votosLog += w * x.r.n;
    est.manualApos17 += w * x.r.hab.manual[2]; est.semCadApos17 += w * x.r.hab.semCad[2]; est.manualApos19 += w * x.r.hab.manual[3]; est.manualDia += w * x.r.hab.manual[0]; est.semCadDia += w * x.r.hab.semCad[0]; est.biomBU += w * x.s.biom;
    const u = (estPorUf[x.s.uf] ||= { apos17: 0, apos19: 0, comp: 0 }); u.apos17 += w * x.r.apos17; u.apos19 += w * x.r.apos19; u.comp += w * x.s.comp;
  }
  const compReal = secs.reduce((t, s) => t + s.comp, 0);
  // erro padrão da estimativa (amostra aleatória simples dentro de cada estrato, com correção de população finita)
  const varEst = campo => {
    const g = {}; for (const x of res) if (x.estrato && peso(x)) (g[x.estrato] ||= []).push(campo(x));
    let v = 0;
    for (const [k, l] of Object.entries(g)) { const n = l.length, Nh = N[k]; if (n < 2 || n >= Nh) continue; const m = l.reduce((a, b) => a + b, 0) / n; const s2 = l.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1); v += Nh * Nh * (1 - n / Nh) * s2 / n; }
    return Math.round(Math.sqrt(v));
  };
  const contribuicao = {}; for (const x of res) { const w = peso(x); if (!w) continue; const k = x.estrato.startsWith('C:') ? 'e1700 (controle por UF)' : x.estrato.startsWith('UF:') ? 'UFs inteiras (AC/AP/RR)' : x.estrato; contribuicao[k] = (contribuicao[k] || 0) + w * x.r.apos17; }

  // biometria: votos por tipo de habilitação, antes/depois das 17h e depois das 19h (hab[k] = [total, antes17, apos17, apos19])
  const bio = l => {
    const soma = k => [0, 1, 2, 3].map(i => l.reduce((t, x) => t + x.r.hab[k][i], 0));
    const tot = [0, 1, 2, 3].map(i => l.reduce((t, x) => t + ['bio', 'manual', 'semCad', 'outro'].reduce((u, k) => u + x.r.hab[k][i], 0), 0));
    const m = soma('manual'), c = soma('semCad'), o = soma('outro');
    const pc = (a, b) => b ? Math.round(10000 * a / b) / 100 : null;
    return {
      semBiometriaFalhaDigital: { dia: m[0], antes17: m[1], apos17: m[2], apos19: m[3] },
      semBiometriaNoCadastro: { dia: c[0], antes17: c[1], apos17: c[2], apos19: c[3] },
      naoClassificados: { dia: o[0], apos17: o[2] },
      votosTotais: { dia: tot[0], antes17: tot[1], apos17: tot[2], apos19: tot[3] },
      pctFalhaDigital: { dia: pc(m[0], tot[0]), antes17: pc(m[1], tot[1]), apos17: pc(m[2], tot[2]), apos19: pc(m[3], tot[3]) },
      pctSemBiometriaTotal: { dia: pc(m[0] + c[0], tot[0]), antes17: pc(m[1] + c[1], tot[1]), apos17: pc(m[2] + c[2], tot[2]), apos19: pc(m[3] + c[3], tot[3]) },
      biomBU: l.reduce((t, x) => t + x.s.biom, 0),
    };
  };
  const biomBate = res.filter(x => x.r.hab.manual[0] === x.s.biom).length;
  const biomDifs = res.filter(x => x.r.hab.manual[0] !== x.s.biom).map(x => ({ sec: `${x.s.uf} ${x.s.nome} Z${x.s.zona} S${x.s.sec}`, log: x.r.hab.manual[0], bu: x.s.biom, outro: x.r.hab.outro[0] }));
  // agregados por grupo (só o que foi lido; nada extrapolado)
  const grupo = l => ({ biometria: bio(l),
    secoes: l.length, votos: l.reduce((t, x) => t + x.r.n, 0),
    votosApos17: l.reduce((t, x) => t + x.r.apos17, 0), votosApos1730: l.reduce((t, x) => t + x.r.apos1730, 0), votosApos18: l.reduce((t, x) => t + x.r.apos18, 0), votosApos19: l.reduce((t, x) => t + x.r.apos19, 0),
    secoesComVotoApos17: l.filter(x => x.r.apos17 > 0).length, secoesComVotoApos18: l.filter(x => x.r.apos18 > 0).length, secoesComVotoApos19: l.filter(x => x.r.apos19 > 0).length,
    ultimoVotoMediano: hhmmss(mediana(l.filter(x => x.r.ultimo != null).map(x => x.r.ultimo))),
  });
  const de19 = res.filter(x => x.s.fechaB != null && x.s.fechaB >= 19 * 60);
  const controle = res.filter(x => x.motivos.includes('controle'));
  const porUf = {};
  for (const uf of [...new Set(res.map(x => x.s.uf))].sort()) {
    const l = res.filter(x => x.s.uf === uf), l19 = de19.filter(x => x.s.uf === uf);
    porUf[uf] = { secoes: l.length, votos: l.reduce((t, x) => t + x.r.n, 0), votosApos17: l.reduce((t, x) => t + x.r.apos17, 0), votosApos18: l.reduce((t, x) => t + x.r.apos18, 0), votosApos19: l.reduce((t, x) => t + x.r.apos19, 0),
      secoes19h: l19.length, votosApos17nas19h: l19.reduce((t, x) => t + x.r.apos17, 0), votosApos19nas19h: l19.reduce((t, x) => t + x.r.apos19, 0),
      estimativaUf: estPorUf[uf] ? { votosApos17: Math.round(estPorUf[uf].apos17), votosApos19: Math.round(estPorUf[uf].apos19) } : null,
      biometria: bio(l), biometria19h: l19.length ? bio(l19) : null,
      inteira: UFS_INTEIRAS.includes(uf) };
  }
  const porMunicipio = {};
  for (const x of res) {
    const m = (porMunicipio[x.s.ibge] ||= [x.s.uf, x.s.nome, 0, 0, 0, 0, 0]);
    m[2]++; m[3] += x.r.apos17; m[4] += x.r.apos18; m[5] += x.r.apos19; m[6] += x.s.fechaB >= 19 * 60 ? 1 : 0;
  }
  const porZona = {};
  for (const x of de19) {
    const k = `${x.s.uf}|${x.s.zona}|${x.s.nome}`;
    const z = (porZona[k] ||= { uf: x.s.uf, zona: x.s.zona, municipio: x.s.nome, secoes: 0, votosApos17: 0, votosApos18: 0, votosApos19: 0, comVotoApos18: 0, ultimos: [], pausas: [] });
    z.secoes++; z.votosApos17 += x.r.apos17; z.votosApos18 += x.r.apos18; z.votosApos19 += x.r.apos19; if (x.r.apos18 > 0) z.comVotoApos18++;
    if (x.r.ultimo != null) z.ultimos.push(x.r.ultimo); z.pausas.push(x.r.pausaTarde);
  }
  const zonas = Object.values(porZona).map(z => ({ ...z, ultimoVotoMediano: hhmm(mediana(z.ultimos) / 60), pausaTardeMedianaMin: Math.round(mediana(z.pausas) / 60), ultimos: undefined, pausas: undefined })).sort((a, b) => b.secoes - a.secoes);

  // padrões das seções das 19h
  const classe = x => {
    const r = x.r;
    if (r.apos17 === 0) return 'a_nenhum_voto_depois_das_17h';
    if (r.apos1710 === 0) return 'b_so_fila_ate_17h10';
    if (r.apos1710 <= 3) return 'c_1a3_votos_depois_das_17h10';
    if (r.apos1710 <= 10) return 'd_4a10_votos_depois_das_17h10';
    return 'e_mais_de_10_votos_depois_das_17h10';
  };
  const blocoHora = s => s == null ? 'nenhuma' : hhmm(Math.floor(s / 600) * 10);
  const histTentativa = {}, histCancel = {};
  for (const x of de19) { const b = blocoHora(x.r.primeiraTentativaEnc); histTentativa[b] = (histTentativa[b] || 0) + 1; if (x.r.primeiroCancelEnc != null) { const c = blocoHora(x.r.primeiroCancelEnc); histCancel[c] = (histCancel[c] || 0) + 1; } }
  const ctlTentativa = {}; for (const x of controle) { const b = blocoHora(x.r.primeiraTentativaEnc); ctlTentativa[b] = (ctlTentativa[b] || 0) + 1; }
  const classes = {}; for (const x of de19) { const c = classe(x); classes[c] = (classes[c] || 0) + 1; }
  const tiposEventos = {};
  for (const x of de19) for (const k of Object.keys(x.r.tipos)) tiposEventos[k] = (tiposEventos[k] || 0) + 1;
  const tiposEventosCtrl = {};
  for (const x of controle) for (const k of Object.keys(x.r.tipos)) tiposEventosCtrl[k] = (tiposEventosCtrl[k] || 0) + 1;
  const histUltimo = {}; for (const x of de19) { if (x.r.ultimo == null) continue; const b = hhmm(Math.floor(x.r.ultimo / 900) * 15); histUltimo[b] = (histUltimo[b] || 0) + 1; }
  const histPausa = {}; for (const x of de19) { const m = x.r.pausaTarde / 60; const b = m < 10 ? '<10' : m < 30 ? '10-30' : m < 60 ? '30-60' : m < 90 ? '60-90' : m < 120 ? '90-120' : '>=120'; histPausa[b] = (histPausa[b] || 0) + 1; }

  // curva do dia
  const blocos = Array.from({ length: 52 }, (_, i) => 7 * 60 + 15 * i);
  const soma = l => { const c = new Array(52).fill(0); for (const x of l) x.r.curva.forEach((v, i) => c[i] += v); return c; };
  const curvaPorUf = {};
  for (const uf of Object.keys(porUf)) {
    const l = res.filter(x => x.s.uf === uf && !x.motivos.includes('fecha_19h') && x.s.fechaB < 19 * 60);
    curvaPorUf[uf] = { amostraSecoes: l.length, votos: soma(l) };
  }
  // nacional estimada: perfil ponderado por estrato (pesos acima), recalibrado para o comparecimento total
  const nac = new Array(52).fill(0);
  for (const x of res) { const w = peso(x); if (w) x.r.curva.forEach((v, i) => nac[i] += w * v); }
  const fator = compReal / nac.reduce((t, v) => t + v, 0);
  // também por UF: perfil da amostra da UF (ponderado) escalado ao comparecimento da UF
  const compUf = {}; for (const s of secs) compUf[s.uf] = (compUf[s.uf] || 0) + s.comp;
  const nacUf = {};
  for (const x of res) { const w = peso(x); if (!w) continue; const c = (nacUf[x.s.uf] ||= new Array(52).fill(0)); x.r.curva.forEach((v, i) => c[i] += w * v); }
  for (const [uf, c] of Object.entries(nacUf)) { const t = c.reduce((a, b) => a + b, 0); curvaPorUf[uf].estimadaUf = c.map(v => Math.round(v * compUf[uf] / t)); }

  const t50 = l => hhmm(mediana(l.filter(x => x.r.t50 != null).map(x => x.r.t50)) / 60), t90 = l => hhmm(mediana(l.filter(x => x.r.t90 != null).map(x => x.r.t90)) / 60);

  const linhaSec = x => [x.s.uf, x.s.ibge, x.s.nome, x.s.zona, x.s.sec, hhmm(x.s.fechaB), hhmmss(x.r.ultimo), x.r.apos17, x.r.apos19, Math.round(x.r.pausaTarde / 60),
    Object.entries(x.r.tipos).map(([k, v]) => v > 1 ? `${k} (${v}x)` : k).join(' · '),
    x.r.apos18, x.s.comp, x.r.n, hhmmss(x.r.encerrar), hhmmss(x.r.pausaTardeIni), hhmmss(x.r.t50), hhmmss(x.r.t90), x.motivos.join('+'),
    x.r.hab.manual[0], x.r.hab.manual[1], x.r.hab.manual[2], x.r.hab.manual[3], x.r.hab.semCad[0], x.r.hab.semCad[2], x.s.biom,
    hhmmss(x.r.primeiraTentativaEnc), x.r.cancelEnc, x.r.contingencia != null ? 1 : 0, x.r.apos1710];

  const exemplos = de19.filter(x => [122, 238, 234, 5, 65].includes(x.s.zona) && ['RJ', 'BA'].includes(x.s.uf)).slice(0, 8).map(x => ({ secao: `${x.s.uf} ${x.s.nome} Z${x.s.zona} S${x.s.sec}`, fechouBU: hhmm(x.s.fechaB), ultimoVoto: hhmmss(x.r.ultimo), apos17: x.r.apos17, apos19: x.r.apos19, pausaTardeMin: Math.round(x.r.pausaTarde / 60), trecho: x.r.tarde.slice(-14) }));

  const out = {
    meta: {
      titulo: 'Votos computados depois das 17h (Brasília) pelos logs das urnas, 2º turno de 2026',
      data: new Date().toISOString(),
      fontes: [
        'https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao',
        'https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/arqurnatot/bu_imgbu_logjez_rdv_vscmr_2026_2t_UF.zip (só as entradas -log.jez, por HTTP Range)',
        'https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna (bweb, para a lista de seções, horários do BU e fuso)',
      ],
      observacao: 'O log da urna registra a hora de cada "O voto do eleitor foi computado", mas não em quem a pessoa votou. Hora convertida para Brasília pelo fuso do município (inferido pela abertura do BU).',
      amostra: { seed: am.seed, ufsInteiras: am.ufsInteiras, controlePorUf: am.controlePorUf, estratos: am.estratos, populacaoPorEstrato: am.populacao, logsLidos: res.length, secoesDas19hLidas: de19.length, controleLido: controle.length },
      conferencia: { votosNoLogIgualAoComparecimentoDoBU: bate, diferentes: difs.length, exemplosDiferentes: difs.slice(0, 15),
        biometria: { falhaDigitalNoLogIgualAoBU: biomBate, diferentes: biomDifs.length, exemplosDiferentes: biomDifs.slice(0, 15), regra: 'falha de digital no log = eleitor habilitado depois de "Solicitação de dado pessoal do eleitor para habilitação manual" sem "Tipo de habilitação do eleitor [biométrica]"; comparado a QT_ELEI_BIOM_SEM_HABILITACAO do BU' } },
      colunas: { secoes: ['uf', 'ibge', 'municipio', 'zona', 'secao', 'fechouBU_bsb', 'ultimoVoto_bsb', 'votosApos17', 'votosApos19', 'pausaMaxTarde_min', 'eventos', 'votosApos18', 'comparecimentoBU', 'votosNoLog', 'encerrarVotacao_bsb', 'inicioDaPausa_bsb', 'hora50pct_bsb', 'hora90pct_bsb', 'motivo', 'semBioFalhaDigital_dia', 'semBioFalhaDigital_antes17', 'semBioFalhaDigital_apos17', 'semBioFalhaDigital_apos19', 'semBioNoCadastro_dia', 'semBioNoCadastro_apos17', 'biomBU_QT_ELEI_BIOM_SEM_HABILITACAO', 'primeiraTentativaDeEncerrar_bsb', 'encerramentosCancelados', 'urnaDeContingencia', 'votosApos1710'], porMunicipio: ['uf', 'municipio', 'secoesLidas', 'votosApos17', 'votosApos18', 'votosApos19', 'secoesQueFecharamApos19h'], curva: 'votos por bloco de 15 min; blocos = minuto de Brasília do início do bloco; o 1º bloco inclui o que veio antes das 7h e o último o que veio depois das 20h' },
    },
    estimativaNacional: {
      votosApos17: Math.round(est.apos17), votosApos18: Math.round(est.apos18), votosApos19: Math.round(est.apos19),
      comparecimentoEstimadoPelaAmostra: Math.round(est.comp), comparecimentoReal: compReal,
      pctApos17: Math.round(1e5 * est.apos17 / compReal) / 1e3,
      erroPadraoApos17: varEst(x => x.r.apos17), erroPadraoApos18: varEst(x => x.r.apos18), erroPadraoSemBioFalhaDigitalApos17: varEst(x => x.r.hab.manual[2]),
      contribuicaoPorEstratoApos17: Object.fromEntries(Object.entries(contribuicao).map(([k, v]) => [k, Math.round(v)]).sort()),
      votosApos17AjustadoPeloComparecimento: Math.round(est.apos17 * compReal / est.comp), votosApos18Ajustado: Math.round(est.apos18 * compReal / est.comp),
      semBiometriaFalhaDigitalApos17: Math.round(est.manualApos17), semBiometriaNoCadastroApos17: Math.round(est.semCadApos17), semBiometriaFalhaDigitalApos19: Math.round(est.manualApos19),
      semBiometriaFalhaDigitalDia: Math.round(est.manualDia), semBiometriaFalhaDigitalDiaBU: secs.reduce((t, s) => t + s.biom, 0), semBiometriaNoCadastroDia: Math.round(est.semCadDia),
      metodo: 'Expansão por estrato (horário de encerramento do BU × UF para o controle; UFs AC/AP/RR inteiras; todas as seções de 18h–19h e de 19h em diante lidas).',
    },
    secoes19h: { ...grupo(de19), classes: Object.fromEntries(Object.entries(classes).sort()), votosApos1710: de19.reduce((t, x) => t + x.r.apos1710, 0),
      primeiraTentativaDeEncerrar: Object.fromEntries(Object.entries(histTentativa).sort()), cancelouEncerramento: { secoes: de19.filter(x => x.r.cancelEnc > 0).length, primeiroCancelamento: Object.fromEntries(Object.entries(histCancel).sort()) },
      contingencia: de19.filter(x => x.r.contingencia != null).length, pausaDe60minOuMaisDepoisDas1630: de19.filter(x => x.r.pausaTarde >= 3600).length, ultimoVotoPor15min: Object.fromEntries(Object.entries(histUltimo).sort()), pausaMaxDepoisDas1630_min: histPausa, eventosForaDaRotina: Object.fromEntries(Object.entries(tiposEventos).sort((a, b) => b[1] - a[1]).slice(0, 40)), hora50: t50(de19), hora90: t90(de19), zonas: zonas.slice(0, 60) },
    controle: { ...grupo(controle), primeiraTentativaDeEncerrar: Object.fromEntries(Object.entries(ctlTentativa).sort()), cancelouEncerramento: controle.filter(x => x.r.cancelEnc > 0).length, contingencia: controle.filter(x => x.r.contingencia != null).length, eventosForaDaRotina: Object.fromEntries(Object.entries(tiposEventosCtrl).sort((a, b) => b[1] - a[1]).slice(0, 40)), hora50: t50(controle), hora90: t90(controle) },
    porUf, porMunicipio, exemplos,
    secoes: [...de19, ...res.filter(x => !(x.s.fechaB >= 19 * 60))].map(linhaSec),
    curvaDia: {
      blocos, porUf: curvaPorUf,
      nacionalEstimada: nac.map(v => Math.round(v * fator)), fatorCalibracao: Math.round(fator * 1000) / 1000,
      controle: soma(controle), secoes19h: soma(de19),
      horaMediana50pct: { controle: t50(controle), secoes19h: t50(de19) }, horaMediana90pct: { controle: t90(controle), secoes19h: t90(de19) },
      observacao: 'Só comparecimento (o log não diz o voto). nacionalEstimada = soma ponderada dos perfis da amostra, escalada ao comparecimento total do BU.',
    },
  };
  await fsp.writeFile(SAIDA, JSON.stringify(out));
  console.log(`-> ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB)`);
  console.log(JSON.stringify({ estimativaNacional: out.estimativaNacional, secoes19h: { ...out.secoes19h, zonas: undefined, eventosForaDaRotina: undefined }, controle: { ...out.controle, eventosForaDaRotina: undefined }, conferencia: { bate, diferentes: difs.length, biomBate, biomDif: biomDifs.length } }, null, 1));
  return out;
}

// ---------------------------------------------------------------- ver um log
async function ver(uf, mun, zona, sec, desde) {
  const nome = nomeEntrada(uf, +mun, +zona, +sec);
  let arq = path.join(DIR_JEZ, uf, nome), buf;
  if (fs.existsSync(arq)) buf = await fsp.readFile(arq);
  else { const cd = await diretorioCentral(uf); if (!cd.logs[nome]) throw new Error('sem ' + nome); buf = await baixarEntrada(cd.url, cd.logs[nome]); await fsp.mkdir(path.dirname(arq), { recursive: true }); await fsp.writeFile(arq, buf); }
  const d = desde ? T(desde + ':00') : 0;
  for (const x of linhasDoDia(buf)) if (x.t >= d) console.log(`${hhmmss(x.t)}\t${x.app}\t${mascarar(x.msg)}`);
}

const [cmd, ...args] = process.argv.slice(2);
const acoes = { indice, amostra, baixar, analisar, ver: () => ver(...args), tudo: async () => { if (!fs.existsSync(ARQ_INDICE)) await indice(); await amostra(); await baixar(); await analisar(); } };
if (!acoes[cmd]) { console.log('uso: node scripts/logs-urna.mjs indice|amostra|baixar|analisar|tudo|ver UF MUNTSE ZONA SECAO [hh:mm]'); process.exit(1); }
await acoes[cmd]();
