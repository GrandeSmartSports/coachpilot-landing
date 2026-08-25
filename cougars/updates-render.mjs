// Shared markdown-lite renderer for weekly update bodies.
// Used by cougars/updates.html (parent feed) AND cougars/coach/index.html (Coach HQ).
// Rules: blank line = paragraph, a line of only **text** = section header,
// a line of only [label](url) = button, inline **bold** and [label](url) links.
// Everything is escaped before any markup is added.
export function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lineHtml(line) {
  return escHtml(line)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s<]+)\)/g, '<a class="ulink" href="$2" target="_blank" rel="noopener">$1</a>');
}

export function renderBody(body) {
  var blocks = String(body || "").split(/\n\s*\n/);
  return blocks.map(function (block) {
    var t = block.replace(/^\s+|\s+$/g, "");
    if (!t) return "";
    var mHead = t.match(/^\*\*([^*]+)\*\*$/);
    if (mHead) return '<div class="sec">' + escHtml(mHead[1]) + "</div>";
    var html = t.split("\n").map(function (line) {
      var lt = line.trim();
      var mBtn = lt.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (mBtn) return '<a class="ubtn" href="' + escHtml(mBtn[2]) + '" target="_blank" rel="noopener">' + escHtml(mBtn[1]) + "</a>";
      return lineHtml(line);
    }).join("<br>");
    return "<p>" + html + "</p>";
  }).join("");
}
