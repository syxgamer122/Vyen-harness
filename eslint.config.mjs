import next from 'eslint-config-next';
import reactHooks from 'eslint-plugin-react-hooks';

const eslintConfig = [
  {
    /*
     * Hai thư mục này đã nằm trong .gitignore, nhưng ESLint 9 flat config KHÔNG
     * đọc .gitignore, nên cả hai lọt vào lần lint của cả repo.
     *
     * `temp-test-profile/`: profile Chrome tạo lúc thử launcher desktop, chứa
     * JS của extension đi kèm. 9 lỗi react/display-name +
     * react-hooks/rules-of-hooks trong bundle đó làm hỏng `npm run lint`. Không
     * sửa file bên trong: đó là bundle của bên thứ ba, không phải mã dự án.
     *
     * `.teamwork/`: state runtime của teamwork engine, trong đó có các bản sao
     * worktree của chính repo này. Lint lại bản sao là vô nghĩa và nhân báo động
     * lên với số lần mỗi lần engine chạy.
     */
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'gui-test-screenshots/**',
      'temp-test-profile/**',
      '.teamwork/**',
    ],
  },
  ...next,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Pattern sync state/ref trong effect đã ổn định từ lâu, không phải bug
      // runtime — rule mới của eslint-config-next v16 gắn cờ hàng loạt.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // Ảnh đính kèm trong chat là data:/blob: URL — next/image không xử lý được,
      // dùng <img> có chủ đích.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default eslintConfig;
