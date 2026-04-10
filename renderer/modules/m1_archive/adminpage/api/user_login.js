async function loginUser(email, password) {
  try {
    const result = await window.electronAPI.login(email, password);
    return result;
  } catch (error) {
    console.error("Login API error:", error);
    // Provide more informative error message
    let message = "An error occurred during login.";
    if (error.message) {
      message = `Login failed: ${error.message}`;
    } else if (error.code) {
      message = `Login error (code: ${error.code}): ${message}`;
    }
    return { success: false, message };
  }
}

module.exports = { loginUser };
