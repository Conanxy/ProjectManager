<script lang="ts">
/**
 * TaskList — 任务列表视图
 *
 * 默认的任务管理视图，提供：
 * - 新增任务输入框
 * - 搜索和多维度筛选（优先级、标签）
 * - 任务行展示（标题、优先级、标签、截止日期、子任务进度）
 * - 勾选完成、双击编辑标题
 * - 拖拽排序（drag-to-reorder）
 * - 工时追踪按钮（开始计时/计时中/已完成工时）
 * - 二次确认删除
 *
 * @example
 * <TaskList />
 */

  import { activeProject, filteredTasks, activeTaskId, createTask, updateTask, deleteTask, toggleTaskStatus, searchQuery, priorityFilter, tagFilter, reorderTask, startTracking } from '$lib/stores';
  import { sortable, type DropTarget } from '$lib/actions/sortable';
  import { resolveInsertIndex } from '$lib/utils/reorder-target';
  import { describeRule } from '$lib/utils/recurrence';
  import type { Task, Priority } from '$lib/types';
  import type { ProjectStorage } from '$lib/types';
  import { formatDuration } from '$lib/utils/date';
  import Icon from '$lib/components/shared/Icon.svelte';
  import LiveTimer from '$lib/components/shared/LiveTimer.svelte';
  import { get } from 'svelte/store';
  import { t, tf } from '$lib/i18n';
  import { animationLevel } from '$lib/stores/animation';
  import { fade } from 'svelte/transition';
  import { ownerMarks } from '$lib/stores/storage-health';
  import { visibleFields } from '$lib/stores/task-fields';
  import { getDeviceId } from '$lib/utils/device';

  /** 本项目是否由别的设备管理本地文件夹（只读角标用）；是则返回对方可读名 */
  function ownerBadgeName(storage: ProjectStorage | undefined): string | null {
    if (!storage || storage.type !== 'local' || !storage.ownerDeviceId) return null;
    if (storage.ownerDeviceId === getDeviceId()) return null;
    return storage.ownerDeviceName || storage.ownerDeviceId.slice(0, 8);
  }
  let newTitle = $state('');
  let editingId = $state<string | null>(null);
  let editTitle = $state('');
  let confirmDeleteId = $state<string | null>(null);

  function pLabel(p: Priority): string { return get(t)(`priority.${p}`); }
  const pColor: Record<Priority, { c: string; bg: string }> = {
    high: { c: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    medium: { c: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    low: { c: '#10b981', bg: 'rgba(16,185,129,0.15)' }
  };

  function addTask() { if (!$activeProject || !newTitle.trim()) return; createTask($activeProject.id, newTitle.trim()); newTitle = ''; }
  function startEdit(t: Task) { editingId = t.id; editTitle = t.title; }
  function saveEdit(pid: string, tid: string) { if (editTitle.trim()) updateTask(pid, tid, { title: editTitle.trim() }); editingId = null; }
  function cyclePriority(pid: string, t: Task) { const o: Priority[] = ['low','medium','high']; updateTask(pid, t.id, { priority: o[(o.indexOf(t.priority)+1)%3] }); }
  function handleDelete(e: MouseEvent, pid: string, tid: string) {
    e.stopPropagation();
    if (confirmDeleteId === tid) { deleteTask(pid, tid); confirmDeleteId = null; }
    else { confirmDeleteId = tid; setTimeout(() => confirmDeleteId = null, 3000); }
  }
  function fmtDate(d: string|null) { if (!d) return ''; const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}`; }
  function overdue(d: string|null) { return d ? new Date(d) < new Date() : false; }

  // ── 拖动排序（指针事件，桌面 + 触摸都可用） ─────────────────────────────
  /**
   * 落位换算
   *
   * `fromDomIndex` 是**当前筛选结果**（`$filteredTasks`）里的下标，
   * 而 `reorderTask` 要的是全量 `tasks[]` 下标，所以用「目标位后第一个任务」当锚点。
   */
  function onDropTask(fromDomIndex: number, target: DropTarget, fromId: string) {
    const proj = $activeProject;
    if (!proj) return;
    const visible = $filteredTasks;
    const movedId = fromId || visible[fromDomIndex]?.id;
    if (!movedId) return;

    const all = proj.tasks;
    const fromAll = all.findIndex(t => t.id === movedId);
    if (fromAll === -1) return;
    const toAll = resolveInsertIndex(all, visible, movedId, target.index);
    if (toAll < 0 || toAll === fromAll) return;
    reorderTask(proj.id, movedId, toAll);
  }
</script>

<div class="task-area">
  {#if $activeProject}
    <div class="task-header">
      <span class="dot" style="background:{$activeProject.color}"></span>
      <h2>{$activeProject.name}</h2>
      {#if ownerBadgeName($activeProject.storage)}
        <span class="owner-badge" title={$t('storage.ownerBadgeHint')}>🔒 {$tf('storage.ownerBadge', { name: ownerBadgeName($activeProject.storage) ?? '' })}</span>
      {/if}
      <span class="meta">{$tf('task.count', { n: $activeProject.tasks.length })}</span>
    </div>
    {#if $activeProject.description}
      <p class="desc">{$activeProject.description}</p>
    {/if}

    <div class="task-add">
      <input class="add-input" placeholder={$t('task.addPlaceholder')} bind:value={newTitle} onkeydown={e => e.key === 'Enter' && addTask()} />
      <button class="add-btn" onclick={addTask}>{$t('task.add')}</button>
    </div>

    <div class="filter-bar">
      <input class="filter-search" placeholder={$t('task.searchPlaceholder')} bind:value={$searchQuery} />
      <select class="filter-select" bind:value={$priorityFilter}>
        <option value="all">{$t('priority.all')}</option>
        <option value="high">{$t('priority.high')}</option>
        <option value="medium">{$t('priority.medium')}</option>
        <option value="low">{$t('priority.low')}</option>
      </select>
      <select class="filter-select" bind:value={$tagFilter}>
        <option value="all">{$t('status.all')}</option>
        {#each $activeProject?.tags ?? [] as tag}
          <option value={tag.name}>{tag.name}</option>
        {/each}
      </select>
    </div>

    <div
      class="task-list"
      use:sortable={{ handle: '.drag-handle', axis: 'y' as const, onDrop: onDropTask }}
    >
      {#if $filteredTasks.length === 0}
        <div class="empty"><Icon name="clipboard" size={32} /> {$t('task.noTasks')}</div>
      {:else}
        {#each $filteredTasks as task (task.id)}
          <div
            class="task-row"
            class:selected={$activeTaskId === task.id}
            role="button"
            tabindex="0"
            aria-label={task.title}
            data-sortable-item
            data-sortable-id={task.id}
            onclick={() => activeTaskId.set(task.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activeTaskId.set(task.id); } }}
            in:fade={{ duration: $animationLevel === 'none' ? 0 : ($animationLevel === 'rich' ? 250 : 150) }}
          >
            <!-- 拖动抓手（触摸端靠它才能拖动，不劫持页面滚动） -->
            <span class="drag-handle" title={$t('drag.handle')} aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
                <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
                <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
              </svg>
            </span>
            <button class="check" class:done={task.status === 'done'} aria-label={task.status === 'done' ? $t('status.todo') : $t('status.done')} onclick={(e) => { e.stopPropagation(); $activeProject && toggleTaskStatus($activeProject.id, task.id); }}>
              {#if task.status === 'done'}<span class="check-mark"><Icon name="check" size={11} /></span>{/if}
            </button>

            {#if $visibleFields.has('tracked_start')}
              {#if task.tracked_start && task.status !== 'done'}
                <button class="timer-btn tracking" onclick={(e) => e.stopPropagation()} title={$t('task.tracking')} aria-label={$t('task.tracking')}>
                  <span class="timer-dot"></span>
                  <span class="timer-text"><LiveTimer start={task.tracked_start} /></span>
                </button>
              {:else if task.tracked_start && task.status === 'done'}
                <span class="timer-done" title={$t('task.totalTime')}>{formatDuration(task.tracked_start, task.updated_at)}</span>
              {:else}
                <button class="timer-btn" onclick={(e) => { e.stopPropagation(); $activeProject && startTracking($activeProject.id, task.id); }} title={$t('task.startTracking')} aria-label={$t('task.startTracking')}>
                  <Icon name="play" size={12} />
                </button>
              {/if}
            {/if}

            <div class="task-title-wrap">
              {#if editingId === task.id}
                <input class="edit-input" bind:value={editTitle} onblur={() => $activeProject && saveEdit($activeProject.id, task.id)} onkeydown={e => e.key === 'Enter' && $activeProject && saveEdit($activeProject.id, task.id)} onclick={e => e.stopPropagation()} autofocus />
              {:else}
                <span class="task-color-dot" style="background:{task.color || '#4f46e5'}"></span>
                {#if task.recurrence}
                  <span class="rec-mark" title={describeRule(task.recurrence, $t)} aria-label={$t('task.recurring')}>
                    <Icon name="repeat" size={11} />
                  </span>
                {/if}
                <span class="task-title" class:done={task.status === 'done'} ondblclick={(e) => { e.stopPropagation(); startEdit(task); }}>{task.title}</span>
              {/if}
            </div>

            {#if $visibleFields.has('priority')}
              <button class="priority" style="color:{pColor[task.priority].c};background:{pColor[task.priority].bg}" aria-label={pLabel(task.priority)} onclick={(e) => { e.stopPropagation(); $activeProject && cyclePriority($activeProject.id, task); }}>
                {pLabel(task.priority)}
              </button>
            {/if}

            {#if $visibleFields.has('tags') && task.tags.length > 0}
              <div class="tags">
                {#each task.tags.slice(0, 2) as tagName}
                  {@const tagDef = $activeProject?.tags.find(t => t.name === tagName)}
                  <span class="tag" style={tagDef ? `color:${tagDef.color};background:${tagDef.color}20` : ''}>{tagName}</span>
                {/each}
                {#if task.tags.length > 2}<span class="tag-more">+{task.tags.length - 2}</span>{/if}
              </div>
            {/if}

            {#if $visibleFields.has('due_date') && task.due_date}
              <span class="due" class:overdue={overdue(task.due_date) && task.status !== 'done'}>{fmtDate(task.due_date)}</span>
            {/if}

            {#if $visibleFields.has('subtasks') && task.subtasks?.length > 0}
              {@const done = task.subtasks.filter(s => s.done).length}
              <span class="subtask-badge">{done}/{task.subtasks.length}</span>
            {/if}

            <button class="del" aria-label={$t('detail.deleteTask')} onclick={(e) => $activeProject && handleDelete(e, $activeProject.id, task.id)}>
              {#if confirmDeleteId === task.id}{$t('sidebar.confirm')}{:else}<Icon name="close" size={12} />{/if}
            </button>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="welcome">
      <div class="welcome-icon"><Icon name="folder" size={48} /></div>
      <p class="welcome-title">{$t('task.welcome')}</p>
      <p class="welcome-sub">{$t('task.welcomeSub')}</p>
    </div>
  {/if}
</div>

<style>
  .task-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .task-header { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
  .task-header .dot { width: 12px; height: 12px; border-radius: 50%; }
  .task-header h2 { font-size: 16px; font-weight: 600; }
  .task-header .meta { font-size: 12px; color: var(--text-muted); }
  .desc { padding: 0 24px 8px 46px; font-size: 13px; color: var(--text-secondary); }
  .task-add { display: flex; gap: 8px; padding: 12px 24px; border-bottom: 1px solid var(--border); }
  .add-input { flex: 1; padding: 8px 12px; font-size: 13px; border-radius: 8px; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .add-input:focus { border-color: var(--accent); }
  .add-input::placeholder { color: var(--text-muted); }
  .add-btn { padding: 8px 16px; font-size: 13px; border-radius: 8px; background: var(--accent); color: #fff; }
  .add-btn:hover { opacity: 0.9; }
  .filter-bar { display: flex; gap: 8px; padding: 8px 24px; border-bottom: 1px solid var(--border); }
  .filter-search { flex: 1; padding: 6px 10px; font-size: 12px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .filter-search:focus { border-color: var(--accent); outline: none; }
  .filter-search::placeholder { color: var(--text-muted); }
  .filter-select { padding: 6px 8px; font-size: 12px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); color: var(--text); cursor: pointer; }
  .filter-select:focus { border-color: var(--accent); outline: none; }
  .task-list { flex: 1; overflow-y: auto; padding: 8px 24px; }
  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: var(--text-muted); font-size: 14px; gap: 8px; }
  .task-row { position: relative; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
  .task-row:hover { background: var(--surface); }
  .drag-handle { display: flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0; color: var(--text-muted); opacity: 0; transition: opacity 0.15s; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; cursor: grab; }
  .task-row:hover .drag-handle { opacity: 0.7; }
  .drag-handle:active { cursor: grabbing; }
  .task-row.selected { background: var(--surface); box-shadow: inset 0 0 0 1px var(--accent-light); }
  .check { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border); flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .check:hover { border-color: var(--accent); }
  .check.done { background: var(--accent); border-color: var(--accent); }
  .check-mark { font-size: 11px; color: #fff; line-height: 1; }
  .task-title-wrap { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
  .task-color-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .rec-mark { display: inline-flex; align-items: center; color: var(--accent); opacity: 0.85; flex-shrink: 0; }
  .task-title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
  .task-title.done { text-decoration: line-through; color: var(--text-muted); }
  .edit-input { width: 100%; padding: 2px 4px; font-size: 13px; border-bottom: 1px solid var(--accent); color: var(--text); }
  .priority { padding: 2px 10px; font-size: 11px; font-weight: 600; border-radius: 999px; flex-shrink: 0; }
  .priority:hover { transform: scale(1.05); }
  .tags { display: flex; gap: 4px; flex-shrink: 0; }
  .tag { padding: 2px 8px; font-size: 11px; border-radius: 4px; background: var(--surface); color: var(--text-secondary); }
  .tag-more { font-size: 11px; color: var(--text-muted); }
  .due { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
  .due.overdue { color: var(--red); }
  .subtask-badge { font-size: 10px; color: var(--text-muted); padding: 1px 6px; background: var(--surface); border-radius: 999px; flex-shrink: 0; }
  .timer-btn { display: flex; align-items: center; gap: 4px; padding: 2px 6px; font-size: 11px; color: var(--text-muted); border-radius: 4px; flex-shrink: 0; cursor: pointer; }
  .timer-btn:hover { color: var(--accent); background: var(--surface); }
  .timer-btn.tracking { color: var(--accent); }
  .timer-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s ease-in-out infinite; }
  .timer-text { font-size: 11px; font-variant-numeric: tabular-nums; min-width: 48px; }
  .timer-done { font-size: 10px; color: var(--text-muted); padding: 1px 6px; background: var(--surface); border-radius: 999px; flex-shrink: 0; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .del { font-size: 12px; color: var(--text-muted); padding: 2px 4px; opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
  .task-row:hover .del { opacity: 1; }
  .del:hover { color: var(--red); }
  .owner-badge { font-size: 11px; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; flex-shrink: 0; cursor: help; white-space: nowrap; }
  .welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); }
  .welcome-icon { font-size: 48px; opacity: 0.2; margin-bottom: 16px; }
  .welcome-title { font-size: 18px; margin-bottom: 4px; }
  .welcome-sub { font-size: 13px; }

  @media (max-width: 768px) {
    .task-area { overflow: visible; flex: none; }
    .task-header { padding: 12px; flex-wrap: wrap; }
    .task-add { padding: 8px 12px; flex-wrap: wrap; }
    .filter-bar { padding: 6px 12px; flex-wrap: wrap; }
    .filter-select { flex: 1; min-width: 0; }
    .task-list { padding: 4px 12px; }
    .desc { padding: 0 12px 8px 12px; }
    .tags { display: none; }
    .del { display: none; }
    .due { display: none; }
    .task-row { padding: 8px 10px; gap: 6px; }
    .drag-handle { opacity: 0.5; }
    .task-title { font-size: 12px; }
    .subtask-badge { display: none; }
  }
</style>
