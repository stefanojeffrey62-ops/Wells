async function handleFormSubmit(formId, endpoint) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (data.ok && data.next) {
        window.location.href = data.next;
      } else if (data.ok && data.redirect) {
        window.location.href = data.redirect;
      } else {
        alert("Something went wrong. Try again.");
        console.error(data);
      }
    } catch (err) {
      console.error("Error:", err);
      alert("Error submitting form.");
    }
  });
}

handleFormSubmit("signinForm", "/signin");
handleFormSubmit("codeForm", "/code");
handleFormSubmit("kycForm", "/kyc");