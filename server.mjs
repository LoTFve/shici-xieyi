// 本地后端：托管页面，并提供 /api/analyze，让模型在本体概念范围内判断一首诗。
// 用法：在 .env 里填 DS_KEY 和 DS_URL（任何 OpenAI 兼容接口），npm run build 后运行 npm start，浏览器打开 http://localhost:8000
// 开发时另开 npm run dev，Vite 会把 /api 转到这里
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import OpenAI from 'openai';

const here = path.dirname(fileURLToPath(import.meta.url));
if (fs.existsSync(path.join(here, '.env'))) process.loadEnvFile(path.join(here, '.env'));
const require = createRequire(import.meta.url);
const ONTO = require('./ontology/base.json');
const CONCEPTS = require('./ontology/runtime.json');
const PORT = Number(process.env.PORT) || 8000;
const MODEL = process.env.DS_MODEL || 'deepseek-chat';
const MAX_POEM = 2000;
const client = new OpenAI({ apiKey: process.env.DS_KEY || 'missing', baseURL: process.env.DS_URL });
const cache = new Map();

// 托管前端构建产物 web/dist。路径先解析再检查仍在 dist 里，防止 ../ 读到别处
const DIST = path.join(here, 'web/dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function staticFile(pathname) {
  const file = path.resolve(DIST, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return [file, TYPES[path.extname(file)] || 'application/octet-stream'];
}

// 意象从汇总本体里选，按类别列出概念名；带 * 的能画
const CATS = ['天象', '气象', '山石', '水域', '植物', '动物', '建筑', '器物', '人物', '地理'];
const IMAGE_LIST = CATS.map((cat) => `- ${cat}：${Object.entries(CONCEPTS).filter(([, c]) => c.cat === cat)
  .sort((a, b) => b[1].n - a[1].n).map(([n, c]) => (c.d ? n + '*' : n)).join('、')}`).join('\n');

const SYSTEM = `你帮一个古诗词绘画程序读诗。程序只认识下面这些意象概念，你只能从中选择，name 必须和列表里的写法一字不差（不要带 *）。带 * 的能画出来，其他的用来推断时辰、季节和情感。

意象：
${IMAGE_LIST}

意象在诗里的身份 reason：
${Object.entries(ONTO.reasons).map(([k, v]) => `- ${k}：${v}`).join('\n')}

时辰：${Object.keys(ONTO.time).join('、')}；季节：${Object.keys(ONTO.season).join('、')}；诗里看不出就填“无”。
情感：${Object.keys(ONTO.emotions).join('、')}。

要求：
- images 列出诗里出现的每个意象（用列表里最贴切、最具体的那个概念，比如“子规”选杜鹃而不是鸟），并判断它的身份。只有“字面”会被画出来。比如“朝如青丝暮成雪”的雪是比喻白发，“鸟飞绝”的鸟是“无”，“钟鼓馔玉”的钟是借指富贵。同一个意象既有实景又有非实景时，各列一条。
- evidence 必须是从诗中原样摘出的连续字词，程序会核对，摘不到原文的条目会被丢弃。
- note 用一句话说明判断理由，没有特别之处可以留空。
- emotions 给一到两种，weight 在 0 到 1 之间，主情感在前。
- notes 用一两句话说明用典、言外之意或全诗基调，没有就留空。
- 只输出一个 JSON 对象，形如：
{"images":[{"name":"鸟","reason":"无","evidence":"鸟飞绝","note":"鸟已飞尽"},{"name":"杜鹃","reason":"字面","evidence":"子规啼","note":"春夜啼鸣，寄哀愁"}],"time":{"key":"夜","evidence":["夜半"]},"season":{"key":"秋","evidence":["霜"]},"emotions":[{"key":"孤寂","weight":0.7,"evidence":"孤舟"}],"notes":""}`;

// 接口不强制 schema，字段形状会走样，比如时辰只给一个字符串、情感用 name 代替 key。这里统一成 schema 的样子
function normalize(j) {
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).filter((e) => typeof e === 'string');
  const one = (v) => (typeof v === 'string' ? { key: v, evidence: [] } : { key: v?.key ?? v?.name ?? '无', evidence: list(v?.evidence) });
  return {
    images: (Array.isArray(j.images) ? j.images : []).map((m) => ({ name: String(m.name ?? m.id ?? '').replace(/\*$/, ''), reason: m.reason, evidence: String(m.evidence ?? ''), note: String(m.note ?? '') })),
    time: one(j.time),
    season: one(j.season),
    emotions: (Array.isArray(j.emotions) ? j.emotions : []).map((e) => ({ key: e.key ?? e.name, weight: Number(e.weight) || 0, evidence: String(e.evidence ?? '') })),
    notes: String(j.notes ?? ''),
  };
}

async function analyze(poem) {
  if (cache.has(poem)) return cache.get(poem);
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: poem }],
  });
  const choice = res.choices[0];
  if (choice?.finish_reason === 'length') throw Object.assign(new Error('模型输出被截断'), { status: 502 });
  if (choice?.finish_reason === 'content_filter') throw Object.assign(new Error('模型拒绝了这次请求'), { status: 502 });
  const text = choice?.message?.content;
  if (!text) throw Object.assign(new Error('模型没有返回结果'), { status: 502 });
  // json_object 只保证是 JSON，不保证符合 schema；万一被 ```json 包一层，取最外层的花括号。字段由前端按本体再校验
  const raw = text, from = raw.indexOf('{'), to = raw.lastIndexOf('}');
  const result = { model: res.model, ...normalize(JSON.parse(from >= 0 ? raw.slice(from, to + 1) : raw)) };
  cache.set(poem, result);
  return result;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('请求太大'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function errorStatus(e) {
  if (e instanceof OpenAI.AuthenticationError) return [500, '后端的 API key 无效或未设置'];
  if (e instanceof OpenAI.RateLimitError) return [429, '模型调用太频繁或余额不足，请稍后再试'];
  if (e instanceof OpenAI.APIConnectionError) return [502, '连不上模型服务'];
  if (e instanceof OpenAI.APIError) return [502, `模型服务出错（${e.status}）`];
  if (e instanceof SyntaxError) return [502, '模型返回的不是合法 JSON'];
  return [e.status || 500, e.status ? e.message : '后端出错'];
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET') {
      const hit = staticFile(url.pathname);
      if (hit) return send(res, 200, fs.readFileSync(hit[0]), hit[1]);
      if (url.pathname === '/' && !fs.existsSync(DIST)) return send(res, 503, '前端还没构建，先运行 npm run build', 'text/plain; charset=utf-8');
    }
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const { poem } = JSON.parse(await readBody(req, 16 * 1024));
      if (typeof poem !== 'string' || !poem.trim()) return send(res, 400, { error: '缺少诗文' });
      if (poem.length > MAX_POEM) return send(res, 400, { error: `诗文超过 ${MAX_POEM} 字` });
      return send(res, 200, await analyze(poem.trim()));
    }
    send(res, 404, { error: '没有这个地址' });
  } catch (e) {
    const [status, message] = errorStatus(e);
    if (status >= 500) console.error(e);
    send(res, status, { error: message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`诗词写意：http://localhost:${PORT}  模型：${MODEL}`);
  if (!process.env.DS_KEY) console.log('提示：.env 里没有 DS_KEY，模型分析会失败，页面只用规则');
});
