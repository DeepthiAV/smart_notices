// New upload flow: choose resume, enter email, proceed -> login/signup -> analyze -> results
(function () {
  const resumeInput = document.getElementById('resumeInput');
  const fileNameEl = document.getElementById('fileName');
  const emailEl = document.getElementById('email');
  const proceedBtn = document.getElementById('proceed');
  const statusEl = document.getElementById('status');

  let selectedFile = null;

  function updateProceedState() {
    const hasFile = !!selectedFile;
    const hasEmail = !!emailEl.value && /@/.test(emailEl.value);
    proceedBtn.disabled = !(hasFile && hasEmail);
  }

  resumeInput.addEventListener('change', () => {
    selectedFile = resumeInput.files && resumeInput.files[0] ? resumeInput.files[0] : null;
    fileNameEl.textContent = selectedFile ? `${selectedFile.name} (${Math.round(selectedFile.size/1024)} KB)` : '';
    updateProceedState();
  });

  emailEl.addEventListener('input', updateProceedState);

  proceedBtn.addEventListener('click', async () => {
    if (!selectedFile || !emailEl.value) return;
    statusEl.textContent = 'Checking account...';

    // Convert file to base64 and store temporarily
    const base64 = await toBase64(selectedFile);
    sessionStorage.setItem('pendingResumeBase64', base64);
    sessionStorage.setItem('pendingResumeName', selectedFile.name);
    sessionStorage.setItem('pendingResumeType', selectedFile.type || 'application/octet-stream');
    sessionStorage.setItem('pendingEmail', emailEl.value.trim());

    try {
      const res = await fetch('/api/users/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailEl.value.trim() })
      });
      const data = await res.json();
      if (data.exists) {
        window.location.href = `login.html?email=${encodeURIComponent(emailEl.value.trim())}`;
      } else {
        window.location.href = `signup.html?email=${encodeURIComponent(emailEl.value.trim())}`;
      }
    } catch (e) {
      statusEl.textContent = 'Server error. Try again.';
    }
  });

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }
})();
