//! Phase-0 spike: Windows Credential Manager round-trip through `keyring`.

use keyring::Entry;

#[test]
fn keyring_round_trips_a_secret() {
    let entry = Entry::new("neural_map_spike", "spike_user").expect("entry");
    entry.set_password("s3cret-value").expect("set");
    assert_eq!(entry.get_password().expect("get"), "s3cret-value");
    entry.delete_credential().expect("delete");
    assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
}
