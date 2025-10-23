document.addEventListener('DOMContentLoaded', () => {
  const url = new URL(window.location.href);
  const prefill = url.searchParams.get('email');
  if (prefill) document.getElementById('email').value = prefill;
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const msg = document.getElementById('msg');
  msg.textContent = 'Processing...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      sessionStorage.setItem('loggedInEmail', email);
      // After login, if a resume is pending, send it for analysis
      const b64 = sessionStorage.getItem('pendingResumeBase64');
      const name = sessionStorage.getItem('pendingResumeName');
      const type = sessionStorage.getItem('pendingResumeType');
      if (b64 && name) {
        msg.textContent = 'Uploading resume for analysis...';
        const file = dataURLtoFile(b64, name, type);
        const form = new FormData();
        form.append('resume', file);
        form.append('email', email);
        const ares = await fetch('/api/resume/analyze', { method: 'POST', body: form });
        const adata = await ares.json();
        if (ares.ok && adata.success) {
          // clear pending
          sessionStorage.removeItem('pendingResumeBase64');
          sessionStorage.removeItem('pendingResumeName');
          sessionStorage.removeItem('pendingResumeType');
          sessionStorage.setItem('lastAnalysis', JSON.stringify(adata.analysis));
          window.location.href = 'result.html';
          return;
        } else {
          msg.textContent = adata.message || 'Failed to analyze resume';
          msg.style.color = 'red';
          return;
        }
      }
      // No resume pending, go to upload
      window.location.href = 'upload.html';
    } else {
      msg.textContent = data.which === 'email' ? 'Email not found' : (data.which === 'password' ? 'Incorrect password' : (data.message || 'Login failed'));
      msg.style.color = 'red';
    }
  } catch (err) {
    msg.textContent = 'Server error';
    msg.style.color = 'red';
  }
});

function dataURLtoFile(dataurl, filename, type) {
  const arr = dataurl.split(',');
  const mime = type || arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length; const u8arr = new Uint8Array(n);
  while (n--) { u8arr[n] = bstr.charCodeAt(n); }
  return new File([u8arr], filename, { type: mime });
}
