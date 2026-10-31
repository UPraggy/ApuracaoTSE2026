// "E se os boletins chegassem em ordem aleatória?" Sorteia a ordem de chegada muitas vezes e mede a faixa em que a
// % do 13 costuma ficar a cada % apurado, e com que frequência há virada (o líder muda depois de 5% apurado).
// Duas versões: urna por urna (2026, a partir de site/dados/secoes) e município inteiro (2022 e 2026).
// Uso: node scripts/simular-apuracao.mjs   → site/dados/simulacao.json
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ler = async f => JSON.parse(await fs.readFile(RAIZ + 'site/dados/' + f, 'utf8'));
const GRADE = Array.from({ length: 100 }, (_, i) => i + 1);

// Gerador pseudoaleatório com semente (resultado reproduzível).
function rng(semente) { let s = semente >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function simular(unidades, rodadas, semente) {
  const tot = unidades.reduce((s, u) => s + u[0], 0);
  const fimA = unidades.reduce((s, u) => s + u[1], 0), fimB = unidades.reduce((s, u) => s + u[2], 0);
  const lider = fimA > fimB, aleat = rng(semente), por = GRADE.map(() => new Float64Array(rodadas));
  let viradas = 0;
  const o = unidades.slice();
  for (let k = 0; k < rodadas; k++) {
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(aleat() * (i + 1)); const t = o[i]; o[i] = o[j]; o[j] = t; }
    let s = 0, a = 0, b = 0, g = 0, virou = false;
    for (const u of o) {
      s += u[0]; a += u[1]; b += u[2];
      const p = 100 * s / tot;
      if (p >= 5 && (a > b) !== lider) virou = true;
      while (g < GRADE.length && p >= GRADE[g]) { por[g][k] = 100 * a / (a + b); g++; }
    }
    if (virou) viradas++;
  }
  const q = (arr, f) => { const v = Array.from(arr).sort((x, y) => x - y); return +v[Math.min(v.length - 1, Math.floor(f * v.length))].toFixed(3); };
  return { rodadas, viradasApos5pct: viradas, finalA: +(100 * fimA / (fimA + fimB)).toFixed(3), grade: GRADE, p025: por.map(a => q(a, 0.025)), p975: por.map(a => q(a, 0.975)) };
}

const R = await ler('resumo.json'), mun = await ler('municipios.json'), hist = await ler('historico-municipios.json');
const secoes = [];
for (const uf of Object.keys(R.porUf)) {
  if (uf === 'ZZ') continue;
  for (const s of await ler('secoes/' + uf + '.json')) secoes.push([1, s[7], s[8]]);
}
const saida = {
  gerado: new Date().toISOString(),
  metodo: 'Ordem de chegada sorteada (Fisher–Yates, semente fixa). Faixa = 2,5% a 97,5% das rodadas. Virada = o candidato à frente no fim fica atrás em algum momento depois de 5% apurado. Sem o exterior.',
  '2026': {
    urna: simular(secoes, 200, 2026),
    municipio: simular(mun.filter(m => m[1] !== 'ZZ').map(m => [m[5], m[9], m[10]]), 400, 26)
  },
  '2022': { municipio: simular(Object.values(hist.anos['2022']).map(v => [v[0], v[3], v[4]]), 400, 22) }
};
await fs.writeFile(RAIZ + 'site/dados/simulacao.json', JSON.stringify(saida));
for (const [ano, x] of Object.entries(saida)) if (typeof x === 'object' && x.municipio) for (const [nivel, r] of Object.entries(x)) console.log(ano, nivel, 'viradas', r.viradasApos5pct, '/', r.rodadas, '· faixa em 10%:', r.p025[9], '–', r.p975[9], '· em 50%:', r.p025[49], '–', r.p975[49]);
