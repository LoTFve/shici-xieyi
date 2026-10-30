// 逐首让模型抽取意象，结果存到 data/extract/<集名>/<id>.json，已有的跳过，可以断点续跑
// 超过 CHUNK 字的长篇（如离骚）按句切成几段分别抽，再合并
// 用法：node tools/extract.mjs <集名> [起始id] [结束id]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import OpenAI from 'openai';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));
const ONTO = createRequire(import.meta.url)('../ontology.js');
const [name = 'tang300', from = 1, to = Infinity] = process.argv.slice(2).map((a, i) => (i ? Number(a) : a));
const poems = JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
const out = path.join(root, 'data/extract', name);
fs.mkdirSync(out, { recursive: true });
const client = new OpenAI({ apiKey: process.env.DS_KEY, baseURL: process.env.DS_URL });
const MODEL = process.env.DS_MODEL || 'deepseek-chat';
const CONCURRENCY = 8;
const CHUNK = 400;

const SYSTEM = `你帮一个古诗词绘画程序建意象库。请列出诗中出现的每一个意象：具体的景物、天象、动植物、建筑、器物、人物、声音，以及有固定文化含义的地名（如关山、长安、阳关）。抽象概念（如愁、思、功名）不算意象。

每个意象给出：
- word：诗中原文里的写法，必须原样出现在诗中，比如“孤帆”“梧桐”“羌笛”
- name：这个意象的规范名，用最常见的两字以内的叫法，比如“孤帆”的 name 是“帆”，“杨柳”是“柳”，“子规”是“杜鹃”
- category：从这些类别里选一个：天象、气象、山石、水域、植物、动物、建筑、器物、人物、声音、地名、其他
- parent：画面上它最接近程序已有画法里的哪一个，填 id；都不接近就填 none。已有画法：
${Object.entries(ONTO.images).map(([id, o]) => `  ${id}：${o.name}（${o.draw}）`).join('\n')}
- reason：它在诗中的身份，从这些里选：${Object.entries(ONTO.reasons).map(([k, v]) => `${k}（${v}）`).join('、')}
- season：这个意象本身是否带季节，从 春、夏、秋、冬、无 中选。比如“梅”带冬，“蝉”带夏，“柳”带春，“月”是无
- time：这个意象本身是否带时辰，从 晨、昼、暮、夜、无 中选。比如“夕阳”带暮，“星”带夜
- emotion：这个意象在古诗里惯常寄托的情感，从 ${Object.keys(ONTO.emotions).join('、')}、无 中选。比如“杜鹃”是哀愁，“雁”是思乡，“柳”在送别诗里是思乡
- note：一句话说明它在这首诗里的作用

同一个意象在诗里出现多次，只列一次，取最有代表性的写法。只输出一个 JSON 对象：
{"images":[{"word":"孤帆","name":"帆","category":"器物","parent":"boat","reason":"字面","season":"无","time":"无","emotion":"孤寂","note":"远去的友人之船"}]}`;

// 按句号一类的标点切段，每段不超过 CHUNK 字
function chunks(body) {
  if (body.length <= CHUNK) return [body];
  const out = [];
  let cur = '';
  for (const s of body.split(/(?<=[。！？；])/)) {
    if (cur && cur.length + s.length > CHUNK) { out.push(cur); cur = ''; }
    cur += s;
  }
  if (cur) out.push(cur);
  return out;
}

async function ask(p, part, i, n) {
  const head = n > 1 ? `${p.title}（第 ${i + 1}/${n} 段）` : p.title;
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${head}
${p.author}
${part}` }],
  });
  const text = res?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('模型没有返回内容');
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return { model: res.model, images: j.images || [] };
}

async function one(p) {
  const file = path.join(out, `${p.id}.json`);
  if (fs.existsSync(file)) return 'skip';
  const parts = chunks(p.body), images = [], seen = new Set();
  let model;
  for (let i = 0; i < parts.length; i++) {
    const r = await ask(p, parts[i], i, parts.length);
    model = r.model;
    // 分段抽取时同一个写法可能在几段里都出现，只留第一次
    for (const m of r.images) if (!seen.has(m.word)) { seen.add(m.word); images.push(m); }
  }
  fs.writeFileSync(file, JSON.stringify({ id: p.id, model, ...(parts.length > 1 && { chunks: parts.length }), images }, null, 1));
  return 'ok';
}

const todo = poems.filter((p) => p.id >= from && p.id <= to);
let done = 0, failed = [];
async function worker() {
  while (todo.length) {
    const p = todo.shift();
    // 偶尔会返回空响应，重试一次
    try { await one(p); }
    catch { try { await one(p); } catch (e) { failed.push(p.id); console.error(`#${p.id} ${p.title} 失败：${e.message}`); } }
    if (++done % 20 === 0) console.log(`${done} 首`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`${name}：完成 ${done} 首，失败 ${failed.length} 首${failed.length ? '：' + failed.join(',') : ''}`);
