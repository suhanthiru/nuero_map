//! Uniform read access to an export given as a zip, an extracted folder, or a bare JSON file.

use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub enum Archive {
    Zip(PathBuf),
    Dir(PathBuf),
    File(PathBuf),
}

impl Archive {
    pub fn open(path: &Path) -> AppResult<Self> {
        let meta = std::fs::metadata(path)?;
        if meta.is_dir() {
            return Ok(Archive::Dir(path.to_path_buf()));
        }
        let is_zip = path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("zip"));
        let is_json = path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("json"));
        match (is_zip, is_json) {
            (true, _) => Ok(Archive::Zip(path.to_path_buf())),
            (_, true) => Ok(Archive::File(path.to_path_buf())),
            _ => Err(AppError::BadExport(format!(
                "expected a .zip, a folder, or conversations.json: {}",
                path.display()
            ))),
        }
    }

    /// Relative paths with `/` separators.
    pub fn file_names(&self) -> AppResult<Vec<String>> {
        match self {
            Archive::Zip(path) => {
                let zip = zip::ZipArchive::new(File::open(path)?)?;
                Ok(zip
                    .file_names()
                    .filter(|n| !n.ends_with('/'))
                    .map(|n| n.replace('\\', "/"))
                    .collect())
            }
            Archive::Dir(root) => list_dir(root, root),
            Archive::File(path) => Ok(vec![file_name(path)]),
        }
    }

    /// Opens one entry for streaming and hands the reader to `f`.
    pub fn read_entry<T>(
        &self,
        name: &str,
        f: impl FnOnce(&mut dyn Read) -> AppResult<T>,
    ) -> AppResult<T> {
        match self {
            Archive::Zip(path) => {
                let mut zip = zip::ZipArchive::new(File::open(path)?)?;
                let mut entry = zip.by_name(name)?;
                f(&mut entry)
            }
            Archive::Dir(root) => f(&mut File::open(root.join(name))?),
            Archive::File(path) => f(&mut File::open(path)?),
        }
    }

    pub fn path(&self) -> &Path {
        match self {
            Archive::Zip(p) | Archive::Dir(p) | Archive::File(p) => p,
        }
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn list_dir(root: &Path, dir: &Path) -> AppResult<Vec<String>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            out.extend(list_dir(root, &path)?);
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    out.sort();
    Ok(out)
}
