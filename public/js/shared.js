// Build shared nav and contact footer
function buildNavbar(activePath) {
  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.innerHTML = `
    <div class="navbar-inner container">
      <div class="nav-left">
        <span class="brand">Career Mirror</span>
      </div>
      <div class="nav-links">
        <a class="nav-link" href="/">Home</a>
        <a class="nav-link" href="/upload.html">Resume</a>
        <a class="nav-link" href="/display.html">Notices</a>
        <a class="nav-link nav-cta" href="mailto:deepthiav.23eie@kongu.edu">Contact</a>
      </div>
    </div>`;
  document.body.prepend(nav);

  // Highlight active
  const links = nav.querySelectorAll('a.nav-link');
  links.forEach(a => {
    if (a.getAttribute('href') === activePath) {
      a.style.background = '#fff';
    }
  });
}

function buildFooter() {
  const footer = document.createElement('div');
  footer.className = 'footer';
  footer.innerHTML = `Have questions? Email <a class="mail-link" href="mailto:deepthiav.23eie@kongu.edu">deepthiav.23eie@kongu.edu</a>`;
  document.body.appendChild(footer);
}

function ensureBase() {
  if (!document.querySelector('link[href*="css/base.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/base.css';
    document.head.appendChild(link);
  }
}

window.CareerMirror = { buildNavbar, buildFooter, ensureBase };
