import { describe, it, expect } from "vitest";
import { clientErrorMessage } from "@/lib/error-message";

describe("clientErrorMessage", () => {
  it("네트워크 에러를 최우선으로 처리한다", () => {
    expect(
      clientErrorMessage({ networkError: true, status: 500, serverMessage: "x" }),
    ).toBe("네트워크 연결을 확인해 주세요.");
  });

  it("서버 메시지가 있으면 그대로 사용한다", () => {
    expect(
      clientErrorMessage({ status: 400, serverMessage: "필수 항목이 누락되었습니다." }),
    ).toBe("필수 항목이 누락되었습니다.");
  });

  it("서버 메시지가 없으면 상태코드로 매핑한다", () => {
    expect(clientErrorMessage({ status: 413 })).toBe("파일이 너무 큽니다. (최대 10MB)");
    expect(clientErrorMessage({ status: 429 })).toBe("요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.");
    expect(clientErrorMessage({ status: 503 })).toBe("서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
  });

  it("그 외에는 기본 메시지를 반환한다", () => {
    expect(clientErrorMessage({ status: 418 })).toBe("요청을 처리하지 못했어요.");
    expect(clientErrorMessage({})).toBe("요청을 처리하지 못했어요.");
  });
});
