import { transformSync } from 'esbuild';
import { readFileSync, statSync } from 'fs';
import { execSync } from 'child_process';
const files = execSync('find src -type f \\( -name "*.jsx" -o -name "*.js" \\)').toString().trim().split('\n');
let bad = [];
for (const f of files) {
  try { transformSync(readFileSync(f,'utf8'), { loader: f.endsWith('.jsx')?'jsx':'js', jsx:'automatic' }); }
  catch (e) { bad.push([f, statSync(f).size, (e.errors&&e.errors[0]&&e.errors[0].text)||e.message]); }
}
console.log('run @ '+new Date().toISOString());
if (!bad.length) console.log('ALL OK ('+files.length+')');
else bad.forEach(([f,s,m])=>console.log(`  ${f} size=${s} :: ${m}`));
