// AeroTouch - Camera Permission Setup

document.addEventListener('DOMContentLoaded', () => {
  const btnRequest = document.getElementById('btn-request');
  const statusBox = document.getElementById('status-box');
  const previewVideo = document.getElementById('preview-video');

  async function requestCamera() {
    btnRequest.disabled = true;
    btnRequest.textContent = 'Requesting Browser Permission...';
    statusBox.style.display = 'none';

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia is not supported.');
      }

      // Universal standard call that always triggers the browser permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });

      previewVideo.srcObject = stream;
      previewVideo.style.display = 'block';

      statusBox.className = 'status-msg status-success';
      statusBox.innerHTML = '<strong>✓ Camera Permission Granted!</strong><br>Your webcam is now connected. You can close this tab and return to your webpage.';
      statusBox.style.display = 'block';

      btnRequest.textContent = '✓ Permission Granted';
      btnRequest.style.background = '#10b981';

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ aerotouch_camera_permitted: true });
      }

      // Auto-close tab after 3 seconds so the user doesn't have to do it manually
      setTimeout(() => {
        window.close();
      }, 3500);

    } catch (err) {
      console.error('[Permission] Camera request failed:', err);
      statusBox.className = 'status-msg status-error';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        statusBox.innerHTML = '<strong>Permission Blocked</strong><br>Please click the camera/lock icon in your address bar (top left) and change Camera to <strong>Allow</strong>, then reload this page.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        statusBox.innerHTML = '<strong>Camera In Use</strong><br>Another app (Zoom, Teams, Discord, Skype, OBS, or Windows Camera) is using the webcam. Please close it and retry.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        statusBox.innerHTML = '<strong>No Camera Found</strong><br>Check if your laptop has a physical privacy slider (shutter switch) or a camera toggle key (Fn+F6/F8/F10).';
      } else {
        statusBox.innerHTML = `<strong>Error:</strong> ${err.message}`;
      }

      statusBox.style.display = 'block';
      btnRequest.disabled = false;
      btnRequest.textContent = 'Try Again';
    }
  }

  btnRequest.addEventListener('click', requestCamera);

  // Automatically trigger request on load
  requestCamera();
});

