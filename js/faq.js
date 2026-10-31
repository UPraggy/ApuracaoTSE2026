// Perguntas comuns em formato de conversa. Não usa IA: a busca procura as palavras nas perguntas prontas.
import { nf, pct, esc, norm } from './util.js?v=551bd26ea6';

export function iniciarFaq(R, { NOME_A, NOME_B }) {
  const T = R.total, H = R.horario;
  const PERGUNTAS = [
    { p: 'De onde vêm esses dados?', r: `Dos <b>boletins de urna</b> que o TSE publica no <a href="${R.meta.fonte}" target="_blank" rel="noopener">Portal de Dados Abertos</a>: um arquivo por estado, mais o exterior, 28 no total. Cada arquivo foi conferido com o código SHA-512 que o próprio TSE publica, o que garante que não foi alterado no caminho. Os mapas e as regiões são do <b>IBGE</b>. A aba "Método e fontes" traz todos os endereços.`, k: 'fonte origem dados tse ibge onde' },
    { p: 'Este site é oficial?', r: 'Não. É um painel independente, feito com dados públicos e sem vínculo com a Justiça Eleitoral ou com partidos. O código e o método estão abertos no GitHub para qualquer pessoa refazer as contas.', k: 'oficial tse governo partido independente' },
    { p: 'Os números batem com o resultado oficial?', r: `A soma de todos os boletins dá ${esc(NOME_A)} <b>${nf(T.a)}</b> e ${esc(NOME_B)} <b>${nf(T.b)}</b>, uma diferença de ${nf(Math.abs(T.a - T.b))} votos, com ${nf(T.comp)} votantes em ${nf(T.secoes)} seções. Esses são os mesmos totais divulgados pelo TSE.`, k: 'resultado oficial total bate soma confere' },
    { p: 'O que é um boletim de urna?', r: 'É o "extrato" que cada urna imprime quando a votação termina: quantos eleitores estavam aptos, quantos votaram e quantos votos cada candidato teve, mais brancos e nulos. Ele é afixado na porta da seção e publicado na internet, e qualquer pessoa pode comparar as duas versões.', k: 'boletim bu urna o que e' },
    { p: 'Foi assim em 2022 também?', r: 'Em quase tudo, sim: as contas fecham nos dois anos e a distribuição dos votos é parecida. Duas coisas mudaram, as duas por causa da prorrogação até as 19h decidida pelo STF em 2026. O fechamento às 19h quase não existia em 2022 (21 urnas, contra mais de 6 mil em 2026). E em 2026 o TSE suspendeu o recebimento dos boletins até as 19h, o que em 2022 não aconteceu. A aba <b>2022 × 2026</b> mostra tudo lado a lado.', k: '2022 antes passado comparar historico ano anterior' },
    { p: 'O que quer dizer "sem habilitação biométrica"?', r: `É quem <b>tem digital cadastrada</b>, mas foi liberado para votar sem ela, normalmente porque o leitor não reconheceu o dedo; a identificação foi feita por documento com foto. Em 2026 foram ${nf(R.totalBrasil.biom)} pessoas, ${pct(R.totalBrasil.biom, R.totalBrasil.comp, 2)} de quem votou no Brasil (no exterior o campo vem zerado). Quem nunca cadastrou a biometria não entra nesse número.`, k: 'biometria digital sem habilitacao leitor documento' },
    { p: 'Dá para saber em quem votou quem não usou a digital?', r: 'Não. O boletim traz apenas o total de cada seção, e o voto é secreto. O que dá para fazer é comparar seções com mais e menos liberações sem digital. Dentro da mesma escola, a diferença no resultado é pequena (aba Biometria).', k: 'biometria quem votou candidato digital secreto' },
    { p: 'Quantas pessoas votaram depois das 17h?', r: 'Cerca de <b>35 mil</b> no país, pelos logs das urnas, que registram a hora de cada voto. O TSE informou 34.393: 32.399 entre 17h e 18h, 1.981 entre 18h e 19h e 13 depois das 19h. Quase todos estavam na fila às 17h. O log não diz em quem a pessoa votou.', k: 'depois 17h apos votos quantos fila log' },
    { p: 'Quantos votaram sem biometria depois das 17h?', r: 'Cerca de <b>1.200</b> eleitores com digital cadastrada foram liberados sem ela depois das 17h, e outros cerca de 3.100 votaram nesse horário sem ter biometria no cadastro. Essa proporção não aumentou depois das 17h: nas urnas normais da amostra foi de 7,2% depois das 17h contra 6,9% no dia todo, e nas urnas que ficaram abertas até as 19h, de 5,45% contra 6,36%. Nas urnas abertas até as 19h, ninguém foi liberado sem a digital depois das 19h.', k: 'biometria digital sem depois 17h apos' },
    { p: 'A apuração tem padrão de robô, repetição ou correção?', r: 'Testamos e não encontramos. Nenhum bloco de boletins se repete e nenhum tem a mesma % de outro. Urnas da mesma escola com votos idênticos são 1.835 pares, um pouco <b>menos</b> do que o acaso daria (1.994 a 2.122). Uma injeção de votos em proporção fixa deixaria os blocos parecidos demais, e eles variam mais do que o acaso porque chegam por cidade e zona. Limite: os dados abertos trazem cada boletim uma vez, no estado final; correções durante a divulgação ao vivo não aparecem nesse arquivo.', k: 'robo bot repeticao padrao correcao fraude curva apuracao' },
    { p: 'Por que algumas urnas fecharam depois das 19h?', r: `${nf(H.apos19)} urnas fecharam depois das 19h de Brasília, quase todas entre 19:00 e 19:15 e concentradas em algumas zonas do RJ, SP, BA, PE e PB. Elas abriram normalmente às 8h, e o resultado delas é parecido com o das urnas vizinhas. O motivo é oficial: o ministro Cristiano Zanin (STF) estendeu a votação até as 19h nos locais ainda abertos às 17h, depois de as duas candidaturas relatarem problemas de transporte de eleitores (<a href="https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/esclarecimento-sobre-prorrogacao-da-votacao" target="_blank" rel="noopener">nota do TSE</a>). Pelos logs, a maioria dessas urnas ficou parada esperando o novo horário: o último voto típico foi às 16:59, e depois das 19h só entraram 11 votos.`, k: 'horario 19h fechou tarde encerramento atraso' },
    { p: 'Um "alerta" quer dizer que houve fraude?', r: 'Não. Alerta é uma verificação automática que separa seções que vale a pena olhar de perto. As verificações de conta (votos maiores que eleitores, números que não fecham) deram <b>zero</b>. As demais apontam coisas raras, mas com explicações comuns: aldeias que votam em bloco, filas em cidades grandes, leitor de digital com defeito.', k: 'alerta fraude irregularidade problema prova' },
    { p: 'Por que há seções com 100% para um candidato?', r: 'Elas existem, mas são poucas: 91 entre quase 500 mil. Ficam quase todas em aldeias indígenas e comunidades rurais pequenas, onde o voto costuma ser em bloco. A lista está na aba Alertas, com o local de cada uma.', k: 'unanime 100% cem por cento aldeia' },
    { p: 'O que é "ZZ" e "UF"?', r: '<b>UF</b> é a unidade da Federação (estado ou DF). <b>ZZ</b> é o código que o TSE usa para as seções no <b>exterior</b>: não é um estado e por isso não aparece no mapa. Use o botão "Exterior (ZZ)". Em todo o site, passar o mouse numa sigla mostra o nome completo.', k: 'zz uf sigla exterior estado' },
    { p: 'Como confiro o boletim da minha seção?', r: 'Procure sua escola ou seu bairro na busca do topo para ver o resultado do local. Para ver o boletim de uma seção específica, use o site <a href="https://resultados.tse.jus.br/" target="_blank" rel="noopener">resultados.tse.jus.br</a> ou o aplicativo "Boletim na Mão", que lê o QR Code impresso no boletim.', k: 'conferir minha secao escola boletim qr code' },
    { p: 'Por que minha escola não aparece no mapa?', r: 'Cerca de 1,7% dos locais não tem coordenadas no cadastro do TSE. Eles aparecem nas listas e na busca, mas não viram bolinha no mapa.', k: 'escola nao aparece mapa coordenada local' },
    { p: 'Por que vermelho e azul?', r: `Seguem a convenção mais usada no Brasil: ${esc(NOME_A)} em vermelho e ${esc(NOME_B)} em azul. Os dois recebem o mesmo tratamento: a ordem é a do número na urna, e a cor mostra só quem lidera e por quanto, com as mesmas faixas para os dois.`, k: 'cor vermelho azul imparcial lado' },
    { p: 'Os dados se atualizam sozinhos?', r: 'Não. São os arquivos coletados em 30/10/2026. Se o TSE republicar algo, é preciso rodar o script de novo; o passo a passo está no README do projeto.', k: 'atualiza atualizacao tempo real ao vivo' },
    { p: 'Posso baixar os dados?', r: 'Sim. A aba Alertas tem um botão de CSV. Os arquivos originais estão no portal do TSE, e os JSON deste site ficam públicos no repositório do GitHub (pasta site/dados).', k: 'baixar download csv dados planilha' }
  ];

  const sec = document.getElementById('faq');
  sec.innerHTML = `
    <h2>Perguntas comuns</h2>
    <p class="muted">Toque numa pergunta ou escreva a sua. As respostas são fixas, escritas a partir dos dados; não há robô inventando nada.</p>
    <div class="chat" id="chat" aria-live="polite"></div>
    <div class="chips" id="chips">${PERGUNTAS.map((q, i) => `<button class="chip-q" data-i="${i}">${esc(q.p)}</button>`).join('')}</div>
    <form class="chat-form" id="chat-form" autocomplete="off"><input id="chat-in" type="text" placeholder="Escreva uma pergunta… (ex.: biometria, 19h, fraude)" aria-label="Escreva uma pergunta"><button class="botao primario">Perguntar</button></form>`;
  const chat = sec.querySelector('#chat');
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function bolha(quem, html) {
    const b = document.createElement('div');
    b.className = 'bolha ' + quem;
    b.innerHTML = html;
    chat.append(b);
    chat.scrollTop = chat.scrollHeight;
    return b;
  }
  function responder(i, textoUsuario) {
    const q = PERGUNTAS[i];
    bolha('eu', esc(textoUsuario || q.p));
    const r = bolha('painel', '<span class="digitando"><i></i><i></i><i></i></span>');
    setTimeout(() => { r.innerHTML = q.r; chat.scrollTop = chat.scrollHeight; }, reduzido ? 0 : 550);
  }
  sec.querySelector('#chips').onclick = e => { const b = e.target.closest('.chip-q'); if (b) responder(+b.dataset.i); };
  sec.querySelector('#chat-form').onsubmit = e => {
    e.preventDefault();
    const inp = sec.querySelector('#chat-in'), txt = inp.value.trim();
    if (!txt) return;
    const termos = norm(txt).split(' ').filter(t => t.length > 2);
    let melhor = -1, nota = 0;
    PERGUNTAS.forEach((q, i) => {
      const alvo = norm(q.p + ' ' + q.k);
      const s = termos.reduce((n, t) => n + (alvo.includes(t) ? 1 : alvo.includes(t.slice(0, 5)) ? 0.5 : 0), 0);
      if (s > nota) { nota = s; melhor = i; }
    });
    inp.value = '';
    if (melhor >= 0) responder(melhor, txt);
    else { bolha('eu', esc(txt)); bolha('painel', 'Não tenho uma resposta pronta para isso. Veja as perguntas abaixo ou a aba <b>Método e fontes</b>.'); }
  };
  bolha('painel', `Olá! Aqui você tira dúvidas sobre os dados do 2º turno de 2026. Por exemplo: <i>${esc(PERGUNTAS[0].p)}</i>`);
}
