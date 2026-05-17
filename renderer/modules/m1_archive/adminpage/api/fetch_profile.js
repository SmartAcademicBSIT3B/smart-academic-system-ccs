let selectedProfileImagePath = null;
const DEFAULT_PROFILE_IMAGE = "../../images/default_avatar.jpg";

async function fetchUserProfile(userId) {
  try {
    const result = await window.electronAPI.getProfile(userId);
    if (result.success) {
      return result.user;
    } else {
      console.error("Failed to fetch profile:", result.message);
      return null;
    }
  } catch (error) {
    console.error("Profile API error:", error);
    return null;
  }
}

function displayProfileData(user) {
  if (!user) return;

  selectedProfileImagePath = user.profile_image || null;

  const nameInput = document.getElementById("profileName");
  const usernameInput = document.getElementById("profileUserId");
  const roleInput = document.getElementById("profileRole");
  const emailInput = document.getElementById("profileEmail");
  const profileImg =
    document.getElementById("profileModalImage") ||
    document.querySelector(".profile-avatar");

  if (nameInput) nameInput.value = user.name || "";
  if (usernameInput) usernameInput.value = user.user_id || "";
  if (roleInput) roleInput.value = user.role || "";
  if (emailInput) emailInput.value = user.email || "";

  if (profileImg) {
    if (user.profile_image) {
      profileImg.src = user.profile_image;
    } else {
      profileImg.src = DEFAULT_PROFILE_IMAGE;
    }
  }
}

function showAvatarLoading(visible) {
  const overlay = document.getElementById("avatarUploadOverlay");
  const avatar = document.querySelector(".profile-avatar");
  if (overlay) overlay.style.display = visible ? "flex" : "none";
  if (avatar) avatar.style.pointerEvents = visible ? "none" : "";
}

function showAvatarError(message) {
  const el = document.getElementById("avatarUploadError");
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.style.display = "block";
  } else {
    el.textContent = "";
    el.style.display = "none";
  }
}

async function chooseProfileImage() {
  showAvatarError(null);

  let userId = null;
  try {
    const userStr = localStorage.getItem("user");
    userId = userStr ? JSON.parse(userStr)?.id : null;
  } catch (error) {
    console.error("Unable to read local user data:", error);
  }

  if (!userId) {
    showAvatarError("Unable to identify user. Please log in again.");
    return;
  }

  // Step 1: Open file picker (fast — no loader needed yet)
  let pickerResult;
  try {
    pickerResult = await window.electronAPI.selectProfileImage();
  } catch (error) {
    console.error("Error opening file picker:", error);
    showAvatarError("Could not open file picker.");
    return;
  }

  if (!pickerResult || pickerResult.canceled || !pickerResult.success) {
    // User dismissed the dialog — silent exit
    return;
  }

  // Step 2: Show loader then upload to Cloudinary
  showAvatarLoading(true);
  let uploadResult;
  try {
    uploadResult = await window.electronAPI.uploadProfileImage({
      localPath: pickerResult.localPath,
      fileName: pickerResult.fileName,
      mimeType: pickerResult.mimeType,
      userId,
    });
  } catch (error) {
    console.error("Upload error:", error);
    showAvatarLoading(false);
    showAvatarError("Upload failed. Please try again.");
    return;
  }

  showAvatarLoading(false);

  if (!uploadResult.success) {
    console.error("Profile upload failed:", uploadResult.message);
    showAvatarError(uploadResult.message || "Upload failed. Please try again.");
    return;
  }

  selectedProfileImagePath = uploadResult.path;
  const profileImg = document.querySelector(".profile-avatar");
  if (profileImg) {
    profileImg.src = selectedProfileImagePath || DEFAULT_PROFILE_IMAGE;
  }
}

async function loadProfileOnModalOpen() {
  try {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      console.error("No user data found in localStorage");
      return;
    }

    const user = JSON.parse(userStr);
    const profileData = await fetchUserProfile(user.id);

    if (profileData) {
      displayProfileData(profileData);
    }
  } catch (error) {
    console.error("Error loading profile:", error);
  }
}
