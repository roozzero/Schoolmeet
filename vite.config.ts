import { defineConfig, Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { startApiServer } from './server/index';

function scoolmeetExpressPlugin(): Plugin {
  return {
    name: 'scoolmeet-express-api',
    configureServer() {
      startApiServer(3001);
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), scoolmeetExpressPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});

