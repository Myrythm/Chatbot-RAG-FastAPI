document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.querySelector('.overlay');
    const sidebar = document.querySelector('.admin-sidebar');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');

    function closeMenu() {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }

    if (overlay) {
        overlay.addEventListener('click', closeMenu);
    }

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            if (!sidebar.classList.contains('open')) {
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
            }
        });
    }
    
    // Also close on nav link click
    document.querySelectorAll('.admin-nav-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });
}); 