import {VERSION,ACCEPTANCE,agreementHTML,receiptHTML,escape} from './agreement.mjs';
const enc=new TextEncoder();
export const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const now=()=>Math.floor(Date.now()/1000);
const baseHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...baseHeaders,'Content-Type':'application/json',...extra}});
const fail=(status,message)=>{throw {status,message}};
const run=(env,q,...v)=>env.DB.prepare(q).bind(...v).run();
const first=(env,q,...v)=>env.DB.prepare(q).bind(...v).first();
export function configured(e){return !!(e.DB&&e.ASSETS&&/^[a-f0-9]{64}$/.test(e.PROPOSAL_KEY||'')&&e.RESEND_API_KEY&&e.MAIL_FROM&&e.OWNER_EMAIL&&e.PRIVACY_ADDRESS&&e.PRIVACY_EMAIL&&e.PUBLIC_ORIGIN&&e.OTP_PEPPER&&e.ENABLED==='true');}
async function limit(e,key,max){const k=await hash(key);const r=await first(e,'INSERT INTO rate_limits(key,hits) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits',k);if(r.hits>max)fail(429,'Espera unos minutos antes de intentarlo de nuevo.');}
async function invite(e,raw,email){
 if(typeof raw!=='string'||!/^[a-f0-9]{64}$/.test(raw))fail(403,'Invitación no disponible.');
 const linkHash=await hash(raw);
 const link=await first(e,'SELECT * FROM invites WHERE id_hash=? AND revoked=0 AND expires>?',linkHash,now());
 if(!link)fail(403,'Invitación no disponible.');
 if(link.email!=='*'){
  if(email!==link.email)fail(403,'El correo no corresponde a esta invitación.');
  return {hash:linkHash};
 }
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Escribe un correo electrónico válido.');
 const recipientHash=`shared:${linkHash}:${await hash(email)}`;
 await run(e,'INSERT INTO invites(id_hash,email,expires) VALUES(?,?,?) ON CONFLICT(id_hash) DO NOTHING',recipientHash,email,link.expires);
 const recipient=await first(e,'SELECT id_hash FROM invites WHERE id_hash=? AND revoked=0 AND expires>?',recipientHash,now());
 if(!recipient)fail(403,'Invitación no disponible.');
 return {hash:recipientHash,sharedLink:linkHash};
}
async function assertSharedLinkActive(e,inviteHash){
 if(!inviteHash.startsWith('shared:'))return;
 const linkHash=inviteHash.split(':')[1];
 const link=await first(e,"SELECT id_hash FROM invites WHERE id_hash=? AND email='*' AND revoked=0 AND expires>?",linkHash,now());
 if(!link)fail(401,'Este enlace dejó de estar disponible.');
}
async function session(req,e){const t=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-mn=([a-f0-9]{64})(?:;|$)/)?.[1];if(!t)fail(401,'Verifica tu correo para continuar.');const s=await first(e,'SELECT s.* FROM sessions s JOIN invites i ON i.id_hash=s.invite_hash WHERE s.token_hash=? AND s.expires>? AND i.revoked=0 AND i.expires>?',await hash(t),now(),now());if(!s)fail(401,'Tu acceso venció. Verifica de nuevo tu correo.');await assertSharedLinkActive(e,s.invite_hash);return s;}
async function accepted(req,e){const s=await session(req,e);if(!s.acceptance_id)fail(403,'Acepta primero el acuerdo.');const r=await first(e,'SELECT * FROM acceptances WHERE id=? AND email=?',s.acceptance_id,s.email);if(!r||r.agreement_version!==VERSION||r.mail_status!=='submitted')fail(403,'Completa la aceptación y el envío de tu constancia.');return r;}
async function mail(e,to,subject,html,key,attachments){const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${e.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:e.MAIL_FROM,to:[to],reply_to:e.OWNER_EMAIL,subject,html,...(attachments?{attachments}:{})})});if(!r.ok)fail(503,'No pudimos enviar el correo. Inténtalo nuevamente en unos minutos.');return r.json();}
function b64(s){let t='';for(const b of enc.encode(s))t+=String.fromCharCode(b);return btoa(t);}
async function body(req){const t=await req.text();if(t.length>5000)fail(413,'Solicitud demasiado grande.');try{return JSON.parse(t)}catch{fail(400,'Solicitud inválida.');}}
async function event(e,id,kind){await run(e,'INSERT INTO events VALUES(?,?,?,?)',crypto.randomUUID(),id,kind,new Date().toISOString());}
export default {async fetch(req,e){try{const u=new URL(req.url);const p=u.pathname;
 if(p.startsWith('/api/')){
  if(p==='/api/privacy'&&req.method==='GET'){
   if(!e.PRIVACY_ADDRESS||!e.PRIVACY_EMAIL)return json({error:'El aviso de privacidad está temporalmente fuera de servicio. Intenta de nuevo más tarde.'},503);
   return json({responsible:'María del Rocío López Lozano',address:e.PRIVACY_ADDRESS,email:e.PRIVACY_EMAIL});
  }
  if(!configured(e))return json({error:'El acceso privado aún no está habilitado. Contacta a quien te compartió la invitación.'},503);
  if(req.method==='POST'){
   const isPresentationOrigin=u.origin===e.PUBLIC_ORIGIN||u.origin==='https://privado.liralit.com';
   if(!isPresentationOrigin||req.headers.get('Origin')!==u.origin)fail(403,'Origen no autorizado.');
  }
  if(req.method==='POST'&&!req.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'Formato no autorizado.');
  const ip=req.headers.get('CF-Connecting-IP')||'unknown';
  if(p==='/api/start'&&req.method==='POST'){
   const d=await body(req);await limit(e,`start:${ip}:${Math.floor(now()/600)}`,12);const email=String(d.email||'').trim().toLowerCase();const i=await invite(e,d.invite,email);
   await limit(e,`email:${await hash(email)}:${Math.floor(now()/600)}`,3);
   if(i.sharedLink)await limit(e,`shared:${i.sharedLink}:${Math.floor(now()/600)}`,60);
   const id=crypto.randomUUID();const n=new Uint32Array(1);do{crypto.getRandomValues(n)}while(n[0]>=4294000000);const code=String(n[0]%1000000).padStart(6,'0');
   await run(e,'INSERT INTO challenges(id,invite_hash,email,code_hash,expires) VALUES(?,?,?,?,?)',id,i.hash,email,await hash(`${e.OTP_PEPPER}:${id}:${code}`),now()+600);
   await mail(e,email,'Tu código de acceso privado',`<p>Tu código es <strong>${code}</strong>.</p><p>Vence en 10 minutos. No lo compartas. Este código solo verifica tu correo; todavía no has aceptado el acuerdo.</p>`,`otp-${id}`);return json({challenge:id});
  }
  if(p==='/api/verify'&&req.method==='POST'){
   const d=await body(req);await limit(e,`verify:${ip}:${Math.floor(now()/600)}`,30);if(!/^[0-9]{6}$/.test(String(d.code)))fail(400,'Escribe el código de seis dígitos.');const h=await hash(`${e.OTP_PEPPER}:${d.challenge}:${d.code}`);
   // Atomically consumes the code; failed attempts are capped even with parallel requests.
   const r=await first(e,'UPDATE challenges SET attempts=attempts+1,used=CASE WHEN code_hash=? THEN 1 ELSE used END WHERE id=? AND used=0 AND attempts<5 AND expires>? RETURNING *',h,String(d.challenge),now());if(!r||r.code_hash!==h)fail(403,'Código incorrecto o vencido.');
   await assertSharedLinkActive(e,r.invite_hash);
   const t=token();await run(e,'INSERT INTO sessions(token_hash,invite_hash,email,expires) VALUES(?,?,?,?)',await hash(t),r.invite_hash,r.email,now()+43200);
   return json({ok:true},200,{'Set-Cookie':`__Host-mn=${t}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`});
  }
  if(p==='/api/me'&&req.method==='GET'){const s=await session(req,e);let r=s.acceptance_id?await first(e,'SELECT name,mail_status,agreement_version FROM acceptances WHERE id=?',s.acceptance_id):null;return json({email:s.email,name:r?.name,accepted:!!(r&&r.mail_status==='submitted'&&r.agreement_version===VERSION),version:VERSION});}
  if(p==='/api/agreement'&&req.method==='GET'){await session(req,e);return json({html:agreementHTML(),version:VERSION,hash:await hash(agreementHTML()),acceptance:ACCEPTANCE});}
  if(p==='/api/accept'&&req.method==='POST'){
   const s=await session(req,e);const d=await body(req);if(d.version!==VERSION||d.accept!==true)fail(400,'Debes aceptar la versión vigente del acuerdo.');const name=String(d.name||'').trim().replace(/\s+/g,' ');if(name.length<5||name.length>120||!name.includes(' ')||/[<>\x00-\x1F]/.test(name))fail(400,'Escribe tu nombre completo.');
   await limit(e,`accept:${s.token_hash}:${Math.floor(now()/600)}`,5);
   let r=s.acceptance_id?await first(e,'SELECT * FROM acceptances WHERE id=?',s.acceptance_id):null;
   if(!r||r.agreement_version!==VERSION){r={id:crypto.randomUUID(),invite_hash:s.invite_hash,email:s.email,name,accepted_at:new Date().toISOString(),agreement_version:VERSION,agreement_hash:await hash(agreementHTML()),agreement_html:agreementHTML(),acceptance_text:ACCEPTANCE,ip,user_agent:(req.headers.get('User-Agent')||'').slice(0,500)};
    // Snapshot and session association are atomic. Store the exact text accepted, not a future template.
    await e.DB.batch([e.DB.prepare('INSERT INTO acceptances(id,invite_hash,email,name,accepted_at,agreement_version,agreement_hash,agreement_html,acceptance_text,ip,user_agent) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(...Object.values(r)),e.DB.prepare('UPDATE sessions SET acceptance_id=? WHERE token_hash=?').bind(r.id,s.token_hash)]);
   }
   if(r.mail_status!=='submitted'){const html=receiptHTML(r);const sent=await mail(e,r.email,'Tu acuerdo de confidencialidad · María Nails',html,`receipt-${r.id}`,[{filename:`Acuerdo_Maria_Nails_${r.id}.html`,content:b64(html)}]);await run(e,"UPDATE acceptances SET mail_status='submitted',mail_provider_id=? WHERE id=?",sent.id,r.id);}
   return json({ok:true,id:r.id,emailSubmitted:true});
  }
  if(p==='/api/open'&&req.method==='POST'){const r=await accepted(req,e);await event(e,r.id,'proposal_open');return json({name:r.name,email:r.email,pages:8});}
  if(/^\/api\/page\/[1-8]$/.test(p)&&req.method==='GET'){await accepted(req,e);const page=p.split('/').pop();const f=await e.ASSETS.fetch(new Request(`https://assets.local/_sealed/page-${page}.json`));if(!f.ok)fail(503,'La propuesta está en preparación.');const sealed=await f.json();const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',Uint8Array.from(e.PROPOSAL_KEY.match(/../g),b=>parseInt(b,16)),'AES-GCM',false,['decrypt']);let clear;try{clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(sealed.iv),additionalData:enc.encode(`maria-nails:page-${page}`)},key,bytes(sealed.data));}catch{fail(503,'La propuesta está en preparación.');}return new Response(clear,{headers:{...baseHeaders,'Content-Type':'image/webp'}});}
  if(p==='/api/receipt'&&req.method==='GET'){const r=await accepted(req,e);return new Response(receiptHTML(r),{headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Disposition':'attachment; filename="Acuerdo_Maria_Nails.html"'}});}
  if(p==='/api/logout'&&req.method==='POST') {const s=await session(req,e);await run(e,'DELETE FROM sessions WHERE token_hash=?',s.token_hash);return json({ok:true},200,{'Set-Cookie':'__Host-mn=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  fail(404,'Recurso no disponible.');
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json({error:'Método no permitido.'},405);
 // Only the public shell is directly reachable; sealed assets are fetched internally after authorization.
 const isInvitationPage=/^\/acceso\/[a-f0-9]{64}\/?$/.test(p);
 if(!isInvitationPage&&!['/','/index.html','/app.js','/style.css'].includes(p))fail(404,'Recurso no disponible.');
 const assetRequest=isInvitationPage?new Request(new URL('/',u),req):req;
 const res=await e.ASSETS.fetch(assetRequest);const h=new Headers(res.headers);for(const [k,v] of Object.entries(baseHeaders))h.set(k,v);return new Response(res.body,{status:res.status,headers:h});
 }catch(err){return json({error:err.status?err.message:'No fue posible completar la solicitud.'},err.status||500);}}
};
