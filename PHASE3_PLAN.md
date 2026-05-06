# Phase 3: Advanced Features & Polish

**Status**: IN PROGRESS
**Objective**: Implement edit/delete modes, student rejection display, and enhance viewer with approve/reject actions

## Overview

Phase 3 focuses on the advanced features that provide file management (edit/delete) and improve the user experience for both coordinators and students viewing submission feedback.

---

## Tasks

### 1. Edit Mode - File Replacement UI

**Status**: ⏳ NOT STARTED
**File**: [ojt_students_profile.html](renderer/modules/m1_archive/coordinator/html/ojt_students_profile.html)
**Goal**: Allow coordinators to replace submitted files

**Implementation**:

- When Edit button clicked → Show file upload overlay on submitted container
- Overlay UI:
  - "Select new file..." input
  - Cancel button (exits edit mode)
  - Save button (uploads and updates submission)
- Functionality:
  - Call `selectOjtFile()` dialog
  - Upload via `uploadOjtFile()` to Cloudinary
  - Call PATCH submission endpoint with new file_url + cloudinary_public_id
  - Old Cloudinary file auto-deleted by backend
  - Toast feedback: "File replaced." + refresh requirements grid
- Error handling: Show toast on upload/save failure

**Code Locations**:

- CSS: Add `.req-edit-mode-overlay` styling
- HTML: Create edit mode UI template (optional modal or inline overlay)
- JS: Implement `toggleEditMode()` with file handling logic

---

### 2. Delete Mode - Confirmation Overlay

**Status**: ⏳ NOT STARTED
**File**: [ojt_students_profile.html](renderer/modules/m1_archive/coordinator/html/ojt_students_profile.html)
**Goal**: Allow coordinators to delete submitted files with confirmation

**Implementation**:

- When Delete button clicked → Show delete confirmation on submitted container
- Overlay UI:
  - Message: "Are you sure? This cannot be undone."
  - Red "Confirm Delete" button
  - Gray "Cancel" button
- Functionality:
  - On confirm: Call DELETE `/api/ojt-requirements/submissions/:submissionId`
  - Backend response:
    - Deletes Cloudinary file
    - Deletes DB record
    - Requirement reverts to Pending (no file)
  - Toast feedback: "Requirement deleted." + refresh grid
- Error handling: Show toast on delete failure

**Code Locations**:

- CSS: Add `.req-delete-mode-overlay` styling
- JS: Implement `toggleDeleteMode()` with API call logic

---

### 3. Student Rejection Reason Display

**Status**: ⏳ NOT STARTED
**File**: [ojt_students_profile.html](renderer/modules/m1_archive/coordinator/html/ojt_students_profile.html)
**Goal**: Show students why their submission was rejected

**Implementation**:

- When student views rejected requirement:
  - Show rejection reason in read-only field below requirement
  - UI: Gray box with text "Rejection reason:" header + reason text
  - Allow student to resubmit by clicking Upload button (existing flow)
- Where to show:
  - In rejected container → Add rejection reason display (inline or collapsible)
  - Alternative: Show in viewer modal when student opens rejected file

**Coordinator View**:

- Can see the rejection reason they entered

**Student View**:

- Can see rejection reason
- Cannot edit requirement (coordinator only)
- Can upload new version to resubmit

**Code Locations**:

- CSS: Add `.rejection-reason-box` styling
- JS: Modify `renderRequirementsGrid()` to display notes when status = "rejected"
- Need to fetch `notes` field from submission data

---

### 4. Viewer Modal Enhancements (Coordinator View)

**Status**: ⏳ NOT STARTED
**File**: [ojt_students_profile.html](renderer/modules/m1_archive/coordinator/html/ojt_students_profile.html)
**Goal**: Allow approve/reject directly from file preview

**Implementation**:

- When coordinator opens file viewer:
  - Show file preview (existing)
  - Add footer with action buttons:
    - Green "Approve" button (opens approve modal)
    - Red "Reject" button (opens reject modal)
  - Buttons trigger same modals as container approve/reject buttons
- Tracking:
  - Set `currentViewerSubmissionId` when opening file from requirement
  - `approveFromViewer()` / `rejectFromViewer()` call corresponding functions
  - Modals handle approval/rejection using tracked submission ID

**Code Locations**:

- CSS: Add `.viewer-modal-footer` with button styling
- JS: Enhance `openFile()` wrapper to track submission context
- JS: Add `approveFromViewer()` / `rejectFromViewer()` functions (stubs in Phase 2, now functional)

---

## Implementation Order

1. **Edit Mode** - Simpler logic, pure file handling
2. **Delete Mode** - Simpler confirmation logic
3. **Student Rejection Display** - Pure UI rendering (no new API calls)
4. **Viewer Modal Footer** - Enhances existing viewer, tracks submission context

---

## Testing Checklist

### Edit Mode

- [ ] Click Edit button on submitted requirement
- [ ] Select new file via dialog
- [ ] Click Save → File uploads, submission updates, grid refreshes
- [ ] Container shows old file view initially, then updated after refresh
- [ ] Cancel button closes edit mode without changes

### Delete Mode

- [ ] Click Delete button on submitted requirement
- [ ] Confirmation overlay appears
- [ ] Click "Confirm Delete" → File deleted, requirement removed
- [ ] Requirement reverts to Pending (no file)
- [ ] Cancel button closes overlay without changes

### Student Rejection Display

- [ ] Reject a requirement with reason "Missing signature"
- [ ] Student views requirement → Sees "Rejection reason: Missing signature"
- [ ] Student can upload new file to resubmit
- [ ] Reason persists until requirement approved

### Viewer Modal Footer

- [ ] Open file from requirement as coordinator
- [ ] See Approve/Reject buttons in footer
- [ ] Click Approve → Confirmation modal, then approved
- [ ] Click Reject → Reason modal, then rejected with reason
- [ ] Modal closes, grid refreshes with updated status

---

## Database/API Notes

**Fields Used**:

- `ojt_requirement_submissions.notes` — Stores rejection reason (TEXT)
- `ojt_requirement_submissions.status` — Tracks pending/submitted/verified/rejected

**Endpoints**:

- PATCH `/api/ojt-requirements/submissions/:submissionId` — Update status/file
- DELETE `/api/ojt-requirements/submissions/:submissionId` — Remove submission
- All existing, no new endpoints needed

---

## Success Criteria

✅ Edit mode replaces files without losing context
✅ Delete mode safely removes submissions
✅ Students see rejection reasons clearly
✅ Viewers can approve/reject from modal footer
✅ No syntax errors
✅ All existing functionality preserved
✅ Consistent UI/UX with Phase 2 design

---

## Estimated Effort

- Edit Mode: ~30 min (file upload logic integration)
- Delete Mode: ~15 min (simple confirmation)
- Student Display: ~20 min (conditional rendering)
- Viewer Footer: ~25 min (DOM manipulation + tracking)

**Total**: ~90 minutes

---

## Notes

- Edit/Delete modes show inline overlays, not modal dialogs (keep UX light)
- Viewer footer uses same approval/rejection modals as containers (DRY)
- Student rejection display is read-only (students can't edit requirements)
- All changes are isolated to frontend + existing backend endpoints
