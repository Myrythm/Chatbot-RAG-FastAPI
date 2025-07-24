document.getElementById('login-form').onsubmit = async function(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');
  errorDiv.textContent = '';

  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: formData
    });
    if (!res.ok) {
      const data = await res.json();
      errorDiv.textContent = data.detail || 'Login failed';
      return;
    }
    const data = await res.json();
    // Debug log
    console.log('Login response:', data);
    if (!data.access_token || !data.role) {
      errorDiv.textContent = 'Login response invalid!';
      alert('Login response invalid: ' + JSON.stringify(data));
      return;
    }
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user_role', data.role);
    localStorage.setItem('username', username);
    // Redirect ke halaman sesuai role
    if (data.role === 'admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = '/chat';
    }
  } catch (err) {
    errorDiv.textContent = 'Network error';
  }
};
