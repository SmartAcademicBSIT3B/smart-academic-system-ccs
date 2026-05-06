# Phase 4: Testing & Validation Guide

**Date**: May 6, 2026
**Status**: READY FOR TESTING
**Objective**: Validate all Phase 1-3 implementations through comprehensive E2E testing

---

## Test Categories

### A. BACKEND ENDPOINT TESTING

#### A1: PATCH /api/ojt-requirements/submissions/:submissionId (Approval/Rejection)

**Test Case A1.1**: Approve a submitted requirement

- **Setup**: Create requirement submission with status = "submitted"
- **Action**: PATCH with `{ status: "verified" }`
- **Expected**:
  - Response: `{ success: true, data: {...} }`
  - DB: `ojt_requirement_submissions.status` = "verified"
  - Student status auto-promoted to "Pre-Deployment" if all required pre-reqs verified
- **Validate**: ✓ Container turns green, check icon appears

**Test Case A1.2**: Reject a submitted requirement with reason

- **Setup**: Create requirement submission with status = "submitted"
- **Action**: PATCH with `{ status: "rejected", notes: "Missing signature" }`
- **Expected**:
  - Response: `{ success: true, data: {...} }`
  - DB: `ojt_requirement_submissions.status` = "rejected"
  - DB: `ojt_requirement_submissions.notes` = "Missing signature"
  - No auto-status-demotion (first rejection, not reverting an approval)
- **Validate**: ✓ Container turns red, X icon appears, reason displays below

**Test Case A1.3**: Reject an approved requirement (status reversal)

- **Setup**: Create requirement with status = "verified"
- **Action**: PATCH with `{ status: "rejected", notes: "Quality issue" }`
- **Expected**:
  - Response: `{ success: true, data: {...} }`
  - DB: `ojt_requirement_submissions.status` = "rejected"
  - DB: `ojt_requirement_submissions.notes` = "Quality issue"
  - **KEY**: Student status auto-reverted to "Pending Requirements" (if was "Pre-Deployment")
  - Backend detects `isRejectingVerified` and calls `demoteStudentStatus()`
- **Validate**: ✓ Student status pill updates, reason displays

**Test Case A1.4**: Approve after rejection (resubmit accepted)

- **Setup**: Requirement with status = "rejected" + notes
- **Action**: PATCH with `{ status: "verified" }`
- **Expected**:
  - Response: `{ success: true }`
  - DB: status = "verified", notes still there (preserved for reference)
  - Student status auto-promoted to "Pre-Deployment"
- **Validate**: ✓ Container turns green, reason box hidden (only shows on rejected)

#### A2: GET /api/ojt-requirements/submissions/:submissionId (Submission Details)

**Test Case A2.1**: Fetch submitted requirement with rejection reason

- **Setup**: Requirement with status = "rejected", notes = "Missing signature"
- **Action**: GET /api/ojt-requirements/submissions/:submissionId
- **Expected**: Response includes `{ status: "rejected", notes: "Missing signature", ... }`
- **Validate**: ✓ Student can view rejection reason

**Test Case A2.2**: Fetch verified requirement (no rejection reason)

- **Setup**: Requirement with status = "verified", notes = null
- **Action**: GET /api/ojt-requirements/submissions/:submissionId
- **Expected**: Response includes `{ status: "verified", notes: null, ... }`
- **Validate**: ✓ No rejection box displayed

#### A3: DELETE /api/ojt-requirements/submissions/:submissionId (Deletion)

**Test Case A3.1**: Delete submitted requirement

- **Setup**: Requirement with status = "submitted"
- **Action**: DELETE /api/ojt-requirements/submissions/:submissionId
- **Expected**:
  - Response: `{ success: true }`
  - DB: Record deleted
  - Cloudinary: File deleted
  - Requirement reverts to "Pending" (no submission)
- **Validate**: ✓ Container disappears from grid, requirement shows Upload button

#### A4: GET /api/ojt-coordinator/capstone-approval/:studentId (Capstone Check)

**Test Case A4.1**: Check capstone approval when student has approved capstone

- **Setup**: Student with `archive_ojt_links` → `archives.status = "Approved"`
- **Action**: GET /api/ojt-coordinator/capstone-approval/:studentId
- **Expected**: Response: `{ success: true, hasCapstone: true, isApproved: true, capstone: {...} }`
- **Validate**: ✓ Deploy button enabled (capstone check passes)

**Test Case A4.2**: Check capstone approval when capstone not approved

- **Setup**: Student with `archive_ojt_links` → `archives.status = "Pending"` (not "Approved")
- **Action**: GET /api/ojt-coordinator/capstone-approval/:studentId
- **Expected**: Response: `{ success: true, hasCapstone: true, isApproved: false }`
- **Validate**: ✓ Deploy button disabled with reason

**Test Case A4.3**: Check capstone approval when no capstone linked

- **Setup**: Student with no `archive_ojt_links` entry
- **Action**: GET /api/ojt-coordinator/capstone-approval/:studentId
- **Expected**: Response: `{ success: true, hasCapstone: false, isApproved: false }`
- **Validate**: ✓ Deploy button disabled

---

### B. FRONTEND UI/UX TESTING

#### B1: Color-Coded Requirement Containers

**Test Case B1.1**: Pending requirement displays gray container

- **Setup**: Requirement with no submission
- **Expected**: Container is gray, eye icon visible (pending)
- **Validate**: ✓

**Test Case B1.2**: Approved requirement displays green container

- **Setup**: Requirement with status = "verified"
- **Expected**: Container is green, check icon visible
- **Validate**: ✓

**Test Case B1.3**: Rejected requirement displays red container

- **Setup**: Requirement with status = "rejected"
- **Expected**: Container is red, X icon visible, rejection reason below
- **Validate**: ✓

#### B2: Approve/Reject Modal Workflows

**Test Case B2.1**: Approve from container button

- **Setup**: Submitted requirement with approve button visible
- **Action**: Click green checkmark button
- **Expected**:
  - Modal appears: "Approve Requirement?"
  - Click "Approve" → Container updates to green
  - Click "Cancel" → Modal closes, no change
- **Validate**: ✓ Container turns green after approval

**Test Case B2.2**: Reject from container button with required reason

- **Setup**: Submitted requirement with reject button visible
- **Action**: Click red X button
- **Expected**:
  - Modal appears with textarea: "Please provide a reason..."
  - Try to click Reject without reason → Toast: "Please provide a rejection reason."
  - Enter reason, click Reject → Container turns red, reason displays below
- **Validate**: ✓ Reason validation works, reason displays

**Test Case B2.3**: Approve from viewer modal

- **Setup**: Open file from submitted requirement
- **Action**: Footer shows Approve/Reject buttons
- **Action**: Click Approve
- **Expected**:
  - Viewer closes
  - Approval modal opens
  - Click Approve → Grid refreshes, container green
- **Validate**: ✓ Context properly tracked, correct requirement updated

**Test Case B2.4**: Reject from viewer modal

- **Setup**: Open file from submitted requirement
- **Action**: Click Reject in footer
- **Expected**:
  - Viewer closes
  - Rejection modal opens with reason field
  - Enter reason and click Reject → Grid refreshes, container red with reason
- **Validate**: ✓ Rejection reason displays below container

#### B3: Edit Mode Testing

**Test Case B3.1**: Edit mode overlay appears

- **Setup**: Submitted requirement
- **Action**: Click "Edit" button
- **Expected**:
  - Edit overlay appears below Edit/Delete buttons
  - File input field visible: "Click to select new file..."
  - Save and Cancel buttons visible
  - Edit button shows "active" state
- **Validate**: ✓

**Test Case B3.2**: Select and save new file

- **Setup**: Edit overlay open
- **Action**: Click file input → Select new file → Click Save
- **Expected**:
  - Toast: "Uploading new file…"
  - File uploads to Cloudinary
  - Old file deleted from Cloudinary
  - Submission updated with new file_url and cloudinary_public_id
  - Grid refreshes, same container visible with new file
  - Toast: "File replaced successfully."
- **Validate**: ✓ File actually replaced (can open and verify new content)

**Test Case B3.3**: Cancel edit mode

- **Setup**: Edit overlay open with file selected
- **Action**: Click "Cancel"
- **Expected**:
  - Edit overlay closes
  - No file upload occurs
  - Grid unchanged
- **Validate**: ✓

**Test Case B3.4**: Only one edit/delete mode active

- **Setup**: Edit mode open
- **Action**: Click "Delete" button
- **Expected**:
  - Edit overlay closes automatically
  - Delete confirmation overlay appears
- **Validate**: ✓ Proper cleanup between modes

#### B4: Delete Mode Testing

**Test Case B4.1**: Delete confirmation overlay

- **Setup**: Submitted requirement
- **Action**: Click "Delete" button
- **Expected**:
  - Delete confirmation overlay appears
  - Message: "Delete this submission?"
  - Delete and Cancel buttons visible
  - Delete button shows "active" state
- **Validate**: ✓

**Test Case B4.2**: Confirm deletion

- **Setup**: Delete overlay open
- **Action**: Click "Delete"
- **Expected**:
  - Toast: "Deleting…"
  - Submission deleted from DB
  - Cloudinary file deleted
  - Requirement reverts to Pending (shows Upload button)
  - Grid refreshes
  - Toast: "Requirement deleted."
- **Validate**: ✓ File actually deleted from Cloudinary

**Test Case B4.3**: Cancel deletion

- **Setup**: Delete overlay open
- **Action**: Click "Cancel"
- **Expected**:
  - Delete overlay closes
  - No deletion occurs
  - Grid unchanged
- **Validate**: ✓

#### B5: Rejection Reason Display

**Test Case B5.1**: Rejection reason displays for rejected requirement

- **Setup**: Requirement with status = "rejected", notes = "Missing signature"
- **Expected**:
  - Below Edit/Delete buttons, see rejection reason box
  - Red left border
  - "Rejection Reason:" label in red
  - Reason text displayed: "Missing signature"
- **Validate**: ✓

**Test Case B5.2**: Rejection reason hidden for approved requirement

- **Setup**: Requirement with status = "verified"
- **Expected**:
  - No rejection reason box visible
- **Validate**: ✓

**Test Case B5.3**: Long rejection reason wraps properly

- **Setup**: Requirement with long multi-line rejection reason
- **Expected**:
  - Text wraps without horizontal scroll
  - Line breaks preserved if entered with newlines
- **Validate**: ✓

#### B6: Viewer Modal Footer

**Test Case B6.1**: Footer shows when opening from requirement

- **Setup**: Submitted requirement
- **Action**: Click eye icon or container to open file
- **Expected**:
  - File viewer opens
  - Footer appears at bottom with: "Close", "Approve", "Reject" buttons
- **Validate**: ✓

**Test Case B6.2**: Footer hidden when closing viewer

- **Setup**: Viewer open with footer visible
- **Action**: Click "Close" button (or close button in header)
- **Expected**:
  - Viewer closes
  - Footer hidden
  - Context variables cleared
- **Validate**: ✓

**Test Case B6.3**: Approve from viewer correctly updates requirement

- **Setup**: Viewer open, see Approve button
- **Action**: Click Approve → Approve modal → Click Approve
- **Expected**:
  - Viewer closes
  - Requirement grid shows green container for that specific requirement
  - No other requirements affected
- **Validate**: ✓

---

### C. DEPLOYMENT VALIDATION TESTING

#### C1: Deploy Button State Management

**Test Case C1.1**: Deploy disabled when pre-req not approved

- **Setup**: Pre-requirement grid with 1 required unapproved + 1 optional approved
- **Expected**: Deploy button disabled
- **Validate**: ✓

**Test Case C1.2**: Deploy enabled when all required pre-reqs approved

- **Setup**: All required pre-requirements status = "verified"
- **Expected**: Deploy button still disabled (capstone not approved)
- **Validate**: ✓

**Test Case C1.3**: Deploy enabled when all pre-reqs + capstone approved

- **Setup**: All required pre-reqs = "verified" AND capstone.status = "Approved"
- **Action**: Click Deploy
- **Expected**:
  - Confirmation modal: "Deploy student?"
  - Click Deploy → Student status changes to "Deployed"
  - Toast: "Student deployed."
- **Validate**: ✓

**Test Case C1.4**: Deploy blocked when capstone not approved

- **Setup**: All pre-reqs approved, but capstone.status != "Approved"
- **Action**: Try to click Deploy
- **Expected**: Deploy button disabled OR click shows: "Cannot deploy: Capstone must be approved first."
- **Validate**: ✓

#### C2: Status Transitions

**Test Case C2.1**: Auto-promote to "Pre-Deployment" when all required pre-reqs verified

- **Setup**: Student status = "Pending Requirements" with 2 required pre-reqs
- **Action**: Approve 1st pre-req → Approve 2nd pre-req
- **Expected**: Student status automatically changes to "Pre-Deployment"
- **Validate**: ✓ Status pill updates

**Test Case C2.2**: Auto-demote to "Pending Requirements" when rejecting verified pre-req

- **Setup**: Student status = "Pre-Deployment" (all pre-reqs verified)
- **Action**: Reject one of the pre-reqs that was previously verified
- **Expected**:
  - Student status reverts to "Pending Requirements"
  - Deploy button disables
  - Rejection reason displays on rejected pre-req
- **Validate**: ✓

**Test Case C2.3**: Status remains "Pre-Deployment" when rejecting already-rejected pre-req

- **Setup**: Student status = "Pre-Deployment", one pre-req already rejected
- **Action**: Reject the same pre-req again (with new reason)
- **Expected**: Status stays "Pre-Deployment" (no further demotion)
- **Validate**: ✓

---

### D. EDGE CASE & ERROR HANDLING TESTING

#### D1: Network & API Errors

**Test Case D1.1**: Network error during file upload

- **Setup**: Edit mode with file selected
- **Action**: Kill backend server → Click Save
- **Expected**: Toast: "Failed to save submission." or network error message
- **Validate**: ✓ Error handled gracefully

**Test Case D1.2**: Rejection reason field validation

- **Setup**: Reject modal open
- **Action**: Leave reason empty → Click Reject
- **Expected**: Toast: "Please provide a rejection reason." + Modal stays open
- **Validate**: ✓

**Test Case D1.3**: File size validation (if applicable)

- **Setup**: Edit mode with large file (>50MB if limited)
- **Action**: Click Save
- **Expected**: Toast: "File too large" or upload error
- **Validate**: ✓ If size limits exist

#### D2: UI State Consistency

**Test Case D2.1**: Grid refreshes accurately after each action

- **Setup**: Perform approve → Delete → Edit → Reject sequence
- **Expected**: Grid always reflects current state (no stale data)
- **Validate**: ✓

**Test Case D2.2**: Multiple requirement cards maintain independent states

- **Setup**: Multiple requirements with different statuses
- **Action**: Edit one → Approve another → Reject third
- **Expected**: Each updates independently without affecting others
- **Validate**: ✓

**Test Case D2.3**: Modal state after viewer approval

- **Setup**: Open viewer → Approve from footer
- **Expected**:
  - Viewer closes
  - Approval modal opens
  - Modal properly initialized (not stale from previous use)
- **Validate**: ✓

---

### E. CROSS-USER TESTING (Multi-Coordinator Scenario)

**Test Case E1**: Concurrent approvals don't conflict

- **Setup**: 2 coordinators, each approving different requirements of same student
- **Expected**: Both approvals succeed, grid shows both as approved
- **Validate**: ✓

**Test Case E2**: One coordinator rejects while another reviews

- **Setup**: Coordinator 1 rejects requirement, Coordinator 2 has viewer open
- **Expected**: Coordinator 2's grid updates, viewer still shows file
- **Validate**: ✓

---

### F. VISUAL/UX CONSISTENCY TESTING

**Test Case F1**: Button styling consistency

- **Validate**: ✓ All approve buttons are green, reject buttons are red, cancel buttons are gray

**Test Case F2**: Icon display in containers

- **Validate**: ✓ Eye icons appear for pending, checks for approved, X for rejected

**Test Case F3**: Overlay UI clarity

- **Validate**: ✓ Edit/delete overlays clearly differentiated with color and labeling

**Test Case F4**: Rejection reason box readability

- **Validate**: ✓ Box visually distinct, reason text readable, no layout breaks

**Test Case F5**: Responsive design on different screen sizes

- **Validate**: ✓ Test on 1920x1080, 1366x768, tablet-like 800x600 (if applicable)

---

## Testing Checklist

### Phase 4 Pre-Launch

- [ ] All backend endpoint tests (A1-A4) pass
- [ ] All UI/UX tests (B1-B6) pass
- [ ] All deployment validation tests (C1-C2) pass
- [ ] All edge case tests (D1-D2) pass
- [ ] Cross-user scenario tests (E1-E2) pass
- [ ] Visual consistency tests (F1-F5) pass
- [ ] No syntax errors: `node -c` validation on all modified files
- [ ] No console errors in browser DevTools
- [ ] No missing API calls or undefined function errors
- [ ] Performance acceptable (file uploads < 10s for typical files)

### Known Limitations

- Edit mode assumes Cloudinary file exists and can be deleted
- Delete mode does not support multi-file submissions (single file per requirement)
- Rejection reason limited to 500 chars (not enforced UI-side, but DB TEXT type supports larger)

---

## Test Environment Setup

1. **Backend Running**: Ensure Express.js server running on configured port
2. **Database Connected**: MySQL instance with populated test data
3. **Cloudinary Connected**: API credentials configured for file operations
4. **Electron App Running**: Desktop application with all routes rendered
5. **DevTools Open**: Monitor console for errors during each test

---

## Reporting

For each failed test case:

1. **Description**: What failed and how to reproduce
2. **Expected vs Actual**: What should happen vs what did happen
3. **Screenshots**: UI state at time of failure
4. **Logs**: Console errors, network requests, backend logs
5. **Severity**: Critical (blocks workflow) / High / Medium / Low

---

**Next Phase**: Once all tests pass → Production deployment ready! 🚀
