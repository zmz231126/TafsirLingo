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

// MARK: - Vendor model

struct Vendor: Identifiable, Equatable {
    let id: String
    let name: String
    let baseURL: String
    let defaultModel: String
    let icon: String  // SF Symbol name

    static let all: [Vendor] = [
        Vendor(id: "custom",
               name: "Custom",
               baseURL: "",
               defaultModel: "",
               icon: "square.and.pencil"),
        Vendor(id: "openai",
               name: "OpenAI",
               baseURL: "https://api.openai.com/v1",
               defaultModel: "gpt-4o-mini",
               icon: "sparkles"),
        Vendor(id: "deepseek",
               name: "DeepSeek",
               baseURL: "https://api.deepseek.com",
               defaultModel: "deepseek-v4-flash",
               icon: "magnifyingglass"),
        Vendor(id: "gemini",
               name: "Google Gemini",
               baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
               defaultModel: "gemini-2.5-flash",
               icon: "leaf"),
        Vendor(id: "zhipu",
               name: "Zhipu AI (GLM)",
               baseURL: "https://open.bigmodel.cn/api/paas/v4",
               defaultModel: "glm-4-flash",
               icon: "brain"),
        Vendor(id: "moonshot",
               name: "Moonshot (Kimi)",
               baseURL: "https://api.moonshot.cn/v1",
               defaultModel: "kimi-k2.5",
               icon: "moon.stars"),
        Vendor(id: "qwen",
               name: "Alibaba Qwen",
               baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
               defaultModel: "qwen-turbo",
               icon: "cloud"),
        Vendor(id: "siliconflow",
               name: "SiliconFlow",
               baseURL: "https://api.siliconflow.cn/v1",
               defaultModel: "Qwen/Qwen2.5-72B-Instruct",
               icon: "drop"),
        Vendor(id: "yi",
               name: "01.AI (Yi)",
               baseURL: "https://api.01.ai/v1",
               defaultModel: "yi-large",
               icon: "number"),
        Vendor(id: "minimax",
               name: "MiniMax",
               baseURL: "https://api.minimax.io",
               defaultModel: "MiniMax-M3",
               icon: "bolt"),
    ]
}

@MainActor
final class SettingsVM: ObservableObject {

    @Published var baseURL: String = ""
    @Published var apiKey:  String = ""
    @Published var model:   String = ""

    // `targetLang` owns its own persistence: every change writes to UserDefaults
    // immediately via `didSet`, so we don't depend on the SwiftUI view layer's
    // `.onChange` (which can be unreliable for segmented Picker bindings under
    // DispatchQueue.main.async-wrapped setters).
    @Published var targetLang: String = SettingsVM.detectSystemLanguage() {
        didSet {
            guard oldValue != targetLang else { return }
            guard !_suppressTargetLangSave else { return }
            UserDefaults(suiteName: appGroup)?.set(targetLang, forKey: "targetLang")
            lastSavedAt = Date()
        }
    }

    private static func detectSystemLanguage() -> String {
        if let code = Locale.current.language.languageCode?.identifier {
            return code
        }
        return "en"
    }
    @Published var testing = false
    @Published var testResult: TestResult? = nil
    var lastSavedAt: Date? = nil
    @Published var showVendorPicker = false

    /// Set to `true` while `load()` is running so the `didSet` writer does not
    /// re-persist the value we just read from UserDefaults.
    private var _suppressTargetLangSave = false

    /// The currently selected vendor ID (derived from baseURL, nil if custom).
    var currentVendorID: String? {
        let trimmed = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        return Vendor.all.first { $0.baseURL == trimmed }?.id
    }

    let appGroup = "group.top.bayanlistening.tafsirlingo"

    init() {
        _suppressTargetLangSave = true
        load()
        _suppressTargetLangSave = false
    }

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

    /// Selects a vendor and updates base URL + model.
    func selectVendor(_ vendor: Vendor) {
        guard vendor.id != "custom" else { return }
        baseURL = vendor.baseURL
        model = vendor.defaultModel
        save()
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