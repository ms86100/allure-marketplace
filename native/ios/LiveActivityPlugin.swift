/**
 * LiveActivityPlugin.swift
 *
 * Reference Capacitor plugin bridge for iOS.
 * Copy into your Xcode App target and register in the Capacitor bridge.
 *
 * Registration (AppDelegate or Bridge config):
 *   bridge.registerPlugin(LiveActivityPlugin.self)
 */

import Capacitor
import ActivityKit
import Foundation

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveActivities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cleanupStaleActivities", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        print("✅ LiveActivityPlugin loaded — Capacitor bridge registered")
    }

    // MARK: - Start

    @objc func startLiveActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("iOS 16.2+ required for Live Activities")
            return
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities not enabled")
            return
        }

        let entityId = call.getString("entity_id") ?? ""

        // ── Dedup: check if an activity with the same entityId already exists ──
        for activity in Activity<LiveDeliveryAttributes>.activities {
            if activity.attributes.entityId == entityId {
                // Update existing activity instead of creating a duplicate
                let state = LiveDeliveryAttributes.ContentState(
                    workflowStatus: call.getString("workflow_status") ?? "",
                    etaMinutes: call.getInt("eta_minutes"),
                    driverDistance: call.getDouble("driver_distance"),
                    driverName: call.getString("driver_name"),
                    vehicleType: call.getString("vehicle_type"),
                    progressStage: call.getString("progress_stage")
                )
                Task {
                    await activity.update(.init(state: state, staleDate: nil))
                    call.resolve(["activityId": activity.id])
                }
                return
            }
        }

        let attributes = LiveDeliveryAttributes(
            entityType: call.getString("entity_type") ?? "order",
            entityId: entityId
        )

        let state = LiveDeliveryAttributes.ContentState(
            workflowStatus: call.getString("workflow_status") ?? "",
            etaMinutes: call.getInt("eta_minutes"),
            driverDistance: call.getDouble("driver_distance"),
            driverName: call.getString("driver_name"),
            vehicleType: call.getString("vehicle_type"),
            progressStage: call.getString("progress_stage")
        )

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil),
                pushType: nil
            )
            call.resolve(["activityId": activity.id])
        } catch {
            call.reject("Failed to start live activity: \(error.localizedDescription)")
        }
    }

    // MARK: - Update

    @objc func updateLiveActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("iOS 16.2+ required for Live Activities")
            return
        }

        let entityId = call.getString("entity_id") ?? ""

        let state = LiveDeliveryAttributes.ContentState(
            workflowStatus: call.getString("workflow_status") ?? "",
            etaMinutes: call.getInt("eta_minutes"),
            driverDistance: call.getDouble("driver_distance"),
            driverName: call.getString("driver_name"),
            vehicleType: call.getString("vehicle_type"),
            progressStage: call.getString("progress_stage")
        )

        Task {
            for activity in Activity<LiveDeliveryAttributes>.activities {
                if activity.attributes.entityId == entityId {
                    await activity.update(.init(state: state, staleDate: nil))
                    call.resolve()
                    return
                }
            }
            call.resolve() // no-op if not found
        }
    }

    // MARK: - End

    @objc func endLiveActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("iOS 16.2+ required for Live Activities")
            return
        }

        let activityId = call.getString("activityId") ?? ""

        Task {
            for activity in Activity<LiveDeliveryAttributes>.activities {
                if activity.id == activityId {
                    await activity.end(
                        .init(state: activity.content.state, staleDate: nil),
                        dismissalPolicy: .immediate
                    )
                    break
                }
            }
            call.resolve()
        }
    }

    // MARK: - Get Active Activities

    @objc func getActiveActivities(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["activities": []])
            return
        }

        var result: [[String: String]] = []

        for activity in Activity<LiveDeliveryAttributes>.activities {
            result.append([
                "activityId": activity.id,
                "entityId": activity.attributes.entityId,
            ])
        }

        call.resolve(["activities": result])
    }

    // MARK: - Cleanup Stale Activities

    @objc func cleanupStaleActivities(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }

        let validIds = call.getArray("validEntityIds", String.self) ?? []

        Task {
            for activity in Activity<LiveDeliveryAttributes>.activities {
                if !validIds.contains(activity.attributes.entityId) {
                    await activity.end(
                        .init(state: activity.content.state, staleDate: nil),
                        dismissalPolicy: .immediate
                    )
                }
            }
            call.resolve()
        }
    }
}
