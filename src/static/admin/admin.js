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

// === UPLOAD DOKUMEN INTERAKTIF ===
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('doc-file');
const uploadForm = document.getElementById('upload-form');
const uploadStatus = document.getElementById('upload-status');
const uploadProgress = document.getElementById('upload-progress');
const progressBarFill = document.getElementById('progress-bar-fill');

if (dropArea && fileInput) {
  dropArea.addEventListener('click', () => fileInput.click());
  dropArea.addEventListener('dragover', e => {
    e.preventDefault();
    dropArea.classList.add('dragover');
  });
  dropArea.addEventListener('dragleave', e => {
    e.preventDefault();
    dropArea.classList.remove('dragover');
  });
  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      document.getElementById('drop-message').textContent = fileInput.files[0].name;
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      document.getElementById('drop-message').textContent = fileInput.files[0].name;
    }
  });
}

uploadForm.onsubmit = async function(e) {
  e.preventDefault();
  if (!fileInput.files.length) {
    uploadStatus.textContent = 'Pilih file terlebih dahulu.';
    return;
  }
  uploadStatus.textContent = '';
  uploadProgress.style.display = 'block';
  progressBarFill.style.width = '0%';
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/upload');
    xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('access_token'));
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBarFill.style.width = percent + '%';
      }
    };
    xhr.onload = async function() {
      uploadProgress.style.display = 'none';
      if (xhr.status === 200) {
        uploadStatus.innerHTML = '<span style="color:green;">&#10003; Upload berhasil!</span>';
        fileInput.value = '';
        document.getElementById('drop-message').textContent = 'Drag & drop PDF di sini atau klik untuk memilih file';
        await fetchAndRenderDocuments();
      } else {
        let msg = 'Upload gagal';
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch {}
        uploadStatus.innerHTML = '<span style="color:red;">&#10060; ' + msg + '</span>';
      }
    };
    xhr.onerror = function() {
      uploadProgress.style.display = 'none';
      uploadStatus.innerHTML = '<span style="color:red;">&#10060; Network error</span>';
    };
    xhr.send(formData);
  } catch (err) {
    uploadProgress.style.display = 'none';
    uploadStatus.innerHTML = '<span style="color:red;">&#10060; ' + (err.message || 'Upload gagal') + '</span>';
  }
};

// === DOKUMEN LIST ===
async function fetchAndRenderDocuments() {
  const loading = document.getElementById('documents-loading');
  const table = document.getElementById('documents-table');
  const tbody = document.getElementById('documents-table-body');
  const empty = document.getElementById('documents-empty');
  loading.style.display = 'block';
  table.style.display = 'none';
  empty.style.display = 'none';
  tbody.innerHTML = '';
  try {
    const res = await fetch('/api/admin/documents', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') }
    });
    if (!res.ok) throw new Error('Gagal mengambil data dokumen');
    const docs = await res.json();
    if (!Array.isArray(docs) || docs.length === 0) {
      empty.style.display = 'block';
      loading.style.display = 'none';
      return;
    }
    docs.forEach(doc => {
      tbody.innerHTML += `<tr>
        <td>${doc.filename}</td>
        <td>${new Date(doc.uploaded_at).toLocaleString()}</td>
        <td>${doc.uploaded_by}</td>
        <td>${doc.total_chunks || 0}</td>
        <td><button class="btn-glass btn-delete-doc" data-docid="${doc.id}">&#128465; Hapus</button></td>
      </tr>`;
    });
    table.style.display = '';
    loading.style.display = 'none';
  } catch (err) {
    loading.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = err.message || 'Gagal mengambil data dokumen';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('section-documents')) {
    fetchAndRenderDocuments();
    document.getElementById('documents-table-body').addEventListener('click', async function(e) {
      if (e.target.classList.contains('btn-delete-doc')) {
        const docid = e.target.dataset.docid;
        if (!confirm('Hapus dokumen ini?')) return;
        e.target.disabled = true;
        e.target.textContent = 'Menghapus...';
        try {
          const res = await fetch(`/api/admin/documents/${docid}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') }
          });
          if (!res.ok) throw new Error('Gagal hapus dokumen');
          await fetchAndRenderDocuments();
        } catch (err) {
          e.target.textContent = 'Gagal';
        }
      }
    });
  }
});

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
