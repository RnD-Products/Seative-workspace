import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { APP_NAME } from '@/lib/utils';
import './globals.css';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Projects, tasks and progress for the whole team.',
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f4f4f6' }, { media: '(prefers-color-scheme: dark)', color: '#0a0a0c' }],
};

// Dark is the default look; a saved choice wins. Runs before first paint, so there is no flash.
const themeScript = `try{if(localStorage.getItem('theme')!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistMono.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
