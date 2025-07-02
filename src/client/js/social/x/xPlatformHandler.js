import { XApiService } from './xApiService.js';

export class XPlatformHandler {
    constructor(toastManager) {
        this.apiService = new XApiService();
        this.toastManager = toastManager;
        this.posts = [];
        this.currentDraft = null;
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
        const xStatus = document.getElementById('xStatus');
        const platformNote = document.querySelector('.platform-note');
        
        if (this.apiService.isConfigured()) {
            const config = this.apiService.getConfigurationSafe();
            if (config && config.authType === 'Bearer Token' && 
                this.apiService.config && this.apiService.config.bearerToken === 'test') {
                xStatus.textContent = 'Demo Mode';
                xStatus.className = 'platform-status connecting';
                if (platformNote) {
                    platformNote.textContent = 'Using mock data for testing';
                }
            } else {
                xStatus.textContent = 'Connected';
                xStatus.className = 'platform-status connected';
                if (platformNote) {
                    platformNote.textContent = 'X credentials configured in Settings';
                }
            }
        } else {
            xStatus.textContent = 'Credentials Required';
            xStatus.className = 'platform-status disconnected';
            if (platformNote) {
                platformNote.textContent = 'Configure X credentials in Settings page to enable functionality';
            }
        }
    }



    // Post Management
    async publishPost(postData) {
        try {
            if (!this.apiService.isConfigured()) {
                throw new Error('Please configure X credentials first');
            }

            let result;
            if (postData.scheduled) {
                result = await this.apiService.scheduleTweet(postData);
            } else {
                result = await this.apiService.postTweet(postData);
            }

            // Create local post record
            const post = {
                id: result.data.id,
                content: result.data.text || postData.content,
                platform: 'x',
                status: postData.scheduled ? 'scheduled' : 'published',
                createdAt: result.data.created_at || new Date().toISOString(),
                scheduled: postData.scheduled,
                scheduleTime: postData.scheduleTime,
                hashtags: postData.addHashtags ? postData.hashtags : null,
                likes: result.data.public_metrics?.like_count || 0,
                retweets: result.data.public_metrics?.retweet_count || 0,
                replies: result.data.public_metrics?.reply_count || 0
            };

            this.posts.unshift(post);
            return { success: true, post, message: result.message };
            
        } catch (error) {
            console.error('Failed to publish post:', error);
            throw error;
        }
    }

    saveDraft(content, options = {}) {
        if (!content || !content.trim()) {
            throw new Error('Please enter some content to save as draft');
        }

        const draft = {
            id: Date.now().toString(),
            content: content,
            platform: 'x',
            status: 'draft',
            createdAt: new Date().toISOString(),
            scheduled: options.scheduled || false,
            scheduleTime: options.scheduleTime || null,
            hashtags: options.addHashtags ? options.hashtags : null
        };

        this.posts.unshift(draft);
        return draft;
    }

    // Search and Discovery
    async searchTweets(query, options = {}) {
        try {
            if (!this.apiService.isConfigured()) {
                throw new Error('Please configure X API credentials first');
            }

            const searchOptions = {
                maxResults: parseInt(options.maxResults) || 10,
                startTime: options.startTime ? 
                    new Date(options.startTime).toISOString() : undefined,
                endTime: options.endTime ? 
                    new Date(options.endTime).toISOString() : undefined
            };

            const result = await this.apiService.searchTweets(query, searchOptions);
            return result;
            
        } catch (error) {
            console.error('Failed to search tweets:', error);
            throw error;
        }
    }

    async getTrendingTopics() {
        try {
            if (!this.apiService.isConfigured()) {
                throw new Error('Please configure X API credentials first');
            }

            const result = await this.apiService.getTrendingTopics();
            return result;
            
        } catch (error) {
            console.error('Failed to get trending topics:', error);
            throw error;
        }
    }

    // Content Formatting
    formatTweetContent(text) {
        return this.apiService.formatTweetContent(text);
    }

    // Utility Methods
    getPosts() {
        return this.posts;
    }

    setPosts(posts) {
        this.posts = posts;
    }

    enableDemoMode() {
        this.apiService.setupDemoCredentials();
        this.toastManager.show('Demo mode enabled! You can now test all features with mock data.', 'success');
    }

    // Search Results Display
    displaySearchResults(result, container) {
        if (!container) return;

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No results found</h3>
                    <p>Try adjusting your search query or date range</p>
                </div>
            `;
            return;
        }

        // Create a map of users for easy lookup
        const users = {};
        if (result.includes && result.includes.users) {
            result.includes.users.forEach(user => {
                users[user.id] = user;
            });
        }

        container.innerHTML = `
            <div class="search-results-header">
                <h3>Search Results (${result.data.length} tweets)</h3>
                <button class="btn btn-sm btn-secondary" onclick="document.getElementById('searchResults').innerHTML = ''">
                    <i class="fas fa-times"></i>
                    Clear
                </button>
            </div>
            <div class="tweets-list">
                ${result.data.map(tweet => {
                    const author = users[tweet.author_id] || { name: 'Unknown', username: 'unknown' };
                    return `
                        <div class="tweet-item">
                            <div class="tweet-header">
                                <div class="tweet-author">
                                    <strong>${author.name}</strong>
                                    <span class="username">@${author.username}</span>
                                    ${author.verified ? '<i class="fas fa-check-circle verified"></i>' : ''}
                                </div>
                                <div class="tweet-time">${this.formatDate(tweet.created_at)}</div>
                            </div>
                            <div class="tweet-content">
                                ${this.formatTweetContent(tweet.text)}
                            </div>
                            <div class="tweet-metrics">
                                <span><i class="fas fa-heart"></i> ${tweet.public_metrics?.like_count || 0}</span>
                                <span><i class="fas fa-retweet"></i> ${tweet.public_metrics?.retweet_count || 0}</span>
                                <span><i class="fas fa-reply"></i> ${tweet.public_metrics?.reply_count || 0}</span>
                                <span><i class="fas fa-quote-left"></i> ${tweet.public_metrics?.quote_count || 0}</span>
                            </div>
                            <div class="tweet-actions">
                                <button class="btn btn-sm btn-primary" onclick="window.socialPageInstance.inspireTweetFromSearch('${tweet.id}', \`${tweet.text.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">
                                    <i class="fas fa-lightbulb"></i>
                                    Inspire Post
                                </button>
                                <a href="https://twitter.com/${author.username}/status/${tweet.id}" target="_blank" class="btn btn-sm btn-secondary">
                                    <i class="fas fa-external-link-alt"></i>
                                    View on X
                                </a>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    displayTrendingTopics(result, container) {
        if (!container) return;

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-fire"></i>
                    <h3>No trending topics found</h3>
                    <p>Unable to retrieve trending topics at this time</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="search-results-header">
                <h3>Trending Topics</h3>
                <button class="btn btn-sm btn-secondary" onclick="document.getElementById('searchResults').innerHTML = ''">
                    <i class="fas fa-times"></i>
                    Clear
                </button>
            </div>
            <div class="trending-list">
                ${result.data.slice(0, 10).map((trend, index) => `
                    <div class="trending-item">
                        <div class="trending-rank">${index + 1}</div>
                        <div class="trending-content">
                            <div class="trending-name">${trend.name}</div>
                            ${trend.tweet_volume ? `<div class="trending-volume">${trend.tweet_volume.toLocaleString()} tweets</div>` : ''}
                        </div>
                        <div class="trending-actions">
                            <button class="btn btn-sm btn-primary" onclick="document.getElementById('searchQuery').value = '${trend.name}'; window.socialPageInstance.searchTweets()">
                                <i class="fas fa-search"></i>
                                Search
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
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