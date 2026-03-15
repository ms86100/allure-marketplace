/**
 * LiveDeliveryWidget.swift
 *
 * Reference implementation — copy into your Xcode Widget Extension target.
 *
 * Renders the lock-screen banner, compact Dynamic Island, and
 * expanded Dynamic Island views for Sociva live deliveries.
 */

import SwiftUI
import WidgetKit
import ActivityKit

@available(iOS 16.1, *)
struct LiveDeliveryWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveDeliveryAttributes.self) { context in
            // ── Lock Screen Banner ──────────────────────────
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(statusTitle(context.state.workflowStatus))
                        .font(.headline)
                        .foregroundColor(.white)
                    Spacer()
                    if let eta = context.state.etaMinutes {
                        Text("ETA \(eta) min")
                            .font(.subheadline)
                            .bold()
                            .foregroundColor(.orange)
                    }
                }

                if let stage = context.state.progressStage {
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
            }
            .padding()
            .background(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // ── Expanded Regions ────────────────────────
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.driverName ?? "Driver",
                          systemImage: "person.fill")
                        .font(.caption)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let eta = context.state.etaMinutes {
                        Text("\(eta) min")
                            .font(.headline)
                            .foregroundColor(.orange)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let stage = context.state.progressStage {
                        Text(stage)
                            .font(.caption2)
                    }
                }
            } compactLeading: {
                Image(systemName: "bag.fill")
                    .foregroundColor(.orange)
            } compactTrailing: {
                if let eta = context.state.etaMinutes {
                    Text("\(eta)m")
                        .font(.caption)
                        .bold()
                }
            } minimal: {
                Image(systemName: "bag.fill")
                    .foregroundColor(.orange)
            }
        }
    }

    private func statusTitle(_ status: String) -> String {
        switch status {
        case "accepted":   return "Order Accepted"
        case "preparing":  return "Preparing"
        case "picked_up":  return "Picked Up"
        case "en_route":   return "On the Way"
        case "confirmed":  return "Booking Confirmed"
        default:           return "Order Update"
        }
    }
}
