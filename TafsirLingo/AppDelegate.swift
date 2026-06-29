//
//  AppDelegate.swift
//  TafsirLingo
//
//  Acts as the macOS shell's NSApplicationDelegate so we can:
//    1. Register the `tafsirlingo://` URL scheme at launch (the scheme itself
//       is declared in Info.plist via CFBundleURLTypes; this delegate listens
//       for the resulting openURLs call).
//    2. Bring the SwiftUI settings window to the front when the extension
//       sends an OPEN_SETTINGS request via the URL scheme.
//

import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Make sure the SwiftUI settings window opens at launch so the user
        // sees the configuration surface on first run.
        DispatchQueue.main.async {
            NSApp.activate(ignoringOtherApps: true)
            self.bringSettingsToFront()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme?.lowercased() == "tafsirlingo" {
            DispatchQueue.main.async {
                self.bringSettingsToFront()
            }
        }
    }

    @MainActor
    private func bringSettingsToFront() {
        // Find the SwiftUI settings window and bring it forward. The window is
        // created by the `Window` scene in TafsirLingoApp; look it up by title.
        for window in NSApp.windows {
            if window.title == "TafsirLingo Settings" || window.identifier?.rawValue.contains("settings") == true {
                window.makeKeyAndOrderFront(nil)
                return
            }
        }
        // Fallback: open any SwiftUI-managed window matching our content size.
        NSApp.activate(ignoringOtherApps: true)
    }
}