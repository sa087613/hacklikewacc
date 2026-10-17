import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { DemoUserProvider } from "@/lib/demo-user";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Heirloom",
  description: "Knowledge worth passing down.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <DemoUserProvider>{children}</DemoUserProvider>
      </body>
    </html>
  );
}
