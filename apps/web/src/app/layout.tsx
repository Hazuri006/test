import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-body' });

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Yurei Project';

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: `Panel communautaire ${appName} — amis, messages, tickets et actualités du serveur.`,
};

export const viewport: Viewport = {
  themeColor: '#07060f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
