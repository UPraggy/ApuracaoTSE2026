// Aba "Candidatos": o perfil dos LUGARES onde cada candidato teve votos, com médias ponderadas pelos votos.
// Unidade = município (o boletim é por seção, os indicadores sociais são por município). Exterior fora.
// Média do eleitor do 13 = Σ(votos do 13 no município × indicador) ÷ Σ(votos do 13). Idem para o 22,
// para todos os votantes (peso = comparecimento) e para a população (peso = habitantes do Censo 2022).
import { REGIAO_NOME, carregar, nf, pct, esc, titulo } from './util.js';

// Indicadores, na ordem em que aparecem. un: forma de mostrar. bu: calculado do próprio boletim de urna.
export const INDICADORES = [
  { grupo: 'Renda e economia', k: 'rendaPcMedia', nome: 'Renda domiciliar por pessoa (média)', un: 'R$' },
  { grupo: 'Renda e economia', k: 'rendaPcMediana', nome: 'Renda domiciliar por pessoa (mediana)', un: 'R$' },
  { grupo: 'Renda e economia', k: 'pibPerCapita', nome: 'PIB por habitante', un: 'R$' },
  { grupo: 'Renda e economia', k: 'idhm2010', nome: 'IDHM (2010)', un: 'idx' },
  { grupo: 'Programas sociais', k: 'bfPctDomicilios', nome: 'Famílias no Bolsa Família', un: 'bf' },
  { grupo: 'Programas sociais', k: 'bpcPctPop', nome: 'Recebem BPC', un: '%', d: 2 },
  { grupo: 'Saneamento e moradia', k: 'pctAguaRede', nome: 'Água da rede geral', un: '%' },
  { grupo: 'Saneamento e moradia', k: 'pctEsgotoRede', nome: 'Esgoto ligado à rede', un: '%' },
  { grupo: 'Saneamento e moradia', k: 'pctLixoColetado', nome: 'Lixo coletado', un: '%' },
  { grupo: 'Saneamento e moradia', k: 'pctDomInternet', nome: 'Domicílios com internet', un: '%' },
  { grupo: 'Saúde', k: 'apsCobertura', nome: 'Cobertura da atenção básica', un: '%' },
  { grupo: 'Saúde', k: 'preNatal7mais', nome: 'Bebês com 7+ consultas de pré-natal', un: '%' },
  { grupo: 'Saúde', k: 'mortInfantil', nome: 'Mortalidade infantil', un: 'mil' },
  { grupo: 'Saúde', k: 'leitosSusPorMil', nome: 'Leitos do SUS', un: 'leitos' },
  { grupo: 'População', k: 'pct60mais', nome: 'Moradores com 60 anos ou mais', un: '%' },
  { grupo: 'População', k: 'pct16a29', nome: 'Moradores de 16 a 29 anos', un: '%' },
  { grupo: 'População', k: 'alfabetizacao15', nome: 'Alfabetização (15 anos ou mais)', un: '%' },
  { grupo: 'População', k: 'densidade', nome: 'Densidade (mediana ponderada)', un: 'hab', mediana: true },
  { grupo: 'Eleitorado (cadastro TSE)', k: 'eleitPctFeminino', nome: 'Eleitoras (mulheres)', un: '%' },
  { grupo: 'Eleitorado (cadastro TSE)', k: 'eleitPct60mais', nome: 'Eleitores com 60 anos ou mais', un: '%' },
  { grupo: 'Eleitorado (cadastro TSE)', k: 'eleitPctSuperior', nome: 'Eleitores com superior completo', un: '%' },
  { grupo: 'Eleitorado (cadastro TSE)', k: 'eleitPctBiometria', nome: 'Eleitores com biometria cadastrada', un: '%' },
  { grupo: 'Participação (boletim de urna 2026)', k: '_comp', nome: 'Comparecimento', un: '%', bu: m => m.aptos ? 100 * m.comp / m.aptos : null },
  { grupo: 'Participação (boletim de urna 2026)', k: '_bn', nome: 'Brancos e nulos', un: '%', d: 2, bu: m => m.comp ? 100 * (m.br + m.nu) / m.comp : null },
  { grupo: 'Participação (boletim de urna 2026)', k: '_bio', nome: 'Liberados sem a digital', un: '%', d: 2, bu: m => m.comp ? 100 * m.biom / m.comp : null }
];

const num = (x, d = 0) => x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export function fmt(ind, x) {
  if (x == null || !Number.isFinite(x)) return '—';
  switch (ind.un) {
    case 'R$': return 'R$ ' + num(x);
    case 'idx': return num(x, 3);
    case 'bf': return num(x, 1) + ' por 100 dom.';
    case 'mil': return num(x, 1) + ' por mil';
    case 'leitos': return num(x, 2) + ' por mil hab.';
    case 'hab': return num(x, 0) + ' hab/km²';
    default: return num(x, ind.d ?? 1) + '%';
  }
}
// Diferença 13 − 22 na unidade do indicador.
function fmtDif(ind, d) {
  if (d == null || !Number.isFinite(d)) return '—';
  const s = d > 0 ? '+' : d < 0 ? '−' : '', a = Math.abs(d);
  switch (ind.un) {
    case 'R$': return s + 'R$ ' + num(a);
    case 'idx': return s + num(a, 3);
    case 'bf': case 'mil': return s + num(a, 1);
    case 'leitos': return s + num(a, 2);
    case 'hab': return s + num(a);
    default: return s + num(a, ind.d ?? 1) + ' p.p.';
  }
}

// ---------- Cálculo (sem DOM: testável no Node) ----------
export function calcularPerfil(R, MUN, C) {
  const ufReg = {};
  for (const [reg, ufs] of Object.entries(R.regioes)) for (const u of ufs) ufReg[u] = reg;
  const col = Object.fromEntries(C.colunas.map((c, i) => [c, i]));
  const muns = MUN.filter(m => m[0] && m[1] !== 'ZZ').map(m => {
    const ctx = C.dados[String(m[0])] || [];
    const v = k => { const x = ctx[col[k]]; return x == null || !Number.isFinite(x) ? null : x; };
    return { ibge: m[0], uf: m[1], nome: m[2], aptos: m[6], comp: m[7], biom: m[8], a: m[9], b: m[10], br: m[11], nu: m[12], pop: v('pop2022') ?? v('popEstimada') ?? 0, v };
  });
  const val = (ind, m) => ind.bu ? ind.bu(m) : m.v(ind.k);
  const PESOS = { a: m => m.a, b: m => m.b, vot: m => m.comp, pop: m => m.pop };
  const totais = Object.fromEntries(Object.entries(PESOS).map(([k, f]) => [k, muns.reduce((s, m) => s + f(m), 0)]));

  function mediaPonderada(ind, peso) {
    let sw = 0, swx = 0;
    for (const m of muns) { const x = val(ind, m), w = peso(m); if (x == null || !w) continue; sw += w; swx += w * x; }
    return { valor: sw ? swx / sw : null, cobertura: sw };
  }
  function medianaPonderada(ind, peso) {
    const l = muns.map(m => [val(ind, m), peso(m)]).filter(([x, w]) => x != null && w > 0).sort((p, q) => p[0] - q[0]);
    const tot = l.reduce((s, [, w]) => s + w, 0);
    let acc = 0;
    for (const [x, w] of l) { acc += w; if (acc >= tot / 2) return { valor: x, cobertura: tot }; }
    return { valor: null, cobertura: 0 };
  }
  const indicadores = INDICADORES.map(ind => {
    const f = ind.mediana ? medianaPonderada : mediaPonderada;
    const r = Object.fromEntries(Object.entries(PESOS).map(([k, p]) => [k, f(ind, p)]));
    const A = r.a.valor, B = r.b.valor, V = r.vot.valor;
    return {
      ...ind, A, B, V, P: r.pop.valor, dif: A != null && B != null ? A - B : null,
      relativa: A != null && B != null && V ? (A - B) / Math.abs(V) : null,
      cobertura: totais.vot ? r.vot.cobertura / totais.vot : 0
    };
  });

  // Distribuições: em que tipo de lugar estão os votos de cada um.
  function quintis(k) {
    const l = muns.filter(m => m.v(k) != null && m.pop > 0).sort((p, q) => p.v(k) - q.v(k));
    const tot = l.reduce((s, m) => s + m.pop, 0), q = new Map(), faixas = [0, 1, 2, 3, 4].map(() => ({ min: Infinity, max: -Infinity }));
    let acc = 0;
    for (const m of l) { const i = Math.min(4, Math.floor(5 * (acc + m.pop / 2) / tot)); q.set(m.ibge, i); acc += m.pop; faixas[i].min = Math.min(faixas[i].min, m.v(k)); faixas[i].max = Math.max(faixas[i].max, m.v(k)); }
    return { de: m => q.get(m.ibge), faixas };
  }
  function distribuicao(nome, cats, chave, nota = '') {
    const s = cats.map(c => ({ ...c, a: 0, b: 0, vot: 0, pop: 0 }));
    let fora = 0;
    for (const m of muns) { const i = chave(m); if (i == null || !s[i]) { fora += m.comp; continue; } s[i].a += m.a; s[i].b += m.b; s[i].vot += m.comp; s[i].pop += m.pop; }
    const t = { a: s.reduce((x, c) => x + c.a, 0), b: s.reduce((x, c) => x + c.b, 0), vot: s.reduce((x, c) => x + c.vot, 0), pop: s.reduce((x, c) => x + c.pop, 0) };
    return { nome, nota, fora: totais.vot ? fora / totais.vot : 0, cats: s.map(c => ({ ...c, shA: c.a / t.a, shB: c.b / t.b, shVot: c.vot / t.vot, shPop: c.pop / t.pop, pctA: c.a + c.b ? c.a / (c.a + c.b) : null })) };
  }
  const regs = ['N', 'NE', 'CO', 'SE', 'S'];
  const PORTES = [[0, 20e3, 'até 20 mil hab.'], [20e3, 100e3, '20 a 100 mil'], [100e3, 500e3, '100 a 500 mil'], [500e3, Infinity, 'mais de 500 mil']];
  const qR = quintis('rendaPcMedia'), qBF = quintis('bfPctDomicilios'), q60 = quintis('pct60mais');
  const rotQ = (fx, f) => fx.faixas.map((x, i) => ({ nome: `${i + 1}º quinto`, faixa: Number.isFinite(x.min) ? `${f(x.min)} a ${f(x.max)}` : '' }));
  const distribuicoes = [
    distribuicao('Região', regs.map(r => ({ nome: REGIAO_NOME[r] })), m => regs.indexOf(ufReg[m.uf])),
    distribuicao('Tamanho do município', PORTES.map(p => ({ nome: p[2] })), m => m.pop ? PORTES.findIndex(p => m.pop >= p[0] && m.pop < p[1]) : null),
    distribuicao('Renda por pessoa do município (quintos da população)', rotQ(qR, x => 'R$ ' + num(x)), qR.de, 'Cada quinto reúne 20% dos habitantes do país: o 1º são os que moram nos municípios de menor renda média, o 5º nos de maior.'),
    distribuicao('Bolsa Família no município (quintos da população)', rotQ(qBF, x => num(x, 1)), qBF.de, 'Do 1º quinto (municípios com menos famílias no programa por 100 domicílios) ao 5º (com mais).'),
    distribuicao('Moradores com 60+ no município (quintos da população)', rotQ(q60, x => num(x, 1) + '%'), q60.de, 'Do 1º quinto (municípios mais jovens) ao 5º (mais envelhecidos).')
  ];
  return { indicadores, distribuicoes, totais, municipios: muns.length };
}

// ---------- Texto "O que os números dizem" (regras simétricas para os dois) ----------
function textos(P, nA, nB) {
  const L = [];
  const T = P.totais;
  L.push(`Foram usados ${nf(P.municipios)} municípios, com ${nf(T.a)} votos para ${esc(nA)} (13) e ${nf(T.b)} para ${esc(nB)} (22). Cada média abaixo descreve o <b>município típico onde está um voto</b> de cada candidato: municípios com mais votos pesam mais.`);
  const ord = P.indicadores.filter(i => i.relativa != null && !i.bu).sort((x, y) => Math.abs(y.relativa) - Math.abs(x.relativa));
  for (const i of ord.slice(0, 5)) {
    const maior = i.A > i.B ? '13' : '22', rel = Math.abs(i.relativa * 100);
    L.push(`<b>${esc(i.nome)}:</b> ${fmt(i, i.A)} onde vota o 13 e ${fmt(i, i.B)} onde vota o 22 (diferença de ${fmtDif(i, i.dif)}, ${num(rel, 0)}% da média geral). O voto do ${maior} está mais concentrado onde esse número é maior.`);
  }
  const parecidos = P.indicadores.filter(i => i.relativa != null && !i.bu && Math.abs(i.relativa) < 0.03).map(i => i.nome.toLowerCase());
  if (parecidos.length) L.push(`Em ${parecidos.length === 1 ? 'um indicador' : parecidos.length + ' indicadores'} os dois perfis ficam a menos de 3% um do outro: ${esc(parecidos.join(', '))}.`);
  const reg = P.distribuicoes[0].cats, top = k => reg.slice().sort((x, y) => y[k] - x[k])[0];
  L.push(`<b>Região:</b> a maior fatia dos votos do 13 veio do ${esc(top('shA').nome)} (${pct(top('shA').shA, 1)}) e a maior fatia dos do 22, do ${esc(top('shB').nome)} (${pct(top('shB').shB, 1)}).`);
  for (const d of P.distribuicoes.slice(2)) {
    const c = d.cats, p = c[0], u = c[c.length - 1];
    L.push(`<b>${esc(d.nome.split(' (')[0])}:</b> no 1º quinto da população, o 13 teve ${pct(p.pctA, 1)} dos válidos (o 22, ${pct(1 - p.pctA, 1)}); no 5º quinto, ${pct(u.pctA, 1)} (o 22, ${pct(1 - u.pctA, 1)}).`);
  }
  return L;
}

// ---------- Desenho ----------
const ICONE = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;

function regua(i, nA, nB) {
  const vals = [i.A, i.B, i.V, i.P].filter(x => x != null && Number.isFinite(x));
  if (!vals.length) return '';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.05 || 1;
  lo -= pad; hi += pad;
  const pos = x => x == null ? null : (100 * (x - lo) / (hi - lo)).toFixed(1);
  const pa = pos(i.A), pb = pos(i.B);
  return `<div class="cand-regua" tabindex="0" aria-label="${esc(i.nome)}: 13 ${esc(fmt(i, i.A))}, 22 ${esc(fmt(i, i.B))}">
    <span class="cand-trilho"></span>
    <span class="cand-liga" style="--de:${Math.min(pa, pb)}%;--ate:${Math.max(pa, pb)}%"></span>
    ${i.P != null ? `<span class="cand-pop" style="--x:${pos(i.P)}%" title="População: ${esc(fmt(i, i.P))}"></span>` : ''}
    ${i.V != null ? `<span class="cand-vot" style="--x:${pos(i.V)}%" title="Todos os votantes: ${esc(fmt(i, i.V))}"></span>` : ''}
    <span class="cand-ponto a" style="--x:${pa}%"></span><span class="cand-ponto b" style="--x:${pb}%"></span>
    <span class="cand-dica"><b>${esc(i.nome)}</b><br><i class="d a"></i>${esc(nA)} (13): <b>${esc(fmt(i, i.A))}</b><br><i class="d b"></i>${esc(nB)} (22): <b>${esc(fmt(i, i.B))}</b><br><i class="d v"></i>Todos os votantes: ${esc(fmt(i, i.V))}<br><i class="d p"></i>População: ${esc(fmt(i, i.P))}<br><span class="muted">Dado disponível para ${pct(i.cobertura, 1, 1)} dos votantes</span></span>
  </div>`;
}

function barraEmpilhada(rotulo, cats, campo, cores) {
  return `<div class="cand-pilha"><span class="cand-pilha-rot">${rotulo}</span><div class="cand-pilha-barra">${cats.map((c, k) => {
    const v = c[campo];
    return `<span style="--w:${(100 * v).toFixed(2)}%;background:${cores[k]}" title="${esc(c.nome)}${c.faixa ? ' (' + esc(c.faixa) + ')' : ''}: ${pct(v, 1, 1)}">${v >= 0.08 ? pct(v, 1, 0) : ''}</span>`;
  }).join('')}</div></div>`;
}

function blocoDistribuicao(d, nA, nB) {
  const ordinal = !d.nome.startsWith('Região');
  const cores = d.cats.map((_, k) => ordinal ? `var(--cand-q${Math.round(1 + k * 4 / Math.max(1, d.cats.length - 1))})` : `var(--cand-cat${k + 1})`);
  return `<section class="bloco cand-dist"><h3>${ICONE('comparar')}${esc(d.nome)}</h3>
    ${d.nota ? `<p class="muted small">${esc(d.nota)}</p>` : ''}
    <div class="cand-leg">${d.cats.map((c, k) => `<span><i style="background:${cores[k]}"></i>${esc(c.nome)}${c.faixa ? ` <small class="muted">${esc(c.faixa)}</small>` : ''}</span>`).join('')}</div>
    ${barraEmpilhada(`Votos do 13 <small>${esc(nA)}</small>`, d.cats, 'shA', cores)}
    ${barraEmpilhada(`Votos do 22 <small>${esc(nB)}</small>`, d.cats, 'shB', cores)}
    ${barraEmpilhada('Todos os votantes', d.cats, 'shVot', cores)}
    ${barraEmpilhada('População', d.cats, 'shPop', cores)}
    <div class="tabela-rolagem"><table><thead><tr><th>Faixa</th><th class="num">% do 13 nos válidos</th><th class="num">% do 22 nos válidos</th><th class="num">Parte dos votantes</th></tr></thead><tbody>
      ${d.cats.map(c => `<tr><td>${esc(c.nome)}${c.faixa ? ` <small class="muted">${esc(c.faixa)}</small>` : ''}</td><td class="num"><span class="cand-mini a" style="--w:${(100 * (c.pctA ?? 0)).toFixed(1)}%"></span>${pct(c.pctA, 1, 1)}</td><td class="num">${c.pctA == null ? '—' : pct(1 - c.pctA, 1, 1)}</td><td class="num">${pct(c.shVot, 1, 1)}</td></tr>`).join('')}
    </tbody></table></div>
    ${d.fora > 0.0005 ? `<p class="fonte">Sem dado para ${pct(d.fora, 1, 2)} dos votantes (fora das barras).</p>` : ''}
  </section>`;
}

function listaFontes(C, R) {
  const usados = new Set(['pop2022', 'popEstimada', ...INDICADORES.filter(i => !i.bu).map(i => i.k)]);
  if (usados.has('bfPctDomicilios')) usados.add('bfFamilias');
  const vistos = new Map();
  for (const k of usados) {
    const f = C.fontes[k];
    if (!f) continue;
    const chave = f.nome + '|' + f.url;
    if (!vistos.has(chave)) vistos.set(chave, { ...f, campos: [] });
    vistos.get(chave).campos.push(k);
  }
  const link = u => /xxxxxx/.test(u) ? u.replace(/\/resultados\/x+$/, '') : u;
  return `<ul class="cand-fontes">
    <li><b>Votos, comparecimento, brancos, nulos e biometria:</b> <a href="${esc(R.meta.fonte)}" target="_blank" rel="noopener">TSE · Boletins de urna, 2º turno 2026</a> (somados por município).</li>
    ${[...vistos.values()].map(f => `<li><a href="${esc(link(f.url))}" target="_blank" rel="noopener">${esc(f.nome)}</a> · ${esc(String(f.ano))}${f.unidade ? ' · ' + esc(f.unidade) : ''}</li>`).join('')}
    <li>Ligação entre os códigos de município do TSE e do IBGE: <a href="https://github.com/betafcc/Municipios-Brasileiros-TSE" target="_blank" rel="noopener">betafcc/Municipios-Brasileiros-TSE</a>. Detalhes e tabelas em <a href="https://github.com/UPraggy/ApuracaoTSE2026/blob/main/docs/CONTEXTO-DADOS.md" target="_blank" rel="noopener">docs/CONTEXTO-DADOS.md</a>.</li>
  </ul>`;
}

export async function iniciarCandidatos(R, { NOME_A, NOME_B }) {
  const el = document.getElementById('aba-candidatos');
  if (!el) return;
  el.innerHTML = '<div class="esqueleto" aria-label="Carregando"><i></i><i></i><i></i><i></i><i></i></div>';
  let MUN, C;
  try { [MUN, C] = await Promise.all([carregar('municipios.json'), carregar('contexto-municipios.json')]); }
  catch (e) { el.innerHTML = `<p class="erro">Não consegui carregar os dados: ${esc(e.message)}</p>`; return; }
  const nA = NOME_A || titulo(R.candidatos[0].nome), nB = NOME_B || titulo(R.candidatos[1].nome);
  const P = calcularPerfil(R, MUN, C);
  const I = Object.fromEntries(P.indicadores.map(i => [i.k, i]));
  const destaque = ['rendaPcMedia', 'bfPctDomicilios', 'pct60mais', 'eleitPctSuperior'].map(k => I[k]).filter(Boolean);
  const grupos = [...new Set(P.indicadores.map(i => i.grupo))];

  el.innerHTML = `
    <h2>Candidatos: onde está o voto de cada um</h2>
    <p class="lead">Como são, em média, os <b>municípios</b> onde cada candidato recebeu seus votos: renda, programas sociais, saneamento, saúde, idade e escolaridade. Os dois recebem exatamente o mesmo cálculo, na ordem do número na urna.</p>
    <div class="cand-aviso" role="note">${ICONE('alerta')}<div><b>Leia antes:</b> o voto é secreto e o boletim só traz o total de cada urna. Por isso estes números descrevem os <b>lugares</b> onde cada candidato teve votos, <b>não as pessoas</b>: num município de renda alta também há eleitores de baixa renda, e vice-versa. Isso tem nome, <i>falácia ecológica</i>. As fontes têm anos diferentes (Censo 2022, PIB 2023, IDHM 2010, Bolsa Família e BPC de set/2026). E é <b>associação, não causa</b>: os números não dizem por que alguém votou em quem votou.</div></div>
    <div class="cand-cabeca">
      <div class="cand-card a"><span class="cand-num">13</span><div><b>${esc(nA)}</b><br><span class="muted">${nf(P.totais.a)} votos · ${pct(P.totais.a, P.totais.a + P.totais.b, 2)} dos válidos</span></div></div>
      <div class="cand-card b"><span class="cand-num">22</span><div><b>${esc(nB)}</b><br><span class="muted">${nf(P.totais.b)} votos · ${pct(P.totais.b, P.totais.a + P.totais.b, 2)} dos válidos</span></div></div>
    </div>
    <div class="cards cand-destaques">${destaque.map(i => `<div class="card"><span class="rot">${esc(i.nome)}</span><span class="cand-par"><span><i class="d a"></i><b>${esc(fmt(i, i.A))}</b> <small>13</small></span><span><i class="d b"></i><b>${esc(fmt(i, i.B))}</b> <small>22</small></span></span><span class="rot muted">média de todos os votantes: ${esc(fmt(i, i.V))}</span></div>`).join('')}</div>
    <section class="bloco"><h3>${ICONE('chat')}O que os números dizem</h3>
      <div class="cand-bot">${textos(P, nA, nB).map((t, k) => `<div class="bolha painel" style="--k:${k}">${t}</div>`).join('')}</div>
      <p class="fonte">Texto gerado automaticamente por regras fixas a partir dos números desta página: os mesmos cálculos e as mesmas frases para os dois candidatos.</p>
    </section>
    <section class="bloco"><h3>${ICONE('analise')}Perfil médio, indicador por indicador</h3>
      <div class="cand-leg-regua"><span><i class="d a"></i>Município típico do voto do 13</span><span><i class="d b"></i>do voto do 22</span><span><i class="d v"></i>de todos os votantes</span><span><i class="d p"></i>da população</span></div>
      <p class="muted small">Passe o mouse ou toque numa régua para ver os valores. Cada régua tem a própria escala, para a diferença aparecer.</p>
      ${grupos.map(g => `<h4 class="sub">${esc(g)}</h4><div class="tabela-rolagem cand-tab"><table><thead><tr><th>Indicador</th><th class="cand-col-regua">Comparação</th><th class="num">13</th><th class="num">22</th><th class="num">Votantes</th><th class="num">População</th><th class="num">Diferença (13 − 22)</th></tr></thead><tbody>
        ${P.indicadores.filter(i => i.grupo === g).map(i => `<tr><td>${esc(i.nome)}${i.cobertura < 0.99 ? ` <small class="muted" title="Parte dos votantes cujo município tem este dado">(${pct(i.cobertura, 1, 0)} com dado)</small>` : ''}</td><td class="cand-col-regua">${regua(i, nA, nB)}</td><td class="num">${esc(fmt(i, i.A))}</td><td class="num">${esc(fmt(i, i.B))}</td><td class="num">${esc(fmt(i, i.V))}</td><td class="num">${esc(fmt(i, i.P))}</td><td class="num">${esc(fmtDif(i, i.dif))}</td></tr>`).join('')}
      </tbody></table></div>`).join('')}
    </section>
    <h3 class="cand-sec">Em que tipo de lugar estão os votos</h3>
    <p class="muted small">Cada barra soma 100%. Compare a barra de cada candidato com a de todos os votantes: onde ela é mais larga, o voto daquele candidato está mais concentrado naquele tipo de lugar.</p>
    ${P.distribuicoes.map(d => blocoDistribuicao(d, nA, nB)).join('')}
    <section class="bloco"><h3>${ICONE('livro')}Como calculamos</h3>
      <ul class="cand-metodo">
        <li><b>Média do eleitor do 13</b> = soma, em todos os municípios, de (votos do 13 no município × indicador do município) ÷ total de votos do 13. O mesmo vale para o 22. Município com mais votos pesa mais, então um voto em São Paulo e um voto num município pequeno contam igual.</li>
        <li><b>Todos os votantes</b>: o peso é o comparecimento. <b>População</b>: o peso é o número de habitantes do Censo 2022 (estimativa 2026 onde o Censo não tem dado). Essas duas colunas mostram onde está o "meio" do país, para comparar.</li>
        <li><b>Densidade</b>: mediana ponderada, porque a média seria puxada por poucas capitais muito densas.</li>
        <li><b>Quintos da população</b>: os municípios são ordenados pelo indicador e cortados de forma que cada quinto reúna 20% dos habitantes do país.</li>
        <li>Municípios sem o dado ficam fora daquela média; a tabela mostra quando isso passa de 1% dos votantes. O exterior não entra, porque não tem dados do IBGE.</li>
      </ul>
    </section>
    <section class="bloco"><h3>${ICONE('livro')}Fontes</h3>${listaFontes(C, R)}</section>`;

  // Animação: os pontos saem do meio da régua e vão para o valor (CSS faz a transição).
  // Só anima quando a aba aparece (com a aba escondida a transição não acontece).
  const ligar = () => requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('cand-pronto')));
  if ('IntersectionObserver' in window) { const o = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { o.disconnect(); ligar(); } }); o.observe(el); } else ligar();
}
