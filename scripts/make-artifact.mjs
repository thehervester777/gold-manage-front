// Folds the single-bundle build in dist-artifact/ into self-contained HTML (script, styles and fonts all inline).
//
//   npm run build:single        (builds with ARTIFACT=1, then runs this script)
//
// Outputs, both in dist-artifact/:
//   ithika-gold-house.html             page fragment for hosts that wrap one file in their own document
//   ithika-gold-house-standalone.html  a complete document that opens straight from disk (double-click)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'dist-artifact');
const assets = join(dir, 'assets');

const pick = (ext) => {
  const f = readdirSync(assets).filter((n) => n.endsWith(ext));
  if (f.length !== 1) throw new Error(`expected exactly one ${ext} file in ${assets}, found ${f.length}: build with ARTIFACT=1 so nothing is code-split`);
  return join(assets, f[0]);
};

const css = readFileSync(pick('.css'), 'utf8');
const js = readFileSync(pick('.js'), 'utf8');

// Inline <script> and <style> end at the first closing tag, so make sure none appears in the payload.
const safeJs = js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const safeCss = css.replace(/<\/(style)/gi, '<\\/$1');

const report = (file) => {
  const mb = (statSync(file).size / 1048576).toFixed(2);
  console.log(`wrote ${file} (${mb} MB)`);
};

// 1. Fragment: the host adds the document, charset and viewport around it.
const fragment = `<title>Ithika Gold House</title>
<style>${safeCss}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`;
const fragmentOut = join(dir, 'ithika-gold-house.html');
writeFileSync(fragmentOut, fragment);
report(fragmentOut);
if (/(src|href)=["']https?:\/\//i.test(fragment.slice(0, 2000))) console.warn('warning: external URL near the top of the page');

// 2. Standalone: a complete document. The charset line matters: without it a browser may guess the wrong encoding for
//    a file opened from disk and the Bangla text would come out garbled.
const icon = (readFileSync(join(root, 'index.html'), 'utf8').match(/<link rel="icon"[^>]*>/) || [''])[0];
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#151B24" />
<meta name="description" content="Ithika Gold House — gold, loan and pledge management system" />
<title>Ithika Gold House</title>
${icon}
<style>${safeCss}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${safeJs}</script>
</body>
</html>
`;
const standaloneOut = join(dir, 'ithika-gold-house-standalone.html');
writeFileSync(standaloneOut, standalone);
report(standaloneOut);
