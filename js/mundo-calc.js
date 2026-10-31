// Cálculos do "Brasil × mundo", sem DOM: o site (mundo.js) e o script (scripts/mundo.mjs) usam as mesmas regras.
// Regra única para todos os indicadores e países:
//  - valor de um país num ano = o dado daquele ano; se não houver, o mais recente dos `janela` anos anteriores
//    (janela definida por indicador: 0 nas séries anuais completas, maior nas pesquisas irregulares);
//  - posição = 1 + número de países com valor estritamente melhor (empates dividem a posição);
//  - percentil = % dos OUTROS países com valor estritamente pior que o do Brasil;
//  - mandatos: posição no ano anterior à posse e no último ano do mandato, só entre os países com valor nos dois anos.

export const PARES = ['ARG', 'CHL', 'COL', 'MEX', 'PER', 'ZAF', 'IND', 'CHN', 'RUS', 'TUR', 'IDN', 'USA', 'PRT'];
export const MANDATOS = [
  { id: 'fhc1', nome: 'FHC 1', ini: 1995, fim: 1998 },
  { id: 'fhc2', nome: 'FHC 2', ini: 1999, fim: 2002 },
  { id: 'lula1', nome: 'Lula 1', ini: 2003, fim: 2006 },
  { id: 'lula2', nome: 'Lula 2', ini: 2007, fim: 2010 },
  { id: 'dilma1', nome: 'Dilma 1', ini: 2011, fim: 2014 },
  { id: 'dilma2temer', nome: 'Dilma 2 + Temer', ini: 2015, fim: 2018 },
  { id: 'bolsonaro', nome: 'Bolsonaro', ini: 2019, fim: 2022 },
  { id: 'lula3', nome: 'Lula 3 (parcial)', ini: 2023, fim: 2026 },
];
export const REGIAO_AL = 'LCN'; // Banco Mundial: América Latina e Caribe

// Decodifica o JSON compacto: ind.s[ISO3] = array de valores alinhado com ano0..ano1.
export function preparar(J) {
  const n = J.ano1 - J.ano0 + 1;
  for (const ind of J.indicadores) {
    if (ind.s) continue;
    ind.s = {};
    for (const [iso, arr] of Object.entries(ind.v)) {
      const s = Array(n).fill(null);
      for (let k = 1; k < arr.length; k++) s[arr[0] + k - 1] = arr[k];
      ind.s[iso] = s;
    }
    ind.ano0 = J.ano0; ind.ano1 = J.ano1;
  }
  return J;
}

// {v, ano} do país no ano (com a janela do indicador) ou null
export function valor(ind, iso, ano, janela = ind.janela) {
  const s = ind.s[iso]; if (!s) return null;
  for (let a = ano; a >= ano - janela; a--) {
    const k = a - ind.ano0;
    if (k >= 0 && k < s.length && s[k] != null) return { v: s[k], ano: a };
  }
  return null;
}
export const melhor = (ind, a, b) => (ind.sentido > 0 ? a > b : a < b);

// Lista ordenada do melhor para o pior: [{iso, v, ano, pos}]; `filtro(iso)` restringe o conjunto.
export function lista(D, ind, ano, filtro = null) {
  const out = [];
  for (const iso of Object.keys(ind.s)) {
    if (filtro && !filtro(iso)) continue;
    const x = valor(ind, iso, ano);
    if (x) out.push({ iso, v: x.v, ano: x.ano });
  }
  out.sort((a, b) => (ind.sentido > 0 ? b.v - a.v : a.v - b.v) || a.iso.localeCompare(b.iso));
  let pos = 1;
  out.forEach((x, i) => { if (i && x.v !== out[i - 1].v) pos = i + 1; x.pos = pos; });
  return out;
}
export function mediana(vs) {
  const v = vs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Posição do país (BRA por padrão) no ano: {pos, n, percentil, v, anoDado, mediana, lista}
export function posicao(D, ind, ano, iso = 'BRA', filtro = null) {
  const L = lista(D, ind, ano, filtro);
  const eu = L.find(x => x.iso === iso);
  if (!eu) return null;
  const piores = L.filter(x => melhor(ind, eu.v, x.v)).length;
  return { pos: eu.pos, n: L.length, percentil: L.length > 1 ? Math.round((100 * piores) / (L.length - 1)) : 100, v: eu.v, anoDado: eu.ano, mediana: mediana(L.map(x => x.v)), lista: L };
}

// Último ano com dado PRÓPRIO do Brasil (sem janela)
export function anoRecenteBR(ind, iso = 'BRA') {
  const s = ind.s[iso]; if (!s) return null;
  for (let k = s.length - 1; k >= 0; k--) if (s[k] != null) return ind.ano0 + k;
  return null;
}
export function anosBR(ind, iso = 'BRA') {
  const s = ind.s[iso] || [];
  return s.map((v, k) => (v == null ? null : ind.ano0 + k)).filter(a => a != null);
}
// Média mundial do ano (ou do ano anterior mais próximo, até 3 anos): {v, ano}
export function mediaMundial(ind, ano) {
  for (let a = ano; a >= ano - 3; a--) { const v = ind.mundo[a - ind.ano0]; if (v != null) return { v, ano: a }; }
  return null;
}
export function serieMundo(ind) {
  return ind.mundo.map((v, k) => (v == null ? null : [ind.ano0 + k, v])).filter(Boolean);
}
export function serieBR(ind, iso = 'BRA') {
  return (ind.s[iso] || []).map((v, k) => (v == null ? null : [ind.ano0 + k, v])).filter(Boolean);
}

// Posição do Brasil em cada ano com dado próprio do Brasil
export function historicoPosicao(D, ind, iso = 'BRA') {
  return anosBR(ind, iso).map(ano => { const p = posicao(D, ind, ano, iso); return p && { ano, pos: p.pos, n: p.n, percentil: p.percentil, v: p.v }; }).filter(Boolean);
}

// Tabela por mandato (mesma regra para todos): início = ano anterior à posse; fim = último ano do mandato
// (no mandato em curso, o último ano com dado do Brasil). Ranking só entre países com valor nos dois anos.
export function porMandato(D, ind, iso = 'BRA') {
  const ultimo = anoRecenteBR(ind, iso);
  return D.mandatos.map(m => {
    const a0 = m.ini - 1, a1 = Math.min(m.fim, ultimo ?? m.fim);
    const base = { mandato: m, a0, a1 };
    if (ultimo == null || a1 < m.ini) return { ...base, semDado: 'sem dado do Brasil no período' };
    const b0 = valor(ind, iso, a0), b1 = valor(ind, iso, a1);
    if (!b0 || !b1) return { ...base, semDado: `sem dado do Brasil em ${!b0 ? a0 : a1}${ind.janela ? ` (nem nos ${ind.janela} anos anteriores)` : ''}` };
    if (b0.ano === b1.ano) return { ...base, semDado: `o dado mais recente do Brasil é o mesmo nos dois anos (${b0.ano})` };
    const comum = Object.keys(ind.s).filter(i => valor(ind, i, a0) && valor(ind, i, a1));
    const f = new Set(comum);
    const p0 = posicao(D, ind, a0, iso, i => f.has(i)), p1 = posicao(D, ind, a1, iso, i => f.has(i));
    return { ...base, anoDado0: b0.ano, anoDado1: b1.ano, n: comum.length, pos0: p0.pos, pos1: p1.pos, pct0: p0.percentil, pct1: p1.percentil, v0: b0.v, v1: b1.v, dPos: p0.pos - p1.pos, dV: b1.v - b0.v };
  });
}

// Recorte "topo + vizinhos": primeiros `topo` + `raio` acima e abaixo do país. Devolve itens e null (= "…").
export function topoEVizinhos(L, iso = 'BRA', topo = 5, raio = 4) {
  const i = L.findIndex(x => x.iso === iso);
  if (i < 0) return L.slice(0, topo);
  const idx = new Set();
  for (let k = 0; k < Math.min(topo, L.length); k++) idx.add(k);
  for (let k = Math.max(0, i - raio); k <= Math.min(L.length - 1, i + raio); k++) idx.add(k);
  const ord = [...idx].sort((a, b) => a - b), out = [];
  ord.forEach((k, j) => { if (j && k !== ord[j - 1] + 1) out.push(null); out.push(L[k]); });
  if (ord[ord.length - 1] < L.length - 1) out.push(null);
  return out;
}
