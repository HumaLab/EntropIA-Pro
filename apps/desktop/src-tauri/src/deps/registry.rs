//! Static registry of all managed Python dependencies.
//!
//! Each entry describes how to detect and install one dependency. The registry
//! is a `&'static [DependencySpec]` so it never allocates and is safe to access
//! from multiple threads without synchronisation.

use super::DependencyId;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Specification for a single managed dependency.
pub struct DependencySpec {
    /// Canonical identifier — used as the map key everywhere.
    pub id: DependencyId,
    /// Human-readable name shown in the UI.
    pub display_name: &'static str,
    /// pip/uv install specifier, e.g. `"paddlepaddle>=3.2.1,<3.3.0"`.
    /// `None` means the dependency has a custom install path.
    pub pip_spec: Option<&'static str>,
    /// One-liner Python code that prints `"ok"` when the dependency is available.
    pub probe_code: &'static str,
    /// Whether the main local Python AI pipeline cannot function without this dependency.
    pub critical: bool,
    /// Managed-environment prerequisites that must exist before this dep can install.
    pub managed_prerequisites: &'static [DependencyId],
    /// Relative install order — lower numbers are installed first.
    pub install_order: u8,
}

const NO_PREREQUISITES: &[DependencyId] = &[];
const PADDLEOCR_PREREQUISITES: &[DependencyId] = &[DependencyId::PaddlePaddle];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

static ALL_DEPS: &[DependencySpec] = &[
    DependencySpec {
        id: DependencyId::Python,
        display_name: "Python",
        pip_spec: None,
        probe_code: "import sys; print('ok')",
        critical: true,
        managed_prerequisites: NO_PREREQUISITES,
        install_order: 0,
    },
    DependencySpec {
        id: DependencyId::PaddlePaddle,
        display_name: "PaddlePaddle",
        // PaddlePaddle 2.6.2 is incompatible with paddleocr[doc-parser]>=3.x
        // (missing AnalysisConfig.set_optimization_level).
        // PaddlePaddle 3.3.1 has a confirmed upstream PIR/oneDNN bug that
        // crashes with ConvertPirAttribute2RuntimeAttribute (Paddle#77340).
        // The verified working range is >=3.2.1,<3.3.0 (3.2.2 is the sweet spot).
        pip_spec: Some("paddlepaddle>=3.2.1,<3.3.0"),
        probe_code: "import paddle; print('ok')",
        critical: true,
        managed_prerequisites: NO_PREREQUISITES,
        install_order: 1,
    },
    DependencySpec {
        id: DependencyId::PaddleOcr,
        display_name: "PaddleOCR",
        pip_spec: Some("paddleocr[doc-parser]>=2.9.0"),
        probe_code: "from paddleocr import PaddleOCRVL; print('ok')",
        critical: true,
        managed_prerequisites: PADDLEOCR_PREREQUISITES,
        install_order: 2,
    },
    DependencySpec {
        id: DependencyId::FasterWhisper,
        display_name: "faster-whisper",
        pip_spec: Some("faster-whisper>=1.0.0"),
        probe_code: "import faster_whisper; print('ok')",
        critical: false,
        managed_prerequisites: NO_PREREQUISITES,
        install_order: 3,
    },
    DependencySpec {
        id: DependencyId::Spacy,
        display_name: "spaCy NER español",
        // The es_core_news_md 3.8 model wheel no longer declares spaCy as a
        // dependency, so install spaCy explicitly alongside it. spaCy 3.8.x ships
        // cp39–cp313 wheels, so this installs and loads on Python 3.11/3.12/3.13
        // without source builds (3.7.x had no Python 3.13 wheels). The two
        // space-separated packages are installed together by install_package.
        // The md model carries word vectors → better NER quality than sm.
        pip_spec: Some("spacy>=3.8.0,<3.9.0 https://github.com/explosion/spacy-models/releases/download/es_core_news_md-3.8.0/es_core_news_md-3.8.0-py3-none-any.whl"),
        probe_code: "import spacy; spacy.load('es_core_news_md'); print('ok')",
        critical: false,
        managed_prerequisites: NO_PREREQUISITES,
        install_order: 4,
    },
];

/// Return the full static registry of all managed dependencies.
pub fn all_deps() -> &'static [DependencySpec] {
    ALL_DEPS
}

/// Look up a single dependency by id.
pub fn find_dep(id: &DependencyId) -> Option<&'static DependencySpec> {
    ALL_DEPS.iter().find(|spec| &spec.id == id)
}

/// Return all dependencies in deterministic install order.
pub fn all_deps_in_install_order() -> Vec<&'static DependencySpec> {
    let mut deps = ALL_DEPS.iter().collect::<Vec<_>>();
    deps.sort_by_key(|spec| spec.install_order);
    deps
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_length() {
        assert_eq!(
            all_deps().len(),
            5,
            "Registry should have exactly 5 Python runtime entries"
        );
    }

    #[test]
    fn test_registry_order() {
        let deps = all_deps();
        for window in deps.windows(2) {
            assert!(
                window[0].install_order < window[1].install_order,
                "Deps should be ordered by install_order: {} ({}) >= {} ({})",
                window[0].display_name,
                window[0].install_order,
                window[1].display_name,
                window[1].install_order,
            );
        }
    }

    #[test]
    fn test_find_dep() {
        let python = find_dep(&DependencyId::Python);
        assert!(python.is_some(), "Python dep must be in registry");
        assert_eq!(python.unwrap().install_order, 0);

        let paddlepaddle = find_dep(&DependencyId::PaddlePaddle);
        assert!(paddlepaddle.is_some(), "PaddlePaddle must be in registry");
        let paddlepaddle = paddlepaddle.unwrap();
        assert_eq!(paddlepaddle.display_name, "PaddlePaddle");
        assert!(
            paddlepaddle.pip_spec.is_some(),
            "PaddlePaddle must have a pip_spec"
        );
        let spec = paddlepaddle.pip_spec.unwrap();
        assert!(spec.contains("paddlepaddle"));
        assert!(
            spec.contains("<3.3.0"),
            "PaddlePaddle pip_spec must cap at <3.3.0 to avoid PIR executor bugs, got: {spec}"
        );
        assert_eq!(paddlepaddle.probe_code, "import paddle; print('ok')");
    }

    #[test]
    fn test_paddleocr_declares_paddlepaddle_prerequisite() {
        let paddleocr = find_dep(&DependencyId::PaddleOcr).expect("PaddleOcr present");
        assert_eq!(
            paddleocr.managed_prerequisites,
            &[DependencyId::PaddlePaddle],
            "PaddleOcr must depend on PaddlePaddle"
        );
    }

    #[test]
    fn test_paddlepaddle_pip_spec_in_3_2_range() {
        let paddlepaddle = find_dep(&DependencyId::PaddlePaddle).expect("PaddlePaddle present");
        let spec = paddlepaddle
            .pip_spec
            .expect("PaddlePaddle must have pip_spec");
        assert!(
            spec.starts_with("paddlepaddle"),
            "spec should start with paddlepaddle: {spec}"
        );
        assert!(
            spec.contains(">=3.2.1"),
            "spec should require at least 3.2.1 for PaddleOCR-VL compatibility: {spec}"
        );
        assert!(
            spec.contains("<3.3.0"),
            "spec must exclude 3.3.x PIR/oneDNN bug (Paddle#77340): {spec}"
        );
    }

    #[test]
    fn test_paddlepaddle_comes_before_paddleocr_in_install_order() {
        let deps = all_deps_in_install_order();
        let paddlepaddle_idx = deps.iter().position(|d| d.id == DependencyId::PaddlePaddle);
        let paddleocr_idx = deps.iter().position(|d| d.id == DependencyId::PaddleOcr);
        assert!(
            paddlepaddle_idx.is_some(),
            "PaddlePaddle must be in install order"
        );
        assert!(
            paddleocr_idx.is_some(),
            "PaddleOcr must be in install order"
        );
        assert!(
            paddlepaddle_idx.unwrap() < paddleocr_idx.unwrap(),
            "PaddlePaddle must be installed before PaddleOcr"
        );
    }

    #[test]
    fn test_paddleocr_probe_verifies_paddleocrvl() {
        let paddleocr = find_dep(&DependencyId::PaddleOcr).expect("PaddleOcr present");
        assert_eq!(
            paddleocr.probe_code, "from paddleocr import PaddleOCRVL; print('ok')",
            "PaddleOcr probe must verify PaddleOCRVL is importable"
        );
    }

    #[test]
    fn test_all_deps_in_install_order_is_sorted() {
        let deps = all_deps_in_install_order();
        for window in deps.windows(2) {
            assert!(
                window[0].install_order <= window[1].install_order,
                "install order helper must stay sorted"
            );
        }
    }
}
