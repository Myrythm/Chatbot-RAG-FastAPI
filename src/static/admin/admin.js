// Navigasi sidebar ke section & tampilkan/hide section sesuai menu
document.addEventListener('DOMContentLoaded', function() {
  const navLinks = document.querySelectorAll('.admin-nav-link');
  const sections = document.querySelectorAll('.admin-section');
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const sidebar = document.querySelector('.admin-sidebar');

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
  }

  function showSection(sectionId) {
    sections.forEach(section => {
      if (section.id === sectionId) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });
  }

  function setActiveNav(activeLink) {
    navLinks.forEach(link => {
      link.classList.remove('active');
    });
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }

  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const sectionName = this.getAttribute('href').substring(1);
      showSection(`section-${sectionName}`);
      setActiveNav(this);

      // Special handling for fetching data on click
      if (sectionName === 'users') {
        fetchAndRenderUsers();
      } else if (sectionName === 'documents') {
        fetchAndRenderDocuments();
      }
    });
  });

  // Initial state
  const initialActiveLink = document.querySelector('.admin-nav-link.active');
  if (initialActiveLink) {
    const initialSectionName = initialActiveLink.getAttribute('href').substring(1);
    showSection(`section-${initialSectionName}`);
  } else {
    // Fallback if no link is active by default in the HTML
    showSection('section-upload');
    const uploadLink = document.getElementById('nav-upload');
    if (uploadLink) {
      uploadLink.classList.add('active');
    }
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
    // Initial fetch is now handled by nav click, but we can keep this for safety.
    // fetchAndRenderUsers(); 
    
    // Event delegation for edit & delete buttons
    document.getElementById('users-table-body').addEventListener('click', function(e) {
      const editButton = e.target.closest('.btn-edit-user');
      if (editButton) {
        openEditUserModal(editButton.dataset.userid);
        return;
      }
      
      const deleteButton = e.target.closest('.btn-delete-user');
      if (deleteButton) {
        deleteUser(deleteButton.dataset.userid, deleteButton.dataset.username);
      }
    });
    // Modal close
    document.getElementById('close-edit-user-modal').onclick = closeEditUserModal;
    window.onclick = function(event) {
      const editModal = document.getElementById('edit-user-modal');
      if (event.target === editModal) closeEditUserModal();
      
      const confirmModal = document.getElementById('confirm-modal');
      if (event.target === confirmModal) {
          confirmModal.classList.remove('active');
      }
    };
    // Edit user form submit
    document.getElementById('edit-user-form').onsubmit = submitEditUser;
  }
});

// --- Universal Confirmation Modal Logic ---
const confirmModal = document.getElementById('confirm-modal');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalText = document.getElementById('confirm-modal-text');
const confirmBtn = document.getElementById('confirm-modal-confirm');
const cancelBtn = document.getElementById('confirm-modal-cancel');
let confirmCallback = null;

function showConfirmModal(title, text, confirmButtonClass, onConfirm) {
    confirmModalTitle.textContent = title;
    confirmModalText.textContent = text;
    confirmBtn.className = 'btn-glass'; // Reset classes
    if (confirmButtonClass) {
        confirmBtn.classList.add(confirmButtonClass);
    }
    confirmModal.classList.add('active');
    confirmCallback = onConfirm;
}

confirmBtn.addEventListener('click', () => {
    if (confirmCallback) {
        confirmCallback();
    }
    confirmModal.classList.remove('active');
});

cancelBtn.addEventListener('click', () => {
    confirmModal.classList.remove('active');
});


async function fetchAndRenderUsers() {
  const tbody = document.getElementById('users-table-body');
  const msg = document.getElementById('users-message');
  if (!tbody) return; // Exit if table body not on page
  tbody.innerHTML = ''; // Hilangkan "Memuat data user..."
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
    tbody.innerHTML = ''; // Pastikan tabel bersih sebelum menambahkan baris baru
    users.forEach(user => {
      tbody.innerHTML += `
        <tr>
          <td>${user.id}</td>
          <td>${user.username}</td>
          <td>${user.role}</td>
          <td>${user.is_active ? 'Aktif' : 'Nonaktif'}</td>
          <td class="actions-cell">
            <button class="btn-glass btn-icon btn-edit-user" title="Edit User" data-userid="${user.id}"><i class="fas fa-pencil-alt"></i></button>
            <button class="btn-glass btn-icon btn-delete-user" title="Hapus User" data-userid="${user.id}" data-username="${user.username}"><i class="fas fa-trash-alt"></i></button>
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
  document.getElementById('edit-user-modal').classList.add('active');
}
function closeEditUserModal() {
  document.getElementById('edit-user-modal').classList.remove('active');
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
    showConfirmModal(
        'Hapus User',
        `Apakah Anda yakin ingin menghapus user '${username}'? Aksi ini tidak dapat dibatalkan.`,
        'btn-delete-user',
        async () => {
            const msg = document.getElementById('users-message');
            msg.textContent = 'Menghapus...';
            
            const deleteButton = document.querySelector(`.btn-delete-user[data-userid="${userId}"]`);
            const originalIcon = deleteButton ? deleteButton.innerHTML : '<i class="fas fa-trash-alt"></i>';
            if (deleteButton) {
                deleteButton.disabled = true;
                deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

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
                if (deleteButton) {
                    deleteButton.innerHTML = originalIcon;
                    deleteButton.disabled = false;
                }
            }
        }
    );
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

  if (!loading) return; // Exit if elements not on page

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
        <td class="actions-cell"><button class="btn-glass btn-icon btn-delete-doc" title="Hapus Dokumen" data-docid="${doc.id}"><i class="fas fa-trash-alt"></i></button></td>
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
    // fetchAndRenderDocuments(); // Data is now fetched on nav click
    document.getElementById('documents-table-body').addEventListener('click', async function(e) {
      const deleteButton = e.target.closest('.btn-delete-doc');
      if (deleteButton) {
        const docId = deleteButton.dataset.docid;
        const fileName = deleteButton.closest('tr').querySelector('td').textContent;
        
        showConfirmModal(
            'Hapus Dokumen',
            `Apakah Anda yakin ingin menghapus dokumen '${fileName}'? Aksi ini tidak dapat dibatalkan.`,
            'btn-delete-doc',
            async () => {
                const originalIcon = deleteButton.innerHTML;
                deleteButton.disabled = true;
                deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                try {
                    const res = await fetch(`/api/admin/documents/${docId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') }
                    });
                    if (!res.ok) throw new Error('Gagal hapus dokumen');
                    await fetchAndRenderDocuments();
                } catch (err) {
                    deleteButton.innerHTML = originalIcon;
                    deleteButton.disabled = false;
                    // Optionally show an error message next to the button or in a general message area
                }
            }
        );
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
