import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng nhập nội bộ",
  description:
    "Internal sign-in page for the AutoWin Content Dashboard. This page is not affiliated with Facebook, Instagram, TikTok, or YouTube.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
