export function lockPageHtml({ id, error }: { id: string; error?: string }): string {
  const errorBlock = error ? `<p class="err">${error}</p>` : "";
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>잠긴 문서</title>
<style>
  body{margin:0;font-family:Pretendard,system-ui,sans-serif;background:#f9fafb;color:#191f28;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  form{background:#fff;padding:32px;border-radius:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);
       width:100%;max-width:360px;text-align:center;box-sizing:border-box}
  .icon{font-size:44px}
  h1{font-size:20px;margin:10px 0 4px}
  p{color:#8b95a1;margin:0 0 20px;font-size:14px}
  .err{color:#f04452}
  input{width:100%;box-sizing:border-box;border:1px solid #e5e8eb;border-radius:12px;
        padding:12px 14px;font-size:15px;margin-bottom:12px}
  button{width:100%;background:#3182f6;color:#fff;border:0;border-radius:12px;
         padding:13px;font-weight:600;font-size:15px;cursor:pointer}
</style></head>
<body>
<form method="POST" action="/d/${id}">
  <div class="icon">🔒</div>
  <h1>잠긴 문서입니다</h1>
  <p>열람하려면 비밀번호를 입력하세요.</p>
  ${errorBlock}
  <input type="password" name="password" placeholder="열람 비밀번호" autofocus required>
  <button type="submit">열람하기</button>
</form>
</body></html>`;
}
