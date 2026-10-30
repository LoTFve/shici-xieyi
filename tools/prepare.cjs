// 把 chinese-poetry 的《唐诗三百首》繁体 JSON 转成简体，存为 data/tang300.json
// 用法：node tools/prepare.cjs <下载的 tangshisanbaishou.json>
const fs = require('fs');
const OpenCC = require('opencc-js');
const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const poems = [];
for (const g of src.content) for (const p of g.content) poems.push({
  id: poems.length + 1,
  type: t2s(g.type),
  title: t2s(p.chapter) + (p.subchapter ? '·' + t2s(p.subchapter) : ''),
  author: t2s(p.author),
  body: p.paragraphs.map(t2s).join(''),
});
fs.writeFileSync(__dirname + '/../data/tang300.json', JSON.stringify(poems, null, 1));
console.log(poems.length, '首');
