//! What Escouade reads of a document of the drive (ESC-260), on this machine, nothing sent anywhere:
//!
//! - **text** (Markdown, plain text and the like): the file as it is;
//! - **PDF**: its text, by pdf-extract (a PDF of scans has none: it reads as no text);
//! - **Word** (`.docx`) and **OpenDocument** (`.odt`): the text of their XML, a heading kept as a
//!   Markdown title so that its pieces know what they are about;
//! - **images**: their metadata only (format and size), never their content.
//!
//! The old binary formats (`.doc`, `.rtf`) are not read: they keep their name only.

use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;

/// Past this, a file of text is not read (a log of 1 GB is no document).
const MAX_TEXT_FILE: u64 = 20 * 1024 * 1024;
/// Past this, a PDF or a Word file is not read.
const MAX_BINARY: u64 = 200 * 1024 * 1024;
/// The most characters kept of a text: about a book of 2 000 pages.
const MAX_CHARS: usize = 5_000_000;
/// The most bytes read out of the XML of a Word file (a zip bomb stops there).
const MAX_XML: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Extracted {
    /// The document's text.
    Text(String),
    /// What is known of a file whose content is not read (an image): one line.
    Meta(String),
    /// Nothing: a format not read, a file too big, or one that would not open.
    None,
}

impl Extracted {
    pub fn text(&self) -> Option<&str> {
        match self {
            Self::Text(t) => Some(t),
            _ => None,
        }
    }
}

fn ext(name: &str) -> String {
    name.rsplit_once('.')
        .map(|(_, e)| e.to_lowercase())
        .unwrap_or_default()
}

/// Whether Escouade reads the text of a file of this name.
pub fn reads_text(name: &str) -> bool {
    matches!(crate::docs::kind_of(name), "text" | "pdf")
        || matches!(ext(name).as_str(), "docx" | "odt")
}

/// What Escouade reads of the file `path`, named `name` (its extension says its format).
pub fn extract(path: &Path, name: &str) -> Extracted {
    let Ok(meta) = std::fs::metadata(path) else {
        return Extracted::None;
    };
    let kind = crate::docs::kind_of(name);
    let e = ext(name);
    let limit = if kind == "text" {
        MAX_TEXT_FILE
    } else {
        MAX_BINARY
    };
    if !meta.is_file() || meta.len() > limit {
        return Extracted::None;
    }
    let read = || std::fs::read(path).ok();
    let text = match (kind, e.as_str()) {
        ("text", _) => read().map(|b| String::from_utf8_lossy(&b).into_owned()),
        ("pdf", _) => read().and_then(|b| pdf(&b)),
        (_, "docx") => read().and_then(|b| office(&b, Office::Docx)),
        (_, "odt") => read().and_then(|b| office(&b, Office::Odt)),
        ("image", _) => {
            return read()
                .and_then(|b| image_meta(&b, &e))
                .map_or(Extracted::None, Extracted::Meta)
        }
        _ => None,
    };
    match text {
        Some(t) => Extracted::Text(clean(&t)),
        None => Extracted::None,
    }
}

/// The text kept: its lines' ends made `\n`, the runs of blank lines made one, cut at `MAX_CHARS`.
fn clean(t: &str) -> String {
    let t = t.replace("\r\n", "\n").replace('\r', "\n");
    let mut out = String::with_capacity(t.len().min(MAX_CHARS * 2));
    let mut blanks = 0;
    for line in t.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            blanks += 1;
            if blanks > 1 {
                continue;
            }
        } else {
            blanks = 0;
        }
        out.push_str(line);
        out.push('\n');
    }
    let out = out.trim().to_string();
    if out.chars().count() > MAX_CHARS {
        out.chars().take(MAX_CHARS).collect()
    } else {
        out
    }
}

/// A PDF's text. pdf-extract panics on some broken files: that is a file with no text, not a crash.
fn pdf(bytes: &[u8]) -> Option<String> {
    let bytes = bytes.to_vec();
    let got = std::panic::catch_unwind(move || pdf_extract::extract_text_from_mem(&bytes));
    match got {
        Ok(Ok(t)) if !t.trim().is_empty() => Some(t),
        Ok(Err(e)) => {
            log::info!("docs: a PDF's text not read: {e}");
            None
        }
        _ => None,
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Office {
    Docx,
    Odt,
}

/// The text of a Word or OpenDocument file: its paragraphs, a heading as a Markdown title.
fn office(bytes: &[u8], format: Office) -> Option<String> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).ok()?;
    let entry = match format {
        Office::Docx => "word/document.xml",
        Office::Odt => "content.xml",
    };
    let mut xml = String::new();
    zip.by_name(entry)
        .ok()?
        .take(MAX_XML)
        .read_to_string(&mut xml)
        .ok()?;
    Some(match format {
        Office::Docx => docx_text(&xml),
        Office::Odt => odt_text(&xml),
    })
}

fn local(name: &str) -> &str {
    name.rsplit(':').next().unwrap_or(name)
}

fn entity(r: &quick_xml::events::BytesRef) -> Option<char> {
    if let Ok(Some(c)) = r.resolve_char_ref() {
        return Some(c);
    }
    match r.as_ref() {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ => None,
    }
}

/// The level of a heading's style (`Heading2`, `Titre2`, `heading 2`): 1 to 6, else None.
fn heading_level(style: &str) -> Option<usize> {
    let s = style.to_lowercase().replace(' ', "");
    let n = s
        .strip_prefix("heading")
        .or_else(|| s.strip_prefix("titre"))?;
    let n: usize = n.parse().ok()?;
    (1..=6).contains(&n).then_some(n)
}

/// `word/document.xml`: the text of the `w:t` of each `w:p`, its tabs and breaks, a paragraph of a
/// heading style made a title. Deleted text (`w:delText`) and fields (`w:instrText`) are left out.
fn docx_text(xml: &str) -> String {
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut out = String::new();
    let mut para = String::new();
    let mut level: Option<usize> = None;
    let mut in_t = false;
    let end_para = |out: &mut String, para: &mut String, level: &mut Option<usize>| {
        let p = para.trim();
        if !p.is_empty() {
            if let Some(n) = level.take() {
                out.push_str(&"#".repeat(n));
                out.push(' ');
            }
            out.push_str(p);
        }
        out.push('\n');
        para.clear();
        *level = None;
    };
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match local(e.name().as_ref()) {
                "t" => in_t = true,
                "tab" => para.push('\t'),
                _ => {}
            },
            Ok(Event::Empty(e)) => match local(e.name().as_ref()) {
                "tab" => para.push('\t'),
                "br" | "cr" => para.push(' '),
                "pStyle" => {
                    level = e
                        .attributes()
                        .flatten()
                        .find(|a| local(a.key.as_ref()) == "val")
                        .and_then(|a| heading_level(&a.value));
                }
                _ => {}
            },
            Ok(Event::Text(t)) if in_t => para.push_str(&t.xml10_content()),
            Ok(Event::GeneralRef(r)) if in_t => {
                if let Some(c) = entity(&r) {
                    para.push(c);
                }
            }
            Ok(Event::End(e)) => match local(e.name().as_ref()) {
                "t" => in_t = false,
                "p" => end_para(&mut out, &mut para, &mut level),
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    if !para.is_empty() {
        end_para(&mut out, &mut para, &mut level);
    }
    out
}

/// `content.xml` of an OpenDocument text: each `text:p` and `text:h` (its `outline-level` made a
/// title), their spaces (`text:s`), tabs and line breaks.
fn odt_text(xml: &str) -> String {
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut out = String::new();
    let mut para = String::new();
    let mut depth = 0usize;
    let mut level: Option<usize> = None;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match local(e.name().as_ref()) {
                "p" => depth += 1,
                "h" => {
                    depth += 1;
                    level = e
                        .attributes()
                        .flatten()
                        .find(|a| local(a.key.as_ref()) == "outline-level")
                        .and_then(|a| a.value.trim().parse().ok())
                        .map(|n: usize| n.clamp(1, 6))
                        .or(Some(1));
                }
                _ => {}
            },
            Ok(Event::Empty(e)) if depth > 0 => match local(e.name().as_ref()) {
                "s" => para.push(' '),
                "tab" => para.push('\t'),
                "line-break" => para.push(' '),
                _ => {}
            },
            Ok(Event::Text(t)) if depth > 0 => para.push_str(&t.xml10_content()),
            Ok(Event::GeneralRef(r)) if depth > 0 => {
                if let Some(c) = entity(&r) {
                    para.push(c);
                }
            }
            Ok(Event::End(e)) => {
                if matches!(local(e.name().as_ref()), "p" | "h") && depth > 0 {
                    depth -= 1;
                    if depth == 0 {
                        let p = para.trim();
                        if !p.is_empty() {
                            if let Some(n) = level.take() {
                                out.push_str(&"#".repeat(n));
                                out.push(' ');
                            }
                            out.push_str(p);
                        }
                        out.push('\n');
                        para.clear();
                        level = None;
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    out
}

fn be16(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from(u16::from_be_bytes(
        b.get(at..at + 2)?.try_into().ok()?,
    )))
}

fn le16(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from(u16::from_le_bytes(
        b.get(at..at + 2)?.try_into().ok()?,
    )))
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn le32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn le24(b: &[u8], at: usize) -> Option<u32> {
    let s = b.get(at..at + 3)?;
    Some(u32::from(s[0]) | u32::from(s[1]) << 8 | u32::from(s[2]) << 16)
}

/// An image's width and height in pixels, read from its header.
pub fn image_size(b: &[u8], ext: &str) -> Option<(u32, u32)> {
    if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some((be32(b, 16)?, be32(b, 20)?));
    }
    if b.starts_with(b"GIF8") {
        return Some((le16(b, 6)?, le16(b, 8)?));
    }
    if b.starts_with(b"BM") {
        let h = le32(b, 22)? as i32;
        return Some((le32(b, 18)?, h.unsigned_abs()));
    }
    if b.starts_with(b"RIFF") && b.get(8..12) == Some(b"WEBP") {
        return match b.get(12..16)? {
            b"VP8 " => Some((le16(b, 26)? & 0x3fff, le16(b, 28)? & 0x3fff)),
            b"VP8L" => {
                let v = le32(b, 21)?;
                Some(((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1))
            }
            b"VP8X" => Some((le24(b, 24)? + 1, le24(b, 27)? + 1)),
            _ => None,
        };
    }
    if b.starts_with(&[0xff, 0xd8]) {
        let mut at = 2;
        while at + 9 < b.len() {
            if b[at] != 0xff {
                at += 1;
                continue;
            }
            let marker = b[at + 1];
            // SOF0 to SOF15, but DHT, JPG and DAC.
            if (0xc0..=0xcf).contains(&marker) && ![0xc4, 0xc8, 0xcc].contains(&marker) {
                return Some((be16(b, at + 7)?, be16(b, at + 5)?));
            }
            if marker == 0xd8 || marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
                at += 2;
                continue;
            }
            at += 2 + be16(b, at + 2)? as usize;
        }
        return None;
    }
    if ext == "svg" {
        let head = String::from_utf8_lossy(&b[..b.len().min(4096)]).to_string();
        let attr = |name: &str| -> Option<u32> {
            let i = head.find(&format!(" {name}=\""))? + name.len() + 3;
            let v: String = head[i..]
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            v.parse::<f32>().ok().map(|f| f.round() as u32)
        };
        return Some((attr("width")?, attr("height")?));
    }
    None
}

/// What is said of an image: its format and its size (`PNG · 1200 × 800 px`).
fn image_meta(b: &[u8], ext: &str) -> Option<String> {
    let format = match ext {
        "jpg" | "jpeg" => "JPEG".to_string(),
        e => e.to_uppercase(),
    };
    Some(match image_size(b, ext) {
        Some((w, h)) => format!("{format} · {w} × {h} px"),
        None => format,
    })
}
