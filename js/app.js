// Painel da apuração: mapa de cor (UF → município → local de votação), busca e painel de detalhes.
import { UF_NOME, REGIAO_NOME, carregar, nf, pct, pp, hhmm, esc, norm, titulo, sigla, vazio, somar, corVantagem, CLASSES_VANTAGEM, classesQuantis, corSequencial, corCss } from './util.js?v=5bd908cf8b';
import { iniciarAnalises } from './analises.js?v=9aa3b4c2d2';
import { animarNumeros } from './anim.js?v=19eef1076c';
import { iniciarFaq } from './faq.js?v=34f0f37c46';
import { iniciarComparar } from './comparar.js?v=34f66a9946';

const R = await carregar('resumo.json');
const MUN = await carregar('municipios.json');
const ZON = await carregar('zonas.json');
const [CA, CB] = R.candidatos;
for (const [uf, g] of Object.entries(R.porUf)) g.uf = uf; // a variação 2022→2026 é procurada pela UF
const NOME_A = titulo(CA.nome), NOME_B = titulo(CB.nome);
document.querySelectorAll('[data-cand="a"]').forEach(e => e.textContent = NOME_A);
document.querySelectorAll('[data-cand="b"]').forEach(e => e.textContent = NOME_B);

// ---------- Acesso aos dados ----------
const aggMun = r => ({ ibge: r[0], secoes: r[5], aptos: r[6], comp: r[7], biom: r[8], a: r[9], b: r[10], br: r[11], nu: r[12], alertas: r[13], q17: r[16], q1730: r[17], q19: r[18], q1705: r[19] });
const aggZona = z => ({ secoes: z[3], aptos: z[4], comp: z[5], biom: z[6], a: z[7], b: z[8], br: z[9], nu: z[10], alertas: z[11], q17: z[12], q1730: z[13], q19: z[14], q1705: z[15] });
const aggLocal = l => ({ secoes: l[10], aptos: l[11], comp: l[12], biom: l[13], a: l[14], b: l[15], br: l[16], nu: l[17], alertas: l[18], q17: l[20], q1730: l[21], q19: l[22], q1705: l[23] });
const munPorIbge = new Map(MUN.filter(m => m[0]).map(m => [m[0], m]));
const nomeMun = ibge => munPorIbge.get(ibge)?.[2] ?? '';
const ufsDaRegiao = id => R.regioes[id];
const regiaoDaUf = uf => Object.keys(R.regioes).find(k => R.regioes[k].includes(uf));
const locaisDaUf = uf => carregar('locais/' + uf + '.json');
const secoesDaUf = uf => carregar('secoes/' + uf + '.json');

// ---------- Métricas do mapa ----------
const METRICAS = {
  resultado: { nome: 'Resultado (quem lidera)', curto: '% ' + NOME_A, valor: g => g.a + g.b ? g.a / (g.a + g.b) : NaN, dd: 'placar' },
  biometria: { nome: 'Sem habilitação biométrica (%)', curto: 'Sem hab. biom.', valor: g => g.comp ? g.biom / g.comp : NaN, dd: 'biom', explica: 'Eleitores com digital cadastrada liberados por documento, em % de quem votou.' },
  aptos: { nome: 'Aptos para votar (eleitores)', curto: 'Aptos', valor: g => g.aptos || NaN, dd: 'aptos', abs: true, explica: 'Eleitores aptos a votar nas seções deste recorte.' },
  compareceram: { nome: 'Compareceram (votantes)', curto: 'Votantes', valor: g => g.comp || NaN, dd: 'comp', abs: true, explica: 'Quantas pessoas votaram.' },
  abstencao: { nome: 'Abstenção (%)', curto: 'Abstenção', valor: g => g.aptos ? 1 - g.comp / g.aptos : NaN, dd: 'comp', explica: 'Aptos que não foram votar, em % dos aptos.' },
  comparecimento: { nome: 'Comparecimento (%)', curto: 'Comparec. %', valor: g => g.aptos ? g.comp / g.aptos : NaN, dd: 'comp', explica: 'Quem votou, em % dos eleitores aptos.' },
  brancosnulos: { nome: 'Brancos + nulos (%)', curto: 'Br.+nulos', valor: g => g.comp ? (g.br + g.nu) / g.comp : NaN, dd: 'brnu', explica: 'Votos em branco e nulos, em % de quem votou.' },
  apos17: { nome: 'Urnas encerradas após 17h05 (%)', curto: 'Após 17h05', valor: g => g.secoes ? g.q1705 / g.secoes : NaN, dd: 'apos17', explica: 'Urnas que fecharam depois de 17:05 de Brasília, em % das urnas: é onde houve fila de verdade. Contando qualquer segundo após 17:00:00, praticamente 100% das urnas entram (o fechamento leva alguns instantes), por isso o corte é 17:05.' },
  apos1730: { nome: 'Urnas encerradas após 17h30 (%)', curto: 'Após 17h30', valor: g => g.secoes ? g.q1730 / g.secoes : NaN, dd: 'apos17', explica: 'Urnas que fecharam depois de 17:30 de Brasília, em % das urnas. Fora do normal: no país, só 1,5% das urnas.' },
  apos19: { nome: 'Urnas encerradas após 19h (%)', curto: 'Após 19h', valor: g => g.secoes ? g.q19 / g.secoes : NaN, dd: 'apos17', explica: 'Urnas que fecharam depois de 19:00 de Brasília, em % das urnas. É o caso que pede explicação oficial (veja Análise › Horários).' },
  var13: { nome: 'Variação do 13 (2022→2026, p.p.)', curto: 'Δ 13 (p.p.)', valor: g => variacao(g, 1), dd: 'placar', div: true, pp: true, hist: true, explica: 'Quanto a % do candidato de número 13 nos votos válidos subiu (vermelho) ou caiu (azul) em relação a 2022, em pontos percentuais. Só para estados e municípios.' },
  varcomp: { nome: 'Variação do comparecimento (2022→2026, p.p.)', curto: 'Δ comparec. (p.p.)', valor: g => variacao(g, 0), dd: 'comp', pp: true, hist: true, explica: 'Quanto o comparecimento subiu ou caiu em relação a 2022, em pontos percentuais. Só para estados e municípios.' },
  alertas: { nome: 'Seções com alerta (%)', curto: 'Seç. c/ alerta', valor: g => g.secoes ? g.alertas / g.secoes : NaN, dd: 'alertas', explica: 'Seções com pelo menos um alerta automático, em % das seções.' }
};
let metrica = 'resultado';
let limites = [];
const cor = g => metrica === 'resultado' ? corVantagem(g.a, g.b) : METRICAS[metrica].div ? corVariacao(METRICAS[metrica].valor(g)) : corSequencial(METRICAS[metrica].valor(g), limites);
// Variação 2022→2026 (scripts/historico.mjs): colunas dComparecimentoPP, dPctAValidosPP, …
let HIST_MUN = null, HIST_UF = null;
const COL_UF = ['dComparecimentoPP', 'dPctAValidosPP'];
function variacao(g, i) {
  if (g.ibge && HIST_MUN) { const v = HIST_MUN[String(g.ibge)]; return v ? v[i] : NaN; }
  if (g.uf && HIST_UF) { const v = HIST_UF[g.uf]; return v ? v[COL_UF[i]] : NaN; }
  return NaN;
}
async function carregarHistorico() {
  if (HIST_MUN) return;
  const [m, r] = await Promise.all([carregar('historico-municipios.json'), carregar('historico-resumo.json')]);
  HIST_MUN = m.variacao2022a2026.municipios; HIST_UF = r.comparacao['2022-2026'].porUf;
}
// Divergente: vermelho = o 13 subiu, azul = caiu; mais forte = mais pontos.
const CLASSES_VAR = [0, 1, 3, 6];
function corVariacao(v) {
  if (!Number.isFinite(v)) return corCss('--sem-dado');
  const m = Math.abs(v), i = CLASSES_VAR.filter(x => m >= x).length;
  return corCss(`--${v >= 0 ? 'a' : 'b'}-${Math.max(1, i)}`);
}
// Valor formatado do indicador: número inteiro para os absolutos, % para as taxas.
const fmtValor = (v, M = METRICAS[metrica], casas = 2) => !Number.isFinite(v) ? '—' : M.abs ? nf(v) : M.pp ? pp(v, Math.min(casas, 2)) + ' p.p.' : pct(v, 1, casas);
const fmtMetrica = g => metrica === 'resultado' ? `${NOME_A} ${pct(g.a, g.a + g.b)} · ${NOME_B} ${pct(g.b, g.a + g.b)}` : `${METRICAS[metrica].curto}: ${fmtValor(METRICAS[metrica].valor(g))}`;

// ---------- Mapa ----------
const mapa = L.map('mapa', { zoomSnap: 0.25, minZoom: 3, maxZoom: 18, preferCanvas: true, attributionControl: true }).setView([-15, -54], 4);
mapa.attributionControl.setPrefix('').addAttribution('Malhas: <a href="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3">IBGE</a> · Dados: <a href="https://dadosabertos.tse.jus.br/">TSE</a>');
const render = L.canvas({ padding: 0.4 });
// Ruas do OpenStreetMap (sem chave). No tema escuro, o CSS escurece os ladrilhos.
const ruas = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'ruas-osm', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
const geoUf = await carregar('geo/uf.json');
const pontos = L.layerGroup().addTo(mapa);
// Capitais (IBGE) com nome; clique abre a cidade.
const CAPITAIS = [[1200401, 'Rio Branco', -9.975, -67.81], [2704302, 'Maceió', -9.665, -35.735], [1600303, 'Macapá', 0.035, -51.07], [1302603, 'Manaus', -3.119, -60.022], [2927408, 'Salvador', -12.971, -38.501], [2304400, 'Fortaleza', -3.732, -38.527], [5300108, 'Brasília', -15.794, -47.882], [3205309, 'Vitória', -20.315, -40.312], [5208707, 'Goiânia', -16.686, -49.265], [2111300, 'São Luís', -2.53, -44.303], [5103403, 'Cuiabá', -15.601, -56.097], [5002704, 'Campo Grande', -20.469, -54.62], [3106200, 'Belo Horizonte', -19.917, -43.934], [1501402, 'Belém', -1.455, -48.502], [2507507, 'João Pessoa', -7.115, -34.861], [4106902, 'Curitiba', -25.428, -49.273], [2611606, 'Recife', -8.047, -34.877], [2211001, 'Teresina', -5.089, -42.802], [3304557, 'Rio de Janeiro', -22.907, -43.173], [2408102, 'Natal', -5.795, -35.209], [4314902, 'Porto Alegre', -30.035, -51.218], [1100205, 'Porto Velho', -8.761, -63.9], [1400100, 'Boa Vista', 2.82, -60.672], [4205407, 'Florianópolis', -27.595, -48.548], [3550308, 'São Paulo', -23.55, -46.633], [2800308, 'Aracaju', -10.947, -37.073], [1721000, 'Palmas', -10.184, -48.333]];
const capitais = L.layerGroup().addTo(mapa);
function desenharCapitais() {
  capitais.clearLayers();
  for (const [ibge, nome, lat, lon] of CAPITAIS) {
    const m = munPorIbge.get(ibge), g = m && aggMun(m);
    L.circleMarker([lat, lon], { renderer: render, radius: 5, color: corCss('--tinta'), weight: 2, fillColor: g ? cor(g) : '#fff', fillOpacity: 1, interactive: true })
      .bindTooltip(`${esc(nome)}`, { permanent: true, direction: 'right', offset: [6, 0], className: 'rotulo-capital' })
      .on('click', () => selecionar({ tipo: 'municipio', ibge }))
      .addTo(capitais);
  }
}
// Rótulos das capitais só com zoom suficiente (no Brasil inteiro do celular eles se amontoam).
const ajustarRotulos = () => document.getElementById('mapa').classList.toggle('rotulos-capitais', mapa.getZoom() >= (mapa.getSize().x < 600 ? 5 : 4.5));
mapa.on('zoomend', ajustarRotulos);
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
    case 'endereco': return { tipo: 'brasil' };
    case 'secao': return { tipo: 'zona', uf: sel.uf, zona: sel.zona };
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
// Ícones (sprite no index.html).
const icone = nome => `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
// Aviso curto no canto da tela.
function avisar(txt) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = txt; t.classList.remove('ver'); void t.offsetWidth; t.classList.add('ver');
}
async function copiarLink() {
  try { await navigator.clipboard.writeText(location.href); avisar('Link copiado'); } catch (e) { avisar('Copie o endereço da barra do navegador'); }
}
function atualizarResumo(sel) {
  const el = document.getElementById('resumo-mapa');
  const h2 = document.querySelector('#painel h2'), barra = document.querySelector('#painel .placar-nomes');
  if (!el || !h2) return;
  const nomeLimpo = h2.cloneNode(true); nomeLimpo.querySelector('.compartilhar')?.remove();
  el.innerHTML = `<div class="resumo-nome">${nomeLimpo.innerHTML}</div><div class="resumo-placar">${barra ? barra.innerHTML : ''}</div><button class="botao" id="ir-painel">Detalhes ↓</button>`;
  el.querySelector('#ir-painel').onclick = () => document.getElementById('painel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// Limites das classes calculados sobre o que está visível no momento.
function recalcularLimites(grupos) {
  limites = metrica === 'resultado' || METRICAS[metrica].div ? [] : classesQuantis(grupos.map(g => METRICAS[metrica].valor(g)));
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
  desenharCapitais(); ajustarRotulos();
}
// Legenda de calor em cima do mapa (sempre à vista, inclusive no celular).
const ControleLegenda = L.Control.extend({ options: { position: 'bottomleft' }, onAdd() { const d = L.DomUtil.create('div', 'legenda-calor'); L.DomEvent.disableClickPropagation(d); return d; } });
const ctlLegenda = new ControleLegenda().addTo(mapa);
const curto = n => n.split(' ').slice(-1)[0];
// Cor da classe k (0 = abaixo do primeiro limite, n = acima do último). Infinity viraria "sem dado" (cinza).
const corDaClasse = k => !limites.length ? corSequencial(0, []) : corSequencial(k === 0 ? limites[0] - 1 : k === limites.length ? limites[limites.length - 1] + 1 : (limites[k - 1] + limites[k]) / 2, limites);
function legendaCalor() {
  const el = ctlLegenda.getContainer();
  if (metrica === 'resultado') {
    const lado = l => [4, 3, 2, 1].map(i => `<i style="background:var(--${l}-${i})"></i>`);
    el.innerHTML = `<div class="lc-titulo">Quem lidera</div><div class="lc-barra">${lado('a').join('')}${lado('b').reverse().join('')}</div><div class="lc-rot"><span><b>${esc(curto(NOME_A))}</b></span><span>50%</span><span><b>${esc(curto(NOME_B))}</b></span></div><div class="lc-rot"><span>mais folga</span><span>mais folga</span></div>`;
    return;
  }
  const M = METRICAS[metrica], n = limites.length;
  if (M.div) {
    el.innerHTML = `<div class="lc-titulo">${esc(M.nome)}</div><div class="lc-barra">${[4, 3, 2, 1].map(i => `<i style="background:var(--b-${i})"></i>`).join('')}${[1, 2, 3, 4].map(i => `<i style="background:var(--a-${i})"></i>`).join('')}</div><div class="lc-rot"><span>caiu 6+</span><span>0</span><span>subiu 6+</span></div>`;
    return;
  }
  const cores = Array.from({ length: n + 1 }, (_, k) => corDaClasse(k));
  el.innerHTML = `<div class="lc-titulo">${esc(M.nome)}</div><div class="lc-barra">${cores.map(c => `<i style="background:${c}"></i>`).join('')}</div><div class="lc-rot"><span>menos${n ? ' · ' + fmtValor(limites[0], M, 1) : ''}</span><span>${n ? fmtValor(limites[n - 1], M, 1) + ' · ' : ''}mais</span></div>`;
}
function desenharLegenda() {
  const el = document.getElementById('legenda');
  if (metrica === 'resultado') {
    const faixa = (lado, nome) => CLASSES_VANTAGEM.slice(0, -1).map((x, i) => `<span class="sw" style="background:var(--${lado}-${i + 1})" title="${esc(nome)} com ${Math.round(x * 100)}% a ${i === 3 ? '100' : Math.round(CLASSES_VANTAGEM[i + 1] * 100)}% dos válidos"></span>`);
    // Escala divergente: folga máxima de A ... 50% ... folga máxima de B.
    legendaCalor();
    el.innerHTML = `<span class="leg-nome">${esc(NOME_A)}</span>${faixa('a', NOME_A).reverse().join('')}<span class="leg-meio">50%</span>${faixa('b', NOME_B).join('')}<span class="leg-nome">${esc(NOME_B)}</span><span class="leg-nota">cor de quem lidera; mais forte = mais folga (50–55, 55–60, 60–70, 70%+ dos válidos)</span>`;
    return;
  }
  if (METRICAS[metrica].div) { el.innerHTML = `<span class="leg-nome">${esc(METRICAS[metrica].nome)}</span><span class="leg-nota">vermelho = o 13 subiu em relação a 2022; azul = caiu; faixas de 0–1, 1–3, 3–6 e 6+ pontos; cinza = sem dado (zonas, bairros e escolas não têm comparação)</span>`; legendaCalor(); return; }
  const n = limites.length, faixas = [], f1 = v => fmtValor(v, METRICAS[metrica], 1);
  for (let i = 0; i <= n; i++) {
    const de = i === 0 ? null : limites[i - 1], ate = i === n ? null : limites[i];
    const txt = de == null ? '< ' + f1(ate) : ate == null ? '≥ ' + f1(de) : f1(de) + '–' + f1(ate);
    faixas.push(`<span class="sw" style="background:${corDaClasse(i)}"></span><span class="leg-txt">${txt}</span>`);
  }
  el.innerHTML = `<span class="leg-nome">${esc(METRICAS[metrica].nome)}</span>${faixas.join('')}<span class="leg-nota">faixas com o mesmo número de áreas na tela; cinza = sem dado</span>`;
  legendaCalor();
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
function recalcularLimitesPontos(lista) { if (metrica !== 'resultado' && !METRICAS[metrica].div) limites = classesQuantis(lista.map(l => METRICAS[metrica].valor(aggLocal(l)))); desenharLegenda(); }

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
  if (sel.tipo !== 'endereco' && marcaEndereco) { marcaEndereco.remove(); marcaEndereco = null; }
  if (document.activeElement !== entrada && !escolhendo) entrada.value = '';
  escolhendo = false;
  selAtual = sel;
  // pushState: o botão Voltar do navegador/celular volta para o recorte anterior.
  if (!semHash && location.hash.slice(1) !== hashDe(sel)) history.pushState(null, '', '#' + hashDe(sel));
  const p = document.getElementById('painel');
  p.innerHTML = '<div class="esqueleto" aria-label="Carregando"><i></i><i></i><i></i><i></i><i></i></div>';
  btnSubir.style.visibility = sel.tipo === 'brasil' ? 'hidden' : 'visible';
  try {
    await (ROTAS[sel.tipo] || ROTAS.brasil)(sel, p);
    // Botão de compartilhar ao lado do título de qualquer recorte.
    const h2 = p.querySelector('h2');
    if (h2) { const b = document.createElement('button'); b.className = 'botao icone mini compartilhar'; b.title = 'Copiar link deste recorte'; b.setAttribute('aria-label', 'Copiar link deste recorte'); b.innerHTML = icone('link'); b.onclick = copiarLink; h2.append(b); }
    atualizarResumo(sel); animarNumeros(p);
    if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) navigator.vibrate(8);
  }
  catch (e) { p.innerHTML = `<p class="erro">Não consegui abrir este recorte: ${esc(e.message)}</p>`; console.error(e); }
  document.querySelectorAll('.migalha [data-ir]').forEach(b => b.onclick = () => selecionar(JSON.parse(b.dataset.ir)));
}
const ir = sel => esc(JSON.stringify(sel));
function migalhas(itens) {
  return `<nav class="migalha" aria-label="Você está em">${itens.map(([txt, sel], i) => i === itens.length - 1 ? `<span>${txt}</span>` : `<button data-ir="${ir(sel)}">${txt}</button>`).join(' › ')}</nav>`;
}

function cabecalho(tipo, nome, g, extra = '') {
  const v = g.a + g.b;
  const M = METRICAS[metrica], foco = k => M.dd === k ? ' class="foco"' : '';
  const vMet = M.valor(g), vBr = M.valor(R.totalBrasil);
  const blocoFoco = metrica === 'resultado' ? '' : `<div class="metrica-foco" style="--cor:${corSequencial(vMet, limites)}">
    <div><span class="tipo">Cor do mapa: ${esc(M.nome)}</span><b data-contar>${fmtValor(vMet)}</b>
    <span class="small">${M.abs ? `${pct(vMet, vBr, 2)} do total do Brasil (${nf(vBr)})` : `Brasil: ${pct(vBr, 1, 2)} · ${Number.isFinite(vMet) && Number.isFinite(vBr) ? (vMet >= vBr ? '+' : '−') + Math.abs(100 * (vMet - vBr)).toFixed(2).replace('.', ',') + ' p.p. em relação à média' : ''}`}</span></div>
    <p class="small muted">${esc(M.explica)} As listas abaixo estão ordenadas por este indicador.</p></div>`;
  return `<div class="tipo">${tipo}</div><h2>${nome}</h2>${extra}${blocoFoco}
  <div class="placar" role="img" aria-label="${esc(NOME_A)} ${pct(g.a, v)}, ${esc(NOME_B)} ${pct(g.b, v)} dos votos válidos">
    <div class="placar-nomes"><span><i class="ponto a"></i>${esc(NOME_A)} <b>${pct(g.a, v, 2)}</b></span><span><b>${pct(g.b, v, 2)}</b> ${esc(NOME_B)}<i class="ponto b"></i></span></div>
    <div class="barra"><span class="seg a" style="width:${v ? 100 * g.a / v : 50}%"></span><span class="seg b" style="width:${v ? 100 * g.b / v : 50}%"></span></div>
    <div class="placar-nomes small"><span>${nf(g.a)} votos</span><span>${nf(g.b)} votos</span></div>
  </div>
  <dl class="numeros">
    <div><dt>Seções</dt><dd>${nf(g.secoes)}</dd></div>
    <div${foco('aptos')}><dt>Aptos para votar</dt><dd>${nf(g.aptos)}</dd></div>
    <div${foco('comp')}><dt>Compareceram</dt><dd>${nf(g.comp)} <small>${pct(g.comp, g.aptos)}</small></dd></div>
    <div><dt>Diferença</dt><dd>${nf(Math.abs(g.a - g.b))} <small>votos</small></dd></div>
    <div${foco('brnu')}><dt>Brancos</dt><dd>${nf(g.br)} <small>${pct(g.br, g.comp)}</small></dd></div>
    <div${foco('brnu')}><dt>Nulos</dt><dd>${nf(g.nu)} <small>${pct(g.nu, g.comp)}</small></dd></div>
    <div${foco('biom')} title="Eleitores com biometria cadastrada que foram liberados para votar sem a digital (campo QT_ELEI_BIOM_SEM_HABILITACAO)"><dt>Sem habilitação biométrica</dt><dd>${nf(g.biom)} <small>${pct(g.biom, g.comp, 2)}</small></dd></div>
    <div${foco('apos17')} title="Urnas que fecharam depois de 17:05, 17:30 e 19:00 (horário de Brasília). Depois de 17:00:00 em ponto: quase todas."><dt>Urnas fechadas após 17h05 · 17h30 · 19h</dt><dd>${nf(g.q1705)} <small>${pct(g.q1705, g.secoes)}</small> · ${nf(g.q1730)} · ${nf(g.q19)}</dd></div>
    <div${foco('alertas')} title="Seções com pelo menos um alerta automático (veja a aba Alertas)"><dt>Seções com alerta</dt><dd>${nf(g.alertas)}</dd></div>
  </dl>`;
}

// Tabela clicável com filtro e ordenação.
function tabela(p, titulo_, colunas, linhas, aoClicar, { limite = 120, ordem = null, agg = null } = {}) {
  // Com um indicador escolhido no mapa, a lista ganha a coluna dele (com a cor do mapa) e vem ordenada por ela.
  agg ??= colunas.find(c => c.agg)?.agg;
  if (agg && metrica !== 'resultado') {
    const M = METRICAS[metrica];
    colunas = [...colunas.filter(c => c.t !== M.curto), { t: M.curto, num: true, foco: true, v: l => { const x = M.valor(agg(l)); return Number.isFinite(x) ? x : null; }, f: l => { const x = M.valor(agg(l)); return `<span class="chip" style="background:${corSequencial(x, limites)}"></span>${fmtValor(x, M)}`; } }];
    ordem = [colunas.length - 1, -1];
  }
  const box = document.createElement('section');
  box.className = 'lista';
  box.innerHTML = `<div class="lista-topo"><h3>${titulo_} <small>(${nf(linhas.length)})</small></h3>${linhas.length > 8 ? '<input type="search" placeholder="Filtrar…" aria-label="Filtrar lista">' : ''}</div><div class="tabela-rolagem"><table><thead><tr>${colunas.map((c, i) => `<th data-i="${i}" class="${c.num ? 'num' : ''}${c.foco ? ' foco' : ''}" title="Ordenar">${c.t}</th>`).join('')}</tr></thead><tbody></tbody></table></div><p class="small mais"></p>`;
  p.append(box);
  let filtro = '', ord = ordem ?? [colunas.findIndex(c => c.num), -1], mostrar = limite;
  const tbody = box.querySelector('tbody');
  function desenhar() {
    let ls = filtro ? linhas.filter(l => norm(colunas.map(c => c.busca ? c.busca(l) : '').join(' ')).includes(filtro)) : linhas.slice();
    if (ord[0] >= 0) { const c = colunas[ord[0]]; ls.sort((x, y) => { const a = c.v(x), b = c.v(y); return (typeof a === 'string' ? a.localeCompare(b) : (a ?? -Infinity) - (b ?? -Infinity)) * ord[1]; }); }
    tbody.innerHTML = ls.slice(0, mostrar).map((l, i) => `<tr tabindex="0" data-i="${linhas.indexOf(l)}">${colunas.map(c => `<td class="${c.num ? 'num' : ''}${c.foco ? ' foco' : ''}">${c.f ? c.f(l) : esc(c.v(l))}</td>`).join('')}</tr>`).join('');
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
const colVantagem = g => ({ agg: g, t: `% ${esc(NOME_A)}`, num: true, v: l => { const x = g(l); return x.a + x.b ? x.a / (x.a + x.b) : null; }, f: l => { const x = g(l); return `<span class="chip" style="background:${corVantagem(x.a, x.b)}"></span>${pct(x.a, x.a + x.b)}`; } });
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
    await blocoContexto(p, 'BR', 'uf');
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
    await blocoContexto(p, uf, 'uf');
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
    if (uf !== 'ZZ') await blocoContexto(p, String(m[0]), 'mun');
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
    const secs = (await secoesDaUf(sel.uf)).filter(s => s[2] === l[0]);
    tabela(p, 'Seções (urnas) deste local', [
      { t: 'Seção', num: true, v: s => s[1], f: s => `<b>${s[1]}</b>` },
      { t: 'Aptos', num: true, v: s => s[3], f: s => nf(s[3]) },
      { t: 'Votaram', num: true, v: s => s[4], f: s => nf(s[4]) },
      { t: esc(NOME_A), num: true, v: s => s[7], f: s => nf(s[7]) },
      { t: esc(NOME_B), num: true, v: s => s[8], f: s => nf(s[8]) },
      { t: 'Sem hab. biom.', num: true, v: s => s[6], f: s => nf(s[6]) },
      { t: 'Fechou (Brasília)', num: true, v: s => s[13], f: s => s[13] == null ? '—' : hhmm(s[13]) },
      { t: 'Alertas', v: s => s[17], f: s => s[17] ? '<span class="chip-alerta">!</span>' : '' }
    ], secs, s => selecionar({ tipo: 'secao', uf: sel.uf, zona: s[0], secao: s[1] }), { ordem: [0, 1] });
    tabelaLocais(p, doMun.filter(x => x !== l), sel.uf, 'Outros locais da mesma zona neste município');
  },
  async secao(sel, p) {
    const secs = await secoesDaUf(sel.uf), s = secs.find(x => x[0] === sel.zona && x[1] === sel.secao);
    if (!s) { p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], [sel.uf, { tipo: 'uf', uf: sel.uf }], ['Zona ' + sel.zona, { tipo: 'zona', uf: sel.uf, zona: sel.zona }], ['Seção ' + sel.secao]]) + `<p>Não existe a seção <b>${sel.secao}</b> na zona <b>${sel.zona}</b> de ${sigla(sel.uf)} nos boletins do 2º turno. Ela pode ter sido agregada a outra seção.</p>`; return; }
    const todos = await locaisDaUf(sel.uf), l = todos[s[2]];
    if (sel.uf !== 'ZZ' && l) {
      ufMunicipios = sel.uf; foco = new Set([l[1]]);
      await desenharPoligonos(); await desenharPontos(todos.filter(x => x[1] === l[1] && x[2] === l[2]), sel.uf, l[0]);
      if (l[8] != null) mapa.flyTo([l[8], l[9]], 16, { duration: 0.6 });
    }
    const g = { secoes: 1, aptos: s[3], comp: s[4], biom: s[6], a: s[7], b: s[8], br: s[9], nu: s[10], alertas: s[17] ? 1 : 0, q17: s[13] > 1020 ? 1 : 0, q1705: s[13] > 1025 ? 1 : 0, q1730: s[13] > 1050 ? 1 : 0, q19: s[13] > 1140 ? 1 : 0 };
    const fuso = s[13] != null && s[12] != null ? s[13] - s[12] : 0;
    const t = v => v == null ? '—' : hhmm(v);
    p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], [sel.uf, { tipo: 'uf', uf: sel.uf }], ['Zona ' + sel.zona, { tipo: 'zona', uf: sel.uf, zona: sel.zona }], [l ? esc(titulo(l[4])) : 'Local', l ? { tipo: 'local', uf: sel.uf, id: l[0] } : { tipo: 'zona', uf: sel.uf, zona: sel.zona }], ['Seção ' + sel.secao]]) +
      cabecalho('Seção eleitoral (uma urna)', `Seção ${sel.secao} · Zona ${sel.zona} · ${sigla(sel.uf)}`, g, l ? `<p class="small">${esc(titulo(l[4]))} · ${esc(titulo(l[6]))} · ${esc(nomeMun(l[1]) || '')}</p>` : '');
    const box = document.createElement('section'); box.className = 'lista bu';
    box.innerHTML = `<h3>${icone('urna')} Boletim desta urna</h3>
      <dl class="numeros">
        <div><dt>Abertura</dt><dd>${t(s[11])} <small>local</small></dd></div>
        <div><dt>Encerramento</dt><dd>${t(s[12])} <small>local · ${t(s[13])} Brasília</small></dd></div>
        <div><dt>Boletim recebido</dt><dd>${s[14] == null ? '—' : (s[14] >= 1440 ? '26/10 ' : '') + t(s[14] % 1440)} <small>Brasília</small></dd></div>
        <div><dt>Abstenções</dt><dd>${nf(s[5])} <small>${pct(s[5], s[3])}</small></dd></div>
        <div><dt>Tipo da urna</dt><dd>${esc(s[15] || 'Apurada')}${s[16] ? ' <small>(seção agregada)</small>' : ''}</dd></div>
        <div><dt>Fuso aplicado</dt><dd>${fuso ? '+' + fuso / 60 + ' h' : 'Brasília'}</dd></div>
      </dl>
      ${s[17] ? `<p class="nota">${icone('alerta')} ${s[17].split(',').map(k => esc(R.alertas.tipos[k])).join('; ')}</p>` : '<p class="muted small">Nenhum alerta automático nesta seção.</p>'}
      <p class="fonte">ⓘ Fonte: <a href="${R.meta.fonte}" target="_blank" rel="noopener">TSE · Boletim de urna</a>. Para ver o boletim original (imagem e QR Code), use <a href="https://resultados.tse.jus.br/" target="_blank" rel="noopener">resultados.tse.jus.br</a> ou o app "Boletim na Mão".</p>`;
    const prim = p.querySelector('.lista'); prim ? p.insertBefore(box, prim) : p.append(box);
  }
};
const UF_ISO = Object.fromEntries(Object.keys(UF_NOME).map(u => ['BR-' + u, u]));
let marcaEndereco = null;
ROTAS.endereco = async (sel, p) => {
  p.innerHTML = '<p class="muted">Procurando o endereço no OpenStreetMap…</p>';
  // Nominatim (OpenStreetMap): uma busca por escolha, só no Brasil. Política de uso: baixo volume, com atribuição.
  // Com coordenadas (botão "Perto de mim"), a busca é reversa: só serve para saber o estado e o nome do lugar.
  const base = 'https://nominatim.openstreetmap.org/';
  const url = sel.lat != null
    ? `${base}reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=pt-BR&lat=${sel.lat}&lon=${sel.lon}`
    : `${base}search?format=jsonv2&addressdetails=1&limit=1&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(sel.q)}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } }).then(x => x.json());
  const r = sel.lat != null ? (resp && !resp.error ? [{ ...resp, lat: sel.lat, lon: sel.lon, name: 'Você está aqui' }] : []) : resp;
  if (!r.length) { p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], ['Endereço']]) + `<p>Não achei "<b>${esc(sel.q || 'sua localização')}</b>". Tente com cidade e estado, por exemplo: <i>Rua da Bahia, Belo Horizonte, MG</i>.</p>`; return; }
  const lugar = r[0], lat = +lugar.lat, lon = +lugar.lon;
  const uf = UF_ISO[lugar.address?.['ISO3166-2-lvl4']] || null;
  if (!uf) throw Error('não consegui identificar o estado deste lugar (o painel cobre só o Brasil)');
  const todos = await locaisDaUf(uf);
  const dist = l => { const dy = (l[8] - lat) * 111.32, dx = (l[9] - lon) * 111.32 * Math.cos(lat * Math.PI / 180); return Math.hypot(dx, dy); };
  const perto = todos.filter(l => l[8] != null).map(l => [dist(l), l]).sort((a, b) => a[0] - b[0]).slice(0, 12);
  ufMunicipios = uf; foco = new Set(perto.map(([, l]) => l[1]));
  await desenharPoligonos(); await desenharPontos(perto.map(([, l]) => l), uf);
  if (marcaEndereco) marcaEndereco.remove();
  marcaEndereco = L.marker([lat, lon], { title: lugar.display_name }).addTo(mapa).bindTooltip(sel.lat != null ? 'Você está aqui' : 'Endereço procurado');
  mapa.flyToBounds(L.latLngBounds([[lat, lon], ...perto.slice(0, 5).map(([, l]) => [l[8], l[9]])]).pad(0.25), { maxZoom: 16, duration: 0.6 });
  const g = perto.reduce((s, [, l]) => somar(s, aggLocal(l)), vazio());
  p.innerHTML = migalhas([['Brasil', { tipo: 'brasil' }], [uf, { tipo: 'uf', uf }], ['Perto do endereço']]) +
    cabecalho('Perto de um endereço (12 locais de votação mais próximos)', esc(lugar.name || sel.q), g, `<p class="small">${esc(lugar.display_name)}</p>
    <div class="zona-perto">Zona eleitoral do local mais próximo: <button class="link" data-ir="${ir({ tipo: 'zona', uf, zona: perto[0][1][2] })}"><b>Zona ${perto[0][1][2]} · ${uf}</b></button> (${esc(titulo(perto[0][1][4]))}). <span class="muted">Sua zona de verdade é a do seu título de eleitor; confira no app e-Título.</span></div><p class="fonte">ⓘ Endereço localizado pelo <a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap (Nominatim)</a>. Resultados: TSE.</p>`);
  p.querySelector('.zona-perto [data-ir]').onclick = e => selecionar(JSON.parse(e.currentTarget.dataset.ir));
  tabela(p, 'Locais de votação mais próximos', [
    { t: 'Distância', num: true, v: l => dist(l), f: l => dist(l) < 1 ? Math.round(dist(l) * 1000) + ' m' : dist(l).toFixed(1).replace('.', ',') + ' km' },
    { t: 'Local', v: l => l[4], f: l => esc(titulo(l[4])), busca: l => l[4] + ' ' + l[5] },
    { t: 'Bairro', v: l => l[5], f: l => esc(titulo(l[5])) },
    { t: 'Zona', num: true, v: l => l[2] },
    colVantagem(aggLocal), colComp(aggLocal), colBio(aggLocal)
  ], perto.map(([, l]) => l), l => selecionar({ tipo: 'local', uf, id: l[0] }), { ordem: [0, 1] });
};
// Contexto oficial (IBGE + perfil do eleitorado do TSE). Carrega sob demanda e nunca trava o painel.
async function blocoContexto(p, chave, nivel) {
  let C;
  try { C = await carregar(nivel === 'mun' ? 'contexto-municipios.json' : 'contexto-uf.json'); } catch (e) { return; }
  const linha = C.dados[chave];
  if (!linha) return;
  const v = Object.fromEntries(C.colunas.map((c, i) => [c, linha[i]]));
  const f = (x, d = 0) => x == null ? '—' : x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const reais = x => x == null ? '—' : 'R$ ' + f(x);
  const itens = [
    ['Habitantes (Censo 2022)', f(v.pop2022), 'pop2022'], ['Estimativa 2026', f(v.popEstimada), 'popEstimada'],
    ['Área', f(v.areaKm2, v.areaKm2 < 100 ? 1 : 0) + ' km²', 'areaKm2'], ['Densidade', f(v.densidade, 1) + ' hab/km²', 'densidade'],
    ['60 anos ou mais', f(v.pct60mais, 1) + '%', 'pct60mais'], ['16 a 29 anos', f(v.pct16a29, 1) + '%', 'pct16a29'],
    ['Alfabetização (15+)', f(v.alfabetizacao15, 1) + '%', 'alfabetizacao15'], ['PIB per capita (2023)', reais(v.pibPerCapita), 'pibPerCapita'],
    ['Renda domiciliar per capita (média)', reais(v.rendaPcMedia), 'rendaPcMedia'], ['Renda per capita (mediana)', reais(v.rendaPcMediana), 'rendaPcMediana'],
    ...(v.giniRendaPc != null ? [['Índice de Gini da renda', f(v.giniRendaPc, 3), 'giniRendaPc']] : []),
    ['Eleitores (perfil TSE 2026)', f(v.eleitores), 'eleitores'], ['Eleitoras (mulheres)', f(v.eleitPctFeminino, 1) + '%', 'eleitPctFeminino'],
    ['Eleitores com 60+', f(v.eleitPct60mais, 1) + '%', 'eleitPct60mais'], ['Eleitores de 16–17', f(v.eleitPct16a17, 1) + '%', 'eleitPct16a17'],
    ['Superior completo (declarado)', f(v.eleitPctSuperior, 1) + '%', 'eleitPctSuperior'], ['Com biometria cadastrada', f(v.eleitPctBiometria, 1) + '%', 'eleitPctBiometria']
  ];
  const box = document.createElement('section');
  box.className = 'lista contexto';
  box.innerHTML = `<h3>Quem mora e quem vota aqui</h3><dl class="numeros contexto-num">${itens.map(([r, val, k]) => `<div title="${esc(C.fontes[k]?.nome || '')}"><dt>${r}</dt><dd>${val}</dd></div>`).join('')}</dl>
    <p class="fonte">ⓘ Fonte: <a href="https://sidra.ibge.gov.br/" target="_blank" rel="noopener">IBGE · Censo 2022, Estimativas 2026 e PIB dos Municípios 2023 (SIDRA)</a> · <a href="https://dadosabertos.tse.jus.br/" target="_blank" rel="noopener">TSE · Perfil do eleitorado 2026</a>. Passe o mouse em cada número para ver a tabela exata. Os anos são diferentes; servem para dar contexto, não para explicar o voto.</p>`;
  const primeiraLista = p.querySelector('.lista');
  primeiraLista ? p.insertBefore(box, primeiraLista) : p.append(box);
}
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
  return { brasil: 'brasil', regiao: 'regiao=' + s.id, uf: 'uf=' + s.uf, municipio: s.ibge ? 'mun=' + s.ibge : 'ext=' + s.tse, zona: `zona=${s.uf}-${s.zona}`, local: `local=${s.uf}-${s.id}`, bairro: `bairro=${s.uf}-${s.ibge}-${encodeURIComponent(s.bairro)}`, regiaoIbge: `rib=${s.uf}-${s.nivel}-${encodeURIComponent(s.nome)}`, secao: `secao=${s.uf}-${s.zona}-${s.secao}`, endereco: s.lat != null ? `perto=${s.lat.toFixed(4)},${s.lon.toFixed(4)}` : 'end=' + encodeURIComponent(s.q) }[s.tipo] || 'brasil';
}
function selDoHash() {
  const [k, v = ''] = decodeURIComponent(location.hash.slice(1)).split('=');
  const p = v.split('-');
  return {
    regiao: { tipo: 'regiao', id: v }, uf: { tipo: 'uf', uf: v }, mun: { tipo: 'municipio', ibge: +v }, ext: { tipo: 'municipio', uf: 'ZZ', tse: +v },
    zona: { tipo: 'zona', uf: p[0], zona: +p[1] }, local: { tipo: 'local', uf: p[0], id: +p[1] }, bairro: { tipo: 'bairro', uf: p[0], ibge: +p[1], bairro: p.slice(2).join('-') },
    rib: { tipo: 'regiaoIbge', uf: p[0], nivel: p[1], nome: p.slice(2).join('-') }, end: { tipo: 'endereco', q: v }, secao: { tipo: 'secao', uf: p[0], zona: +p[1], secao: +p[2] }, perto: { tipo: 'endereco', lat: +v.split(',')[0], lon: +v.split(',')[1] }
  }[k] || { tipo: 'brasil' };
}

// ---------- Busca ----------
const entrada = document.getElementById('busca'), sugestoes = document.getElementById('sugestoes');
const indice = [];
const nomeUf = sub => (sub.match(/\b([A-Z]{2})\b/g) || []).map(u => UF_NOME[u]?.split(' — ')[0] || '').join(' ');
const add = (tipo, rotulo, sub, sel, extra = '', peso = 0) => indice.push({ tipo, rotulo, sub, sel, peso, chave: norm(rotulo + ' ' + extra), chaveSub: norm(sub + ' ' + nomeUf(sub)) });
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
const PRIORIDADE = { Seção: 0, Estado: 0, Região: 1, Município: 2, 'Zona eleitoral': 3, 'Região intermediária': 4, 'Região imediata': 5, Bairro: 6, 'Local de votação': 7, Exterior: 8 };
const ICONE_TIPO = { Estado: 'bandeira', Região: 'globo', Município: 'cidade', 'Zona eleitoral': 'camadas', 'Região intermediária': 'globo', 'Região imediata': 'globo', Bairro: 'casa', 'Local de votação': 'escola', Exterior: 'globo', Endereço: 'pino', Seção: 'urna' };
let resultados = [], ativo = -1;
function buscar() {
  const q = norm(entrada.value);
  if (q.length < 2) { sugestoes.hidden = true; return; }
  const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o']);
  const termos = q.split(' ').filter(t => !VAZIAS.has(t));
  if (!termos.length) { sugestoes.hidden = true; return; }
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
  // Zona + seção ("zona 5 seção 120", "z5 s120", "ze 5 sec 120 sp"): uma sugestão por zona com esse número.
  const mz = /\b(?:zona|ze|z)\s*(\d+)/.exec(q), ms = /\b(?:secao|sec|se|s)\s*(\d+)/.exec(q);
  if (mz && ms) {
    const nz = +mz[1], ns = +ms[1];
    for (const z of ZON) if (z[1] === nz && (!ufFiltro || z[0] === ufFiltro)) {
      const sub = z[2].slice(0, 3).map(nomeMun).join(', ') + ' · ' + z[0];
      const extra = norm(sub + ' ' + (UF_NOME[z[0]] || ''));
      const resto = termos.filter(t => !/^(zona|ze|z|secao|sec|se|s)?\d+$/.test(t) && !['zona', 'ze', 'secao', 'sec'].includes(t) && t !== (ufFiltro || '').toLowerCase());
      if (resto.every(t => extra.includes(t))) r.push([100 + z[5] / 1e9, { tipo: 'Seção', rotulo: `Seção ${ns} · Zona ${nz} · ${z[0]}`, sub, sel: { tipo: 'secao', uf: z[0], zona: nz, secao: ns }, peso: z[5] }]);
    }
  }
  for (const it of indice) { const s = pontuar(it); if (s > 0) r.push([s, it]); }
  r.sort((a, b) => b[0] - a[0] || b[1].peso - a[1].peso);
  resultados = r.slice(0, 13).map(x => x[1]); ativo = -1;
  // Sempre oferece procurar o texto como endereço no OpenStreetMap (rua, número, ponto de referência).
  if (q.length >= 4) resultados.push({ tipo: 'Endereço', rotulo: entrada.value.trim(), sub: 'procurar este endereço no mapa e ver as escolas de votação mais próximas', sel: { tipo: 'endereco', q: entrada.value.trim() } });
  sugestoes.innerHTML = resultados.length ? resultados.map((it, i) => `<li role="option" id="sug-${i}" data-i="${i}">${icone(ICONE_TIPO[it.tipo] || 'pino')}<span class="badge">${it.tipo}</span> <b>${esc(it.rotulo)}</b> <span class="muted">${esc(it.sub)}</span></li>`).join('')
    : `<li class="muted">Nada encontrado${locaisIndexados ? '' : ' (carregando escolas e bairros…)'}.</li>`;
  sugestoes.querySelectorAll('li[data-i]').forEach(li => { if (resultados[+li.dataset.i]?.tipo === 'Endereço') li.classList.add('sug-endereco'); });
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
selMetrica.onchange = async () => { if (METRICAS[selMetrica.value].hist) await carregarHistorico(); metrica = selMetrica.value; selecionar(selAtual || { tipo: 'brasil' }, { semHash: true }); };
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
// "Perto de mim": a localização fica só no navegador; vai ao OpenStreetMap apenas para saber o estado.
document.getElementById('btn-perto').onclick = () => {
  if (!navigator.geolocation) { alert('Este navegador não informa a localização. Busque pelo seu bairro ou endereço.'); return; }
  const b = document.getElementById('btn-perto'); b.disabled = true; b.innerHTML = `${icone('mira')}Localizando…`;
  navigator.geolocation.getCurrentPosition(
    pos => { b.disabled = false; b.innerHTML = `${icone('mira')}Perto de mim`; mostrarAba('mapa'); selecionar({ tipo: 'endereco', lat: pos.coords.latitude, lon: pos.coords.longitude }); },
    () => { b.disabled = false; b.innerHTML = `${icone('mira')}Perto de mim`; alert('Não deu para pegar sua localização. Busque pelo seu bairro, escola ou endereço.'); },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
};
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
  btnPlay.innerHTML = `${icone('pausa')}Pausar`; btnPlay.setAttribute('aria-pressed', 'true');
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  timer = setInterval(() => { const i = +deslizador.value + 1; if (i >= passos.length) { pararApuracao(false); return; } deslizador.value = i; mostrarPasso(i); }, reduzido ? 400 : 90);
}
function pararApuracao(limpar = true) {
  if (timer) { clearInterval(timer); timer = null; }
  btnPlay.innerHTML = `${icone('play')}Reproduzir apuração`; btnPlay.setAttribute('aria-pressed', 'false');
  if (limpar && apuracaoAtiva) { apuracaoAtiva = null; rotTempo.textContent = 'Arraste para ver o mapa em qualquer momento da apuração.'; deslizador.value = passos.length - 1; camadaUf.setStyle(camadaUf.options.style); }
}
btnPlay.onclick = () => timer ? pararApuracao(false) : iniciarApuracao();
deslizador.oninput = async () => { if (selAtual?.tipo !== 'brasil') await selecionar({ tipo: 'brasil' }); if (timer) { clearInterval(timer); timer = null; btnPlay.innerHTML = `${icone('play')}Reproduzir apuração`; } mostrarPasso(+deslizador.value); };

// ---------- Abas e tema ----------
function mostrarAba(nome) {
  document.querySelectorAll('[role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === nome)));
  document.querySelectorAll('[role="tabpanel"]').forEach(s => s.hidden = s.id !== 'aba-' + nome);
  if (nome === 'mapa') setTimeout(() => mapa.invalidateSize(), 50);
  const aba = document.getElementById('aba-' + nome); if (aba) animarNumeros(aba);
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

iniciarAnalises(R, { NOME_A, NOME_B, irPara: sel => { mostrarAba('mapa'); selecionar(sel); }, mostrarAba: nome => { mostrarAba(nome); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
iniciarFaq(R, { NOME_A, NOME_B });
iniciarComparar(R, { NOME_A, NOME_B, irPara: sel => { mostrarAba('mapa'); selecionar(sel); } });
await selecionar(selDoHash(), { semHash: true });
window.addEventListener('popstate', () => selecionar(selDoHash(), { semHash: true }));
document.body.classList.add('pronto');
