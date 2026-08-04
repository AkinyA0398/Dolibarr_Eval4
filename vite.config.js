import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/dolibarr-api': {
        target: 'http://localhost:1280',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dolibarr-api/, ''),
        // Demander à Apache/Dolibarr de NE PAS compresser (côté Node.js, pas de header interdit)
        headers: {
          'Accept-Encoding': 'identity',
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Sécurité supplémentaire : supprimer l'encodage si Apache l'envoie quand même
            delete proxyRes.headers['content-encoding'];
            delete proxyRes.headers['transfer-encoding'];
          });
        },
      },
    },
  },
})
