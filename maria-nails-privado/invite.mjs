// Generates a private invitation locally. No network calls, no secrets in GitHub.
import {randomBytes,createHash} from 'node:crypto';
const email=process.argv[2]?.trim().toLowerCase();
if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Uso: node invite.mjs correo@ejemplo.com');
const token=randomBytes(32).toString('hex');const hash=createHash('sha256').update(token).digest('hex');
console.log(JSON.stringify({url:`https://privado.themarianails.com/#invitacion=${token}`,sql:'INSERT INTO invites(id_hash,email,expires) VALUES(?,?,?);',bindings:[hash,email,Math.floor(Date.now()/1000)+30*86400]},null,2));
