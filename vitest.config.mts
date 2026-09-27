import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /* Dọn env backend tìm kiếm trước mỗi file — nếu không, key thật trên máy
       dev đổi thứ tự engine và làm test đỏ (xem tests/setup-env.ts). */
    setupFiles: ['./tests/setup-env.ts'],
    testTimeout: 30000,
    /*
     * Mặc định vitest coi `package.json` là "đụng vào thì chạy hết", nên mỗi
     * lần thêm script hay dep đều biến `vitest related`/`--changed` thành
     * full suite 228s — âm thầm, không cảnh báo. Bỏ `package.json` khỏi danh
     * sách; nó không nạp gì vào test nên không cần chạy lại toàn bộ.
     *
     * `vitest.config.*` thì giữ lại: đổi cấu hình thì mọi thứ có thể đổi.
     * `setupFiles` được vitest tự thêm vào danh sách này, không cần khai.
     */
    forceRerunTriggers: ['**/{vitest,vite}.config.*/**'],
  },

});
