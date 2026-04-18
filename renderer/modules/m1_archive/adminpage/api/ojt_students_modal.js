(function () {
  const modalAnimationMs = 220;

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("is-closing");
    modalEl.style.display = "flex";
    requestAnimationFrame(() => modalEl.classList.add("is-open"));
  }

  function closeModal(modalEl) {
    if (!modalEl || modalEl.style.display === "none") return;

    modalEl.classList.remove("is-open");
    modalEl.classList.add("is-closing");

    const finalizeClose = () => {
      modalEl.style.display = "none";
      modalEl.classList.remove("is-closing");
    };

    const onTransitionEnd = (event) => {
      if (event.target !== modalEl) return;
      modalEl.removeEventListener("transitionend", onTransitionEnd);
      finalizeClose();
    };

    modalEl.addEventListener("transitionend", onTransitionEnd);
    window.setTimeout(() => {
      modalEl.removeEventListener("transitionend", onTransitionEnd);
      finalizeClose();
    }, modalAnimationMs + 60);
  }

  function showToast(message, type = "info", duration = 2600) {
    const container = document.getElementById("toast-container");
    if (!container) return null;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const iconName =
      type === "success"
        ? "check-circle"
        : type === "error"
          ? "alert-triangle"
          : "info";

    toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${String(message || "")}</span>`;
    container.appendChild(toast);

    if (typeof lucide !== "undefined") {
      lucide.createIcons({ nodes: [toast] });
    }

    requestAnimationFrame(() => toast.classList.add("toast-show"));

    window.setTimeout(
      () => {
        toast.classList.remove("toast-show");
        window.setTimeout(() => toast.remove(), 220);
      },
      Math.max(700, Number(duration) || 2600),
    );

    return toast;
  }

  window.OjtStudentsUI = {
    openModal,
    closeModal,
    showToast,
  };
})();
