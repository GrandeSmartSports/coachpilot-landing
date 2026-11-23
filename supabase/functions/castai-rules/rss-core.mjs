// Parse the WDFW emergency sportfishing rules RSS into plain rule records.
// Shared by the edge function and tests/rigs-rules.test.mjs.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-" };
export function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
}
export function text(html) {
  return decode(html).replace(/<\/(p|li|ul|div|h\d)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}
function tag(item, name) {
  const m = new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i").exec(item);
  return m ? m[1] : "";
}
export function parseRss(xml) {
  const items = String(xml || "").match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.map((it) => {
    const body = text(decode(tag(it, "description")));
    const eff = /Effective dates?:\s*([^\n]+)/i.exec(body);
    const pub = Date.parse(decode(tag(it, "pubDate")).trim());
    return {
      link: decode(tag(it, "link")).trim(),
      title: text(tag(it, "title")),
      published: isNaN(pub) ? null : new Date(pub).toISOString(),
      effective: eff ? eff[1].trim().slice(0, 200) : "",
      body: body.slice(0, 4000),
    };
  }).filter((r) => r.link && r.title);
}
