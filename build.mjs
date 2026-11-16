import * as esbuild from 'esbuild';
import fs from 'fs';

const minify = !process.argv.includes('--dev');
const r = await esbuild.build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify, write: false, target: 'es2020', legalComments: 'none',
  logLevel: 'warning',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync('template.html', 'utf8');
const vo = {};
// voice-over disabled for now (subtitles only); set WITH_VO=1 to embed
if (process.env.WITH_VO && fs.existsSync('assets/vo')) for (const f of fs.readdirSync('assets/vo')) if (f.endsWith('.mp3')) vo[f.replace('.mp3', '')] = fs.readFileSync('assets/vo/' + f).toString('base64');
const mus = {};
if (fs.existsSync('assets/music')) for (const f of fs.readdirSync('assets/music')) if (f.endsWith('.mp3')) mus[f.replace('.mp3', '')] = fs.readFileSync('assets/music/' + f).toString('base64');
const html = tpl.replace('/*VO*/', () => 'window.__VO=' + JSON.stringify(vo) + ';window.__MUSIC=' + JSON.stringify(mus) + ';').replace('/*SCRIPT*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log('built dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
