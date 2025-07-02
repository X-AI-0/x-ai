import express from 'express';
import fetch from 'node-fetch';
const router = express.Router();

// X API routes
router.post('/x/search', async (req, res) => {
    try {
        const { query, options, credentials } = req.body;
        
        if (!credentials || !credentials.bearerToken) {
            return res.status(400).json({
                success: false,
                message: 'X API credentials required'
            });
        }

        // If it's a test token, return mock data
        if (credentials.bearerToken.includes('test') || credentials.bearerToken.length < 50) {
            const mockData = {
                data: [
                    {
                        id: '1234567890123456789',
                        text: `This is a mock tweet about "${query}". This demonstrates the search functionality working with the social media integration system. #AI #Demo`,
                        created_at: new Date().toISOString(),
                        author_id: 'mock_user_1',
                        public_metrics: {
                            like_count: 42,
                            retweet_count: 12,
                            reply_count: 5,
                            quote_count: 3
                        }
                    },
                    {
                        id: '1234567890123456790',
                        text: `Another example tweet related to "${query}". The integration allows real-time search and interaction with X platform. #Technology #Innovation`,
                        created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
                        author_id: 'mock_user_2',
                        public_metrics: {
                            like_count: 128,
                            retweet_count: 34,
                            reply_count: 18,
                            quote_count: 7
                        }
                    }
                ],
                includes: {
                    users: [
                        {
                            id: 'mock_user_1',
                            name: 'Demo User 1',
                            username: 'demouser1',
                            verified: false
                        },
                        {
                            id: 'mock_user_2',
                            name: 'Tech Enthusiast',
                            username: 'techenthusiast',
                            verified: true
                        }
                    ]
                },
                meta: {
                    result_count: 2,
                    next_token: 'mock_next_token'
                }
            };

            res.json({
                success: true,
                data: mockData.data,
                includes: mockData.includes,
                meta: mockData.meta
            });
            return;
        }

        // For actual Bearer Token, make actual API call
        const url = new URL('https://api.twitter.com/2/tweets/search/recent');
        url.searchParams.append('query', query);
        
        if (options.maxResults) {
            url.searchParams.append('max_results', Math.min(options.maxResults, 100));
        }
        
        if (options.startTime) {
            url.searchParams.append('start_time', options.startTime);
        }
        
        if (options.endTime) {
            url.searchParams.append('end_time', options.endTime);
        }

        // Add extended fields
        url.searchParams.append('tweet.fields', 'created_at,author_id,public_metrics,text');
        url.searchParams.append('user.fields', 'name,username,verified');
        url.searchParams.append('expansions', 'author_id');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.bearerToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.title || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        res.json({
            success: true,
            data: data.data || [],
            includes: data.includes || {},
            meta: data.meta || {}
        });

    } catch (error) {
        console.error('X API search error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to search tweets'
        });
    }
});

// Get trending topics
router.post('/x/trends', async (req, res) => {
    try {
        const { credentials, woeid = 1 } = req.body;
        
        if (!credentials || !credentials.bearerToken) {
            return res.status(400).json({
                success: false,
                message: 'X API credentials required'
            });
        }

        // If it's a test token, return mock data
        if (credentials.bearerToken.includes('test') || credentials.bearerToken.length < 50) {
            const mockTrends = [
                { name: '#AI', tweet_volume: 125000 },
                { name: '#Technology', tweet_volume: 89000 },
                { name: '#MachineLearning', tweet_volume: 67000 },
                { name: '#OpenAI', tweet_volume: 54000 },
                { name: '#ChatGPT', tweet_volume: 43000 },
                { name: '#Innovation', tweet_volume: 32000 },
                { name: '#Future', tweet_volume: 28000 },
                { name: '#Automation', tweet_volume: 21000 },
                { name: '#DataScience', tweet_volume: 18000 },
                { name: '#Programming', tweet_volume: 15000 }
            ];

            res.json({
                success: true,
                data: mockTrends,
                meta: {
                    location: 'Worldwide (Demo)',
                    as_of: new Date().toISOString(),
                    created_at: new Date().toISOString()
                }
            });
            return;
        }

        // For actual Bearer Token, make actual API call
        const url = `https://api.twitter.com/1.1/trends/place.json?id=${woeid}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.bearerToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.title || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const trends = data[0]?.trends || [];
        
        res.json({
            success: true,
            data: trends,
            meta: {
                location: data[0]?.locations?.[0]?.name || 'Worldwide',
                as_of: data[0]?.as_of,
                created_at: data[0]?.created_at
            }
        });

    } catch (error) {
        console.error('X API trends error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get trending topics'
        });
    }
});

// Publish tweet
router.post('/x/tweet', async (req, res) => {
    try {
        const { content, credentials, options = {} } = req.body;
        
        if (!credentials) {
            return res.status(400).json({
                success: false,
                message: 'X API credentials required'
            });
        }

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tweet content is required'
            });
        }

        if (content.length > 280) {
            return res.status(400).json({
                success: false,
                message: 'Tweet content exceeds 280 characters'
            });
        }

        let finalContent = content;
        
        // Add hashtags
        if (options.addHashtags && options.hashtags) {
            const hashtags = options.hashtags.split(' ').filter(tag => tag.trim());
            if (hashtags.length > 0) {
                finalContent += ' ' + hashtags.join(' ');
            }
        }

        // Ensure final content doesn't exceed 280 characters
        if (finalContent.length > 280) {
            finalContent = finalContent.substring(0, 277) + '...';
        }

        const tweetData = {
            text: finalContent
        };

        // Publish tweet (note: this requires OAuth 1.0a authentication, Bearer Token only allows reading)
        if (credentials.bearerToken && !credentials.apiKey) {
            // If only Bearer Token, simulate successful publication
            const mockResponse = {
                data: {
                    id: Date.now().toString(),
                    text: finalContent,
                    created_at: new Date().toISOString(),
                    public_metrics: {
                        like_count: 0,
                        retweet_count: 0,
                        reply_count: 0,
                        quote_count: 0
                    }
                }
            };

            res.json({
                success: true,
                data: mockResponse.data,
                message: 'Tweet published successfully (simulated - Bearer Token only allows reading)'
            });
            return;
        }

        // Use OAuth 1.0a to publish actual tweet
        const response = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
                'Authorization': generateOAuthHeader('POST', 'https://api.twitter.com/2/tweets', credentials),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(tweetData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.title || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        res.json({
            success: true,
            data: data.data,
            message: 'Tweet published successfully'
        });

    } catch (error) {
        console.error('X API tweet error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to publish tweet'
        });
    }
});

// Test connection
router.post('/x/test', async (req, res) => {
    try {
        const { credentials } = req.body;
        
        if (!credentials) {
            return res.status(400).json({
                success: false,
                message: 'X API credentials required'
            });
        }

        // Test Bearer Token format
        if (credentials.bearerToken) {
            // Allow 'test' as a special case for demo mode
            if (credentials.bearerToken === 'test' || credentials.bearerToken.includes('test')) {
                res.json({
                    success: true,
                    message: 'Bearer Token format is valid (test mode)',
                    authType: 'Bearer Token'
                });
                return;
            }

            // Simple validation of Bearer Token format (no actual API call)
            if (credentials.bearerToken.length < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid Bearer Token format'
                });
            }

            // If it's an actual Bearer Token, you can choose to make an actual test
            if (credentials.bearerToken.length > 50) {
                try {
                    const response = await fetch('https://api.twitter.com/2/tweets/search/recent?query=hello&max_results=10', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${credentials.bearerToken}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (!response.ok) {
                        throw new Error('Invalid Bearer Token or API access denied');
                    }
                } catch (apiError) {
                    return res.status(400).json({
                        success: false,
                        message: 'Bearer Token test failed: ' + apiError.message
                    });
                }
            }

            res.json({
                success: true,
                message: 'Bearer Token format is valid',
                authType: 'Bearer Token'
            });
            return;
        }

        // Test OAuth 1.0a credentials format
        if (credentials.apiKey && credentials.apiSecret && credentials.accessToken && credentials.accessTokenSecret) {
            res.json({
                success: true,
                message: 'OAuth 1.0a credentials configured (actual connection test requires full OAuth flow)',
                authType: 'OAuth 1.0a'
            });
            return;
        }

        res.status(400).json({
            success: false,
            message: 'No valid credentials provided. Please provide either Bearer Token or complete OAuth 1.0a credentials.'
        });

    } catch (error) {
        console.error('X API test error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to test X API connection'
        });
    }
});

// Generate OAuth 1.0a authorization header (simplified version)
function generateOAuthHeader(method, url, credentials) {
    // Note: this is a simplified implementation, in production you should use a dedicated OAuth library
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substring(2, 15);
    
    const oauthParams = {
        oauth_consumer_key: credentials.apiKey,
        oauth_token: credentials.accessToken,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_nonce: nonce,
        oauth_version: '1.0'
    };

    // This should implement correct OAuth signature generation
    // For simplicity, here we return a placeholder
    const authHeader = `OAuth ${Object.entries(oauthParams)
        .map(([key, value]) => `${key}="${encodeURIComponent(value)}"`)
        .join(', ')}, oauth_signature="PLACEHOLDER_SIGNATURE"`;

    return authHeader;
}

export default router; 