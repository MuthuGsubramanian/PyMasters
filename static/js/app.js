/* ============================================
   PyMasters — Single-Page Application
   ============================================ */

// --- API Client ---
const api = {
    async get(url) {
        try {
            const res = await fetch(url);
            if (res.status === 401) { window.location.hash = '#/login'; return null; }
            return res.json();
        } catch (e) {
            console.error('API GET error:', e);
            return null;
        }
    },
    async post(url, data) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (res.status === 401) { window.location.hash = '#/login'; return null; }
            return res.json();
        } catch (e) {
            console.error('API POST error:', e);
            return null;
        }
    },
    async put(url, data) {
        try {
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (res.status === 401) { window.location.hash = '#/login'; return null; }
            return res.json();
        } catch (e) {
            console.error('API PUT error:', e);
            return null;
        }
    },
};

// --- Helpers ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
}

function createCollapsible(title, contentFn, openByDefault = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'collapsible' + (openByDefault ? ' open' : '');

    const header = document.createElement('div');
    header.className = 'collapsible-header';
    header.innerHTML = `<h3>${escapeHtml(title)}</h3><span class="collapsible-chevron">&#9660;</span>`;

    const contentOuter = document.createElement('div');
    contentOuter.className = 'collapsible-content';

    const body = document.createElement('div');
    body.className = 'collapsible-body';

    contentOuter.appendChild(body);
    wrapper.appendChild(header);
    wrapper.appendChild(contentOuter);

    let loaded = false;
    header.addEventListener('click', () => {
        wrapper.classList.toggle('open');
        if (!loaded && wrapper.classList.contains('open')) {
            loaded = true;
            contentFn(body);
        }
    });

    if (openByDefault) {
        loaded = true;
        contentFn(body);
    }

    return wrapper;
}

function setLoading(btn, loading) {
    if (loading) {
        btn.disabled = true;
        btn._origText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Loading...';
    } else {
        btn.disabled = false;
        btn.innerHTML = btn._origText || btn.innerHTML;
    }
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return d.toLocaleDateString();
}

// --- Router ---
const routes = {
    '/login': renderLogin,
    '/signup': renderSignup,
    '/dashboard': renderDashboard,
    '/tutor': renderTutor,
    '/studio': renderStudio,
    '/playground': renderPlayground,
    '/profile': renderProfile,
};

let currentUser = null;

async function router() {
    const hash = window.location.hash.slice(1) || '/login';
    const content = document.getElementById('content');
    const nav = document.getElementById('nav');

    // Check auth for protected routes
    if (!currentUser && hash !== '/login' && hash !== '/signup') {
        const data = await api.get('/api/auth/me');
        if (data && data.user) {
            currentUser = data.user;
        } else {
            window.location.hash = '#/login';
            return;
        }
    }

    // Show/hide nav
    const isPublic = hash === '/login' || hash === '/signup';
    nav.style.display = isPublic ? 'none' : 'flex';
    if (!isPublic) updateNav(hash);

    // Render page
    const renderFn = routes[hash];
    if (renderFn) {
        content.innerHTML = '';
        await renderFn(content);
    }
}

function updateNav(activeHash) {
    const links = document.getElementById('nav-links');
    const pages = [
        { hash: '#/dashboard', label: 'Dashboard' },
        { hash: '#/tutor', label: 'Tutor' },
        { hash: '#/studio', label: 'Studio' },
        { hash: '#/playground', label: 'Playground' },
        { hash: '#/profile', label: 'Profile' },
    ];
    links.innerHTML = pages.map(p =>
        `<a href="${p.hash}" class="nav-link ${activeHash === p.hash.slice(1) ? 'active' : ''}">${p.label}</a>`
    ).join('');

    const userEl = document.getElementById('nav-user');
    userEl.innerHTML = currentUser
        ? `<span class="nav-username">${escapeHtml(currentUser.name || currentUser.username)}</span>`
        : '';
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

// ========================================
// Page Renderers
// ========================================

// --- Login ---
function renderLogin(container) {
    container.innerHTML = `
        <div class="split-layout">
            <div class="split-brand">
                <div class="split-brand-content">
                    <div class="split-brand-logo">
                        <span class="logo-icon">P</span>
                        <span class="logo-text">PyMasters</span>
                    </div>
                    <p class="split-brand-tagline">Learn Python. Build things. Ship fast.</p>
                    <div class="split-brand-chips">
                        <span class="split-brand-chip">3 Modules</span>
                        <span class="split-brand-chip">AI Tutor</span>
                        <span class="split-brand-chip">Studio</span>
                    </div>
                </div>
            </div>
            <div class="split-form">
                <div class="split-form-inner">
                    <h2>Welcome back</h2>
                    <p class="form-subtitle">Sign in to continue learning</p>
                    <div class="form-error" id="login-error"></div>
                    <form id="login-form">
                        <div class="form-group">
                            <label for="login-identifier">Username or email</label>
                            <input type="text" id="login-identifier" class="input" placeholder="Enter your username or email" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label for="login-password">Password</label>
                            <input type="password" id="login-password" class="input" placeholder="Enter your password" required autocomplete="current-password">
                        </div>
                        <button type="submit" class="btn btn-full" id="login-btn">Sign in</button>
                    </form>
                    <p class="form-footer">No account? <a href="#/signup">Sign up</a></p>
                </div>
            </div>
        </div>
    `;

    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        const errEl = document.getElementById('login-error');
        errEl.classList.remove('visible');
        setLoading(btn, true);

        const data = await api.post('/api/auth/login', {
            identifier: document.getElementById('login-identifier').value.trim(),
            password: document.getElementById('login-password').value,
        });

        setLoading(btn, false);

        if (data && data.user) {
            currentUser = data.user;
            window.location.hash = '#/dashboard';
        } else {
            errEl.textContent = (data && data.error) || 'Login failed. Please try again.';
            errEl.classList.add('visible');
        }
    });
}

// --- Signup ---
function renderSignup(container) {
    container.innerHTML = `
        <div class="split-layout">
            <div class="split-brand">
                <div class="split-brand-content">
                    <div class="split-brand-logo">
                        <span class="logo-icon">P</span>
                        <span class="logo-text">PyMasters</span>
                    </div>
                    <p class="split-brand-tagline">Create your account. Start building.</p>
                    <div class="split-brand-chips">
                        <span class="split-brand-chip">Free forever</span>
                        <span class="split-brand-chip">AI-powered</span>
                        <span class="split-brand-chip">Learn by doing</span>
                    </div>
                </div>
            </div>
            <div class="split-form">
                <div class="split-form-inner">
                    <h2>Create account</h2>
                    <p class="form-subtitle">Start your Python journey</p>
                    <div class="form-error" id="signup-error"></div>
                    <form id="signup-form">
                        <div class="form-group">
                            <label for="signup-name">Full name</label>
                            <input type="text" id="signup-name" class="input" placeholder="Your name" required>
                        </div>
                        <div class="form-group">
                            <label for="signup-username">Username</label>
                            <input type="text" id="signup-username" class="input" placeholder="Choose a username" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label for="signup-email">Email <span style="color:var(--text-muted)">(optional)</span></label>
                            <input type="email" id="signup-email" class="input" placeholder="you@example.com" autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="signup-phone">Phone <span style="color:var(--text-muted)">(optional)</span></label>
                            <input type="tel" id="signup-phone" class="input" placeholder="+1 (555) 000-0000">
                        </div>
                        <div class="form-group">
                            <label for="signup-password">Password</label>
                            <input type="password" id="signup-password" class="input" placeholder="Create a password" required autocomplete="new-password">
                        </div>
                        <div class="form-group">
                            <label for="signup-confirm">Confirm password</label>
                            <input type="password" id="signup-confirm" class="input" placeholder="Confirm your password" required autocomplete="new-password">
                        </div>
                        <button type="submit" class="btn btn-full" id="signup-btn">Create account</button>
                    </form>
                    <p class="form-footer">Have an account? <a href="#/login">Sign in</a></p>
                </div>
            </div>
        </div>
    `;

    const form = document.getElementById('signup-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('signup-btn');
        const errEl = document.getElementById('signup-error');
        errEl.classList.remove('visible');

        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;
        if (password !== confirm) {
            errEl.textContent = 'Passwords do not match.';
            errEl.classList.add('visible');
            return;
        }

        setLoading(btn, true);

        const data = await api.post('/api/auth/signup', {
            name: document.getElementById('signup-name').value.trim(),
            username: document.getElementById('signup-username').value.trim(),
            email: document.getElementById('signup-email').value.trim() || undefined,
            phone: document.getElementById('signup-phone').value.trim() || undefined,
            password: password,
        });

        setLoading(btn, false);

        if (data && data.user) {
            currentUser = data.user;
            window.location.hash = '#/dashboard';
        } else {
            errEl.textContent = (data && data.error) || 'Signup failed. Please try again.';
            errEl.classList.add('visible');
        }
    });
}

// --- Dashboard ---
async function renderDashboard(container) {
    container.innerHTML = `<div class="page-container"><div class="loading"><div class="loading-dots"><span></span><span></span><span></span></div></div></div>`;

    const modulesData = await api.get('/api/modules');
    if (!modulesData) return;

    const modules = modulesData.modules || modulesData || [];
    const total = modules.length;
    const completed = modules.filter(m => m.status === 'completed').length;
    const active = modules.filter(m => m.status === 'active').length;

    const userName = currentUser ? (currentUser.name || currentUser.username) : 'Learner';

    container.innerHTML = `<div class="page-container" id="dashboard-page"></div>`;
    const page = document.getElementById('dashboard-page');

    // Welcome
    const welcomeSection = document.createElement('div');
    welcomeSection.className = 'page-header';
    welcomeSection.innerHTML = `
        <h1>Welcome back, ${escapeHtml(userName)}.</h1>
        <p>${completed} of ${total} modules completed${active > 0 ? ` &middot; ${active} in progress` : ''}</p>
    `;
    page.appendChild(welcomeSection);

    // Metrics
    const metricsRow = document.createElement('div');
    metricsRow.className = 'metrics-row';
    metricsRow.innerHTML = `
        <div class="metric-card">
            <div class="metric-label">Total Modules</div>
            <div class="metric-value">${total}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Active</div>
            <div class="metric-value">${active}</div>
            <div class="metric-detail">In progress</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Completed</div>
            <div class="metric-value">${completed}</div>
            <div class="metric-detail">${total > 0 ? Math.round((completed / total) * 100) : 0}% done</div>
        </div>
    `;
    page.appendChild(metricsRow);

    // Module list
    const moduleList = document.createElement('div');
    moduleList.className = 'module-list';
    modules.forEach(m => {
        const statusClass = m.status === 'completed' ? 'pill-completed' : m.status === 'active' ? 'pill-active' : 'pill-queued';
        const statusLabel = m.status === 'completed' ? 'Completed' : m.status === 'active' ? 'In Progress' : 'Not Started';
        const tags = (m.tags || []).map(t => `<span class="module-tag">${escapeHtml(t)}</span>`).join('');

        const card = document.createElement('div');
        card.className = 'module-card';
        card.innerHTML = `
            <div class="module-info">
                <h3>${escapeHtml(m.title || m.name || 'Untitled')}</h3>
                <p>${escapeHtml(m.description || '')}</p>
                <div class="module-meta">
                    ${tags}
                    ${m.difficulty ? `<span class="module-difficulty">${escapeHtml(m.difficulty)}</span>` : ''}
                    ${m.estimated_time ? `<span class="module-time">${escapeHtml(m.estimated_time)}</span>` : ''}
                    <span class="pill ${statusClass}">${statusLabel}</span>
                </div>
            </div>
            <div class="module-actions"></div>
        `;

        const actions = card.querySelector('.module-actions');

        if (m.status !== 'active' && m.status !== 'completed') {
            const startBtn = document.createElement('button');
            startBtn.className = 'btn btn-sm';
            startBtn.textContent = 'Start';
            startBtn.addEventListener('click', async () => {
                setLoading(startBtn, true);
                const res = await api.post('/api/progress', { module_id: m._id || m.id, action: 'start' });
                setLoading(startBtn, false);
                if (res && !res.error) {
                    showToast('Module started!');
                    await renderDashboard(container);
                } else {
                    showToast((res && res.error) || 'Failed to start module', 'error');
                }
            });
            actions.appendChild(startBtn);
        }

        if (m.status === 'active') {
            const completeBtn = document.createElement('button');
            completeBtn.className = 'btn btn-sm btn-success';
            completeBtn.textContent = 'Complete';
            completeBtn.addEventListener('click', async () => {
                setLoading(completeBtn, true);
                const res = await api.post('/api/progress', { module_id: m._id || m.id, action: 'complete' });
                setLoading(completeBtn, false);
                if (res && !res.error) {
                    showToast('Module completed!');
                    await renderDashboard(container);
                } else {
                    showToast((res && res.error) || 'Failed to complete module', 'error');
                }
            });
            actions.appendChild(completeBtn);
        }

        if (m.status === 'completed' || m.status === 'active') {
            const resetBtn = document.createElement('button');
            resetBtn.className = 'btn btn-sm btn-secondary';
            resetBtn.textContent = 'Reset';
            resetBtn.addEventListener('click', async () => {
                setLoading(resetBtn, true);
                const res = await api.post('/api/progress', { module_id: m._id || m.id, action: 'reset' });
                setLoading(resetBtn, false);
                if (res && !res.error) {
                    showToast('Module reset');
                    await renderDashboard(container);
                } else {
                    showToast((res && res.error) || 'Failed to reset module', 'error');
                }
            });
            actions.appendChild(resetBtn);
        }

        moduleList.appendChild(card);
    });
    page.appendChild(moduleList);

    // Activity collapsible
    page.appendChild(createCollapsible('Recent activity', async (body) => {
        const data = await api.get('/api/activity');
        const items = (data && (data.activities || data)) || [];
        if (!items.length) {
            body.innerHTML = '<div class="empty-state">No recent activity</div>';
            return;
        }
        const feed = document.createElement('div');
        feed.className = 'activity-feed';
        items.forEach(item => {
            feed.innerHTML += `
                <div class="activity-item">
                    <span class="activity-dot"></span>
                    <span class="activity-text"><strong>${escapeHtml(item.action || item.type || '')}</strong> ${escapeHtml(item.description || item.module || '')}</span>
                    <span class="activity-time">${formatTime(item.timestamp || item.created_at)}</span>
                </div>
            `;
        });
        body.appendChild(feed);
    }));

    // Leaderboard collapsible
    page.appendChild(createCollapsible('Leaderboard', async (body) => {
        const data = await api.get('/api/leaderboard');
        const entries = (data && (data.leaderboard || data)) || [];
        if (!entries.length) {
            body.innerHTML = '<div class="empty-state">No leaderboard data yet</div>';
            return;
        }
        const board = document.createElement('div');
        board.className = 'leaderboard';
        entries.forEach((entry, i) => {
            const isMe = currentUser && (entry.username === currentUser.username || entry.user_id === currentUser.id);
            board.innerHTML += `
                <div class="leader-row ${isMe ? 'leader-current' : ''}">
                    <span class="leader-rank">${i + 1}</span>
                    <span class="leader-name">${escapeHtml(entry.name || entry.username || 'Anonymous')}</span>
                    <span class="leader-score">${entry.score || entry.completed || 0}</span>
                </div>
            `;
        });
        body.appendChild(board);
    }));
}

// --- Tutor ---
let tutorMessages = [];
let tutorSettings = { model: 'gpt-4', temperature: 0.7, max_tokens: 2048 };

async function renderTutor(container) {
    container.innerHTML = `<div class="page-container" id="tutor-page"></div>`;
    const page = document.getElementById('tutor-page');

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `<h1>AI Tutor</h1><p>Ask questions, explore concepts, get instant explanations</p>`;
    page.appendChild(header);

    // Settings collapsible
    page.appendChild(createCollapsible('Settings', (body) => {
        body.innerHTML = `
            <div class="two-col" style="gap:16px;">
                <div class="form-group">
                    <label>Model</label>
                    <input type="text" class="input" id="tutor-model" value="${escapeHtml(tutorSettings.model)}">
                </div>
                <div class="form-group">
                    <label>Temperature</label>
                    <input type="number" class="input" id="tutor-temp" value="${tutorSettings.temperature}" min="0" max="2" step="0.1">
                </div>
            </div>
            <div class="form-group" style="max-width:200px;">
                <label>Max tokens</label>
                <input type="number" class="input" id="tutor-tokens" value="${tutorSettings.max_tokens}" min="100" max="8192" step="100">
            </div>
        `;
        body.querySelector('#tutor-model').addEventListener('change', (e) => { tutorSettings.model = e.target.value; });
        body.querySelector('#tutor-temp').addEventListener('change', (e) => { tutorSettings.temperature = parseFloat(e.target.value); });
        body.querySelector('#tutor-tokens').addEventListener('change', (e) => { tutorSettings.max_tokens = parseInt(e.target.value); });
    }));

    // Chat container
    const chat = document.createElement('div');
    chat.className = 'chat-container';
    chat.innerHTML = `
        <div class="chat-header">
            <div class="chat-header-dots"><span></span><span></span><span></span></div>
            <span>pymasters-tutor</span>
        </div>
        <div class="chat-messages" id="tutor-messages"></div>
        <div class="chat-input-area">
            <input type="text" class="input" id="tutor-input" placeholder="Ask a question about Python...">
            <button class="btn" id="tutor-send">Send</button>
        </div>
    `;
    page.appendChild(chat);

    renderTutorMessages();

    const sendMessage = async () => {
        const input = document.getElementById('tutor-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        tutorMessages.push({ role: 'user', content: text });
        renderTutorMessages();

        const sendBtn = document.getElementById('tutor-send');
        setLoading(sendBtn, true);

        const res = await api.post('/api/tutor/chat', {
            message: text,
            model: tutorSettings.model,
            temperature: tutorSettings.temperature,
            max_tokens: tutorSettings.max_tokens,
            history: tutorMessages.slice(0, -1),
        });

        setLoading(sendBtn, false);

        if (res && (res.reply_html || res.reply)) {
            tutorMessages.push({
                role: 'assistant',
                content: res.reply || '',
                html: res.reply_html || escapeHtml(res.reply || ''),
            });
        } else {
            tutorMessages.push({
                role: 'assistant',
                content: 'Sorry, something went wrong.',
                html: '<p>Sorry, something went wrong. Please try again.</p>',
            });
        }
        renderTutorMessages();
    };

    document.getElementById('tutor-send').addEventListener('click', sendMessage);
    document.getElementById('tutor-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Sessions collapsible
    page.appendChild(createCollapsible('Recent sessions', async (body) => {
        const data = await api.get('/api/tutor/sessions');
        const sessions = (data && (data.sessions || data)) || [];
        if (!sessions.length) {
            body.innerHTML = '<div class="empty-state">No previous sessions</div>';
            return;
        }
        sessions.forEach(s => {
            body.innerHTML += `
                <div class="session-item">
                    <div class="session-item-title">${escapeHtml(s.title || s.topic || 'Session')}</div>
                    <div class="session-item-date">${formatTime(s.created_at || s.timestamp)}</div>
                </div>
            `;
        });
    }));

    // Notes collapsible
    page.appendChild(createCollapsible('Saved notes', async (body) => {
        const data = await api.get('/api/tutor/notes');
        const notes = (data && (data.notes || data)) || [];
        if (!notes.length) {
            body.innerHTML = '<div class="empty-state">No saved notes yet</div>';
            return;
        }
        notes.forEach(n => {
            body.innerHTML += `
                <div class="note-item">
                    <div class="note-item-title">${escapeHtml(n.title || 'Note')}</div>
                    <div class="note-item-date">${formatTime(n.created_at || n.timestamp)}</div>
                </div>
            `;
        });
    }));
}

function renderTutorMessages() {
    const messagesEl = document.getElementById('tutor-messages');
    if (!messagesEl) return;

    messagesEl.innerHTML = '';

    if (tutorMessages.length === 0) {
        messagesEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#x1f4ac;</div>Start a conversation with your AI tutor</div>';
        return;
    }

    tutorMessages.forEach((msg, idx) => {
        const div = document.createElement('div');
        if (msg.role === 'user') {
            div.className = 'chat-message chat-message-user';
            div.textContent = msg.content;
        } else {
            div.className = 'chat-message chat-message-assistant';
            div.innerHTML = msg.html || escapeHtml(msg.content);

            // Save button
            const actions = document.createElement('div');
            actions.className = 'chat-message-actions';
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-sm btn-secondary';
            saveBtn.textContent = 'Save note';
            saveBtn.addEventListener('click', async () => {
                setLoading(saveBtn, true);
                const res = await api.post('/api/tutor/notes', {
                    content: msg.content || msg.html,
                    html: msg.html,
                });
                setLoading(saveBtn, false);
                if (res && !res.error) {
                    showToast('Note saved!');
                } else {
                    showToast('Failed to save note', 'error');
                }
            });
            actions.appendChild(saveBtn);
            div.appendChild(actions);
        }
        messagesEl.appendChild(div);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// --- Studio ---
async function renderStudio(container) {
    container.innerHTML = `<div class="page-container" id="studio-page"></div>`;
    const page = document.getElementById('studio-page');

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `<h1>Studio</h1><p>Generate images and videos with AI</p>`;
    page.appendChild(header);

    const formCard = document.createElement('div');
    formCard.className = 'card';
    formCard.innerHTML = `
        <form id="studio-form">
            <div class="form-group">
                <label for="studio-prompt">Prompt</label>
                <textarea id="studio-prompt" class="input" placeholder="Describe what you want to generate..." rows="3" required></textarea>
            </div>
            <div class="two-col" style="gap:16px;">
                <div class="form-group">
                    <label for="studio-task">Task</label>
                    <select id="studio-task" class="input">
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="studio-model">Model</label>
                    <input type="text" id="studio-model" class="input" placeholder="e.g. stable-diffusion" value="stable-diffusion">
                </div>
            </div>
            <button type="submit" class="btn" id="studio-generate-btn">Generate</button>
        </form>
    `;
    page.appendChild(formCard);

    const preview = document.createElement('div');
    preview.className = 'preview-area';
    preview.id = 'studio-preview';
    preview.innerHTML = '<div class="preview-placeholder">Your generated content will appear here</div>';
    page.appendChild(preview);

    document.getElementById('studio-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('studio-generate-btn');
        setLoading(btn, true);

        const previewEl = document.getElementById('studio-preview');
        previewEl.innerHTML = '<div class="loading"><div class="loading-dots"><span></span><span></span><span></span></div></div>';

        const task = document.getElementById('studio-task').value;
        const res = await api.post('/api/studio/generate', {
            prompt: document.getElementById('studio-prompt').value.trim(),
            task: task,
            model: document.getElementById('studio-model').value.trim(),
        });

        setLoading(btn, false);

        if (res && (res.data || res.url)) {
            if (task === 'video') {
                if (res.data) {
                    previewEl.innerHTML = `<video controls autoplay><source src="data:video/mp4;base64,${res.data}" type="video/mp4"></video>`;
                } else {
                    previewEl.innerHTML = `<video controls autoplay><source src="${escapeHtml(res.url)}" type="video/mp4"></video>`;
                }
            } else {
                if (res.data) {
                    previewEl.innerHTML = `<img src="data:image/png;base64,${res.data}" alt="Generated image">`;
                } else {
                    previewEl.innerHTML = `<img src="${escapeHtml(res.url)}" alt="Generated image">`;
                }
            }
            showToast('Generation complete!');
        } else {
            previewEl.innerHTML = `<div class="preview-placeholder">${escapeHtml((res && res.error) || 'Generation failed')}</div>`;
            showToast((res && res.error) || 'Generation failed', 'error');
        }
    });

    // History collapsible
    page.appendChild(createCollapsible('History', async (body) => {
        const data = await api.get('/api/studio/history');
        const items = (data && (data.history || data)) || [];
        if (!items.length) {
            body.innerHTML = '<div class="empty-state">No generation history</div>';
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'history-grid';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'history-item';
            if (item.task === 'video') {
                el.innerHTML = `<video src="${item.data ? ('data:video/mp4;base64,' + item.data) : escapeHtml(item.url || '')}" muted></video>`;
            } else {
                el.innerHTML = `<img src="${item.data ? ('data:image/png;base64,' + item.data) : escapeHtml(item.url || '')}" alt="">`;
            }
            el.innerHTML += `<div class="history-item-meta">${escapeHtml(item.prompt || '')}</div>`;
            el.addEventListener('click', () => {
                const previewEl = document.getElementById('studio-preview');
                if (item.task === 'video') {
                    previewEl.innerHTML = `<video controls autoplay><source src="${item.data ? ('data:video/mp4;base64,' + item.data) : escapeHtml(item.url || '')}" type="video/mp4"></video>`;
                } else {
                    previewEl.innerHTML = `<img src="${item.data ? ('data:image/png;base64,' + item.data) : escapeHtml(item.url || '')}" alt="Generated">`;
                }
            });
            grid.appendChild(el);
        });
        body.appendChild(grid);
    }));
}

// --- Playground ---
const snippets = {
    'Hello World': 'print("Hello, World!")\nprint("Welcome to PyMasters!")',
    'List Ops': '# List operations\nnumbers = [1, 2, 3, 4, 5]\nprint("Original:", numbers)\nprint("Reversed:", numbers[::-1])\nprint("Sum:", sum(numbers))\nprint("Squared:", [x**2 for x in numbers])',
    'Dictionary': '# Dictionary operations\nstudent = {\n    "name": "Alice",\n    "age": 25,\n    "courses": ["Python", "AI", "Data Science"]\n}\n\nfor key, value in student.items():\n    print(f"{key}: {value}")',
    'API Call': 'import requests\n\n# Example API call\nresponse = requests.get("https://httpbin.org/json")\ndata = response.json()\nprint("Status:", response.status_code)\nprint("Data:", data)',
};

function renderPlayground(container) {
    container.innerHTML = `<div class="page-container" id="playground-page"></div>`;
    const page = document.getElementById('playground-page');

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `<h1>Playground</h1><p>Write and run Python code in the browser</p>`;
    page.appendChild(header);

    // Snippet buttons
    const snippetRow = document.createElement('div');
    snippetRow.className = 'snippet-row';
    Object.keys(snippets).forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'snippet-btn';
        btn.textContent = name;
        btn.addEventListener('click', () => {
            document.getElementById('playground-code').value = snippets[name];
            snippetRow.querySelectorAll('.snippet-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
        snippetRow.appendChild(btn);
    });
    page.appendChild(snippetRow);

    // Editor + Output
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'code-editor-wrapper';
    editorWrapper.innerHTML = `
        <div class="code-editor">
            <div class="editor-header">
                <div class="editor-header-dots"><span></span><span></span><span></span></div>
                <span>main.py</span>
            </div>
            <textarea id="playground-code" spellcheck="false" placeholder="# Write your Python code here...">${escapeHtml(snippets['Hello World'])}</textarea>
        </div>
        <div class="code-output">
            <div class="editor-header">
                <div class="editor-header-dots"><span></span><span></span><span></span></div>
                <span>output</span>
            </div>
            <div class="code-output-body" id="playground-output">Click "Run" to execute your code</div>
        </div>
    `;
    page.appendChild(editorWrapper);

    // Run button
    const runRow = document.createElement('div');
    runRow.style.cssText = 'margin-top: 16px;';
    const runBtn = document.createElement('button');
    runBtn.className = 'btn';
    runBtn.textContent = 'Run';
    runBtn.id = 'playground-run';
    runRow.appendChild(runBtn);
    page.appendChild(runRow);

    // Tab support in textarea
    document.getElementById('playground-code').addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.target;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            ta.value = ta.value.substring(0, start) + '    ' + ta.value.substring(end);
            ta.selectionStart = ta.selectionEnd = start + 4;
        }
    });

    runBtn.addEventListener('click', async () => {
        const code = document.getElementById('playground-code').value;
        const outputEl = document.getElementById('playground-output');
        outputEl.textContent = 'Running...';
        outputEl.className = 'code-output-body';
        setLoading(runBtn, true);

        const res = await api.post('/api/playground/run', { code });

        setLoading(runBtn, false);

        if (res) {
            if (res.error) {
                outputEl.textContent = res.error;
                outputEl.className = 'code-output-body error';
            } else {
                outputEl.textContent = res.output || res.stdout || '(no output)';
                outputEl.className = 'code-output-body success';
                if (res.stderr) {
                    outputEl.textContent += '\n\nStderr:\n' + res.stderr;
                }
            }
        } else {
            outputEl.textContent = 'Failed to run code';
            outputEl.className = 'code-output-body error';
        }
    });
}

// --- Profile ---
async function renderProfile(container) {
    container.innerHTML = `<div class="page-container" id="profile-page"></div>`;
    const page = document.getElementById('profile-page');

    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `<h1>Profile</h1><p>Manage your account settings</p>`;
    page.appendChild(header);

    const user = currentUser || {};

    const twoCol = document.createElement('div');
    twoCol.className = 'two-col';
    twoCol.innerHTML = `
        <div class="card">
            <div class="card-header"><span class="card-title">Account</span></div>
            <form id="profile-form">
                <div class="form-group">
                    <label for="profile-name">Full name</label>
                    <input type="text" id="profile-name" class="input" value="${escapeHtml(user.name || '')}">
                </div>
                <div class="form-group">
                    <label for="profile-username">Username</label>
                    <input type="text" id="profile-username" class="input" value="${escapeHtml(user.username || '')}">
                </div>
                <div class="form-group">
                    <label for="profile-email">Email</label>
                    <input type="email" id="profile-email" class="input" value="${escapeHtml(user.email || '')}">
                </div>
                <div class="form-group">
                    <label for="profile-phone">Phone</label>
                    <input type="tel" id="profile-phone" class="input" value="${escapeHtml(user.phone || '')}">
                </div>
                <button type="submit" class="btn" id="profile-save-btn">Save changes</button>
            </form>
        </div>
        <div class="card">
            <div class="card-header"><span class="card-title">Password</span></div>
            <form id="password-form">
                <div class="form-group">
                    <label for="pw-current">Current password</label>
                    <input type="password" id="pw-current" class="input" placeholder="Enter current password" autocomplete="current-password">
                </div>
                <div class="form-group">
                    <label for="pw-new">New password</label>
                    <input type="password" id="pw-new" class="input" placeholder="Enter new password" autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label for="pw-confirm">Confirm new password</label>
                    <input type="password" id="pw-confirm" class="input" placeholder="Confirm new password" autocomplete="new-password">
                </div>
                <button type="submit" class="btn" id="pw-update-btn">Update password</button>
            </form>
        </div>
    `;
    page.appendChild(twoCol);

    // Profile form handler
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('profile-save-btn');
        setLoading(btn, true);

        const res = await api.put('/api/auth/profile', {
            name: document.getElementById('profile-name').value.trim(),
            username: document.getElementById('profile-username').value.trim(),
            email: document.getElementById('profile-email').value.trim(),
            phone: document.getElementById('profile-phone').value.trim(),
        });

        setLoading(btn, false);

        if (res && res.user) {
            currentUser = res.user;
            updateNav(window.location.hash.slice(1));
            showToast('Profile updated');
        } else {
            showToast((res && res.error) || 'Failed to update profile', 'error');
        }
    });

    // Password form handler
    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('pw-update-btn');
        const newPw = document.getElementById('pw-new').value;
        const confirmPw = document.getElementById('pw-confirm').value;

        if (newPw !== confirmPw) {
            showToast('Passwords do not match', 'error');
            return;
        }

        setLoading(btn, true);

        const res = await api.put('/api/auth/password', {
            current_password: document.getElementById('pw-current').value,
            new_password: newPw,
        });

        setLoading(btn, false);

        if (res && !res.error) {
            showToast('Password updated');
            document.getElementById('password-form').reset();
        } else {
            showToast((res && res.error) || 'Failed to update password', 'error');
        }
    });

    // Danger zone
    const dangerCard = document.createElement('div');
    dangerCard.className = 'card danger-zone';
    dangerCard.style.marginTop = '20px';
    dangerCard.innerHTML = `
        <div class="card-header"><span class="card-title" style="color:var(--danger)">Danger zone</span></div>
        <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:16px;">Sign out of your account on this device.</p>
    `;
    const signOutBtn = document.createElement('button');
    signOutBtn.className = 'btn btn-danger';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', async () => {
        setLoading(signOutBtn, true);
        await api.post('/api/auth/logout', {});
        currentUser = null;
        tutorMessages = [];
        window.location.hash = '#/login';
    });
    dangerCard.appendChild(signOutBtn);
    page.appendChild(dangerCard);

    // Settings collapsible
    page.appendChild(createCollapsible('Settings', (body) => {
        body.innerHTML = `
            <div class="settings-group">
                <div class="form-group">
                    <label for="settings-hf-token">Hugging Face Token</label>
                    <input type="password" id="settings-hf-token" class="input" placeholder="hf_..." value="${escapeHtml(user.hf_token || '')}">
                </div>
                <div class="setting-row">
                    <div>
                        <div class="setting-label">Dark mode</div>
                        <div class="setting-desc">Switch to dark theme</div>
                    </div>
                    <div class="toggle disabled" title="Coming soon"></div>
                </div>
                <div class="setting-row">
                    <div>
                        <div class="setting-label">Notifications</div>
                        <div class="setting-desc">Receive email notifications</div>
                    </div>
                    <div>
                        <label class="checkbox-row"><input type="checkbox" disabled> Email</label>
                        <label class="checkbox-row" style="margin-top:4px;"><input type="checkbox" disabled> Push</label>
                    </div>
                </div>
            </div>
        `;
    }));
}
