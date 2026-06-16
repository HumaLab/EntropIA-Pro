/// Text chunking helpers for NLP pipelines that must respect provider limits.
///
/// Splits long texts into fixed-size windows, preferring paragraph boundaries
/// (newlines) so each chunk ends cleanly between paragraphs. No overlap by
/// design — callers that need it can post-process. Texts shorter than
/// `MAX_CHARS` pass through untouched.
pub const MAX_CHARS: usize = 28000;

/// One chunk of a larger document, tagged with the character offset in the
/// original text where this chunk starts. Offsets are measured in Unicode
/// scalar values, matching how NER offsets are computed in this codebase.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextChunk {
    pub start: usize,
    pub text: String,
}

/// Split `text` into chunks of at most [`MAX_CHARS`] characters.
///
/// Returns a single-element vector for short inputs (zero overhead). For longer
/// inputs, each chunk ends at a newline (paragraph break) when one exists in
/// the second half of the window, otherwise at the hard limit. The final
/// chunk may be shorter than the limit. Each returned chunk carries the
/// character offset where it begins in the original text, so callers can
/// rebase entity offsets back to the source document.
pub fn chunk_text(text: &str) -> Vec<TextChunk> {
    let total = text.chars().count();
    if total <= MAX_CHARS {
        return vec![TextChunk {
            start: 0,
            text: text.to_string(),
        }];
    }

    let chars: Vec<char> = text.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0usize;
    while start < chars.len() {
        let mut end = (start + MAX_CHARS).min(chars.len());

        // Try to end the chunk on a paragraph boundary (newline) in the
        // second half of the window. If none exists, fall back to the hard
        // limit (the chunk will be cut mid-line, but we never lose content).
        if end < chars.len() {
            let min_break = start + (MAX_CHARS / 2);
            let mut cursor = end;
            while cursor > min_break {
                if chars[cursor - 1] == '\n' {
                    end = cursor;
                    break;
                }
                cursor -= 1;
            }
        }

        let chunk: String = chars[start..end].iter().collect();
        chunks.push(TextChunk { start, text: chunk });
        start = end;
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_text_returns_single_chunk() {
        let chunks = chunk_text("hola mundo");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].start, 0);
        assert_eq!(chunks[0].text, "hola mundo");
    }

    #[test]
    fn text_at_limit_returns_single_chunk() {
        let text = "a".repeat(MAX_CHARS);
        let chunks = chunk_text(&text);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].start, 0);
        assert_eq!(chunks[0].text.chars().count(), MAX_CHARS);
    }

    #[test]
    fn long_text_with_newline_breaks_on_paragraph() {
        let mut text = "a".repeat(MAX_CHARS - 1);
        text.push('\n');
        text.push_str(&"b".repeat(100));
        let chunks = chunk_text(&text);
        assert_eq!(chunks.len(), 2);
        assert!(chunks[0].text.ends_with('\n'));
        assert_eq!(chunks[0].text.chars().count(), MAX_CHARS);
        assert_eq!(chunks[0].start, 0);
        assert_eq!(chunks[1].text.chars().count(), 100);
        assert_eq!(chunks[1].start, MAX_CHARS);
    }

    #[test]
    fn long_text_without_newline_falls_back_to_hard_cut() {
        let text = "a".repeat(MAX_CHARS + 100);
        let chunks = chunk_text(&text);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].start, 0);
        assert_eq!(chunks[0].text.chars().count(), MAX_CHARS);
        assert_eq!(chunks[1].start, MAX_CHARS);
        assert_eq!(chunks[1].text.chars().count(), 100);
    }

    #[test]
    fn newline_in_second_half_is_preferred_over_first_half() {
        // Window is [0, MAX_CHARS) with the boundary search limited to the
        // second half (>= MAX_CHARS / 2 = 14_000). Place one newline in the
        // first half (index 10_000) and one in the second half (index 20_001);
        // the chunk must break at the second-half newline.
        let mut text = "a".repeat(10_000);
        text.push('\n');
        text.push_str(&"b".repeat(10_000));
        text.push('\n');
        text.push_str(&"c".repeat(8_000)); // total 28_002 > MAX_CHARS
        let chunks = chunk_text(&text);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].start, 0);
        assert_eq!(chunks[0].text.chars().count(), 20_002);
        assert!(chunks[0].text.ends_with('\n'));
        assert_eq!(chunks[1].start, 20_002);
        assert_eq!(chunks[1].text.chars().count(), 8_000);
    }

    #[test]
    fn chunks_cover_full_input_without_gaps() {
        let text = "x".repeat(MAX_CHARS * 3 + 7);
        let chunks = chunk_text(&text);
        let total: usize = chunks.iter().map(|c| c.text.chars().count()).sum();
        assert_eq!(total, MAX_CHARS * 3 + 7);
    }

    #[test]
    fn unicode_chars_are_counted_not_bytes() {
        let text = "🎉".repeat(MAX_CHARS + 5);
        let chunks = chunk_text(&text);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].start, 0);
        assert_eq!(chunks[0].text.chars().count(), MAX_CHARS);
        assert_eq!(chunks[1].start, MAX_CHARS);
        assert_eq!(chunks[1].text.chars().count(), 5);
    }
}
