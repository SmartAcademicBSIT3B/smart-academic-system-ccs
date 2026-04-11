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

  // Populate profile fields using IDs
  const nameInput = document.getElementById("profileName");
  const usernameInput = document.getElementById("profileUserId");
  const emailInput = document.getElementById("profileEmail");

  if (nameInput) nameInput.value = user.name || "";
  if (usernameInput) usernameInput.value = user.user_id || "";
  if (emailInput) emailInput.value = user.email || "";

  // Update profile image with default fallback
  const profileImg = document.querySelector(".profile-avatar");
  if (profileImg) {
    if (user.profile_image) {
      profileImg.src = user.profile_image;
    } else {
      profileImg.src = "../../images/default_avatar.jpg";
    }
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
