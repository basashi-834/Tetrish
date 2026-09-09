/**
 * 単一 HTML へまとめるビルダー。
 *   node tools/bundle.mjs
 *
 * ES モジュールを依存順に連結して import/export を落とし、CSS も埋め込むので、
 * 出力ファイルは file:// で直接開いても動く（サーバー不要）。
 *
 *   dist/tetrish.html          … 単体で開ける完全な HTML
 *   dist/tetrish.fragment.html … <head>/<body> を持たない埋め込み用
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 依存の浅いものから並べる
const MODULES = [
  'js/pieces.js',
  'js/game.js',
  'js/effects.js',
  'js/renderer.js',
  'js/audio.js',
  'js/input.js',
  'js/storage.js',
  'js/main.js',
];

/** import 文を削り、export キーワードだけを外す。 */
function stripModuleSyntax(code, name) {
  const out = code
    .replace(/^\s*import\s+[^;]*?from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^\s*export\s+\{[^}]*\};\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  if (/^\s*(import|export)\s/m.test(out)) {
    throw new Error(`${name}: 取り切れない import/export が残っている`);
  }
  return out;
}

const css = await readFile(join(root, 'css/style.css'), 'utf8');
const html = await readFile(join(root, 'index.html'), 'utf8');

const scripts = [];
for (const file of MODULES) {
  let code = await readFile(join(root, file), 'utf8');
  // 単一ファイル版に sw.js は同梱されないので登録処理を落とす
  code = code.replace(
    /\n\s*\/\/ Service Worker[\s\S]*?\n\s*}\n/,
    '\n'
  );
  scripts.push(`/* ===== ${file} ===== */\n${stripModuleSyntax(code, file)}`);
}

// index.html の <body> の中身だけを取り出す
const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
  .replace(/<script[^>]*><\/script>\s*/g, '')
  .trim();

const bundleJs = `(() => {\n${scripts.join('\n\n')}\n})();`;

const fragment = `<title>TETRISH</title>
<style>
${css}
</style>

${body}

<script>
${bundleJs}
</script>
`;

const standalone = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#05060e">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
${fragment.slice(0, fragment.indexOf('</style>') + '</style>'.length)}
</head>
<body>
${fragment.slice(fragment.indexOf('</style>') + '</style>'.length)}
</body>
</html>
`;

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist/tetrish.html'), standalone);
await writeFile(join(root, 'dist/tetrish.fragment.html'), fragment);

const kb = (s) => `${Math.round(s.length / 1024)}KB`;
console.log(`dist/tetrish.html          ${kb(standalone)}`);
console.log(`dist/tetrish.fragment.html ${kb(fragment)}`);
