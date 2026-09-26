export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  task_ids: string[];
  action: string | null;
}
