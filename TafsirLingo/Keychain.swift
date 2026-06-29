//
//  Keychain.swift
//  TafsirLingo
//
//  Keychain wrapper for the API key. Convention from docs/01-ARCHITECTURE.md §4:
//    - kSecClass = kSecClassGenericPassword
//    - kSecAttrService = "top.bayanlistening.tafsirlingo.apikey"
//    - kSecAttrAccount = baseURL (one entry per endpoint)
//    - kSecAttrAccessGroup = "top.bayanlistening.tafsirlingo" (shared with extension)
//    - kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlock
//

import Foundation
import Security

enum Keychain {
    static let service = "top.bayanlistening.tafsirlingo.apikey"
    static let accessGroup = "top.bayanlistening.tafsirlingo"

    @discardableResult
    static func write(_ value: String, account: String) -> Bool {
        guard !account.isEmpty else { return false }
        delete(account: account)
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
            kSecValueData as String: Data(value.utf8)
        ]
        if !accessGroup.isEmpty {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    static func read(account: String) -> String? {
        guard !account.isEmpty else { return nil }
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        if !account.isEmpty { query[kSecAttrAccount as String] = account }
        if !accessGroup.isEmpty { query[kSecAttrAccessGroup as String] = accessGroup }
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func delete(account: String) -> Bool {
        guard !account.isEmpty else { return false }
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        if !accessGroup.isEmpty {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}