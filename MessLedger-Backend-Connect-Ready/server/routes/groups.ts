import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, recordAuditLog } from '../db.ts';
import { type AuthenticatedRequest, createRateLimiter, getClientIp, requireAdmin } from '../security.ts';

export const groupsRouter = Router();
const joinLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 8, keyPrefix: 'group_join' });
const createSchema = z.object({
  groupName: z.string().trim().min(2).max(80), messName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().default(''), address: z.string().trim().max(200).optional().default(''),
  managerName: z.string().trim().min(2).max(80), profileImage: z.string().trim().max(500).optional().default(''),
  joinMode: z.enum(['approval','instant']).optional().default('approval')
});
const requestSchema = z.object({ groupCode: z.string().trim().min(6).max(24), name: z.string().trim().min(2).max(80), phone: z.string().trim().max(30).optional().default(''), email: z.string().trim().email().max(120).optional().or(z.literal('')).default('') });
const makeCode = () => `MESS-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0,6)}`;

function groupRole(req: AuthenticatedRequest, groupId: number) {
  return db.prepare(`SELECT gm.role FROM group_members gm WHERE gm.group_id=? AND gm.admin_id=? AND gm.status='active'`).get(groupId, req.admin!.id) as {role:string}|undefined;
}
function logGroup(groupId:number, adminId:number, action:string, details:unknown={}) {
  db.prepare('INSERT INTO group_activity(group_id,actor_admin_id,action,details_json) VALUES(?,?,?,?)').run(groupId,adminId,action,JSON.stringify(details));
}

// Public discovery reveals only non-sensitive group identity; never exposes member or ledger data.
groupsRouter.get('/lookup/:code', (req,res) => {
  const code = String(req.params.code || '').trim();
  const group = db.prepare(`SELECT id,group_code,group_name,mess_name,description,address,manager_name,join_mode FROM mess_groups WHERE group_code=? COLLATE NOCASE AND is_active=1`).get(code);
  if (!group) { res.status(404).json({error:'Group code is invalid or inactive'}); return; }
  res.json({group});
});
groupsRouter.post('/join-requests', joinLimiter, (req,res) => {
  const parsed=requestSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:parsed.error.issues[0]?.message||'Invalid request'});return;}
  const d=parsed.data;
  const group=db.prepare(`SELECT id,join_mode FROM mess_groups WHERE group_code=? COLLATE NOCASE AND is_active=1`).get(d.groupCode) as {id:number;join_mode:'approval'|'instant'}|undefined;
  if(!group){res.status(404).json({error:'Group code is invalid or inactive'});return;}
  const info=db.prepare(`INSERT INTO group_join_requests(group_id,requester_name,requester_phone,requester_email,status) VALUES(?,?,?,?,?)`).run(group.id,d.name,d.phone,d.email,group.join_mode==='instant'?'approved':'pending');
  if(group.join_mode==='instant') db.prepare(`INSERT INTO group_members(group_id,member_name,role,status) VALUES(?,?,'member','active')`).run(group.id,d.name);
  res.status(201).json({ok:true,requestId:Number(info.lastInsertRowid),status:group.join_mode==='instant'?'approved':'pending'});
});

groupsRouter.use(requireAdmin);
groupsRouter.get('/', (req:AuthenticatedRequest,res) => {
  const groups=db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id AND gm.status='active') member_count FROM mess_groups g LEFT JOIN group_members gm ON gm.group_id=g.id AND gm.admin_id=? WHERE g.owner_admin_id=? OR gm.admin_id=? ORDER BY g.created_at DESC`).all(req.admin!.id,req.admin!.id,req.admin!.id);
  res.json({groups});
});
groupsRouter.post('/', (req:AuthenticatedRequest,res) => {
  const parsed=createSchema.safeParse(req.body); if(!parsed.success){res.status(400).json({error:parsed.error.issues[0]?.message||'Invalid group'});return;}
  const d=parsed.data; let code='';
  for(let i=0;i<8;i++){const candidate=makeCode();if(!db.prepare('SELECT 1 FROM mess_groups WHERE group_code=?').get(candidate)){code=candidate;break;}}
  if(!code){res.status(500).json({error:'Could not allocate a unique group code'});return;}
  const tx=db.transaction(()=>{
    const result=db.prepare(`INSERT INTO mess_groups(group_code,group_name,mess_name,description,address,manager_name,profile_image,owner_admin_id,join_mode) VALUES(?,?,?,?,?,?,?,?,?)`).run(code,d.groupName,d.messName,d.description,d.address,d.managerName,d.profileImage,req.admin!.id,d.joinMode);
    const id=Number(result.lastInsertRowid);
    db.prepare(`INSERT INTO group_members(group_id,admin_id,member_name,role,status) VALUES(?,?,?,'owner','active')`).run(id,req.admin!.id,req.admin!.displayName);
    logGroup(id,req.admin!.id,'GROUP_CREATED',{groupCode:code});
    recordAuditLog({adminId:req.admin!.id,adminUsername:req.admin!.username,action:'CREATE',entityType:'mess_group',entityId:id,summary:`Created group ${d.groupName}`,ipAddress:getClientIp(req)});
    return id;
  });
  const id=tx();res.status(201).json({id,groupCode:code,ok:true});
});
groupsRouter.get('/:id', (req:AuthenticatedRequest,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1){res.status(400).json({error:'Invalid group id'});return;}
  const role=groupRole(req,id);if(!role){res.status(403).json({error:'You are not a member of this group'});return;}
  const group=db.prepare('SELECT id,group_code,group_name,mess_name,description,address,manager_name,join_mode,is_active,created_at FROM mess_groups WHERE id=?').get(id);
  const members=db.prepare(`SELECT gm.id,gm.member_name,gm.role,gm.status,gm.joined_at,m.phone,m.photo_url FROM group_members gm LEFT JOIN members m ON m.id=gm.member_id WHERE gm.group_id=? ORDER BY gm.joined_at`).all(id);
  const activity=db.prepare('SELECT action,details_json,created_at FROM group_activity WHERE group_id=? ORDER BY id DESC LIMIT 30').all(id);
  res.json({group,members,activity,permissions:{canManage:role.role==='owner'||role.role==='meal_manager',role:role.role}});
});
groupsRouter.get('/:id/join-requests',(req:AuthenticatedRequest,res)=>{
  const id=Number(req.params.id);const role=groupRole(req,id);if(!role||!['owner','meal_manager'].includes(role.role)){res.status(403).json({error:'Manager permission required'});return;}
  res.json({requests:db.prepare(`SELECT id,requester_name,requester_phone,requester_email,status,created_at FROM group_join_requests WHERE group_id=? ORDER BY created_at DESC`).all(id)});
});
groupsRouter.post('/:id/join-requests/:requestId/review',(req:AuthenticatedRequest,res)=>{
  const id=Number(req.params.id), requestId=Number(req.params.requestId);const role=groupRole(req,id);
  if(!role||!['owner','meal_manager'].includes(role.role)){res.status(403).json({error:'Manager permission required'});return;}
  const action=z.object({decision:z.enum(['approve','reject'])}).safeParse(req.body);if(!action.success){res.status(400).json({error:'Decision must be approve or reject'});return;}
  const result=db.transaction(()=>{
    const request=db.prepare(`SELECT * FROM group_join_requests WHERE id=? AND group_id=? AND status='pending'`).get(requestId,id) as {id:number;requester_name:string;requester_phone:string}|undefined;
    if(!request)return false;
    const status=action.data.decision==='approve'?'approved':'rejected';
    db.prepare(`UPDATE group_join_requests SET status=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?`).run(status,req.admin!.id,requestId);
    if(status==='approved')db.prepare(`INSERT INTO group_members(group_id,member_name,role,status) VALUES(?,?,'member','active')`).run(id,request.requester_name);
    logGroup(id,req.admin!.id,`JOIN_${status.toUpperCase()}`,{requestId,member:request.requester_name});return true;
  })();
  if(!result){res.status(404).json({error:'Pending request not found'});return;}res.json({ok:true});
});
groupsRouter.patch('/:id/members/:memberId',(req:AuthenticatedRequest,res)=>{
  const id=Number(req.params.id),memberId=Number(req.params.memberId),role=groupRole(req,id);
  if(!role||role.role!=='owner'){res.status(403).json({error:'Group owner permission required'});return;}
  const parsed=z.object({role:z.enum(['meal_manager','member']).optional(),status:z.enum(['active','inactive','removed']).optional()}).refine(v=>v.role||v.status).safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'Invalid member update'});return;}
  const member=db.prepare('SELECT id FROM group_members WHERE id=? AND group_id=?').get(memberId,id);if(!member){res.status(404).json({error:'Member not found'});return;}
  if(parsed.data.role)db.prepare('UPDATE group_members SET role=? WHERE id=? AND group_id=?').run(parsed.data.role,memberId,id);
  if(parsed.data.status)db.prepare('UPDATE group_members SET status=? WHERE id=? AND group_id=?').run(parsed.data.status,memberId,id);
  logGroup(id,req.admin!.id,'MEMBER_UPDATED',{memberId,...parsed.data});res.json({ok:true});
});
groupsRouter.post('/:id/code/reset',(req:AuthenticatedRequest,res)=>{
  const id=Number(req.params.id),role=groupRole(req,id);if(!role||role.role!=='owner'){res.status(403).json({error:'Group owner permission required'});return;}
  let code='';for(let i=0;i<8;i++){const candidate=makeCode();if(!db.prepare('SELECT 1 FROM mess_groups WHERE group_code=?').get(candidate)){code=candidate;break;}}
  if(!code){res.status(500).json({error:'Could not allocate a unique group code'});return;}
  db.prepare(`UPDATE mess_groups SET group_code=?,updated_at=datetime('now') WHERE id=?`).run(code,id);logGroup(id,req.admin!.id,'GROUP_CODE_RESET');res.json({groupCode:code,ok:true});
});
