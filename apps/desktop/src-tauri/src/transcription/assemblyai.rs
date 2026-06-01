use super::engine::{Segment, TranscriptionResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

const ASSEMBLYAI_API_BASE: &str = "https://api.assemblyai.com/v2";

#[derive(Deserialize)]
struct AssemblyAiApiError {
    error: Option<String>,
}

#[derive(Deserialize)]
struct UploadResponse {
    upload_url: String,
}

#[derive(Serialize)]
struct CreateTranscriptRequest {
    audio_url: String,
    speech_model: &'static str,
    language_detection: bool,
    temperature: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    speaker_labels: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    speech_understanding: Option<SpeechUnderstandingConfig>,
}

#[derive(Serialize)]
struct SpeechUnderstandingConfig {
    request: SpeechUnderstandingRequest,
}

#[derive(Serialize)]
struct SpeechUnderstandingRequest {
    speaker_identification: SpeakerIdentificationRequest,
}

#[derive(Serialize)]
struct SpeakerIdentificationRequest {
    speaker_type: &'static str,
    known_values: [&'static str; 2],
}

#[derive(Deserialize)]
struct CreateTranscriptResponse {
    id: String,
}

#[derive(Deserialize)]
struct TranscriptStatusResponse {
    status: String,
    text: Option<String>,
    error: Option<String>,
    language_code: Option<String>,
    audio_duration: Option<f64>,
    utterances: Option<Vec<TranscriptUtterance>>,
    speech_understanding: Option<SpeechUnderstandingStatus>,
}

#[derive(Deserialize)]
struct TranscriptUtterance {
    speaker: Option<String>,
    speaker_label: Option<String>,
    text: String,
}

#[derive(Deserialize)]
struct SpeechUnderstandingStatus {
    response: Option<SpeechUnderstandingResponse>,
}

#[derive(Deserialize)]
struct SpeechUnderstandingResponse {
    speaker_identification: Option<SpeakerIdentificationResponse>,
}

#[derive(Deserialize)]
struct SpeakerIdentificationResponse {
    mapping: Option<HashMap<String, String>>,
}

pub struct AssemblyAiClient {
    client: reqwest::Client,
    api_key: String,
}

impl AssemblyAiClient {
    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .user_agent("EntropIA-Desktop/0.1 (historical-research-app)")
            .build()
            .expect("Failed to build reqwest client");

        Self { client, api_key }
    }

    pub async fn test_connection(&self) -> Result<(), String> {
        let response = self
            .client
            .get(format!("{ASSEMBLYAI_API_BASE}/transcript?limit=1"))
            .header("Authorization", &self.api_key)
            .send()
            .await
            .map_err(|e| format!("AssemblyAI connection test failed: {e}"))?;

        Self::ensure_success(response, "AssemblyAI")
            .await
            .map(|_| ())
    }

    pub async fn transcribe_file<F>(
        &self,
        audio_path: &Path,
        enable_role_speaker_identification: bool,
        mut on_progress: F,
    ) -> Result<TranscriptionResult, String>
    where
        F: FnMut(u8, &str),
    {
        on_progress(20, "uploading");

        let audio_bytes = tokio::fs::read(audio_path)
            .await
            .map_err(|e| format!("Failed to read audio file {}: {e}", audio_path.display()))?;

        let upload_response = self
            .client
            .post(format!("{ASSEMBLYAI_API_BASE}/upload"))
            .header("Authorization", &self.api_key)
            .header("Content-Type", "application/octet-stream")
            .body(audio_bytes)
            .send()
            .await
            .map_err(|e| format!("AssemblyAI upload failed: {e}"))?;

        let upload: UploadResponse = Self::ensure_success(upload_response, "AssemblyAI")
            .await?
            .json()
            .await
            .map_err(|e| format!("Failed to parse AssemblyAI upload response: {e}"))?;

        on_progress(40, "submitting_remote");

        let transcript_response = self
            .client
            .post(format!("{ASSEMBLYAI_API_BASE}/transcript"))
            .header("Authorization", &self.api_key)
            .json(&CreateTranscriptRequest {
                audio_url: upload.upload_url,
                speech_model: "universal",
                language_detection: true,
                temperature: 0,
                speaker_labels: enable_role_speaker_identification.then_some(true),
                speech_understanding: enable_role_speaker_identification.then_some(
                    SpeechUnderstandingConfig {
                        request: SpeechUnderstandingRequest {
                            speaker_identification: SpeakerIdentificationRequest {
                                speaker_type: "role",
                                known_values: ["Entrevistador", "Entrevistado"],
                            },
                        },
                    },
                ),
            })
            .send()
            .await
            .map_err(|e| format!("AssemblyAI transcript request failed: {e}"))?;

        let created: CreateTranscriptResponse =
            Self::ensure_success(transcript_response, "AssemblyAI")
                .await?
                .json()
                .await
                .map_err(|e| format!("Failed to parse AssemblyAI transcript response: {e}"))?;

        let mut poll_attempt = 0_u8;
        loop {
            poll_attempt = poll_attempt.saturating_add(1);
            let progress = 45_u8.saturating_add((poll_attempt.saturating_sub(1)).saturating_mul(5));
            on_progress(progress.min(90), "polling_remote");

            let status_response = self
                .client
                .get(format!("{ASSEMBLYAI_API_BASE}/transcript/{}", created.id))
                .header("Authorization", &self.api_key)
                .send()
                .await
                .map_err(|e| format!("AssemblyAI polling failed: {e}"))?;

            let transcript: TranscriptStatusResponse =
                Self::ensure_success(status_response, "AssemblyAI")
                    .await?
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse AssemblyAI polling response: {e}"))?;

            match transcript.status.as_str() {
                "completed" => {
                    let text = format_transcript_text(
                        transcript.text.unwrap_or_default(),
                        transcript.utterances,
                        transcript.speech_understanding,
                    );
                    let duration_ms = transcript
                        .audio_duration
                        .map(|seconds| (seconds * 1000.0).round() as u64)
                        .unwrap_or(0);
                    let segments = if text.is_empty() {
                        Vec::new()
                    } else {
                        vec![Segment {
                            start: 0.0,
                            end: duration_ms as f64 / 1000.0,
                            text: text.clone(),
                        }]
                    };

                    return Ok(TranscriptionResult {
                        text,
                        language: transcript
                            .language_code
                            .unwrap_or_else(|| "auto".to_string()),
                        segments,
                        duration_ms,
                    });
                }
                "error" => {
                    return Err(transcript.error.unwrap_or_else(|| {
                        "AssemblyAI returned an unknown transcription error".to_string()
                    }))
                }
                _ => tokio::time::sleep(tokio::time::Duration::from_secs(3)).await,
            }
        }
    }

    async fn ensure_success(
        response: reqwest::Response,
        provider_name: &str,
    ) -> Result<reqwest::Response, String> {
        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }

        let body = response.text().await.unwrap_or_default();
        let api_error = serde_json::from_str::<AssemblyAiApiError>(&body)
            .ok()
            .and_then(|parsed| parsed.error)
            .unwrap_or_else(|| body.trim().to_string());

        Err(format!("{provider_name} API error ({status}): {api_error}"))
    }
}

fn format_transcript_text(
    fallback_text: String,
    utterances: Option<Vec<TranscriptUtterance>>,
    speech_understanding: Option<SpeechUnderstandingStatus>,
) -> String {
    let speaker_mapping = speech_understanding
        .and_then(|status| status.response)
        .and_then(|response| response.speaker_identification)
        .and_then(|speaker_identification| speaker_identification.mapping);

    if let (Some(utterances), Some(mapping)) = (utterances, speaker_mapping.as_ref()) {
        let formatted = utterances
            .into_iter()
            .filter_map(|utterance| {
                let speaker_key = utterance.speaker.or(utterance.speaker_label)?;
                let label = mapping
                    .get(&speaker_key)
                    .map(|value| display_speaker_role(value))
                    .unwrap_or_else(|| speaker_key.trim().to_string());
                let text = utterance.text.trim();
                if text.is_empty() {
                    None
                } else {
                    Some(format!("{label}: {text}"))
                }
            })
            .collect::<Vec<_>>()
            .join("\n");

        if !formatted.is_empty() {
            return formatted;
        }
    }

    if let Some(mapping) = speaker_mapping.as_ref() {
        let remapped = remap_speaker_prefixes(&fallback_text, mapping);
        if !remapped.is_empty() {
            return remapped;
        }
    }

    fallback_text.trim().to_string()
}

fn remap_speaker_prefixes(text: &str, mapping: &HashMap<String, String>) -> String {
    text.lines()
        .map(|line| {
            let trimmed = line.trim();
            let Some((speaker_key, content)) = trimmed.split_once(':') else {
                return trimmed.to_string();
            };

            let Some(mapped_speaker) = mapping.get(speaker_key.trim()) else {
                return trimmed.to_string();
            };

            let content = content.trim();
            if content.is_empty() {
                display_speaker_role(mapped_speaker)
            } else {
                format!("{}: {}", display_speaker_role(mapped_speaker), content)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn display_speaker_role(role: &str) -> String {
    match role.trim() {
        "Entrevistador" => "Entrevistador/a".to_string(),
        "Entrevistado" => "Entrevistado/a".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn failed_transcript_uses_remote_error_message() {
        let payload: TranscriptStatusResponse = serde_json::from_str(
            r#"{"status":"error","error":"Audio duration exceeds plan limit"}"#,
        )
        .expect("valid transcript error payload");

        assert_eq!(payload.status, "error");
        assert_eq!(
            payload.error.as_deref(),
            Some("Audio duration exceeds plan limit")
        );
    }

    #[test]
    fn transcript_request_omits_speech_understanding_when_disabled() {
        let payload = serde_json::to_value(CreateTranscriptRequest {
            audio_url: "https://example.test/audio.mp3".to_string(),
            speech_model: "universal",
            language_detection: true,
            temperature: 0,
            speaker_labels: None,
            speech_understanding: None,
        })
        .expect("request serializes");

        assert_eq!(payload.get("speaker_labels"), None);
        assert_eq!(payload.get("speech_understanding"), None);
    }

    #[test]
    fn transcript_request_includes_role_speaker_identification_when_enabled() {
        let payload = serde_json::to_value(CreateTranscriptRequest {
            audio_url: "https://example.test/audio.mp3".to_string(),
            speech_model: "universal",
            language_detection: true,
            temperature: 0,
            speaker_labels: Some(true),
            speech_understanding: Some(SpeechUnderstandingConfig {
                request: SpeechUnderstandingRequest {
                    speaker_identification: SpeakerIdentificationRequest {
                        speaker_type: "role",
                        known_values: ["Entrevistador", "Entrevistado"],
                    },
                },
            }),
        })
        .expect("request serializes");

        assert_eq!(
            payload,
            json!({
                "audio_url": "https://example.test/audio.mp3",
                "speech_model": "universal",
                "language_detection": true,
                "temperature": 0,
                "speaker_labels": true,
                "speech_understanding": {
                    "request": {
                        "speaker_identification": {
                            "speaker_type": "role",
                            "known_values": ["Entrevistador", "Entrevistado"]
                        }
                    }
                }
            })
        );
    }

    #[test]
    fn formats_utterances_using_interview_roles() {
        let formatted = format_transcript_text(
            "A: Hola\nB: Buen día".to_string(),
            Some(vec![
                TranscriptUtterance {
                    speaker: Some("A".to_string()),
                    speaker_label: None,
                    text: "Hola".to_string(),
                },
                TranscriptUtterance {
                    speaker: Some("B".to_string()),
                    speaker_label: None,
                    text: "Buen día".to_string(),
                },
            ]),
            Some(SpeechUnderstandingStatus {
                response: Some(SpeechUnderstandingResponse {
                    speaker_identification: Some(SpeakerIdentificationResponse {
                        mapping: Some(HashMap::from([
                            ("A".to_string(), "Entrevistador".to_string()),
                            ("B".to_string(), "Entrevistado".to_string()),
                        ])),
                    }),
                }),
            }),
        );

        assert_eq!(formatted, "Entrevistador/a: Hola\nEntrevistado/a: Buen día");
    }

    #[test]
    fn remaps_existing_speaker_prefixes_when_only_text_is_available() {
        let formatted = format_transcript_text(
            "A: Hola\nB: Buen día".to_string(),
            None,
            Some(SpeechUnderstandingStatus {
                response: Some(SpeechUnderstandingResponse {
                    speaker_identification: Some(SpeakerIdentificationResponse {
                        mapping: Some(HashMap::from([
                            ("A".to_string(), "Entrevistador".to_string()),
                            ("B".to_string(), "Entrevistado".to_string()),
                        ])),
                    }),
                }),
            }),
        );

        assert_eq!(formatted, "Entrevistador/a: Hola\nEntrevistado/a: Buen día");
    }
}
