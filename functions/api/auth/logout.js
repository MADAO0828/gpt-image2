export async function onRequestPost() {
  return new Response(JSON.stringify({success:!0}),{status:200,headers:{'Content-Type':'application/json','Set-Cookie':'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'}});
}
