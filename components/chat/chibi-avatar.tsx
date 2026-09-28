'use client';

/**
 * Avatar chibi vẽ tay — hai mặt, mỗi mặt một nét khác nhau.
 *
 * KHÔNG dùng emoji và KHÔNG dùng ảnh: emoji render theo font của hệ điều hành
 * nên mỗi máy một sắc, còn SVG thì luôn giữ đúng một nét mực — đó mới là điều
 * cần cho một giao diện mà mọi đường viền đều là nét vẽ tay.
 *
 * Vì sao chỉ 2 mặt: đây là hệ thống MỘT-NGUỒN như bảng màu — mỗi vai trò một
 * token. Thêm mặt thứ ba là thêm một cách vẽ cùng một việc. Người đọc nhận
 * ra ai nói ngay từ hình, không cần đọc nhãn.
 */
export function ChibiAvatar({
  side,
  className = '',
}: {
  /** `user` = bạn (tròn, hai chấm mắt) · `bot` = Vyen (vuông-vòng, mắt chấm) */
  side: 'user' | 'bot';
  className?: string;
}) {
  const ink = 'rgb(var(--border-strong))';
  const isUser = side === 'user';

  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      aria-hidden="true"
      className={`flex-shrink-0 ${className}`}
    >
      {/*
        Nét mực 1.9px bo tròn: độ dày này khớp `.uic` và nhẹ hơn nét viền 2px
        của container, nên chibi đọc là "bản vẽ nhỏ" chứ không phải "khối thứ hai".
      */}
      <g stroke={ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {isUser ? (
          <>
            {/* Đầu tròn hơi lệch — tròn hoàn hảo thì thành icon app, không thành vẽ tay */}
            <path d="M12 4.2c4.1 0 7 2.8 7 6.4 0 3.6-3.1 6.3-7 6.3-3.9 0-7-2.7-7-6.3 0-3.6 2.9-6.4 7-6.4Z" fill="rgb(var(--accent-mint) / 0.35)" />
            {/* Mắt: hai chấm nghiêng nhẹ, như mắt khi đang nhìn */}
            <path d="M9.4 11.1h.01M14.6 11.1h.01" strokeWidth="2.6" />
            {/* Cười: một nét cong duy nhất */}
            <path d="M9.7 14.1c1.3 1.2 3.3 1.2 4.6 0" />
          </>
        ) : (
          <>
            {/* Vuông-vòng: một nét góc vát ở gáy, khác hẳn hình tròn của user */}
            <path d="M6.6 7.4 9 5.2h6l2.4 2.2v8.4l-2.4 2.2H9l-2.4-2.2V7.4Z" fill="rgb(var(--accent-mint) / 0.5)" />
            {/* Mắt: hai chấm đặc, "máy" hơn "người" */}
            <path d="M9.3 11.6h.01M14.7 11.6h.01" strokeWidth="2.6" />
            {/* Miệng: nét ngang, không cười — bot không diễn cảm */}
            <path d="M9.9 14.4h4.2" />
          </>
        )}
      </g>
    </svg>
  );
}
