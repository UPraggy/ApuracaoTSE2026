// Aba "2022 × 2026": resultados de 2014 a 2026 e o fluxo do dia (encerramento e recebimento) lado a lado.
import { UF_NOME, carregar, nf, pct, pp, hhmm, esc, sigla, titulo, corCss, fonte } from './util.js';
import { linhaInterativa } from './grafico.js';

const relogio = min => (min >= 1440 ? '+1d ' : '') + hhmm(min % 1440);
const horasCheias = (xmin, xmax) => { const passo = xmax - xmin > 300 ? 120 : 60, out = []; for (let t = Math.ceil(xmin / passo) * passo; t <= xmax; t += passo) out.push(t); return out; };

// Linhas num só eixo (x e y numéricos), com dica por ponto.
function linhas(series, { xmin, xmax, ymin, ymax, fx, fy, rotulo }) {
  const L = 640, H = 260, m = { t: 12, r: 12, b: 34, l: 52 }, w = L - m.l - m.r, h = H - m.t - m.b;
  const X = x => m.l + w * (x - xmin) / (xmax - xmin), Y = y => m.t + h - h * (y - ymin) / (ymax - ymin);
  const ty = [0, 0.25, 0.5, 0.75, 1].map(f => ymin + f * (ymax - ymin)), tx = [0, 0.25, 0.5, 0.75, 1].map(f => xmin + f * (xmax - xmin));
  return `<svg class="grafico" viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(rotulo)}">
    ${ty.map(t => `<line x1="${m.l}" x2="${L - m.r}" y1="${Y(t)}" y2="${Y(t)}" class="grade"/><text x="${m.l - 6}" y="${Y(t) + 4}" class="eixo" text-anchor="end">${fy(t)}</text>`).join('')}
    ${tx.map(t => `<text x="${X(t)}" y="${H - 12}" class="eixo" text-anchor="middle">${fx(t)}</text>`).join('')}
    ${series.map(s => `<path d="${s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('')}" fill="none" stroke="${s.cor}" stroke-width="2.2" class="linha-anim"/>
      ${s.pts.filter((_, i) => i % Math.max(1, Math.floor(s.pts.length / 24)) === 0).map(p => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="7" fill="transparent"><title>${esc(s.nome)} · ${fx(p[0])}: ${fy(p[1])}</title></circle>`).join('')}`).join('')}
    <line x1="${m.l}" x2="${L - m.r}" y1="${m.t + h}" y2="${m.t + h}" class="base"/>
  </svg>`;
}
// Histogramas pequenos com a MESMA escala, para comparar dois anos sem enganar o olho.
function histograma(dados, max, titulo_, cor) {
  const L = 300, H = 170, m = { t: 22, r: 6, b: 26, l: 8 }, w = L - m.l - m.r, h = H - m.t - m.b, bw = w / dados.length;
  return `<svg class="grafico" viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(titulo_)}"><text x="${m.l}" y="14" class="eixo forte">${esc(titulo_)}</text>
    ${dados.map((d, i) => { const bh = h * Math.sqrt(d.secoes) / Math.sqrt(max), x = m.l + i * bw; return `<g class="barra-g"><rect x="${x}" y="${m.t}" width="${bw}" height="${h}" class="alvo"><title>${hhmm(d.min)}: ${nf(d.secoes)} urnas</title></rect><rect x="${x + 0.5}" y="${m.t + h - bh}" width="${Math.max(1, bw - 1)}" height="${bh}" fill="${cor}" pointer-events="none"/></g>`; }).join('')}
    ${[[1.2, '16:30'], [6, '17:00'], [18, '18:00'], [30, '19:00'], [42, '20:00']].map(([i, t]) => `<text x="${m.l + i * bw}" y="${H - 8}" class="eixo" text-anchor="middle">${t}</text>`).join('')}
    <line x1="${m.l}" x2="${L - m.r}" y1="${m.t + h}" y2="${m.t + h}" class="base"/></svg>`;
}

export async function iniciarComparar(R, { NOME_A, NOME_B, irPara }) {
  const el = document.getElementById('aba-comparar');
  let Hs;
  try { Hs = await carregar('historico-resumo.json'); } catch (e) { el.innerHTML = '<p class="muted">Dados históricos indisponíveis.</p>'; return; }
  const A = Hs.anos, F = Hs.fluxo, C = Hs.comparacao['2022-2026'];
  const anos = ['2014', '2018', '2022', '2026'].filter(a => A[a]);
  const c1 = corCss('--serie-1'), c2 = corCss('--serie-2');
  const nomeCand = (ano, i) => titulo(A[ano].candidatos[i].nome) + ' (' + A[ano].candidatos[i].nr + ')';

  // Recebimento 2026 entre 17:10 e 19:00 a partir da linha do tempo do próprio painel.
  const receb26 = R.apuracao.filter(b => b.min >= 1030 && b.min < 1140).reduce((s, b) => s + Object.values(b.ufs).reduce((q, u) => q + u[0], 0), 0);
  const h22 = F['2022'].horario, h26 = R.horario, r22 = F['2022'].recebimento;
  // [rótulo, 2022, 2026, [base 2022, base 2026]] → mostrado como % da base (urnas do ano) com o número ao lado.
  const urnas = [A['2022'].total?.secoes ?? A['2022'].totalBrasil.secoes, R.total.secoes];
  const linhasFluxo = [
    ['Urnas fechadas depois das 17:05 (fila normal)', h22.apos1705, h26.apos1705, urnas],
    ['Urnas fechadas depois das 17:30', h22.apos1730, h26.apos1730, urnas],
    ['Urnas fechadas depois das 19:00', h22.apos19, h26.apos19, urnas],
    ['Boletins recebidos entre 17:10 e 19:00', r22.entre1710e1900, receb26, urnas],
    ['Liberados sem a digital (% de quem votou)', F['2022'].biometria.pct + '%', F['2026'].biometria.pct + '%'],
    ['Seções com algum alerta automático', F['2022'].alertas?.secoesComAlerta ?? '—', R.alertas.secoesComAlerta, urnas]
  ];
  // Zonas que concentraram o fechamento às 19h em 2026: como elas fecharam em 2022.
  const alertas = await carregar('alertas.json');
  const pico26 = new Map();
  for (const a of alertas) if (a[14].includes('fecha_19h')) { const k = `${a[0]} ${a[2]} Z${a[3]}`; pico26.set(k, (pico26.get(k) || 0) + 1); }
  const pico = Object.entries(F['2022'].zonasDoPico2026 || {}).map(([k, z]) => ({ k, z22: z, n26: pico26.get(k) || 0 })).sort((a, b) => b.n26 - a.n26);
  const histMax = Math.max(...h22.histograma.map(d => d.secoes), ...h26.histograma.map(d => d.secoes));
  const curva = ano => (F[ano].curva?.pontos || []).map(p => [p.pctSecoes, p.pctA]);
  const tempo = ano => (F[ano].curva?.pontos || []).map(p => [p.min, p.pctSecoes]);

  el.innerHTML = `
    <h2>2022 × 2026</h2>
    <p class="lead">Mesma eleição (2º turno, Presidente), anos diferentes. Tudo vem dos boletins de urna oficiais de cada ano, conferidos com o hash publicado pelo TSE. A soma por município bate com a totalização oficial.</p>
    <section class="bloco"><h3>Resultado do 2º turno em cada eleição</h3>
      <div class="anos">${anos.map(ano => { const t = A[ano].totalBrasil, v = t.a + t.b; return `<div class="ano"><div class="ano-cab"><b>${ano}</b><span class="muted small">comparecimento ${pct(t.comp, t.aptos)} · brancos+nulos ${pct(t.br + t.nu, t.comp)}</span></div>
        <div class="barra"><span class="seg ${ano === '2014' || ano === '2018' || ano === '2022' || ano === '2026' ? 'a' : ''}" style="width:${100 * t.a / v}%"></span><span class="seg b" style="width:${100 * t.b / v}%"></span></div>
        <div class="placar-nomes small"><span>${esc(nomeCand(ano, 0))} <b>${pct(t.a, v, 2)}</b></span><span><b>${pct(t.b, v, 2)}</b> ${esc(nomeCand(ano, 1))}</span></div></div>`; }).join('')}</div>
      <p class="small muted">Vermelho = candidato de número 13 em todos os anos; azul = o outro finalista. Brasil sem o exterior.</p>
      ${fonte('bu')}
    </section>
    <section class="bloco"><h3>O que mudou de 2022 para 2026</h3>
      <div class="cards">
        <div class="card"><span class="valor">${pp(C.brasil.dComparecimentoPP)}</span><span class="rot">p.p. no comparecimento (${C.brasil.compPct2022}% → ${C.brasil.compPct2026}%)</span></div>
        <div class="card"><span class="valor">${pp(C.brasil.dPctAValidosPP)}</span><span class="rot">p.p. para o 13 nos válidos (${C.brasil.pctA2022}% → ${C.brasil.pctA2026}%)</span></div>
        <div class="card"><span class="valor">${pp(C.brasil.dBrancoNuloPP)}</span><span class="rot">p.p. em brancos+nulos (${C.brasil.bnPct2022}% → ${C.brasil.bnPct2026}%)</span></div>
        <div class="card"><span class="valor">${nf(C.municipios.municipiosQueCairamA)}</span><span class="rot">municípios onde a % do 13 caiu (mediana ${pp(C.municipios.mediana.dPctAValidosPP)} p.p.); ${nf(C.municipios.municipiosQueSubiramA)} onde subiu</span></div>
      </div>
      <p class="small muted">A % nacional sobe mesmo com a maioria dos municípios caindo porque o aumento veio de cidades grandes. Veja no mapa: Cor › "Variação do 13 (2022→2026)".</p>
    </section>
    <section class="bloco"><h3>O fluxo do dia: 2022 e 2026</h3>
      <div class="tabela-rolagem"><table><thead><tr><th>Indicador</th><th class="num">2022</th><th class="num">2026</th></tr></thead><tbody>
        ${linhasFluxo.map(([r, a, b, base]) => `<tr><td>${r}</td><td class="num">${typeof a === 'number' ? `<b>${pct(a, base?.[0] ?? 1, 2)}</b> <small class="muted">${nf(a)}</small>` : esc(a)}</td><td class="num">${typeof b === 'number' ? `<b>${pct(b, base?.[1] ?? 1, 2)}</b> <small class="muted">${nf(b)}</small>` : esc(b)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="nota"><b>O que é diferente em 2026, e por quê:</b> o fechamento às 19h quase não existia em 2022 (21 urnas). Nas mesmas zonas do RJ e de SP, as urnas fecharam perto das 17h em 2022 e em 2018. Em 2022 o TSE já registrava boletins recebidos entre 17:10 e 19:00 (${nf(r22.entre1710e1900)}); em 2026, nenhum. A explicação oficial: o ministro Cristiano Zanin (STF) prorrogou a votação até as 19h nos locais ainda abertos às 17h, e o TSE suspendeu o recebimento dos boletins até as 19h (<a href="https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/esclarecimento-sobre-prorrogacao-da-votacao" target="_blank" rel="noopener">nota do TSE</a>). Pelos logs, essas urnas receberam poucos votos depois das 17h (veja a aba Horários).</div>
      <h3>Urnas encerradas por horário (Brasília), mesma escala</h3>
      <div class="grid2 hist2">${histograma(h22.histograma, histMax, '2022', c1)}${histograma(h26.histograma, histMax, '2026', c2)}</div>
      <p class="small muted">Altura em raiz quadrada para os blocos pequenos aparecerem; passe o mouse para ver o número.</p>
      ${fonte('bu')}
    </section>
    <section class="bloco"><h3>A corrida da apuração, ano a ano</h3>
      <p class="muted small">% de cada candidato no total já apurado, horário a horário (Brasília), pela ordem em que os boletins chegaram ao TSE. Passe o mouse ou o dedo no gráfico, use as setas do teclado ou toque "Tocar" para ver a apuração andando. Clique no nome de uma linha para escondê-la.</p>
      <div class="corridas">${['2022', '2026'].filter(a => F[a]?.curva?.pontos?.length).map(a => `<div><h4 class="sub">${a}: ${esc(nomeCand(a, 0))} × ${esc(nomeCand(a, 1))}</h4><div id="corrida-${a}"></div></div>`).join('')}</div>
      <p class="small muted">A ordem de chegada depende de região e horário (o Sudeste costuma chegar antes), por isso a % muda ao longo da noite e pode haver "virada". Isso não diz nada sobre os votos em si: o resultado final é o mesmo, chegue o boletim antes ou depois. Em 2026 a apuração só começou depois das 19h, por causa da prorrogação. 2014 e 2018 não têm o horário de recebimento nos dados abertos.</p>
      <div id="por-que-curva"></div>
      <h4 class="sub">Boletins recebidos ao longo da noite (% do total de urnas)</h4>
      <div id="receb-anos"></div>
      ${fonte('bu')}
    </section>
    ${pico.length ? `<section class="bloco"><h3>Zonas que fecharam às 19h em 2026: como foi em 2022</h3>
      <div class="tabela-rolagem"><table><thead><tr><th>Zona</th><th class="num">Urnas após 19h em 2026</th><th class="num">Após 19h em 2022</th><th class="num">Encerramento mediano 2022</th></tr></thead><tbody>
        ${pico.map(p => `<tr><td>${esc(p.k)}</td><td class="num">${nf(p.n26)}</td><td class="num">${nf(p.z22.apos19)}</td><td class="num">${hhmm(p.z22.encerramentoMediano)}</td></tr>`).join('')}
      </tbody></table></div></section>` : ''}
    <section class="bloco"><h3>Liberados sem a digital por estado</h3>
      <div class="tabela-rolagem alta"><table><thead><tr><th>UF</th><th class="num">2022</th><th class="num">2026</th><th class="num">Diferença (p.p.)</th></tr></thead><tbody>
        ${Object.keys(F['2026'].biometria.porUf.ufs).filter(u => u !== 'ZZ').sort().map(u => { const a = F['2022'].biometria.porUf.ufs[u]?.[2], b = F['2026'].biometria.porUf.ufs[u][2]; return `<tr data-uf="${u}" tabindex="0"><td>${sigla(u)}</td><td class="num">${a ?? '—'}%</td><td class="num">${b}%</td><td class="num">${a == null ? '—' : pp(b - a)}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${fonte('bu')}
    </section>
    <p class="fonte">ⓘ Método e fontes de cada ano: <a href="https://github.com/UPraggy/ApuracaoTSE2026/blob/main/docs/HISTORICO-E-FLUXO.md" target="_blank" rel="noopener">docs/HISTORICO-E-FLUXO.md</a>.</p>`;
  // Gráficos interativos (grafico.js): corrida de cada ano e recebimento comparado.
  const cA = corCss('--cor-a'), cB = corCss('--cor-b');
  for (const ano of ['2022', '2026']) {
    const alvo = el.querySelector('#corrida-' + ano), pts = F[ano]?.curva?.pontos || [];
    if (!alvo || !pts.length) continue;
    const xmin = Math.floor(pts[0].min / 30) * 30, xmax = Math.ceil(pts[pts.length - 1].min / 30) * 30;
    linhaInterativa(alvo, {
      series: [
        { nome: titulo(A[ano].candidatos[0].nome), cor: cA, pts: pts.map(p => [p.min, p.pctA]) },
        { nome: titulo(A[ano].candidatos[1].nome), cor: cB, pts: pts.map(p => [p.min, 100 - p.pctA]) }
      ],
      xmin, xmax, ticksX: horasCheias(xmin, xmax), ymin: 35, ymax: 65, referencia: 50, tocar: true, rotulo: `Corrida da apuração em ${ano}`,
      fx: relogio, fy: v => v.toFixed(2).replace('.', ',') + '%',
      dica: x => { let k = 0; pts.forEach((p, i) => { if (Math.abs(p.min - x) < Math.abs(pts[k].min - x)) k = i; }); return `${pts[k].pctSecoes.toFixed(1).replace('.', ',')}% das urnas apuradas`; }
    });
  }
  // ---------- Por que a curva tem esse formato? Faixa do acaso + composição por região ----------
  try {
    const SIM = await carregar('simulacao.json');
    const REG = R.regioes, regDe = uf => Object.keys(REG).find(k => REG[k].includes(uf));
    const NOME_REG = { N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul' };
    // Quanto de cada região já tinha chegado em cada ponto da apuração (blocos de 5 min por UF: [secoes, a, b, ...]).
    function composicao(blocos) {
      const tot = {}, acum = {};
      for (const b of blocos) for (const [uf, v] of Object.entries(b.ufs)) { if (uf === 'ZZ') continue; const r = regDe(uf); tot[r] = tot[r] || [0, 0, 0]; tot[r][0] += v[0]; tot[r][1] += v[1]; tot[r][2] += v[2]; }
      const totS = Object.values(tot).reduce((x, v) => x + v[0], 0), marcos = [10, 25, 50, 75], saida = [];
      let s = 0, m = 0;
      for (const b of blocos) {
        for (const [uf, v] of Object.entries(b.ufs)) { if (uf === 'ZZ') continue; const r = regDe(uf); acum[r] = acum[r] || [0, 0, 0]; acum[r][0] += v[0]; acum[r][1] += v[1]; acum[r][2] += v[2]; s += v[0]; }
        while (m < marcos.length && 100 * s / totS >= marcos[m]) {
          const regs = Object.keys(tot).map(r => ({ r, peso: (acum[r]?.[0] || 0) / s, pesoFinal: tot[r][0] / totS, pctA: 100 * tot[r][1] / (tot[r][1] + tot[r][2]) }));
          const a = Object.values(acum).reduce((x, v) => x + v[1], 0), bb = Object.values(acum).reduce((x, v) => x + v[2], 0);
          saida.push({ marco: marcos[m], hora: b.min, pctA: 100 * a / (a + bb), regs }); m++;
        }
      }
      return saida;
    }
    const blocos = { '2026': R.apuracao, '2022': F['2022']?.apuracao || [] };
    const alvoPQ = el.querySelector('#por-que-curva');
    let html = `<h3 class="sub-h">Por que a curva tem esse formato? E qual a chance disso?</h3>
      <p class="muted small">Teste: se os boletins chegassem em <b>ordem aleatória</b>, como a curva ficaria? Sorteamos a ordem de chegada centenas de vezes. A faixa sombreada mostra onde a % do 13 ficou em 95% dos sorteios.</p>
      <div class="corridas">`;
    const anosSim = ['2022', '2026'].filter(a => SIM[a] && F[a]?.curva?.pontos?.length);
    for (const ano of anosSim) html += `<div><h4 class="sub">${ano}</h4><div id="sim-${ano}"></div><div class="bot-texto" id="bot-${ano}"></div></div>`;
    alvoPQ.innerHTML = html + '</div>';
    for (const ano of anosSim) {
      const S = SIM[ano], pts = F[ano].curva.pontos, mun = S.municipio, urna = S.urna;
      const faixas = [{ nome: 'Acaso, sorteando municípios inteiros', cor: 'color-mix(in srgb, var(--serie-1) 22%, transparent)', pts: mun.grade.map((g, i) => [g, mun.p025[i], mun.p975[i]]) }];
      if (urna) faixas.push({ nome: 'Acaso, sorteando urna por urna', cor: 'color-mix(in srgb, var(--serie-2) 55%, transparent)', pts: urna.grade.map((g, i) => [g, urna.p025[i], urna.p975[i]]) });
      linhaInterativa(el.querySelector('#sim-' + ano), {
        series: [{ nome: `% do ${A[ano].candidatos[0].nr} na apuração real`, cor: cA, pts: pts.map(p => [p.pctSecoes, p.pctA]) }],
        faixa: faixas, xmin: 0, xmax: 100, ymin: 38, ymax: 62, referencia: 50, rotulo: `Apuração real × acaso, ${ano}`,
        fx: v => v.toFixed(0) + '% apurado', fy: v => v.toFixed(2).replace('.', ',') + '%',
        dica: x => { const i = Math.max(0, Math.min(99, Math.round(x) - 1)); return `acaso (municípios): ${mun.p025[i].toFixed(1).replace('.', ',')}–${mun.p975[i].toFixed(1).replace('.', ',')}%` + (urna ? ` · acaso (urnas): ${urna.p025[i].toFixed(2).replace('.', ',')}–${urna.p975[i].toFixed(2).replace('.', ',')}%` : ''); }
      });
      // Texto do "bot": números calculados, linguagem simples.
      const comp = composicao(blocos[ano] || []), v = F[ano].curva.virada, nA = titulo(A[ano].candidatos[0].nome), nB = titulo(A[ano].candidatos[1].nome);
      const pctNum = (x, d = 1) => x.toFixed(d).replace('.', ',');
      const viradasReais = []; for (let i = 1; i < pts.length; i++) if ((pts[i].pctA > 50) !== (pts[i - 1].pctA > 50) && pts[i].pctSecoes >= 5) viradasReais.push(pts[i]);
      const c25 = comp.find(c => c.marco === 25) || comp[0];
      let frases = [];
      frases.push(`No fim, ${esc(nA)} teve <b>${pctNum(mun.finalA, 2)}%</b> dos válidos.`);
      if (urna) frases.push(`<b>Se as urnas chegassem uma a uma, em ordem sorteada</b>, a % ficaria colada no resultado final desde o começo: com 10% apurado, entre ${pctNum(urna.p025[9], 2)}% e ${pctNum(urna.p975[9], 2)}%. Houve virada em <b>${urna.viradasApos5pct} de ${urna.rodadas}</b> sorteios: a chance é praticamente zero.`);
      frases.push(`Mas a apuração chega em <b>blocos</b> (cidades e regiões inteiras de uma vez). Sorteando municípios inteiros, houve virada em <b>${mun.viradasApos5pct} de ${mun.rodadas}</b> sorteios (<b>${pctNum(100 * mun.viradasApos5pct / mun.rodadas, 0)}%</b>). Ou seja, com chegada em blocos, virada é comum.`);
      frases.push(viradasReais.length ? `Na apuração real a liderança trocou de lado ${viradasReais.length === 1 ? 'uma vez' : viradasReais.length + ' vezes'} depois de 5% apurado${v ? `, a última com ${pctNum(v.pctSecoes)}% das urnas apuradas` : ''}.` : 'Na apuração real não houve troca de liderança depois de 5% apurado.');
      if (c25) {
        const desvios = c25.regs.map(r => ({ ...r, dif: r.peso - r.pesoFinal })).sort((x, y) => y.dif - x.dif);
        const adiantada = desvios[0], atrasada = desvios[desvios.length - 1];
        frases.push(`<b>Por que a curva começou ${c25.pctA > mun.finalA ? 'acima' : 'abaixo'} do resultado final:</b> com 25% apurado, o ${NOME_REG[adiantada.r]} era ${pctNum(100 * adiantada.peso)}% das urnas já apuradas (no total, é ${pctNum(100 * adiantada.pesoFinal)}%), e lá ${esc(nA)} teve ${pctNum(adiantada.pctA)}%. O ${NOME_REG[atrasada.r]} estava atrasado: ${pctNum(100 * atrasada.peso)}% do apurado contra ${pctNum(100 * atrasada.pesoFinal)}% no total, e lá ${esc(nA)} teve ${pctNum(atrasada.pctA)}%. Conforme as regiões atrasadas chegam, a curva se aproxima do resultado final.`);
      }
      frases.push(`<span class="muted">Conclusão: a forma da curva é explicada pela <b>ordem de chegada por região</b>, não por mudança nos votos. Cada boletim já está fechado quando chega, e a soma final é a mesma em qualquer ordem. ${ano === '2026' ? 'Em 2026 a apuração também começou mais tarde (depois das 19h, pela prorrogação).' : ''}</span>`);
      el.querySelector('#bot-' + ano).innerHTML = `<div class="bolha painel">${frases.map(f => `<p>${f}</p>`).join('')}</div><p class="fonte">ⓘ Simulação feita por este painel (<code>scripts/simular-apuracao.mjs</code>, semente fixa) sobre os boletins do TSE. ${esc(SIM.metodo)}</p>`;
    }
  } catch (e) { console.warn('simulação indisponível', e); }

  const recebAlvo = el.querySelector('#receb-anos');
  if (recebAlvo) linhaInterativa(recebAlvo, {
    series: [{ nome: '2022', cor: c1, pts: tempo('2022') }, { nome: '2026', cor: c2, pts: tempo('2026') }],
    xmin: 1020, xmax: 1380, ticksX: horasCheias(1020, 1380), ymin: 0, ymax: 100, tocar: true, rotulo: 'Boletins recebidos por horário',
    fx: relogio, fy: v => v.toFixed(1).replace('.', ',') + '%'
  });
  el.addEventListener('click', e => { const tr = e.target.closest('tr[data-uf]'); if (tr) irPara({ tipo: 'uf', uf: tr.dataset.uf }); });
  void UF_NOME; void NOME_A; void NOME_B;
}
