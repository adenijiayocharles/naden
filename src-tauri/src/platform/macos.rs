// Installs a native NSEvent local monitor so window dragging via the custom
// title bar works reliably on macOS.
//
// Tauri's JS-based startDragging() and data-tauri-drag-region both ultimately
// call [NSWindow performWindowDragWithEvent:] with a *cached* NSEvent stored
// by wry's WryWebView.mouseDown:. That cached event is consumed after the
// first drag, causing all subsequent drag attempts to fail silently.
//
// NSEvent local monitors receive the *live* current event before any view
// handles it, so performWindowDragWithEvent: is always called with the fresh
// event. This runs at the Objective-C event-loop level, completely bypassing
// JavaScript and React.

use block2::RcBlock;
use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::{NSPoint, NSRect};
use std::ptr;

// TopBar height: Tailwind h-11 = 44px
const HEADER_HEIGHT: f64 = 44.0;
// Reserve the left 72px for macOS traffic-light buttons
const TRAFFIC_LIGHTS_INSET: f64 = 72.0;
// Reserve the right 100px for the sidebar/logs/settings action buttons
const BUTTONS_INSET: f64 = 100.0;
// NSEventMask bit for NSEventTypeLeftMouseDown
const NS_LEFT_MOUSE_DOWN_MASK: u64 = 1 << 1;

pub fn install_drag_region(window: &tauri::WebviewWindow) {
    // with_webview runs on the main thread and gives us platform handles.
    let _ = window.with_webview(|wv| {
        // ns_window() is the macOS-only PlatformWebview accessor that directly
        // returns the NSWindow pointer as *mut c_void.
        let ns_window = wv.ns_window() as *mut AnyObject;
        if !ns_window.is_null() {
            install_monitor(ns_window);
        }
    });
}

fn install_monitor(ns_window: *mut AnyObject) {
    // Build a heap-allocated block. The closure captures ns_window, which is a
    // raw pointer — safe to capture since the main window lives for the entire
    // app lifetime and the monitor callback always runs on the main thread.
    let block = RcBlock::new(move |event: *mut AnyObject| -> *mut AnyObject {
        if event.is_null() {
            return ptr::null_mut();
        }

        // Only intercept left-button-down events (NSEventTypeLeftMouseDown == 1).
        let event_type: u64 = unsafe { msg_send![event, type] };
        if event_type != 1 {
            return event;
        }

        // locationInWindow returns NSPoint (≡ CGPoint): origin is bottom-left.
        let location: NSPoint = unsafe { msg_send![event, locationInWindow] };

        // Get the content view's bounds to know the window's current dimensions.
        let content_view: *mut AnyObject = unsafe { msg_send![ns_window, contentView] };
        let bounds: NSRect = unsafe { msg_send![content_view, bounds] };

        // The drag zone is the top HEADER_HEIGHT pixels, excluding the
        // traffic-lights area on the left and the action-buttons area on the right.
        let in_header = location.y >= bounds.size.height - HEADER_HEIGHT;
        let in_drag_x = location.x >= TRAFFIC_LIGHTS_INSET
            && location.x <= bounds.size.width - BUTTONS_INSET;

        if in_header && in_drag_x {
            // performWindowDragWithEvent: blocks until the drag or click
            // completes, then returns. We then return nil to consume the
            // event so the webview does not also process it as a click.
            let (): () = unsafe { msg_send![ns_window, performWindowDragWithEvent: event] };
            return ptr::null_mut();
        }

        event
    });

    // Install the monitor. The returned monitor object keeps the block alive
    // via ObjC retain semantics; we never remove the monitor, so both the
    // monitor and the block live for the app's lifetime.
    unsafe {
        let ns_event_class = AnyClass::get(c"NSEvent").expect("NSEvent class not found");
        let _: *mut AnyObject = msg_send![
            ns_event_class,
            addLocalMonitorForEventsMatchingMask: NS_LEFT_MOUSE_DOWN_MASK,
            handler: &*block
        ];
    }

    // std::mem::forget prevents Rust from decrementing the block's ref-count
    // when `block` goes out of scope. The ObjC monitor already holds a retain,
    // so the block stays alive indefinitely without a double-release.
    std::mem::forget(block);
}
