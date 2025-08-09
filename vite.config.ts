import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 將所有以 /api 開頭的請求轉發到後端伺服器
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true, // 更改請求來源為 target
        // rewrite: (path) => path.replace(/^\/api/, ''), // 如果需要，可以重寫路徑
      },
    },
  },
});