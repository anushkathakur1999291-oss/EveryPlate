import assert from 'node:assert/strict';
import { server, io } from '../app';
import { prisma } from '../lib/prisma';
import { io as connect } from 'socket.io-client';
async function main() {
  assert.equal(process.env.DEMO_MODE,'false');
  assert.match(process.env.DATABASE_URL || '', /\/tmp\/.+test/);
  const user=await prisma.user.findUniqueOrThrow({where:{email:'driver@test.local'}});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const forged=await fetch(`${base}/api/admin/dashboard`,{headers:{'x-user-id':user.id,'x-user-email':user.email}});
  assert.equal(forged.status,401);
  assert.equal((await fetch(`${base}/api/auth/users`)).status,404);
  const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'test-password-at-least-twelve'})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  const socket=connect(base,{extraHeaders:{cookie},transports:['websocket'],reconnection:false});
  await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  assert.equal((await fetch(`${base}/api/auth/me`,{headers:{cookie}})).status,200);
  assert.equal((await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{cookie,origin:'https://evil.example'}})).status,403);
  const disconnected=new Promise<void>(resolve=>socket.once('disconnect',()=>resolve()));
  assert.equal((await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{cookie}})).status,204);
  await disconnected;
  assert.equal((await fetch(`${base}/api/auth/me`,{headers:{cookie}})).status,401);
  socket.disconnect();
  console.log('PASS non-demo header rejection, private directory, password sessions, CSRF origin check, logout revocation and socket disconnect');
}
main().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{io.close();server.close();await prisma.$disconnect();});
