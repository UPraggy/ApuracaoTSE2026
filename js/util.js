// Utilidades compartilhadas: carga de dados, formatação, nomes das siglas e escalas de cor.

export const UF_NOME = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba',
  PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima',
  RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
  ZZ: 'Exterior — seções fora do Brasil (código do TSE, não é um estado)'
};
export const REGIAO_NOME = { N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul' };

const VERSAO_DADOS = '?v=fa1c23281a'; // o deploy troca por ?v=<hash dos dados>
const cache = new Map();
export function carregar(arquivo) {
  if (!cache.has(arquivo)) cache.set(arquivo, fetch('dados/' + arquivo + VERSAO_DADOS).then(r => { if (!r.ok) throw Error(arquivo + ': HTTP ' + r.status); return r.json(); }));
  return cache.get(arquivo);
}

const fmtN = new Intl.NumberFormat('pt-BR');
export const nf = n => n == null ? '—' : fmtN.format(Math.round(n));
export const pct = (a, b, casas = 1) => b ? (100 * a / b).toFixed(casas).replace('.', ',') + '%' : '—';
export const pp = (x, casas = 2) => x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(casas).replace('.', ',');
export const hhmm = min => { const m = Math.round(min); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const titulo = s => String(s ?? '').toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(D[aeo]s?|E)\b/g, w => w.toLowerCase());

// Sigla com descrição ao passar o mouse.
export const sigla = uf => `<abbr title="${esc(UF_NOME[uf] || uf)}">${uf === 'ZZ' ? 'Exterior (ZZ)' : esc(uf)}</abbr>`;

// Soma de agregados no formato {secoes, aptos, comp, biom, a, b, br, nu, alertas}.
export const vazio = () => ({ secoes: 0, aptos: 0, comp: 0, biom: 0, a: 0, b: 0, br: 0, nu: 0, alertas: 0 });
export function somar(alvo, x) { for (const k of Object.keys(alvo)) alvo[k] += x[k] || 0; return alvo; }

// ---------- Cores ----------
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (c1, c2, t) => { const a = hex(c1), b = hex(c2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

// Resultado: classes pela % do candidato que lidera no recorte (cor do candidato, mais escura = mais folga).
export const CLASSES_VANTAGEM = [0.5, 0.55, 0.6, 0.7, 1.0001];
export function corVantagem(a, b) {
  const v = a + b; if (!v) return css('--sem-dado');
  const sa = a / v, lider = sa >= 0.5 ? 'a' : 'b', s = Math.max(sa, 1 - sa);
  const i = CLASSES_VANTAGEM.findIndex((x, k) => s >= x && s < CLASSES_VANTAGEM[k + 1]);
  return css(`--${lider}-${Math.max(0, i) + 1}`);
}
// Escala sequencial de 6 classes (uma cor, clara → escura), com limites por quantis do que está na tela.
export function classesQuantis(valores, n = 6) {
  const v = valores.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return [];
  const lim = [];
  for (let i = 1; i < n; i++) lim.push(v[Math.min(v.length - 1, Math.floor(i * v.length / n))]);
  return [...new Set(lim)];
}
export function corSequencial(valor, limites) {
  if (!Number.isFinite(valor)) return css('--sem-dado');
  const i = limites.findIndex(l => valor < l);
  const k = i === -1 ? limites.length : i, n = limites.length;
  return mix(css('--seq-0'), css('--seq-1'), n ? k / n : 0.5);
}
export { css as corCss };

// Fontes citadas sob cada bloco, para o eleitor saber de onde veio cada número.
export const FONTES = {
  bu: ['TSE · Boletins de urna, 2º turno 2026 (dados abertos, coletados em 30/10/2026)', 'https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna'],
  locais: ['TSE · Eleitorado por local de votação 2026', 'https://dadosabertos.tse.jus.br/'],
  malhas: ['IBGE · Malhas territoriais (API v3)', 'https://servicodados.ibge.gov.br/api/docs/malhas?versao=3'],
  censo: ['IBGE · Censo Demográfico 2022', 'https://censo2022.ibge.gov.br/'],
  investigacao: ['Cálculos deste painel sobre os boletins do TSE (método aberto no GitHub)', 'https://github.com/UPraggy/ApuracaoTSE2026/blob/main/docs/ANALISE-INCONSISTENCIAS.md'],
  logs: ['TSE · Arquivos de urna transmitidos para totalização (logs)', 'https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao']
};
export const fonte = (...chaves) => `<p class="fonte"><span aria-hidden="true">ⓘ</span> Fonte: ${chaves.map(k => FONTES[k] ? `<a href="${FONTES[k][1]}" target="_blank" rel="noopener">${esc(FONTES[k][0])}</a>` : esc(k)).join(' · ')}</p>`;
