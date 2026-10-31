// 抽查页：五部集子各取 12 首，列出模型改变了画面的每一处，逐条标对错
// 标注先存在浏览器里，点“保存到项目”写进 ontology/review-verdicts.json
import { library, esc } from '../data.js';
import { analyze, fuse, ask } from '../analyze.js';

const COLS = ['唐诗三百首', '宋词三百首', '千家诗', '诗经', '楚辞'];
const PER = 12, STORE = 'shici:review';
let el = null, items = [], poems = [], verdicts = {}, filter = 'todo', saved = '';
const $ = (s) => el.querySelector(s);

// 每集按编号等距取，跳过超过 1500 字的长篇
function sample(all) {
  const out = [];
  for (const col of COLS) {
    const ps = all.filter((p) => p.col === col && p.body.length <= 1500), step = ps.length / PER;
    for (let i = 0; i < PER; i++) out.push(ps[Math.floor(i * step)]);
  }
  return out;
}

// 一首诗里模型改变了画面的地方：画不画、时辰、季节、主情感
function changes(p, R, F) {
  const rows = [], key = (type, name) => `${p.col}/${p.id}/${type}/${name}`;
  for (const m of F.imgs.filter((x) => x.differs)) {
    const r = R.rules.find((x) => x.name === m.name);
    rows.push({ key: key('img', m.name), type: '画不画', what: `${m.off ? '不画' : '画'} ${m.name}`,
      rule: r ? (r.off ? `不画（${r.why}）` : '画') : '没认出', model: `${m.off ? `不画（${m.why}）` : '画'}：“${m.ev.join('、')}”`, why: m.note || '' });
  }
  for (const [k, label] of [['time', '时辰'], ['season', '季节']]) if (F[k].differs)
    rows.push({ key: key(k, F[k].key), type: label, what: `${label}：${F[k].key}`,
      rule: `${R[k].key}${R[k].ev.length ? '（' + R[k].ev.join('、') + '）' : `（${R[k].src}）`}`, model: `${F[k].key}：“${F[k].ev.join('、')}”`, why: '' });
  if (F.emo.key !== R.emo.key)
    rows.push({ key: key('emo', F.emo.key), type: '情感', what: `情感：${F.emo.key}`,
      rule: `${R.emo.key}（${R.emo.ev.slice(0, 5).join('、')}）`, model: `${F.emo.key}：“${F.emo.ev.join('、')}”`, why: '' });
  return rows;
}

export function enter(root) {
  el = root;
  try { verdicts = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { verdicts = {}; }
  el.innerHTML = `
  <section class="rev">
    <header class="rev-bar">
      <div>
        <h1>模型改动抽查</h1>
        <p class="muted">五部集子各 ${PER} 首里，模型改变了画面的每一处。只标明显不对的就行，标错时可以写一句理由。</p>
      </div>
      <div class="rev-tools">
        <p class="prog" role="status">准备中…</p>
        <div class="seg" role="radiogroup" aria-label="筛选">
          <button data-f="todo">未核</button><button data-f="bad">标错的</button><button data-f="all">全部</button>
        </div>
        <button class="primary" data-act="save">保存到项目</button>
        <span class="muted saved" role="status"></span>
      </div>
    </header>
    <div class="rev-list"></div>
  </section>`;
  el.querySelector('.seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.f; draw(); } });
  $('[data-act=save]').onclick = save;
  el.addEventListener('click', onMark);
  el.addEventListener('input', (e) => {
    const t = e.target.closest('textarea[data-key]'); if (!t) return;
    verdicts[t.dataset.key] = { ...(verdicts[t.dataset.key] || { ok: false }), note: t.value.slice(0, 200) }; keep();
  });
  load();
  return () => { el = null; };
}

async function load() {
  const { poems: all } = await library();
  poems = sample(all); items = [];
  // 先拿服务器上已保存的标注，浏览器里的优先
  try { const r = await fetch('/api/review'); if (r.ok) verdicts = { ...(await r.json()).verdicts, ...verdicts }; } catch {}
  let done = 0, failed = 0;
  const queue = poems.map((p, i) => [p, i]), result = new Array(poems.length);
  const work = async () => {
    while (queue.length && el) {
      const [p, i] = queue.shift(), raw = [p.title, p.author, p.body].join('\n'), R = analyze(raw);
      // 并发时偶尔超时，失败的重试一次
      let M = null;
      for (let t = 0; t < 2 && !M; t++) { try { M = await ask(R); } catch {} }
      if (M) { const F = fuse(R, M); result[i] = { p, notes: F.notes, rows: changes(p, R, F) }; } else failed++;
      done++;
      if (el) $('.prog').textContent = `分析中 ${done} / ${poems.length}${failed ? `，${failed} 首模型不可用` : ''}`;
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  if (!el) return;
  items = result.filter((x) => x && x.rows.length);
  if (failed) $('.saved').textContent = `${failed} 首模型不可用，没列出`;
  draw();
}

function onMark(e) {
  const b = e.target.closest('button[data-mark]'); if (!b) return;
  const k = b.dataset.key, ok = b.dataset.mark === 'ok', cur = verdicts[k];
  // 再点一次同一个按钮就撤销
  if (cur && cur.ok === ok) delete verdicts[k]; else verdicts[k] = { ok, note: cur?.note || '' };
  keep(); draw();
  if (!ok && verdicts[k]) el.querySelector(`textarea[data-key="${CSS.escape(k)}"]`)?.focus();
}
function keep() { localStorage.setItem(STORE, JSON.stringify(verdicts)); $('.saved').textContent = ''; }

function draw() {
  const rows = items.flatMap((x) => x.rows), done = rows.filter((r) => verdicts[r.key]).length, bad = rows.filter((r) => verdicts[r.key]?.ok === false).length;
  $('.prog').textContent = `已核 ${done} / ${rows.length} 处，标错 ${bad} 处`;
  el.querySelectorAll('.seg button').forEach((b) => { const on = b.dataset.f === filter; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  const show = (r) => filter === 'all' || (filter === 'todo' ? !verdicts[r.key] : verdicts[r.key]?.ok === false);
  const html = items.map(({ p, notes, rows }) => {
    const list = rows.filter(show); if (!list.length) return '';
    return `<article class="rev-poem">
      <h2><a href="#/p/${encodeURIComponent(p.col)}/${p.id}">${esc(p.title)}</a> <small>${esc(p.author)} · ${esc(p.col)}</small></h2>
      <p class="rev-text">${esc(p.body.length > 160 ? p.body.slice(0, 160) + '…' : p.body)}</p>
      ${notes ? `<p class="muted">模型解读：${esc(notes)}</p>` : ''}
      ${list.map((r) => { const v = verdicts[r.key];
        return `<div class="rev-row${v ? (v.ok ? ' is-ok' : ' is-bad') : ''}">
          <span class="tag">${esc(r.type)}</span>
          <div class="rev-body">
            <b>${esc(r.what)}</b>
            <p><span class="muted">规则</span> ${esc(r.rule)}</p>
            <p><span class="muted">模型</span> ${esc(r.model)}${r.why ? `<br><span class="muted">理由</span> ${esc(r.why)}` : ''}</p>
            ${v && !v.ok ? `<textarea data-key="${esc(r.key)}" rows="1" maxlength="200" placeholder="哪里不对（可不填）">${esc(v.note || '')}</textarea>` : ''}
          </div>
          <div class="rev-mark">
            <button data-mark="ok" data-key="${esc(r.key)}" aria-pressed="${v?.ok === true}" title="判得对">对</button>
            <button data-mark="bad" data-key="${esc(r.key)}" aria-pressed="${v?.ok === false}" title="判错了">错</button>
          </div>
        </div>`; }).join('')}
    </article>`;
  }).join('');
  $('.rev-list').innerHTML = html || `<p class="muted empty">${filter === 'todo' ? '都核完了' : '没有'}</p>`;
}

async function save() {
  const rows = items.flatMap((x) => x.rows.map((r) => ({ ...r, col: x.p.col, id: x.p.id, title: x.p.title })));
  const payload = rows.filter((r) => verdicts[r.key]).map((r) => ({ key: r.key, title: r.title, what: r.what, rule: r.rule, model: r.model, ok: verdicts[r.key].ok, note: verdicts[r.key].note || '' }));
  try {
    const res = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ total: rows.length, items: payload }) });
    const j = await res.json().catch(() => ({}));
    $('.saved').textContent = res.ok ? `已保存 ${payload.length} 条` : `保存失败：${j.error || res.status}`;
  } catch (e) { $('.saved').textContent = '保存失败：' + e.message; }
}
