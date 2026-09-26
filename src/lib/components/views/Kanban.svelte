<script lang="ts">
/**
 * Kanban — 看板视图
 *
 * 任务按状态分列展示。支持拖拽切换状态。
 * 对于"清单看板"模板，列可自定义添加/删除/重命名。
 */

  import { activeProject, activeTaskId, createTask, updateTask, updateProject, reorderTask, completeRecurringTask } from '$lib/stores';
  import type { Task, TaskStatus, Priority } from '$lib/types';
  import { sortable, type DropTarget } from '$lib/actions/sortable';
  import { resolveInsertIndex } from '$lib/utils/reorder-target';
  import { describeRule } from '$lib/utils/recurrence';
  import Icon from '$lib/components/shared/Icon.svelte';
  import { t, tf } from '$lib/i18n';
  import { animationLevel } from '$lib/stores/animation';
  import { visibleFields } from '$lib/stores/task-fields';
  import { fade } from 'svelte/transition';

  const pCfg: Record<Priority, string> = {
    high: '#ef4444', medium: '#f59e0b', low: '#10b981'
  };

  // 列定义
  let isTodo = $derived($activeProject?.template === 'todo');
  let columnDefs = $derived.by(() => {
    if (isTodo && $activeProject?.kanban_columns) {
      return $activeProject.kanban_columns.map((name, i) => ({
        name,
        status: name,
        color: ['var(--text-muted)', 'var(--accent)', 'var(--green)', '#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b', '#84cc16'][i % 8]
      }));
    }
    return [
      { name: '待办', status: 'todo' as const, color: 'var(--text-muted)' },
      { name: '进行中', status: 'in_progress' as const, color: 'var(--accent)' },
      { name: '已完成', status: 'done' as const, color: 'var(--green)' }
    ];
  });

  function tasksByStatus(status: string): Task[] {
    if (!$activeProject) return [];
    if (isTodo) {
      return $activeProject.tasks.filter(t => t.status === status);
    }
    return $activeProject.tasks.filter(t => t.status === status);
  }

  /** 每列及其卡片（拖拽渲染需要列内下标，预先算好避免模板里反复 filter） */
  let columns = $derived.by(() => columnDefs.map(col => ({ ...col, cards: tasksByStatus(col.status) })));

  // ── 拖拽（指针事件，桌面 + 触摸都可用） ─────────────────────────────────
  /** 当前悬浮的目标列 */
  let overZone = $state<string | null>(null);
  /** 目标列内的插入下标（“移除被拖卡片后”的下标） */
  let overIndex = $state(-1);

  function onOverCard(t: DropTarget) {
    // 落在列与列的间隙时 `zone` 为 null：保留上一次有效落点
    if (t.zone === null) return;
    overZone = t.zone;
    overIndex = t.index;
  }

  /**
   * 卡片落位：先判是否换列（改 status），再按锚点换算全量 `tasks[]` 下标做列内排序
   */
  function onDropCard(_fromDomIndex: number, target: DropTarget, fromId: string) {
    const proj = $activeProject;
    if (!proj || !fromId) return;
    // 落在列与列的间隙时 `target.zone` 为 null：沿用最后一次有效落点（与指示线一致）
    const zone = target.zone ?? overZone;
    overZone = null;
    overIndex = -1;
    if (zone === null) return;

    const all = proj.tasks;
    const fromAll = all.findIndex(t => t.id === fromId);
    if (fromAll === -1) return;

    const crossColumn = all[fromAll].status !== zone;
    // 落点所属那一列的卡片（`resolveInsertIndex` 内部会排除被拖卡片）
    const area = tasksByStatus(zone);
    // 跨列拖进空列 → 追加到末尾；同列内拖动 → 无锚点时保持原位
    const toAll = resolveInsertIndex(all, area, fromId, target.index, crossColumn ? 'append' : 'noop');
    if (toAll < 0) return;

    if (crossColumn) {
      // 先改状态，再调列内位置；两步只记一次撤销（reorderTask 跳过第二次历史快照）
      const moving = all[fromAll];
      const targetIsDone = zone === 'done';
      if (targetIsDone && moving.recurrence) {
        // 循环任务：走显式的「完成一次」路径 → 生成下一个实例（与列表里勾选等价）。
        // 依赖未满足时内部会拒绝，行为与 updateTask 一致（卡片不动）。
        completeRecurringTask(proj.id, fromId);
      } else {
        // 普通任务（updateTask 会写 changelog）
        updateTask(proj.id, fromId, { status: zone as TaskStatus });
      }
      if (toAll !== fromAll) reorderTask(proj.id, fromId, toAll, true);
    } else if (toAll !== fromAll) {
      reorderTask(proj.id, fromId, toAll);
    }
  }

  function onCancelCard() {
    overZone = null;
    overIndex = -1;
  }

  // 列管理（仅 todo 模板）
  let newColName = $state('');
  let newTaskTitles = $state<Record<string, string>>({});
  let editingCol = $state<number | null>(null);
  let editColName = $state('');

  function addColumn() {
    if (!$activeProject || !newColName.trim()) return;
    const cols = [...($activeProject.kanban_columns || ['待办', '进行中', '已完成']), newColName.trim()];
    updateProject($activeProject.id, { kanban_columns: cols });
    newColName = '';
  }

  function removeColumn(idx: number) {
    if (!$activeProject || !$activeProject.kanban_columns) return;
    const cols = $activeProject.kanban_columns.filter((_, i) => i !== idx);
    updateProject($activeProject.id, { kanban_columns: cols });
  }

  function startEditCol(idx: number, name: string) {
    editingCol = idx; editColName = name;
  }

  function saveColName() {
    if (!$activeProject || !$activeProject.kanban_columns || editingCol === null) return;
    if (!editColName.trim()) { editingCol = null; return; }
    const cols = [...$activeProject.kanban_columns];
    cols[editingCol] = editColName.trim();
    updateProject($activeProject.id, { kanban_columns: cols });
    editingCol = null;
  }
</script>

<div class="kanban">
  {#if $activeProject}
    <div class="kanban-header">
      <span class="dot" style="background:{$activeProject.color}"></span>
      <h2>{$activeProject.name}</h2>
      <span class="meta">{$t('kanban.viewTitle')}</span>
      {#if isTodo}
        <div class="col-add-row">
          <input class="col-add-input" placeholder="新列名称" bind:value={newColName} onkeydown={(e) => { if (e.key === 'Enter') addColumn(); }} />
          <button class="col-add-btn" onclick={addColumn} disabled={!newColName.trim()}>+</button>
        </div>
      {/if}
    </div>

    <div
      class="kanban-cols"
      use:sortable={{
        handle: '.card-handle',
        handleOnly: false,
        axis: 'free' as const,
        longPressMs: 240,
        onOver: onOverCard,
        onDrop: onDropCard,
        onCancel: onCancelCard
      }}
    >
      {#each columns as col, idx (col.status)}
        <div class="kanban-col">
          {#if isTodo && editingCol === idx}
            <div class="col-edit-row">
              <input class="col-edit-input" bind:value={editColName} onkeydown={(e) => { if (e.key === 'Enter') saveColName(); if (e.key === 'Escape') editingCol = null; }} />
              <button class="col-edit-ok" onclick={saveColName}>✓</button>
            </div>
          {:else}
            <div class="col-header" ondblclick={() => isTodo && startEditCol(idx, col.name)}>
              <span class="col-title">{col.name}</span>
              {#if isTodo}
                <button class="col-del" onclick={() => removeColumn(idx)} title="删除列">×</button>
              {/if}
            </div>
          {/if}

          <div
            class="kanban-cards"
            class:drop-target-col={overZone === col.status}
            data-sortable-zone={col.status}
          >
            <div class="col-add-task">
              <input class="col-task-input" placeholder="+ 添加任务" value={newTaskTitles[col.status] || ''}
                oninput={(e) => { newTaskTitles = { ...newTaskTitles, [col.status]: (e.target as HTMLInputElement).value }; }}
                onkeydown={(e) => {
                  if (e.key === 'Enter' && $activeProject) {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      createTask($activeProject.id, val, col.status);
                      newTaskTitles = { ...newTaskTitles, [col.status]: '' };
                    }
                  }
                }}
              />
            </div>
            {#each col.cards as task, i (task.id)}
              <div
                class="kanban-card"
                class:done={task.status === 'done'}
                class:drop-before={overZone === col.status && overIndex === i}
                class:drop-after={overZone === col.status && overIndex === col.cards.length && i === col.cards.length - 1}
                data-sortable-item
                data-sortable-id={task.id}
                onclick={() => activeTaskId.set(task.id)}
                onkeydown={(e) => { if (e.key === 'Enter') activeTaskId.set(task.id); }}
                role="button" tabindex="0"
                in:fade={{ duration: $animationLevel === 'none' ? 0 : ($animationLevel === 'rich' ? 250 : 150) }}
              >
                <span class="card-handle" title={$t('drag.handle')} aria-hidden="true">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/>
                    <circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/>
                    <circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/>
                  </svg>
                </span>
                <div class="card-top">
                  <span class="task-color-dot" style="background:{task.color || '#4f46e5'}"></span>
                  <span class="priority-dot" style="background:{pCfg[task.priority]}"></span>
                  <span class="card-title">{task.title}</span>
                  {#if task.recurrence}
                    <span class="rec-mark" title={describeRule(task.recurrence, $t)} aria-label={$t('task.recurring')}>
                      <Icon name="repeat" size={10} />
                    </span>
                  {/if}
                  {#if task.tracked_start && task.status !== 'done'}
                    <span class="timer-indicator" title={$t('task.tracking')}></span>
                  {/if}
                </div>
                {#if $visibleFields.has('subtasks') && task.subtasks && task.subtasks.length > 0}
                  <div class="card-subtasks">{task.subtasks.filter(s => s.done).length}/{task.subtasks.length}</div>
                {/if}
                {#if $visibleFields.has('tags') && task.tags && task.tags.length > 0}
                  <div class="card-tags">
                    {#each task.tags as tag}
                      <span class="card-tag">{tag}</span>
                    {/each}
                  </div>
                {/if}
                {#if $visibleFields.has('due_date') && task.due_date}
                  <div class="card-due" class:overdue={task.due_date && task.status !== 'done' && new Date(task.due_date) < new Date()}>{task.due_date}</div>
                {/if}
              </div>
            {/each}
            {#if col.cards.length === 0}
              <div class="kanban-empty">{$t('kanban.dropHere')}</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">{$t('kanban.selectProject')}</div>
  {/if}
</div>

<style>
  .kanban { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .kanban-header { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .kanban-header .dot { width: 12px; height: 12px; border-radius: 50%; }
  .kanban-header h2 { font-size: 16px; font-weight: 600; }
  .kanban-header .meta { font-size: 12px; color: var(--text-muted); }
  .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }

  .col-add-row { display: flex; gap: 4px; margin-left: auto; }
  .col-add-input { padding: 4px 8px; font-size: 12px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); width: 100px; }
  .col-add-input:focus { border-color: var(--accent); outline: none; }
  .col-add-btn { padding: 4px 8px; font-size: 14px; border-radius: 6px; background: var(--accent); color: #fff; }
  .col-add-btn:disabled { opacity: 0.4; }

  .kanban-cols { flex: 1; display: flex; gap: 12px; padding: 16px 24px; overflow-x: auto; overflow-y: hidden; }

  .kanban-col { flex: 1; min-width: 240px; max-width: 340px; display: flex; flex-direction: column; background: var(--surface); border-radius: 8px; border: 1px solid var(--border); }

  .col-header { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 600; color: var(--text); }
  .col-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-del { font-size: 14px; color: var(--text-muted); padding: 2px; }
  .col-del:hover { color: var(--red); }

  .col-edit-row { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .col-edit-input { flex: 1; padding: 4px 6px; font-size: 12px; border-radius: 4px; background: var(--bg); border: 1px solid var(--accent); color: var(--text); }
  .col-edit-ok { padding: 4px 8px; font-size: 12px; border-radius: 4px; background: var(--accent); color: #fff; }

  .kanban-cards { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .col-add-task { padding: 0 0 4px; }
  .col-task-input { width: 100%; padding: 6px 8px; font-size: 12px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); box-sizing: border-box; }
  .col-task-input:focus { border-color: var(--accent); outline: none; }
  .col-task-input::placeholder { color: var(--text-muted); }
  .kanban-empty { font-size: 11px; color: var(--text-muted); text-align: center; padding: 24px 0; }

  .kanban-card { padding: 8px 10px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); cursor: pointer; transition: all 0.1s; }
  .kanban-card:hover { border-color: var(--accent); }
  .kanban-card.done { opacity: 0.5; }
  .kanban-card.done .card-title { text-decoration: line-through; }
  .card-handle { position: absolute; top: 3px; right: 3px; display: flex; align-items: center; justify-content: center; padding: 3px; border-radius: 4px; color: var(--text-muted); opacity: 0; transition: opacity 0.15s; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; cursor: grab; }
  .kanban-card:hover .card-handle { opacity: 0.75; }
  .card-handle:active { cursor: grabbing; }
  .card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .priority-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .task-color-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-right: 2px; }
  .card-title { font-size: 12px; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rec-mark { display: inline-flex; align-items: center; color: var(--accent); flex-shrink: 0; }
  .timer-indicator { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s ease-in-out infinite; flex-shrink: 0; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .card-subtasks { font-size: 10px; color: var(--text-muted); margin-bottom: 4px; }
  .card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
  .card-tag { font-size: 9px; padding: 1px 5px; border-radius: 4px; background: var(--surface); color: var(--text-muted); }
  .card-due { font-size: 10px; color: var(--text-muted); }
  .card-due.overdue { color: var(--red); }

  @media (max-width: 768px) {
    .kanban-cols { overflow-x: auto; }
    .kanban-col { min-width: 260px; }
    /* 触摸端没有 hover，抓手常显 */
    .card-handle { opacity: 0.55; }
  }
</style>
