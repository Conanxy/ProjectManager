<script lang="ts">
/**
 * ProjectFiles — 项目文件预览视图
 *
 * 展示项目模板生成的文件树和文件内容预览。
 * 功能包括：
 * - 左侧文件树面板（可展开/折叠目录）
 * - 右侧代码预览面板（语法语言标签、只读标识）
 * - 支持嵌套目录结构（如 styles/main.css）
 * - README.md 特殊处理（读取项目实际 readme 内容）
 *
 * @example
 * <ProjectFiles />
 */

  import { activeProject, updateProjectFileTree } from '$lib/stores';
  import { generateTemplateFiles } from '$lib/templates';
  import Icon from '$lib/components/shared/Icon.svelte';
  import { t } from '$lib/i18n';

  let selectedFile = $state<string | null>(null);
  let expandedDirs = $state<Set<string>>(new Set());
  let refreshing = $state(false);

  // 是否为本地文件夹项目（显示操作按钮的前提）
  let isLocalProject = $derived($activeProject?.storage?.type === 'local' && !!$activeProject?.storage?.path);

  // 刷新文件树
  async function handleRefresh() {
    if (!$activeProject || refreshing) return;
    refreshing = true;
    await updateProjectFileTree($activeProject.id);
    refreshing = false;
  }

  // 在文件管理器中打开项目文件夹
  async function handleOpenFolder() {
    const path = $activeProject?.storage?.path;
    if (!path) return;
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(path);
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  }

  // 是否使用真实文件树（默认模板 + 已扫描）
  let useRealTree = $derived($activeProject?.template === 'default' && $activeProject?.fileTree && $activeProject.fileTree.length > 0);

  // 构建文件树
  interface TreeNode {
    name: string;
    type: 'dir' | 'file';
    path: string;
    children?: TreeNode[];
  }

  function buildTree(dirs: string[], files: Record<string, string>): TreeNode[] {
    const root: TreeNode[] = [];

    // 添加目录
    for (const dir of dirs) {
      root.push({ name: dir, type: 'dir', path: dir, children: [] });
    }

    // 添加文件（支持子目录路径如 styles/main.css）
    for (const filepath of Object.keys(files)) {
      const parts = filepath.split('/');
      if (parts.length === 1) {
        root.push({ name: filepath, type: 'file', path: filepath });
      } else {
        // 找到对应的父目录
        const dirName = parts[0];
        let cur: TreeNode = root.find(n => n.type === 'dir' && n.name === dirName)
          ?? { name: dirName, type: 'dir', path: dirName, children: [] };
        if (!root.includes(cur)) root.push(cur);
        if (!cur.children) cur.children = [];
        for (let i = 1; i < parts.length; i++) {
          const isLast = i === parts.length - 1;
          const partPath = parts.slice(0, i + 1).join('/');
          const ch = cur.children!;
          if (isLast) {
            ch.push({ name: parts[i], type: 'file', path: partPath });
          } else {
            let next: TreeNode | undefined = ch.find(n => n.type === 'dir' && n.name === parts[i]);
            if (!next) {
              next = { name: parts[i], type: 'dir', path: partPath, children: [] };
              ch.push(next);
            }
            cur = next;
          }
        }
      }
    }

    return root;
  }

  /**
   * 从扁平化的 FileTreeEntry[] 构建 TreeNode 树
   *
   * fileTree 条目已按目录优先排序，直接根据路径层级构建嵌套结构。
   */
  function buildTreeFromFileTree(entries: import('$lib/types').FileTreeEntry[]): TreeNode[] {
    const root: TreeNode[] = [];
    const dirMap = new Map<string, TreeNode>();

    for (const entry of entries) {
      const parts = entry.path.split('/');
      const isRoot = parts.length === 1;

      if (isRoot) {
        if (entry.isDir) {
          const node: TreeNode = { name: entry.name, type: 'dir', path: entry.path, children: [] };
          root.push(node);
          dirMap.set(entry.path, node);
        } else {
          root.push({ name: entry.name, type: 'file', path: entry.path });
        }
      } else {
        // 确保父目录存在
        const parentPath = parts.slice(0, -1).join('/');
        let parent = dirMap.get(parentPath);
        if (!parent) {
          // 父目录不在 fileTree 中时自动创建占位
          parent = { name: parts[parts.length - 2], type: 'dir', path: parentPath, children: [] };
          dirMap.set(parentPath, parent);
          // 尝试放入 root 或递归查找祖父
          const grandParentPath = parts.slice(0, -2).join('/');
          if (grandParentPath) {
            const gp = dirMap.get(grandParentPath);
            if (gp?.children) gp.children.push(parent);
            else root.push(parent);
          } else {
            root.push(parent);
          }
        }
        if (!parent.children) parent.children = [];

        if (entry.isDir) {
          const node: TreeNode = { name: entry.name, type: 'dir', path: entry.path, children: [] };
          parent.children.push(node);
          dirMap.set(entry.path, node);
        } else {
          parent.children.push({ name: entry.name, type: 'file', path: entry.path });
        }
      }
    }

    return root;
  }

</script>

<div class="files-view">
  {#if $activeProject}
    {@const tree = useRealTree
      ? buildTreeFromFileTree($activeProject.fileTree!)
      : (() => {
          const tplFiles = generateTemplateFiles($activeProject.template, $activeProject.name);
          return buildTree(tplFiles.dirs, tplFiles.files);
        })()}

    <div class="files-header">
      <span class="dot" style="background:{$activeProject.color}"></span>
      <h2>{$activeProject.name}</h2>
      <span class="meta">{$t('files.filePreview')}</span>
      <span class="header-spacer"></span>
      {#if isLocalProject}
        <button class="btn-header" onclick={handleOpenFolder} title="打开所在文件夹">
          <Icon name="folder-open" size={14} />
          <span>打开文件夹</span>
        </button>
        <button class="btn-header" onclick={handleRefresh} disabled={refreshing} title="刷新文件树">
          <span class="refresh-icon" class:spinning={refreshing}>
            {#if refreshing}⟳{:else}↻{/if}
          </span>
          <span>{refreshing ? '刷新中…' : '刷新'}</span>
        </button>
      {/if}
    </div>

    <div class="files-body">
      <!-- 文件树 -->
      <div class="tree-panel">
        <div class="tree-title">{$t('files.projectStructure')}</div>
        {#each tree as node}
          {@render treeNode(node, 0)}
        {/each}
      </div>

    </div>
  {:else}
    <div class="empty">{$t('files.selectProject')}</div>
  {/if}
</div>

{#snippet treeNode(node: TreeNode, depth: number)}
  {#if node.type === 'dir'}
    {@const isExpanded = expandedDirs.has(node.path)}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="tree-dir"
      class:expanded={isExpanded}
      style="padding-left:{depth * 16 + 12}px"
      role="button"
      tabindex="0"
      onclick={() => {
        const next = new Set(expandedDirs);
        if (next.has(node.path)) next.delete(node.path);
        else next.add(node.path);
        expandedDirs = next;
      }}
    >
      <span class="tree-arrow" class:expanded={isExpanded}><Icon name="chevron-right" size={12} /></span>
      <span class="tree-icon"><Icon name={isExpanded ? 'folder-open' : 'folder'} size={14} /></span>
      <span class="tree-name">{node.name}</span>
    </div>
    {#if isExpanded && node.children}
      {#each node.children as child}
        {@render treeNode(child, depth + 1)}
      {/each}
    {/if}
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="tree-file"
      class:active={selectedFile === node.path}
      style="padding-left:{depth * 16 + 12}px"
      role="button"
      tabindex="0"
      onclick={() => { selectedFile = node.path; }}
    >
      <span class="tree-icon"><Icon name="file" size={14} /></span>
      <span class="tree-name">{node.name}</span>
    </div>
  {/if}
{/snippet}

<style>
  .files-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .files-header { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
  .files-header .dot { width: 12px; height: 12px; border-radius: 50%; }
  .files-header h2 { font-size: 16px; font-weight: 600; }
  .files-header .meta { font-size: 12px; color: var(--text-muted); }
  .header-spacer { flex: 1; }
  .btn-header { display: flex; align-items: center; gap: 4px; padding: 5px 10px; font-size: 11px; border-radius: 6px; background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .btn-header:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .btn-header:disabled { opacity: 0.5; cursor: not-allowed; }
  .refresh-icon { display: inline-block; font-size: 14px; }
  .refresh-icon.spinning { animation: spin 0.8s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }

  .files-body { flex: 1; display: flex; overflow: hidden; }

  /* 文件树 */
  .tree-panel { flex: 1; min-width: 0; overflow-y: auto; padding: 0 8px; }
  .tree-title { padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
  .tree-dir { display: flex; align-items: center; gap: 4px; padding: 4px 0; font-size: 12px; color: var(--text-secondary); cursor: pointer; transition: background 0.1s; border-radius: 4px; margin: 0 4px; }
  .tree-dir:hover { background: var(--surface); }
  .tree-arrow { font-size: 8px; transition: transform 0.15s; flex-shrink: 0; }
  .tree-arrow.expanded { transform: rotate(90deg); }
  .tree-file { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; color: var(--text); cursor: pointer; transition: background 0.1s; border-radius: 4px; margin: 0 4px; }
  .tree-file:hover { background: var(--surface); }
  .tree-file.active { background: var(--accent-light); color: var(--accent); }
  .tree-icon { font-size: 14px; flex-shrink: 0; }
  .tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }



  @media (max-width: 768px) {
    .files-view { padding: 12px; overflow: visible; flex: none; }
    .files-header { flex-wrap: wrap; padding: 8px 12px; }
    .btn-header { font-size: 10px; padding: 4px 6px; }
  }
</style>
