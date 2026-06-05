export function expiryPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>만료된 링크</title>
<style>
  body{margin:0;font-family:Pretendard,system-ui,sans-serif;background:#f9fafb;color:#191f28;
       display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}
  .icon{font-size:48px}
  h1{font-size:22px;margin:12px 0 4px}
  p{color:#8b95a1;margin:0 0 20px}
  a{display:inline-block;background:#3182f6;color:#fff;text-decoration:none;
    padding:12px 20px;border-radius:12px;font-weight:600}
</style></head>
<body><div><div class="icon">⏳</div><h1>링크가 만료되었습니다</h1>
<p>이 문서는 유효기간이 지나 더 이상 열람할 수 없습니다.</p>
<a href="/">새 문서 올리기 →</a></div></body></html>`;
}
