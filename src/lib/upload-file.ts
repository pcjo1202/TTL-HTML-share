export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface FileLike {
  name: string;
  type: string;
  size: number;
}

const isHtml = (file: FileLike): boolean => {
  if (file.type === "text/html") return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".html") || name.endsWith(".htm");
};

// 통과하면 null, 실패하면 사용자용 에러 메시지를 반환한다.
export function htmlFileError(file: FileLike, maxBytes: number): string | null {
  if (!isHtml(file)) return "HTML 파일만 올릴 수 있어요.";
  if (file.size > maxBytes) return "파일이 너무 큽니다. (최대 10MB)";
  return null;
}
