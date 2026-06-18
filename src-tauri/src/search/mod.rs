use nucleo_matcher::{
    pattern::{CaseMatching, Normalization, Pattern},
    Config, Matcher, Utf32Str,
};

use crate::models::server::ServerWithTags;

/// Filters `servers` by `query` using fuzzy matching.
/// Preserves score-descending order. Returns all servers unchanged when query is empty.
pub fn filter_servers(servers: &[ServerWithTags], query: &str) -> Vec<ServerWithTags> {
    if query.trim().is_empty() {
        return servers.to_vec();
    }

    let mut matcher = Matcher::new(Config::DEFAULT);
    let pattern = Pattern::parse(query, CaseMatching::Ignore, Normalization::Smart);

    let mut scored: Vec<(&ServerWithTags, u32)> = servers
        .iter()
        .filter_map(|server| {
            let haystack = build_haystack(server);
            let mut buf = Vec::new();
            let score = pattern.score(Utf32Str::new(&haystack, &mut buf), &mut matcher)?;
            Some((server, score))
        })
        .collect();

    scored.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));
    scored.into_iter().map(|(s, _)| s.clone()).collect()
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
