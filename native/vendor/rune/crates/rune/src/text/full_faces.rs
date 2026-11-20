//! A web app embeds Inter cut to Latin, Greek and Cyrillic text (`scripts/web-fonts.sh`) and
//! fetches the full faces after its first frame. When they arrive, every text system registers
//! them in place of the cut ones and drops what it shaped. The cut faces keep each of their
//! glyphs' outline, advance, kerning and layout features, so text they cover stays where it is
//! and only text they lacked moves.

use std::cell::RefCell;
use std::sync::OnceLock;

use parley::fontique::Blob;

use super::TextSystem;

static ARRIVED: OnceLock<Vec<Blob<u8>>> = OnceLock::new();

thread_local! {
    /// Web fonts fetched asynchronously (at boot or added later); every text system picks up new entries.
    static EXTRA_FONTS: RefCell<Vec<Blob<u8>>> = const { RefCell::new(Vec::new()) };
}

/// Register a dynamically fetched font face on web without blocking the first frame.
#[cfg(target_arch = "wasm32")]
pub(crate) fn add_extra_font(bytes: Vec<u8>) {
    EXTRA_FONTS.with(|fonts| fonts.borrow_mut().push(Blob::new(std::sync::Arc::new(bytes))));
    super::measure::note_faces_arrived();
}

/// The full faces' files, which a web build serves beside its `app.js`.
#[cfg(all(target_arch = "wasm32", feature = "embedded-fonts"))]
pub(crate) const FILES: &[&str] = &["Inter-Regular.ttf", "Inter-Medium.ttf", "Inter-SemiBold.ttf"];

/// Hands over the full faces: measurement uses them from now on, and every text system from
/// its next frame. Only the first call counts.
#[cfg(all(target_arch = "wasm32", feature = "embedded-fonts"))]
pub(crate) fn arrive(faces: Vec<Vec<u8>>) {
    if ARRIVED.set(faces.into_iter().map(|f| Blob::new(std::sync::Arc::new(f))).collect()).is_ok() {
        super::measure::note_faces_arrived();
    }
}

impl TextSystem {
    /// Takes up the full faces if they arrived since it last looked; true when it did.
    pub(crate) fn follow_full_faces(&mut self) -> bool {
        let Some(faces) = ARRIVED.get().filter(|_| !self.full_faces) else { return false };
        self.full_faces = true;
        self.swap_faces(faces);
        self.drop_shaped();
        true
    }

    /// Takes up any web fonts fetched since this text system last looked; true when it did.
    pub(crate) fn follow_extra_fonts(&mut self) -> bool {
        let new_blobs: Vec<Blob<u8>> = EXTRA_FONTS.with(|fonts| {
            let fonts = fonts.borrow();
            if fonts.len() <= self.extra_fonts { return Vec::new(); }
            fonts[self.extra_fonts..].to_vec()
        });
        if new_blobs.is_empty() { return false; }
        self.extra_fonts += new_blobs.len();
        for blob in &new_blobs {
            self.font_cx.collection.register_fonts(blob.clone(), None);
        }
        self.drop_shaped();
        true
    }

    /// Registers each face in place of those with its family, width, style and weight.
    pub(super) fn swap_faces(&mut self, faces: &[Blob<u8>]) {
        let collection = &mut self.font_cx.collection;
        for blob in faces {
            for (family, fonts) in collection.register_fonts(blob.clone(), None) {
                for font in fonts {
                    collection.unregister_font(family, font.width(), font.style(), font.weight());
                }
            }
            collection.register_fonts(blob.clone(), None);
        }
    }
}

#[cfg(test)]
#[path = "full_faces_tests.rs"]
mod tests;
