export class GitHubApiService {
    constructor() {
        this.config = this.loadConfiguration();
        this.baseUrl = 'https://api.github.com';
    }

    // Configuration Management
    loadConfiguration() {
        try {
            // Load from main settings instead of separate github config
            const settings = localStorage.getItem('ollamaDiscussionSettings');
            if (settings) {
                const parsedSettings = JSON.parse(settings);
                if (parsedSettings.githubToken) {
                    return {
                        token: parsedSettings.githubToken,
                        username: parsedSettings.githubUsername || '',
                        defaultRepo: parsedSettings.githubDefaultRepo || '',
                        autoCommit: parsedSettings.githubAutoCommit || false,
                        commitMessage: parsedSettings.githubCommitMessage || 'Update from social media integration',
                        branch: parsedSettings.githubBranch || 'main'
                    };
                }
            }
            return null;
        } catch (error) {
            console.error('Failed to load GitHub configuration:', error);
            return null;
        }
    }

    saveConfiguration(config) {
        try {
            // Load existing settings
            const settings = localStorage.getItem('ollamaDiscussionSettings');
            const parsedSettings = settings ? JSON.parse(settings) : {};

            // Update GitHub-related settings
            parsedSettings.githubUsername = config.username?.trim() || '';
            parsedSettings.githubDefaultRepo = config.defaultRepo?.trim() || '';
            parsedSettings.githubAutoCommit = config.autoCommit || false;
            parsedSettings.githubCommitMessage = config.commitMessage || 'Update from social media integration';
            parsedSettings.githubBranch = config.branch || 'main';

            // Save back to main settings
            localStorage.setItem('ollamaDiscussionSettings', JSON.stringify(parsedSettings));
            
            // Reload configuration
            this.config = this.loadConfiguration();

            return {
                success: true,
                message: 'GitHub configuration saved successfully'
            };
        } catch (error) {
            console.error('Failed to save GitHub configuration:', error);
            return {
                success: false,
                message: 'Failed to save configuration: ' + error.message
            };
        }
    }

    isConfigured() {
        return this.config && this.config.token;
    }

    getConfigurationSafe() {
        if (!this.config) return null;
        
        return {
            username: this.config.username || '',
            defaultRepo: this.config.defaultRepo || '',
            autoCommit: this.config.autoCommit || false,
            commitMessage: this.config.commitMessage || 'Update from social media integration',
            branch: this.config.branch || 'main'
        };
    }

    setupDemoCredentials() {
        const demoConfig = {
            token: 'demo_token_for_testing',
            username: 'demo-user',
            defaultRepo: 'demo-repo',
            autoCommit: false,
            commitMessage: 'Demo commit from social media integration',
            branch: 'main',
            createdAt: new Date().toISOString()
        };

        localStorage.setItem('githubConfig', JSON.stringify(demoConfig));
        this.config = demoConfig;
    }

    // API Request Helper
    async makeRequest(endpoint, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('GitHub API not configured');
        }

        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        
        const defaultHeaders = {
            'Authorization': `Bearer ${this.config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Ollama-Social-Integration/1.0'
        };

        const requestOptions = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        // Handle demo mode
        if (this.config.token === 'demo_token_for_testing') {
            return this.handleDemoRequest(endpoint, requestOptions);
        }

        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    // Demo Mode Handler
    handleDemoRequest(endpoint, options) {
        console.log('Demo GitHub API request:', endpoint, options);
        
        // Simulate different endpoints
        if (endpoint.includes('/user')) {
            return Promise.resolve({
                login: 'demo-user',
                name: 'Demo User',
                public_repos: 5,
                followers: 10,
                following: 8
            });
        }
        
        if (endpoint.includes('/repos')) {
            if (options.method === 'GET') {
                return Promise.resolve([
                    {
                        name: 'demo-repo',
                        full_name: 'demo-user/demo-repo',
                        description: 'Demo repository for testing',
                        private: false,
                        html_url: 'https://github.com/demo-user/demo-repo',
                        updated_at: new Date().toISOString(),
                        stargazers_count: 5,
                        forks_count: 2
                    },
                    {
                        name: 'another-repo',
                        full_name: 'demo-user/another-repo',
                        description: 'Another demo repository',
                        private: true,
                        html_url: 'https://github.com/demo-user/another-repo',
                        updated_at: new Date(Date.now() - 86400000).toISOString(),
                        stargazers_count: 12,
                        forks_count: 3
                    }
                ]);
            }
        }
        
        if (endpoint.includes('/contents/') && options.method === 'PUT') {
            return Promise.resolve({
                content: {
                    name: 'social-post.md',
                    path: 'social-posts/social-post.md',
                    sha: 'demo-sha-' + Date.now(),
                    html_url: 'https://github.com/demo-user/demo-repo/blob/main/social-posts/social-post.md'
                },
                commit: {
                    sha: 'commit-sha-' + Date.now(),
                    message: options.body ? JSON.parse(options.body).message : 'Demo commit'
                }
            });
        }

        return Promise.resolve({ message: 'Demo response' });
    }

    // User Information
    async getUserInfo() {
        return await this.makeRequest('/user');
    }

    // Repository Operations
    async getRepositories(type = 'owner') {
        return await this.makeRequest(`/user/repos?type=${type}&sort=updated&per_page=50`);
    }

    async getRepository(owner, repo) {
        return await this.makeRequest(`/repos/${owner}/${repo}`);
    }

    // File Operations
    async getFileContent(owner, repo, path, branch = 'main') {
        try {
            return await this.makeRequest(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
        } catch (error) {
            if (error.message.includes('404')) {
                return null; // File doesn't exist
            }
            throw error;
        }
    }

    async createOrUpdateFile(owner, repo, path, content, message, branch = 'main', sha = null) {
        const body = {
            message: message,
            content: btoa(unescape(encodeURIComponent(content))), // Base64 encode
            branch: branch
        };

        if (sha) {
            body.sha = sha; // Required for updates
        }

        return await this.makeRequest(`/repos/${owner}/${repo}/contents/${path}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    // Social Media Integration Methods
    async pushSocialPost(postData) {
        if (!this.config.defaultRepo) {
            throw new Error('Default repository not configured');
        }

        const [owner, repo] = this.config.defaultRepo.includes('/') 
            ? this.config.defaultRepo.split('/')
            : [this.config.username, this.config.defaultRepo];

        if (!owner || !repo) {
            throw new Error('Invalid repository configuration');
        }

        // Create markdown content
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `social-post-${timestamp}.md`;
        const path = `social-posts/${filename}`;
        
        const markdownContent = this.createMarkdownContent(postData);
        
        // Check if file exists (shouldn't for new posts, but just in case)
        const existingFile = await this.getFileContent(owner, repo, path, this.config.branch);
        
        const result = await this.createOrUpdateFile(
            owner,
            repo,
            path,
            markdownContent,
            this.config.commitMessage || `Add social media post: ${postData.content.substring(0, 50)}...`,
            this.config.branch,
            existingFile?.sha
        );

        return {
            success: true,
            data: result,
            fileUrl: result.content.html_url,
            message: 'Post successfully pushed to GitHub'
        };
    }

    async pullRecentPosts(owner, repo, limit = 10) {
        try {
            // Get contents of social-posts directory
            const contents = await this.makeRequest(`/repos/${owner}/${repo}/contents/social-posts?ref=${this.config.branch}`);
            
            if (!Array.isArray(contents)) {
                return { success: true, data: [], message: 'No social posts found' };
            }

            // Sort by name (which includes timestamp) and take most recent
            const recentFiles = contents
                .filter(file => file.name.endsWith('.md'))
                .sort((a, b) => b.name.localeCompare(a.name))
                .slice(0, limit);

            // Fetch content for each file
            const posts = await Promise.all(
                recentFiles.map(async (file) => {
                    try {
                        const fileContent = await this.makeRequest(file.url);
                        const content = atob(fileContent.content); // Decode base64
                        
                        return {
                            filename: file.name,
                            path: file.path,
                            content: content,
                            sha: file.sha,
                            url: file.html_url,
                            lastModified: fileContent.commit?.committer?.date || new Date().toISOString()
                        };
                    } catch (error) {
                        console.error(`Failed to fetch content for ${file.name}:`, error);
                        return null;
                    }
                })
            );

            return {
                success: true,
                data: posts.filter(post => post !== null),
                message: `Retrieved ${posts.filter(post => post !== null).length} recent posts`
            };
        } catch (error) {
            if (error.message.includes('404')) {
                return { success: true, data: [], message: 'Social posts directory not found' };
            }
            throw error;
        }
    }

    // Helper Methods
    createMarkdownContent(postData) {
        const timestamp = new Date().toISOString();
        
        let content = `# Social Media Post\n\n`;
        content += `**Created:** ${timestamp}\n`;
        content += `**Platform:** ${postData.platform || 'Unknown'}\n`;
        content += `**Status:** ${postData.status || 'Published'}\n\n`;
        
        if (postData.scheduled) {
            content += `**Scheduled for:** ${postData.scheduleTime}\n\n`;
        }
        
        content += `## Content\n\n`;
        content += `${postData.content}\n\n`;
        
        if (postData.hashtags) {
            content += `## Hashtags\n\n`;
            content += `${postData.hashtags}\n\n`;
        }
        
        if (postData.metrics) {
            content += `## Metrics\n\n`;
            content += `- Likes: ${postData.metrics.likes || 0}\n`;
            content += `- Retweets: ${postData.metrics.retweets || 0}\n`;
            content += `- Replies: ${postData.metrics.replies || 0}\n\n`;
        }
        
        content += `---\n`;
        content += `*Generated by Ollama Social Media Integration*\n`;
        
        return content;
    }

    parseMarkdownContent(markdown) {
        // Simple parser to extract post data from markdown
        const lines = markdown.split('\n');
        const postData = {};
        
        let inContent = false;
        let content = '';
        
        for (const line of lines) {
            if (line.startsWith('**Platform:**')) {
                postData.platform = line.replace('**Platform:**', '').trim();
            } else if (line.startsWith('**Status:**')) {
                postData.status = line.replace('**Status:**', '').trim();
            } else if (line.startsWith('**Created:**')) {
                postData.createdAt = line.replace('**Created:**', '').trim();
            } else if (line.startsWith('**Scheduled for:**')) {
                postData.scheduleTime = line.replace('**Scheduled for:**', '').trim();
                postData.scheduled = true;
            } else if (line === '## Content') {
                inContent = true;
                continue;
            } else if (line.startsWith('## ') && inContent) {
                inContent = false;
            } else if (inContent && line.trim()) {
                content += line + '\n';
            }
        }
        
        postData.content = content.trim();
        return postData;
    }

    // Test connection
    async testConnection() {
        try {
            const user = await this.getUserInfo();
            return {
                success: true,
                message: `Successfully connected to GitHub as ${user.login}`,
                user: user
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to connect to GitHub: ' + error.message
            };
        }
    }
} 