// 作画页：全屏画面，竖排诗句，右侧（窄屏在底部）是输入和分析面板
import { analyze, fuse, visual, ask, ONTO, EMO, TIME_HOW, SEASON_HOW } from '../analyze.js';

const DRAW_NAME = Object.fromEntries(Object.entries(ONTO.images).map(([id, o]) => [id, o.name]));
import { mount, paint, isDark } from '../scene.js';
import { findPoem, toRaw, esc } from '../data.js';

// 预置诗，指向诗库里的编号
const PRESETS = { 江雪: 20, 静夜思: 11, 枫桥夜泊: 68, 山居秋暝: 89, 春晓: 18, 登鹳雀楼: 2, 将进酒: 293 };
const DEFAULT = '江雪\n柳宗元\n千山鸟飞绝，万径人踪灭。\n孤舟蓑笠翁，独钓寒江雪。';
const TAG = { 规则: '', 模型: 'llm', 本体推断: 'onto', 默认: '' };

let el = null, S = null, gen = 0, stop = null, from = null;
const $ = (s) => el.querySelector(s);

export function enter(root, params) {
  el = root;
  el.innerHTML = `
  <canvas class="scene"></canvas>
  <div class="poem" aria-live="polite"></div>
  <aside class="panel">
    <div class="panel-head">
      <span class="from"></span>
      <button class="ghost" data-act="fold" aria-expanded="true">收起</button>
    </div>
    <div class="panel-body">
      <label class="sr" for="poem-input">诗文</label>
      <textarea id="poem-input" placeholder="第一行标题，第二行作者，后面是正文"></textarea>
      <div class="row presets"></div>
      <div class="row">
        <button class="primary" data-act="go">生成画面 <kbd>Ctrl Enter</kbd></button>
        <label class="check"><input type="checkbox" data-act="llm" checked> 大模型</label>
      </div>
      <p class="ai muted" role="status"></p>
      <p class="legend muted">来源：<span class="chip">规则</span><span class="chip llm">模型</span><span class="chip onto">本体推断</span><span class="chip diff">与规则不同</span></p>
      <h2>意象 <small>诗里写到的景物，决定画什么。点击查看本体</small></h2>
      <div class="images"></div>
      <h2>意境 <small>时辰、季节、情感，决定怎么画</small></h2>
      <div class="mood"></div>
    </div>
  </aside>`;
  stop = mount($('.scene'));
  $('.presets').innerHTML = Object.entries(PRESETS).map(([k, id]) => `<a class="btn" href="#/p/唐诗三百首/${id}">${k}</a>`).join('') + '<a class="btn ghost" href="#/library">更多…</a>';
  $('[data-act=go]').onclick = () => go($('textarea').value, null);
  $('textarea').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go($('textarea').value, null); });
  $('[data-act=llm]').onchange = () => go($('textarea').value, from);
  $('[data-act=fold]').onclick = (e) => { const f = el.classList.toggle('folded'); e.target.textContent = f ? '展开' : '收起'; e.target.setAttribute('aria-expanded', String(!f)); };
  $('.images').addEventListener('click', (e) => {
    const c = e.target.closest('.chip[data-name]'); if (c) location.hash = `#/onto/${encodeURIComponent(c.dataset.name)}`;
  });
  addEventListener('resize', fit);
  update(params);
  return () => { stop && stop(); removeEventListener('resize', fit); el = null; S = null; gen++; };
}

export async function update({ seg }) {
  if (seg[0] === 'p' && seg[1] && seg[2]) {
    const p = await findPoem(seg[1], seg[2]);
    if (p) return load(toRaw(p), p);
    setAI(`诗库里没有找到 ${seg[1]} 第 ${seg[2]} 首`);
  }
  if (!S) load(DEFAULT, null);
}

function load(raw, poem) { $('textarea').value = raw; go(raw, poem); }

function go(raw, poem) {
  raw = raw.trim(); if (!raw || !el) return;
  from = poem;
  $('.from').innerHTML = poem ? `${esc(poem.col)} · ${esc(poem.type)}` : '自定义';
  S = analyze(raw); paint(S); render();
  if (!$('[data-act=llm]').checked) return setAI('只用规则');
  const R = S; setAI('模型分析中…');
  ask(R).then((M) => {
    if (S !== R) return;
    const F = fuse(R, M), n = F.imgs.filter((m) => m.differs).length + ['time', 'season', 'emo'].filter((k) => F[k].differs).length;
    const changed = visual(F) !== visual(R);
    S = F; paint(F, { rebuild: changed, transition: true }); tone(); panel();
    setAI(`已融合 ${M.model || '模型'} 的判断` + (n ? `，${n} 处与规则不同（红框）` : '，与规则一致'));
  }).catch((e) => { if (S === R) setAI('模型不可用，只用规则：' + e.message); });
}
function setAI(t) { if (el) $('.ai').textContent = t; }

function tone() {
  el.style.setProperty('--ink-poem', isDark(S) ? '#f2ead8' : '#1e1a16');
  el.style.setProperty('--halo', isDark(S) ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.7)');
  $('.scene').style.filter = `saturate(${S.E.sat}) brightness(${S.E.bri})`;
}
function render() {
  const my = ++gen, lines = S.body.split(/(?<=[。！？；])/).filter(Boolean);
  tone();
  const chars = (s) => [...s].map((c) => `<span>${esc(c)}</span>`).join('');
  $('.poem').innerHTML = [S.title && `<p class="t">${chars(S.title)}${S.author ? '　' + chars(S.author) : ''}</p>`, ...lines.map((l) => `<p>${chars(l)}</p>`)].filter(Boolean).join('');
  fit();
  const spans = [...$('.poem').querySelectorAll('span')]; let i = 0;
  (function step() { if (my !== gen || i >= spans.length) return; spans[i++].classList.add('on'); setTimeout(step, S.E.reveal); })();
  panel();
}
// 长诗按最长一句和句数缩小字号，避免超出画面
function fit() {
  if (!S || !el) return;
  // 可用高度取诗句区域的 max-height（窄屏时面板在底部，诗句只能占上半部分）
  const box = $('.scene').getBoundingClientRect(), lines = S.body.split(/(?<=[。！？；])/).filter(Boolean);
  const maxH = parseFloat(getComputedStyle($('.poem')).maxHeight) || box.height * .86;
  const longest = Math.max(...lines.map((l) => l.length), (S.title + S.author).length * .6 + 1);
  const size = Math.min(maxH * .92 / (longest * 1.3), box.width * .5 / ((lines.length + 1) * 1.9));
  $('.poem').style.fontSize = Math.max(12, Math.min(38, Math.max(box.width * .03, 16), size)) + 'px';
}

const chip = (text, tip, { off, cls, name } = {}) => `<span class="chip${off ? ' off' : ''}${cls ? ' ' + cls : ''}"${name ? ` data-name="${esc(name)}" role="link" tabindex="0"` : ''} title="${esc(tip)}">${esc(text)}</span>`;
function panel() {
  const extra = (m) => [m.note, m.differs && m.rule].filter(Boolean).map((s) => '\n' + s).join('');
  const one = (m) => {
    const cls = [TAG[m.src], m.differs && 'diff', !m.id && 'quiet'].filter(Boolean).join(' '), tip = `来源：${m.src}\n`;
    const drawn = m.id ? `${m.name === DRAW_NAME[m.id] ? '' : `按“${DRAW_NAME[m.id]}”画：`}${m.desc}` : '画不出，参与时辰、季节、情感推断';
    return m.off
      ? chip(`${m.name}（${m.why}）`, tip + (m.tip || `诗中“${m.ev.join('、')}”${m.why.split('、').map((k) => ONTO.reasons[k]).filter(Boolean).join('，')}，所以不算眼前景`) + extra(m), { off: true, cls, name: m.name })
      : chip(m.name, tip + `见“${m.ev.join('、')}” → ${drawn}` + extra(m), { cls, name: m.name });
  };
  // 能画的和只参与推断的分两行，长诗里意象多时不至于混成一片
  const drawable = S.imgs.filter((m) => m.id), other = S.imgs.filter((m) => !m.id);
  $('.images').innerHTML = (drawable.length ? drawable.map(one).join('') : '<span class="muted">没认出能画的景物，只画天和远山</span>') +
    (other.length ? `<div class="also"><span class="muted">另有 ${other.length} 个参与推断：</span>${other.map(one).join('')}</div>` : '');
  const ev = (o) => o.ev.length ? `<span class="muted">依据：${o.ev.map(esc).join('、')}</span>` : '<span class="muted">诗里没有线索，用默认</span>';
  const src = (o) => o.src === '规则' || o.src === '默认' ? '' : `<span class="src ${TAG[o.src]}${o.differs ? ' diff' : ''}" title="${esc(o.rule || '')}">${o.src}</span>`;
  const kv = (label, val, o, how) => `<div class="kv"><b>${label}</b><span>${val}${src(o)}　${ev(o)}<br><span class="muted">${how}</span></span></div>`;
  $('.mood').innerHTML =
    kv('时辰', S.time.key, S.time, TIME_HOW[S.time.key]) +
    kv('季节', S.season.key === '无' ? '未定' : S.season.key, S.season, SEASON_HOW[S.season.key]) +
    kv('情感', S.emo.key, S.emo, EMO[S.emo.key].how) +
    (S.emo2 ? kv('底色', S.emo2.key, S.emo2, '按三成混入：' + EMO[S.emo2.key].how) : '') +
    (S.notes ? `<p class="muted">模型解读：${esc(S.notes)}</p>` : '') +
    (S.dropped && S.dropped.length ? `<p class="muted">证据不在原文里、已丢弃的模型判断：${S.dropped.map(esc).join('、')}</p>` : '');
}

