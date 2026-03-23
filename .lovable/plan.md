

## Plan: Expose Workflow Flags in Admin Workflow Editor

### Problem
The recent workflow-driven refactor added three critical flags to `category_status_flows`:
- **`is_transit`** — drives delivery UI (maps, tracking, OTP card visibility)
- **`requires_otp`** — drives OTP generation and verification
- **`is_success`** — marks successful terminal states

These flags are actively used by the backend and frontend, but the admin workflow editor has **no UI to view or edit them**. An admin cannot verify or configure workflow behavior without direct database access.

### Changes

**1. Update `FlowStep` type in `src/components/admin/workflow/types.ts`**
- Add `is_transit`, `requires_otp`, `is_success` boolean fields to the `FlowStep` interface

**2. Update the workflow step editor UI (wherever steps are edited — likely inline in the admin workflow tab)**
- Add toggle switches or checkboxes for the three flags on each step's edit row
- Group them visually: "Behavior Flags" section with:
  - 🚚 **Transit step** (`is_transit`) — "Enables delivery tracking & map UI"
  - 🔐 **Requires OTP** (`requires_otp`) — "OTP verification needed at this step"
  - ✅ **Success state** (`is_success`) — "Marks order as successfully completed"

**3. Update the flow diagram (`WorkflowFlowDiagram.tsx`)**
- Show small indicator icons on step nodes for active flags (e.g., a truck icon for transit, lock for OTP)
- This gives instant visual verification without opening each step

**4. Update the step pipeline in `CategoryWorkflowPreview.tsx`**
- Show flag badges on steps so admins can verify linked workflow behavior at a glance

**5. Ensure save/load includes the new fields**
- Verify the admin workflow save function reads and writes `is_transit`, `requires_otp`, `is_success` to/from the DB

### Files Modified
| File | Change |
|---|---|
| `src/components/admin/workflow/types.ts` | Add 3 boolean fields to `FlowStep` |
| Admin step editor component | Add toggle controls for the 3 flags |
| `src/components/admin/workflow/WorkflowFlowDiagram.tsx` | Show flag icons on step nodes |
| `src/components/admin/CategoryWorkflowPreview.tsx` | Show flag badges in preview |
| Admin workflow save/load logic | Include new fields in DB operations |

