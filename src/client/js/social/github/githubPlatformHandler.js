import { GitHubApiService } from './githubApiService.js';

export class GitHubPlatformHandler {
    constructor(toastManager) {
        this.apiService = new GitHubApiService();
        this.toastManager = toastManager;
        this.repositories = [];
        this.recentPosts = [];
    }

    // Configuration Management
    isConfigured() {
        return this.apiService.isConfigured();
    }

    getConfigurationSafe() {
        return this.apiService.getConfigurationSafe();
    }

    setupDemoCredentials() {
        this.apiService.setupDemoCredentials();
    }

    // Platform Status Management
    updatePlatformStatus() {
        const githubStatus = document.getElementById('githubStatus');
        const platformNote = document.querySelector('.github-platform-note');
        
        if (this.apiService.isConfigured()) {
            const config = this.apiService.getConfigurationSafe();
            if (config && this.apiService.config && this.apiService.config.token === 'demo_token_for_testing') {
                githubStatus.textContent = 'Demo Mode';
                githubStatus.className = 'platform-status connecting';
                if (platformNote) {
                    platformNote.textContent = 'Using mock data for testing';
                }
            } else {
                githubStatus.textContent = 'Connected';
                githubStatus.className = 'platform-status connected';
                if (platformNote) {
                    platformNote.textContent = 'GitHub token configured in Settings';
                }
            }
        } else {
            githubStatus.textContent = 'Token Required';
            githubStatus.className = 'platform-status disconnected';
            if (platformNote) {
                platformNote.textContent = 'Configure GitHub token in Settings page to enable functionality';
            }
        }
    }

    // Configuration Modal Management
    showConfigModal() {
        const modal = document.getElementById('githubConfigModal');
        if (modal) {
            // Load existing configuration
            const config = this.apiService.getConfigurationSafe();
            if (config) {
                document.getElementById('githubUsername').value = config.username || '';
                document.getElementById('githubDefaultRepo').value = config.defaultRepo || '';
                document.getElementById('githubAutoCommit').checked = config.autoCommit || false;
                document.getElementById('githubCommitMessage').value = config.commitMessage || 'Update from social media integration';
                document.getElementById('githubBranch').value = config.branch || 'main';
            } else {
                // Clear form for new configuration
                document.getElementById('githubUsername').value = '';
                document.getElementById('githubDefaultRepo').value = '';
                document.getElementById('githubAutoCommit').checked = false;
                document.getElementById('githubCommitMessage').value = 'Update from social media integration';
                document.getElementById('githubBranch').value = 'main';
            }
            
            modal.classList.add('show');
            modal.style.display = 'flex';
        }
    }



    // Repository Management
    async loadRepositories() {
        try {
            if (!this.apiService.isConfigured()) {
                throw new Error('GitHub API not configured');
            }

            const repos = await this.apiService.getRepositories();
            this.repositories = repos;
            this.displayRepositories(repos);
            return repos;
        } catch (error) {
            console.error('Failed to load repositories:', error);
            this.toastManager.show('Failed to load repositories: ' + error.message, 'error');
            throw error;
        }
    }

    displayRepositories(repositories) {
        const container = document.getElementById('githubRepositories');
        if (!container) return;

        if (!repositories || repositories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fab fa-github"></i>
                    <h3>No repositories found</h3>
                    <p>No repositories available or GitHub not configured</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="repositories-header">
                <h3>Your Repositories (${repositories.length})</h3>
                <button class="btn btn-sm btn-secondary" onclick="window.socialPageInstance.refreshRepositories()">
                    <i class="fas fa-sync-alt"></i>
                    Refresh
                </button>
            </div>
            <div class="repositories-list">
                ${repositories.slice(0, 10).map(repo => `
                    <div class="repository-item" data-repo="${repo.full_name}">
                        <div class="repo-info">
                            <div class="repo-name">
                                <i class="fas fa-${repo.private ? 'lock' : 'book'}"></i>
                                <strong>${repo.name}</strong>
                                ${repo.private ? '<span class="private-badge">Private</span>' : ''}
                            </div>
                            <div class="repo-description">${repo.description || 'No description'}</div>
                            <div class="repo-meta">
                                <span><i class="fas fa-star"></i> ${repo.stargazers_count}</span>
                                <span><i class="fas fa-code-branch"></i> ${repo.forks_count}</span>
                                <span><i class="fas fa-clock"></i> ${this.formatDate(repo.updated_at)}</span>
                            </div>
                        </div>
                        <div class="repo-actions">
                            <button class="btn btn-sm btn-primary" onclick="window.socialPageInstance.selectRepository('${repo.full_name}')">
                                <i class="fas fa-check"></i>
                                Select
                            </button>
                            <a href="${repo.html_url}" target="_blank" class="btn btn-sm btn-secondary">
                                <i class="fas fa-external-link-alt"></i>
                                View
                            </a>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Post Management
    async pushPostToGitHub(postData) {
        try {
            if (!this.apiService.isConfigured()) {
                throw new Error('GitHub API not configured');
            }

            const result = await this.apiService.pushSocialPost(postData);
            
            if (result.success) {
                this.toastManager.show(result.message, 'success');
                return result;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Failed to push post to GitHub:', error);
            this.toastManager.show('Failed to push to GitHub: ' + error.message, 'error');
            throw error;
        }
    }

    async pullRecentPosts(owner, repo, limit = 10) {
        try {
            if (!this.apiService.isConfigured()) {
                throw new Error('GitHub API not configured');
            }

            const result = await this.apiService.pullRecentPosts(owner, repo, limit);
            
            if (result.success) {
                this.recentPosts = result.data;
                this.displayRecentPosts(result.data);
                this.toastManager.show(result.message, 'success');
                return result.data;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Failed to pull posts from GitHub:', error);
            this.toastManager.show('Failed to pull from GitHub: ' + error.message, 'error');
            throw error;
        }
    }

    displayRecentPosts(posts) {
        const container = document.getElementById('githubRecentPosts');
        if (!container) return;

        if (!posts || posts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <h3>No posts found</h3>
                    <p>No social media posts found in the repository</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="posts-header">
                <h3>Recent Posts from GitHub (${posts.length})</h3>
                <button class="btn btn-sm btn-secondary" onclick="window.socialPageInstance.refreshGitHubPosts()">
                    <i class="fas fa-sync-alt"></i>
                    Refresh
                </button>
            </div>
            <div class="github-posts-list">
                ${posts.map(post => {
                    const postData = this.apiService.parseMarkdownContent(post.content);
                    return `
                        <div class="github-post-item">
                            <div class="post-header">
                                <div class="post-filename">
                                    <i class="fab fa-markdown"></i>
                                    ${post.filename}
                                </div>
                                <div class="post-date">${this.formatDate(post.lastModified)}</div>
                            </div>
                            <div class="post-content-preview">
                                ${postData.content ? postData.content.substring(0, 150) + (postData.content.length > 150 ? '...' : '') : 'No content'}
                            </div>
                            <div class="post-meta">
                                <span class="platform-badge">${postData.platform || 'Unknown'}</span>
                                <span class="status-badge ${postData.status?.toLowerCase() || 'unknown'}">${postData.status || 'Unknown'}</span>
                            </div>
                            <div class="post-actions">
                                <button class="btn btn-sm btn-primary" onclick="window.socialPageInstance.importFromGitHub('${post.filename}')">
                                    <i class="fas fa-download"></i>
                                    Import
                                </button>
                                <a href="${post.url}" target="_blank" class="btn btn-sm btn-secondary">
                                    <i class="fas fa-external-link-alt"></i>
                                    View on GitHub
                                </a>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // User Information
    async getUserInfo() {
        try {
            if (!this.apiService.isConfigured()) {
                throw new Error('GitHub API not configured');
            }

            const user = await this.apiService.getUserInfo();
            this.displayUserInfo(user);
            return user;
        } catch (error) {
            console.error('Failed to get user info:', error);
            throw error;
        }
    }

    displayUserInfo(user) {
        const container = document.getElementById('githubUserInfo');
        if (!container) return;

        container.innerHTML = `
            <div class="user-info">
                <div class="user-avatar">
                    <i class="fab fa-github"></i>
                </div>
                <div class="user-details">
                    <div class="user-name">${user.name || user.login}</div>
                    <div class="user-login">@${user.login}</div>
                    <div class="user-stats">
                        <span><i class="fas fa-book"></i> ${user.public_repos} repos</span>
                        <span><i class="fas fa-users"></i> ${user.followers} followers</span>
                        <span><i class="fas fa-user-friends"></i> ${user.following} following</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Utility Methods
    enableDemoMode() {
        this.apiService.setupDemoCredentials();
        this.toastManager.show('GitHub demo mode enabled! You can now test all features with mock data.', 'success');
    }

    async testConnection() {
        try {
            const result = await this.apiService.testConnection();
            if (result.success) {
                this.toastManager.show(result.message, 'success');
                return result;
            } else {
                this.toastManager.show(result.message, 'error');
                return result;
            }
        } catch (error) {
            const message = 'Connection test failed: ' + error.message;
            this.toastManager.show(message, 'error');
            return { success: false, message };
        }
    }

    selectRepository(fullName) {
        const repoInput = document.getElementById('githubDefaultRepo');
        if (repoInput) {
            repoInput.value = fullName;
            this.toastManager.show(`Selected repository: ${fullName}`, 'success');
        }
    }

    importFromGitHub(filename) {
        const post = this.recentPosts.find(p => p.filename === filename);
        if (!post) {
            this.toastManager.show('Post not found', 'error');
            return;
        }

        const postData = this.apiService.parseMarkdownContent(post.content);
        
        // Fill the composer with imported content
        const postContent = document.getElementById('postContent');
        if (postContent) {
            postContent.value = postData.content || '';
            
            // Trigger character count update
            const event = new Event('input', { bubbles: true });
            postContent.dispatchEvent(event);
        }

        // Show the composer
        const composer = document.getElementById('postComposer');
        if (composer) {
            composer.classList.add('active');
            postContent.focus();
        }

        this.toastManager.show(`Imported post: ${filename}`, 'success');
    }

    // Utility method for date formatting
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }
} 