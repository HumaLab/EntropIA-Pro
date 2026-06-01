use serde::{Deserialize, Serialize};

const GLM_OCR_API_URL: &str = "https://api.z.ai/api/paas/v4/layout_parsing";
const GLM_OCR_TEST_IMAGE_URL: &str = "https://cdn.bigmodel.cn/static/logo/introduction.png";

#[derive(Deserialize)]
struct GlmOcrApiErrorEnvelope {
    error: Option<GlmOcrApiError>,
    msg: Option<String>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GlmOcrApiError {
    code: Option<String>,
    message: Option<String>,
}

#[derive(Serialize)]
struct LayoutParsingRequest<'a> {
    model: &'static str,
    file: &'a str,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GlmOcrResponse {
    #[allow(dead_code)]
    pub id: Option<String>,
    #[allow(dead_code)]
    pub created: Option<i64>,
    #[allow(dead_code)]
    pub model: Option<String>,
    #[serde(default)]
    pub md_results: String,
    #[serde(default)]
    pub layout_details: Vec<Vec<GlmOcrLayoutDetail>>,
    pub data_info: Option<GlmOcrDataInfo>,
    #[allow(dead_code)]
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GlmOcrLayoutDetail {
    pub index: Option<i32>,
    pub label: Option<String>,
    #[serde(default)]
    pub bbox_2d: Vec<f32>,
    pub content: Option<String>,
    pub height: Option<u32>,
    pub width: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GlmOcrDataInfo {
    #[allow(dead_code)]
    pub num_pages: Option<u32>,
    #[serde(default)]
    pub pages: Vec<GlmOcrPageInfo>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GlmOcrPageInfo {
    pub width: u32,
    pub height: u32,
}

pub struct GlmOcrClient {
    client: reqwest::Client,
    api_key: String,
}

impl GlmOcrClient {
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
            .post(GLM_OCR_API_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&LayoutParsingRequest {
                model: "glm-ocr",
                file: GLM_OCR_TEST_IMAGE_URL,
            })
            .send()
            .await
            .map_err(|e| format!("GLM-OCR connection test failed: {e}"))?;

        Self::ensure_success(response).await.map(|_| ())
    }

    pub async fn parse_file(&self, file: &str) -> Result<GlmOcrResponse, String> {
        let response = self
            .client
            .post(GLM_OCR_API_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&LayoutParsingRequest {
                model: "glm-ocr",
                file,
            })
            .send()
            .await
            .map_err(|e| format!("GLM-OCR request failed: {e}"))?;

        Self::ensure_success(response)
            .await?
            .json()
            .await
            .map_err(|e| format!("Failed to parse GLM-OCR response: {e}"))
    }

    async fn ensure_success(response: reqwest::Response) -> Result<reqwest::Response, String> {
        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }

        let body = response.text().await.unwrap_or_default();
        let api_error = serde_json::from_str::<GlmOcrApiErrorEnvelope>(&body)
            .ok()
            .and_then(|parsed| {
                let nested = parsed.error.and_then(|err| match (err.code, err.message) {
                    (Some(code), Some(message)) => Some(format!("{code}: {message}")),
                    (_, Some(message)) => Some(message),
                    (Some(code), None) => Some(code),
                    _ => None,
                });
                nested.or(parsed.msg).or(parsed.message)
            })
            .unwrap_or_else(|| body.trim().to_string());

        Err(format!("GLM-OCR API error ({status}): {api_error}"))
    }
}
