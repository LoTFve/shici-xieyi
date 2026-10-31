// 本体页：左边概念树，中间详情，右边以选中概念为中心的关系网络图
import { ontoGraph, esc } from '../data.js';

const CATS = ['天象', '气象', '山石', '水域', '植物', '动物', '建筑', '器物', '人物', '地理'];
const SH = { 唐: '唐诗三百首', 宋词: '宋词三百首', 千家: '千家诗', 诗经: '诗经', 楚辞: '楚辞' };
// 边的四种关系。颜色只用于区分关系，图例和线型一起表达，不只靠颜色
const REL = {
  is_a: { name: '上位', dash: '' },
  needs: { name: '依赖', dash: '6 4' },
  attr: { name: '季节·时辰·寄托', dash: '2 3' },
  cooc: { name: '常一起出现', dash: '' },
};
const fmt = (o) => Object.entries(o || {}).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join('、');

let el = null, D, C, NAMES, kids, coocOf, owner, cur = null, sim = 0, dragged = false;
const filter = { q: '', draw: false, big: true }, show = { is_a: true, needs: true, attr: true, cooc: true };
const $ = (s) => el.querySelector(s);

export function enter(root, params) {
  el = root;
  el.innerHTML = `<p class="loading muted">加载本体…</p>`;
  ontoGraph().then((g) => { if (!el) return; init(g); requestAnimationFrame(() => el && update(params)); });
  const onResize = () => cur && graph(cur);
  addEventListener('resize', onResize);
  return () => { cancelAnimationFrame(sim); removeEventListener('resize', onResize); el = null; };
}
export function update({ seg }) {
  if (!C || !el) return;
  const n = seg[1] && (C[seg[1]] ? seg[1] : owner[seg[1]]);
  select(n || cur || '月', false);
}

function init(g) {
  D = g; C = D.concepts; NAMES = Object.keys(C);
  kids = {}; for (const n of NAMES) { const p = C[n].is_a; if (p && C[p]) (kids[p] = kids[p] || []).push(n); }
  for (const k in kids) kids[k].sort((a, b) => C[b].n - C[a].n);
  // 常同现按关联度排：PMI 乘以次数的对数。只按次数排，每个概念的邻居都会是云、月、风这些最常见的字
  coocOf = {}; for (const [a, b, v, pmi] of D.cooc) { (coocOf[a] = coocOf[a] || []).push([b, v, pmi]); (coocOf[b] = coocOf[b] || []).push([a, v, pmi]); }
  for (const k in coocOf) coocOf[k].sort((x, y) => y[2] * Math.log(y[1]) - x[2] * Math.log(x[1]));
  owner = {}; for (const n of NAMES) for (const w of C[n].words) owner[w] = n;
  const total = Object.values(D.meta.collections).reduce((a, b) => a + b, 0);
  el.innerHTML = `
  <div class="onto-tree">
    <div class="search">
      <label class="sr" for="onto-q">搜索概念</label>
      <input id="onto-q" type="search" placeholder="搜物象或写法，如 子规、孤帆" autocomplete="off">
      <div class="filters">
        <label class="check"><input type="checkbox" data-f="draw"> 只看能画的</label>
        <label class="check"><input type="checkbox" data-f="big" checked> 出现 10 首以上</label>
      </div>
      <p class="muted meta">${NAMES.length} 个概念 · 来自 ${total} 首诗</p>
    </div>
    <div class="list"></div>
  </div>
  <div class="onto-detail"></div>
  <div class="onto-graph">
    <div class="legend"></div><svg role="img" aria-label="关系网络图"></svg><div class="tip" role="tooltip"></div>
    <p class="hint muted">点节点换中心，可拖动</p>
  </div>`;
  $('#onto-q').addEventListener('input', (e) => { filter.q = e.target.value.trim(); tree(); const hit = owner[filter.q] || (C[filter.q] && filter.q); if (hit) select(hit); });
  el.querySelectorAll('[data-f]').forEach((x) => x.addEventListener('change', () => { filter[x.dataset.f] = x.checked; tree(); }));
  $('.list').addEventListener('click', (e) => { const it = e.target.closest('.item'); if (it) select(it.dataset.n); });
  $('.onto-detail').addEventListener('click', (e) => { const t = e.target.closest('.tag[data-n]'); if (t) select(t.dataset.n); });
  $('.legend').innerHTML = Object.entries(REL).map(([k, r]) => `<label class="check"><input type="checkbox" data-rel="${k}" checked>
    <svg viewBox="0 0 22 8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke="var(--rel-${k})" stroke-width="2" stroke-dasharray="${r.dash}" stroke-linecap="round"/></svg>${r.name}</label>`).join('') +
    `<span><svg viewBox="0 0 22 8" aria-hidden="true"><circle cx="11" cy="4" r="3.5" fill="var(--node-draw)"/></svg>能画</span>
     <span><svg viewBox="0 0 22 8" aria-hidden="true"><circle cx="11" cy="4" r="3.5" fill="var(--node)"/></svg>画不出</span>
     <span><svg viewBox="0 0 22 8" aria-hidden="true"><rect x="5" y="1" width="12" height="6" rx="3" fill="none" stroke="var(--rel-attr)" stroke-width="1.5"/></svg>属性值</span>`;
  $('.legend').addEventListener('change', (e) => { const k = e.target.dataset.rel; if (k) { show[k] = e.target.checked; graph(cur); } });
}

// 选中一个概念：网址跟着变，返回键能回到上一个概念
function select(n, push = true) {
  if (!C[n]) return;
  cur = n; tree(); detail(n); graph(n);
  if (push && decodeURIComponent(location.hash) !== `#/onto/${n}`) history.pushState(null, '', `#/onto/${encodeURIComponent(n)}`);
  const it = el.querySelector(`.item[data-n="${CSS.escape(n)}"]`); if (it) it.scrollIntoView({ block: 'nearest' });
}

// ---------- 概念树 ----------
function match(n) {
  const c = C[n];
  if (filter.draw && !c.draw && !c.draws_as) return false;
  if (filter.q) return n.includes(filter.q) || c.words.some((w) => w.includes(filter.q));
  return !filter.big || c.n >= 10 || kids[n] || n === cur;
}
const row = (n, d) => { const c = C[n]; return `<div class="item${n === cur ? ' sel' : ''}" data-n="${esc(n)}" style="--d:${d}" role="option" aria-selected="${n === cur}"><span><i class="dot${c.draw || c.draws_as ? ' draw' : ''}"></i>${esc(n)}</span><span class="n">${c.n}</span></div>`; };
function tree() {
  let h = '';
  for (const cat of CATS) {
    const roots = NAMES.filter((n) => C[n].cat === cat && !(C[n].is_a && C[C[n].is_a] && C[C[n].is_a].cat === cat)).sort((a, b) => C[b].n - C[a].n);
    let body = '', cnt = 0;
    const walk = (n, d) => {
      const inner = (kids[n] || []).filter((k) => C[k].cat === cat).map((k) => walk(k, d + 1)).join(''), hit = match(n);
      if (hit) cnt++;
      return hit || inner ? row(n, d) + inner : '';
    };
    for (const r of roots) body += walk(r, 0);
    const total = NAMES.filter((n) => C[n].cat === cat).length;
    if (body) h += `<details${filter.q || cat === C[cur]?.cat ? ' open' : ''}><summary>${cat} <small>${cnt} / ${total}</small></summary><div role="listbox">${body}</div></details>`;
  }
  $('.list').innerHTML = h || '<p class="muted empty">没有匹配的概念</p>';
}

// ---------- 详情 ----------
// 各集按“出现首数 / 这一集首数”比较，楚辞只有 65 首，按次数比会被大集子压下去
function bars(by) {
  const rows = Object.entries(by || {}).map(([k, v]) => [SH[k] || k, v, v / (D.meta.collections[SH[k] || k] || 1)]);
  const max = Math.max(...rows.map((r) => r[2]));
  return `<div class="bars">${rows.sort((a, b) => b[2] - a[2]).map(([k, v, r]) => `<div class="bar" title="${v} 首，占这一集的 ${(r * 100).toFixed(1)}%"><span>${esc(k)}</span><i style="width:${r / max * 100}%"></i><span>${(r * 100).toFixed(0)}%</span></div>`).join('')}</div>`;
}
const tags = (list) => list.map((n) => (C[n] ? `<button class="tag" data-n="${esc(n)}">${esc(n)}</button>` : `<span class="tag">${esc(n)}</span>`)).join('');
// 例句形如“唐20《江雪》孤舟”，链到诗库里那一首
function example(s) {
  const m = s.match(/^(唐|宋词|千家|诗经|楚辞)(\d+)(《.*)$/);
  return m ? `<a href="#/p/${encodeURIComponent(SH[m[1]])}/${m[2]}">${esc(SH[m[1]])} ${esc(m[3])}</a>` : esc(s);
}
function detail(n) {
  const c = C[n], draws = c.draw || c.draws_as;
  const near = (coocOf[n] || []).slice(0, 12);
  const dd = (label, html) => (html ? `<dt>${label}</dt><dd>${html}</dd>` : '');
  $('.onto-detail').innerHTML = `<h3>${esc(n)}</h3><p class="muted sub">${esc(c.cat)} · ${c.n} 首诗出现${c.sense === '听' ? ' · 听觉意象' : ''}</p>
  <dl class="kv">
    ${dd('画法', draws ? `${c.draw ? '自有画法' : '沿用上位类的画法'}（${esc(draws)}）` : '画不出，只参与推断')}
    ${dd('上位', c.is_a ? tags([c.is_a]) : '')}
    ${dd('下位', kids[n] ? tags(kids[n]) : '')}
    ${dd('部分', c.part_of ? `是 ${tags([c.part_of])} 的一部分` : '')}
    ${dd('依赖', c.needs ? `画它要同时画 ${tags(c.needs)}` : '')}
    ${dd('季节', fmt(c.season))}
    ${dd('时辰', fmt(c.time))}
    ${dd('寄托', c.evokes ? fmt(c.evokes.默认) : '')}
    ${dd('象征', (c.symbol || []).map(esc).join('、'))}
    ${dd('非实写', c.usage ? Object.entries(c.usage).map(([k, v]) => `${esc(k)} ${v}`).join('、') : '')}
    ${dd('各集占比', c.by ? bars(c.by) : '')}
    ${dd('常同现', near.map(([b, v]) => `<button class="tag" data-n="${esc(b)}">${esc(b)} ${v}</button>`).join(''))}
    ${dd('写法', `<span class="words">${c.words.map(esc).join(' ')}</span>`)}
    ${dd('例句', (c.examples || []).map(example).join('<br>'))}
  </dl>`;
}

// ---------- 关系网络图：中心概念 + 一层邻居 ----------
const NS = 'http://www.w3.org/2000/svg';
function neighbors(n) {
  const c = C[n], nodes = new Map(), edges = [];
  const add = (id, kind, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, kind, ...extra }); return nodes.get(id); };
  add(n, 'concept', { center: true });
  if (show.is_a) {
    if (c.is_a && C[c.is_a]) { add(c.is_a, 'concept'); edges.push({ a: n, b: c.is_a, rel: 'is_a', label: `${n} 是一种 ${c.is_a}` }); }
    for (const k of (kids[n] || []).slice(0, 14)) { add(k, 'concept'); edges.push({ a: k, b: n, rel: 'is_a', label: `${k} 是一种 ${n}` }); }
    if (c.part_of && C[c.part_of] && c.part_of !== c.is_a) { add(c.part_of, 'concept'); edges.push({ a: n, b: c.part_of, rel: 'is_a', label: `${n} 是 ${c.part_of} 的一部分` }); }
  }
  if (show.needs) {
    for (const k of c.needs || []) if (C[k]) { add(k, 'concept'); edges.push({ a: n, b: k, rel: 'needs', label: `画 ${n} 需要 ${k}` }); }
    for (const o of NAMES) if ((C[o].needs || []).includes(n)) { add(o, 'concept'); edges.push({ a: o, b: n, rel: 'needs', label: `画 ${o} 需要 ${n}` }); }
  }
  if (show.attr) {
    for (const [dim, label] of [['season', '季节'], ['time', '时辰']]) for (const [k, v] of Object.entries(c[dim] || {})) {
      const id = `${label}:${k}`; add(id, 'attr', { text: k, dim: label }); edges.push({ a: n, b: id, rel: 'attr', label: `${label}：${k}，占 ${Math.round(v * 100)}%` }); }
    for (const [k, v] of Object.entries(c.evokes?.默认 || {})) { const id = `情感:${k}`; add(id, 'attr', { text: k, dim: '寄托' }); edges.push({ a: n, b: id, rel: 'attr', label: `寄托${k}，占 ${Math.round(v * 100)}%` }); }
  }
  if (show.cooc) for (const [b, v, pmi] of (coocOf[n] || []).slice(0, 12)) { add(b, 'concept'); edges.push({ a: n, b, rel: 'cooc', w: v, label: `${n} 与 ${b} 同在 ${v} 首诗里，关联度 ${pmi}` }); }
  return { nodes: [...nodes.values()], edges };
}
function svgEl(tag, attrs) { const x = document.createElementNS(NS, tag); for (const k in attrs) x.setAttribute(k, attrs[k]); return x; }
function graph(n) {
  cancelAnimationFrame(sim);
  const svg = $('.onto-graph > svg[role=img]'), W = svg.clientWidth || 800, H = svg.clientHeight || 600;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const { nodes, edges } = neighbors(n), R = Math.min(W, H) * .34;
  // 概念节点排一圈，属性值放在下方一段弧上，起始位置分开，力导向收敛更快也更少重叠
  const cs = nodes.filter((d) => !d.center && d.kind === 'concept'), as = nodes.filter((d) => d.kind === 'attr');
  cs.forEach((d, i) => { const a = -Math.PI / 2 + (i + .5) / cs.length * Math.PI * 2; d.x = W / 2 + Math.cos(a) * R; d.y = H / 2 + Math.sin(a) * R; });
  as.forEach((d, i) => { const a = Math.PI * (.3 + .4 * (i + .5) / as.length); d.x = W / 2 + Math.cos(a) * R * .6; d.y = H / 2 + Math.sin(a) * R * .6; });
  nodes.forEach((d) => { if (d.center) { d.x = W / 2; d.y = H / 2; d.fx = true; } d.vx = 0; d.vy = 0; });
  const byId = new Map(nodes.map((d) => [d.id, d]));
  const size = (d) => (d.kind === 'attr' ? 0 : Math.max(5, Math.min(16, 3 + Math.sqrt(C[d.id].n))));
  svg.innerHTML = '';
  const gE = svgEl('g', {}), gN = svgEl('g', {}); svg.append(gE, gN);
  const els = edges.map((e) => {
    const l = svgEl('line', { stroke: `var(--rel-${e.rel})`, 'stroke-linecap': 'round', 'stroke-width': e.rel === 'cooc' ? 1 + Math.min(2, e.w / 12) : 2 });
    if (REL[e.rel].dash) l.setAttribute('stroke-dasharray', REL[e.rel].dash);
    const hit = svgEl('line', { stroke: 'transparent', 'stroke-width': 12 });
    for (const x of [hit, l]) { x.addEventListener('mousemove', (ev) => tipAt(ev, esc(e.label))); x.addEventListener('mouseleave', hideTip); }
    gE.append(l, hit); return { e, l, hit };
  });
  const nEls = nodes.map((d) => {
    const g = svgEl('g', {}); g.style.cursor = d.kind === 'concept' ? 'pointer' : 'default';
    if (d.kind === 'attr') {
      const label = `${d.dim}·${d.text}`, w = label.length * 12 + 14;
      g.append(svgEl('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 9, fill: 'var(--surface)', stroke: 'var(--rel-attr)', 'stroke-width': 1.5 }));
      const t = svgEl('text', { 'font-size': 12, fill: 'var(--ink-2)', 'text-anchor': 'middle', dy: 4 }); t.textContent = label; g.append(t);
    } else {
      const c = C[d.id], s = size(d);
      g.append(svgEl('circle', { r: s + 2, fill: 'var(--surface)' }));
      const dot = svgEl('circle', { r: s, fill: c.draw || c.draws_as ? 'var(--node-draw)' : 'var(--node)' });
      if (d.center) { dot.setAttribute('stroke', 'var(--accent)'); dot.setAttribute('stroke-width', 3); }
      const t = svgEl('text', { 'font-size': d.center ? 16 : 13, 'font-weight': d.center ? 600 : 400, fill: 'var(--ink)', x: s + 5, dy: 4, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': 3 });
      t.textContent = d.id;
      g.append(dot, t, svgEl('circle', { r: Math.max(s + 6, 14), fill: 'transparent' }));
      g.addEventListener('mousemove', (ev) => tipAt(ev, `<b>${esc(d.id)}</b> · ${esc(c.cat)} · ${c.n} 首<br>${c.draw || c.draws_as ? '能画' : '画不出'}${c.evokes ? ` · 寄托 ${esc(fmt(c.evokes.默认))}` : ''}`));
      g.addEventListener('mouseleave', hideTip);
      g.addEventListener('click', () => { if (!dragged) select(d.id); });
    }
    drag(svg, g, d, () => reheat()); gN.append(g); return { d, g };
  });
  // 简单力导向：边拉近，节点互斥，中心固定
  let alpha = 1;
  const tick = () => {
    for (const { e } of els) {
      const a = byId.get(e.a), b = byId.get(e.b), dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1, want = e.rel === 'attr' ? R * .7 : R * .85, k = (dist - want) / dist * .04 * alpha;
      if (!a.fx) { a.vx += dx * k; a.vy += dy * k; } if (!b.fx) { b.vx -= dx * k; b.vy -= dy * k; }
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d2 = Math.max(dx * dx + dy * dy, 100), f = (a.kind === 'attr' || b.kind === 'attr' ? 6000 : 2200) / d2 * alpha;
      const fx = dx / Math.sqrt(d2) * f, fy = dy / Math.sqrt(d2) * f;
      if (!a.fx) { a.vx -= fx; a.vy -= fy; } if (!b.fx) { b.vx += fx; b.vy += fy; }
    }
    for (const d of nodes) { if (d.fx) continue; d.vx *= .6; d.vy *= .6; d.x = Math.max(30, Math.min(W - 60, d.x + d.vx)); d.y = Math.max(46, Math.min(H - 24, d.y + d.vy)); }
    for (const { e, l, hit } of els) { const a = byId.get(e.a), b = byId.get(e.b); for (const x of [l, hit]) { x.setAttribute('x1', a.x); x.setAttribute('y1', a.y); x.setAttribute('x2', b.x); x.setAttribute('y2', b.y); } }
    for (const { d, g } of nEls) g.setAttribute('transform', `translate(${d.x},${d.y})`);
    alpha *= .985; if (alpha > .02) sim = requestAnimationFrame(tick);
  };
  const reheat = () => { const idle = alpha <= .02; alpha = Math.max(alpha, .3); if (idle) sim = requestAnimationFrame(tick); };
  tick();
}
function drag(svg, g, d, reheat) {
  g.addEventListener('pointerdown', (ev) => {
    dragged = false; const pt = svg.createSVGPoint(); g.setPointerCapture(ev.pointerId);
    const move = (e) => { pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); if (Math.hypot(p.x - d.x, p.y - d.y) > 2) dragged = true; d.x = p.x; d.y = p.y; d.fx = true; reheat(); };
    const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); if (!d.center) d.fx = false; };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
  });
}
function tipAt(ev, html) {
  const tip = $('.tip'), r = $('.onto-graph').getBoundingClientRect();
  tip.innerHTML = html; tip.style.display = 'block';
  tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 8) + 'px';
  tip.style.top = Math.min(ev.clientY - r.top + 14, r.height - tip.offsetHeight - 8) + 'px';
}
function hideTip() { if (el) $('.tip').style.display = 'none'; }
