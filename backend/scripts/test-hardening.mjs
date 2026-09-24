import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'annsafe-test-'));
const env={...process.env,NODE_ENV:'test',DEMO_MODE:'true',OTP_ENCRYPTION_KEY:'a'.repeat(64),DATABASE_URL:`file:${dir}/test.db`};
for(const args of [['node_modules/prisma/build/index.js','migrate','deploy'],['node_modules/ts-node/dist/bin.js','src/tests/hardening.test.ts']]) {
 const result=spawnSync(process.execPath,args,{env,cwd:resolve(import.meta.dirname,'..'),stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
console.log(`Isolated test database retained at ${dir}`);

const auth=spawnSync(process.execPath,['node_modules/ts-node/dist/bin.js','src/tests/session.test.ts'],{env:{...env,DEMO_MODE:'false'},cwd:resolve(import.meta.dirname,'..'),stdio:'inherit'});
if(auth.status!==0)process.exit(auth.status||1);
