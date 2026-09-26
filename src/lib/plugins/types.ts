/**
 * 本地插件系统：类型定义与纯校验
 *
 * 插件是**单文件 JS/TS 模块**，通过 `new Function('ctx', code)` 在本进程内执行，
 * 由 `ctx` 注入三类扩展点（commands / views / hooks）与私有存储。
 *
 * 本模块只放类型与**纯函数**（manifest 校验、版本兼容、存储 key 生成），
 * 因此可被 `scripts/test-plugins.mjs` 直接 import 单测。
 *
 * @module plugins/types
 *
 * @example
 * ```ts
 * const res = validateManifest({ id: 'demo', name: 'Demo', version: '0.1.0', main: 'inline', capabilities: ['commands'] });
 * if (res.ok && isCompatible(res.manifest.version, APP_VERSION)) { /* 可加载 *\/ }
 * ```
 */

/** 插件可声明的扩展点 */
export type PluginCapability = 'commands' | 'views' | 'hooks';

/** 全部合法扩展点 */
export const PLUGIN_CAPABILITIES: PluginCapability[] = ['commands', 'views', 'hooks'];

/** 应用版本（用于主版本兼容判定；构建期由 Vite 注入） */
export const APP_VERSION: string =
  ((import.meta as unknown as { env?: Record<string, string | undefined> })?.env?.VITE_APP_VERSION) || '0.7.0';

/** 插件清单（manifest） */
export interface PluginManifest {
  /** 唯一 ID（建议反向域名，如 `com.example.my-plugin`） */
  id: string;
  /** 显示名 */
  name: string;
  /** 版本号 `A.B.C`（主版本需与应用一致） */
  version: string;
  /** 简介 */
  description?: string;
  /** 作者 */
  author?: string;
  /** 入口标识（单文件插件固定为 `inline` 或文件名） */
  main: string;
  /** 声明的扩展点 */
  capabilities: PluginCapability[];
  /** 是否启用（默认 false，需用户手动启用） */
  enabled?: boolean;
}

/** 插件注册的命令 */
export interface PluginCommand {
  /** 命令 ID（插件内唯一即可，注册时会加插件前缀） */
  id: string;
  /** 显示名 */
  title: string;
  /** 分类（展示用） */
  category?: string;
  /** 动作 */
  run: () => void | Promise<void>;
}

/** 插件注册的视图（返回 HTML 字符串） */
export interface PluginView {
  id: string;
  title: string;
  /** 返回一段 HTML 字符串（宿主用 `{@html}` 渲染） */
  render: () => string;
}

/** 生命周期 / 数据事件 */
export type PluginEvent = 'onProjectSave' | 'onTaskCreate' | 'onTaskStatusChange' | 'onExport';

/** 钩子处理器 */
export type PluginHookHandler = (payload: unknown) => void;

/** 注入给插件的上下文 */
export interface PluginContext {
  /** 自身 manifest（只读） */
  plugin: PluginManifest;
  /** 注册一条命令（命令面板 / 快捷键） */
  registerCommand(cmd: PluginCommand): void;
  /** 注册一个自定义视图 */
  registerView(view: PluginView): void;
  /** 订阅生命周期 / 数据事件 */
  on(event: PluginEvent, handler: PluginHookHandler): void;
  /** 插件私有 key-value（落 `pm_plugin_<id>_<key>`，与主数据隔离） */
  storage: {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
  };
  /** 写日志（同时记录到插件错误日志便于排查） */
  log(...args: unknown[]): void;
  /** 只读 i18n：`ctx.i18n.t(key)`；**不允许**修改字典 */
  i18n: { t(key: string): string };
}

/** 已安装插件（持久化结构） */
export interface StoredPlugin {
  manifest: PluginManifest;
  /** 插件源码（`new Function('ctx', code)` 的第二个参数） */
  code: string;
}

/** 一条插件错误记录 */
export interface PluginError {
  /** 出错插件 ID（加载期错误可能为 '<unknown>'） */
  pluginId: string;
  /** 人类可读信息 */
  message: string;
  /** 可选堆栈 */
  stack?: string;
  /** 发生时间（ISO） */
  at: string;
}

export type ManifestResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; error: string };

/** 是否普通对象 */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 版本号 → 主版本号（非法返回 null） */
export function majorOf(version: string): number | null {
  const m = /^(\d+)\.\d+\.\d+/.exec(String(version ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * 主版本兼容判定
 *
 * 约定：插件主版本号必须与应用主版本号一致，否则拒绝加载
 * （避免插件依赖已被移除的 API）。
 */
export function isCompatible(pluginVersion: string, appVersion: string = APP_VERSION): boolean {
  const a = majorOf(pluginVersion);
  const b = majorOf(appVersion);
  return a !== null && b !== null && a === b;
}

/**
 * 校验并归一化一个 manifest
 *
 * @example
 * validateManifest(JSON.parse(text))
 */
export function validateManifest(raw: unknown): ManifestResult {
  if (!isObj(raw)) return { ok: false, error: 'manifest 必须是 JSON 对象' };

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  const main = typeof raw.main === 'string' && raw.main.trim() ? raw.main.trim() : 'inline';

  if (!id) return { ok: false, error: '缺少 id' };
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return { ok: false, error: 'id 只能包含字母/数字/._-' };
  if (!name) return { ok: false, error: '缺少 name' };
  if (!version) return { ok: false, error: '缺少 version' };
  if (majorOf(version) === null) return { ok: false, error: 'version 需形如 A.B.C' };

  const capsRaw = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  const capabilities = capsRaw.filter(
    (c): c is PluginCapability => typeof c === 'string' && (PLUGIN_CAPABILITIES as string[]).includes(c)
  );
  if (capabilities.length === 0) return { ok: false, error: 'capabilities 至少声明一个扩展点' };

  return {
    ok: true,
    manifest: {
      id,
      name,
      version,
      main,
      capabilities,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      author: typeof raw.author === 'string' ? raw.author : undefined,
      enabled: raw.enabled === true,
    },
  };
}

/**
 * 插件私有存储的 localStorage key
 *
 * `pm_plugin_<id>_<key>`；id/key 中的非法字符替换为 `_`，避免越界写到主数据键。
 */
export function pluginStorageKey(pluginId: string, key: string): string {
  const safe = (s: string) => String(s ?? '').replace(/[^A-Za-z0-9._-]/g, '_');
  return `pm_plugin_${safe(pluginId)}_${safe(key)}`;
}
