export function clientErrorMessage(input: {
  networkError?: boolean;
  status?: number;
  serverMessage?: string;
}): string {
  if (input.networkError) return "네트워크 연결을 확인해 주세요.";
  if (input.serverMessage) return input.serverMessage;
  const status = input.status ?? 0;
  if (status === 413) return "파일이 너무 큽니다. (최대 10MB)";
  if (status === 429) return "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
  if (status >= 500) return "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
  return "요청을 처리하지 못했어요.";
}
