//
//  SafariWebExtensionHandler.swift
//  TafsirLingo Extension
//
//  Phase 2: Native Messaging bridge — read API key from Keychain and return
//  the user's AI config. Also handles OPEN_SETTINGS (forwarded from popup / card)
//  by opening the host app via a custom URL scheme registered by the host.
//  Hard rule: never os_log the API key. The key crosses the bridge exactly once.
//

import AppKit
import Foundation
import SafariServices

private let kService = "top.bayanlistening.tafsirlingo.apikey"
private let kAccessGroup = "top.bayanlistening.tafsirlingo"
private let kAppGroup = "group.top.bayanlistening.tafsirlingo"
private let kSettingsURLScheme = "tafsirlingo"
private let kSettingsURLHost = "settings"

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey]
        let dict = message as? [String: Any] ?? [:]
        let type = (dict["type"] as? String) ?? ""

        let response: [String: Any]
        switch type {
        case "PING":
            response = ["ok": true]
        case "GET_CONFIG":
            response = handleGetConfig()
        case "OPEN_SETTINGS":
            response = handleOpenSettings()
        default:
            response = ["ok": false, "error": "unknown type"]
        }

        let out = NSExtensionItem()
        out.userInfo = [SFExtensionMessageKey: response]
        context.completeRequest(returningItems: [out], completionHandler: nil)
    }

    // MARK: - Handlers

    private func handleGetConfig() -> [String: Any] {
        let defaults = UserDefaults(suiteName: kAppGroup)
        let baseURL = (defaults?.string(forKey: "baseURL")) ?? ""
        let model = (defaults?.string(forKey: "model")) ?? ""
        let targetLang = (defaults?.string(forKey: "targetLang")) ?? ""
        let key = readKey(account: baseURL)
        return [
            "ok": true,
            "config": [
                "baseURL": baseURL,
                "model": model,
                "targetLang": targetLang,
                "hasKey": key != nil
            ],
            "apiKey": key ?? ""
        ]
    }

    private func handleOpenSettings() -> [String: Any] {
        // Hand the request to the host app via a custom URL scheme. The host
        // app registers `tafsirlingo://settings` and brings the settings window
        // to the front (see TafsirLingoApp.swift / AppDelegate).
        let urlString = "\(kSettingsURLScheme)://\(kSettingsURLHost)"
        if let url = URL(string: urlString) {
            DispatchQueue.main.async {
                NSWorkspace.shared.open(url)
            }
        }
        return ["ok": true]
    }

    // MARK: - Keychain

    private func readKey(account: String) -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: kService,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        if !account.isEmpty { query[kSecAttrAccount as String] = account }
        if !kAccessGroup.isEmpty { query[kSecAttrAccessGroup as String] = kAccessGroup }

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}