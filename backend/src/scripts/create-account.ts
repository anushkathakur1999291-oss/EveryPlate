import 'dotenv/config';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../services/auth/auth.service';
const text = z.string().trim().min(1).max(200);
const location = { address: text, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), phone: z.string().max(40).default('') };
const categories = z.enum(['COOKED_MEALS','PACKAGED_GOODS','PRODUCE','BAKERY','DAIRY']);
const identity = { name: text, email: z.string().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(15).max(256) };
const schema = z.discriminatedUnion('role', [
  z.object({ ...identity, role: z.literal('ADMIN') }).strict(),
  z.object({ ...identity, role: z.literal('DONOR'), profile: z.object({ ...location, organizationName: text, donorType: z.enum(['RESTAURANT','GROCERY','CAFETERIA','CATERER']) }).strict() }).strict(),
  z.object({ ...identity, role: z.literal('RECEIVER'), profile: z.object({ ...location, organizationName: text, maxCapacity: z.number().int().positive().max(1000000), needLevel: z.enum(['LOW','MEDIUM','HIGH']).default('MEDIUM'), foodPreferences: z.array(categories).min(1), acceptingDonations: z.boolean().default(true), hasOwnLogistics: z.boolean().default(false) }).strict() }).strict(),
  z.object({ ...identity, role: z.literal('DRIVER'), profile: z.object({ fullName: text, vehicleType: z.enum(['BIKE','CAR','VAN','FOOT']), phone: z.string().max(40).default('') }).strict() }).strict(),
]);
async function main() {
  let input='';
  for await(const chunk of process.stdin) { input+=chunk; if(input.length>16000) throw new Error('Input too large'); }
  const account=schema.parse(JSON.parse(input));
  const passwordHash=await hashPassword(account.password);
  const user=await prisma.user.create({ data: {
    email:account.email,name:account.name,role:account.role,passwordHash,
    ...(account.role==='DONOR'?{donorProfile:{create:account.profile}}:{}),
    ...(account.role==='RECEIVER'?{receiverProfile:{create:{...account.profile,foodPreferences:JSON.stringify(account.profile.foodPreferences)}}}:{}),
    ...(account.role==='DRIVER'?{driverProfile:{create:account.profile}}:{}),
  }, select:{id:true,role:true} });
  console.log(JSON.stringify({event:'ACCOUNT_CREATED',userId:user.id,role:user.role}));
}
main().catch(err=>{console.error(JSON.stringify({event:'ACCOUNT_CREATION_FAILED',type:err instanceof Error?err.name:'Unknown',hint:'Check the required role profile, unique email and password length. No account was partially created.'}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
