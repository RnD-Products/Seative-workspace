import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/utils';

// Lets Chrome/Edge (Windows & Mac) install the app as a desktop app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: 'Seative',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafc',
    theme_color: '#4f46e5',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
