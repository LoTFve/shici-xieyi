// 入口：哈希路由，各页面共用顶栏
import './style.css';
import * as paintPage from './pages/paint.js';
import * as libraryPage from './pages/library.js';
import * as ontoPage from './pages/onto.js';
import * as reviewPage from './pages/review.js';

const PAGES = { paint: paintPage, library: libraryPage, onto: ontoPage, review: reviewPage };
const app = document.getElementById('app');
let current = null, leave = null;

// #/            作画，默认诗
// #/p/唐诗三百首/20  作画，诗库里的某一首
// #/library?q=月  诗库
// #/onto/雁      本体，选中某个概念
// #/review       模型改动抽查
function route() {
  const [path, query = ''] = decodeURIComponent(location.hash.slice(1) || '/').split('?');
  const seg = path.split('/').filter(Boolean);
  const name = PAGES[seg[0]] && seg[0] !== 'paint' ? seg[0] : 'paint';
  const params = { seg, query: new URLSearchParams(query) };
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === name));
  if (current === name && PAGES[name].update) return PAGES[name].update(params);
  if (leave) leave();
  app.className = `page-${name}`;
  app.innerHTML = '';
  current = name;
  leave = PAGES[name].enter(app, params) || null;
}
addEventListener('hashchange', route);
route();
