mod local;
mod parser;
mod remote;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub task_ids: Vec<String>,
    pub action: Option<String>,
}

#[tauri::command]
pub async fn git_scan_commits(repo_path: String, since: Option<String>) -> Result<Vec<GitCommit>, String> {
    local::scan_commits(&repo_path, since.as_deref())
}

#[tauri::command]
pub async fn git_fetch_remote(owner: String, repo: String, token: String, since: Option<String>) -> Result<Vec<GitCommit>, String> {
    remote::fetch_remote(&owner, &repo, &token, since.as_deref()).await
}
