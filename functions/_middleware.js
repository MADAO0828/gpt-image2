function isWeChat(request) {
  const ua = request.headers.get('User-Agent') || '';
  return /MicroMessenger|WeChat|MQQBrowser|TBS|XWEB/i.test(ua);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wechatCompatPage(request) {
  const url = new URL(request.url);
  const target = url.origin + url.pathname;
  const loginUrl = '';
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta http-equiv="Cache-Control" content="no-store">
  <title>\u8bf7\u4f7f\u7528\u5916\u90e8\u6d4f\u89c8\u5668\u6253\u5f00</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px;background:#fff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
    .card{width:100%;max-width:460px;border:1px solid #e5e7eb;border-radius:20px;padding:24px;box-shadow:0 12px 30px rgba(15,23,42,.08)}
    h1{font-size:22px;margin:0 0 10px;color:#111827}
    p{font-size:14px;line-height:1.7;color:#4b5563;margin:0 0 14px}
    .url{word-break:break-all;background:#f3f4f6;border-radius:12px;padding:10px;font-size:12px;color:#374151;margin:12px 0}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    button,a{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;padding:11px 14px;font-weight:800;text-decoration:none;cursor:pointer;min-height:42px}
    .primary{background:#6366f1;color:#fff}.secondary{background:#f3f4f6;color:#111827;border:1px solid #e5e7eb}
  </style>
</head>
<body>
  <div class="card">
    <h1>\u5fae\u4fe1\u5185\u7f6e\u6d4f\u89c8\u5668\u517c\u5bb9\u6027\u53d7\u9650</h1>
    <p>\u5f53\u524d AI \u5de5\u4f5c\u53f0\u5728\u5fae\u4fe1\u5185\u7f6e\u6d4f\u89c8\u5668\u4e2d\u5bb9\u6613\u89e6\u53d1\u767b\u5f55\u72b6\u6001\u4e22\u5931\u6216\u5185\u90e8\u91cd\u5b9a\u5411\u5faa\u73af\u3002\u4e3a\u907f\u514d\u7ee7\u7eed\u51fa\u73b0 ERR_TOO_MANY_REDIRECTS\uff0c\u8bf7\u590d\u5236\u94fe\u63a5\u5230 Chrome\u3001Edge\u3001Safari \u6216\u624b\u673a\u7cfb\u7edf\u6d4f\u89c8\u5668\u6253\u5f00\u3002</p>
    <div class="url" id="u">${escapeHtml(target)}</div>
    <div class="actions">
      <button class="primary" onclick="copyLink()">\u590d\u5236\u94fe\u63a5</button>
      <button class="secondary" onclick="copyLink()">\u590d\u5236\u540e\u5230\u5916\u90e8\u6d4f\u89c8\u5668\u6253\u5f00</button>
    </div>
  </div>
  <script>
    function copyLink(){
      var u=document.getElementById('u').textContent;
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(u).then(function(){alert('\u94fe\u63a5\u5df2\u590d\u5236')}).catch(function(){prompt('\u590d\u5236\u94fe\u63a5\uff1a',u)});
      } else {
        prompt('\u590d\u5236\u94fe\u63a5\uff1a',u);
      }
    }
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (isWeChat(context.request)) {
    const wechatBlockedPaths = new Set(['/', '/login', '/login.html', '/admin', '/admin.html', '/prompts', '/prompts.html', '/user', '/user.html']);
    if (wechatBlockedPaths.has(path)) return wechatCompatPage(context.request);
  }
  return context.next();
}
