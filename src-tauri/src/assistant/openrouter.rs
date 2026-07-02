use async_trait::async_trait;
use serde_json::json;

use super::{for_each_sse_event, provider_error, role_str, AssistantProvider, ChatMessage};
use crate::error::AppError;

const ENDPOINT: &str = "https://openrouter.ai/api/v1/chat/completions";
// OpenRouter routes to many models — pick a cheap, capable default.
// Change this to any model slug listed at https://openrouter.ai/models.
const MODEL: &str = "openai/gpt-4o-mini";

pub struct OpenRouterProvider;

#[async_trait]
impl AssistantProvider for OpenRouterProvider {
    async fn stream_reply(
        &self,
        client: &reqwest::Client,
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

        let response = client
            .post(ENDPOINT)
            .bearer_auth(api_key)
            // Identifies the app to OpenRouter for analytics/rate-limit attribution.
            .header("X-Title", "naden")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;

        if !response.status().is_success() {
            return Err(provider_error("OpenRouter", response.status()));
        }

        // OpenRouter streams in the same OpenAI-compatible SSE format:
        //   {"choices":[{"delta":{"content":"Hel"}}]}
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
