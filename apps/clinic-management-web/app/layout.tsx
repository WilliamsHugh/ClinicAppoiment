import type { Metadata } from "next";
import { AppShell } from "../src/components/app-shell";
import { SessionProvider } from "../src/lib/session/session-context";
import { NotificationProvider } from "../src/features/notifications/notification-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clinic Management",
  description: "Nền tảng quản lý phòng khám"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <SessionProvider>
          <NotificationProvider>
            <AppShell>{children}</AppShell>
          </NotificationProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
