use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid save format: {0}")]
    InvalidFormat(String),

    #[error("Encryption error: {0}")]
    Crypto(String),

    #[error("Decompression error: {0}")]
    Decompress(String),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error(
        "Save file changed on disk since it was opened. Close the game and reload before saving."
    )]
    StaleFile,

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Save verification failed: {0}")]
    Verification(String),
}
