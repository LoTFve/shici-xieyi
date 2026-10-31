// 汇总 data/extract/<集名>/ 的逐首抽取结果，生成物象层和意象层的草稿：
//   ontology/images.json  概念数据
//   ontology/review.md    审阅报告，列出需要人工确认的地方
// 用法：node tools/build-onto.cjs        汇总 data/extract 下所有已抽取的集子
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const OLD = require('../ontology/base.json'); // 手写的基础本体：现有 27 种画法，作为可画的基础概念
// 各集按 data/extract 下的目录读取，诗的编号是“集名:id”
const COLLECTIONS = fs.readdirSync(path.join(root, 'data/extract')).filter((n) => fs.existsSync(path.join(root, 'data', `${n}.json`)));
const poems = COLLECTIONS.flatMap((col) => require(`../data/${col}.json`)
  .filter((p) => fs.existsSync(path.join(root, 'data/extract', col, `${p.id}.json`)))
  .map((p) => ({ ...p, col, key: `${col}:${p.id}` })));
const SHORT = { tang300: '唐', 宋词三百首: '宋词', 千家诗: '千家', 诗经: '诗经', 楚辞: '楚辞' };
const MIN_POEMS = 3;

const CATS = ['天象', '气象', '山石', '水域', '植物', '动物', '建筑', '器物', '人物', '地理'];
const EMOTIONS = ['哀愁', '凄清', '悲凉', '思乡', '怀人', '孤寂', '闲适', '清幽', '壮阔', '悲壮', '豪放', '欢欣'];
const EMO_FIX = { 凄凉: '凄清', 苍凉: '悲凉' };

// 同义合并：抽取给出的规范名 → 本体里的名字
const SYN = {
  船: '舟', 樽: '杯', 觞: '杯', 落日: '夕阳', 斜阳: '夕阳', 残阳: '夕阳', 荷: '莲', 荷花: '莲', 灯: '灯火',
  宫门: '宫', 宫殿: '宫', 殿: '宫', 昭阳殿: '宫', 营垒: '营', 城郭: '城', 台阶: '阶', 祠庙: '庙', 长江: '江',
  流水: '水', 落叶: '叶', 关塞: '关', 鬓发: '鬓', 红颜: '美人', 玉人: '美人', 春风: '风', 秋风: '风', 东风: '风',
  风尘: '尘', 烟尘: '尘', 砧声: '砧', 子规: '杜鹃', 杜宇: '杜鹃', 鸿雁: '雁', 鸿: '雁', 白头: '白发', 猿猱: '猿',
  渔父: '渔人', 渔翁: '渔人',
};
// 两个物象连写的，拆开分别计数
const SPLIT = { 风雨: ['风', '雨'], 日月: ['日', '月'], 江海: ['江', '海'], 江湖: ['江', '湖'], 渔樵: ['渔人', '樵夫'], 草木: ['草', '树'], 桃李: ['桃'], 霜露: ['霜', '露'] };
// 不是物象，归到其他层
const NOT_IMAGE = { 夜: '景·时辰', 秋夜: '景·时辰', 暮: '景·时辰', 日暮: '景·时辰', 黄昏: '景·时辰', 春: '景·季节', 秋: '景·季节', 梦: '言·虚写标记', 天地: '太泛', 人: '太泛' };
// 抽取时归到“其他”“声音”的，指定类别
const CAT_FIX = { 泪: '人物', 白发: '人物', 歌: '人物', 路: '地理', 径: '地理', 火: '器物', 白骨: '人物', 钟: '器物', 角: '器物', 鼓: '器物', 砧: '器物' };
// 基础概念（现有画法）的类别
const BASE_CAT = {
  moon: '天象', sun: '天象', star: '天象', cloud: '天象', mountain: '山石', water: '水域', yellow: '水域', cascade: '水域',
  boat: '器物', bell: '器物', lamp: '器物', wine: '器物', fisher: '人物', snow: '气象', rain: '气象', frost: '气象',
  wind: '气象', mist: '气象', flower: '植物', willow: '植物', pine: '植物', bamboo: '植物', maple: '植物', lotus: '植物',
  bird: '动物', building: '建筑', window: '建筑',
};
const PART = { 帆: '舟', 叶: '树', 枝: '树' };
// 人工指定的写法归属，优先于一切自动规则
const OWN = { 渔火: '灯火', 玉盘: '月', 红叶: '枫', 黄叶: '枫', 客船: '舟', 钓鱼船: '舟', 东船: '舟', 寒灯: '灯火', 读书灯: '灯火', 金樽: '杯' };
// 人工指定的上位类，覆盖抽取统计（统计结果明显不对的）
const IS_A = { 叶: '树', 枝: '树', 树: null, 关: null, 石: null, 鼓: null, 屏风: null, 荆门: null, 桂: null, 轮台: null, 幽人: null };
// 约定俗成的含义，手写
const SYMBOL = {
  柳: ['惜别', '送别'], 雁: ['书信', '思归'], 杜鹃: ['思归', '悲啼'], 月: ['思乡', '团圆'], 酒: ['送别', '消愁'], 猿: ['悲啼'],
  梅: ['高洁', '报春'], 松: ['坚贞'], 竹: ['气节'], 菊: ['隐逸'], 莲: ['清洁'], 梧桐: ['凄凉', '孤寂'], 青鸟: ['信使'],
  鹤: ['隐逸', '仙道'], 蝉: ['高洁'], 鸥: ['忘机', '闲适'], 云: ['游子', '漂泊'], 草: ['离恨', '生机'], 砧: ['思妇怀远'],
  笛: ['思乡'], 烽火: ['战事'], 关: ['边塞', '离别'], 长安: ['朝廷', '功名'], 剑: ['抱负'], 镜: ['年华'], 白发: ['衰老', '愁苦'],
  烛: ['相思', '长夜'], 灯火: ['孤寂', '羁旅'], 舟: ['漂泊', '隐逸'], 帆: ['远行'], 渔人: ['隐逸'], 鸦: ['荒凉', '迟暮'],
  莺: ['春光'], 燕: ['时节', '归来'], 桃: ['美人', '春光'], 夕阳: ['迟暮'], 钟: ['禅意'], 寺: ['禅意'], 柴门: ['隐居'],
  茅屋: ['隐居', '贫寒'], 琵琶: ['胡地哀怨'], 美人: ['君王', '理想'], 马: ['征战', '远行'], 渡口: ['送别'], 天涯: ['漂泊'],
  叶: ['衰落'], 露: ['短暂'], 霜: ['寒苦'], 鼓: ['征战'], 角: ['边塞'],
};

const BASE = Object.fromEntries(Object.entries(OLD.images).map(([id, o]) => [o.name, id]));
const count = (arr) => arr.reduce((c, k) => ((c[k] = (c[k] || 0) + 1), c), {});
const top = (c) => Object.entries(c).sort((a, b) => b[1] - a[1]);
const share = (c, n, min = 0.3) => Object.fromEntries(top(c).filter(([k, v]) => k !== '无' && v >= 2 && v / n >= min).map(([k, v]) => [k, +(v / n).toFixed(2)]));

// 1. 读入所有提及，做排除、拆分、同义合并
const mentions = [], excluded = {};
for (const p of poems) {
  const j = JSON.parse(fs.readFileSync(path.join(root, 'data/extract', p.col, `${p.id}.json`), 'utf8'));
  for (const m of j.images) {
    if (!m.word || !(p.title + p.body).includes(m.word)) continue;
    const raw = (m.name || m.word).trim();
    if (NOT_IMAGE[raw]) { (excluded[raw] = excluded[raw] || { why: NOT_IMAGE[raw], n: 0 }).n++; continue; }
    for (const n of SPLIT[raw] || [raw]) mentions.push({ ...m, name: SYN[n] || n, pid: p.key, col: p.col, title: `${SHORT[p.col] || p.col}${p.id}《${p.title}》`, emotion: EMO_FIX[m.emotion] || m.emotion });
  }
}

// 2. 定概念集合：出现在 MIN_POEMS 首以上的，加上全部基础概念；其余按后缀并入已有概念，并不进去的列为少见
const poemsOf = {};
for (const m of mentions) (poemsOf[m.name] = poemsOf[m.name] || new Set()).add(m.pid);
const isConcept = new Set([...Object.keys(BASE), ...Object.keys(poemsOf).filter((n) => poemsOf[n].size >= MIN_POEMS)]);
const aliasOf = {};
for (const n of Object.keys(poemsOf)) {
  if (isConcept.has(n)) continue;
  const host = [...isConcept].filter((c) => n.endsWith(c) && n.length - c.length <= 2).sort((a, b) => b.length - a.length)[0];
  if (host) aliasOf[n] = host;
}
const final = (n) => aliasOf[n] || n;
const groups = {};
for (const m of mentions) (groups[final(m.name)] = groups[final(m.name)] || []).push(m);

// 3. 逐个概念汇总
const concepts = {}, rare = [], flags = { 低一致: [], 画不出: [], 常非实写: [], 单字触发: [] };
function summarize(name, ms) {
  const n = ms.length, pset = new Set(ms.map((m) => m.pid));
  const cats = count(ms.map((m) => m.category).filter((c) => c && c !== '其他' && c !== '声音').map((c) => (c === '地名' ? '地理' : c)));
  let cat = BASE[name] ? BASE_CAT[BASE[name]] : CAT_FIX[name] || (top(cats)[0] || [])[0] || '器物';
  const parents = top(count(ms.map((m) => m.parent).filter((p) => p && p !== 'none' && OLD.images[p])));
  let draw = BASE[name] || null, is_a = null, agree = null;
  if (!draw && parents.length) {
    agree = parents[0][1] / n;
    if (agree >= 0.3) { draw = parents[0][0]; is_a = OLD.images[draw].name; }
  }
  const heard = ms.filter((m) => m.category === '声音' || /声|音|鸣|啼/.test(m.word)).length;
  const usage = count(ms.map((m) => m.reason).filter((r) => r && r !== '字面'));
  const literal = ms.filter((m) => m.reason === '字面').length / n;
  const words = [...new Set([name, ...ms.map((m) => m.word)])].sort((a, b) => a.length - b.length);
  const c = {
    cat, n: pset.size,
    ...(is_a && { is_a }), ...(PART[name] && { part_of: PART[name] }), ...(BASE[name] && { draw: BASE[name] }),
    ...(heard / n >= 0.5 && { sense: '听' }),
    words,
    season: share(count(ms.map((m) => m.season)), n),
    time: share(count(ms.map((m) => m.time)), n),
    evokes: { 默认: share(count(ms.map((m) => m.emotion).filter((e) => EMOTIONS.includes(e))), n, 0.2) },
    ...(SYMBOL[name] && { symbol: SYMBOL[name] }),
    ...(literal < 0.95 && { usage: Object.fromEntries(top(usage).filter(([, v]) => v >= 2)) }),
    by: Object.fromEntries(top(count([...new Map(ms.map((m) => [m.pid, SHORT[m.col] || m.col])).values()]))),
    examples: [...new Map(ms.map((m) => [m.pid, `${m.title}${m.word}`])).values()].slice(0, 3),
  };
  for (const k of ['season', 'time', 'usage']) if (c[k] && !Object.keys(c[k]).length) delete c[k];
  if (!Object.keys(c.evokes.默认).length) delete c.evokes;
  return { c, agree, literal, draw };
}
for (const [name, ms] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
  const { c, agree, literal, draw } = summarize(name, ms);
  if (!isConcept.has(name)) { rare.push({ name, cat: c.cat, n: c.n, ...(draw && { is_a: OLD.images[draw].name }), words: c.words }); continue; }
  concepts[name] = c;
  if (agree !== null && agree < 0.5) flags.低一致.push(`${name}（${(agree * 100).toFixed(0)}% 判为${c.is_a || '无'}）`);
  if (!c.is_a && !c.draw && c.n >= 5) flags.画不出.push(`${name}(${c.n})`);
  if (literal < 0.6) flags.常非实写.push(`${name}（实写 ${(literal * 100).toFixed(0)}%：${Object.entries(c.usage || {}).map(([k, v]) => k + v).join(' ')}）`);
}
// 基础概念在数据里没出现的，也要有一条
for (const [name, id] of Object.entries(BASE)) if (!concepts[name]) concepts[name] = { cat: BASE_CAT[id], n: 0, draw: id, words: [name, ...OLD.images[id].words] };
// 基础概念原有的依赖、冲突、蕴含关系照搬
for (const [name, id] of Object.entries(BASE)) {
  const o = OLD.images[id], c = concepts[name];
  if (o.needs) c.needs = o.needs.map((x) => OLD.images[x].name);
  if (o.conflicts) c.conflicts = o.conflicts;
  if (o.implies) c.implies = o.implies;
}
// 含两个以上概念名的写法：
//   合并表里有的，按合并表（宫门→宫）
//   一个是另一个的下位，归下位（桃花→桃，菊花→菊）
//   恰好由两个同类概念并列而成的，是并列连写（风雨、山川），不作触发词
//   其余按汉语偏正结构，归末尾那个（宫花→花，山月→月，黄鹤楼→楼）
function compound(w, names) {
  if (SYN[w] && concepts[SYN[w]]) return SYN[w];
  const hypo = names.filter((n) => names.some((o) => o !== n && concepts[n].is_a === o));
  if (hypo.length === 1) return hypo[0];
  if (names.length === 2 && (w === names[0] + names[1] || w === names[1] + names[0]) && concepts[names[0]].cat === concepts[names[1]].cat) return null;
  return names.filter((n) => w.endsWith(n)).sort((a, b) => b.length - a.length)[0] || null;
}
// 每个写法只归一个概念：只含一个概念名的归它；含两个以上概念名的是连写（如“云山”），不作触发词；
// 不含任何概念名的（如“羲娥”）归提及最多的概念。月份里的“月”不是月亮
const MONTH = /^[一二三四五六七八九十正腊]+月$/;
// 单独的颜色字和叠词形容词不是物象，作触发词会误中
const STOP = new Set(['青', '黄', '白', '红', '绿', '碧', '苍苍', '萋萋', '芳心', '红艳', '飞沈']);
const votes = {};
for (const [name, ms] of Object.entries(groups)) if (concepts[name]) for (const m of ms) ((votes[m.word] = votes[m.word] || {})[name] = (votes[m.word][name] || 0) + 1);
const owner = {}, clash = [];
for (const [w, v] of Object.entries(votes)) {
  if (MONTH.test(w) || STOP.has(w)) continue;
  if (OWN[w]) { owner[w] = OWN[w]; continue; }
  if (SYN[w] && concepts[SYN[w]]) { owner[w] = SYN[w]; continue; }
  const inside = Object.keys(concepts).filter((n) => w.includes(n));
  const longest = inside.filter((n) => !inside.some((o) => o !== n && o.includes(n)));
  if (longest.length === 1) owner[w] = longest[0];
  else if (longest.length > 1) {
    const pick = compound(w, longest);
    if (pick) owner[w] = pick; else clash.push(`${w}（${longest.join('、')}）`);
  }
  else owner[w] = top(v)[0][0];
}
// 旧画法的触发词也参与归属：没被抽取数据认领的，留在旧画法；“渔火”“玉盘”这种并非下位的，按偏正结构判
for (const [name, id] of Object.entries(BASE)) for (const w of OLD.images[id].words) if (!owner[w] && w !== name) {
  const inside = Object.keys(concepts).filter((n) => n !== name && w.includes(n) && w.endsWith(n));
  owner[w] = OWN[w] || (inside.length ? inside.sort((a, b) => b.length - a.length)[0] : name);
}
// 人工指定的上位类
for (const [name, p] of Object.entries(IS_A)) if (concepts[name]) { if (p) concepts[name].is_a = p; else delete concepts[name].is_a; }
// 旧画法的触发词里，现在自己成了概念的（楼阁里的楼、城、寺），从旧画法里去掉，改成那个概念 is_a 旧画法
for (const [name, id] of Object.entries(BASE)) for (const w of OLD.images[id].words) {
  if (w === name || !concepts[w] || BASE[w]) continue;
  if (!concepts[w].is_a && !concepts[w].draw) concepts[w].is_a = name;
}
// 旧触发词如果已经按规则归给了别的概念（斜阳归夕阳、樽归杯、红叶归枫），就让给它
const baseWords = (name) => [name, ...OLD.images[BASE[name]].words.filter((w) => w === name || (!concepts[w] && (!owner[w] || owner[w] === name)))];
for (const [name, c] of Object.entries(concepts)) {
  const base = BASE[name] ? baseWords(name) : [name];
  c.words = [...new Set([...base, ...Object.keys(owner).filter((w) => owner[w] === name)])].sort((a, b) => a.length - b.length);
}
const missingSymbol = Object.keys(SYMBOL).filter((k) => !concepts[k]);
for (const [name, c] of Object.entries(concepts)) for (const w of c.words) if (w.length === 1 && c.n >= 3) flags.单字触发.push(w);
flags.低一致 = flags.低一致.filter((f) => !(f.split('（')[0] in IS_A));
// 沿 is_a 找能画的祖先
const drawOf = (n, seen = new Set()) => (!n || seen.has(n) ? null : concepts[n]?.draw || (seen.add(n), drawOf(concepts[n]?.is_a, seen)));
for (const c of Object.values(concepts)) { const d = drawOf(c.is_a); if (!c.draw && d) c.draws_as = d; }
const drawable = Object.values(concepts).filter((c) => c.draw || c.draws_as);

// 修饰字：原文写法比概念名多出来的前缀单字（供第 2 步写言层）
const mods = {};
for (const [name, ms] of Object.entries(groups)) for (const m of ms) {
  const w = m.word, i = w.lastIndexOf(final(name) === name ? name : final(name));
  if (i === 1) (mods[w[0]] = mods[w[0]] || new Set()).add(final(name));
}

fs.mkdirSync(path.join(root, 'ontology'), { recursive: true });
const NAME = { tang300: '唐诗三百首' };
const perCol = Object.fromEntries(COLLECTIONS.map((c) => [NAME[c] || c, poems.filter((p) => p.col === c).length]));
const meta = { source: `${Object.entries(perCol).map(([c, n]) => `${c} ${n} 首`).join('、')}，DeepSeek 逐首抽取后汇总`, collections: perCol, generated_by: 'tools/build-onto.cjs', min_poems: MIN_POEMS, mentions: mentions.length };
fs.writeFileSync(path.join(root, 'ontology/images.json'), JSON.stringify({ _meta: meta, concepts, rare, excluded }, null, 1));

// 共现：两个概念在同一首诗里都出现的首数。只留 4 首以上、且关联度（PMI）为正的，供网络图画“常一起出现”的边
const inPoem = {};
for (const [name, ms] of Object.entries(groups)) if (concepts[name]) for (const m of ms) (inPoem[m.pid] = inPoem[m.pid] || new Set()).add(name);
const pair = {};
for (const set of Object.values(inPoem)) {
  const a = [...set].sort();
  for (let i = 0; i < a.length; i++) for (let k = i + 1; k < a.length; k++) { const key = a[i] + '|' + a[k]; pair[key] = (pair[key] || 0) + 1; }
}
const N = poems.length;
const cooc = Object.entries(pair).filter(([, v]) => v >= 4).map(([key, v]) => {
  const [a, b] = key.split('|');
  return [a, b, v, +Math.log2((v * N) / (concepts[a].n * concepts[b].n)).toFixed(2)];
}).filter((e) => e[3] > 0.5).sort((x, y) => y[2] - x[2]);
// 触发词精度：一个写法在多少首诗的原文里出现，其中多少首模型确实抽出了它（或包含它的写法）。
// 精度低的单字（心、君、将、子）在诗里多半不是物象，作画时不用来匹配，只在本体页当别名显示
// 抽出的写法必须归这个概念才算命中：“山阿”里有“阿”，但“阿”不该因此算作山的触发词
const extracted = poems.map((p) => JSON.parse(fs.readFileSync(path.join(root, 'data/extract', p.col, `${p.id}.json`), 'utf8')).images.map((m) => m.word));
const ownerOf = {};
for (const [n, c] of Object.entries(concepts)) for (const w of c.words) ownerOf[w] = n;
// 基础意象的名字本身（月、山、舟）总是保留；它们的其他触发词也要过精度检查，比如“流”多半是动词
const baseName = new Set(Object.values(OLD.images).map((o) => o.name));
const MIN_PRECISION = 0.6, MIN_HITS = 3;
// 统计样本太少、但确实是物象的写法，人工保留
const KEEP_TRIGGER = new Set(['天上来', '樽', '觞', '金樽', '渔火']);
// 一词多义、统计分不开的写法：这里的“角”是角落、发髻，不是号角
const DROP_TRIGGER = new Set(['海角', '日角', '羊角', '总角', '篱角', '阑角', '栏角', '屋角', '宅']);
// 名字本身多半不是物象的概念，名字不作触发词，只靠更具体的写法匹配
const NOT_SELF = new Set(['心', '君', '将', '子', '王', '道', '家', '朝', '光', '发', '地', '气', '影', '曲', '神', '使', '带', '周', '士', '萧', '须', '灵', '实', '父', '母', '被', '着', '虚', '郁', '阴', '声', '寒', '香', '空', '歌', '路', '客', '书', '手', '眼', '舞', '诗', '室', '音', '景', '翼', '夏', '南', '东', '西', '北', '中', '阳', '金', '玉']);
const trig = {};
for (const [name, c] of Object.entries(concepts)) {
  const keep = [], drop = [];
  for (const w of c.words) {
    let hit = 0, ok = 0;
    poems.forEach((p, i) => {
      if (!(p.title + p.body).includes(w)) return;
      hit++;
      if (extracted[i].some((g) => (g.includes(w) || w.includes(g)) && ownerOf[g] === name)) ok++;
    });
    const prec = hit ? ok / hit : 1;
    // 概念自己的名字总是触发它（江、湖、桃）；单字名太泛的除外，见 NOT_SELF
    const self = w === name && !NOT_SELF.has(w);
    // 手写基础本体里的触发词（翁、钓、岳）放宽到 30%：人工挑过，又有否定、比喻规则兜底
    const hand = (BASE[name] && OLD.images[BASE[name]].words.includes(w) && prec >= 0.3) || KEEP_TRIGGER.has(w);
    if (!DROP_TRIGGER.has(w) && (self || hand || baseName.has(w) || (prec >= MIN_PRECISION && (w.length > 1 || hit >= MIN_HITS)))) keep.push(w); else drop.push([w, hit, +prec.toFixed(2)]);
  }
  c.triggers = keep;
  if (drop.length) trig[name] = drop;
}
// 前端本体页读的：概念加共现边
fs.writeFileSync(path.join(root, 'ontology/graph.json'), JSON.stringify({ meta, concepts, cooc }));
// 作画页读的：只留规则和推断要用的字段，体积小
const runtime = {};
for (const [name, c] of Object.entries(concepts)) {
  if (!c.triggers.length) continue;
  runtime[name] = {
    cat: c.cat, n: c.n, w: c.triggers,
    ...((c.draw || c.draws_as) && { d: c.draw || c.draws_as }),
    ...(c.is_a && { is_a: c.is_a }), ...(c.needs && { needs: c.needs }), ...(c.conflicts && { conflicts: c.conflicts }),
    ...(c.season && { season: c.season }), ...(c.time && { time: c.time }), ...(c.evokes && { evokes: c.evokes.默认 }),
    ...(c.usage && { lit: +(1 - Object.values(c.usage).reduce((a, b) => a + b, 0) / Math.max(1, c.n)).toFixed(2) }),
  };
}
fs.writeFileSync(path.join(root, 'ontology/runtime.json'), JSON.stringify(runtime));

// 审阅报告
const fmt = (o) => Object.entries(o || {}).map(([k, v]) => `${k}${v}`).join(' ');
let md = `# 物象层与意象层草稿审阅\n\n由 \`tools/build-onto.cjs\` 生成，不要手改，改脚本里的合并表后重新生成。\n\n`;
md += `- 来源：${meta.source}\n`;
md += `- 能画的概念 ${drawable.length} 个（自身有画法，或沿上位类找到画法），按诗数合计 ${drawable.reduce((t, c) => t + c.n, 0)} 首次；画不出的 ${Object.keys(concepts).length - drawable.length} 个仍参与时辰、季节、情感推断\n`;
md += `- 提及 ${mentions.length} 条，概念 ${Object.keys(concepts).length} 个（出现在 ${MIN_POEMS} 首以上，加上 27 个现有画法），少见物象 ${rare.length} 个，并入已有概念的写法 ${Object.keys(aliasOf).length} 个\n`;
md += `- 寄托只统计了旧的 7 种情感，凄清、怀人、清幽、悲凉、悲壮这 5 种要等第二轮抽取；也还没有按题材区分，只有“默认”\n- 象征是手写的，共 ${Object.keys(SYMBOL).length - missingSymbol.length} 条\n\n`;
md += `## 需要确认\n\n`;
md += `- **画法归属一致率低于 50%**（抽取时各首判断不一，归属可能不对）：${flags.低一致.join('、') || '无'}\n`;
md += `- **高频但画不出**（出现 5 首以上、没有可画的上位类，以后补画法的候选）：${flags.画不出.join('、') || '无'}\n`;
md += `- **常作非实写**（实写不到 60%，规则匹配到时容易误画）：${flags.常非实写.join('、') || '无'}\n`;
md += `- **单字触发词**（规则匹配时容易误中，接入页面前要决定是否保留）：${[...new Set(flags.单字触发)].join(' ')}\n`;
md += `- **连写词，不作触发词**（含两个以上概念）：${clash.join('、') || '无'}\n`;
if (missingSymbol.length) md += `- **象征表里没对上概念的**：${missingSymbol.join('、')}\n`;
md += `- **排除出物象层的**：${Object.entries(excluded).map(([k, v]) => `${k}(${v.n}，${v.why})`).join('、')}\n\n`;
// 各集特有的高频物象：在这一集出现的首数占比，明显高于其他集合计
md += `## 各集特色物象\n\n占比是“出现的首数 / 这一集的首数”，列出在这一集占比超过其他集 1.8 倍的。\n\n`;
for (const col of COLLECTIONS) {
  const n = perCol[NAME[col] || col], short = SHORT[col] || col, restN = poems.length - n;
  const rows = Object.entries(concepts).map(([name, c]) => {
    const here = (c.by || {})[short] || 0;
    return [name, here, here / n, ((c.n || 0) - here) / Math.max(restN, 1)];
  }).filter(([, h, a, b]) => h >= 3 && a > b * 1.8).sort((x, y) => y[2] - x[2]).slice(0, 25);
  md += `- **${NAME[col] || col}**（${n} 首）：${rows.map(([nm, h]) => `${nm}${h}`).join(' ') || '无'}\n`;
}
// 作画时不用的触发词
const droppedList = Object.entries(trig).flatMap(([n, ws]) => ws.map(([w, h, p]) => [w, n, h, p])).filter((x) => x[2] >= 3).sort((a, b) => b[2] - a[2]);
md += `\n## 作画时不用的触发词\n\n在原文里出现时，模型多半没把它当成这个物象抽出（精度低于 ${MIN_PRECISION * 100}%），或是单字且出现不到 ${MIN_HITS} 首。这些写法仍在本体页显示为别名，但规则匹配时跳过。共 ${Object.values(trig).flat().length} 个，下面列出出现 3 首以上的：\n\n${droppedList.slice(0, 150).map(([w, n, h, p]) => `${w}→${n} ${Math.round(p * 100)}%(${h})`).join('、')}\n`;
md += `\n## 概念\n\n`;
for (const cat of CATS) {
  const list = Object.entries(concepts).filter(([, c]) => c.cat === cat).sort((a, b) => b[1].n - a[1].n);
  md += `### ${cat}（${list.length}）\n\n| 物象 | 诗数 | 各集 | 上位/画法 | 季节 | 时辰 | 寄托 | 象征 | 写法 |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const [name, c] of list) md += `| ${name}${c.sense ? '（听）' : ''} | ${c.n} | ${fmt(c.by)} | ${c.draw ? '画：' + c.draw : c.is_a ? c.is_a + (c.draws_as ? '' : '（画不出）') : '—'}${c.part_of ? '，属' + c.part_of : ''} | ${fmt(c.season)} | ${fmt(c.time)} | ${fmt(c.evokes && c.evokes.默认)} | ${(c.symbol || []).join('、')} | ${c.words.slice(0, 8).join(' ')} |\n`;
  md += '\n';
}
md += `## 修饰字（供第 2 步写言层，按搭配的物象种数排序）\n\n${top(Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, v.size]))).filter(([, v]) => v >= 3).map(([k, v]) => `${k}${v}`).join(' ')}\n\n`;
md += `## 少见物象（${rare.length}，出现不到 ${MIN_POEMS} 首，前 120 个）\n\n${rare.slice(0, 120).map((r) => `${r.name}${r.is_a ? '→' + r.is_a : ''}`).join('、')}\n`;
fs.writeFileSync(path.join(root, 'ontology/review.md'), md);
console.log(`概念 ${Object.keys(concepts).length}，少见 ${rare.length}，并入 ${Object.keys(aliasOf).length}，连写词 ${clash.length}`);
