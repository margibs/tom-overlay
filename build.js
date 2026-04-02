#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const MINIFY = process.argv.includes('--minify');
const WATCH  = process.argv.includes('--watch');

const SRC_DIR  = path.join(__dirname, 'src');
const OUT_FILE = path.join(__dirname, 'tribes-of-malaya-overlay.user.js');

async function build() {
  const allFiles = fs.readdirSync(SRC_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  const header = fs.readFileSync(path.join(SRC_DIR, '00-header.js'), 'utf8').trimEnd();

  const bodyParts = allFiles
    .filter(f => f !== '00-header.js')
    .map(f => fs.readFileSync(path.join(SRC_DIR, f), 'utf8').trimEnd());

  let body = bodyParts.join('\n\n');

  if (MINIFY) {
    const { minify } = require('terser');
    const result = await minify(
      `(function(){"use strict";\n${body}\n})();`,
      { compress: true, mangle: true }
    );
    const out = `${header}\n\n${result.code}\n`;
    fs.writeFileSync(OUT_FILE, out);
    console.log(`[build:min] ${OUT_FILE} — ${out.length} bytes`);
    return;
  }

  const out = `${header}\n\n(function () {\n  "use strict";\n\n${body}\n\n})();\n`;
  fs.writeFileSync(OUT_FILE, out);
  console.log(`[build] ${OUT_FILE} — ${out.length} bytes`);
}

function watch() {
  build().catch(console.error);
  let debounce;
  fs.watch(SRC_DIR, { recursive: true }, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => build().catch(console.error), 100);
  });
  console.log('[watch] Watching src/ for changes…');
}

if (WATCH) {
  watch();
} else {
  build().catch(err => { console.error(err); process.exit(1); });
}
