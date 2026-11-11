// Validates the extension and zips extension/ for the Chrome Web Store: npm run package
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ext = join(root, 'extension');
const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const problems = [];
const fail = message => problems.push(message);

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const all = files(ext);
const rel = path => relative(ext, path);

// Manifest basics the store checks.
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) fail(`version "${manifest.version}" is not 1-4 dot-separated integers`);
if (manifest.version !== pkg.version) fail(`manifest version ${manifest.version} differs from package.json ${pkg.version}`);
if (manifest.name.length > 75) fail('name is longer than 75 characters');
if (manifest.description.length > 132) fail(`description is ${manifest.description.length} characters (store limit 132)`);
const icons = { ...manifest.icons, ...manifest.action?.default_icon };
if (!manifest.icons?.['128']) fail('a 128px icon is required');

// Every file the manifest, pages and modules point at must exist.
const referenced = new Set([
  ...Object.values(icons), manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_ui?.page,
].filter(Boolean));
for (const path of all.filter(p => p.endsWith('.html'))) {
  const html = readFileSync(path, 'utf8');
  for (const [, ref] of html.matchAll(/\b(?:src|href)="([^"#?]+)"/g)) {
    if (/^(https?|mailto):/.test(ref)) {
      if (/<script[^>]+src="https?:/.test(html)) fail(`${rel(path)} loads a remote script (${ref})`);
      continue;
    }
    referenced.add(relative(ext, join(dirname(path), ref)));
  }
}
for (const path of all.filter(p => p.endsWith('.js'))) {
  const js = readFileSync(path, 'utf8');
  for (const [, ref] of js.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) referenced.add(relative(ext, join(dirname(path), ref)));
  for (const [, ref] of js.matchAll(/getURL\(\s*['"]([^'"?#]+)/g)) referenced.add(ref.replace(/^\//, ''));
  if (/\beval\s*\(|new Function\s*\(/.test(js)) fail(`${rel(path)} uses eval or new Function`);
  if (/import\s*\(\s*['"]https?:/.test(js)) fail(`${rel(path)} imports remote code`);
}
for (const css of all.filter(p => p.endsWith('.css'))) {
  for (const [, ref] of readFileSync(css, 'utf8').matchAll(/url\(([^)]+)\)/g)) referenced.add(relative(ext, join(dirname(css), ref.replace(/['"]/g, ''))));
}
for (const ref of referenced) if (!existsSync(join(ext, ref))) fail(`missing file: ${ref}`);

// Nothing that should not ship.
const allowed = new Set(['.json', '.js', '.html', '.css', '.png', '.woff2', '.txt']);
for (const path of all) {
  const name = rel(path);
  if (name.split('/').some(part => part.startsWith('.'))) fail(`hidden file would ship: ${name}`);
  else if (!allowed.has(extname(path))) fail(`unexpected file type would ship: ${name}`);
}
const unused = all.map(rel).filter(name => !referenced.has(name) && name !== 'manifest.json' && !name.endsWith('OFL.txt'));
if (unused.length) fail(`files nothing references: ${unused.join(', ')}`);

if (problems.length) {
  console.error('Not packaged:\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}

const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const zip = join(dist, `nx-block-reason-${manifest.version}.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-q', '-r', '-X', zip, '.', '-x', '.*', '*/.*'], { cwd: ext });
const bytes = readFileSync(zip);
const listed = execFileSync('unzip', ['-Z1', zip]).toString().trim().split('\n').filter(n => !n.endsWith('/'));
console.log(`Packaged ${relative(root, zip)}: ${listed.length} files, ${(bytes.length / 1024).toFixed(1)} KiB`);
console.log(`sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
