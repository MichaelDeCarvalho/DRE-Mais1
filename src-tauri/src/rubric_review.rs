//! Classificacao documental pura das rubricas da DRE de referencia.
//! Sem acesso a SQLite, Tauri ou API e sem lancamentos financeiros.
use serde::Serialize;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

pub struct RubricInput<'a> {
    pub source_row: usize,
    pub label: &'a str,
    pub value_kind: &'a str,
    pub value_cents: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewedRubric {
    pub source_row: usize,
    pub role: &'static str,
    pub status: &'static str,
    pub posting_policy: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RubricReview {
    pub recognized: usize,
    pub not_classified: usize,
    pub review_required: usize,
    pub rows: Vec<ReviewedRubric>,
}

fn canonical(label: &str) -> String {
    label.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .trim()
        .to_lowercase()
}

fn definition(source_row: usize) -> Option<(&'static str, &'static str)> {
    match source_row {
        7 => Some(("Receita Total", "RECEITA_DOCUMENTAL")),
        13 => Some(("DESCONTOS", "AJUSTE_DE_RECEITA")),
        15 => Some(("Despesas Variáveis", "SUBTOTAL_VARIAVEIS")),
        33 => Some(("Alíquota Simples Nacional", "COMPONENTE_TRIBUTO")),
        34 => Some(("Royalties", "COMPONENTE_ROYALTIES")),
        52 => Some(("Despesas Fixas", "SUBTOTAL_FIXAS")),
        75 => Some(("Folha de Pagamento", "COMPONENTE_FOLHA")),
        105 => Some(("Resultado", "RESULTADO_DOCUMENTAL")),
        _ => None,
    }
}

/// Apenas identificacao e conferência de celulas documentais conhecidas.
/// O status RECONHECIDA NAO autoriza lançar valores no modulo operacional.
pub fn analyze(rows: &[RubricInput<'_>]) -> RubricReview {
    let mut reviewed = Vec::with_capacity(rows.len());
    let mut recognized = 0;
    let mut not_classified = 0;
    let mut review_required = 0;
    for row in rows {
        let (role, status) = match definition(row.source_row) {
            None => {
                not_classified += 1;
                ("SEM_CLASSIFICACAO", "NAO_CLASSIFICADA")
            }
            Some((label, role)) if canonical(label) != canonical(row.label) => {
                review_required += 1;
                (role, "ROTULO_DIVERGENTE")
            }
            Some((_, role)) if row.value_kind != "MONETARIO" || row.value_cents.is_none() => {
                review_required += 1;
                (role, "VALOR_NAO_MONETARIO_OU_AUSENTE")
            }
            Some((_, role)) => {
                recognized += 1;
                (role, "RECONHECIDA")
            }
        };
        reviewed.push(ReviewedRubric {
            source_row: row.source_row,
            role,
            status,
            posting_policy: "NAO_LANCAR_AUTOMATICAMENTE",
        });
    }
    RubricReview { recognized, not_classified, review_required, rows: reviewed }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_known_rows_without_posting_or_treating_subtotals_as_expenses() {
        let rows = [
            RubricInput { source_row: 7, label: "Receita Total", value_kind: "MONETARIO", value_cents: Some(2_494_463) },
            RubricInput { source_row: 15, label: "DESPESAS VARIAVEIS", value_kind: "MONETARIO", value_cents: Some(1_189_531) },
            RubricInput { source_row: 33, label: "Alíquota Simples Nacional", value_kind: "MONETARIO", value_cents: Some(199_557) },
            RubricInput { source_row: 34, label: "Royalties", value_kind: "MONETARIO", value_cents: Some(174_612) },
            RubricInput { source_row: 52, label: "Despesas Fixas", value_kind: "MONETARIO", value_cents: Some(928_876) },
            RubricInput { source_row: 75, label: "Folha de Pagamento", value_kind: "MONETARIO", value_cents: Some(387_376) },
            RubricInput { source_row: 105, label: "Resultado", value_kind: "MONETARIO", value_cents: Some(376_057) },
        ];
        let review = analyze(&rows);
        assert_eq!(review.recognized, 7);
        assert_eq!(review.not_classified, 0);
        assert_eq!(review.review_required, 0);
        assert_eq!(review.rows[1].role, "SUBTOTAL_VARIAVEIS");
        assert_eq!(review.rows[2].role, "COMPONENTE_TRIBUTO");
        assert!(review.rows.iter().all(|r| r.posting_policy == "NAO_LANCAR_AUTOMATICAMENTE"));
    }

    #[test]
    fn rejects_unexpected_labels_and_missing_numbers_without_zero_substitution() {
        let rows = [
            RubricInput { source_row: 15, label: "Outra Rubrica", value_kind: "MONETARIO", value_cents: Some(1) },
            RubricInput { source_row: 52, label: "Despesas Fixas", value_kind: "SEM_VALOR", value_cents: None },
            RubricInput { source_row: 61, label: "Aluguel", value_kind: "MONETARIO", value_cents: Some(100) },
        ];
        let review = analyze(&rows);
        assert_eq!(review.recognized, 0);
        assert_eq!(review.review_required, 2);
        assert_eq!(review.not_classified, 1);
        assert_eq!(review.rows[0].status, "ROTULO_DIVERGENTE");
        assert_eq!(review.rows[1].status, "VALOR_NAO_MONETARIO_OU_AUSENTE");
        assert_eq!(review.rows[2].status, "NAO_CLASSIFICADA");
    }

    #[test]
    fn unknown_rows_are_never_inferred_as_operational_postings() {
        let row = RubricInput { source_row: 42, label: "Taxa e Folha", value_kind: "MONETARIO", value_cents: Some(900) };
        let review = analyze(&[row]);
        assert_eq!(review.rows[0].role, "SEM_CLASSIFICACAO");
        assert_eq!(review.rows[0].posting_policy, "NAO_LANCAR_AUTOMATICAMENTE");
    }
}
