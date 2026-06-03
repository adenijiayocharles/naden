// macOS Touch ID vault unlock via Security.framework.
//
// The vault key is stored as a Keychain generic-password item with an access
// control policy created by SecAccessControlCreateWithFlags using
// kSecAccessControlBiometryCurrentSet + kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly.
// This binds the item to the Secure Enclave: the OS refuses SecItemCopyMatching
// until biometric authentication succeeds, regardless of which process asks.
// No app-level LAContext.evaluatePolicy gate is required for the unlock path.
//
// kSecAccessControlBiometryCurrentSet (vs. BiometryAny) invalidates the stored
// item whenever new fingerprints are enrolled, preventing key reuse after an
// attacker temporarily registers their own finger.

use std::ffi::c_void;

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};
use zeroize::Zeroizing;

use crate::error::AppError;

// kSecAccessControlBiometryCurrentSet = 1 << 3  (Security.h)
const ACCESS_CTRL_BIOMETRY_CURRENT_SET: u64 = 0x0000_0000_0000_0008;

// kCFStringEncodingUTF8  (CFBase.h)
const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

// OSStatus  (SecBase.h / Security.h)
const ERR_SEC_SUCCESS: i32 = 0;
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

// LAPolicyDeviceOwnerAuthenticationWithBiometrics  (LAPublicDefines.h)
const LA_POLICY_BIOMETRICS: i64 = 1;

type CfTypeRef = *const c_void;
type CfAllocatorRef = *const c_void;
type CfMutableDictRef = *mut c_void;
type CfDataRef = *const c_void;
type CfStringRef = *const c_void;

const SERVICE: &[u8] = b"com.sshelter.app.biometric";
const ACCOUNT: &[u8] = b"vault_key";
const UNLOCK_REASON: &[u8] = b"Unlock SSHelter";

// ── CoreFoundation bindings ──────────────────────────────────────────────────

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFAllocatorDefault: CfAllocatorRef;
    static kCFBooleanTrue: CfTypeRef;

    fn CFDictionaryCreateMutable(
        allocator: CfAllocatorRef,
        capacity: isize,
        key_callbacks: *const c_void,
        value_callbacks: *const c_void,
    ) -> CfMutableDictRef;

    fn CFDictionarySetValue(dict: CfMutableDictRef, key: CfTypeRef, value: CfTypeRef);

    fn CFStringCreateWithBytes(
        alloc: CfAllocatorRef,
        bytes: *const u8,
        num_bytes: isize,
        encoding: u32,
        is_external: u8,
    ) -> CfStringRef;

    fn CFDataCreate(alloc: CfAllocatorRef, bytes: *const u8, length: isize) -> CfDataRef;
    fn CFDataGetBytePtr(data: CfDataRef) -> *const u8;
    fn CFDataGetLength(data: CfDataRef) -> isize;
    fn CFRelease(cf: CfTypeRef);
}

// ── Security.framework bindings ──────────────────────────────────────────────

#[link(name = "Security", kind = "framework")]
extern "C" {
    // Access control protection level for the stored item.
    // Item is inaccessible if the device passcode is removed.
    static kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly: CfTypeRef;

    // Keychain item class / attribute / value constants
    static kSecClass: CfTypeRef;
    static kSecClassGenericPassword: CfTypeRef;
    static kSecAttrService: CfTypeRef;
    static kSecAttrAccount: CfTypeRef;
    static kSecAttrAccessControl: CfTypeRef;
    static kSecValueData: CfTypeRef;
    static kSecReturnData: CfTypeRef;
    // String shown in the system Touch ID dialog (LAKeychainOperationPrompt).
    static kSecUseOperationPrompt: CfTypeRef;

    fn SecAccessControlCreateWithFlags(
        allocator: CfAllocatorRef,
        protection: CfTypeRef,
        flags: u64,
        error: *mut CfTypeRef,
    ) -> CfTypeRef;

    fn SecItemAdd(attrs: *const c_void, result: *mut CfTypeRef) -> i32;
    fn SecItemCopyMatching(query: *const c_void, result: *mut CfTypeRef) -> i32;
    fn SecItemDelete(query: *const c_void) -> i32;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/// Creates a CFString from a UTF-8 byte slice. Caller must CFRelease.
unsafe fn cf_str(bytes: &[u8]) -> CfStringRef {
    CFStringCreateWithBytes(
        kCFAllocatorDefault,
        bytes.as_ptr(),
        bytes.len() as isize,
        CF_STRING_ENCODING_UTF8,
        0,
    )
}

/// Creates a mutable CFDictionary pre-populated with kSecClass, kSecAttrService,
/// and kSecAttrAccount for our biometric Keychain slot. Caller must CFRelease.
unsafe fn make_base_dict() -> CfMutableDictRef {
    // NULL callbacks → default CFType retain/release/equal semantics.
    let dict = CFDictionaryCreateMutable(kCFAllocatorDefault, 0, std::ptr::null(), std::ptr::null());

    CFDictionarySetValue(dict, kSecClass, kSecClassGenericPassword);

    let svc = cf_str(SERVICE);
    CFDictionarySetValue(dict, kSecAttrService, svc);
    CFRelease(svc);

    let acct = cf_str(ACCOUNT);
    CFDictionarySetValue(dict, kSecAttrAccount, acct);
    CFRelease(acct);

    dict
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Returns true if Touch ID hardware is present and at least one fingerprint
/// is enrolled on this device.
pub fn is_available() -> bool {
    unsafe {
        let Some(cls) = AnyClass::get(c"LAContext") else {
            return false;
        };
        let ctx: *mut AnyObject = msg_send![cls, alloc];
        let ctx: *mut AnyObject = msg_send![ctx, init];
        if ctx.is_null() {
            return false;
        }
        let mut err: *mut AnyObject = std::ptr::null_mut();
        let ok: bool = msg_send![ctx, canEvaluatePolicy: LA_POLICY_BIOMETRICS, error: &mut err];
        let (): () = msg_send![ctx, release];
        ok
    }
}

/// Stores `key` in the Keychain with a biometric access control policy.
/// Any existing entry for this slot is deleted first so re-enabling biometric
/// after a password change always records the current vault key.
pub fn store_key(key: &[u8; 32]) -> Result<(), AppError> {
    unsafe {
        // Remove any stale entry; ignore "not found" on first setup.
        let del = make_base_dict();
        let del_status = SecItemDelete(del as *const c_void);
        CFRelease(del as CfTypeRef);
        if del_status != ERR_SEC_SUCCESS && del_status != ERR_SEC_ITEM_NOT_FOUND {
            return Err(AppError::Vault(format!(
                "failed to clear old biometric key (OSStatus {del_status})"
            )));
        }

        // Access control: Touch ID required; item bound to current set of enrolled
        // fingerprints and protected when device passcode is set.
        let mut acl_err: CfTypeRef = std::ptr::null();
        let acl = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            ACCESS_CTRL_BIOMETRY_CURRENT_SET,
            &mut acl_err,
        );
        if acl.is_null() {
            return Err(AppError::Vault(
                "failed to create biometric access control".into(),
            ));
        }

        let dict = make_base_dict();
        CFDictionarySetValue(dict, kSecAttrAccessControl, acl);
        CFRelease(acl);

        // Store the raw key bytes — no base64, no intermediate heap copy.
        let data = CFDataCreate(kCFAllocatorDefault, key.as_ptr(), key.len() as isize);
        CFDictionarySetValue(dict, kSecValueData, data);
        CFRelease(data);

        let status = SecItemAdd(dict as *const c_void, std::ptr::null_mut());
        CFRelease(dict as CfTypeRef);

        if status == ERR_SEC_SUCCESS {
            Ok(())
        } else {
            Err(AppError::Vault(format!(
                "failed to store biometric key (OSStatus {status})"
            )))
        }
    }
}

/// Removes the biometric Keychain entry. Does not require Touch ID.
/// Succeeds silently if the entry does not exist.
pub fn delete_key() -> Result<(), AppError> {
    unsafe {
        let dict = make_base_dict();
        let status = SecItemDelete(dict as *const c_void);
        CFRelease(dict as CfTypeRef);
        if status == ERR_SEC_SUCCESS || status == ERR_SEC_ITEM_NOT_FOUND {
            Ok(())
        } else {
            Err(AppError::Vault(format!(
                "failed to delete biometric key (OSStatus {status})"
            )))
        }
    }
}

/// Prompts Touch ID by reading the ACL-protected Keychain item.
/// The OS enforces biometric authentication before releasing the data;
/// no separate LAContext.evaluatePolicy call is needed.
/// Blocks the calling thread — must be called from `spawn_blocking`.
fn unlock_sync() -> Result<Zeroizing<[u8; 32]>, AppError> {
    unsafe {
        let dict = make_base_dict();
        CFDictionarySetValue(dict, kSecReturnData, kCFBooleanTrue);

        let prompt = cf_str(UNLOCK_REASON);
        CFDictionarySetValue(dict, kSecUseOperationPrompt, prompt);
        CFRelease(prompt);

        let mut result: CfTypeRef = std::ptr::null();
        let status = SecItemCopyMatching(dict as *const c_void, &mut result);
        CFRelease(dict as CfTypeRef);

        match status {
            ERR_SEC_SUCCESS => {}
            ERR_SEC_ITEM_NOT_FOUND => {
                return Err(AppError::Vault(
                    "biometric key not found — re-enable Touch ID in Settings".into(),
                ));
            }
            -128 => {
                // errSecUserCanceled
                return Err(AppError::Vault("Touch ID cancelled".into()));
            }
            -25293 => {
                // errSecAuthFailed
                return Err(AppError::Vault("Touch ID authentication failed".into()));
            }
            code => {
                return Err(AppError::Vault(format!(
                    "Touch ID failed (OSStatus {code})"
                )));
            }
        }

        if result.is_null() {
            return Err(AppError::Vault("biometric unlock returned empty data".into()));
        }

        let data_len = CFDataGetLength(result as CfDataRef);
        if data_len != 32 {
            CFRelease(result);
            return Err(AppError::Vault("biometric key has unexpected length".into()));
        }

        // Copy bytes before releasing the CFData buffer.
        let data_ptr = CFDataGetBytePtr(result as CfDataRef);
        let mut key = Zeroizing::new([0u8; 32]);
        std::ptr::copy_nonoverlapping(data_ptr, key.as_mut_ptr(), 32);
        CFRelease(result);

        Ok(key)
    }
}

/// Prompts Touch ID and, on success, returns the stored vault key.
pub async fn unlock() -> Result<Zeroizing<[u8; 32]>, AppError> {
    tokio::task::spawn_blocking(unlock_sync)
        .await
        .map_err(|e| AppError::Vault(e.to_string()))?
}
