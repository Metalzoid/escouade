//! The image on the system's clipboard, for a paste the WebView leaves without it: WebKitGTK gives
//! a page's paste event no image data, only text and file paths (WebKit bug 218519). WebView2 and
//! WKWebView give it: nothing is read there.
//!
//! Nothing of it holds the thread that runs the window (ESC-239): GTK's requests answer there, but
//! only what the clipboard offers is asked for (its targets first, never a format it does not
//! list: under WSLg in X11 it offers no image at all), one read at a time, and an image in
//! another format than PNG is converted on a thread of its own.

use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "linux")]
use std::time::Duration;
use tauri::{AppHandle, Runtime};

/// How long a read is waited for. GTK gives up on an X11 owner that does not answer only after 30 s.
#[cfg(target_os = "linux")]
const ANSWER: Duration = Duration::from_secs(3);

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
/// What to ask the clipboard for, among the targets it offers.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Wanted {
    /// The PNG as it was copied (a screenshot, a browser's image): nothing to convert.
    Png,
    /// An image in another format (WSLg offers BMP), converted to PNG.
    Other(String),
    /// No image: nothing is asked for.
    Nothing,
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
/// The image target to read among `targets`, PNG first.
pub(crate) fn wanted(targets: &[String]) -> Wanted {
    if targets.iter().any(|t| t == "image/png") {
        return Wanted::Png;
    }
    targets
        .iter()
        .find(|t| t.starts_with("image/"))
        .map_or(Wanted::Nothing, |t| Wanted::Other(t.clone()))
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
/// The one read of the clipboard going on: taken until GTK answers it, even after it was given up
/// on, so that a paste made meanwhile does not pile another request on one the clipboard leaves
/// unanswered.
pub(crate) struct Reading(&'static AtomicBool);

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
impl Reading {
    /// The read, None while another goes on.
    pub(crate) fn start(flag: &'static AtomicBool) -> Option<Reading> {
        // Built only when taken: a guard made for nothing would free the read going on as it drops.
        if flag.swap(true, Ordering::AcqRel) {
            None
        } else {
            Some(Reading(flag))
        }
    }
}

impl Drop for Reading {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
static READING: AtomicBool = AtomicBool::new(false);

/// The image on the clipboard, as PNG; empty without one.
#[cfg(target_os = "linux")]
pub async fn image_png<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<Vec<u8>> {
    use gtk::gdk;

    let Some(reading) = Reading::start(&READING) else {
        anyhow::bail!(tr!(
            "le presse-papiers est encore en lecture : recolle dans un instant",
            "the clipboard is still being read: paste again in a moment"
        ));
    };
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(Wanted, Vec<u8>), String>>();
    // GTK's clipboard, the one of the window's display (X11 or Wayland), is read on its thread,
    // without waiting there: each request answers in a callback.
    app.run_on_main_thread(move || {
        let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
        clipboard.request_contents(&gdk::Atom::intern("TARGETS"), move |clipboard, data| {
            let targets: Vec<String> = data
                .targets()
                .unwrap_or_default()
                .iter()
                .map(|t| t.name().to_string())
                .collect();
            let target = match wanted(&targets) {
                Wanted::Nothing => {
                    drop(reading);
                    let _ = tx.send(Ok((Wanted::Nothing, Vec::new())));
                    return;
                }
                Wanted::Png => "image/png".to_string(),
                Wanted::Other(t) => t,
            };
            clipboard.request_contents(&gdk::Atom::intern(&target), move |_, data| {
                drop(reading);
                let bytes = if data.length() > 0 {
                    data.data()
                } else {
                    Vec::new()
                };
                let _ = tx.send(Ok((wanted(&[target]), bytes)));
            });
        });
    })?;
    // The application that holds the clipboard may never answer.
    let Ok(answer) = tokio::time::timeout(ANSWER, rx).await else {
        anyhow::bail!(tr!(
            "le presse-papiers ne répond pas : son image n’est pas lue",
            "the clipboard does not answer: its image is not read"
        ));
    };
    match answer {
        Ok(Ok((Wanted::Other(_), bytes))) if !bytes.is_empty() => {
            // Decoded and encoded away from the window's thread.
            tokio::task::spawn_blocking(move || to_png(&bytes))
                .await?
                .map_err(|e| {
                    anyhow::anyhow!(tr!(
                        "l’image du presse-papiers est illisible : {e}",
                        "the clipboard’s image cannot be read: {e}"
                    ))
                })
        }
        Ok(Ok((_, bytes))) => Ok(bytes),
        Ok(Err(e)) => anyhow::bail!(e),
        Err(_) => Ok(Vec::new()),
    }
}

/// An image in any format gdk-pixbuf reads, as PNG.
#[cfg(target_os = "linux")]
fn to_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use gtk::gdk_pixbuf::PixbufLoader;
    use gtk::prelude::*;

    let loader = PixbufLoader::new();
    loader
        .write(bytes)
        .and_then(|_| loader.close())
        .map_err(|e| e.to_string())?;
    let pixbuf = loader.pixbuf().ok_or_else(|| "no image".to_string())?;
    pixbuf
        .save_to_bufferv("png", &[])
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "linux"))]
pub async fn image_png<R: Runtime>(_app: &AppHandle<R>) -> anyhow::Result<Vec<u8>> {
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn targets(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_paste_of_text_asks_for_no_image() {
        // WSLg in X11, an image copied in Windows included: text only.
        assert_eq!(
            wanted(&targets(&["TIMESTAMP", "TARGETS", "UTF8_STRING", "TEXT"])),
            Wanted::Nothing
        );
        assert_eq!(wanted(&[]), Wanted::Nothing);
    }

    #[test]
    fn the_png_is_taken_as_copied_another_format_converted() {
        assert_eq!(
            wanted(&targets(&[
                "TARGETS",
                "image/bmp",
                "image/png",
                "text/html"
            ])),
            Wanted::Png
        );
        // WSLg in Wayland: BMP alone.
        assert_eq!(
            wanted(&targets(&["image/bmp"])),
            Wanted::Other("image/bmp".into())
        );
    }

    #[test]
    fn one_read_at_a_time_until_the_clipboard_answers() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let first = Reading::start(&FLAG).expect("the first read");
        assert!(Reading::start(&FLAG).is_none());
        assert!(Reading::start(&FLAG).is_none());
        drop(first);
        assert!(Reading::start(&FLAG).is_some());
    }
}
