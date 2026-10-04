/**
 * React Adapter — useAgentRuntime hook (Tầng 2).
 *
 * Nhiệm vụ:
 * 1. Kết nối AgentRuntimeActor với React 18/19 thông qua `useSyncExternalStore`.
 * 2. Tự động khởi tạo và dọn dẹp Actor theo `chatId`, chống rò rỉ bộ nhớ & stale closure.
 * 3. Tích hợp Web Locks API qua `TabLockCoordinator` phân quyền đa tab LEADER / OBSERVER.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AgentRuntimeActor } from '@/core/agent-runtime/runtime-actor';
import { TurnContext, TurnEvent, TurnState } from '@/core/agent-runtime/types';
import { TabLockCoordinator, TabRuntimeMode } from '@/core/agent-runtime/tab-lock';
import { getOrCreateActor } from '@/core/agent-runtime/actor-registry';

/**
 * Trạng thái quyền của tab ở tầng UI.
 *
 * `TabRuntimeMode` của core chỉ có hai giá trị và cả hai đều là KHẳNG ĐỊNH:
 * tab này là tab chính, hoặc tab này chỉ đọc. Lúc mount, hook chưa hỏi được
 * `TabLockCoordinator` là mình đang giữ lock hay chưa — nhưng UI đã cần một
 * giá trị để render. Trả về `'LEADER'` lúc đó là NÓI DỐI: nó khẳng định một
 * quyền chưa tồn tại, và khi `acquireRuntimeLock` resolve chậm hoặc reject,
 * state nhảy LEADER → OBSERVER ngay trước mặt người dùng, mất cả ô nhập.
 *
 * `'ACQUIRING'` là câu trả lời trung thực cho lúc đó: chưa ai hỏi xong.
 */
export type TabRuntimeState = TabRuntimeMode | 'ACQUIRING';

/**
 * Trạng thái ban đầu, tính từ chính options nên render đầu tiên ở server và
 * client GIỐNG HỆT NHAU (không đụng `navigator`) — không dính hydration
 * mismatch.
 *
 * CHỈ `autoAcquireLock` quyết định state này. `chatId` nằm trong options nhưng
 * cố ý không được xét, vì `LEADER` là kết luận của một grant, mà grant chỉ chạy
 * khi có `chatId` để khóa. Thiếu `chatId` lúc mount không phải "không cần điều
 * phối", nó là "chưa hỏi được ai": effect vẫn sẽ hỏi ngay khi `chatId` tới.
 * Trả LEADER ở đó là khẳng định một quyền chưa tồn tại — hai tab cùng mount
 * trước khi chat id hydrate đều tự nhận là tab chính, rồi cả hai đều không
 * giành lại được vì `forceStealLock` cũng early-return khi `!chatId`.
 *
 * `autoAcquireLock: false` là chuyện khác: đó là quyết định của caller, không
 * có điều phối và không có miền lock nào, nên "tab này không nằm dưới quyền
 * tab nào" là kết luận đúng, và người dùng phải gõ được. Ở nhánh đó LEADER là
 * chính sáng, không phải phỏng đoán.
 */
export function initialTabRuntimeState({
  autoAcquireLock,
}: {
  chatId: string;
  autoAcquireLock: boolean;
}): TabRuntimeState {
  return autoAcquireLock ? 'ACQUIRING' : 'LEADER';
}

/**
 * Kết quả của MỘT lần giành quyền (acquire lúc mount, hoặc steal lúc người
 * dùng bấm nút). `requestId` đánh số thứ tự phát ra; `error` nghĩa là lần
 * giành quyền đó nổi thay vì trả về mode.
 */
export type LockGrant =
  | { requestId: number; mode: TabRuntimeMode }
  | { requestId: number; error: unknown };

/**
 * Quy tắc thuần duy nhất để biến kết quả lock thành state hiển thị.
 *
 * Hai điều kiện, cả hai đều là bản sửa lỗi "LEADER rồi lùi về OBSERVER":
 *
 * 1. Chỉ một grant mang `mode: 'LEADER'` mới đặt được state thành LEADER. Lúc
 *    mount state là ACQUIRING, nên một `acquireRuntimeLock` resolve chậm rồi
 *    trả về OBSERVER không bao giờ khiến UI tự nhận là tab chính.
 * 2. Grant cũ hơn lần giành quyền mới nhất bị bỏ qua. Không có cái này thì
 *    người dùng bấm "Chiếm quyền điều khiển" lúc acquire đầu tiên còn đang
 *    bay, steal xong đã lên LEADER, rồi promise cũ resolve OBSERVER và ghi đè
 *    — tab mất quyền ngay sau khi vừa giành được, không có gì để bấm lại.
 */
export function reduceTabRuntimeState(
  current: TabRuntimeState,
  latestRequestId: number,
  grant: LockGrant,
): TabRuntimeState {
  if (grant.requestId !== latestRequestId) return current;
  // Lần giành quyền nổi: hạ xuống OBSERVER, không phải ACQUIRING — đó là
  // trạng thái người dùng hành động được (nút chiếm quyền vẫn hiện).
  if ('error' in grant) return 'OBSERVER';
  return grant.mode;
}

export interface UseAgentRuntimeOptions {
  chatId: string;
  activeLeafId?: string;
  autoAcquireLock?: boolean;
}

export interface UseAgentRuntimeReturn {
  state: TurnState;
  context: TurnContext;
  tabMode: TabRuntimeState;
  isLeader: boolean;
  isAcquiring: boolean;
  isLeaderFrozen: boolean;
  forceStealLock: () => void;
  actor: AgentRuntimeActor;
  send: (event: TurnEvent) => void;
  startTurn: (activeLeafId?: string) => void;
  stopTurn: () => void;
  approveTool: (toolCallId: string, token: string) => void;
  denyTool: (toolCallId: string, reason?: string) => void;
}

export {
  MAX_ACTIVE_ACTORS,
  LruActorRegistry,
  actorRegistry,
  getActor,
  clearActorRegistry,
  getOrCreateActor,
} from '@/core/agent-runtime/actor-registry';

export function useAgentRuntime({
  chatId,
  activeLeafId = '',
  autoAcquireLock = true,
}: UseAgentRuntimeOptions): UseAgentRuntimeReturn {
  // Lấy hoặc tạo Actor singleton tương ứng với chatId
  const actor = useMemo(() => getOrCreateActor(chatId, activeLeafId), [chatId]);

  // Cập nhật activeLeafId vào Actor khi đổi nhánh
  useEffect(() => {
    if (activeLeafId && actor.getContext().activeLeafId !== activeLeafId) {
      actor.updateActiveLeaf(activeLeafId);
    }
  }, [actor, activeLeafId]);

  // Điều phối Multi-Tab Concurrency qua Web Locks API & BroadcastChannel Heartbeat
  const [tabMode, setTabMode] = useState<TabRuntimeState>(() =>
    initialTabRuntimeState({ chatId, autoAcquireLock }),
  );
  const [isLeaderFrozen, setIsLeaderFrozen] = useState(false);
  const lockCoordinatorRef = useRef<TabLockCoordinator | null>(null);
  /**
   * Mỗi lần giành quyền nhận một số thứ tự. `reduceTabRuntimeState` bỏ qua kết
   * quả cũ hơn số này, nên kết quả về sau không còn ghi đè được trạng thái
   * của một lần giành quyền mới hơn (xem `reduceTabRuntimeState`).
   */
  const lockRequestIdRef = useRef(0);

  /** Ghi một kết quả lock, bỏ qua nếu nó đã cũ hơn lần giành quyền mới nhất. */
  const applyLockGrant = useCallback((grant: LockGrant) => {
    setTabMode((current) => reduceTabRuntimeState(current, lockRequestIdRef.current, grant));
  }, []);

  useEffect(() => {
    if (!autoAcquireLock || !chatId) return;

    let mounted = true;
    const requestId = ++lockRequestIdRef.current;
    const coordinator = new TabLockCoordinator();
    lockCoordinatorRef.current = coordinator;

    // Sang chat khác thì trạng thái của chat cũ không còn ý nghĩa gì: quyền
    // của chat trước không suy ra được quyền của chat này.
    setTabMode('ACQUIRING');
    setIsLeaderFrozen(false);

    coordinator.onLeaderFrozen((frozen) => {
      if (mounted) setIsLeaderFrozen(frozen);
    });

    coordinator
      .acquireRuntimeLock(
        chatId,
        () => {
          if (mounted) {
            setIsLeaderFrozen(false);
          }
          applyLockGrant({ requestId, mode: 'LEADER' });
        },
        () => applyLockGrant({ requestId, mode: 'OBSERVER' }),
      )
      .then((mode) => applyLockGrant({ requestId, mode }))
      .catch((error) => {
        // `bumpEpoch` hỏng làm promise reject. Không nuốt: log để còn truy vết
        // được, rồi hạ xuống OBSERVER — trạng thái người dùng vẫn hành động
        // được chứ không kẹt ở ACQUIRING vô hạn.
        console.error('[useAgentRuntime] không giành được lock runtime', error);
        applyLockGrant({ requestId, error });
      });

    return () => {
      mounted = false;
      // Vô hiệu hoá mọi kết quả của lần giành quyền đang bay, kể cả sau unmount.
      lockRequestIdRef.current = Math.max(lockRequestIdRef.current, requestId + 1);
      // Ref chỉ được trỏ tới một coordinator CÒN SỐNG. `dispose()` đóng
      // BroadcastChannel và abort controller, nên coordinator cũ không còn gửi
      // được FORCE_YIELD cho tab chính — `forceStealLock` gọi vào nó sẽ cưỡng
      // chế lock mà tab kia không hề hay biết phải nhường.
      lockCoordinatorRef.current = null;
      coordinator.dispose();
    };
  }, [chatId, autoAcquireLock, applyLockGrant]);

  const forceStealLock = useCallback(() => {
    const coordinator = lockCoordinatorRef.current;
    if (!chatId || !coordinator) return;

    const requestId = ++lockRequestIdRef.current;
    // Đang xin quyền thì chưa có quyền nào: ACQUIRING, không phải giữ LEADER
    // cũ (hoặc OBSERVER) trong lúc chờ.
    setTabMode('ACQUIRING');

    coordinator
      .forceStealLock(
        chatId,
        () => {
          setIsLeaderFrozen(false);
          applyLockGrant({ requestId, mode: 'LEADER' });
        },
        () => applyLockGrant({ requestId, mode: 'OBSERVER' }),
      )
      .then((mode) => applyLockGrant({ requestId, mode }))
      .catch((error) => {
        // `.then` không có `.catch` là unhandled rejection. Hạ xuống OBSERVER để
        // người dùng bấm lại được, và log để không mất dấu vết.
        console.error('[useAgentRuntime] cưỡng chế giành lock thất bại', error);
        applyLockGrant({ requestId, error });
      });
  }, [chatId, applyLockGrant]);

  // Đồng bộ trạng thái Actor vào React bằng useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return actor.subscribe(() => {
        onStoreChange();
      });
    },
    [actor],
  );

  const getSnapshot = useCallback(() => {
    return actor.getSnapshot();
  }, [actor]);

  const getServerSnapshot = useCallback(() => {
    return actor.getSnapshot();
  }, [actor]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Điều phối Event Wrappers
  const send = useCallback(
    (event: TurnEvent) => {
      actor.send(event);
    },
    [actor],
  );

  const startTurn = useCallback(
    (targetLeafId?: string) => {
      actor.send({
        type: 'START_TURN',
        chatId,
        activeLeafId: targetLeafId || activeLeafId,
      });
    },
    [actor, chatId, activeLeafId],
  );

  const stopTurn = useCallback(() => {
    actor.send({ type: 'STOP' });
  }, [actor]);

  const approveTool = useCallback(
    (toolCallId: string, token: string) => {
      actor.send({
        type: 'USER_APPROVE',
        toolCallId,
        token,
      });
    },
    [actor],
  );

  const denyTool = useCallback(
    (toolCallId: string, reason?: string) => {
      actor.send({
        type: 'USER_DENY',
        toolCallId,
        reason,
      });
    },
    [actor],
  );

  return {
    state: snapshot.state,
    context: snapshot.context,
    tabMode,
    isLeader: tabMode === 'LEADER',
    isAcquiring: tabMode === 'ACQUIRING',
    isLeaderFrozen,
    forceStealLock,
    actor,
    send,
    startTurn,
    stopTurn,
    approveTool,
    denyTool,
  };
}
