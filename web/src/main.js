// 入口：哈希路由，三个页面共用顶栏
import './style.css';
import * as paintPage from './pages/paint.js';
import * as libraryPage from './pages/library.js';
import * as ontoPage from './pages/onto.js';

const PAGES = { paint: paintPage, library: libraryPage, onto: ontoPage };
const app = document.getElementById('app');
let current = null, leave = null;

// #/            作画，默认诗
// #/p/唐诗三百首/20  作画，诗库里的某一首
// #/library?q=月  诗库
// #/onto/雁      本体，选中某个概念
function route() {
  const [path, query = ''] = decodeURIComponent(location.hash.slice(1) || '/').split('?');
  const seg = path.split('/').filter(Boolean);
  const name = seg[0] === 'library' ? 'library' : seg[0] === 'onto' ? 'onto' : 'paint';
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
