// Leitor mínimo de .xlsx (sem dependências): ZIP (central directory + deflate) + sharedStrings + XML das planilhas.
// Uso: const wb = await lerXlsx(caminho); wb.nomes -> ['Planilha1', ...]; wb.linhas('Planilha1') -> [[célula, ...], ...]
// Células: número (Number), texto (String) ou null. Fórmulas valem pelo valor em cache (<v>).
import fsp from 'node:fs/promises';
import zlib from 'node:zlib';

function entradasZip(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('xlsx: ZIP sem EOCD');
  const total = buf.readUInt16LE(e + 10), cdOff = buf.readUInt32LE(e + 16);
  const out = new Map();
  for (let p = cdOff, k = 0; k < total; k++) {
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nl);
    out.set(nome, { metodo, comp, off });
    p += 46 + nl + xl + cl;
  }
  return out;
}
function lerEntrada(buf, en) {
  const ini = en.off + 30 + buf.readUInt16LE(en.off + 26) + buf.readUInt16LE(en.off + 28);
  const bruto = buf.subarray(ini, ini + en.comp);
  // Tira prefixos de namespace das tags (<x:row> -> <row>); atributos como r:id ficam.
  return (en.metodo === 8 ? zlib.inflateRawSync(bruto) : bruto).toString('utf8').replace(/<(\/?)[A-Za-z][A-Za-z0-9]*:/g, '<$1');
}
const desesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const colNum = ref => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export async function lerXlsx(caminho) {
  const buf = await fsp.readFile(caminho);
  const z = entradasZip(buf);
  const ler = nome => (z.has(nome) ? lerEntrada(buf, z.get(nome)) : null);
  const ss = [];
  const sst = ler('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(desesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
  const wbXml = ler('xl/workbook.xml');
  const rels = ler('xl/_rels/workbook.xml.rels');
  const alvo = new Map([...rels.matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  for (const m of rels.matchAll(/<Relationship [^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)) alvo.set(m[2], m[1]);
  const folhas = [...wbXml.matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)].map(m => ({ nome: desesc(m[1]), arq: 'xl/' + alvo.get(m[2]).replace(/^\/?xl\//, '') }));
  return {
    nomes: folhas.map(f => f.nome),
    linhas(nome) {
      const f = folhas.find(x => x.nome === nome) ?? folhas[nome];
      const xml = ler(f.arq);
      const linhas = [];
      for (const rm of xml.matchAll(/<row [^>]*?r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const lin = [];
        for (const cm of (rm[2] ?? '').matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = /r="([A-Z]+)\d+"/.exec(cm[1])?.[1];
          const t = /t="([^"]+)"/.exec(cm[1])?.[1];
          const corpo = cm[2] ?? '';
          let v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
          if (t === 's') v = ss[+v];
          else if (t === 'inlineStr') v = desesc([...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
          else if (t === 'str' || t === 'e') v = v == null ? null : desesc(v);
          else if (v != null) v = Number(v);
          lin[ref ? colNum(ref) : lin.length] = v ?? null;
        }
        linhas[Number(rm[1]) - 1] = Array.from(lin, x => x ?? null);
      }
      return Array.from(linhas, x => x ?? []);
    },
  };
}
