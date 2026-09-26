<script lang="ts">
/**
 * +page — 应用主页面
 *
 * 应用的核心页面，组合所有主要视图组件。
 * 功能包括：
 * - 未选择项目时显示全局 Dashboard（仪表盘）
 * - 选择项目后显示项目视图（概览、列表、看板等）
 * - 流程图作为独立全屏界面（不依赖项目）
 * - 数字键 1-9 快速切换项目视图
 * - Ctrl+Z / Ctrl+Shift+Z 撤销/重做
 * - Ctrl+K 打开命令面板
 * - Ctrl+Shift+F 打开全局搜索（项目/任务/子任务）
 * - Ctrl+N 聚焦新建任务输入框
 * - Ctrl+F 聚焦搜索框
 * - Esc 关闭命令面板、帮助弹窗、详情面板或流程图
 * - ? 或 F1 显示快捷键帮助
 * - 选中任务时自动显示详情面板
 *
 * @example
 * <!-- 由 +layout.svelte 渲染 -->
 * <Page />
 */

  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import Dashboard from '$lib/components/views/Dashboard.svelte';
  import FlowchartFull from '$lib/components/views/Flowchart.svelte';
  import TaskList from '$lib/components/views/TaskList.svelte';
  import TaskDetail from '$lib/components/TaskDetail.svelte';
  import Timeline from '$lib/components/views/Timeline.svelte';
  import TaskGraph from '$lib/components/views/TaskGraph.svelte';
  import ProjectReadme from '$lib/components/ProjectReadme.svelte';
  import ProjectFiles from '$lib/components/ProjectFiles.svelte';
  import ProjectInfo from '$lib/components/ProjectInfo.svelte';
  import Kanban from '$lib/components/views/Kanban.svelte';
  import Calendar from '$lib/components/views/Calendar.svelte';
  import ShortcutHelp from '$lib/components/shared/ShortcutHelp.svelte';
  import Icon from '$lib/components/shared/Icon.svelte';  import CommandPalette from '$lib/components/shared/CommandPalette.svelte';
  import GlobalSearch from '$lib/components/shared/GlobalSearch.svelte';
  import Stats from '$lib/components/views/Stats.svelte';
  import GitLog from '$lib/components/views/GitLog.svelte';
  import { activeProject, activeProjectId, activeTask, activeTaskId, undo, redo, showSettings, showFlowchart, exportHtmlFile } from '$lib/stores';
  import { openSearch, searchOpen, closeSearch } from '$lib/stores/search';
  import { t, locale } from '$lib/i18n';
  import { animationLevel } from '$lib/stores/animation';
  import { fade } from 'svelte/transition';

  /** 当前激活的项目视图 */
  let view: 'info' | 'list' | 'kanban' | 'calendar' | 'timeline' | 'graph' | 'readme' | 'files' | 'stats' | 'git' = $state('kanban');

  /** todo 模板只显示看板/日历/时间线 */
  let showViews = $derived(
    $activeProject?.template === 'todo'
      ? ['kanban', 'calendar', 'timeline'] as const
      : ['info', 'list', 'kanban', 'calendar', 'timeline', 'graph', 'readme', 'files', 'stats', 'git'] as const
  );
  const views = $derived(showViews);

  // 当前视图不可用时自动切到看板
  $effect(() => {
    if (!views.includes(view as any)) view = 'kanban';
  });

  /** 滑动指示器位置 */
  let indicatorStyle = $state('');
  let toggleBar = $state<HTMLDivElement | null>(null);

  function updateIndicator() {
    if (!toggleBar) return;
    const btns = toggleBar.querySelectorAll('.toggle-btn') as NodeListOf<HTMLElement>;
    const idx = (views as readonly string[]).indexOf(view);
    const btn = btns[idx];
    if (!btn) return;
    const barRect = toggleBar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    indicatorStyle = `left:${btnRect.left - barRect.left + toggleBar.scrollLeft}px;width:${btnRect.width}px;`;
  }

  $effect(() => {
    void view;
    requestAnimationFrame(updateIndicator);
  });

  function onToggleScroll() {
    requestAnimationFrame(updateIndicator);
  }

  /** 快捷键帮助弹窗显示状态 */
  let showHelp = $state(false);

  /** 命令面板显示状态 */
  let showPalette = $state(false);

  /**
   * 全局键盘快捷键处理
   */
  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Ctrl/Cmd + key shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); showPalette = !showPalette; return; }
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
      if (e.key === 'Z') { e.preventDefault(); redo(); return; }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        const el = document.querySelector('.add-input') as HTMLInputElement;
        el?.focus();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        // Ctrl+Shift+F = 全局搜索；Ctrl+F = 当前项目内筛选框
        if (e.shiftKey) { openSearch(); return; }
        const el = document.querySelector('.filter-search') as HTMLInputElement;
        el?.focus();
        return;
      }
      if (e.key === ',') { e.preventDefault(); showSettings.set(true); return; }
      return;
    }

    if (isEditing) return;

    if (e.key === 'Escape') {
      if ($showFlowchart) { showFlowchart.set(false); return; }
      if ($searchOpen) { closeSearch(); return; }
      if (showPalette) { showPalette = false; return; }
      if (showHelp) { showHelp = false; return; }
      if ($activeTaskId) { activeTaskId.set(null); return; }
    }
    if (e.key === '?' || e.key === 'F1') { e.preventDefault(); showHelp = !showHelp; return; }
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (idx < views.length) view = views[idx];
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Sidebar />

{#if $showFlowchart}
  <!-- 全屏独立流程图（不依赖项目） -->
  <div class="flowchart-fullscreen">
    <div class="flowchart-fullscreen-header">
      <button class="close-flowchart-btn" onclick={() => showFlowchart.set(false)} title="关闭流程图（Esc）">
        ← 返回
      </button>
      <span class="flowchart-fullscreen-title">流程图</span>
    </div>
    <svelte:boundary>
      <FlowchartFull />
      {#snippet failed(error)}
        <div class="flowchart-error">
          <p>流程图加载出错，已拦截（不影响其它功能）。</p>
          <p class="flowchart-error-detail">{String(error)}</p>
          <button class="close-flowchart-btn" onclick={() => showFlowchart.set(false)}>← 返回</button>
        </div>
      {/snippet}
    </svelte:boundary>
  </div>
{:else if !$activeProjectId}
  <!-- 未选择项目 → 全局 Dashboard -->
  <Dashboard />
{:else}
  <!-- 选择了项目 → 项目视图 -->
  <div class="main-area">
    <div class="view-bar">
      <div class="view-toggle" bind:this={toggleBar} onscroll={onToggleScroll}>
        <div class="toggle-indicator" style={indicatorStyle}></div>
        {#each views as v}
          <button class="toggle-btn" class:active={view === v} onclick={() => view = v}>{v === 'git' ? 'Git' : $t(`view.${v}`)}</button>
        {/each}
      </div>
      <button
        class="report-export-btn"
        onclick={() => $activeProjectId && exportHtmlFile($activeProjectId)}
        title={$t('export.report')}
      ><Icon name="chart" size={13} /> {$t('export.report')}</button>
    </div>
    <div class="view-container">
      {#key view}
        <div class="view-wrapper" in:fade={{ duration: $animationLevel === 'none' ? 0 : ($animationLevel === 'rich' ? 250 : 150) }}>
          {#if view === 'info'}
            <ProjectInfo />
          {:else if view === 'list'}
            <TaskList />
          {:else if view === 'kanban'}
            <Kanban />
          {:else if view === 'calendar'}
            <Calendar />
          {:else if view === 'timeline'}
            <Timeline />
          {:else if view === 'graph'}
            <TaskGraph />
          {:else if view === 'readme'}
            <ProjectReadme />
          {:else if view === 'files'}
            <ProjectFiles />
          {:else if view === 'git'}
            <GitLog />
          {:else}
            <Stats />
          {/if}
        </div>
      {/key}
    </div>
  </div>
{/if}

{#if $activeTask}
  <TaskDetail />
{/if}
<ShortcutHelp bind:show={showHelp} />
<CommandPalette bind:show={showPalette} onViewChange={(v) => view = v as typeof view} onShowShortcutHelp={() => showHelp = true} />
<GlobalSearch />

<style>
  /* 流程图全屏覆盖 */
  .flowchart-fullscreen {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }
  .flowchart-fullscreen-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--sidebar);
    flex-shrink: 0;
  }
  .close-flowchart-btn {
    padding: 4px 12px;
    font-size: 13px;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    border: none;
  }
  .close-flowchart-btn:hover { opacity: 0.9; }
  .flowchart-fullscreen-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .flowchart-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    color: var(--text-secondary);
    font-size: 13px;
  }
  .flowchart-error-detail {
    max-width: 80%;
    font-size: 11px;
    color: var(--text-muted);
    word-break: break-all;
    text-align: center;
  }

  /* 主区域 */
  .main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .view-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .view-wrapper { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .view-bar { display: flex; align-items: center; border-bottom: 1px solid var(--border); background: var(--sidebar); }
  .view-toggle { flex: 1; min-width: 0; display: flex; gap: 4px; padding: 8px 24px; overflow-x: auto; white-space: nowrap; position: relative; -webkit-overflow-scrolling: touch; }
  .report-export-btn { flex-shrink: 0; margin: 0 16px 0 8px; padding: 5px 12px; font-size: 12px; border-radius: 6px; background: var(--accent); color: #fff; border: none; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
  .report-export-btn:hover { opacity: 0.9; }
  .view-toggle::-webkit-scrollbar { display: none; }
  .toggle-indicator { position: absolute; top: 8px; height: calc(100% - 16px); background: var(--accent); border-radius: 6px; transition: left 0.08s ease-out, width 0.06s ease; z-index: 0; pointer-events: none; }
  .toggle-btn { padding: 4px 12px; font-size: 12px; border-radius: 6px; color: var(--text-secondary); transition: color 0.15s; flex-shrink: 0; position: relative; z-index: 1; }
  .toggle-btn:hover { color: var(--text); }
  .toggle-btn.active { color: #fff; }

  @media (max-width: 768px) {
    .view-toggle { padding: 6px 12px; }
    .report-export-btn { margin: 0 8px 0 4px; padding: 5px 9px; font-size: 11px; }
    .toggle-btn { padding: 4px 10px; font-size: 11px; }
    .main-area { overflow: visible; flex: none; }
    .view-container { overflow: visible; flex: none; }
    .view-wrapper { overflow: visible; flex: none; }
  }
</style>
