import { transformSync } from 'esbuild';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
const files = execSync('find src -type f \\( -name "*.jsx" -o -name "*.js" \\)').toString().trim().split('\n');
let bad = [];
for (const f of files) {
  try {
    const code = readFileSync(f, 'utf8');
    transformSync(code, { loader: f.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic' });
  } catch (e) {
    bad.push([f, (e.errors && e.errors[0] && e.errors[0].text) || e.message]);
  }
}
if (bad.length === 0) console.log('ALL ' + files.length + ' FRONTEND FILES PARSE OK');
else { console.log('CORRUPTED/INVALID FILES ('+bad.length+'):'); bad.forEach(([f,m]) => console.log('  '+f+' :: '+m)); }
