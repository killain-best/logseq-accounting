import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Logseq 插件以 iframe 加载 dist/index.html，资源必须用相对路径
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
})
