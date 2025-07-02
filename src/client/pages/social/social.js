// Social Media Page JavaScript
import { ApiService } from '../../js/services/apiService.js';
import { WebSocketService } from '../../js/services/websocketService.js';
import { ToastManager } from '../../js/utils/toastManager.js';
import { XPlatformHandler } from '../../js/social/x/index.js';
import { GitHubPlatformHandler } from '../../js/social/github/index.js';

class SocialMediaPage {
    constructor() {
        this.apiService = new ApiService();
        this.wsService = new WebSocketService();
        this.toastManager = new ToastManager();
        this.xHandler = new XPlatformHandler(this.toastManager);
        this.githubHandler = new GitHubPlatformHandler(this.toastManager);
        this.posts = [];
        this.discussions = [];
        this.currentDraft = null;
        
        this.init();
    }

    async init() {
        console.log('Social Media page initialized');
        await this.setupWebSocket();
        await this.loadConfiguration();
        await this.loadPosts();
        this.setupEventListeners();
        this.updatePlatformStatus();
    }

    async setupWebSocket() {
        try {
            await this.wsService.connect();
            this.updateConnectionStatus(true);
            
            this.wsService.on('disconnect', () => {
                this.updateConnectionStatus(false);
            });
            
            this.wsService.on('reconnect', () => {
                this.updateConnectionStatus(true);
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

    async loadConfiguration() {
        try {
            this.updatePlatformStatus();
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    }

    async loadPosts() {
        try {
            const savedPosts = localStorage.getItem('socialPosts');
            if (savedPosts) {
                this.posts = JSON.parse(savedPosts);
                this.xHandler.setPosts(this.posts);
            }
            this.renderPosts();
        } catch (error) {
            console.error('Failed to load posts:', error);
            this.renderEmptyPosts();
        }
    }

    setupEventListeners() {
        // Demo mode button
        const demoModeBtn = document.getElementById('demoModeBtn');
        if (demoModeBtn) {
            demoModeBtn.addEventListener('click', () => {
                this.xHandler.enableDemoMode();
                this.githubHandler.enableDemoMode();
                this.updatePlatformStatus();
            });
        }





        // Create post button
        const createPostBtn = document.getElementById('createPostBtn');
        if (createPostBtn) {
            createPostBtn.addEventListener('click', () => {
                this.showPostComposer();
            });
        }

        // Close composer button
        const closeComposerBtn = document.getElementById('closeComposerBtn');
        if (closeComposerBtn) {
            closeComposerBtn.addEventListener('click', () => {
                this.hidePostComposer();
            });
        }

        // Post content textarea
        const postContent = document.getElementById('postContent');
        if (postContent) {
            postContent.addEventListener('input', () => {
                this.updateCharacterCount();
            });
        }

        // Save draft button
        const saveDraftBtn = document.getElementById('saveDraftBtn');
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', () => {
                this.saveDraft();
            });
        }

        // Publish post button
        const publishPostBtn = document.getElementById('publishPostBtn');
        if (publishPostBtn) {
            publishPostBtn.addEventListener('click', () => {
                this.publishPost();
            });
        }



        // Search functionality
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.searchTweets();
            });
        }

        // Trending topics button
        const getTrendingBtn = document.getElementById('getTrendingBtn');
        if (getTrendingBtn) {
            getTrendingBtn.addEventListener('click', () => {
                this.getTrendingTopics();
            });
        }

        // GitHub functionality buttons
        const loadRepositoriesBtn = document.getElementById('loadRepositoriesBtn');
        if (loadRepositoriesBtn) {
            loadRepositoriesBtn.addEventListener('click', () => {
                this.loadGitHubRepositories();
            });
        }

        const pullFromGitHubBtn = document.getElementById('pullFromGitHubBtn');
        if (pullFromGitHubBtn) {
            pullFromGitHubBtn.addEventListener('click', () => {
                this.pullFromGitHub();
            });
        }

        const testGitHubBtn = document.getElementById('testGitHubBtn');
        if (testGitHubBtn) {
            testGitHubBtn.addEventListener('click', () => {
                this.testGitHubConnection();
            });
        }

        // Modal close handlers
        this.setupModalHandlers();
    }

    setupModalHandlers() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
            
            if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            }
        });
    }



    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
        }
    }



    showPostComposer() {
        const composer = document.getElementById('postComposer');
        if (composer) {
            composer.classList.add('active');
            
            // Focus on content textarea
            const postContent = document.getElementById('postContent');
            if (postContent) {
                setTimeout(() => postContent.focus(), 100);
            }
        }
    }

    hidePostComposer() {
        const composer = document.getElementById('postComposer');
        if (composer) {
            composer.classList.remove('active');
            this.clearComposer();
        }
    }

    clearComposer() {
        const postContent = document.getElementById('postContent');
        const postToX = document.getElementById('postToX');
        const schedulePost = document.getElementById('schedulePost');
        const scheduleTime = document.getElementById('scheduleTime');
        const addHashtags = document.getElementById('addHashtags');
        const customHashtags = document.getElementById('customHashtags');
        
        if (postContent) postContent.value = '';
        if (postToX) postToX.checked = true;
        if (schedulePost) schedulePost.checked = false;
        if (scheduleTime) scheduleTime.disabled = true;
        if (addHashtags) addHashtags.checked = false;
        if (customHashtags) customHashtags.disabled = true;
        
        this.updateCharacterCount();
    }

    updateCharacterCount() {
        const postContent = document.getElementById('postContent');
        const charCount = document.getElementById('charCount');
        
        if (postContent && charCount) {
            const count = postContent.value.length;
            charCount.textContent = count;
            
            const charCountElement = charCount.parentElement;
            charCountElement.classList.remove('warning', 'error');
            
            if (count > 260) {
                charCountElement.classList.add('error');
            } else if (count > 240) {
                charCountElement.classList.add('warning');
            }
        }
    }

    updatePlatformStatus() {
        this.xHandler.updatePlatformStatus();
        this.githubHandler.updatePlatformStatus();
    }





    saveDraft() {
        try {
        const content = document.getElementById('postContent').value.trim();
            const options = {
            scheduled: document.getElementById('schedulePost').checked,
            scheduleTime: document.getElementById('scheduleTime').value,
                addHashtags: document.getElementById('addHashtags').checked,
                hashtags: document.getElementById('customHashtags').value
        };

            const draft = this.xHandler.saveDraft(content, options);
            this.posts = this.xHandler.getPosts();
        this.savePosts();
        this.renderPosts();
        this.updatePlatformStatus();
        
        this.toastManager.show('Draft saved successfully!', 'success');
        this.hidePostComposer();
        } catch (error) {
            this.toastManager.show(error.message, 'warning');
        }
    }

    async publishPost() {
        try {
            const content = document.getElementById('postContent').value.trim();
            if (!content) {
                this.toastManager.show('Please enter some content to publish', 'warning');
                return;
            }

            const postToX = document.getElementById('postToX').checked;
            const pushToGitHub = document.getElementById('pushToGitHub') ? document.getElementById('pushToGitHub').checked : false;
            
            if (!postToX && !pushToGitHub) {
                this.toastManager.show('Please select at least one platform to post to', 'warning');
                return;
            }

            // Show loading
            this.showLoading();

            const postData = {
                content: content,
                addHashtags: document.getElementById('addHashtags').checked,
                hashtags: document.getElementById('customHashtags').value,
                scheduled: document.getElementById('schedulePost').checked,
                scheduleTime: document.getElementById('scheduleTime').value
            };

            let results = [];
            
            // Publish to X if selected
            if (postToX) {
                try {
                    const xResult = await this.xHandler.publishPost(postData);
                    results.push({ platform: 'X', success: true, message: xResult.message });
                    this.posts = this.xHandler.getPosts();
                } catch (error) {
                    results.push({ platform: 'X', success: false, message: error.message });
                }
            }
            
            // Push to GitHub if selected
            if (pushToGitHub) {
                try {
                    const githubResult = await this.pushToGitHub(postData);
                    results.push({ platform: 'GitHub', success: true, message: githubResult.message });
                } catch (error) {
                    results.push({ platform: 'GitHub', success: false, message: error.message });
                }
            }
            
            this.savePosts();
            this.renderPosts();
            this.updatePlatformStatus();
            
            this.hideLoading();
            
            // Show results summary
            const successCount = results.filter(r => r.success).length;
            const totalCount = results.length;
            
            if (successCount === totalCount) {
                this.toastManager.show(`Successfully published to ${successCount} platform(s)`, 'success');
            } else if (successCount > 0) {
                this.toastManager.show(`Published to ${successCount}/${totalCount} platforms. Check details for errors.`, 'warning');
            } else {
                this.toastManager.show('Failed to publish to any platform', 'error');
            }
            
            this.hidePostComposer();
            
        } catch (error) {
            this.hideLoading();
            console.error('Failed to publish post:', error);
            this.toastManager.show('Failed to publish post: ' + error.message, 'error');
        }
    }

    savePosts() {
        localStorage.setItem('socialPosts', JSON.stringify(this.posts));
    }

    async searchTweets() {
        try {
            const query = document.getElementById('searchQuery').value.trim();
            if (!query) {
                this.toastManager.show('Please enter a search query', 'warning');
                return;
            }

            this.showLoading();

            const options = {
                maxResults: document.getElementById('searchLimit').value,
                startTime: document.getElementById('searchStartDate').value,
                endTime: document.getElementById('searchEndDate').value
            };

            const result = await this.xHandler.searchTweets(query, options);
            const container = document.getElementById('searchResults');
            this.xHandler.displaySearchResults(result, container);
            this.hideLoading();
            
        } catch (error) {
            this.hideLoading();
            console.error('Failed to search tweets:', error);
            this.toastManager.show('Failed to search tweets: ' + error.message, 'error');
        }
    }

    async getTrendingTopics() {
        try {
            this.showLoading();
            const result = await this.xHandler.getTrendingTopics();
            const container = document.getElementById('searchResults');
            this.xHandler.displayTrendingTopics(result, container);
            this.hideLoading();
            
        } catch (error) {
            this.hideLoading();
            console.error('Failed to get trending topics:', error);
            this.toastManager.show('Failed to get trending topics: ' + error.message, 'error');
        }
    }





    inspireTweetFromSearch(tweetId, tweetText) {
        // Fill the composer with inspired content
        const inspirationText = `Inspired by this post:\n\n"${tweetText.substring(0, 100)}${tweetText.length > 100 ? '...' : ''}"\n\nMy thoughts: `;
        
        document.getElementById('postContent').value = inspirationText;
        this.updateCharacterCount();
        this.showPostComposer();
        
        // Focus at the end of the text
        const textarea = document.getElementById('postContent');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        
        this.toastManager.show('Post composer filled with inspiration!', 'success');
    }

    showLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('show');
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }

    renderPosts() {
        const container = document.getElementById('postsList');
        if (!container) return;

        if (this.posts.length === 0) {
            this.renderEmptyPosts();
            return;
        }

        container.innerHTML = this.posts.map(post => `
            <div class="post-item" data-id="${post.id}">
                <div class="post-platform ${post.platform}">
                    <i class="fab fa-x-twitter"></i>
                </div>
                <div class="post-content">
                    <div class="post-header">
                        <span class="post-status ${post.status}">${post.status}</span>
                        <span class="post-time">${this.formatDate(post.createdAt)}</span>
                    </div>
                    <div class="post-text">${post.content}</div>
                </div>
            </div>
        `).join('');
    }

    renderEmptyPosts() {
        const container = document.getElementById('postsList');
        if (!container) return;

        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-share-alt"></i>
                <h3>No posts yet</h3>
                <p>Create your first social media post to get started</p>
            </div>
        `;
    }

    formatDate(dateString) {
        return this.xHandler.formatDate(dateString);
    }

    // GitHub Integration Methods
    async loadGitHubRepositories() {
        try {
            this.showLoading();
            await this.githubHandler.loadRepositories();
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            console.error('Failed to load GitHub repositories:', error);
        }
    }

    async refreshRepositories() {
        await this.loadGitHubRepositories();
    }

    selectRepository(fullName) {
        this.githubHandler.selectRepository(fullName);
    }

    async pushToGitHub(postData) {
        try {
            this.showLoading();
            const result = await this.githubHandler.pushPostToGitHub(postData);
            this.hideLoading();
            return result;
        } catch (error) {
            this.hideLoading();
            throw error;
        }
    }

    async pullFromGitHub() {
        try {
            const config = this.githubHandler.getConfigurationSafe();
            if (!config || !config.defaultRepo) {
                this.toastManager.show('Please configure a default repository first', 'warning');
                return;
            }

            this.showLoading();
            const [owner, repo] = config.defaultRepo.includes('/') 
                ? config.defaultRepo.split('/')
                : [config.username, config.defaultRepo];

            await this.githubHandler.pullRecentPosts(owner, repo);
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            console.error('Failed to pull from GitHub:', error);
        }
    }

    async refreshGitHubPosts() {
        await this.pullFromGitHub();
    }

    importFromGitHub(filename) {
        this.githubHandler.importFromGitHub(filename);
    }

    async testGitHubConnection() {
        try {
            this.showLoading();
            await this.githubHandler.testConnection();
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            console.error('GitHub connection test failed:', error);
        }
    }
}

// Initialize the social media page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.socialPageInstance = new SocialMediaPage();
}); 