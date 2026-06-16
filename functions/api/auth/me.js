const SK='gpt-image2-jwt-secret-key-2026-secure';
function bd(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function gc(h,n){const m=h.match(new RegExp('(?:^|;\\s*)'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null;}
async function gk(){return crypto.subtle.importKey('raw',new TextEncoder().encode(SK),{name:'HMAC',hash:'SHA-256'},!1,['verify']);}
async function vt(t){const[h,p,s]=t.split('.');if(!h||!p||!s)throw new Error('invalid');const k=await gk(),v=await crypto.subtle.verify('HMAC',k,bd(s),new TextEncoder().encode(h+'.'+p));if(!v)throw new Error('bad');return JSON.parse(new TextDecoder().decode(bd(p)));}
async function vs(r,env){const t=gc(r.headers.get('Cookie')||'','session');if(!t)return null;try{const p=await vt(t);if(p.exp&&p.exp<Math.floor(Date.now()/1000))return null;return await env.gpt_image2_db.prepare('SELECT id,username,role FROM users WHERE id=?').bind(p.userId).first();}catch(e){return null;}}

export async function onRequestGet(ctx) {
  try {
    const u=await vs(ctx.request,ctx.env);
    if(!u) return new Response(JSON.stringify({error:'未登录'}),{status:401,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache'}});
    return new Response(JSON.stringify({id:u.id,username:u.username,role:u.role}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache'}});
  }catch(e){return new Response(JSON.stringify({error:'验证失败'}),{status:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache'}});}
}
