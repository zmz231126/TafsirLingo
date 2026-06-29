//
//  TafsirLingoApp.swift
//  TafsirLingo
//
//  SwiftUI @main app — hosts the Liquid Glass settings window. Lives alongside
//  AppDelegate (NSApplicationDelegateAdaptor) so the URL-scheme bridge from
//  the extension (tafsirlingo://settings) can bring the window to the front.
//

import SwiftUI

@main
struct TafsirLingoApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var settingsVM = SettingsVM()

    var body: some Scene {
        Window("TafsirLingo Settings", id: "settings") {
            SettingsView()
                .environmentObject(settingsVM)
                .frame(minWidth: 520, minHeight: 620)
        }
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }
    }
}