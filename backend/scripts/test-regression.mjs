import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const available=['domain','matching','fulfillment','api','socket','impact','ai'];
const suites=process.argv.length>2?process.argv.slice(2):available;
if(suites.some(s=>!available.includes(s)))throw new Error('Unknown test suite');
const directory=mkdtempSync(join(tmpdir(),'annsafe-regression-'));
const env={...process.env,NODE_ENV:'test',DEMO_MODE:'true',ALLOW_DEMO_RESET:'true',OTP_ENCRYPTION_KEY:'b'.repeat(64),DATABASE_URL:`file:${directory}/test.db`};
const commands=[['node_modules/prisma/build/index.js','migrate','deploy'],...suites.map(s=>['node_modules/ts-node/dist/bin.js',`src/tests/${s}.test.ts`])];
for(const args of commands){
 const result=spawnSync(process.execPath,args,{cwd:resolve(import.meta.dirname,'..'),env,stdio:'inherit',timeout:45000});
 if(result.status!==0){console.error(`Regression command failed: ${args.join(' ')} (${result.error?.message || result.signal || result.status})`);process.exit(result.status||1);}
}
console.log(`PASS ${suites.length} original regression suites against isolated database ${directory}`);
