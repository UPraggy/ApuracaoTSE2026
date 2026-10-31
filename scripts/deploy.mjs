// Publica a pasta site/ no GitHub Pages (raiz do branch gh-pages, com .nojekyll), no mesmo esquema do Planta fácil.
// Uso:  npm run deploy            (usa o remote "origin" e o domínio de deploy.config.json)
//       node scripts/deploy.mjs --remote git@github.com:UPraggy/ApuracaoTSE2026.git [--cname x.rafaelmr.com.br] [--dry]
// Sem cname o arquivo CNAME some do gh-pages e o GitHub desliga o domínio próprio.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(RAIZ, 'site');
const DIR = join(RAIZ, '.cache', 'gh-pages');
const BRANCH = 'gh-pages';

const args = {};
for (let k = 2; k < process.argv.length; k++) {
  const a = process.argv[k];
  if (a === '--dry') args.dry = true;
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++k] ?? '';
}
const falhar = msg => { console.error('\n✖ ' + msg); process.exit(1); };
const git = (a, cwd = DIR, captura = false) => execFileSync('git', a, { cwd, stdio: captura ? 'pipe' : 'inherit', encoding: 'utf8' });

const cfgArq = join(RAIZ, 'deploy.config.json');
const cfg = existsSync(cfgArq) ? JSON.parse(readFileSync(cfgArq, 'utf8')) : {};
const cname = String(args.cname ?? cfg.cname ?? '').trim();
let remote = args.remote || cfg.remote;
if (!remote) { try { remote = git(['remote', 'get-url', 'origin'], RAIZ, true).trim(); } catch (e) { /* sem origin */ } }
if (!remote) falhar('Diga para qual repositório publicar: --remote git@github.com:UPraggy/NOME.git');
const m = remote.match(/[:/]([^/:]+)\/([^/]+?)(\.git)?$/);
if (!m) falhar('Não entendi o endereço do repositório: ' + remote);
const url = cname ? `https://${cname}/` : `https://${m[1].toLowerCase()}.github.io/${m[2]}/`;

console.log(`→ publicando site/ em ${remote} (${BRANCH})`);
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
let existe = false;
try { existe = git(['ls-remote', '--heads', remote, BRANCH], RAIZ, true).trim().length > 0; } catch (e) { falhar('Não consegui falar com o repositório. Confira o endereço e a chave SSH.'); }
if (existe) git(['clone', '--quiet', '--depth', '1', '--branch', BRANCH, '--single-branch', remote, DIR], RAIZ);
else { git(['init', '--quiet']); git(['checkout', '--quiet', '--orphan', BRANCH]); git(['remote', 'add', 'origin', remote]); }

for (const nome of readdirSync(DIR)) if (nome !== '.git') rmSync(join(DIR, nome), { recursive: true, force: true });
cpSync(SITE, DIR, { recursive: true });

// Carimbo de versão (?v=hash) no CSS e nos módulos JS: o Pages guarda arquivos em cache por 10 min,
// e um index.html novo com um app.js velho quebraria a página.
// Arquivo que ainda não existe (módulo em preparo, linha comentada) não leva carimbo.
const hash = arq => existsSync(join(DIR, arq)) ? createHash('sha1').update(readFileSync(join(DIR, arq))).digest('hex').slice(0, 10) : 'pendente';
// Hash de todos os JSON de dados: entra na URL de cada fetch (util.js, VERSAO_DADOS).
const hDados = createHash('sha1');
const varrer = d => { for (const n of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) n.isDirectory() ? varrer(join(d, n.name)) : hDados.update(n.name).update(readFileSync(join(d, n.name))); };
varrer(join(DIR, 'dados'));
const util = join(DIR, 'js', 'util.js');
writeFileSync(util, readFileSync(util, 'utf8').replace("const VERSAO_DADOS = '';", `const VERSAO_DADOS = '?v=${hDados.digest('hex').slice(0, 10)}';`));
const js = readdirSync(join(DIR, 'js')).filter(n => n.endsWith('.js'));
for (const n of js) {
  const p = join(DIR, 'js', n);
  writeFileSync(p, readFileSync(p, 'utf8')
    .replace(/from '\.\/([\w-]+\.js)'/g, (_, a) => `from './${a}?v=${hash('js/' + a)}'`)
    .replace(/\['\.\/([\w-]+\.js)'/g, (_, a) => `['./${a}?v=${hash('js/' + a)}'`));
}
const idx = join(DIR, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8').replace(/(src|href)="((?:js\/[\w-]+\.js)|[\w-]+\.css)"/g, (_, attr, arq) => `${attr}="${arq}?v=${hash(arq)}"`));
writeFileSync(join(DIR, '.nojekyll'), '');
if (cname) writeFileSync(join(DIR, 'CNAME'), cname + '\n');

git(['add', '-A']);
if (!git(['status', '--porcelain'], DIR, true).trim()) { console.log('✓ Nada mudou desde a última publicação.'); process.exit(0); }
git(['commit', '--quiet', '-m', `deploy: Apuração TSE 2026 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`]);
if (args.dry) { console.log(`✓ Ensaio pronto em ${DIR} (nada foi enviado).`); process.exit(0); }
git(['push', '--quiet', 'origin', BRANCH]);
console.log(`✓ Publicado. Em 1–2 minutos: ${url}`);
if (!existe) console.log('  Primeira vez: no GitHub, Settings › Pages › Source "Deploy from a branch" › gh-pages / (root).');
