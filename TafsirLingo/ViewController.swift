//
//  ViewController.swift
//  TafsirLingo
//
//  The original WKWebView homepage is intentionally left out of Phase 4+.
//  SwiftUI's Window scene in TafsirLingoApp hosts the Liquid Glass settings UI
//  directly. This file is kept as a placeholder so existing project references
//  remain valid; no scene instantiates it because the app no longer uses
//  a main storyboard (INFOPLIST_KEY_NSMainStoryboardFile was removed).
//

import Cocoa

// MARK: - Retained for future "How to enable the Safari extension" guide page
//
// If you want to re-enable a WKWebView landing page, add
// `INFOPLIST_KEY_NSMainStoryboardFile = Main` to both build configurations
// and rebuild Main.storyboard. The original class looked up the extension
// state via SFSafariExtensionManager.getStateOfSafariExtension and called
// SFSafariApplication.showPreferencesForExtension when requested from JS.

enum ExtensionSupport {
    static let bundleIdentifier = "top.bayanlistening.tafsirlingo.Extension"
}