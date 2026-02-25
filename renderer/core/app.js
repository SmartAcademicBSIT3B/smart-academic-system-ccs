function navigateToArchiveLogin() {
  const archiveLoginUrl = new URL('../modules/m1_archive/login.html', window.location.href);
  window.location.href = archiveLoginUrl.href;
}

document.addEventListener('DOMContentLoaded', () => {
  const archiveLoginButton = document.getElementById('archive-login-link');

  if (archiveLoginButton) {
    archiveLoginButton.addEventListener('click', navigateToArchiveLogin);
  }
});
