import { currentUser } from '../../_lib/auth.js';

export async function onRequestPost(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (user) {
    await ctx.env.gpt_image2_db
      .prepare("UPDATE users SET session_version = COALESCE(session_version, 1) + 1, updated_at = datetime('now') WHERE id = ?")
      .bind(user.id)
      .run();
  }
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
    }
  });
}
