#![allow(dead_code)] // each integration test binary uses a different subset

use std::io::Write;
use std::path::{Path, PathBuf};

pub fn fixture(rel: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(rel)
}

pub fn fixture_text(rel: &str) -> String {
    std::fs::read_to_string(fixture(rel)).expect("read fixture")
}

/// Writes a zip with the given (name, contents) entries into `dir` and returns its path.
pub fn make_zip(dir: &Path, file_name: &str, entries: &[(&str, &str)]) -> PathBuf {
    let path = dir.join(file_name);
    let file = std::fs::File::create(&path).expect("create zip");
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for (name, body) in entries {
        zip.start_file(*name, opts).expect("start file");
        zip.write_all(body.as_bytes()).expect("write entry");
    }
    zip.finish().expect("finish zip");
    path
}
