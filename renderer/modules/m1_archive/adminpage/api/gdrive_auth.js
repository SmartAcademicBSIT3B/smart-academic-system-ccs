async function initiateGoogleDriveAuth() {
  try {
    const authUrlResult = await window.electronAPI.getGoogleDriveAuthUrl();
    if (!authUrlResult.success) {
      alert("Failed to get authorization URL: " + authUrlResult.message);
      return;
    }

    const authUrl = authUrlResult.authUrl;

    // Copy auth URL to clipboard and open instructions
    const instructions = `To authorize Google Drive:

1. Visit this URL in your browser:
${authUrl}

2. Sign in with your Google account and approve access
3. After approving, you'll be redirected to a URL
4. Copy the authorization code from that URL
5. Paste the code in the next prompt`;

    alert(instructions);

    // Open in default browser via a new window (if available)
    if (window.electronAPI && window.electronAPI.openExternalUrl) {
      window.electronAPI.openExternalUrl(authUrl);
    } else {
      // Fallback: user needs to copy/paste
      const manualUrl = prompt(
        "Copy and open this URL in your browser:",
        authUrl,
      );
      if (!manualUrl) return;
    }

    // Prompt user to paste the auth code
    const authCode = prompt(
      "Paste the authorization code from the redirect URL:",
    );

    if (!authCode || authCode.trim() === "") {
      alert("Authorization cancelled.");
      return;
    }

    const saveResult = await window.electronAPI.saveGoogleDriveToken(
      authCode.trim(),
    );
    if (!saveResult.success) {
      alert("Failed to save authorization: " + saveResult.message);
      return;
    }

    alert("Google Drive authorized successfully!");
  } catch (error) {
    console.error("Auth error:", error);
    alert("Authorization failed: " + error.message);
  }
}
