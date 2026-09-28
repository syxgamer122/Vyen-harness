'use client';

/*
 * global-error phải tự mang style của nó (docs: "define its own `<html>` and
 * `<body>` tags, global styles, fonts, or other dependencies"). Next KHÔNG nạp
 * global styles vào trang này: build cho `entryCSSFiles` của app/global-error
 * là mảng rỗng, và global-error thay root layout nên cũng không kế thừa được
 * `import './globals.css'` của app/layout.tsx. Không dòng import này thì mọi
 * class bên dưới không có CSS nào áp dụng → crash screen rơi về nền trắng mặc
 * định của trình duyệt, tức là đúng lúc cần đọc nhất thì lại không đọc được.
 * Sau khi import, Next gắn đúng stylesheet đó vào trang global-error.
 */
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    /*
     * global-error thay THẾ root layout, nên nó phải tự mang `<html>`/`<body>`,
     * style riêng và theme riêng (không kế thừa gì từ app/layout.tsx).
     */
    <html lang="vi">
      {/*
        Màu nền đặt thêm inline, không chỉ dựa vào class: trước first-paint
        stylesheet chưa kịp về, mà không có màu nền nào thì chữ đậm trên nền
        trắng của trình duyệt là không đọc được. Hai giá trị ở đây cố ý
        hardcode, không lấy từ token.
      */}
      <body
        className="flex h-dvh flex-col items-center justify-center rounded-xl bg-sunken p-4 font-sans text-primary"
        style={{ backgroundColor: '#f2f2ef', color: '#18181b' }}
      >
        <div className="w-full max-w-md lift-lg rounded-ink border-2 border-default bg-surface p-6 text-center shadow-lift-lg">
          <h1 className="mb-1 text-base font-semibold text-primary">
            Sự cố ứng dụng ngoài dự kiến
          </h1>
          {/*
            Lỗi tầng gốc hầu như luôn đến từ server path: ở production Next thay
            `message` bằng chuỗi chung, nên `digest` mới là thứ duy nhất nối
            được màn hình này về log server.
          */}
          <div className="mb-5">
            <p className="text-xs leading-relaxed text-secondary">
              {error?.message || 'Đã có lỗi nghiêm trọng xảy ra ở tầng gốc ứng dụng.'}
            </p>
            {error?.digest ? (
              <p className="mt-1 break-all font-mono text-micro text-tertiary">
                Mã lỗi (digest): {error.digest}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg border border-default bg-accent/20 px-4 py-2 text-xs font-semibold text-accent transition-all hover:bg-accent/30"
            >
              Khôi phục phiên
            </button>
            {/*
              KHÔNG điều hướng về '/': global-error tồn tại vì root layout vỡ, nên
              điều hướng về chính route đó chỉ dựng lại layout vỡ và báo lỗi lần
              hai. Tải lại là cách duy nhất thoát ra ngoài lỗi này.
            */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              className="rounded-lg border border-default bg-raised px-4 py-2 text-xs font-medium text-secondary transition-all hover:bg-overlay hover:text-primary"
            >
              Tải lại ứng dụng
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
