//! PBZS v3 encrypted save container reader and writer.
//!
//! Layout:
//! - Outer header (12 bytes): `PBZS` (4) | version/flags (2) | slot_count (u16 LE) | dir_size (u32 LE)
//! - Encrypted directory block (`dir_size` bytes):
//!   prefix (8: `PBZS 01 01 00 00`) | nonce (12) | AES-GCM tag (16) | ciphertext.
//!   Decrypted directory payload: 12-byte header copy + `slot_count` entries:
//!   `name_len (u16 LE) | name (UTF-8) | alg (u8) | flag (u8) | raw_size (u32 LE) | offset (u32 LE) | block_size (u32 LE)`.
//! - Encrypted slot blocks at `12 + dir_size + offset`, each `block_size` bytes:
//!   prefix (8) | nonce (12) | tag (16) | ciphertext.
//!   Decrypted slot payload by `alg`: 0 = raw UTF-8 JSON, 1 = zlib, 2 = Oodle Kraken (written back as `0xCC 0x06` stored blocks).

use crate::error::{Error, Result};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use flate2::read::ZlibDecoder;
use rand::RngCore;
use serde_json::Value;
use std::collections::HashMap;
use std::io::Read;

const PBZS_MAGIC: &[u8; 4] = b"PBZS";
const PBZS_KEY: [u8; 32] = [
    0x15, 0xa1, 0xfe, 0x0f, 0x55, 0xe0, 0xeb, 0x29, 0x8e, 0x7c, 0x94, 0x61, 0x54, 0x83, 0x51, 0x69,
    0x6a, 0x2a, 0x07, 0x00, 0xed, 0x2d, 0x17, 0xba, 0x1f, 0x87, 0x14, 0x57, 0xe8, 0xf9, 0x3e, 0x2d,
];
const OODLE_CHUNK_SIZE: usize = 0x40000; // 256 KiB

#[derive(Debug, Clone)]
pub struct PbzsSlot {
    pub name: String,
    pub alg: u8,
    pub flag: u8,
    pub raw_size: u32,
    pub offset: u32,
    pub block_size: u32,
    pub prefix: [u8; 8],
    pub block_raw: Vec<u8>,
    pub text: Option<String>,
    pub json: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PbzsContainer {
    pub header: [u8; 12],
    pub dir_prefix: [u8; 8],
    pub slots: Vec<PbzsSlot>,
}

fn read_u16_le(bytes: &[u8], off: usize) -> Result<u16> {
    let slice: [u8; 2] = bytes
        .get(off..off + 2)
        .ok_or_else(|| Error::InvalidFormat("Unexpected EOF reading u16".into()))?
        .try_into()
        .map_err(|_| Error::InvalidFormat("Invalid u16 slice".into()))?;
    Ok(u16::from_le_bytes(slice))
}

fn read_u32_le(bytes: &[u8], off: usize) -> Result<u32> {
    let slice: [u8; 4] = bytes
        .get(off..off + 4)
        .ok_or_else(|| Error::InvalidFormat("Unexpected EOF reading u32".into()))?
        .try_into()
        .map_err(|_| Error::InvalidFormat("Invalid u32 slice".into()))?;
    Ok(u32::from_le_bytes(slice))
}

fn open_block(blob: &[u8]) -> Result<([u8; 8], Vec<u8>)> {
    if blob.len() < 36 || &blob[..4] != PBZS_MAGIC {
        return Err(Error::InvalidFormat(
            "Invalid PBZS encrypted block header".into(),
        ));
    }
    let mut prefix = [0u8; 8];
    prefix.copy_from_slice(&blob[..8]);
    let nonce = Nonce::from_slice(&blob[8..20]);
    let tag = &blob[20..36];
    let ct = &blob[36..];
    let mut combined = Vec::with_capacity(ct.len() + 16);
    combined.extend_from_slice(ct);
    combined.extend_from_slice(tag);

    let cipher = Aes256Gcm::new_from_slice(&PBZS_KEY).map_err(|e| Error::Crypto(e.to_string()))?;
    let plain = cipher
        .decrypt(nonce, combined.as_ref())
        .map_err(|_| Error::Crypto("AES-256-GCM authentication failed".into()))?;
    Ok((prefix, plain))
}

fn seal_block(prefix: [u8; 8], plain: &[u8]) -> Result<Vec<u8>> {
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(&PBZS_KEY).map_err(|e| Error::Crypto(e.to_string()))?;
    let encrypted = cipher
        .encrypt(nonce, plain)
        .map_err(|_| Error::Crypto("AES-256-GCM encryption failed".into()))?;
    if encrypted.len() < 16 {
        return Err(Error::Crypto("Ciphertext shorter than GCM tag".into()));
    }
    let ct_len = encrypted.len() - 16;
    let ct = &encrypted[..ct_len];
    let tag = &encrypted[ct_len..];

    let mut out = Vec::with_capacity(36 + ct.len());
    out.extend_from_slice(&prefix);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(tag);
    out.extend_from_slice(ct);
    Ok(out)
}

pub fn oodle_decompress(compressed: &[u8], raw_size: usize) -> Result<Vec<u8>> {
    let mut out = vec![0u8; raw_size];
    let mut extractor = oozextract::Extractor::new();
    let written = extractor
        .read_from_slice(compressed, &mut out)
        .map_err(|e| Error::Decompress(format!("Oodle decompression failed: {e:?}")))?;
    if written != raw_size {
        return Err(Error::Decompress(format!(
            "Oodle decompressed {written} bytes, expected {raw_size}"
        )));
    }
    Ok(out)
}

/// Encode raw payload as uncompressed Oodle Kraken stored blocks (`0xCC 0x06` + up to 256 KiB).
/// Keeps algorithm id `2` identical to game-written saves and PBZ-Editor.
pub fn oodle_store(plain: &[u8]) -> Vec<u8> {
    if plain.is_empty() {
        return vec![0xcc, 0x06];
    }
    let chunks = plain.len().div_ceil(OODLE_CHUNK_SIZE);
    let mut out = Vec::with_capacity(plain.len() + 2 * chunks);
    for chunk in plain.chunks(OODLE_CHUNK_SIZE) {
        out.push(0xcc);
        out.push(0x06);
        out.extend_from_slice(chunk);
    }
    out
}

fn inflate_zlib(compressed: &[u8]) -> Result<Vec<u8>> {
    let mut dec = ZlibDecoder::new(compressed);
    let mut out = Vec::new();
    dec.read_to_end(&mut out)
        .map_err(|e| Error::Decompress(format!("zlib inflate failed: {e}")))?;
    Ok(out)
}

impl PbzsContainer {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        if bytes.len() < 12 || &bytes[..4] != PBZS_MAGIC {
            return Err(Error::InvalidFormat("Not a PBZS save file".into()));
        }
        let mut header = [0u8; 12];
        header.copy_from_slice(&bytes[..12]);
        let slot_count = usize::from(read_u16_le(bytes, 6)?);
        let dir_size = read_u32_le(bytes, 8)? as usize;

        let dir_blob = bytes
            .get(12..12 + dir_size)
            .ok_or_else(|| Error::InvalidFormat("Directory extends past EOF".into()))?;
        let (dir_prefix, dir_plain) = open_block(dir_blob)?;

        let mut p = 12usize;
        let mut slots = Vec::with_capacity(slot_count);
        let base = 12 + dir_size;

        for _ in 0..slot_count {
            let name_len = usize::from(read_u16_le(&dir_plain, p)?);
            p += 2;
            let name_bytes = dir_plain
                .get(p..p + name_len)
                .ok_or_else(|| Error::InvalidFormat("Slot name extends past directory".into()))?;
            let name = String::from_utf8(name_bytes.to_vec())
                .map_err(|_| Error::InvalidFormat("Slot name is not valid UTF-8".into()))?;
            p += name_len;
            if p + 14 > dir_plain.len() {
                return Err(Error::InvalidFormat(
                    "Slot metadata extends past directory".into(),
                ));
            }
            let alg = dir_plain[p];
            let flag = dir_plain[p + 1];
            p += 2;
            let raw_size = read_u32_le(&dir_plain, p)?;
            let offset = read_u32_le(&dir_plain, p + 4)?;
            let block_size = read_u32_le(&dir_plain, p + 8)?;
            p += 12;

            let abs = base + offset as usize;
            let end = abs + block_size as usize;
            let block_raw = bytes
                .get(abs..end)
                .ok_or_else(|| Error::InvalidFormat(format!("Slot {name} extends past EOF")))?
                .to_vec();

            let mut slot = PbzsSlot {
                name,
                alg,
                flag,
                raw_size,
                offset,
                block_size,
                prefix: *b"PBZS\x01\x01\x00\x00",
                block_raw,
                text: None,
                json: None,
                error: None,
            };

            match decode_slot(&slot.block_raw, alg, raw_size as usize) {
                Ok((prefix, text, json)) => {
                    slot.prefix = prefix;
                    slot.text = Some(text);
                    slot.json = Some(json);
                }
                Err(err) => {
                    slot.error = Some(err.to_string());
                }
            }

            slots.push(slot);
        }

        Ok(Self {
            header,
            dir_prefix,
            slots,
        })
    }

    /// Write container back to bytes, replacing only the slots in `replacements`
    /// while preserving all untouched slots byte-for-byte.
    pub fn write_with_replacements(
        &self,
        replacements: &HashMap<String, String>,
    ) -> Result<Vec<u8>> {
        struct Row {
            name: Vec<u8>,
            alg: u8,
            flag: u8,
            raw: u32,
            off: u32,
            size: u32,
        }

        let mut rows = Vec::with_capacity(self.slots.len());
        let mut blocks = Vec::with_capacity(self.slots.len());
        let mut off = 0u32;

        for slot in &self.slots {
            let (alg, raw, block) = if let Some(new_text) = replacements.get(&slot.name) {
                let plain = new_text.as_bytes();
                let stored = oodle_store(plain);
                // Verify stored-block round trip immediately before sealing.
                let check = oodle_decompress(&stored, plain.len())?;
                if check != plain {
                    return Err(Error::Verification(format!(
                        "Oodle stored-block round trip mismatch for slot {}",
                        slot.name
                    )));
                }
                let sealed = seal_block(slot.prefix, &stored)?;
                let raw_u32 = u32::try_from(plain.len())
                    .map_err(|_| Error::Validation("Slot payload exceeds 4 GiB".into()))?;
                (2u8, raw_u32, sealed)
            } else {
                (slot.alg, slot.raw_size, slot.block_raw.clone())
            };

            let block_size = u32::try_from(block.len())
                .map_err(|_| Error::Validation("Slot block exceeds 4 GiB".into()))?;
            rows.push(Row {
                name: slot.name.as_bytes().to_vec(),
                alg,
                flag: slot.flag,
                raw,
                off,
                size: block_size,
            });
            blocks.push(block);
            off = off
                .checked_add(block_size)
                .ok_or_else(|| Error::Validation("Container size overflow".into()))?;
        }

        let rows_len: usize = rows.iter().map(|r| 2 + r.name.len() + 14).sum();
        let dir_block_size = u32::try_from(12 + rows_len + 36)
            .map_err(|_| Error::Validation("Directory too large".into()))?;
        let slot_count =
            u16::try_from(rows.len()).map_err(|_| Error::Validation("Too many slots".into()))?;

        let mut header = self.header;
        header[6..8].copy_from_slice(&slot_count.to_le_bytes());
        header[8..12].copy_from_slice(&dir_block_size.to_le_bytes());

        let mut dir_plain = Vec::with_capacity(12 + rows_len);
        dir_plain.extend_from_slice(&header);
        for row in &rows {
            let name_len = u16::try_from(row.name.len())
                .map_err(|_| Error::Validation("Slot name too long".into()))?;
            dir_plain.extend_from_slice(&name_len.to_le_bytes());
            dir_plain.extend_from_slice(&row.name);
            dir_plain.push(row.alg);
            dir_plain.push(row.flag);
            dir_plain.extend_from_slice(&row.raw.to_le_bytes());
            dir_plain.extend_from_slice(&row.off.to_le_bytes());
            dir_plain.extend_from_slice(&row.size.to_le_bytes());
        }

        let dir_block = seal_block(self.dir_prefix, &dir_plain)?;
        let mut out = Vec::with_capacity(12 + dir_block.len() + off as usize);
        out.extend_from_slice(&header);
        out.extend_from_slice(&dir_block);
        for block in blocks {
            out.extend_from_slice(&block);
        }
        Ok(out)
    }

    pub fn slot(&self, name: &str) -> Option<&PbzsSlot> {
        self.slots.iter().find(|s| s.name == name)
    }
}

fn decode_slot(block_raw: &[u8], alg: u8, raw_size: usize) -> Result<([u8; 8], String, Value)> {
    let (prefix, plain) = open_block(block_raw)?;
    let bytes = match alg {
        0 => plain,
        1 => inflate_zlib(&plain)?,
        2 => oodle_decompress(&plain, raw_size)?,
        other => {
            return Err(Error::InvalidFormat(format!(
                "Unsupported slot compression algorithm: {other}"
            )));
        }
    };
    let text = String::from_utf8(bytes)
        .map_err(|_| Error::InvalidFormat("Slot payload is not valid UTF-8".into()))?;
    let json: Value = serde_json::from_str(&text)?;
    Ok((prefix, text, json))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oodle_store_roundtrip_multi_chunk() {
        let mut data = vec![0u8; OODLE_CHUNK_SIZE * 2 + 12345];
        for (idx, b) in data.iter_mut().enumerate() {
            *b = (idx % 251) as u8;
        }
        let encoded = oodle_store(&data);
        let decoded = oodle_decompress(&encoded, data.len()).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn synthetic_container_roundtrip() {
        let payload = r#"{"PBZGameSystem":{"DateTimeString":"2026.11.20-10.00.00","CycleCount":0},"Player":{"Dust":500}}"#;
        let stored = oodle_store(payload.as_bytes());
        let prefix = *b"PBZS\x01\x01\x00\x00";
        let slot_block = seal_block(prefix, &stored).unwrap();

        let slot_name = b"AutoSave0";
        let rows_len = 2 + slot_name.len() + 14;
        let dir_block_size = (12 + rows_len + 36) as u32;
        let mut header = [0u8; 12];
        header[..4].copy_from_slice(b"PBZS");
        header[4] = 3;
        header[5] = 0;
        header[6..8].copy_from_slice(&1u16.to_le_bytes());
        header[8..12].copy_from_slice(&dir_block_size.to_le_bytes());

        let mut dir_plain = Vec::new();
        dir_plain.extend_from_slice(&header);
        dir_plain.extend_from_slice(&(slot_name.len() as u16).to_le_bytes());
        dir_plain.extend_from_slice(slot_name);
        dir_plain.push(2);
        dir_plain.push(0);
        dir_plain.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        dir_plain.extend_from_slice(&0u32.to_le_bytes());
        dir_plain.extend_from_slice(&(slot_block.len() as u32).to_le_bytes());
        let dir_block = seal_block(prefix, &dir_plain).unwrap();

        let mut container_bytes = Vec::new();
        container_bytes.extend_from_slice(&header);
        container_bytes.extend_from_slice(&dir_block);
        container_bytes.extend_from_slice(&slot_block);

        let parsed = PbzsContainer::parse(&container_bytes).unwrap();
        assert_eq!(parsed.slots.len(), 1);
        assert_eq!(parsed.slots[0].name, "AutoSave0");
        assert_eq!(
            parsed.slots[0].json.as_ref().unwrap()["Player"]["Dust"],
            500
        );

        let mut repl = HashMap::new();
        repl.insert(
            "AutoSave0".into(),
            r#"{"PBZGameSystem":{"DateTimeString":"2026.11.20-10.00.00","CycleCount":0},"Player":{"Dust":999}}"#
                .into(),
        );
        let rewritten = parsed.write_with_replacements(&repl).unwrap();
        let reparsed = PbzsContainer::parse(&rewritten).unwrap();
        assert_eq!(
            reparsed.slots[0].json.as_ref().unwrap()["Player"]["Dust"],
            999
        );
    }
}
