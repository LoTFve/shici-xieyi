// 诗库和本体图谱按需加载，加载一次后缓存
let lib = null, graph = null;

export async function library() {
  if (!lib) lib = fetch('/library.json').then((r) => r.json()).then((j) => ({
    collections: j.collections,
    poems: j.poems.map(([col, id, title, author, type, body]) => ({ col, id, title, author, type, body, key: `${col}/${id}` })),
  }));
  return lib;
}
export async function findPoem(col, id) {
  const { poems } = await library();
  return poems.find((p) => p.col === col && String(p.id) === String(id)) || null;
}
// 诗库里的诗转成作画用的文本：第一行标题，第二行作者，后面每句一行
export const toRaw = (p) => [p.title, p.author, ...p.body.split(/(?<=[。！？；])/).filter(Boolean)].join('\n');

export async function ontoGraph() {
  if (!graph) graph = import('../../ontology/graph.json').then((m) => m.default);
  return graph;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
