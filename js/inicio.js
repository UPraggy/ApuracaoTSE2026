// Página inicial: placar, números-chave com proporção, busca, atalhos para as abas e o que já foi verificado.
import { nf, pct, esc, titulo } from './util.js?v=160f88b15a';
import { animarNumeros } from './anim.js?v=19eef1076c';

const ic = nome => `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

export function iniciarInicio(R, { NOME_A, NOME_B, irAba, irPara, focarBusca }) {
  const el = document.getElementById('aba-inicio');
  if (!el) return;
  const T = R.total, TB = R.totalBrasil, v = T.a + T.b, dif = Math.abs(T.a - T.b);
  const [CA, CB] = R.candidatos;
  const nomeA = NOME_A || titulo(CA.nome), nomeB = NOME_B || titulo(CB.nome);
  const ATALHOS = [
    ['mapa', 'mapa', 'Mapa', 'Do Brasil até a sua escola, com a apuração reproduzida.'],
    ['geral', 'analise', 'Análise', 'Cada verificação feita nos boletins, com o resultado.'],
    ['comparar', 'comparar', '2022 × 2026', 'Mesma eleição, anos diferentes, lado a lado.'],
    ['candidatos', 'urna', 'Candidatos', 'Perfil dos lugares de onde veio o voto de cada um.'],
    ['explorar', 'bandeira', 'Explorar estados', 'Renda, saneamento, benefícios e voto por estado.'],
    ['horarios', 'relogio', 'Horários e votos após 17h', 'Encerramento das urnas e o que dizem os logs.'],
    ['#faq', 'chat', 'Perguntas comuns', 'Respostas curtas para as dúvidas mais frequentes.']
  ];
  el.innerHTML = `
    <div class="ini">
      <header class="ini-hero">
        <div class="sobretitulo">2º turno · 25/10/2026 · Presidente</div>
        <h1 class="ini-titulo">Apuração 2026, conferida boletim por boletim</h1>
        <p class="ini-sub">Dados oficiais do TSE e do IBGE, método aberto, sem lado.</p>
      </header>

      <section class="ini-placar" aria-label="Resultado: ${esc(nomeA)} ${pct(T.a, v, 2)}, ${esc(nomeB)} ${pct(T.b, v, 2)} dos votos válidos">
        <div class="ini-cands">
          <div class="ini-cand a"><span class="ini-num">13</span><span class="ini-nome">${esc(nomeA)}</span><b class="ini-pct" data-contar>${pct(T.a, v, 2)}</b><span class="ini-votos">${nf(T.a)} votos</span></div>
          <div class="ini-cand b"><span class="ini-num">22</span><span class="ini-nome">${esc(nomeB)}</span><b class="ini-pct" data-contar>${pct(T.b, v, 2)}</b><span class="ini-votos">${nf(T.b)} votos</span></div>
        </div>
        <div class="ini-barra" role="presentation"><span class="seg a" style="width:${100 * T.a / v}%"></span><span class="ini-meio" aria-hidden="true"></span><span class="seg b" style="width:${100 * T.b / v}%"></span></div>
        <p class="ini-dif">Diferença de <b>${nf(dif)}</b> votos (<b>${pct(dif, v, 2)}</b> dos válidos). Inclui o exterior.</p>
      </section>

      <section class="ini-numeros" aria-label="Números-chave">
        <div class="ini-n"><span class="ini-n-val" data-contar>${nf(T.secoes)}</span><span class="ini-n-rot">urnas com boletim publicado · <b>100%</b> conferidas</span></div>
        <div class="ini-n"><span class="ini-n-val" data-contar>${pct(T.comp, T.aptos, 1)}</span><span class="ini-n-rot">de comparecimento · ${nf(T.comp)} de ${nf(T.aptos)} aptos</span></div>
        <div class="ini-n"><span class="ini-n-val" data-contar>${pct(T.br + T.nu, T.comp, 2)}</span><span class="ini-n-rot">brancos e nulos · ${nf(T.br + T.nu)} votos</span></div>
        <div class="ini-n"><span class="ini-n-val" data-contar>${pct(TB.biom, TB.comp, 2)}</span><span class="ini-n-rot">votaram sem habilitação biométrica · ${nf(TB.biom)} (sem o exterior, onde o campo vem zerado)</span></div>
      </section>

      <form class="ini-busca" role="search" autocomplete="off">
        <label for="ini-busca-in" class="ini-busca-rot">Ache sua cidade, bairro, escola ou seção</label>
        <div class="ini-busca-caixa">${ic('busca')}<input id="ini-busca-in" type="search" placeholder="Ex.: Savassi, Belo Horizonte · zona 5 seção 120 SP"><button class="botao primario" type="submit">Buscar</button></div>
      </form>

      <nav class="ini-atalhos" aria-label="Seções do painel">
        ${ATALHOS.map(([alvo, icone, t, d]) => `<button class="ini-atalho" data-ir="${alvo}"><span class="ini-atalho-ic">${ic(icone)}</span><span class="ini-atalho-txt"><b>${t}</b><span>${d}</span></span><span class="ini-seta" aria-hidden="true">→</span></button>`).join('')}
      </nav>

      <section class="ini-verif" aria-labelledby="ini-verif-t">
        <h2 id="ini-verif-t">O que já verificamos</h2>
        <ul>
          <li><span class="selo ok" aria-hidden="true">✓</span><span>As contas fecham em <b>100%</b> dos ${nf(T.secoes)} boletins: nenhuma urna com mais votos que eleitores.</span></li>
          <li><span class="selo info" aria-hidden="true">i</span><span>Urnas abertas até as 19h foram uma <b>prorrogação oficial</b> decidida pelo STF (<a href="https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/esclarecimento-sobre-prorrogacao-da-votacao" target="_blank" rel="noopener">nota do TSE</a>).</span></li>
          <li><span class="selo info" aria-hidden="true">i</span><span>Cerca de <b>35 mil</b> pessoas votaram depois das 17h, ou <b>${pct(34911, T.comp, 2)}</b> dos votos, segundo os logs das urnas e o TSE.</span></li>
          <li><span class="selo ok" aria-hidden="true">✓</span><span>A distribuição dos votos é <b>natural</b>: último dígito uniforme, um único pico e repetições dentro do acaso.</span></li>
        </ul>
        <button class="link ini-mais" data-ir="geral">Ver todas as verificações →</button>
      </section>

      <footer class="ini-fontes">
        <span class="ini-fontes-t">Fontes oficiais</span>
        <a href="https://dadosabertos.tse.jus.br/" target="_blank" rel="noopener" class="ini-logo">TSE</a>
        <a href="https://sidra.ibge.gov.br/" target="_blank" rel="noopener" class="ini-logo">IBGE</a>
        <a href="https://portaldatransparencia.gov.br/" target="_blank" rel="noopener" class="ini-logo">Portal da Transparência</a>
        <a href="https://datasus.saude.gov.br/" target="_blank" rel="noopener" class="ini-logo">DATASUS</a>
        <a href="https://github.com/UPraggy/ApuracaoTSE2026" target="_blank" rel="noopener" class="ini-git">Código e método no GitHub →</a>
      </footer>
    </div>`;

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-ir]');
    if (!b) return;
    const alvo = b.dataset.ir;
    if (alvo.startsWith('#')) document.querySelector(alvo)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    else irAba?.(alvo);
  });
  // A busca de verdade é a do topo: o texto digitado aqui é repassado para ela.
  const form = el.querySelector('.ini-busca'), inp = el.querySelector('#ini-busca-in');
  const repassar = () => {
    const topo = document.getElementById('busca');
    if (!topo) return;
    topo.value = inp.value;
    focarBusca?.();
    topo.focus();
    topo.dispatchEvent(new Event('input'));
  };
  form.addEventListener('submit', e => { e.preventDefault(); repassar(); });
  // Ao digitar, a primeira letra já leva para a busca do topo (que tem as sugestões), sem perder o que foi escrito.
  inp.addEventListener('input', () => { if (inp.value.trim()) { repassar(); inp.value = ''; } });
  void irPara;
  animarNumeros(el);
}
