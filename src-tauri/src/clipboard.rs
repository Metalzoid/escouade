//! The image on the system's clipboard, for a paste the WebView leaves without it: WebKitGTK gives
//! a page's paste event no image data, only text and file paths (WebKit bug 218519). WebView2 and
//! WKWebView give it: nothing is read there.

use tauri::{AppHandle, Runtime};

/// The image on the clipboard, as PNG; empty without one.
#[cfg(target_os = "linux")]
pub async fn image_png<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<Vec<u8>> {
    use gtk::gdk;
    use std::time::Duration;

    let (tx, rx) = tokio::sync::oneshot::channel();
    // GTK's clipboard, the one of the window's display (X11 or Wayland), is read on its thread.
    app.run_on_main_thread(move || {
        let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
        // The PNG as it was copied (a screenshot, a browser's image): nothing decoded on the
        // thread that runs the window.
        clipboard.request_contents(&gdk::Atom::intern("image/png"), move |clipboard, data| {
            if data.length() > 0 {
                let _ = tx.send(Some(Ok(data.data())));
                return;
            }
            // Another format (JPEG, BMP…), converted.
            clipboard.request_image(move |_, image| {
                let png = image.map(|i| i.save_to_bufferv("png", &[]).map_err(|e| e.to_string()));
                let _ = tx.send(png);
            });
        });
    })?;
    // The application that holds the clipboard may never answer.
    let Ok(image) = tokio::time::timeout(Duration::from_secs(5), rx).await else {
        anyhow::bail!(tr!(
            "le presse-papiers ne répond pas",
            "the clipboard does not answer"
        ));
    };
    match image {
        Ok(Some(Ok(png))) => Ok(png),
        Ok(Some(Err(e))) => anyhow::bail!(tr!(
            "l’image du presse-papiers est illisible : {e}",
            "the clipboard’s image cannot be read: {e}"
        )),
        _ => Ok(Vec::new()),
    }
}

#[cfg(not(target_os = "linux"))]
pub async fn image_png<R: Runtime>(_app: &AppHandle<R>) -> anyhow::Result<Vec<u8>> {
    Ok(Vec::new())
}
