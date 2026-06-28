use crate::models::server::ServerWithTags;

/// Filters `servers` by `query` using case-insensitive substring matching.
/// Returns all servers unchanged when query is empty.
pub fn filter_servers(servers: &[ServerWithTags], query: &str) -> Vec<ServerWithTags> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return servers.to_vec();
    }

    servers
        .iter()
        .filter(|server| build_haystack(server).to_lowercase().contains(&q))
        .cloned()
        .collect()
}

fn build_haystack(server: &ServerWithTags) -> String {
    let s = &server.server;
    let mut parts = vec![
        s.display_name.as_str(),
        s.hostname.as_str(),
        s.username.as_str(),
    ];
    if let Some(ref gname) = server.group_name {
        parts.push(gname.as_str());
    }
    for tag in &server.tags {
        parts.push(tag.name.as_str());
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests;
