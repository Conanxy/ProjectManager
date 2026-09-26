use git2::{Repository, Sort};
use super::GitCommit;
use super::parser::parse_commit_message;

pub fn scan_commits(repo_path: &str, since: Option<&str>) -> Result<Vec<GitCommit>, String> {
    let repo = Repository::open(repo_path).map_err(|e| format!("Failed to open repo: {}", e))?;

    let mut revwalk = repo.revwalk().map_err(|e| format!("Failed to create revwalk: {}", e))?;
    revwalk.set_sorting(Sort::TIME).map_err(|e| format!("Failed to set sorting: {}", e))?;

    revwalk.push_head().map_err(|e| format!("Failed to push HEAD: {}", e))?;

    let since_time = since.and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").ok());

    let mut commits = Vec::new();

    for oid_result in revwalk {
        let oid = oid_result.map_err(|e| format!("Failed to get commit OID: {}", e))?;
        let commit = repo.find_commit(oid).map_err(|e| format!("Failed to find commit: {}", e))?;

        let timestamp = commit.time().seconds();
        let datetime = chrono::DateTime::from_timestamp(timestamp, 0)
            .ok_or("Invalid timestamp")?
            .naive_utc();

        if let Some(ref since_dt) = since_time {
            if datetime < *since_dt {
                continue;
            }
        }

        let message = commit.message().unwrap_or("").to_string();
        let (task_ids, action) = parse_commit_message(&message);

        commits.push(GitCommit {
            hash: oid.to_string(),
            message: message.lines().next().unwrap_or("").to_string(),
            author: commit.author().name().unwrap_or("Unknown").to_string(),
            date: datetime.format("%Y-%m-%dT%H:%M:%S").to_string(),
            task_ids,
            action,
        });
    }

    Ok(commits)
}
