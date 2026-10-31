// Aba "Governos": os 8 últimos mandatos presidenciais (1995–2026) medidos com as mesmas séries oficiais e a mesma conta.
// Pobreza, Bolsa Família, saneamento, educação, renda e trabalho. "Suficiente" = comparado às metas oficiais
// (ODS da ONU, Marco Legal do Saneamento, PNE, Compromisso Criança Alfabetizada), nunca por opinião.
// Dados: site/dados/governo.json (scripts/governo.mjs). Método e fontes: docs/ANALISE-GOVERNOS.md
import { carregar, esc, corCss } from './util.js';
import { linhaInterativa } from './grafico.js';

// ---------- Cálculo (sem DOM: testável no Node) ----------
const quebrasDe = s => (s.quebras || []).map(q => q.ano);
const cruza = (qs, x0, x1) => qs.some(q => x0 < q && q <= x1);

// Valor da série no ano x: o próprio ponto ou a interpolação linear entre vizinhos (até 4 anos, sem quebra no meio).
export function valorEm(s, x) {
  const pts = s.pontos, ex = pts.find(p => p[0] === x);
  if (ex) return { v: ex[1], interp: false };
  let ant = null, pos = null;
  for (const p of pts) { if (p[0] < x) ant = p; else if (p[0] > x && !pos) pos = p; }
  if (!ant || !pos || cruza(quebrasDe(s), ant[0], pos[0]) || pos[0] - ant[0] > 4) return null;
  return { v: ant[1] + (pos[1] - ant[1]) * (x - ant[0]) / (pos[0] - ant[0]), interp: true };
}

// Variação no período: do último ano do mandato anterior (ini − 1) ao último ano do mandato (ou ao último dado).
// Soma as variações ano a ano e pula o salto de uma quebra de série. Mesma regra para todos.
export function variacao(s, p) {
  const pts = s.pontos;
  if (!pts || pts.length < 2) return null;
  const pri = pts[0][0], ult = pts.at(-1)[0], avisos = [];
  let a = p.ini - 1, b = Math.min(p.fim, ult);
  if (b < p.fim) avisos.push(`até ${b}`);
  if (a < pri) { a = pri; avisos.push(`desde ${pri}`); }
  if (b <= a) return null;
  let A = valorEm(s, a);
  if (!A) { const q = pts.find(x => x[0] > a && x[0] < b); if (!q) return null; a = q[0]; A = { v: q[1] }; avisos.push(`desde ${a}`); }
  let B = valorEm(s, b);
  if (!B) { const q = [...pts].reverse().find(x => x[0] < b && x[0] > a); if (!q) return null; b = q[0]; B = { v: q[1] }; if (!avisos.includes(`até ${b}`)) avisos.push(`até ${b}`); }
  if (b <= a) return null;
  const L = [[a, A.v], ...pts.filter(x => x[0] > a && x[0] < b), [b, B.v]], qs = quebrasDe(s);
  let delta = 0, anos = 0, quebra = false;
  for (let i = 1; i < L.length; i++) {
    if (cruza(qs, L[i - 1][0], L[i][0])) { quebra = true; continue; }
    delta += L[i][1] - L[i - 1][1]; anos += L[i][0] - L[i - 1][0];
  }
  if (!anos) return null;
  return { a, b, vA: A.v, vB: B.v, delta, anos, ritmo: delta / anos, interpolado: !!(A.interp || B.interp), quebra, avisos: [...new Set(avisos)] };
}

// Série derivada: pessoas = % × população do ano (mesmas quebras).
export function serieDePessoas(s, pop) {
  const P = Object.fromEntries(pop.pontos);
  return { ...s, nome: s.nome + ' — pessoas', unidade: 'pessoas', casas: 0, pontos: s.pontos.filter(p => P[p[0]]).map(([a, v]) => [a, v * P[a] / 100]) };
}

// Meta: quanto falta, ritmo necessário e em que ano chegaria em cada ritmo (reta simples).
export function avaliarMeta(s, ritmos) {
  const m = s.meta;
  if (!m || !s.pontos.length) return null;
  const [anoU, vU] = s.pontos.at(-1), dir = Math.sign(m.valor - vU), sentido = s.sentido || -dir;
  const alcancou = v => (sentido < 0 ? v <= m.valor : v >= m.valor);
  const primeiroAno = s.pontos.find(p => alcancou(p[1]))?.[0] ?? null;
  const prazoPassou = m.ano <= anoU;
  const necessario = !alcancou(vU) && !prazoPassou ? (m.valor - vU) / (m.ano - anoU) : null;
  const projetar = ritmo => {
    if (alcancou(vU)) return { ano: anoU, ja: true };
    if (!ritmo || Math.sign(ritmo) !== dir) return { ano: null };
    return { ano: anoU + (m.valor - vU) / ritmo };
  };
  const cenarios = Object.fromEntries(Object.entries(ritmos).map(([k, x]) => [k, x == null ? null : { ritmo: x, ...projetar(x) }]));
  return { meta: m, anoU, vU, falta: m.valor - vU, alcancou: alcancou(vU), primeiroAno, prazoPassou, necessario, cenarios };
}

// ---------- Formatação ----------
const num = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const sinal = x => (x > 0 ? '+' : x < 0 ? '−' : '');
export function fmtValor(s, v) {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (s.unidade) {
    case '%': return num(v, s.casas ?? 1) + '%';
    case 'nota': return num(v, 1);
    case 'indice': return num(v, 3);
    case 'R$': return 'R$ ' + num(v, 0);
    case 'familias': case 'pessoas': return num(v / 1e6, 1) + ' mi';
    default: return num(v, s.casas ?? 1);
  }
}
export function fmtDelta(s, d, ritmo = false) {
  if (d == null || !Number.isFinite(d)) return '—';
  const a = Math.abs(d), x = sinal(d);
  const casas = (s.casas ?? 1) + (ritmo ? 1 : 0);
  switch (s.unidade) {
    case '%': return x + num(a, Math.min(2, casas)) + ' p.p.';
    case 'nota': return x + num(a, ritmo ? 2 : 1);
    case 'indice': return x + num(a, ritmo ? 4 : 3);
    case 'R$': return x + 'R$ ' + num(a, 0);
    case 'familias': case 'pessoas': return x + num(a / 1e6, ritmo ? 2 : 1) + ' mi';
    default: return x + num(a, casas);
  }
}
const anoTxt = a => (a == null ? null : String(Math.ceil(a - 1e-9)));

// ---------- Desenho ----------
const ICONE = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const L = 640, H = 270, M = { t: 14, r: 14, b: 34, l: 52 }; // mesma geometria de grafico.js
const NS = 'http://www.w3.org/2000/svg';

function escalaY(vals, unidade) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (unidade === '%' || unidade === 'nota') { lo = Math.max(0, lo); }
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
  lo -= pad; hi += pad;
  if (vals.every(v => v >= 0)) lo = Math.max(0, lo);
  if (unidade === '%') hi = Math.min(100, hi);
  // grafico.js marca 5 linhas (quartos do intervalo): o intervalo precisa ser 4 passos "redondos".
  const mag = 10 ** Math.floor(Math.log10((hi - lo) / 4));
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50]) {
    const passo = k * mag;
    let base = Math.floor(lo / passo) * passo;
    if (unidade === '%' && base + 4 * passo > 100 && 100 - 4 * passo <= lo) base = 100 - 4 * passo;
    if (base + 4 * passo >= hi) return [base, base + 4 * passo];
  }
  return [lo, hi];
}
const fyDe = (s, ymin, ymax) => {
  const d = (ymax - ymin) / 4, casas = d >= 1 ? 0 : d >= 0.1 ? 1 : d >= 0.01 ? 2 : 3;
  switch (s.unidade) {
    case 'familias': case 'pessoas': return v => num(v / 1e6, ymax - ymin >= 8e6 ? 0 : 1) + ' mi';
    case 'R$': return v => 'R$ ' + num(v, 0);
    case '%': return v => num(v, casas) + '%';
    default: return v => num(v, Math.max(casas, s.unidade === 'indice' ? 2 : 0));
  }
};

// Faixas de fundo por mandato, metas (linhas tracejadas), quebras e marcos, por cima do gráfico de grafico.js.
function decorar(alvo, { xmin, xmax, ymin, ymax, periodos, metas, quebras, marcos }) {
  const svg = alvo.querySelector('svg.grafico');
  if (!svg) return;
  const w = L - M.l - M.r, h = H - M.t - M.b;
  const X = x => M.l + w * (Math.max(xmin, Math.min(xmax, x)) - xmin) / (xmax - xmin), Y = y => M.t + h - h * (y - ymin) / (ymax - ymin);
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'gov-fundo');
  let html = '';
  periodos.forEach((p, i) => {
    const x0 = X(p.ini - 0.5), x1 = X(p.fim + 0.5);
    if (x1 - x0 < 1) return;
    html += `<rect class="gov-faixa ${i % 2 ? 'par' : 'impar'}" x="${x0.toFixed(1)}" y="${M.t}" width="${(x1 - x0).toFixed(1)}" height="${h}"><title>${esc(p.nome)} (${p.ini}–${p.fim})</title></rect>`;
  });
  for (const mc of marcos) html += `<line class="gov-marco" x1="${X(mc.x)}" x2="${X(mc.x)}" y1="${M.t}" y2="${M.t + h}"><title>${esc(mc.texto)}</title></line>`;
  for (const q of quebras) if (q.ano > xmin && q.ano < xmax) html += `<line class="gov-quebra" x1="${X(q.ano - 0.5)}" x2="${X(q.ano - 0.5)}" y1="${M.t}" y2="${M.t + h}"><title>Quebra de série: ${esc(q.texto)}</title></line><text class="gov-quebra-txt" x="${X(q.ano - 0.5) + 3}" y="${M.t + h - 4}">quebra</text>`;
  g.innerHTML = html;
  svg.insertBefore(g, svg.querySelector('g[clip-path]'));
  const gm = document.createElementNS(NS, 'g');
  gm.setAttribute('class', 'gov-metas');
  gm.innerHTML = metas.filter(m => m.valor >= ymin && m.valor <= ymax).map(m => `<line class="gov-meta" x1="${M.l}" x2="${L - M.r}" y1="${Y(m.valor)}" y2="${Y(m.valor)}" stroke="${m.cor}"><title>${esc(m.rotulo)}</title></line><text class="gov-meta-txt" x="${L - M.r - 4}" y="${Y(m.valor) - 4}" text-anchor="end" fill="${m.cor}">${esc(m.curto)}</text>`).join('');
  svg.insertBefore(gm, svg.querySelector('.guia'));
  // Rótulos dos mandatos em HTML (legíveis no celular), alinhados às faixas.
  const faixa = document.createElement('div');
  faixa.className = 'gov-rotulos';
  faixa.setAttribute('aria-hidden', 'true');
  faixa.innerHTML = periodos.map((p, i) => {
    const x0 = X(p.ini - 0.5), x1 = X(p.fim + 0.5);
    if (x1 - x0 < 1) return '';
    return `<span class="${i % 2 ? 'par' : 'impar'}" style="left:${(100 * x0 / L).toFixed(2)}%;width:${(100 * (x1 - x0) / L).toFixed(2)}%" title="${esc(p.nome)} (${p.ini}–${p.fim})">${esc(p.curto || p.nome)}</span>`;
  }).join('');
  alvo.querySelector('.graf-area').after(faixa);
}

const CORES = ['--serie-1', '--serie-2', '--tinta-2', '--acento'];
function grafico(el, G, D, periodos) {
  const ss = G.series.map(k => D.series[k]).filter(Boolean);
  if (!ss.length) return;
  const cores = G.series.map((_, i) => corCss(CORES[i % CORES.length]) || '#888');
  const series = ss.map((s, i) => ({ nome: s.curto || s.nome, cor: cores[i], pts: s.pontos }));
  const metasLinha = [];
  ss.forEach((s, i) => {
    if (!s.meta || !(G.metas === 'todas' || G.meta === G.series[i])) return;
    const m = s.meta;
    metasLinha.push({ valor: m.valor, cor: cores[i], rotulo: m.nome, curto: `meta ${fmtValor(s, m.valor)} (${m.ano})` });
    for (const [ano, v] of m.intermediarias || []) if (ano !== m.ano && !G.metaSerie) metasLinha.push({ valor: v, cor: cores[i], rotulo: `Meta intermediária de ${ano}`, curto: `meta ${fmtValor(s, v)} (${ano})`, inter: true });
  });
  if (G.metaSerie) { // metas anuais como série tracejada (Criança Alfabetizada)
    const s = ss[0];
    series.push({ nome: 'Meta anual', cor: corCss('--muted') || '#999', pts: (s.meta.intermediarias || []).map(([a, v]) => [a, v]) });
  }
  const xs = series.flatMap(s => s.pts.map(p => p[0]));
  const xmin = Math.min(G.xmin ?? Infinity, ...xs) - 0.5, xmax = Math.max(G.xmax ?? -Infinity, ...xs) + 0.5;
  const [ymin, ymax] = escalaY([...series.flatMap(s => s.pts.map(p => p[1])), ...metasLinha.map(m => m.valor)], ss[0].unidade);
  const fy = fyDe(ss[0], ymin, ymax);
  const inicios = periodos.map(p => p.ini).filter(a => a > xmin && a < xmax);
  const ticksX = inicios.length >= 3 ? inicios : null;
  const periodoDe = x => periodos.find(p => Math.round(x) >= p.ini && Math.round(x) <= p.fim);
  el.innerHTML = `<h4 class="gov-graf-tit">${esc(G.titulo)}</h4><div class="gov-graf"></div>`;
  const alvo = el.querySelector('.gov-graf');
  linhaInterativa(alvo, {
    series, xmin, xmax, ymin, ymax, ticksX, tocar: true,
    fx: x => String(Math.round(x)), fy,
    rotulo: `${G.titulo}, por ano, com as faixas dos mandatos presidenciais`,
    dica: x => { const p = periodoDe(x); return p ? esc(p.nome) : ''; }
  });
  if (G.metaSerie) { const p = alvo.querySelectorAll('path[data-i]')[series.length - 1]; p?.classList.remove('linha-anim'); p?.setAttribute('stroke-dasharray', '5 4'); }
  const quebras = ss.flatMap(s => s.quebras || []);
  const marcos = [...periodos.flatMap(p => p.marcos || []), ...ss.flatMap(s => s.marcos || [])];
  decorar(alvo, { xmin, xmax, ymin, ymax, periodos, metas: metasLinha, quebras: [...new Map(quebras.map(q => [q.ano, q])).values()], marcos });
  if (metasLinha.length) {
    const leg = document.createElement('p');
    leg.className = 'gov-meta-leg small';
    leg.innerHTML = metasLinha.filter((m, i, a) => !m.inter && a.findIndex(o => o.rotulo === m.rotulo) === i).map(m => `<span><i style="border-color:${m.cor}"></i>${esc(m.rotulo)}</span>`).join('');
    el.append(leg);
  }
  const notas = ss.filter(s => s.quebra || (s.quebras || []).length);
  el.insertAdjacentHTML('beforeend', `<div class="gov-fontes">${ss.map(s => `<p class="fonte"><span aria-hidden="true">ⓘ</span> <b>${esc(s.curto || s.nome)}:</b> <a href="${esc(s.fonte.url)}" target="_blank" rel="noopener">${esc(s.fonte.nome)}</a>${s.fonte.serie ? ` (série ${esc(s.fonte.serie)})` : ''}.</p>`).join('')}
    ${notas.map(s => `<p class="fonte gov-quebra-nota"><b>${esc(s.curto || s.nome)}:</b> ${s.quebras?.length ? 'quebras de série em ' + s.quebras.map(q => `${Math.floor(q.ano)} (${esc(q.texto)})`).join('; ') + '. ' : ''}${esc(s.quebra || '')}</p>`).join('')}</div>`);
}

// Cartões "variação em cada governo": a mesma lista de indicadores para os 8 mandatos.
function cartoesPeriodos(D, chaves, periodos, extras) {
  return `<div class="gov-cartoes">${periodos.map((p, i) => `<div class="gov-cartao" style="--i:${i}">
    <div class="gov-cartao-topo"><b>${esc(p.nome)}</b><small>${p.ini}–${p.fim}${p.parcial ? ' (em curso)' : ''}</small></div>
    <ul>${chaves.map(k => {
      const s = D.series[k] || extras[k]; if (!s) return '';
      const v = variacao(s, p);
      return `<li><span>${esc(s.curto || s.nome)}</span>${v ? `<b class="${classeDir(s, v.delta)}">${esc(fmtDelta(s, v.delta))}</b>${marcas(v)}` : '<b class="muted">sem dado</b>'}</li>`;
    }).join('')}</ul></div>`).join('')}</div>`;
}
const classeDir = (s, d) => !s.sentido || !d ? 'neutro' : Math.sign(d) === s.sentido ? 'melhora' : 'piora';
const marcas = v => {
  const t = [];
  if (v.avisos.length) t.push(v.avisos.join(', '));
  if (v.interpolado) t.push('ano sem dado estimado entre vizinhos');
  if (v.quebra) t.push('sem o salto da troca de método');
  return t.length ? ` <abbr class="gov-aviso" title="${esc(t.join('; '))}">*</abbr>` : '';
};

// Tabela comparativa dos 8 governos: linhas = indicadores, colunas = mandatos. Célula = variação e ritmo por ano.
function tabelaComparativa(D, linhas, periodos, extras) {
  return `<div class="tabela-rolagem alta gov-tab"><table>
    <thead><tr><th class="gov-col-ind">Indicador</th>${periodos.map(p => `<th class="num">${esc(p.nome)}<br><small>${p.ini}–${p.fim}${p.parcial ? '*' : ''}</small></th>`).join('')}</tr></thead>
    <tbody>${linhas.map(([grupo, ks]) => `<tr class="gov-grupo"><th colspan="${periodos.length + 1}">${esc(grupo)}</th></tr>${ks.map(k => {
      const s = D.series[k] || extras[k]; if (!s) return '';
      return `<tr><th class="gov-col-ind">${esc(s.curto || s.nome)}<small>${s.sentido ? (s.sentido < 0 ? 'menor é melhor' : 'maior é melhor') : 'sem sentido de melhora'}</small></th>${periodos.map(p => {
        const v = variacao(s, p);
        return v ? `<td class="num ${classeDir(s, v.delta)}"><b>${esc(fmtDelta(s, v.delta))}</b>${marcas(v)}<small>${esc(fmtDelta(s, v.ritmo, true))}/ano</small></td>` : '<td class="num muted">—</td>';
      }).join('')}</tr>`;
    }).join('')}`).join('')}</tbody></table></div>`;
}

// "O que os números mostram": frases geradas por regras fixas, iguais para todos os períodos.
function textoSerie(s, periodos) {
  const vs = periodos.map(p => ({ p, v: variacao(s, p) })).filter(x => x.v);
  if (!vs.length) return '';
  const [a0, v0] = s.pontos[0], [aU, vU] = s.pontos.at(-1);
  const frases = [`<b>${esc(s.curto || s.nome)}</b>: de ${a0} a ${aU}, foi de <b>${esc(fmtValor(s, v0))}</b> para <b>${esc(fmtValor(s, vU))}</b>.`];
  // Ranking só com períodos de pelo menos 2 anos de dado (1 ano isolado não mostra ritmo de mandato).
  const rk = vs.filter(x => x.v.anos >= 2);
  if (s.sentido && rk.length >= 2) {
    const ord = [...rk].sort((x, y) => s.sentido * (y.v.ritmo - x.v.ritmo));
    const melhor = ord[0], pior = ord.at(-1);
    frases.push(`Maior ${s.sentido * melhor.v.ritmo > 0 ? 'avanço' : 'variação'} por ano: <b>${esc(melhor.p.nome)}</b> (${esc(fmtDelta(s, melhor.v.ritmo, true))} por ano${melhor.p.parcial ? ', período ainda em curso' : ''}).`);
    const pioras = vs.filter(x => s.sentido * x.v.delta < 0);
    if (pioras.length) frases.push(`Pioraram no mandato: ${pioras.map(x => `<b>${esc(x.p.nome)}</b> (${esc(fmtDelta(s, x.v.delta))})`).join(', ')}.`);
    else if (pior !== melhor) frases.push(`Menor avanço por ano: <b>${esc(pior.p.nome)}</b> (${esc(fmtDelta(s, pior.v.ritmo, true))} por ano).`);
  }
  return frases.join(' ');
}
function textoMeta(s, periodos) {
  if (!s.meta) return '';
  const vs = periodos.map(p => ({ p, v: variacao(s, p) })).filter(x => x.v);
  const atual = vs.at(-1), todo = variacao(s, { ini: s.pontos[0][0] + 1, fim: s.pontos.at(-1)[0] });
  const rk = vs.filter(x => x.v.anos >= 2);
  const ritMelhor = rk.length ? rk.reduce((m, x) => (Math.sign(s.meta.valor - s.pontos.at(-1)[1]) * x.v.ritmo > Math.sign(s.meta.valor - s.pontos.at(-1)[1]) * m.v.ritmo ? x : m)) : null;
  const A = avaliarMeta(s, { atual: atual?.v.ritmo, todo: todo?.ritmo, melhor: ritMelhor?.v.ritmo });
  if (!A) return '';
  const m = A.meta, partes = [`<b>Meta:</b> ${esc(m.nome)}.`];
  if (A.alcancou) {
    partes.push(`<span class="gov-veredito ok">Meta alcançada</span> desde ${A.primeiroAno}${A.prazoPassou && A.primeiroAno > m.ano ? ` (depois do prazo de ${m.ano})` : ''}.`);
    return `<p>${partes.join(' ')}</p>`;
  }
  partes.push(`Último dado (${A.anoU}): ${esc(fmtValor(s, A.vU))}. Distância até a meta: <b>${esc(fmtDelta(s, A.falta).replace(/^[+−]/, ''))}</b>${/\.$/.test(fmtDelta(s, A.falta)) ? '' : '.'}`);
  const proj = c => c == null ? '—' : c.ja ? 'já alcançada' : c.ano == null ? 'não chega (o indicador andou no sentido contrário ou parou)' : `chegaria em <b>${anoTxt(c.ano)}</b>`;
  if (A.prazoPassou) {
    partes.push(`<span class="gov-veredito abaixo">Prazo encerrado em ${m.ano} sem atingir a meta</span>.`);
    if (atual) partes.push(`No ritmo de ${esc(atual.p.nome)} (${esc(fmtDelta(s, atual.v.ritmo, true))}/ano), ${proj(A.cenarios.atual)}.`);
  } else {
    const dentro = A.cenarios.atual?.ano != null && A.cenarios.atual.ano <= m.ano + 1e-9;
    partes.push(`Para chegar lá em ${m.ano}, o ritmo precisa ser de <b>${esc(fmtDelta(s, A.necessario, true))} por ano</b>.`);
    const rotAtual = atual && atual.p === periodos.at(-1) ? `Ritmo de ${esc(atual.p.nome)}${atual.p.parcial ? ' (em curso)' : ''}` : atual ? `Último ritmo medido (${esc(atual.p.nome)}; o período seguinte ainda não tem dado comparável)` : '';
    if (atual) partes.push(`${rotAtual}: ${esc(fmtDelta(s, atual.v.ritmo, true))}/ano → <span class="gov-veredito ${dentro ? 'ok' : 'abaixo'}">${dentro ? 'dentro do ritmo da meta' : 'abaixo do ritmo da meta'}</span>${!dentro && A.cenarios.atual?.ano != null ? ` (precisaria ser ${num(A.necessario / atual.v.ritmo, 1)} vezes mais rápido)` : ''}; ${proj(A.cenarios.atual)}.`);
  }
  const cen = [];
  if (todo) cen.push(`no ritmo médio de ${s.pontos[0][0]} a ${A.anoU} (${esc(fmtDelta(s, todo.ritmo, true))}/ano): ${proj(A.cenarios.todo)}`);
  if (ritMelhor && ritMelhor !== atual) cen.push(`no ritmo mais rápido entre os mandatos (${esc(ritMelhor.p.nome)}, ${esc(fmtDelta(s, ritMelhor.v.ritmo, true))}/ano): ${proj(A.cenarios.melhor)}`);
  if (cen.length) partes.push(`Outros cenários (reta simples, não é previsão): ${cen.join('; ')}.`);
  return `<p>${partes.join(' ')}</p>`;
}

// ---------- Temas ----------
const TEMAS = [
  {
    id: 'pobreza', icone: 'analise', titulo: 'Pobreza e extrema pobreza',
    intro: 'Parte da população que vive com menos que as linhas internacionais do Banco Mundial (renda por pessoa, por dia, em dólar de mesmo poder de compra). A série do IPEA é a única contínua de 1995 a 2025; a do IBGE (2012–2024) e a do Banco Mundial servem de conferência.',
    graficos: [
      { titulo: 'Extrema pobreza (% da população)', series: ['extrema_ipea', 'extrema_ibge', 'extrema_bm'], meta: 'extrema_ipea' },
      { titulo: 'Pobreza (% da população)', series: ['pobreza_ipea', 'pobreza_ibge', 'pobreza_bm'], meta: 'pobreza_ipea' }
    ],
    cartoes: ['extrema_ipea', 'extrema_pessoas', 'pobreza_ipea', 'pobreza_pessoas'], texto: ['extrema_ipea', 'pobreza_ipea', 'extrema_ibge', 'pobreza_ibge']
  },
  {
    id: 'bf', icone: 'cidade', titulo: 'Bolsa Família e quem deixou de depender dele',
    intro: 'Quantas famílias recebem o benefício, quanto recebem em média (corrigido pela inflação) e quanta gente ficaria na extrema pobreza sem os benefícios sociais. A saída por aumento de renda só é publicada pelo MDS desde 2023, então não há como comparar esse número com governos anteriores.',
    graficos: [
      { titulo: 'Famílias atendidas (dezembro de cada ano)', series: ['pbf_familias'] },
      { titulo: 'Benefício médio por família, em reais de hoje', series: ['pbf_valor_real'] },
      { titulo: 'Extrema pobreza com e sem os benefícios sociais (IBGE, US$ 2,15)', series: ['extrema_ibge', 'extrema_sem_beneficio'] }
    ],
    cartoes: ['pbf_familias', 'pbf_valor_real', 'efeito_beneficios'], texto: ['pbf_familias', 'efeito_beneficios']
  },
  {
    id: 'saneamento', icone: 'casa', titulo: 'Saneamento: água e esgoto',
    intro: 'Duas medidas: a pesquisa domiciliar do IBGE (pergunta às famílias; série contínua desde 1995) e o SNIS/SINISA do Ministério das Cidades (informado pelas empresas de saneamento; é a base usada para acompanhar o Marco Legal). A meta de esgoto pede coleta e tratamento; as duas séries medem só a coleta.',
    graficos: [
      { titulo: 'Água por rede geral (%)', series: ['agua_domicilios', 'agua_snis'], meta: 'agua_snis' },
      { titulo: 'Esgoto por rede coletora (%)', series: ['esgoto_domicilios', 'esgoto_snis'], meta: 'esgoto_snis' }
    ],
    cartoes: ['agua_domicilios', 'esgoto_domicilios'], texto: ['agua_domicilios', 'esgoto_domicilios', 'agua_snis', 'esgoto_snis']
  },
  {
    id: 'educacao', icone: 'escola', titulo: 'Educação',
    intro: 'IDEB (nota de 0 a 10 que junta aprendizado na prova Saeb e aprovação; existe desde 2005), analfabetismo de quem tem 15 anos ou mais e o novo indicador de crianças alfabetizadas no 2º ano (desde 2023).',
    graficos: [
      { titulo: 'IDEB (rede pública e privada)', series: ['ideb_ai', 'ideb_af', 'ideb_em'], metas: 'todas', xmin: 2005 },
      { titulo: 'Analfabetismo, 15 anos ou mais (%)', series: ['analfabetismo'], meta: 'analfabetismo' },
      { titulo: 'Crianças alfabetizadas no 2º ano (%)', series: ['crianca_alfabetizada'], meta: 'crianca_alfabetizada', metaSerie: true, xmax: 2030 }
    ],
    cartoes: ['ideb_ai', 'ideb_af', 'ideb_em', 'analfabetismo'], texto: ['ideb_ai', 'ideb_af', 'ideb_em', 'analfabetismo', 'crianca_alfabetizada']
  },
  {
    id: 'renda', icone: 'comparar', titulo: 'Renda e trabalho',
    intro: 'Renda média por pessoa corrigida pela inflação, desigualdade (Gini: 0 = todos iguais, 1 = um só tem tudo) e desemprego. Inflação e PIB aparecem como contexto: são fatores que mexem em todos os outros números. Não há meta oficial com prazo para estes indicadores.',
    graficos: [
      { titulo: 'Renda domiciliar por pessoa (R$ de 2025)', series: ['renda_media'] },
      { titulo: 'Desigualdade (Gini)', series: ['gini'] },
      { titulo: 'Desemprego (%)', series: ['desemprego_oit', 'desemprego_pnadc'] },
      { titulo: 'Contexto: inflação e crescimento do PIB (%)', series: ['ipca', 'pib'] }
    ],
    cartoes: ['renda_media', 'gini', 'desemprego_oit'], texto: ['renda_media', 'gini', 'desemprego_oit']
  }
];
const LINHAS_TABELA = [
  ['Pobreza', ['extrema_ipea', 'extrema_pessoas', 'pobreza_ipea', 'pobreza_pessoas']],
  ['Bolsa Família', ['pbf_familias', 'pbf_valor_real', 'efeito_beneficios']],
  ['Saneamento', ['agua_domicilios', 'esgoto_domicilios']],
  ['Educação', ['analfabetismo', 'ideb_ai', 'ideb_af', 'ideb_em']],
  ['Renda e trabalho', ['renda_media', 'gini', 'desemprego_oit']]
];

// Séries derivadas (mesma regra): pessoas na pobreza e efeito dos benefícios.
function derivadas(D) {
  const S = D.series, x = {};
  if (S.pop) {
    x.extrema_pessoas = { ...serieDePessoas(S.extrema_ipea, S.pop), curto: 'Pessoas na extrema pobreza', meta: null, sentido: -1 };
    x.pobreza_pessoas = { ...serieDePessoas(S.pobreza_ipea, S.pop), curto: 'Pessoas na pobreza', meta: null, sentido: -1 };
  }
  if (S.extrema_ibge && S.extrema_sem_beneficio) {
    const com = Object.fromEntries(S.extrema_ibge.pontos);
    x.efeito_beneficios = {
      nome: 'Diferença entre a extrema pobreza sem e com os benefícios sociais', curto: 'Efeito dos benefícios na extrema pobreza', unidade: '%', casas: 1, sentido: 0,
      fonte: S.extrema_sem_beneficio.fonte, pontos: S.extrema_sem_beneficio.pontos.filter(p => com[p[0]] != null).map(([a, v]) => [a, v - com[a]])
    };
  }
  return x;
}

export async function iniciarGoverno(R, { irAba } = {}) {
  const el = document.getElementById('aba-governos') || document.getElementById('aba-governo');
  if (!el) return;
  el.innerHTML = '<div class="esqueleto" aria-label="Carregando"><i></i><i></i><i></i><i></i><i></i></div>';
  let D;
  try { D = await carregar('governo.json'); }
  catch (e) { el.innerHTML = `<p class="erro">Não consegui carregar os dados: ${esc(e.message)}</p>`; return; }
  const periodos = D.periodos.map(p => ({ ...p, curto: p.nome.replace('Dilma 2 + Temer', 'Dilma 2 · Temer') }));
  const X = derivadas(D);
  const DS = { ...D, series: { ...D.series, ...X } };
  const ultimo = p => { const v = variacao(DS.series.extrema_ipea, p); return v ? v.b : null; };
  const lula3 = periodos.at(-1);

  el.innerHTML = `
    <h2>Governos: os números de 1995 a 2026</h2>
    <p class="lead">Os oito últimos mandatos presidenciais medidos com <b>as mesmas séries oficiais e a mesma conta</b>: pobreza, Bolsa Família, saneamento, educação, renda e trabalho. "Foi suficiente?" é respondido comparando o ritmo de cada período com as <b>metas oficiais</b> (ONU, Marco Legal do Saneamento, Plano Nacional de Educação), não com opinião.</p>
    <div class="cand-aviso gov-aviso-topo" role="note">${ICONE('alerta')}<div><b>Como ler:</b> a variação de cada governo vai do último ano do mandato anterior ao último ano do mandato (para ${esc(lula3.nome)}, até o último dado disponível${ultimo(lula3) ? `, em geral ${ultimo(lula3)}` : ''}). Os números mostram o que aconteceu no período; não dizem quanto se deve ao governo, à economia mundial, a estados e municípios ou a decisões tomadas antes. Pandemia, crises, troca de pesquisa e de programas estão marcadas nos gráficos e listadas no fim.</div></div>
    <nav class="gov-indice" aria-label="Temas desta aba">${TEMAS.map(t => `<a href="#gov-${t.id}">${ICONE(t.icone)}${esc(t.titulo.split(':')[0])}</a>`).join('')}<a href="#gov-tabela">${ICONE('comparar')}Tabela dos 8 governos</a>${irAba ? `<button class="link gov-mundo" type="button">${ICONE('globo')}Ver a posição do Brasil no mundo</button>` : ''}</nav>
    ${TEMAS.map(t => `<section class="bloco gov-tema" id="gov-${t.id}">
      <h3>${ICONE(t.icone)}${esc(t.titulo)}</h3>
      <p class="muted">${esc(t.intro)}</p>
      <div class="gov-graficos">${t.graficos.map((_, i) => `<div class="gov-graf-bloco" data-tema="${t.id}" data-i="${i}"></div>`).join('')}</div>
      ${t.id === 'bf' ? blocoSaidas(D) : ''}
      <h4 class="sub">Variação em cada governo</h4>
      ${cartoesPeriodos(DS, t.cartoes, periodos, X)}
      <div class="gov-texto bot-texto">
        <h4 class="sub">${ICONE('chat')}O que os números mostram</h4>
        ${t.texto.map(k => DS.series[k]).filter(Boolean).map((s, k) => `<div class="bolha painel" style="--k:${k}"><p>${textoSerie(s, periodos)}</p>${textoMeta(s, periodos)}</div>`).join('')}
        <p class="fonte">Frases geradas por regras fixas a partir dos números desta página, iguais para todos os mandatos.</p>
      </div>
    </section>`).join('')}
    <section class="bloco" id="gov-tabela"><h3>${ICONE('comparar')}Tabela comparativa dos 8 governos</h3>
      <p class="muted small">Em cada célula: a variação no mandato e, embaixo, o ritmo médio por ano. Verde e vermelho indicam só o sentido em relação ao objetivo do indicador (por exemplo, menos pobreza = verde). <abbr title="ver a dica">*</abbr> = passe o mouse ou toque para ver o ajuste (período parcial, ano estimado ou troca de método). ${esc(lula3.nome)} está em curso.</p>
      ${tabelaComparativa(DS, LINHAS_TABELA, periodos, X)}
    </section>
    <section class="bloco"><h3>${ICONE('relogio')}Fatores externos e mudanças de método</h3>
      <ul class="gov-fatores">${D.fatores.map(f => `<li><b>${f.ano}</b> ${esc(f.texto)}</li>`).join('')}</ul>
    </section>
    <section class="bloco"><h3>${ICONE('livro')}Como calculamos</h3>
      <ul class="cand-metodo">${D.notas.map(n => `<li>${esc(n)}</li>`).join('')}
        <li>Pessoas na pobreza = % da série do IPEA × população do ano (Banco Mundial, WDI). "Saíram" é sempre o saldo: quem entrou e quem saiu se compensam.</li>
        <li>Efeito dos benefícios = extrema pobreza calculada sem a renda de programas sociais menos a extrema pobreza real (IBGE, Síntese de Indicadores Sociais).</li>
      </ul>
      <p class="fonte">Dados gerados por <code>scripts/governo.mjs</code> em ${esc(D.gerado)}. Valores em reais corrigidos pelo IPCA até ${esc(D.ipcaReferencia)}. Detalhes, tabelas e limitações em <a href="https://github.com/UPraggy/ApuracaoTSE2026/blob/main/docs/ANALISE-GOVERNOS.md" target="_blank" rel="noopener">docs/ANALISE-GOVERNOS.md</a>.</p>
    </section>`;

  el.querySelector('.gov-mundo')?.addEventListener('click', () => irAba('mundo'));
  // Gráficos: desenhados quando o bloco aparece na tela (a aba pode estar escondida).
  const desenhar = b => { const t = TEMAS.find(x => x.id === b.dataset.tema); grafico(b, t.graficos[+b.dataset.i], DS, periodos); };
  const blocos = [...el.querySelectorAll('.gov-graf-bloco')];
  if ('IntersectionObserver' in window) {
    const o = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !e.target.dataset.ok) { e.target.dataset.ok = '1'; o.unobserve(e.target); desenhar(e.target); } }), { rootMargin: '200px' });
    blocos.forEach(b => o.observe(b));
  } else blocos.forEach(desenhar);
}

function blocoSaidas(D) {
  const B = D.bolsaFamilia;
  if (!B) return '';
  const fmt = v => v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' milhões' : v.toLocaleString('pt-BR') ;
  return `<h4 class="sub">Saídas por aumento de renda (dados do MDS, só existem desde 2023)</h4>
    <div class="cards gov-saidas">${B.saidas.map((s, i) => `<div class="card" style="--i:${i}"><span class="rot">${esc(s.periodo)}</span><span class="valor">${esc(fmt(s.valor))}</span><span class="rot">${esc(s.texto)}</span><span class="fonte"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.fonte)}</a></span></div>`).join('')}</div>
    <p class="muted small">Regra de proteção (Lei 14.601/2023): a família cuja renda por pessoa sobe acima de R$ 218, até meio salário mínimo, continua no programa recebendo 50% do benefício por um tempo (24 meses na regra de 2023; 12 meses segundo o MDS em 2026) e volta ao valor cheio se a renda cair. ${Object.entries(B.entradasProtecao || {}).map(([a, v]) => `${a}: ${(v / 1e6).toLocaleString('pt-BR')} milhões de famílias entraram na regra`).join('; ')} (MDS). Antes de 2023, o MDS não divulgava uma série equivalente de saídas por renda; por isso esses números não entram na comparação entre governos.</p>`;
}
