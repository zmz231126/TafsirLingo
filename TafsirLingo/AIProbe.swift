//
//  AIProbe.swift
//  TafsirLingo
//
//  Tiny non-streaming probe request used by "Test Connection" in Settings.
//  Spec: docs/03-UI-UX-SPEC.md §7.2
//

import Foundation

enum AIError: Error {
    case invalidURL
    case emptyKey
    case network(String)
    case http(Int, String)
    case timeout

    var userText: String {
        switch self {
        case .invalidURL: return "Invalid base URL."
        case .emptyKey:   return "API key is empty."
        case .network:    return "Network error. Check your connection."
        case .http(let code, _) where code == 401 || code == 403:
            return "Invalid API key or no permission."
        case .http(let code, _) where code == 404:
            return "Model or endpoint not found."
        case .http(let code, _) where code == 429:
            return "Rate limited. Try again shortly."
        case .http(let code, _) where code >= 500:
            return "AI service is unavailable."
        case .http:       return "Request failed."
        case .timeout:    return "Request timed out."
        }
    }
}

struct AIProbe {
    static func ping(baseURL: String, key: String, model: String) async throws {
        guard !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw AIError.emptyKey
        }
        let normalized = try Self.normalize(baseURL: baseURL)
        var req = URLRequest(url: normalized)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        let body: [String: Any] = [
            "model": model,
            "messages": [["role": "user", "content": "ping"]],
            "max_tokens": 1
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { throw AIError.network("no response") }
            guard (200..<300).contains(http.statusCode) else {
                let body = String(data: data, encoding: .utf8) ?? ""
                throw AIError.http(http.statusCode, body)
            }
        } catch let urlErr as URLError where urlErr.code == .timedOut {
            throw AIError.timeout
        } catch let urlErr as URLError {
            throw AIError.network(urlErr.localizedDescription)
        }
    }

    private static func normalize(baseURL: String) throws -> URL {
        guard var url = URLComponents(string: baseURL) else { throw AIError.invalidURL }
        if url.scheme?.lowercased() != "https" {
            let host = url.host ?? ""
            let isLoopback = host == "localhost" || host == "127.0.0.1" || host == "::1"
            if !(isLoopback && url.scheme?.lowercased() == "http") {
                throw AIError.invalidURL
            }
        }
        // Strip only TRAILING slashes; keep the leading one so hasSuffix("/v1") works.
        var path = url.path
        while path.hasSuffix("/") { path.removeLast() }
        if path.isEmpty {
            path = "/v1"
        } else if !path.hasSuffix("/v1") && !path.hasSuffix("/v1/chat/completions") {
            path = path + "/v1"
        }
        if path.hasSuffix("/chat/completions") {
            // already a full endpoint
        } else {
            path = path + "/chat/completions"
        }
        url.path = path
        guard let composed = url.url else { throw AIError.invalidURL }
        return composed
    }
}