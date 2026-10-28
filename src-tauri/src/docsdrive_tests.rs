//! The drive of the documents (ESC-260): a file dropped filed by itself (by its name, its sort, the
//! meaning, the words, or in a folder made for it), the folders, a file moved, what the agents read
//! and cite, the search by the words and by the meaning, and the heavy files (LFS, or a question
//! past 50 MB).

use crate::core_tests::{git, harness};
use crate::docs::{Decision, Space, LARGE_FILE};
use crate::docsdrive::*;
use crate::docsextract_tests::{docx_bytes, pdf_bytes};
use crate::paths::test_dir;
use crate::vectors::embed::Fake;
use crate::vectors::index::Index;
use std::path::{Path, PathBuf};
use std::sync::Arc;

fn space(name: &str) -> (Space, PathBuf) {
    let root = test_dir(name);
    let text = test_dir(&format!("{name}-text"));
    (Space::new(&root, Some(text)), root)
}

fn put(root: &Path, rel: &str, body: &[u8]) {
    let p = root.join(".escouade/documents").join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, body).unwrap();
}

fn profile(folder: &str, text: &str) -> Profile {
    Profile {
        folder: folder.into(),
        text: text.into(),
    }
}

fn drive() -> Vec<Profile> {
    vec![
        profile(
            "Comptes rendus",
            "CR comite 08 10\nPresents : le bureau. Ordre du jour : les adhesions.",
        ),
        profile(
            "Juridique",
            "Contrat de prestation\nLes clauses de resiliation et de responsabilite.",
        ),
        profile(
            "Recettes",
            "Gateau au chocolat\nFarine, beurre, sucre, oeufs, cacao. Cuire au four.",
        ),
        profile("Comptes rendus/2026", ""),
    ]
}

#[test]
fn a_file_goes_to_the_folder_its_name_says_or_of_its_sort() {
    let d = drive();
    // Its name holds every word of the folder's: « Compte rendu » → « Comptes rendus ».
    let p = place(
        "Compte rendu atelier.docx",
        Some("Atelier du 22."),
        &d,
        &[],
        1.0,
    );
    assert_eq!(
        (p.folder.as_str(), p.by.as_str(), p.new),
        ("Comptes rendus", "name", false)
    );
    // A folder of digits alone (« 2026 ») is no name.
    let p = place("Budget 2026.md", Some("Des chiffres."), &d, &[], 1.0);
    assert_ne!(p.folder, "Comptes rendus/2026");
    // Its sort, by its name or its first lines: a NDA is a legal paper.
    let p = place(
        "NDA Dupont.pdf",
        Some("Accord de confidentialite"),
        &d,
        &[],
        1.0,
    );
    assert_eq!((p.folder.as_str(), p.by.as_str()), ("Juridique", "sort"));
    let p = place(
        "kickoff.md",
        Some("# Reunion de lancement\nOrdre du jour"),
        &d,
        &[],
        1.0,
    );
    assert_eq!(
        (p.folder.as_str(), p.by.as_str()),
        ("Comptes rendus", "sort")
    );
}

#[test]
fn a_file_goes_by_its_words_or_its_meaning_else_to_a_new_folder() {
    let d = drive();
    // Words it shares with a folder's files.
    let p = place(
        "tarte.md",
        Some("Tarte aux pommes : farine, beurre, sucre. Cuire au four 30 minutes."),
        &d,
        &[],
        1.0,
    );
    assert_eq!((p.folder.as_str(), p.by.as_str()), ("Recettes", "words"));
    // The meaning, past its bar, before the words.
    let near = vec![
        ("Juridique".to_string(), 0.9),
        ("Recettes".to_string(), 0.4),
    ];
    let p = place(
        "tarte.md",
        Some("Tarte aux pommes, farine, four."),
        &d,
        &near,
        0.82,
    );
    assert_eq!((p.folder.as_str(), p.by.as_str()), ("Juridique", "meaning"));
    // Under its bar, the meaning says nothing.
    let far = vec![("Juridique".to_string(), 0.5)];
    let p = place(
        "tarte.md",
        Some("Tarte aux pommes, farine, four."),
        &d,
        &far,
        0.82,
    );
    assert_eq!(p.folder, "Recettes");
    // Nothing fits: a folder made for it, of its sort when it has one.
    let p = place(
        "Roadmap 2027.md",
        Some("Les jalons de l'annee."),
        &d,
        &[],
        1.0,
    );
    assert!(
        p.new && p.by == "new" && ["Planning"].contains(&p.folder.as_str()),
        "{p:?}"
    );
    let p = place("logo.png", None, &d, &[], 1.0);
    assert_eq!((p.folder.as_str(), p.new), ("Images", true));
    let p = place("zzz.txt", Some("qwerty azerty"), &d, &[], 1.0);
    assert!(
        p.new && ["Divers", "Other"].contains(&p.folder.as_str()),
        "{p:?}"
    );
    // A folder of that name already there takes it.
    let mut with = d.clone();
    with.push(profile("Images", ""));
    let p = place("photo.jpg", None, &with, &[], 1.0);
    assert_eq!((p.folder.as_str(), p.new), ("Images", false));
    // An empty drive: a folder made for the first file.
    let p = place("CR du 12.md", Some("Reunion"), &[], &[], 1.0);
    assert!(p.new, "{p:?}");
}

#[test]
fn the_meaning_compares_a_file_with_the_files_of_each_folder() {
    let (s, root) = space("drive-meaning");
    put(
        &root,
        "Recettes/gateau.md",
        "Gateau chocolat farine beurre sucre four".as_bytes(),
    );
    put(
        &root,
        "Juridique/contrat.md",
        "Contrat clauses resiliation responsabilite".as_bytes(),
    );
    let docs = s.documents("").unwrap();
    let mut index = Index::in_memory(Arc::new(Fake)).unwrap();
    let near = meaning_of(
        &mut index,
        &s,
        &docs,
        "tarte.md",
        "Tarte farine beurre sucre four",
    )
    .unwrap();
    let get = |f: &str| near.iter().find(|(x, _)| x == f).map(|(_, s)| *s).unwrap();
    assert!(get("Recettes") > related("fake"), "{near:?}");
    assert!(get("Juridique") < related("fake"), "{near:?}");
    let folders = s.folders().unwrap();
    let p = place(
        "tarte.md",
        Some("Tarte farine beurre sucre four"),
        &profiles(&s, &folders, &docs),
        &near,
        related("fake"),
    );
    assert_eq!(p.folder, "Recettes");
}

#[test]
fn folders_are_made_listed_and_a_file_moves_from_one_to_another() {
    let (s, root) = space("drive-folders");
    put(&root, "Comptes rendus/2026/cr.md", b"# CR");
    put(&root, "Comptes rendus/vieux.md", b"# Vieux");
    put(&root, "notes.md", b"# Notes");
    assert_eq!(s.folder_add("Maquettes").unwrap(), "Maquettes");
    // Kept by git while it is empty, and not a document.
    assert!(root
        .join(".escouade/documents/Maquettes/.gitkeep")
        .is_file());
    let folders = s.folders().unwrap();
    let names: Vec<(&str, usize)> = folders.iter().map(|f| (f.path.as_str(), f.files)).collect();
    assert_eq!(
        names,
        vec![
            ("Comptes rendus", 2),
            ("Comptes rendus/2026", 1),
            ("Maquettes", 0)
        ]
    );
    assert_eq!(s.documents("").unwrap().len(), 3);
    assert!(s.folder_add("").is_err() && s.folder_add("../dehors").is_err());
    // Moved: its name kept, or a free one when taken.
    let m = s.document_move("notes.md", "Maquettes").unwrap();
    assert_eq!(m.path, "Maquettes/notes.md");
    assert!(!root.join(".escouade/documents/notes.md").exists());
    put(&root, "notes.md", b"# Autres");
    let m = s.document_move("notes.md", "Maquettes").unwrap();
    assert_eq!(m.path, "Maquettes/notes-2.md");
    // Back to the root; nowhere outside.
    assert_eq!(
        s.document_move("Maquettes/notes-2.md", "").unwrap().path,
        "notes-2.md"
    );
    assert!(s.document_move("notes-2.md", "../..").is_err());
    assert!(s.document_move("absent.md", "Maquettes").is_err());
}

#[test]
fn a_document_is_cited_by_the_pages_and_decisions_that_name_it() {
    let (s, root) = space("drive-cited");
    put(&root, "Comptes rendus/CR atelier.docx", b"x");
    put(&root, "cahier.md", b"x");
    let docs = s.documents("").unwrap();
    s.spec_write("adhesion/relance", |p| {
        p.title = "Relance".into();
        p.sources = vec![
            "documents/Comptes rendus/CR atelier.docx".into(),
            "https://exemple.fr".into(),
        ];
    })
    .unwrap();
    s.spec_write("adhesion/formulaire", |p| {
        p.title = "Formulaire".into();
        p.sources = vec![
            "Documents › Comptes rendus › CR atelier".into(),
            "cahier.md".into(),
        ];
    })
    .unwrap();
    s.decision_propose(
        None,
        Decision {
            title: "Relancer à 30 jours".into(),
            documents: vec![".escouade/documents/Comptes rendus/CR atelier.docx".into()],
            ..Default::default()
        },
    )
    .unwrap();
    let cited = citations(&s, &docs);
    assert_eq!(cited.get("Comptes rendus/CR atelier.docx"), Some(&3));
    assert_eq!(cited.get("cahier.md"), Some(&1));
    assert!(cited_doc("autre.md", &docs).is_none());
}

#[test]
fn the_reads_are_counted_outside_the_repository_and_follow_a_move() {
    let dir = test_dir("drive-reads");
    let f = dir.join("docs-reads.json");
    note_read(&f, "a.md");
    note_read(&f, "a.md");
    note_read(&f, "b.pdf");
    assert_eq!(reads(&f).get("a.md"), Some(&2));
    move_reads(&f, "a.md", "X/a.md");
    let r = reads(&f);
    assert_eq!((r.get("a.md"), r.get("X/a.md")), (None, Some(&2)));
}

#[test]
fn the_search_finds_documents_by_their_words_and_by_their_meaning() {
    let (s, root) = space("drive-search");
    put(
        &root,
        "Comptes rendus/cr.pdf",
        &pdf_bytes(&["Le bureau valide les adhesions sous 7 jours."]),
    );
    put(
        &root,
        "cdc.docx",
        &docx_bytes(&[
            (Some("Heading1"), "Paiement"),
            (None, "Trois echeances au plus."),
        ]),
    );
    put(&root, "logo-adherents.png", b"\x89PNG\r\n\x1a\n");
    let docs = s.documents("").unwrap();
    let hits = search_words(&s, &docs, "adhesions", 10);
    assert_eq!(hits[0].path, "Comptes rendus/cr.pdf");
    assert!(hits[0].excerpt.contains("valide les adhesions"), "{hits:?}");
    // By its name: an image is found too.
    let hits = search_words(&s, &docs, "logo", 10);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].path, "logo-adherents.png");
    assert!(search_words(&s, &docs, "", 10).is_empty());
    let mut index = Index::in_memory(Arc::new(Fake)).unwrap();
    let hits = search_meaning(&mut index, &s, &docs, "echeances paiement", 5).unwrap();
    assert_eq!(hits[0].path, "cdc.docx");
    // A file gone leaves the index.
    std::fs::remove_file(root.join(".escouade/documents/cdc.docx")).unwrap();
    let docs = s.documents("").unwrap();
    let hits = search_meaning(&mut index, &s, &docs, "echeances paiement", 5).unwrap();
    assert!(hits.iter().all(|h| h.path != "cdc.docx"), "{hits:?}");
}

#[tokio::test]
async fn a_file_dropped_is_read_indexed_and_filed_by_itself() {
    let h = harness("drive-drop");
    let (p, repo) = h.project(false).await;
    *h.core.test_embedder.lock() = Some(Arc::new(Fake));
    let docs = repo.join(".escouade/documents");
    std::fs::create_dir_all(docs.join("Comptes rendus")).unwrap();
    std::fs::write(
        docs.join("Comptes rendus/CR comite.md"),
        "Presents : le bureau. Ordre du jour : les adhesions.",
    )
    .unwrap();
    // A PDF whose name says nothing: its sort is in its text.
    let src = h.dir.join("scan-0042.pdf");
    std::fs::write(
        &src,
        pdf_bytes(&[
            "Compte rendu de la reunion du bureau",
            "Presents : Claire, Guillaume.",
        ]),
    )
    .unwrap();
    let d = h.core.docs_drop(&p.id, None, &src, false).await.unwrap();
    assert_eq!(d.file.path, "Comptes rendus/scan-0042.pdf");
    assert!(
        !d.placement.new && d.placement.by != "chosen",
        "{:?}",
        d.placement
    );
    // Its text was read once, kept outside the repository.
    let t = h
        .core
        .docs_space(&p.id, None)
        .await
        .unwrap()
        .document_text(&d.file.path, 0, 1000)
        .unwrap();
    assert!(t.text.unwrap().contains("reunion du bureau"));
    // A planning: no folder for it, one is made, kept by git.
    let plan = h.dir.join("roadmap.md");
    std::fs::write(&plan, "# Roadmap\nLes jalons du projet.").unwrap();
    let d = h.core.docs_drop(&p.id, None, &plan, false).await.unwrap();
    assert!(d.placement.new, "{:?}", d.placement);
    assert!(docs.join(&d.placement.folder).join(".gitkeep").is_file());
    // Dropped in a folder: it stays there.
    let d = h
        .core
        .docs_drop(&p.id, Some("Juridique"), &plan, false)
        .await
        .unwrap();
    assert_eq!(
        (d.file.path.as_str(), d.placement.by.as_str()),
        ("Juridique/roadmap.md", "chosen")
    );
    // The search finds it, by the meaning (the tests' model), from the drive.
    let space = h.core.docs_space(&p.id, None).await.unwrap();
    let (hits, by) = h
        .core
        .docs_search_in(&p.id, space, "reunion bureau", 5)
        .await
        .unwrap();
    assert_eq!(by, "meaning");
    assert_eq!(hits[0].path, "Comptes rendus/scan-0042.pdf");
    // The drive says who added each file: the user here, nothing being committed.
    let drive = h.core.docs_drive(&p.id).await.unwrap();
    assert_eq!(drive.files.len(), 4);
    assert!(drive.files.iter().all(|f| !f.author.is_empty()));
    // Nothing was committed.
    assert!(git(&repo, &["status", "--porcelain"]).contains(".escouade/"));
}

#[tokio::test]
async fn a_heavy_file_follows_the_lfs_rules_of_the_repository_or_is_asked_about() {
    let h = harness("drive-lfs");
    let (p, repo) = h.project(false).await;
    let big = h.dir.join("film.mp4");
    let f = std::fs::File::create(&big).unwrap();
    f.set_len(LARGE_FILE + 1).unwrap();
    drop(f);
    let check = h
        .core
        .docs_check(
            &p.id,
            "",
            vec![("film.mp4".into(), LARGE_FILE + 1), ("cr.md".into(), 10)],
        )
        .await
        .unwrap();
    assert_eq!((check[0].large, check[0].lfs), (true, false));
    assert_eq!((check[1].large, check[1].lfs), (false, false));
    assert!(h
        .core
        .docs_drop(&p.id, Some("Vidéos"), &big, false)
        .await
        .is_err());
    // The repository's LFS rule takes it: no question, git does the rest.
    std::fs::write(
        repo.join(".gitattributes"),
        "*.mp4 filter=lfs diff=lfs merge=lfs -text\n",
    )
    .unwrap();
    let check = h
        .core
        .docs_check(&p.id, "Vidéos", vec![("film.mp4".into(), LARGE_FILE + 1)])
        .await
        .unwrap();
    assert_eq!((check[0].large, check[0].lfs), (false, true));
    let d = h
        .core
        .docs_drop(&p.id, Some("Vidéos"), &big, false)
        .await
        .unwrap();
    assert!(d.lfs);
    assert_eq!(d.file.path, "Vidéos/film.mp4");
}
