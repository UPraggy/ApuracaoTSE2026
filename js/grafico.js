// Gráfico de linhas interativo: linha guia e dica que seguem o mouse ou o dedo, legenda que liga e desliga
// cada série e botão "tocar" que desenha a linha do começo ao fim (a apuração andando).
import { esc } from './util.js?v=551bd26ea6';

const NS = 'http://www.w3.org/2000/svg';

export function linhaInterativa(alvo, { series, xmin, xmax, ymin, ymax, fx, fy, rotulo, referencia = null, dica = null, tocar = false, faixa = null, ticksX = null }) {
  const L = 640, H = 270, m = { t: 14, r: 14, b: 34, l: 52 }, w = L - m.l - m.r, h = H - m.t - m.b;
  const X = x => m.l + w * (x - xmin) / (xmax - xmin), Y = y => m.t + h - h * (y - ymin) / (ymax - ymin);
  const ty = [0, 0.25, 0.5, 0.75, 1].map(f => ymin + f * (ymax - ymin)), tx = ticksX || [0, 0.25, 0.5, 0.75, 1].map(f => xmin + f * (xmax - xmin));
  const id = 'clip' + Math.random().toString(36).slice(2, 8);
  const faixas = faixa ? (Array.isArray(faixa) ? faixa : [faixa]) : [];
  alvo.classList.add('graf-int');
  alvo.innerHTML = `
    <div class="graf-topo">
      <div class="legenda-graf">${series.map((s, i) => `<button class="serie-btn" data-i="${i}" aria-pressed="true"><i style="background:${s.cor}"></i>${esc(s.nome)}</button>`).join('')}${faixas.map(f => `<span class="faixa-leg"><i style="background:${f.cor}"></i>${esc(f.nome)}</span>`).join('')}</div>
      ${tocar ? `<button class="botao mini-txt tocar"><svg class="ic" aria-hidden="true"><use href="#i-play"/></svg>Tocar</button>` : ''}
    </div>
    <div class="graf-area">
      <svg class="grafico" viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(rotulo)}">
        <defs><clipPath id="${id}"><rect x="0" y="0" width="${L}" height="${H}"/></clipPath></defs>
        ${ty.map(t => `<line x1="${m.l}" x2="${L - m.r}" y1="${Y(t)}" y2="${Y(t)}" class="grade"/><text x="${m.l - 6}" y="${Y(t) + 4}" class="eixo" text-anchor="end">${fy(t)}</text>`).join('')}
        ${tx.map(t => `<text x="${X(t)}" y="${H - 12}" class="eixo" text-anchor="middle">${fx(t)}</text>`).join('')}
        ${referencia != null ? `<line x1="${m.l}" x2="${L - m.r}" y1="${Y(referencia)}" y2="${Y(referencia)}" class="ref"/>` : ''}
        ${faixas.map(faixa => `<path class="faixa" d="${faixa.pts.map((p, k) => (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[2]).toFixed(1)).join('')}${faixa.pts.slice().reverse().map(p => 'L' + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('')}Z" fill="${faixa.cor}"/>`).join('')}
        <g clip-path="url(#${id})">${series.map((s, i) => `<path data-i="${i}" d="${s.pts.map((p, k) => (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('')}" fill="none" stroke="${s.cor}" stroke-width="2.4" class="linha-anim"/>`).join('')}</g>
        <line class="guia" x1="0" x2="0" y1="${m.t}" y2="${m.t + h}" visibility="hidden"/>
        ${series.map((s, i) => `<circle class="marca" data-i="${i}" r="5" fill="${s.cor}" visibility="hidden"/>`).join('')}
        <line x1="${m.l}" x2="${L - m.r}" y1="${m.t + h}" y2="${m.t + h}" class="base"/>
        <rect class="captura" x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="transparent"/>
      </svg>
      <div class="graf-dica" hidden></div>
    </div>`;
  const svg = alvo.querySelector('svg.grafico'), guia = svg.querySelector('.guia'), dicaEl = alvo.querySelector('.graf-dica');
  const marcas = [...svg.querySelectorAll('.marca')], caminhos = [...svg.querySelectorAll('path[data-i]')];
  const ativo = series.map(() => true);
  const clip = svg.querySelector(`#${id} rect`);

  // Ponto mais próximo de x em cada série (as séries podem ter x diferentes).
  const perto = (s, x) => { let melhor = 0, d = Infinity; s.pts.forEach((p, k) => { const dd = Math.abs(p[0] - x); if (dd < d) { d = dd; melhor = k; } }); return melhor; };
  function mostrar(x) {
    x = Math.max(xmin, Math.min(xmax, x));
    guia.setAttribute('x1', X(x)); guia.setAttribute('x2', X(x)); guia.setAttribute('visibility', 'visible');
    const linhas = [];
    series.forEach((s, i) => {
      if (!ativo[i] || !s.pts.length) { marcas[i].setAttribute('visibility', 'hidden'); return; }
      const k = perto(s, x), p = s.pts[k];
      marcas[i].setAttribute('cx', X(p[0])); marcas[i].setAttribute('cy', Y(p[1])); marcas[i].setAttribute('visibility', 'visible');
      linhas.push(`<span><i style="background:${s.cor}"></i>${esc(s.nome)}: <b>${fy(p[1])}</b></span>`);
    });
    dicaEl.innerHTML = `<b>${fx(x)}</b>${dica ? ' · ' + dica(x) : ''}<br>${linhas.join('<br>')}`;
    dicaEl.hidden = false;
    const fr = (X(x) - m.l) / w;
    dicaEl.style.left = `calc(${(100 * X(x) / L).toFixed(1)}% ${fr > 0.6 ? '- 12px - var(--larg, 180px)' : '+ 12px'})`;
  }
  function esconder() { guia.setAttribute('visibility', 'hidden'); marcas.forEach(c => c.setAttribute('visibility', 'hidden')); dicaEl.hidden = true; }
  const xDoEvento = e => { const r = svg.getBoundingClientRect(); return xmin + ((e.clientX - r.left) * L / r.width - m.l) / w * (xmax - xmin); };
  const captura = svg.querySelector('.captura');
  captura.addEventListener('pointermove', e => mostrar(xDoEvento(e)));
  captura.addEventListener('pointerdown', e => mostrar(xDoEvento(e)));
  captura.addEventListener('pointerleave', esconder);
  // Teclado: setas andam pela linha do tempo.
  svg.setAttribute('tabindex', '0');
  let xTeclado = xmin;
  svg.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault(); xTeclado = Math.max(xmin, Math.min(xmax, xTeclado + (e.key === 'ArrowRight' ? 1 : -1) * (xmax - xmin) / 40)); mostrar(xTeclado);
  });
  // Legenda clicável: some/aparece a série.
  alvo.querySelectorAll('.serie-btn').forEach(b => b.onclick = () => {
    const i = +b.dataset.i; ativo[i] = !ativo[i];
    b.setAttribute('aria-pressed', String(ativo[i])); caminhos[i].classList.toggle('apagada', !ativo[i]);
  });
  // Tocar: revela as linhas da esquerda para a direita, com a dica acompanhando.
  const btn = alvo.querySelector('.tocar');
  if (btn) btn.onclick = () => {
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches, dur = reduzido ? 1 : 4500, t0 = performance.now();
    caminhos.forEach(c => c.classList.remove('linha-anim'));
    const passo = t => {
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      clip.setAttribute('width', m.l + w * p + 2);
      mostrar(xmin + (xmax - xmin) * p);
      if (p < 1) requestAnimationFrame(passo); else { clip.setAttribute('width', L); setTimeout(esconder, 1500); }
    };
    requestAnimationFrame(passo);
  };
}
