// 逐首让模型抽取意象，结果存到 data/extract/<id>.json，已有的跳过，可以断点续跑
// 用法：node tools/extract.mjs [起始id] [结束id]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import OpenAI from 'openai';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));
const ONTO = createRequire(import.meta.url)('../ontology.js');
const poems = JSON.parse(fs.readFileSync(path.join(root, 'data/tang300.json'), 'utf8'));
const out = path.join(root, 'data/extract');
fs.mkdirSync(out, { recursive: true });
const client = new OpenAI({ apiKey: process.env.DS_KEY, baseURL: process.env.DS_URL });
const MODEL = process.env.DS_MODEL || 'deepseek-chat';
const [from = 1, to = poems.length] = process.argv.slice(2).map(Number);
const CONCURRENCY = 8;

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

async function one(p) {
  const file = path.join(out, `${p.id}.json`);
  if (fs.existsSync(file)) return 'skip';
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${p.title}\n${p.author}\n${p.body}` }],
  });
  const text = res.choices[0]?.message?.content || '';
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  fs.writeFileSync(file, JSON.stringify({ id: p.id, model: res.model, images: j.images || [] }, null, 1));
  return 'ok';
}

const todo = poems.filter((p) => p.id >= from && p.id <= to);
let done = 0, failed = [];
async function worker() {
  while (todo.length) {
    const p = todo.shift();
    try { await one(p); }
    catch (e) { failed.push(p.id); console.error(`#${p.id} ${p.title} 失败：${e.message}`); }
    if (++done % 20 === 0) console.log(`${done} 首`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`完成 ${done} 首，失败 ${failed.length} 首${failed.length ? '：' + failed.join(',') : ''}`);
