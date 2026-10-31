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
  { grupo: 'Segurança', k: 'homicidiosPor100k', nome: 'Homicídios (por 100 mil hab., 2022–2024)', un: 'hom' },
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
    case 'hom': return num(x, 1) + ' por 100 mil';
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
    case 'hom': return s + num(a, 1);
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
  // Quintos extras só para o texto "onde tem mais X, a maior parte votou em Y".
  const EXTRA = [['pibPerCapita', 'PIB por habitante'], ['pctEsgotoRede', 'esgoto ligado à rede'], ['pctDomInternet', 'internet em casa'], ['eleitPctSuperior', 'eleitores com superior completo'], ['alfabetizacao15', 'alfabetização'], ['apsCobertura', 'cobertura da atenção básica'], ['homicidiosPor100k', 'homicídios por habitante']];
  const quintosTexto = [
    { tema: 'renda por pessoa', d: distribuicoes[2] }, { tema: 'famílias no Bolsa Família', d: distribuicoes[3] }, { tema: 'moradores com 60 anos ou mais', d: distribuicoes[4] },
    ...EXTRA.map(([k, tema]) => { const q = quintis(k); return { tema, d: distribuicao(tema, q.faixas.map((_, i) => ({ nome: `${i + 1}º quinto` })), q.de) }; })
  ];
  return { indicadores, distribuicoes, quintosTexto, totais, municipios: muns.length };
}

// ---------- Texto "O que os números dizem" (regras simétricas para os dois) ----------
// Perto de 50%, uma casa decimal engana ("50,0%"): mostra duas.
const pctL = x => pct(x, 1, Math.abs(x - 0.5) < 0.005 ? 2 : 1);
const minusc = t => /^[A-ZÀ-Ú]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
function textos(P, nA, nB) {
  const L = [], T = P.totais, nome = k => k === 'a' ? `${esc(nA)} (13)` : `${esc(nB)} (22)`;
  const lider = c => c.pctA >= 0.5 ? ['a', c.pctA] : ['b', 1 - c.pctA];
  L.push(`Foram somados os votos de ${nf(P.municipios)} municípios: ${nf(T.a)} para ${nome('a')} e ${nf(T.b)} para ${nome('b')}. As frases abaixo dizem, para cada tipo de lugar, quem teve a maior parte dos votos.`);
  // Regiões
  const reg = P.distribuicoes[0].cats.map(c => ({ nome: c.nome, l: lider(c) }));
  L.push(`<b>Por região:</b> ${reg.map(r => `no ${esc(r.nome)}, a maior parte votou em ${nome(r.l[0])} (${pctL(r.l[1])})`).join('; ')}.`);
  // Porte
  const por = P.distribuicoes[1].cats.map(c => ({ nome: c.nome, l: lider(c) }));
  L.push(`<b>Por tamanho da cidade:</b> ${por.map(r => `nos municípios de ${esc(r.nome)}, maioria de ${nome(r.l[0])} (${pctL(r.l[1])})`).join('; ')}.`);
  // Quintos: onde tem mais X / menos X
  for (const { tema, d } of P.quintosTexto) {
    const c = d.cats, menos = c[0], mais = c[c.length - 1];
    if (menos.pctA == null || mais.pctA == null) continue;
    const lm = lider(mais), ln = lider(menos);
    L.push(`<b>${esc(tema[0].toUpperCase() + tema.slice(1))}:</b> onde há <b>mais</b> ${esc(tema)} (o quinto da população no topo), a maior parte votou em ${nome(lm[0])} (${pctL(lm[1])}); onde há <b>menos</b>, a maior parte votou em ${nome(ln[0])} (${pctL(ln[1])}).`);
  }
  return L;
}

// Conclusão de cada candidato, montada pelas mesmas regras para os dois.
function conclusoes(P, nA, nB) {
  const T = P.totais, val = T.a + T.b;
  const um = (k, nomeC, num) => {
    const sh = c => k === 'a' ? c.pctA : 1 - c.pctA, share = c => k === 'a' ? c.shA : c.shB;
    const reg = P.distribuicoes[0].cats, venceu = reg.filter(c => sh(c) >= 0.5).map(c => `${c.nome} (${pctL(sh(c))})`);
    const maiorFatia = reg.slice().sort((x, y) => share(y) - share(x))[0];
    const por = P.distribuicoes[1].cats.filter(c => sh(c) >= 0.5).map(c => c.nome.startsWith('até') ? c.nome : 'de ' + c.nome);
    const lugares = P.quintosTexto.map(({ tema, d }) => { const c = d.cats, mais = c[c.length - 1], menos = c[0]; if (mais.pctA == null) return null; return sh(mais) >= 0.5 && sh(menos) < 0.5 ? `mais ${tema}` : sh(menos) >= 0.5 && sh(mais) < 0.5 ? `menos ${tema}` : null; }).filter(Boolean);
    const perfil = P.indicadores.filter(i => i.relativa != null && !i.bu && i.V).map(i => ({ i, d: ((k === 'a' ? i.A : i.B) - i.V) / Math.abs(i.V) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 4)
      .map(({ i, d }) => `${esc(minusc(i.nome))} ${d > 0 ? 'acima' : 'abaixo'} da média (${esc(fmt(i, k === 'a' ? i.A : i.B))} contra ${esc(fmt(i, i.V))})`);
    return `<div class="cand-concl ${k}"><div class="cand-concl-topo"><span class="cand-num">${num}</span><b>${esc(nomeC)}</b></div>
      <p><b>${pct(k === 'a' ? T.a : T.b, val, 2)}</b> dos válidos (${nf(k === 'a' ? T.a : T.b)} votos, sem o exterior).</p>
      <ul>
        <li><b>Onde teve a maioria:</b> ${venceu.length ? esc(venceu.join(', ')) : 'nenhuma região'}. A maior fatia dos seus votos veio do ${esc(maiorFatia.nome)} (${pct(share(maiorFatia), 1)} do total dele).</li>
        <li><b>Tamanho das cidades:</b> maioria nos municípios ${por.length ? esc(por.join(', ')) : 'de nenhum porte'}.</li>
        <li><b>Tipo de lugar:</b> ${lugares.length ? 'venceu onde há ' + esc(lugares.join(', ')) : 'não houve inversão clara entre os extremos'}.</li>
        <li><b>Perfil médio dos municípios de onde vieram seus votos:</b> ${perfil.join('; ')}.</li>
      </ul></div>`;
  };
  return um('a', nA, '13') + um('b', nB, '22');
}

// ---------- Desenho ----------
const ICONE = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;

// Régua COMUM a todos os indicadores: o centro é a média da população (ou dos votantes) e a posição é a
// diferença relativa a ela, em %, de −D% a +D%. Assim uma diferença pequena parece pequena em qualquer linha.
const refDe = i => (i.P != null && Number.isFinite(i.P) && i.P !== 0) ? i.P : i.V;
const desvio = (i, x) => { const r = refDe(i); return x == null || !Number.isFinite(x) || !r ? null : 100 * (x - r) / Math.abs(r); };
function escalaComum(indicadores) {
  const m = Math.max(5, ...indicadores.flatMap(i => [desvio(i, i.A), desvio(i, i.B), desvio(i, i.V)]).filter(Number.isFinite).map(Math.abs));
  return Math.ceil(m / 5) * 5; // múltiplo de 5%
}
// Duas barras simples por indicador, começando no zero: vermelha = 13, azul = 22. Comprimento proporcional ao valor.
function regua(i, nA, nB) {
  const vals = [i.A, i.B].filter(x => x != null && Number.isFinite(x));
  if (!vals.length) return '';
  const max = Math.max(...vals.map(Math.abs)) || 1;
  const w = x => x == null ? 0 : (100 * Math.abs(x) / max).toFixed(1);
  return `<div class="cand-barras" title="${esc(i.nome)} · ${esc(nA)} (13): ${esc(fmt(i, i.A))} · ${esc(nB)} (22): ${esc(fmt(i, i.B))} · todos os votantes: ${esc(fmt(i, i.V))}">
    <span class="cb a" style="--w:${w(i.A)}%"></span>
    <span class="cb b" style="--w:${w(i.B)}%"></span>
  </div>`;
}

const fmtDesvio = d => d == null ? '—' : (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1).replace('.', ',') + '%';
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
    <div class="cand-aviso" role="note">${ICONE('alerta')}<div><b>Como ler:</b> os números são somados <b>por município</b>. Mostram em que tipo de lugar cada candidato teve a maior parte dos votos. As fontes têm anos diferentes (Censo 2022, PIB 2023, IDHM 2010, Bolsa Família e BPC de set/2026).</div></div>
    <section class="bloco"><h3>${ICONE('analise')}Perfil médio, indicador por indicador</h3>
      <div class="cand-leg-regua"><span><i class="d a"></i>Municípios do voto do 13</span><span><i class="d b"></i>Municípios do voto do 22</span></div>
      <p class="muted small">Em cada linha, a barra maior é o valor mais alto. As colunas à direita trazem os números, incluindo a média de todos os votantes e da população.</p>
      ${grupos.map(g => `<h4 class="sub">${esc(g)}</h4><div class="tabela-rolagem cand-tab"><table><thead><tr><th>Indicador</th><th class="cand-col-regua">Comparação</th><th class="num">13</th><th class="num">22</th><th class="num">Votantes</th><th class="num">População</th><th class="num">Diferença (13 − 22)</th></tr></thead><tbody>
        ${P.indicadores.filter(i => i.grupo === g).map(i => `<tr><td>${esc(i.nome)}${i.cobertura < 0.99 ? ` <small class="muted" title="Parte dos votantes cujo município tem este dado">(${pct(i.cobertura, 1, 0)} com dado)</small>` : ''}</td><td class="cand-col-regua">${regua(i, nA, nB)}</td><td class="num">${esc(fmt(i, i.A))}</td><td class="num">${esc(fmt(i, i.B))}</td><td class="num">${esc(fmt(i, i.V))}</td><td class="num">${esc(fmt(i, i.P))}</td><td class="num">${esc(fmtDif(i, i.dif))}</td></tr>`).join('')}
      </tbody></table></div>`).join('')}
    </section>
    <section class="bloco cand-concl-bloco"><h3>${ICONE('analise')}Conclusão: o voto de cada candidato, pelos dados</h3>
      <div class="cand-concls">${conclusoes(P, nA, nB)}</div>
      <p class="fonte">Gerado pelas mesmas regras para os dois, a partir das tabelas desta página. "Onde teve a maioria" = mais da metade dos votos válidos daquele grupo de municípios.</p>
    </section>
    <div class="cards cand-destaques">${destaque.map(i => `<div class="card"><span class="rot">${esc(i.nome)}</span><span class="cand-par"><span><i class="d a"></i><b>${esc(fmt(i, i.A))}</b> <small>13</small></span><span><i class="d b"></i><b>${esc(fmt(i, i.B))}</b> <small>22</small></span></span><span class="rot muted">média de todos os votantes: ${esc(fmt(i, i.V))}</span></div>`).join('')}</div>
    <section class="bloco"><h3>${ICONE('chat')}O que os números dizem</h3>
      <div class="cand-bot">${textos(P, nA, nB).map((t, k) => `<div class="bolha painel" style="--k:${k}">${t}</div>`).join('')}</div>
      <p class="fonte">Texto gerado automaticamente por regras fixas a partir dos números desta página: os mesmos cálculos e as mesmas frases para os dois candidatos.</p>
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
