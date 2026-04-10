async function loginUser(email, password) {
  try {
    const result = await window.electronAPI.login(email, password);
    return result;
  } catch (error) {
    console.error("Login API error:", error);
    return { success: false, message: "An error occurred during login." };
  }
}

module.exports = { loginUser };
