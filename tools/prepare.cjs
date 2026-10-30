// 把 chinese-poetry 的各部集子转成统一格式的简体 JSON，存为 data/<集名>.json
// 每首：{ id, type, title, author, body }
// 用法：node tools/prepare.cjs <集名> <下载的原始 json>
//   集名：tang300 宋词三百首 千家诗 诗经 楚辞
const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc-js');
const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
const root = path.join(__dirname, '..');

// 各集的原始格式不同，各自转成 { type, title, author, lines }
const READERS = {
  tang300: (j) => j.content.flatMap((g) => g.content.map((p) => ({ type: g.type, title: p.chapter + (p.subchapter ? '·' + p.subchapter : ''), author: p.author, lines: p.paragraphs }))),
  宋词三百首: (j) => j.map((p) => ({ type: '词', title: p.rhythmic, author: p.author, lines: p.paragraphs })),
  // 组诗（秋兴八首等）的正文按“其一”“其二”嵌套在 paragraphs 里，拆成单独的诗
  千家诗: (j) => j.content.flatMap((g) => g.content.flatMap((p) => {
    const author = p.author.replace(/^（.+?）/, '');
    if (typeof p.paragraphs[0] === 'string') return [{ type: g.type, title: p.chapter, author, lines: p.paragraphs }];
    return p.paragraphs.map((s) => ({ type: g.type, title: `${p.chapter}·${s.subchapter}`, author, lines: s.paragraphs }));
  })),
  诗经: (j) => j.map((p) => ({ type: `${p.chapter}·${p.section}`, title: p.title, author: '佚名', lines: p.content })),
  楚辞: (j) => j.map((p) => ({ type: p.section, title: p.title, author: p.author, lines: p.content })),
};
const norm = (s) => s.replace(/[，。！？；：、,.!?;:\s]/g, '');

const [name, file] = process.argv.slice(2);
if (!READERS[name]) throw new Error(`集名只能是：${Object.keys(READERS).join(' ')}`);
let poems = READERS[name](JSON.parse(fs.readFileSync(file, 'utf8'))).map((p) => ({
  type: t2s(p.type), title: t2s(p.title), author: t2s(p.author),
  body: p.lines.map((l) => t2s(l).trim()).join('').replace(/[,]/g, '，').replace(/[?]/g, '？').replace(/[!]/g, '！').replace(/[:]/g, '：').replace(/[;]/g, '；'),
}));
// 千家诗等和唐诗三百首重复的，按正文去重，留在唐诗三百首里
let dup = 0;
if (name !== 'tang300' && fs.existsSync(path.join(root, 'data/tang300.json'))) {
  const have = new Set(require('../data/tang300.json').map((p) => norm(p.body)));
  const before = poems.length;
  poems = poems.filter((p) => !have.has(norm(p.body)));
  dup = before - poems.length;
}
poems = poems.map((p, i) => ({ id: i + 1, ...p }));
fs.writeFileSync(path.join(root, 'data', `${name}.json`), JSON.stringify(poems, null, 1));
console.log(`${name}：${poems.length} 首，${poems.reduce((t, p) => t + p.body.length, 0)} 字${dup ? `，去掉与唐诗三百首重复的 ${dup} 首` : ''}`);
