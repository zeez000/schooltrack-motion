import { Router } from "express";
import { authenticate, requireRoles, roles } from "../../middleware/auth.js";
import { prisma } from "../../services/database.js";
export function createMeRouter():Router{const router=Router();router.use(authenticate);router.get("/students",requireRoles(roles.PARENT),async(request,response,next)=>{try{const links=await prisma.guardian.findMany({where:{userId:request.auth!.userId,active:true,student:{schoolId:request.auth!.schoolId,status:"ACTIVE"}},include:{student:{include:{classroom:true}}},orderBy:{student:{firstName:"asc"}}});response.json({students:links.map(link=>({...link.student,guardianRelationship:link.relationship,authorisedPickup:link.authorisedPickup}))});}catch(error){next(error);}});return router;}
