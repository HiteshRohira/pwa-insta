import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins:[react()], resolve:{alias:{'@pwacn/react':fileURLToPath(new URL('./vendor/pwacn-react/src/index.ts',import.meta.url)), '@pwacn/core':fileURLToPath(new URL('./vendor/pwacn-core/src/index.ts',import.meta.url))}}, build:{target:'es2022'} });
