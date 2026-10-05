'use client';

/**
 * Phần tô màu cú pháp, TÁCH RIÊNG để nạp động.
 *
 * Vì sao tách: `react-syntax-highlighter` + 18 gói ngôn ngữ Prism được đăng ký
 * ở module scope, nên chỉ cần import `markdown-renderer` là toàn bộ chúng vào
 * chunk khởi động — kể cả với người dùng chưa từng thấy một khối code nào.
 * Đo được KaTeX + Prism nằm trong chunk chính 967KB.
 *
 * Nạp động ở đây AN TOÀN vì `CodeBlock` đã có sẵn nhánh `<pre>` thuần: trong
 * lúc chờ chunk về, code vẫn hiển thị đầy đủ (chỉ chưa có màu), nên không có
 * hiện tượng nháy nội dung hay mất chữ.
 */

import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { CSSProperties } from 'react';

import ts from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import js from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';

const LANGS: Array<[string, unknown]> = [
  ['typescript', ts], ['ts', ts], ['javascript', js], ['js', js],
  ['jsx', jsx], ['tsx', tsx], ['python', python], ['py', python],
  ['bash', bash], ['sh', bash], ['shell', bash], ['json', json],
  ['css', css], ['html', markup], ['xml', markup], ['markup', markup],
  ['sql', sql], ['markdown', markdown], ['md', markdown],
  ['yaml', yaml], ['yml', yaml], ['go', go], ['rust', rust], ['rs', rust],
  ['cpp', cpp], ['c', c], ['java', java], ['csharp', csharp], ['cs', csharp],
];
for (const [name, mod] of LANGS) {
  SyntaxHighlighter.registerLanguage(name, mod as never);
}

/**
 * Bảng màu tô màu cú pháp — TỰ DỰNG từ bảng màu §2, không dùng theme có sẵn.
 *
 * TRƯỚC ĐÂY file này dùng `vscDarkPlus` — theme TỐI của Visual Studio, còn
 * nền ứng dụng là giấy trắng. Đo được cả 14 màu trong theme đó rơi dưới
 * ngưỡng WCAG AA trên nền code sáng: chữ gốc `#d4d4d4` chỉ 1.36:1, token
 * phổ biến nhất (`string` `#ce9178`) 2.42:1, `comment` 3.06:1. Tức là phần
 * tô màu rõ nhất — comment, chuỗi, số, tên hàm — lại là phần mờ nhất. Đó là
 * hệ quả của việc đổi nền sang sáng mà quên đổi theme tô màu: nền đổi, còn
 * bảng màu của nó không.
 *
 * Nay mỗi vai trò trong code bị một token §2 đảm nhiệm, và MỌI token đều đạt
 * AA trên cả ba nền code có thể xảy ra (`#f5f5f5` của `.claude-code-block`,
 * `#fcfcfc` lúc chờ nạp, `#ffffff` của bề mặt trắng). Test
 * `mọi màu tô màu cú pháp đều đạt WCAG AA trên nền code sáng` canh lại con
 * số này — đổi lại theme có sẵn là test đỏ, không phải im lặng.
 *
 * Vì sao không dùng theme sẵn nào: các theme sáng của thư viện được thiết kế
 * cho nền `#fafafa`–`#fff` với bảng màu riêng, nên tự mang màu và lệch hệ —
 * dùng theme có sẵn là để giao diện tự tạo một bảng màu thứ hai song song
 * với §2, đúng thứ §9 cấm. Ở đây màu nguồn vẫn là §2.
 */
const THEME: Record<string, CSSProperties> = {
  'code[class*="language-"]': { color: 'rgb(var(--text-primary))', background: 'none' },
  'pre[class*="language-"]': { color: 'rgb(var(--text-primary))', background: 'none' },
  'pre[class*="language-"] > code[class*="language-"]': { background: 'none' },
  comment: { color: 'rgb(var(--text-tertiary))', fontStyle: 'italic' },
  prolog: { color: 'rgb(var(--text-tertiary))' },
  doctype: { color: 'rgb(var(--text-tertiary))' },
  cdata: { color: 'rgb(var(--text-tertiary))' },
  punctuation: { color: 'rgb(var(--text-secondary))' },
  'tag.punctuation': { color: 'rgb(var(--text-secondary))' },
  'attr-value.punctuation': { color: 'rgb(var(--text-secondary))' },
  'attr-value.punctuation.attr-equals': { color: 'rgb(var(--text-secondary))' },
  namespace: { color: 'rgb(var(--text-tertiary))' },
  property: { color: 'rgb(var(--accent))' },
  tag: { color: 'rgb(var(--accent))' },
  'attr-name': { color: 'rgb(var(--accent))' },
  boolean: { color: 'rgb(var(--warning))' },
  number: { color: 'rgb(var(--warning))' },
  constant: { color: 'rgb(var(--warning))' },
  symbol: { color: 'rgb(var(--warning))' },
  unit: { color: 'rgb(var(--warning))' },
  inserted: { color: 'rgb(var(--diff-add))' },
  selector: { color: 'rgb(var(--accent))' },
  string: { color: 'rgb(var(--success))' },
  char: { color: 'rgb(var(--success))' },
  regex: { color: 'rgb(var(--success))' },
  'attr-value': { color: 'rgb(var(--success))' },
  url: { color: 'rgb(var(--info))' },
  builtin: { color: 'rgb(var(--info))' },
  variable: { color: 'rgb(var(--text-primary))' },
  function: { color: 'rgb(var(--info))' },
  'function.maybe-class-name': { color: 'rgb(var(--info))' },
  'maybe-class-name': { color: 'rgb(var(--info))' },
  'class-name': { color: 'rgb(var(--accent))' },
  operator: { color: 'rgb(var(--text-secondary))' },
  'operator.arrow': { color: 'rgb(var(--text-secondary))' },
  entity: { color: 'rgb(var(--text-secondary))' },
  atrule: { color: 'rgb(var(--info))' },
  'atrule.rule': { color: 'rgb(var(--info))' },
  'atrule.url': { color: 'rgb(var(--info))' },
  'atrule.url.function': { color: 'rgb(var(--info))' },
  'atrule.url.punctuation': { color: 'rgb(var(--text-secondary))' },
  keyword: { color: 'rgb(var(--info))' },
  'keyword.module': { color: 'rgb(var(--reasoning))' },
  'keyword.control-flow': { color: 'rgb(var(--reasoning))' },
  important: { color: 'rgb(var(--danger))', fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
  bold: { fontWeight: 'bold' },
  console: { color: 'rgb(var(--info))' },
  parameter: { color: 'rgb(var(--text-primary))' },
  interpolation: { color: 'rgb(var(--text-primary))' },
  'punctuation.interpolation-punctuation': { color: 'rgb(var(--text-secondary))' },
  'imports.maybe-class-name': { color: 'rgb(var(--accent))' },
  'exports.maybe-class-name': { color: 'rgb(var(--accent))' },
  escape: { color: 'rgb(var(--warning))' },
  'line-numbers .line-numbers-rows > span:before': { color: 'rgb(var(--text-tertiary))' },
  '.line-highlight.line-highlight': { background: 'rgb(var(--accent-soft))' },
};

export default function SyntaxHighlight({
  language,
  value,
}: {
  language: string;
  value: string;
}) {
  return (
    <SyntaxHighlighter
      style={THEME}
      language={language || 'text'}
      PreTag="pre"
      CodeTag="code"
      customStyle={{
        margin: 0,
        padding: '0.9rem 1rem',
        background: 'rgb(var(--surface-code))',
        fontSize: '13px',
        lineHeight: '1.6',
      }}
      codeTagProps={{ style: { fontSize: '13px', lineHeight: '1.6' } }}
    >
      {value}
    </SyntaxHighlighter>
  );
}
