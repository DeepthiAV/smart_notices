document.addEventListener('DOMContentLoaded', () => {
  const url = new URL(window.location.href);
  const prefill = url.searchParams.get('email');
  if (prefill) document.getElementById('email').value = prefill;
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const msg = document.getElementById('msg');
  msg.textContent = 'Creating account...';

  try {
    const res = await fetch('/api/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      msg.textContent = 'Account created! Redirecting to login...';
      setTimeout(() => { window.location.href = `login.html?email=${encodeURIComponent(email)}`; }, 1000);
    } else {
      msg.textContent = data.message || 'Signup failed';
      msg.style.color = 'red';
    }
  } catch (err) {
    msg.textContent = 'Server error';
    msg.style.color = 'red';
  }
});
