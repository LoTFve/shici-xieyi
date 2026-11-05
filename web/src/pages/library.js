// 诗库页：按集子筛选，按标题、作者、诗句搜索，点一首去作画
import { library, esc } from '../data.js';

const PAGE = 60;
let el = null, all = null, state = { q: '', col: '', n: PAGE };
const $ = (s) => el.querySelector(s);

export function enter(root, params) {
  el = root;
  el.innerHTML = `
  <section class="lib">
    <div class="lib-bar">
      <label class="sr" for="lib-q">搜索</label>
      <input id="lib-q" type="search" placeholder="搜标题、作者或诗句，如 明月、李白、杨柳" autocomplete="off">
      <div class="seg" role="radiogroup" aria-label="集子"></div>
    </div>
    <p class="count muted" role="status">加载诗库…</p>
    <ol class="list"></ol>
    <button class="more ghost" hidden>再显示 ${PAGE} 首</button>
  </section>`;
  $('#lib-q').addEventListener('input', (e) => { state.q = e.target.value.trim(); state.n = PAGE; sync(); });
  $('.seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.col = b.dataset.col; state.n = PAGE; sync(); });
  $('.more').onclick = () => { state.n += PAGE; draw(); };
  library().then((lib) => { all = lib; update(params); });
  return () => { el = null; };
}

export function update({ query }) {
  state.q = query.get('q') || ''; state.col = query.get('col') || ''; state.n = PAGE;
  if (!all || !el) return;
  $('#lib-q').value = state.q;
  draw();
}
// 搜索条件写进网址，返回时能回到同一个结果
function sync() {
  const q = new URLSearchParams();
  if (state.q) q.set('q', state.q);
  if (state.col) q.set('col', state.col);
  history.replaceState(null, '', `#/library${q.toString() ? '?' + q : ''}`);
  draw();
}

function draw() {
  const cols = ['', ...all.collections];
  const n = (c) => all.poems.filter((p) => !c || p.col === c).length;
  $('.seg').innerHTML = cols.map((c) => `<button role="radio" aria-checked="${state.col === c}" data-col="${esc(c)}" class="${state.col === c ? 'on' : ''}">${c || '全部'} <small>${n(c)}</small></button>`).join('');
  const q = state.q;
  const hits = all.poems.filter((p) => (!state.col || p.col === state.col) && (!q || p.title.includes(q) || p.author.includes(q) || p.body.includes(q)));
  $('.count').textContent = q ? `“${q}”共 ${hits.length} 首` : `共 ${hits.length} 首`;
  const mark = (s) => (q ? esc(s).split(esc(q)).join(`<mark>${esc(q)}</mark>`) : esc(s));
  // 搜诗句时显示命中的那一句，否则显示第一句
  const line = (p) => {
    const ls = p.body.split(/(?<=[。！？；])/).filter(Boolean);
    return (q && ls.find((l) => l.includes(q))) || ls[0] || '';
  };
  $('.list').innerHTML = hits.slice(0, state.n).map((p) => `<li><a href="#/p/${encodeURIComponent(p.col)}/${p.id}">
      <span class="t">${mark(p.title)}</span><span class="a">${mark(p.author)}</span><span class="c">${esc(p.col)}${p.type && p.type !== p.col ? ' · ' + esc(p.type) : ''}</span>
      <span class="l">${mark(line(p))}</span></a></li>`).join('') || '<li class="muted empty">没有匹配的诗</li>';
  $('.more').hidden = hits.length <= state.n;
}
