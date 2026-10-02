import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../services/database.js';
import { hashPassword } from '../utils/auth-crypto.js';

// Operator-only, initial empty database provisioning. Never exposed over HTTP.
export async function bootstrapAdmin(input: unknown) {
  const values=z.object({schoolName:z.string().trim().min(1).max(160),address:z.string().trim().min(1).max(500),timezone:z.string().default('UTC'),email:z.email(),password:z.string().min(16).max(128)}).parse(input);
  new Intl.DateTimeFormat('en',{timeZone:values.timezone});
  const passwordHash=await hashPassword(values.password);
  return prisma.$transaction(async tx=>{
    // Serialize bootstrap attempts, including from separate API containers.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73520126)`;
    if(await tx.school.count() || await tx.user.count())throw new Error('Bootstrap requires an empty database; use an existing school admin for further provisioning.');
    const school=await tx.school.create({data:{name:values.schoolName,address:values.address,timezone:values.timezone}});
    const user=await tx.user.create({data:{schoolId:school.id,email:values.email,passwordHash,role:'ADMIN'}});
    await tx.auditLog.create({data:{schoolId:school.id,actorUserId:user.id,action:'INITIAL_ADMIN_PROVISIONED',entityType:'User',entityId:user.id}});
    return {schoolId:school.id,userId:user.id};
  });
}

if(process.argv[1]?.replaceAll('\\','/').endsWith('/bootstrap-admin.js')){
  if(env.NODE_ENV!=='production')throw new Error('Initial operator provisioning is production-only. Use the fictional development seed locally.');
  bootstrapAdmin({schoolName:process.env['BOOTSTRAP_SCHOOL_NAME'],address:process.env['BOOTSTRAP_SCHOOL_ADDRESS'],timezone:process.env['BOOTSTRAP_TIMEZONE'],email:process.env['BOOTSTRAP_ADMIN_EMAIL'],password:process.env['BOOTSTRAP_ADMIN_PASSWORD']})
    .then(()=>console.log('Initial school administrator provisioned. No credentials are printed.'))
    .catch(()=>{console.error('Initial provisioning failed. Check required values and ensure the database is empty.');process.exitCode=1;})
    .finally(()=>prisma.$disconnect());
}
