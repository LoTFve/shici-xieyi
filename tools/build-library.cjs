// 把 data/ 下各集合并成前端诗库 web/public/library.json
// 每首：[集名, id, 标题, 作者, 体裁, 正文]，用数组省体积
// 用法：node tools/build-library.cjs
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const COLS = [['tang300', '唐诗三百首'], ['宋词三百首', '宋词三百首'], ['千家诗', '千家诗'], ['诗经', '诗经'], ['楚辞', '楚辞']];
const poems = [];
for (const [file, name] of COLS) {
  const f = path.join(root, 'data', `${file}.json`);
  if (!fs.existsSync(f)) continue;
  for (const p of require(f)) poems.push([name, p.id, p.title, p.author, p.type, p.body]);
}
const out = path.join(root, 'web/public/library.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ collections: COLS.map((c) => c[1]), poems }));
console.log(`诗库 ${poems.length} 首，${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
