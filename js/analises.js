// Abas de análise: análise guiada (com contexto IBGE e histórico), biometria, horários, estados e alertas.
import { UF_NOME, carregar, nf, pct, pp, hhmm, esc, sigla, corVantagem, corCss, fonte } from './util.js?v=1e5972d72e';

// População: Censo IBGE 2022 (mesmos números do painel anterior).
const POP_IBGE = { RO: 1581016, AC: 830026, AM: 3941175, RR: 636303, PA: 8116132, AP: 733508, TO: 1511459, MA: 6775152, PI: 3269200, CE: 8791688, RN: 3302406, PB: 3974495, PE: 9058155, AL: 3127511, SE: 2209558, BA: 14136417, MG: 20538718, ES: 3833486, RJ: 16054524, SP: 44420459, PR: 11443208, SC: 7609601, RS: 10880506, MS: 2756700, MT: 3658813, GO: 7055228, DF: 2817068 };
const HIST = [
  { ano: '2018 · 2º turno', aptos: 147306275, comp: 115933451, abst: 31371704, secoes: 454490, resultado: 'Bolsonaro 57.797.847 · Haddad 47.040.906', fonte: 'https://www.tse.jus.br/comunicacao/noticias/2018/Outubro/eleicoes-2018-justica-eleitoral-conclui-totalizacao-dos-votos-do-segundo-turno' },
  { ano: '2022 · 2º turno', aptos: 156454011, comp: 124252796, abst: 32200558, secoes: 472075, resultado: 'Lula 60.345.999 · Bolsonaro 58.206.354', fonte: 'https://www.tse.jus.br/comunicacao/noticias/2022/Outubro/100-das-secoes-totalizadas-confira-como-ficou-o-quadro-eleitoral-apos-o-2o-turno' }
];

// Gráfico de barras simples em SVG (uma série), com dica ao passar o mouse e rótulos esparsos.
function barras(dados, { altura = 220, rotulo, valor, dica, cor = 'var(--seq-1)', marcarCada = 1, eixo = nf }) {
  const L = 640, H = altura, m = { t: 12, r: 8, b: 34, l: 52 }, w = L - m.l - m.r, h = H - m.t - m.b;
  const max = Math.max(...dados.map(valor), 1), bw = w / dados.length;
  const ticks = [0, 0.5, 1].map(f => max * f);
  return `<svg class="grafico" viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(dica.titulo || '')}">
    ${ticks.map(t => { const y = m.t + h - h * t / max; return `<line x1="${m.l}" x2="${L - m.r}" y1="${y}" y2="${y}" class="grade"/><text x="${m.l - 6}" y="${y + 4}" class="eixo" text-anchor="end">${eixo(t)}</text>`; }).join('')}
    ${dados.map((d, i) => { const v = valor(d), bh = h * v / max, x = m.l + i * bw; return `<g class="barra-g"><rect x="${x}" y="${m.t}" width="${bw}" height="${h}" class="alvo"><title>${esc(dica(d))}</title></rect><rect x="${x + 1}" y="${m.t + h - bh}" width="${Math.max(1, bw - 2)}" height="${bh}" rx="${Math.min(4, bw / 3)}" fill="${typeof cor === 'function' ? cor(d) : cor}" pointer-events="none"/>${i % marcarCada === 0 ? `<text x="${x + bw / 2}" y="${H - 14}" class="eixo" text-anchor="middle">${esc(rotulo(d))}</text>` : ''}</g>`; }).join('')}
    <line x1="${m.l}" x2="${L - m.r}" y1="${m.t + h}" y2="${m.t + h}" class="base"/>
  </svg>`;
}
// Pontos com linha zero (diferença em pontos percentuais), duas séries.
function pontosDiferenca(linhas, series, { rotulo }) {
  const L = 640, H = 260, m = { t: 14, r: 12, b: 36, l: 56 }, w = L - m.l - m.r, h = H - m.t - m.b;
  const vals = linhas.flatMap(l => series.map(s => s.v(l))).filter(Number.isFinite);
  const lim = Math.max(1, ...vals.map(Math.abs)) * 1.15, y = v => m.t + h / 2 - (h / 2) * v / lim, bw = w / linhas.length;
  return `<svg class="grafico" viewBox="0 0 ${L} ${H}" role="img" aria-label="Diferença em pontos percentuais por faixa">
    ${[-lim, -lim / 2, 0, lim / 2, lim].map(t => `<line x1="${m.l}" x2="${L - m.r}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'base' : 'grade'}"/><text x="${m.l - 6}" y="${y(t) + 4}" class="eixo" text-anchor="end">${pp(t, 1)}</text>`).join('')}
    ${linhas.map((l, i) => { const cx = m.l + bw * (i + 0.5); return `<text x="${cx}" y="${H - 14}" class="eixo" text-anchor="middle">${esc(rotulo(l))}</text>` + series.map((s, k) => { const v = s.v(l); if (!Number.isFinite(v)) return ''; const x = cx + (k - (series.length - 1) / 2) * 12; return `<line x1="${x}" x2="${x}" y1="${y(0)}" y2="${y(v)}" stroke="${s.cor}" stroke-width="2"/><circle cx="${x}" cy="${y(v)}" r="5" fill="${s.cor}" stroke="var(--superficie)" stroke-width="2"><title>${esc(s.nome)} · ${esc(rotulo(l))}: ${pp(v)} ponto(s)</title></circle>`; }).join(''); }).join('')}
  </svg>`;
}
const legenda = series => `<div class="legenda-graf">${series.map(s => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('')}</div>`;
const faixaTxt = f => `${Math.round(f.ini * 100)}–${f.fim >= 1 ? '100' : Math.round(f.fim * 100)}%`;

export function iniciarAnalises(R, { NOME_A, NOME_B, irPara, mostrarAba }) {
  const T = R.total, TB = R.totalBrasil;

  // ---------- Análise (leitura guiada) ----------
  // Números da investigação vêm de scripts/investigar.mjs (docs/ANALISE-INCONSISTENCIAS.md).
  const H0 = R.horario, ca = R.alertas.contagem;
  const VERIF = [
    { st: 'ok', t: 'As contas de cada urna fecham', d: `Em ${nf(T.secoes)} boletins: nenhum com mais votantes que eleitores aptos, nenhum com votos que não somam o comparecimento, nenhum emitido antes do encerramento, nenhuma seção duplicada.`, aba: 'alertas' },
    { st: 'ok', t: 'A distribuição dos votos parece natural', d: 'O teste do último dígito dá uniforme (p = 0,88 e 0,23), a % por seção tem um único pico e os resultados idênticos no mesmo local (53 pares) estão dentro do esperado pelo acaso (41 a 64).', aba: 'alertas' },
    { st: 'atencao', t: 'Um segundo horário de fechamento às 19h', d: `${nf(H0.apos19)} urnas fecharam depois das 19h de Brasília, quase todas entre 19:00 e 19:15, concentradas em zonas do RJ, SP, BA, PE e PB. Abriram às 8h, e o resultado delas é parecido com o das vizinhas (−0,26 ponto). O padrão parece um horário combinado. Quem explica são os TREs, pelos logs e atas.`, aba: 'horarios' },
    { st: 'info', t: 'Biometria: diferença pequena dentro da mesma escola', d: `${nf(T.biom)} eleitores (${pct(T.biom, T.comp, 2)}) foram liberados sem a digital. Comparando seções da mesma escola, a % de cada candidato quase não muda com isso (${pp(R.biometria.inclinacao.ppPor10)} ponto a cada +10 pontos na taxa). O boletim não diz em quem essas pessoas votaram.`, aba: 'biometria' },
    { st: 'info', t: 'Seções para conferir no boletim impresso', d: `420 seções destoam muito das vizinhas no mesmo prédio, ${nf(ca.biom_alta)} liberaram metade ou mais sem digital e 84 abriram depois das 9h. As ${nf(ca.unanime)} unanimidades ficam quase todas em aldeias e comunidades rurais.`, aba: 'alertas' },
    { st: 'info', t: 'Horário de "recebimento" não mostra a chegada real', d: 'Nenhum boletim aparece recebido entre 17:10 e 19:00, e depois chegam cerca de 5.500 a cada 10 minutos. O campo parece registrar o processamento no sistema. Não diz nada sobre os votos.', aba: 'horarios' }
  ];
  const ST = { ok: ['✓', 'Consistente'], atencao: ['!', 'Pede explicação oficial'], info: ['i', 'Contexto'] };
  document.getElementById('aba-geral').innerHTML = `
    <h2>Análise</h2>
    <p class="lead">O que os <b>boletins de urna oficiais</b> mostram sobre o 2º turno de 2026, verificação por verificação. Cada item diz o que foi testado, o que deu e onde ver o detalhe. Os dois candidatos recebem o mesmo tratamento, na ordem do número na urna.</p>
    <div class="cards">
      <div class="card"><span class="valor">${pct(T.a, T.a + T.b, 2)}</span><span class="rot"><i class="ponto a"></i>${esc(NOME_A)} (13) · ${nf(T.a)} votos</span></div>
      <div class="card"><span class="valor">${pct(T.b, T.a + T.b, 2)}</span><span class="rot"><i class="ponto b"></i>${esc(NOME_B)} (22) · ${nf(T.b)} votos</span></div>
      <div class="card"><span class="valor">${nf(Math.abs(T.a - T.b))}</span><span class="rot">votos de diferença</span></div>
      <div class="card"><span class="valor">${nf(T.aptos)}</span><span class="rot">aptos para votar</span></div>
      <div class="card"><span class="valor">${nf(T.comp)}</span><span class="rot">compareceram · ${pct(T.comp, T.aptos)} dos aptos</span></div>
      <div class="card"><span class="valor">${pct(T.br + T.nu, T.comp, 2)}</span><span class="rot">brancos e nulos</span></div>
    </div>
    ${fonte('bu')}
    <section class="bloco"><h3>Verificações</h3>
      <div class="verificacoes">${VERIF.map(v => `<button class="verif ${v.st}" data-aba-ir="${v.aba}"><span class="selo" aria-hidden="true">${ST[v.st][0]}</span><span class="verif-txt"><span class="verif-st">${ST[v.st][1]}</span><b>${v.t}</b><span>${v.d}</span><span class="link-ver">Ver detalhes →</span></span></button>`).join('')}</div>
      ${fonte('investigacao')}
    </section>
    <div id="comparacao-anos"></div>
    <section class="bloco grid2">
      <div><h3>Linha do tempo do 2º turno</h3>
        ${[...HIST, { ano: '2026 · 2º turno (estes boletins)', aptos: T.aptos, comp: T.comp, abst: T.abst, secoes: T.secoes, resultado: `${NOME_A} ${nf(T.a)} · ${NOME_B} ${nf(T.b)}`, fonte: R.meta.fonte }].map(h => `<article class="card hist"><h4>${h.ano}</h4><p>Seções ${nf(h.secoes)} · Aptos ${nf(h.aptos)}<br>Comparecimento <b>${nf(h.comp)}</b> (${pct(h.comp, h.aptos)}) · Abstenção ${pct(h.abst, h.aptos)}<br>${esc(h.resultado)}</p><a href="${h.fonte}" target="_blank" rel="noopener">Fonte: TSE</a></article>`).join('')}
      </div>
      <div><h3>Habitantes e eleitorado por estado</h3>
        <p class="muted small">Razão só para dar escala: anos e conceitos diferentes (população total de 2022 × eleitores aptos em 2026).</p>
        <div class="tabela-rolagem alta"><table><thead><tr><th>UF</th><th class="num">Habitantes</th><th class="num">Aptos</th><th class="num">Aptos / hab.</th><th class="num">Comparec.</th></tr></thead><tbody>
          ${Object.keys(POP_IBGE).sort().map(uf => { const g = R.porUf[uf]; return `<tr data-uf="${uf}" tabindex="0"><td>${sigla(uf)}</td><td class="num">${nf(POP_IBGE[uf])}</td><td class="num">${nf(g.aptos)}</td><td class="num">${pct(g.aptos, POP_IBGE[uf])}</td><td class="num">${pct(g.comp, g.aptos)}</td></tr>`; }).join('')}
        </tbody></table></div>
        ${fonte('censo', 'bu')}
      </div>
    </section>`;
  document.getElementById('aba-geral').addEventListener('click', e => { const b = e.target.closest('[data-aba-ir]'); if (b) mostrarAba(b.dataset.abaIr); });

  // ---------- Biometria ----------
  const B = R.biometria, fx = B.nacional;
  const sA = corCss('--serie-1'), sB = corCss('--serie-2');
  const z = B.zeroVsAlgum;
  const incl = B.inclinacao.ppPor10;
  document.getElementById('aba-biometria').innerHTML = `
    <h2>Com e sem biometria</h2>
    <div class="nota"><b>O que o boletim diz:</b> o campo <code>QT_ELEI_BIOM_SEM_HABILITACAO</code> conta, em cada seção, os eleitores <b>com biometria cadastrada</b> que foram liberados para votar <b>sem</b> ela: a digital não foi reconhecida e a identificação foi feita por documento. Quem não tem biometria cadastrada não entra nesse número. O boletim só traz o total da seção, então <b>não dá para saber em quem essas pessoas votaram</b>. O que dá para fazer é comparar seções com taxas diferentes.</div>
    <div class="cards">
      <div class="card"><span class="valor">${nf(T.biom)}</span><span class="rot">eleitores sem habilitação biométrica (${pct(T.biom, T.comp, 2)} dos votantes)</span></div>
      <div class="card"><span class="valor">${nf(z.zero.secoes)}</span><span class="rot">seções com zero no campo · ${esc(NOME_A)} ${pct(z.zero.a, z.zero.a + z.zero.b)}</span></div>
      <div class="card"><span class="valor">${nf(z.algum.secoes)}</span><span class="rot">seções com 1 ou mais · ${esc(NOME_A)} ${pct(z.algum.a, z.algum.a + z.algum.b)}</span></div>
      <div class="card"><span class="valor">${pp(incl)}</span><span class="rot">pontos na % de ${esc(NOME_A)} a cada +10 pontos na taxa, dentro da mesma escola</span></div>
    </div>
    <section class="bloco"><h3>Quantas seções há em cada faixa da taxa</h3>
      <p class="muted small">Taxa = sem habilitação biométrica ÷ comparecimento da seção. Sem o exterior.</p>
      ${barras(fx, { rotulo: faixaTxt, valor: f => f.secoes, dica: Object.assign(f => `${faixaTxt(f)}: ${nf(f.secoes)} seções · ${nf(f.comp)} votantes`, { titulo: 'Seções por faixa da taxa' }) })}
    </section>
    <section class="bloco"><h3>A % de ${esc(NOME_A)} muda com a taxa?</h3>
      <p class="muted small">Cada ponto mostra quanto a % de ${esc(NOME_A)} nas seções da faixa fica acima (+) ou abaixo (−) do esperado. "Esperado" é o resultado do <b>mesmo município</b> ou das <b>outras seções da mesma escola</b>. Comparar dentro da escola tira quase todo o efeito de região, renda e idade do bairro.</p>
      ${legenda([{ nome: 'comparado ao município', cor: sA }, { nome: 'comparado às outras seções da mesma escola', cor: sB }])}
      ${pontosDiferenca(fx, [{ nome: 'comparado ao município', cor: sA, v: f => f.ppMun }, { nome: 'comparado à mesma escola', cor: sB, v: f => f.ppLocal }], { rotulo: faixaTxt })}
      <div class="tabela-rolagem"><table><thead><tr><th>Faixa da taxa</th><th class="num">Seções</th><th class="num">Votantes</th><th class="num">% ${esc(NOME_A)} (bruto)</th><th class="num">vs município (p.p.)</th><th class="num">vs mesma escola (p.p.)</th></tr></thead><tbody>
        ${fx.map(f => `<tr><td>${faixaTxt(f)}</td><td class="num">${nf(f.secoes)}</td><td class="num">${nf(f.comp)}</td><td class="num">${pct(f.pctA, 1, 2)}</td><td class="num">${pp(f.ppMun)}</td><td class="num">${pp(f.ppLocal)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="nota"><b>Como ler:</b> diferenças de 1 a 2 pontos entre seções são esperadas, porque as seções não sorteiam eleitores. A distribuição costuma seguir a ordem de alistamento, o que separa faixas de idade, e idosos têm mais falha de digital. Uma associação aqui <b>não mostra</b> que votos foram trocados ou inseridos, nem quem votou em quem. Um sinal forte seria uma diferença grande e concentrada que não aparece nas comparações dentro da mesma escola.</div>
    </section>
    <section class="bloco"><h3>Por estado</h3>
      <div class="tabela-rolagem"><table><thead><tr><th>UF</th><th class="num">Votantes</th><th class="num">Sem hab. biom.</th><th class="num">Taxa</th><th class="num">Inclinação dentro da escola<br><small>p.p. de ${esc(NOME_A)} por +10 p.p.</small></th></tr></thead><tbody>
        ${Object.entries(B.porUf).sort((a, b) => R.porUf[b[0]].biom / R.porUf[b[0]].comp - R.porUf[a[0]].biom / R.porUf[a[0]].comp).map(([uf, x]) => { const g = R.porUf[uf]; return `<tr data-uf="${uf}" tabindex="0"><td>${sigla(uf)}</td><td class="num">${nf(g.comp)}</td><td class="num">${nf(g.biom)}</td><td class="num"><span class="mini-barra" style="--w:${Math.min(100, 400 * g.biom / g.comp)}%"></span>${pct(g.biom, g.comp, 2)}</td><td class="num">${pp(x.inclinacao.ppPor10)}</td></tr>`; }).join('')}
      </tbody></table></div>
    </section>`;

  // ---------- Horários ----------
  const H = R.horario;
  document.getElementById('aba-horarios').innerHTML = `
    <h2>Encerramento das urnas</h2>
    <div class="nota">A votação vai das 8h às 17h <b>de Brasília</b> em todo o país. Quem está na fila às 17h ainda vota, e por isso muitas urnas fecham alguns minutos depois. O boletim grava o horário <b>local</b> da urna, e aqui ele foi convertido para Brasília (AC +2h; AM, RO, RR, MT, MS +1h). Simplificação: o oeste do AM e Fernando de Noronha ficam com o fuso do estado. O horário de encerramento é o da urna, não o de cada voto.</div>
    <div class="cards">
      <div class="card"><span class="valor">${nf(H.apos17)}</span><span class="rot">após 17:00:00 (Brasília)</span></div>
      <div class="card"><span class="valor">${nf(H.apos1705)}</span><span class="rot">após 17:05</span></div>
      <div class="card"><span class="valor">${nf(H.apos1730)}</span><span class="rot">após 17:30</span></div>
      <div class="card"><span class="valor">${nf(H.apos18)}</span><span class="rot">após 18:00</span></div>
      <div class="card"><span class="valor">${nf(H.apos19)}</span><span class="rot">após 19:00</span></div>
      <div class="card"><span class="valor">${nf(H.semHorario)}</span><span class="rot">sem horário (todas no exterior)</span></div>
    </div>
    <section class="bloco"><h3>Urnas encerradas a cada 5 minutos (Brasília)</h3>
      <p class="muted small">Escala comprimida: quase todas fecham entre 17:00 e 17:05. As barras das pontas juntam tudo antes de 16:30 e depois de 21:00.</p>
      ${barras(H.histograma, { rotulo: d => hhmm(d.min), valor: d => Math.sqrt(d.secoes), eixo: t => nf(t * t), marcarCada: 6, dica: Object.assign(d => `${hhmm(d.min)}–${hhmm(d.min + 5)}: ${nf(d.secoes)} urnas · ${NOME_A} ${pct(d.pctA, 1)}`, { titulo: 'Urnas encerradas por horário' }) })}
      <p class="small muted">Altura em raiz quadrada para os blocos pequenos aparecerem. Passe o mouse para ver o número exato.</p>
    </section>
    <section class="bloco"><h3>Resultado por horário de encerramento</h3>
      <p class="muted small">Urnas que fecham tarde ficam em cidades grandes, com fila, e cidades grandes votam diferente das pequenas. Por isso a coluna "vs município" compara cada urna com o próprio município.</p>
      <div class="tabela-rolagem"><table><thead><tr><th>Encerramento</th><th class="num">Urnas</th><th class="num">Votantes</th><th class="num">% ${esc(NOME_A)}</th><th class="num">vs município (p.p.)</th></tr></thead><tbody>
        ${H.faixas.map(f => `<tr><td>${f.ini === 0 ? 'até 17:05' : hhmm(f.ini) + (f.fim >= 1440 ? ' ou depois' : '–' + hhmm(f.fim))}</td><td class="num">${nf(f.secoes)}</td><td class="num">${nf(f.comp)}</td><td class="num">${pct(f.pctA, 1, 2)}</td><td class="num">${pp(f.ppMun)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>`;

  // ---------- Estados ----------
  const ufs = Object.keys(R.porUf);
  document.getElementById('aba-estados').innerHTML = `
    <h2>Comparativo por estado</h2>
    <p class="muted">Clique numa linha para abrir o estado no mapa. Passe o mouse na sigla para ver o nome.</p>
    <div class="tabela-rolagem"><table class="ordenavel"><thead><tr><th>UF</th><th class="num">Seções</th><th class="num">Aptos</th><th class="num">Comparec.</th><th class="num">${esc(NOME_A)}</th><th class="num">${esc(NOME_B)}</th><th class="num">% ${esc(NOME_A)}</th><th class="num">Brancos+nulos</th><th class="num">Sem hab. biom.</th><th class="num">Após 19h</th><th class="num">Seções c/ alerta</th></tr></thead><tbody>
      ${ufs.map(uf => { const g = R.porUf[uf]; return `<tr data-uf="${uf}" tabindex="0"><td>${sigla(uf)}</td><td class="num">${nf(g.secoes)}</td><td class="num">${nf(g.aptos)}</td><td class="num">${pct(g.comp, g.aptos)}</td><td class="num">${nf(g.a)}</td><td class="num">${nf(g.b)}</td><td class="num"><span class="chip" style="background:${corVantagem(g.a, g.b)}"></span>${pct(g.a, g.a + g.b, 2)}</td><td class="num">${pct(g.br + g.nu, g.comp, 2)}</td><td class="num">${pct(g.biom, g.comp, 2)}</td><td class="num">${nf(R.alertasPorUf?.[uf]?.fecha_19h)}</td><td class="num">${nf(g.alertas)}</td></tr>`; }).join('')}
    </tbody></table></div>`;

  // ---------- Alertas ----------
  const tipos = R.alertas.tipos, cont = R.alertas.contagem;
  const abaA = document.getElementById('aba-alertas');
  abaA.innerHTML = `
    <h2>Alertas automáticos</h2>
    <div class="nota">São verificações mecânicas para separar seções que vale a pena olhar de perto. <b>Alerta não é prova de irregularidade.</b> Unanimidade em aldeia ou comunidade pequena, fila longa em cidade grande e seção com muitos idosos (mais falha de digital) têm explicações comuns. As quatro primeiras verificações são de consistência aritmética, e as quatro deram zero.</div>
    <section class="bloco"><h3>O que a investigação encontrou</h3>
      <ul class="achados">
        <li><b>Segundo horário de fechamento às 19h.</b> 489.726 urnas fecharam entre 17:00 e 17:30. Depois quase nada até 18:55, e então 6.311 fecharam entre 19:00 e 19:15, com o mesmo desenho minuto a minuto das 17h. Isso parece um horário programado, não fila. Estão concentradas em RJ (2.805), SP (1.571), BA (936), PE (657) e PB (275), e em algumas zonas quase todas as urnas fecharam assim (Rio Z122 98%, Z238 93%, Salvador Z5 87%). A abertura foi normal, às 8h. Nos 716 locais que têm urnas das duas turmas, o resultado das urnas das 19h difere das vizinhas em só −0,26 ponto. <b>É a principal pergunta para o TSE/TRE:</b> log da urna (hora do último voto) e atas dessas seções.</li>
        <li><b>Nenhum boletim aparece recebido entre 17:10 e 19:00.</b> O campo <code>DT_BU_RECEBIDO</code> parece marcar o processamento no sistema, não a chegada real. Não informa nada sobre os votos.</li>
        <li><b>Consistência aritmética zerada:</b> 0 seções duplicadas, 0 com comparecimento maior que aptos, 0 com votos que não fecham, 0 boletins emitidos antes do encerramento.</li>
        <li><b>Distribuição natural:</b> o teste do último dígito dá uniforme (p = 0,88 e 0,23), a % por seção tem um pico só e os resultados idênticos no mesmo local estão dentro do acaso.</li>
        <li><b>Para conferir no boletim impresso:</b> 420 seções muito diferentes das vizinhas do mesmo prédio (ex.: MA Açailândia Z71 S468, 36,6% contra 74–84% nas vizinhas), 96 seções com metade ou mais liberada sem digital (PR Tomazina Z19 S55, 225 de 227) e 84 aberturas depois das 9h (MG Itajubá Z134 S295, às 13h08).</li>
        <li><b>Unanimidades</b> (91) e seções com comparecimento ≥ 95% e ≥ 90% para um lado (97) ficam quase todas em aldeias e comunidades rurais que votam em bloco.</li>
      </ul>
      <p class="small muted">Relatório completo com tabelas e exemplos: <code>docs/ANALISE-INCONSISTENCIAS.md</code> no repositório (gerado por <code>scripts/investigar.mjs</code>). Nada disso, sozinho, demonstra fraude.</p>
    </section>
    <div class="cards alertas-cards">${Object.entries(tipos).map(([k, t]) => `<button class="card filtro-alerta" data-tipo="${k}" aria-pressed="false"><span class="valor ${cont[k] ? '' : 'ok'}">${nf(cont[k])}</span><span class="rot">${esc(t)}</span></button>`).join('')}</div>
    <div class="filtros"><label>Estado <select id="al-uf"><option value="">Todos</option>${ufs.map(u => `<option value="${u}" title="${esc(UF_NOME[u])}">${u === 'ZZ' ? 'Exterior (ZZ)' : u + ' — ' + UF_NOME[u]}</option>`).join('')}</select></label>
    <label>Tipo <select id="al-tipo"><option value="">Todos</option>${Object.entries(tipos).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></label>
    <button id="al-csv" class="botao">Baixar CSV</button></div>
    <div id="al-tabela"><p class="muted">Carregando…</p></div>`;
  const selUf = abaA.querySelector('#al-uf'), selTipo = abaA.querySelector('#al-tipo');
  let lista = [];
  carregar('alertas.json').then(dados => {
    lista = dados;
    const desenhar = () => {
      const f = lista.filter(a => (!selUf.value || a[0] === selUf.value) && (!selTipo.value || a[14].split(',').includes(selTipo.value)));
      abaA.querySelectorAll('.filtro-alerta').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tipo === selTipo.value)));
      abaA.querySelector('#al-tabela').innerHTML = `<p class="small muted">${nf(f.length)} seções${f.length > 600 ? ' · mostrando as 600 primeiras (o CSV traz todas)' : ''}. Clique para abrir o município no mapa.</p><div class="tabela-rolagem alta"><table><thead><tr><th>UF</th><th>Município</th><th class="num">Zona</th><th class="num">Seção</th><th>Local</th><th class="num">Aptos</th><th class="num">Votantes</th><th class="num">Sem hab. biom.</th><th class="num">${esc(NOME_A)}</th><th class="num">${esc(NOME_B)}</th><th class="num">Fechou</th><th>Alertas</th></tr></thead><tbody>${f.slice(0, 600).map(a => `<tr tabindex="0" data-ibge="${a[1] ?? ''}" data-uf="${a[0]}"><td>${sigla(a[0])}</td><td>${esc(a[2])}</td><td class="num">${a[3]}</td><td class="num">${a[4]}</td><td>${esc(a[5])}</td><td class="num">${nf(a[6])}</td><td class="num">${nf(a[7])}</td><td class="num">${nf(a[8])}</td><td class="num">${nf(a[9])}</td><td class="num">${nf(a[10])}</td><td class="num">${a[13] == null ? '—' : hhmm(a[13])}</td><td class="small">${a[14].split(',').map(t => esc(tipos[t])).join('; ')}</td></tr>`).join('')}</tbody></table></div>`;
      abaA._filtrados = f;
    };
    selUf.onchange = selTipo.onchange = desenhar;
    abaA.querySelectorAll('.filtro-alerta').forEach(b => b.onclick = () => { selTipo.value = selTipo.value === b.dataset.tipo ? '' : b.dataset.tipo; desenhar(); });
    abaA.querySelector('#al-tabela').addEventListener('click', e => { const tr = e.target.closest('tr[data-uf]'); if (tr) irPara(tr.dataset.ibge ? { tipo: 'municipio', ibge: +tr.dataset.ibge } : { tipo: 'uf', uf: tr.dataset.uf }); });
    abaA.querySelector('#al-csv').onclick = () => {
      const cab = R.meta.colunas.alerta.join(';');
      const corpo = (abaA._filtrados || lista).map(a => a.map(v => v == null ? '' : String(v).includes(';') ? `"${v}"` : v).join(';')).join('\n');
      const url = URL.createObjectURL(new Blob(['﻿' + cab + '\n' + corpo], { type: 'text/csv;charset=utf-8' }));
      Object.assign(document.createElement('a'), { href: url, download: 'alertas-secoes-tse-2026.csv' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    desenhar();
  });

  // Linhas com data-uf abrem o estado no mapa (tabelas da visão geral, biometria e estados).
  for (const id of ['aba-geral', 'aba-biometria', 'aba-estados']) {
    const el = document.getElementById(id);
    const abrir = e => { const tr = e.target.closest('tr[data-uf]'); if (tr && (e.type === 'click' || e.key === 'Enter')) irPara({ tipo: 'uf', uf: tr.dataset.uf }); };
    el.addEventListener('click', abrir); el.addEventListener('keydown', abrir);
  }
}
