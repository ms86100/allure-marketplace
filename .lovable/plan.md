

# Research: Service Booking Workflow — Industry Best Practices

## What the Research Shows

I studied appointment/booking systems across healthcare (OnSched, Practo, Zocdoc), salon/beauty (Fresha, Salon Booking System), home services (Urban Company, Housejoy), and education (tutoring platforms). Here's what I found:

### Industry-Standard Appointment Flows by Category

```text
┌─────────────────────────────────────────────────────────────────┐
│  TYPE A: Venue-Based (Doctor, Salon, Tutor, Events)            │
│  ───────────────────────────────────────────────────            │
│  Confirmed → In Progress → Completed                           │
│                                                                 │
│  Only 3 steps. The customer goes TO the provider.               │
│  No "on the way" or "arrived" — irrelevant.                     │
│  OnSched uses: Booked → Checked-In → Completed                 │
│  Practo uses:  Confirmed → In Consultation → Done              │
│  Fresha uses:  Confirmed → Started → Completed                 │
├─────────────────────────────────────────────────────────────────┤
│  TYPE B: Home Visit (Plumber, Electrician, Maid, Pet Grooming) │
│  ──────────────────────────────────────────────────────────     │
│  Confirmed → On the Way → Arrived → In Progress → Completed   │
│                                                                 │
│  5 steps. The provider TRAVELS to the customer.                 │
│  "On the Way" and "Arrived" ARE relevant here — they give       │
│  the customer real-time visibility of the service provider.     │
│  Urban Company uses exactly this flow.                          │
├─────────────────────────────────────────────────────────────────┤
│  SIDE ACTIONS (not linear steps):                               │
│  • Reschedule — action available on Confirmed state             │
│  • Cancel — action available until In Progress                  │
│  • No-Show — seller marks if buyer doesn't appear               │
└─────────────────────────────────────────────────────────────────┘
```

### Key Insight: Your Platform Already Has Both Types

Your `category_status_flows` table already differentiates by `parent_group`:

| Parent Group | Current Active Steps | Correct? |
|---|---|---|
| `education_learning` | Confirmed → In Progress → Completed | **Yes — perfect** |
| `events` | Confirmed → In Progress → Completed | **Yes — perfect** |
| `home_services` | Confirmed → On the Way → Arrived → In Progress → Completed | **Yes — correct for home visits** |
| `domestic_help` | Confirmed → On the Way → Arrived → In Progress → Completed | **Yes — correct** |
| `personal_care` | Confirmed → On the Way → Arrived → In Progress → Completed | **Depends** — salon visit needs only 3 steps, home beauty needs 5 |
| `professional` | Confirmed → On the Way → Arrived → In Progress → Completed | **Partially wrong** — online consultations don't need travel steps |
| `pets` | Confirmed → On the Way → Arrived → In Progress → Completed | **Depends** — vet visit vs. home grooming |
| `default` | Confirmed → Completed (only 2 active) | **Too minimal** — missing In Progress |

### Your Specific Concern is Valid

For **appointment-style bookings** (doctor, tutor, salon visit, music class), the steps "On the Way" and "Arrived" make no sense. Those are **delivery/home-visit concepts** being applied to venue-based appointments.

## Recommended Changes

### Database: Fix the `default` and venue-based parent_groups

1. **`default` parent_group** — activate `in_progress` (currently deprecated). The default flow should be the simple 3-step: **Confirmed → In Progress → Completed**

2. **`education_learning` and `events`** — already correct, no changes needed

3. **`professional`** — deprecate `on_the_way` and `arrived` (most professional services are at-venue or online)

4. **`personal_care`** — this is tricky. A salon visit doesn't need travel steps, but a home beauty service does. For now, deprecate `on_the_way` and `arrived` since most personal care in a society context is at-venue. Home visit variants can use the `home_services` parent_group instead.

5. **`pets`** — deprecate `on_the_way` and `arrived` (vet visits are at-venue; home grooming should use `home_services`)

6. **Keep `home_services` and `domestic_help` as-is** — the 5-step flow with travel tracking is correct for these.

### Summary of Changes

```text
Parent Group         Before (active)                              After (active)
─────────────────────────────────────────────────────────────────────────────────
default              Confirmed → Completed                        Confirmed → In Progress → Completed
education_learning   Confirmed → In Progress → Completed          (no change)
events               Confirmed → In Progress → Completed          (no change)
professional         Confirmed → OTW → Arrived → IP → Completed  Confirmed → In Progress → Completed
personal_care        Confirmed → OTW → Arrived → IP → Completed  Confirmed → In Progress → Completed
pets                 Confirmed → OTW → Arrived → IP → Completed  Confirmed → In Progress → Completed
home_services        Confirmed → OTW → Arrived → IP → Completed  (no change — travel is correct)
domestic_help        Confirmed → OTW → Arrived → IP → Completed  (no change — travel is correct)
```

### Files to Change

**1. Database migration** — Two SQL statements:
- Deprecate `on_the_way` and `arrived` for `professional`, `personal_care`, `pets` parent_groups
- Un-deprecate `in_progress` for `default` parent_group

**2. No frontend changes needed** — The UI already filters out `is_deprecated = true` steps, so the stepper will automatically show fewer steps.

