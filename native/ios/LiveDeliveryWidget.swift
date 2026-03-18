/**
 * LiveDeliveryWidget.swift
 *
 * Blinkit-style rich Live Activity widget with status-dependent
 * colored cards and animated progress bar with 🛵 scooter.
 */

import SwiftUI
import WidgetKit
import ActivityKit

// MARK: - Reusable Progress Bar

@available(iOS 16.1, *)
struct DeliveryProgressBar: View {
    let progress: Double // 0.0–1.0
    let showScooter: Bool

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let clampedProgress = min(max(progress, 0), 1)

            ZStack(alignment: .leading) {
                // Background track
                Capsule()
                    .fill(Color.green.opacity(0.2))
                    .frame(height: 6)

                // Filled track
                Capsule()
                    .fill(Color.green)
                    .frame(width: w * clampedProgress, height: 6)
                    .animation(.easeInOut(duration: 0.5), value: clampedProgress)

                // Scooter emoji at progress point
                if showScooter {
                    Text("🛵")
                        .font(.system(size: 16))
                        .offset(x: max(0, w * clampedProgress - 10), y: -2)
                        .animation(.easeInOut(duration: 0.5), value: clampedProgress)
                }
            }
        }
        .frame(height: 20)
    }
}

// MARK: - Widget

@available(iOS 16.1, *)
@main
struct LiveDeliveryWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveDeliveryAttributes.self) { context in
            // ── Lock Screen Banner ──────────────────────────
            lockScreenView(context: context)

        } dynamicIsland: { context in
            DynamicIsland {
                // ── Expanded Regions ────────────────────────
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image("SocivaIcon")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 24, height: 24)
                            .clipShape(Circle())
                        VStack(alignment: .leading, spacing: 1) {
                            Text(context.state.sellerName ?? "Sociva")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.7))
                            Text(statusSubtitle(context.state.workflowStatus))
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundColor(.white)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let eta = context.state.etaMinutes {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("Arriving in")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.6))
                            Text("\(eta) mins")
                                .font(.headline)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                        }
                    } else {
                        Text(statusTitle(context.state.workflowStatus))
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    DeliveryProgressBar(
                        progress: context.state.progressPercent ?? 0,
                        showScooter: isDeliveryStatus(context.state.workflowStatus)
                    )
                    .padding(.horizontal, 4)
                    .padding(.top, 4)
                }
            } compactLeading: {
                Image("SocivaIcon")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)
                    .clipShape(Circle())
            } compactTrailing: {
                if let eta = context.state.etaMinutes {
                    Text("\(eta)m")
                        .font(.caption)
                        .bold()
                        .foregroundColor(.green)
                } else {
                    // Mini progress indicator
                    Circle()
                        .trim(from: 0, to: context.state.progressPercent ?? 0.1)
                        .stroke(Color.green, lineWidth: 2)
                        .frame(width: 14, height: 14)
                        .rotationEffect(.degrees(-90))
                }
            } minimal: {
                Image("SocivaIcon")
                    .resizable()
                    .scaledToFit()
                    .clipShape(Circle())
            }
        }
    }

    // MARK: - Lock Screen View (status-dependent cards)

    @ViewBuilder
    private func lockScreenView(context: ActivityViewContext<LiveDeliveryAttributes>) -> some View {
        let status = context.state.workflowStatus

        if status == "ready" {
            // ── Ready: Purple-blue gradient ──
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image("SocivaIcon")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                        .clipShape(Circle())
                    Text(context.state.sellerName ?? "Sociva")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                    Spacer()
                }

                Text("Your Order is Ready! 🎉")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(.white)

                if let stage = context.state.progressStage, !stage.isEmpty {
                    Text(stage)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                }

                DeliveryProgressBar(progress: context.state.progressPercent ?? 0.85, showScooter: false)
            }
            .padding()
            .background(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.45, green: 0.25, blue: 0.85),
                        Color(red: 0.30, green: 0.45, blue: 0.95)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )

        } else if status == "delivered" || status == "completed" {
            // ── Delivered: Green card ──
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image("SocivaIcon")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                        .clipShape(Circle())
                    Text(context.state.sellerName ?? "Sociva")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                    Spacer()
                    Text("✅")
                        .font(.title2)
                }

                Text("Order Delivered!")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(.white)

                DeliveryProgressBar(progress: 1.0, showScooter: false)
            }
            .padding()
            .background(Color.green.opacity(0.85))

        } else {
            // ── Default: Dark gray card (accepted, preparing, en_route, etc.) ──
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image("SocivaIcon")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 1) {
                        Text(context.state.sellerName ?? "Sociva")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.7))
                    }
                    Spacer()
                    if let eta = context.state.etaMinutes {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("ETA")
                                .font(.caption2)
                                .foregroundColor(.orange.opacity(0.8))
                            Text("\(eta) min")
                                .font(.headline)
                                .bold()
                                .foregroundColor(.orange)
                        }
                    }
                }

                Text(statusTitle(status))
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(.white)

                if let stage = context.state.progressStage,
                   !stage.isEmpty,
                   stage.lowercased() != status.lowercased() {
                    Text(stage)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                }

                HStack(spacing: 12) {
                    if let name = context.state.driverName {
                        Label(name, systemImage: "person.fill")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.7))
                    }
                    if let dist = context.state.driverDistance {
                        Label(String(format: "%.1f km", dist), systemImage: "location.fill")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.7))
                    }
                }

                DeliveryProgressBar(
                    progress: context.state.progressPercent ?? 0,
                    showScooter: isDeliveryStatus(status)
                )
            }
            .padding()
            .background(Color(white: 0.12))
        }
    }

    // MARK: - Helpers

    private func statusTitle(_ status: String) -> String {
        switch status {
        case "accepted":   return "Order Accepted ✓"
        case "confirmed":  return "Booking Confirmed ✓"
        case "preparing":  return "We're Preparing Your Order"
        case "picked_up":  return "Order Picked Up"
        case "en_route":   return "Order is On the Way 🛵"
        case "on_the_way": return "Order is On the Way 🛵"
        case "ready":      return "Your Order is Ready!"
        default:           return "Order Update"
        }
    }

    private func statusSubtitle(_ status: String) -> String {
        switch status {
        case "accepted", "confirmed": return "Order confirmed"
        case "preparing":  return "Preparing your order"
        case "ready":      return "Ready for pickup"
        case "picked_up":  return "Picked up"
        case "en_route", "on_the_way": return "Order is on the way"
        default:           return "Order update"
        }
    }

    private func isDeliveryStatus(_ status: String) -> Bool {
        return status == "picked_up" || status == "en_route" || status == "on_the_way"
    }
}
