"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCcw, AlertTriangle } from "lucide-react";

interface ChatErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  /**
   * Đổi giá trị này để tự xoá trạng thái lỗi (vd: nội dung message).
   * Không có nó, một lần render lỗi là bubble kẹt ở fallback mãi mãi —
   * kể cả khi content đầy đủ/correct đã về, vì instance giữ nguyên theo
   * key (message id) của list ảo. Xem `error-boundary.tsx` cùng pattern.
   */
  resetKey?: unknown;
}

interface ChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  lastResetKey?: unknown;
}

export class ChatErrorBoundary extends Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, lastResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  static getDerivedStateFromProps(
    props: ChatErrorBoundaryProps,
    state: ChatErrorBoundaryState,
  ): Partial<ChatErrorBoundaryState> | null {
    if (props.resetKey !== state.lastResetKey) {
      return { hasError: false, error: null, lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[chat-tree] render error caught:", error, errorInfo);
  }

  handleRetry = () => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      lastResetKey: this.props.resetKey,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          className="mx-auto my-4 max-w-xl lift-sm rounded-lg border border-danger/40 bg-raised p-5 text-xs font-mono text-text-primary"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" />
            <div className="flex-1 space-y-1.5">
              <p className="font-semibold text-status-error">
                Lỗi hiển thị nội dung tin nhắn
              </p>
              <p className="text-text-muted">
                {this.state.error?.message ||
                  "Đã xảy ra lỗi không mong muốn khi hiển thị phần này của cây tin nhắn."}
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="btn-secondary inline-flex items-center gap-1.5 border border-danger/40 text-status-error hover:bg-danger/10 px-3 py-1.5 font-medium"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  <span>Thử lại</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
