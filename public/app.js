// API Configuration
const API_BASE = window.location.origin;
const POLL_INTERVAL = 3000; // Poll every 3 seconds

// State
let currentPage = 'dashboard';
let connectionStatus = 'DISCONNECTED';
let contacts = [];
let chats = [];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeRefresh();
    initializeSettings();
    startStatusPolling();
    checkNotificationPermission();
    initializeTheme(); // Add this
});

// Theme Logic
// Theme Logic
function initializeTheme() {
    // Select all theme toggles (desktop sidebar and mobile settings page)
    const toggleBtns = document.querySelectorAll('.theme-toggle, .theme-toggle-btn, #mobile-theme-toggle');

    // Check saved theme or system preference
    const savedTheme = localStorage.getItem('theme');

    // Default to light if no save, or follow save
    let currentTheme = savedTheme || 'light';

    // Apply initial
    applyTheme(currentTheme);

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(currentTheme);
            localStorage.setItem('theme', currentTheme);
        });
    });

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Update icons for ALL buttons
        toggleBtns.forEach(btn => {
            const sunIcon = btn.querySelector('.sun-icon');
            const moonIcon = btn.querySelector('.moon-icon');
            if (sunIcon && moonIcon) {
                if (theme === 'light') {
                    sunIcon.style.display = 'none';
                    moonIcon.style.display = 'block';
                } else {
                    sunIcon.style.display = 'block';
                    moonIcon.style.display = 'none';
                }
            }
        });
    }
}

// Navigation
function initializeNavigation() {
    // Desktop Sidebar
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.dataset.page) {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                switchPage(page);
            });
        }
    });

    // Mobile Bottom Nav
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    mobileNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);
        });
    });
}

function switchPage(page) {
    // Update nav (Desktop)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    // Update nav (Mobile)
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    // Update pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    document.getElementById(`${page}-page`).classList.add('active');

    // Scroll main content to top so the active page shows from the top (e.g. Analytics)
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.scrollTop = 0;
        requestAnimationFrame(() => { mainContent.scrollTop = 0; });
    }

    // Keep sidebar visible on all pages including Analytics
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('hidden');

    currentPage = page;

    // Load page data
    loadPageData(page);
}

function loadPageData(page) {
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'chats':
            loadChats();
            break;
        case 'contacts':
            loadContacts();
            break;
        case 'ai-profile':
            loadAIProfile();
            break;
        case 'user-profile':
            loadUserProfile();
            break;
        case 'marketing':
            loadMarketing();
            break;
        case 'communities':
            loadCommunities();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'shops':
            loadShops();
            break;
        case 'analytics':
            loadAnalytics();
            break;
    }
}

// Status Polling
function startStatusPolling() {
    checkStatus();
    setInterval(checkStatus, POLL_INTERVAL);
}

async function checkStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
        const data = await response.json();

        updateConnectionStatus(data.whatsapp.status, data.whatsapp.qr);

        // If status changed, reload current page
        if (data.whatsapp.status !== connectionStatus) {
            connectionStatus = data.whatsapp.status;
            loadPageData(currentPage);
        }
    } catch (error) {
        console.error('Status check failed:', error);
        updateConnectionStatus('DISCONNECTED');
    }
}

function updateConnectionStatus(status, qr = null) {
    const statusEl = document.getElementById('connection-status');
    const indicator = statusEl.querySelector('.status-indicator');
    const label = statusEl.querySelector('.status-label');
    const detail = statusEl.querySelector('.status-detail');

    indicator.className = 'status-indicator';

    switch (status) {
        case 'CONNECTED':
            indicator.classList.add('connected');
            label.textContent = 'Connected';
            detail.textContent = 'WhatsApp is online';
            hideQRSection();
            break;
        case 'WAITING_FOR_QR':
            label.textContent = 'Waiting for QR';
            detail.textContent = 'Scan to connect';
            showQRCode(qr);
            break;
        default:
            indicator.classList.add('disconnected');
            label.textContent = 'Disconnected';
            detail.textContent = 'Not connected';
            hideQRSection();
    }
}

// QR Code Display
function showQRCode(qrData) {
    const qrSection = document.getElementById('qr-section');
    const qrContainer = document.getElementById('qr-code');
    const statsGrid = document.getElementById('stats-grid');

    qrSection.style.display = 'block';
    statsGrid.style.display = 'none';

    if (qrData) {
        // Use QRCode library or display as ASCII
        qrContainer.innerHTML = `
            <div style="width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; background: white; border-radius: 16px;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrData)}" 
                     alt="QR Code" 
                     style="width: 280px; height: 280px;" />
            </div>
        `;
    }
}

function hideQRSection() {
    const qrSection = document.getElementById('qr-section');
    const statsGrid = document.getElementById('stats-grid');

    qrSection.style.display = 'none';
    statsGrid.style.display = 'grid';
}

// Dashboard
async function loadDashboard() {
    // Fire both requests in parallel
    // We don't await the second one so the first one can render immediately if it finishes first
    // Or more importantly, if one fails or hangs, it doesn't block the other completely

    // 1. Load Stats
    fetch(`${API_BASE}/api/stats`)
        .then(response => response.json())
        .then(stats => {
            updateDashboardStats({
                totalMessages: stats.totalMessages || 0,
                activeContacts: stats.totalContacts || 0,
                responseRate: stats.responseRate || 98,
                avgResponseTime: stats.avgResponseTime || '12s'
            });
        })
        .catch(error => {
            console.error('Failed to load stats:', error);
            updateDashboardStats({
                totalMessages: 0,
                activeContacts: 0,
                responseRate: 98,
                avgResponseTime: '12s'
            });
        });

    // 2. Load Activity (Independently)
    loadRecentActivity();
}

function updateDashboardStats(stats) {
    document.getElementById('total-messages').textContent = stats.totalMessages;
    document.getElementById('active-contacts').textContent = stats.activeContacts;
}

async function loadRecentActivity() {
    const activityList = document.getElementById('activity-list');

    try {
        const response = await fetch(`${API_BASE}/api/activity`);
        const activities = await response.json();

        if (activities.length === 0) {
            activityList.innerHTML = `
                <div class="activity-empty">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="32" fill="#f3f4f6"/>
                        <path d="M32 20v24M20 32h24" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <p>No recent activity</p>
                </div>
            `;
        } else {
            activityList.innerHTML = activities.map(activity => `
                <div class="activity-item" style="display: flex; gap: 1rem; align-items: start; padding: 1rem; background: var(--bg-primary); border-radius: 12px;">
                    <div class="activity-icon" style="
                        width: 32px; height: 32px; 
                        background: ${activity.type === 'outgoing' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(102, 126, 234, 0.1)'}; 
                        color: ${activity.type === 'outgoing' ? 'var(--success)' : 'var(--primary)'};
                        border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                           ${activity.type === 'outgoing'
                    ? '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />' // Send icon
                    : '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>' // Message icon
                }
                        </svg>
                    </div>
                    <div class="activity-info" style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                            <span style="font-weight: 600; font-size: 0.875rem;">${activity.description}</span>
                            <span style="font-size: 0.75rem; color: var(--text-secondary);">${formatTime(new Date(activity.time).getTime())}</span>
                        </div>
                        <p style="font-size: 0.875rem; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${activity.detail}</p>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load activity:', error);
        activityList.innerHTML = `
            <div class="activity-empty">
                 <p style="color: var(--danger);">Failed to load activity</p>
            </div>
        `;
    }
}

// Chats
async function loadChats() {
    const chatList = document.getElementById('chat-list');

    try {
        const response = await fetch(`${API_BASE}/api/chats`);
        chats = await response.json();

        if (chats.length === 0) {
            chatList.innerHTML = `
                <div class="chat-empty" aria-live="polite">
                    <div class="chat-empty-icon">
                        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                            <path d="M18 24h20M18 32h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-opacity="0.5"/>
                        </svg>
                    </div>
                    <p class="chat-empty-title">No conversations yet</p>
                    <p class="chat-empty-hint">New chats will appear here</p>
                </div>
            `;
        } else {
            renderChatList(chats);
        }

        updateChatCount(chats.length);
    } catch (error) {
        console.error('Failed to load chats:', error);
        chatList.innerHTML = `
            <div class="chat-empty chat-empty-error" aria-live="polite">
                <p class="chat-empty-title" style="color: var(--danger);">Failed to load chats</p>
                <p class="chat-empty-hint">Pull to refresh or try again later</p>
            </div>
        `;
    }
}

function renderChatList(chats) {
    const chatList = document.getElementById('chat-list');
    const currentJid = window._activeChatJid || '';
    chatList.innerHTML = chats.map(chat => {
        const isActive = chat.phone === currentJid;
        return `
        <div class="chat-item ${isActive ? 'chat-item-active' : ''}" data-jid="${chat.phone}" onclick="selectChat('${chat.phone}')" role="button" tabindex="0">
            <div class="chat-avatar">${(chat.name || 'Unknown').charAt(0).toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-header">
                    <span class="chat-name">${chat.name || 'Unknown'}</span>
                    <span class="chat-time">${chat.lastMessageTime ? formatTime(new Date(chat.lastMessageTime).getTime()) : ''}</span>
                </div>
                <div class="chat-preview">${chat.lastMessage || 'No messages'}</div>
            </div>
        </div>
    `}).join('');
}

async function selectChat(phone) {
    window._activeChatJid = phone;
    const chatDetail = document.getElementById('chat-detail');
    const chatList = document.getElementById('chat-list');
    chatDetail.innerHTML = `
        <div class="chat-detail-loading">
            <div class="chat-loading-spinner"></div>
            <p>Loading conversation…</p>
        </div>
    `;

    try {
        const [messagesRes, contactRes] = await Promise.all([
            fetch(`${API_BASE}/api/chats/${phone}/messages`),
            fetch(`${API_BASE}/api/contacts/${phone}`)
        ]);
        const messages = await messagesRes.json();
        const contact = await contactRes.json();

        chatDetail.innerHTML = `
            <div class="chat-messages-container">
                <header class="chat-messages-header">
                    <button type="button" class="mobile-chat-back" onclick="closeChat()" aria-label="Back to conversations" style="display: none;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                        </svg>
                    </button>
                    <div class="chat-messages-header-avatar">${(contact.name || 'Unknown').charAt(0).toUpperCase()}</div>
                    <div class="chat-messages-header-info">
                        <h3 class="chat-detail-name">${contact.name || 'Unknown'}</h3>
                        <p class="chat-detail-phone">${phone}</p>
                    </div>
                </header>
                <div class="chat-messages-list">
                    ${messages.map(msg => `
                        <div class="message ${msg.role === 'agent' ? 'message-sent' : 'message-received'}">
                            <div class="message-content">${escapeHtml(msg.content)}</div>
                            <span class="message-time">${formatTime(new Date(msg.createdAt).getTime())}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        if (window.innerWidth <= 768) {
            chatDetail.classList.add('active');
            const backBtn = chatDetail.querySelector('.mobile-chat-back');
            if (backBtn) backBtn.style.display = 'flex';
        }
        // Re-render list to show active state
        if (chatList && Array.isArray(chats) && chats.length) {
            renderChatList(chats);
        }
        // Scroll messages to bottom
        requestAnimationFrame(() => {
            const list = chatDetail.querySelector('.chat-messages-list');
            if (list) list.scrollTop = list.scrollHeight;
        });
    } catch (error) {
        console.error('Failed to select chat:', error);
        chatDetail.innerHTML = `
            <div class="chat-detail-error">
                <p class="chat-detail-error-title">Couldn't load conversation</p>
                <p class="chat-detail-error-hint">${error.message}</p>
                <button type="button" class="btn-refresh" onclick="selectChat('${phone}')">Try again</button>
            </div>
        `;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeChat() {
    window._activeChatJid = '';
    const chatDetail = document.getElementById('chat-detail');
    const chatList = document.getElementById('chat-list');
    chatDetail.classList.remove('active');
    chatDetail.innerHTML = `
        <div class="chat-detail-empty">
            <div class="chat-detail-empty-icon">
                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
                    <path d="M26 30h20M26 40h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-opacity="0.5"/>
                </svg>
            </div>
            <h3 class="chat-detail-empty-title">Select a conversation</h3>
            <p class="chat-detail-empty-hint">Choose a chat from the list to view messages</p>
        </div>
    `;
    if (chatList && Array.isArray(chats) && chats.length) renderChatList(chats);
}



function updateChatCount(count) {
    const el = document.getElementById('chat-count');
    if (el) el.textContent = count;

    // Also update marketing sidebar badge
    const marketingEl = document.getElementById('marketing-chat-count');
    if (marketingEl) marketingEl.textContent = count;
}

// Contacts
async function loadContacts() {
    const contactsGrid = document.getElementById('contacts-grid');

    try {
        const response = await fetch(`${API_BASE}/api/contacts`);
        contacts = await response.json();

        if (contacts.length === 0) {
            contactsGrid.innerHTML = `
                <div class="contacts-empty">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="32" fill="#f3f4f6"/>
                        <circle cx="32" cy="26" r="8" stroke="#9ca3af" stroke-width="2"/>
                        <path d="M20 50c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <p>No contacts yet</p>
                </div>
            `;
        } else {
            renderContacts(contacts);
        }
    } catch (error) {
        console.error('Failed to load contacts:', error);
        contactsGrid.innerHTML = `
            <div class="contacts-empty">
                <p style="color: var(--danger);">Failed to load contacts</p>
            </div>
        `;
    }
}

function renderContacts(contacts) {
    const contactsGrid = document.getElementById('contacts-grid');
    contactsGrid.innerHTML = contacts.map(contact => `
        <div class="contact-card">
            <div class="contact-avatar">${contact.name.charAt(0).toUpperCase()}</div>
            <div class="contact-name">${contact.name}</div>
            <div class="contact-phone">${contact.phone}</div>
            <span class="contact-trust ${getTrustClass(contact.trustLevel)}">
                Trust Level: ${contact.trustLevel}
            </span>
        </div>
    `).join('');
}

function getTrustClass(level) {
    if (level >= 7) return 'high';
    if (level >= 4) return 'medium';
    return 'low';
}

// Communities
async function loadCommunities() {
    console.log('🔄 loadCommunities() called');
    const communitiesList = document.getElementById('communities-list');
    const totalCountEl = document.getElementById('comm-total-count');
    const totalReachEl = document.getElementById('comm-total-reach');

    if (!communitiesList) return;

    // Throttle: Don't fetch if fetched less than 10 seconds ago
    const now = Date.now();
    if (window._lastCommunitiesFetch && (now - window._lastCommunitiesFetch < 10000)) {
        console.log('⏳ Throttling communities fetch (cached)');
        return;
    }
    window._lastCommunitiesFetch = now;

    console.log('DOM Elements found:', {
        list: !!communitiesList,
        count: !!totalCountEl,
        reach: !!totalReachEl
    });

    if (!communitiesList) {
        console.error('❌ Critical: communities-list element not found in DOM');
        return;
    }

    try {
        console.log('📡 Fetching communities from API...');
        const response = await fetch(`${API_BASE}/api/marketing/groups`);
        const data = await response.json();
        console.log('📥 API Response:', data);

        if (!data.success || !data.groups || data.groups.length === 0) {
            console.warn('⚠️ No groups found in response');
            communitiesList.innerHTML = `
                <p class="empty-text">No WhatsApp groups found. Make sure you're connected.</p>
            `;
            if (totalCountEl) totalCountEl.textContent = '0';
            if (totalReachEl) totalReachEl.textContent = '0';
            return;
        }

        const groups = data.groups;
        console.log(`✅ Loaded ${groups.length} groups`);

        if (totalCountEl) totalCountEl.textContent = groups.length;
        if (totalReachEl) totalReachEl.textContent = groups.reduce((sum, g) => sum + (g.participants || 0), 0);

        communitiesList.innerHTML = groups.map(group => `
            <div class="marketing-list-item">
                <div class="marketing-list-item-header">
                    <div class="marketing-list-item-icon">👥</div>
                    <div class="marketing-list-item-info">
                        <h4>${group.name}</h4>
                        <p>${group.participants || 0} members</p>
                    </div>
                </div>
            </div>
        `).join('');
        console.log('🎨 Rendered groups list');

    } catch (error) {
        console.error('❌ Failed to load communities:', error);
        communitiesList.innerHTML = `
            <p class="empty-text" style="color: var(--danger);">Failed to load groups: ${error.message}</p>
        `;
    }
}

function filterCommunities() {
    const query = document.getElementById('communities-search').value.toLowerCase();
    const items = document.querySelectorAll('#communities-list .marketing-list-item');

    items.forEach(item => {
        const name = item.querySelector('h4').textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'block' : 'none';
    });
}

// Settings

async function loadSettings() {
    const statusEl = document.getElementById('settings-status');
    const phoneEl = document.getElementById('settings-phone');

    statusEl.textContent = connectionStatus === 'CONNECTED' ? 'Connected' : 'Disconnected';
    phoneEl.textContent = connectionStatus === 'CONNECTED' ? 'Connected' : 'Not connected';

    // Load System Settings
    try {
        const response = await fetch(`${API_BASE}/api/settings/system`);
        const data = await response.json();
        if (data.success && data.settings) {
            const batchWindow = data.settings['batch_window_ms'] || 30000;
            const input = document.getElementById('batch-window-input');
            if (input) input.value = batchWindow;
        }
    } catch (error) {
        console.error('Failed to load system settings:', error);
    }
}

function initializeSettings() {
    // Desktop notifications toggle
    const desktopNotif = document.getElementById('desktop-notifications');
    if (desktopNotif) {
        desktopNotif.checked = localStorage.getItem('desktop-notifications') === 'true';
        desktopNotif.addEventListener('change', (e) => {
            localStorage.setItem('desktop-notifications', e.target.checked);
            if (e.target.checked) {
                requestNotificationPermission();
            }
        });
    }

    // Sound alerts toggle
    const soundAlerts = document.getElementById('sound-alerts');
    if (soundAlerts) {
        soundAlerts.checked = localStorage.getItem('sound-alerts') === 'true';
        soundAlerts.addEventListener('change', (e) => {
            localStorage.setItem('sound-alerts', e.target.checked);
        });
    }

    // Save Batch Window
    document.getElementById('save-batch-window-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('save-batch-window-btn');
        const input = document.getElementById('batch-window-input');
        const originalText = btn.textContent;

        btn.textContent = '...';
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/api/settings/system`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'batch_window_ms', value: input.value })
            });
            const data = await response.json();
            if (data.success) {
                btn.textContent = '✓';
                setTimeout(() => btn.textContent = originalText, 2000);
            } else {
                alert('Failed to save setting');
            }
        } catch (error) {
            console.error('Failed to save setting:', error);
            alert('Error saving setting');
        } finally {
            btn.disabled = false;
        }
    });

    // Run Migrations
    document.getElementById('run-migration-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('run-migration-btn');
        if (!confirm('Are you sure you want to run database migrations? This may take a few seconds.')) return;

        const originalText = btn.textContent;
        btn.textContent = 'Running...';
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/api/admin/migrate`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                alert('Migrations completed successfully!');
                btn.textContent = 'Completed ✓';
            } else {
                alert('Migration failed: ' + (data.error || 'Unknown error'));
                btn.textContent = 'Failed ❌';
            }
        } catch (error) {
            console.error('Migration error:', error);
            alert('Migration error: ' + error.message);
            btn.textContent = 'Error ❌';
        } finally {
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 3000);
        }
    });

    // Disconnect button
    document.getElementById('disconnect-btn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to disconnect WhatsApp? You will need to scan the QR code again to reconnect.')) {
            const btn = document.getElementById('disconnect-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Disconnecting...';
            btn.disabled = true;

            try {
                const response = await fetch(`${API_BASE}/api/disconnect`, { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    btn.textContent = 'Disconnected ✓';

                    // Show success message
                    alert('Disconnected successfully! The app will now show a QR code for you to scan.');

                    // Switch to dashboard to show QR code
                    switchPage('dashboard');

                    // Force status check to update UI
                    setTimeout(() => {
                        checkStatus();
                        btn.textContent = originalText;
                        btn.disabled = false;
                    }, 1000);
                } else {
                    throw new Error(data.error || 'Disconnect failed');
                }
            } catch (error) {
                console.error('Disconnect failed:', error);
                alert('Disconnect failed: ' + error.message);
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }
    });
}

// Refresh
function initializeRefresh() {
    // Dashboard (Main) Refresh
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('refresh-btn');
        btn.style.transition = 'transform 0.5s ease';
        btn.style.transform = 'rotate(180deg)';
        loadPageData('dashboard');
        setTimeout(() => btn.style.transform = 'none', 500);
    });

    // Chats Refresh
    document.getElementById('refresh-chats-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('refresh-chats-btn');
        btn.style.transition = 'transform 0.5s ease';
        btn.style.transform = 'rotate(180deg)';
        loadChats();
        setTimeout(() => btn.style.transform = 'none', 500);
    });

    // Contacts Refresh
    document.getElementById('refresh-contacts-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('refresh-contacts-btn');
        btn.style.transition = 'transform 0.5s ease';
        btn.style.transform = 'rotate(180deg)';
        loadContacts();
        setTimeout(() => btn.style.transform = 'none', 500);
    });
}

// Notifications
function checkNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        // Don't auto-request, wait for user to enable in settings
    }
}

function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission();
    }
}

function showNotification(title, body) {
    if ('Notification' in window &&
        Notification.permission === 'granted' &&
        localStorage.getItem('desktop-notifications') === 'true') {
        new Notification(title, {
            body,
            icon: '/icon.png',
            badge: '/badge.png'
        });
    }
}

// Utilities
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
}

// Search functionality
document.getElementById('chat-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterChats(query);
});

// Chat list: keyboard support (Enter/Space to open chat)
document.getElementById('chat-list')?.addEventListener('keydown', (e) => {
    const item = e.target.closest('.chat-item[data-jid]');
    if (!item || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    selectChat(item.getAttribute('data-jid'));
});

document.getElementById('contact-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterContacts(query);
});

function filterChats(query) {
    if (!query.trim()) {
        renderChatList(chats);
        return;
    }
    const q = query.toLowerCase();
    const filtered = chats.filter(chat =>
        (chat.name || '').toLowerCase().includes(q) ||
        (chat.lastMessage || '').toLowerCase().includes(q)
    );
    renderChatList(filtered);
}

function filterContacts(query) {
    const filtered = contacts.filter(contact =>
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query)
    );
    renderContacts(filtered);
}

// Export for global access
window.switchPage = switchPage;
window.selectChat = selectChat;

// AI Profile Functions
async function loadAIProfile() {
    try {
        const response = await fetch(`${API_BASE}/api/ai-profile`);
        const profile = await response.json();

        // Populate form fields
        document.getElementById('agent-name').value = profile.agentName || '';
        document.getElementById('agent-role').value = profile.agentRole || '';
        document.getElementById('personality-traits').value = profile.personalityTraits || '';
        document.getElementById('communication-style').value = profile.communicationStyle || '';
        document.getElementById('system-prompt').value = profile.systemPrompt || '';
        document.getElementById('response-length').value = profile.responseLength || 'medium';
        document.getElementById('formality-level').value = profile.formalityLevel || 5;
        document.getElementById('formality-value').textContent = profile.formalityLevel || 5;
        document.getElementById('use-emojis').checked = profile.useEmojis !== false;

        // Add formality slider listener
        document.getElementById('formality-level').addEventListener('input', (e) => {
            document.getElementById('formality-value').textContent = e.target.value;
        });

        // Add save button listener
        document.getElementById('save-ai-profile').addEventListener('click', saveAIProfile);
    } catch (error) {
        console.error('Failed to load AI profile:', error);
        alert('Failed to load AI profile');
    }
}

async function saveAIProfile() {
    const btn = document.getElementById('save-ai-profile');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const data = {
            agentName: document.getElementById('agent-name').value,
            agentRole: document.getElementById('agent-role').value,
            personalityTraits: document.getElementById('personality-traits').value,
            communicationStyle: document.getElementById('communication-style').value,
            systemPrompt: document.getElementById('system-prompt').value || null,
            responseLength: document.getElementById('response-length').value,
            formalityLevel: parseInt(document.getElementById('formality-level').value),
            useEmojis: document.getElementById('use-emojis').checked
        };

        const response = await fetch(`${API_BASE}/api/ai-profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            btn.textContent = 'Saved ✓';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
            alert('AI Profile saved successfully! The changes will take effect in new conversations.');
        } else {
            throw new Error(result.error || 'Save failed');
        }
    } catch (error) {
        console.error('Failed to save AI profile:', error);
        alert('Failed to save AI profile: ' + error.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// User Profile Functions
async function loadUserProfile() {
    try {
        const response = await fetch(`${API_BASE}/api/user-profile`);
        const profile = await response.json();

        // Populate form fields
        document.getElementById('user-full-name').value = profile.fullName || '';
        if (document.getElementById('system-owner-phone')) {
            const ownerPhone = profile.configOwnerPhone || '';
            const countryCodeSelect = document.getElementById('owner-country-code');
            const phoneInput = document.getElementById('system-owner-phone');

            if (ownerPhone && ownerPhone !== 'Not configured' && ownerPhone !== 'Not set in .env') {
                // Try to match country code
                const codes = ['+254', '+1', '+44', '+91', '+234', '+27', '+256', '+255', '+250', '+86', '+81', '+82', '+33', '+49', '+39', '+34', '+61', '+55', '+52', '+971', '+966', '+20'];
                let matched = false;

                for (const code of codes) {
                    if (ownerPhone.startsWith(code)) {
                        countryCodeSelect.value = code;
                        phoneInput.value = ownerPhone.substring(code.length);
                        matched = true;
                        break;
                    }
                }

                // If no match, try without +
                if (!matched) {
                    const cleanPhone = ownerPhone.replace(/^\+/, '');
                    for (const code of codes) {
                        const cleanCode = code.replace('+', '');
                        if (cleanPhone.startsWith(cleanCode)) {
                            countryCodeSelect.value = code;
                            phoneInput.value = cleanPhone.substring(cleanCode.length);
                            matched = true;
                            break;
                        }
                    }
                }

                // If still no match, put entire number in input
                if (!matched) {
                    phoneInput.value = ownerPhone.replace(/^\+/, '');
                }
            } else {
                phoneInput.value = '';
            }
        }
        document.getElementById('user-preferred-name').value = profile.preferredName || '';
        document.getElementById('user-title').value = profile.title || '';
        document.getElementById('user-company').value = profile.company || '';
        document.getElementById('user-email').value = profile.email || '';
        document.getElementById('user-phone').value = profile.phone || '';
        document.getElementById('user-location').value = profile.location || '';
        document.getElementById('user-timezone').value = profile.timezone || '';
        document.getElementById('user-industry').value = profile.industry || '';
        document.getElementById('user-role').value = profile.role || '';
        document.getElementById('user-responsibilities').value = profile.responsibilities || '';
        document.getElementById('user-working-hours').value = profile.workingHours || '';
        document.getElementById('user-priorities').value = profile.priorities || '';
        document.getElementById('user-background').value = profile.backgroundInfo || '';

        // Add save button listener
        document.getElementById('save-user-profile').addEventListener('click', saveUserProfile);

        // Add owner phone save button listener
        document.getElementById('save-owner-phone-btn')?.addEventListener('click', async () => {
            const btn = document.getElementById('save-owner-phone-btn');
            const input = document.getElementById('system-owner-phone');
            const countryCode = document.getElementById('owner-country-code');
            const originalText = btn.textContent;

            // Validate phone number
            const phoneNumber = input.value.trim();
            if (!phoneNumber) {
                showToast('Please enter a phone number', 'error');
                return;
            }

            // Combine country code and phone number
            const fullPhone = countryCode.value + phoneNumber;

            btn.textContent = '...';
            btn.disabled = true;

            try {
                const response = await fetch(`${API_BASE}/api/settings/system`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'owner_phone', value: fullPhone })
                });
                const data = await response.json();
                if (data.success) {
                    btn.textContent = '✓';
                    showToast('Owner phone updated successfully!', 'success');
                    setTimeout(() => btn.textContent = originalText, 2000);
                } else {
                    showToast('Failed to save owner phone', 'error');
                }
            } catch (error) {
                console.error('Failed to save owner phone:', error);
                showToast('Error saving owner phone', 'error');
            } finally {
                btn.disabled = false;
            }
        });
    } catch (error) {
        console.error('Failed to load user profile:', error);
        alert('Failed to load user profile');
    }
}

async function saveUserProfile() {
    const btn = document.getElementById('save-user-profile');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const data = {
            fullName: document.getElementById('user-full-name').value,
            preferredName: document.getElementById('user-preferred-name').value,
            title: document.getElementById('user-title').value,
            company: document.getElementById('user-company').value,
            email: document.getElementById('user-email').value,
            phone: document.getElementById('user-phone').value,
            location: document.getElementById('user-location').value,
            timezone: document.getElementById('user-timezone').value,
            industry: document.getElementById('user-industry').value,
            role: document.getElementById('user-role').value,
            responsibilities: document.getElementById('user-responsibilities').value,
            workingHours: document.getElementById('user-working-hours').value,
            priorities: document.getElementById('user-priorities').value,
            backgroundInfo: document.getElementById('user-background').value
        };

        const response = await fetch(`${API_BASE}/api/user-profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            btn.textContent = 'Saved ✓';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
            alert('Profile saved successfully! The AI will use this information to provide better responses.');
        } else {
            throw new Error(result.error || 'Save failed');
        }
    } catch (error) {
        console.error('Failed to save user profile:', error);
        alert('Failed to save user profile: ' + error.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Toast Notification System
function showToast(message, type = 'info', title = null) {
    const container = document.getElementById('toast-container');

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon based on type
    let icon = '';
    switch (type) {
        case 'success': icon = '✓'; break;
        case 'error': icon = '✕'; break;
        case 'info': icon = 'ℹ'; break;
        default: icon = '•';
    }

    // Title defaults
    if (!title) {
        switch (type) {
            case 'success': title = 'Success'; break;
            case 'error': title = 'Error'; break;
            case 'info': title = 'Info'; break;
        }
    }

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Sound effect (optional, subtle)
    if (localStorage.getItem('sound-alerts') === 'true') {
        // const audio = new Audio('/notification.mp3'); 
        // audio.volume = 0.2;
        // audio.play().catch(() => {});
    }

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 4000);
}

// Override native alert
window.alert = (msg) => {
    // Determine type based on msg content simplistic check
    if (msg && (typeof msg === 'string')) {
        if (msg.toLowerCase().includes('success') || msg.toLowerCase().includes('saved')) {
            showToast(msg, 'success');
        } else if (msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error')) {
            showToast(msg, 'error');
        } else {
            showToast(msg, 'info');
        }
    } else {
        showToast(String(msg), 'info');
    }
};

// Auto-scroll function
function scrollToBottom(element) {
    if (element) {
        element.scrollTop = element.scrollHeight;
    }
}

// Hook into chat rendering to auto-scroll
const originalSelectChat = window.selectChat;
window.selectChat = async function (phone) {
    if (originalSelectChat) await originalSelectChat(phone);
    const container = document.querySelector('.chat-messages-list');
    scrollToBottom(container);
};

// ===== TIMEZONE PICKER =====
const timezoneData = [
    // Americas
    { city: 'New York', country: 'USA', timezone: 'America/New_York', offset: 'UTC-5' },
    { city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', offset: 'UTC-8' },
    { city: 'Chicago', country: 'USA', timezone: 'America/Chicago', offset: 'UTC-6' },
    { city: 'Denver', country: 'USA', timezone: 'America/Denver', offset: 'UTC-7' },
    { city: 'Phoenix', country: 'USA', timezone: 'America/Phoenix', offset: 'UTC-7' },
    { city: 'Toronto', country: 'Canada', timezone: 'America/Toronto', offset: 'UTC-5' },
    { city: 'Vancouver', country: 'Canada', timezone: 'America/Vancouver', offset: 'UTC-8' },
    { city: 'Mexico City', country: 'Mexico', timezone: 'America/Mexico_City', offset: 'UTC-6' },
    { city: 'São Paulo', country: 'Brazil', timezone: 'America/Sao_Paulo', offset: 'UTC-3' },
    { city: 'Buenos Aires', country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires', offset: 'UTC-3' },
    { city: 'Lima', country: 'Peru', timezone: 'America/Lima', offset: 'UTC-5' },
    { city: 'Bogotá', country: 'Colombia', timezone: 'America/Bogota', offset: 'UTC-5' },
    { city: 'Santiago', country: 'Chile', timezone: 'America/Santiago', offset: 'UTC-3' },

    // Europe
    { city: 'London', country: 'UK', timezone: 'Europe/London', offset: 'UTC+0' },
    { city: 'Paris', country: 'France', timezone: 'Europe/Paris', offset: 'UTC+1' },
    { city: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', offset: 'UTC+1' },
    { city: 'Madrid', country: 'Spain', timezone: 'Europe/Madrid', offset: 'UTC+1' },
    { city: 'Rome', country: 'Italy', timezone: 'Europe/Rome', offset: 'UTC+1' },
    { city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam', offset: 'UTC+1' },
    { city: 'Brussels', country: 'Belgium', timezone: 'Europe/Brussels', offset: 'UTC+1' },
    { city: 'Vienna', country: 'Austria', timezone: 'Europe/Vienna', offset: 'UTC+1' },
    { city: 'Zurich', country: 'Switzerland', timezone: 'Europe/Zurich', offset: 'UTC+1' },
    { city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm', offset: 'UTC+1' },
    { city: 'Oslo', country: 'Norway', timezone: 'Europe/Oslo', offset: 'UTC+1' },
    { city: 'Copenhagen', country: 'Denmark', timezone: 'Europe/Copenhagen', offset: 'UTC+1' },
    { city: 'Helsinki', country: 'Finland', timezone: 'Europe/Helsinki', offset: 'UTC+2' },
    { city: 'Warsaw', country: 'Poland', timezone: 'Europe/Warsaw', offset: 'UTC+1' },
    { city: 'Prague', country: 'Czech Republic', timezone: 'Europe/Prague', offset: 'UTC+1' },
    { city: 'Budapest', country: 'Hungary', timezone: 'Europe/Budapest', offset: 'UTC+1' },
    { city: 'Athens', country: 'Greece', timezone: 'Europe/Athens', offset: 'UTC+2' },
    { city: 'Istanbul', country: 'Turkey', timezone: 'Europe/Istanbul', offset: 'UTC+3' },
    { city: 'Moscow', country: 'Russia', timezone: 'Europe/Moscow', offset: 'UTC+3' },
    { city: 'Dublin', country: 'Ireland', timezone: 'Europe/Dublin', offset: 'UTC+0' },
    { city: 'Lisbon', country: 'Portugal', timezone: 'Europe/Lisbon', offset: 'UTC+0' },

    // Asia
    { city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', offset: 'UTC+4' },
    { city: 'Mumbai', country: 'India', timezone: 'Asia/Kolkata', offset: 'UTC+5:30' },
    { city: 'Delhi', country: 'India', timezone: 'Asia/Kolkata', offset: 'UTC+5:30' },
    { city: 'Bangalore', country: 'India', timezone: 'Asia/Kolkata', offset: 'UTC+5:30' },
    { city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', offset: 'UTC+8' },
    { city: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong', offset: 'UTC+8' },
    { city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', offset: 'UTC+9' },
    { city: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul', offset: 'UTC+9' },
    { city: 'Beijing', country: 'China', timezone: 'Asia/Shanghai', offset: 'UTC+8' },
    { city: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai', offset: 'UTC+8' },
    { city: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok', offset: 'UTC+7' },
    { city: 'Kuala Lumpur', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur', offset: 'UTC+8' },
    { city: 'Jakarta', country: 'Indonesia', timezone: 'Asia/Jakarta', offset: 'UTC+7' },
    { city: 'Manila', country: 'Philippines', timezone: 'Asia/Manila', offset: 'UTC+8' },
    { city: 'Hanoi', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh', offset: 'UTC+7' },
    { city: 'Taipei', country: 'Taiwan', timezone: 'Asia/Taipei', offset: 'UTC+8' },
    { city: 'Karachi', country: 'Pakistan', timezone: 'Asia/Karachi', offset: 'UTC+5' },
    { city: 'Dhaka', country: 'Bangladesh', timezone: 'Asia/Dhaka', offset: 'UTC+6' },
    { city: 'Riyadh', country: 'Saudi Arabia', timezone: 'Asia/Riyadh', offset: 'UTC+3' },
    { city: 'Tel Aviv', country: 'Israel', timezone: 'Asia/Jerusalem', offset: 'UTC+2' },

    // Africa
    { city: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo', offset: 'UTC+2' },
    { city: 'Lagos', country: 'Nigeria', timezone: 'Africa/Lagos', offset: 'UTC+1' },
    { city: 'Nairobi', country: 'Kenya', timezone: 'Africa/Nairobi', offset: 'UTC+3' },
    { city: 'Johannesburg', country: 'South Africa', timezone: 'Africa/Johannesburg', offset: 'UTC+2' },
    { city: 'Cape Town', country: 'South Africa', timezone: 'Africa/Johannesburg', offset: 'UTC+2' },
    { city: 'Casablanca', country: 'Morocco', timezone: 'Africa/Casablanca', offset: 'UTC+0' },
    { city: 'Accra', country: 'Ghana', timezone: 'Africa/Accra', offset: 'UTC+0' },
    { city: 'Addis Ababa', country: 'Ethiopia', timezone: 'Africa/Addis_Ababa', offset: 'UTC+3' },

    // Oceania
    { city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', offset: 'UTC+10' },
    { city: 'Melbourne', country: 'Australia', timezone: 'Australia/Melbourne', offset: 'UTC+10' },
    { city: 'Brisbane', country: 'Australia', timezone: 'Australia/Brisbane', offset: 'UTC+10' },
    { city: 'Perth', country: 'Australia', timezone: 'Australia/Perth', offset: 'UTC+8' },
    { city: 'Auckland', country: 'New Zealand', timezone: 'Pacific/Auckland', offset: 'UTC+12' },
    { city: 'Wellington', country: 'New Zealand', timezone: 'Pacific/Auckland', offset: 'UTC+12' },
    { city: 'Fiji', country: 'Fiji', timezone: 'Pacific/Fiji', offset: 'UTC+12' }
];

function initializeTimezonePicker() {
    const searchInput = document.getElementById('timezone-search');
    const dropdown = document.getElementById('timezone-dropdown');
    const timezoneList = document.getElementById('timezone-list');
    const hiddenInput = document.getElementById('user-timezone');
    const displayEl = document.getElementById('timezone-display');

    if (!searchInput || !dropdown || !timezoneList) return;

    let selectedTimezone = null;

    // Render timezone list
    function renderTimezones(filter = '') {
        const filtered = timezoneData.filter(tz =>
            tz.city.toLowerCase().includes(filter.toLowerCase()) ||
            tz.country.toLowerCase().includes(filter.toLowerCase()) ||
            tz.timezone.toLowerCase().includes(filter.toLowerCase())
        );

        timezoneList.innerHTML = filtered.map(tz => `
            <div class="timezone-item" data-timezone="${tz.timezone}">
                <div class="timezone-item-city">${tz.city}, ${tz.country}</div>
                <div class="timezone-item-details">
                    <span class="timezone-item-offset">${tz.offset}</span>
                    <span>${tz.timezone}</span>
                </div>
            </div>
        `).join('');

        // Add click handlers
        timezoneList.querySelectorAll('.timezone-item').forEach(item => {
            item.addEventListener('click', () => {
                const timezone = item.dataset.timezone;
                const tzData = timezoneData.find(tz => tz.timezone === timezone);
                selectTimezone(tzData);
            });
        });
    }

    // Select timezone
    function selectTimezone(tzData) {
        selectedTimezone = tzData;
        hiddenInput.value = tzData.timezone;
        searchInput.value = `${tzData.city}, ${tzData.country}`;
        displayEl.textContent = `${tzData.timezone} (${tzData.offset})`;
        dropdown.classList.remove('active');
    }

    // Show/hide dropdown
    searchInput.addEventListener('focus', () => {
        dropdown.classList.add('active');
        renderTimezones(searchInput.value);
    });

    searchInput.addEventListener('input', (e) => {
        renderTimezones(e.target.value);
        dropdown.classList.add('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Load existing timezone if present
    const existingTimezone = hiddenInput.value;
    if (existingTimezone) {
        const tzData = timezoneData.find(tz => tz.timezone === existingTimezone);
        if (tzData) {
            searchInput.value = `${tzData.city}, ${tzData.country}`;
            displayEl.textContent = `${tzData.timezone} (${tzData.offset})`;
        }
    }

    // Initial render
    renderTimezones();
}

// Initialize timezone picker when user profile page loads
const originalLoadUserProfile = loadUserProfile;
loadUserProfile = async function () {
    await originalLoadUserProfile();
    initializeTimezonePicker();
};

// ==========================================

// Tab Switching
window.switchMiniTab = function (tabId) {
    // Update tab buttons
    document.querySelectorAll('.mini-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabId) tab.classList.add('active');
    });

    // Update views
    document.querySelectorAll('.mini-view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`view-${tabId}`).classList.add('active');

    // Load data for specific tabs
    if (tabId === 'campaigns') refreshCampaigns();
    // if (tabId === 'settings') loadMiniProfile(); // Removed
};

// Initialize Marketing Page
function loadMarketing() {
    loadMiniStats();
    // loadMiniProfile(); // Removed
    refreshCampaigns();
}

// Load Stats
// Load Stats
async function loadMiniStats() {
    try {
        const [campRes, groupRes] = await Promise.all([
            fetch(`${API_BASE}/api/marketing/campaigns`),
            fetch(`${API_BASE}/api/marketing/groups`)
        ]);

        const campResult = await campRes.json();
        const groupResult = await groupRes.json();

        if (campResult.success && campResult.campaigns) {
            const activeCampaigns = campResult.campaigns.filter(c => c.status === 'active');
            const activeCount = activeCampaigns.length;

            document.getElementById('mini-active-count').textContent = activeCount;

            // Calculate Next Slot dynamically
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
            console.log("🕒 Current Browser Time:", timeString);

            let nextSlot = "--:--";
            let nextSource = "";

            if (activeCount > 0) {
                // Collect all active slots with source
                let allSlots = [];
                activeCampaigns.forEach(c => {
                    if (c.morningTime) allSlots.push({ time: c.morningTime, name: c.name });
                    if (c.afternoonTime) allSlots.push({ time: c.afternoonTime, name: c.name });
                    if (c.eveningTime) allSlots.push({ time: c.eveningTime, name: c.name });
                });

                // Sort slots chronologically
                allSlots.sort((a, b) => a.time.localeCompare(b.time));
                console.log("📅 Active Slots:", allSlots);

                // Find next time today
                const nextSlotObj = allSlots.find(s => s.time > timeString);

                if (nextSlotObj) {
                    nextSlot = nextSlotObj.time;
                    nextSource = nextSlotObj.name;
                } else if (allSlots.length > 0) {
                    // No more today, show earliest tomorrow
                    nextSlot = "Tom. " + allSlots[0].time;
                    nextSource = allSlots[0].name;
                }
            }
            document.getElementById('mini-next-slot').innerHTML = `
                ${nextSlot}
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; font-weight: 400;">
                    ${nextSource ? 'via ' + nextSource : ''}
                </div>
            `;
        }

        // Calculate Reach
        if (groupResult.success && groupResult.groups) {
            const totalParticipants = groupResult.groups.reduce((sum, g) => sum + (g.participants || 0), 0);
            document.getElementById('mini-reach-count').textContent = totalParticipants > 0 ? totalParticipants + "+" : "0";
        }

    } catch (e) {
        console.error("Stats load error", e);
    }
}

// (Legacy Profile Functions Removed)

// Refresh Campaigns
async function refreshCampaigns() {
    const grid = document.getElementById('mini-campaigns-list');
    if (!grid) return;

    grid.innerHTML = '<p class="empty-text">Loading...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/marketing/campaigns`);
        const result = await response.json();

        if (result.success && result.campaigns) {
            window.allCampaigns = result.campaigns;

            if (result.campaigns.length === 0) {
                grid.innerHTML = `<p class="empty-text">No campaigns yet. Create one from the Dashboard!</p>`;
                return;
            }

            grid.innerHTML = result.campaigns.map(c => `
                <div class="marketing-campaign-item">
                    <div class="marketing-campaign-info">
                        <h4>${c.name}</h4>
                        <div class="marketing-campaign-meta">
                            <span class="marketing-campaign-status ${c.status}">${c.status}</span>
                            <div class="marketing-campaign-schedule">
                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>${c.morningTime || '--:--'} / ${c.afternoonTime || '--:--'} / ${c.eveningTime || '--:--'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="marketing-campaign-actions">
                        <button onclick="editMiniCampaign(${c.id})" class="marketing-action-icon-btn" title="Edit">
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button onclick="deleteMiniCampaign(${c.id})" class="marketing-action-icon-btn delete" title="Delete">
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('');

            loadMiniStats(); // Update stats
        }
    } catch (e) {
        console.error(e);
        grid.innerHTML = '<p class="empty-text">Error loading campaigns.</p>';
    }
}

// Refresh Groups
window.refreshMiniGroups = async function () {
    const list = document.getElementById('mini-groups-list');
    list.innerHTML = '<p class="empty-text">Loading...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/marketing/groups`);
        const result = await response.json();

        if (result.success && result.groups) {
            list.innerHTML = result.groups.map(g => `
                <div class="mini-card">
                    <h4>${g.name || 'Unknown Group'}</h4>
                    <p>${g.participants || 0} members</p>
                    <small style="opacity: 0.6;">${g.id}</small>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<p class="empty-text">No groups found.</p>';
        }
    } catch (e) {
        list.innerHTML = '<p class="empty-text">Error loading groups.</p>';
    }
};

// Modal Functions
window.openSimpleCampaignModal = function () {
    document.getElementById('mini-camp-id').value = '';
    document.getElementById('mini-camp-name').value = '';
    document.getElementById('content-source-ai').checked = true;
    toggleContentSourceUI('ai');
    loadCampaignProductOptions();
    document.getElementById('simple-campaign-modal').classList.add('active');
};

window.closeSimpleCampaignModal = function () {
    document.getElementById('simple-campaign-modal').classList.remove('active');
};

// Content source toggle: show/hide product selector
window.toggleContentSourceUI = function (source) {
    const selector = document.getElementById('campaign-product-selector');
    const productSelect = document.getElementById('mini-selected-product');
    if (source === 'existing') {
        if (selector) selector.style.display = 'block';
        if (productSelect) productSelect.required = true;
    } else {
        if (selector) selector.style.display = 'none';
        if (productSelect) {
            productSelect.required = false;
            productSelect.value = '';
        }
    }
};

// Load shops and products for campaign product selector
window.loadCampaignProductOptions = async function () {
    const select = document.getElementById('mini-selected-product');
    if (!select) return;
    select.innerHTML = '<option value="">Loading...</option>';
    try {
        const res = await fetch(`${API_BASE}/api/shops`);
        const shops = await res.json();
        if (!Array.isArray(shops) || shops.length === 0) {
            select.innerHTML = '<option value="">No shops or portfolios yet</option>';
            return;
        }
        let html = '<option value="">-- Select what to promote --</option>';
        for (const shop of shops) {
            const products = shop.products || [];
            const typeLabel = shop.type === 'career' ? 'Portfolio' : 'Shop';
            const itemLabel = shop.type === 'career' ? 'items' : 'products';
            if (products.length > 0) {
                html += `<option value="shop:${shop.id}">${shop.emoji || '📦'} ${shop.name} — Rotate all ${products.length} ${itemLabel}</option>`;
                for (const p of products) {
                    html += `<option value="product:${p.id}">${shop.emoji || '📦'} ${shop.name} → ${p.name}</option>`;
                }
            }
        }
        select.innerHTML = html || '<option value="">No products/items in shops yet</option>';
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option value="">Error loading shops</option>';
    }
};

// Submit Campaign
// Submit Campaign
window.submitMiniCampaign = async function () {
    const btn = document.getElementById('btn-submit');
    if (btn.disabled) return; // Prevent double submission


    const name = document.getElementById('mini-camp-name').value;
    if (!name) {
        showToast("Please enter a campaign name", "error");
        return;
    }

    const contentSource = document.querySelector('input[name="content-source"]:checked')?.value || 'ai';
    const selectionValue = contentSource === 'existing' ? document.getElementById('mini-selected-product')?.value : null;
    if (contentSource === 'existing' && !selectionValue) {
        showToast("Please select a shop or item to promote", "error");
        return;
    }
    let selectedProductId = null, selectedShopId = null;
    if (selectionValue) {
        if (selectionValue.startsWith('shop:')) selectedShopId = parseInt(selectionValue.slice(5), 10);
        else if (selectionValue.startsWith('product:')) selectedProductId = parseInt(selectionValue.slice(8), 10);
    }

    btn.disabled = true;
    btn.innerHTML = 'Creating...';

    // Get time values only if the slot is enabled
    const morningEnabled = document.getElementById('toggle-morning').checked;
    const afternoonEnabled = document.getElementById('toggle-afternoon').checked;
    const eveningEnabled = document.getElementById('toggle-evening').checked;

    // Validate at least one slot is enabled
    if (!morningEnabled && !afternoonEnabled && !eveningEnabled) {
        showToast("Please enable at least one time slot", "error");
        btn.disabled = false;
        btn.innerHTML = 'Create Campaign <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>';
        return;
    }

    const payload = {
        name: name,
        morningTime: morningEnabled ? document.getElementById('mini-time-m').value : null,
        afternoonTime: afternoonEnabled ? document.getElementById('mini-time-a').value : null,
        eveningTime: eveningEnabled ? document.getElementById('mini-time-e').value : null,
        businessDescription: document.getElementById('mini-business-desc').value || null,
        productInfo: document.getElementById('mini-product-info').value,
        uniqueSellingPoint: document.getElementById('mini-usp').value,
        brandVoice: document.getElementById('mini-voice').value,
        companyLink: document.getElementById('mini-company-link').value || null,
        contentSource: contentSource,
        selectedProductId: selectedProductId,
        selectedShopId: selectedShopId
    };

    // Add targetAudience text if element exists (I might add it back)
    // If not, use "General Audience"
    const audInput = document.getElementById('mini-audience-text');
    if (audInput) payload.targetAudience = audInput.value;

    // Get selected groups
    const checkboxes = document.querySelectorAll('#modal-audience-list .group-checkbox:checked');
    const selectedGroupIds = Array.from(checkboxes).map(cb => cb.value);

    // Determine Mode (Create or Edit)
    const campaignId = document.getElementById('mini-camp-id').value;
    const isEdit = !!campaignId;

    try {
        let res;
        if (isEdit) {
            // Update Campaign Properties
            payload.targetGroups = selectedGroupIds; // Merge targetGroups into payload for edit
            res = await fetch(`${API_BASE}/api/marketing/campaign/${campaignId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Create Campaign
            res = await fetch(`${API_BASE}/api/marketing/campaign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const json = await res.json();

        if (json.success) {
            // 2. If specific groups selected, update targets
            // Note: If Editing, we should also update targets. 
            // Currently PUT /campaign/targets updates *active* campaign only which is ambiguous for editing paused/non-active ones.
            // But since creating makes it active, it works for new.
            // For Edit: We need proper target support. 
            // The `updateCampaign` endpoint supports `targetGroups` directly! 
            // So we can merge it into payload for Edit!

            if (!isEdit && selectedGroupIds.length > 0) { // Only for new campaigns, if groups selected
                await fetch(`${API_BASE}/api/marketing/campaign/targets`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetGroups: selectedGroupIds })
                });
            }

            showToast(isEdit ? "Campaign Updated!" : "Campaign Launched!", "success");
            closeSimpleCampaignModal();
            refreshCampaigns();
            loadMiniStats();
        } else {
            throw new Error(json.error || "Failed");
        }
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `Create Campaign <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>`;
    }
};

// Edit Campaign
// Edit Campaign
window.editMiniCampaign = async function (id) {
    const campaign = window.allCampaigns.find(c => c.id === id);
    if (!campaign) return;

    // Populate fields
    document.getElementById('mini-camp-id').value = campaign.id;
    document.getElementById('mini-camp-name').value = campaign.name;

    // Content source and product/shop selection
    const contentSource = campaign.contentSource || 'ai';
    document.getElementById('content-source-existing').checked = contentSource === 'existing';
    document.getElementById('content-source-ai').checked = contentSource === 'ai';
    await loadCampaignProductOptions();
    const productSelect = document.getElementById('mini-selected-product');
    if (productSelect && contentSource === 'existing') {
        if (campaign.selectedShopId) productSelect.value = 'shop:' + campaign.selectedShopId;
        else if (campaign.selectedProductId) productSelect.value = 'product:' + campaign.selectedProductId;
    }
    toggleContentSourceUI(contentSource);

    document.getElementById('mini-product-info').value = campaign.productInfo || '';
    document.getElementById('mini-usp').value = campaign.uniqueSellingPoint || '';
    document.getElementById('mini-voice').value = campaign.brandVoice || 'Professional';
    document.getElementById('mini-company-link').value = campaign.companyLink || '';

    // Populate Business Description
    if (campaign.businessDescription) {
        document.getElementById('mini-business-desc').value = campaign.businessDescription;
        document.getElementById('enhanced-desc-display').innerText = campaign.businessDescription;
        document.getElementById('enhanced-desc-container').style.display = 'block';
        // Also put it in the raw input so they can edit it if they want to re-enhance
        // Or should we leave raw empty? Let's leave raw empty to signify 'this was AI generated' 
        // OR better: put a placeholder or snippet. 
        // Actually, if we have a saved description, let's just make sure the UI reflects it.
    } else {
        document.getElementById('mini-business-desc').value = '';
        document.getElementById('enhanced-desc-display').innerText = '';
        document.getElementById('enhanced-desc-container').style.display = 'none';
        document.getElementById('mini-business-desc-raw').value = '';
    }


    document.getElementById('mini-time-m').value = campaign.morningTime || "07:00";
    document.getElementById('mini-time-a').value = campaign.afternoonTime || "13:00";
    document.getElementById('mini-time-e').value = campaign.eveningTime || "19:00";

    // Set toggle states based on whether times are null
    const morningToggle = document.getElementById('toggle-morning');
    const afternoonToggle = document.getElementById('toggle-afternoon');
    const eveningToggle = document.getElementById('toggle-evening');

    if (morningToggle) {
        morningToggle.checked = campaign.morningTime !== null;
        toggleTimeSlot('morning');
    }
    if (afternoonToggle) {
        afternoonToggle.checked = campaign.afternoonTime !== null;
        toggleTimeSlot('afternoon');
    }
    if (eveningToggle) {
        eveningToggle.checked = campaign.eveningTime !== null;
        toggleTimeSlot('evening');
    }


    // Set Editing Targets (Handle potential issues if targetGroups is null)
    window.currentEditingTargets = Array.isArray(campaign.targetGroups) ? campaign.targetGroups : [];

    // Open Modal
    document.getElementById('simple-campaign-modal').classList.add('active');

    // Enable stepping through wizard comfortably
    document.querySelectorAll('.marketing-step').forEach((el, index) => {
        el.style.cursor = 'pointer';
        el.onclick = () => updateWizardStep(index + 1);
    });

    // Reset/Setup Wizard to Step 1
    wizardCurrentStep = 1;
    updateWizardStep(1);

    // Update UI for Edit Mode
    document.querySelector('.marketing-modal-title').textContent = `Edit Campaign: ${campaign.name}`;
    const btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) btnSubmit.innerHTML = 'Save Changes';

    // Force reload groups next time Step 3 is viewed to show checkboxes correctly
    const list = document.getElementById('modal-audience-list');
    if (list) list.dataset.loaded = 'false';
};

// Delete Campaign
window.deleteMiniCampaign = async function (id) {
    if (!confirm("Delete this campaign?")) return;
    try {
        await fetch(`${API_BASE}/api/marketing/campaign/${id}`, { method: 'DELETE' });
        refreshCampaigns();
        showToast("Campaign deleted", "info");
    } catch (e) {
        showToast("Delete failed", "error");
    }
};

// Make globally available
window.refreshCampaigns = refreshCampaigns;
window.loadMarketing = loadMarketing;

// ==========================================
// TIME SLOT TOGGLE FUNCTIONALITY
// ==========================================

window.toggleTimeSlot = function (slot) {
    const card = document.querySelector(`.time-slot-card[data-slot="${slot}"]`);
    const toggle = document.getElementById(`toggle-${slot}`);
    const body = document.getElementById(`body-${slot}`);

    if (toggle.checked) {
        // Enable the slot
        card.classList.remove('disabled');
        body.style.maxHeight = '200px';
        body.style.opacity = '1';
    } else {
        // Disable the slot
        card.classList.add('disabled');
        body.style.maxHeight = '0';
        body.style.opacity = '0';
    }

    // Update review summary if we're on that step
    if (typeof updateReviewSummary === 'function') {
        updateReviewSummary();
    }
};

// ==========================================
// STEP INDICATOR WIZARD LOGIC
// ==========================================

let wizardCurrentStep = 1;

window.updateWizardStep = function (step) {
    // Validate current step before moving forward
    if (step > wizardCurrentStep) {
        if (!validateStep(wizardCurrentStep)) return;
    }

    wizardCurrentStep = step;

    // 1. Update Step Indicators
    document.querySelectorAll('.marketing-step').forEach((stepEl, index) => {
        const stepNum = index + 1;
        if (stepNum < wizardCurrentStep) {
            stepEl.classList.add('marketing-step-completed');
            stepEl.classList.remove('marketing-step-active');
        } else if (stepNum === wizardCurrentStep) {
            stepEl.classList.add('marketing-step-active');
            stepEl.classList.remove('marketing-step-completed');
        } else {
            stepEl.classList.remove('marketing-step-active', 'marketing-step-completed');
        }
    });

    // 2. Toggle Sections Visibility
    document.querySelectorAll('.marketing-wizard-step').forEach(el => {
        if (parseInt(el.dataset.step) === wizardCurrentStep) {
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    });

    // 3. Update Buttons
    const btnCancel = document.getElementById('btn-cancel');
    const btnBack = document.getElementById('btn-back');
    const btnNext = document.getElementById('btn-next');
    const btnSubmit = document.getElementById('btn-submit');

    if (wizardCurrentStep === 1) {
        btnBack.style.display = 'none';
        btnNext.style.display = 'block';
        btnSubmit.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'block';
    } else if (wizardCurrentStep === 4) {
        btnBack.style.display = 'block';
        btnNext.style.display = 'none';
        btnSubmit.style.display = 'block'; // Show "Create"
        updateReviewSummary(); // Populate summary
    } else {
        // Steps 2, 3
        btnBack.style.display = 'block';
        btnNext.style.display = 'block';
        btnSubmit.style.display = 'none';
    }

    // Special logic for Step 3 (Audience)
    if (wizardCurrentStep === 3) {
        loadModalGroups();
    }
};

function validateStep(step) {
    if (step === 1) {
        const name = document.getElementById('mini-camp-name').value;
        const product = document.getElementById('mini-product-info').value;

        if (!name || name.trim() === '') {
            showToast("Please enter a campaign name", "error");
            return false;
        }
        if (!product || product.trim() === '') {
            showToast("Please describe your product/service", "error");
            return false;
        }
    }
    // Step 2 (Time) defaults are usually fine, but can validate format if needed
    // Step 3 (Audience) is optional (all groups if none selected) or mandatory? Let's make it optional (default ALL).
    return true;
}

window.nextWizardStep = function () {
    if (wizardCurrentStep < 4) {
        updateWizardStep(wizardCurrentStep + 1);
    }
};

window.prevWizardStep = function () {
    if (wizardCurrentStep > 1) {
        updateWizardStep(wizardCurrentStep - 1); // Pass validation check? No, back is always allowed
        // But my updateWizardStep calls validate if step > current. 
        // So I need to modify updateWizardStep logic or bypass it.
        // Actually my logic `if (step > wizardCurrentStep)` handles forward only.
        // So back works.
    }
};

// Load Audience Groups for Modal
async function loadModalGroups() {
    const list = document.getElementById('modal-audience-list');
    // Always reload to ensure fresh state, or handle loaded state better. 
    // If we use dataset.loaded, we must clear it on modal open (which we do).
    if (!list || list.dataset.loaded === 'true') return;

    list.innerHTML = '<p class="empty-text">Loading groups...</p>';
    list.className = 'marketing-list-grid scrollable-list'; // Apply grid class

    try {
        const response = await fetch(`${API_BASE}/api/marketing/groups`);
        const result = await response.json();

        if (result.success && result.groups) {
            if (result.groups.length === 0) {
                list.innerHTML = '<p class="empty-text">No groups found.</p>';
                return;
            }

            const currentTargets = window.currentEditingTargets || [];

            // Add Select All Button Container
            let html = `
                <div style="grid-column: 1 / -1; display: flex; justify-content: flex-end; padding-bottom: 0.5rem; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                    <button type="button" class="marketing-btn-secondary" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="toggleAllGroups(this)" data-state="none">
                        Select All
                    </button>
                </div>
            `;

            html += result.groups.map(g => {
                // Robust check for ID (handle string vs number)
                const isSelected = currentTargets.some(id => String(id) === String(g.id));
                const selectedClass = isSelected ? 'selected' : '';
                const checked = isSelected ? 'checked' : '';

                return `
                <div class="marketing-list-item ${selectedClass}" onclick="toggleGroupSelection(this)">
                    <div>
                        <h4>${g.name || 'Unknown Group'}</h4>
                        <p>${g.participants || 0} participants</p>
                    </div>
                    <div class="selection-indicator">
                        <input type="checkbox" class="group-checkbox" value="${g.id}" style="pointer-events: none;" ${checked}> 
                    </div>
                </div>
            `}).join('');

            list.innerHTML = html;

            list.dataset.loaded = 'true';
            updateReviewSummary(); // Update summary immediately after load
        }
    } catch (e) {
        list.innerHTML = '<p class="empty-text">Error loading groups.</p>';
    }
}

// Add the toggleAllGroups function
window.toggleAllGroups = function (btn) {
    const list = document.getElementById('modal-audience-list');
    const items = list.querySelectorAll('.marketing-list-item');
    const currentState = btn.dataset.state;
    // If current state is 'all', we want to deselect (false). If 'none', select (true).
    const newState = currentState !== 'all';

    items.forEach(item => {
        const checkbox = item.querySelector('.group-checkbox');
        if (checkbox) {
            checkbox.checked = newState;
            if (newState) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        }
    });

    // Update button state
    btn.dataset.state = newState ? 'all' : 'none';
    btn.textContent = newState ? 'Deselect All' : 'Select All';

    // Update summary text
    updateReviewSummary();
};

window.toggleGroupSelection = function (el) {
    el.classList.toggle('selected');
    const checkbox = el.querySelector('.group-checkbox');
    if (checkbox) {
        checkbox.checked = el.classList.contains('selected');
    }
    updateReviewSummary();
};

function updateReviewSummary() {
    const name = document.getElementById('mini-camp-name').value;

    // Get enabled time slots
    const morningEnabled = document.getElementById('toggle-morning')?.checked;
    const afternoonEnabled = document.getElementById('toggle-afternoon')?.checked;
    const eveningEnabled = document.getElementById('toggle-evening')?.checked;

    const timeM = document.getElementById('mini-time-m').value;
    const timeA = document.getElementById('mini-time-a').value;
    const timeE = document.getElementById('mini-time-e').value;

    // Build schedule text with only enabled slots
    const scheduleParts = [];
    if (morningEnabled) scheduleParts.push(`🌅 ${timeM}`);
    if (afternoonEnabled) scheduleParts.push(`☀️ ${timeA}`);
    if (eveningEnabled) scheduleParts.push(`🌙 ${timeE}`);

    const scheduleText = scheduleParts.length > 0 ? scheduleParts.join(' • ') : 'No time slots enabled';

    // Count selected groups
    const checkboxes = document.querySelectorAll('#modal-audience-list .group-checkbox:checked');
    const audienceText = checkboxes.length > 0 ? `${checkboxes.length} specific groups selected` : "All Groups (Broadcast)";

    const nameEl = document.getElementById('review-name');
    if (nameEl) nameEl.textContent = name;

    const schedEl = document.getElementById('review-schedule');
    if (schedEl) schedEl.textContent = scheduleText;

    const audEl = document.getElementById('review-audience');
    if (audEl) audEl.textContent = audienceText;
}

// Reset wizard on modal open
const originalOpenModal = window.openSimpleCampaignModal;
window.openSimpleCampaignModal = function () {
    wizardCurrentStep = 1;
    document.getElementById('mini-camp-id').value = '';
    document.getElementById('mini-camp-name').value = '';
    document.getElementById('content-source-ai').checked = true;
    toggleContentSourceUI('ai');
    loadCampaignProductOptions();
    // Reset Title
    const titleEl = document.querySelector('.marketing-modal-title');
    if (titleEl) titleEl.textContent = "Create New Campaign";
    const btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) btnSubmit.innerHTML = 'Create Campaign <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>';

    // Clear editing targets
    window.currentEditingTargets = [];

    const list = document.getElementById('modal-audience-list');
    if (list) list.dataset.loaded = 'false';

    // Clear checkboxes
    document.querySelectorAll('#modal-audience-list input').forEach(cb => cb.checked = false);

    updateWizardStep(1);
    if (originalOpenModal) originalOpenModal();
};

// Stub function for test ad generation
window.triggerTestAd = function () {
    showToast("Test Ad feature coming soon!", "info");
};

// ==========================================
// Communities Page Logic
// ==========================================

window.allCommunities = [];

window.loadCommunities = async function () {
    const list = document.getElementById('communities-list');
    const totalCountEl = document.getElementById('comm-total-count');
    const totalReachEl = document.getElementById('comm-total-reach');

    list.innerHTML = '<p class="empty-text">Loading communities...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/marketing/groups`);
        const result = await response.json();

        if (result.success && result.groups) {
            window.allCommunities = result.groups;
            renderCommunities(result.groups);

            // Update Stats
            if (totalCountEl) totalCountEl.textContent = result.groups.length;
            if (totalReachEl) {
                const totalParticipants = result.groups.reduce((sum, g) => sum + (g.participants || 0), 0);
                totalReachEl.textContent = totalParticipants.toLocaleString();
            }
        } else {
            list.innerHTML = '<p class="empty-text">No communities found.</p>';
            if (totalCountEl) totalCountEl.textContent = '0';
            if (totalReachEl) totalReachEl.textContent = '0';
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p class="empty-text">Error loading communities.</p>';
    }
};

function renderCommunities(groups) {
    const list = document.getElementById('communities-list');
    if (!list) return;

    if (groups.length === 0) {
        list.innerHTML = '<p class="empty-text">No groups match your search.</p>';
        return;
    }

    list.innerHTML = groups.map(g => `
        <div class="marketing-list-item" style="cursor: default;">
            <div class="community-icon">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            </div>
            <div style="flex: 1;">
                <h4 style="margin: 0; font-size: 1rem; color: var(--text-primary);">${g.name || 'Unknown Group'}</h4>
                <div style="display: flex; gap: 10px; margin-top: 4px;">
                     <span style="font-size: 0.85rem; color: var(--text-secondary);">👥 ${g.participants || 0} members</span>
                     <span style="font-size: 0.8rem; background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; color: var(--text-secondary);">${g.id.split('@')[0].slice(-4)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

window.filterCommunities = function () {
    const query = document.getElementById('communities-search').value.toLowerCase();
    const filtered = window.allCommunities.filter(g =>
        (g.name && g.name.toLowerCase().includes(query)) ||
        (g.id && g.id.includes(query))
    );
    renderCommunities(filtered);
};

// Hook into sidebar nav clicks for Communities
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            const pageId = e.currentTarget.dataset.page;
            if (pageId === 'communities') {
                loadCommunities();
            }
        });
    });
});

// ========================================
// BUSINESS DESCRIPTION AI ENHANCEMENT
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const enhanceBtn = document.getElementById('enhance-desc-btn');
    const rawDescInput = document.getElementById('mini-business-desc-raw');
    const enhancedContainer = document.getElementById('enhanced-desc-container');
    const enhancedDisplay = document.getElementById('enhanced-desc-display');
    const enhancedHiddenInput = document.getElementById('mini-business-desc');

    if (enhanceBtn) {
        enhanceBtn.addEventListener('click', async () => {
            const rawDesc = rawDescInput.value.trim();

            if (!rawDesc) {
                alert('Please describe your business first');
                return;
            }

            // Show loading state
            enhanceBtn.disabled = true;
            enhanceBtn.textContent = '⏳ Enhancing...';

            try {
                const response = await fetch(`${API_BASE}/api/marketing/enhance-description`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rawDescription: rawDesc })
                });

                const data = await response.json();

                if (data.success && data.enhancedDescription) {
                    // Show enhanced description
                    enhancedDisplay.textContent = data.enhancedDescription;
                    enhancedHiddenInput.value = data.enhancedDescription;
                    enhancedContainer.style.display = 'block';

                    // Success feedback
                    enhanceBtn.textContent = '✅ Enhanced!';
                    setTimeout(() => {
                        enhanceBtn.textContent = '✨ Enhance with AI';
                        enhanceBtn.disabled = false;
                    }, 2000);
                } else {
                    throw new Error(data.error || 'Enhancement failed');
                }
            } catch (error) {
                console.error('Enhancement error:', error);
                alert('Failed to enhance description: ' + error.message);
                enhanceBtn.textContent = '✨ Enhance with AI';
                enhanceBtn.disabled = false;
            }
        });
    }
});

// ==========================================
// SHOPFLOW LOGIC
// ==========================================

let currentShopId = null;
let currentImageData = null;
let currentImageUrls = []; // For career: multiple photos

// Expose functions to window

// Collection Type Modal Functions
window.openCollectionTypeModal = function () {
    const modal = document.getElementById('collectionTypeModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

window.closeCollectionTypeModal = function () {
    const modal = document.getElementById('collectionTypeModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.selectCollectionType = function (type) {
    // Close the type selection modal
    closeCollectionTypeModal();

    // Set the collection type
    document.getElementById('collectionType').value = type;

    // Update modal content based on type
    const modalTitle = document.getElementById('createModalTitle');
    const nameLabel = document.getElementById('nameLabel');
    const nameInput = document.getElementById('shopName');
    const nameHint = document.getElementById('nameHint');
    const descLabel = document.getElementById('descLabel');
    const descTextarea = document.getElementById('shopDescription');
    const descHint = document.getElementById('descHint');
    const submitBtn = document.getElementById('createSubmitBtn');

    if (type === 'career') {
        modalTitle.textContent = 'Create Career Portfolio';
        nameLabel.textContent = 'Portfolio Name';
        nameInput.placeholder = 'e.g. John Doe - Software Engineer';
        nameHint.textContent = 'Your professional name or title';
        descLabel.textContent = 'Professional Summary';
        descTextarea.placeholder = 'Describe your skills, experience, and what you offer...';
        descHint.textContent = 'Highlight your expertise and achievements';
        submitBtn.textContent = 'Create Portfolio';
        document.getElementById('shopEmoji').placeholder = 'e.g. 💼';
    } else {
        modalTitle.textContent = 'Create New Shop';
        nameLabel.textContent = 'Shop Name';
        nameInput.placeholder = 'e.g. Tech Store';
        nameHint.textContent = 'Give your shop a catchy name';
        descLabel.textContent = 'Description';
        descTextarea.placeholder = 'What kind of products do you sell?';
        descHint.textContent = 'Describe what you offer';
        submitBtn.textContent = 'Create Shop';
        document.getElementById('shopEmoji').placeholder = 'e.g. 🏪';
    }

    // Open the create modal
    openCreateShopModal();
};

window.openCreateShopModal = function () {
    const modal = document.getElementById('createShopModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('createShopForm').reset();
        // Restore the collection type if it was set
        const collectionType = document.getElementById('collectionType').value;
        if (collectionType) {
            document.getElementById('collectionType').value = collectionType;
        }
    }
};

window.closeCreateShopModal = function () {
    const modal = document.getElementById('createShopModal');
    if (modal) {
        modal.style.display = 'none';
    }
};




window.handleCreateShop = async function (e) {
    e.preventDefault();

    const collectionType = document.getElementById('collectionType').value || 'shop';

    const shopData = {
        name: document.getElementById('shopName').value,
        description: document.getElementById('shopDescription').value,
        emoji: document.getElementById('shopEmoji').value || (collectionType === 'career' ? '💼' : '🏪'),
        type: collectionType
    };

    try {
        const response = await fetch(`${API_BASE}/api/shops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shopData)
        });
        const result = await response.json();

        if (result && result.success) {
            closeCreateShopModal();
            loadShops();
            const itemType = collectionType === 'career' ? 'Portfolio' : 'Shop';
            showToast(`${itemType} created successfully!`, 'success');
        } else {
            showToast('Failed to create collection', 'error');
        }
    } catch (error) {
        console.error('Error creating collection:', error);
        showToast('Error creating collection', 'error');
    }
};

window.showShopsView = function () {
    document.getElementById('products-view').style.display = 'none';
    document.getElementById('shops-view').style.display = 'block';

    // Reset state
    window.currentShopId = null;
    window.currentShopType = null;

    // Reload shops to ensure latest data
    loadShops();
};

window.loadShops = async function () {
    const grid = document.getElementById('shopsGrid');
    if (!grid) return;

    grid.innerHTML = '<div style="text-align: center; width: 100%; padding: 40px; color: var(--text-secondary);">Loading...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/shops`);
        const shops = await response.json();

        if (!shops || shops.length === 0) {
            grid.innerHTML = `
                <div class="empty-state glass-panel" style="padding: 4rem; text-align: center; border-radius: 24px;">
                    <div class="empty-state-icon" style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.8; animation: float 6s infinite ease-in-out;">🏪</div>
                    <div class="empty-state-text" style="font-size: 1.5rem; margin-bottom: 0.5rem;">No collections yet</div>
                    <p style="color: var(--text-secondary);">Create a shop or career portfolio to get started!</p>
                </div>
            `;
        } else {
            grid.innerHTML = shops.map((shop, index) => {
                const productCount = shop.products ? shop.products.length : 0;

                // Calculate value only for retail shops
                const isCareer = shop.type === 'career';
                const totalValue = !isCareer && shop.products ? shop.products.reduce((sum, p) => sum + (p.price * p.stock), 0) : 0;

                const itemLabel = isCareer ? 'Items' : 'Products';
                const valueHtml = isCareer ? '' : `
                            <div class="stat">
                                <div class="stat-value">$${totalValue.toLocaleString()}</div>
                                <div class="stat-label">Value</div>
                            </div>`;

                const typeBadge = isCareer ?
                    '<span class="collection-type-badge career">Portfolio</span>' :
                    '<span class="collection-type-badge shop">Shop</span>';

                return `
                    <div class="shop-card glass-panel" onclick="openShop(${shop.id})" style="animation-delay: ${index * 0.1}s; position: relative; padding: 1.5rem; border-radius: 20px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 1rem; overflow: hidden;">
                        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, rgba(255,255,255,0.03), transparent); z-index: -1;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            ${typeBadge}
                            <button class="delete-shop-btn" onclick="event.stopPropagation(); deleteShop(${shop.id})" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div class="shop-icon" style="font-size: 2.5rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));">${shop.emoji}</div>
                            <div>
                                <div class="shop-name" style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">${shop.name}</div>
                                <div class="shop-description" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${shop.description || ''}</div>
                            </div>
                        </div>

                        <div class="shop-stats" style="display: flex; gap: 1rem; margin-top: auto; padding-top: 1rem; border-top: 1px solid var(--border);">
                            <div class="stat" style="display: flex; flex-direction: column;">
                                <div class="stat-value" style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">${productCount}</div>
                                <div class="stat-label" style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">${itemLabel}</div>
                            </div>
                            ${valueHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading shops:', error);
        grid.innerHTML = '<div style="text-align: center; width: 100%; padding: 40px; color: var(--danger);">Failed to load shops</div>';
    }
};

window.deleteShop = async function (id) {
    if (confirm('Delete this collection and all its items?')) {
        try {
            const response = await fetch(`${API_BASE}/api/shops/${id}`, { method: 'DELETE' });
            const result = await response.json();
            if (result && result.success) {
                loadShops();
                showToast('Deleted successfully', 'success');
            } else {
                showToast('Failed to delete', 'error');
            }
        } catch (error) {
            console.error('Error deleting shop:', error);
            showToast('Error deleting', 'error');
        }
    }
};

window.openShop = async function (shopId) {
    currentShopId = shopId;

    document.getElementById('shops-view').style.display = 'none';
    document.getElementById('products-view').style.display = 'grid'; // Changed to grid to match CSS if needed, or match previous

    // Fetch latest details to check type
    try {
        const response = await fetch(`${API_BASE}/api/shops/${shopId}`);
        const shop = await response.json();

        if (!shop) return;

        document.getElementById('currentShopName').textContent = shop.name;
        document.getElementById('currentShopDesc').textContent = shop.description;
        document.getElementById('currentShopIcon').textContent = shop.emoji;

        // Adjust UI based on type
        const isCareer = shop.type === 'career';

        const addTitle = document.getElementById('addProductTitle');
        const submitBtn = document.getElementById('addProductSubmitBtn');
        const nameLabel = document.getElementById('productNameLabel');
        const descLabel = document.getElementById('productDescLabel');
        const priceStockGroup = document.getElementById('productPriceStockGroup');

        const imageLabel = document.getElementById('productImageLabel');
        const imageInput = document.getElementById('imageInput');
        const careerMultiHint = document.getElementById('careerMultiPhotosHint');
        if (isCareer) {
            if (addTitle) addTitle.textContent = 'Add Skill or Project';
            if (submitBtn) submitBtn.textContent = 'Add to Portfolio';
            if (nameLabel) nameLabel.textContent = 'Skill / Project Name';
            if (descLabel) descLabel.textContent = 'Description / Details';
            if (priceStockGroup) priceStockGroup.style.display = 'none';
            if (imageLabel) imageLabel.textContent = 'Photos (add multiple for ad rotation)';
            if (imageInput) imageInput.setAttribute('multiple', 'multiple');
            if (careerMultiHint) careerMultiHint.style.display = 'block';
        } else {
            if (addTitle) addTitle.textContent = 'Add New Product';
            if (submitBtn) submitBtn.textContent = 'Add Product';
            if (nameLabel) nameLabel.textContent = 'Product Name';
            if (descLabel) descLabel.textContent = 'Description';
            if (imageLabel) imageLabel.textContent = 'Product Image';
            if (imageInput) imageInput.removeAttribute('multiple');
            if (careerMultiHint) careerMultiHint.style.display = 'none';
            if (priceStockGroup) priceStockGroup.style.display = 'grid';
        }

        // Reset image state when switching shops
        removeImage();

        // Store type on the modal for later use
        window.currentShopType = shop.type;

        renderProducts(shop.products, shop.type);
    } catch (error) {
        console.error('Error opening shop:', error);
        showToast('Error loading details', 'error');
        showShopsView();
    }
};

window.renderProducts = function (products, shopType = 'shop') {
    const grid = document.getElementById('productsGrid');
    const isCareer = shopType === 'career';

    if (!products || products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state glass-panel" style="grid-column: 1/-1; padding: 4rem; text-align: center; border-radius: 20px;">
                <div class="empty-state-icon" style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.8;">${isCareer ? '💼' : '📦'}</div>
                <div class="empty-state-text" style="font-size: 1.5rem; margin-bottom: 0.5rem;">No items yet</div>
                <p style="color: var(--text-secondary);">${isCareer ? 'Add your first skill or project!' : 'Add your first product to this shop!'}</p>
            </div>
        `;
    } else {
        grid.innerHTML = products.map((product, index) => {
            let footerHtml = '';

            if (!isCareer) {
                let stockClass = '';
                let stockText = `${product.stock} in stock`;

                if (product.stock === 0) {
                    stockClass = 'out';
                    stockText = 'Out of stock';
                } else if (product.stock < 10) {
                    stockClass = 'low';
                    stockText = `${product.stock} left`;
                }

                footerHtml = `
                    <div class="product-footer">
                        <div class="product-price">$${Number(product.price).toFixed(2)}</div>
                        <div class="product-stock ${stockClass}">${stockText}</div>
                    </div>
                `;
            }

            return `
                <div class="product-card glass-panel" style="animation: fadeIn 0.6s ease ${index * 0.1}s both; overflow: hidden; border-radius: 16px; border: 1px solid var(--glass-border); transition: transform 0.3s ease, box-shadow 0.3s ease; display: flex; flex-direction: column;">
                    <div style="position: relative; padding-top: 60%; overflow: hidden; background: rgba(0,0,0,0.2);">
                        <img src="${product.imageUrl || (product.imageUrls && product.imageUrls[0]) || product.image || 'https://placehold.co/400x300?text=No+Image'}" alt="${product.name}" class="product-image" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;">
                    </div>
                    <div class="product-info" style="padding: 1.25rem; flex: 1; display: flex; flex-direction: column;">
                        <div class="product-name" style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; line-height: 1.3;">${product.name}</div>
                        <div class="product-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.5; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${product.description}</div>
                        ${footerHtml}
                        <button class="delete-product-btn" onclick="deleteProduct(${product.id})" style="margin-top: 1rem; width: 100%; padding: 0.75rem; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); color: #fca5a5; border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    }
};

window.handleImageSelect = function (e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    currentImageUrls = [];
    const loadNext = (i) => {
        if (i >= files.length) {
            currentImageData = currentImageUrls[0] || null;
            updateImagePreview(currentImageUrls[0]);
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentImageUrls.push(ev.target.result);
            loadNext(i + 1);
        };
        reader.readAsDataURL(files[i]);
    };
    loadNext(0);
};
function updateImagePreview(src) {
    const previewImage = document.getElementById('imagePreview');
    const imageUploadArea = document.getElementById('imageUploadArea');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const placeholder = document.getElementById('uploadPlaceholder');
    if (!src) return;
    previewImage.src = src;
    previewImage.classList.add('visible');
    previewImage.style.display = 'block';
    imageUploadArea.classList.add('has-image');
    if (placeholder) placeholder.style.display = 'none';
    removeImageBtn.style.display = 'block';
}

window.removeImage = function () {
    currentImageData = null;
    currentImageUrls = [];
    const previewImage = document.getElementById('imagePreview');
    const imageUploadArea = document.getElementById('imageUploadArea');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const imageInput = document.getElementById('imageInput');
    const placeholder = document.getElementById('uploadPlaceholder');

    previewImage.src = '';
    previewImage.classList.remove('visible');
    imageUploadArea.classList.remove('has-image');

    if (placeholder) placeholder.style.display = 'block';

    imageInput.value = '';
    removeImageBtn.style.display = 'none';
};

window.handleAddProduct = async function (e) {
    e.preventDefault();

    if (!currentShopId) return;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Adding...';
    btn.disabled = true;

    // Handle career vs shop types
    const priceInput = document.getElementById('productPrice').value;
    const stockInput = document.getElementById('productStock').value;

    // Default to 0 if empty (career case) or invalid
    const price = priceInput ? parseFloat(priceInput) : 0;
    const stock = stockInput ? parseInt(stockInput) : 0;

    const placeholderImg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="20" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
    const productData = {
        name: document.getElementById('productName').value,
        price: price,
        stock: stock,
        description: document.getElementById('productDesc').value,
        image: currentImageData || (currentImageUrls && currentImageUrls[0]) || placeholderImg,
        imageUrls: (currentImageUrls && currentImageUrls.length > 0) ? currentImageUrls : undefined
    };

    try {
        const response = await fetch(`${API_BASE}/api/shops/${currentShopId}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        const result = await response.json();

        if (result && result.success) {
            // Reset form
            document.getElementById('addProductForm').reset();
            removeImage(); // helper to reset image UI

            showToast('Product added successfully!', 'success');

            // Reload shop details
            openShop(currentShopId);
        } else {
            showToast('Failed to add product', 'error');
        }
    } catch (error) {
        console.error('Error adding product:', error);
        showToast('Error adding product', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};

window.deleteProduct = async function (productId) {
    if (confirm('Delete this product?')) {
        try {
            const response = await fetch(`${API_BASE}/api/products/${productId}`, { method: 'DELETE' });
            const result = await response.json();
            if (result && result.success) {
                showToast('Product deleted', 'success');
                openShop(currentShopId);
            } else {
                showToast('Failed to delete product', 'error');
            }
        } catch (error) {
            console.error('Error deleting product:', error);
            showToast('Error deleting product', 'error');
        }
    }
};

// ==========================================
// Analytics Dashboard Logic
// ==========================================

let engagementChart = null;
let campaignChart = null;
let volumeChart = null;
let peakHoursChart = null;
let messageTypesChart = null;
let inboundOutboundChart = null;

async function loadAnalytics() {
    console.log('🔄 Loading Analytics Dashboard...');
    try {
        const res = await fetch(`${API_BASE}/api/analytics/dashboard`);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data = await res.json();

        const { overview, groupStats, messageVolumeByDay, peakActivityByHour, messageTypes, inboundOutbound, topContactsByVolume, topCampaigns } = data;
        const groups = (groupStats?.largestGroups || []);

        // KPI Cards
        setEl('stat-total-messages', overview?.totalMessages ?? 0);
        setEl('stat-active-chats', overview?.activeChats ?? 0);
        setEl('stat-response-time', formatResponseTime(overview?.avgResponseTimeSec));
        setEl('stat-new-contacts', overview?.newContactsLast7d ?? 0);
        setEl('stat-read-rate', (overview?.readRate ?? 0) + '%');
        setEl('stat-queue-pending', overview?.queuePending ?? 0);

        // Charts
        renderVolumeChart(messageVolumeByDay || []);
        renderPeakHoursChart(peakActivityByHour || []);
        renderMessageTypesChart(messageTypes || []);
        renderInboundOutboundChart(inboundOutbound || { inbound: 0, outbound: 0 });
        renderEngagementChart(overview || { delivered: 0, read: 0, replies: 0 });
        renderCampaignChart(topCampaigns || []);

        // Tables
        renderTopContactsTable(topContactsByVolume || []);
        renderTopGroupsTable(groups);

        // Insights
        renderInsights(data);

        // Empty states - show table when data exists, empty state when not
        toggleTableAndEmpty('contacts-table-wrapper', 'top-contacts-empty', !!(topContactsByVolume?.length));
        toggleTableAndEmpty('groups-table-wrapper', 'groups-empty', !!(groups.length));
        toggleEmpty('campaigns-empty', !(topCampaigns?.length));
    } catch (error) {
        console.error('Failed to load analytics:', error);
        showToast('Failed to load analytics data', 'error');
    }
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) {
        // Format large numbers
        if (typeof val === 'number' && val >= 1000) {
            el.textContent = val >= 1000000 
                ? (val / 1000000).toFixed(1) + 'M'
                : val >= 1000 
                    ? (val / 1000).toFixed(1) + 'K'
                    : String(val);
        } else {
            el.textContent = String(val);
        }
    }
}

function formatResponseTime(sec) {
    if (!sec || sec < 0) return '-';
    if (sec < 60) return sec + 's';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? m + 'm ' + s + 's' : m + 'm';
}

function toggleEmpty(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'block' : 'none';
}

function toggleTableAndEmpty(tableWrapperId, emptyStateId, hasData) {
    const tableWrapper = document.getElementById(tableWrapperId);
    const emptyState = document.getElementById(emptyStateId);
    if (tableWrapper) tableWrapper.style.display = hasData ? 'block' : 'none';
    if (emptyState) emptyState.style.display = hasData ? 'none' : 'flex';
}

function renderInsights(data) {
    const { messageVolumeByDay = [], peakActivityByHour = [], overview = {}, inboundOutbound = {} } = data;
    
    // Volume Insights
    const peakHour = peakActivityByHour.reduce((best, h) => (h.count > (best?.count || 0) ? h : best), null);
    const totalVol = messageVolumeByDay.reduce((s, d) => s + (d.count || 0), 0);
    const avgPerDay = messageVolumeByDay.length ? Math.round(totalVol / messageVolumeByDay.length) : 0;
    const recentTrend = messageVolumeByDay.length >= 2 
        ? messageVolumeByDay.slice(-2).reduce((sum, d) => sum + (d.count || 0), 0) / 2
        : 0;
    const trendDirection = recentTrend > avgPerDay ? 'increasing' : recentTrend < avgPerDay ? 'decreasing' : 'stable';
    const growthRate = avgPerDay > 0 ? (((recentTrend - avgPerDay) / avgPerDay) * 100).toFixed(1) : 0;
    
    const volumeInsight = totalVol > 0
        ? `📊 Volume Analysis: ${overview.totalMessages || 0} total messages (${avgPerDay}/day avg). Trend is ${trendDirection}${Math.abs(growthRate) > 5 ? ` (${growthRate > 0 ? '+' : ''}${growthRate}%)` : ''}. ${overview.newContactsLast7d > 0 ? `${overview.newContactsLast7d} new contacts acquired.` : ''}`
        : '📊 Start chatting to see message volume trends and growth patterns.';

    // Peak Activity Insights
    const peakHours = peakActivityByHour
        .map((h, i) => ({ hour: i, count: h.count || 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    const peakWindow = peakHours.length > 0 && peakHours[0].count > 0
        ? `Peak activity window: ${peakHours.map(h => `${h.hour}:00`).join(', ')} UTC. ${peakHours[0].count} messages during peak hour. Optimal campaign timing: ${peakHours[0].hour}:00-${(peakHours[0].hour + 2) % 24}:00 UTC.`
        : '⏰ Activity patterns will emerge as message volume increases. Monitor hourly distribution for optimal engagement windows.';

    // Engagement Insights
    const delivered = overview.delivered || 0;
    const read = overview.read || 0;
    const replies = overview.replies || 0;
    const readRate = delivered > 0 ? ((read / delivered) * 100).toFixed(1) : 0;
    const replyRate = delivered > 0 ? ((replies / delivered) * 100).toFixed(1) : 0;
    const conversionRate = read > 0 ? ((replies / read) * 100).toFixed(1) : 0;
    
    const inboundRatio = (inboundOutbound.inbound || 0) / Math.max((inboundOutbound.inbound || 0) + (inboundOutbound.outbound || 0), 1);
    const balanceInsight = inboundRatio > 0.6 ? 'Users are highly engaged' : inboundRatio < 0.4 ? 'Agent is proactive' : 'Balanced conversation flow';
    
    const engagementInsight = delivered > 0
        ? `🎯 Engagement Metrics: Read rate ${readRate}% (${read}/${delivered}), Reply rate ${replyRate}% (${replies}/${delivered}), Conversion ${conversionRate}%. ${overview.avgResponseTimeSec > 0 ? `Response time: ${formatResponseTime(overview.avgResponseTimeSec)}. ` : ''}${balanceInsight}.`
        : '🎯 Run marketing campaigns to track engagement funnel: Delivered → Read → Replied. Monitor conversion rates for optimization.';

    setEl('insight-volume', volumeInsight);
    setEl('insight-peak', peakWindow);
    setEl('insight-engagement', engagementInsight);
}

function renderTopContactsTable(contacts) {
    const tbody = document.getElementById('top-contacts-body');
    if (!tbody) return;
    
    const contactList = (contacts || []).slice(0, 10); // Limit to top 10
    const totalMessages = contactList.reduce((sum, c) => sum + (c.messageCount || 0), 0);
    
    tbody.innerHTML = contactList.map((c, idx) => {
        const percentage = totalMessages > 0 ? ((c.messageCount / totalMessages) * 100).toFixed(1) : 0;
        return `
        <tr>
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="color: var(--text-secondary); font-size: 0.75rem;">#${idx + 1}</span>
                    <span>${escapeHtml(c.name || c.phone || 'Unknown')}</span>
                </div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-weight: 600;">${c.messageCount || 0}</span>
                    <span style="color: var(--text-secondary); font-size: 0.7rem;">(${percentage}%)</span>
                </div>
            </td>
        </tr>
    `}).join('');
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function renderVolumeChart(volumeByDay) {
    const ctx = document.getElementById('volumeChart')?.getContext('2d');
    if (!ctx) return;
    if (volumeChart) volumeChart.destroy();
    
    const labels = volumeByDay.map(d => {
        const dte = d.date ? new Date(d.date + 'T00:00:00') : null;
        return dte ? dte.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : d.date || '';
    });
    const counts = volumeByDay.map(d => d.count || 0);
    const maxCount = Math.max(...counts, 1);
    
    volumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['No data'],
            datasets: [{
                label: 'Messages',
                data: counts.length ? counts : [0],
                backgroundColor: counts.map(c => {
                    const intensity = c / maxCount;
                    return `rgba(99, 102, 241, ${0.4 + intensity * 0.4})`;
                }),
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            if (context.dataIndex > 0 && counts[context.dataIndex - 1] > 0) {
                                const change = counts[context.dataIndex] - counts[context.dataIndex - 1];
                                const changePercent = ((change / counts[context.dataIndex - 1]) * 100).toFixed(1);
                                return change !== 0 ? `${change > 0 ? '+' : ''}${changePercent}% vs previous day` : 'No change';
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        stepSize: maxCount > 20 ? Math.ceil(maxCount / 5) : 1,
                        callback: function(value) {
                            return value >= 1000 ? (value / 1000).toFixed(1) + 'K' : value;
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#9ca3af',
                        maxRotation: 45,
                        minRotation: 0,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

function renderPeakHoursChart(peakByHour) {
    const ctx = document.getElementById('peakHoursChart')?.getContext('2d');
    if (!ctx) return;
    if (peakHoursChart) peakHoursChart.destroy();
    
    const hourData = peakByHour.length ? peakByHour : Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    const labels = hourData.map(h => {
        const hour = h.hour;
        if (hour === 0) return '00:00';
        if (hour % 3 === 0 || hour === 23) return (hour < 10 ? '0' : '') + hour + ':00';
        return '';
    });
    const counts = hourData.map(h => h.count || 0);
    const maxCount = Math.max(...counts, 1);
    
    peakHoursChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hourData.map(h => h.hour),
            datasets: [{
                label: 'Messages',
                data: counts,
                backgroundColor: counts.map(c => {
                    const intensity = c / maxCount;
                    return `rgba(6, 182, 212, ${0.3 + intensity * 0.5})`;
                }),
                borderColor: 'rgba(6, 182, 212, 0.8)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 5,
                    right: 5
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const hour = context[0].label;
                            return `${hour < 10 ? '0' : ''}${hour}:00 UTC`;
                        },
                        label: function(context) {
                            return `${context.parsed.y} messages`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        stepSize: maxCount > 10 ? Math.ceil(maxCount / 5) : 1
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value, index) {
                            const hour = parseInt(value);
                            if (hour === 0 || hour % 3 === 0 || hour === 23) {
                                return (hour < 10 ? '0' : '') + hour + ':00';
                            }
                            return '';
                        },
                        maxRotation: 0,
                        font: { size: 9 }
                    }
                }
            }
        }
    });
}

function renderMessageTypesChart(types) {
    const ctx = document.getElementById('messageTypesChart')?.getContext('2d');
    if (!ctx) return;
    if (messageTypesChart) messageTypesChart.destroy();
    const labels = types.length ? types.map(t => (t.type || 'text').charAt(0).toUpperCase() + (t.type || 'text').slice(1)) : ['Text'];
    const counts = types.length ? types.map(t => t.count || 0) : [0];
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
    messageTypesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: counts,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } },
            cutout: '65%'
        }
    });
}

function renderInboundOutboundChart(io) {
    const ctx = document.getElementById('inboundOutboundChart')?.getContext('2d');
    if (!ctx) return;
    if (inboundOutboundChart) inboundOutboundChart.destroy();
    const inbound = io.inbound ?? 0;
    const outbound = io.outbound ?? 0;
    inboundOutboundChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Inbound (Users)', 'Outbound (Agent)'],
            datasets: [{
                data: [inbound, outbound],
                backgroundColor: ['#10b981', '#6366f1'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } },
            cutout: '65%'
        }
    });
}


// ==========================================
// Group Analytics Drill-down Logic
// ==========================================

let gaEngagementChart = null;
let gaRoleChart = null;

window.openGroupAnalytics = async function (jid) {
    try {
        const modal = document.getElementById('groupAnalyticsModal');
        modal.style.display = 'flex';

        // Reset/Loading state
        document.getElementById('ga-subject').textContent = 'Loading...';

        const res = await fetch(`${API_BASE}/api/analytics/groups/details/${jid}`);
        if (!res.ok) throw new Error('Failed to fetch details');
        const data = await res.json();

        const { info, members, stats } = data;

        // 1. Populate Header & KPIs
        document.getElementById('ga-subject').textContent = info.subject;
        document.getElementById('ga-jid').textContent = info.jid;
        document.getElementById('ga-avatar').textContent = info.subject.substring(0, 2).toUpperCase();

        document.getElementById('ga-members').textContent = info.totalMembers;
        document.getElementById('ga-admins').textContent = info.adminsCount;
        document.getElementById('ga-read-rate').textContent = stats.readRate + '%';
        document.getElementById('ga-replies').textContent = stats.replies;

        // Calculate Bot Age
        const joinDate = info.botJoinedAt ? new Date(info.botJoinedAt) : new Date();
        const diffTime = Math.abs(new Date() - joinDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        document.getElementById('ga-bot-age').textContent = diffDays + (diffDays === 1 ? ' Day' : ' Days');

        // 2. Render Charts
        renderGaCharts(stats, members);

        // 3. Render Member Table
        const tbody = document.getElementById('ga-members-body');
        tbody.innerHTML = members.map(m => `
            <tr>
                <td>${formatPhone(m.phone)}</td>
                <td>
                    <span class="badge ${m.isAdmin ? 'badge-primary' : 'badge-secondary'}">
                        ${m.role}
                    </span>
                </td>
                <td><span class="text-muted">Active</span></td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error opening group analytics:', error);
        showToast('Failed to load group details', 'error');
        closeGroupAnalyticsModal();
    }
};

window.closeGroupAnalyticsModal = function () {
    document.getElementById('groupAnalyticsModal').style.display = 'none';
};

function renderGaCharts(stats, members) {
    // Engagement Chart
    const ctx1 = document.getElementById('gaEngagementChart')?.getContext('2d');
    if (ctx1) {
        if (gaEngagementChart) gaEngagementChart.destroy();
        gaEngagementChart = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: ['Delivered', 'Read', 'Replied'],
                datasets: [{
                    label: 'Count',
                    data: [stats.delivered, stats.read, stats.replies],
                    backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6'],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // Role Distribution Chart
    const ctx2 = document.getElementById('gaRoleChart')?.getContext('2d');
    if (ctx2) {
        if (gaRoleChart) gaRoleChart.destroy();

        const admins = members.filter(m => m.isAdmin).length;
        const regular = members.length - admins;

        gaRoleChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['Admins', 'Participants'],
                datasets: [{
                    data: [admins, regular],
                    backgroundColor: ['#f59e0b', '#3b82f6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#9ca3af' } }
                },
                cutout: '70%'
            }
        });
    }
}

function formatPhone(phone) {
    if (!phone) return 'Unknown';
    return phone.split('@')[0];
}

function renderTopGroupsTable(groups) {
    const tbody = document.getElementById('top-groups-body');
    if (!tbody) return;

    tbody.innerHTML = (groups || []).map(g => {
        const joinDate = g.botJoinedAt ? new Date(g.botJoinedAt) : new Date();
        const diffDays = Math.ceil((Date.now() - joinDate) / (1000 * 60 * 60 * 24));
        const botAge = diffDays + (diffDays === 1 ? ' Day' : ' Days');
        return `
        <tr>
            <td class="group-name">
                <div class="avatar-sm">${(g.subject || '??').substring(0, 2).toUpperCase()}</div>
                <div>
                    <div class="fw-bold">${escapeHtml(g.subject || 'Unknown')}</div>
                    <small class="text-muted">${(g.jid || '').split('@')[0]}</small>
                </div>
            </td>
            <td>${g.totalMembers ?? 0}</td>
            <td>${g.adminsCount ?? 0}</td>
            <td>${botAge}</td>
            <td style="text-align: right;">
                <button class="btn-icon" onclick="openGroupAnalytics('${(g.jid || '').replace(/'/g, "\\'")}')" title="Analyze Group">
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                    </svg>
                </button>
            </td>
        </tr>
    `}).join('');
}

function renderEngagementChart(overview) {
    const ctx = document.getElementById('engagementChart')?.getContext('2d');
    if (!ctx) return;

    if (engagementChart) engagementChart.destroy();

    const delivered = overview.delivered || 0;
    const read = overview.read || 0;
    const replies = overview.replies || 0;

    engagementChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Delivered', 'Read', 'Replied'],
            datasets: [{
                label: 'Count',
                data: [delivered, read, replies],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(139, 92, 246, 0.7)'
                ],
                borderColor: [
                    'rgba(59, 130, 246, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(139, 92, 246, 1)'
                ],
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const value = context.parsed.y;
                            const total = delivered;
                            if (context.dataIndex === 0) return '';
                            if (context.dataIndex === 1 && total > 0) {
                                const rate = ((value / total) * 100).toFixed(1);
                                return `Read Rate: ${rate}%`;
                            }
                            if (context.dataIndex === 2 && total > 0) {
                                const rate = ((value / total) * 100).toFixed(1);
                                return `Reply Rate: ${rate}%`;
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return value >= 1000 ? (value / 1000).toFixed(1) + 'K' : value;
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { size: 11 } }
                }
            }
        }
    });
}

function renderCampaignChart(campaigns) {
    const ctx = document.getElementById('campaignChart')?.getContext('2d');
    if (!ctx) return;

    if (campaignChart) campaignChart.destroy();

    const list = Array.isArray(campaigns) ? campaigns : [];
    const emptyState = document.getElementById('campaigns-empty');
    
    if (emptyState) {
        emptyState.style.display = list.length === 0 ? 'block' : 'none';
    }

    if (list.length === 0) return;

    const labels = list.map(c => (c.name || 'Campaign').substring(0, 20));
    const readData = list.map(c => Number(c.reads) || 0);
    const replyData = list.map(c => Number(c.replies) || 0);

    campaignChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Reads',
                    data: readData,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                },
                {
                    label: 'Replies',
                    data: replyData,
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                    borderColor: 'rgba(139, 92, 246, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#9ca3af',
                        font: { size: 12 },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        footer: function(tooltipItems) {
                            const reads = tooltipItems[0].parsed.y;
                            const replies = tooltipItems[1]?.parsed.y || 0;
                            if (reads > 0) {
                                const conversionRate = ((replies / reads) * 100).toFixed(1);
                                return `Conversion: ${conversionRate}%`;
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return value >= 1000 ? (value / 1000).toFixed(1) + 'K' : value;
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#9ca3af',
                        maxRotation: 45,
                        minRotation: 0,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}
