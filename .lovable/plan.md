

# Add Missing Platform Features and Wire Feature Gates

## Overview
Currently 18 features exist in `platform_features`. Several sellable modules are missing from the feature catalog and some pages lack `FeatureGate` wrappers. This plan adds ~8 new platform features to the database, updates the TypeScript `FeatureKey` type, adds `FeatureGate` to ungated pages, and updates the Feature Showcase icon map.

## What Gets Added as Platform Features

| Feature Key | Display Name | Description | Icon |
|---|---|---|---|
| `society_notices` | Society Notices | Official announcements and pinned notices | Megaphone |
| `delivery_management` | Delivery Management | End-to-end delivery partner and tracking system | Truck |
| `worker_attendance` | Worker Attendance | Daily attendance tracking for domestic workers | ClipboardCheck |
| `worker_salary` | Worker Salary | Salary payment tracking and history | IndianRupee |
| `worker_leave` | Worker Leave | Leave request and approval management | CalendarOff |
| `security_audit` | Security Audit | Gate entry audit logs and analytics | Shield |
| `seller_tools` | Seller Tools | Store management, products, earnings, and analytics | Store |
| `gate_entry` | Gate Entry | QR-based resident gate entry system | QrCode |

## What Does NOT Get Added (stays as core platform)
- Home, Auth, Profile, Search, Cart, Orders, Categories -- core commerce, always available
- Admin Panel, Builder Portal -- role-gated, not feature-gated
- Help, Privacy, Terms, Community Rules, Pricing, Landing -- public/static pages
- Notifications -- core platform infrastructure

## Technical Changes

### 1. Database Migration
Insert 8 new rows into `platform_features` with appropriate `display_name`, `description`, `icon_name`, and `society_configurable = true`.

### 2. Update `FeatureKey` Type
Add the 8 new keys to the `FeatureKey` union type in `src/hooks/useEffectiveFeatures.ts`:
- `society_notices`
- `delivery_management`
- `worker_attendance`
- `worker_salary`
- `worker_leave`
- `security_audit`
- `seller_tools`
- `gate_entry`

### 3. Add FeatureGate to Ungated Pages
Wrap content with `<FeatureGate feature="...">` on these pages:
- `SocietyNoticesPage.tsx` -- feature: `society_notices` (already imports FeatureGate but doesn't use it)
- `SocietyDeliveriesPage.tsx` -- feature: `delivery_management`
- `DeliveryPartnerManagementPage.tsx` -- feature: `delivery_management`
- `DeliveryPartnerDashboardPage.tsx` -- feature: `delivery_management`
- `WorkerAttendancePage.tsx` -- feature: `worker_attendance`
- `WorkerSalaryPage.tsx` -- feature: `worker_salary`
- `WorkerLeavePage.tsx` -- feature: `worker_leave`
- `SecurityAuditPage.tsx` -- feature: `security_audit`
- `GateEntryPage.tsx` -- feature: `gate_entry`
- `SecurityVerifyPage.tsx` -- feature: `gate_entry`

### 4. Update Feature Showcase Icon Map
Add new icons to `src/lib/feature-showcase-data.ts`:
- `Megaphone`, `Truck`, `CalendarOff`, `Store`, `QrCode`

### 5. Update Feature Packages (Optional data insert)
Add the new features to existing packages:
- **Basic**: `society_notices`, `gate_entry`, `worker_attendance`
- **Pro**: All Basic + `delivery_management`, `worker_salary`, `worker_leave`, `security_audit`
- **Enterprise**: All features including `seller_tools`

## What This Enables
- Society admins can toggle these modules on/off from their admin panel
- Builders can see and manage these features in their package view
- Platform admin can bundle these into packages for monetization
- All new features show up in the Feature Showcase with descriptions and "Try it" links

