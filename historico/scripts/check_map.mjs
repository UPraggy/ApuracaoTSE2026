import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=await fs.readFile('outputs/analise.html','utf8');
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for(const [_,attrs,src]of scripts){if(attrs.includes('module'))new vm.SourceTextModule(src);else new vm.Script(src);}
const map=scripts.find(s=>s[1].includes('module'))[2];
const uri=map.match(/await import\('(data:[^']+)'\)/)[1];
const T=await import(uri);
const geo=JSON.parse(await fs.readFile('work/brasil_uf.geojson','utf8'));
let points=0,parts=0;const boxes=[];
for(const f of geo.features){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;const group=new T.Group();for(const rings of polys){const coord=p=>new T.Vector2((p[0]+54)*Math.cos(Math.PI/12),p[1]+14);const shape=new T.Shape(rings[0].map(coord));for(const hole of rings.slice(1))shape.holes.push(new T.Path(hole.map(coord)));const g=new T.ExtrudeGeometry(shape,{depth:.45,steps:1,bevelEnabled:false});const a=g.attributes.position.array;assert(a.length>0);assert([...a].every(Number.isFinite));points+=a.length/3;parts++;group.add(new T.Mesh(g));}const b=new T.Box3().setFromObject(group);assert(!b.isEmpty());boxes.push(b);}
assert.equal(geo.features.length,27);assert.equal(new Set(geo.features.map(f=>f.properties.codarea)).size,27);assert(!map.includes('https://cdn'));assert(map.includes('Exterior (ZZ)'));
console.log(JSON.stringify({syntax:'ok',ufs:boxes.length,polygons:parts,vertices:points,geometry:'finite and nonempty',runtimeModules:'embedded; no CDN',visualTest:'not performed: browser access previously denied'},null,2));
