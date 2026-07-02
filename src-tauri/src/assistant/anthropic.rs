use async_trait::async_trait;
use serde_json::json;

use super::{for_each_sse_event, provider_error, role_str, AssistantProvider, ChatMessage};
use crate::error::AppError;

const ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
// Pin to whichever model you want to support — check Anthropic's current
// model list, this is just a reasonable inexpensive default.
const MODEL: &str = "claude-haiku-4-5-20251001";

pub struct AnthropicProvider;

#[async_trait]
impl AssistantProvider for AnthropicProvider {
    async fn stream_reply(
        &self,
        client: &reqwest::Client,
        api_key: &str,
        messages: &[ChatMessage],
        on_token: &mut (dyn FnMut(String) + Send),
    ) -> Result<(), AppError> {
        let body = json!({
            "model": MODEL,
            "max_tokens": 1024,
            "stream": true,
            "messages": messages.iter()
                .map(|m| json!({ "role": role_str(m.role), "content": m.content }))
                .collect::<Vec<_>>(),
        });

        let response = client
            .post(ENDPOINT)
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;

        if !response.status().is_success() {
            return Err(provider_error("Anthropic", response.status()));
        }

        // Streamed events look like:
        //   {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}
        // Other event types (message_start, content_block_start, message_stop,
        // ...) simply don't match the `content_block_delta` check and are skipped.
        for_each_sse_event(response.bytes_stream(), |payload| {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) {
                if value["type"] == "content_block_delta" {
                    if let Some(token) = value["delta"]["text"].as_str() {
                        on_token(token.to_string());
                    }
                }
            }
        })
        .await
    }
}
