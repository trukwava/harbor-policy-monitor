/** Verify the local archive's source and fixture files; not a signed release. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const text=fs.readFileSync(path.join(root,'SOURCE_MANIFEST.sha256'),'utf8');
let count=0,failures=[];
for(const line of text.split(/\r?\n/).filter(Boolean)){
  const match=line.match(/^([a-f0-9]{64})  (.+)$/);
  if(!match){failures.push('Invalid manifest line');continue;}
  const relative=match[2];
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep)||path.relative(root,target).startsWith('..')){
    failures.push(`Unsafe manifest path: ${relative}`);continue;
  }
  try{
    if(!fs.lstatSync(target).isFile())throw Error('Not a regular file');
    const actual=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    if(actual!==match[1])failures.push(`${relative}: SHA-256 mismatch`);
    else count++;
  }catch(e){failures.push(`${relative}: ${e.message}`);}
}
if(failures.length){console.error('Package verification failed:\n'+failures.join('\n'));process.exitCode=1;}
else console.log(`Verified ${count} local files against the source manifest (unsigned checksum list).`);
