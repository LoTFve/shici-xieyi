// 分析：规则识别意象和意境，按本体收尾，再与模型判断融合
import ONTO from '../../ontology/base.json';

// 由在场的意象推断时辰或季节，票数最多的胜出
ONTO.infer = (has, dim) => {
  const votes = {};
  for (const id in has) { const k = (ONTO.images[id].implies || {})[dim]; if (k) (votes[k] = votes[k] || []).push(ONTO.images[id].name); }
  const best = Object.entries(votes).sort((a, b) => b[1].length - a[1].length)[0];
  return best ? { key: best[0], ev: best[1].map((n) => `${n}→${best[0]}`) } : null;
};
export { ONTO };

// 意象：[id, 名称, 触发字词, 画面]，来自本体
const IMG = Object.entries(ONTO.images).map(([id, o]) => [id, o.name, o.words, o.draw]);
// 景物后两个字里有这些字时，视为“没有”或“已过去”，不画
const NEG = /[绝无灭歇后]/;
// 景物前后紧挨这些字时是比喻，不画，也不算时辰季节。比如“朝如青丝暮成雪”的雪是白发
const LIKE = /[如似成若]/;
// 字面有景物、实际说的是别的东西
const IDIOM = ['五花马', '钟鼓', '钟鸣', '花甲'];
const literal = (text, i, w) => !LIKE.test(text[i - 1] || '') && !LIKE.test(text[i + w.length] || '');
const idiom = (text, i, w) => IDIOM.find((p) => { const j = p.indexOf(w); return j >= 0 && text.substr(i - j, p.length) === p; });
const plain = (text, i, w) => literal(text, i, w) && !idiom(text, i, w);

// 意境：按字词计分，标题里的字算两分
const TIME = ONTO.time, SEASON = ONTO.season, EMOS = ONTO.emotions;
export const EMO = {
  孤寂: { sat: .35, bri: .97, mist: .55, speed: .4, reveal: 700, how: '色彩压到最淡，留白多，几乎静止，逐字很慢' },
  思乡: { sat: .6, bri: .95, mist: .4, speed: .5, reveal: 600, how: '清冷偏蓝，动效舒缓' },
  哀愁: { sat: .5, bri: .85, mist: .6, speed: .45, reveal: 650, how: '偏暗，雾重，节奏迟缓' },
  闲适: { sat: .8, bri: 1, mist: .35, speed: .7, reveal: 420, how: '清淡柔和，雾轻，动效轻缓' },
  壮阔: { sat: 1, bri: 1.05, mist: .2, speed: 1, reveal: 300, how: '远山加到五层，视野拉深，色彩饱满' },
  豪放: { sat: 1.25, bri: 1.06, mist: .12, speed: 1.4, reveal: 200, how: '色彩浓烈偏金，动效急，字出得快' },
  欢欣: { sat: 1.15, bri: 1.08, mist: .15, speed: 1.2, reveal: 250, how: '明亮温暖，动效轻快，字出得快' },
};
export const TIME_HOW = { 晨: '天色微橙', 昼: '天色青白', 暮: '天色紫橙，日近山', 夜: '天色深蓝' };
export const SEASON_HOW = { 春: '山色嫩绿', 夏: '山色浓绿', 秋: '山色赭黄', 冬: '山色灰白', 无: '山色青灰' };

function count(s, w, lit) { let n = 0; for (let i = s.indexOf(w); i >= 0; i = s.indexOf(w, i + w.length)) if (!lit || plain(s, i, w)) n++; return n; }
export function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function parse(raw) {
  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean), P = /[，。！？、；,.]/;
  let title = '', author = '';
  if (lines.length >= 3 && !P.test(lines[0]) && !P.test(lines[1]) && lines[1].length <= 6) { title = lines.shift(); author = lines.shift(); }
  else if (lines.length >= 2 && !P.test(lines[0])) title = lines.shift();
  return { title, author, body: lines.join('') };
}
function rank(lex, title, body, lit) {
  const all = [];
  for (const [k, words] of Object.entries(lex)) {
    let n = 0; const ev = [];
    for (const w of words) { const c = count(body, w, lit) + 2 * count(title, w, lit); if (c) { n += c; ev.push(w); } }
    if (n) all.push({ key: k, n, ev });
  }
  return all.sort((a, b) => b.n - a.n);
}
const score = (...a) => rank(...a)[0];
// 主情感占七成；第二情感分数达到主情感的一半时，作为底色混入三成
function blend(e1, e2) {
  const A = EMO[e1.key]; if (!e2) return A; const B = EMO[e2.key], o = { ...A };
  for (const k of ['sat', 'bri', 'mist', 'speed', 'reveal']) o[k] = A[k] * .7 + B[k] * .3;
  return o;
}
function findImages(text) {
  const out = [];
  for (const [id, name, words, desc] of IMG) {
    const hits = new Set(), negs = new Map();
    for (const w of words) for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + w.length)) {
      const after = text.slice(i + w.length, i + w.length + 2).replace(/[，。！？；]/g, ''), id2 = idiom(text, i, w);
      if (id2) negs.set(id2, '借指');
      else if (!literal(text, i, w)) negs.set(text.slice(Math.max(0, i - 1), i + w.length + 1).replace(/[，。！？；]/g, ''), '比喻');
      else if (NEG.test(after)) negs.set(w + after, '无');
      else hits.add(w);
    }
    if (hits.size) out.push({ id, name, desc, ev: [...hits] });
    else if (negs.size) out.push({ id, name, desc, ev: [...negs.keys()], why: [...new Set(negs.values())].join('、'), off: true });
  }
  return out;
}
const src = (o, s) => o && ((o.src = s), o);
export function analyze(raw) {
  const p = parse(raw), text = p.title + p.body, imgs = findImages(text).map((i) => src(i, '规则'));
  const emos = rank(EMOS, p.title, p.body), emo = src(emos[0], '规则') || { key: '闲适', ev: [], src: '默认' }, emo2 = emos[1] && emos[1].n >= emo.n * .5 ? src(emos[1], '规则') : null;
  // settle 会改动 imgs，rules 留一份规则的原始判断给融合用
  return settle({ ...p, raw, text, imgs, rules: imgs.map((m) => ({ ...m })), seed: hash(raw), moonSet: /月落/.test(text),
    time: src(score(TIME, p.title, p.body, true), '规则'), season: src(score(SEASON, p.title, p.body, true), '规则'), emo, emo2 });
}
// 按本体收尾：补上依赖的意象，缺的时辰季节由意象推断，去掉和时辰季节冲突的意象
function settle(o) {
  const imgs = o.imgs, has = {}, on = (id) => imgs.find((m) => m.id === id && !m.off);
  imgs.forEach((m) => { if (!m.off) has[m.id] = true; });
  for (let more = true; more;) { more = false;
    for (const id in has) for (const n of ONTO.images[id].needs || []) if (!has[n]) { has[n] = more = true;
      const ev = [`${ONTO.images[id].name}需要${ONTO.images[n].name}`], i = imgs.findIndex((m) => m.id === n), m = { id: n, name: ONTO.images[n].name, desc: ONTO.images[n].draw, ev, src: '本体推断' };
      i >= 0 ? (imgs[i] = m) : imgs.push(m); } }
  o.time = o.time || src(ONTO.infer(has, 'time'), '本体推断') || { key: '昼', ev: [], src: '默认' };
  o.season = o.season || src(ONTO.infer(has, 'season'), '本体推断') || { key: '无', ev: [], src: '默认' };
  for (const id in has) { const c = ONTO.images[id].conflicts || {};
    for (const dim of ['time', 'season']) if ((c[dim] || []).includes(o[dim].key)) { delete has[id];
      const m = on(id); Object.assign(m, { off: true, why: `与${dim === 'time' ? '时辰' : '季节'}冲突`, tip: `本体规定${m.name}不出现在${o[dim].key}，所以不画` }); } }
  o.has = has; o.E = blend(o.emo, o.emo2);
  return o;
}
// 融合：模型的判断要过本体校验（证据必须是原文）才采用，否则沿用规则
export function fuse(R, M) {
  const text = R.text, dropped = [], ok = (e) => typeof e === 'string' && e.trim() !== '' && text.includes(e.trim());
  const byId = {};
  for (const m of M.images || []) { const o = ONTO.images[m.id];
    if (!o || !ONTO.reasons[m.reason]) continue;
    if (!ok(m.evidence)) { dropped.push(`${o.name}「${m.evidence}」`); continue; }
    (byId[m.id] = byId[m.id] || []).push(m); }
  const imgs = [];
  for (const [id, o] of Object.entries(ONTO.images)) {
    const r = R.rules.find((m) => m.id === id), ms = byId[id];
    if (!ms) { if (r) imgs.push({ ...r }); continue; }
    const lit = ms.filter((m) => m.reason === '字面'), use = lit.length ? lit : ms, note = use.map((m) => m.note).filter(Boolean).join('；');
    const m = { id, name: o.name, desc: o.draw, src: '模型', ev: [...new Set(use.map((m) => m.evidence.trim()))], note,
      rule: r ? (r.off ? `规则判为${r.why}，不画` : '规则判为要画') : '规则没认出' };
    if (!lit.length) Object.assign(m, { off: true, why: [...new Set(ms.map((m) => m.reason))].join('、') });
    m.differs = r ? !!r.off !== !!m.off : !m.off;
    imgs.push(m); }
  const pick = (lex, mv, rv, name) => {
    if (!mv || !lex[mv.key]) return rv && rv.src === '规则' ? rv : null;
    const ev = (mv.evidence || []).map((e) => e.trim()).filter(ok);
    if (!ev.length) { dropped.push(`${name}${mv.key}`); return rv && rv.src === '规则' ? rv : null; }
    return { key: mv.key, ev, src: '模型', differs: !rv || rv.key !== mv.key, rule: rv ? `${rv.src}判为${rv.key}` : '' }; };
  const emos = (M.emotions || []).filter((e) => EMO[e.key] && (!e.evidence || ok(e.evidence) || (dropped.push(`情感${e.key}`), false)))
    .map((e) => ({ key: e.key, ev: e.evidence ? [e.evidence.trim()] : [], src: '模型', w: e.weight }));
  let emo = R.emo, emo2 = R.emo2;
  if (emos.length) { emo = { ...emos[0], differs: emos[0].key !== R.emo.key, rule: `规则判为${R.emo.key}` };
    emo2 = emos[1] && emos[1].w >= .2 ? { ...emos[1], differs: !R.emo2 || emos[1].key !== R.emo2.key } : null; }
  return settle({ ...R, imgs, emo, emo2, model: M.model, notes: M.notes || '', dropped,
    time: pick(TIME, M.time, R.time, '时辰'), season: pick(SEASON, M.season, R.season, '季节') });
}
// 影响画面的部分，变了才需要重画
export const visual = (o) => JSON.stringify([Object.keys(o.has).sort(), o.time.key, o.season.key, o.emo.key, o.emo2 && o.emo2.key]);

// 请求后端的模型判断，结果按诗文缓存在 localStorage
export async function ask(R) {
  const key = 'shici:' + R.seed;
  try { const hit = localStorage.getItem(key); if (hit) return JSON.parse(hit); } catch {}
  const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poem: R.raw }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `后端返回 ${r.status}`);
  try { localStorage.setItem(key, JSON.stringify(j)); } catch {}
  return j;
}
