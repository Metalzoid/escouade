//! The images pasted or dropped in a ticket's form: files of the ticket's folder, never in the
//! JSON of the tickets, with the formats and limits of the chat's attachments; its agent gets them
//! with its first message.

use crate::core::{size_label, Attachment, MAX_IMAGE, MAX_TOTAL};
use crate::i18n;
use crate::model::{new_id, TicketImage};
use crate::tickets::DraftImage;
use anyhow::{bail, Result};
use base64::Engine;
use serde::Serialize;
use std::path::Path;

/// The most images a ticket takes: its first message holds them all, and the API refuses a request
/// past about 100 blocks; « Reprendre » sends that message again, so the ticket would stay blocked.
const MAX_IMAGES: usize = 20;

/// Whether `file` is a simple file name, an extension included (`3f2a9c01b7de.png`): ASCII letters,
/// digits, `-` and `_`, and one dot with something on both sides. The file of a ticket's image
/// comes from the saved state, which may be edited by hand: any other name (a way up, a path,
/// another drive) is never read nor removed, whatever it points to.
fn plain_name(file: &str) -> bool {
    let word = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    // Windows opens these as devices, whatever their extension (`con.png` is the console).
    let device = |stem: &str| {
        let s = stem.to_ascii_lowercase();
        ["con", "prn", "aux", "nul"].contains(&s.as_str())
            || (s.len() == 4
                && (s.starts_with("com") || s.starts_with("lpt"))
                && matches!(s.as_bytes()[3], b'1'..=b'9'))
    };
    // A second dot is not a letter of the extension: `a.b.png` fails.
    file.split_once('.')
        .is_some_and(|(stem, ext)| word(stem) && word(ext) && !device(stem))
}

/// An image of a ticket, its content in base64: for its form to show.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    pub file: String,
    pub name: String,
    pub media_type: String,
    pub data: String,
}

/// An image of a form, checked.
pub(crate) enum Checked {
    /// One the ticket has.
    Kept(TicketImage),
    /// One pasted or dropped, decoded.
    New {
        name: String,
        media_type: &'static str,
        bytes: Vec<u8>,
    },
}

/// The list of a ticket's form, checked against what the ticket has (`had`, its files in `dir`).
/// An image kept is one of the ticket's own, its file still there and of a plain name: any other
/// is left out, never a file out of its folder. One pasted is an image of a format the API reads
/// (its type is its content's), 5 MB at most; there are 20 at most, and all together they weigh
/// 18 MB at most.
pub(crate) fn check(
    dir: &Path,
    had: &[TicketImage],
    images: &[DraftImage],
) -> Result<Vec<Checked>> {
    check_in(i18n::ui(), dir, had, images)
}

fn check_in(
    lang: i18n::Lang,
    dir: &Path,
    had: &[TicketImage],
    images: &[DraftImage],
) -> Result<Vec<Checked>> {
    let mut out = Vec::new();
    let mut total = 0;
    for (n, image) in images.iter().enumerate() {
        // Counted as the total is, before anything of this one is read.
        if n >= MAX_IMAGES {
            bail!(tr_in!(
                lang,
                "Un ticket prend {max} images au plus.",
                "A ticket takes {max} images at most.",
                max = MAX_IMAGES
            ));
        }
        if !image.file.is_empty() {
            let own = had
                .iter()
                .find(|h| h.file == image.file && plain_name(&h.file));
            let size = own.and_then(|o| std::fs::metadata(dir.join(&o.file)).ok());
            if let (Some(own), Some(size)) = (own, size) {
                total += size.len() as usize;
                out.push(Checked::Kept(own.clone()));
            }
            continue;
        }
        // Refused on its length before it is decoded: a huge text costs memory and time for nothing.
        if image.data.len() > 4 * MAX_IMAGE.div_ceil(3) {
            bail!(too_big(lang, &image.name));
        }
        let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&image.data) else {
            bail!(tr_in!(
                lang,
                "{name} n’a pas pu être lu",
                "{name} couldn’t be read",
                name = image.name
            ));
        };
        let Some(media_type) = sniff(&bytes) else {
            bail!(tr_in!(
                lang,
                "« {name} » n’est pas une image : un ticket prend les images PNG, JPEG, GIF et WebP.",
                "“{name}” isn’t an image: a ticket takes PNG, JPEG, GIF and WebP images.",
                name = image.name
            ));
        };
        if bytes.len() > MAX_IMAGE {
            bail!(too_big(lang, &image.name));
        }
        total += bytes.len();
        out.push(Checked::New {
            name: image.name.clone(),
            media_type,
            bytes,
        });
    }
    if total > MAX_TOTAL {
        bail!(tr_in!(
            lang,
            "Les images d’un ticket sont limitées à {max} en tout.",
            "A ticket’s images are limited to {max} in total.",
            max = size_label(lang, MAX_TOTAL)
        ));
    }
    Ok(out)
}

fn too_big(lang: i18n::Lang, name: &str) -> String {
    tr_in!(
        lang,
        "{name} dépasse {max}",
        "{name} is over {max}",
        max = size_label(lang, MAX_IMAGE)
    )
}

/// Writes the new images of `checked` in `dir`, each under a name of its own; gives the ticket's
/// list, in the form's order. What it wrote goes again when one fails.
pub(crate) fn write(dir: &Path, checked: Vec<Checked>) -> Result<Vec<TicketImage>> {
    write_with(dir, checked, |path, bytes| std::fs::write(path, bytes))
}

/// `write`, the file put by `put` (a test makes it fail midway).
fn write_with(
    dir: &Path,
    checked: Vec<Checked>,
    put: impl Fn(&Path, &[u8]) -> std::io::Result<()>,
) -> Result<Vec<TicketImage>> {
    let mut written = Vec::new();
    let out = checked
        .into_iter()
        .map(|c| match c {
            Checked::Kept(image) => Ok(image),
            Checked::New {
                name,
                media_type,
                bytes,
            } => {
                let file = format!("{}.{}", new_id(), extension(media_type));
                // Noted before it is written: one that fails midway leaves half a file, which
                // `let_go` must take (it tolerates a file that was never there).
                written.push(file.clone());
                std::fs::create_dir_all(dir)
                    .and_then(|()| put(&dir.join(&file), &bytes))
                    .map_err(|e| {
                        anyhow::anyhow!(tr!(
                            "{name} n’a pas pu être enregistré : {e}",
                            "{name} couldn’t be saved: {e}"
                        ))
                    })?;
                Ok(TicketImage {
                    name,
                    media_type: media_type.to_string(),
                    file,
                })
            }
        })
        .collect::<Result<Vec<_>>>();
    if out.is_err() {
        let_go(dir, &written);
    }
    out
}

/// The type of the image `bytes` are, as their first bytes say: not as its name or the system say,
/// for the API refuses an image of another type than it is told, and with it every later turn of
/// the session that holds it.
fn sniff(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// Removes these files of `dir`, and the folder once it has none left. Only them: another save of
/// the ticket may have written its own meanwhile. A name that is not a plain one is left alone.
pub(crate) fn let_go(dir: &Path, files: &[String]) {
    for file in files {
        if !plain_name(file) {
            log::warn!("{file}: not a plain file name, not removed");
            continue;
        }
        match std::fs::remove_file(dir.join(file)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                log::warn!("{}: not removed: {e}", dir.join(file).display());
            }
            _ => {}
        }
    }
    // Refused while it has files.
    let _ = std::fs::remove_dir(dir);
}

fn extension(media_type: &str) -> &'static str {
    match media_type {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    }
}

/// The ticket's folder goes, with its images.
pub(crate) fn remove(dir: &Path) {
    match std::fs::remove_dir_all(dir) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            log::warn!("{}: not removed: {e}", dir.display());
        }
        _ => {}
    }
}

/// The images with their content in base64, those whose file is gone or whose name is not a plain
/// one left out.
pub(crate) fn read(dir: &Path, images: &[TicketImage]) -> Vec<ImageData> {
    images
        .iter()
        .filter(|i| {
            let plain = plain_name(&i.file);
            if !plain {
                log::warn!("{}: image not read: not a plain file name", i.file);
            }
            plain
        })
        .filter_map(|i| match std::fs::read(dir.join(&i.file)) {
            Ok(bytes) => Some(ImageData {
                file: i.file.clone(),
                name: i.name.clone(),
                media_type: i.media_type.clone(),
                data: base64::engine::general_purpose::STANDARD.encode(bytes),
            }),
            Err(e) => {
                log::warn!("{}: image not read: {e}", dir.join(&i.file).display());
                None
            }
        })
        .collect()
}

/// The images as the attachments of a message: its agent's first; and the names of those whose
/// file is missing, unreadable or not of a plain name, in order, which the message says.
pub(crate) fn attachments(dir: &Path, images: &[TicketImage]) -> (Vec<Attachment>, Vec<String>) {
    let readable = read(dir, images);
    // `read` leaves out the images it couldn't read: those it didn't give back are the missing.
    let missing = images
        .iter()
        .filter(|i| !readable.iter().any(|r| r.file == i.file))
        .map(|i| i.name.clone())
        .collect();
    let attached = readable
        .into_iter()
        .map(|i| Attachment {
            name: i.name,
            media_type: i.media_type,
            data: i.data,
        })
        .collect();
    (attached, missing)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::MB;
    use crate::i18n::Lang::{En, Fr};
    use crate::paths::test_dir;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n-capture";

    fn png_of(size: usize) -> Vec<u8> {
        let mut bytes = PNG.to_vec();
        bytes.resize(size, 0);
        bytes
    }

    fn pasted(name: &str, media_type: &str, bytes: &[u8]) -> DraftImage {
        DraftImage {
            name: name.into(),
            media_type: media_type.into(),
            data: base64::engine::general_purpose::STANDARD.encode(bytes),
            ..Default::default()
        }
    }

    #[test]
    fn the_refusals_read_in_english() {
        let dir = test_dir("ticket-images-en");
        let refused = |images: &[DraftImage]| match check_in(En, &dir, &[], images) {
            Err(e) => e.to_string(),
            Ok(_) => panic!("accepted"),
        };
        assert_eq!(
            refused(&[pasted("plan.bmp", "image/bmp", b"BM")]),
            "“plan.bmp” isn’t an image: a ticket takes PNG, JPEG, GIF and WebP images."
        );
        assert_eq!(
            refused(&[pasted("photo.png", "image/png", &png_of(5 * MB + 1))]),
            "photo.png is over 5 MB"
        );
        let four: Vec<_> = (0..4)
            .map(|i| pasted(&format!("{i}.png"), "image/png", &png_of(5 * MB)))
            .collect();
        assert_eq!(
            refused(&four),
            "A ticket’s images are limited to 18 MB in total."
        );
        let bad = DraftImage {
            data: "pas du base64 !".into(),
            ..pasted("abime.png", "image/png", b"")
        };
        assert_eq!(refused(&[bad]), "abime.png couldn’t be read");
        assert_eq!(refused(&[too_long_to_decode()]), "photo.png is over 5 MB");
        assert_eq!(
            refused(&small(MAX_IMAGES + 1)),
            "A ticket takes 20 images at most."
        );
    }

    /// `n` small images pasted.
    fn small(n: usize) -> Vec<DraftImage> {
        (0..n)
            .map(|i| pasted(&format!("{i}.png"), "image/png", PNG))
            .collect()
    }

    /// The form's message when `check_in` refuses, in French.
    fn refusal_of(dir: &Path, had: &[TicketImage], images: &[DraftImage]) -> String {
        match check_in(Fr, dir, had, images) {
            Err(e) => e.to_string(),
            Ok(_) => panic!("accepted"),
        }
    }

    #[test]
    fn a_ticket_takes_twenty_images_at_most() {
        let dir = test_dir("ticket-images-count");
        assert_eq!(MAX_IMAGES, 20);
        assert_eq!(check_in(Fr, &dir, &[], &small(20)).ok().unwrap().len(), 20);
        assert_eq!(
            refusal_of(&dir, &[], &small(21)),
            "Un ticket prend 20 images au plus."
        );
        // The ones the ticket has count too: 15 kept and 5 new make 20, 6 new make 21.
        let t = dir.join("t1");
        std::fs::create_dir_all(&t).unwrap();
        let had: Vec<TicketImage> = (0..15)
            .map(|i| TicketImage {
                name: format!("{i}.png"),
                media_type: "image/png".into(),
                file: format!("k{i}.png"),
            })
            .collect();
        for i in &had {
            std::fs::write(t.join(&i.file), PNG).unwrap();
        }
        let form = |new: usize| -> Vec<DraftImage> {
            had.iter()
                .map(|i| DraftImage {
                    file: i.file.clone(),
                    ..Default::default()
                })
                .chain(small(new))
                .collect()
        };
        assert_eq!(check_in(Fr, &t, &had, &form(5)).ok().unwrap().len(), 20);
        assert_eq!(
            refusal_of(&t, &had, &form(6)),
            "Un ticket prend 20 images au plus."
        );
    }

    #[test]
    fn only_a_plain_file_name_is_one_of_the_tickets_folder() {
        for plain in ["3f2a9c01b7de.png", "a.jpg", "A-b_9.webp"] {
            assert!(plain_name(plain), "{plain}");
        }
        for other in [
            "",
            ".",
            "..",
            "../x.png",
            "a/b.png",
            "a\\b.png",
            "C:x.png",
            "/etc/x.png",
            "C:\\x.png",
            "a.b.png",
            ".png",
            "x.",
            "x",
            "é.png",
            "a b.png",
            "a.png\0",
            // The devices Windows reserves, whatever their case and extension.
            "con.png",
            "NUL.jpg",
            "Aux.gif",
            "prn.webp",
            "com1.png",
            "LPT9.png",
        ] {
            assert!(!plain_name(other), "{other:?}");
        }
        // Names that only start like one.
        for plain in ["console.png", "com10.png", "nul_1.png"] {
            assert!(plain_name(plain), "{plain}");
        }
    }

    #[test]
    fn a_file_out_of_the_tickets_folder_is_never_read_listed_kept_nor_removed() {
        let root = test_dir("ticket-images-outside");
        let dir = root.join("t1");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.png"), PNG).unwrap();
        let outside = root.join("outside.png");
        std::fs::write(&outside, PNG).unwrap();
        let image = |name: &str, file: &str| TicketImage {
            name: name.into(),
            media_type: "image/png".into(),
            file: file.into(),
        };
        // A state edited by hand: a way up, and the file's absolute path.
        let images = [
            image("a.png", "a.png"),
            image("up.png", "../outside.png"),
            image("abs.png", &outside.to_string_lossy()),
        ];
        let shown = read(&dir, &images);
        assert_eq!(
            shown.iter().map(|i| i.name.as_str()).collect::<Vec<_>>(),
            ["a.png"]
        );
        let (attached, missing) = attachments(&dir, &images);
        assert_eq!(
            attached.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(),
            ["a.png"]
        );
        assert_eq!(missing, ["up.png", "abs.png"]);
        // Kept by a form: left out as one whose file is gone.
        let keep = |file: &str| DraftImage {
            file: file.into(),
            ..Default::default()
        };
        let kept = check_in(
            Fr,
            &dir,
            &images,
            &[
                keep("a.png"),
                keep("../outside.png"),
                keep(&outside.to_string_lossy()),
            ],
        )
        .ok()
        .unwrap();
        assert_eq!(kept.len(), 1);
        assert!(matches!(&kept[0], Checked::Kept(i) if i.file == "a.png"));
        // Let go of: never removed.
        let_go(
            &dir,
            &[
                "../outside.png".to_string(),
                outside.to_string_lossy().into(),
            ],
        );
        assert_eq!(std::fs::read(&outside).unwrap(), PNG);
        assert!(dir.join("a.png").exists());
    }

    /// An image whose base64 is longer than the biggest one allowed; not base64 at all, which
    /// shows it is refused before it is decoded.
    fn too_long_to_decode() -> DraftImage {
        DraftImage {
            data: "!".repeat(4 * MAX_IMAGE.div_ceil(3) + 4),
            ..pasted("photo.png", "image/png", b"")
        }
    }

    #[test]
    fn an_image_whose_base64_is_too_long_is_refused_before_it_is_decoded() {
        let dir = test_dir("ticket-images-long");
        let e = match check_in(Fr, &dir, &[], &[too_long_to_decode()]) {
            Err(e) => e.to_string(),
            Ok(_) => panic!("accepted"),
        };
        assert_eq!(e, "photo.png dépasse 5 Mo");
        // The biggest one allowed is still read: its size is checked on what it decodes to.
        let biggest = pasted("max.png", "image/png", &png_of(MAX_IMAGE));
        assert!(biggest.data.len() <= 4 * MAX_IMAGE.div_ceil(3));
        assert!(check_in(Fr, &dir, &[], &[biggest]).is_ok());
    }

    #[test]
    fn a_write_that_fails_midway_leaves_no_partial_file() {
        let dir = test_dir("ticket-images-partial").join("t1");
        let new = |name: &str| Checked::New {
            name: name.into(),
            media_type: "image/png",
            bytes: png_of(100),
        };
        let puts = std::cell::Cell::new(0);
        let put = |path: &Path, bytes: &[u8]| {
            puts.set(puts.get() + 1);
            if puts.get() == 1 {
                return std::fs::write(path, bytes);
            }
            // The disk fills up: half of the file is there.
            std::fs::write(path, &bytes[..bytes.len() / 2])?;
            Err(std::io::Error::other("disque plein"))
        };
        let e = write_with(&dir, vec![new("a.png"), new("b.png")], put).unwrap_err();
        assert_eq!(
            e.to_string(),
            "b.png n’a pas pu être enregistré : disque plein"
        );
        assert_eq!(puts.get(), 2);
        // Neither the file written whole nor the one written half is left, nor the folder.
        assert!(
            !dir.exists(),
            "{:?}",
            std::fs::read_dir(&dir).map(|d| d.count())
        );
    }

    #[test]
    fn an_image_kept_is_one_of_the_tickets_own_never_another_file() {
        let dir = test_dir("ticket-images-kept");
        let t = dir.join("t1");
        std::fs::create_dir_all(&t).unwrap();
        std::fs::write(t.join("a.png"), b"png").unwrap();
        std::fs::write(dir.join("state.json"), b"{}").unwrap();
        let own = TicketImage {
            name: "capture.png".into(),
            media_type: "image/png".into(),
            file: "a.png".into(),
        };
        let keep = |file: &str| DraftImage {
            file: file.into(),
            ..Default::default()
        };
        let checked = check(
            &t,
            std::slice::from_ref(&own),
            &[keep("a.png"), keep("../state.json"), keep("absent.png")],
        )
        .unwrap();
        let images = write(&t, checked).unwrap();
        // Its own, as the ticket has it (not as the form names it); nothing else.
        assert_eq!(images, std::slice::from_ref(&own));
        // One whose file is gone is left out too.
        std::fs::remove_file(t.join("a.png")).unwrap();
        assert!(check(&t, &[own], &[keep("a.png")]).unwrap().is_empty());
    }

    #[test]
    fn an_image_is_of_the_type_its_content_says_and_nothing_else_is_one() {
        let dir = test_dir("ticket-images-type");
        // A JPEG named and typed as a PNG is kept as the JPEG it is: the API would refuse it.
        let images = write(
            &dir,
            check(
                &dir,
                &[],
                &[pasted("capture.png", "image/png", b"\xff\xd8\xff\xe0jpeg")],
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(images[0].media_type, "image/jpeg");
        assert!(images[0].file.ends_with(".jpg"), "{}", images[0].file);
        assert_eq!(images[0].name, "capture.png");
        for (bytes, t) in [
            (PNG, "image/png"),
            (&b"GIF87a..."[..], "image/gif"),
            (&b"GIF89a..."[..], "image/gif"),
            (&b"RIFF\0\0\0\0WEBPVP8 "[..], "image/webp"),
        ] {
            assert_eq!(sniff(bytes), Some(t));
        }
        // Empty, or no image whatever its name and type say.
        for bytes in [&b""[..], b"bonjour", b"RIFF\0\0\0\0WAVEfmt ", b"\x89PN"] {
            let e = match check_in(En, &dir, &[], &[pasted("x.png", "image/png", bytes)]) {
                Err(e) => e.to_string(),
                Ok(_) => panic!("accepted: {bytes:?}"),
            };
            assert_eq!(
                e,
                "“x.png” isn’t an image: a ticket takes PNG, JPEG, GIF and WebP images."
            );
        }
    }

    #[test]
    fn the_attachments_are_the_images_read_and_the_names_of_those_that_could_not_be() {
        let dir = test_dir("ticket-images-attachments");
        let image = |name: &str, file: &str| TicketImage {
            name: name.into(),
            media_type: "image/png".into(),
            file: file.into(),
        };
        let images = [
            image("a.png", "a.png"),
            image("b.png", "b.png"),
            image("c.png", "c.png"),
        ];
        std::fs::write(dir.join("a.png"), PNG).unwrap();
        // b's file is not there, c's is a folder: neither can be read.
        std::fs::create_dir_all(dir.join("c.png")).unwrap();
        let (attached, missing) = attachments(&dir, &images);
        assert_eq!(
            attached.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(),
            ["a.png"]
        );
        assert_eq!(
            attached[0].data,
            base64::engine::general_purpose::STANDARD.encode(PNG)
        );
        assert_eq!(missing, ["b.png", "c.png"]);
        // Nothing missing, nothing said.
        let (attached, missing) = attachments(&dir, &images[..1]);
        assert_eq!((attached.len(), missing), (1, Vec::<String>::new()));
        let (attached, missing) = attachments(&dir, &[]);
        assert!(attached.is_empty() && missing.is_empty());
    }

    #[test]
    fn files_let_go_of_leave_the_others_and_take_the_folder_once_empty() {
        let dir = test_dir("ticket-images-let-go").join("t1");
        std::fs::create_dir_all(&dir).unwrap();
        for f in ["a.png", "b.png"] {
            std::fs::write(dir.join(f), PNG).unwrap();
        }
        let_go(&dir, &["a.png".to_string()]);
        assert!(!dir.join("a.png").exists() && dir.join("b.png").exists());
        let_go(&dir, &["b.png".to_string()]);
        assert!(!dir.exists());
        // Gone already: nothing to do.
        let_go(&dir, &["b.png".to_string()]);
        remove(&dir);
    }
}
