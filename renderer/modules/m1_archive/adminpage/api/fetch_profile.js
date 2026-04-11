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
  const emailInput = document.getElementById("profileEmail");
  const profileImg = document.querySelector(".profile-avatar");

  if (nameInput) nameInput.value = user.name || "";
  if (usernameInput) usernameInput.value = user.user_id || "";
  if (emailInput) emailInput.value = user.email || "";

  if (profileImg) {
    if (user.profile_image) {
      profileImg.src = user.profile_image;
    } else {
      profileImg.src = DEFAULT_PROFILE_IMAGE;
    }
  }
}

async function chooseProfileImage() {
  try {
    const result = await window.electronAPI.selectProfileImage();
    if (!result.success) {
      return;
    }

    selectedProfileImagePath = result.path;
    const profileImg = document.querySelector(".profile-avatar");
    if (profileImg) {
      profileImg.src = selectedProfileImagePath || DEFAULT_PROFILE_IMAGE;
    }
  } catch (error) {
    console.error("Error selecting profile image:", error);
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
