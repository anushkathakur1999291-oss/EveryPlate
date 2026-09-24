import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../services/auth/auth.service';
async function main() {
  const email = process.argv[2]?.toLowerCase();
  let password = '';
  for await (const chunk of process.stdin) password += chunk;
  password = password.replace(/\r?\n$/, '');
  if (!email || password.length < 15 || password.length > 256) throw new Error('Provide an existing user email and a password of 15–256 characters on stdin');
  const hash = await hashPassword(password);
  await prisma.$transaction(async tx => {
    const user = await tx.user.update({ where: { email }, data: { passwordHash: hash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
  console.log('Password updated; previous sessions revoked.');
}
main().catch(() => { console.error('Password update failed. Check user email and password length.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
