//! Lossless JSON-text patching: modifies only the targeted JSON members
//! inside a slot's raw UTF-8 JSON text, preserving every other byte,
//! key ordering, whitespace, and numeric formatting.

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PatchOp {
    /// Set or insert `key` with raw JSON value `val_json` inside the object at `path`.
    Set {
        path: Vec<String>,
        key: String,
        val_json: String,
    },
    /// Append raw JSON value `val_json` to the array at `path`.
    Push { path: Vec<String>, val_json: String },
    /// Remove a key from the object at `path` (no-op if absent).
    RemoveKey { path: Vec<String>, key: String },
    /// Remove all occurrences of a JSON string `value` from the string array at `path`.
    RemoveArrayString { path: Vec<String>, value: String },
}

fn skip_ws(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && matches!(b[i], b' ' | b'\t' | b'\n' | b'\r') {
        i += 1;
    }
    i
}

fn skip_string(b: &[u8], mut i: usize) -> Result<usize> {
    if i >= b.len() || b[i] != b'"' {
        return Err(Error::InvalidFormat("Expected JSON string".into()));
    }
    i += 1;
    while i < b.len() {
        match b[i] {
            b'\\' => {
                i += 2;
            }
            b'"' => return Ok(i + 1),
            _ => i += 1,
        }
    }
    Err(Error::InvalidFormat(
        "Unterminated string in save JSON".into(),
    ))
}

fn skip_value(b: &[u8], mut i: usize) -> Result<usize> {
    i = skip_ws(b, i);
    if i >= b.len() {
        return Err(Error::InvalidFormat("Unexpected end of save JSON".into()));
    }
    match b[i] {
        b'"' => skip_string(b, i),
        b'{' | b'[' => {
            let mut depth = 0usize;
            while i < b.len() {
                match b[i] {
                    b'"' => i = skip_string(b, i)?,
                    b'{' | b'[' => {
                        depth += 1;
                        i += 1;
                    }
                    b'}' | b']' => {
                        depth = depth.saturating_sub(1);
                        i += 1;
                        if depth == 0 {
                            return Ok(i);
                        }
                    }
                    _ => i += 1,
                }
            }
            Err(Error::InvalidFormat(
                "Unbalanced braces in save JSON".into(),
            ))
        }
        _ => {
            while i < b.len() && !matches!(b[i], b',' | b'}' | b']' | b' ' | b'\t' | b'\r' | b'\n')
            {
                i += 1;
            }
            Ok(i)
        }
    }
}

/// Locate byte range `[start, end)` of the value at `path` inside JSON text `t`.
pub fn json_locate(t: &str, path: &[String]) -> Result<Option<(usize, usize)>> {
    let b = t.as_bytes();
    let mut i = skip_ws(b, 0);
    for key in path {
        if i >= b.len() || b[i] != b'{' {
            return Ok(None);
        }
        i += 1;
        let mut found = None;
        loop {
            i = skip_ws(b, i);
            if i >= b.len() || b[i] == b'}' {
                break;
            }
            let ke = skip_string(b, i)?;
            let parsed_key: String = serde_json::from_str(&t[i..ke])?;
            let colon = skip_ws(b, ke);
            if colon >= b.len() || b[colon] != b':' {
                return Err(Error::InvalidFormat("Expected ':' after object key".into()));
            }
            let val_start = skip_ws(b, colon + 1);
            if parsed_key == *key {
                found = Some(val_start);
                break;
            }
            let val_end = skip_value(b, val_start)?;
            i = skip_ws(b, val_end);
            if i < b.len() && b[i] == b',' {
                i += 1;
            }
        }
        match found {
            Some(pos) => i = pos,
            None => return Ok(None),
        }
    }
    let end = skip_value(b, i)?;
    Ok(Some((i, end)))
}

fn json_set(t: &str, path: &[String], key: &str, val_json: &str) -> Result<String> {
    let mut full = path.to_vec();
    full.push(key.to_string());
    if let Some((start, end)) = json_locate(t, &full)? {
        let mut out = String::with_capacity(t.len() + val_json.len());
        out.push_str(&t[..start]);
        out.push_str(val_json);
        out.push_str(&t[end..]);
        return Ok(out);
    }
    let Some((start, end)) = json_locate(t, path)? else {
        return Err(Error::NotFound(format!(
            "JSON object not found: {}",
            path.join(".")
        )));
    };
    if !t.as_bytes().get(start).is_some_and(|&c| c == b'{') {
        return Err(Error::Validation(format!(
            "Target is not a JSON object: {}",
            path.join(".")
        )));
    }
    let inner = t[start + 1..end - 1].trim();
    let encoded_key = serde_json::to_string(key)?;
    let mut out = String::with_capacity(t.len() + encoded_key.len() + val_json.len() + 2);
    out.push_str(&t[..end - 1]);
    if !inner.is_empty() {
        out.push(',');
    }
    out.push_str(&encoded_key);
    out.push(':');
    out.push_str(val_json);
    out.push_str(&t[end - 1..]);
    Ok(out)
}

fn json_push(t: &str, path: &[String], val_json: &str) -> Result<String> {
    let Some((start, end)) = json_locate(t, path)? else {
        return Err(Error::NotFound(format!(
            "JSON array not found: {}",
            path.join(".")
        )));
    };
    if !t.as_bytes().get(start).is_some_and(|&c| c == b'[') {
        return Err(Error::Validation(format!(
            "Target is not a JSON array: {}",
            path.join(".")
        )));
    }
    let inner = t[start + 1..end - 1].trim();
    let mut out = String::with_capacity(t.len() + val_json.len() + 2);
    out.push_str(&t[..end - 1]);
    if !inner.is_empty() {
        out.push(',');
    }
    out.push_str(val_json);
    out.push_str(&t[end - 1..]);
    Ok(out)
}

fn json_remove_key(t: &str, path: &[String], key: &str) -> Result<String> {
    let Some((obj_start, obj_end)) = json_locate(t, path)? else {
        return Ok(t.to_string());
    };
    let b = t.as_bytes();
    if b.get(obj_start) != Some(&b'{') {
        return Ok(t.to_string());
    }
    let mut i = obj_start + 1;
    let mut prev_comma: Option<usize> = None;
    while i < obj_end - 1 {
        let entry_start = skip_ws(b, i);
        if entry_start >= obj_end - 1 || b[entry_start] == b'}' {
            break;
        }
        let ke = skip_string(b, entry_start)?;
        let parsed_key: String = serde_json::from_str(&t[entry_start..ke])?;
        let colon = skip_ws(b, ke);
        let val_start = skip_ws(b, colon + 1);
        let val_end = skip_value(b, val_start)?;
        let after_val = skip_ws(b, val_end);
        let has_next_comma = after_val < obj_end - 1 && b[after_val] == b',';

        if parsed_key == key {
            let (cut_start, cut_end) = if has_next_comma {
                (entry_start, after_val + 1)
            } else if let Some(pc) = prev_comma {
                (pc, val_end)
            } else {
                (entry_start, val_end)
            };
            let mut out = String::with_capacity(t.len());
            out.push_str(&t[..cut_start]);
            out.push_str(&t[cut_end..]);
            return Ok(out);
        }

        if has_next_comma {
            prev_comma = Some(after_val);
            i = after_val + 1;
        } else {
            break;
        }
    }
    Ok(t.to_string())
}

fn json_remove_array_string(t: &str, path: &[String], value: &str) -> Result<String> {
    let Some((arr_start, arr_end)) = json_locate(t, path)? else {
        return Ok(t.to_string());
    };
    let slice = &t[arr_start..arr_end];
    let items: Vec<serde_json::Value> = serde_json::from_str(slice)?;
    let filtered: Vec<serde_json::Value> = items
        .into_iter()
        .filter(|item| item.as_str() != Some(value))
        .collect();
    let encoded = serde_json::to_string(&filtered)?;
    let mut out = String::with_capacity(t.len());
    out.push_str(&t[..arr_start]);
    out.push_str(&encoded);
    out.push_str(&t[arr_end..]);
    Ok(out)
}

pub fn apply_ops(text: &str, ops: &[PatchOp]) -> Result<String> {
    let mut current = text.to_string();
    for op in ops {
        current = match op {
            PatchOp::Set {
                path,
                key,
                val_json,
            } => json_set(&current, path, key, val_json)?,
            PatchOp::Push { path, val_json } => json_push(&current, path, val_json)?,
            PatchOp::RemoveKey { path, key } => json_remove_key(&current, path, key)?,
            PatchOp::RemoveArrayString { path, value } => {
                json_remove_array_string(&current, path, value)?
            }
        };
    }
    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lossless_set_and_push_preserve_unrelated_bytes() {
        let raw =
            r#"{"Player":{"Dust":100,"SpiritShadow":5},"BellManager":{"ActivateBellIDs":["B1"]}}"#;
        let ops = vec![
            PatchOp::Set {
                path: vec!["Player".into()],
                key: "Dust".into(),
                val_json: "9999".into(),
            },
            PatchOp::Push {
                path: vec!["BellManager".into(), "ActivateBellIDs".into()],
                val_json: "\"B2\"".into(),
            },
        ];
        let patched = apply_ops(raw, &ops).unwrap();
        assert_eq!(
            patched,
            r#"{"Player":{"Dust":9999,"SpiritShadow":5},"BellManager":{"ActivateBellIDs":["B1","B2"]}}"#
        );
    }

    #[test]
    fn remove_key_and_array_string() {
        let raw = r#"{"EventPipeline":{"GlobalTags":["a","b","c"]},"Inventory":{"InventoryInfos":{"X":1,"Y":2}}}"#;
        let ops = vec![
            PatchOp::RemoveArrayString {
                path: vec!["EventPipeline".into(), "GlobalTags".into()],
                value: "b".into(),
            },
            PatchOp::RemoveKey {
                path: vec!["Inventory".into(), "InventoryInfos".into()],
                key: "X".into(),
            },
        ];
        let patched = apply_ops(raw, &ops).unwrap();
        let val: serde_json::Value = serde_json::from_str(&patched).unwrap();
        assert_eq!(
            val["EventPipeline"]["GlobalTags"],
            serde_json::json!(["a", "c"])
        );
        assert!(val["Inventory"]["InventoryInfos"].get("X").is_none());
        assert_eq!(val["Inventory"]["InventoryInfos"]["Y"], 2);
    }
}
