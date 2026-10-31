// Resume site/dados/votos-apos-17h.json (5,9 MB, gerado por logs-urna.mjs) num arquivo pequeno para o site.
// Uso: node scripts/resumo-logs.mjs
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const j = JSON.parse(await fs.readFile(RAIZ + 'site/dados/votos-apos-17h.json', 'utf8'));
const e = j.estimativaNacional, s = j.secoes19h, c = j.curvaDia;

const porUf = Object.fromEntries(Object.entries(j.porUf).map(([uf, u]) => [uf, {
  secoesLidas: u.secoes, votosApos17Estimado: u.estimativaUf?.votosApos17 ?? null, secoes19h: u.secoes19h ?? 0,
  votosApos17nas19h: u.votosApos17nas19h ?? 0, votosApos19: u.votosApos19 ?? 0
}]));
// Municípios com seções que fecharam depois das 19h, ordenados pelos votos depois das 17h (contagem completa).
const municipios = Object.entries(j.porMunicipio)
  .filter(([, m]) => m[6] > 0)
  .map(([ibge, m]) => ({ ibge: +ibge, uf: m[0], nome: m[1], secoes19h: m[6], votosApos17: m[3], votosApos18: m[4], votosApos19: m[5] }))
  .sort((a, b) => b.votosApos17 - a.votosApos17).slice(0, 40);

const resumo = {
  fonte: j.meta.fontes, conferencia: j.meta.conferencia,
  nacional: {
    votosApos17: e.votosApos17AjustadoPeloComparecimento, erroPadraoApos17: e.erroPadraoApos17, votosApos18: e.votosApos18Ajustado, votosApos19: e.votosApos19,
    semBiometriaFalhaDigitalApos17: e.semBiometriaFalhaDigitalApos17, semBiometriaNoCadastroApos17: e.semBiometriaNoCadastroApos17
  },
  tse: { votosApos17: 34393, entre17e18: 32399, entre18e19: 1981, apos19: 13, secoesApos19: 6766, url: 'https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/eleicoes-2026-mais-de-34-mil-votos-foram-registrados-apos-as-17h-no-2o-turno' },
  prorrogacao: { url: 'https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/esclarecimento-sobre-prorrogacao-da-votacao', nota: 'Nota do TSE de 25/10/2026, 18:44: por decisão do ministro Cristiano Zanin (STF), a votação seguiu apenas nos locais não encerrados às 17h; o TSE retomaria o recebimento dos BUs e a totalização após as 19h.' },
  secoes19h: {
    secoes: s.secoes, votos: s.votos, votosApos17: s.votosApos17, votosApos18: s.votosApos18, votosApos19: s.votosApos19,
    secoesComVotoApos17: s.secoesComVotoApos17, ultimoVotoMediano: s.ultimoVotoMediano, classes: s.classes,
    pausaDe60minOuMais: s.pausaDe60minOuMaisDepoisDas1630, cancelouEncerramento: s.cancelouEncerramento?.secoes ?? null,
    biometria: s.biometria.pctFalhaDigital, zonas: s.zonas.slice(0, 20)
  },
  controle: { secoes: j.controle.secoes, pctFalhaDigital: j.controle.biometria?.pctFalhaDigital ?? null },
  porUf, municipios,
  curvaDia: { blocos: c.blocos, nacional: c.nacionalEstimada, porUf: Object.fromEntries(Object.entries(c.porUf).map(([uf, u]) => [uf, u.estimadaUf])), hora50: c.horaMediana50pct, hora90: c.horaMediana90pct, observacao: c.observacao }
};
await fs.writeFile(RAIZ + 'site/dados/logs-resumo.json', JSON.stringify(resumo));
console.log('logs-resumo.json:', (JSON.stringify(resumo).length / 1024).toFixed(0), 'KB');
