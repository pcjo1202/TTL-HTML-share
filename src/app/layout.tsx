import type { Metadata } from "next";
import { Toaster } from "sonner";
import Header from "./header";
import Footer from "./footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTL HTML Share",
  description: "HTML을 올리면 바로 공유 링크가 생성됩니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
