document.addEventListener('DOMContentLoaded', function() {
  
  const passwordInput = document.getElementById('login-password');
  const passwordToggle = document.getElementById('password-toggle');
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('login-username');
  const loginCard = document.querySelector('.login-card');
  const errorDiv = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const spinner = document.getElementById('loading-spinner');
  const btnText = document.querySelector('.btn-text');
  const inputs = document.querySelectorAll('.form-input');

  // Auto-focus on username field
  usernameInput.focus();

  // Password toggle functionality
  if (passwordToggle) {
    passwordToggle.addEventListener('click', function() {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      this.classList.toggle('fa-eye-slash');
      this.classList.toggle('fa-eye');
    });
  }

  // Form submission
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      
      // Clear previous error
      errorDiv.classList.remove('show');
      errorDiv.textContent = '';
      
      // Show loading state
      loginBtn.disabled = true;
      spinner.style.display = 'inline-block';
      btnText.textContent = 'Signing In...';

      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      try {
        // --- GANTI URL INI DENGAN ENDPOINT API LOGIN ANDA ---
        const response = await fetch('/auth/login', { 
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || 'Login failed due to an unknown error.');
        }

        if (!data.access_token || !data.role) {
          throw new Error('Invalid response from server.');
        }

        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('user_role', data.role);
        localStorage.setItem('username', username);
        
        btnText.textContent = 'Success!';
        loginBtn.style.background = 'var(--success-color)';
        
        setTimeout(() => {
          if (data.role === 'admin') {
            window.location.href = '/admin';
          } else {
            window.location.href = '/chat';
          }
        }, 500);

      } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.add('show');
        
        loginBtn.disabled = false;
        spinner.style.display = 'none';
        btnText.textContent = 'Sign In';
        
        loginCard.classList.add('shake-animation');
        setTimeout(() => {
          loginCard.classList.remove('shake-animation');
        }, 500);
      }
    });
  }
  
  // Enhanced input interactions
  inputs.forEach(input => {
    const wrapper = input.parentElement;
    input.addEventListener('focus', function() {
      wrapper.style.transform = 'scale(1.02)';
    });
    
    input.addEventListener('blur', function() {
      wrapper.style.transform = 'scale(1)';
    });
  });

});

// Coming soon functionality (Global scope)
function showComingSoon() {
  alert('This feature is coming soon!');
}