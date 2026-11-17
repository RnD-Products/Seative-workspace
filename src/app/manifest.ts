import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/utils';

// Lets Chrome/Edge (Windows & Mac) install the app as a desktop app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: 'Seative',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
