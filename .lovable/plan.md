

# Complete File-by-File Comparison: GitHub `dev` Branch vs Lovable Project

I scanned every directory in the GitHub repo (`ms86100/block-eats-importer`, `dev` branch) and compared it against the current Lovable project. Here is the **complete list of every missing file**.

---

## Missing Files (GitHub has, Lovable does not)

### `src/` root level
| # | File | Description |
|---|------|-------------|
| 1 | `src/PUSH_NOTIFICATION_FREEZE.md` | Documentation file for push notification freeze |
| 2 | `src/tailwind.config.lov.json` | Present locally — **no issue** |

### `src/types/`
| # | File | Description |
|---|------|-------------|
| 3 | `src/types/service.ts` | Service booking type definitions |

### `src/hooks/`
| # | File | Description |
|---|------|-------------|
| 4 | `src/hooks/useCategoryFeatureFlags.ts` | Dynamic category flags hook |
| 5 | `src/hooks/useFirstOrderCheck.ts` | First order check for trust signals |
| 6 | `src/hooks/usePushNotifications.FROZEN_BACKUP.ts` | Frozen backup of push notifications |
| 7 | `src/hooks/useServiceBookings.ts` | Service bookings hook |
| 8 | `src/hooks/useServiceSlots.ts` | Service slots hook |

### `src/hooks/queries/`
| # | File | Description |
|---|------|-------------|
| 9 | `src/hooks/queries/useCommunitySearchSuggestions.ts` | Community search suggestions query |
| 10 | `src/hooks/queries/useSellerTrustTier.ts` | Seller trust tier query |
| 11 | `src/hooks/queries/useTrendingProducts.ts` | Trending products query |

### `src/components/booking/` (3 present, 8 missing)
| # | File | Description |
|---|------|-------------|
| 12 | `src/components/booking/BookingAddonsSummary.tsx` | Addons summary in booking flow |
| 13 | `src/components/booking/BuyerBookingsCalendar.tsx` | Buyer calendar with iCal export |
| 14 | `src/components/booking/BuyerCancelBooking.tsx` | Buyer cancel booking UI |
| 15 | `src/components/booking/CalendarExportButton.tsx` | iCal export button |
| 16 | `src/components/booking/RecurringBookingSelector.tsx` | Recurring booking selector |
| 17 | `src/components/booking/RecurringBookingsList.tsx` | Recurring bookings list |
| 18 | `src/components/booking/ServiceAddonPicker.tsx` | Service addon picker |
| 19 | `src/components/booking/ServiceBookingFlow.tsx` | Main service booking flow |
| 20 | `src/components/booking/SessionFeedbackPrompt.tsx` | Session feedback prompt |

### `src/components/home/` (9 present, 5 missing)
| # | File | Description |
|---|------|-------------|
| 21 | `src/components/home/BuyAgainRow.tsx` | Buy again horizontal row |
| 22 | `src/components/home/HomeSearchSuggestions.tsx` | Search suggestions on homepage |
| 23 | `src/components/home/SocietyLeaderboard.tsx` | Society leaderboard / most ordered |
| 24 | `src/components/home/SocietyTrustStrip.tsx` | Trust strip on homepage |
| 25 | `src/components/home/TrendingInSociety.tsx` | Trending products in society |
| 26 | `src/components/home/UpcomingAppointmentBanner.tsx` | Upcoming appointment banner |

### `src/components/seller/` (21 present, 9 missing)
| # | File | Description |
|---|------|-------------|
| 27 | `src/components/seller/InlineAvailabilitySchedule.tsx` | Inline availability schedule editor |
| 28 | `src/components/seller/SellerDayAgenda.tsx` | Seller day agenda timeline |
| 29 | `src/components/seller/ServiceAddonsManager.tsx` | Service addons manager |
| 30 | `src/components/seller/ServiceAvailabilityConfig.tsx` | Service availability configuration |
| 31 | `src/components/seller/ServiceBookingStats.tsx` | Service booking stats widget |
| 32 | `src/components/seller/ServiceBookingsCalendar.tsx` | Seller bookings calendar |
| 33 | `src/components/seller/ServiceFieldsSection.tsx` | Service fields section in product form |
| 34 | `src/components/seller/ServiceStaffManager.tsx` | Service staff manager |
| 35 | `src/components/seller/SlotCalendarManager.tsx` | Slot calendar manager |

### `src/components/trust/` (2 present, 8 missing)
| # | File | Description |
|---|------|-------------|
| 36 | `src/components/trust/DeliveryReliabilityScore.tsx` | Delivery reliability score display |
| 37 | `src/components/trust/DeliveryScoreBadge.tsx` | Delivery score badge |
| 38 | `src/components/trust/FirstOrderBadge.tsx` | First order badge |
| 39 | `src/components/trust/PriceStabilityBadge.tsx` | Price stability badge |
| 40 | `src/components/trust/RefundTierBadge.tsx` | Refund tier badge |
| 41 | `src/components/trust/SellerGrowthTier.tsx` | Seller growth tier display |
| 42 | `src/components/trust/SellerRecommendButton.tsx` | Seller recommend button |
| 43 | `src/components/trust/SellerStatsCard.tsx` | Seller stats card |
| 44 | `src/components/trust/SellerTrustBadge.tsx` | Seller trust badge |

### `src/components/collective/` (directory empty locally, 1 file in GitHub)
| # | File | Description |
|---|------|-------------|
| 45 | `src/components/collective/CreateGroupBuySheet.tsx` | Create group buy sheet |

### `src/contexts/`
| # | File | Description |
|---|------|-------------|
| 46 | `src/contexts/PushNotificationContext.FROZEN_BACKUP.tsx` | Frozen backup of push notification context |

### `src/lib/`
| # | File | Description |
|---|------|-------------|
| 47 | `src/lib/__tests__/` (directory) | Store availability tests |
| 48 | `src/lib/capacitor.FROZEN_BACKUP.ts` | Frozen backup of capacitor lib |
| 49 | `src/lib/store-availability.ts` | Store availability logic |

---

## Summary

**Total missing files: 49** (including 1 test directory)

Broken down by area:
- **Service Booking UI**: 17 files (booking components, seller service components, hooks, types)
- **Trust & Discovery**: 12 files (trust badges, home components, query hooks)
- **Frozen Backups**: 3 files (push notification & capacitor backups)
- **Homepage**: 6 files (BuyAgainRow, search suggestions, leaderboard, trust strip, trending, appointment banner)
- **Seller Dashboard**: 9 files (availability, day agenda, staff, addons, slot management)
- **Other**: 2 files (store-availability lib, collective/CreateGroupBuySheet)

### Files that match (no action needed)
All pages (70 files), all other component directories (activity, admin, auth, builder, bulletin, cart, category, chat, checkout, dashboard, delivery, disputes, docs, favorite, feedback, finances, guard, haptics, landing, layout, listing, network, notifications, onboarding, order, payment, product, profile, progress, report, review, search, security, snags, subscription, ui, worker, workforce), all other hooks (40+ files), all other lib files (18 files), contexts, and types/categories.ts + types/database.ts are all present.

### Recommendation
To rebuild, I will need to read each of the 49 missing files from the GitHub repo and recreate them. This should be done in batches:
1. **Batch 1**: Types + hooks (files 3-11) — foundational, no UI dependencies
2. **Batch 2**: Trust components (files 36-44) — used by other components
3. **Batch 3**: Booking components (files 12-20) — service booking flow
4. **Batch 4**: Home components (files 21-26) — homepage sections
5. **Batch 5**: Seller components (files 27-35) — seller dashboard
6. **Batch 6**: Remaining files (45-49) — collective, backups, lib, tests

Approve this plan and I will start reading each file from GitHub and recreating them in the exact same form.

