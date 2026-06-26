pub mod anthropic;
pub mod openai;
pub mod openrouter;

use async_trait::async_trait;
use futures_util::{Stream, StreamExt};

use crate::error::AppError;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
}

pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

/// One client per provider, behind a shared interface so the calling command
/// doesn't need to know which API it's talking to. `stream_reply` calls
/// `on_token` once per chunk as it arrives over the wire — the caller forwards
/// each one to the frontend as an IPC event, the same way PTY bytes stream
/// through `terminal:output:{sessionId}`.
#[async_trait]
pub trait AssistantProvider: Send + Sync {
    async fn stream_reply(
        &self,
        api_key: &str,
        messages: &[ChatMessage],
        on_token: &mut (dyn FnMut(String) + Send),
    ) -> Result<(), AppError>;
}

/// Resolves the stored provider id (`"openai"` | `"anthropic"` | `"openrouter"`) to its client.
pub fn provider_for(id: &str) -> Result<Box<dyn AssistantProvider>, AppError> {
    match id {
        "openai" => Ok(Box::new(openai::OpenAiProvider)),
        "anthropic" => Ok(Box::new(anthropic::AnthropicProvider)),
        "openrouter" => Ok(Box::new(openrouter::OpenRouterProvider)),
        other => Err(AppError::Validation(format!(
            "unknown assistant provider: {other}"
        ))),
    }
}

/// Maps a non-2xx HTTP status from a provider into a user-facing message that
/// is specific enough to act on but never echoes response body content (which
/// may include truncated API key hints).
fn provider_error(provider_name: &str, status: reqwest::StatusCode) -> AppError {
    let message = match status.as_u16() {
        401 | 403 => format!("Invalid {provider_name} API key — check Settings → AI Assistant"),
        429 => format!("{provider_name} rate limit exceeded — try again in a moment"),
        500..=599 => format!("{provider_name} is temporarily unavailable — try again later"),
        _ => format!("{provider_name} request failed (HTTP {status})"),
    };
    AppError::Validation(message)
}

/// Both OpenAI and Anthropic stream replies as Server-Sent Events: lines of
/// `data: <json>` separated by blank lines. OpenAI terminates with a literal
/// `data: [DONE]`; Anthropic sends a `message_stop` event whose JSON shape
/// `on_event` simply won't match — both end naturally when the body closes.
/// This walks the raw byte stream, reassembling lines across chunk boundaries,
/// and hands each event's JSON payload to `on_event`.
async fn for_each_sse_event(
    mut bytes: impl Stream<Item = reqwest::Result<bytes::Bytes>> + Unpin,
    mut on_event: impl FnMut(&str),
) -> Result<(), AppError> {
    let mut buf = String::new();
    while let Some(chunk) = bytes.next().await {
        let chunk = chunk.map_err(|e| AppError::Io(e.to_string()))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf.drain(..=pos);
            if let Some(payload) = line.strip_prefix("data: ") {
                if payload == "[DONE]" {
                    return Ok(());
                }
                on_event(payload);
            }
        }
    }
    Ok(())
}

fn role_str(role: Role) -> &'static str {
    match role {
        Role::User => "user",
        Role::Assistant => "assistant",
    }
}
