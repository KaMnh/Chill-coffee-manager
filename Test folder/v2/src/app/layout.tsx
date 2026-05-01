import type { Metadata } from "next";
import "./styles.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Chill Manager v2",
  description: "Frontend-only operations dashboard for Chill Coffee Garden"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
