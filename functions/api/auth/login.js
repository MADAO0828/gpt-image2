const SL='gpt-image2-auth-salt-2026';
function be(b){return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function gk(secret){return crypto.subtle.importKey('raw', new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},!1,['sign']);}
async function hp(p){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p+':'+SL));return be(h);}
async function ct(p, secret){const k=await gk(secret),e=new TextEncoder(),hb=be(e.encode(JSON.stringify({alg:'HS256',typ:'JWT'}))),pb=be(e.encode(JSON.stringify(p))),sig=await crypto.subtle.sign('HMAC',k,e.encode(hb+'.'+pb));return hb+'.'+pb+'.'+be(sig);}

export async function onRequestPost(ctx) {
  try {
    const text=await ctx.request.text();
    const body=JSON.parse(text);
    const username=body.username;
    const password=body.password;
    if(!username||!password) return new Response(JSON.stringify({error:'用户名和密码不能为空'}),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache'}});
    const pw=await hp(password);
    const u=await ctx.env.gpt_image2_db.prepare('SELECT id,username,password_hash,role FROM users WHERE username=?').bind(username).first();
    if(!u||u.password_hash!==pw) return new Response(JSON.stringify({error:'用户名或密码错误'}),{status:401,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache'}});
    // Record login time and IP
    const ip=ctx.request.headers.get('CF-Connecting-IP')||ctx.request.headers.get('X-Forwarded-For')||'';
    ctx.waitUntil(ctx.env.gpt_image2_db.prepare("UPDATE users SET last_login=datetime('now'), last_ip=? WHERE id=?").bind(ip,u.id).run());
    const tk=await ct({userId:u.id,username:u.username,role:u.role,exp:Math.floor(Date.now()/1000)+86400}, ctx.env.JWT_SECRET);
    return new Response(JSON.stringify({success:!0,userId:u.id,username:u.username,role:u.role}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache','Set-Cookie':'session='+encodeURIComponent(tk)+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400'}});
  }catch(e){return new Response(JSON.stringify({error:'请求格式错误'}),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache'}});}
}
