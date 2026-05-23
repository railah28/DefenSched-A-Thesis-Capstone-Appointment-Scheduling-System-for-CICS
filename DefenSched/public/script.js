'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    
    // ============================================================
    // 1. STATE
    // ============================================================
    let currentUser = null;
    
    const ROLES = {
        admin: {
            label: 'Research Coordinator',
            nav: [
                { id: 'dashboard', icon: 'fa-chart-line', label: 'Dashboard' },
                { id: 'scheduling', icon: 'fa-calendar-plus', label: 'Global Schedules' },
                { id: 'users', icon: 'fa-users', label: 'Manage Users' },
                { id: 'honoraria', icon: 'fa-file-invoice-dollar', label: 'Honoraria Report' }
            ]
        },
        faculty: {
            label: 'Adviser & Panelist',
            nav: [
                { id: 'dashboard', icon: 'fa-chart-line', label: 'My Dashboard' },
                { id: 'availability', icon: 'fa-clock', label: 'My Availability' },
                { id: 'honoraria', icon: 'fa-wallet', label: 'My Honoraria' }
            ]
        },
        student: {
            label: 'Thesis Student',
            nav: [
                { id: 'dashboard', icon: 'fa-chart-line', label: 'Overview' },
                { id: 'scheduling', icon: 'fa-calendar-plus', label: 'Book Defense' },
                { id: 'manuscript', icon: 'fa-file-upload', label: 'Submit Manuscript' }
            ]
        }
    };

    // ============================================================
    // 2. DOM ELEMENTS
    // ============================================================
    const body = document.body;
    const loginScreen = document.getElementById('login-screen');
    const mainLayout = document.getElementById('main-layout');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const goToRegister = document.getElementById('go-to-register');
    const goToLogin = document.getElementById('go-to-login');
    
    const navLinksList = document.getElementById('nav-links');
    const panels = document.querySelectorAll('.panel');
    const panelTitle = document.getElementById('current-panel-title');
    
    const userRoleLabel = document.getElementById('user-role-label');
    const userNameDisplay = document.getElementById('user-name');
    const logoutBtn = document.getElementById('logout-btn');
    const notifToggle = document.getElementById('notif-toggle');
    const notifDropdown = document.getElementById('notif-dropdown');
    const themeToggles = document.querySelectorAll('.theme-toggle-btn, #theme-toggle');

    let selectedRoleForLogin = null;

    // ============================================================
    // 3. THEME MANAGEMENT
    // ============================================================
    function initTheme() {
        const savedTheme = localStorage.getItem('defensched-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcons(savedTheme);
    }

    function updateThemeIcons(theme) {
        themeToggles.forEach(btn => {
            const icon = btn.querySelector('i');
            if (icon) icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        });
    }

    themeToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('defensched-theme', newTheme);
            updateThemeIcons(newTheme);
        });
    });

    initTheme();

    // ============================================================
    // 4. INITIALIZATION & AUTHENTICATION
    // ============================================================
    
    // Check if already logged in
    try {
        const res = await fetch(`/api/auth/me`);
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            const dashboardMap = { admin: `/admin-dashboard`, faculty: `/faculty-dashboard`, student: `/student-dashboard` };
            const dest = dashboardMap[currentUser.role];
            if (dest) { window.location.replace(dest); return; }
            showMainLayout(currentUser);
        }
    } catch (e) { console.error(`Session check failed`, e); }

    // ============================================================
    // PASSWORD VISIBILITY TOGGLE
    // ============================================================
    document.querySelectorAll('.pwd-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            const icon = btn.querySelector('i');

            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });

    // Toggle between forms
    goToRegister?.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        // Show Solo/Group section immediately — 'Thesis Student' is the default role
        const section = document.getElementById('reg-group-section');
        const roleEl  = document.getElementById('reg-role');
        if (section && roleEl) {
            section.style.display = roleEl.value === 'student' ? '' : 'none';
        }
    });

    goToLogin?.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // ============================================================
    // SOLO / GROUP REGISTRATION HELPERS
    // ============================================================
    let _isGroupMode = false;

    // Show/hide the group section when the role changes
    document.getElementById('reg-role')?.addEventListener('change', function () {
        const section = document.getElementById('reg-group-section');
        if (section) section.style.display = this.value === 'student' ? '' : 'none';
    });

    // Exposed globally so onclick= attributes in index.html can reach them
    window.setGroupMode = function (isGroup) {
        _isGroupMode = isGroup;
        const fields = document.getElementById('reg-group-fields');
        const btnSolo  = document.getElementById('btn-solo');
        const btnGroup = document.getElementById('btn-group');
        if (!fields || !btnSolo || !btnGroup) return;

        if (isGroup) {
            fields.style.display = '';
            btnGroup.style.background = 'var(--primary)';
            btnGroup.style.color = '#fff';
            btnSolo.style.background = 'transparent';
            btnSolo.style.color = 'var(--text-muted)';
            buildMemberFields();
        } else {
            fields.style.display = 'none';
            btnSolo.style.background = 'var(--primary)';
            btnSolo.style.color = '#fff';
            btnGroup.style.background = 'transparent';
            btnGroup.style.color = 'var(--text-muted)';
        }
    };

    window.buildMemberFields = function () {
        const container = document.getElementById('reg-members-container');
        const sizeEl    = document.getElementById('reg-group-size');
        if (!container || !sizeEl) return;
        const total = parseInt(sizeEl.value) || 2;
        // Members = total - 1 (leader already has its own field)
        container.innerHTML = '';
        for (let i = 2; i <= total; i++) {
            container.innerHTML += `
                <div class="input-group">
                    <label>Member ${i} Name</label>
                    <div class="input-wrapper">
                        <i class="fas fa-user-tag"></i>
                        <input type="text" class="reg-member-name" placeholder="Full name of member ${i}">
                    </div>
                </div>`;
        }
    };

    // Login logic
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                currentUser = data.user;
                const dashboardMap = {
                    admin:   '/admin-dashboard',
                    faculty: '/faculty-dashboard',
                    student: '/student-dashboard'
                };
                const dest = dashboardMap[currentUser.role];
                if (dest) {
                    window.location.replace(dest);
                } else {
                    showMainLayout(currentUser);
                    showToast(`Welcome back, ${currentUser.name}!`, 'success');
                }
            } else {
                showToast(data.error || 'Login failed', 'error');
            }
        } catch (e) {
            showToast('Server error during login.', 'error');
        }
    });

    // Registration logic
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name     = document.getElementById('reg-name').value;
        const email    = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const role     = document.getElementById('reg-role').value;

        // Build group payload
        let is_group    = false;
        let group_name  = null;
        let leader_name = null;
        let member_names = [];

        if (role === 'student') {
            group_name = name; // account name doubles as group name
            if (_isGroupMode) {
                is_group    = true;
                leader_name = document.getElementById('reg-leader')?.value?.trim() || '';
                member_names = Array.from(document.querySelectorAll('.reg-member-name'))
                    .map(el => el.value.trim())
                    .filter(v => v);
                if (!leader_name) {
                    showToast('Please enter the team leader\'s name.', 'error');
                    return;
                }
            }
        }

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, role, is_group, group_name, leader_name, member_names })
            });
            const data = await res.json();

            if (res.ok) {
                showToast('Account created successfully! You can now log in.', 'success');
                registerForm.reset();
                _isGroupMode = false;
                // Reset group UI
                const gFields = document.getElementById('reg-group-fields');
                const gSection = document.getElementById('reg-group-section');
                if (gFields)  gFields.style.display  = 'none';
                if (gSection) gSection.style.display  = 'none';
                registerForm.classList.add('hidden');
                loginForm.classList.remove('hidden');
            } else {
                showToast(data.error || 'Registration failed', 'error');
            }
        } catch (e) {
            showToast('Server error during registration.', 'error');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        location.reload();
    });

    function showMainLayout(user) {
        loginScreen.classList.add('hidden');
        mainLayout.classList.remove('hidden');
        body.classList.remove('pre-auth');
        
        const config = ROLES[user.role];
        userRoleLabel.textContent = config.label;
        userNameDisplay.textContent = user.name;
        
        // Build Sidebar
        navLinksList.innerHTML = '';
        config.nav.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = `nav-link ${index === 0 ? 'active' : ''}`;
            li.innerHTML = `<i class="fas ${item.icon}"></i> <span>${item.label}</span>`;
            li.addEventListener('click', () => switchPanel(item.id, li));
            navLinksList.appendChild(li);
        });

        switchPanel('dashboard');
        loadNotifications();
    }

    // ============================================================
    // 4. NAVIGATION & PANELS
    // ============================================================
    function switchPanel(panelId, navEl = null) {
        if (navEl) {
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            navEl.classList.add('active');
        }

        panels.forEach(p => {
            p.classList.remove('active');
            if (p.id === `panel-${panelId}`) p.classList.add('active');
        });

        const activeNav = ROLES[currentUser.role].nav.find(n => n.id === panelId);
        panelTitle.textContent = activeNav ? activeNav.label : 'Dashboard';
        
        document.querySelector('.sidebar').classList.remove('open');
        
        // Load panel-specific data
        if (panelId === 'dashboard') loadDashboard();
        if (panelId === 'scheduling') loadScheduling();
        // Additional panels like honoraria, manuscript will be fleshed out soon.
    }

    // ============================================================
    // 5. DATA LOADING
    // ============================================================
    
    async function loadNotifications() {
        const res = await fetch('/api/notifications');
        if (res.ok) {
            const { notifications, unread } = await res.json();
            const badge = notifToggle.querySelector('.badge');
            badge.textContent = unread;
            badge.style.display = unread > 0 ? 'flex' : 'none';
            
            const list = notifDropdown.querySelector('.notif-list');
            list.innerHTML = '';
            
            if (notifications.length === 0) {
                list.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--gray-500)">No notifications</div>';
            } else {
                notifications.forEach(n => {
                    let iconClass = n.type === 'success' ? 'success' : (n.type === 'error' ? 'error' : 'info');
                    let icon = n.type === 'success' ? 'fa-check' : 'fa-info';
                    list.innerHTML += `
                        <div class="notif-item ${n.is_read ? '' : 'unread'}" style="opacity: ${n.is_read ? '0.7' : '1'}">
                            <div class="notif-icon ${iconClass}"><i class="fas ${icon}"></i></div>
                            <div class="notif-text">
                                <p>${n.message}</p>
                                <small>${new Date(n.created_at).toLocaleString()}</small>
                            </div>
                        </div>
                    `;
                });
            }
        }
    }

    async function loadDashboard() {
        try {
            const res = await fetch('/api/appointments');
            if (res.ok) {
                const { appointments } = await res.json();
                
                // Update stats based on real data
                const statsGrid = document.querySelector('#panel-dashboard .stats-grid');
                if (statsGrid) {
                    const total = appointments.length;
                    const upcoming = appointments.filter(a => a.status === 'confirmed').length;
                    const pending = appointments.filter(a => a.status === 'pending').length;
                    
                    statsGrid.innerHTML = `
                        <div class="stat-card">
                            <div class="stat-icon blue"><i class="fas fa-calendar-alt"></i></div>
                            <div class="stat-info"><h3>${total}</h3><p>Total Appointments</p></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon purple"><i class="fas fa-shield-halved"></i></div>
                            <div class="stat-info"><h3>${upcoming}</h3><p>Upcoming Defenses</p></div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon orange"><i class="fas fa-clock"></i></div>
                            <div class="stat-info"><h3>${pending}</h3><p>Pending Approvals</p></div>
                        </div>
                    `;
                }

                // Render activity list
                const actList = document.querySelector('.activity-list');
                if (actList) {
                    actList.innerHTML = '';
                    appointments.slice(0, 5).forEach(a => {
                        actList.innerHTML += `
                            <div class="activity-item">
                                <div class="dot ${a.status === 'confirmed' ? 'active' : ''}"></div>
                                <p><strong>${a.group_name}</strong> defense is ${a.status.toUpperCase()}</p>
                                <small>${a.date} at ${a.time_slot}</small>
                            </div>
                        `;
                    });
                }
            }
        } catch (e) { console.error('Dashboard load error', e); }
    }

    // ============================================================
    // 6. SCHEDULING & CONFLICT DETECTION
    // ============================================================
    async function loadScheduling() {
        const form = document.getElementById('booking-form');
        if (!form || currentUser.role !== 'student') return;

        // Fetch faculty and venues
        const [facRes, venRes] = await Promise.all([
            fetch('/api/faculty'),
            fetch('/api/venues')
        ]);
        
        if (facRes.ok && venRes.ok) {
            const { faculty } = await facRes.json();
            const { venues } = await venRes.json();
            
            const adviserSelect = form.querySelector('select[name="adviser_id"]');
            const venueSelect = form.querySelector('select[name="venue_id"]');
            
            if (adviserSelect && venueSelect) {
                adviserSelect.innerHTML = '<option value="">Choose Adviser</option>' + 
                    faculty.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
                
                venueSelect.innerHTML = '<option value="">Select Venue</option>' + 
                    venues.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
            }
        }
    }

    const bookingForm = document.getElementById('booking-form');
    if (bookingForm) {
        // Change inputs to have name attributes for easier gathering
        const inputs = bookingForm.querySelectorAll('input, select');
        inputs.forEach((input, i) => {
            if (!input.name) {
                if (input.type==='date') input.name='date';
                if (input.type==='time') input.name='time_slot'; // Mocking time to slot
                if (input.placeholder==='e.g. Group Alpha') input.name='group_name';
            }
        });
        
        bookingForm.addEventListener('change', async () => {
            // Live conflict check
            const adviser_id = bookingForm.querySelector('select[name="adviser_id"]')?.value;
            const venue_id = bookingForm.querySelector('select[name="venue_id"]')?.value;
            const date = bookingForm.querySelector('input[type="date"]')?.value;
            // Hack for time slot format since input[type=time] returns HH:MM
            const rawTime = bookingForm.querySelector('input[type="time"]')?.value;
            let time_slot = '';
            if (rawTime) {
                const hour = parseInt(rawTime.split(':')[0]);
                time_slot = `${String(hour).padStart(2,'0')}:00-${String(hour+1).padStart(2,'0')}:00`;
            }

            const vAdviser = document.getElementById('val-adviser');
            const vVenue = document.getElementById('val-venue');
            const vRules = document.getElementById('val-rules');
            const confirmBtn = document.getElementById('confirm-booking');
            const conflictAlert = document.getElementById('conflict-warning');

            if (adviser_id && venue_id && date && time_slot) {
                // We include panelist IDs [2,3] in the check since they are hardcoded for now
                const res = await fetch(`/api/appointments/check-conflict?date=${date}&time_slot=${time_slot}&adviser_id=${adviser_id}&venue_id=${venue_id}&panelist_ids=2,3`);
                if (res.ok) {
                    const data = await res.json();
                    
                    vAdviser.classList.toggle('checked', data.adviser.ok);
                    vVenue.classList.toggle('checked', data.venue.ok);
                    vRules.classList.toggle('checked', data.rules.ok);
                    
                    // We also consider the 4th checkmark "Panel Availability"
                    const vPanel = document.getElementById('val-panel');
                    if (vPanel) vPanel.classList.toggle('checked', data.panelists.ok);

                    if (data.all_clear) {
                        confirmBtn.disabled = false;
                        conflictAlert.classList.add('hidden');
                        confirmBtn.classList.add('active-glow');
                    } else {
                        confirmBtn.disabled = true;
                        confirmBtn.classList.remove('active-glow');
                        conflictAlert.classList.remove('hidden');
                        let errs = [];
                        if(!data.adviser.ok) errs.push(data.adviser.message);
                        if(!data.venue.ok) errs.push(data.venue.message);
                        if(!data.rules.ok) errs.push(data.rules.message);
                        if(!data.panelists.ok) errs.push(data.panelists.message);
                        conflictAlert.querySelector('span').textContent = errs.join(' | ');
                    }
                }
            } else {
                confirmBtn.disabled = true;
                confirmBtn.classList.remove('active-glow');
            }
        });

        document.getElementById('confirm-booking').addEventListener('click', async (e) => {
            e.preventDefault();
            
            const adviser_id = bookingForm.querySelector('select[name="adviser_id"]').value;
            const venue_id = bookingForm.querySelector('select[name="venue_id"]').value;
            const date = bookingForm.querySelector('input[type="date"]').value;
            const group_name = bookingForm.querySelector('input[name="group_name"]').value;
            
            const rawTime = bookingForm.querySelector('input[type="time"]').value;
            const hour = parseInt(rawTime.split(':')[0]);
            const time_slot = `${String(hour).padStart(2,'0')}:00-${String(hour+1).padStart(2,'0')}:00`;

            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    group_name, adviser_id, date, time_slot, venue_id, panelist_ids: [2,3] // Hardcoded panelists for demo
                })
            });

            if (res.ok) {
                showToast('Appointment booked! Pending manuscript upload.', 'success');
                bookingForm.reset();
                switchPanel('dashboard');
                loadDashboard();
            } else {
                const err = await res.json();
                showToast(err.error, 'error');
            }
        });
    }

    // ============================================================
    // 7. UTILS & UI POLISH
    // ============================================================
    notifToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('hidden');
        if (!notifDropdown.classList.contains('hidden')) {
            // mark read
            fetch('/api/notifications/read-all', { method:'PUT' }).then(() => {
                notifToggle.querySelector('.badge').style.display = 'none';
            });
        }
    });

    document.addEventListener('click', () => notifDropdown.classList.add('hidden'));

    document.getElementById('mobile-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector('.sidebar').classList.toggle('open');
    });

    function showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const colors = { success: '#10B981', error: '#EF4444', warning: '#F59E0B', info: '#3B82F6' };
        
        toast.style.cssText = `
            background: ${colors[type] || 'var(--navy-dark)'}; color: white; padding: 1rem 1.5rem; 
            border-radius: 8px; margin-top: 10px; box-shadow: var(--shadow-md);
            animation: slideIn 0.3s ease-out; position: relative; z-index: 9999;
            font-weight: 500; display: flex; align-items: center; gap: 10px;
        `;
        toast.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
    
    function createToastContainer() {
        const c = document.createElement('div');
        c.id = 'toast-container';
        c.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column;';
        document.body.appendChild(c);
        return c;
    }

    setInterval(() => {
        const now = new Date();
        const el = document.getElementById('current-time');
        if (el) el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, 1000);
});
