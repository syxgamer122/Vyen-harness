import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractMessageUsage,
  formatMessageUsage,
  TOKEN_ARROW_IN,
  TOKEN_ARROW_OUT,
  type MessageUsageStats,
} from '@/lib/message-usage';
import { hudTokenText, hudCostText } from '@/components/hud/agent-hud';
import type { HudLane } from '@/lib/hud-store';

/*
 * Số token in ra ở BA nơi (dòng dưới tin nhắn, thanh dưới ô nhập, tab Data)
 * trước đây lệch nhau. File này khoá HAI bề mặt trong CÙNG một test để chúng
 * không thể trượt khỏi nhau nữa: đổi chiều ở đâu thì test đỏ ở đó.
 *
 * Mỗi test ghi chú mutation nó bắt được (đổi dòng nào thì đỏ).
 */

const stats = (over: Partial<MessageUsageStats> = {}): MessageUsageStats => ({
  promptTokens: 17053,
  completionTokens: 2,
  estimated: false,
  model: 'gpt-4o',
  durationMs: null,
  costUsd: null,
  routingRole: null,
  ...over,
});

const lane = (over: Partial<HudLane> = {}): HudLane => ({
  laneId: 'main',
  kind: 'main',
  category: 'capable',
  model: 'gpt-4o',
  effort: 'medium',
  turn: 0,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0.0042,
  elapsedSec: 0,
  evidence: 'reported_done',
  updatedAt: 0,
  ...over,
});

/** Đọc source đã quy về LF — file trên đĩa là CRLF, regex hard-code `\n` sẽ
 *  xanh ở máy và đỏ ở CI. */
const readSource = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

/** Cắt comment — tên field được nhắc trong chú thích là tài liệu, không phải
 *  chỗ component đọc nó. */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('mũi tên token: một quy ước cho mọi bề mặt', () => {
  it('thanh dưới ô nhập và dòng dưới tin nhắn phải in cùng chiều, cùng số', () => {
    /*
     * Dùng đúng cặp số của lượt đã quan sát được: 17053 token VÀO, 2 token RA.
     * Trước đây thanh dưới ô nhập in `17053↓ 2↑` — người đọc hiểu là "trả ra
     * 17053 token" trong khi thật ra chỉ trả ra 2.
     *
     * Đổi `TOKEN_ARROW_OUT` thành '↑' → đỏ. Đổi `hudTokenText` in `tokensIn`
     * bằng mũi tên RA → đỏ.
     */
    const underMessage = formatMessageUsage(stats());
    const underComposer = hudTokenText(lane({ tokensIn: 17053, tokensOut: 2 }));

    expect(underMessage).toBe('↑17053 · ↓2');
    expect(underComposer).toBe('↑17053 · ↓2');
    expect(underComposer).toBe(underMessage);

    /* `↑` là token vào, `↓` là token ra — khớp `tokensIn`/`tokensOut` của store. */
    expect(TOKEN_ARROW_IN).toBe('↑');
    expect(TOKEN_ARROW_OUT).toBe('↓');

    /* Không phải chỉ khớp ở một cặp số: đảo hai số thì hai bề mặt đảo theo. */
    expect(hudTokenText(lane({ tokensIn: 2, tokensOut: 17053 }))).toBe('↑2 · ↓17053');
    expect(formatMessageUsage(stats({ promptTokens: 2, completionTokens: 17053 }))).toBe(
      '↑2 · ↓17053',
    );
  });

  it('thanh dưới ô nhập lấy mũi tên từ lib/message-usage, không gõ tay', () => {
    /*
     * Nếu ai đó gõ thẳng `↑`/`↓` vào JSX thì hằng số ở trên chỉ còn là
     * hằng số và hai bề mặt lại trượt khỏi nhau trong im lặng.
     * Gõ tay lần nữa vào agent-hud.tsx → đỏ.
     */
    const jsx = stripComments(readSource('components/hud/agent-hud.tsx'));
    expect(jsx).toContain("from '@/lib/message-usage'");
    expect(jsx).toContain('TOKEN_ARROW_IN');
    expect(jsx).toContain('TOKEN_ARROW_OUT');
    /* Không có mũi tên nào nằm thô trong file. */
    expect(jsx).not.toMatch(/[↑↓]/);
  });
});

describe('cờ ước lượng ≈', () => {
  it('đặt ĐÚNG MỘT LẦN cho cả dòng, và không gán cho số nào cả', () => {
    /*
     * `est` là cờ mức BẢN GHI, không phải mức từng số. `use-chat-orchestration.ts`
     * bật nó khi gateway không báo `completionTokens`, và CHỈ con số đó được
     * thay bằng `ceil(ký tự / 4)` — `promptTokens` hoặc là số gateway báo thật,
     * hoặc bằng 0 và bị bỏ khỏi dòng.
     *
     * Nên `≈` phải đứng trước cả dòng. Gạch nó vào trước một số là nói dối về
     * số thật (`≈↑17053` nghĩa là "17053 này là đoán").
     *
     * Bỏ cờ đi, hoặc chuyển từ đầu dòng xuống trước `↓` → đỏ.
     */
    const measured = formatMessageUsage(stats({ estimated: false }));
    const guessed = formatMessageUsage(stats({ estimated: true }));

    expect(measured).not.toContain('≈');
    expect(guessed).toBe(`≈ ${measured}`);
    /* Một lần duy nhất cho cả dòng, không dính lên từng mũi tên. */
    expect(guessed.split('≈').length - 1).toBe(1);
    /* Con số bị ước lượng là số token RA; nó vẫn mang mũi tên chuẩn. */
    expect(guessed).toContain(`${TOKEN_ARROW_OUT}2`);
    expect(guessed).not.toContain(`≈${TOKEN_ARROW_IN}`);
  });

  it('ước lượng thì không in tiền, và dòng rỗng không sinh cờ', () => {
    /* Đường thật: annotation → dòng. Việc bịt giá nằm ở `extractMessageUsage`
       (mọi trường hợp không chắc là null chứ không bịa số), nên phải đi qua đó
       chứ không gọi `formatMessageUsage` với một `costUsd` tự bịa. */
    const line = formatMessageUsage(
      extractMessageUsage([
        { usage: { promptTokens: 17053, completionTokens: 480 }, model: 'gpt-4o', est: true },
      ])!,
    );
    expect(line).not.toContain('$');
    expect(line.startsWith('≈ ')).toBe(true);

    /* Không có phần nào để gắn cờ thì không in cờ: dòng rỗng không phải dòng
       ước lượng. Bỏ nhánh `if (body === '') return body` → đỏ. */
    expect(formatMessageUsage(stats({ estimated: true, promptTokens: 0, completionTokens: 0 }))).toBe('');
  });
});

describe('số không có nguồn thì không in', () => {
  it('hudTokenText bỏ ô token khi cả hai số đều 0, và bỏ từng mũi tên khi một số 0', () => {
    /*
     * `hud-store.upsertLane` mặc định `tokensIn`/`tokensOut` về 0, nên lane
     * vừa tạo mà chưa có lượt nào chạy sẽ in ra `0↓ 0↑`: hai số KHÔNG có phép
     * đo nào đứng sau mà trông như phép đo.
     * Thêm lại nhánh in 0 vào `hudTokenText` → đỏ.
     */
    expect(hudTokenText(lane({ tokensIn: 0, tokensOut: 0 }))).toBeNull();
    expect(hudTokenText(lane({ tokensIn: 17053, tokensOut: 0 }))).toBe('↑17053');
    expect(hudTokenText(lane({ tokensIn: 0, tokensOut: 2 }))).toBe('↓2');
    /* Số âm là rác từ upstream, không phải phép đo — cũng bị bỏ. */
    expect(hudTokenText(lane({ tokensIn: -5, tokensOut: 0 }))).toBeNull();
  });

  it('hudCostText bỏ ô giá khi chưa đo được, không thay bằng số 0', () => {
    /*
     * `hud-store` cố tình trả `'unknown'` thay vì 0 để không ai đọc nhầm là
     * miễn phí, và tự nó ghi luật: "TUYỆT ĐỐI không $0". Nhưng cả hai số token
     * bằng 0 thì `calculateModelCost` vẫn trả 0 — in `$0.0000` lúc đó là số 0
     * không có phép đo nào đứng sau, đúng loại lỗi mà dòng token đã tránh.
     * Bỏ nhánh `tokensIn <= 0 && tokensOut <= 0` → đỏ.
     */
    expect(hudCostText(lane({ costUsd: 'unknown' }))).toBeNull();
    /* 0 token = chưa đo được, KHÔNG phải lượt này miễn phí. */
    expect(hudCostText(lane({ costUsd: 0 }))).toBeNull();
    /* Có phép đo token thì ô giá có nghĩa, kể cả khi bảng giá ra 0. */
    expect(hudCostText(lane({ tokensIn: 17053, costUsd: 0 }))).toBe('$0.0000');
    expect(hudCostText(lane({ tokensIn: 17053, tokensOut: 2, costUsd: 0.0042 }))).toBe('$0.0042');
  });

  it('turn / elapsedSec / parallelShots không được render khi chưa có call site ghi', () => {
    /*
     * Hai nửa của cùng một lập luận:
     *  1. Nguồn sự thật: vị trí ghi DUY NHẤT của store là `upsertLane` trong
     *     `use-chat-orchestration.ts`, và nó không set field nào trong ba.
     *  2. Hệ quả: agent-hud không được đọc chúng.
     *
     * Nửa 1 đỏ nếu ai đó nối thêm nguồn ghi — lúc đó phải BẬT LẠI field, và
     * nửa 2 bắt buộc phải đỏ theo.
     * Nửa 2 đỏ nếu ai đó thêm `<span>{lane.turn}</span>` vào JSX.
     */
    const written = new Set<string>();
    const orchestration = readSource('react/use-chat-orchestration.ts');
    for (const call of orchestration.matchAll(/upsertLane\(\{([\s\S]*?)\n\s*\}\)/g)) {
      for (const key of call[1]!.matchAll(/^\s{6,}(\w+):/gm)) written.add(key[1]!);
    }
    /* Regex phải soi được ít nhất một call site, không thì "không có field
       nào được ghi" sẽ đúng cho một lý do sai. */
    expect(written.size, 'không đọc được call site upsertLane nào — regex chắc hỏng').toBeGreaterThan(4);

    const jsx = stripComments(readSource('components/hud/agent-hud.tsx'));
    for (const field of ['turn', 'elapsedSec', 'parallelShots'] as const) {
      expect(written.has(field), `${field} đã có call site ghi — phải bật lại ở HUD`).toBe(false);
      expect(jsx, `agent-hud đang render ${field} — số 0 không có nguồn đo`).not.toContain(
        `lane.${field}`,
      );
    }
  });
});

describe('nhãn tiếng Việt của thanh trạng thái', () => {
  it('vùng role="status" phải có aria-label tiếng Việt, không emoji', () => {
    /*
     * `role="status"` là live region: đoạn này được đọc TO bởi screen reader,
     * nên nó là chữ user-facing như mọi chữ khác — không được để tiếng Anh
     * lọt vào giữa UI tiếng Việt.
     * Đổi lại `aria-label` → đỏ.
     */
    const code = readSource('components/hud/agent-hud.tsx');
    const label = code.match(/aria-label="([^"]*)"/)?.[1];
    expect(label, 'agent-hud phải có aria-label').toBeTruthy();
    expect(label).toBe('Phiếu lượt chạy gần nhất');
    /* Chữ mẹo emoji, và không còn sót từ tiếng Anh của bản cũ. */
    expect(label!).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(label!).not.toMatch(/\b(?:receipt|last|run)\b/i);
  });

  it('không có em dash trong chữ user-visible của hai file', () => {
    /* `—` là em dash; trước đây ô "không biết giá" của HUD in đúng ký tự này. */
    for (const rel of ['components/hud/agent-hud.tsx', 'components/chat/message-usage.tsx']) {
      /* Chỉ soi chuỗi trong JSX; chú thích tiếng Việt dùng `—` để viết câu là
         hợp lệ, nhưng phần đó không bao giờ hiện ra màn hình. */
      const literals = [...stripComments(readSource(rel)).matchAll(/'([^'\n]*)'/g)].map((m) => m[1]!);
      for (const literal of literals) {
        expect(literal, `${rel}: em dash trong chữ hiện ra "${literal}"`).not.toContain('—');
      }
    }
  });
});
