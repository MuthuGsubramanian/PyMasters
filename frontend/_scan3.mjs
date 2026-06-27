import { transformSync } from 'esbuild';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
const files = execSync('find src -type f \\( -name "*.jsx" -o -name "*.js" \\)').toString().trim().split('\n');
let bad=[];
for (const f of files){ try{ transformSync(readFileSync(f,'utf8'),{loader:f.endsWith('.jsx')?'jsx':'js',jsx:'automatic'}); }catch(e){ bad.push(f+' :: '+((e.errors&&e.errors[0]&&e.errors[0].text)||e.message)); } }
console.log(bad.length? 'BAD:\n'+bad.join('\n') : 'ALL '+files.length+' FRONTEND OK');
