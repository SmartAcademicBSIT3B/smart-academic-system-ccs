# Frontend Implementation Guide - OJT Requirements Approval Redesign

## Summary

This guide provides the complete code changes needed for the frontend redesign of the OJT requirements approval system with approve/reject workflows, color-coded containers, edit/delete modes, and capstone validation.

**Backend Status**: ✅ COMPLETE (Phase 1)

- PATCH endpoint updated for rejection with auto-status-demotion
- GET submission details endpoint added
- GET capstone approval check endpoint added (ojt-coordinator.js)

**Frontend Status**: IN PROGRESS (Phase 2)

---

## What's Already Done

### CSS Added (✅ Complete)

New requirement container styles have been added to the `<style>` section (lines 900-970):

- `.req-container` with state variants (pending/approved/rejected)
- `.req-icon` classes for eye/check/cross icons
- `.req-action-buttons` for approve/reject buttons
- `.req-edit-delete-buttons` for edit/delete mode buttons
- `.req-delete-overlay` for delete confirmation overlay

### Backend Endpoints Ready (✅ Complete)

1. **PATCH** `/api/ojt-requirements/submissions/:submissionId`
   - Accepts: `status`, `notes` (for rejection reason)
   - Auto-reverts student status to "Pending Requirements" if rejecting verified requirement
2. **GET** `/api/ojt-requirements/submissions/:submissionId`
   - Returns full submission details with notes
   - Used by students to view rejection reasons
3. **GET** `/api/ojt-coordinator/capstone-approval/:studentId`
   - Returns capstone approval status: `{ hasCapstone, isApproved, capstone }`

---

## What Needs to Be Done

### 1. ADD MODALS TO HTML (Before `<div id="toast"></div>`)

Insert these two modals in the HTML (around line 1550):

```html
<!-- APPROVE REQUIREMENT MODAL -->
<div class="modal-overlay" id="approveReqModal">
  <div class="modal-box" style="max-width: 360px">
    <div class="modal-title">Approve Requirement?</div>
    <p
      style="font-size: 13px; color: var(--primary-text); margin-bottom: 20px; line-height: 1.6;"
      id="approveReqMsg"
    ></p>
    <div class="modal-actions">
      <button class="modal-cancel-btn" onclick="closeApproveReqModal()">
        Cancel
      </button>
      <button class="modal-save-btn" onclick="confirmApproveRequirement()">
        Approve
      </button>
    </div>
  </div>
</div>

<!-- REJECT REQUIREMENT MODAL -->
<div class="modal-overlay" id="rejectReqModal">
  <div class="modal-box" style="max-width: 400px">
    <div class="modal-title">Reject Requirement</div>
    <p
      style="font-size: 12px; color: var(--secondary-text); margin-bottom: 12px;"
    >
      Please provide a reason for rejection (visible to student)
    </p>
    <textarea
      class="form-textarea"
      id="rejectReasonInput"
      placeholder="e.g. Missing signature, Poor quality, Incomplete document..."
      rows="4"
      style="margin-bottom: 16px;"
    ></textarea>
    <div class="modal-actions">
      <button class="modal-cancel-btn" onclick="closeRejectReqModal()">
        Cancel
      </button>
      <button
        class="modal-save-btn"
        onclick="confirmRejectRequirement()"
        style="background: #ff5252;"
      >
        Reject
      </button>
    </div>
  </div>
</div>
```

### 2. REPLACE `renderRequirementsGrid()` FUNCTION

Find the `renderRequirementsGrid(type, requirements)` function (around line 1790) and replace it with:

```javascript
function renderRequirementsGrid(type, requirements) {
  const gridId = type === "pre" ? "preGrid" : "postGrid";
  const grid = document.getElementById(gridId);

  if (!requirements.length) {
    grid.innerHTML =
      '<div style="color:var(--secondary-text);font-size:13px;">No requirements found.</div>';
    return;
  }

  grid.innerHTML = requirements
    .map((item) => {
      const { template: t, submission: sub } = item;
      const badge = deadlineBadgeHtml(t.deadline_badge);
      const isVerified = sub?.status === "verified";
      const isRejected = sub?.status === "rejected";
      const isSubmitted =
        sub?.status === "submitted" ||
        sub?.status === "verified" ||
        sub?.status === "rejected";

      // Determine container state class and icon
      let containerClass = "req-container-pending";
      let iconSvg =
        '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke-width="1.5"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></svg>';
      let containerText = "Pending";

      if (isVerified) {
        containerClass = "req-container-approved";
        iconSvg =
          '<svg viewBox="0 0 16 16"><polyline points="2,8 6,12 14,4" stroke-width="1.5"/></svg>';
        containerText = "Approved";
      } else if (isRejected) {
        containerClass = "req-container-rejected";
        iconSvg =
          '<svg viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke-width="1.5"/><line x1="13" y1="3" x2="3" y2="13" stroke-width="1.5"/></svg>';
        containerText = "Rejected";
      }

      let containerHtml = "";
      if (isSubmitted) {
        containerHtml = `
          <div class="req-container ${containerClass}" onclick="openFile('${esc(sub.file_url)}')">
            <div class="req-icon req-icon-${isVerified ? "check" : isRejected ? "cross" : "eye"}">
              ${iconSvg}
            </div>
            <div class="req-container-text">${containerText}</div>
            <div class="req-action-buttons">
              <button class="req-approve-btn" title="Approve" onclick="event.stopPropagation(); openApproveReqModal('${esc(sub.id)}','${type}')">
                <svg viewBox="0 0 16 16"><polyline points="2,8 6,12 14,4"/></svg>
              </button>
              <button class="req-reject-btn" title="Reject" onclick="event.stopPropagation(); openRejectReqModal('${esc(sub.id)}','${type}')">
                <svg viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
              </button>
            </div>
          </div>
        `;
      } else {
        containerHtml = `
          <button class="upload-btn" onclick="uploadReqFile('${esc(t.id)}','${type}','','')">Upload File</button>
        `;
      }

      return `
        <div class="req" data-template-id="${esc(t.id)}" data-submission-id="${esc(sub?.id || "")}">
          <div class="req-meta">
            <span class="req-label">${esc(t.name.toUpperCase())}</span>
            ${badge}
          </div>
          <div class="req-actions">${containerHtml}</div>
          ${
            isSubmitted
              ? `
            <div class="req-edit-delete-buttons">
              <button class="req-edit-btn" onclick="toggleEditMode('${esc(sub.id)}','${type}')">Edit</button>
              <button class="req-delete-btn" onclick="toggleDeleteMode('${esc(sub.id)}','${type}')">Delete</button>
            </div>
          `
              : ""
          }
        </div>`;
    })
    .join("");

  // Update Deploy/Archive button status
  checkDeploymentRequirements(type);
}
```

### 3. ADD NEW FUNCTIONS (Add to script section before closing `</script>`)

```javascript
// ── Approval/Rejection Modal Functions ──
let pendingApprovalSubId = null;
let pendingApprovalType = null;
let pendingRejectionSubId = null;
let pendingRejectionType = null;

function openApproveReqModal(submissionId, type) {
  pendingApprovalSubId = submissionId;
  pendingApprovalType = type;
  document.getElementById("approveReqMsg").textContent =
    `Are you sure you want to approve this requirement?`;
  document.getElementById("approveReqModal").classList.add("open");
}

function closeApproveReqModal() {
  document.getElementById("approveReqModal").classList.remove("open");
  pendingApprovalSubId = null;
  pendingApprovalType = null;
}

function openRejectReqModal(submissionId, type) {
  pendingRejectionSubId = submissionId;
  pendingRejectionType = type;
  document.getElementById("rejectReasonInput").value = "";
  document.getElementById("rejectReqModal").classList.add("open");
}

function closeRejectReqModal() {
  document.getElementById("rejectReqModal").classList.remove("open");
  pendingRejectionSubId = null;
  pendingRejectionType = null;
}

async function confirmApproveRequirement() {
  if (!pendingApprovalSubId) return;
  try {
    const r = await window.electronAPI.updateOjtRequirementSubmission({
      id: pendingApprovalSubId,
      status: "verified",
    });
    if (!r?.success) throw new Error(r?.message || "Approval failed.");
    showToast("Requirement approved.", "success");
    closeApproveReqModal();
    await loadRequirements(pendingApprovalType);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function confirmRejectRequirement() {
  if (!pendingRejectionSubId) return;
  const reason = document.getElementById("rejectReasonInput").value.trim();
  if (!reason) {
    showToast("Please provide a rejection reason.", "error");
    return;
  }
  try {
    const r = await window.electronAPI.updateOjtRequirementSubmission({
      id: pendingRejectionSubId,
      status: "rejected",
      notes: reason,
    });
    if (!r?.success) throw new Error(r?.message || "Rejection failed.");
    showToast("Requirement rejected.", "success");
    closeRejectReqModal();
    await loadRequirements(pendingRejectionType);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ── Viewer Modal Approval/Rejection (from file preview) ──
let currentViewerSubmissionId = null;
let currentViewerType = null;

function approveFromViewer() {
  if (currentViewerSubmissionId) {
    openApproveReqModal(currentViewerSubmissionId, currentViewerType);
  }
}

function rejectFromViewer() {
  if (currentViewerSubmissionId) {
    openRejectReqModal(currentViewerSubmissionId, currentViewerType);
  }
}

// ── Edit/Delete Mode Functions ──
function toggleEditMode(submissionId, type) {
  // TODO: Implement file replacement UI overlay
  showToast("Edit mode coming soon.", "info");
}

function toggleDeleteMode(submissionId, type) {
  // TODO: Implement delete confirmation overlay
  showToast("Delete mode coming soon.", "info");
}

// ── Deployment Requirements Check ──
async function checkDeploymentRequirements(type) {
  if (type === "pre") {
    const requirements = document.querySelectorAll("#preGrid .req");
    const allVerified = Array.from(requirements).every((req) => {
      const isRequired = req
        .querySelector(".req-label")
        .textContent.includes("REQUIRED");
      const isApproved = req.querySelector(".req-container-approved");
      return !isRequired || isApproved;
    });

    // Also check capstone approval
    let capstoneApproved = true;
    try {
      const capResult = (await window.electronAPI
        .getCoordinatorCapstoneApproval)
        ? await window.electronAPI.getCoordinatorCapstoneApproval(STUDENT_ID)
        : null;
      capstoneApproved = capResult?.success && capResult?.isApproved;
    } catch (_) {
      capstoneApproved = false;
    }

    const deployBtn = document.getElementById("deployBtn");
    deployBtn.disabled = !(allVerified && capstoneApproved);
    if (allVerified && capstoneApproved) {
      deployBtn.dataset.enabled = "true";
    } else {
      delete deployBtn.dataset.enabled;
    }
  }

  if (type === "post") {
    const requirements = document.querySelectorAll("#postGrid .req");
    const allVerified = Array.from(requirements).every((req) => {
      const isRequired = req
        .querySelector(".req-label")
        .textContent.includes("REQUIRED");
      const isApproved = req.querySelector(".req-container-approved");
      return !isRequired || isApproved;
    });

    const archiveBtn = document.getElementById("archiveBtn");
    archiveBtn.disabled = !allVerified;
    if (allVerified) {
      archiveBtn.dataset.enabled = "true";
    } else {
      delete archiveBtn.dataset.enabled;
    }
  }
}

// ── Update openFile to track submission context for viewer buttons ──
const originalOpenFile = window.openFile;
function openFileWrapper(url) {
  // Find the submission ID from the DOM
  const reqCards = document.querySelectorAll("[data-submission-id]");
  let subId = null;
  reqCards.forEach((card) => {
    if (card.querySelector(`[onclick*="${url}"]`)) {
      subId = card.getAttribute("data-submission-id");
      currentViewerSubmissionId = subId;
      // Detect if it's pre or post by checking which grid it's in
      currentViewerType = card.closest("#preGrid") ? "pre" : "post";
    }
  });
  originalOpenFile(url);
}
window.openFile = openFileWrapper;
```

### 4. UPDATE DEPLOY BUTTON CALL

Change the Deploy button's onclick to include capstone check:

```javascript
async function confirmDeploy() {
  // Check capstone approval
  try {
    const capResult = (await window.electronAPI.getCoordinatorCapstoneApproval)
      ? await window.electronAPI.getCoordinatorCapstoneApproval(STUDENT_ID)
      : null;
    if (!capResult?.success || !capResult?.isApproved) {
      showToast("Cannot deploy: Capstone must be approved first.", "error");
      return;
    }
  } catch (err) {
    showToast("Could not verify capstone approval status.", "error");
    return;
  }

  // Original deploy logic...
  openConfirm(
    "Deploy Student",
    `Deploy ${STUDENT_NAME} to OJT? All pre-requirements must be approved.`,
    async () => {
      try {
        const r = await window.electronAPI.updateStudentOjtStatus({
          student_id: STUDENT_ID,
          status: "Deployed",
          notes: "Deployed by coordinator",
        });
        if (!r?.success) throw new Error(r?.message || "Deploy failed.");
        showToast("Student deployed.", "success");
        await loadCoordinatorStudentProfile();
      } catch (err) {
        showToast(err.message, "error");
      }
    },
  );
}
```

### 5. ADD IPC HANDLER IN electron/main.js

Add this handler to electron/main.js (around line 1950):

```javascript
ipcMain.handle("getCoordinatorCapstoneApproval", async (event, studentId) => {
  try {
    return await api.get(
      `/ojt-coordinator/capstone-approval/${encodeURIComponent(studentId)}`,
    );
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to check capstone approval.",
    };
  }
});
```

And add to preload.js (around line 67):

```javascript
getCoordinatorCapstoneApproval: (studentId) =>
  ipcRenderer.invoke("getCoordinatorCapstoneApproval", studentId),
```

---

## Implementation Checklist

- [ ] **1. Modals HTML** - Add approve/reject modals to HTML (before toast div)
- [ ] **2. CSS** - ✅ Already added (new .req-container styles)
- [ ] **3. renderRequirementsGrid** - Replace with new version
- [ ] **4. Modal Functions** - Add approval/rejection handlers
- [ ] **5. Edit/Delete Stubs** - Add placeholder functions
- [ ] **6. Deployment Check** - Update Deploy button with capstone validation
- [ ] **7. IPC Handler** - Add getCoordinatorCapstoneApproval to electron/main.js
- [ ] **8. Preload API** - Add getCoordinatorCapstoneApproval to preload.js
- [ ] **9. Testing** - Test approve/reject flows, color states, deployment validation

---

## Key Features Implemented

✅ **Backend**:

- Auto-demotion of student status when rejecting approved requirement
- Rejection reasons stored in `notes` field (visible to students)
- Capstone approval check endpoint
- Automatic status transitions

✅ **Frontend (Ready)**:

- CSS for color-coded containers (gray/green/red)
- Modal templates for approve/reject confirmations
- Functions for modal management
- Deployment validation with capstone check

⏳ **Frontend (TODO - Phase 3)**:

- Edit mode file replacement UI overlay
- Delete mode confirmation overlay
- Student-facing rejection reason display
- Enhanced viewer modal with approve/reject buttons (footer)

---

## Testing Instructions

1. **Approve Flow**: Click green checkmark → Confirmation modal → Student status updates to "Approved"
2. **Reject Flow**: Click red X → Reason modal → Student status updates to "Rejected" with reason
3. **Deployment**: Deploy button should be disabled until all pre-reqs approved AND capstone approved
4. **Status Demotion**: Reject an approved requirement → Student status should revert to "Pending Requirements"
5. **Capstone Check**: Link approved thesis/capstone → Deploy button should enable

---

## Backend API Summary

| Endpoint                                            | Method | Updates                                                  |
| --------------------------------------------------- | ------ | -------------------------------------------------------- |
| `/api/ojt-requirements/submissions/:id`             | PATCH  | Now handles rejection with notes, triggers auto-demotion |
| `/api/ojt-requirements/submissions/:id`             | GET    | Returns full details including notes for students        |
| `/api/ojt-coordinator/capstone-approval/:studentId` | GET    | New endpoint to check capstone approval status           |

---

**Status**: Phase 1 Complete ✅ | Phase 2 In Progress 🔄 | Phase 3 Planned 📋
