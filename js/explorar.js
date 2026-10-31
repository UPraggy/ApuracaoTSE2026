// Aba "Explorar": escolhe um indicador (eleição, programas sociais, saneamento, saúde, renda, eleitorado),
// mostra o ranking por estado ou município e um "bot"
// escreve a análise a partir dos números (regras fixas, sem IA).
import { UF_NOME, REGIAO_NOME, carregar, nf, pp, esc, norm, titulo, fonte } from './util.js?v=29dda3fef3';

// ---------- Indicadores ----------
// u = unidade: % · pp · rs (R$) · mil (por mil) · mil2 · idx · dens · bf (a cada 100 domicílios)
// el(g) calcula a partir dos votos; ctx = coluna de contexto-*.json; hist = coluna da variação 2022→2026.
const IND = [
  ['Eleição', [
    ['pctA', '% do 13 nos válidos', '%', { el: g => g.a + g.b ? 100 * g.a / (g.a + g.b) : null }],
    ['comp', 'Comparecimento', '%', { el: g => g.aptos ? 100 * g.comp / g.aptos : null }],
    ['abst', 'Abstenção', '%', { el: g => g.aptos ? 100 - 100 * g.comp / g.aptos : null }],
    ['bn', 'Brancos + nulos', '%', { el: g => g.comp ? 100 * (g.br + g.nu) / g.comp : null }],
    ['biom', 'Sem habilitação biométrica', '%', { el: g => g.comp ? 100 * g.biom / g.comp : null }],
    ['apos1705', 'Urnas fechadas após 17h05', '%', { el: g => g.secoes ? 100 * g.q1705 / g.secoes : null }],
    ['var13', 'Variação do 13 (2022→2026)', 'pp', { hist: 'dPctAValidosPP' }],
    ['varComp', 'Variação do comparecimento (2022→2026)', 'pp', { hist: 'dComparecimentoPP' }]]],
  ['Programas sociais', [
    ['bfPctDomicilios', 'Famílias no Bolsa Família (a cada 100 domicílios)', 'bf', { ctx: 'bfPctDomicilios' }],
    ['bfValorMedio', 'Valor médio do Bolsa Família', 'rs', { ctx: 'bfValorMedio' }],
    ['bpcPctPop', 'Recebem BPC (% da população)', '%', { ctx: 'bpcPctPop' }]]],
  ['Saneamento e moradia', [
    ['pctAguaRede', 'Água da rede geral', '%', { ctx: 'pctAguaRede' }],
    ['pctEsgotoRede', 'Esgoto ligado à rede', '%', { ctx: 'pctEsgotoRede' }],
    ['pctLixoColetado', 'Lixo coletado', '%', { ctx: 'pctLixoColetado' }],
    ['pctSemBanheiroExclusivo', 'Sem banheiro só da casa', '%', { ctx: 'pctSemBanheiroExclusivo' }],
    ['pctDomInternet', 'Domicílios com internet', '%', { ctx: 'pctDomInternet' }]]],
  ['Saúde', [
    ['apsCobertura', 'Cobertura da atenção básica', '%', { ctx: 'apsCobertura' }],
    ['preNatal7mais', 'Bebês com 7+ consultas de pré-natal', '%', { ctx: 'preNatal7mais' }],
    ['mortInfantil', 'Mortalidade infantil', 'mil', { ctx: 'mortInfantil' }],
    ['leitosSusPorMil', 'Leitos do SUS', 'mil2', { ctx: 'leitosSusPorMil' }]]],
  ['Renda e população', [
    ['rendaPcMedia', 'Renda por pessoa (média)', 'rs', { ctx: 'rendaPcMedia' }],
    ['rendaPcMediana', 'Renda por pessoa (mediana)', 'rs', { ctx: 'rendaPcMediana' }],
    ['pibPerCapita', 'PIB por habitante', 'rs', { ctx: 'pibPerCapita' }],
    ['idhm2010', 'IDHM (2010)', 'idx', { ctx: 'idhm2010' }],
    ['giniRendaPc', 'Desigualdade (Gini, só estados)', 'idx', { ctx: 'giniRendaPc', soUf: true }],
    ['pct60mais', 'População com 60+', '%', { ctx: 'pct60mais' }],
    ['pct16a29', 'População de 16 a 29 anos', '%', { ctx: 'pct16a29' }],
    ['alfabetizacao15', 'Alfabetização (15+)', '%', { ctx: 'alfabetizacao15' }],
    ['densidade', 'Densidade', 'dens', { ctx: 'densidade' }]]],
  ['Eleitorado', [
    ['eleitPctFeminino', 'Eleitoras (mulheres)', '%', { ctx: 'eleitPctFeminino' }],
    ['eleitPct60mais', 'Eleitores com 60+', '%', { ctx: 'eleitPct60mais' }],
    ['eleitPctSuperior', 'Eleitores com superior completo', '%', { ctx: 'eleitPctSuperior' }],
    ['eleitPctBiometria', 'Eleitores com biometria cadastrada', '%', { ctx: 'eleitPctBiometria' }]]]
];
const DEF = {};
for (const [grupo, itens] of IND) for (const [k, nome, u, o] of itens) DEF[k] = { k, nome, u, grupo, ...o };

// Unidade em que "pontos" faz sentido para a frase da inclinação.
const ehPct = u => u === '%' || u === 'pp' || u === 'bf';
function fmt(v, u) {
  if (v == null || !Number.isFinite(v)) return '—';
  const n = (x, d) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  return { '%': n(v, 1) + '%', pp: pp(v, 2) + ' p.p.', rs: 'R$ ' + nf(v), mil: n(v, 1) + ' por mil', mil2: n(v, 2) + ' por mil', idx: n(v, 3), dens: n(v, 1) + ' hab/km²', bf: n(v, 1) }[u] ?? n(v, 2);
}
// Diferença entre dois valores: em pontos para porcentagens, na própria unidade para o resto.
const dif = (v, u) => ehPct(u) ? Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' pontos' : fmt(Math.abs(v), u);
const unidadeDif = u => ({ '%': 'pontos', pp: 'pontos', bf: 'famílias a cada 100 domicílios', rs: 'reais', mil: 'por mil', mil2: 'por mil', idx: 'no índice', dens: 'hab/km²' })[u] || '';
const REG_DA_UF = {};
const COR_REG = { N: 'var(--reg-n)', NE: 'var(--reg-ne)', CO: 'var(--reg-co)', SE: 'var(--reg-se)', S: 'var(--reg-s)' };

// ---------- Estatística ponderada (peso = eleitores aptos) ----------
function estatisticas(pts) {
  const W = pts.reduce((s, p) => s + p.w, 0);
  if (!W || pts.length < 3) return null;
  const mx = pts.reduce((s, p) => s + p.w * p.x, 0) / W, my = pts.reduce((s, p) => s + p.w * p.y, 0) / W;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { sxx += p.w * (p.x - mx) ** 2; syy += p.w * (p.y - my) ** 2; sxy += p.w * (p.x - mx) * (p.y - my); }
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, b = sxx ? sxy / sxx : 0;
  const res = pts.map(p => ({ p, e: p.y - (my + b * (p.x - mx)) }));
  const sdRes = Math.sqrt(res.reduce((s, q) => s + q.p.w * q.e * q.e, 0) / W) || 1;
  return { mx, my, r, r2: r * r, b, sdRes, res };
}
const media = (lista, f) => { const W = lista.reduce((s, e) => s + e.w, 0); return W ? lista.reduce((s, e) => s + e.w * f(e), 0) / W : null; };

export async function iniciarExplorar(R, { NOME_A, irPara }) {
  const el = document.getElementById('aba-explorar');
  if (!el) return;
  for (const [reg, ufs] of Object.entries(R.regioes)) for (const u of ufs) REG_DA_UF[u] = reg;
  el.innerHTML = '<p class="muted">Carregando indicadores…</p>';
  const opc = f => f.catch(() => null);
  const [MUN, CU, CM, HR, HM] = await Promise.all([carregar('municipios.json'), opc(carregar('contexto-uf.json')), opc(carregar('contexto-municipios.json')), opc(carregar('historico-resumo.json')), opc(carregar('historico-municipios.json'))]);
  const col = C => C ? Object.fromEntries(C.colunas.map((c, i) => [c, i])) : {};
  const iCU = col(CU), iCM = col(CM), iHM = HM ? Object.fromEntries(HM.variacao2022a2026.colunas.map((c, i) => [c, i])) : {};
  const histUf = HR?.comparacao?.['2022-2026']?.porUf || {};

  // Entidades: { id, nome, uf, reg, w, g (votos), ctx(linha), hist }
  const ESTADOS = Object.keys(R.porUf).filter(u => u !== 'ZZ').map(uf => ({ id: uf, nome: UF_NOME[uf], uf, reg: REG_DA_UF[uf], w: R.porUf[uf].aptos, g: R.porUf[uf], ctx: CU?.dados[uf], ic: iCU, hist: k => histUf[uf]?.[k] }));
  const MUNICIPIOS = MUN.filter(m => m[0] && m[1] !== 'ZZ').map(m => ({
    id: m[0], nome: m[2], uf: m[1], reg: REG_DA_UF[m[1]], w: m[6],
    g: { secoes: m[5], aptos: m[6], comp: m[7], biom: m[8], a: m[9], b: m[10], br: m[11], nu: m[12], q1705: m[19] },
    ctx: CM?.dados[String(m[0])], ic: iCM, hist: k => { const v = HM?.variacao2022a2026.municipios[String(m[0])]; return v ? v[iHM[k]] : null; }
  }));
  const valor = (e, k) => {
    const d = DEF[k];
    if (d.el) return d.el(e.g);
    if (d.hist) return e.hist(d.hist) ?? null;
    if (d.ctx) { const i = e.ic[d.ctx]; return i == null || !e.ctx ? null : e.ctx[i]; }
    return null;
  };

  // ---------- Interface ----------
  const opcoes = sel => IND.map(([g, itens]) => `<optgroup label="${esc(g)}">${itens.map(([k, nome]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(nome)}</option>`).join('')}</optgroup>`).join('');
  el.innerHTML = `
    <h2>Explorar indicadores</h2>
    <p class="lead">Escolha um indicador e veja o ranking dos estados ou dos municípios. O assistente resume os números: média, maiores, menores e diferença entre regiões.</p>
    <div class="exp-controles">
      <label>Indicador <select id="exp-x">${opcoes('bfPctDomicilios')}</select></label>
      <label>Nível <select id="exp-nivel"><option value="uf">Estados</option><option value="mun">Municípios</option></select></label>
      <label>Região <select id="exp-reg"><option value="">Todas</option>${Object.keys(R.regioes).map(r => `<option value="${r}">${REGIAO_NOME[r]}</option>`).join('')}</select></label>
      <label class="exp-uf" hidden>Estado <select id="exp-uf"><option value="">Todos</option>${Object.keys(UF_NOME).filter(u => u !== 'ZZ').sort().map(u => `<option value="${u}">${u} — ${esc(UF_NOME[u])}</option>`).join('')}</select></label>
    </div>
    <div class="exp-grade so-ranking">
      <section class="bloco exp-ranking"><h3><svg class="ic" aria-hidden="true"><use href="#i-comparar"/></svg> <span id="exp-rk-titulo"></span></h3><div id="exp-rk-busca"></div><div id="exp-rk"></div></section>
    </div>
    <section class="bloco exp-bot"><div class="exp-bot-topo"><h3><svg class="ic" aria-hidden="true"><use href="#i-chat"/></svg> Assistente de análise</h3><button class="botao mini-txt" id="exp-copiar"><svg class="ic" aria-hidden="true"><use href="#i-link"/></svg>Copiar análise</button></div>
      <p class="muted small">Texto escrito por regras fixas a partir dos números da tela. Não é inteligência artificial e não dá opinião.</p>
      <div class="chat exp-chat" id="exp-chat" aria-live="polite"></div>
    </section>
    ${fonte('bu')}
    <p class="fonte">ⓘ Contexto: <a href="https://sidra.ibge.gov.br/" target="_blank" rel="noopener">IBGE (Censo 2022, Estimativas 2026, PIB 2023)</a> · <a href="https://portaldatransparencia.gov.br/download-de-dados" target="_blank" rel="noopener">Portal da Transparência (Bolsa Família e BPC, set/2026)</a> · <a href="https://datasus.saude.gov.br/" target="_blank" rel="noopener">Ministério da Saúde (DATASUS, atenção primária)</a> · <a href="https://dadosabertos.tse.jus.br/" target="_blank" rel="noopener">TSE (perfil do eleitorado 2026, eleições 2022)</a> · IDHM: PNUD/IBGE. Detalhes em <a href="https://github.com/UPraggy/ApuracaoTSE2026/blob/main/docs/CONTEXTO-DADOS.md" target="_blank" rel="noopener">docs/CONTEXTO-DADOS.md</a>.</p>`;

  const $ = s => el.querySelector(s);
  const selX = $('#exp-x'), selNivel = $('#exp-nivel'), selReg = $('#exp-reg'), selUf = $('#exp-uf');
  const ocultas = new Set();
  let textoAnalise = '', buscaMun = '';

  function entidades() {
    const nivel = selNivel.value, reg = selReg.value, uf = selUf.value;
    let lista = nivel === 'uf' ? ESTADOS : MUNICIPIOS;
    if (reg) lista = lista.filter(e => e.reg === reg);
    if (nivel === 'mun' && uf) lista = lista.filter(e => e.uf === uf);
    return lista;
  }

  function desenhar() {
    $('.exp-uf').hidden = selNivel.value !== 'mun';
    const kx = selX.value, dx = DEF[kx], nivel = selNivel.value;
    const lista = entidades().map(e => ({ e, x: valor(e, kx), w: e.w || 0 }));
    const comX = lista.filter(p => Number.isFinite(p.x));
    const rotNivel = nivel === 'uf' ? 'estados' : 'municípios';
    $('#exp-rk-titulo').textContent = `${dx.nome}${dx.u === 'bf' ? '' : ''} por ${nivel === 'uf' ? 'estado' : 'município'}`;
    desenharRanking(comX, dx, nivel);
    escreverAnalise(comX, dx, rotNivel, nivel);
  }

  // (a) Ranking em barras horizontais
  function desenharRanking(comX, dx, nivel) {
    const ord = comX.slice().sort((a, b) => b.x - a.x);
    const busca = $('#exp-rk-busca');
    let linhas;
    if (nivel === 'uf') { busca.innerHTML = ''; linhas = ord.map((p, i) => ({ p, pos: i + 1 })); }
    else {
      if (!busca.firstChild) {
        busca.innerHTML = '<input type="search" class="exp-busca" placeholder="Procurar município…" aria-label="Procurar município no ranking">';
        busca.firstChild.addEventListener('input', e => { buscaMun = norm(e.target.value); desenhar(); });
      }
      const pos = new Map(ord.map((p, i) => [p, i + 1]));
      if (buscaMun) linhas = ord.filter(p => norm(p.e.nome).includes(buscaMun)).slice(0, 30).map(p => ({ p, pos: pos.get(p) }));
      else linhas = [...ord.slice(0, 15).map(p => ({ p, pos: pos.get(p) })), ...(ord.length > 30 ? [{ sep: true }] : []), ...ord.slice(Math.max(15, ord.length - 15)).map(p => ({ p, pos: pos.get(p) }))];
    }
    const vals = comX.map(p => p.x), min = Math.min(0, ...vals), max = Math.max(...vals, 0);
    const larg = v => max === min ? 0 : 100 * (v - min) / (max - min), zero = larg(0);
    $('#exp-rk').innerHTML = !linhas.length ? '<p class="muted">Sem dados para este recorte.</p>' : `<ol class="exp-barras">${linhas.map(({ p, pos, sep }, i) => sep ? `<li class="exp-sep">… ${nf(ord.length - 30)} ${nivel === 'uf' ? 'estados' : 'municípios'} no meio …</li>` : `
      <li><button data-tipo="${nivel}" data-id="${p.e.id}" style="--i:${Math.min(i, 30)}" title="Abrir no mapa">
        <span class="exp-pos">${pos}º</span><span class="exp-nome">${esc(nivel === 'uf' ? p.e.nome : titulo(p.e.nome) + ' · ' + p.e.uf)}</span>
        <span class="exp-trilho"><i style="left:${Math.min(zero, larg(p.x))}%;width:${Math.abs(larg(p.x) - zero)}%;background:${COR_REG[p.e.reg]}"></i></span>
        <span class="exp-val">${fmt(p.x, dx.u)}</span></button></li>`).join('')}</ol>
      <p class="small muted">Cor da barra = região. Clique para abrir no mapa.${nivel === 'mun' ? ' Municípios pequenos oscilam mais.' : ''}</p>`;
  }

  // (c) "Bot" de análise: frases montadas por regras a partir das estatísticas.
  function escreverAnalise(comX, dx, rotNivel, nivel) {
    const msgs = [];
    const nomeDe = p => nivel === 'uf' ? p.e.nome : `${titulo(p.e.nome)} (${p.e.uf})`;
    const recorte = [selReg.value ? 'região ' + REGIAO_NOME[selReg.value] : '', nivel === 'mun' && selUf.value ? UF_NOME[selUf.value] : ''].filter(Boolean).join(', ') || 'Brasil';
    if (!comX.length) { msgs.push(`Não há dados de <b>${esc(dx.nome)}</b> para ${rotNivel} neste recorte.`); }
    else {
      const ord = comX.slice().sort((a, b) => b.x - a.x), mw = media(comX, p => p.x), ms = comX.reduce((s, p) => s + p.x, 0) / comX.length;
      const hi = ord[0], lo = ord[ord.length - 1];
      msgs.push(`<b>${esc(dx.nome)}</b> em ${comX.length} ${rotNivel} (${esc(recorte)}): média de <b>${fmt(mw, dx.u)}</b> pesando pelo eleitorado${Math.abs(mw - ms) > 1e-9 ? ` (${fmt(ms, dx.u)} na média simples, em que cada ${nivel === 'uf' ? 'estado' : 'município'} conta igual)` : ''}. O maior valor: <b>${esc(nomeDe(hi))}</b> (${fmt(hi.x, dx.u)}) e o menor: <b>${esc(nomeDe(lo))}</b> (${fmt(lo.x, dx.u)}), uma distância de ${dif(hi.x - lo.x, dx.u)}.`);
      if (!selReg.value) {
        const regs = Object.keys(R.regioes).map(r => ({ r, v: media(comX.filter(p => p.e.reg === r), p => p.x) })).filter(o => o.v != null).sort((a, b) => b.v - a.v);
        if (regs.length > 1) msgs.push(`Por região (média ponderada): ${regs.map(o => `${REGIAO_NOME[o.r]} ${fmt(o.v, dx.u)}`).join(' · ')}.`);
      }
    }
    if (comX.length >= 6) {
      const ord = comX.slice().sort((a, b) => b.x - a.x);
      msgs.push(`Os 3 maiores: ${ord.slice(0, 3).map(p => `${esc(nomeDe(p))} (${fmt(p.x, dx.u)})`).join(', ')}. Os 3 menores: ${ord.slice(-3).reverse().map(p => `${esc(nomeDe(p))} (${fmt(p.x, dx.u)})`).join(', ')}.`);
    }
    msgs.push(`<span class="muted">Números por ${nivel === 'uf' ? 'estado' : 'município'}. As fontes têm anos diferentes (Censo 2022, PIB 2023, benefícios de set/2026, eleição de 2026)${nivel === 'mun' ? '; em municípios pequenos as taxas oscilam mais' : ''}.</span>`);
    textoAnalise = msgs.map(t => t.replace(/<[^>]+>/g, '')).join('\n\n');
    const chat = $('#exp-chat'), reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const token = Symbol(); chat._token = token;
    chat.innerHTML = '';
    msgs.forEach((t, i) => {
      const mostrar = () => {
        if (chat._token !== token) return;
        const b = document.createElement('div'); b.className = 'bolha painel'; b.innerHTML = t; chat.append(b);
      };
      if (reduzido) mostrar();
      else {
        setTimeout(() => {
          if (chat._token !== token) return;
          const d = document.createElement('div'); d.className = 'bolha painel'; d.innerHTML = '<span class="digitando"><i></i><i></i><i></i></span>'; chat.append(d);
          setTimeout(() => { if (chat._token === token) d.innerHTML = t; }, 380);
        }, i * 520);
      }
    });
  }

  function abrir(nivel, id) { irPara(nivel === 'uf' ? { tipo: 'uf', uf: id } : { tipo: 'municipio', ibge: +id }); }
  $('#exp-rk').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (b) abrir(b.dataset.tipo, b.dataset.id); });
  $('#exp-copiar').onclick = async () => {
    const b = $('#exp-copiar');
    try { await navigator.clipboard.writeText(`${DEF[selX.value].nome}\n\n${textoAnalise}\n\nFonte: apuracao.rafaelmr.com.br (dados do TSE e do IBGE)`); b.lastChild.textContent = 'Copiado'; }
    catch (e) { b.lastChild.textContent = 'Não deu para copiar'; }
    setTimeout(() => { b.lastChild.textContent = 'Copiar análise'; }, 1800);
  };
  for (const s of [selX, selNivel, selReg, selUf]) s.addEventListener('change', () => {
    if (s === selNivel || s === selReg) { buscaMun = ''; $('#exp-rk-busca').innerHTML = ''; }
    desenhar();
  });
  desenhar();
  void NOME_A;
}
