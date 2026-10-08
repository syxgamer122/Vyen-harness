'use client';

import { Z_CLASS } from '@/lib/ui-z';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, FileCode, Copy, CheckCheck, TriangleAlert, Eye, Minimize2 } from 'lucide-react';
import { lineDiff, renderUnifiedDiff, type DiffLine } from '@/lib/naive-diff';
import { useHaptics } from '@/components/effects';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';

/**
 * Modal phê duyệt ghi file của agent coding — cổng an toàn BẮT BUỘC trước
 * khi fs_write chạm vào đĩa của người dùng. Hiển thị unified diff,
 * Escape = từ chối. KHÔNG có phím tắt duyệt: duyệt chỉ qua bấm/Tab+Enter
 * trên nút Duyệt, để một phím Enter vô tình không ghi đè đĩa.
 * Promise-based để onToolCall await quyết định.
 */

/*
 * ---------------------------------------------------------------------------
 * LỚP ĐỆM DIFF — thứ biến modal này thành một cổng an toàn có thể kiểm chứng
 * ---------------------------------------------------------------------------
 * `renderUnifiedDiff` mặc định gộp mọi dải `same` dài hơn `contextLines`
 * (2) thành MỘT dấu `…` không kèm số, rồi cắt còn `maxChars` (12.000). Hậu
 * quả trực tiếp với một cổng phê duyệt:
 *
 *   - dấu `…` không nói nó đại diện cho bao nhiêu dòng, nên người dùng không
 *     biết mình đang duyệt một thay đổi nhỏ hay một viết lại cả file;
 *   - phần bị cắt không có đường nào để tới, KỂ CẢ nút sao chép — nó chép
 *     chính chuỗi đã bị cắt, tức lối thoát duy nhất cũng bị cắt theo;
 *   - badge `+N / -N` đếm trên danh sách đã cắt nên báo ĐỘNG dưới thực.
 *
 * Ba quy tắc dựng lại câu hỏi mà modal trả lời, theo đúng thứ sẽ bị ghi:
 *
 *   1. PHẠM VI là `state.oldText` → `state.newText`, đúng hai chuỗi mà nút
 *      Duyệt sẽ ghi xuống. Không dùng "cây thư mục" làm câu hỏi thay thế —
 *      đó là một câu hỏi khác, và nó không phải thứ đang được phê duyệt.
 *
 *   2. Co cụm CHỈ ĐƯỢC loại dòng `same` (ngữ cảnh, đối chiếu filesystem tự
 *      sinh lại được) và dấu `…` phải mang SỐ. Không dòng `add`/`del` nào bị
 *      loại khỏi câu hỏi mà không được nói ra.
 *
 *   3. Mọi phần bị ẩn đều phải MỞ RA ĐƯỢC trước khi bấm Duyệt. Nút "Xem
 *      toàn bộ" bỏ hết co cụm và hết trần ký tự; nút sao chép luôn lấy bản
 *      đầy đủ, không bao giờ lấy bản đã cắt.
 */

/** Ngưỡng của khung diff mặc định. 12.000 ký tự là trần cũ, giữ nguyên. */
const COMPACT_MAX_CHARS = 12_000;
/** Trần số hàng của khung mặc định — trần ký tự mới là thứ chặn trước. */
const COMPACT_MAX_ROWS = 600;
/**
 * Trần của chế độ "Xem toàn bộ". Một lượt render vô hạn sẽ treo tab, và một
 * dialog treo là một dialog người dùng bấm Duyệt mù — nên có trần, và khi
 * vượt trần thì băng cảnh báo nói rõ phần còn lại chỉ lấy được qua nút
 * sao chép (nút này KHÔNG có trần).
 */
const FULL_MAX_ROWS = 20_000;

type DiffRow =
  | { kind: 'line'; line: DiffLine }
  /** Dải bị gộp: `same` chỉ là ngữ cảnh, `add`/`del` là thay đổi bị khuất. */
  | { kind: 'elision'; same: number; adds: number; dels: number };

export interface DiffView {
  /** Toàn bộ thay đổi, không co cụm — nguồn của chế độ "Xem toàn bộ". */
  all: DiffLine[];
  /** Các hàng khung mặc định vẽ ra. */
  rows: DiffRow[];
  /** Số đếm trên TOÀN BỘ thay đổi (badge phải nói đúng con số này). */
  totalAdds: number;
  totalDels: number;
  /** Khung mặc định có thiếu gì không. */
  truncated: boolean;
  /** Dòng `same` đã bị gộp khỏi khung mặc định (ngữ cảnh, vô hại). */
  elidedContext: number;
  /** Dòng thêm / xoá KHÔNG hiện được ở khung mặc định. */
  hiddenAdds: number;
  hiddenDels: number;
  /** Chế độ toàn bộ có vượt trần render không. */
  fullClipped: boolean;
}

/**
 * Dựng khung diff mặc định từ `oldText`/`newText`.
 *
 * Ngữ cảnh ghép dải bám đúng `renderUnifiedDiff` (`contextLines` mặc định
 * = 2): mọi dòng `same` nằm trong ±2 dòng quanh một dòng thay đổi được giữ,
 * phần còn lại gộp thành dải. Ở ngưỡng KHÔNG cắt, `rows` mở ra giống hệt
 * thứ `renderUnifiedDiff` sẽ sinh — khác ở chỗ mỗi dải `…` được ghi số.
 */
function buildDiffView(oldText: string, newText: string): DiffView {
  const all = lineDiff(oldText, newText);
  const totalAdds = all.filter((l) => l.type === 'add').length;
  const totalDels = all.filter((l) => l.type === 'del').length;

  const CTX = 2;
  const keep = new Array<boolean>(all.length).fill(false);
  all.forEach((l, i) => {
    if (l.type === 'same') return;
    for (let j = Math.max(0, i - CTX); j <= Math.min(all.length - 1, i + CTX); j++) keep[j] = true;
  });

  const rows: DiffRow[] = [];
  let chars = 0;
  let elidedContext = 0;
  let shownAdds = 0;
  let shownDels = 0;
  let truncated = false;

  // Dải co cụm đang mở. Chỉ mở lại khi gặp dòng thay đổi được giữ — cùng mốc
  // ngắt dải với `renderUnifiedDiff`.
  let open = false;
  let gapSame = 0;
  let gapAdds = 0;
  let gapDels = 0;
  const flush = () => {
    if (!open) return;
    rows.push({ kind: 'elision', same: gapSame, adds: gapAdds, dels: gapDels });
    elidedContext += gapSame;
    open = false;
    gapSame = 0;
    gapAdds = 0;
    gapDels = 0;
  };

  // Vị trí dừng khi trần render bị chạm. Mọi thứ từ đây tới hết đều CHƯA được
  // kể vào `gap*`, nên phần đuôi chỉ cần quét từ `cutAt` — quét lại từ 0 sẽ
  // cộng hai lần các dải đã flush trước đó và băng cảnh báo báo sai số.
  let cutAt = -1;

  for (let i = 0; i < all.length; i++) {
    const line = all[i];

    if (!keep[i]) {
      open = true;
      if (line.type === 'same') gapSame += 1;
      else if (line.type === 'add') gapAdds += 1;
      else gapDels += 1;
      continue;
    }

    if (line.type !== 'same') flush();

    const cost = line.text.length + 3;
    if (chars + cost > COMPACT_MAX_CHARS || rows.length >= COMPACT_MAX_ROWS) {
      truncated = true;
      cutAt = i;
      break;
    }
    chars += cost;
    rows.push({ kind: 'line', line });
    if (line.type === 'add') shownAdds += 1;
    else if (line.type === 'del') shownDels += 1;
  }

  if (!truncated) {
    flush();
  } else {
    /*
     * Phần đuôi bị cắt: dòng `same` chưa giữ vẫn chỉ là ngữ cảnh (đếm vào
     * `gapSame`), còn dòng `add`/`del` là THAY ĐỔI bị khuất — đếm riêng để
     * băng cảnh báo báo đúng số thay đổi người dùng chưa thấy.
     *
     * `gap*` đang giữ dải chưa flush NGAY TRƯỚC chỗ cắt, nên nó được giữ nguyên
     * và chỉ bổ sung phần còn lại từ `cutAt` — quét lại từ 0 sẽ cộng hai lần
     * các dải đã flush và băng cảnh báo sẽ báo số dòng không đổi vượt quá tổng
     * số dòng của file.
     *
     * `open = true` là BẮT BUỘC: `flush()` bỏ qua khi `open` false, mà tại
     * chỗ cắt `open` thường đã false (dòng được giữ ngay trước đó đã đóng
     * dải). Không mở lại thì phần đuôi đếm xong rồi bị ném đi — và đây đúng là
     * trường hợp tệ nhất: model viết lại toàn bộ file, không có `same` nào để
     * gom, nên phần đuôi bị cắt sẽ im lặng mất.
     */
    for (let i = cutAt; i < all.length; i++) {
      if (keep[i]) continue;
      open = true;
      if (all[i].type === 'same') gapSame += 1;
      else if (all[i].type === 'add') gapAdds += 1;
      else gapDels += 1;
    }
    flush();
  }

  return {
    all,
    rows,
    totalAdds,
    totalDels,
    truncated,
    elidedContext,
    hiddenAdds: totalAdds - shownAdds,
    hiddenDels: totalDels - shownDels,
    fullClipped: all.length > FULL_MAX_ROWS,
  };
}

/** Nhãn cho dải bị gộp — số phải nằm ngay trên dấu `⋯`. */
function elisionLabel(row: Extract<DiffRow, { kind: 'elision' }>): string {
  const parts: string[] = [];
  if (row.same > 0) parts.push(`${row.same.toLocaleString('vi-VN')} dòng không đổi`);
  if (row.dels > 0) parts.push(`−${row.dels.toLocaleString('vi-VN')} dòng bị xoá`);
  if (row.adds > 0) parts.push(`+${row.adds.toLocaleString('vi-VN')} dòng thêm`);
  return parts.join(' · ');
}

export interface DiffConfirmState {
  open: boolean;
  path: string;
  oldText: string;
  newText: string;
  /** resolve(true) = Apply, resolve(false) = Discard. */
  resolve: (approved: boolean) => void;
}

export function DiffConfirm({
  state,
  onClose,
}: {
  state: DiffConfirmState | null;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const view = useMemo(() => {
    if (!state?.open) return null;
    return buildDiffView(state.oldText, state.newText);
  }, [state]);

  /* Hook PHẢI gọi trước mọi early-return (rules-of-hooks). */
  const haptics = useHaptics();

  const decide = (approved: boolean) => {
    if (approved) haptics.trigger('success');
    state?.resolve(approved);
    onClose();
  };

  useFocusTrap(containerRef, {
    active: Boolean(state?.open && view),
    onEscape: () => decide(false),
    initialFocusSelector: '[data-diff-discard]',
  });

  /*
   * Sao chép phải là lối thoát KHÔNG bị cắt: `contextLines: 0` để KHÔNG co
   * cụm (bản sao là toàn bộ thay đổi, không phải bản đã rút gọn) và `maxChars`
   * bằng vô cùng để `renderUnifiedDiff` không chèn `… [đã cắt]`.
   *
   * `contextLines: 0` là khác lựa chọn mặc định của `renderUnifiedDiff` (2) —
   * mặc định đó gộp dải `same` dài thành `…` và biến bản sao thành bản rút
   * gọn, tức lối thoát duy nhất lại bị cắt đúng như cái ta đang tránh.
   *
   * `.catch` không phải cho đẹp: nếu clipboard bị từ chối mà không bắt, ta
   * hiện dấu "đã sao chép" trong khi clipboard vẫn trống — tức dấu hiệu an
   * toàn báo sai, và người dùng tin theo thì mất phần diff họ cần xem.
   */
  const handleCopy = () => {
    if (!view) return;
    const full = renderUnifiedDiff(view.all, { contextLines: 0, maxChars: Number.MAX_SAFE_INTEGER });
    navigator.clipboard
      .writeText(full.text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  if (!state?.open || !view || typeof document === 'undefined') return null;

  const isNewFile = state.oldText === '';
  const hiddenChanges = view.hiddenAdds + view.hiddenDels;
  const bodyRows: DiffRow[] = showFull
    ? view.all
        .slice(0, FULL_MAX_ROWS)
        .map((line) => ({ kind: 'line', line }) as DiffRow)
    : view.rows;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-confirm-title"
      className={`fixed inset-0 ${Z_CLASS.approval} flex items-end sm:items-center justify-center bg-sunken/75 p-3 sm:p-4`}
      onClick={() => decide(false)}
    >
      {/*
       * PHẲNG, không kính. `.glass-panel` ép `box-shadow` drop-shadow bằng
       * `!important` — thứ hợp đồng token cấm, vì chỉ `shadow-lift-lg` /
       * `shadow-lift-sm` được sinh bóng. Modal là tầng trên cùng nên
       * `bg-overlay` + bóng ngoài đã đủ tách khỏi nền (cùng cách làm với
       * settings-dialog).
       */}
      <div
        className="relative mb-2 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden lift-lg rounded-2xl border border-default bg-overlay font-sans shadow-lift-lg animate-pop-in sm:mb-0 sm:max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-subtle bg-raised px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-sunken text-accent">
              <FileCode className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 id="diff-confirm-title" className="text-ui font-semibold text-primary">
                  {isNewFile ? 'Tạo File Mới' : 'Ghi Đè File'}
                </h2>
                <span className="font-sans text-micro text-tertiary" aria-hidden="true">
                  •
                </span>
                <span className="font-mono text-meta text-accent">fs_write</span>
              </div>
              <div className="truncate font-mono text-ui text-secondary" title={state.path}>
                {state.path}
              </div>
            </div>
          </div>

          <div className="flex flex-none items-center gap-2">
            {/* Số đếm nói về TOÀN BỘ thay đổi, không phải phần đang hiện. */}
            <div
              className="flex items-center gap-1.5 rounded-lg border border-subtle bg-sunken px-2.5 py-1.5 font-sans text-meta"
              title={`So với nội dung hiện tại: ${view.totalAdds} dòng thêm, ${view.totalDels} dòng bị xoá`}
            >
              <span className="font-semibold text-diff-add">+{view.totalAdds}</span>
              <span className="text-disabled" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-diff-del">−{view.totalDels}</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              title="Sao chép TOÀN BỘ diff (kể cả phần đang bị ẩn)"
              aria-label="Sao chép toàn bộ diff, kể cả phần đang bị ẩn"
              className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-raised text-secondary transition-colors after:absolute after:-inset-[8px] after:content-[''] hover:border-strong hover:bg-overlay hover:text-primary"
            >
              {copied ? (
                <CheckCheck className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/*
         * Băng cảnh báo — CHỈ hiện khi thật sự có thứ đang bị ẩn. Một băng luôn
         * bật sẽ dạy người dùng bỏ qua nó, và băng phải phân biệt được hai
         * kiểu ẩn: `elidedContext` là ngữ cảnh (mở ra được), `hiddenChanges`
         * là thay đổi thật (cũng mở ra được, nhưng khác tầm quan trọng).
         *
         * File MỚI (`oldText === ''`) không qua trần 200 dòng của caller, nên
         * một lần tạo file 5.000 dòng hoàn toàn hợp lệ về phía gọi — băng phải
         * nói thẳng đây là TẠO MỚI chứ không lặp lại chuyện "ghi đè file lớn".
         */}
        {(view.elidedContext > 0 || view.truncated) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-subtle bg-raised px-4 py-1.5 sm:px-5">
            <TriangleAlert className="h-3.5 w-3.5 flex-none text-warning" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-meta leading-relaxed text-secondary">
              {view.truncated ? (
                <>
                  <span className="font-semibold text-warning">
                    {hiddenChanges.toLocaleString('vi-VN')} dòng thay đổi chưa hiện
                    {view.hiddenAdds > 0 && ` (gồm +${view.hiddenAdds.toLocaleString('vi-VN')}`}
                    {view.hiddenAdds > 0 && view.hiddenDels > 0 && ' / '}
                    {view.hiddenDels > 0 && `−${view.hiddenDels.toLocaleString('vi-VN')})`}
                  </span>
                  {' · '}
                  khung này cắt ở {COMPACT_MAX_CHARS.toLocaleString('vi-VN')} ký tự. Bấm &ldquo;Xem
                  toàn bộ&rdquo; hoặc &ldquo;Sao chép&rdquo; để xem/cất phần chưa hiện — nội dung ghi xuống
                  đĩa KHÔNG bị cắt.
                </>
              ) : (
                <>
                  {view.elidedContext.toLocaleString('vi-VN')} dòng không đổi đã được gộp lại (ngữ
                  cảnh thôi).
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setShowFull((v) => !v)}
              aria-pressed={showFull}
              data-diff-fulltoggle=""
              className="flex flex-none items-center gap-1.5 rounded-lg border border-default bg-sunken px-2.5 py-1.5 text-meta text-secondary transition-colors hover:border-strong hover:text-primary"
            >
              {showFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showFull ? 'Thu gọn' : 'Xem toàn bộ'}
            </button>
          </div>
        )}

        {/* Diff content view */}
        <div className="flex-1 overflow-auto bg-sunken">
          {bodyRows.map((row, idx) => {
            if (row.kind === 'elision') {
              return (
                <div
                  key={`gap-${idx}`}
                  className="flex items-center gap-2 border-l-2 border-l-subtle bg-base py-1 pl-4 pr-3 font-mono text-micro text-tertiary"
                >
                  <span aria-hidden="true">⋯</span>
                  <span>{elisionLabel(row)}</span>
                </div>
              );
            }

            const { type, text } = row.line;
            return (
              <div
                key={idx}
                className={`flex items-start border-l-2 py-0.5 pl-0 pr-3 font-mono text-ui leading-tight ${
                  type === 'add'
                    ? 'border-l-diff-add bg-diff-add/10'
                    : type === 'del'
                      ? 'border-l-diff-del bg-diff-del/10'
                      : 'border-l-transparent'
                }`}
              >
                {/*
                 * Dấu +/- ở CỘT RIÊNG, không lẫn vào nội dung: quét dọc cột
                 * này là đọc "dòng nào bị đụng". Không `aria-hidden` — ký tự
                 * `+` / `−` đọc thành tiếng chính là kênh phi-màu, và nội
                 * dung bên cạnh giữ màu. Vẫn KHÔNG bao giờ render HTML.
                 */}
                <span
                  className={`w-6 flex-none select-none pl-2 text-center font-bold ${
                    type === 'add' ? 'text-diff-add' : type === 'del' ? 'text-diff-del' : 'text-transparent'
                  }`}
                >
                  {type === 'add' ? '+' : type === 'del' ? '−' : ' '}
                </span>
                <span
                  className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${
                    type === 'add' ? 'text-diff-add' : type === 'del' ? 'text-diff-del' : 'text-diff-ctx'
                  }`}
                >
                  {text || ' '}
                </span>
              </div>
            );
          })}

          {showFull && view.fullClipped && (
            <p className="border-t border-subtle bg-raised px-4 py-2 font-sans text-meta text-warning">
              File có {view.all.length.toLocaleString('vi-VN')} dòng — khung này chỉ render
              {` ${FULL_MAX_ROWS.toLocaleString('vi-VN')}`} dòng đầu. Phần còn lại lấy đầy đủ qua
              nút &ldquo;Sao chép&rdquo;; nội dung ghi xuống đĩa không bị cắt.
            </p>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between gap-3 border-t border-subtle bg-raised px-4 py-3 sm:px-5">
          {/*
            * Nhãn phím tắt phải CÙNG NGÔN NGỮ với phần còn lại của hộp thoại.
            * Trước đây khối này trộn `reject` và `then ↵ on the chosen button`
            * vào giữa một UI tiếng Việt — §15.4 điểm 17 gọi đó là lỗi, không
            * phải chi tiết: đây đúng là chỗ người dùng phải quyết định, nên câu
            * chữ ở đây không được bắt họ dịch.
            */}
          <div className="hidden items-center gap-2 font-sans text-meta text-tertiary sm:flex">
            <span className="flex items-center gap-1">
              <kbd className="rounded-full border border-subtle bg-sunken px-2 py-0.5 text-micro text-secondary">
                Esc
              </kbd>
              <span>từ chối</span>
            </span>
            <span className="text-disabled" aria-hidden="true">
              •
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded-full border border-subtle bg-sunken px-2 py-0.5 text-micro text-secondary">
                Tab
              </kbd>
              <span>rồi ↵ ở nút đang chọn</span>
            </span>
          </div>

          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button
              ref={discardRef}
              data-diff-discard=""
              type="button"
              onClick={() => decide(false)}
              className="flex items-center justify-center gap-1.5 lift-sm rounded-lg border border-default bg-raised px-4 py-2 text-ui font-medium text-secondary transition-all hover:border-strong hover:text-primary active:scale-[0.98]"
            >
              <X size={14} />
              <span>[ Esc ] Từ chối</span>
            </button>
            <button
              type="button"
              onClick={() => decide(true)}
              className="flex items-center justify-center gap-1.5 lift-sm rounded-lg bg-success px-4 py-2 text-ui font-semibold text-on-fill shadow-lift-sm transition-all hover:bg-success/85 active:scale-[0.98]"
            >
              <Check size={14} />
              <span>{isNewFile ? 'Duyệt & Tạo File' : 'Duyệt & Ghi Đĩa'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
