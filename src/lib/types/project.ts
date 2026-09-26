/**
 * 项目领域类型定义
 *
 * 定义了项目（Project）及其相关结构的 TypeScript 接口，
 * 包括标签、变更日志、里程碑和项目模板名称。
 *
 * @module types/project
 */

import type { Task } from './task';
import type { FlowchartData } from './flowchart';

/**
 * 项目模板名称
 * 决定项目创建时生成的目录结构和文件。
 * - `default` — 通用项目模板
 * - `electron` — Electron 桌面应用模板
 * - `hardware` — 硬件项目模板
 * - `web` — Web 前端项目模板
 */
export type TemplateName = 'default' | 'electron' | 'hardware' | 'web' | 'todo';

/**
 * 标签定义
 * 项目级别的标签，可用于对任务进行分类和筛选。
 */
export interface Tag {
  /** 唯一标识符 */
  id: string;
  /** 标签显示名称 */
  name: string;
  /** 标签颜色（十六进制） */
  color: string;
}

/**
 * 变更日志条目
 *
 * 版本号是 `A.B.C`：A=大版本、B=小版本（两者由手动按钮递增），
 * C 位只由软件自动递增（增删改任务/里程碑等）。
 */
export interface ChangelogEntry {
  /** 版本号（`A.B.C`，项目从 "0.1.0" 开始，见 utils/version.ts） */
  version: string;
  /** 变更日期（ISO 日期格式） */
  date: string;
  /** 变更说明 */
  info: string;
  /**
   * 是否由软件自动记录（只递增 C 位）
   *
   * - `true`：自动记录（「创建任务 X」这类），UI 里弱化显示
   * - `false` / 缺失：手动记录（发布小/大版本），UI 里高亮显示
   * - 历史数据没有这个字段 → 按“普通”显示，不误标为发版
   */
  auto?: boolean;
}

/**
 * 里程碑
 * 项目中的重要节点或目标，用于标记关键日期。
 */
export interface Milestone {
  /** 唯一标识符 */
  id: string;
  /** 里程碑标题 */
  title: string;
  /** 目标日期（ISO 日期格式） */
  date: string;
  /** 显示颜色（十六进制） */
  color: string;
  /** 详细描述 */
  description: string;
}

/** 项目存储配置（**本机配置，不写入 .pm、不参与同步**，见 docs/DATA-FORMAT.md） */
export interface ProjectStorage {
  type: 'local' | 'server';
  path?: string;
  url?: string;
  /**
   * 拥有该本地文件夹的设备 ID（仅 `type === 'local'` 有意义）
   *
   * 只有归属设备才执行本地 `.pm` 写入；非归属设备只参与服务器同步。
   * 在本机首次成功写入 `.pm` 后补写（见 `markProjectStorageOwner()`）。
   */
  ownerDeviceId?: string;
  /** 归属设备的可读名（仅展示用） */
  ownerDeviceName?: string;
}

/**
 * 文件树条目
 *
 * 用于"默认"模板扫描真实项目目录后存储的文件/目录结构。
 * 每条记录包含名称、相对路径和是否为目录。
 */
export interface FileTreeEntry {
  /** 文件/目录名 */
  name: string;
  /** 相对于项目根目录的路径 */
  path: string;
  /** 是否为目录 */
  isDir: boolean;
}

/**
 * 项目（Project）
 *
 * 应用的核心实体，包含项目元数据、任务列表、标签、
 * 变更日志、里程碑和 README 内容。
 */
export interface Project {
  /** 唯一标识符（UUID 格式） */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目描述 */
  description: string;
  /** 项目主题色（十六进制） */
  color: string;
  /** 使用的项目模板 */
  template: TemplateName;
  /** 创建时间（ISO 格式） */
  created_at: string;
  /** 最后更新时间（ISO 格式） */
  updated_at: string;
  /** 是否已归档 */
  archived: boolean;
  /** 项目开始日期（可选，ISO 日期格式 YYYY-MM-DD） */
  start_date?: string;
  /** 项目结束/截止日期（可选，ISO 日期格式 YYYY-MM-DD） */
  end_date?: string;
  /** 存储配置（local = 本地文件夹, server = 远程地址） */
  storage?: ProjectStorage;
  /** 项目下的所有任务 */
  tasks: Task[];
  /** 项目定义的标签列表 */
  tags: Tag[];
  /** 变更日志 */
  changelog: ChangelogEntry[];
  /** 里程碑列表 */
  milestones: Milestone[];
  /** README 文档内容（Markdown 格式） */
  readme: string;
  /**
   * 真实文件树（仅"默认"模板 + 本地存储时填充）
   *
   * 包含从项目文件夹扫描得到的文件/目录结构。
   * 为 null 或 undefined 时回退到模板生成的文件树。
   */
  fileTree?: FileTreeEntry[] | null;
  /** 看板自定义列（todo 模板使用，默认 ["待办","进行中","已完成"]） */
  kanban_columns?: string[];
  /** 是否参与云同步（默认 true） */
  sync_enabled?: boolean;
  /**
   * 项目排序值（升序，越小越靠前）
   *
   * 与数组下标解耦，使顺序能随 .pm 一起跨设备同步：
   * 拖拽排序只改被移动的项目（必要时全量重排），其它设备拉取后按此字段重排列表。
   * 缺失时按当前数组下标兜底（旧的 .pm / localStorage 数据兼容）。
   */
  sort_order?: number;
  /** 流程图数据（可选） */
  flowchart?: FlowchartData;
}
