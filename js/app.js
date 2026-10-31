// Painel da apuração: mapa de cor (UF → município → local de votação), busca e painel de detalhes.
import { UF_NOME, REGIAO_NOME, carregar, nf, pct, esc, norm, titulo, sigla, vazio, somar, corVantagem, CLASSES_VANTAGEM, classesQuantis, corSequencial, corCss } from './util.js?v=991bfd1919';
import { iniciarAnalises } from './analises.js?v=22a303cc9d';

const R = await carregar('resumo.json');
const MUN = await carregar('municipios.json');
const ZON = await carregar('zonas.json');
const [CA, CB] = R.candidatos;
const NOME_A = titulo(CA.nome), NOME_B = titulo(CB.nome);
document.querySelectorAll('[data-cand="a"]').forEach(e => e.textContent = NOME_A);
document.querySelectorAll('[data-cand="b"]').forEach(e => e.textContent = NOME_B);

// ---------- Acesso aos dados ----------
const aggMun = r => ({ secoes: r[5], aptos: r[6], comp: r[7], biom: r[8], a: r[9], b: r[10], br: r[11], nu: r[12], alertas: r[13] });
const aggZona = z => ({ secoes: z[3], aptos: z[4], comp: z[5], biom: z[6], a: z[7], b: z[8], br: z[9], nu: z[10], alertas: z[11] });
const aggLocal = l => ({ secoes: l[10], aptos: l[11], comp: l[12], biom: l[13], a: l[14], b: l[15], br: l[16], nu: l[17], alertas: l[18] });
const munPorIbge = new Map(MUN.filter(m => m[0]).map(m => [m[0], m]));
const nomeMun = ibge => munPorIbge.get(ibge)?.[2] ?? '';
const ufsDaRegiao = id => R.regioes[id];
const regiaoDaUf = uf => Object.keys(R.regioes).find(k => R.regioes[k].includes(uf));
const locaisDaUf = uf => carregar('locais/' + uf + '.json');

// ---------- Métricas do mapa ----------
const METRICAS = {
  resultado: { nome: 'Resultado (quem lidera)' },
  biometria: { nome: 'Sem habilitação biométrica (%)', valor: g => g.comp ? g.biom / g.comp : NaN },
  comparecimento: { nome: 'Comparecimento (%)', valor: g => g.aptos ? g.comp / g.aptos : NaN },
  brancosnulos: { nome: 'Brancos + nulos (%)', valor: g => g.comp ? (g.br + g.nu) / g.comp : NaN },
  alertas: { nome: 'Seções com alerta (%)', valor: g => g.secoes ? g.alertas / g.secoes : NaN }
};
let metrica = 'resultado';
let limites = [];
const cor = g => metrica === 'resultado' ? corVantagem(g.a, g.b) : corSequencial(METRICAS[metrica].valor(g), limites);
const fmtMetrica = g => metrica === 'resultado' ? `${NOME_A} ${pct(g.a, g.a + g.b)} · ${NOME_B} ${pct(g.b, g.a + g.b)}` : pct(METRICAS[metrica].valor(g), 1, 2);

// ---------- Mapa ----------
const mapa = L.map('mapa', { zoomSnap: 0.25, minZoom: 3, maxZoom: 18, preferCanvas: true, attributionControl: true }).setView([-15, -54], 4);
mapa.attributionControl.setPrefix('').addAttribution('Malhas: <a href="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3">IBGE</a> · Dados: <a href="https://dadosabertos.tse.jus.br/">TSE</a>');
const render = L.canvas({ padding: 0.4 });
// Ruas do OpenStreetMap (sem chave). No tema escuro, o CSS escurece os ladrilhos.
const ruas = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'ruas-osm', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
const geoUf = await carregar('geo/uf.json');
const pontos = L.layerGroup().addTo(mapa);
let foco = null;          // Set de chaves em destaque (UF ou código IBGE); null = tudo
let ufMunicipios = null;  // UF cujos municípios estão desenhados; '*' = Brasil todo
let nivelBrasil = 'uf';   // 'uf' | 'mun' na vista nacional
let apuracaoAtiva = null; // agregados por UF no instante da reprodução

const estilo = (g, chave, borda) => ({
  renderer: render, color: borda, weight: foco?.has(chave) ? 1.6 : 0.6,
  fillColor: g ? cor(g) : corCss('--sem-dado'),
  fillOpacity: foco && !foco.has(chave) ? 0.18 : pontos.getLayers().length ? 0.12 : mapa.hasLayer(ruas) ? 0.6 : 0.88
});
const camadaUf = L.geoJSON(geoUf, {
  renderer: render,
  style: f => estilo(apuracaoAtiva ? apuracaoAtiva[f.properties.uf] : R.porUf[f.properties.uf], f.properties.uf, corCss('--borda-mapa')),
  onEachFeature: (f, camada) => {
    const uf = f.properties.uf;
    camada.bindTooltip(() => {
      const g = apuracaoAtiva ? apuracaoAtiva[uf] : R.porUf[uf];
      const extra = apuracaoAtiva ? ` · ${pct(g.secoes, R.porUf[uf].secoes)} das seções apuradas` : '';
      return `<b>${esc(UF_NOME[uf])} (${uf})</b><br>${fmtMetrica(g)}${extra}`;
    }, { sticky: true });
    camada.on('click', () => selecionar({ tipo: 'uf', uf }));
  }
}).addTo(mapa);
const camadasMun = new Map(); // uf -> L.GeoJSON
async function camadaMunicipios(uf) {
  if (camadasMun.has(uf)) return camadasMun.get(uf);
  const geo = await carregar('geo/mun-' + uf + '.json');
  const c = L.geoJSON(geo, {
    renderer: render,
    style: f => { const m = munPorIbge.get(f.properties.ibge); return estilo(m && aggMun(m), f.properties.ibge, corCss('--borda-mun')); },
    onEachFeature: (f, camada) => {
      const m = munPorIbge.get(f.properties.ibge);
      camada.bindTooltip(() => m ? `<b>${esc(m[2])} (${m[1]})</b><br>${fmtMetrica(aggMun(m))}` : 'Sem dados', { sticky: true });
      camada.on('click', () => m && selecionar({ tipo: 'municipio', ibge: m[0] }));
    }
  });
  camadasMun.set(uf, c);
  return c;
}

// Botão "subir um nível" (local → bairro/zona → município → estado → região → Brasil).
async function paiDe(sel) {
  switch (sel.tipo) {
    case 'regiao': return { tipo: 'brasil' };
    case 'uf': return sel.uf === 'ZZ' ? { tipo: 'brasil' } : { tipo: 'regiao', id: regiaoDaUf(sel.uf) };
    case 'regiaoIbge': return sel.nivel === 'imed' ? { tipo: 'regiaoIbge', uf: sel.uf, nivel: 'interm', nome: MUN.find(m => m[1] === sel.uf && m[15] === sel.nome)?.[14] } : { tipo: 'uf', uf: sel.uf };
    case 'municipio': return { tipo: 'uf', uf: sel.ibge ? munPorIbge.get(sel.ibge)[1] : 'ZZ' };
    case 'zona': case 'bairro': return sel.ibge ? { tipo: 'municipio', ibge: sel.ibge } : { tipo: 'uf', uf: sel.uf };
    case 'local': { const l = (await locaisDaUf(sel.uf))[sel.id]; return l[1] ? { tipo: 'municipio', ibge: l[1] } : { tipo: 'municipio', uf: 'ZZ', tse: l[19] }; }
    default: return { tipo: 'brasil' };
  }
}
const ControleSubir = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    const box = L.DomUtil.create('div', 'leaflet-bar');
    const a = L.DomUtil.create('a', 'controle-subir', box);
    a.href = '#'; a.title = 'Subir um nível'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Subir um nível'); a.textContent = '↑';
    L.DomEvent.on(a, 'click', async e => { L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e); if (selAtual) selecionar(await paiDe(selAtual)); });
    return box;
  }
});
const ControleBrasil = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    const box = L.DomUtil.create('div', 'leaflet-bar');
    const a = L.DomUtil.create('a', 'controle-subir', box);
    a.href = '#'; a.title = 'Ver o Brasil inteiro'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Ver o Brasil inteiro'); a.textContent = '⌂';
    L.DomEvent.on(a, 'click', e => { L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e); selecionar({ tipo: 'brasil' }); });
    return box;
  }
});
const ctlSubir = new ControleSubir().addTo(mapa);
new ControleBrasil().addTo(mapa);
const btnSubir = ctlSubir.getContainer();

// Resumo sob o mapa (útil no celular, onde o painel fica lá embaixo).
function atualizarResumo(sel) {
  const el = document.getElementById('resumo-mapa');
  const h2 = document.querySelector('#painel h2'), barra = document.querySelector('#painel .placar-nomes');
  if (!el || !h2) return;
  el.innerHTML = `<div class="resumo-nome">${h2.innerHTML}</div><div class="resumo-placar">${barra ? barra.innerHTML : ''}</div><button class="botao" id="ir-painel">Detalhes ↓</button>`;
  el.querySelector('#ir-painel').onclick = () => document.getElementById('painel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// Limites das classes calculados sobre o que está visível no momento.
function recalcularLimites(grupos) {
  limites = metrica === 'resultado' ? [] : classesQuantis(grupos.map(g => METRICAS[metrica].valor(g)));
}
async function desenharPoligonos() {
  const ufs = ufMunicipios === '*' ? Object.keys(R.porUf).filter(u => u !== 'ZZ') : ufMunicipios ? [ufMunicipios] : [];
  const grupos = ufs.length ? MUN.filter(m => ufs.includes(m[1])).map(aggMun) : Object.entries(R.porUf).filter(([u]) => u !== 'ZZ').map(([, g]) => g);
  recalcularLimites(grupos);
  const querer = new Set();
  for (const uf of ufs) querer.add(await camadaMunicipios(uf));
  for (const [, c] of camadasMun) { if (querer.has(c)) { if (!mapa.hasLayer(c)) c.addTo(mapa); c.setStyle(c.options.style); } else c.remove(); }
  // Com municípios de uma UF abertos, as outras UFs continuam visíveis atrás, mais claras.
  camadaUf.setStyle(camadaUf.options.style);
  if (ufMunicipios === '*') camadaUf.remove(); else if (!mapa.hasLayer(camadaUf)) camadaUf.addTo(mapa).bringToBack();
  desenharLegenda();
}
function desenharLegenda() {
  const el = document.getElementById('legenda');
  if (metrica === 'resultado') {
    const faixa = (lado, nome) => CLASSES_VANTAGEM.slice(0, -1).map((x, i) => `<span class="sw" style="background:var(--${lado}-${i + 1})" title="${esc(nome)} com ${Math.round(x * 100)}% a ${i === 3 ? '100' : Math.round(CLASSES_VANTAGEM[i + 1] * 100)}% dos válidos"></span>`);
    // Escala divergente: folga máxima de A ... 50% ... folga máxima de B.
    el.innerHTML = `<span class="leg-nome">${esc(NOME_A)}</span>${faixa('a', NOME_A).reverse().join('')}<span class="leg-meio">50%</span>${faixa('b', NOME_B).join('')}<span class="leg-nome">${esc(NOME_B)}</span><span class="leg-nota">cor de quem lidera; mais forte = mais folga (50–55, 55–60, 60–70, 70%+ dos válidos)</span>`;
    return;
  }
  const n = limites.length, faixas = [];
  for (let i = 0; i <= n; i++) {
    const de = i === 0 ? null : limites[i - 1], ate = i === n ? null : limites[i];
    const txt = de == null ? '< ' + pct(ate, 1, 1) : ate == null ? '≥ ' + pct(de, 1, 1) : pct(de, 1, 1) + '–' + pct(ate, 1, 1);
    faixas.push(`<span class="sw" style="background:${corSequencial(de == null ? -Infinity : ate == null ? Infinity : (de + ate) / 2, limites)}"></span><span class="leg-txt">${txt}</span>`);
  }
  el.innerHTML = `<span class="leg-nome">${esc(METRICAS[metrica].nome)}</span>${faixas.join('')}<span class="leg-nota">faixas com o mesmo número de áreas na tela; cinza = sem dado</span>`;
}

async function desenharPontos(lista, uf, destaque = null) {
  pontos.clearLayers();
  if (!lista.length) return;
  recalcularLimitesPontos(lista);
  const maxComp = Math.max(...lista.map(l => l[12]), 1);
  for (const l of lista) {
    if (l[8] == null || l[9] == null) continue;
    const g = aggLocal(l), d = destaque === l[0];
    L.circleMarker([l[8], l[9]], { renderer: render, radius: raioPonto(Math.sqrt(l[12] / maxComp), d), proporcao: Math.sqrt(l[12] / maxComp), destaque: d, color: d ? corCss('--tinta') : corCss('--superficie'), weight: d ? 2.5 : 1, fillColor: cor(g), fillOpacity: 0.92 })
      .bindTooltip(`<b>${esc(titulo(l[4]))}</b><br>${esc(titulo(l[5]))} · zona ${l[2]} · ${l[10]} seç.<br>${fmtMetrica(g)}`, { sticky: true })
      .on('click', () => selecionar({ tipo: 'local', uf, id: l[0] }))
      .addTo(pontos);
  }
  reestilizar();
}
// Bolinhas crescem com o zoom: na cidade inteira ficam pequenas, na rua ficam grandes.
const raioPonto = (r, destaque) => (destaque ? 4 : 1.5) + (2 + 8 * r) * Math.min(1.6, Math.max(0.45, (mapa.getZoom() - 8) / 5));
mapa.on('zoomend', () => pontos.eachLayer(c => c.setRadius(raioPonto(c.options.proporcao, c.options.destaque))));
function reestilizar() {
  camadaUf.setStyle(camadaUf.options.style);
  for (const c of camadasMun.values()) if (mapa.hasLayer(c)) c.setStyle(c.options.style);
}
function recalcularLimitesPontos(lista) { if (metrica !== 'resultado') limites = classesQuantis(lista.map(l => METRICAS[metrica].valor(aggLocal(l)))); desenharLegenda(); }

function enquadrar(camadas) {
  const b = L.latLngBounds([]);
  for (const c of camadas) if (c?.getBounds) { const x = c.getBounds(); if (x.isValid()) b.extend(x); }
  if (b.isValid()) mapa.flyToBounds(b, { padding: [20, 20], duration: 0.6, maxZoom: 15 });
}
const feicoes = (camada, chaves) => { const out = []; camada?.eachLayer(l => { const p = l.feature.properties; if (chaves.has(p.uf ?? p.ibge)) out.push(l); }); return out; };

// ---------- Seleção (o que está aberto no painel e no mapa) ----------
let selAtual = null, escolhendo = false;
async function selecionar(sel, { semHash = false } = {}) {
  pararApuracao();
  if (document.activeElement !== entrada && !escolhendo) entrada.value = '';
  escolhendo = false;
  selAtual = sel;
  // pushState: o botão Voltar do navegador/celular volta para o recorte anterior.
  if (!semHash && location.hash.slice(1) !== hashDe(sel)) history.pushState(null, '', '#' + hashDe(sel));
  const p = document.getElementById('painel');
  p.innerHTML = '<p class="muted">Carregando…</p>';
  btnSubir.style.visibility = sel.tipo === 'brasil' ? 'hidden' : 'visible';
  try { await (ROTAS[sel.tipo] || ROTAS.brasil)(sel, p); atualizarResumo(sel); }
  catch (e) { p.innerHTML = `<p class="erro">Não consegui abrir este recorte: ${esc(e.message)}</p>`; console.error(e); }
  document.querySelectorAll('.migalha [data-ir]').forEach(b => b.onclick = () => selecionar(JSON.parse(b.dataset.ir)));
}
const ir = sel => esc(JSON.stringify(sel));
function migalhas(itens) {
  return `<nav class="migalha" aria-label="Você está em">${itens.map(([txt, sel], i) => i === itens.length - 1 ? `<span>${txt}</span>` : `<button data-ir="${ir(sel)}">${txt}</button>`).join(' › ')}</nav>`;
}

function cabecalho(tipo, nome, g, extra = '') {
  const v = g.a + g.b;
  return `<div class="tipo">${tipo}</div><h2>${nome}</h2>${extra}
  <div class="placar" role="img" aria-label="${esc(NOME_A)} ${pct(g.a, v)}, ${esc(NOME_B)} ${pct(g.b, v)} dos votos válidos">
    <div class="placar-nomes"><span><i class="ponto a"></i>${esc(NOME_A)} <b>${pct(g.a, v, 2)}</b></span><span><b>${pct(g.b, v, 2)}</b> ${esc(NOME_B)}<i class="ponto b"></i></span></div>
    <div class="barra"><span class="seg a" style="width:${v ? 100 * g.a / v : 50}%"></span><span class="seg b" style="width:${v ? 100 * g.b / v : 50}%"></span></div>
    <div class="placar-nomes small"><span>${nf(g.a)} votos</span><span>${nf(g.b)} votos</span></div>
  </div>
  <dl class="numeros">
    <div><dt>Seções</dt><dd>${nf(g.secoes)}</dd></div>
    <div><dt>Aptos</dt><dd>${nf(g.aptos)}</dd></div>
    <div><dt>Comparecimento</dt><dd>${nf(g.comp)} <small>${pct(g.comp, g.aptos)}</small></dd></div>
    <div><dt>Diferença</dt><dd>${nf(Math.abs(g.a - g.b))} <small>votos</small></dd></div>
    <div><dt>Brancos</dt><dd>${nf(g.br)} <small>${pct(g.br, g.comp)}</small></dd></div>
    <div><dt>Nulos</dt><dd>${nf(g.nu)} <small>${pct(g.nu, g.comp)}</small></dd></div>
    <div title="Eleitores com biometria cadastrada que foram liberados para votar sem a digital (campo QT_ELEI_BIOM_SEM_HABILITACAO)"><dt>Sem habilitação biométrica</dt><dd>${nf(g.biom)} <small>${pct(g.biom, g.comp, 2)}</small></dd></div>
    <div title="Seções com pelo menos um alerta automático (veja a aba Alertas)"><dt>Seções com alerta</dt><dd>${nf(g.alertas)}</dd></div>
  </dl>`;
}

// Tabela clicável com filtro e ordenação.
function tabela(p, titulo_, colunas, linhas, aoClicar, { limite = 120, ordem = null } = {}) {
  const box = document.createElement('section');
  box.className = 'lista';
  box.innerHTML = `<div class="lista-topo"><h3>${titulo_} <small>(${nf(linhas.length)})</small></h3>${linhas.length > 8 ? '<input type="search" placeholder="Filtrar…" aria-label="Filtrar lista">' : ''}</div><div class="tabela-rolagem"><table><thead><tr>${colunas.map((c, i) => `<th data-i="${i}" class="${c.num ? 'num' : ''}" title="Ordenar">${c.t}</th>`).join('')}</tr></thead><tbody></tbody></table></div><p class="small mais"></p>`;
  p.append(box);
  let filtro = '', ord = ordem ?? [colunas.findIndex(c => c.num), -1], mostrar = limite;
  const tbody = box.querySelector('tbody');
  function desenhar() {
    let ls = filtro ? linhas.filter(l => norm(colunas.map(c => c.busca ? c.busca(l) : '').join(' ')).includes(filtro)) : linhas.slice();
    if (ord[0] >= 0) { const c = colunas[ord[0]]; ls.sort((x, y) => { const a = c.v(x), b = c.v(y); return (typeof a === 'string' ? a.localeCompare(b) : (a ?? -Infinity) - (b ?? -Infinity)) * ord[1]; }); }
    tbody.innerHTML = ls.slice(0, mostrar).map((l, i) => `<tr tabindex="0" data-i="${linhas.indexOf(l)}">${colunas.map(c => `<td class="${c.num ? 'num' : ''}">${c.f ? c.f(l) : esc(c.v(l))}</td>`).join('')}</tr>`).join('');
    const m = box.querySelector('.mais');
    m.innerHTML = ls.length > mostrar ? `Mostrando ${nf(mostrar)} de ${nf(ls.length)}. <button class="link">Mostrar mais</button>` : '';
    m.querySelector('button')?.addEventListener('click', () => { mostrar += 300; desenhar(); });
  }
  box.querySelector('input')?.addEventListener('input', e => { filtro = norm(e.target.value); mostrar = limite; desenhar(); });
  box.querySelectorAll('th').forEach(th => th.onclick = () => { const i = +th.dataset.i; ord = [i, ord[0] === i ? -ord[1] : (colunas[i].num ? -1 : 1)]; desenhar(); });
  tbody.onclick = e => { const tr = e.target.closest('tr'); if (tr && aoClicar) aoClicar(linhas[+tr.dataset.i]); };
  tbody.onkeydown = e => { if (e.key === 'Enter') tbody.onclick(e); };
  desenhar();
}
const colVantagem = g => ({ t: `% ${esc(NOME_A)}`, num: true, v: l => { const x = g(l); return x.a + x.b ? x.a / (x.a + x.b) : null; }, f: l => { const x = g(l); return `<span class="chip" style="background:${corVantagem(x.a, x.b)}"></span>${pct(x.a, x.a + x.b)}`; } });
const colBio = g => ({ t: 'Sem hab. biom.', num: true, v: l => { const x = g(l); return x.comp ? x.biom / x.comp : null; }, f: l => { const x = g(l); return pct(x.biom, x.comp, 2); } });
const colComp = g => ({ t: 'Comparec.', num: true, v: l => g(l).comp, f: l => nf(g(l).comp) });
const colAlerta = g => ({ t: 'Alertas', num: true, v: l => g(l).alertas, f: l => nf(g(l).alertas) });

function agruparLocais(lista, chave) {
  const m = new Map();
  for (const l of lista) { const k = chave(l); let x = m.get(k); if (!x) m.set(k, x = { chave: k, g: vazio(), locais: 0 }); somar(x.g, aggLocal(l)); x.locais++; }
  return [...m.values()];
}

const ROTAS = {
  async brasil(sel, p) {
    ufMunicipios = nivelBrasil === 'mun' ? '*' : null; foco = null; pontos.clearLayers();
    await desenharPoligonos();
    mapa.flyToBounds(camadaUf.getBounds(), { padding: [8, 8], duration: 0.6 });
    const zz = R.porUf.ZZ;
    p.innerHTML = migalhas([['Brasil']]) + cabecalho('País', 'Brasil', R.totalBrasil, `<p class="small">Sem o exterior. Com ${sigla('ZZ')}: ${nf(R.total.comp)} votantes · diferença final ${nf(Math.abs(R.total.a - R.total.b))} votos.</p>`);
    tabela(p, 'Regiões', [{ t: 'Região', v: r => REGIAO_NOME[r.id], busca: r => REGIAO_NOME[r.id] }, colVantagem(r => r.g), colComp(r => r.g), colBio(r => r.g)],
      Object.keys(R.regioes).map(id => ({ id, g: R.regioes[id].reduce((s, uf) => somar(s, R.porUf[uf]), vazio()) })), r => selecionar({ tipo: 'regiao', id: r.id }));
    tabela(p, 'Estados', [{ t: 'UF', v: u => u, f: u => sigla(u) + ' <span class="muted">' + esc(UF_NOME[u].split(' — ')[0]) + '</span>', busca: u => u + ' ' + UF_NOME[u] }, colVantagem(u => R.porUf[u]), colComp(u => R.porUf[u]), colBio(u => R.porUf[u]), colAlerta(u => R.porUf[u])],
      Object.keys(R.porUf), u => selecionar({ tipo: 'uf', uf: u }), { limite: 30 });
    void zz;
  },
  async regiao(sel, p) {
    const ufs = ufsDaRegiao(sel.id); ufMunicipios = null; foco = new Set(ufs); pontos.clearLayers();
    await desenharPoligonos(); enquadrar(feicoes(camadaUf, foco).map(l => ({ getBounds: () => l.getBounds() })));
    const g = ufs.reduce((s, uf) => somar(s, R.porUf[uf]), vazio());
    p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], ['Região ' + REGIAO_NOME[sel.id]]]) + cabecalho('Região', REGIAO_NOME[sel.id], g);
    tabela(p, 'Estados', [{ t: 'UF', v: u => u, f: u => sigla(u) + ' <span class="muted">' + esc(UF_NOME[u]) + '</span>', busca: u => UF_NOME[u] }, colVantagem(u => R.porUf[u]), colComp(u => R.porUf[u]), colBio(u => R.porUf[u])], ufs, u => selecionar({ tipo: 'uf', uf: u }));
  },
  async uf(sel, p) {
    const uf = sel.uf, g = R.porUf[uf], muns = MUN.filter(m => m[1] === uf);
    const nome = UF_NOME[uf].split(' — ')[0];
    if (uf === 'ZZ') {
      ufMunicipios = null; foco = new Set(); pontos.clearLayers(); await desenharPoligonos();
      p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], ['Exterior']]) + cabecalho('Fora do Brasil', 'Exterior (ZZ)', g, '<p class="nota">ZZ é o código do TSE para as seções no exterior. Não é um estado e não aparece no mapa. O campo de biometria vem zerado e 27 boletins não trazem horário.</p>');
      tabela(p, 'Cidades', [{ t: 'Cidade', v: m => m[2], busca: m => m[2] }, colVantagem(aggMun), colComp(aggMun)], muns, m => selecionar({ tipo: 'municipio', uf: 'ZZ', tse: m[3] }));
      return;
    }
    ufMunicipios = uf; foco = null; pontos.clearLayers();
    await desenharPoligonos(); enquadrar([camadasMun.get(uf)]);
    p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], ['Região ' + REGIAO_NOME[regiaoDaUf(uf)], { tipo: 'regiao', id: regiaoDaUf(uf) }], [nome]]) + cabecalho('Estado', `${esc(nome)} (${uf})`, g);
    tabela(p, 'Municípios', [{ t: 'Município', v: m => m[2], busca: m => m[2] + ' ' + m[14] + ' ' + m[15] }, colVantagem(aggMun), colComp(aggMun), colBio(aggMun), colAlerta(aggMun)], muns, m => selecionar({ tipo: 'municipio', ibge: m[0] }));
    tabela(p, 'Zonas eleitorais', [{ t: 'Zona', num: true, v: z => z[1], f: z => 'Zona ' + z[1] }, { t: 'Municípios', v: z => z[2].map(nomeMun).join(', '), busca: z => 'zona ' + z[1] + ' ' + z[2].map(nomeMun).join(' ') }, colVantagem(aggZona), colComp(aggZona), colBio(aggZona)],
      ZON.filter(z => z[0] === uf), z => selecionar({ tipo: 'zona', uf, zona: z[1] }), { ordem: [0, 1] });
    const regs = agruparPor(muns, m => m[14]);
    tabela(p, 'Regiões intermediárias (IBGE)', [{ t: 'Região', v: r => r.chave, busca: r => r.chave }, colVantagem(r => r.g), colComp(r => r.g), colBio(r => r.g)], regs, r => selecionar({ tipo: 'regiaoIbge', uf, nivel: 'interm', nome: r.chave }));
  },
  async regiaoIbge(sel, p) {
    const col = sel.nivel === 'interm' ? 14 : 15, muns = MUN.filter(m => m[1] === sel.uf && m[col] === sel.nome);
    ufMunicipios = sel.uf; foco = new Set(muns.map(m => m[0])); pontos.clearLayers();
    await desenharPoligonos(); enquadrar(feicoes(camadasMun.get(sel.uf), foco));
    const g = muns.reduce((s, m) => somar(s, aggMun(m)), vazio());
    const rotulo = sel.nivel === 'interm' ? 'Região geográfica intermediária (IBGE)' : 'Região geográfica imediata (IBGE)';
    p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], [sel.uf, { tipo: 'uf', uf: sel.uf }], [esc(sel.nome)]]) + cabecalho(rotulo, esc(sel.nome) + ' · ' + sigla(sel.uf), g);
    tabela(p, 'Municípios', [{ t: 'Município', v: m => m[2], busca: m => m[2] }, colVantagem(aggMun), colComp(aggMun), colBio(aggMun), colAlerta(aggMun)], muns, m => selecionar({ tipo: 'municipio', ibge: m[0] }));
    if (sel.nivel === 'interm') tabela(p, 'Regiões imediatas', [{ t: 'Região', v: r => r.chave, busca: r => r.chave }, colVantagem(r => r.g), colComp(r => r.g)], agruparPor(muns, m => m[15]), r => selecionar({ tipo: 'regiaoIbge', uf: sel.uf, nivel: 'imed', nome: r.chave }));
  },
  async municipio(sel, p) {
    const m = sel.ibge ? munPorIbge.get(sel.ibge) : MUN.find(x => x[1] === sel.uf && x[3] === sel.tse);
    if (!m) throw Error('município não encontrado');
    const uf = m[1], locais = (await locaisDaUf(uf)).filter(l => uf === 'ZZ' ? l[19] === m[3] : l[1] === m[0]);
    if (uf !== 'ZZ') {
      ufMunicipios = uf; foco = new Set([m[0]]);
      await desenharPoligonos();
      await desenharPontos(locais, uf);
      enquadrar(feicoes(camadasMun.get(uf), foco));
    }
    p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], [uf === 'ZZ' ? 'Exterior' : uf, { tipo: 'uf', uf }], [esc(m[2])]]) +
      cabecalho(uf === 'ZZ' ? 'Cidade no exterior' : 'Município', `${esc(m[2])} · ${sigla(uf)}`, aggMun(m), uf === 'ZZ' ? '' : `<p class="small">Código IBGE ${m[0]} · código TSE ${m[3]} · ${esc(m[15])} (imediata) · ${esc(m[14])} (intermediária)</p>`);
    const zonas = agruparLocais(locais, l => l[2]);
    tabela(p, 'Zonas eleitorais neste município', [{ t: 'Zona', num: true, v: z => z.chave, f: z => 'Zona ' + z.chave }, { t: 'Locais', num: true, v: z => z.locais, f: z => nf(z.locais) }, colVantagem(z => z.g), colComp(z => z.g), colBio(z => z.g)], zonas, z => selecionar({ tipo: 'zona', uf, zona: z.chave }), { ordem: [0, 1] });
    const bairros = agruparLocais(locais, l => l[5]);
    if (uf !== 'ZZ') tabela(p, 'Bairros', [{ t: 'Bairro', v: b => b.chave, f: b => esc(titulo(b.chave) || '(sem bairro)'), busca: b => b.chave }, { t: 'Locais', num: true, v: b => b.locais, f: b => nf(b.locais) }, colVantagem(b => b.g), colComp(b => b.g), colBio(b => b.g)], bairros, b => selecionar({ tipo: 'bairro', uf, ibge: m[0], bairro: b.chave }));
    tabelaLocais(p, locais, uf);
  },
  async zona(sel, p) {
    const z = ZON.find(x => x[0] === sel.uf && x[1] === sel.zona);
    if (!z) throw Error('zona não encontrada');
    const locais = (await locaisDaUf(sel.uf)).filter(l => l[2] === sel.zona);
    if (sel.uf !== 'ZZ') {
      ufMunicipios = sel.uf; foco = new Set(z[2]);
      await desenharPoligonos(); await desenharPontos(locais, sel.uf);
      enquadrar(feicoes(camadasMun.get(sel.uf), foco));
    }
    p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], [sel.uf, { tipo: 'uf', uf: sel.uf }], ['Zona ' + sel.zona]]) + cabecalho('Zona eleitoral', `Zona ${sel.zona} · ${sigla(sel.uf)}`, aggZona(z), `<p class="small">Uma zona pode cobrir vários municípios e um município grande pode ter várias zonas.</p>`);
    const porMun = agruparLocais(locais, l => l[1]);
    if (sel.uf !== 'ZZ') tabela(p, 'Municípios da zona', [{ t: 'Município', v: x => nomeMun(x.chave), busca: x => nomeMun(x.chave) }, colVantagem(x => x.g), colComp(x => x.g), colBio(x => x.g)], porMun, x => selecionar({ tipo: 'municipio', ibge: x.chave }));
    tabelaLocais(p, locais, sel.uf);
  },
  async bairro(sel, p) {
    const locais = (await locaisDaUf(sel.uf)).filter(l => l[1] === sel.ibge && l[5] === sel.bairro);
    ufMunicipios = sel.uf; foco = new Set([sel.ibge]);
    await desenharPoligonos(); await desenharPontos(locais, sel.uf);
    enquadrarPontos(locais) || enquadrar(feicoes(camadasMun.get(sel.uf), foco));
    const g = locais.reduce((s, l) => somar(s, aggLocal(l)), vazio());
    p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], [sel.uf, { tipo: 'uf', uf: sel.uf }], [esc(nomeMun(sel.ibge)), { tipo: 'municipio', ibge: sel.ibge }], [esc(titulo(sel.bairro) || '(sem bairro)')]]) +
      cabecalho('Bairro (como cadastrado no TSE)', esc(titulo(sel.bairro) || '(sem bairro)'), g, `<p class="small">${esc(nomeMun(sel.ibge))} · ${sigla(sel.uf)}. O bairro é o do endereço do local de votação; o eleitor pode morar em outro.</p>`);
    tabelaLocais(p, locais, sel.uf);
  },
  async local(sel, p) {
    const todos = await locaisDaUf(sel.uf), l = todos[sel.id];
    if (!l) throw Error('local não encontrado');
    const doMun = todos.filter(x => x[1] === l[1] && x[2] === l[2]);
    if (sel.uf !== 'ZZ') {
      ufMunicipios = sel.uf; foco = new Set([l[1]]);
      await desenharPoligonos(); await desenharPontos(doMun, sel.uf, l[0]);
      if (l[8] != null) mapa.flyTo([l[8], l[9]], 16, { duration: 0.6 }); else enquadrar(feicoes(camadasMun.get(sel.uf), foco));
    }
    const coord = l[8] != null ? `<a href="https://www.openstreetmap.org/?mlat=${l[8]}&mlon=${l[9]}#map=18/${l[8]}/${l[9]}" target="_blank" rel="noopener">ver no OpenStreetMap</a>` : 'sem coordenadas no cadastro';
    p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], [sel.uf, { tipo: 'uf', uf: sel.uf }], [esc(nomeMun(l[1]) || 'Exterior'), l[1] ? { tipo: 'municipio', ibge: l[1] } : { tipo: 'uf', uf: sel.uf }], ['Zona ' + l[2], { tipo: 'zona', uf: sel.uf, zona: l[2] }], [esc(titulo(l[4]))]]) +
      cabecalho('Local de votação · ' + esc(l[7] || 'local'), esc(titulo(l[4])), aggLocal(l), `<p class="small">${esc(titulo(l[6]))}${l[5] ? ' · ' + esc(titulo(l[5])) : ''} · ${esc(nomeMun(l[1]))} · ${sigla(sel.uf)} · zona ${l[2]} · local nº ${l[3]} · ${coord}</p>`);
    const alertas = (await carregar('alertas.json')).filter(a => a[0] === sel.uf && a[3] === l[2] && a[1] === l[1] && a[5] === l[4]);
    const tipos = R.alertas.tipos;
    const box = document.createElement('section'); box.className = 'lista';
    box.innerHTML = `<h3>Alertas nas seções deste local <small>(${alertas.length})</small></h3>` + (alertas.length ? `<ul class="alertas">${alertas.map(a => `<li><b>Seção ${a[4]}</b>: ${a[14].split(',').map(t => esc(tipos[t])).join('; ')} <span class="muted">(${nf(a[7])} votantes · ${esc(NOME_A)} ${nf(a[9])} × ${esc(NOME_B)} ${nf(a[10])})</span></li>`).join('')}</ul>` : '<p class="muted">Nenhum alerta automático nas seções deste local.</p>');
    p.append(box);
    tabelaLocais(p, doMun.filter(x => x !== l), sel.uf, 'Outros locais da mesma zona neste município');
  }
};
function agruparPor(muns, chave) {
  const mp = new Map();
  for (const m of muns) { const k = chave(m); let x = mp.get(k); if (!x) mp.set(k, x = { chave: k, g: vazio() }); somar(x.g, aggMun(m)); }
  return [...mp.values()];
}
function enquadrarPontos(locais) {
  const pts = locais.filter(l => l[8] != null).map(l => [l[8], l[9]]);
  if (!pts.length) return false;
  mapa.flyToBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 16, duration: 0.6 });
  return true;
}
function tabelaLocais(p, locais, uf, rotulo = 'Locais de votação (escolas e outros)') {
  tabela(p, rotulo, [
    { t: 'Local', v: l => l[4], f: l => esc(titulo(l[4])) + (l[8] == null ? ' <span class="muted" title="Sem coordenadas no cadastro do TSE">⌖?</span>' : ''), busca: l => l[4] + ' ' + l[5] + ' ' + l[6] },
    { t: 'Bairro', v: l => l[5], f: l => esc(titulo(l[5])) },
    { t: 'Zona', num: true, v: l => l[2] },
    { t: 'Seç.', num: true, v: l => l[10] },
    colVantagem(aggLocal), colComp(aggLocal), colBio(aggLocal), colAlerta(aggLocal)
  ], locais, l => selecionar({ tipo: 'local', uf, id: l[0] }));
}

// ---------- Endereço na URL (#uf=SP, #mun=3550308, #zona=SP-1, #local=SP-12, #regiao=NE) ----------
function hashDe(s) {
  return { brasil: 'brasil', regiao: 'regiao=' + s.id, uf: 'uf=' + s.uf, municipio: s.ibge ? 'mun=' + s.ibge : 'ext=' + s.tse, zona: `zona=${s.uf}-${s.zona}`, local: `local=${s.uf}-${s.id}`, bairro: `bairro=${s.uf}-${s.ibge}-${encodeURIComponent(s.bairro)}`, regiaoIbge: `rib=${s.uf}-${s.nivel}-${encodeURIComponent(s.nome)}` }[s.tipo] || 'brasil';
}
function selDoHash() {
  const [k, v = ''] = decodeURIComponent(location.hash.slice(1)).split('=');
  const p = v.split('-');
  return {
    regiao: { tipo: 'regiao', id: v }, uf: { tipo: 'uf', uf: v }, mun: { tipo: 'municipio', ibge: +v }, ext: { tipo: 'municipio', uf: 'ZZ', tse: +v },
    zona: { tipo: 'zona', uf: p[0], zona: +p[1] }, local: { tipo: 'local', uf: p[0], id: +p[1] }, bairro: { tipo: 'bairro', uf: p[0], ibge: +p[1], bairro: p.slice(2).join('-') },
    rib: { tipo: 'regiaoIbge', uf: p[0], nivel: p[1], nome: p.slice(2).join('-') }
  }[k] || { tipo: 'brasil' };
}

// ---------- Busca ----------
const entrada = document.getElementById('busca'), sugestoes = document.getElementById('sugestoes');
const indice = [];
const add = (tipo, rotulo, sub, sel, extra = '', peso = 0) => indice.push({ tipo, rotulo, sub, sel, peso, chave: norm(rotulo + ' ' + extra), chaveSub: norm(sub) });
for (const id of Object.keys(R.regioes)) add('Região', 'Região ' + REGIAO_NOME[id], R.regioes[id].join(', '), { tipo: 'regiao', id }, id, 1e9);
for (const uf of Object.keys(R.porUf)) add('Estado', UF_NOME[uf].split(' — ')[0], uf, { tipo: 'uf', uf }, uf + (uf === 'ZZ' ? ' exterior zz' : ''), R.porUf[uf].comp);
const vistos = new Set();
for (const m of MUN) {
  if (m[0]) add('Município', m[2], m[1], { tipo: 'municipio', ibge: m[0] }, '', m[7]);
  else add('Exterior', titulo(m[2]), 'cidade no exterior', { tipo: 'municipio', uf: 'ZZ', tse: m[3] });
  for (const [col, nivel, rot] of [[14, 'interm', 'Região intermediária'], [15, 'imed', 'Região imediata']]) {
    const k = m[1] + col + m[col];
    if (m[col] && !vistos.has(k)) { vistos.add(k); add(rot, m[col], m[1], { tipo: 'regiaoIbge', uf: m[1], nivel, nome: m[col] }); }
  }
}
for (const z of ZON) add('Zona eleitoral', `Zona ${z[1]} · ${z[0]}`, z[2].slice(0, 4).map(nomeMun).join(', ') + (z[2].length > 4 ? '…' : ''), { tipo: 'zona', uf: z[0], zona: z[1] }, `zona ${z[1]} ze ${z[1]} ${z[0]} ${UF_NOME[z[0]]}`, z[5]);
let locaisIndexados = false;
async function indexarLocais() {
  if (locaisIndexados) return; locaisIndexados = true;
  const b = await carregar('busca-locais.json');
  for (const [uf, [bairros, nomes]] of Object.entries(b)) {
    const bVistos = new Map();
    nomes.forEach(([nome, ib, ibge, comp], id) => {
      const bairro = bairros[ib], mun = nomeMun(ibge) || 'Exterior';
      add('Local de votação', titulo(nome), `${titulo(bairro)} · ${mun} · ${uf}`, { tipo: 'local', uf, id }, '', comp);
      const kb = ibge + '|' + bairro;
      if (bairro && ibge) {
        if (!bVistos.has(kb)) { add('Bairro', titulo(bairro), `${mun} · ${uf}`, { tipo: 'bairro', uf, ibge, bairro }); bVistos.set(kb, indice[indice.length - 1]); }
        bVistos.get(kb).peso += comp || 0; // bairro maior aparece antes
      }
    });
  }
  if (entrada.value) buscar();
}
entrada.addEventListener('focus', indexarLocais, { once: true });
const PRIORIDADE = { Estado: 0, Região: 1, Município: 2, 'Zona eleitoral': 3, 'Região intermediária': 4, 'Região imediata': 5, Bairro: 6, 'Local de votação': 7, Exterior: 8 };
let resultados = [], ativo = -1;
function buscar() {
  const q = norm(entrada.value);
  if (q.length < 2) { sugestoes.hidden = true; return; }
  const termos = q.split(' ');
  const ufFiltro = termos.find(t => t.length === 2 && UF_NOME[t.toUpperCase()])?.toUpperCase();
  const pontuar = it => {
    let s = 0;
    for (const t of termos) {
      if (it.chave.startsWith(t)) s += 3; else if (it.chave.includes(' ' + t)) s += 2; else if (it.chave.includes(t)) s += 1;
      else if (it.chaveSub.includes(t)) s += 0.5; else return -1;
    }
    if (it.chave === q) s += 5;
    if (ufFiltro && !it.sub.includes(ufFiltro) && !it.rotulo.includes(ufFiltro)) s -= 2;
    return Math.round((s - PRIORIDADE[it.tipo] * 0.15) * 100) / 100;
  };
  const r = [];
  for (const it of indice) { const s = pontuar(it); if (s > 0) r.push([s, it]); }
  r.sort((a, b) => b[0] - a[0] || b[1].peso - a[1].peso);
  resultados = r.slice(0, 14).map(x => x[1]); ativo = -1;
  sugestoes.innerHTML = resultados.length ? resultados.map((it, i) => `<li role="option" id="sug-${i}" data-i="${i}"><span class="badge">${it.tipo}</span> <b>${esc(it.rotulo)}</b> <span class="muted">${esc(it.sub)}</span></li>`).join('')
    : `<li class="muted">Nada encontrado${locaisIndexados ? '' : ' (carregando escolas e bairros…)'}.</li>`;
  sugestoes.hidden = false;
}
entrada.addEventListener('input', buscar);
entrada.addEventListener('keydown', e => {
  if (sugestoes.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(0, Math.min(resultados.length - 1, ativo + (e.key === 'ArrowDown' ? 1 : -1))); sugestoes.querySelectorAll('li').forEach((li, i) => li.classList.toggle('ativo', i === ativo)); entrada.setAttribute('aria-activedescendant', 'sug-' + ativo); }
  else if (e.key === 'Enter') { const it = resultados[Math.max(0, ativo)]; if (it) escolher(it); }
  else if (e.key === 'Escape') sugestoes.hidden = true;
});
sugestoes.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); escolher(resultados[+li.dataset.i]); } });
entrada.addEventListener('blur', () => setTimeout(() => sugestoes.hidden = true, 150));
function escolher(it) { escolhendo = true; sugestoes.hidden = true; entrada.value = it.rotulo; entrada.blur(); mostrarAba('mapa'); selecionar(it.sel); }

// ---------- Controles do mapa ----------
const selMetrica = document.getElementById('metrica');
selMetrica.innerHTML = Object.entries(METRICAS).map(([k, m]) => `<option value="${k}">${m.nome}</option>`).join('');
selMetrica.onchange = () => { metrica = selMetrica.value; selecionar(selAtual || { tipo: 'brasil' }, { semHash: true }); };
document.getElementById('nivel').onchange = e => { nivelBrasil = e.target.value; selecionar({ tipo: 'brasil' }); };
// Ruas: ligadas, aparecem sozinhas a partir do zoom 9 (cidade). Desligadas, o mapa fica só com as cores.
const chkRuas = document.getElementById('ruas');
function atualizarRuas() {
  const querer = chkRuas.checked && mapa.getZoom() >= 9;
  if (querer === mapa.hasLayer(ruas)) return;
  if (querer) ruas.addTo(mapa).bringToBack(); else ruas.remove();
  document.getElementById('mapa').classList.toggle('com-ruas', querer);
  camadaUf.setStyle(camadaUf.options.style);
  for (const c of camadasMun.values()) if (mapa.hasLayer(c)) c.setStyle(c.options.style);
}
chkRuas.onchange = atualizarRuas;
mapa.on('zoomend', atualizarRuas);
document.getElementById('btn-brasil').onclick = () => selecionar({ tipo: 'brasil' });
document.getElementById('btn-exterior').onclick = () => selecionar({ tipo: 'uf', uf: 'ZZ' });

// ---------- Reprodução da apuração (ordem de chegada dos boletins ao TSE) ----------
const passos = (() => {
  const acum = {}; for (const uf of Object.keys(R.porUf)) acum[uf] = { secoes: 0, a: 0, b: 0 };
  return R.apuracao.map(b => {
    for (const [uf, [s, a, bb]] of Object.entries(b.ufs)) { acum[uf].secoes += s; acum[uf].a += a; acum[uf].b += bb; }
    return { min: b.min, ufs: Object.fromEntries(Object.entries(acum).map(([u, x]) => [u, { ...x }])) };
  });
})();
const deslizador = document.getElementById('tempo'), rotTempo = document.getElementById('tempo-rotulo'), btnPlay = document.getElementById('play');
deslizador.max = passos.length - 1; deslizador.value = passos.length - 1;
let timer = null;
function mostrarPasso(i) {
  const pz = passos[i];
  apuracaoAtiva = Object.fromEntries(Object.entries(pz.ufs).map(([u, x]) => [u, { ...vazio(), ...x }]));
  const t = Object.values(pz.ufs).reduce((s, x) => ({ secoes: s.secoes + x.secoes, a: s.a + x.a, b: s.b + x.b }), { secoes: 0, a: 0, b: 0 });
  const dia = pz.min >= 1440 ? '26/10' : '25/10', m = pz.min % 1440;
  rotTempo.innerHTML = `<b>${dia} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}</b> (horário do recebimento) · ${pct(t.secoes, R.total.secoes, 2)} das seções · ${esc(NOME_A)} <b>${pct(t.a, t.a + t.b, 2)}</b> × <b>${pct(t.b, t.a + t.b, 2)}</b> ${esc(NOME_B)}`;
  camadaUf.setStyle(f => { const g = apuracaoAtiva[f.properties.uf]; return { ...estilo(g, f.properties.uf, corCss('--borda-mapa')), fillOpacity: g.secoes ? 0.25 + 0.65 * g.secoes / R.porUf[f.properties.uf].secoes : 0.06 }; });
}
async function iniciarApuracao() {
  if (selAtual?.tipo !== 'brasil' || metrica !== 'resultado' || nivelBrasil !== 'uf') { metrica = 'resultado'; selMetrica.value = 'resultado'; nivelBrasil = 'uf'; document.getElementById('nivel').value = 'uf'; await selecionar({ tipo: 'brasil' }); }
  if (+deslizador.value >= passos.length - 1) deslizador.value = 0;
  btnPlay.textContent = '⏸ Pausar'; btnPlay.setAttribute('aria-pressed', 'true');
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  timer = setInterval(() => { const i = +deslizador.value + 1; if (i >= passos.length) { pararApuracao(false); return; } deslizador.value = i; mostrarPasso(i); }, reduzido ? 400 : 90);
}
function pararApuracao(limpar = true) {
  if (timer) { clearInterval(timer); timer = null; }
  btnPlay.textContent = '▶ Reproduzir apuração'; btnPlay.setAttribute('aria-pressed', 'false');
  if (limpar && apuracaoAtiva) { apuracaoAtiva = null; rotTempo.textContent = 'Arraste para ver o mapa em qualquer momento da apuração.'; deslizador.value = passos.length - 1; camadaUf.setStyle(camadaUf.options.style); }
}
btnPlay.onclick = () => timer ? pararApuracao(false) : iniciarApuracao();
deslizador.oninput = async () => { if (selAtual?.tipo !== 'brasil') await selecionar({ tipo: 'brasil' }); if (timer) { clearInterval(timer); timer = null; btnPlay.textContent = '▶ Reproduzir apuração'; } mostrarPasso(+deslizador.value); };

// ---------- Abas e tema ----------
function mostrarAba(nome) {
  document.querySelectorAll('[role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === nome)));
  document.querySelectorAll('[role="tabpanel"]').forEach(s => s.hidden = s.id !== 'aba-' + nome);
  if (nome === 'mapa') setTimeout(() => mapa.invalidateSize(), 50);
}
document.querySelectorAll('[role="tab"]').forEach(b => b.onclick = () => mostrarAba(b.dataset.aba));
function aplicarTema() {
  const escolhido = document.documentElement.dataset.theme;
  const escuro = escolhido ? escolhido === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.temaAtual = escuro ? 'escuro' : 'claro';
  if (selAtual) selecionar(selAtual, { semHash: true });
}
document.getElementById('tema').onclick = () => {
  const atual = document.documentElement.dataset.temaAtual;
  document.documentElement.dataset.theme = atual === 'escuro' ? 'light' : 'dark';
  try { localStorage.setItem('tema', document.documentElement.dataset.theme); } catch (e) { /* sem armazenamento */ }
  aplicarTema();
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema);
aplicarTema();

iniciarAnalises(R, { NOME_A, NOME_B, irPara: sel => { mostrarAba('mapa'); selecionar(sel); } });
await selecionar(selDoHash(), { semHash: true });
window.addEventListener('popstate', () => selecionar(selDoHash(), { semHash: true }));
document.body.classList.add('pronto');
