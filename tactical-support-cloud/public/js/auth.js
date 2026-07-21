function showResult(element, message, isError = false) {
  element.textContent = message;
  element.classList.add('show');
  element.classList.toggle('error', isError);
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const result = document.getElementById('loginResult');
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
    showResult(result, `Bienvenido, ${data.user.nombre}.`);
    window.location.assign(data.redirect);
  } catch (error) {
    showResult(result, error.message, true);
  }
});

document.getElementById('registerForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const result = document.getElementById('registerResult');
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo crear la cuenta.');
    showResult(result, data.message);
    form.reset();
  } catch (error) {
    showResult(result, error.message, true);
  }
});
