use serde::Deserialize;
use super::GitCommit;
use super::parser::parse_commit_message;

#[derive(Deserialize)]
struct GithubCommit {
    sha: String,
    commit: GithubCommitInner,
}

#[derive(Deserialize)]
struct GithubCommitInner {
    message: String,
    author: GithubAuthor,
}

#[derive(Deserialize)]
struct GithubAuthor {
    name: String,
    date: String,
}

pub async fn fetch_remote(owner: &str, repo: &str, token: &str, since: Option<&str>) -> Result<Vec<GitCommit>, String> {
    let client = reqwest::Client::new();
    let mut url = format!("https://api.github.com/repos/{}/{}/commits?per_page=100", owner, repo);

    if let Some(since_date) = since {
        url.push_str(&format!("&since={}", since_date));
    }

    let resp = client
        .get(&url)
        .bearer_auth(token)
        .header("User-Agent", "ProjectManager")
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    let gh_commits: Vec<GithubCommit> = resp.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let commits = gh_commits.iter().map(|c| {
        let (task_ids, action) = parse_commit_message(&c.commit.message);
        GitCommit {
            hash: c.sha.clone(),
            message: c.commit.message.lines().next().unwrap_or("").to_string(),
            author: c.commit.author.name.clone(),
            date: c.commit.author.date.clone(),
            task_ids,
            action,
        }
    }).collect();

    Ok(commits)
}
