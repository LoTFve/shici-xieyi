// 画面：按分析结果在 canvas 上现场作画。背景画到离屏画布，每帧贴上去再画会动的东西
const TAU = Math.PI * 2;
const SKY = { 晨: ['#e9c9b4', '#f7ead9'], 昼: ['#a9c7da', '#eef1ea'], 暮: ['#4b4466', '#e8a477'], 夜: ['#081221', '#25304a'] };
const HILL = { 春: '#5f8a63', 夏: '#2f5d4a', 秋: '#8a6a48', 冬: '#7f8a96', 无: '#5a6470' };
function rng(a) { return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

let cv, ctx, W, H, DPR, S = null, bg = null, parts = [], raf = 0;

// ---------- 静态背景：天、日月、山、水、楼阁 ----------
function build(){
  const r=rng(S.seed),h=S.has,E=S.E,[top,bot]=SKY[S.time.key],night=S.time.key==='夜';
  S.night=night;S.dark=night||S.time.key==='暮';S.top=top;S.bot=bot;
  S.hz=H*(h.water?(S.emo.key==='壮阔'?.64:.6):.8);
  let hill=HILL[S.season.key];
  if(h.snow)hill=mix(hill,'#e8ecef',.45);
  if(night)hill=mix(hill,'#0a0f1a',.6);
  S.ink=night?'#06090f':mix(hill,'#151515',.7);
  bg=document.createElement('canvas');bg.width=W;bg.height=H;
  const g=bg.getContext('2d');
  let gr=g.createLinearGradient(0,0,0,S.hz);gr.addColorStop(0,top);gr.addColorStop(1,bot);
  g.fillStyle=gr;g.fillRect(0,0,W,H);
  if((night||h.star)&&!h.cloud)for(let i=0;i<150;i++){const z=DPR*(r()<.1?2:1);g.fillStyle=`rgba(255,250,235,${r()*.7+.1})`;g.fillRect(r()*W,r()*S.hz*.75,z,z)}
  // 日月
  S.orb=null;const tk=S.time.key;
  if(h.moon)S.orb=S.moonSet?{x:W*.6,y:S.hz-H*.09,r:H*.04,c:'#f3d7a0',glow:.25}:{x:W*.6,y:H*.18,r:H*.045,c:'#f5f1e0',glow:.5};
  else if(tk==='暮')S.orb={x:W*.55,y:S.hz-H*.06,r:H*.06,c:'#f4a25f',glow:.6};
  else if(tk==='晨')S.orb={x:W*.42,y:S.hz-H*.15,r:H*.05,c:'#f8d9b8',glow:.4};
  else if(h.sun)S.orb={x:W*.6,y:H*.15,r:H*.045,c:'#fffbe8',glow:.5};
  if(S.orb){const o=S.orb;
    gr=g.createRadialGradient(o.x,o.y,o.r*.5,o.x,o.y,o.r*6);gr.addColorStop(0,rgba(o.c,o.glow));gr.addColorStop(1,rgba(o.c,0));
    g.fillStyle=gr;g.fillRect(0,0,W,H);g.fillStyle=o.c;g.beginPath();g.arc(o.x,o.y,o.r,0,TAU);g.fill()}
  // 远山：层数由意境决定，颜色越远越接近天色
  const n=S.emo.key==='壮阔'&&h.mountain?5:h.mountain?3:1;
  for(let i=0;i<n;i++){
    const k=(i+1)/n,amp=h.mountain?H*(.3-.16*k):H*.035,base=S.hz;
    const f=[1+r()*2,3+r()*3,7+r()*5],p=[r()*TAU,r()*TAU,r()*TAU];
    const col=mix(bot,hill,.2+.7*k),foot=mix(col,bot,E.mist*.8);
    g.beginPath();g.moveTo(0,H);
    for(let x=0;x<=W;x+=4*DPR){
      const u=x/W*TAU,s=.6*Math.sin(u*f[0]+p[0])+.3*Math.sin(u*f[1]+p[1])+.1*Math.sin(u*f[2]+p[2]);
      g.lineTo(x,base-amp*Math.pow(.5+.5*s,1.4));
    }
    g.lineTo(W,H);g.closePath();
    gr=g.createLinearGradient(0,base-amp,0,base);gr.addColorStop(0,col);gr.addColorStop(1,foot);
    g.fillStyle=gr;g.fill();
  }
  // 水
  if(h.water){const wt=h.yellow?mix('#b08a4a',top,night?.6:.2):mix(bot,hill,.25);
    gr=g.createLinearGradient(0,S.hz,0,H);gr.addColorStop(0,wt);gr.addColorStop(1,mix(h.yellow?'#6b4a22':top,'#000000',.35));g.fillStyle=gr;g.fillRect(0,S.hz,W,H-S.hz)}
  if(h.frost){gr=g.createLinearGradient(0,H*.82,0,H);gr.addColorStop(0,'rgba(235,240,245,0)');gr.addColorStop(1,'rgba(235,240,245,.35)');g.fillStyle=gr;g.fillRect(0,H*.82,W,H*.18)}
  S.bld=h.building?pavilion(g,W*.72,S.hz,H*.09,S.ink,h.lamp&&S.dark):null;
  // 宣纸颗粒
  for(let i=0;i<2500;i++){g.fillStyle=`rgba(${r()<.5?'0,0,0':'255,255,255'},.035)`;g.fillRect(r()*W,r()*H,DPR*1.5,DPR*1.5)}
  // 动态元素的初始位置
  const big=v=>v*H;
  S.mists=[...Array(5)].map(()=>({x:r()*W,y:S.hz-H*(.01+r()*.09),w:W*(.3+r()*.3),h:big(.03+r()*.04),v:.5+r()}));
  S.clouds=[...Array(3)].map(()=>({x:r()*W,y:big(.08+r()*.15),w:W*(.12+r()*.15),h:big(.025+r()*.03)}));
  S.rip=[...Array(60)].map(()=>({y:S.hz+(H-S.hz)*Math.pow(r(),1.3),x:r()*W,w:W*(.02+r()*.06),ph:r()*TAU}));
  S.lotus=[...Array(7)].map(()=>({x:W*(.25+r()*.5),y:S.hz+(H-S.hz)*(.65+r()*.3),w:big(.02+r()*.02)}));
  S.lamps=[...Array(3)].map((_,i)=>({x:W*(.3+i*.17+r()*.05),y:S.hz+(H-S.hz)*(.1+r()*.15),ph:r()*TAU}));
  S.birds=[];
  if(h.bird){const yan=/雁/.test(S.text),nb=S.emo.key==='孤寂'?1:yan?7:4,mid=3;
    for(let i=0;i<nb;i++)S.birds.push(yan?{dx:-Math.abs(i-mid)*H*.035,dy:(i-mid)*H*.02,ph:i}:{dx:-r()*W*.15,dy:(r()-.5)*H*.1,ph:r()*TAU})}
  parts=[];
  const add=(type,num)=>{for(let i=0;i<num;i++)parts.push({type,x:r()*W,y:r()*H,s:r(),a:r()*TAU})};
  if(h.snow)add('snow',S.emo.key==='孤寂'?160:240);
  if(h.rain)add('rain',220);
  if(h.flower&&!h.snow)add('petal',45);
  if(h.maple)add('leaf',30);
  S.vig=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.75);
  S.vig.addColorStop(0,'rgba(0,0,0,0)');S.vig.addColorStop(1,'rgba(0,0,0,.35)');
}
function pavilion(g,x,y,s,col,lamp){
  let yy=y,w=s*.4;
  for(let i=0;i<2;i++){
    const bh=s*(i?.45:.7);
    g.fillStyle=col;g.fillRect(x-w,yy-bh,w*2,bh);
    if(lamp){g.fillStyle='rgba(255,190,110,.85)';g.fillRect(x-w*.35,yy-bh*.7,w*.7,bh*.4)}
    yy-=bh;const rw=w*2.1;
    g.fillStyle=col;g.beginPath();g.moveTo(x-rw,yy+s*.02);g.quadraticCurveTo(x-rw*.5,yy-s*.02,x-w*.6,yy-s*.22);
    g.lineTo(x+w*.6,yy-s*.22);g.quadraticCurveTo(x+rw*.5,yy-s*.02,x+rw,yy+s*.02);g.closePath();g.fill();
    yy-=s*.2;w*=.72;
  }
  g.fillRect(x-s*.02,yy-s*.15,s*.04,s*.15);
  return{x,y:yy};
}
// ---------- 近景结构（只在入境时生成一次，每帧按风摆动） ----------
function setupFg(){
  const r=rng(S.seed^0x9e37),h=S.has;
  S.pines=h.pine?[{x:W*.33,y:H,s:H*.55}]:[];
  S.pines.forEach(p=>p.tiers=[...Array(6)].map((_,i)=>({y:.35+i*.11,len:.12+r()*.14-i*.012,dir:i%2?1:-1})));
  S.bamboo=h.bamboo?[...Array(6)].map(()=>({x:W*(.86+r()*.12),h:H*(.45+r()*.3),ph:r()*TAU,lv:[...Array(10)].map(()=>({k:.35+r()*.6,d:r()<.5?-1:1,a:r()}))})):[];
  S.willow=h.willow?[...Array(22)].map(()=>({x:W*(r()*.3),len:H*(.25+r()*.35),ph:r()*TAU})):[];
  S.maple=h.maple?{x:W*.9,y:S.hz+(H-S.hz)*.2,blobs:[...Array(26)].map(()=>({dx:(r()-.5)*H*.32,dy:-r()*H*.28-H*.12,rr:H*(.03+r()*.04),c:['#a8342b','#c4512f','#8d2a26','#d07a3a'][r()*4|0]}))}:null;
  S.boatX=W*(.38+r()*.1);
  S.t0=performance.now();
}
function frame(now){
  raf=requestAnimationFrame(frame);
  if(!S||!cv)return;
  const h=S.has,E=S.E,t=Math.max(0,now-S.t0)/1000*E.speed,wind=h.wind?2.2:1;
  ctx.drawImage(bg,0,0);
  // 流云
  if(h.cloud)S.clouds.forEach(c=>{const x=(c.x+t*W*.006)%(W+c.w*2)-c.w;cloudShape(x,c.y,c.w,c.h)});
  // 天河倾泻：一道水从天顶落到远山后的水面，水流线不断下行
  if(h.cascade){const cx=W*.42,w0=W*.025,w1=W*.11,yb=S.hz;
    const g=ctx.createLinearGradient(0,0,0,yb);g.addColorStop(0,rgba(h.yellow?'#d8b878':'#cfe0ea',0));g.addColorStop(.25,rgba(h.yellow?'#c9a35e':'#dbe8f0',.55));g.addColorStop(1,rgba(h.yellow?'#a9813f':'#b9cbd6',.8));
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(cx-w0,0);ctx.lineTo(cx+w0,0);ctx.quadraticCurveTo(cx+w0*1.5,yb*.6,cx+w1,yb);ctx.lineTo(cx-w1,yb);ctx.quadraticCurveTo(cx-w0*1.5,yb*.6,cx-w0,0);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=1.2*DPR;
    for(let i=0;i<26;i++){const u=((i*.37)%1)*2-1,y=((t*.35+i*.173)%1)*yb,k=y/yb,x=cx+u*(w0+(w1-w0)*k*k)*.9;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+u*2*DPR,y+H*.05);ctx.stroke()}
    const fg=ctx.createRadialGradient(cx,yb,0,cx,yb,w1*2.2);fg.addColorStop(0,'rgba(255,255,255,.5)');fg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=fg;ctx.fillRect(cx-w1*2.2,yb-w1*2.2,w1*4.4,w1*4.4)}
  // 倒影：日月光柱
  if(h.water&&S.orb){const o=S.orb;
    for(let y=S.hz+4;y<H;y+=6*DPR){const k=(y-S.hz)/(H-S.hz),w=o.r*(1.2+k*2)*(.6+.4*Math.sin(y*.05+t*2));
      ctx.fillStyle=rgba(o.c,.35*(1-k*.7));ctx.fillRect(o.x-w/2+Math.sin(y*.02+t)*4,y,w,2*DPR)}}
  // 水纹
  if(h.water){ctx.strokeStyle=S.night?'rgba(200,215,235,.18)':'rgba(255,255,255,.22)';ctx.lineWidth=DPR;
    S.rip.forEach(p=>{const x=(p.x+t*W*.01*wind)%W,a=Math.sin(t*1.5+p.ph);ctx.globalAlpha=.4+.6*Math.abs(a);
      ctx.beginPath();ctx.moveTo(x,p.y);ctx.quadraticCurveTo(x+p.w/2,p.y-1.5*DPR,x+p.w,p.y);ctx.stroke()});ctx.globalAlpha=1}
  // 雾气
  const mc=S.night?'#8090a8':mix(S.bot,'#ffffff',.4);
  S.mists.forEach(m=>{const x=(m.x+t*W*.004*m.v*wind)%(W+m.w)-m.w/2;
    const g=ctx.createRadialGradient(x,m.y,0,x,m.y,m.w/2);g.addColorStop(0,rgba(mc,E.mist*.55));g.addColorStop(1,rgba(mc,0));
    ctx.save();ctx.translate(x,m.y);ctx.scale(1,m.h/(m.w/2));ctx.translate(-x,-m.y);ctx.fillStyle=g;ctx.fillRect(x-m.w/2,m.y-m.w/2,m.w,m.w);ctx.restore()});
  // 荷叶
  if(h.lotus)S.lotus.forEach(l=>{ctx.fillStyle=S.night?'#1d3328':'#3f7350';ctx.beginPath();ctx.ellipse(l.x+Math.sin(t+l.x)*2,l.y,l.w,l.w*.3,0,0,TAU);ctx.fill();
    ctx.fillStyle='#e8a3b0';ctx.beginPath();ctx.ellipse(l.x+l.w*.3,l.y-l.w*.35,l.w*.18,l.w*.28,0,0,TAU);ctx.fill()});
  // 渔火
  if(h.lamp&&h.water)S.lamps.forEach(l=>{const f=.7+.3*Math.sin(t*6+l.ph)*Math.sin(t*2.3+l.ph);
    const g=ctx.createRadialGradient(l.x,l.y,0,l.x,l.y,H*.03);g.addColorStop(0,`rgba(255,190,100,${.9*f})`);g.addColorStop(1,'rgba(255,150,60,0)');
    ctx.fillStyle=g;ctx.fillRect(l.x-H*.03,l.y-H*.03,H*.06,H*.06);
    ctx.fillStyle=`rgba(255,180,90,${.35*f})`;for(let i=1;i<6;i++)ctx.fillRect(l.x-3*DPR+Math.sin(t*3+i)*2,l.y+i*5*DPR,6*DPR,1.5*DPR)});
  // 钟声：从楼阁扩散的圆环
  if(h.bell){const src=S.bld||{x:W*.7,y:S.hz-H*.1},per=4;
    for(let i=0;i<3;i++){const k=((t+i*per/3)%per)/per;ctx.strokeStyle=S.dark?`rgba(240,220,180,${.5*(1-k)})`:`rgba(60,50,40,${.4*(1-k)})`;
      ctx.lineWidth=1.5*DPR;ctx.beginPath();ctx.arc(src.x,src.y,k*H*.45,0,TAU);ctx.stroke()}}
  // 小舟与渔人
  if(h.boat){const bx=S.boatX+Math.sin(t*.15)*W*.03,by=S.hz+(H-S.hz)*.38+Math.sin(t*1.2)*2*DPR;boat(bx,by,H*.05,h.fisher,t);
    ctx.save();ctx.globalAlpha=.25;ctx.translate(0,by*2+H*.006);ctx.scale(1,-1);boat(bx,by,H*.05,h.fisher,t);ctx.restore()}
  // 飞鸟
  if(S.birds.length){const span=W*1.3,x0=W*1.1-((t*W*.025)%span),y0=H*.25;
    ctx.strokeStyle=S.ink;ctx.lineWidth=1.6*DPR;
    S.birds.forEach(b=>{const x=x0-b.dx,y=y0+b.dy,f=Math.sin(t*8+b.ph)*.6,s=H*.012;
      ctx.beginPath();ctx.moveTo(x-s,y-s*f);ctx.quadraticCurveTo(x-s*.4,y-s*.2,x,y);ctx.quadraticCurveTo(x+s*.4,y-s*.2,x+s,y-s*f);ctx.stroke()})}
  // 近景草木
  const sway=k=>Math.sin(t*1.3*wind+k)*.02*wind;
  S.pines.forEach(p=>pine(p,sway(0)));
  if(S.maple){const m=S.maple;ctx.strokeStyle=S.ink;ctx.lineWidth=H*.012;ctx.beginPath();ctx.moveTo(m.x,H);ctx.quadraticCurveTo(m.x-H*.02,m.y,m.x,m.y-H*.15);ctx.stroke();
    m.blobs.forEach((b,i)=>{ctx.fillStyle=S.night?mix(b.c,'#000000',.55):b.c;ctx.globalAlpha=.85;ctx.beginPath();ctx.arc(m.x+b.dx+sway(i)*H,m.y+b.dy,b.rr,0,TAU);ctx.fill()});ctx.globalAlpha=1}
  S.bamboo.forEach(b=>{const bend=sway(b.ph)*b.h*1.5;ctx.strokeStyle=S.night?'#16241c':'#3d6146';ctx.lineWidth=H*.007;
    ctx.beginPath();ctx.moveTo(b.x,H);ctx.quadraticCurveTo(b.x,H-b.h*.5,b.x+bend,H-b.h);ctx.stroke();
    ctx.fillStyle=ctx.strokeStyle;b.lv.forEach(l=>{const y=H-b.h*l.k,x=b.x+bend*l.k*l.k;ctx.save();ctx.translate(x,y);ctx.rotate(l.d*(.5+l.a*.5)+sway(l.a*9)*3);
      ctx.beginPath();ctx.ellipse(l.d*H*.025,0,H*.028,H*.005,0,0,TAU);ctx.fill();ctx.restore()})});
  S.willow.forEach(w=>{ctx.strokeStyle=S.night?'rgba(30,45,30,.8)':'rgba(90,130,70,.8)';ctx.lineWidth=1.2*DPR;
    const sw=sway(w.ph)*w.len*2;ctx.beginPath();ctx.moveTo(w.x,0);ctx.quadraticCurveTo(w.x+sw*.3,w.len*.5,w.x+sw,w.len);ctx.stroke()});
  // 飘落物
  parts.forEach(p=>{
    if(p.type==='snow'){p.y+=(.4+p.s*.8)*DPR*E.speed*1.5;p.x+=Math.sin(t+p.a)*.3*DPR*wind;
      ctx.fillStyle=`rgba(255,255,255,${.5+p.s*.5})`;ctx.beginPath();ctx.arc(p.x,p.y,(1+p.s*1.8)*DPR,0,TAU);ctx.fill()}
    else if(p.type==='rain'){p.y+=(9+p.s*6)*DPR;p.x-=2.5*DPR*wind;ctx.strokeStyle=`rgba(210,220,235,${.25+p.s*.3})`;ctx.lineWidth=DPR;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+3*DPR*wind,p.y-(12+p.s*8)*DPR);ctx.stroke()}
    else{p.y+=(.5+p.s*.6)*DPR*E.speed*1.3;p.x+=(Math.sin(t*.8+p.a)*.6-.3*wind)*DPR;p.a+=.02;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=p.type==='petal'?'rgba(240,185,195,.85)':'rgba(190,70,40,.85)';
      ctx.beginPath();ctx.ellipse(0,0,(p.type==='petal'?4:6)*DPR,(p.type==='petal'?2.4:3.2)*DPR,0,0,TAU);ctx.fill();ctx.restore()}
    if(p.y>H+10){p.y=-10;p.x=Math.random()*W*1.2}if(p.x<-20)p.x=W+10;if(p.x>W+20)p.x=-10;
  });
  // 金樽：放在近景右下，有月时杯中映月
  if(h.wine)cup(W*.8,H*.93,H*.11,t);
  // 窗框
  if(h.window&&S.night){const b=Math.min(W,H)*.05;ctx.fillStyle='#120d0a';ctx.fillRect(0,0,W,b);ctx.fillRect(0,H-b,W,b);ctx.fillRect(0,0,b,H);ctx.fillRect(W-b,0,b,H);
    ctx.fillRect(W*.5-b*.2,0,b*.4,H);ctx.strokeStyle='#120d0a';ctx.lineWidth=b*.12;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,b+i*b*.6);ctx.lineTo(W,b+i*b*.6);ctx.stroke()}}
  ctx.fillStyle=S.vig;ctx.fillRect(0,0,W,H);
}
function cloudShape(x,y,w,h){ctx.fillStyle=S.night?'rgba(90,100,125,.35)':'rgba(255,255,255,.55)';
  for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(x+(i-2)*w*.18,y+Math.sin(i*2)*h*.2,w*.22,h*(.6+.3*Math.sin(i)),0,0,TAU);ctx.fill()}}
function boat(x,y,s,fisher,t){ctx.fillStyle=S.ink;ctx.strokeStyle=S.ink;
  ctx.beginPath();ctx.moveTo(x-s*1.6,y-s*.35);ctx.quadraticCurveTo(x,y+s*.3,x+s*1.6,y-s*.4);ctx.quadraticCurveTo(x,y-s*.05,x-s*1.6,y-s*.35);ctx.fill();
  if(!fisher)return;
  ctx.beginPath();ctx.moveTo(x-s*.25,y-s*.15);ctx.lineTo(x+s*.25,y-s*.15);ctx.lineTo(x+s*.05,y-s*.7);ctx.lineTo(x-s*.1,y-s*.7);ctx.fill();
  ctx.beginPath();ctx.moveTo(x-s*.45,y-s*.68);ctx.lineTo(x+s*.4,y-s*.68);ctx.lineTo(x-s*.03,y-s*1.0);ctx.closePath();ctx.fill();
  ctx.lineWidth=1.2*DPR;ctx.beginPath();ctx.moveTo(x+s*.15,y-s*.5);ctx.lineTo(x+s*1.9,y-s*1.4);ctx.stroke();
  ctx.lineWidth=.7*DPR;ctx.beginPath();ctx.moveTo(x+s*1.9,y-s*1.4);ctx.quadraticCurveTo(x+s*2.0+Math.sin(t)*s*.05,y-s*.6,x+s*1.95,y+s*.1);ctx.stroke()}
function cup(x,y,s,t){
  const gold=S.night?'#8a6a2e':'#c99a3a',hi=S.night?'#c9a45a':'#f3d88a',rw=s*.42;
  ctx.fillStyle=gold;ctx.beginPath();ctx.ellipse(x,y,s*.3,s*.06,0,0,TAU);ctx.fill();
  ctx.fillRect(x-s*.04,y-s*.35,s*.08,s*.35);
  ctx.beginPath();ctx.moveTo(x-rw,y-s*.85);ctx.quadraticCurveTo(x-rw*.9,y-s*.38,x,y-s*.35);ctx.quadraticCurveTo(x+rw*.9,y-s*.38,x+rw,y-s*.85);ctx.closePath();ctx.fill();
  ctx.fillStyle=hi;ctx.globalAlpha=.5;ctx.fillRect(x-rw*.65,y-s*.8,s*.04,s*.3);ctx.globalAlpha=1;
  ctx.fillStyle=S.night?'#3a1a14':'#6e2a1c';ctx.beginPath();ctx.ellipse(x,y-s*.85,rw,s*.08,0,0,TAU);ctx.fill();
  if(S.has.moon){ctx.fillStyle='rgba(250,240,210,.9)';ctx.beginPath();ctx.ellipse(x+rw*.25+Math.sin(t*1.5)*2,y-s*.85,s*.06,s*.025,0,0,TAU);ctx.fill()}
  ctx.strokeStyle=hi;ctx.lineWidth=1.5*DPR;ctx.beginPath();ctx.ellipse(x,y-s*.85,rw,s*.08,0,0,TAU);ctx.stroke()}
function pine(p,sw){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(sw*.3);ctx.fillStyle=S.ink;ctx.strokeStyle=S.ink;
  ctx.lineWidth=p.s*.04;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(p.s*.08,-p.s*.5,-p.s*.02,-p.s);ctx.stroke();
  p.tiers.forEach((tr,i)=>{const y=-p.s*tr.y-p.s*.15,x=p.s*.03*Math.sin(i),L=p.s*tr.len*2,d=tr.dir;
    ctx.lineWidth=p.s*.012;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+d*L*.8,y-p.s*.02);ctx.stroke();
    ctx.beginPath();ctx.ellipse(x+d*L*.55,y-p.s*.03,L*.55,p.s*.035,d*-.08+sw*2,0,TAU);ctx.fill()});
  ctx.restore()}


// ---------- 对外接口 ----------
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = cv.width = cv.clientWidth * DPR; H = cv.height = cv.clientHeight * DPR; if (S) { build(); setupFg(); } }
// 挂到一个 canvas 上开始逐帧绘制，返回停止函数
export function mount(canvas) {
  cv = canvas; ctx = cv.getContext('2d');
  const ro = new ResizeObserver(resize); ro.observe(cv); resize();
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); cv = null; S = null; };
}
// 换一首诗或判断变了：重画背景并重置动画
export function paint(state, { rebuild = true } = {}) { S = state; if (cv && rebuild) { build(); setupFg(); } }
// 画面的明暗，给诗句选墨色用
export const isDark = (state) => state.time.key === '夜' || state.time.key === '暮';
