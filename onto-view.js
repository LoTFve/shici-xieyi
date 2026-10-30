// 本体浏览层：在诗词写意页面上弹出，左边概念树与详情，右边以选中概念为中心的关系网络图
// 数据来自 ontology/images.js 里的 ONTO_DRAFT（由 tools/build-onto.cjs 生成）
(function(){
const D=typeof ONTO_DRAFT!=='undefined'?ONTO_DRAFT:null;if(!D)return;
const C=D.concepts,NAMES=Object.keys(C);
const CATS=['天象','气象','山石','水域','植物','动物','建筑','器物','人物','地理'];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=o=>Object.entries(o||{}).map(([k,v])=>`${k} ${Math.round(v*100)}%`).join('、');
// 边的四种关系。颜色只用于区分关系，图例和线型一起表达，不只靠颜色
const REL={
  is_a:{name:'上位',dash:''},
  needs:{name:'依赖',dash:'6 4'},
  attr:{name:'季节·时辰·寄托',dash:'2 3'},
  cooc:{name:'常一起出现',dash:''}
};
const kids={};for(const n of NAMES){const p=C[n].is_a;if(p&&C[p])(kids[p]=kids[p]||[]).push(n)}
for(const k in kids)kids[k].sort((a,b)=>C[b].n-C[a].n);
// 常同现按关联度排：PMI 乘以次数的对数。只按次数排，每个概念的邻居都会是云、月、风这些最常见的字
const coocOf={};for(const [a,b,v,pmi] of D.cooc){(coocOf[a]=coocOf[a]||[]).push([b,v,pmi]);(coocOf[b]=coocOf[b]||[]).push([a,v,pmi])}
for(const k in coocOf)coocOf[k].sort((x,y)=>y[2]*Math.log(y[1])-x[2]*Math.log(x[1]));

// ---------- 外框 ----------
const css=`
#ov{position:fixed;inset:0;z-index:20;display:none;background:var(--ov-page);color:var(--ov-ink);font:14px/1.6 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  --ov-page:#f9f9f7;--ov-surface:#fcfcfb;--ov-ink:#0b0b0b;--ov-ink2:#52514e;--ov-muted:#898781;--ov-grid:#e1e0d9;--ov-axis:#c3c2b7;--ov-hover:rgba(11,11,11,.05);
  --rel-is_a:#2a78d6;--rel-needs:#eb6834;--rel-attr:#1baf7a;--rel-cooc:#c3c2b7;--node:#52514e;--node-draw:#2a78d6;--focus:#7a3b2e}
#ov.dark{--ov-page:#0d0d0d;--ov-surface:#1a1a19;--ov-ink:#f0efec;--ov-ink2:#c3c2b7;--ov-muted:#898781;--ov-grid:#2c2c2a;--ov-axis:#383835;--ov-hover:rgba(255,255,255,.06);
  --rel-is_a:#3987e5;--rel-needs:#d95926;--rel-attr:#199e70;--rel-cooc:#383835;--node:#c3c2b7;--node-draw:#3987e5;--focus:#e0a080}
#ov.on{display:grid;grid-template-columns:minmax(260px,320px) minmax(300px,380px) 1fr;grid-template-rows:auto 1fr}
#ov header{grid-column:1/-1;display:flex;gap:12px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--ov-grid);background:var(--ov-surface)}
#ov header b{font-size:16px;letter-spacing:.2em}#ov header .meta{color:var(--ov-muted);font-size:12px;flex:1}
#ov button{font:inherit;font-size:13px;padding:3px 10px;border:1px solid var(--ov-axis);border-radius:14px;background:transparent;color:var(--ov-ink);cursor:pointer}
#ov button:hover{background:var(--ov-hover)}
#ov .col{overflow:auto;border-right:1px solid var(--ov-grid);background:var(--ov-surface)}
#ov .search{position:sticky;top:0;padding:10px;background:var(--ov-surface);border-bottom:1px solid var(--ov-grid)}
#ov input[type=search]{width:100%;font:inherit;padding:5px 8px;border:1px solid var(--ov-axis);border-radius:6px;background:var(--ov-page);color:var(--ov-ink)}
#ov .filters{display:flex;gap:10px;margin-top:6px;font-size:12px;color:var(--ov-ink2)}
#ov details{border-bottom:1px solid var(--ov-grid)}#ov summary{padding:6px 12px;cursor:pointer;font-weight:600;color:var(--ov-ink2)}
#ov summary small{font-weight:400;color:var(--ov-muted)}
#ov .item{display:flex;justify-content:space-between;padding:2px 12px 2px calc(12px + var(--d,0)*16px);cursor:pointer}
#ov .item:hover{background:var(--ov-hover)}#ov .item.sel{background:var(--ov-hover);box-shadow:inset 3px 0 0 var(--focus)}
#ov .item .n{color:var(--ov-muted);font-variant-numeric:tabular-nums;font-size:12px}
#ov .item .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:1px;background:var(--node)}
#ov .item .dot.draw{background:var(--node-draw)}
#ov .detail{padding:14px 16px}#ov .detail h3{font-size:20px;margin-bottom:2px}
#ov .detail .sub{color:var(--ov-muted);font-size:12px;margin-bottom:10px}
#ov .kv{display:grid;grid-template-columns:4.5em 1fr;gap:4px 8px;margin:4px 0}#ov .kv dt{color:var(--ov-muted)}
#ov .tag{display:inline-block;padding:0 7px;margin:1px 3px 1px 0;border:1px solid var(--ov-grid);border-radius:10px;font-size:12px;cursor:pointer}
#ov .tag:hover{background:var(--ov-hover)}
#ov .words{color:var(--ov-ink2);font-size:13px;word-break:break-all}
#ov .bars{margin:4px 0}#ov .bar{display:grid;grid-template-columns:5.5em 1fr 2.5em;align-items:center;gap:6px;font-size:12px}
#ov .bar i{display:block;height:8px;border-radius:0 4px 4px 0;background:var(--rel-is_a)}
#ov .bar span:last-child{text-align:right;font-variant-numeric:tabular-nums;color:var(--ov-ink2)}
#ov .graph{position:relative;background:var(--ov-surface);overflow:hidden}
#ov svg{width:100%;height:100%;display:block}
#ov .legend{position:absolute;left:12px;top:10px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ov-ink2);background:var(--ov-surface);padding:4px 8px;border-radius:6px}
#ov .legend label{display:flex;align-items:center;gap:5px;cursor:pointer}
#ov .legend svg{width:22px;height:8px}
#ov .tip{position:absolute;pointer-events:none;background:var(--ov-surface);color:var(--ov-ink);border:1px solid var(--ov-grid);border-radius:6px;padding:4px 8px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.12);display:none;max-width:240px}
#ov .hint{position:absolute;right:12px;bottom:10px;font-size:12px;color:var(--ov-muted)}
#ov .empty{padding:12px;color:var(--ov-muted)}
#ov table{border-collapse:collapse;font-size:12px;width:100%}#ov td,#ov th{padding:2px 6px;border-bottom:1px solid var(--ov-grid);text-align:left}
#ov th{color:var(--ov-muted);font-weight:400}#ov td.num{text-align:right;font-variant-numeric:tabular-nums}
@media (max-width:900px){#ov.on{grid-template-columns:1fr;grid-template-rows:auto 40vh 1fr 50vh}#ov .col{border-right:0;border-bottom:1px solid var(--ov-grid)}}
`;
document.head.insertAdjacentHTML('beforeend',`<style>${css}</style>`);
const ov=document.createElement('div');ov.id='ov';
ov.innerHTML=`<header><b>本体</b><span class="meta"></span>
  <button data-act="theme">深色</button><button data-act="close">关闭（Esc）</button></header>
<div class="col" id="ov-tree"><div class="search"><input type="search" placeholder="搜索物象或写法，如 子规、孤帆"><div class="filters">
  <label><input type="checkbox" data-f="draw"> 只看能画的</label><label><input type="checkbox" data-f="big" checked> 出现 10 首以上</label></div></div><div class="list"></div></div>
<div class="col detail" id="ov-detail"></div>
<div class="graph"><div class="legend"></div><svg></svg><div class="tip"></div><div class="hint">点节点换中心，拖动可移动</div></div>`;
document.body.append(ov);
const $=s=>ov.querySelector(s);
const m=D.meta;$('.meta').textContent=`${NAMES.length} 个概念 · ${Object.values(m.collections).reduce((a,b)=>a+b,0)} 首诗 · ${m.source.replace(/，DeepSeek.*/,'')}`;

// ---------- 概念树 ----------
const filter={q:'',draw:false,big:true};
const owner={};for(const n of NAMES)for(const w of C[n].words)owner[w]=n;
function match(n){
  const c=C[n];
  if(filter.draw&&!c.draw&&!c.draws_as)return false;
  if(filter.q)return n.includes(filter.q)||c.words.some(w=>w.includes(filter.q));
  return !filter.big||c.n>=10||kids[n];
}
function row(n,d){const c=C[n];return`<div class="item${n===cur?' sel':''}" data-n="${esc(n)}" style="--d:${d}"><span><span class="dot${c.draw||c.draws_as?' draw':''}"></span>${esc(n)}</span><span class="n">${c.n}</span></div>`}
function tree(){
  let h='';
  for(const cat of CATS){
    const roots=NAMES.filter(n=>C[n].cat===cat&&!(C[n].is_a&&C[C[n].is_a]&&C[C[n].is_a].cat===cat)).sort((a,b)=>C[b].n-C[a].n);
    let body='',cnt=0;
    const walk=(n,d)=>{const sub=(kids[n]||[]).filter(k=>C[k].cat===cat);const hit=match(n),inner=sub.map(k=>walk(k,d+1)).join('');
      if(hit||inner){cnt+=hit?1:0;return(hit||inner?row(n,d):'')+inner}return''};
    for(const r of roots)body+=walk(r,0);
    const total=NAMES.filter(n=>C[n].cat===cat).length;
    if(body)h+=`<details${filter.q||cat===C[cur]?.cat?' open':''}><summary>${cat} <small>${cnt} / ${total}</small></summary>${body}</details>`;
  }
  $('.list').innerHTML=h||'<div class="empty">没有匹配的概念</div>';
}
$('input[type=search]').addEventListener('input',e=>{filter.q=e.target.value.trim();tree();
  const hit=owner[filter.q]||(C[filter.q]&&filter.q);if(hit)select(hit)});
ov.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('change',()=>{filter[el.dataset.f]=el.checked;tree()}));
$('.list').addEventListener('click',e=>{const it=e.target.closest('.item');if(it)select(it.dataset.n)});

// ---------- 详情 ----------
// 各集按“出现首数 / 这一集首数”比较，楚辞只有 65 首，按次数比会被大集子压下去
const SH={唐:'唐诗三百首',宋词:'宋词三百首',千家:'千家诗',诗经:'诗经',楚辞:'楚辞'};
function bars(by){
  const rows=Object.entries(by||{}).map(([k,v])=>[SH[k]||k,v,v/(m.collections[SH[k]||k]||1)]);
  const max=Math.max(...rows.map(r=>r[2]));
  return`<div class="bars">${rows.sort((a,b)=>b[2]-a[2]).map(([k,v,r])=>`<div class="bar" title="${v} 首，占这一集的 ${(r*100).toFixed(1)}%"><span>${esc(k)}</span><i style="width:${r/max*100}%"></i><span>${(r*100).toFixed(0)}%</span></div>`).join('')}</div>`;
}
function tags(list){return list.map(n=>C[n]?`<span class="tag" data-n="${esc(n)}">${esc(n)}</span>`:`<span class="tag">${esc(n)}</span>`).join('')}
function detail(n){
  const c=C[n],draws=c.draw||c.draws_as;
  const near=(coocOf[n]||[]).slice(0,12);
  $('#ov-detail').innerHTML=`<h3>${esc(n)}</h3><div class="sub">${esc(c.cat)} · ${c.n} 首诗出现${c.sense==='听'?' · 听觉意象':''}</div>
  <dl class="kv">
    <dt>画法</dt><dd>${draws?`${c.draw?'自有画法':`沿上位类，用“${esc(C[c.is_a]?.draw?c.is_a:'')}”的画法`}（${esc(draws)}）`:'画不出，只参与推断'}</dd>
    ${c.is_a?`<dt>上位</dt><dd>${tags([c.is_a])}</dd>`:''}
    ${kids[n]?`<dt>下位</dt><dd>${tags(kids[n])}</dd>`:''}
    ${c.part_of?`<dt>部分</dt><dd>是${tags([c.part_of])}的一部分</dd>`:''}
    ${c.needs?`<dt>依赖</dt><dd>画它要同时画 ${tags(c.needs)}</dd>`:''}
    ${c.season?`<dt>季节</dt><dd>${fmt(c.season)}</dd>`:''}
    ${c.time?`<dt>时辰</dt><dd>${fmt(c.time)}</dd>`:''}
    ${c.evokes?`<dt>寄托</dt><dd>${fmt(c.evokes.默认)}</dd>`:''}
    ${c.symbol?`<dt>象征</dt><dd>${c.symbol.map(esc).join('、')}</dd>`:''}
    ${c.usage?`<dt>非实写</dt><dd>${Object.entries(c.usage).map(([k,v])=>`${esc(k)} ${v}`).join('、')}</dd>`:''}
  </dl>
  <dl class="kv"><dt>各集占比</dt><dd>${bars(c.by)}</dd></dl>
  ${near.length?`<dl class="kv"><dt>常同现</dt><dd>${near.map(([b,v])=>`<span class="tag" data-n="${esc(b)}">${esc(b)} ${v}</span>`).join('')}</dd></dl>`:''}
  <dl class="kv"><dt>写法</dt><dd class="words">${c.words.map(esc).join(' ')}</dd></dl>
  ${c.examples?`<dl class="kv"><dt>例句</dt><dd class="words">${c.examples.map(esc).join('<br>')}</dd></dl>`:''}`;
}
$('#ov-detail').addEventListener('click',e=>{const t=e.target.closest('.tag[data-n]');if(t)select(t.dataset.n)});

// ---------- 关系网络图：中心概念 + 一层邻居 ----------
const svg=$('svg'),tip=$('.tip'),NS='http://www.w3.org/2000/svg';
const show={is_a:true,needs:true,attr:true,cooc:true};
$('.legend').innerHTML=Object.entries(REL).map(([k,r])=>`<label><input type="checkbox" data-rel="${k}" checked>
  <svg viewBox="0 0 22 8"><line x1="1" y1="4" x2="21" y2="4" stroke="var(--rel-${k})" stroke-width="2" stroke-dasharray="${r.dash}" stroke-linecap="round"/></svg>${r.name}</label>`).join('')+
  `<label><svg viewBox="0 0 22 8"><circle cx="11" cy="4" r="3.5" fill="var(--node-draw)"/></svg>能画</label><label><svg viewBox="0 0 22 8"><circle cx="11" cy="4" r="3.5" fill="var(--node)"/></svg>画不出</label><label><svg viewBox="0 0 22 8"><rect x="6" y="1" width="10" height="6" rx="3" fill="none" stroke="var(--rel-attr)" stroke-width="1.5"/></svg>属性值</label>`;
$('.legend').addEventListener('change',e=>{const k=e.target.dataset.rel;if(k){show[k]=e.target.checked;graph(cur)}});
let sim=null;
function neighbors(n){
  const c=C[n],nodes=new Map(),edges=[];
  const add=(id,kind,extra={})=>{if(!nodes.has(id))nodes.set(id,{id,kind,...extra});return nodes.get(id)};
  add(n,'concept',{center:true});
  if(show.is_a){
    if(c.is_a&&C[c.is_a]){add(c.is_a,'concept');edges.push({a:n,b:c.is_a,rel:'is_a',label:`${n} 是一种 ${c.is_a}`})}
    for(const k of(kids[n]||[]).slice(0,14)){add(k,'concept');edges.push({a:k,b:n,rel:'is_a',label:`${k} 是一种 ${n}`})}
    if(c.part_of&&C[c.part_of]&&c.part_of!==c.is_a){add(c.part_of,'concept');edges.push({a:n,b:c.part_of,rel:'is_a',label:`${n} 是 ${c.part_of} 的一部分`})}
  }
  if(show.needs){
    for(const k of c.needs||[])if(C[k]){add(k,'concept');edges.push({a:n,b:k,rel:'needs',label:`画 ${n} 需要 ${k}`})}
    for(const o of NAMES)if((C[o].needs||[]).includes(n)){add(o,'concept');edges.push({a:o,b:n,rel:'needs',label:`画 ${o} 需要 ${n}`})}
  }
  if(show.attr){
    for(const [dim,label] of [['season','季节'],['time','时辰']])for(const [k,v] of Object.entries(c[dim]||{})){
      const id=`${label}:${k}`;add(id,'attr',{text:k,dim:label});edges.push({a:n,b:id,rel:'attr',w:v,label:`${label}：${k}，占 ${Math.round(v*100)}%`})}
    for(const [k,v] of Object.entries(c.evokes?.默认||{})){const id=`情感:${k}`;add(id,'attr',{text:k,dim:'寄托'});edges.push({a:n,b:id,rel:'attr',w:v,label:`寄托${k}，占 ${Math.round(v*100)}%`})}
  }
  if(show.cooc){
    for(const [b,v,pmi] of(coocOf[n]||[]).slice(0,12)){
      add(b,'concept');edges.push({a:n,b,rel:'cooc',w:v,label:`${n} 与 ${b} 同在 ${v} 首诗里，关联度 ${pmi}`})}
  }
  return{nodes:[...nodes.values()],edges};
}
function graph(n){
  if(sim)cancelAnimationFrame(sim);
  const W=svg.clientWidth||800,H=svg.clientHeight||600;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const {nodes,edges}=neighbors(n);
  const R=Math.min(W,H)*.34;
  // 概念节点排一圈，属性值放在下方一段弧上，起始位置分开，力导向收敛更快也更少重叠
  const cs=nodes.filter(d=>!d.center&&d.kind==='concept'),as=nodes.filter(d=>d.kind==='attr');
  cs.forEach((d,i)=>{const a=-Math.PI/2+(i+.5)/cs.length*Math.PI*2;d.x=W/2+Math.cos(a)*R;d.y=H/2+Math.sin(a)*R});
  as.forEach((d,i)=>{const a=Math.PI*(.3+.4*(i+.5)/as.length);d.x=W/2+Math.cos(a)*R*.6;d.y=H/2+Math.sin(a)*R*.6});
  nodes.forEach(d=>{if(d.center){d.x=W/2;d.y=H/2;d.fx=true}d.vx=0;d.vy=0});
  const byId=new Map(nodes.map(d=>[d.id,d]));
  const size=d=>d.kind==='attr'?0:Math.max(5,Math.min(16,3+Math.sqrt(C[d.id].n)));
  svg.innerHTML='';
  const gE=document.createElementNS(NS,'g'),gN=document.createElementNS(NS,'g');svg.append(gE,gN);
  const els=edges.map(e=>{
    const hit=document.createElementNS(NS,'line');hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','12');
    const l=document.createElementNS(NS,'line');l.setAttribute('stroke',`var(--rel-${e.rel})`);l.setAttribute('stroke-linecap','round');
    l.setAttribute('stroke-width',e.rel==='cooc'?String(1+Math.min(2,e.w/12)):'2');if(REL[e.rel].dash)l.setAttribute('stroke-dasharray',REL[e.rel].dash);
    for(const x of[hit,l]){x.addEventListener('mousemove',ev=>tipAt(ev,esc(e.label)));x.addEventListener('mouseleave',hideTip)}
    gE.append(l,hit);return{e,l,hit};
  });
  const nEls=nodes.map(d=>{
    const g=document.createElementNS(NS,'g');g.style.cursor=d.kind==='concept'?'pointer':'default';
    if(d.kind==='attr'){
      const t=document.createElementNS(NS,'text');t.textContent=`${d.dim}·${d.text}`;t.setAttribute('font-size','12');t.setAttribute('fill','var(--ov-ink2)');t.setAttribute('text-anchor','middle');t.setAttribute('dy','4');
      const r=document.createElementNS(NS,'rect');r.setAttribute('rx','9');r.setAttribute('fill','var(--ov-surface)');r.setAttribute('stroke','var(--rel-attr)');r.setAttribute('stroke-width','1.5');
      const w=t.textContent.length*12+14;r.setAttribute('x',-w/2);r.setAttribute('y','-10');r.setAttribute('width',w);r.setAttribute('height','20');g.append(r,t);
    }else{
      const c=C[d.id],s=size(d);
      const ring=document.createElementNS(NS,'circle');ring.setAttribute('r',s+2);ring.setAttribute('fill','var(--ov-surface)');
      const dot=document.createElementNS(NS,'circle');dot.setAttribute('r',s);dot.setAttribute('fill',c.draw||c.draws_as?'var(--node-draw)':'var(--node)');
      if(d.center){dot.setAttribute('stroke','var(--focus)');dot.setAttribute('stroke-width','3')}
      const hit=document.createElementNS(NS,'circle');hit.setAttribute('r',Math.max(s+6,14));hit.setAttribute('fill','transparent');
      const t=document.createElementNS(NS,'text');t.textContent=d.id;t.setAttribute('font-size',d.center?'16':'13');t.setAttribute('font-weight',d.center?'600':'400');
      t.setAttribute('fill','var(--ov-ink)');t.setAttribute('x',s+5);t.setAttribute('dy','4');
      t.setAttribute('paint-order','stroke');t.setAttribute('stroke','var(--ov-surface)');t.setAttribute('stroke-width','3');
      g.append(ring,dot,t,hit);
      g.addEventListener('mousemove',ev=>tipAt(ev,`<b>${esc(d.id)}</b> · ${esc(c.cat)} · ${c.n} 首<br>${c.draw||c.draws_as?'能画':'画不出'}${c.evokes?` · 寄托 ${esc(fmt(c.evokes.默认))}`:''}`));
      g.addEventListener('mouseleave',hideTip);
      g.addEventListener('click',()=>{if(!dragged)select(d.id)});
    }
    drag(g,d);gN.append(g);return{d,g};
  });
  // 简单力导向：边拉近，节点互斥，中心固定
  let alpha=1;
  const tick=()=>{
    for(const {e} of els){const a=byId.get(e.a),b=byId.get(e.b),dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1,want=e.rel==='attr'?R*.7:R*.85,k=(dist-want)/dist*.04*alpha;
      if(!a.fx){a.vx+=dx*k;a.vy+=dy*k}if(!b.fx){b.vx-=dx*k;b.vy-=dy*k}}
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],dx=b.x-a.x,dy=b.y-a.y,d2=Math.max(dx*dx+dy*dy,100),f=(a.kind==='attr'||b.kind==='attr'?6000:2200)/d2*alpha;
      const fx=dx/Math.sqrt(d2)*f,fy=dy/Math.sqrt(d2)*f;if(!a.fx){a.vx-=fx;a.vy-=fy}if(!b.fx){b.vx+=fx;b.vy+=fy}}
    for(const d of nodes){if(d.fx)continue;d.vx*=.6;d.vy*=.6;d.x=Math.max(30,Math.min(W-60,d.x+d.vx));d.y=Math.max(46,Math.min(H-24,d.y+d.vy))}
    for(const {e,l,hit} of els){const a=byId.get(e.a),b=byId.get(e.b);for(const x of[l,hit]){x.setAttribute('x1',a.x);x.setAttribute('y1',a.y);x.setAttribute('x2',b.x);x.setAttribute('y2',b.y)}}
    for(const {d,g} of nEls)g.setAttribute('transform',`translate(${d.x},${d.y})`);
    alpha*=.985;if(alpha>.02)sim=requestAnimationFrame(tick);
  };
  tick();
  graph.reheat=()=>{alpha=Math.max(alpha,.3);if(alpha<=.3)sim=requestAnimationFrame(tick)};
}
let dragged=false;
function drag(g,d){
  g.addEventListener('pointerdown',ev=>{dragged=false;const pt=svg.createSVGPoint();g.setPointerCapture(ev.pointerId);
    const move=e=>{pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse());if(Math.hypot(p.x-d.x,p.y-d.y)>2)dragged=true;d.x=p.x;d.y=p.y;d.fx=true;graph.reheat&&graph.reheat()};
    const up=()=>{g.removeEventListener('pointermove',move);g.removeEventListener('pointerup',up);if(!d.center)d.fx=false};
    g.addEventListener('pointermove',move);g.addEventListener('pointerup',up)});
}
function tipAt(ev,html){const r=ov.querySelector('.graph').getBoundingClientRect();tip.innerHTML=html;tip.style.display='block';
  const x=ev.clientX-r.left+14,y=ev.clientY-r.top+14;tip.style.left=Math.min(x,r.width-tip.offsetWidth-8)+'px';tip.style.top=Math.min(y,r.height-tip.offsetHeight-8)+'px'}
function hideTip(){tip.style.display='none'}

// ---------- 选中、打开、关闭 ----------
let cur=null;
function select(n){if(!C[n])return;cur=n;tree();detail(n);graph(n);
  const it=ov.querySelector(`.item[data-n="${CSS.escape(n)}"]`);if(it)it.scrollIntoView({block:'nearest'})}
function open(n){ov.classList.add('on');select(C[n]?n:(cur||'月'))}
function close(){ov.classList.remove('on');if(sim)cancelAnimationFrame(sim)}
ov.addEventListener('click',e=>{const a=e.target.dataset.act;if(a==='close')close();
  if(a==='theme'){ov.classList.toggle('dark');e.target.textContent=ov.classList.contains('dark')?'浅色':'深色'}});
addEventListener('keydown',e=>{if(e.key==='Escape'&&ov.classList.contains('on'))close()});
addEventListener('resize',()=>{if(ov.classList.contains('on')&&cur)graph(cur)});
if(matchMedia('(prefers-color-scheme: dark)').matches){ov.classList.add('dark');$('[data-act=theme]').textContent='浅色'}
// 给页面用：按写法找概念，打开本体
window.OntoView={open,find:w=>owner[w]||(C[w]&&w)||null};
})();
