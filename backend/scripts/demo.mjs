import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'annsafe-demo-'));
const env={...process.env,NODE_ENV:'development',DEMO_MODE:'true',ALLOW_DEMO_RESET:'true',DATABASE_URL:`file:${directory}/demo.db`};
for(const args of [['node_modules/prisma/build/index.js','migrate','deploy'],['node_modules/ts-node/dist/bin.js','src/scripts/demo-walkthrough.ts']]){
 const result=spawnSync(process.execPath,args,{cwd:resolve(import.meta.dirname,'..'),env,stdio:'inherit',timeout:90000});
 if(result.status!==0)process.exit(result.status||1);
}
console.log(`Demonstration used an isolated database: ${directory}`);
