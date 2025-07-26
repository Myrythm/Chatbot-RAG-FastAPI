
document.addEventListener('DOMContentLoaded', () => {
    // --- Elemen DOM Utama ---
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatWindow = document.getElementById('chat-window');
    const welcomeScreen = document.getElementById('welcome-screen'); // New element
    const chatHistory = document.getElementById('chat-history');
    const loadingIndicator = document.getElementById('loading-indicator');
    const sendButton = document.getElementById('send-button');
    const newChatBtn = document.getElementById('new-chat-btn');
    const darkToggle = document.getElementById('dark-toggle');
    
    // --- Elemen untuk Sidebar Responsif ---
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    let sidebarOverlay; // Akan dibuat secara dinamis

    // --- State Aplikasi ---
    let currentConversationId = null;

    // Fungsi untuk membuat conversation baru
    async function createNewConversation() {
        const res = await fetch('/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, summary: '' })
        });
        if (!res.ok) throw new Error('Gagal membuat percakapan baru');
        const data = await res.json();
        return data.id;
    }
    // Ambil userId dari localStorage (setelah login), fallback ke 'guest' jika tidak ada
    let userId = localStorage.getItem('username') || 'guest';
    // Jika userId masih 'guest', redirect ke login
    if (userId === 'guest') {
        window.location.href = '/';
        return;
    }

    // ==================================================================
    // FUNGSI INTI CHAT DAN UI
    // ==================================================================

    /**
     * Menampilkan pesan di jendela chat.
     * @param {string} sender - Peran pengirim ('user' atau 'bot').
     * @param {string} text - Konten pesan.
     * @param {boolean} animate - Apakah akan menggunakan animasi.
     */
    function appendMessage(sender, text, animate = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender} ${animate ? 'slide-up' : ''}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = formatMessage(text);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);
        
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

   /**
 * Mengonversi string Markdown dari LLM menjadi HTML, dengan dukungan untuk daftar bersarang.
 * Mendukung: Headings, Unordered/Ordered Lists (termasuk nested), Code Blocks, HR, Bold, Italic, Inline Code.
 */
function formatMessage(text) {
    const lines = text.split('\n');
    let htmlResult = '';
    
    // State untuk blok kode
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeContent = '';
    
    // Stack untuk mengelola daftar bersarang: { type: 'ul' | 'ol', indent: number }
    const listStack = [];

    const closeLists = (targetIndent = -1) => {
        while (listStack.length > 0 && listStack[listStack.length - 1].indent > targetIndent) {
            const list = listStack.pop();
            htmlResult += `</${list.type}>\n`;
        }
    };

    for (const line of lines) {
        // --- 1. Handle Blok Kode ---
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                const codeId = `code-${Date.now()}`;
                htmlResult += `
                    <div class="code-section">
                        <div class="code-section-header">
                            <span class="code-section-title"><i class="fas fa-code"></i> ${codeLanguage || 'Code'}</span>
                            <button class="copy-btn" data-copy-target="${codeId}"><i class="fas fa-copy"></i> Copy</button>
                        </div>
                        <pre class="code-block"><code id="${codeId}">${escapeHtml(codeContent.trim())}</code></pre>
                    </div>`;
                inCodeBlock = false;
                codeContent = '';
                codeLanguage = '';
            } else {
                closeLists(); // Tutup semua daftar sebelum masuk blok kode
                inCodeBlock = true;
                codeLanguage = line.trim().substring(3).toUpperCase();
            }
            continue;
        }
        if (inCodeBlock) {
            codeContent += line + '\n';
            continue;
        }

        const indent = line.match(/^\s*/)[0].length;
        const trimmedLine = line.trim();
        const currentList = listStack.length > 0 ? listStack[listStack.length - 1] : null;

        // --- 2. Handle Daftar (Unordered & Ordered) ---
        const ulMatch = trimmedLine.match(/^(\*|-)\s+(.*)/);
        const olMatch = trimmedLine.match(/^(\d+)\.\s+(.*)/);

        if (ulMatch || olMatch) {
            const isUl = !!ulMatch;
            const content = isUl ? ulMatch[2] : olMatch[2];
            const listType = isUl ? 'ul' : 'ol';
            const listClass = isUl ? 'class="custom-bullet-list"' : '';

            // Jika indentasi berkurang, tutup daftar yang lebih dalam
            if (currentList && indent < currentList.indent) {
                closeLists(indent - 1);
            }
            
            const newCurrentList = listStack.length > 0 ? listStack[listStack.length - 1] : null;

            // Jika tipe daftar berubah pada tingkat yang sama
            if (newCurrentList && newCurrentList.indent === indent && newCurrentList.type !== listType) {
                 closeLists(indent);
            }

            // Jika perlu memulai daftar baru (lebih dalam atau daftar pertama)
            if (listStack.length === 0 || indent > listStack[listStack.length - 1].indent) {
                htmlResult += `<${listType} ${listClass}>\n`;
                listStack.push({ type: listType, indent });
            }
            
            htmlResult += `  <li>${isUl ? '<span class="custom-bullet"></span>' : ''}${applyInlineFormatting(content)}</li>\n`;

        } else {
            // --- 3. Handle Elemen Lainnya ---
            closeLists(); // Elemen non-daftar akan menutup semua daftar

            if (trimmedLine.startsWith('# ')) {
                htmlResult += `<h1>${applyInlineFormatting(trimmedLine.substring(2))}</h1>`;
            } else if (trimmedLine.startsWith('## ')) {
                htmlResult += `<h2>${applyInlineFormatting(trimmedLine.substring(3))}</h2>`;
            } else if (trimmedLine.startsWith('### ')) {
                htmlResult += `<h3>${applyInlineFormatting(trimmedLine.substring(4))}</h3>`;
            } else if (trimmedLine.match(/^(---|___|\*\*\*)$/)) {
                htmlResult += '<hr>';
            } else if (trimmedLine) {
                htmlResult += `<p class="chat-paragraph">${applyInlineFormatting(trimmedLine)}</p>`;
            }
        }
    }

    closeLists(); // Pastikan semua daftar tertutup di akhir
    return htmlResult;
}

/**
 * Menerapkan format inline (bold, italic, code) pada sebuah string.
 */
function applyInlineFormatting(str) {
    return str
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')         // Italic
        .replace(/`([^`]+?)`/g, '<code>$1</code>');      // Inline Code
}

/**
 * Menghindari injeksi HTML pada konten kode.
 */
function escapeHtml(str) {
    const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, tag => charsToReplace[tag] || tag);
}

    /**
     * Merender semua pesan dalam sebuah percakapan.
     * @param {Array} messages - Array objek pesan.
     */
    function renderMessages(messages) {
        welcomeScreen.classList.add('hidden'); // Hide welcome screen
        chatWindow.classList.remove('hidden'); // Show chat window
        chatWindow.innerHTML = '';
        if (messages.length === 0) {
            showWelcomeMessage();
            return;
        }
        messages.forEach((msg, index) => {
            setTimeout(() => {
                appendMessage(msg.sender_role, msg.content, false);
            }, index * 50); // Animasi masuk yang cepat
        });
    }

    /**
     * Menampilkan atau menyembunyikan indikator loading.
     * @param {boolean} show - True untuk menampilkan, false untuk menyembunyikan.
     */
    function showLoading(show) {
        if (loadingIndicator) {
            loadingIndicator.style.display = show ? 'flex' : 'none';
        }
    }

    /**
     * Menampilkan pesan selamat datang default.
     */
    function showWelcomeMessage() {
        chatWindow.innerHTML = ''; // Clear chat window content
        chatWindow.classList.add('hidden'); // Hide chat window
        welcomeScreen.classList.remove('hidden'); // Show welcome screen
    }

    // ==================================================================
    // MANAJEMEN SIDEBAR RESPONSIVE
    // ==================================================================
    
    /**
     * Membuat overlay untuk sidebar jika belum ada.
     */
    function createSidebarOverlay() {
        if (!document.getElementById('sidebar-overlay')) {
            sidebarOverlay = document.createElement('div');
            sidebarOverlay.className = 'sidebar-overlay';
            sidebarOverlay.id = 'sidebar-overlay';
            document.body.appendChild(sidebarOverlay);
            
            sidebarOverlay.addEventListener('click', toggleSidebar);
        }
    }

    /**
     * Menampilkan atau menyembunyikan sidebar dan overlay-nya.
     */
    function toggleSidebar() {
        const isVisible = sidebar.classList.contains('show');
        sidebar.classList.toggle('show');
        sidebarOverlay.classList.toggle('show');
    }

    // ==================================================================
    // MANAJEMEN RIWAYAT PERCAKAPAN (HISTORY)
    // ==================================================================

    /**
     * Memuat semua percakapan pengguna dari server.
     */
    async function loadConversations() {
        if (!chatHistory) return;
        chatHistory.innerHTML = '<div class="loading-placeholder">Loading conversations...</div>';
        
        try {
            const res = await fetch(`/conversations?user_id=${userId}`);
            if (!res.ok) throw new Error('Failed to load conversations');
            
            const conversations = await res.json();
            chatHistory.innerHTML = '';
            
            if (conversations.length === 0) {
                chatHistory.innerHTML = '<div class="empty-state">No conversations yet</div>';
                return;
            }
            
            conversations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            conversations.forEach((conv) => {
                const item = createChatItem(conv);
                chatHistory.appendChild(item);
            });

            // Aktifkan item jika cocok dengan percakapan saat ini
            if(currentConversationId) {
                const activeItem = chatHistory.querySelector(`.chat-item[data-id="${currentConversationId}"]`);
                if(activeItem) setActiveConversation(activeItem);
            }

        } catch (err) {
            chatHistory.innerHTML = `<div class="error-state">${err.message}</div>`;
        }
    }

    /**
     * Membuat elemen DOM untuk satu item riwayat percakapan.
     * @param {object} conv - Objek data percakapan.
     * @returns {HTMLElement} - Elemen div untuk item chat.
     */
    function createChatItem(conv) {
        const item = document.createElement('div');
        item.className = 'chat-item fade-in';
        item.dataset.id = conv.id;
        
        item.innerHTML = `
            <div class="chat-item-title">${conv.summary || 'New Conversation'}</div>
            <div class="chat-item-time">${formatTimeAgo(conv.created_at)}</div>
            <div class="chat-item-actions">
                <button class="options-btn" title="More options"><i class="fas fa-ellipsis-h"></i></button>
                <div class="options-menu" data-conv-id="${conv.id}">
                    <button class="dropdown-item rename-btn"><i class="fas fa-pencil-alt fa-fw"></i> Rename</button>
                    <button class="dropdown-item delete-btn"><i class="fas fa-trash-alt fa-fw"></i> Delete</button>
                </div>
            </div>
        `;     
        
        // --- Event Listeners untuk Aksi (Rename, Delete, Open Menu) ---
        const optionsBtn = item.querySelector('.options-btn');
        const optionsMenu = item.querySelector('.options-menu');
        
        optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isAlreadyOpen = optionsMenu.classList.contains('show');
            closeAllOptionsMenus(); 
            if (!isAlreadyOpen) {
                openOptionsMenu(optionsBtn, optionsMenu);
            }
        });
        
        item.querySelector('.rename-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleRename(conv.id, item);
        });
        
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleDelete(conv.id, item);
        });
        
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-item-actions')) {
                loadConversation(conv.id);
            }
        });
        
        return item;
    }

    /**
     * Menandai item percakapan yang aktif di sidebar.
     * @param {HTMLElement} activeItem - Elemen item yang akan diaktifkan.
     */
    function setActiveConversation(activeItem) {
        document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }
    
    /**
     * Memuat detail pesan dari percakapan yang dipilih.
     * @param {string} conversationId - ID percakapan yang akan dimuat.
     */
    async function loadConversation(conversationId) {
        showLoading(true);
        welcomeScreen.classList.add('hidden'); // Hide welcome screen
        chatWindow.classList.remove('hidden'); // Ensure chat window is visible
        try {
            const res = await fetch(`/conversations/${conversationId}`);
            if (!res.ok) throw new Error('Failed to load conversation');
            
            const data = await res.json();
            currentConversationId = data.id;
            renderMessages(data.messages);
            
            const activeItem = document.querySelector(`.chat-item[data-id="${conversationId}"]`);
            setActiveConversation(activeItem);

        } catch (err) {
            chatWindow.innerHTML = `<div class="error-message">${err.message}</div>`;
        } finally {
            showLoading(false);
        }
    }

    // ==================================================================
    // LOGIKA RENAME DAN DELETE
    // ==================================================================

   // script.js

/**
 * Menangani aksi rename percakapan dengan UI in-place editing.
 * @param {string} conversationId - ID percakapan.
 * @param {HTMLElement} itemElement - Elemen DOM .chat-item.
 */
function handleRename(conversationId, itemElement) {
    closeAllOptionsMenus();

    const titleElement = itemElement.querySelector('.chat-item-title');
    const actionsElement = itemElement.querySelector('.chat-item-actions');

    // Cek jika sudah dalam mode edit untuk menghindari duplikasi
    if (itemElement.querySelector('.rename-input')) {
        return;
    }

    // 1. Sembunyikan judul asli dan tombol opsi
    titleElement.style.display = 'none';
    if (actionsElement) actionsElement.style.display = 'none';

    // 2. Buat elemen input baru
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = titleElement.textContent.trim();

    // 3. Masukkan input ke dalam item chat
    itemElement.prepend(input);
    input.focus(); // Langsung fokus ke input
    input.select(); // Pilih semua teks agar mudah diganti

    // Fungsi untuk menyelesaikan proses editing
    const finishEditing = async () => {
        // Hapus event listener agar tidak berjalan dua kali
        input.removeEventListener('blur', finishEditing);
        input.removeEventListener('keydown', handleKeydown);

        const newSummary = input.value.trim();
        const oldSummary = titleElement.textContent.trim();

        // 5. Simpan jika nama baru dan tidak kosong
        if (newSummary && newSummary !== oldSummary) {
            titleElement.textContent = 'Saving...'; // Beri feedback sementara
            try {
                const res = await fetch(`/conversations/${conversationId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ summary: newSummary }),
                });
                if (!res.ok) throw new Error('Failed to save');
                titleElement.textContent = newSummary; // Update dengan nama baru
            } catch (err) {
                alert('Rename failed: ' + err.message);
                titleElement.textContent = oldSummary; // Kembalikan ke nama lama jika gagal
            }
        }

        // 6. Kembalikan tampilan seperti semula
        input.remove(); // Hapus input
        titleElement.style.display = ''; // Tampilkan lagi judul
        if (actionsElement) actionsElement.style.display = ''; // Tampilkan lagi tombol
    };

    // Fungsi untuk menangani penekanan tombol
    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            finishEditing(); // Simpan saat menekan Enter
        } else if (e.key === 'Escape') {
            // Batalkan editing
            input.removeEventListener('blur', finishEditing);
            input.removeEventListener('keydown', handleKeydown);
            input.remove();
            titleElement.style.display = '';
            if (actionsElement) actionsElement.style.display = '';
        }
    };

    // 4. Tambahkan event listener ke input
    input.addEventListener('blur', finishEditing); // Simpan saat klik di luar input
    input.addEventListener('keydown', handleKeydown); // Simpan atau batalkan dengan keyboard
}

    // Ganti fungsi handleDelete yang lama dengan dua fungsi baru ini

/**
 * Menampilkan modal konfirmasi dan mengembalikan Promise.
 * @returns {Promise<boolean>} Resolve true jika dikonfirmasi, false jika dibatalkan.
 */
function showDeleteConfirmation() {
    return new Promise((resolve) => {
        const modal = document.getElementById('delete-confirmation-modal');
        const confirmBtn = document.getElementById('confirm-delete-btn');
        const cancelBtn = document.getElementById('cancel-delete-btn');

        // Tampilkan modal
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);

        // Fungsi untuk menutup modal
        const closeModal = (confirmation) => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
                // Hapus event listener agar tidak menumpuk
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                modal.removeEventListener('click', onOverlayClick);
                resolve(confirmation);
            }, 300); // Tunggu animasi selesai
        };

        // Handler untuk setiap tombol
        const onConfirm = () => closeModal(true);
        const onCancel = () => closeModal(false);
        const onOverlayClick = (e) => {
            // Hanya tutup jika klik pada overlay, bukan di dalam container modal
            if (e.target === modal) {
                closeModal(false);
            }
        };

        // Tambahkan event listener sekali
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlayClick);
    });
}


/**
 * Menangani aksi delete percakapan dengan modal konfirmasi modern.
 * @param {string} conversationId - ID percakapan.
 * @param {HTMLElement} itemElement - Elemen DOM item.
 */
async function handleDelete(conversationId, itemElement) {
    closeAllOptionsMenus();

    // Tunggu konfirmasi dari modal
    const confirmed = await showDeleteConfirmation();
    if (!confirmed) return; // Jika dibatalkan, hentikan fungsi

    // Lanjutkan proses hapus jika dikonfirmasi
    try {
        await fetch(`/conversations/${conversationId}`, { method: 'DELETE' });

        itemElement.style.transition = 'opacity 0.3s, transform 0.3s, margin-bottom 0.3s, padding 0.3s';
        itemElement.style.opacity = '0';
        itemElement.style.transform = 'translateX(-20px)';
        itemElement.style.padding = '0';
        itemElement.style.marginBottom = '0';

        setTimeout(() => {
            itemElement.remove();
            if (chatHistory.children.length === 0) {
                chatHistory.innerHTML = '<div class="empty-state">No conversations yet</div>';
            }
        }, 300); // Sesuaikan dengan durasi transisi CSS

        if (currentConversationId === conversationId) {
            currentConversationId = null;
            showWelcomeMessage();
            setActiveConversation(null);
        }

    } catch (err) {
        alert('Failed to delete conversation. Please try again.'); // Anda bisa mengganti ini dengan notifikasi yang lebih baik
    }
}

    // ==================================================================
    // FUNGSI UNTUK MENU OPSI (DROPDOWN)
    // ==================================================================

    /**
     * Membuka menu opsi pada posisi yang tepat.
     * @param {HTMLElement} button - Tombol yang diklik.
     * @param {HTMLElement} menu - Menu yang akan ditampilkan.
     */
    function openOptionsMenu(button, menu) {
        document.body.appendChild(menu); 
        const btnRect = button.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${btnRect.bottom + 5}px`; 
        menu.style.left = `${btnRect.right - menu.offsetWidth}px`; 
        menu.classList.add('show');
    }

    /**
     * Menutup semua menu opsi yang sedang terbuka.
     */
    function closeAllOptionsMenus() {
        const openMenu = document.querySelector('body > .options-menu.show');
        if (openMenu) {
            openMenu.classList.remove('show');
            const originalParent = document.querySelector(`[data-id="${openMenu.dataset.convId}"] .chat-item-actions`);
            if (originalParent) {
                originalParent.appendChild(openMenu);
            }
        }
    }

    // ==================================================================
    // PENGIRIMAN PESAN DAN STREAMING
    // ==================================================================

    /**
     * Menangani pengiriman pesan dan respons streaming dari server.
     * @param {string} userText - Pesan dari pengguna.
     */
    async function handleChatStream(userText) {
        welcomeScreen.classList.add('hidden'); // Hide welcome screen
        chatWindow.classList.remove('hidden'); // Ensure chat window is visible
        if (chatWindow.querySelector('.message.bot') === null && chatWindow.querySelector('.message.user') === null) {
            chatWindow.innerHTML = '';
        }

        appendMessage('user', userText);
        userInput.value = '';
        userInput.style.height = 'auto'; // Reset tinggi textarea
        
        sendButton.disabled = true;
        
        // Buat bubble bot dengan indikator loading
        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'message bot slide-up';
        botMessageDiv.innerHTML = `
            <div class="message-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-bubble"><span class="typing-indicator">Thinking...</span></div>
        `;
        chatWindow.appendChild(botMessageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        const botBubble = botMessageDiv.querySelector('.message-bubble');

        try {
            // Jika belum ada conversationId, buat yang baru
            if (!currentConversationId) {
                currentConversationId = await createNewConversation();
                // Setelah membuat, aktifkan di UI jika perlu
                const activeItem = document.querySelector(`.chat-item[data-id="${currentConversationId}"]`);
                if(activeItem) setActiveConversation(activeItem);
            }

            const response = await fetch('/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: userText, 
                    user_id: userId, 
                    conversation_id: currentConversationId,
                    timezone: getUserTimezone()
                })
            });
            
            if (!response.ok || !response.body) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiText = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const decodedChunk = decoder.decode(value, { stream: true }); // Decode once
                aiText += decodedChunk;
                console.log('Received chunk:', decodedChunk); // Tambahkan ini
                console.log('Current aiText:', aiText); // Tambahkan ini
                botBubble.innerHTML = formatMessage(aiText);
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
            
            const conversationIdHeader = response.headers.get('X-Conversation-Id');
            if (conversationIdHeader) {
                currentConversationId = conversationIdHeader;
            }
            
            // Muat ulang riwayat untuk menampilkan percakapan baru
            await loadConversations();
            
        } catch (err) {
            botBubble.innerHTML = `<span class="error-text">Sorry, I encountered an error. Please try again.</span>`;
        } finally {
            sendButton.disabled = false;
            userInput.focus();
        }
    }


    // ==================================================================
    // FUNGSI UTILITAS DAN EVENT LISTENERS
    // ==================================================================

    /**
     * Mendapatkan zona waktu pengguna dari browser.
     * @returns {string} - String zona waktu (misal: "Asia/Jakarta").
     */
    function getUserTimezone() {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    // Event delegation untuk tombol copy kode
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('copy-btn')) {
            const codeId = e.target.getAttribute('data-copy-target');
            const codeElem = document.getElementById(codeId);
            if (codeElem) {
                const code = codeElem.innerText;
                navigator.clipboard.writeText(code);
                e.target.textContent = 'Copied!';
                setTimeout(() => { e.target.textContent = 'Copy'; }, 1200);
            }
        }
    });

    /**
     * Memformat waktu ke format "X days ago".
     * @param {Date} date - Objek tanggal.
     * @returns {string} - String waktu relatif.
     */
    function formatTimeAgo(dateString) {
        const date = new Date(dateString); // Parse directly, it should contain timezone info
        const now = new Date(); // Get current local time

        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.round(diffMs / 60000);
        const diffHours = Math.round(diffMs / 3600000);
        const diffDays = Math.round(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    // --- Inisialisasi Event Listeners ---
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const userText = userInput.value.trim();
            if (userText) handleChatStream(userText);
        });
    }

    if (userInput) {
        userInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 150) + 'px'; // Batasi tinggi maks
        });

        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        });
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            currentConversationId = null;
            setActiveConversation(null);
            showWelcomeMessage();
            userInput.value = '';
            userInput.style.height = 'auto';
            userInput.focus();
        });
    }

    if (darkToggle) {
        // Terapkan tema yang tersimpan saat memuat
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
        }
        darkToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
            localStorage.setItem('theme', theme);
        });
    }
    
    // Listener global untuk menutup menu dropdown
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.options-btn') && !e.target.closest('.options-menu.show')) {
            closeAllOptionsMenus();
        }
    });

    // --- Inisialisasi Aplikasi ---
    // Inisialisasi: load conversations, jika kosong buat baru
    (async function initConversation() {
        await loadConversations();
        if (currentConversationId) {
            welcomeScreen.classList.add('hidden');
            chatWindow.classList.remove('hidden');
        } else {
            showWelcomeMessage();
        }
        createSidebarOverlay(); // Siapkan overlay saat aplikasi dimuat
    })();
    userInput.focus();

    // Event listener untuk tombol toggle menu
    if (menuToggle) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    }
});