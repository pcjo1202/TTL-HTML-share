import { describe, it, expect } from "vitest";
import { htmlFileError, MAX_UPLOAD_BYTES } from "@/lib/upload-file";

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "report.html",
  type: "text/html",
  size: 1000,
  ...over,
});

describe("htmlFileError", () => {
  it("text/html 파일은 통과한다(null)", () => {
    expect(htmlFileError(file(), MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("type이 비어도 .html 확장자면 통과한다", () => {
    expect(htmlFileError(file({ type: "", name: "a.html" }), MAX_UPLOAD_BYTES)).toBeNull();
  });

  it(".htm 확장자도 통과한다", () => {
    expect(htmlFileError(file({ type: "", name: "a.HTM" }), MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("HTML이 아니면 거부 메시지를 반환한다", () => {
    expect(htmlFileError(file({ type: "image/png", name: "a.png" }), MAX_UPLOAD_BYTES)).toBe(
      "HTML 파일만 올릴 수 있어요.",
    );
  });

  it("용량을 초과하면 거부 메시지를 반환한다", () => {
    expect(htmlFileError(file({ size: MAX_UPLOAD_BYTES + 1 }), MAX_UPLOAD_BYTES)).toBe(
      "파일이 너무 큽니다. (최대 10MB)",
    );
  });

  it("HTML이면서 용량 정상이면 통과한다", () => {
    expect(htmlFileError(file({ size: MAX_UPLOAD_BYTES }), MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("MAX_UPLOAD_BYTES는 10MB다", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});
