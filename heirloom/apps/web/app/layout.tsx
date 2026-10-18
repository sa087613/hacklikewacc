import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { DemoUserProvider } from "@/lib/demo-user";
import "./globals.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-hanken" });
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Heirloom",
  description: "Knowledge worth passing down.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${newsreader.variable}`}>
      <body>
        <DemoUserProvider>{children}</DemoUserProvider>
      </body>
    </html>
  );
}
