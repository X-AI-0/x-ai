// X (Twitter) API Service - Real Implementation
export class XApiService {
    constructor() {
        this.config = null;
        this.isConnected = false;
        this.rateLimitInfo = {
            remaining: null,
            resetTime: null,
            limit: null
        };
        
        // X API v2 endpoints
        this.apiBaseUrl = 'https://api.twitter.com/2';
        this.apiV1BaseUrl = 'https://api.twitter.com/1.1';
        
        this.loadConfiguration();
        
        // If no configuration found, set up demo credentials
        if (!this.isConfigured()) {
            this.setupDemoCredentials();
        }
    }

    /**
     * Load X API configuration from main settings
     */
    loadConfiguration() {
        try {
            // Load from main settings instead of separate x config
            const settings = localStorage.getItem('ollamaDiscussionSettings');
            if (settings) {
                const parsedSettings = JSON.parse(settings);
                if (parsedSettings.xBearerToken || (parsedSettings.xApiKey && parsedSettings.xApiSecret && parsedSettings.xAccessToken && parsedSettings.xAccessTokenSecret)) {
                    this.config = {
                        bearerToken: parsedSettings.xBearerToken,
                        apiKey: parsedSettings.xApiKey,
                        apiSecret: parsedSettings.xApiSecret,
                        accessToken: parsedSettings.xAccessToken,
                        accessTokenSecret: parsedSettings.xAccessTokenSecret,
                        autoHashtags: parsedSettings.xAutoHashtags || false,
                        defaultHashtags: parsedSettings.xDefaultHashtags || '#AI #Discussion #Ollama',
                        confirmBeforePost: parsedSettings.xConfirmBeforePost !== false
                    };
                this.isConnected = this.validateConfig(this.config);
                }
            }
        } catch (error) {
            console.error('Failed to load X configuration:', error);
            this.config = null;
            this.isConnected = false;
        }
    }

    /**
     * Save X API configuration to main settings
     * @param {Object} config - X API configuration
     */
    saveConfiguration(config) {
        try {
            // Load existing settings
            const settings = localStorage.getItem('ollamaDiscussionSettings');
            const parsedSettings = settings ? JSON.parse(settings) : {};

            // Update X-related settings
            if (config.bearerToken) {
                parsedSettings.xBearerToken = config.bearerToken;
                // Clear OAuth fields if using Bearer Token
                delete parsedSettings.xApiKey;
                delete parsedSettings.xApiSecret;
                delete parsedSettings.xAccessToken;
                delete parsedSettings.xAccessTokenSecret;
            } else if (config.apiKey && config.apiSecret && config.accessToken && config.accessTokenSecret) {
                parsedSettings.xApiKey = config.apiKey;
                parsedSettings.xApiSecret = config.apiSecret;
                parsedSettings.xAccessToken = config.accessToken;
                parsedSettings.xAccessTokenSecret = config.accessTokenSecret;
                // Clear Bearer Token if using OAuth
                delete parsedSettings.xBearerToken;
            }

            parsedSettings.xAutoHashtags = config.autoHashtags || false;
            parsedSettings.xDefaultHashtags = config.defaultHashtags || '#AI #Discussion #Ollama';
            parsedSettings.xConfirmBeforePost = config.confirmBeforePost !== false;

            // Save back to main settings
            localStorage.setItem('ollamaDiscussionSettings', JSON.stringify(parsedSettings));
            
            // Reload configuration
            this.loadConfiguration();
            
            return { success: true, message: 'Configuration saved successfully' };
        } catch (error) {
            console.error('Failed to save X configuration:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Validate X API configuration
     * @param {Object} config - Configuration to validate
     * @returns {boolean} - Whether configuration is valid
     */
    validateConfig(config) {
        if (!config) return false;
        
        // For OAuth 2.0 Bearer Token (App-Only authentication)
        if (config.bearerToken) {
            return config.bearerToken.trim() !== '';
        }
        
        // For OAuth 1.0a (User Context authentication)
        const requiredFields = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'];
        return requiredFields.every(field => config[field] && config[field].trim() !== '');
    }

    /**
     * Check if X API is properly configured and connected
     * @returns {boolean} - Connection status
     */
    isConfigured() {
        return this.isConnected && this.config !== null;
    }

    /**
     * Get current configuration (without sensitive data)
     * @returns {Object} - Safe configuration object
     */
    getConfigurationSafe() {
        if (!this.config) return null;
        
        return {
            autoHashtags: this.config.autoHashtags || false,
            defaultHashtags: this.config.defaultHashtags || '#AI #Discussion #Ollama',
            confirmBeforePost: this.config.confirmBeforePost !== false, // default to true
            hasCredentials: this.validateConfig(this.config),
            authType: this.config.bearerToken ? 'Bearer Token' : 'OAuth 1.0a'
        };
    }

    /**
     * Generate OAuth 1.0a signature for API requests
     * @param {string} method - HTTP method
     * @param {string} url - Request URL
     * @param {Object} params - Request parameters
     * @returns {string} - Authorization header
     */
    generateOAuthHeader(method, url, params = {}) {
        if (!this.config || !this.config.apiKey) {
            throw new Error('OAuth configuration not available');
        }

        // This is a simplified OAuth implementation
        // In production, use a proper OAuth library like oauth-1.0a
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2, 15);
        
        const oauthParams = {
            oauth_consumer_key: this.config.apiKey,
            oauth_token: this.config.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        // Note: This is a simplified implementation
        // For production use, implement proper OAuth 1.0a signature generation
        const authHeader = `OAuth ${Object.entries(oauthParams)
            .map(([key, value]) => `${key}="${encodeURIComponent(value)}"`)
            .join(', ')}, oauth_signature="PLACEHOLDER_SIGNATURE"`;

        return authHeader;
    }

    /**
     * Make authenticated request to X API through backend proxy
     * @param {string} endpoint - Backend API endpoint
     * @param {Object} data - Request data
     * @param {string} method - HTTP method
     * @returns {Promise<Object>} - API response
     */
    async makeApiRequest(endpoint, data = {}, method = 'POST') {
        if (!this.isConfigured()) {
            throw new Error('X API not configured');
        }

        const requestData = {
            ...data,
            credentials: this.config
        };

        console.log('Making X API request to:', endpoint, 'with credentials type:', 
                   this.config?.bearerToken ? 'Bearer Token' : 'OAuth 1.0a',
                   this.config?.bearerToken === 'test' ? '(Demo Mode)' : '');

        try {
            const response = await fetch(`/api/social${endpoint}`, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'API request failed');
            }

            return result;
        } catch (error) {
            console.error('X API request failed:', error);
            throw error;
        }
    }

    /**
     * Update rate limit information from response headers
     * @param {Headers} headers - Response headers
     */
    updateRateLimitFromHeaders(headers) {
        const remaining = headers.get('x-rate-limit-remaining');
        const reset = headers.get('x-rate-limit-reset');
        const limit = headers.get('x-rate-limit-limit');

        if (remaining !== null) {
            this.rateLimitInfo.remaining = parseInt(remaining);
        }
        if (reset !== null) {
            this.rateLimitInfo.resetTime = new Date(parseInt(reset) * 1000);
        }
        if (limit !== null) {
            this.rateLimitInfo.limit = parseInt(limit);
        }
    }

    /**
     * Test X API connection
     * @returns {Promise<Object>} - Connection test result
     */
    async testConnection() {
        if (!this.isConfigured()) {
            return { success: false, message: 'X API not configured' };
        }

        try {
            const response = await this.makeApiRequest('/x/test', {});
            
            return { 
                success: true, 
                message: response.message,
                authType: response.authType
            };
        } catch (error) {
            return { 
                success: false, 
                message: `Connection failed: ${error.message}` 
            };
        }
    }

    /**
     * Search for tweets using X API v2
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} - Search results
     */
    async searchTweets(query, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('X API not configured');
        }

        try {
            const response = await this.makeApiRequest('/x/search', {
                query: query,
                options: options
            });
            
            return {
                success: true,
                data: response.data || [],
                includes: response.includes || {},
                meta: response.meta || {},
                message: 'Search completed successfully'
            };
        } catch (error) {
            console.error('Failed to search tweets:', error);
            throw error;
        }
    }

    /**
     * Get user's recent tweets
     * @param {string} userId - User ID (optional, defaults to authenticated user)
     * @param {number} count - Number of tweets to retrieve
     * @returns {Promise<Object>} - User tweets
     */
    async getUserTweets(userId = 'me', count = 10) {
        if (!this.isConfigured()) {
            throw new Error('X API not configured');
        }

        const params = new URLSearchParams({
            max_results: Math.min(count, 100),
            'tweet.fields': 'created_at,public_metrics,text,edit_history_tweet_ids',
            exclude: 'retweets,replies'
        });

        try {
            const endpoint = `/users/${userId}/tweets?${params.toString()}`;
            const response = await this.makeApiRequest(endpoint);
            
            return {
                success: true,
                data: response.data || [],
                meta: response.meta || {},
                message: 'Tweets retrieved successfully'
            };
        } catch (error) {
            console.error('Failed to get user tweets:', error);
            throw error;
        }
    }

    /**
     * Post a tweet to X
     * @param {Object} postData - Post data
     * @returns {Promise<Object>} - Post result
     */
    async postTweet(postData) {
        if (!this.isConfigured()) {
            throw new Error('X API not configured');
        }

        try {
            // Validate post content
            this.validatePostContent(postData.content);

            // Make API request to post tweet
            const response = await this.makeApiRequest('/x/tweet', {
                content: postData.content,
                options: {
                    addHashtags: postData.addHashtags,
                    hashtags: postData.hashtags
                }
            });

            return {
                success: true,
                data: response.data,
                message: response.message
            };

        } catch (error) {
            console.error('Failed to post tweet:', error);
            throw error;
        }
    }

    /**
     * Delete a tweet
     * @param {string} tweetId - Tweet ID to delete
     * @returns {Promise<Object>} - Delete result
     */
    async deleteTweet(tweetId) {
        if (!this.isConfigured()) {
            throw new Error('X API not configured');
        }

        try {
            const response = await this.makeApiRequest(`/tweets/${tweetId}`, {
                method: 'DELETE'
            });

            return {
                success: true,
                data: response.data,
                message: 'Tweet deleted successfully'
            };
        } catch (error) {
            console.error('Failed to delete tweet:', error);
            throw error;
        }
    }

    /**
     * Get rate limit information
     * @returns {Object} - Rate limit info
     */
    getRateLimitInfo() {
        return { ...this.rateLimitInfo };
    }

    /**
     * Validate post content
     * @param {string} content - Content to validate
     */
    validatePostContent(content) {
        if (!content || content.trim() === '') {
            throw new Error('Post content cannot be empty');
        }

        if (content.length > 280) {
            throw new Error(`Post content exceeds 280 character limit (${content.length} characters)`);
        }
    }

    /**
     * Clear stored configuration
     */
    clearConfiguration() {
        localStorage.removeItem('xConfig');
        this.config = null;
        this.isConnected = false;
    }

    /**
     * Format tweet content for display
     * @param {string} content - Raw tweet content
     * @returns {string} - Formatted content
     */
    formatTweetContent(content) {
        // Add basic formatting (links, mentions, hashtags)
        return content
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
            .replace(/@(\w+)/g, '<a href="https://twitter.com/$1" target="_blank" rel="noopener">@$1</a>')
            .replace(/#(\w+)/g, '<a href="https://twitter.com/hashtag/$1" target="_blank" rel="noopener">#$1</a>');
    }

    /**
     * Generate content from discussion summary
     * @param {Object} discussion - Discussion object
     * @returns {string} - Generated tweet content
     */
    generateTweetFromDiscussion(discussion) {
        if (!discussion || !discussion.summary) {
            throw new Error('Invalid discussion data');
        }

        let content = `🤖 AI Discussion: ${discussion.topic}\n\n`;
        
        if (discussion.summary.content) {
            // Truncate summary to fit Twitter's character limit
            const maxSummaryLength = 200 - content.length;
            const summaryText = discussion.summary.content.substring(0, maxSummaryLength);
            content += summaryText;
            
            if (discussion.summary.content.length > maxSummaryLength) {
                content += '...';
            }
        }

        // Add default hashtags if configured
        if (this.config && this.config.autoHashtags && this.config.defaultHashtags) {
            const hashtagsToAdd = this.config.defaultHashtags;
            const remainingChars = 280 - content.length - 2; // 2 for \n\n
            
            if (hashtagsToAdd.length <= remainingChars) {
                content += '\n\n' + hashtagsToAdd;
            }
        }

        return content;
    }

    /**
     * Get trending topics
     * @param {string} woeid - Where On Earth ID (optional)
     * @returns {Promise<Object>} - Trending topics
     */
    async getTrendingTopics(woeid = 1) {
        if (!this.isConfigured()) {
            throw new Error('X API not configured');
        }

        try {
            const response = await this.makeApiRequest('/x/trends', {
                woeid: woeid
            });
            
            return {
                success: true,
                data: response.data || [],
                meta: response.meta || {},
                message: 'Trending topics retrieved successfully'
            };
        } catch (error) {
            console.error('Failed to get trending topics:', error);
            throw error;
        }
    }

    /**
     * Schedule a tweet (Note: This requires additional setup with scheduling service)
     * @param {Object} postData - Post data with schedule time
     * @returns {Promise<Object>} - Schedule result
     */
    async scheduleTweet(postData) {
        // Note: X API doesn't directly support scheduling tweets
        // This would require integration with a scheduling service or custom implementation
        throw new Error('Tweet scheduling requires additional setup with a scheduling service');
    }

    /**
     * Set up demo credentials for testing
     */
    setupDemoCredentials() {
        this.config = {
            bearerToken: 'test',
            autoHashtags: false,
            defaultHashtags: '#AI #Demo #SocialMedia',
            confirmBeforePost: true
        };
        this.isConnected = true;
        console.log('Demo credentials configured for X API testing');
    }
} 