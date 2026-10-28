//! The docs in the repository (ESC-256): the formats read back as they were written, a decision
//! that was accepted never rewritten, the paths kept inside the project (no link, no way up), the
//! documents' text kept outside the repository, a spec found in the project, and the branch of the
//! docs: the current one, or a fixed one in a worktree Escouade holds and never merges.

use crate::core_tests::{git, harness};
use crate::docs::*;
use crate::paths::{make_dir_link, make_file_link, test_dir};
use std::path::{Path, PathBuf};

fn space(name: &str) -> (Space, PathBuf) {
    let root = test_dir(name);
    let text = test_dir(&format!("{name}-text"));
    (Space::new(&root, Some(text)), root)
}

/// One folder however it is spelt: git answers `C:/…/runneradmin/…`, the temporary folder
/// `C:…RUNNER~1…`.
fn same(a: &Path, b: &Path) -> bool {
    crate::paths::same_folder(&a.to_string_lossy(), &b.to_string_lossy())
}

/// Removes a link to a folder made by `make_dir_link`: a file for Unix, a folder for Windows.
fn remove_dir_link(link: &Path) {
    #[cfg(unix)]
    std::fs::remove_file(link).unwrap();
    #[cfg(windows)]
    std::fs::remove_dir(link).unwrap();
}

fn proposal(title: &str) -> Decision {
    Decision {
        title: title.into(),
        context: "Les clients payent en plusieurs fois.".into(),
        decision: "Trois échéances au plus.".into(),
        consequences: "Un échéancier à suivre.".into(),
        ..Default::default()
    }
}

#[test]
fn a_page_reads_back_as_it_was_written() {
    let p = Page {
        path: "paiement/recu-fiscal".into(),
        title: "Reçu fiscal « à l’envoi »: \"oui\"".into(),
        subject: "paiement".into(),
        sources: vec![
            "documents/cahier.md".into(),
            "https://exemple.fr/a?b=1".into(),
        ],
        tickets: vec!["ESC-12".into()],
        decisions: vec![3, 7],
        compared: "2026-10-28T10:00:00+02:00".into(),
        body: "# Reçu\n\nLe reçu part par e-mail.\n\n---\n\n- un : deux\n- trois".into(),
    };
    let text = page_write(&p);
    assert!(text.starts_with("---\ntitle: "), "{text}");
    assert_eq!(page_read("paiement/recu-fiscal", &text), p);
    // Written again, the same bytes.
    assert_eq!(page_write(&page_read(&p.path, &text)), text);
    // Never compared: null.
    let never = Page {
        compared: String::new(),
        ..p.clone()
    };
    assert!(page_write(&never).contains("compared: null"));
    assert_eq!(page_read(&p.path, &page_write(&never)), never);
}

#[test]
fn a_page_written_by_hand_without_a_header_is_still_a_page() {
    let p = page_read("guide/demarrer", "# Démarrer\n\nOn lance.\n");
    assert_eq!(p.title, "Démarrer");
    assert_eq!(p.subject, "guide");
    assert_eq!(p.body, "# Démarrer\n\nOn lance.");
    let lone = page_read("notes", "Juste du texte.");
    assert_eq!(
        (lone.title.as_str(), lone.subject.as_str()),
        ("notes", "general")
    );
}

#[test]
fn a_page_path_is_a_slug_per_segment_and_never_leaves_the_folder() {
    assert_eq!(
        page_path("Paiement/Reçu fiscal.md").as_deref(),
        Some("paiement/recu-fiscal")
    );
    assert_eq!(page_path("a/b/c/d").as_deref(), Some("a/b/c/d"));
    for bad in [
        "",
        "  ",
        "../x",
        "a/../b",
        "/abs",
        "a\\b",
        "C:/x",
        "a//b",
        "a/b/c/d/e",
        "con",
        "a/./b",
    ] {
        assert_eq!(page_path(bad), None, "{bad}");
    }
    assert_eq!(
        document_path("Contrats/2026/cahier v2.pdf").as_deref(),
        Some("Contrats/2026/cahier v2.pdf")
    );
    for bad in ["", "../x", "a/../x", "a\\b", "C:/x", "a//b", "/etc/passwd"] {
        assert_eq!(document_path(bad), None, "{bad}");
    }
}

#[test]
fn the_spec_is_written_by_subject_and_read_searched_and_listed() {
    let (s, root) = space("docs-spec");
    let (page, added, removed) = s
        .spec_write("paiement/recu-fiscal", |p| {
            p.title = "Reçu fiscal".into();
            p.body = "Le reçu part par e-mail.\nIl est en PDF.".into();
            p.tickets = vec!["ESC-1".into()];
        })
        .unwrap();
    assert_eq!((page.subject.as_str(), added, removed), ("paiement", 2, 0));
    assert!(root
        .join(".escouade/spec/paiement/recu-fiscal.md")
        .is_file());
    // Changed: the fields left alone stay, the lines are counted.
    let (page, added, removed) = s
        .spec_write("paiement/recu-fiscal", |p| {
            p.body = "Le reçu part par e-mail.\nIl est signé.\nIl est en PDF.".into();
        })
        .unwrap();
    assert_eq!((added, removed), (1, 0));
    assert_eq!(page.tickets, vec!["ESC-1".to_string()]);
    assert_eq!(s.spec_read("Paiement/Reçu fiscal").unwrap(), page);
    s.spec_write("paiement/echeances", |p| p.body = "Trois échéances.".into())
        .unwrap();
    s.spec_write("compte/profil", |p| p.body = "# Profil\nLe nom.".into())
        .unwrap();
    let tree = s.spec_tree();
    let shape: Vec<(String, Vec<String>)> = tree
        .iter()
        .map(|t| {
            (
                t.name.clone(),
                t.pages.iter().map(|p| p.path.clone()).collect(),
            )
        })
        .collect();
    assert_eq!(
        shape,
        vec![
            ("compte".to_string(), vec!["compte/profil".to_string()]),
            (
                "paiement".to_string(),
                vec![
                    "paiement/echeances".to_string(),
                    "paiement/recu-fiscal".to_string()
                ]
            ),
        ]
    );
    assert_eq!(tree[0].pages[0].title, "Profil");
    // A search: all the words, any case, title first.
    let hits = s.spec_search("REÇU signé", 10);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].path, "paiement/recu-fiscal");
    assert!(hits[0].lines.iter().any(|l| l.contains("signé")));
    assert!(s.spec_search("inconnu", 10).is_empty());
    assert!(s.spec_read("paiement/rien").is_err());
    assert!(s.spec_read("../../etc/passwd").is_err());
    assert!(s.spec_write("a/../b", |_| {}).is_err());
}

#[test]
fn a_decision_reads_back_as_it_was_written() {
    let d = Decision {
        number: 12,
        title: "Trois échéances au plus".into(),
        date: "2026-10-28".into(),
        state: State::Accepted,
        origin: "brainstorm".into(),
        origin_ref: "Paiement en plusieurs fois".into(),
        pages: vec!["paiement/echeances".into()],
        tickets: vec!["ESC-9".into()],
        documents: vec!["cahier/paiement.pdf".into()],
        supersedes: vec![4],
        superseded_by: None,
        changes: vec![Change {
            page: "paiement/echeances".into(),
            added: 12,
            removed: 3,
        }],
        accepted_at: "2026-10-28T11:00:00+02:00".into(),
        accepted_by: "Léa".into(),
        context: "Les clients payent en plusieurs fois.\n\nSouvent.".into(),
        decision: "Trois échéances au plus.".into(),
        consequences: "Un échéancier à suivre.".into(),
    };
    let text = decision_write(&d);
    assert_eq!(decision_read(&text).unwrap(), d);
    assert_eq!(d.file_name(), "0012-trois-echeances-au-plus.md");
    // The headings may be in either language.
    let en = text
        .replace("## Contexte", "## Context")
        .replace("## Décision", "## Decision")
        .replace("## Conséquences", "## Consequences");
    assert_eq!(decision_read(&en).unwrap(), d);
    assert!(decision_read("pas d’en-tête").is_err());
    assert!(decision_read("---\ntitle: \"x\"\n---\n").is_err());
}

#[test]
fn decisions_are_numbered_proposed_revised_and_accepted_by_a_human() {
    let (s, root) = space("docs-decisions");
    assert_eq!(s.next_number(), 1);
    let one = s
        .decision_propose(None, proposal("Trois échéances"))
        .unwrap();
    let two = s
        .decision_propose(None, proposal("Reçu par e-mail"))
        .unwrap();
    assert_eq!((one.number, two.number), (1, 2));
    assert_eq!(one.state, State::Proposed);
    assert!(root
        .join(".escouade/decisions/0001-trois-echeances.md")
        .is_file());
    // A proposal still open is revised, under its number, its date and its file.
    let mut again = proposal("Trois échéances au plus");
    again.accepted_by = "faux".into();
    let revised = s.decision_propose(Some(1), again).unwrap();
    assert_eq!((revised.number, revised.date), (1, one.date));
    assert_eq!(s.decisions().len(), 2);
    assert_eq!(s.decision(1).unwrap().title, "Trois échéances au plus");
    assert!(s.decision(1).unwrap().accepted_by.is_empty());
    assert!(s.decision(9).is_err());
    // A human accepts.
    let accepted = s.decision_accept(1, "Léa").unwrap();
    assert_eq!(accepted.state, State::Accepted);
    assert_eq!(accepted.accepted_by, "Léa");
    assert!(!accepted.accepted_at.is_empty());
    assert_eq!(s.decision(1).unwrap(), accepted);
    // Accepting again changes nothing.
    assert_eq!(s.decision_accept(1, "Autre").unwrap(), accepted);
}

#[test]
fn an_accepted_decision_cannot_be_rewritten_a_new_one_replaces_it() {
    let (s, _) = space("docs-immutable");
    s.decision_propose(None, proposal("Trois échéances"))
        .unwrap();
    let accepted = s.decision_accept(1, "Léa").unwrap();
    // Neither a revision, nor a new proposal under its number.
    let refused = s
        .decision_propose(Some(1), proposal("Quatre échéances"))
        .unwrap_err()
        .to_string();
    assert!(
        refused.contains("n° 1") || refused.contains("Decision 1"),
        "{refused}"
    );
    assert_eq!(s.decision(1).unwrap(), accepted);
    // The rule itself: any change of what was decided is a rewrite.
    let mut tampered = accepted.clone();
    tampered.decision = "Autre chose".into();
    assert!(rewrites(&accepted, &tampered));
    let mut moved = accepted.clone();
    moved.title = "Autre titre".into();
    assert!(rewrites(&accepted, &moved));
    let mut back = accepted.clone();
    back.state = State::Proposed;
    assert!(rewrites(&accepted, &back));
    // The one change it allows: being replaced.
    let mut replaced = accepted.clone();
    replaced.state = State::Superseded;
    replaced.superseded_by = Some(2);
    assert!(!rewrites(&accepted, &replaced));
    // A proposal is replaced by nothing: it is revised.
    s.decision_propose(None, proposal("Reçu par e-mail"))
        .unwrap();
    assert!(s
        .decision_replace(2, proposal("Reçu par courrier"))
        .is_err());
    // The replacement: proposed, the old one stands until a human accepts it.
    let new = s
        .decision_replace(1, proposal("Quatre échéances au plus"))
        .unwrap();
    assert_eq!(
        (new.number, new.state, new.supersedes.clone()),
        (3, State::Proposed, vec![1])
    );
    assert_eq!(s.decision(1).unwrap().state, State::Accepted);
    s.decision_accept(3, "Léa").unwrap();
    let old = s.decision(1).unwrap();
    assert_eq!((old.state, old.superseded_by), (State::Superseded, Some(3)));
    assert_eq!(old.decision, accepted.decision, "what it said is untouched");
    // Superseded: neither revised, replaced nor accepted again.
    assert!(s.decision_propose(Some(1), proposal("x")).is_err());
    assert!(s.decision_replace(1, proposal("x")).is_err());
    assert!(s.decision_accept(1, "Léa").is_err());
}

#[test]
fn the_documents_go_in_folders_their_text_stays_outside_the_repository() {
    let (s, root) = space("docs-documents");
    let a = s
        .document_add(
            "cahier des charges",
            "paiement.md",
            "# Paiement\nTrois fois.".as_bytes(),
        )
        .unwrap();
    assert_eq!(a.path, "cahier des charges/paiement.md");
    assert_eq!((a.kind.as_str(), a.readable), ("text", true));
    // A name taken is not overwritten.
    let b = s
        .document_add("cahier des charges", "paiement.md", b"autre")
        .unwrap();
    assert_eq!(b.path, "cahier des charges/paiement-2.md");
    assert_eq!(
        std::fs::read_to_string(root.join(".escouade/documents/cahier des charges/paiement.md"))
            .unwrap(),
        "# Paiement\nTrois fois."
    );
    let pdf = s.document_add("", "plan.pdf", b"%PDF-1.4").unwrap();
    assert_eq!(
        (pdf.kind.as_str(), pdf.readable, pdf.folder.as_str()),
        ("pdf", false, "")
    );
    let all = s.documents("").unwrap();
    assert_eq!(all.len(), 3);
    assert_eq!(s.documents("cahier des charges").unwrap().len(), 2);
    // The text: read, kept in the data folder, never in the repository.
    let t = s
        .document_text("cahier des charges/paiement.md", 0, 1000)
        .unwrap();
    assert_eq!(t.text.as_deref(), Some("# Paiement\nTrois fois."));
    let kept = std::fs::read_dir(s.text_dir.as_ref().unwrap())
        .unwrap()
        .count();
    assert_eq!(kept, 1);
    assert!(!root
        .join(".escouade")
        .join("documents")
        .join("paiement.txt")
        .exists());
    let walk = |dir: &Path| -> Vec<String> {
        fn go(d: &Path, out: &mut Vec<String>) {
            for e in std::fs::read_dir(d).unwrap().flatten() {
                if e.path().is_dir() {
                    go(&e.path(), out);
                } else {
                    out.push(e.file_name().to_string_lossy().to_string());
                }
            }
        }
        let mut out = Vec::new();
        go(dir, &mut out);
        out
    };
    assert!(walk(&root).iter().all(|n| !n.ends_with(".txt")));
    // A long text is read by parts.
    let long = "a".repeat(250);
    s.document_add("", "long.txt", long.as_bytes()).unwrap();
    let first = s.document_text("long.txt", 0, 100).unwrap();
    assert_eq!((first.total, first.truncated), (250, true));
    let rest = s.document_text("long.txt", 200, 100).unwrap();
    assert_eq!((rest.text.unwrap().len(), rest.truncated), (50, false));
    // A format whose text is not extracted says so.
    let none = s.document_text("plan.pdf", 0, 100).unwrap();
    assert_eq!((none.text, none.kind.as_str()), (None, "pdf"));
    assert!(s.document_text("../x.md", 0, 10).is_err());
    assert!(s.document_text("absent.md", 0, 10).is_err());
    assert!(s.document_add("../dehors", "x.md", b"x").is_err());
}

#[test]
fn a_link_in_the_docs_is_never_followed_and_nothing_leaves_the_project() {
    let (s, root) = space("docs-links");
    let outside = test_dir("docs-links-outside");
    std::fs::write(
        outside.join("secret.md"),
        "---\ntitle: \"Secret\"\n---\n\nnon",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".escouade")).unwrap();

    // `.escouade/spec` itself a link to a folder outside.
    if make_dir_link(&outside, &root.join(".escouade/spec")) {
        assert!(s.spec_tree().is_empty());
        assert!(s.spec_read("secret").is_err());
        assert!(s.spec_write("a/b", |p| p.body = "x".into()).is_err());
        assert!(s.spec_search("non", 5).is_empty());
        assert!(
            !outside.join("a").exists(),
            "nothing written through the link"
        );
        remove_dir_link(&root.join(".escouade/spec"));
    }
    // A subject folder that is a link.
    std::fs::create_dir_all(root.join(".escouade/spec")).unwrap();
    if make_dir_link(&outside, &root.join(".escouade/spec/paiement")) {
        assert!(s.spec_tree().is_empty());
        assert!(s.spec_read("paiement/secret").is_err());
        assert!(s
            .spec_write("paiement/nouveau", |p| p.body = "x".into())
            .is_err());
        assert!(!outside.join("nouveau.md").exists());
        remove_dir_link(&root.join(".escouade/spec/paiement"));
    }
    // A page that is a link to a file outside.
    std::fs::create_dir_all(root.join(".escouade/spec/a")).unwrap();
    if make_file_link(
        &outside.join("secret.md"),
        &root.join(".escouade/spec/a/lien.md"),
    ) {
        assert!(s.spec_tree().is_empty());
        assert!(s.spec_read("a/lien").is_err());
        assert!(s.spec_write("a/lien", |p| p.body = "x".into()).is_err());
        assert!(std::fs::read_to_string(outside.join("secret.md"))
            .unwrap()
            .contains("non"));
    }
    // The decisions' folder, the documents' folder.
    if make_dir_link(&outside, &root.join(".escouade/documents")) {
        assert!(s.documents("").is_err());
        assert!(s.document_add("", "x.md", b"x").is_err());
        assert!(s.document_text("secret.md", 0, 10).is_err());
        assert!(!outside.join("x.md").exists());
        remove_dir_link(&root.join(".escouade/documents"));
    }
    if make_dir_link(&outside, &root.join(".escouade/decisions")) {
        assert!(s.decisions().is_empty());
        assert!(s.decision_propose(None, proposal("x")).is_err());
        remove_dir_link(&root.join(".escouade/decisions"));
    }
    // `.escouade` itself a link.
    let real = root.join("real-escouade");
    std::fs::rename(root.join(".escouade"), &real).unwrap();
    if make_dir_link(&outside, &root.join(".escouade")) {
        assert!(s.spec_write("a/b", |p| p.body = "x".into()).is_err());
        assert!(s.spec_tree().is_empty());
        assert!(!outside.join("spec").exists());
    }
}

#[test]
fn a_spec_the_project_already_has_is_offered_as_a_candidate() {
    let (s, root) = space("docs-detect");
    assert!(s.detect().is_empty());
    std::fs::create_dir_all(root.join("docs/guide")).unwrap();
    std::fs::write(root.join("docs/SPEC.md"), "# Spec\n").unwrap();
    std::fs::write(root.join("docs/guide/a.md"), "# A\n").unwrap();
    std::fs::write(root.join("docs/image.png"), "x").unwrap();
    std::fs::write(root.join("SPEC.md"), "# Racine\n").unwrap();
    // The own folder of the docs is never a candidate.
    std::fs::create_dir_all(root.join(".escouade/spec/a")).unwrap();
    std::fs::write(root.join(".escouade/spec/a/b.md"), "x").unwrap();
    let found: Vec<(String, String, usize)> = s
        .detect()
        .into_iter()
        .map(|c| (c.path, c.kind, c.files))
        .collect();
    assert_eq!(
        found,
        vec![
            ("SPEC.md".to_string(), "file".to_string(), 1),
            ("docs/SPEC.md".to_string(), "file".to_string(), 1),
            ("docs".to_string(), "folder".to_string(), 2),
        ]
    );
    // A spec folder.
    let (s2, root2) = space("docs-detect-folder");
    std::fs::create_dir_all(root2.join("specs")).unwrap();
    std::fs::write(root2.join("specs/paiement.md"), "# P\n").unwrap();
    let found = s2.detect();
    assert_eq!(
        (found[0].path.as_str(), found[0].kind.as_str()),
        ("specs", "folder")
    );
    // A link is not a candidate.
    let (s3, root3) = space("docs-detect-link");
    let outside = test_dir("docs-detect-link-outside");
    std::fs::write(outside.join("a.md"), "x").unwrap();
    if make_dir_link(&outside, &root3.join("docs")) {
        assert!(s3.detect().is_empty());
    }
}

fn set_docs_branch(
    h: &crate::core_tests::Harness,
    id: &str,
    branch: &str,
) -> crate::model::Project {
    let mut p = h.core.project(id).unwrap();
    p.docs_branch = branch.into();
    h.core
        .update_project(p)
        .map(|_| h.core.project(id).unwrap())
        .unwrap()
}

#[tokio::test]
async fn with_the_current_branch_the_docs_are_where_the_caller_works() {
    let h = harness("docs-current");
    let (p, repo) = h.project(false).await;
    assert!(p.docs_branch.is_empty());
    // The window: the project's folder.
    let s = h.core.docs_space(&p.id, None).await.unwrap();
    assert!(same(&s.root, &repo), "{:?} {:?}", s.root, repo);
    // An agent in a folder of its own: its folder, so a ticket's spec follows its branch.
    let wt = h.dir.join("wt");
    std::fs::create_dir_all(&wt).unwrap();
    let meta = crate::model::AgentMeta {
        id: "a-alice".into(),
        project_id: p.id.clone(),
        name: "Alice".into(),
        cwd: wt.to_string_lossy().to_string(),
        ..Default::default()
    };
    let rt = crate::agent::AgentRt::new(meta.clone(), &h.core.data.conversations());
    h.core.agents.write().insert(
        meta.id.clone(),
        std::sync::Arc::new(parking_lot::Mutex::new(rt)),
    );
    let s = h.core.docs_space(&p.id, Some(&meta.id)).await.unwrap();
    assert!(same(&s.root, &wt), "{:?} {:?}", s.root, wt);
    s.spec_write("a/b", |p| p.body = "x".into()).unwrap();
    assert!(wt.join(".escouade/spec/a/b.md").is_file());
    assert!(!repo.join(".escouade").exists());
    // An agent of another project does not take the folder of this one's agent.
    let other = h.core.docs_space(&p.id, Some("inconnu")).await.unwrap();
    assert!(same(&other.root, &repo), "{:?} {:?}", other.root, repo);
}

#[tokio::test]
async fn a_fixed_branch_has_a_worktree_of_its_own_that_escouade_never_merges() {
    let h = harness("docs-fixed");
    let (p, repo) = h.project(false).await;
    let before = git(&repo, &["rev-parse", "HEAD"]);
    let branch_before = git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let p = set_docs_branch(&h, &p.id, "docs");
    assert_eq!(p.docs_branch, "docs");
    let s = h.core.docs_space(&p.id, None).await.unwrap();
    // A worktree of its own, in Escouade's data, not in the project.
    assert!(!same(&s.root, &repo), "{:?} {:?}", s.root, repo);
    assert!(
        s.root.starts_with(h.core.data.project_files(&p.id)),
        "{:?}",
        s.root
    );
    assert_eq!(git(&s.root, &["rev-parse", "--abbrev-ref", "HEAD"]), "docs");
    s.spec_write("paiement/echeances", |p| p.body = "Trois échéances.".into())
        .unwrap();
    s.decision_propose(None, proposal("Trois échéances"))
        .unwrap();
    s.document_add("", "cahier.md", b"# Cahier").unwrap();
    // Where the docs live: the worktree. Not in the project's checkout.
    assert!(s
        .root
        .join(".escouade/spec/paiement/echeances.md")
        .is_file());
    assert!(!repo.join(".escouade").exists());
    // The same worktree the next time.
    let again = h.core.docs_space(&p.id, None).await.unwrap();
    assert!(same(&again.root, &s.root), "{:?} {:?}", again.root, s.root);
    assert_eq!(
        again.spec_read("paiement/echeances").unwrap().body,
        "Trois échéances."
    );
    // Nothing merged, nothing committed: the project's branch is where it was, the docs branch
    // has no commit of its own, the files wait to be shared.
    assert_eq!(git(&repo, &["rev-parse", "HEAD"]), before);
    assert_eq!(
        git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"]),
        branch_before
    );
    assert_eq!(git(&repo, &["rev-parse", "docs"]), before);
    assert_eq!(
        git(&repo, &["log", "--oneline", "--all"]).lines().count(),
        1
    );
    let status = git(&s.root, &["status", "--porcelain"]);
    assert!(status.contains(".escouade/"), "{status}");
    assert!(
        git(&repo, &["status", "--porcelain"]).is_empty()
            || !git(&repo, &["status", "--porcelain"]).contains(".escouade")
    );
    // Back to the current branch: the docs are where the caller works again.
    let p = set_docs_branch(&h, &p.id, "");
    let back = h.core.docs_space(&p.id, None).await.unwrap();
    assert!(same(&back.root, &repo), "{:?} {:?}", back.root, repo);
}

#[tokio::test]
async fn a_fixed_branch_already_checked_out_is_used_where_it_is() {
    let h = harness("docs-fixed-here");
    let (p, repo) = h.project(false).await;
    let current = git(&repo, &["rev-parse", "--abbrev-ref", "HEAD"]);
    // The branch of the docs is the one checked out (`main` itself).
    let p = set_docs_branch(&h, &p.id, &current);
    let s = h.core.docs_space(&p.id, None).await.unwrap();
    assert!(same(&s.root, &repo), "{:?} {:?}", s.root, repo);
    // A branch that exists on the remote only is made from it.
    git(&repo, &["branch", "wiki"]);
    let p = set_docs_branch(&h, &p.id, "wiki");
    let s = h.core.docs_space(&p.id, None).await.unwrap();
    assert!(!same(&s.root, &repo), "{:?} {:?}", s.root, repo);
    assert_eq!(git(&s.root, &["rev-parse", "--abbrev-ref", "HEAD"]), "wiki");
    // Its folder gone: made again.
    let gone = s.root.clone();
    git(
        &repo,
        &["worktree", "remove", "--force", &gone.to_string_lossy()],
    );
    let s = h.core.docs_space(&p.id, None).await.unwrap();
    assert!(s.root.is_dir());
}

#[tokio::test]
async fn a_docs_branch_that_is_not_a_branch_name_is_refused() {
    let h = harness("docs-bad-branch");
    let (p, _) = h.project(false).await;
    for bad in ["-x", "a b", "a..b", "x.lock", "a:b", "/x", "x/", "@{u}"] {
        let mut q = h.core.project(&p.id).unwrap();
        q.docs_branch = bad.into();
        assert!(h.core.update_project(q).is_err(), "{bad}");
    }
    assert!(h.core.project(&p.id).unwrap().docs_branch.is_empty());
}

#[tokio::test]
async fn a_human_accepts_a_decision_by_the_core_with_their_name() {
    let h = harness("docs-accept");
    let (p, _) = h.project(false).await;
    {
        let mut projects = h.core.projects.write();
        projects
            .iter_mut()
            .find(|x| x.id == p.id)
            .unwrap()
            .user_name = "Léa".into();
    }
    let s = h.core.docs_space(&p.id, None).await.unwrap();
    s.decision_propose(None, proposal("Trois échéances"))
        .unwrap();
    let d = h.core.docs_accept_decision(&p.id, 1).await.unwrap();
    assert_eq!((d.state, d.accepted_by.as_str()), (State::Accepted, "Léa"));
    assert!(h.core.docs_accept_decision(&p.id, 9).await.is_err());
}

#[tokio::test]
async fn a_large_file_asks_for_a_confirmation_before_it_goes_in_the_repository() {
    let h = harness("docs-large");
    let (p, repo) = h.project(false).await;
    let src = h.dir.join("gros.bin");
    let f = std::fs::File::create(&src).unwrap();
    f.set_len(LARGE_FILE + 1).unwrap();
    drop(f);
    let refused = h
        .core
        .docs_add_file(&p.id, "videos", &src.to_string_lossy(), false)
        .await
        .unwrap_err()
        .to_string();
    assert!(
        refused.contains("50") || refused.contains("Mo") || refused.contains("MB"),
        "{refused}"
    );
    assert!(!repo.join(".escouade/documents/videos").exists());
    let ok = h
        .core
        .docs_add_file(&p.id, "videos", &src.to_string_lossy(), true)
        .await
        .unwrap();
    assert_eq!(ok.path, "videos/gros.bin");
    // A small one needs nothing, and a missing one is an error.
    let small = h.dir.join("petit.md");
    std::fs::write(&small, "# Petit").unwrap();
    assert!(h
        .core
        .docs_add_file(&p.id, "", &small.to_string_lossy(), false)
        .await
        .is_ok());
    assert!(h
        .core
        .docs_add_file(&p.id, "", "/nulle/part.md", false)
        .await
        .is_err());
}
