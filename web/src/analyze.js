// 分析：规则按本体识别意象和意境，按本体收尾，再与模型判断融合
// 本体分两份：base.json 是手写的 27 种画法和意境词表；runtime.json 是从 1179 首汇总出的概念，
// 每个概念有触发词、季节、时辰、寄托，能画的沿上位类落到 27 种画法之一（d 字段）
import ONTO from '../../ontology/base.json';
import CONCEPTS from '../../ontology/runtime.json';
export { ONTO, CONCEPTS };

// 画法 id → 基础意象名，比如 bird → 鸟
const DRAW_NAME = Object.fromEntries(Object.entries(ONTO.images).map(([id, o]) => [id, o.name]));
// 触发词按长度从长到短匹配，“寒山寺”先于“山”认领，被认领的字不再给更短的词
const TRIGGERS = Object.entries(CONCEPTS).flatMap(([name, c]) => c.w.map((w) => [w, name])).sort((a, b) => b[0].length - a[0].length);
const WORD_OWNER = Object.fromEntries(TRIGGERS.map(([w, n]) => [w, n]));
// 概念在诗里实写的比例低于这个值时（龙、凤、美人），规则匹配到也只记不画，交给模型判断
const MIN_LITERAL = 0.4;
// 景物后两个字里有这些字时，视为“没有”或“已过去”，不画
const NEG = /[绝无灭歇后]/;
// 景物前后紧挨这些字时是比喻，不画，也不算时辰季节。比如“朝如青丝暮成雪”的雪是白发
const LIKE = /[如似成若]/;
// 字面有景物、实际说的是别的东西
const IDIOM = ['五花马', '钟鼓', '钟鸣', '花甲'];
// 地名里带动物、天象的字，不按字面画：鹳雀楼不画鸟，马嵬坡不画马。楼、台、宫这些尾字仍按建筑识别
const PLACES = ['鹳雀', '铜雀', '黄鹤', '白鹭洲', '鹦鹉洲', '凤凰', '黄龙', '马嵬', '云梦', '狼居胥', '燕然', '燕台', '蓬莱', '卢龙', '龙城', '凤城', '乌衣', '雁门', '虎丘', '鹿门'];
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
  const taken = new Array(text.length).fill(false), byName = new Map();
  // 先让地名占掉它的字；但触发词正好就是这个地名或包含它的（黄鹤楼、白鹭洲是概念）时，交给触发词
  for (const p of PLACES) for (let i = text.indexOf(p); i >= 0; i = text.indexOf(p, i + 1)) {
    const covered = TRIGGERS.some(([w]) => { const j = w.indexOf(p); return j >= 0 && w !== p && text.substr(i - j, w.length) === w; });
    if (!covered) for (let k = i; k < i + p.length; k++) taken[k] = true;
  }
  for (const [w, name] of TRIGGERS) for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + 1)) {
    if (taken.slice(i, i + w.length).some(Boolean)) continue;
    for (let k = i; k < i + w.length; k++) taken[k] = true;
    const g = byName.get(name) || { hits: new Set(), negs: new Map() };
    byName.set(name, g);
    const after = text.slice(i + w.length, i + w.length + 2).replace(/[，。！？；]/g, ''), id2 = idiom(text, i, w);
    if (id2) g.negs.set(id2, '借指');
    else if (!literal(text, i, w)) g.negs.set(text.slice(Math.max(0, i - 1), i + w.length + 1).replace(/[，。！？；]/g, ''), '比喻');
    else if (NEG.test(after)) g.negs.set(w + after, '无');
    else g.hits.add(w);
  }
  const out = [];
  for (const [name, g] of byName) {
    const c = CONCEPTS[name], id = c.d || null, desc = id ? ONTO.images[id].draw : '画不出，参与推断';
    if (g.hits.size) {
      const m = { id, name, desc, ev: [...g.hits] };
      if (id && c.lit !== undefined && c.lit < MIN_LITERAL) Object.assign(m, { off: true, why: '多作比喻', tip: `“${name}”在诗词里实写只占 ${Math.round(c.lit * 100)}%，规则不画，交给模型判断` });
      out.push(m);
    } else out.push({ id, name, desc, ev: [...g.negs.keys()], why: [...new Set(g.negs.values())].join('、'), off: true });
  }
  // 能画的排前面，同类按出现诗数多少
  return out.sort((a, b) => (!!b.id - !!a.id) || CONCEPTS[b.name].n - CONCEPTS[a.name].n);
}
const src = (o, s) => o && ((o.src = s), o);
export function analyze(raw) {
  const p = parse(raw), text = p.title + p.body, imgs = findImages(text).map((i) => src(i, '规则'));
  const emos = rank(EMOS, p.title, p.body);
  for (const [k, list] of Object.entries(evoke(imgs))) {
    let e = emos.find((x) => x.key === k); if (!e) emos.push(e = { key: k, n: 0, ev: [] });
    for (const [name, v] of list) { e.n += v; e.ev.push(`${name}寄${k}`); }
  }
  emos.sort((a, b) => b.n - a.n);
  const emo = src(emos[0], '规则') || { key: '闲适', ev: [], src: '默认' }, emo2 = emos[1] && emos[1].n >= emo.n * .5 ? src(emos[1], '规则') : null;
  // settle 会改动 imgs，rules 留一份规则的原始判断给融合用
  return settle({ ...p, raw, text, imgs, rules: imgs.map((m) => ({ ...m })), seed: hash(raw), moonSet: /月落/.test(text),
    time: src(score(TIME, p.title, p.body, true), '规则'), season: src(score(SEASON, p.title, p.body, true), '规则'), emo, emo2 });
}
// 按本体收尾：补上依赖的意象，缺的时辰季节由意象推断，去掉和时辰季节冲突的意象
// has 是要画的画法 id（scene.js 按它作画）；意象条目按概念名
function settle(o) {
  const imgs = o.imgs, has = {};
  const draws = () => { for (const k in has) delete has[k]; imgs.forEach((m) => { if (!m.off && m.id) has[m.id] = true; }); };
  draws();
  for (let more = true; more;) { more = false;
    for (const id in has) for (const need of ONTO.images[id].needs || []) if (!has[need]) {
      has[need] = more = true;
      const name = DRAW_NAME[need], i = imgs.findIndex((m) => m.id === need);
      const m = { id: need, name, desc: ONTO.images[need].draw, ev: [`${DRAW_NAME[id]}需要${name}`], src: '本体推断' };
      i >= 0 ? (imgs[i] = m) : imgs.push(m);
    } }
  o.time = o.time || src(infer(imgs, 'time'), '本体推断') || { key: '昼', ev: [], src: '默认' };
  o.season = o.season || src(infer(imgs, 'season'), '本体推断') || { key: '无', ev: [], src: '默认' };
  for (const m of imgs) {
    if (m.off || !m.id) continue;
    const c = ONTO.images[m.id].conflicts || {};
    for (const dim of ['time', 'season']) if ((c[dim] || []).includes(o[dim].key))
      Object.assign(m, { off: true, why: `与${dim === 'time' ? '时辰' : '季节'}冲突`, tip: `本体规定${DRAW_NAME[m.id]}不出现在${o[dim].key}，所以不画` });
  }
  draws();
  o.has = has; o.E = blend(o.emo, o.emo2);
  return o;
}
// 眼前实有的意象：否定、比喻、借指的不算；统计上多作比喻、规则保守不画的仍算
const present = (imgs) => imgs.filter((m) => CONCEPTS[m.name] && (!m.off || m.why === '多作比喻'));
// 诗里没有直接线索时，由在场的意象推断时辰或季节：按概念的统计倾向加权投票，0.6 以上才算
function infer(imgs, dim) {
  const votes = {};
  for (const m of present(imgs))
    for (const [k, v] of Object.entries(CONCEPTS[m.name]?.[dim] || {})) if (v >= .6) (votes[k] = votes[k] || []).push([m.name, v]);
  const best = Object.entries(votes).sort((a, b) => b[1].reduce((t, x) => t + x[1], 0) - a[1].reduce((t, x) => t + x[1], 0))[0];
  // 只有一个画不出的意象投票时不算数：“千金裘”的裘不说明是冬天
  if (!best || (best[1].length < 2 && !CONCEPTS[best[1][0][0]].d)) return null;
  return { key: best[0], ev: best[1].map(([n, v]) => `${n}→${best[0]} ${Math.round(v * 100)}%`) };
}
// 意象寄托的情感给情感计分加分：每个在场意象按寄托比例加分，弥补只靠单字的不足
function evoke(imgs) {
  const add = {};
  for (const m of present(imgs))
    for (const [k, v] of Object.entries(CONCEPTS[m.name]?.evokes || {})) if (v >= .3 && EMO[k]) (add[k] = add[k] || []).push([m.name, v]);
  return add;
}
// 融合：模型的判断要过本体校验（证据必须是原文）才采用，否则沿用规则
export function fuse(R, M) {
  const text = R.text, dropped = [], ok = (e) => typeof e === 'string' && e.trim() !== '' && text.includes(e.trim());
  // 模型给的是本体里的概念名；不认识的名字或身份丢弃，证据不在原文的也丢弃
  const byName = new Map();
  for (const m of M.images || []) {
    // 模型偶尔给写法而不是概念名（杨柳→柳），按触发词表归回概念
    const name = CONCEPTS[m.name] ? m.name : WORD_OWNER[m.name] || null;
    if (!name || !ONTO.reasons[m.reason]) continue;
    if (!ok(m.evidence)) { dropped.push(`${m.name}「${m.evidence}」`); continue; }
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(m);
  }
  const imgs = [], names = [...new Set([...R.rules.map((m) => m.name), ...byName.keys()])];
  for (const name of names) {
    const r = R.rules.find((m) => m.name === name), ms = byName.get(name);
    if (!ms) { if (r) imgs.push({ ...r }); continue; }
    const c = CONCEPTS[name], id = c.d || null;
    const lit = ms.filter((m) => m.reason === '字面'), use = lit.length ? lit : ms, note = use.map((m) => m.note).filter(Boolean).join('；');
    const m = { id, name, desc: id ? ONTO.images[id].draw : '画不出，参与推断', src: '模型', ev: [...new Set(use.map((m) => m.evidence.trim()))], note,
      rule: r ? (r.off ? `规则判为${r.why}，不画` : '规则判为要画') : '规则没认出' };
    if (!lit.length) Object.assign(m, { off: true, why: [...new Set(ms.map((m) => m.reason))].join('、') });
    // 只有改变了画面的才算“不同”：能画、且规则那边没有同一种画法在画
    const ruleDraws = r ? !r.off : R.rules.some((x) => x.id === id && !x.off);
    m.differs = !!id && ruleDraws === !!m.off;
    imgs.push(m);
  }
  imgs.sort((a, b) => (!!b.id - !!a.id) || CONCEPTS[b.name].n - CONCEPTS[a.name].n);
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
