'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error] Đã xảy ra lỗi giao diện:', error);
  }, [error]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 rounded-xl bg-sunken p-4 text-center font-sans text-primary">
      <div className="w-full max-w-md lift-lg rounded-xl border border-default bg-surface p-6 shadow-lift-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-subtle bg-warning/10 text-warning">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="mb-1 text-base font-semibold text-primary">
          Không thể tải không gian làm việc
        </h1>
        {/*
          `error.message` KHÔNG phải thông tin duy nhất cần có: ở production
          server path Next thay nó bằng chuỗi chung, chỉ `digest` mới nối được
          về log server; ở client-component path nó là message thật (có thể chứa
          đường dẫn file / URL upstream) nên vẫn in ra — đây là công cụ desktop
          cho dev, không phải site công khai. Digest hiện dưới message để dev
          đối chiếu log mà không phải copy tay.
        */}
        <div className="mb-5">
          <p className="text-xs leading-relaxed text-secondary">
            {error?.message ||
              'Giao diện gặp sự cố khi dựng trang. Bạn có thể thử lại hoặc tải lại ứng dụng.'}
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
            className="rounded-lg border border-default bg-accent/20 px-4 py-2 text-xs font-semibold text-accent transition-all hover:bg-accent/30 active:scale-[0.98]"
          >
            Thử lại
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="rounded-lg border border-default bg-raised px-4 py-2 text-xs font-medium text-secondary transition-all hover:bg-overlay hover:text-primary active:scale-[0.98]"
          >
            Tải lại trang
          </button>
        </div>
      </div>
    </div>
  );
}
