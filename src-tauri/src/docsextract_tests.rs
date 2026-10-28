//! What Escouade reads of a document (ESC-260): the text of a PDF, of a Word or OpenDocument file
//! (its headings made titles), a text file as it is, an image's format and size only, and nothing
//! of a broken file or of a format not read, without a crash.

use crate::docsextract::*;
use crate::paths::test_dir;
use std::io::Write;
use std::path::{Path, PathBuf};

/// A PDF of one page, its lines in Helvetica, its cross-reference table right.
pub(crate) fn pdf_bytes(lines: &[&str]) -> Vec<u8> {
    let mut content = String::from("BT /F1 14 Tf 72 760 Td 18 TL\n");
    for l in lines {
        let l = l
            .replace('\\', "\\\\")
            .replace('(', "\\(")
            .replace(')', "\\)");
        content.push_str(&format!("({l}) Tj T*\n"));
    }
    content.push_str("ET\n");
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>".to_string(),
        format!("<< /Length {} >>\nstream\n{content}endstream", content.len()),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>".to_string(),
    ];
    let mut out = b"%PDF-1.4\n".to_vec();
    let mut at = Vec::new();
    for (i, o) in objects.iter().enumerate() {
        at.push(out.len());
        out.extend(format!("{} 0 obj\n{o}\nendobj\n", i + 1).as_bytes());
    }
    let xref = out.len();
    out.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes());
    for a in at {
        out.extend(format!("{a:010} 00000 n \n").as_bytes());
    }
    out.extend(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    out
}

fn zip_of(files: &[(&str, &str)]) -> Vec<u8> {
    let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, body) in files {
        w.start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        w.write_all(body.as_bytes()).unwrap();
    }
    w.finish().unwrap().into_inner()
}

/// A Word file: each paragraph with its style (`Heading1`…) or none.
pub(crate) fn docx_bytes(paras: &[(Option<&str>, &str)]) -> Vec<u8> {
    let mut body = String::new();
    for (style, text) in paras {
        body.push_str("<w:p>");
        if let Some(s) = style {
            body.push_str(&format!("<w:pPr><w:pStyle w:val=\"{s}\"/></w:pPr>"));
        }
        // Two runs, as Word cuts a sentence.
        let (a, b) = text.split_at(text.find(' ').map_or(0, |i| i + 1));
        body.push_str(&format!(
            "<w:r><w:t xml:space=\"preserve\">{a}</w:t></w:r><w:r><w:t>{b}</w:t></w:r></w:p>"
        ));
    }
    let doc = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>{body}</w:body></w:document>"
    );
    zip_of(&[
        ("[Content_Types].xml", "<Types/>"),
        ("word/document.xml", &doc),
    ])
}

fn file(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
    let p = dir.join(name);
    std::fs::write(&p, bytes).unwrap();
    p
}

#[test]
fn the_text_of_a_pdf_is_read_on_the_machine() {
    let dir = test_dir("extract-pdf");
    let p = file(
        &dir,
        "cr.pdf",
        &pdf_bytes(&["Compte rendu du comite", "Le bureau valide les adhesions."]),
    );
    let got = extract(&p, "cr.pdf");
    let text = got.text().expect("a text");
    assert!(text.contains("Compte rendu du comite"), "{text:?}");
    assert!(text.contains("valide les adhesions"), "{text:?}");
    // A broken PDF is a PDF with no text, not a crash.
    let bad = file(&dir, "bad.pdf", b"%PDF-1.4\nnot a pdf at all");
    assert_eq!(extract(&bad, "bad.pdf"), Extracted::None);
}

#[test]
fn a_word_file_gives_its_paragraphs_its_headings_as_titles() {
    let dir = test_dir("extract-docx");
    let p = file(
        &dir,
        "cdc.docx",
        &docx_bytes(&[
            (Some("Heading1"), "Cahier des charges"),
            (None, "Le portail sert aux adhérents &amp; au bureau."),
            (Some("Titre2"), "Paiement"),
            (None, "Trois échéances au plus."),
        ]),
    );
    assert_eq!(
        extract(&p, "cdc.docx"),
        Extracted::Text(
            "# Cahier des charges\nLe portail sert aux adhérents & au bureau.\n## Paiement\nTrois échéances au plus."
                .into()
        )
    );
    // Not a zip, or a zip without the document: nothing.
    let bad = file(&dir, "bad.docx", b"PK not really");
    assert_eq!(extract(&bad, "bad.docx"), Extracted::None);
    let empty = file(&dir, "empty.docx", &zip_of(&[("x.xml", "<x/>")]));
    assert_eq!(extract(&empty, "empty.docx"), Extracted::None);
}

#[test]
fn an_opendocument_text_gives_its_paragraphs_and_headings() {
    let dir = test_dir("extract-odt");
    let xml = "<?xml version=\"1.0\"?><office:document-content xmlns:office=\"o\" xmlns:text=\"t\"><office:body><office:text><text:h text:outline-level=\"1\">Notes</text:h><text:p>Un<text:s/>mot <text:span>et</text:span> un autre.</text:p></office:text></office:body></office:document-content>";
    let p = file(&dir, "notes.odt", &zip_of(&[("content.xml", xml)]));
    assert_eq!(
        extract(&p, "notes.odt"),
        Extracted::Text("# Notes\nUn mot et un autre.".into())
    );
}

#[test]
fn a_text_is_read_as_it_is_an_image_keeps_its_metadata_only() {
    let dir = test_dir("extract-misc");
    let md = file(
        &dir,
        "notes.md",
        "# Notes\r\n\r\n\r\n\r\nUne ligne.\r\n".as_bytes(),
    );
    assert_eq!(
        extract(&md, "notes.md"),
        Extracted::Text("# Notes\n\nUne ligne.".into())
    );
    // A PNG of 1200 × 800: its header, and nothing of its pixels.
    let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
    png.extend(1200u32.to_be_bytes());
    png.extend(800u32.to_be_bytes());
    png.extend([8, 6, 0, 0, 0]);
    let img = file(&dir, "maquette.png", &png);
    assert_eq!(
        extract(&img, "maquette.png"),
        Extracted::Meta("PNG · 1200 × 800 px".into())
    );
    // A GIF, a JPEG with its frame after an APP0 segment.
    let gif = [b"GIF89a".as_slice(), &[0x40, 0x01, 0xf0, 0x00]].concat();
    assert_eq!(image_size(&gif, "gif"), Some((320, 240)));
    let jpeg = [
        &[0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00][..],
        &[0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03],
    ]
    .concat();
    assert_eq!(image_size(&jpeg, "jpg"), Some((800, 600)));
    let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32.5">"#;
    assert_eq!(image_size(svg, "svg"), Some((64, 33)));
    // A format not read: nothing, and it says so.
    let old = file(&dir, "vieux.doc", b"\xd0\xcf\x11\xe0");
    assert_eq!(extract(&old, "vieux.doc"), Extracted::None);
    assert!(!reads_text("vieux.doc") && !reads_text("logo.png"));
    assert!(
        reads_text("a.pdf") && reads_text("a.docx") && reads_text("a.ODT") && reads_text("a.md")
    );
    assert_eq!(
        extract(&dir.join("absent.md"), "absent.md"),
        Extracted::None
    );
}
