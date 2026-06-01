use encoding_rs::WINDOWS_1252;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntityType {
    Person,
    Place,
    Date,
    Institution,
    Organization,
    Misc,
}

impl EntityType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Person => "person",
            Self::Place => "place",
            Self::Date => "date",
            Self::Institution => "organization",
            Self::Organization => "organization",
            Self::Misc => "misc",
        }
    }
}

pub fn sanitize_entity_value(value: &str) -> String {
    repair_entity_mojibake(value)
        .trim()
        .trim_matches(|ch: char| {
            if ch.is_alphanumeric() {
                return false;
            }
            matches!(
                ch,
                '"' | '\''
                    | '“'
                    | '”'
                    | '‘'
                    | '’'
                    | '-'
                    | '–'
                    | '—'
                    | '«'
                    | '»'
                    | '('
                    | ')'
                    | '['
                    | ']'
                    | '{'
                    | '}'
                    | ':'
                    | ';'
                    | ','
                    | '.'
                    | '!'
                    | '?'
                    | '/'
                    | '\\'
                    | '|'
            ) || ch.is_whitespace()
        })
        .trim()
        .to_string()
}

fn repair_entity_mojibake(value: &str) -> String {
    let trimmed = value.trim();
    if !looks_like_mojibake(trimmed) {
        return trimmed.to_string();
    }

    let latin1_attempt = decode_as_utf8_from_single_byte_chars(trimmed);
    let cp1252_attempt = decode_as_utf8_from_cp1252_like_chars(trimmed);

    [latin1_attempt, cp1252_attempt]
        .into_iter()
        .flatten()
        .min_by_key(|candidate| mojibake_score(candidate))
        .filter(|candidate| mojibake_score(candidate) < mojibake_score(trimmed))
        .unwrap_or_else(|| trimmed.to_string())
}

fn looks_like_mojibake(value: &str) -> bool {
    value.contains('Ã')
        || value.contains('Â')
        || value.contains("â€")
        || value.contains("â€™")
        || value.contains("â€œ")
        || value.contains("â€")
        || value.contains("â€“")
        || value.contains("â€”")
}

fn decode_as_utf8_from_single_byte_chars(value: &str) -> Option<String> {
    let bytes: Option<Vec<u8>> = value
        .chars()
        .map(|ch| u8::try_from(ch as u32).ok())
        .collect();

    String::from_utf8(bytes?).ok()
}

fn decode_as_utf8_from_cp1252_like_chars(value: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(value.len());

    for ch in value.chars() {
        let byte = match ch {
            '€' => 0x80,
            '‚' => 0x82,
            'ƒ' => 0x83,
            '„' => 0x84,
            '…' => 0x85,
            '†' => 0x86,
            '‡' => 0x87,
            'ˆ' => 0x88,
            '‰' => 0x89,
            'Š' => 0x8A,
            '‹' => 0x8B,
            'Œ' => 0x8C,
            'Ž' => 0x8E,
            '‘' => 0x91,
            '’' => 0x92,
            '“' => 0x93,
            '”' => 0x94,
            '•' => 0x95,
            '–' => 0x96,
            '—' => 0x97,
            '˜' => 0x98,
            '™' => 0x99,
            'š' => 0x9A,
            '›' => 0x9B,
            'œ' => 0x9C,
            'ž' => 0x9E,
            'Ÿ' => 0x9F,
            _ => u8::try_from(ch as u32).ok()?,
        };
        bytes.push(byte);
    }

    let (decoded, _, had_errors) = WINDOWS_1252.decode(&bytes);
    if had_errors {
        return None;
    }

    Some(decoded.into_owned())
}

fn mojibake_score(value: &str) -> usize {
    value.matches('Ã').count()
        + value.matches('Â').count()
        + value.matches("â€").count()
        + value.matches('�').count()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntitySource {
    RuleBased,
    Llm,
}

impl EntitySource {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RuleBased => "rule_based",
            Self::Llm => "llm",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Entity {
    pub entity_type: EntityType,
    pub value: String,
    pub start_offset: usize,
    pub end_offset: usize,
    pub confidence: f32,
    pub source: EntitySource,
    pub model_name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn institution_serializes_as_organization() {
        assert_eq!(EntityType::Institution.as_str(), "organization");
    }

    #[test]
    fn sanitize_entity_value_trims_edge_symbols() {
        assert_eq!(
            sanitize_entity_value("\"Conservas Baltar S.A.I.C.\""),
            "Conservas Baltar S.A.I.C"
        );
        assert_eq!(
            sanitize_entity_value("REBELION JUVENIL. —"),
            "REBELION JUVENIL"
        );
        assert_eq!(sanitize_entity_value("  - M. I. A. -  "), "M. I. A");
    }

    #[test]
    fn sanitize_entity_value_repairs_common_utf8_mojibake() {
        assert_eq!(sanitize_entity_value("JosÃ© HernÃ¡ndez"), "José Hernández");
        assert_eq!(sanitize_entity_value("EspaÃ±a"), "España");
        assert_eq!(sanitize_entity_value("caÃ±Ã³n"), "cañón");
    }

    #[test]
    fn sanitize_entity_value_keeps_valid_utf8_untouched() {
        assert_eq!(sanitize_entity_value("José Hernández"), "José Hernández");
        assert_eq!(sanitize_entity_value("Niño"), "Niño");
    }
}
