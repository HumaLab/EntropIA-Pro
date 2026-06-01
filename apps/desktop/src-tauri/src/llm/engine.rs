use std::num::NonZeroU32;
use std::path::PathBuf;
use std::pin::pin;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;

/// Configuration for the LLM engine.
pub struct LlmConfig {
    pub model_path: PathBuf,
    pub n_ctx: u32,
    pub n_threads: Option<i32>,
    pub seed: u32,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            model_path: PathBuf::new(),
            n_ctx: 4096,
            n_threads: None,
            seed: 1234,
        }
    }
}

/// Wraps llama.cpp via llama-cpp-2 crate. Loads a GGUF model once and runs
/// inference on demand. Text-only only.
pub struct LlmEngine {
    backend: LlamaBackend,
    model: LlamaModel,
    config: LlmConfig,
}

impl LlmEngine {
    fn preview_for_log(text: &str, max_chars: usize) -> String {
        let sanitized = text.replace('\r', "\\r").replace('\n', "\\n");
        let mut chars = sanitized.chars();
        let preview: String = chars.by_ref().take(max_chars).collect();
        if chars.next().is_some() {
            format!("{preview}…")
        } else {
            preview
        }
    }

    pub(crate) fn sanitize_text_output(raw: &str) -> String {
        let mut text = raw.trim();

        for marker in ["<end_of_turn>", "<start_of_turn>", "<eos>"] {
            if let Some(idx) = text.find(marker) {
                text = &text[..idx];
            }
        }

        text = text.trim();

        if text.starts_with("```") {
            let without_opening = text
                .strip_prefix("```")
                .unwrap_or(text)
                .trim_start_matches("text")
                .trim_start_matches("txt")
                .trim_start_matches("markdown")
                .trim_start_matches("json")
                .trim_start_matches("JSON")
                .trim();
            text = without_opening
                .strip_suffix("```")
                .unwrap_or(without_opening)
                .trim();
        }

        let lower = text.to_lowercase();
        for prefix in [
            "texto corregido:",
            "texto corregido y unificado:",
            "corrección ocr:",
            "correccion ocr:",
            "resultado corregido:",
        ] {
            if lower.starts_with(prefix) {
                text = text[prefix.len()..].trim();
                break;
            }
        }

        if text.len() >= 2 {
            let first = text.chars().next().unwrap_or_default();
            let last = text.chars().last().unwrap_or_default();
            let quoted = matches!((first, last), ('"', '"') | ('\'', '\''));
            if quoted {
                let inner = &text[1..text.len() - 1];
                if inner.contains('\n') || inner.len() > 80 {
                    text = inner.trim();
                }
            }
        }

        text.trim().to_string()
    }

    fn sanitize_json_array_output(raw: &str) -> String {
        let text = Self::sanitize_text_output(raw);

        if let Some(start) = text.find('[') {
            if let Some(end_rel) = text[start..].rfind(']') {
                return text[start..=start + end_rel].trim().to_string();
            }
        }

        text
    }

    /// Load a GGUF model from disk in text-only mode.
    pub fn init(config: LlmConfig) -> Result<Self, String> {
        if !config.model_path.exists() {
            return Err(format!(
                "Model file not found: {}",
                config.model_path.display()
            ));
        }

        let mut backend =
            LlamaBackend::init().map_err(|e| format!("Failed to init llama backend: {e}"))?;

        // Silence verbose llama.cpp / ggml native logs (tensor loading, KV cache,
        // reserve spam, etc.). We keep our own `[llm-local] ...` diagnostics.
        backend.void_logs();

        let model_params = pin!(LlamaModelParams::default());

        let model = LlamaModel::load_from_file(&backend, &config.model_path, &model_params)
            .map_err(|e| format!("Failed to load model {}: {e}", config.model_path.display()))?;

        eprintln!(
            "[llm-local] Model loaded: {} (n_ctx={})",
            config.model_path.display(),
            config.n_ctx
        );
        eprintln!("[llm-local] Running in text-only mode");

        Ok(Self {
            backend,
            model,
            config,
        })
    }

    /// Returns the configured context window size.
    pub fn n_ctx(&self) -> u32 {
        self.config.n_ctx
    }

    /// Run raw text generation with the given prompt. Returns the generated text
    /// exactly as decoded from llama.cpp (minus surrounding trim only).
    fn generate_raw(
        &self,
        prompt: &str,
        max_tokens: i32,
        log_prefix: &str,
    ) -> Result<String, String> {
        let tokens = self
            .model
            .str_to_token(prompt, AddBos::Always)
            .map_err(|e| format!("Failed to tokenize prompt: {e}"))?;

        let n_prompt = tokens.len() as i32;
        let prompt_chars = prompt.chars().count();

        let available = self.config.n_ctx as i32 - n_prompt;
        if available <= 0 {
            return Err(format!(
                "Prompt ({} tokens) exceeds context window ({}). \
                 Truncate input text before generating.",
                n_prompt, self.config.n_ctx
            ));
        }
        let effective_max_tokens = max_tokens.min(available);
        if effective_max_tokens < max_tokens {
            eprintln!(
                "{log_prefix} Reducing max_tokens from {} to {} \
                 (prompt={}/n_ctx={})",
                max_tokens, effective_max_tokens, n_prompt, self.config.n_ctx
            );
        }

        let dynamic_batch = u32::try_from(tokens.len())
            .unwrap_or(self.config.n_ctx)
            .max(1)
            .min(self.config.n_ctx);

        let mut ctx_params = LlamaContextParams::default()
            .with_n_ctx(Some(NonZeroU32::new(self.config.n_ctx).unwrap()))
            .with_n_batch(dynamic_batch)
            .with_n_ubatch(dynamic_batch);

        if let Some(threads) = self.config.n_threads {
            ctx_params = ctx_params.with_n_threads(threads);
            ctx_params = ctx_params.with_n_threads_batch(threads);
        }

        let mut ctx = self
            .model
            .new_context(&self.backend, ctx_params)
            .map_err(|e| format!("Failed to create context: {e}"))?;

        let ctx_n_batch = ctx.n_batch();
        let ctx_n_ubatch = ctx.n_ubatch();
        let ctx_n_ctx = ctx.n_ctx();

        eprintln!(
            "{log_prefix} generate request: prompt_chars={}, prompt_tokens={}, requested_max_tokens={}, effective_max_tokens={}, n_ctx={}, n_batch={}, n_ubatch={}",
            prompt_chars, n_prompt, max_tokens, effective_max_tokens, ctx_n_ctx, ctx_n_batch, ctx_n_ubatch
        );

        if u32::try_from(n_prompt).unwrap_or(u32::MAX) > ctx_n_batch {
            return Err(format!(
                "Prompt token count ({}) exceeds llama batch size ({}). Request blocked before decode to avoid runtime abort.",
                n_prompt, ctx_n_batch
            ));
        }

        let n_len = n_prompt + effective_max_tokens;

        let mut batch = LlamaBatch::new(tokens.len().max(1), 1);
        let last_index = (tokens.len() - 1) as i32;
        for (i, token) in (0_i32..).zip(tokens.into_iter()) {
            batch
                .add(token, i, &[0], i == last_index)
                .map_err(|e| format!("Failed to add token to batch: {e}"))?;
        }

        ctx.decode(&mut batch)
            .map_err(|e| format!("Failed to decode prompt: {e}"))?;

        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::dist(self.config.seed),
            LlamaSampler::greedy(),
        ]);

        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut output = String::new();
        let mut n_cur = batch.n_tokens();

        while n_cur <= n_len {
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);

            if self.model.is_eog_token(token) {
                break;
            }

            let piece = self
                .model
                .token_to_piece(token, &mut decoder, true, None)
                .map_err(|e| format!("Failed to decode token: {e}"))?;
            output.push_str(&piece);

            batch.clear();
            batch
                .add(token, n_cur, &[0], true)
                .map_err(|e| format!("Failed to add token to batch: {e}"))?;

            ctx.decode(&mut batch)
                .map_err(|e| format!("Failed to decode: {e}"))?;

            n_cur += 1;
        }

        Ok(output.trim().to_string())
    }

    /// Run text generation with the given prompt. Returns the sanitized generated text
    /// (excluding the prompt). `max_tokens` limits the output length.
    pub fn generate(
        &self,
        prompt: &str,
        max_tokens: i32,
        log_prefix: &str,
    ) -> Result<String, String> {
        let raw = self.generate_raw(prompt, max_tokens, log_prefix)?;
        Ok(Self::sanitize_text_output(&raw))
    }

    /// Generate OCR-corrected text and log raw vs sanitized output when the
    /// sanitization pass materially changes the model response.
    pub fn generate_ocr_correction(
        &self,
        prompt: &str,
        max_tokens: i32,
        log_prefix: &str,
    ) -> Result<String, String> {
        let raw = self.generate_raw(prompt, max_tokens, log_prefix)?;
        let sanitized = Self::sanitize_text_output(&raw);

        if raw.trim() != sanitized {
            eprintln!(
                "[llm-local][correction] sanitized model output: raw_len={}, sanitized_len={}, raw_preview=\"{}\", sanitized_preview=\"{}\"",
                raw.chars().count(),
                sanitized.chars().count(),
                Self::preview_for_log(&raw, 220),
                Self::preview_for_log(&sanitized, 220),
            );
        }

        Ok(sanitized)
    }

    /// Generate semantic triples as JSON.
    ///
    /// IMPORTANT: this intentionally avoids llama.cpp GBNF grammars.
    /// With Gemma 4 + llama.cpp 0.1.145, constrained decoding can abort the
    /// whole process with `GGML_ASSERT(!stacks.empty()) failed` inside
    /// `llama-grammar.cpp`. We prefer unconstrained generation plus robust
    /// JSON extraction/parsing over a hard process crash.
    pub fn generate_triples(
        &self,
        prompt: &str,
        max_tokens: i32,
        log_prefix: &str,
    ) -> Result<String, String> {
        let raw = self.generate_raw(prompt, max_tokens, log_prefix)?;
        let sanitized = Self::sanitize_json_array_output(&raw);

        if raw.trim() != sanitized {
            eprintln!(
                "[llm-local][triples] sanitized model output: raw_len={}, sanitized_len={}, raw_preview=\"{}\", sanitized_preview=\"{}\"",
                raw.chars().count(),
                sanitized.chars().count(),
                Self::preview_for_log(&raw, 220),
                Self::preview_for_log(&sanitized, 220),
            );
        }

        Ok(sanitized)
    }
}
