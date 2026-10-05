'use client';

import { ApprovalQueue } from '@/lib/approval-queue';
import { useAgentRuntime } from '@/react/use-agent-runtime';
import { useApprovalBridge } from '@/react/use-approval-bridge';
import { useChatOrchestration } from '@/react/use-chat-orchestration';

import { StatusLine } from '@/components/chat/status-line';
import { MessageList } from '@/components/chat/message-list';
import { SessionRail } from '@/components/chat/session-rail';
import { Composer } from '@/components/composer';
import { AgentHud } from '@/components/hud/agent-hud';
import { DiffConfirm } from '@/components/diff-confirm';
import { ShellConfirm } from '@/components/shell-confirm';
import { McpToolApprovalDialog } from '@/components/mcp/tool-approval-dialog';
import { StagingPanel } from '@/components/staging-panel';
import { ToolsPanel } from '@/components/tools-panel';
import { RecipesPanel } from '@/components/recipes/recipes-panel';
import { ToastHost } from '@/components/toast';
import { WorkspaceCheckpointBar } from '@/components/workspace-checkpoints';
import { PlanPanel } from '@/components/plan-panel';
import { stagingCount } from '@/lib/staging';
import { shouldShowThinkingControl } from '@/lib/reasoning-capability';
import { X } from 'lucide-react';

export default function ChatInterface() {
  const orch = useChatOrchestration();

  // Layer 2: useApprovalBridge điều phối hàng đợi phê duyệt modal
  const {
    diffState,
    shellState,
    requestDiffApproval: showDiffModal,
    requestShellApproval: showShellModal,
    closeApproval: closeDiffModal,
    abortAll,
    approvalQueue,
  } = orch.approvalBridge;
  const closeShellModal = closeDiffModal;

  // Layer 2: useAgentRuntime điều phối Web Locks đa tab
  const { isLeader, isAcquiring, isLeaderFrozen, forceStealLock, startTurn, stopTurn } = orch.agentRuntime;

  const handleStop = () => {
    stopTurn();
    abortAll(false);
    orch.handleStop();
  };

  return (
    <div {...orch.swipeHandlers} className="flex h-full flex-col overflow-hidden bg-transparent touch-pan-y">
      {/*
       * Băng khi tab này KHÔNG phải tab chính.
       *
       * Ba trạng thái, ba câu khác nhau, và CẢ BA đều phải để người dùng đi
       * tiếp được:
       *   - ACQUIRING: đang hỏi lock, chưa biết sẽ được hay không.
       *   - Leader bị đóng băng: tab chính còn giữ lock nhưng người dùng đã
       *     chuyển sang tab khác.
       *   - Observer: hỏi xong, tab này không có quyền.
       *
       * Nút chiếm quyền hiện ở CẢ BA, kể cả Observer thuần — không ghim vào
       * trạng thái nào. Trước đây nó chỉ hiện khi `isAcquiring ||
       * isLeaderFrozen`, mà tab thứ hai mở lên là rơi thẳng về Observer
       * (isAcquiring=false, isLeaderFrozen=false): băng hiện mà KHÔNG có nút,
       * không gõ được, không bấm được, effect lúc mount không chạy lại nên
       * phần đời còn lại của phiên cũng vậy. Một trạng thái không có hành
       * động nào là ngõi cụt, và `reduceTabRuntimeState` đã ghi rõ OBSERVER là
       * "trạng thái người dùng hành động được".
       *
       * Bấm ở Observer không sinh ra cuộc giành nhau: `forceStealLock` báo
       * FORCE_YIELD cho tab chính (tab đó tự nhả lock rồi hạ xuống OBSERVER),
       * sau đó mới xin lock với `steal: true`. Tab kia chỉ PHẢN ỨNG, không
       * tự giành, nên phải có người bấm ở cả hai tab thì mới ping-pong — và
       * `reduceTabRuntimeState` bỏ kết quả cũ nên lần bấm sau thắng, không kẹt.
       */}
      {!isLeader && (
        <div
          data-testid="observer-banner"
          className="flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-center font-mono text-xs text-primary"
        >
          <span>
            {isAcquiring
              ? 'Đang giành quyền điều khiển cho tab này...'
              : isLeaderFrozen
                ? 'Tab chính bị đóng băng ở nền.'
                : 'Một tab khác đang giữ quyền điều khiển. Tab này chỉ đọc nên không gõ được.'}
          </span>
          {/*
           * Nền đặc + `text-on-fill`: token này sinh ra là để chữ trên nền tô
           * đậm. Cặp cũ `text-warning` trên `bg-warning/20` chỉ đạt 3.50:1 ở
           * cỡ 10px, dưới ngưỡng 4.5:1 của WCAG AA cho chữ thường.
           */}
          <button
            type="button"
            onClick={forceStealLock}
            className="rounded-sm bg-warning px-2 py-0.5 text-micro font-semibold text-on-fill transition-transform active:scale-[0.98]"
          >
            Chiếm quyền điều khiển
          </button>
        </div>
      )}

      <StatusLine
        onOpenSidebar={orch.onOpenSidebar}
        sidebarCollapsed={orch.isSidebarCollapsed}
        models={orch.MODELS}
        model={orch.model}
        agentMode={orch.agentMode}
        onToggleAgentMode={orch.onToggleAgentMode}
        agentModeDisabled={orch.isLoading}
        workspace={orch.workspace ? { ...orch.workspace, branch: orch.gitBranch } : orch.workspace}
        ctxUsed={orch.contextUsage?.tokens}
        ctxMax={orch.contextUsage?.max}
        thinkingLevel={shouldShowThinkingControl(orch.modelReasoningCap) ? orch.thinkingLevel : undefined}
        thinkingSupportedLevels={orch.modelReasoningCap ? orch.modelReasoningCap.efforts : null}
        onThinkingLevelChange={orch.handleThinkingLevelChange}
        thinkingDisabled={orch.isLoading}
        thinkingMandatory={orch.modelReasoningCap?.mandatory ?? false}
        run={{ streaming: orch.isLoading, webBusy: orch.webBusy }}
        hasMessages={orch.hasMessages}
        canCompact={orch.canCompactNow}
        compactBusy={orch.compactBusy}
        onCompact={orch.onCompact}
        currentChatId={orch.currentChatId}
        confirmClear={orch.confirmClear}
        onSetConfirmClear={orch.setConfirmClear}
        onDeleteChat={orch.deleteChat}
      />

      {orch.swipeDirection && (
        <div
          className={[
            'pointer-events-none fixed top-1/2 z-50 -translate-y-1/2 rounded-full border border-subtle bg-panel-bg px-3.5 py-1.5 font-mono text-xs text-primary animate-pop-in',
            orch.swipeDirection === 'left' ? 'right-4' : 'left-4',
          ].join(' ')}
          aria-live="polite"
        >
          {orch.swipeDirection === 'left' ? 'Nhánh tiếp theo →' : '← Nhánh trước'}
        </div>
      )}

      {/*
       * Hàng nội dung: cột hội thoại + cột phụ. `flex-1 min-w-0` ở cột hội
       * thoại là bắt buộc — không có nó thì `max-w-thread` của message list
       * sẽ đẩy hàng rộng ra và đẩy cột phụ ra khỏi màn hình.
       */}
      <div className="flex flex-1 min-h-0">
        <div className="relative flex min-w-0 flex-1 flex-col">
        <MessageList
          chatId={orch.chatKey}
          messages={orch.messages}
          compaction={orch.activeCompaction}
          branchInfoByMessageId={orch.branchInfoByMessageId}
          isLoading={orch.isLoading}
          lastMessageId={orch.lastMessageId}
          editingId={orch.editingId}
          copiedId={orch.copiedId}
          draft={orch.draft}
          isTouchDevice={orch.isTouchDevice}
          sendOnEnter={orch.sendOnEnter}
          throttleMs={orch.throttleMs}
          error={orch.error}
          isAtBottom={orch.isAtBottom}
          isAtBottomRef={orch.isAtBottomRef}
          pin={orch.pin}
          scrollRef={orch.scrollRef}
          onScroll={orch.onScroll}
          onScrollToBottom={orch.scrollToBottom}
          onCopy={orch.copyMessage}
          onRegenerate={orch.handleRegenerate}
          onSwitchBranch={orch.handleSwitchBranch}
          onStartEdit={orch.startEdit}
          onCancelEdit={orch.cancelEdit}
          onSaveEdit={orch.saveEdit}
          onDraftChange={orch.setDraft}
          onSelectSuggestion={orch.onSelectSuggestion}
          onReload={() =>
            orch.lastMessageId && orch.handleRegenerate(orch.lastMessageId)}
          onContinueGenerating={orch.continueGenerating}
        />

      <aside aria-label="Trạng thái phiên làm việc" className="w-full flex-none">
        {orch.workspaceReconnectRequired && !orch.dismissedReconnect && (
          <div className="mx-auto mb-2 w-full max-w-thread px-4">
            <div className="flex items-center justify-between gap-3 lift-sm rounded-lg border border-subtle bg-raised px-4 py-2.5 text-xs">
              <span className="text-tertiary truncate">
                Phiên này từng dùng workspace <strong className="text-primary font-mono font-medium">{orch.workspace?.name}</strong>. Bạn có muốn kết nối lại để agent truy cập file?
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={orch.reconnectWorkspace}
                  className="bg-accent hover:bg-accent/80 text-on-fill px-2.5 py-1 text-meta font-medium transition-colors cursor-pointer"
                >
                  Kết nối lại
                </button>
                <button
                  type="button"
                  onClick={() => orch.setDismissedReconnect(true)}
                  className="text-tertiary hover:text-primary px-1.5 py-1 text-meta transition-colors cursor-pointer"
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          </div>
        )}

        {/*
         * `rail:hidden` — ở ≥1400px hai khối này chuyển sang cột phụ bên
         * phải (SessionRail). Giữ nguyên ở dưới ngưỡng: đó là chỗ duy nhất
         * chúng xuất hiện khi màn hình hẹp, và `rail:hidden` chỉ khiến chúng
         * biến mất ở màn rộng chứ không đụng tới hành vi màn hẹp.
         */}
        <div className="rail:hidden">
          <WorkspaceCheckpointBar chatId={orch.currentChatId} busy={orch.isLoading} onNotice={orch.showNotice} />

          {orch.plan && !orch.planHidden && (
            <PlanPanel plan={orch.plan} onHide={() => orch.setPlanHidden(true)} canApprove={orch.agentMode === 'plan' && !orch.isLoading} onApprove={orch.handleApprovePlan} />
          )}
        </div>

        {orch.hintsChip && (
          <div className="mx-auto mb-2 w-full max-w-thread px-4">
            <div className="lift-sm rounded-lg border border-subtle bg-raised font-mono text-meta text-tertiary">
              <button
                type="button"
                onClick={() => orch.setShowHints((v) => !v)}
                aria-expanded={orch.showHints}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[accent]"
              >
                <span className="text-accent">gợi ý đã nạp</span>
                <span className="truncate">{orch.hintsChip.file}</span>
                <span className="ml-auto flex-none text-micro text-secondary">{orch.showHints ? 'thu gọn' : 'xem nội dung'}</span>
              </button>
              {orch.showHints && (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-subtle bg-surface px-3 py-2 text-meta leading-relaxed">
                  {orch.hintsChip.content}
                </pre>
              )}
            </div>
          </div>
        )}

        {orch.activeRecallPack && orch.activeRecallPack.items.length > 0 && (
          <div className="mx-auto mb-2 w-full max-w-thread px-4">
            <div className="flex items-center justify-between gap-2 lift-sm rounded-lg border border-subtle bg-raised px-3.5 py-2 text-xs text-primary">
              <button
                type="button"
                onClick={() => orch.setShowRecalledDetail((v) => !v)}
                className="flex items-center gap-1.5 font-medium hover:underline text-ui text-primary"
              >
                <span>Đã nhớ {orch.activeRecallPack.items.length} ghi chú</span>
                <span className="text-micro text-accent">({orch.showRecalledDetail ? 'thu gọn' : 'xem chi tiết'})</span>
              </button>
              <button
                type="button"
                onClick={() => orch.setActiveRecallPack(null)}
                className="rounded-lg p-1 text-tertiary hover:text-primary"
                aria-label="Đóng thông báo ghi nhớ"
              >
                <X size={13} />
              </button>
            </div>

            {orch.showRecalledDetail && (
              <div className="mt-1.5 lift-sm rounded-lg border border-subtle bg-panel-bg p-3 text-xs">
                <div className="mb-1.5 text-meta font-semibold text-primary">
                  Ghi chú đã nạp vào ngữ cảnh ({orch.activeRecallPack.budget.usedTokens}/{orch.activeRecallPack.budget.limitTokens} tokens):
                </div>
                <ul className="space-y-1.5">
                  {orch.activeRecallPack.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-1.5 text-meta text-primary">
                      <span className="text-accent font-bold">•</span>
                      <span className="flex-1 leading-relaxed">{item.text}</span>
                      <span className="shrink-0 text-micro text-tertiary">[{item.why}]</span>
                    </li>
                  ))}
                </ul>
                {orch.activeRecallPack.budget.droppedIds.length > 0 && (
                  <div className="mt-1.5 border-t border-subtle pt-1 text-micro text-tertiary italic">
                    Đã cắt {orch.activeRecallPack.budget.droppedIds.length} ghi chú do giới hạn ngân sách token.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </aside>

      <Composer
        chatId={orch.chatKey}
        onSubmit={async (text, atts) => {
          startTurn();
          return await orch.onSubmit(text, atts);
        }}
        isStreaming={orch.isLoading}
        onStop={handleStop}
        models={orch.MODELS}
        model={orch.model}
        onModelChange={orch.handleModelChange}
        modelSelectorDisabled={orch.isLoading}
        modelProviderId={orch.activeProviderId}
        modelCatalogBuiltin={!orch.activeProvider?.models?.length}
        modelFavorites={orch.modelFavorites}
        modelRecents={orch.recentModels}
        onToggleModelFavorite={orch.handleToggleModelFavorite}
        attachments={orch.composerAttachments}
        onAddFiles={orch.addFiles}
        slashPrompts={orch.insertPrompts}
        onApplySlashPrompt={orch.handleApplySlashPrompt}
        onRemoveAttachment={orch.handleRemoveAttachmentById}
        webSearch={orch.webSearchEnabled}
        onToggleWebSearch={orch.onToggleWebSearch}
        agentMode={orch.agentMode}
        onToggleAgentMode={orch.onToggleAgentMode}
        autoPilot={orch.autoPilot}
        approvalPolicy={orch.approvalPolicy}
        onCycleAutoPilot={orch.onCycleAutoPilot}
        stagedFileCount={orch.stagingVersion >= 0 ? stagingCount(orch.stagingRef.current) : 0}
        onOpenStaging={orch.onOpenStaging}
        onOpenToolsPanel={orch.onOpenToolsPanel}
        onOpenRecipes={() => orch.setRecipesPanelOpen(true)}
        webBusy={orch.webBusy}
        workspace={orch.workspace}
        onPickWorkspace={orch.pickFolder}
        onDisconnectWorkspace={orch.disconnectFolder}
        sendOnEnter={orch.sendOnEnter}
        isTouchDevice={orch.isTouchDevice}
        canContinue={orch.canContinue}
        goalLoopActive={orch.goalLoop?.status === 'active'}
        goalLoopInfo={orch.goalLoop?.status === 'active' ? `${orch.goalLoop.iterations + 1}/${orch.goalLoop.maxIterations}` : undefined}
        onGoalLoopClick={orch.handleGoalLoopClick}
        onContinue={orch.continueGenerating}
        composerApiRef={orch.composerApiRef}
        onTakeBackQueued={orch.takeBackQueued}
      />

      {/* Agent Telemetry HUD */}
      <AgentHud className="mx-auto w-full max-w-thread" />
        </div>

        {/*
         * Cột phụ bên phải — anh em của cột hội thoại, KHÔNG phải con của nó.
         * Bản thân nó tự quyết định có hiện không (cần ≥1400px VÀ có gì để
         * đặt vào), nên không cần điều kiện bao quanh ở đây.
         */}
        <SessionRail
          currentChatId={orch.currentChatId}
          isLoading={orch.isLoading}
          onNotice={orch.showNotice}
          plan={orch.plan}
          planHidden={orch.planHidden}
          onHidePlan={() => orch.setPlanHidden(true)}
          canApprove={orch.agentMode === 'plan' && !orch.isLoading}
          onApprovePlan={orch.handleApprovePlan}
        />
      </div>

      {/* Phê duyệt an toàn */}
      <DiffConfirm state={diffState} onClose={closeDiffModal} />
      <ShellConfirm state={shellState} onClose={closeShellModal} />
      <McpToolApprovalDialog />

      {orch.stagingPanelOpen && (
        <StagingPanel
          store={orch.stagingRef.current}
          onClose={() => orch.setStagingPanelOpen(false)}
          onApplyAll={orch.applyAllStaged}
          onRejectFile={orch.rejectStagedFile}
          onRejectAll={orch.rejectAllStaged}
        />
      )}

      {orch.toolsPanelOpen && (
        <ToolsPanel open={orch.toolsPanelOpen} onClose={() => orch.setToolsPanelOpen(false)} />
      )}

      <RecipesPanel
        open={orch.recipesPanelOpen}
        onClose={() => orch.setRecipesPanelOpen(false)}
        onRun={orch.startRecipeRun}
      />

      <ToastHost />
    </div>
  );
}
