//
//  SettingsVM.swift
//  TafsirLingo
//
//  View model for the SwiftUI Liquid Glass settings window.
//  Owns non-sensitive config in App Group UserDefaults; the API key lives in
//  Keychain (so the extension can read it via Native Messaging).
//

import SwiftUI
import Combine

@MainActor
final class SettingsVM: ObservableObject {

    @Published var baseURL: String = ""
    @Published var apiKey:  String = ""
    @Published var model:   String = ""
    @Published var targetLang: String = SettingsVM.detectSystemLanguage()

    private static func detectSystemLanguage() -> String {
        if let code = Locale.current.language.languageCode?.identifier {
            return code
        }
        return "en"
    }
    @Published var testing = false
    @Published var testResult: TestResult? = nil
    @Published var lastSavedAt: Date? = nil

    let appGroup = "group.top.bayanlistening.tafsirlingo"

    init() { load() }

    func load() {
        let d = UserDefaults(suiteName: appGroup)
        baseURL    = d?.string(forKey: "baseURL")    ?? "https://api.openai.com/v1"
        model      = d?.string(forKey: "model")      ?? "gpt-4o-mini"
        let saved  = d?.string(forKey: "targetLang") ?? ""
        targetLang = saved.isEmpty ? Self.detectSystemLanguage() : saved
        apiKey     = Keychain.read(account: baseURL) ?? ""
        testResult = nil
    }

    func save() {
        let d = UserDefaults(suiteName: appGroup)
        d?.set(baseURL.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "baseURL")
        d?.set(model.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "model")
        d?.set(targetLang, forKey: "targetLang")
        if !apiKey.isEmpty {
            Keychain.write(apiKey, account: baseURL.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        lastSavedAt = Date()
    }

    func testConnection() {
        testing = true
        testResult = nil
        let url = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let m   = model.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            defer { self.testing = false }
            do {
                try await AIProbe.ping(baseURL: url, key: key, model: m)
                self.testResult = TestResult(text: "Connection successful", color: .green)
            } catch let e as AIError {
                self.testResult = TestResult(text: e.userText, color: .red)
            } catch {
                self.testResult = TestResult(text: "Something went wrong.", color: .red)
            }
        }
    }

    struct TestResult: Equatable {
        let text: String
        let color: Color
    }
}