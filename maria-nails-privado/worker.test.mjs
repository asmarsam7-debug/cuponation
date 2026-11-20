import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{hash} from './worker.mjs';
import {VERSION,agreementHTML,receiptHTML} from './agreement.mjs';
function db(){const d=new DatabaseSync(':memory:');d.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));return {prepare(sql){let args=[];const self={bind(...a){args=a;return self},async first(){return d.prepare(sql).get(...args)||null},async run(){return d.prepare(sql).run(...args)}};return self},async batch(a){d.exec('BEGIN');try{for(const q of a)await q.run();d.exec('COMMIT')}catch(e){d.exec('ROLLBACK');throw e}},raw:d};}
const origin='https://themarianails.com';
const request=(p,data,cookie,extra={})=>new Request(origin+p,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});
test('private content requires verified email, consent and receipt submission; invitations can be revoked',async()=>{
 const DB=db(),emails=[];let privateReads=0;const env={DB,PRIVATE:{async get(){privateReads++;return {body:'image-bytes'}}},RESEND_API_KEY:'test',MAIL_FROM:'María <sender@example.com>',OWNER_EMAIL:'owner@example.com',PRIVACY_ADDRESS:'Domicilio de prueba',PRIVACY_EMAIL:'owner@example.com',PUBLIC_ORIGIN:origin,OTP_PEPPER:'unit-test-only',ENABLED:'true',ASSETS:{async fetch(){return new Response('public shell')}}};
 const realFetch=globalThis.fetch;globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');emails.push(JSON.parse(opts.body));return Response.json({id:'mail-'+emails.length})};
 try{
 const raw='a'.repeat(64),inv=await hash(raw);DB.raw.prepare('INSERT INTO invites VALUES(?,?,?,0)').run(inv,'buyer@example.com',Math.floor(Date.now()/1000)+3600);
 assert.equal((await worker.fetch(request('/api/page/1'),env)).status,401);assert.equal(privateReads,0);
 assert.equal((await worker.fetch(request('/api/start',{invite:raw,email:'other@example.com'}),env)).status,403);
 assert.equal((await worker.fetch(request('/api/start',{invite:raw,email:'buyer@example.com'},null,{Origin:'https://evil.example'}),env)).status,403);
 let r=await worker.fetch(request('/api/start',{invite:raw,email:'buyer@example.com'}),env);assert.equal(r.status,200);const {challenge}=await r.json();const code=emails[0].html.match(/<strong>(\d{6})/)[1];
 r=await worker.fetch(request('/api/verify',{challenge,code}),env);assert.equal(r.status,200);const cookie=r.headers.get('Set-Cookie').split(';')[0];assert.match(r.headers.get('Set-Cookie'),/HttpOnly/);
 assert.equal((await worker.fetch(request('/api/verify',{challenge,code}),env)).status,403);
 assert.equal((await worker.fetch(request('/api/page/1',undefined,cookie),env)).status,403);
 assert.equal((await worker.fetch(request('/api/accept',{name:'Test Buyer',accept:false,version:VERSION},cookie),env)).status,400);
 r=await worker.fetch(request('/api/accept',{name:'Test Buyer',accept:true,version:VERSION},cookie),env);assert.equal(r.status,200);assert.equal(emails.length,2);assert.equal(emails[1].attachments.length,1);
 assert.equal((await worker.fetch(request('/api/page/1',undefined,cookie),env)).status,200);assert.equal(privateReads,1);
 const snap=DB.raw.prepare('SELECT * FROM acceptances').get();assert.equal(snap.agreement_html,agreementHTML());assert.equal(snap.agreement_hash,await hash(agreementHTML()));
 assert.throws(()=>DB.raw.prepare("UPDATE acceptances SET name='altered'").run(),/immutable/);
 assert.match(receiptHTML({...snap,agreement_html:'<p>Original snapshot</p>'}),/Original snapshot/);
 assert.equal((await worker.fetch(request('/api/open',{},cookie),env)).status,200);
 assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM events').get().n,1);
 DB.raw.prepare('UPDATE invites SET revoked=1').run();assert.equal((await worker.fetch(request('/api/page/1',undefined,cookie),env)).status,401);
 }finally{globalThis.fetch=realFetch}
});
test('unconfigured installation fails closed and serves no proposal',async()=>{const r=await worker.fetch(request('/api/page/1'),{ENABLED:'false'});assert.equal(r.status,503)});
test('receipt email failure keeps protected pages locked and supports a retry',async()=>{
 const DB=db();const inv='invite',sessionToken='b'.repeat(64);DB.raw.prepare('INSERT INTO invites VALUES(?,?,?,0)').run(inv,'buyer@example.com',2000000000);DB.raw.prepare('INSERT INTO sessions VALUES(?,?,?,?,NULL)').run(await hash(sessionToken),inv,'buyer@example.com',2000000000);
 const env={DB,PRIVATE:{async get(){return {body:'private'}}},RESEND_API_KEY:'test',MAIL_FROM:'x@example.com',OWNER_EMAIL:'owner@example.com',PRIVACY_ADDRESS:'address',PRIVACY_EMAIL:'owner@example.com',PUBLIC_ORIGIN:origin,OTP_PEPPER:'test',ENABLED:'true'};const cookie='__Host-mn='+sessionToken;const realFetch=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response('failure',{status:500});assert.equal((await worker.fetch(request('/api/accept',{name:'Test Buyer',accept:true,version:VERSION},cookie),env)).status,503);assert.equal((await worker.fetch(request('/api/page/1',undefined,cookie),env)).status,403);globalThis.fetch=async()=>Response.json({id:'retry-mail'});assert.equal((await worker.fetch(request('/api/accept',{name:'Test Buyer',accept:true,version:VERSION},cookie),env)).status,200);assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM acceptances').get().n,1)}finally{globalThis.fetch=realFetch}
});
