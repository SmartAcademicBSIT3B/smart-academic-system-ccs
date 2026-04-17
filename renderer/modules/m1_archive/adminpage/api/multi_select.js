/**
 * Rubber-band drag-to-select for the archives table.
 *
 * Usage:
 *   initArchiveDragSelect({ tableBodyId, dragBoxId, onSelectionChange })
 *
 *   onSelectionChange(row, selected) — called for each row that enters the
 *   drag selection area when mouseup fires.
 */
function initArchiveDragSelect({ tableBodyId, dragBoxId, onSelectionChange }) {
  const tbody = document.getElementById(tableBodyId);
  const dragBox = document.getElementById(dragBoxId);

  if (!tbody || !dragBox) return;

  const MIN_DRAG_PX = 5; // minimum movement before treating as a drag

  let active = false; // mousedown occurred inside tbody
  let dragging = false; // crossed the movement threshold
  let originX = 0;
  let originY = 0;

  function getSelectionRect(ax, ay, bx, by) {
    return {
      left: Math.min(ax, bx),
      top: Math.min(ay, by),
      right: Math.max(ax, bx),
      bottom: Math.max(ay, by),
    };
  }

  function rectsOverlap(a, b) {
    return !(
      b.left > a.right ||
      b.right < a.left ||
      b.top > a.bottom ||
      b.bottom < a.top
    );
  }

  function getRows() {
    return Array.from(tbody.querySelectorAll("tr"));
  }

  function applyDragHighlight(selRect) {
    getRows().forEach((row) => {
      const rowRect = row.getBoundingClientRect();
      const intersects = rectsOverlap(selRect, rowRect);
      row.classList.toggle("row-drag-hover", intersects);
    });
  }

  function clearDragHighlight() {
    getRows().forEach((row) => row.classList.remove("row-drag-hover"));
  }

  function hideDragBox() {
    dragBox.style.display = "none";
  }

  // ── event listeners ───────────────────────────────────────────────────────

  tbody.addEventListener("mousedown", (e) => {
    // Only left-button drags; skip interactive elements
    if (e.button !== 0) return;
    if (e.target.closest(".dots-btn")) return;
    if (e.target.closest("button")) return;
    if (e.target.closest("input")) return;
    if (e.target.closest("select")) return;
    if (e.target.closest(".row-status-control")) return;
    if (e.target.closest(".row-status-select")) return;

    active = true;
    dragging = false;
    originX = e.clientX;
    originY = e.clientY;
  });

  document.addEventListener("mousemove", (e) => {
    if (!active) return;

    const dx = Math.abs(e.clientX - originX);
    const dy = Math.abs(e.clientY - originY);

    if (!dragging && dx < MIN_DRAG_PX && dy < MIN_DRAG_PX) return;

    // First frame past threshold — begin drag mode
    if (!dragging) {
      dragging = true;
      // Suppress text selection while dragging
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
    }

    e.preventDefault();

    const sel = getSelectionRect(originX, originY, e.clientX, e.clientY);

    dragBox.style.display = "block";
    dragBox.style.left = sel.left + "px";
    dragBox.style.top = sel.top + "px";
    dragBox.style.width = sel.right - sel.left + "px";
    dragBox.style.height = sel.bottom - sel.top + "px";

    applyDragHighlight(sel);
  });

  document.addEventListener("mouseup", (e) => {
    if (!active) return;
    active = false;

    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";

    if (!dragging) {
      hideDragBox();
      return;
    }

    dragging = false;
    hideDragBox();

    // Commit highlighted rows to selection
    getRows().forEach((row) => {
      if (row.classList.contains("row-drag-hover")) {
        row.classList.remove("row-drag-hover");
        if (typeof onSelectionChange === "function") {
          onSelectionChange(row, true);
        }
      }
    });
  });
}

window.initArchiveDragSelect = initArchiveDragSelect;
