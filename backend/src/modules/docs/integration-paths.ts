const paths:Record<string,Record<string,unknown>>={};
const text={type:'string'};
const body=(required:string[],properties:Record<string,unknown>)=>({required:true,content:{'application/json':{schema:{type:'object',required,properties}}}});
function add(path:string,method:string,summary:string,code='200',payload?:unknown,publicEndpoint=false){
  (paths[path]??={})[method]={summary,security:publicEndpoint?[]:[{bearerAuth:[]}],parameters:[...path.matchAll(/\{(\w+)\}/g)].map(m=>({name:m[1],in:'path',required:true,schema:{type:'string',format:'uuid'}})),...(payload?{requestBody:payload}:{}),responses:{[code]:{description:summary},400:{description:'Invalid input'},401:{description:'Invalid or expired credentials'},403:{description:'Not authorized'},404:{description:'Not found in authorized school scope'}}};
}
add('/api/auth/login','post','Login returns access and opaque body refresh tokens','200',body(['email','password'],{email:{type:'string',format:'email'},password:text}),true);
add('/api/auth/refresh','post','Atomically rotate body refresh token; replay invalidates sessions','200',body(['refreshToken'],{refreshToken:text}),true);
add('/api/auth/logout','post','Revoke body refresh token','204',body(['refreshToken'],{refreshToken:text}),true);
add('/api/auth/change-password','post','Change password and invalidate existing sessions','204',body(['currentPassword','newPassword'],{currentPassword:text,newPassword:{type:'string',minLength:12,maxLength:128}}));
for(const suffix of ['','/today','/journeys','/attendance','/notifications'])add(`/api/students/{studentId}${suffix}`,'get',`Authorized student ${suffix.slice(1)||'profile'}; missing checkpoints are not inferred`);
add('/api/teacher/classes','get','Assigned classes');
add('/api/classes/{classId}/students','get','Assigned class roster');
add('/api/students/{studentId}/checkpoints/classroom','post','Confirm classroom arrival','201');
for(const action of ['start','end'])add(`/api/routes/{routeId}/${action}`,'post',`${action} journey; does not confirm boarding`,action==='start'?'201':'200',body(['direction'],{direction:{enum:['MORNING','RETURN']},timestamp:{type:'string',format:'date-time'}}));
add('/api/students/{studentId}/boarding','post','Observed boarding for assigned direction','201',body([],{direction:{enum:['MORNING','RETURN']},sourceEventId:text}));
add('/api/students/{studentId}/handover','post','Handover only to active pickup-authorized guardian','201',body(['guardianId'],{guardianId:{type:'string',format:'uuid'},sourceEventId:text}));
add('/api/notifications/{notificationId}/read','patch','Mark own notification read');
for(const resource of ['users','students','guardians','classes','teacher-class-assignments','vehicles','routes','student-route-assignments','transport-assignments','devices']){
  add(`/api/admin/${resource}`,'get',`School-scoped ${resource}; credentials and hashes omitted`);
  add(`/api/admin/${resource}`,'post',`Create or assign ${resource}; device provisioning returns token once`,'201');
}
add('/api/admin/routes/{routeId}/stops','post','Create school-scoped route stop','201',body(['name','latitude','longitude','sequence'],{name:text,latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},sequence:{type:'integer',minimum:1},scheduledTime:text}));
add('/api/admin/users/{userId}/status','patch','Enable/disable user; disabling invalidates sessions');
add('/api/admin/devices/{deviceId}/status','patch','Enable/disable device');
export const integrationPaths=paths;
