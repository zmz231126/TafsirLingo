//
//  SettingsView.swift
//  TafsirLingo
//
//  Native Liquid Glass settings UI (SwiftUI). Spec:
//    - docs/02-LIQUID-GLASS-DESIGN.md §3  (true Liquid Glass, GlassEffectContainer)
//    - docs/03-UI-UX-SPEC.md §7           (layout, copy, Test Connection flow)
//    - docs/04-IMPLEMENTATION-PLAN.md §4.2 (code skeleton to anchor against)
//

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var vm: SettingsVM

    var body: some View {
        // Apple HIG "Adopting Liquid Glass":
        //   "Reduce your use of custom backgrounds in controls and navigation
        //    elements. ... Prefer to remove custom effects and let the system
        //    determine the background appearance."
        // The window background is left to macOS. Liquid Glass cards refract
        // whatever is behind them (desktop wallpaper, neighboring windows,
        // window chrome) — that is the "rich content" the glass needs.
        ScrollView {
            VStack(spacing: 20) {
                header
                if #available(macOS 26, *) {
                    GlassEffectContainer(spacing: 20) {
                        VStack(spacing: 16) {
                            aiConfigCard
                            preferenceCard
                            shortcutCard
                        }
                    }
                } else {
                    VStack(spacing: 16) {
                        aiConfigCard
                        preferenceCard
                        shortcutCard
                    }
                }
                aboutFooter
            }
            .padding(24)
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(
                    LinearGradient(colors: [.purple, .blue], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("TafsirLingo Settings").font(.title3.bold())
                Text("AI explanations for selected text")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    // MARK: Cards

    private var aiConfigCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                // Base URL row with vendor picker button
                VStack(alignment: .leading, spacing: 4) {
                    Text("Base URL").font(.caption.bold()).foregroundStyle(.secondary)
                    HStack(spacing: 6) {
                        TextField("https://api.openai.com/v1", text: $vm.baseURL)
                            .textFieldStyle(.roundedBorder)
                        Button {
                            vm.showVendorPicker = true
                        } label: {
                            Image(systemName: "square.grid.2x2")
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.borderless)
                        .help("Select a provider")
                    }
                }
                if let vid = vm.currentVendorID, vid != "custom" {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(.green)
                        Text(vendorName(for: vid))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } else if !vm.baseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("Custom endpoint")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Text("Supports any OpenAI-compatible interface.")
                    .font(.caption2).foregroundStyle(.secondary)
                    .padding(.top, -4)
                SecureFieldRevealable(title: "API Key", text: $vm.apiKey)
                Text("Stored only in your Mac's Keychain. Never uploaded.")
                    .font(.caption2).foregroundStyle(.secondary)
                LabeledField(title: "Model",
                             text: $vm.model,
                             placeholder: "gpt-4o-mini")
                HStack(spacing: 12) {
                    if #available(macOS 26, *) {
                        Button(action: vm.testConnection) {
                            Label(vm.testing ? "Testing…" : "Test Connection",
                                  systemImage: "bolt.fill")
                        }
                        .buttonStyle(.glassProminent)
                        .disabled(vm.testing)
                    } else {
                        Button(action: vm.testConnection) {
                            Label(vm.testing ? "Testing…" : "Test Connection",
                                  systemImage: "bolt.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(vm.testing)
                    }
                    if let r = vm.testResult {
                        Text(r.text).foregroundStyle(r.color).font(.caption)
                    }
                    Spacer()
                }
            }
            .onChange(of: vm.baseURL) { vm.save() }
            .onChange(of: vm.apiKey)  { vm.save() }
            .onChange(of: vm.model)   { vm.save() }
            .sheet(isPresented: $vm.showVendorPicker) {
                vendorPickerSheet
            }
        }
    }

    /// Scrollable vendor picker sheet
    private var vendorPickerSheet: some View {
        NavigationStack {
            List(Vendor.all) { vendor in
                Button {
                    vm.selectVendor(vendor)
                    vm.showVendorPicker = false
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: vendor.icon)
                            .font(.title3)
                            .foregroundStyle(.blue)
                            .frame(width: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(vendor.name)
                                .font(.body)
                                .foregroundStyle(.primary)
                            if !vendor.baseURL.isEmpty {
                                Text(vendor.baseURL)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                            if !vendor.defaultModel.isEmpty {
                                Text("Default model: \(vendor.defaultModel)")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        Spacer()
                        if vm.currentVendorID == vendor.id || (vendor.id == "custom" && vm.currentVendorID == nil) {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.blue)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Select Provider")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { vm.showVendorPicker = false }
                }
            }
        }
        .frame(minWidth: 360, minHeight: 420)
    }

    private func vendorName(for id: String) -> String {
        Vendor.all.first { $0.id == id }?.name ?? id
    }

    private var preferenceCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Explanation").font(.headline)
                Picker("Explain in",
                       selection: Binding(
                           get: { vm.targetLang },
                           set: { newValue in
                               DispatchQueue.main.async { vm.targetLang = newValue }
                           }
                       )) {
                    Text("English").tag("en")
                    Text("中文").tag("zh")
                    Text("العربية").tag("ar")
                }
                .pickerStyle(.segmented)
                .onChange(of: vm.targetLang) { vm.save() }
                Text("The language the AI uses to explain your selection.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private var shortcutCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Shortcut").font(.headline)
                HStack {
                    Text("Trigger shortcut").foregroundStyle(.secondary)
                    Spacer()
                    Text("⌘⇧E")
                        .font(.system(.body, design: .monospaced))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(.thinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                Text("Press this shortcut after selecting text on a webpage to explain it directly. Customization arrives in a later release.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private var aboutFooter: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TafsirLingo 1.0").font(.caption.bold())
            Text("Your API key never leaves this Mac. AI requests go directly to the endpoint you configure.")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 12)
    }
}

// MARK: - Building blocks

private struct GlassCard<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        if #available(macOS 26, *) {
            content()
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .glassEffect(.regular, in: .rect(cornerRadius: 20))
        } else {
            content()
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }
}

private struct LabeledField: View {
    let title: String
    @Binding var text: String
    var placeholder: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.bold()).foregroundStyle(.secondary)
            TextField(placeholder, text: $text)
                .textFieldStyle(.roundedBorder)
        }
    }
}

private struct SecureFieldRevealable: View {
    let title: String
    @Binding var text: String
    @State private var revealed = false
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.bold()).foregroundStyle(.secondary)
            HStack {
                Group {
                    if revealed {
                        TextField("sk-…", text: $text)
                    } else {
                        SecureField("sk-…", text: $text)
                    }
                }
                .textFieldStyle(.roundedBorder)
                Button {
                    revealed.toggle()
                } label: {
                    Image(systemName: revealed ? "eye.slash" : "eye")
                }
                .buttonStyle(.borderless)
                .help(revealed ? "Hide API key" : "Show API key")
            }
        }
    }
}