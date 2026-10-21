import { Boldonse, Geist_Mono, Inter } from 'next/font/google';

import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});
const fontHeading = Boldonse({
  subsets: ['latin'],
  variable: '--font-boldonse',
  weight: '400',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn('antialiased', fontMono.variable, 'font-sans', inter.variable, fontHeading.variable)}>
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
