use async_trait::async_trait;
use serde_json::json;

use super::{for_each_sse_event, provider_error, AssistantProvider, ChatMessage, Role};
use crate::error::AppError;

// Pin to whichever model you want to support — check Google's current model
// list, this is just a reasonable inexpensive default.
const MODEL: &str = "gemini-2.5-flash";

fn endpoint() -> String {
    format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:streamGenerateContent?alt=sse"
    )
}

// Gemini calls the assistant turn "model" rather than "assistant".
fn gemini_role(role: Role) -> &'static str {
    match role {
        Role::User => "user",
        Role::Assistant => "model",
    }
}

pub struct GeminiProvider;

#[async_trait]
impl AssistantProvider for GeminiProvider {
    async fn stream_reply(
        &self,
        client: &reqwest::Client,
        api_key: &str,
        messages: &[ChatMessage],
        on_token: &mut (dyn FnMut(String) + Send),
    ) -> Result<(), AppError> {
        let body = json!({
            "contents": messages.iter()
                .map(|m| json!({ "role": gemini_role(m.role), "parts": [{ "text": m.content }] }))
                .collect::<Vec<_>>(),
        });

        let response = client
            .post(endpoint())
            .header("x-goog-api-key", api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;

        if !response.status().is_success() {
            return Err(provider_error("Gemini", response.status()));
        }

        // Streamed chunks look like:
        //   {"candidates":[{"content":{"parts":[{"text":"Hel"}],"role":"model"}}]}
        for_each_sse_event(response.bytes_stream(), |payload| {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) {
                if let Some(token) = value["candidates"][0]["content"]["parts"][0]["text"].as_str()
                {
                    on_token(token.to_string());
                }
            }
        })
        .await
    }
}
