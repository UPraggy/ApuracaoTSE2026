// Movimento: números que contam até o valor e entrada escalonada. Tudo desliga com "reduzir movimento".
const reduzido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const NUM = /-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/;

// Conta do zero até o número que já está escrito no elemento (formato pt-BR), mantendo prefixo e sufixo.
function contar(el, ms = 750) {
  if (el.dataset.contado) return;
  el.dataset.contado = '1';
  const txt = el.textContent, m = NUM.exec(txt);
  if (!m || reduzido() || document.hidden) return;
  const bruto = m[0], casas = (bruto.split(',')[1] || '').length, alvo = Number(bruto.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(alvo) || alvo === 0) return;
  const antes = txt.slice(0, m.index), depois = txt.slice(m.index + bruto.length);
  const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const no = [...el.childNodes].find(n => n.nodeType === 3 && NUM.test(n.textContent)) || el;
  const t0 = performance.now();
  const passo = t => {
    // O carimbo do quadro pode vir antes de t0; sem o piso em 0 o número começaria negativo.
    const p = Math.min(1, Math.max(0, (t - t0) / ms)), e = 1 - Math.pow(1 - p, 3);
    const v = fmt.format(alvo * e);
    if (no === el) el.textContent = antes + v + depois; else no.textContent = no.textContent.replace(NUM, v);
    if (p < 1) requestAnimationFrame(passo); else if (no === el) el.textContent = txt;
  };
  requestAnimationFrame(passo);
}

const obs = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) { obs.unobserve(e.target); contar(e.target); }
}, { threshold: 0.3 }) : null;

// Marca os números de um trecho recém-desenhado para contarem quando aparecerem na tela.
export function animarNumeros(raiz) {
  raiz.querySelectorAll('.card .valor, .numeros dd, .placar-nomes b, [data-contar]').forEach(el => obs ? obs.observe(el) : contar(el));
  // Entrada escalonada de cartões e blocos.
  raiz.querySelectorAll('.card, .bloco, .verif, .numeros > div').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
}
