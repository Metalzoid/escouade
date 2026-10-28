//! The spec compared to the code (ESC-263): what the short agent is told and what is read of its
//! answer, the pages a ticket touches, a comparison on demand and after a ticket validated (with
//! the fake claude), « Mettre la spec à jour ».

use crate::core_tests::harness;
use crate::docs::{Gap, Page};
use crate::docscompare::*;
use crate::paths::test_dir;
use std::time::Duration;

fn page(path: &str, body: &str) -> Page {
    Page {
        path: path.into(),
        title: path.into(),
        body: body.into(),
        ..Default::default()
    }
}

#[test]
fn the_gaps_are_read_from_the_answer_and_a_prose_is_none() {
    let a = "Voilà.\n\n```json\n{\"gaps\": [{\"text\": \" Quatre, pas trois. \", \"code\": [\"src/a.rs\"]}, {\"text\": \"\"}]}\n```";
    assert_eq!(
        gaps_from_answer(a),
        Some(vec![Gap {
            text: "Quatre, pas trois.".into(),
            code: vec!["src/a.rs".into()],
        }])
    );
    assert_eq!(gaps_from_answer("{\"gaps\": []}"), Some(vec![]));
    assert_eq!(gaps_from_answer("Tout va bien."), None);
    assert_eq!(
        body_from_answer("```json\n{\"body\": \"# Page\\n\\nTexte.\"}\n```").as_deref(),
        Some("# Page\n\nTexte.")
    );
    assert_eq!(body_from_answer("{\"body\": \"  \"}"), None);
}

#[test]
fn a_gap_names_only_files_of_the_folder_that_are_there_and_not_fenced() {
    let dir = test_dir("dc-keep");
    std::fs::create_dir_all(dir.join("src")).unwrap();
    std::fs::write(dir.join("src/a.rs"), "x").unwrap();
    std::fs::write(dir.join("secret.rs"), "x").unwrap();
    std::fs::write(test_dir("dc-keep-out").join("x.rs"), "x").ok();
    let mut gaps = vec![Gap {
        text: "x".into(),
        code: vec![
            "src\\a.rs".into(),
            "./src/a.rs".into(),
            "../dc-keep-out/x.rs".into(),
            "C:/Windows/win.ini".into(),
            "/etc/passwd".into(),
            "absent.rs".into(),
            "secret.rs".into(),
        ],
    }];
    keep_code(&mut gaps, &dir, |p| p.ends_with("secret.rs"));
    assert_eq!(gaps[0].code, vec!["src/a.rs".to_string()]);
}

#[test]
fn the_page_and_the_files_the_index_links_to_it_are_given_to_the_agent() {
    let mut p = page("paiement/echeances", "Trois échéances au plus.");
    p.title = "Échéances \"x\"".into();
    let lang = crate::i18n::Lang::Fr;
    let text = prompt(lang, &p, &["src/pay.rs".into()]);
    assert!(text.starts_with(
        "<spec-page path=\"paiement/echeances\" title=\"Échéances 'x'\">\nTrois échéances au plus.\n</spec-page>"
    ));
    assert!(text.contains("<code-hints>\nsrc/pay.rs\n</code-hints>"));
    assert!(!prompt(lang, &p, &[]).contains("<code-hints>"));
    // It reads and never changes; it answers gaps in JSON.
    for lang in [crate::i18n::Lang::Fr, crate::i18n::Lang::En] {
        assert!(system(lang).contains("```json"));
        assert!(system(lang).contains("\"gaps\""));
    }
}

#[test]
fn a_ticket_touches_the_pages_it_wrote_names_or_whose_code_it_changed() {
    let mut named = page("compte/connexion", "Par mot de passe.");
    named.tickets = vec!["dem-7".into()];
    let mut by_gap = page("compte/profil", "Le profil.");
    by_gap.gaps = vec![Gap {
        text: "x".into(),
        code: vec!["src/profile.ts".into()],
    }];
    let pages = vec![
        page("paiement/echeances", "Voir `src/payments/schedule.rs`."),
        page("paiement/recu", "Le reçu part par `send_receipt`."),
        page("paiement/relances", "Le module mailer.ts relance."),
        page("general/glossaire", "Le main du lib et ses types."),
        named,
        by_gap,
        page("paiement/acompte", "Un acompte."),
    ];
    let changed = vec![
        "src/payments/schedule.rs".to_string(),
        "src/mailer.ts".to_string(),
        "src/main.rs".to_string(),
        "src/lib.rs".to_string(),
        "src/profile.ts".to_string(),
        ".escouade/spec/paiement/acompte.md".to_string(),
    ];
    let symbols = vec!["send_receipt".to_string(), "lib".to_string()];
    let written = pages_of(&changed);
    assert_eq!(written, vec!["paiement/acompte".to_string()]);
    let got = touched(&pages, "DEM-7", &changed, &symbols, &written);
    assert_eq!(
        got,
        vec![
            "paiement/acompte",
            "compte/connexion",
            "paiement/echeances",
            "paiement/recu",
            "paiement/relances",
            "compte/profil",
        ]
    );
    // A page not there is never named; a word inside another is not the symbol.
    let only = touched(
        &[page("a/b", "send_receipts")],
        "X-1",
        &[],
        &["send_receipt".into()],
        &["a/zz".into()],
    );
    assert!(only.is_empty());
}

async fn wait_compared(space: &crate::docs::Space, path: &str) -> Page {
    for _ in 0..150 {
        let p = space.spec_read(path).unwrap();
        if !p.compared.is_empty() {
            return p;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    panic!("{path} never compared");
}

#[tokio::test]
async fn a_page_compared_on_demand_gets_its_gaps_and_the_time() {
    let h = harness("docs-compare");
    let (p, repo) = h.project(false).await;
    std::fs::write(repo.join("paiement.rs"), "const MAX: u32 = 3;").unwrap();
    let space = h.core.docs_space(&p.id, None).await.unwrap();
    space
        .spec_write("paiement/echeances", |p| {
            p.body = "Quatre échéances. [écart]".into()
        })
        .unwrap();
    space
        .spec_write("paiement/recu", |p| p.body = "Par e-mail.".into())
        .unwrap();
    let done = h
        .core
        .docs_compare(&p.id, Some(vec!["paiement/echeances".into()]))
        .await
        .unwrap();
    assert_eq!((done.pages, done.gaps, done.failed), (1, 1, 0));
    let page = space.spec_read("paiement/echeances").unwrap();
    assert_eq!(page.gaps.len(), 1);
    assert!(page.gaps[0].text.contains("trois"), "{:?}", page.gaps);
    // The first file of the folder, which is there; the one outside the project is left out.
    assert_eq!(page.gaps[0].code.len(), 1);
    assert!(repo.join(&page.gaps[0].code[0]).is_file());
    assert!(chrono::DateTime::parse_from_rfc3339(&page.compared).is_ok());
    assert!(space
        .spec_read("paiement/recu")
        .unwrap()
        .compared
        .is_empty());
    // The whole spec: every page; the one that tells the truth has no gap.
    let all = h.core.docs_compare(&p.id, None).await.unwrap();
    assert_eq!((all.pages, all.gaps), (2, 1));
    assert!(space.spec_read("paiement/recu").unwrap().gaps.is_empty());
    assert!(comparing(&p.id).is_empty());
    // « Mettre la spec à jour »: the page says what the code does, its gap gone.
    let updated = h
        .core
        .docs_update_from_gap(&p.id, "paiement/echeances", 0)
        .await
        .unwrap();
    assert!(updated.gaps.is_empty());
    assert!(updated.body.contains("Mis à jour d’après le code"));
    assert!(!updated.body.contains("[écart]"));
    assert!(h
        .core
        .docs_update_from_gap(&p.id, "paiement/echeances", 0)
        .await
        .is_err());
    // A model that fails: refused, the page as it was.
    space
        .spec_write("paiement/muet", |p| p.body = "[muet]".into())
        .unwrap();
    assert!(h
        .core
        .docs_compare(&p.id, Some(vec!["paiement/muet".into()]))
        .await
        .is_err());
    assert!(space
        .spec_read("paiement/muet")
        .unwrap()
        .compared
        .is_empty());
    // Nothing committed by a comparison.
    assert!(crate::core_tests::git(&repo, &["status", "--porcelain"]).contains(".escouade/"));
}

#[tokio::test]
async fn after_a_ticket_is_validated_the_pages_it_touches_are_compared() {
    let h = harness("docs-compare-ticket");
    let (p, repo) = h.project(false).await;
    let (t, _wt) = crate::tickets_tests::reviewed(&h, &p.id, "Fichier [ok]").await;
    // A page of the spec, in the project, that names the file the ticket's agent writes; another
    // that names nothing of it.
    let file = format!("{}.txt", t.key.to_lowercase());
    let space = h.core.docs_space(&p.id, None).await.unwrap();
    space
        .spec_write("export/fichier", |p| {
            p.body = format!("Le fichier `{file}` dit la boucle. [écart]")
        })
        .unwrap();
    space
        .spec_write("autre/page", |p| p.body = "Rien à voir.".into())
        .unwrap();
    crate::core_tests::git(&repo, &["add", "-A"]);
    crate::core_tests::git(&repo, &["commit", "-qm", "spec"]);
    h.core.ticket_approve(&t.id).await.unwrap();
    assert_eq!(h.ticket(&t.id).column, crate::model::Column::Done);
    let page = wait_compared(&space, "export/fichier").await;
    assert_eq!(page.gaps.len(), 1, "{page:?}");
    // The page it does not touch is not compared.
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(space.spec_read("autre/page").unwrap().compared.is_empty());
}
