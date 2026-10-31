// Aba "2022 × 2026": resultados de 2014 a 2026 e o fluxo do dia (encerramento e recebimento) lado a lado.
import { UF_NOME, carregar, nf, pct, pp, hhmm, esc, sigla, titulo, corCss, fonte } from './util.js?v=e7f49fd024';

const relogio = min => (min >= 1440 ? '+1d ' : '') + hhmm(min % 1440);

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
  const linhasFluxo = [
    ['Urnas fechadas depois das 17:05 (fila normal)', h22.apos1705, h26.apos1705],
    ['Urnas fechadas depois das 17:30', h22.apos1730, h26.apos1730],
    ['Urnas fechadas depois das 19:00', h22.apos19, h26.apos19],
    ['Boletins recebidos entre 17:10 e 19:00', r22.entre1710e1900, receb26],
    ['Liberados sem a digital (% de quem votou)', F['2022'].biometria.pct + '%', F['2026'].biometria.pct + '%'],
    ['Seções com algum alerta automático', F['2022'].alertas?.secoesComAlerta ?? '—', R.alertas.secoesComAlerta]
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
        ${linhasFluxo.map(([r, a, b]) => `<tr><td>${r}</td><td class="num">${typeof a === 'number' ? nf(a) : esc(a)}</td><td class="num">${typeof b === 'number' ? nf(b) : esc(b)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="nota"><b>O que é diferente em 2026:</b> o fechamento às 19h quase não existia em 2022 (21 urnas). Nas mesmas zonas do RJ e de SP, as urnas fecharam perto das 17h em 2022 e em 2018. Em 2022 o TSE já registrava boletins recebidos entre 17:10 e 19:00 (${nf(r22.entre1710e1900)}); em 2026, nenhum. Os dados mostram <b>que</b> mudou, não <b>por quê</b>. Isso cabe ao TSE e aos TREs explicar, pelos logs e pelas atas.</div>
      <h3>Urnas encerradas por horário (Brasília), mesma escala</h3>
      <div class="grid2 hist2">${histograma(h22.histograma, histMax, '2022', c1)}${histograma(h26.histograma, histMax, '2026', c2)}</div>
      <p class="small muted">Altura em raiz quadrada para os blocos pequenos aparecerem; passe o mouse para ver o número.</p>
      ${fonte('bu')}
    </section>
    <section class="bloco"><h3>A apuração vista pelo recebimento dos boletins</h3>
      <div class="legenda-graf"><span><i style="background:${c1}"></i>2022</span><span><i style="background:${c2}"></i>2026</span></div>
      <h4 class="sub">Seções recebidas ao longo da noite (%)</h4>
      ${linhas([{ nome: '2022', cor: c1, pts: tempo('2022') }, { nome: '2026', cor: c2, pts: tempo('2026') }], { xmin: 1020, xmax: 1380, ymin: 0, ymax: 100, fx: relogio, fy: v => Math.round(v) + '%', rotulo: 'Seções recebidas por horário' })}
      <h4 class="sub">% do 13 no total já recebido, conforme a apuração avança</h4>
      ${linhas([{ nome: '2022', cor: c1, pts: curva('2022') }, { nome: '2026', cor: c2, pts: curva('2026') }], { xmin: 0, xmax: 100, ymin: 38, ymax: 56, fx: v => Math.round(v) + '% recebido', fy: v => v.toFixed(0) + '%', rotulo: 'Percentual do 13 no acumulado' })}
      <p class="small muted">"Virada" é quando a linha cruza 50%. A ordem de chegada depende de região e horário (o Sudeste costuma chegar antes), e não diz nada sobre os votos.</p>
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
  el.addEventListener('click', e => { const tr = e.target.closest('tr[data-uf]'); if (tr) irPara({ tipo: 'uf', uf: tr.dataset.uf }); });
  void UF_NOME; void NOME_A; void NOME_B;
}
