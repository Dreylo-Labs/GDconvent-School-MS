import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./responsive-fixes.css";
import "./dashboard-fidelity.css";
import "./facilities.css";
import "./auth.css";
import "./modules.css";
import "./students.css";
import "./attendance.css";
import "./teachers.css";
import "./fees.css";
import "./exams.css";
import "./staff-operations.css";
import "./audit.css";
import "./communications.css";
import "./header.css";
import "./branding.css";
import "./student-leave.css";
import "./transport.css";
import "./student-transport.css";
import "./student-transport-spacing.css";
import { AuthProvider } from "@/components/auth-provider";
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
export const metadata: Metadata = {
  title: "G.D. Convent Sr Sec School | Management System",
  description: "School operations, all in one place",
  icons: {
    icon: "/gd-convent-logo.png",
    shortcut: "/gd-convent-logo.png",
    apple: "/gd-convent-logo.png",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`}>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
