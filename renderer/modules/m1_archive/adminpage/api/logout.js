async function logoutUser() {
  try {
    // Call the IPC logout handler
    const result = await window.electronAPI.logout();

    if (result.success || !result.success) {
      // Clear localStorage
      localStorage.removeItem("user");

      // Navigate back to login page
      window.location.href = "../../login.html";
    } else {
      console.error("Logout failed:", result.message);
      alert("Logout failed. Please try again.");
    }
  } catch (error) {
    console.error("Logout error:", error);
    // Even if there's an error, clear local session and go to login
    localStorage.removeItem("user");
    window.location.href = "../../login.html";
  }
}
