// Brasil × mundo: posição do Brasil entre os países em indicadores oficiais internacionais.
// export blocoMundo(alvo, opcoes) desenha cartões em qualquer elemento (abas Governos e Candidatos);
// export iniciarMundo(R) desenha a aba completa em #aba-mundo (filtros, resumo, cartões).
// Dados: site/dados/mundo.json (scripts/mundo.mjs). Regras de posição/percentil/mandatos: mundo-calc.js.
import { carregar, esc, corCss } from './util.js?v=29dda3fef3';
import { linhaInterativa } from './grafico.js?v=3a1d878e2d';
import * as C from './mundo-calc.js?v=93eef4e284';

let promessa = null;
export const dadosMundo = () => (promessa ??= carregar('mundo.json').then(C.preparar));

export const VISOES = [
  ['ranking', 'Ranking: primeiros + vizinhos do Brasil'],
  ['pares', 'Grupo de 13 pares'],
  ['regiao', 'América Latina e Caribe'],
  ['todos', 'Todos os países'],
];
const ANO_SERIE0 = 1994; // ano anterior ao 1º mandato da tabela (FHC 1)

// ---------- formatação ----------
const fmtCache = new Map();
const fmtN = casas => { if (!fmtCache.has(casas)) fmtCache.set(casas, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })); return fmtCache.get(casas); };
export const fmtV = (ind, v) => (v == null || !Number.isFinite(v) ? '—' : fmtN(ind.casas).format(v) + (ind.unidade.startsWith('%') ? '%' : ''));
const fmtDelta = (ind, d) => (d == null ? '—' : (d > 0 ? '+' : d < 0 ? '−' : '') + fmtN(ind.casas).format(Math.abs(d)) + (ind.unidade.startsWith('%') ? ' p.p.' : ''));
const unidadeTxt = ind => (ind.unidade.startsWith('%') ? ind.unidade.replace(/^%\s*/, '% ') : ind.unidade);
const nomePais = (D, iso) => D.paises[iso]?.[0] ?? iso;
const sentidoTxt = ind => (ind.sentido > 0 ? 'Maior é melhor' : 'Menor é melhor');
const ord = n => n + 'º';

// ---------- texto por regras (neutro) ----------
function texto(D, ind, p, ano) {
  const partes = [];
  const emp = p.lista.filter(x => x.pos === p.pos).length - 1;
  partes.push(`Em ${p.anoDado}, o Brasil ficou em <b>${ord(p.pos)} lugar entre ${p.n}</b> países e economias com dado${emp > 0 ? ` (empatado com ${emp})` : ''}, com valor melhor que o de ${p.percentil}% dos demais (${sentidoTxt(ind).toLowerCase()}).`);
  const m = C.mediaMundial(ind, ano);
  if (m) {
    const rel = p.v === m.v ? 'igual à' : C.melhor(ind, p.v, m.v) ? 'melhor que a' : 'pior que a';
    partes.push(`O valor do Brasil (${fmtV(ind, p.v)}) é ${rel} média mundial (${fmtV(ind, m.v)}${m.ano !== p.anoDado ? `, de ${m.ano}` : ''}) e ${p.v === p.mediana ? 'igual à' : C.melhor(ind, p.v, p.mediana) ? 'melhor que a' : 'pior que a'} mediana dos países (${fmtV(ind, p.mediana)}).`);
  }
  const h = C.historicoPosicao(D, ind).filter(x => x.ano >= ANO_SERIE0 && x.ano < p.anoDado);
  if (h.length) {
    const h0 = h[0];
    partes.push(`Em ${h0.ano}, era ${ord(h0.pos)} de ${h0.n} (melhor que ${h0.percentil}% dos demais).`);
  }
  return partes.join(' ');
}

// ---------- lista com barras ----------
function listaHTML(D, ind, L, visao) {
  if (!L.length) return '<p class="muted small">Sem dados neste ano.</p>';
  const vs = L.map(x => x.v), lo = Math.min(0, ...vs), hi = Math.max(...vs), larg = v => (hi > lo ? (100 * (v - lo)) / (hi - lo) : 0);
  const linha = x => x == null
    ? '<li class="mu-gap" aria-hidden="true"><span></span><span>…</span></li>'
    : `<li class="mu-l${x.iso === 'BRA' ? ' br' : ''}"><span class="mu-l-pos">${ord(x.pos)}</span><span class="mu-l-nome">${esc(nomePais(D, x.iso))}${x.ano !== L.anoRef ? ` <small>(${x.ano})</small>` : ''}</span><span class="mu-l-barra"><i style="width:${larg(x.v).toFixed(1)}%"></i></span><span class="mu-l-v">${fmtV(ind, x.v)}</span></li>`;
  let itens, extra = '';
  if (visao === 'pares') {
    const alvo = new Set([...D.pares, 'BRA']);
    itens = L.filter(x => alvo.has(x.iso));
    const sem = D.pares.filter(i => !itens.some(x => x.iso === i));
    if (sem.length) extra = `<p class="muted small">Sem dado no período: ${sem.map(i => esc(nomePais(D, i))).join(', ')}.</p>`;
  } else if (visao === 'regiao') itens = L.filter(x => D.paises[x.iso]?.[1] === C.REGIAO_AL);
  else if (visao === 'todos') itens = L;
  else itens = C.topoEVizinhos(L);
  const posTxt = visao === 'ranking' ? 'Primeiros colocados e os 4 países logo acima e logo abaixo do Brasil' : visao === 'pares' ? 'Grupo fixo de pares (o mesmo em todos os indicadores); posição = lugar no mundo' : visao === 'regiao' ? 'América Latina e Caribe (classificação do Banco Mundial); posição = lugar no mundo' : `Todos os ${L.length} países com dado`;
  return `<p class="mu-lista-tit small muted">${posTxt}. Barra = valor (${esc(unidadeTxt(ind))}).</p><ol class="mu-lista${visao === 'todos' ? ' longa' : ''}">${itens.map(linha).join('')}</ol>${extra}`;
}

// ---------- gráficos (lazy, dentro de <details>) ----------
const L_SVG = 640, M = { t: 14, r: 14, b: 34, l: 52 }; // mesmas medidas de grafico.js
function faixasMandato(D, alvo, xmin, xmax) {
  const svg = alvo.querySelector('svg.grafico'); if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg', w = L_SVG - M.l - M.r, H = 270, h = H - M.t - M.b;
  const X = x => M.l + (w * (x - xmin)) / (xmax - xmin);
  const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'mu-faixas'); g.setAttribute('aria-hidden', 'true');
  D.mandatos.forEach((m, i) => {
    const a = Math.max(xmin, m.ini - 0.5), b = Math.min(xmax, m.fim + 0.5);
    if (b <= a) return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', X(a)); r.setAttribute('y', M.t); r.setAttribute('width', X(b) - X(a)); r.setAttribute('height', h);
    r.setAttribute('class', 'mu-faixa ' + (i % 2 ? 'f1' : 'f0'));
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', (X(a) + X(b)) / 2); t.setAttribute('y', M.t + 11); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'mu-faixa-rot');
    t.textContent = X(b) - X(a) > 44 ? m.nome.replace(' (parcial)', '*') : '';
    g.append(r, t);
  });
  svg.insertBefore(g, svg.querySelector('g[clip-path]'));
}
const ticksAnos = (a, b) => { const out = []; for (let x = Math.ceil(a / 5) * 5; x <= b; x += 5) out.push(x); return out; };

function desenharGraficos(D, ind, el) {
  const sb = C.serieBR(ind).filter(p => p[0] >= ANO_SERIE0), sm = C.serieMundo(ind).filter(p => p[0] >= ANO_SERIE0);
  const gv = el.querySelector('.mu-g-valor'), gp = el.querySelector('.mu-g-pos');
  if (!sb.length) { gv.innerHTML = '<p class="muted small">Sem série do Brasil.</p>'; return; }
  const xmin = Math.min(sb[0][0], sm[0]?.[0] ?? Infinity, ANO_SERIE0), xmax = Math.max(sb[sb.length - 1][0], sm[sm.length - 1]?.[0] ?? 0);
  const ys = [...sb, ...sm].map(p => p[1]);
  let ymin = Math.min(...ys), ymax = Math.max(...ys); const pad = (ymax - ymin) * 0.12 || Math.abs(ymax) * 0.1 || 1;
  ymin -= pad; ymax += pad;
  if (ind.unidade.startsWith('%')) { ymin = Math.max(0, ymin); ymax = Math.min(100, ymax); }
  if (ymin > 0 && ymin < pad * 2) ymin = 0;
  const cBR = corCss('--serie-1'), cMu = corCss('--muted');
  const fyV = v => fmtN(Math.max(0, ind.casas - (Math.abs(ymax - ymin) > 20 ? 1 : 0))).format(v);
  linhaInterativa(gv, {
    series: [{ nome: 'Brasil', cor: cBR, pts: sb }, ...(sm.length ? [{ nome: 'Média mundial', cor: cMu, pts: sm }] : [])],
    xmin, xmax, ymin, ymax, ticksX: ticksAnos(xmin, xmax), rotulo: `${ind.nome}: Brasil e média mundial por ano`,
    fx: x => String(Math.round(x)), fy: fyV,
  });
  faixasMandato(D, gv, xmin, xmax);
  const hp = C.historicoPosicao(D, ind).filter(x => x.ano >= ANO_SERIE0);
  if (hp.length > 1) {
    linhaInterativa(gp, {
      series: [{ nome: 'Brasil: % dos países com valor pior', cor: cBR, pts: hp.map(x => [x.ano, x.percentil]) }],
      xmin, xmax, ymin: 0, ymax: 100, referencia: 50, ticksX: ticksAnos(xmin, xmax), rotulo: `${ind.nome}: posição relativa do Brasil por ano`,
      fx: x => String(Math.round(x)), fy: v => Math.round(v) + '%',
      dica: x => { const k = hp.reduce((b, h, i) => (Math.abs(h.ano - x) < Math.abs(hp[b].ano - x) ? i : b), 0); return `${ord(hp[k].pos)} de ${hp[k].n}`; },
    });
    faixasMandato(D, gp, xmin, xmax);
  } else gp.innerHTML = '';
}

function tabelaMandatos(D, ind) {
  const linhas = C.porMandato(D, ind).map(r => {
    const m = r.mandato;
    if (r.semDado) return `<tr><th scope="row">${esc(m.nome)}</th><td>${m.ini}–${m.fim}</td><td colspan="5" class="muted">${esc(r.semDado)}</td></tr>`;
    const dp = r.dPos, cls = dp > 0 ? 'sobe' : dp < 0 ? 'desce' : '';
    const dpTxt = dp > 0 ? `▲ ${dp}` : dp < 0 ? `▼ ${-dp}` : '=';
    const anos = (a, d) => (a !== d ? `${a} <small>(dado de ${d})</small>` : String(a));
    return `<tr><th scope="row">${esc(m.nome)}</th><td>${anos(r.a0, r.anoDado0)} → ${anos(r.a1, r.anoDado1)}</td><td class="num">${ord(r.pos0)} → ${ord(r.pos1)}</td><td class="num ${cls}">${dpTxt}</td><td class="num">${fmtV(ind, r.v0)} → ${fmtV(ind, r.v1)}</td><td class="num">${fmtDelta(ind, r.dV)}</td><td class="num">${r.n}</td></tr>`;
  });
  return `<div class="tabela-rolagem"><table class="mu-tab"><caption class="small muted">Posição do Brasil no início e no fim de cada mandato (${sentidoTxt(ind).toLowerCase()})</caption>
    <thead><tr><th>Mandato</th><th>Anos comparados</th><th class="num">Posição</th><th class="num">Variação</th><th class="num">Valor</th><th class="num">Variação</th><th class="num">N</th></tr></thead>
    <tbody>${linhas.join('')}</tbody></table></div>
    <p class="small muted">Mesma regra para todos os mandatos: início = ano anterior à posse; fim = último ano do mandato (no mandato atual, o último ano com dado). A posição é calculada só entre os N países com dado nos dois anos, por isso pode diferir da posição do cartão. ▲ = subiu na classificação. A posição depende também do que os outros países fizeram e de fatores fora do governo; a tabela descreve, não atribui causa.</p>`;
}

function fonteHTML(ind) {
  const f = ind.fonte;
  const jan = ind.janela ? ` · Países sem dado no ano usam o mais recente dos ${ind.janela} anos anteriores (ano entre parênteses).` : '';
  return `<p class="fonte"><span aria-hidden="true">ⓘ</span> Fonte: <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nome)}</a>${f.atualizado ? ` (atualizado em ${esc(f.atualizado.split('-').reverse().join('/'))})` : ''}. Média mundial: ${esc(ind.media)}.${jan}</p>`;
}

// ---------- cartão ----------
function cartao(D, ind, cfg, i) {
  const ano = cfg.ano ?? C.anoRecenteBR(ind);
  const p = ano == null ? null : C.posicao(D, ind, ano);
  const cab = `<header class="mu-cab"><h4>${esc(ind.nome)}</h4><span class="mu-sentido ${ind.sentido > 0 ? 'mais' : 'menos'}" title="Sentido usado na classificação">${ind.sentido > 0 ? '↑' : '↓'} ${sentidoTxt(ind)}</span></header>`;
  if (!p) return `<article class="mu-card" data-ind="${ind.id}" style="--i:${i}">${cab}<p class="muted">Sem dado do Brasil em ${ano ?? 'nenhum ano'}${ind.janela ? ` (nem nos ${ind.janela} anos anteriores)` : ''}. Anos com dado: ${C.anosBR(ind).slice(-8).join(', ') || '—'}.</p>${fonteHTML(ind)}</article>`;
  const L = p.lista; L.anoRef = ano;
  const m = C.mediaMundial(ind, ano);
  const esq = p.n > 1 ? ((100 * (p.pos - 1)) / (p.n - 1)).toFixed(1) : 0;
  const oficial = ind.rankOficial && (cfg.ano == null || cfg.ano === ind.rankOficial.ano) ? `<small>PNUD: ${ord(ind.rankOficial.pos)} de ${ind.rankOficial.n} (${ind.rankOficial.ano})</small>` : '';
  return `<article class="mu-card${cfg.compacto ? ' compacto' : ''}" data-ind="${ind.id}" style="--i:${i}">
    ${cab}
    <div class="mu-destaque">
      <div><span class="mu-rot">Brasil${p.anoDado !== ano ? ` (dado de ${p.anoDado})` : `, ${ano}`}</span><b class="mu-num">${fmtV(ind, p.v)}</b><small>${esc(unidadeTxt(ind))}</small></div>
      <div><span class="mu-rot">Posição no mundo</span><b class="mu-num">${ord(p.pos)} <span class="mu-de">de ${p.n}</span></b><small>melhor que ${p.percentil}% dos demais</small>${oficial}</div>
      <div><span class="mu-rot">Média mundial${m && m.ano !== ano ? ` (${m.ano})` : ''}</span><b class="mu-num">${fmtV(ind, m?.v)}</b><small>mediana dos países: ${fmtV(ind, p.mediana)}</small></div>
    </div>
    <div class="mu-regua" role="img" aria-label="Brasil em ${ord(p.pos)} de ${p.n}; à esquerda o 1º colocado">
      <div class="mu-trilho"><span class="mu-meio" title="Meio da classificação"></span><span class="mu-br" style="left:${esq}%"><em>Brasil</em></span></div>
      <div class="mu-regua-rot"><span>1º (melhor)</span><span>${ord(p.n)}</span></div>
    </div>
    <p class="mu-texto">${texto(D, ind, p, ano)}</p>
    <div class="mu-lista-box">${listaHTML(D, ind, L, cfg.visao)}</div>
    ${cfg.detalhes ? `<details class="mu-mais"><summary>Evolução desde ${ANO_SERIE0} e tabela por mandato</summary>
      <h5>Valor: Brasil × média mundial</h5><div class="mu-g-valor"></div>
      <h5>Posição relativa do Brasil (% dos países com valor pior; passe o dedo ou o mouse para ver "Nº de N")</h5><div class="mu-g-pos"></div>
      ${tabelaMandatos(D, ind)}
    </details>` : ''}
    ${fonteHTML(ind)}
  </article>`;
}

// ---------- bloco reutilizável ----------
// opcoes: { indicadores: [ids], temas: [ids], visao: 'ranking'|'pares'|'regiao'|'todos', ano: número|null (null = mais recente do Brasil),
//           compacto: bool, detalhes: bool (gráficos e mandatos; padrão = !compacto), titulos: bool (títulos por tema), resumo: bool }
export async function blocoMundo(alvo, opcoes = {}) {
  alvo.classList.add('mu-bloco');
  alvo.innerHTML = '<div class="esqueleto"><i></i><i></i><i></i><i></i></div>';
  let D;
  try { D = await dadosMundo(); } catch (e) { alvo.innerHTML = `<p class="erro">Não foi possível carregar os dados internacionais (${esc(e.message)}).</p>`; return null; }
  let cfg = {};
  function desenhar(o = {}) {
    cfg = { visao: 'ranking', ano: null, compacto: false, titulos: true, resumo: false, ...cfg, ...o };
    cfg.detalhes = o.detalhes ?? cfg.detalhes ?? !cfg.compacto;
    const inds = D.indicadores.filter(ind => (!cfg.indicadores?.length || cfg.indicadores.includes(ind.id)) && (!cfg.temas?.length || cfg.temas.includes(ind.tema)));
    let i = 0;
    const grupos = D.temas.map(([tema, nomeTema]) => {
      const lista = inds.filter(x => x.tema === tema);
      if (!lista.length) return '';
      return `<section class="mu-tema" data-tema="${tema}">${cfg.titulos && inds.length > 1 ? `<h3>${esc(nomeTema)}</h3>` : ''}<div class="mu-cards">${lista.map(ind => cartao(D, ind, cfg, i++)).join('')}</div></section>`;
    }).join('');
    alvo.innerHTML = (cfg.resumo ? resumoHTML(D, inds, cfg) : '') + (grupos || '<p class="muted">Nenhum indicador neste filtro.</p>');
    alvo.querySelectorAll('details.mu-mais').forEach(det => det.addEventListener('toggle', () => {
      if (!det.open || det.dataset.ok) return;
      det.dataset.ok = '1';
      const ind = D.indicadores.find(x => x.id === det.closest('.mu-card').dataset.ind);
      desenharGraficos(D, ind, det);
    }));
  }
  desenhar(opcoes);
  return { atualizar: desenhar, dados: D };
}

// Resumo: uma linha por indicador com a posição (clicável na aba)
function resumoHTML(D, inds, cfg) {
  const itens = inds.map(ind => {
    const ano = cfg.ano ?? C.anoRecenteBR(ind);
    const p = ano == null ? null : C.posicao(D, ind, ano);
    return `<button type="button" class="mu-res" data-ir="${ind.id}" title="${esc(ind.nome)}">
      <span class="mu-res-nome">${esc(ind.curto)}</span>
      <span class="mu-res-pos">${p ? `${ord(p.pos)}<small>/${p.n}</small>` : '—'}</span>
      <span class="mu-res-barra" aria-hidden="true"><i style="width:${p ? p.percentil : 0}%"></i></span>
      <span class="mu-res-ano small muted">${p ? `${fmtV(ind, p.v)} · ${p.anoDado}` : 'sem dado'}</span>
    </button>`;
  });
  return `<section class="mu-resumo-box"><h3>Posição do Brasil em cada quesito</h3><p class="small muted">Barra = % dos outros países com valor pior que o do Brasil (cheia = 1º lugar). Toque para abrir o indicador.</p><div class="mu-resumo">${itens.join('')}</div></section>`;
}

// ---------- aba completa ----------
function lerHash() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  return q.get('aba') === 'mundo' ? { tema: q.get('tema') || '', ind: q.get('ind') || '', vis: q.get('vis') || '', ano: q.get('ano') || '' } : {};
}
export async function iniciarMundo(R) {
  const el = document.getElementById('aba-mundo');
  if (!el) return null;
  el.innerHTML = `<div class="mu-aba">
    <header class="mu-intro">
      <h2><svg class="ic" aria-hidden="true"><use href="#i-globo"/></svg> Brasil × Mundo</h2>
      <p>Onde o Brasil fica entre os países do mundo em saneamento, renda, educação, saúde, segurança e outros quesitos, com dados oficiais internacionais (Banco Mundial, PNUD, OCDE, ONU/UNODC). Cada cartão mostra o valor do Brasil, a <b>posição</b> (do melhor para o pior, pelo sentido indicado), o <b>percentil</b> (quantos países ficam atrás), a média mundial e a evolução desde ${ANO_SERIE0}, com a posição no início e no fim de cada mandato presidencial.</p>
      <p class="small muted">A quantidade de países com dado muda de um indicador e de um ano para outro; por isso a posição vem sempre com o total (“Nº de N”) e com o percentil, que pode ser comparado entre anos. Diferenças pequenas de valor podem mudar muitas posições quando vários países estão próximos.</p>
    </header>
    <div class="mu-filtros" role="group" aria-label="Filtros">
      <label>Tema<select id="mu-tema"></select></label>
      <label>Indicador<select id="mu-ind"></select></label>
      <label>Visão<select id="mu-vis">${VISOES.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>
      <label>Ano<select id="mu-ano"></select></label>
    </div>
    <div id="mu-corpo"></div>
  </div>`;
  const corpo = el.querySelector('#mu-corpo');
  const bloco = await blocoMundo(corpo, { resumo: true });
  if (!bloco) return null;
  const D = bloco.dados;
  const sT = el.querySelector('#mu-tema'), sI = el.querySelector('#mu-ind'), sV = el.querySelector('#mu-vis'), sA = el.querySelector('#mu-ano');
  sT.innerHTML = '<option value="">Todos os temas</option>' + D.temas.map(([t, n]) => `<option value="${t}">${esc(n)}</option>`).join('');
  const preencherInd = () => {
    const t = sT.value;
    sI.innerHTML = '<option value="">Todos' + (t ? ' do tema' : '') + '</option>' + D.indicadores.filter(x => !t || x.tema === t).map(x => `<option value="${x.id}">${esc(x.curto)}</option>`).join('');
  };
  const anoMax = Math.max(...D.indicadores.map(x => C.anoRecenteBR(x) ?? 0));
  sA.innerHTML = '<option value="">Mais recente de cada indicador</option>' + Array.from({ length: anoMax - ANO_SERIE0 + 1 }, (_, k) => anoMax - k).map(a => `<option>${a}</option>`).join('');
  const h = lerHash();
  if (h.tema && D.temas.some(t => t[0] === h.tema)) sT.value = h.tema;
  preencherInd();
  if (h.ind && D.indicadores.some(x => x.id === h.ind)) { const ind = D.indicadores.find(x => x.id === h.ind); if (sT.value && sT.value !== ind.tema) { sT.value = ''; preencherInd(); } sI.value = h.ind; }
  if (h.vis && VISOES.some(v => v[0] === h.vis)) sV.value = h.vis;
  if (h.ano && /^\d{4}$/.test(h.ano)) sA.value = h.ano;

  function aplicar(gravar = true) {
    const o = { temas: sT.value ? [sT.value] : [], indicadores: sI.value ? [sI.value] : [], visao: sV.value, ano: sA.value ? Number(sA.value) : null, resumo: !sI.value };
    bloco.atualizar(o);
    if (sI.value) { const det = corpo.querySelector('details.mu-mais'); if (det) det.open = true; }
    corpo.querySelectorAll('.mu-res').forEach(b => b.onclick = () => { const ind = D.indicadores.find(x => x.id === b.dataset.ir); sT.value = ind.tema; preencherInd(); sI.value = ind.id; aplicar(); el.querySelector('.mu-filtros').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    if (gravar && /^#aba=mundo/.test(location.hash)) {
      const q = new URLSearchParams({ aba: 'mundo' });
      if (sT.value) q.set('tema', sT.value); if (sI.value) q.set('ind', sI.value); if (sV.value !== 'ranking') q.set('vis', sV.value); if (sA.value) q.set('ano', sA.value);
      history.replaceState(null, '', '#' + q.toString());
    }
  }
  sT.onchange = () => { preencherInd(); aplicar(); };
  sI.onchange = sV.onchange = sA.onchange = () => aplicar();
  aplicar(false);
  return bloco;
}
