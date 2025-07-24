// Navigasi sidebar ke section & tampilkan/hide section sesuai menu
document.addEventListener('DOMContentLoaded', function() {
  function showSection(section) {
    // Sembunyikan semua section utama
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
    // Sembunyikan section register di main
    document.getElementById('section-register').style.display = 'none';
    // Tampilkan section yang dipilih
    if (section === 'upload') {
      document.getElementById('section-upload').style.display = '';
    } else if (section === 'users') {
      document.getElementById('section-users').style.display = '';
    } else if (section === 'documents') {
      document.getElementById('section-documents').style.display = '';
    } else if (section === 'register') {
      document.getElementById('section-register').style.display = '';
    }
  }
  // Default tampilkan upload
  showSection('upload');

  document.getElementById('nav-upload')?.addEventListener('click', function(e) {
    e.preventDefault();
    showSection('upload');
    setActiveNav(this);
  });
  document.getElementById('nav-users')?.addEventListener('click', function(e) {
    e.preventDefault();
    showSection('users');
    setActiveNav(this);
  });
  document.getElementById('nav-documents')?.addEventListener('click', function(e) {
    e.preventDefault();
    showSection('documents');
    setActiveNav(this);
  });
  document.getElementById('nav-register')?.addEventListener('click', function(e) {
    e.preventDefault();
    showSection('register');
    setActiveNav(this);
  });
  function setActiveNav(link) {
    document.querySelectorAll('.admin-nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
  }
});
// Cek role admin & tampilkan info
window.onload = function() {
  const token = localStorage.getItem('access_token');
  const role = localStorage.getItem('user_role');
  if (!token || role !== 'admin') {
    window.location.href = '/';
    return;
  }
  const infoDiv = document.getElementById('admin-info');
  if (infoDiv) {
    const username = localStorage.getItem('username') || 'admin';
    infoDiv.innerHTML = `<i class="fas fa-user-shield"></i> Login sebagai <b>${username}</b> (admin)`;
  }
};

// === USER CRUD ===
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('section-users')) {
    fetchAndRenderUsers();
    // Event delegation for edit & delete buttons
    document.getElementById('users-table-body').addEventListener('click', function(e) {
      if (e.target.classList.contains('btn-edit-user')) {
        openEditUserModal(e.target.dataset.userid);
      } else if (e.target.classList.contains('btn-delete-user')) {
        deleteUser(e.target.dataset.userid, e.target.dataset.username);
      }
    });
    // Modal close
    document.getElementById('close-edit-user-modal').onclick = closeEditUserModal;
    window.onclick = function(event) {
      const modal = document.getElementById('edit-user-modal');
      if (event.target === modal) closeEditUserModal();
    };
    // Edit user form submit
    document.getElementById('edit-user-form').onsubmit = submitEditUser;
  }
});

async function fetchAndRenderUsers() {
  const tbody = document.getElementById('users-table-body');
  const msg = document.getElementById('users-message');
  tbody.innerHTML = '';
  msg.textContent = '';
  try {
  const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') }
    });
    if (!res.ok) throw new Error('Gagal mengambil data user');
    const users = await res.json();
    if (!Array.isArray(users) || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">Tidak ada user</td></tr>';
      return;
    }
    users.forEach(user => {
      tbody.innerHTML += `
        <tr>
          <td>${user.id}</td>
          <td>${user.username}</td>
          <td>${user.role}</td>
          <td>${user.is_active ? 'Aktif' : 'Nonaktif'}</td>
          <td>
            <button class="btn-glass btn-edit-user" data-userid="${user.id}">Edit</button>
            <button class="btn-glass btn-delete-user" data-userid="${user.id}" data-username="${user.username}">Hapus</button>
          </td>
        </tr>`;
    });
  } catch (err) {
    msg.textContent = err.message || 'Gagal mengambil data user';
  }
}

function openEditUserModal(userId) {
  // Fetch user data from table row (or optionally from API)
  const row = [...document.querySelectorAll('#users-table-body tr')].find(tr => tr.querySelector('.btn-edit-user')?.dataset.userid == userId);
  if (!row) return;
  document.getElementById('edit-user-id').value = userId;
  document.getElementById('edit-username').value = row.children[1].textContent;
  document.getElementById('edit-role').value = row.children[2].textContent;
  document.getElementById('edit-active').value = row.children[3].textContent === 'Aktif' ? 'true' : 'false';
  document.getElementById('edit-password').value = '';
  document.getElementById('edit-user-message').textContent = '';
  document.getElementById('edit-user-modal').style.display = 'block';
}
function closeEditUserModal() {
  document.getElementById('edit-user-modal').style.display = 'none';
}

async function submitEditUser(e) {
  e.preventDefault();
  const id = document.getElementById('edit-user-id').value;
  const username = document.getElementById('edit-username').value.trim();
  const password = document.getElementById('edit-password').value;
  const role = document.getElementById('edit-role').value;
  const is_active = document.getElementById('edit-active').value === 'true';
  const msg = document.getElementById('edit-user-message');
  msg.textContent = 'Menyimpan...';
  try {
    const body = { username, role, is_active };
    if (password) body.password = password;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('access_token')
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let err = 'Gagal update user';
      try { err = (await res.json()).detail || err; } catch {}
      throw new Error(err);
    }
    msg.textContent = 'User berhasil diupdate!';
    closeEditUserModal();
    fetchAndRenderUsers();
  } catch (err) {
    msg.textContent = err.message;
  }
}

async function deleteUser(userId, username) {
  if (!confirm(`Hapus user '${username}'?`)) return;
  const msg = document.getElementById('users-message');
  msg.textContent = 'Menghapus...';
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') }
    });
    if (!res.ok) {
      let err = 'Gagal hapus user';
      try { err = (await res.json()).detail || err; } catch {}
      throw new Error(err);
    }
    msg.textContent = 'User berhasil dihapus!';
    fetchAndRenderUsers();
  } catch (err) {
    msg.textContent = err.message;
  }
}

// Upload dokumen (dummy, backend endpoint perlu dibuat)
document.getElementById('upload-form').onsubmit = async function(e) {
  e.preventDefault();
  const fileInput = document.getElementById('doc-file');
  const statusDiv = document.getElementById('upload-status');
  statusDiv.textContent = '';
  if (!fileInput.files.length) {
    statusDiv.textContent = 'Pilih file terlebih dahulu.';
    return;
  }
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  try {
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') },
      body: formData
    });
    if (!res.ok) {
      const data = await res.json();
      statusDiv.textContent = data.detail || 'Upload gagal';
      return;
    }
    statusDiv.textContent = 'Upload berhasil!';
  } catch (err) {
    statusDiv.textContent = 'Network error';
  }
};

// Register user baru oleh admin
document.addEventListener('DOMContentLoaded', function() {
  const registerForm = document.getElementById('register-user-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const username = document.getElementById('reg-username').value.trim();
      const password = document.getElementById('reg-password').value;
      const role = document.getElementById('reg-role').value;
      const messageDiv = document.getElementById('register-user-message');
      messageDiv.textContent = 'Registering...';
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch('/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ username, password, role })
        });
        if (!res.ok) {
          let errMsg = 'Register failed';
          try {
            const err = await res.json();
            errMsg = err.detail || errMsg;
          } catch {}
          throw new Error(errMsg);
        }
        messageDiv.textContent = 'User berhasil dibuat!';
        registerForm.reset();
      } catch (err) {
        messageDiv.textContent = 'Gagal: ' + err.message;
      }
    });
  }
});

function logout() {
  localStorage.clear();
  window.location.href = '/';
}
