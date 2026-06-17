use super::*;
use crate::models::server::{Server, Tag};

fn make_server(display_name: &str, hostname: &str, tags: &[&str]) -> ServerWithTags {
    ServerWithTags {
        server: Server {
            id: display_name.to_string(),
            display_name: display_name.to_string(),
            hostname: hostname.to_string(),
            port: 22,
            username: "root".to_string(),
            auth_method: "key".to_string(),
            identity_file_path: None,
            vault_credential_id: None,
            group_id: None,
            is_jump_host: false,
            jump_host_id: None,
            is_favourite: false,
            initial_dir: None,
            env_vars: None,
            pre_connect_hook: None,
            post_disconnect_hook: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        },
        tags: tags
            .iter()
            .map(|name| Tag {
                id: name.to_string(),
                name: name.to_string(),
            })
            .collect(),
    }
}

#[test]
fn empty_query_returns_all_servers_unchanged() {
    let servers = vec![
        make_server("Beta", "beta.example.com", &[]),
        make_server("Alpha", "alpha.example.com", &[]),
    ];

    let results = filter_servers(&servers, "  ");

    let names: Vec<&str> = results
        .iter()
        .map(|s| s.server.display_name.as_str())
        .collect();
    assert_eq!(names, vec!["Beta", "Alpha"]);
}

#[test]
fn fuzzy_query_ranks_closer_match_first() {
    let servers = vec![
        make_server("Reproduction DB", "repro.example.com", &[]),
        make_server("Prod Server", "prod.example.com", &[]),
    ];

    let results = filter_servers(&servers, "prod");

    assert_eq!(results[0].server.display_name, "Prod Server");
}

#[test]
fn query_matches_tag_name() {
    let servers = vec![
        make_server(
            "Prod Server",
            "prod.example.com",
            &["production", "primary"],
        ),
        make_server("Staging Server", "staging.example.com", &["staging"]),
    ];

    let results = filter_servers(&servers, "production");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].server.display_name, "Prod Server");
}
