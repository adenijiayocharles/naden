use async_trait::async_trait;
use serde_json::json;

use super::{for_each_sse_event, role_str, AssistantProvider, ChatMessage};
use crate::error::AppError;

const ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
// Pin to whichever chat model you want to support — check OpenAI's current
// model list, this is just a reasonable inexpensive default.
const MODEL: &str = "gpt-4o-mini";

pub struct OpenAiProvider;

#[async_trait]
impl AssistantProvider for OpenAiProvider {
    async fn stream_reply(
        &self,
        api_key: &str,
        messages: &[ChatMessage],
        on_token: &mut (dyn FnMut(String) + Send),
    ) -> Result<(), AppError> {
        let body = json!({
            "model": MODEL,
            "stream": true,
            "messages": messages.iter()
                .map(|m| json!({ "role": role_str(m.role), "content": m.content }))
                .collect::<Vec<_>>(),
        });

        let response = reqwest::Client::new()
            .post(ENDPOINT)
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Io(e.to_string()))?
            .error_for_status()
            .map_err(|e| AppError::Validation(format!("OpenAI request failed: {e}")))?;

        // Streamed chunks look like:
        //   {"choices":[{"delta":{"content":"Hel"}}]}
        //   {"choices":[{"delta":{"content":"lo"}}]}
        for_each_sse_event(response.bytes_stream(), |payload| {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) {
                if let Some(token) = value["choices"][0]["delta"]["content"].as_str() {
                    on_token(token.to_string());
                }
            }
        })
        .await
    }
}
