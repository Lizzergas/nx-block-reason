// Builds extension/privacy.html from PRIVACY.md, so the policy ships inside the extension and stays in one source.
// node scripts/privacy.mjs writes it; --check exits 1 if the file is out of date (used by npm run package).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(`${root}PRIVACY.md`, 'utf8');
const target = `${root}extension/privacy.html`;

const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function inline(text) {
  return escape(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\b(https:\/\/[^\s<]+[^\s<.,])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\b([a-z0-9.]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi, '<a href="mailto:$1">$1</a>');
}

// Headings, paragraphs and bullet lists with one level of nesting: all PRIVACY.md uses.
export function render(markdown) {
  const out = [];
  let depth = 0; // how many <ul> are open; each has an open <li>
  const close = () => { while (depth > 0) { out.push('</li></ul>'); depth--; } };
  for (const line of markdown.split('\n')) {
    const item = /^( *)- (.*)$/.exec(line);
    if (!item) {
      close();
      if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`);
      else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
      continue;
    }
    const level = item[1].length >= 2 ? 2 : 1;
    if (level > depth) out.push('<ul><li>');
    else {
      while (depth > level) { out.push('</li></ul>'); depth--; }
      out.push('</li><li>');
    }
    depth = level;
    out.push(inline(item[2]));
  }
  close();
  return out.join('');
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NX Block Reason privacy policy</title>
<link rel="icon" href="icons/32.png">
<link rel="stylesheet" href="style.css">
</head>
<body>
<!-- Generated from PRIVACY.md by scripts/privacy.mjs. Do not edit by hand. -->
<main class="doc">
${render(source).replace(/(<\/(?:h1|h2|p|ul)>)/g, '$1\n')}
</main>
</body>
</html>
`;

if (process.argv.includes('--check')) {
  if (!existsSync(target) || readFileSync(target, 'utf8') !== html) {
    console.error('extension/privacy.html is out of date with PRIVACY.md. Run: npm run privacy');
    process.exit(1);
  }
} else {
  writeFileSync(target, html);
  console.log('wrote extension/privacy.html');
}
