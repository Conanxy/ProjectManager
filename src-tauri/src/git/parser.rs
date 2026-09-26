use regex::Regex;
use once_cell::sync::Lazy;

static FIXES_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:fix(?:es)?|close(?:s)?|resolve(?:s)?)\s+#([\w-]+)").unwrap()
});

static REF_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?<!\w)#([\w-]+)").unwrap()
});

pub fn parse_commit_message(msg: &str) -> (Vec<String>, Option<String>) {
    let mut task_ids = Vec::new();
    let mut action: Option<String> = None;

    for caps in FIXES_RE.captures_iter(msg) {
        if let Some(id) = caps.get(1) {
            let id_str = id.as_str().to_string();
            if !task_ids.contains(&id_str) {
                task_ids.push(id_str);
            }
            action = Some("fixes".to_string());
        }
    }

    if task_ids.is_empty() {
        for caps in REF_RE.captures_iter(msg) {
            if let Some(id) = caps.get(1) {
                let id_str = id.as_str().to_string();
                if !task_ids.contains(&id_str) {
                    task_ids.push(id_str);
                }
                action = Some("refs".to_string());
            }
        }
    }

    (task_ids, action)
}
