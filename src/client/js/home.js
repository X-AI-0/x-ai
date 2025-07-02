// Home Page JavaScript
import { ApiService } from './services/apiService.js';
import { WebSocketService } from './services/websocketService.js';
import { ToastManager } from './utils/toastManager.js';

class HomePage {
    constructor() {
        this.apiService = new ApiService();
        this.wsService = new WebSocketService();
        this.toastManager = new ToastManager();
        this.ollamaConnected = false;
        this.isStartingOllama = false;
        
        this.init();
    }

    async init() {
        // Wait for DOM to be fully loaded
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                window.addEventListener('load', resolve, { once: true });
            });
        }
        
        await this.setupWebSocket();
        await this.loadStats();
        await this.loadRecentActivity();
        this.setupEventListeners();
        
        // Check Ollama status after everything else is initialized
        setTimeout(() => this.checkOllamaStatus(), 1000);
    }

    async setupWebSocket() {
        try {
            await this.wsService.connect();
            this.updateConnectionStatus(true);
            
            this.wsService.on('discussionUpdate', (data) => {
                this.handleDiscussionUpdate(data);
            });
            
            this.wsService.on('disconnect', () => {
                this.updateConnectionStatus(false);
            });
            
            this.wsService.on('reconnect', () => {
                this.updateConnectionStatus(true);
                this.loadStats();
            });
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.updateConnectionStatus(false);
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;
        
        const icon = statusElement.querySelector('i');
        const text = statusElement.querySelector('span');
        
        if (connected) {
            statusElement.className = 'status-indicator connected';
            icon.className = 'fas fa-circle';
            text.textContent = 'Connected';
        } else {
            statusElement.className = 'status-indicator disconnected';
            icon.className = 'fas fa-circle';
            text.textContent = 'Disconnected';
        }
    }

    async loadStats() {
        try {
            // Load discussion stats
            const discussionsResponse = await this.apiService.getDiscussions();
            const modelsResponse = await this.apiService.getModels();
            
            // Extract data from API response structure
            const discussions = discussionsResponse.data || discussionsResponse || [];
            const models = Array.isArray(modelsResponse) ? modelsResponse : (modelsResponse.data || []);
            
            // Ensure discussions is an array
            const discussionsArray = Array.isArray(discussions) ? discussions : [];
            
            // Calculate stats
            const totalDiscussions = discussionsArray.length;
            const runningDiscussions = discussionsArray.filter(d => d.status === 'running').length;
            const totalMessages = discussionsArray.reduce((sum, d) => sum + (d.messageCount || d.messages?.length || 0), 0);
            const totalModels = models.length;
            
            // Update UI
            this.updateStat('totalDiscussions', totalDiscussions);
            this.updateStat('totalModels', totalModels);
            this.updateStat('runningDiscussions', runningDiscussions);
            this.updateStat('totalMessages', totalMessages);
            
        } catch (error) {
            console.error('Failed to load stats:', error);
            // Set default values on error
            this.updateStat('totalDiscussions', 0);
            this.updateStat('totalModels', 0);
            this.updateStat('runningDiscussions', 0);
            this.updateStat('totalMessages', 0);
        }
    }

    updateStat(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            // Animate the number change
            this.animateNumber(element, parseInt(element.textContent) || 0, value);
        }
    }

    animateNumber(element, start, end) {
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = Math.floor(start + (end - start) * progress);
            element.textContent = current.toLocaleString();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    async loadRecentActivity() {
        try {
            const discussionsResponse = await this.apiService.getDiscussions();
            
            // Extract data from API response structure
            const discussions = discussionsResponse.data || discussionsResponse || [];
            
            // Ensure discussions is an array
            const discussionsArray = Array.isArray(discussions) ? discussions : [];
            
            const recentDiscussions = discussionsArray
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5);
            
            this.renderRecentActivity(recentDiscussions);
        } catch (error) {
            console.error('Failed to load recent activity:', error);
            this.renderEmptyActivity();
        }
    }

    renderRecentActivity(discussions) {
        const container = document.getElementById('recentActivity');
        if (!container) return;
        
        if (discussions.length === 0) {
            this.renderEmptyActivity();
            return;
        }
        
        container.innerHTML = discussions.map(discussion => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas fa-${this.getStatusIcon(discussion.status)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${discussion.topic}</div>
                    <div class="activity-description">
                        ${discussion.models?.length || 0} models • 
                        ${discussion.messageCount || discussion.messages?.length || 0} messages • 
                        Status: ${discussion.status}
                    </div>
                </div>
                <div class="activity-time">
                    ${this.formatTimeAgo(discussion.createdAt)}
                </div>
            </div>
        `).join('');
    }

    renderEmptyActivity() {
        const container = document.getElementById('recentActivity');
        if (!container) return;
        
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary);">
                <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                <p>No recent activity</p>
                <p style="font-size: 0.9rem;">Start your first discussion to see activity here</p>
            </div>
        `;
    }

    getStatusIcon(status) {
        const icons = {
            'running': 'play',
            'completed': 'check',
            'stopped': 'stop',
            'error': 'exclamation-triangle'
        };
        return icons[status] || 'circle';
    }

    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }

    handleDiscussionUpdate(data) {
        // Refresh stats when discussions are updated
        this.loadStats();
        this.loadRecentActivity();
        
        // Show notification for important updates
        if (data.type === 'discussion_completed') {
            this.toastManager.show('Discussion completed!', 'success');
        } else if (data.type === 'discussion_started') {
            this.toastManager.show('New discussion started', 'info');
        }
    }

    async checkOllamaStatus() {
        try {
            // First check if Ollama is installed
            const installationStatus = await this.apiService.checkOllamaInstallation();
            const alert = document.getElementById('ollamaStatusAlert');
            
            if (!installationStatus.success || !installationStatus.data.installed) {
                // Ollama is not installed
                console.log('❌ Ollama is not installed');
                
                if (alert) {
                    alert.style.display = 'block';
                    const alertTitle = alert.querySelector('.alert-message h4');
                    const alertMessage = alert.querySelector('.alert-message p');
                    if (alertTitle) {
                        alertTitle.textContent = 'Ollama Not Installed';
                    }
                    if (alertMessage) {
                        alertMessage.innerHTML = 'Ollama is not installed on this system. <a href="pages/models/models.html" style="color: var(--primary-color); text-decoration: underline;">Go to Models page</a> to install it.';
                    }
                }
                
                // Update GPU status card to not installed
                this.updateGPUStatus('inactive', 'NOT INSTALLED', 'Install required');
                this.ollamaConnected = false;
                return;
            }
            
            // Ollama is installed, now check if it's running
            const status = await this.apiService.checkOllamaHealth();
            
            if (status && status.connected) {
                // Ollama is running, hide the alert
                if (alert) {
                    alert.style.display = 'none';
                }
                console.log('✅ Ollama service is running with GPU acceleration');
                
                // Update GPU status card
                this.updateGPUStatus('active', 'ACTIVE', 'NVIDIA RTX 3060 Ti');
                
                // Show success notification if this is first time connecting
                if (!this.ollamaConnected) {
                    this.showToast('🎯 Ollama service connected with NVIDIA GPU acceleration!', 'success');
                    this.ollamaConnected = true;
                }
            } else {
                // Ollama is installed but not running, attempt auto-start
                console.log('❌ Ollama service is not available - attempting auto-start...');
                
                // Update alert message for auto-starting
                if (alert) {
                    alert.style.display = 'block';
                    const alertTitle = alert.querySelector('.alert-message h4');
                    const alertMessage = alert.querySelector('.alert-message p');
                    if (alertTitle) {
                        alertTitle.textContent = 'Starting Ollama Service';
                    }
                    if (alertMessage) {
                        alertMessage.textContent = 'Starting Ollama service automatically with NVIDIA GPU acceleration. Please wait...';
                    }
                }
                
                // Update GPU status card to starting
                this.updateGPUStatus('starting', 'STARTING', 'Auto-starting...');
                
                // Attempt to auto-start Ollama (like models page does)
                if (!this.isStartingOllama) {
                    await this.autoStartOllama();
                }
                
                this.ollamaConnected = false;
            }
        } catch (error) {
            // Error occurred, show the alert
            console.log('❌ Failed to check Ollama status:', error);
            const alert = document.getElementById('ollamaStatusAlert');
            if (alert) {
                alert.style.display = 'block';
                const alertTitle = alert.querySelector('.alert-message h4');
                const alertMessage = alert.querySelector('.alert-message p');
                if (alertTitle) {
                    alertTitle.textContent = 'Connection Error';
                }
                if (alertMessage) {
                    alertMessage.textContent = 'Failed to check Ollama status. Please check your connection.';
                }
            }
            
            // Update GPU status card to inactive
            this.updateGPUStatus('inactive', 'OFFLINE', 'Service unavailable');
            this.ollamaConnected = false;
        }
    }

    async autoStartOllama() {
        if (this.isStartingOllama) {
            console.log('[HOME] 🔄 Ollama startup already in progress...');
            return;
        }

        this.isStartingOllama = true;
        
        try {
            // First verify Ollama is installed before attempting to start
            const installationStatus = await this.apiService.checkOllamaInstallation();
            
            if (!installationStatus.success || !installationStatus.data.installed) {
                console.log('[HOME] ❌ Cannot start Ollama - not installed');
                this.showToast('Ollama is not installed. Please install it first.', 'warning');
                this.updateGPUStatus('inactive', 'NOT INSTALLED', 'Install required');
                return;
            }
            
            console.log('[HOME] 🚀 Auto-starting Ollama service with GPU acceleration...');
            this.showToast('Starting Ollama service with NVIDIA GPU...', 'info');
            
            const result = await this.apiService.startOllama();
            
            if (result.success) {
                console.log('[HOME] ✅ Ollama service started successfully');
                this.showToast('🔥 Ollama service started with GPU acceleration!', 'success');
                
                // Wait for service to fully start, then check status
                setTimeout(async () => {
                    await this.checkOllamaStatus();
                    await this.loadStats();
                }, 3000);
            } else {
                console.log('[HOME] ❌ Failed to start Ollama service:', result.message);
                this.showToast(`Failed to start Ollama: ${result.message || 'Unknown error'}`, 'error');
                this.updateGPUStatus('inactive', 'FAILED', 'Startup failed');
            }
        } catch (error) {
            console.error('[HOME] ❌ Error auto-starting Ollama:', error);
            
            // Check if error is due to Ollama not being installed
            if (error.message && error.message.includes('not installed')) {
                this.showToast('Ollama is not installed. Please go to Models page to install it.', 'warning');
                this.updateGPUStatus('inactive', 'NOT INSTALLED', 'Install required');
            } else {
                this.showToast(`Error starting Ollama: ${error.message}`, 'error');
                this.updateGPUStatus('inactive', 'ERROR', 'Startup error');
            }
        } finally {
            // Reset flag after a delay to prevent rapid retries
            setTimeout(() => {
                this.isStartingOllama = false;
            }, 5000);
        }
    }

    showToast(message, type = 'info') {
        try {
            if (this.toastManager) {
                this.toastManager.show(message, type);
            } else {
                console.log(`[${type.toUpperCase()}] ${message}`);
            }
        } catch (error) {
            console.error('Toast error:', error);
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    updateGPUStatus(status, statusText, labelText) {
        const gpuStatus = document.getElementById('gpuStatus');
        const gpuLabel = document.getElementById('gpuLabel');
        const gpuIndicator = document.getElementById('gpuIndicator');
        
        if (gpuStatus) gpuStatus.textContent = statusText;
        if (gpuLabel) gpuLabel.textContent = labelText;
        
        if (gpuIndicator) {
            // Remove all status classes
            gpuIndicator.classList.remove('active', 'inactive', 'starting');
            // Add current status class
            gpuIndicator.classList.add(status);
        }
    }

    setupEventListeners() {
        // Refresh stats periodically
        setInterval(() => {
            this.loadStats();
            this.loadRecentActivity();
        }, 30000); // Every 30 seconds
        
        // Check Ollama status periodically (but not during startup)
        setInterval(() => {
            if (!this.isStartingOllama) {
                this.checkOllamaStatus();
            }
        }, 20000); // Check every 20 seconds
        
        // Handle navigation clicks
        document.addEventListener('click', (e) => {
            if (e.target.closest('.nav-link')) {
                e.preventDefault();
                const link = e.target.closest('.nav-link');
                const href = link.getAttribute('href');
                if (href && href !== '#' && href !== 'index.html') {
                    window.location.href = href;
                }
            }
        });
    }
}

// Global functions for the alert buttons
window.startOllama = async function() {
    const homePage = window.homePageInstance;
    if (homePage) {
        await homePage.autoStartOllama();
    }
};

window.checkOllamaStatus = async function() {
    const homePage = window.homePageInstance;
    if (homePage) {
        await homePage.checkOllamaStatus();
    }
};

// Initialize the home page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.homePageInstance = new HomePage();
}); 