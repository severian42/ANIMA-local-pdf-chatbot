import "./globals.css";
import { Public_Sans } from "next/font/google";

import { Navbar } from "@/components/Navbar";

const publicSans = Public_Sans({ subsets: ["latin"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Head>
        <title>ANIMA: Chat with your PDF</title>
        <link rel="shortcut icon" href="/images/favicon.ico" />
        <meta name="description" content="Upload a PDF, then ask questions about it - without a single remote request!" />
        <meta property="og:title" content="Fully Local Chat Over Documents" />
        <meta property="og:description" content="Upload a PDF, then ask questions about it - without a single remote request!" />
        <meta property="og:image" content="/images/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;700&display=swap" rel="stylesheet" />
      </Head>
      <div className="flex flex-col p-4 md:p-12 h-[100vh]">
        {children}
      </div>
    </>
  );
}
