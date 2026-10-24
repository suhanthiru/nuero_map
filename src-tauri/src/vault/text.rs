//! Plain-text documents (.md, .txt) as note text.

/// Reads UTF-8 (with or without a byte order mark) and UTF-16 with one; anything else is
/// taken as UTF-8, with bad bytes replaced. Line endings become `\n`.
pub fn decode(bytes: &[u8]) -> String {
    let text = if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        String::from_utf8_lossy(rest).into_owned()
    } else if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        utf16(rest, u16::from_le_bytes)
    } else if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        utf16(rest, u16::from_be_bytes)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    };
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn utf16(bytes: &[u8], unit: fn([u8; 2]) -> u16) -> String {
    let units = bytes.chunks_exact(2).map(|pair| unit([pair[0], pair[1]]));
    char::decode_utf16(units)
        .map(|c| c.unwrap_or(char::REPLACEMENT_CHARACTER))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_utf8_with_and_without_a_bom() {
        assert_eq!(decode("# Plan\r\n- a\rb".as_bytes()), "# Plan\n- a\nb");
        assert_eq!(decode(b"\xEF\xBB\xBFcaf\xC3\xA9"), "café");
        assert_eq!(decode(b"bad \xFF byte"), "bad \u{FFFD} byte");
    }

    #[test]
    fn reads_utf16_in_either_byte_order() {
        let le: Vec<u8> = [0xFF, 0xFE]
            .into_iter()
            .chain("hé\r\n".encode_utf16().flat_map(u16::to_le_bytes))
            .collect();
        let be: Vec<u8> = [0xFE, 0xFF]
            .into_iter()
            .chain("hé".encode_utf16().flat_map(u16::to_be_bytes))
            .chain([0x00])
            .collect();

        assert_eq!(decode(&le), "hé\n");
        assert_eq!(decode(&be), "hé", "a stray last byte is dropped");
    }
}
