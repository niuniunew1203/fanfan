import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.URL || "https://fanfan-diary.netlify.app"),
  title: "饭饭日记｜把每顿饭，记成家的日常",
  description: "和家人一起记录每日三餐，用 AI 了解一餐的热量与营养。",
  icons: { icon: "/og.png", shortcut: "/og.png" },
  openGraph: { title: "饭饭日记", description: "把每顿饭，记成家的日常。", images: [{ url: "/og.png", width: 1536, height: 1024, alt: "饭饭日记" }] },
  twitter: { card: "summary_large_image", title: "饭饭日记", description: "把每顿饭，记成家的日常。", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
