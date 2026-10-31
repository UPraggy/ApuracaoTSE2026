import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const inputDir = process.argv[2] || 'work/analysis_csv';
const output = process.argv[3] || 'outputs/analise_dados.json';

function parseLine(line) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ';' && !quoted) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
const n = v => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
const hm = v => { const m = String(v ?? '').match(/(\d\d):(\d\d):(\d\d)/); return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60 : null; };

async function walk(dir) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(full));
    else if (ent.name.toLowerCase().endsWith('.csv')) out.push(full);
  }
  return out;
}
const files = (await walk(inputDir)).sort();
const sections = new Map();
const uf = new Map();
const claims = { semBiometriaImagem: 8632488, secoesImagem: 499205, comparecimentoImagem: 128236074, apos17Imagem: 348398, apos19Imagem: 6333 };
let rows = 0;

for (const file of files) {
  const stream = (await import('node:fs')).createReadStream(file, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let idx = null;
  for await (const line of rl) {
    if (!idx) { const h = parseLine(line); idx = Object.fromEntries(h.map((x, i) => [x, i])); continue; }
    if (!line) continue;
    const f = parseLine(line); rows++;
    const get = k => f[idx[k]] ?? '';
    const cargo = get('DS_CARGO_PERGUNTA');
    if (!cargo) continue;
    const key = [get('SG_UF'), get('CD_MUNICIPIO'), get('NR_ZONA'), get('NR_SECAO'), get('NR_LOCAL_VOTACAO'), cargo, get('NR_URNA_EFETIVADA')].join('|');
    let s = sections.get(key);
    if (!s) {
      s = {
        uf: get('SG_UF'), municipio: get('NM_MUNICIPIO'), municipioCodigo: get('CD_MUNICIPIO'), zona: get('NR_ZONA'), secao: get('NR_SECAO'), local: get('NR_LOCAL_VOTACAO'), cargo,
        turn: n(get('NR_TURNO')), election: get('DS_ELEICAO'), aptos: n(get('QT_APTOS')), comparecimento: n(get('QT_COMPARECIMENTO')), abstencoes: n(get('QT_ABSTENCOES')),
        abertura: get('DT_ABERTURA'), encerramento: get('DT_ENCERRAMENTO'), biomSem: n(get('QT_ELEI_BIOM_SEM_HABILITACAO')),
        agregadas: get('DS_SECOES_AGREGADAS'), urna: get('DS_TIPO_URNA'), votos: 0, voteRows: 0, cargosRows: 0
      };
      sections.set(key, s);
      if (!uf.has(s.uf)) uf.set(s.uf, { uf: s.uf, secoes: 0, aptos: 0, comparecimento: 0, abstencoes: 0, biomSem: 0, apos17: 0, apos19: 0, votos: {}, alertas: 0 });
    }
    const votes = n(get('QT_VOTOS'));
    if (votes !== null) { s.votos += votes; s.voteRows++; }
    s.cargosRows++;
  }
}

const president = [...sections.values()].filter(s => s.cargo.toLowerCase() === 'presidente');
const locals=new Map();
for(const s of president){const key=[s.uf,s.municipioCodigo,s.zona,s.local].join('|');let l=locals.get(key);if(!l){l={key,uf:s.uf,municipio:s.municipio,municipioCodigo:s.municipioCodigo,zona:s.zona,local:s.local,secoes:0,aptos:0,comparecimento:0,biomSem:0};locals.set(key,l);}l.secoes++;l.aptos+=s.aptos||0;l.comparecimento+=s.comparecimento||0;l.biomSem+=s.biomSem||0;}
await fs.writeFile('work/locais_bu.json',JSON.stringify([...locals.values()]));
const all = [...sections.values()];
function alertas(s) {
  const a = [];
  if (s.aptos !== null && s.comparecimento !== null && s.comparecimento > s.aptos) a.push('comparecimento_maior_que_aptos');
  if (s.aptos !== null && s.comparecimento !== null && s.abstencoes !== null && s.comparecimento + s.abstencoes !== s.aptos) a.push('aptos_nao_fecham');
  if (s.biomSem !== null && s.comparecimento !== null && s.biomSem > s.comparecimento) a.push('biometria_maior_que_comparecimento');
  if (s.biomSem !== null && s.biomSem < 0) a.push('biometria_negativa');
  const op = hm(s.abertura), cl = hm(s.encerramento);
  if (op !== null && cl !== null && cl < op) a.push('encerramento_antes_da_abertura');
  if (cl === null) a.push('encerramento_ausente');
  if (s.votos > 0 && s.comparecimento !== null && s.votos > s.comparecimento) a.push('votos_maior_que_comparecimento');
  return a;
}
for (const s of all) s.alertas = alertas(s);

const states = new Map();
for (const s of president) {
  const x = states.get(s.uf) || { uf: s.uf, secoes: 0, aptos: 0, comparecimento: 0, abstencoes: 0, biomSem: 0, apos17: 0, apos19: 0, candidatos: {}, alertas: 0 };
  x.secoes++; x.aptos += s.aptos || 0; x.comparecimento += s.comparecimento || 0; x.abstencoes += s.abstencoes || 0; x.biomSem += s.biomSem || 0;
  const cl = hm(s.encerramento); if (cl !== null && cl > 17 * 60) x.apos17++; if (cl !== null && cl > 19 * 60) x.apos19++;
  x.alertas += s.alertas.length;
  states.set(s.uf, x);
}

// Second pass over extracted CSVs for presidential candidate totals by UF.
for (const file of files) {
  const stream = (await import('node:fs')).createReadStream(file, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let idx = null;
  for await (const line of rl) {
    if (!idx) { idx = Object.fromEntries(parseLine(line).map((x, i) => [x, i])); continue; }
    const f = parseLine(line), get = k => f[idx[k]] ?? '';
    if (get('DS_CARGO_PERGUNTA') !== 'Presidente' || get('DS_TIPO_VOTAVEL') !== 'Nominal') continue;
    const st = states.get(get('SG_UF')); if (!st) continue;
    const name = get('NM_VOTAVEL') || get('NR_VOTAVEL'); st.candidatos[name] = (st.candidatos[name] || 0) + (n(get('QT_VOTOS')) || 0);
  }
}

const totals = president.reduce((a, s) => { a.secoes++; a.aptos += s.aptos || 0; a.comparecimento += s.comparecimento || 0; a.abstencoes += s.abstencoes || 0; a.biomSem += s.biomSem || 0; const cl = hm(s.encerramento); if (cl !== null && cl > 17 * 60) a.apos17++; if (cl !== null && cl > 19 * 60) a.apos19++; a.alertas += s.alertas.length; return a; }, { secoes: 0, aptos: 0, comparecimento: 0, abstencoes: 0, biomSem: 0, apos17: 0, apos19: 0, alertas: 0 });
const candidatosNacional = {};
for (const s of states.values()) for (const [k, v] of Object.entries(s.candidatos)) candidatosNacional[k] = (candidatosNacional[k] || 0) + v;
const principais = Object.entries(candidatosNacional).sort((a, b) => b[1] - a[1]);
const margemObservada = principais.length > 1 ? principais[0][1] - principais[1][1] : null;
const claimChecks = {
  semBiometria: { observado: totals.biomSem, alegado: claims.semBiometriaImagem, diferenca: totals.biomSem - claims.semBiometriaImagem },
  secoes: { observado: totals.secoes, alegado: claims.secoesImagem, diferenca: totals.secoes - claims.secoesImagem },
  comparecimento: { observado: totals.comparecimento, alegado: claims.comparecimentoImagem, diferenca: totals.comparecimento - claims.comparecimentoImagem },
  margem: { observado: margemObservada, alegado: 4430191, diferenca: margemObservada === null ? null : margemObservada - 4430191 },
  apos17: { observado: totals.apos17, alegado: claims.apos17Imagem, diferenca: totals.apos17 - claims.apos17Imagem },
  apos19: { observado: totals.apos19, alegado: claims.apos19Imagem, diferenca: totals.apos19 - claims.apos19Imagem }
};

const data = { meta: { arquivos: files.length, linhas: rows, escopo: 'Segundo turno de 2026; CSV por UF; ZZ = exterior', fonte: 'https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna' }, totals, claimChecks, candidatosNacional, estados: [...states.values()].sort((a, b) => a.uf.localeCompare(b.uf)), cargos: [...new Set(all.map(x => x.cargo).filter(x => ['Presidente', 'Governador'].includes(x)))].sort(), alertas: all.filter(s => ['Presidente', 'Governador'].includes(s.cargo)).flatMap(s => s.alertas.map(tipo => ({ tipo, uf: s.uf, municipio: s.municipio, zona: s.zona, secao: s.secao, cargo: s.cargo }))).slice(0, 2000), alertasTotal: all.filter(s => ['Presidente', 'Governador'].includes(s.cargo)).reduce((a, s) => a + s.alertas.length, 0) };
await fs.writeFile(output, JSON.stringify(data, null, 2));
console.log(JSON.stringify({ files: files.length, rows, presidentSections: totals.secoes, cargos: data.cargos, alerts: data.alertasTotal, totals }, null, 2));
