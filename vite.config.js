import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      // OneDrive/Windows pode perder notificações e manter módulos antigos no servidor.
      usePolling: process.platform === 'win32',
      interval: 200,
    },
  },
});
