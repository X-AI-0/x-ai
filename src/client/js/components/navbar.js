// Navigation Bar Component
export class NavBar {
    constructor(options = {}) {
        this.currentPage = options.currentPage || '';
        this.basePath = options.basePath || '';
        this.connectionStatus = 'connecting';
        
        this.init();
    }

    /**
     * Initialize the navigation bar
     */
    init() {
        this.render();
        this.bindEvents();
        this.updateActiveLink();
        this.setupConnectionMonitoring();
    }

    /**
     * Render the navigation bar HTML
     */
    render() {
        const navHTML = this.generateNavHTML();
        
        // Find existing navbar or create one
        let navbar = document.querySelector('.navbar');
        if (navbar) {
            navbar.outerHTML = navHTML;
        } else {
            // Insert navbar at the beginning of the app div
            const app = document.getElementById('app');
            if (app) {
                app.insertAdjacentHTML('afterbegin', navHTML);
            }
        }
    }

    /**
     * Generate navigation HTML
     */
    generateNavHTML() {
        const navigationItems = this.getNavigationItems();
        
        return `
            <nav class="navbar">
                <div class="nav-container">
                    <div class="nav-brand">
                        <i class="fas fa-comments"></i>
                        <span>X-AI</span>
                    </div>
                    <div class="nav-links">
                        ${navigationItems.map(item => this.generateNavLink(item)).join('')}
                    </div>
                    <div class="connection-status">
                        <div class="status-indicator" id="connectionStatus">
                            <i class="fas fa-circle"></i>
                            <span>Connecting...</span>
                        </div>
                    </div>
                </div>
            </nav>
        `;
    }

    /**
     * Get navigation items configuration
     */
    getNavigationItems() {
        return [
            {
                id: 'home',
                label: 'Home',
                icon: 'fas fa-home',
                href: this.getRelativePath('index.html'),
                description: 'Dashboard and overview'
            },
            {
                id: 'discussions',
                label: 'Discussions',
                icon: 'fas fa-comments',
                href: this.getRelativePath('pages/discussion/discussion.html'),
                description: 'Multi-model AI discussions'
            },
            {
                id: 'chat',
                label: 'Chat',
                icon: 'fas fa-comment-dots',
                href: this.getRelativePath('pages/chat/chat.html'),
                description: 'Direct chat with AI models'
            },
            {
                id: 'models',
                label: 'Models',
                icon: 'fas fa-robot',
                href: this.getRelativePath('pages/models/models.html'),
                description: 'Manage AI models'
            },
            {
                id: 'social',
                label: 'Social Media',
                icon: 'fas fa-share-alt',
                href: this.getRelativePath('pages/social/social.html'),
                description: 'Social media integration'
            },
            {
                id: 'settings',
                label: 'Settings',
                icon: 'fas fa-cog',
                href: this.getRelativePath('pages/settings/settings.html'),
                description: 'Application settings'
            }
        ];
    }

    /**
     * Generate individual navigation link HTML
     */
    generateNavLink(item) {
        const isActive = this.isActivePage(item.id);
        const activeClass = isActive ? ' active' : '';
        
        return `
            <a href="${item.href}" 
               class="nav-link${activeClass}" 
               data-page="${item.id}"
               title="${item.description}">
                <i class="${item.icon}"></i>
                ${item.label}
            </a>
        `;
    }

    /**
     * Get relative path based on current location
     */
    getRelativePath(path) {
        if (this.basePath) {
            return this.basePath + path;
        }
        
        // Auto-detect based on current location
        const currentPath = window.location.pathname;
        const depth = (currentPath.match(/\//g) || []).length - 1;
        
        if (depth <= 1) {
            // Root level (index.html)
            return path.startsWith('pages/') ? path : './' + path;
        } else if (depth === 2) {
            // One level deep (pages/category/)
            return path.startsWith('pages/') ? '../' + path.substring(6) : '../../' + path;
        } else {
            // Two or more levels deep
            const upLevels = '../'.repeat(depth - 1);
            return path.startsWith('pages/') ? upLevels + path.substring(6) : upLevels + path;
        }
    }

    /**
     * Check if a page is currently active
     */
    isActivePage(pageId) {
        if (this.currentPage) {
            return this.currentPage === pageId;
        }
        
        // Auto-detect from URL
        const currentPath = window.location.pathname.toLowerCase();
        
        if (pageId === 'home') {
            return currentPath.endsWith('index.html') || currentPath.endsWith('/') || currentPath === '';
        }
        
        return currentPath.includes(pageId);
    }

    /**
     * Update active navigation link
     */
    updateActiveLink() {
        // Remove all active classes
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active class to current page
        const navigationItems = this.getNavigationItems();
        const activeItem = navigationItems.find(item => this.isActivePage(item.id));
        
        if (activeItem) {
            const activeLink = document.querySelector(`[data-page="${activeItem.id}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }
        }
    }

    /**
     * Bind navigation events
     */
    bindEvents() {
        // Handle navigation clicks
        document.addEventListener('click', (e) => {
            const navLink = e.target.closest('.nav-link');
            if (navLink) {
                this.handleNavigation(navLink, e);
            }
        });

        // Handle browser navigation (back/forward)
        window.addEventListener('popstate', () => {
            this.updateActiveLink();
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.updateConnectionStatus();
            }
        });
    }

    /**
     * Handle navigation link clicks
     */
    handleNavigation(navLink, event) {
        const pageId = navLink.dataset.page;
        const href = navLink.href;
        
        // Emit navigation event for custom handling
        const navigationEvent = new CustomEvent('navbar:navigate', {
            detail: {
                pageId,
                href,
                originalEvent: event
            }
        });
        
        document.dispatchEvent(navigationEvent);
        
        // If navigation was prevented, don't proceed
        if (navigationEvent.defaultPrevented) {
            event.preventDefault();
            return;
        }
        
        // Update active state immediately for better UX
        this.setActivePage(pageId);
    }

    /**
     * Set active page programmatically
     */
    setActivePage(pageId) {
        this.currentPage = pageId;
        this.updateActiveLink();
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(status = null, message = null) {
        const statusIndicator = document.getElementById('connectionStatus');
        if (!statusIndicator) return;
        
        if (status) {
            this.connectionStatus = status;
        }
        
        const statusIcon = statusIndicator.querySelector('i');
        const statusText = statusIndicator.querySelector('span');
        
        // Update based on connection status
        switch (this.connectionStatus) {
            case 'connected':
                statusIndicator.className = 'status-indicator connected';
                statusIcon.className = 'fas fa-circle';
                statusText.textContent = message || 'Connected';
                break;
                
            case 'disconnected':
                statusIndicator.className = 'status-indicator disconnected';
                statusIcon.className = 'fas fa-circle';
                statusText.textContent = message || 'Disconnected';
                break;
                
            case 'error':
                statusIndicator.className = 'status-indicator error';
                statusIcon.className = 'fas fa-exclamation-circle';
                statusText.textContent = message || 'Connection Error';
                break;
                
            case 'connecting':
            default:
                statusIndicator.className = 'status-indicator connecting';
                statusIcon.className = 'fas fa-circle';
                statusText.textContent = message || 'Connecting...';
                break;
        }
    }

    /**
     * Setup connection monitoring
     */
    setupConnectionMonitoring() {
        // Check connection status periodically
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnectionStatus();
        }, 5000);

        // Check immediately
        this.checkConnectionStatus();
    }

    /**
     * Check connection status
     */
    async checkConnectionStatus() {
        try {
            // Try to reach the API service
            const response = await fetch('/api/health', {
                method: 'GET',
                timeout: 3000
            });
            
            if (response.ok) {
                this.updateConnectionStatus('connected');
            } else {
                this.updateConnectionStatus('error', 'API Error');
            }
        } catch (error) {
            // Check if it's a network error or API not available
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                this.updateConnectionStatus('disconnected', 'Service Offline');
            } else {
                this.updateConnectionStatus('error', 'Network Error');
            }
        }
    }

    /**
     * Add custom navigation item
     */
    addNavigationItem(item, position = null) {
        const navigationItems = this.getNavigationItems();
        
        if (position !== null && position >= 0 && position < navigationItems.length) {
            navigationItems.splice(position, 0, item);
        } else {
            navigationItems.push(item);
        }
        
        // Re-render navigation
        this.render();
        this.bindEvents();
        this.updateActiveLink();
    }

    /**
     * Remove navigation item
     */
    removeNavigationItem(itemId) {
        const navLink = document.querySelector(`[data-page="${itemId}"]`);
        if (navLink) {
            navLink.remove();
        }
    }

    /**
     * Update navigation item
     */
    updateNavigationItem(itemId, updates) {
        const navLink = document.querySelector(`[data-page="${itemId}"]`);
        if (!navLink) return;
        
        if (updates.label) {
            const textNode = navLink.childNodes[navLink.childNodes.length - 1];
            if (textNode.nodeType === Node.TEXT_NODE) {
                textNode.textContent = updates.label;
            }
        }
        
        if (updates.icon) {
            const icon = navLink.querySelector('i');
            if (icon) {
                icon.className = updates.icon;
            }
        }
        
        if (updates.href) {
            navLink.href = updates.href;
        }
        
        if (updates.description) {
            navLink.title = updates.description;
        }
    }

    /**
     * Show/hide navigation item
     */
    toggleNavigationItem(itemId, show = true) {
        const navLink = document.querySelector(`[data-page="${itemId}"]`);
        if (navLink) {
            navLink.style.display = show ? '' : 'none';
        }
    }

    /**
     * Get current active page
     */
    getActivePage() {
        return this.currentPage;
    }

    /**
     * Destroy the navbar component
     */
    destroy() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }
        
        // Remove event listeners
        document.removeEventListener('click', this.handleNavigation);
        window.removeEventListener('popstate', this.updateActiveLink);
        
        // Remove navbar from DOM
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            navbar.remove();
        }
    }

    /**
     * Refresh the navbar
     */
    refresh() {
        this.render();
        this.bindEvents();
        this.updateActiveLink();
    }
}

// Auto-initialize navbar if not in module environment
if (typeof window !== 'undefined' && !window.navbarInitialized) {
    document.addEventListener('DOMContentLoaded', () => {
        // Auto-detect current page and initialize
        const navbar = new NavBar();
        window.navbar = navbar;
        window.navbarInitialized = true;
    });
}

// Export for use as module
export default NavBar; 