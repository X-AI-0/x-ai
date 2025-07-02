import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OllamaInstaller {
    constructor() {
        // Project root directory
        this.projectRoot = path.resolve(__dirname, '../../../');
        // Ollama installation directory
        this.ollamaDir = path.join(this.projectRoot, 'ollama');
        // Model storage directory
        this.modelsDir = path.join(this.ollamaDir, 'models');
        // Ollama executable path
        this.ollamaExecutable = process.platform === 'win32' 
            ? path.join(this.ollamaDir, 'ollama.exe')
            : path.join(this.ollamaDir, 'ollama');
        
        // Direct GitHub download sources only - no mirrors
        // Using GitHub API and direct downloads for better reliability
        this.downloadSources = {
            win32: [
                {
                    name: 'GitHub API Latest',
                    url: 'https://api.github.com/repos/ollama/ollama/releases/latest',
                    region: 'global',
                    priority: 1,
                    minSize: 50 * 1024 * 1024,
                    isApi: true, // This is an API endpoint
                    tested: true
                },
                {
                    name: 'GitHub Direct Latest',
                    url: 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip',
                    region: 'global',
                    priority: 2,
                    minSize: 50 * 1024 * 1024,
                    tested: true
                },
                {
                    name: 'GitHub Direct v0.9.0',
                    url: 'https://github.com/ollama/ollama/releases/download/v0.9.0/ollama-windows-amd64.zip',
                    region: 'global',
                    priority: 3,
                    minSize: 50 * 1024 * 1024,
                    tested: true
                }
            ],
            darwin: [
                {
                    name: 'GitHub Primary',
                    url: 'https://github.com/ollama/ollama/releases/latest/download/ollama-darwin',
                    region: 'global',
                    priority: 1
                },
                {
                    name: 'GitHub Mirror (Asia)',
                    url: 'https://mirror.ghproxy.com/https://github.com/ollama/ollama/releases/latest/download/ollama-darwin',
                    region: 'asia',
                    priority: 2
                }
            ],
            linux: [
                {
                    name: 'GitHub Primary',
                    url: 'https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64',
                    region: 'global',
                    priority: 1
                },
                {
                    name: 'GitHub Mirror (Asia)',
                    url: 'https://mirror.ghproxy.com/https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64',
                    region: 'asia',
                    priority: 2
                }
            ]
        };

        // Speed test timeout in milliseconds
        this.speedTestTimeout = 3000; // Reduced from 5000ms
        this.connectionTestTimeout = 2000; // Reduced from 3000ms

        // Download control state
        this.downloadState = {
            isDownloading: false,
            isPaused: false,
            isCancelled: false,
            currentRequest: null,
            currentStream: null
        };
        
        // Progress reporting throttle
        this.lastProgressReport = 0;
        this.progressReportInterval = 1000; // Report progress every 1 second
    }

    /**
     * Get actual download URL from GitHub API
     */
    async getGitHubDownloadUrl(platform, userToken = null) {
        try {
            console.log('[INSTALLER] Fetching latest release info from GitHub API...');
            const apiUrl = 'https://api.github.com/repos/ollama/ollama/releases/latest';
            
            const headers = {
                'User-Agent': 'Ollama-Installer/1.0',
                'Accept': 'application/vnd.github.v3+json'
            };
            
            // Add authorization header if user token is provided
            if (userToken) {
                headers['Authorization'] = `token ${userToken}`;
                console.log('[INSTALLER] Using user-provided GitHub token for API access');
            } else {
                console.log('[INSTALLER] Using anonymous GitHub API access (rate limited)');
            }
            
            const response = await new Promise((resolve, reject) => {
                https.get(apiUrl, { headers }, (res) => {
                    if (res.statusCode === 403) {
                        const rateLimitRemaining = res.headers['x-ratelimit-remaining'];
                        const rateLimitReset = res.headers['x-ratelimit-reset'];
                        const resetTime = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString() : 'unknown';
                        
                        reject(new Error(`GitHub API rate limit exceeded. Remaining: ${rateLimitRemaining || 0}. Resets at: ${resetTime}. Consider providing a GitHub token in Settings.`));
                        return;
                    }
                    
                    if (res.statusCode !== 200) {
                        reject(new Error(`GitHub API returned ${res.statusCode}`));
                        return;
                    }
                    
                    // Log rate limit info
                    const rateLimitRemaining = res.headers['x-ratelimit-remaining'];
                    const rateLimitLimit = res.headers['x-ratelimit-limit'];
                    console.log(`[INSTALLER] GitHub API rate limit: ${rateLimitRemaining}/${rateLimitLimit} remaining`);
                    
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (error) {
                            reject(new Error('Invalid JSON from GitHub API'));
                        }
                    });
                }).on('error', reject);
            });
            
            // Find the correct asset for the platform
            const assetName = platform === 'win32' ? 'ollama-windows-amd64.zip' : 
                             platform === 'darwin' ? 'ollama-darwin' : 'ollama-linux-amd64';
            
            const asset = response.assets.find(asset => asset.name === assetName);
            
            if (!asset) {
                throw new Error(`No asset found for platform: ${platform}`);
            }
            
            console.log(`[INSTALLER] Found asset: ${asset.name}, size: ${asset.size} bytes`);
            
            return {
                name: 'GitHub Release',
                url: asset.browser_download_url,
                region: 'global',
                priority: 1,
                size: asset.size,
                minSize: 100 * 1024 * 1024 // Minimum 100MB expected
            };
            
        } catch (error) {
            console.warn('[INSTALLER] Failed to get GitHub download URL:', error.message);
            throw error;
        }
    }

    /**
     * Detect user's geographical location and network conditions
     */
    async detectOptimalSource(platform, userToken = null) {
        const sources = this.downloadSources[platform];
        if (!sources || sources.length === 0) {
            throw new Error(`No download sources available for platform: ${platform}`);
        }

        console.log('Detecting optimal download source...');
        
        try {
            // Try to get latest release from GitHub API first
            const apiSource = sources.find(s => s.isApi);
            if (apiSource) {
                try {
                    console.log('Attempting to get latest release from GitHub API...');
                    const githubRelease = await this.getGitHubDownloadUrl(platform, userToken);
                    console.log('Successfully got GitHub API release info');
                    return githubRelease;
                } catch (apiError) {
                    console.warn('GitHub API failed, falling back to direct sources:', apiError.message);
                }
            }
            
            // Fallback to direct download sources
            console.log('Using direct download sources...');
            
            // Get user's location information (with timeout)
            let locationInfo;
            try {
                locationInfo = await Promise.race([
                    this.getUserLocation(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 5000))
                ]);
                console.log('User location detected:', locationInfo);
            } catch (locationError) {
                console.warn('Location detection failed, using default:', locationError.message);
                locationInfo = { country: 'Unknown', countryCode: 'XX', region: 'global' };
            }

            // Test connection speed to different sources (with shorter timeout)
            let speedResults = [];
            try {
                speedResults = await Promise.race([
                    this.testDownloadSpeeds(sources),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Speed test timeout')), 10000))
                ]);
                console.log('Speed test results:', speedResults);
            } catch (speedError) {
                console.warn('Speed test failed, using priority order:', speedError.message);
                // Create default speed results based on priority
                speedResults = sources.map(source => ({
                    source: source,
                    speed: { downloadSpeed: source.priority === 1 ? 1000 : 500, latency: source.priority * 100 },
                    latency: source.priority * 100,
                    available: true
                }));
            }

            // Select the best source based on location and speed
            const optimalSource = this.selectOptimalSource(sources, locationInfo, speedResults);
            console.log('Selected optimal source:', optimalSource);

            return optimalSource;
        } catch (error) {
            console.warn('Failed to detect optimal source, using first available:', error.message);
            // Fallback to the first source
            return sources[0];
        }
    }

    /**
     * Get user's geographical location using IP geolocation
     */
    async getUserLocation() {
        const locationServices = [
            'http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,lat,lon,timezone',
            'https://ipapi.co/json/',
            'https://freegeoip.app/json/'
        ];

        for (const service of locationServices) {
            try {
                const location = await this.fetchLocationFromService(service);
                if (location && location.country) {
                    return {
                        country: location.country,
                        countryCode: location.countryCode || location.country_code,
                        region: location.region || location.region_name,
                        city: location.city,
                        latitude: location.lat || location.latitude,
                        longitude: location.lon || location.longitude,
                        timezone: location.timezone
                    };
                }
            } catch (error) {
                console.warn(`Failed to get location from ${service}:`, error.message);
                continue;
            }
        }

        // Default location if all services fail
        return {
            country: 'Unknown',
            countryCode: 'XX',
            region: 'global'
        };
    }

    /**
     * Fetch location data from a specific service
     */
    async fetchLocationFromService(serviceUrl) {
        return new Promise((resolve, reject) => {
            const protocol = serviceUrl.startsWith('https:') ? https : http;
            const timeout = setTimeout(() => {
                reject(new Error('Location service timeout'));
            }, this.connectionTestTimeout);

            protocol.get(serviceUrl, (response) => {
                clearTimeout(timeout);
                
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        const locationData = JSON.parse(data);
                        resolve(locationData);
                    } catch (error) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * Test download speeds for different sources
     */
    async testDownloadSpeeds(sources) {
        const speedResults = [];

        for (const source of sources) {
            try {
                console.log(`Testing speed for: ${source.name}`);
                const speed = await this.testSingleSourceSpeed(source.url);
                speedResults.push({
                    source: source,
                    speed: speed,
                    latency: speed.latency,
                    available: true
                });
            } catch (error) {
                console.warn(`Speed test failed for ${source.name}:`, error.message);
                speedResults.push({
                    source: source,
                    speed: { downloadSpeed: 0, latency: 9999 },
                    latency: 9999,
                    available: false
                });
            }
        }

        return speedResults;
    }

    /**
     * Test download speed for a single source
     */
    async testSingleSourceSpeed(url) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let downloadedBytes = 0;
            let latency = 0;

            const timeout = setTimeout(() => {
                reject(new Error('Speed test timeout'));
            }, this.speedTestTimeout);

            https.get(url, (response) => {
                latency = Date.now() - startTime;
                
                if (response.statusCode === 302 || response.statusCode === 301) {
                    clearTimeout(timeout);
                    // Follow redirect for speed test
                    return this.testSingleSourceSpeed(response.headers.location)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    clearTimeout(timeout);
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const testStartTime = Date.now();
                
                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    
                    // Stop test after downloading 1MB or 3 seconds
                    if (downloadedBytes > 1024 * 1024 || (Date.now() - testStartTime) > 3000) {
                        clearTimeout(timeout);
                        response.destroy();
                        
                        const testDuration = (Date.now() - testStartTime) / 1000;
                        // Prevent division by zero
                        const downloadSpeed = testDuration > 0 ? downloadedBytes / testDuration : 0;
                        
                        resolve({
                            downloadSpeed: downloadSpeed,
                            latency: latency,
                            testBytes: downloadedBytes,
                            testDuration: testDuration
                        });
                    }
                });

                response.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });

                response.on('end', () => {
                    clearTimeout(timeout);
                    const testDuration = (Date.now() - testStartTime) / 1000;
                    // Prevent division by zero
                    const downloadSpeed = testDuration > 0 ? downloadedBytes / testDuration : 0;
                    
                    resolve({
                        downloadSpeed: downloadSpeed,
                        latency: latency,
                        testBytes: downloadedBytes,
                        testDuration: testDuration
                    });
                });
            }).on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Select the optimal download source based on location and speed tests
     */
    selectOptimalSource(sources, locationInfo, speedResults) {
        // Sort by availability and speed
        const availableSources = speedResults
            .filter(result => result.available)
            .sort((a, b) => {
                // Primary sort: by download speed (higher is better)
                if (b.speed.downloadSpeed !== a.speed.downloadSpeed) {
                    return b.speed.downloadSpeed - a.speed.downloadSpeed;
                }
                // Secondary sort: by latency (lower is better)
                return a.speed.latency - b.speed.latency;
            });

        if (availableSources.length === 0) {
            // If no sources are available from speed test, use regional preference
            return this.selectByRegion(sources, locationInfo);
        }

        // Apply regional bonus to speed scores
        const scoredSources = availableSources.map(result => {
            let score = result.speed.downloadSpeed;
            
            // Apply regional bonus
            if (this.isRegionalMatch(result.source.region, locationInfo)) {
                score *= 1.2; // 20% bonus for regional match
            }
            
            // Apply latency penalty
            score = score / (1 + result.speed.latency / 1000);
            
            return {
                ...result,
                finalScore: score
            };
        });

        // Sort by final score
        scoredSources.sort((a, b) => b.finalScore - a.finalScore);
        
        return scoredSources[0].source;
    }

    /**
     * Select source by regional preference when speed test fails
     */
    selectByRegion(sources, locationInfo) {
        const countryCode = locationInfo.countryCode?.toLowerCase();
        
        // Regional mapping
        const asianCountries = ['cn', 'jp', 'kr', 'sg', 'hk', 'tw', 'th', 'my', 'id', 'ph', 'vn', 'in'];
        const europeanCountries = ['de', 'fr', 'gb', 'it', 'es', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'ru'];
        
        let preferredRegion = 'global';
        
        if (asianCountries.includes(countryCode)) {
            preferredRegion = 'asia';
        } else if (europeanCountries.includes(countryCode)) {
            preferredRegion = 'europe';
        }

        // Find source matching preferred region
        const regionalSource = sources.find(source => source.region === preferredRegion);
        if (regionalSource) {
            return regionalSource;
        }

        // Fallback to highest priority source
        return sources.sort((a, b) => a.priority - b.priority)[0];
    }

    /**
     * Check if source region matches user location
     */
    isRegionalMatch(sourceRegion, locationInfo) {
        const countryCode = locationInfo.countryCode?.toLowerCase();
        
        if (sourceRegion === 'asia') {
            const asianCountries = ['cn', 'jp', 'kr', 'sg', 'hk', 'tw', 'th', 'my', 'id', 'ph', 'vn', 'in'];
            return asianCountries.includes(countryCode);
        }
        
        if (sourceRegion === 'europe') {
            const europeanCountries = ['de', 'fr', 'gb', 'it', 'es', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'ru'];
            return europeanCountries.includes(countryCode);
        }
        
        return sourceRegion === 'global';
    }

    /**
     * Check if Ollama is already installed
     */
    async checkOllamaInstalled() {
        try {
            console.log('[INSTALLER] Checking Ollama installation...');
            
            // Check project local installation
            console.log(`[INSTALLER] Checking local installation at: ${this.ollamaExecutable}`);
            if (fs.existsSync(this.ollamaExecutable)) {
                // Verify the file is actually executable
                try {
                    const stats = fs.statSync(this.ollamaExecutable);
                    console.log(`[INSTALLER] Local ollama.exe found, size: ${stats.size} bytes`);
                    
                    if (stats.size > 0) {
                        // Try to get version
                        let version = 'unknown';
                        try {
                            const versionResult = await execAsync(`"${this.ollamaExecutable}" --version`);
                            const versionOutput = versionResult.stdout.trim();
                            
                            // Parse version from output that may contain warnings
                            const lines = versionOutput.split('\n');
                            for (const line of lines) {
                                const versionMatch = line.match(/(?:ollama\s+)?(?:client\s+)?version\s+is\s+(\d+\.\d+\.\d+)/i);
                                if (versionMatch) {
                                    version = `v${versionMatch[1]}`;
                                    break;
                                }
                            }
                            
                            if (version === 'unknown') {
                                version = versionOutput; // Fallback to full output
                            }
                        } catch (error) {
                            console.log('[INSTALLER] Could not get local version:', error.message);
                        }
                        
                        return {
                            installed: true,
                            location: 'local',
                            path: this.ollamaExecutable,
                            size: stats.size,
                            version: version
                        };
                    } else {
                        console.warn('[INSTALLER] Local ollama.exe exists but has zero size');
                        // Remove the invalid file
                        fs.unlinkSync(this.ollamaExecutable);
                    }
                } catch (error) {
                    console.error('[INSTALLER] Error checking local installation:', error);
                }
            }

            // Check system global installation
            console.log('[INSTALLER] Checking system installation...');
            try {
                const result = await execAsync('ollama --version');
                console.log('[INSTALLER] System Ollama found:', result.stdout.trim());
                return {
                    installed: true,
                    location: 'system',
                    path: 'ollama',
                    version: result.stdout.trim()
                };
            } catch (error) {
                console.log('[INSTALLER] System Ollama not found:', error.message);
            }

            console.log('[INSTALLER] Ollama not installed');
            return {
                installed: false,
                location: null,
                path: null
            };
        } catch (error) {
            console.error('[INSTALLER] Error checking installation:', error);
            return {
                installed: false,
                location: null,
                path: null,
                error: error.message
            };
        }
    }

    /**
     * Get Ollama version information
     */
    async getOllamaVersion() {
        try {
            const installationStatus = await this.checkOllamaInstalled();
            
            if (!installationStatus.installed) {
                return {
                    success: false,
                    error: 'Ollama is not installed'
                };
            }
            
            let version = 'unknown';
            let versionDetails = {};
            
            try {
                let versionOutput = '';
                if (installationStatus.location === 'local') {
                    const versionResult = await execAsync(`"${this.ollamaExecutable}" --version`);
                    versionOutput = versionResult.stdout.trim();
                } else {
                    const versionResult = await execAsync('ollama --version');
                    versionOutput = versionResult.stdout.trim();
                }
                
                console.log('[INSTALLER] Raw version output:', versionOutput);
                
                // Parse version details - handle warnings and extract actual version
                const lines = versionOutput.split('\n');
                let actualVersion = 'unknown';
                
                // Look for version patterns in each line
                for (const line of lines) {
                    // Match patterns like "ollama version is 0.9.0" or "client version is 0.9.0"
                    const versionMatch = line.match(/(?:ollama\s+)?(?:client\s+)?version\s+is\s+(\d+\.\d+\.\d+)/i);
                    if (versionMatch) {
                        actualVersion = versionMatch[1];
                        break;
                    }
                    
                    // Match patterns like "ollama 0.9.0"
                    const simpleMatch = line.match(/ollama\s+(\d+\.\d+\.\d+)/i);
                    if (simpleMatch) {
                        actualVersion = simpleMatch[1];
                        break;
                    }
                    
                    // Match standalone version numbers
                    const standaloneMatch = line.match(/^(\d+\.\d+\.\d+)$/);
                    if (standaloneMatch) {
                        actualVersion = standaloneMatch[1];
                        break;
                    }
                }
                
                versionDetails.version = actualVersion;
                versionDetails.fullVersion = versionOutput;
                versionDetails.rawOutput = versionOutput;
                
                return {
                    success: true,
                    data: {
                        version: actualVersion,
                        fullVersion: versionOutput,
                        cleanVersion: actualVersion !== 'unknown' ? `v${actualVersion}` : 'Unknown Version',
                        location: installationStatus.location,
                        path: installationStatus.path,
                        hasWarnings: versionOutput.includes('Warning:'),
                        rawOutput: versionOutput
                    }
                };
                
            } catch (error) {
                console.error('[INSTALLER] Error getting version:', error);
                return {
                    success: false,
                    error: `Failed to get version: ${error.message}`
                };
            }
            
        } catch (error) {
            console.error('[INSTALLER] Error in getOllamaVersion:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create necessary directories
     */
    async createDirectories() {
        const dirs = [this.ollamaDir, this.modelsDir];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Download file with progress tracking, speed calculation, and pause/cancel support
     */
    async downloadFile(url, outputPath, onProgress) {
        return new Promise((resolve, reject) => {
            // Reset download state
            this.downloadState.isDownloading = true;
            this.downloadState.isPaused = false;
            this.downloadState.isCancelled = false;
            
            const file = fs.createWriteStream(outputPath);
            this.downloadState.currentStream = file;
            
            let startTime = Date.now();
            let lastProgressTime = startTime;
            let lastDownloadedSize = 0;
            let downloadTimeout;
            
            // Set a timeout for stalled downloads
            const resetDownloadTimeout = () => {
                if (downloadTimeout) clearTimeout(downloadTimeout);
                downloadTimeout = setTimeout(() => {
                    if (!this.downloadState.isPaused && !this.downloadState.isCancelled) {
                        console.log('[INSTALLER] Download appears stalled, timing out...');
                        this.cleanup();
                        reject(new Error('Download stalled - connection timeout'));
                    }
                }, 60000); // 60 second timeout for stalled downloads (increased from 30s)
            };
            
            const cleanup = () => {
                clearTimeout(downloadTimeout);
                this.resetDownloadState();
                if (fs.existsSync(outputPath)) {
                    fs.unlink(outputPath, () => {}); // Delete partial download
                }
            };
            
            this.cleanup = cleanup;
            resetDownloadTimeout();
            
            const request = https.get(url, {
                timeout: 30000 // 30 second connection timeout
            }, (response) => {
                this.downloadState.currentRequest = request;
                
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    console.log(`[INSTALLER] Following redirect to: ${response.headers.location}`);
                    cleanup();
                    // Recursively follow redirect
                    this.downloadFile(response.headers.location, outputPath, onProgress)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    cleanup();
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    // Check for cancellation
                    if (this.downloadState.isCancelled) {
                        cleanup();
                        reject(new Error('Download cancelled by user'));
                        return;
                    }
                    
                    // Handle pause state
                    if (this.downloadState.isPaused) {
                        return; // Don't process data when paused
                    }
                    
                    downloadedSize += chunk.length;
                    resetDownloadTimeout(); // Reset timeout on each data chunk
                    
                    if (onProgress && totalSize) {
                        const currentTime = Date.now();
                        const progress = (downloadedSize / totalSize) * 100;
                        
                        // Throttle progress reports to reduce spam
                        if (currentTime - this.lastProgressReport >= this.progressReportInterval || progress >= 100) {
                            const timeDiff = (currentTime - lastProgressTime) / 1000;
                            const sizeDiff = downloadedSize - lastDownloadedSize;
                            const speed = timeDiff > 0 ? sizeDiff / timeDiff : 0; // bytes per second
                            
                            onProgress({
                                downloaded: downloadedSize,
                                total: totalSize,
                                progress: progress,
                                speed: speed,
                                eta: speed > 0 ? (totalSize - downloadedSize) / speed : 0,
                                isPaused: this.downloadState.isPaused,
                                isCancelled: this.downloadState.isCancelled
                            });
                            
                            this.lastProgressReport = currentTime;
                            lastProgressTime = currentTime;
                            lastDownloadedSize = downloadedSize;
                        }
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    if (!this.downloadState.isCancelled) {
                        clearTimeout(downloadTimeout);
                        file.close();
                        this.resetDownloadState();
                        
                        // Verify file size
                        try {
                            const stats = fs.statSync(outputPath);
                            console.log(`[INSTALLER] Download completed, file size: ${stats.size} bytes`);
                            
                            // Check if file is suspiciously small (likely an error page)
                            if (stats.size < 10 * 1024) { // Less than 10KB
                                console.error('[INSTALLER] Downloaded file is too small, likely an error page');
                                
                                // Try to read the file content to see what we got
                                try {
                                    const content = fs.readFileSync(outputPath, 'utf8');
                                    console.error('[INSTALLER] File content:', content.substring(0, 500));
                                } catch (readError) {
                                    console.error('[INSTALLER] Could not read file content:', readError.message);
                                }
                                
                                cleanup();
                                reject(new Error('Downloaded file is too small - likely received an error page instead of the actual file'));
                                return;
                            }
                            
                            console.log('[INSTALLER] Download completed successfully');
                            resolve();
                        } catch (statError) {
                            console.error('[INSTALLER] Error checking file stats:', statError);
                            cleanup();
                            reject(statError);
                        }
                    }
                });

                file.on('error', (err) => {
                    cleanup();
                    console.error('[INSTALLER] File write error:', err);
                    reject(err);
                });

                response.on('error', (err) => {
                    cleanup();
                    console.error('[INSTALLER] Response error:', err);
                    reject(err);
                });

            }).on('error', (err) => {
                cleanup();
                console.error('[INSTALLER] Request error:', err);
                reject(err);
            }).on('timeout', () => {
                cleanup();
                console.error('[INSTALLER] Request timeout');
                reject(new Error('Request timeout - server did not respond'));
            });
        });
    }

    /**
     * Extract ZIP file (Windows)
     */
    async extractZip(zipPath, extractPath) {
        try {
            console.log(`[INSTALLER] Extracting ZIP from ${zipPath} to ${extractPath}`);
            
            // Verify ZIP file exists and has content
            if (!fs.existsSync(zipPath)) {
                throw new Error(`ZIP file not found: ${zipPath}`);
            }
            
            const zipStats = fs.statSync(zipPath);
            console.log(`[INSTALLER] ZIP file size: ${zipStats.size} bytes`);
            
            if (zipStats.size === 0) {
                throw new Error('ZIP file is empty');
            }
            
            // Ensure extract path exists
            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }
            
            // Clean extract path first
            const existingFiles = fs.readdirSync(extractPath);
            for (const file of existingFiles) {
                const filePath = path.join(extractPath, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
            }
            
            // Normalize paths for PowerShell (use forward slashes or escape backslashes)
            const normalizedZipPath = zipPath.replace(/\\/g, '/');
            const normalizedExtractPath = extractPath.replace(/\\/g, '/');
            
            // Use simple PowerShell Expand-Archive command (proven to work)
            const command = `powershell -ExecutionPolicy Bypass -Command "
                try {
                    Write-Host 'Starting ZIP extraction...'
                    Write-Host 'ZIP path: ${normalizedZipPath}'
                    Write-Host 'Extract path: ${normalizedExtractPath}'
                    
                    if (Test-Path '${normalizedZipPath}') {
                        $zipSize = (Get-Item '${normalizedZipPath}').Length
                        Write-Host 'ZIP file exists, size:' $zipSize
                        
                        # Use simple Expand-Archive command
                        Write-Host 'Running Expand-Archive...'
                        Expand-Archive -Path '${normalizedZipPath}' -DestinationPath '${normalizedExtractPath}' -Force
                        Write-Host 'Expand-Archive completed'
                        
                        # Count extracted files
                        Write-Host 'Counting files...'
                        $files = Get-ChildItem -Path '${normalizedExtractPath}' -Recurse -File
                        Write-Host 'Total extracted files:' $files.Count
                        
                        # Look for ollama.exe
                        Write-Host 'Looking for ollama.exe...'
                        $ollamaFiles = Get-ChildItem -Path '${normalizedExtractPath}' -Recurse -Filter 'ollama.exe'
                        if ($ollamaFiles.Count -gt 0) {
                            Write-Host 'Found ollama.exe:'
                            foreach ($file in $ollamaFiles) {
                                Write-Host '  -' $file.FullName '(' $file.Length 'bytes)'
                            }
                        } else {
                            Write-Host 'ollama.exe not found, listing first 10 files...'
                            $counter = 0
                            foreach ($file in $files) {
                                if ($counter -lt 10) {
                                    Write-Host '  -' $file.FullName '(' $file.Length 'bytes)'
                                    $counter++
                                }
                            }
                        }
                    } else {
                        Write-Error 'ZIP file does not exist at ${normalizedZipPath}'
                        exit 1
                    }
                } catch {
                    Write-Error 'Extraction failed:'
                    Write-Error $_.Exception.Message
                    Write-Error $_.Exception.StackTrace
                    exit 1
                }
            "`;
            
            console.log(`[INSTALLER] Running extraction command`);
            
            // Try a simpler approach - just run the extraction without complex output
            const simpleCommand = `powershell -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${normalizedZipPath}' -DestinationPath '${normalizedExtractPath}' -Force"`;
            
            try {
                console.log(`[INSTALLER] Executing: ${simpleCommand}`);
                const result = await execAsync(simpleCommand, { timeout: 120000 }); // 2 minute timeout
                console.log(`[INSTALLER] PowerShell extraction completed`);
                
                if (result.stdout) {
                    console.log(`[INSTALLER] Stdout:`, result.stdout);
                }
                if (result.stderr) {
                    console.log(`[INSTALLER] Stderr:`, result.stderr);
                }
                
                // Check if extraction directory exists and has content
                if (fs.existsSync(extractPath)) {
                    const files = fs.readdirSync(extractPath);
                    console.log(`[INSTALLER] Found ${files.length} items in extract directory`);
                    if (files.length > 0) {
                        console.log(`[INSTALLER] First few items:`, files.slice(0, 5));
                    }
                } else {
                    console.log(`[INSTALLER] Extract directory does not exist: ${extractPath}`);
                }
                
            } catch (execError) {
                console.error(`[INSTALLER] PowerShell execution failed:`, execError.message);
                if (execError.stdout) {
                    console.log(`[INSTALLER] Error Stdout:`, execError.stdout);
                }
                if (execError.stderr) {
                    console.log(`[INSTALLER] Error Stderr:`, execError.stderr);
                }
                throw execError;
            }
            
            // Wait a moment for file system to sync
            console.log(`[INSTALLER] Waiting for file system to sync...`);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3 seconds
            
            // Verify extraction was successful
            console.log(`[INSTALLER] Verifying extraction...`);
            await this.verifyExtraction(extractPath);
            
            console.log(`[INSTALLER] ZIP extraction completed successfully`);
            
        } catch (error) {
            console.error(`[INSTALLER] ZIP extraction failed:`, error);
            
            // Try to provide more debugging info
            try {
                if (fs.existsSync(extractPath)) {
                    const files = fs.readdirSync(extractPath, { recursive: true });
                    console.log(`[INSTALLER] Files in extract directory after failure:`, files);
                }
            } catch (debugError) {
                console.error(`[INSTALLER] Could not list files in extract directory:`, debugError);
            }
            
            throw new Error(`Failed to extract ZIP: ${error.message}`);
        }
    }

    /**
     * Verify that extraction was successful
     */
    async verifyExtraction(extractPath) {
        console.log(`[INSTALLER] Verifying extraction in: ${extractPath}`);
        
        // Check if extract directory exists
        if (!fs.existsSync(extractPath)) {
            throw new Error(`Extract directory does not exist: ${extractPath}`);
        }
        
        // List all files in extract directory with better error handling
        let files = [];
        try {
            files = fs.readdirSync(extractPath, { recursive: true });
            console.log(`[INSTALLER] Files found after extraction (${files.length} total):`, files);
        } catch (error) {
            console.error(`[INSTALLER] Error reading extract directory:`, error);
            throw new Error(`Cannot read extract directory: ${error.message}`);
        }
        
        if (files.length === 0) {
            throw new Error('No files found in extracted directory');
        }
        
        // Look for ollama.exe specifically (case insensitive)
        const ollamaExe = files.find(file => file.toString().toLowerCase().endsWith('ollama.exe'));
        
        if (!ollamaExe) {
            // If ollama.exe is not found, do a comprehensive search
            console.log(`[INSTALLER] ollama.exe not found in root, searching subdirectories...`);
            
            const allFiles = [];
            const findFiles = (dir) => {
                try {
                    const items = fs.readdirSync(dir, { withFileTypes: true });
                    for (const item of items) {
                        const fullPath = path.join(dir, item.name);
                        const relativePath = path.relative(extractPath, fullPath);
                        
                        if (item.isDirectory()) {
                            findFiles(fullPath);
                        } else {
                            allFiles.push({
                                path: fullPath,
                                relativePath: relativePath,
                                name: item.name,
                                size: fs.statSync(fullPath).size
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`[INSTALLER] Error reading directory ${dir}:`, error.message);
                }
            };
            
            findFiles(extractPath);
            console.log(`[INSTALLER] Found ${allFiles.length} files total`);
            
            // Look for ollama.exe (case insensitive, exact match)
            let ollamaFile = allFiles.find(file => 
                file.name.toLowerCase() === 'ollama.exe'
            );
            
            if (!ollamaFile) {
                // Look for any file containing 'ollama' in the name
                ollamaFile = allFiles.find(file => 
                    file.name.toLowerCase().includes('ollama') && 
                    file.name.toLowerCase().endsWith('.exe')
                );
            }
            
            if (ollamaFile) {
                // Copy ollama.exe to the root of extract directory
                const targetPath = path.join(extractPath, 'ollama.exe');
                console.log(`[INSTALLER] Found ollama executable: ${ollamaFile.relativePath}`);
                console.log(`[INSTALLER] Copying ${ollamaFile.name} from ${ollamaFile.path} to ${targetPath}`);
                console.log(`[INSTALLER] File size: ${(ollamaFile.size / 1024 / 1024).toFixed(1)}MB`);
                
                try {
                    fs.copyFileSync(ollamaFile.path, targetPath);
                    console.log(`[INSTALLER] Ollama executable copied successfully`);
                    
                    // Also copy the lib directory if it exists
                    const libSourcePath = path.join(extractPath, 'lib');
                    const libTargetPath = path.join(extractPath, 'lib');
                    
                    if (fs.existsSync(libSourcePath) && libSourcePath !== libTargetPath) {
                        console.log(`[INSTALLER] Copying lib directory...`);
                        // The lib directory should already be in the right place, just verify
                        const libFiles = fs.readdirSync(libSourcePath, { recursive: true });
                        console.log(`[INSTALLER] Found ${libFiles.length} library files`);
                    }
                    
                } catch (copyError) {
                    console.error(`[INSTALLER] Error copying file:`, copyError);
                    throw new Error(`Failed to copy ollama executable: ${copyError.message}`);
                }
            } else {
                // List all files for debugging
                console.error(`[INSTALLER] No ollama.exe found. Available files:`);
                allFiles.forEach(file => {
                    console.error(`  - ${file.relativePath} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
                });
                
                // Check if there's any large executable file that might be ollama
                const executableFiles = allFiles.filter(f => 
                    f.name.toLowerCase().endsWith('.exe') && f.size > 10000000 // > 10MB
                );
                
                if (executableFiles.length > 0) {
                    console.log(`[INSTALLER] Found potential executable files:`);
                    executableFiles.forEach(file => {
                        console.log(`  - ${file.relativePath} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
                    });
                    
                    // Use the largest executable as ollama.exe
                    const largestFile = executableFiles.reduce((prev, current) => 
                        (prev.size > current.size) ? prev : current
                    );
                    
                    const targetPath = path.join(extractPath, 'ollama.exe');
                    console.log(`[INSTALLER] Using largest executable as ollama.exe: ${largestFile.relativePath} (${(largestFile.size / 1024 / 1024).toFixed(1)}MB)`);
                    
                    try {
                        fs.copyFileSync(largestFile.path, targetPath);
                        console.log(`[INSTALLER] Executable copied successfully`);
                    } catch (copyError) {
                        throw new Error(`Failed to copy executable: ${copyError.message}`);
                    }
                } else {
                    const fileNames = allFiles.map(f => f.relativePath);
                    throw new Error(`No ollama.exe or suitable executable found. Available files: ${fileNames.slice(0, 10).join(', ')}${fileNames.length > 10 ? '...' : ''}`);
                }
            }
        }
        
        // Final verification
        const finalPath = path.join(extractPath, 'ollama.exe');
        if (!fs.existsSync(finalPath)) {
            throw new Error(`ollama.exe not found at expected location: ${finalPath}`);
        }
        
        // Check file size
        const finalStats = fs.statSync(finalPath);
        console.log(`[INSTALLER] Final ollama.exe size: ${finalStats.size} bytes`);
        
        if (finalStats.size === 0) {
            throw new Error('ollama.exe file is empty');
        }
        
        if (finalStats.size < 1000000) { // Less than 1MB seems too small
            console.warn(`[INSTALLER] Warning: ollama.exe seems small (${finalStats.size} bytes)`);
        }
        
        console.log(`[INSTALLER] Extraction verified successfully: ${finalPath}`);
    }

    /**
     * Set executable permissions (Unix systems)
     */
    async setExecutablePermissions(filePath) {
        if (process.platform !== 'win32') {
            try {
                await execAsync(`chmod +x "${filePath}"`);
            } catch (error) {
                console.warn('Failed to set executable permissions:', error.message);
            }
        }
    }

    /**
     * Download file with retry mechanism and fallback sources
     */
    async downloadFileWithRetry(url, outputPath, onProgress, maxRetries = 3, platform = null) {
        // First, check if we have a local backup file
        const backupPath = path.join(process.cwd(), 'ollama-backup', 'ollama-windows-amd64.zip');
        if (fs.existsSync(backupPath)) {
            try {
                console.log(`[INSTALLER] Found local backup file: ${backupPath}`);
                const stats = fs.statSync(backupPath);
                const fileSizeMB = stats.size / 1024 / 1024;
                
                // Check if file size is reasonable (Ollama should be > 100MB, typically ~1.6GB)
                if (stats.size > 100 * 1024 * 1024) { // At least 100MB
                    console.log(`[INSTALLER] Using local backup file (${fileSizeMB.toFixed(1)}MB)`);
                    
                    if (onProgress) {
                        onProgress({
                            stage: 'downloading',
                            message: `Using local backup file (${fileSizeMB.toFixed(1)}MB)...`,
                            progress: 50,
                            source: { name: 'Local Backup', region: 'local' }
                        });
                    }
                    
                    // Copy file with progress updates
                    fs.copyFileSync(backupPath, outputPath);
                    
                    if (onProgress) {
                        onProgress({
                            stage: 'downloading',
                            message: 'Local backup file ready for installation',
                            progress: 100,
                            downloadProgress: {
                                downloaded: stats.size,
                                total: stats.size,
                                speed: 0,
                                eta: 0,
                                progress: 100
                            },
                            source: { name: 'Local Backup', region: 'local' }
                        });
                    }
                    
                    console.log(`[INSTALLER] Local backup file copied successfully`);
                    return;
                } else {
                    console.log(`[INSTALLER] Local backup file too small (${fileSizeMB.toFixed(1)}MB), ignoring`);
                }
            } catch (error) {
                console.log(`[INSTALLER] Failed to use local backup: ${error.message}`);
            }
        } else {
            console.log(`[INSTALLER] No local backup file found at: ${backupPath}`);
        }

        let lastError;
        let currentUrl = url;
        let fallbackSources = [];
        
        // If platform is provided, get fallback sources
        if (platform && this.downloadSources[platform]) {
            fallbackSources = this.downloadSources[platform].filter(s => !s.isApi && s.url !== url);
        }
        
        const allSources = [{ url: currentUrl, name: 'Primary' }, ...fallbackSources];
        
        for (let sourceIndex = 0; sourceIndex < allSources.length; sourceIndex++) {
            const source = allSources[sourceIndex];
            currentUrl = source.url;
            
            console.log(`[INSTALLER] Trying source ${sourceIndex + 1}/${allSources.length}: ${source.name || 'Unknown'}`);
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[INSTALLER] Download attempt ${attempt}/${maxRetries} from ${source.name || 'source'}`);
                    
                    // Delete partial file if it exists
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                    
                    await this.downloadFile(currentUrl, outputPath, onProgress);
                    console.log(`[INSTALLER] Download successful on attempt ${attempt} from ${source.name || 'source'}`);
                    return; // Success, exit retry loop
                    
                } catch (error) {
                    lastError = error;
                    console.error(`[INSTALLER] Download attempt ${attempt} failed from ${source.name || 'source'}:`, error.message);
                    
                    // If this was a "file too small" error, don't retry with the same source
                    if (error.message.includes('too small') || error.message.includes('error page')) {
                        console.log(`[INSTALLER] Source ${source.name || 'source'} returned invalid file, trying next source...`);
                        break; // Break out of retry loop for this source
                    }
                    
                    if (attempt < maxRetries) {
                        const delay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
                        console.log(`[INSTALLER] Retrying in ${delay/1000} seconds...`);
                        
                        // Update progress to show retry
                        if (onProgress) {
                            onProgress({
                                stage: 'downloading',
                                message: `Download failed, retrying in ${delay/1000}s... (Attempt ${attempt}/${maxRetries})`,
                                progress: 5,
                                error: error.message
                            });
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
            
            // If we have more sources to try, show progress
            if (sourceIndex < allSources.length - 1) {
                if (onProgress) {
                    onProgress({
                        stage: 'downloading',
                        message: `Source failed, trying alternative source...`,
                        progress: 5,
                        error: lastError?.message
                    });
                }
            }
        }
        
        console.error(`[INSTALLER] All sources and attempts failed`);
        
        // Provide helpful error message with manual download instructions
        const manualDownloadError = new Error(`All download sources failed. 

Manual Download Instructions:
1. Open your browser and go to: https://github.com/ollama/ollama/releases/latest
2. Download 'ollama-windows-amd64.zip' manually
3. Place the downloaded file in: ${path.join(process.cwd(), 'ollama-backup')}
4. Rename it to: ollama-windows-amd64.zip
5. Try the installation again

Alternative sources to try manually:
- GitHub: https://github.com/ollama/ollama/releases/download/v0.9.0/ollama-windows-amd64.zip
- Mirror: https://mirror.ghproxy.com/https://github.com/ollama/ollama/releases/download/v0.9.0/ollama-windows-amd64.zip

Network Error: ${lastError?.message || 'Connection timeout'}`);
        
        throw manualDownloadError;
    }

    /**
     * Install Ollama with network optimization
     */
    async installOllama(onProgress, userToken = null) {
        try {
            console.log('[INSTALLER] Starting Ollama installation...');
            const platform = process.platform;
            
            if (!this.downloadSources[platform]) {
                throw new Error(`Unsupported platform: ${platform}`);
            }

            console.log('[INSTALLER] Platform detected:', platform);
            
            if (userToken) {
                console.log('[INSTALLER] Using user-provided GitHub token');
            }
            
            onProgress({
                stage: 'preparing',
                message: 'Preparing installation...',
                progress: 0
            });

            // Create directories
            console.log('[INSTALLER] Creating directories...');
            await this.createDirectories();

            onProgress({
                stage: 'optimizing',
                message: 'Detecting optimal download source...',
                progress: 2
            });

            // Detect optimal download source
            console.log('[INSTALLER] Starting network optimization...');
            const optimalSource = await this.detectOptimalSource(platform, userToken);
            console.log('[INSTALLER] Optimal source selected:', optimalSource);
            
            onProgress({
                stage: 'downloading',
                message: `Downloading from ${optimalSource.name}...`,
                progress: 5,
                source: optimalSource
            });

            // Download file with retry mechanism
            console.log('[INSTALLER] Starting download with retry mechanism...');
            const isZip = optimalSource.url.endsWith('.zip');
            const downloadPath = isZip 
                ? path.join(this.ollamaDir, 'ollama.zip')
                : this.ollamaExecutable;

            console.log('[INSTALLER] Download path:', downloadPath);
            console.log('[INSTALLER] Download URL:', optimalSource.url);

            await this.downloadFileWithRetry(optimalSource.url, downloadPath, (downloadProgress) => {
                if (downloadProgress.stage) {
                    // This is a retry message
                    onProgress(downloadProgress);
                } else {
                    // This is normal download progress - reduced logging
                    onProgress({
                        stage: 'downloading',
                        message: `Downloading from ${optimalSource.name}... ${downloadProgress.progress.toFixed(1)}%`,
                        progress: 5 + (downloadProgress.progress * 0.8), // 5% to 85%
                        downloadProgress,
                        source: optimalSource,
                        isPaused: downloadProgress.isPaused,
                        isCancelled: downloadProgress.isCancelled
                    });
                }
            }, 3, platform);

            console.log('[INSTALLER] Download completed, starting installation...');

            onProgress({
                stage: 'installing',
                message: 'Installing Ollama...',
                progress: 90
            });

            // Extract ZIP if needed
            if (isZip) {
                console.log('[INSTALLER] Extracting ZIP file...');
                const tempDir = path.join(this.ollamaDir, 'temp_extract');
                
                // Extract ZIP to temporary directory
                await this.extractZip(downloadPath, tempDir);
                
                // Find the ollama executable in extracted files
                const findOllamaExecutable = (dir) => {
                    const items = fs.readdirSync(dir, { withFileTypes: true });
                    for (const item of items) {
                        const fullPath = path.join(dir, item.name);
                        if (item.isDirectory()) {
                            const found = findOllamaExecutable(fullPath);
                            if (found) return found;
                        } else if (item.name === 'ollama.exe' || item.name === 'ollama') {
                            return fullPath;
                        }
                    }
                    return null;
                };
                
                const extractedOllama = findOllamaExecutable(tempDir);
                
                if (!extractedOllama) {
                    // List all files for debugging
                    const allFiles = [];
                    const listFiles = (dir) => {
                        const items = fs.readdirSync(dir, { withFileTypes: true });
                        for (const item of items) {
                            const fullPath = path.join(dir, item.name);
                            if (item.isDirectory()) {
                                listFiles(fullPath);
                            } else {
                                allFiles.push(fullPath);
                            }
                        }
                    };
                    listFiles(tempDir);
                    console.error('[INSTALLER] Files found in ZIP:', allFiles);
                    throw new Error('ollama.exe not found in extracted files. Available files: ' + allFiles.map(f => path.basename(f)).join(', '));
                }
                
                // Copy the executable to the final location
                fs.copyFileSync(extractedOllama, this.ollamaExecutable);
                
                // Clean up temporary files
                fs.rmSync(tempDir, { recursive: true, force: true });
                fs.unlinkSync(downloadPath); // Delete the ZIP file
                
                console.log('[INSTALLER] ZIP extraction and cleanup completed');
            }

            // Set executable permissions
            console.log('[INSTALLER] Setting executable permissions...');
            await this.setExecutablePermissions(this.ollamaExecutable);
            console.log('[INSTALLER] Permissions set');

            onProgress({
                stage: 'completed',
                message: 'Ollama installed successfully!',
                progress: 100,
                source: optimalSource
            });

            console.log('[INSTALLER] Installation completed successfully');

            return {
                success: true,
                path: this.ollamaExecutable,
                message: 'Ollama installed successfully',
                source: optimalSource
            };

        } catch (error) {
            console.error('[INSTALLER] Installation error:', error);
            onProgress({
                stage: 'error',
                message: `Installation failed: ${error.message}`,
                progress: 0,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Start local Ollama service with NVIDIA GPU acceleration
     */
    async startLocalOllama() {
        try {
            console.log('[INSTALLER] Starting local Ollama service with NVIDIA GPU acceleration...');
            
            // Verify ollama.exe exists
            if (!fs.existsSync(this.ollamaExecutable)) {
                throw new Error(`Ollama executable not found at: ${this.ollamaExecutable}`);
            }
            
            // Set environment variables for local installation with GPU configuration
            const env = {
                ...process.env,
                // Local installation paths
                OLLAMA_MODELS: this.modelsDir,
                OLLAMA_HOST: '127.0.0.1:12434',
                
                // NVIDIA GPU configuration (CRITICAL)
                CUDA_VISIBLE_DEVICES: '0',
                NVIDIA_VISIBLE_DEVICES: '0',
                CUDA_DEVICE_ORDER: 'PCI_BUS_ID',
                OLLAMA_NUM_GPU: '1',
                OLLAMA_GPU_LAYERS: '-1',  // ALL layers on GPU
                OLLAMA_FORCE_GPU: '1',
                OLLAMA_LLM_LIBRARY: 'cuda',
                OLLAMA_CUDA_VISIBLE_DEVICES: '0',
                OLLAMA_GPU_MEMORY_FRACTION: '0.95',
                OLLAMA_NUM_PARALLEL: '1',
                OLLAMA_MAX_LOADED_MODELS: '1',
                OLLAMA_SKIP_CPU_GENERATE: '1',  // Critical: Skip CPU generation
                NVIDIA_TF32_OVERRIDE: '1',
                
                // Memory management
                OLLAMA_KEEP_ALIVE: '5m',
                OLLAMA_LOAD_TIMEOUT: '5m'
            };
            
            console.log(`[INSTALLER] Starting Ollama with command: "${this.ollamaExecutable}" serve`);
            console.log(`[INSTALLER] Environment: OLLAMA_MODELS=${env.OLLAMA_MODELS}, OLLAMA_HOST=${env.OLLAMA_HOST}`);
            console.log(`[INSTALLER] GPU Configuration: OLLAMA_GPU_LAYERS=${env.OLLAMA_GPU_LAYERS}, OLLAMA_FORCE_GPU=${env.OLLAMA_FORCE_GPU}`);

            // Start Ollama service in background
            const child = exec(`"${this.ollamaExecutable}" serve`, { 
                env,
                detached: true,
                stdio: 'ignore'
            });
            
            // Unref the child process so it can run independently
            child.unref();
            
            console.log(`[INSTALLER] Ollama service started with PID: ${child.pid}`);
            console.log(`[INSTALLER] ⚡ NVIDIA GPU acceleration ENABLED for local installation`);
            
            // Wait for service to start
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            return {
                success: true,
                pid: child.pid,
                message: 'Local Ollama service started with NVIDIA GPU acceleration',
                executable: this.ollamaExecutable,
                modelsDir: this.modelsDir,
                gpu: 'NVIDIA RTX 3060 Ti'
            };
        } catch (error) {
            console.error('[INSTALLER] Failed to start local Ollama:', error);
            throw new Error(`Failed to start local Ollama: ${error.message}`);
        }
    }

    /**
     * Get installation information
     */
    getInstallationInfo() {
        return {
            ollamaDir: this.ollamaDir,
            modelsDir: this.modelsDir,
            executable: this.ollamaExecutable,
            platform: process.platform
        };
    }

    /**
     * Update Ollama to the latest version
     */
    async updateOllama() {
        try {
            console.log('[UPDATE] Starting Ollama update...');
            
            // Check if Ollama is currently installed
            const currentStatus = await this.checkOllamaInstalled();
            if (!currentStatus.installed) {
                return {
                    success: false,
                    error: 'Ollama is not currently installed'
                };
            }
            
            // Get current version if available
            let currentVersion = 'unknown';
            try {
                if (currentStatus.location === 'local' && fs.existsSync(this.ollamaExecutable)) {
                    const versionResult = await execAsync(`"${this.ollamaExecutable}" --version`);
                    currentVersion = versionResult.stdout.trim();
                } else if (currentStatus.location === 'system') {
                    const versionResult = await execAsync('ollama --version');
                    currentVersion = versionResult.stdout.trim();
                }
            } catch (error) {
                console.log('[UPDATE] Could not get current version:', error.message);
            }
            
            console.log('[UPDATE] Current version:', currentVersion);
            
            // Create backup of current installation
            const backupPath = this.ollamaExecutable + '.backup';
            if (fs.existsSync(this.ollamaExecutable)) {
                console.log('[UPDATE] Creating backup of current installation...');
                fs.copyFileSync(this.ollamaExecutable, backupPath);
            }
            
            try {
                // Download and install the latest version
                console.log('[UPDATE] Downloading latest version...');
                const platform = process.platform;
                const optimalSource = await this.detectOptimalSource(platform);
                
                const isZip = optimalSource.url.endsWith('.zip');
                const downloadPath = isZip 
                    ? path.join(this.ollamaDir, 'ollama_update.zip')
                    : this.ollamaExecutable + '.new';
                
                // Download with retry (with throttled logging)
                let lastUpdateLogTime = 0;
                const UPDATE_LOG_INTERVAL = 5000; // Log every 5 seconds
                
                await this.downloadFileWithRetry(optimalSource.url, downloadPath, (progress) => {
                    const now = Date.now();
                    if (now - lastUpdateLogTime > UPDATE_LOG_INTERVAL || 
                        progress.progress === 0 || 
                        progress.progress >= 100) {
                        console.log(`[UPDATE] Download progress: ${progress.progress?.toFixed(1)}%`);
                        lastUpdateLogTime = now;
                    }
                }, 3, process.platform);
                
                // Extract and replace if it's a ZIP
                if (isZip) {
                    console.log('[UPDATE] Extracting update...');
                    const tempDir = this.ollamaDir + '_update_temp';
                    
                    // Create temporary directory
                    if (fs.existsSync(tempDir)) {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    }
                    fs.mkdirSync(tempDir, { recursive: true });
                    
                    // Extract ZIP
                    await this.extractZip(downloadPath, tempDir);
                    
                    // Find the ollama executable in extracted files
                    const findOllamaExecutable = (dir) => {
                        const items = fs.readdirSync(dir, { withFileTypes: true });
                        for (const item of items) {
                            const fullPath = path.join(dir, item.name);
                            if (item.isDirectory()) {
                                const found = findOllamaExecutable(fullPath);
                                if (found) return found;
                            } else if (item.name === 'ollama.exe' || item.name === 'ollama') {
                                return fullPath;
                            }
                        }
                        return null;
                    };
                    
                    const extractedOllama = findOllamaExecutable(tempDir);
                    
                    if (!extractedOllama) {
                        // List all files for debugging
                        const allFiles = [];
                        const listFiles = (dir) => {
                            const items = fs.readdirSync(dir, { withFileTypes: true });
                            for (const item of items) {
                                const fullPath = path.join(dir, item.name);
                                if (item.isDirectory()) {
                                    listFiles(fullPath);
                                } else {
                                    allFiles.push(fullPath);
                                }
                            }
                        };
                        listFiles(tempDir);
                        console.error('[UPDATE] Files found in ZIP:', allFiles);
                        throw new Error('ollama.exe not found in extracted files. Available files: ' + allFiles.map(f => path.basename(f)).join(', '));
                    }
                    
                    // Backup current executable and replace with new one
                    if (fs.existsSync(this.ollamaExecutable)) {
                        fs.unlinkSync(this.ollamaExecutable);
                    }
                    fs.copyFileSync(extractedOllama, this.ollamaExecutable);
                    
                    // Clean up temporary files
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    fs.unlinkSync(downloadPath);
                } else {
                    // Replace the executable directly
                    if (fs.existsSync(this.ollamaExecutable)) {
                        fs.unlinkSync(this.ollamaExecutable);
                    }
                    fs.renameSync(downloadPath, this.ollamaExecutable);
                }
                
                // Set executable permissions
                await this.setExecutablePermissions(this.ollamaExecutable);
                
                // Get new version
                let newVersion = 'latest';
                try {
                    const versionResult = await execAsync(`"${this.ollamaExecutable}" --version`);
                    newVersion = versionResult.stdout.trim();
                } catch (error) {
                    console.log('[UPDATE] Could not get new version:', error.message);
                }
                
                console.log('[UPDATE] Updated from', currentVersion, 'to', newVersion);
                
                // Clean up backup
                if (fs.existsSync(backupPath)) {
                    fs.unlinkSync(backupPath);
                }
                
                console.log('[UPDATE] Ollama updated successfully');
                
                return {
                    success: true,
                    message: 'Ollama updated to latest version with improved GPU support',
                    path: this.ollamaExecutable,
                    source: optimalSource,
                    version: newVersion,
                    previousVersion: currentVersion
                };
                
            } catch (updateError) {
                // Restore backup if update failed
                console.error('[UPDATE] Update failed, restoring backup...');
                if (fs.existsSync(backupPath)) {
                    if (fs.existsSync(this.ollamaExecutable)) {
                        fs.unlinkSync(this.ollamaExecutable);
                    }
                    fs.renameSync(backupPath, this.ollamaExecutable);
                    console.log('[UPDATE] Backup restored successfully');
                }
                throw updateError;
            }
            
        } catch (error) {
            console.error('[UPDATE] Update failed:', error);
            return {
                success: false,
                error: `Update failed: ${error.message}`
            };
        }
    }

    /**
     * Completely uninstall Ollama
     */
    async uninstallOllama() {
        try {
            console.log('[UNINSTALL] Starting Ollama uninstallation...');
            
            // Check if installed
            const currentStatus = await this.checkOllamaInstalled();
            if (!currentStatus.installed) {
                console.log('[UNINSTALL] Ollama is not installed');
                return {
                    success: true,
                    message: 'Ollama was not installed'
                };
            }
            
            // Remove the ollama directory and all contents
            console.log('[UNINSTALL] Removing Ollama directory:', this.ollamaDir);
            
            if (fs.existsSync(this.ollamaDir)) {
                // Remove all files and subdirectories
                const removeRecursive = (dirPath) => {
                    if (fs.existsSync(dirPath)) {
                        const files = fs.readdirSync(dirPath);
                        
                        for (const file of files) {
                            const fullPath = path.join(dirPath, file);
                            const stat = fs.statSync(fullPath);
                            
                            if (stat.isDirectory()) {
                                removeRecursive(fullPath);
                            } else {
                                fs.unlinkSync(fullPath);
                            }
                        }
                        
                        fs.rmdirSync(dirPath);
                    }
                };
                
                removeRecursive(this.ollamaDir);
                console.log('[UNINSTALL] Ollama directory removed successfully');
            }
            
            // If system installation, try to remove it too (Windows)
            if (currentStatus.location === 'system' && process.platform === 'win32') {
                try {
                    console.log('[UNINSTALL] Attempting to remove system installation...');
                    // Try to uninstall via registry or standard uninstall
                    await execAsync('where ollama').then(async (result) => {
                        const ollamaPath = result.stdout.trim();
                        if (ollamaPath) {
                            console.log('[UNINSTALL] Found system Ollama at:', ollamaPath);
                            // Note: We can't automatically uninstall system-wide apps
                            // This would require admin privileges
                        }
                    });
                } catch (systemError) {
                    console.log('[UNINSTALL] System uninstall not available (requires manual action)');
                }
            }
            
            console.log('[UNINSTALL] Uninstallation completed successfully');
            
            return {
                success: true,
                message: 'Ollama uninstalled successfully',
                removedPath: this.ollamaDir,
                systemNote: currentStatus.location === 'system' ? 
                    'System installation may require manual removal' : null
            };
            
        } catch (error) {
            console.error('[UNINSTALL] Uninstallation failed:', error);
            return {
                success: false,
                error: `Uninstallation failed: ${error.message}`
            };
        }
    }

    /**
     * Pause current download
     */
    pauseDownload() {
        if (this.downloadState.isDownloading && !this.downloadState.isPaused) {
            this.downloadState.isPaused = true;
            if (this.downloadState.currentStream) {
                this.downloadState.currentStream.pause();
            }
            console.log('[INSTALLER] Download paused');
            return { success: true, message: 'Download paused' };
        }
        return { success: false, message: 'No active download to pause' };
    }

    /**
     * Resume paused download
     */
    resumeDownload() {
        if (this.downloadState.isDownloading && this.downloadState.isPaused) {
            this.downloadState.isPaused = false;
            if (this.downloadState.currentStream) {
                this.downloadState.currentStream.resume();
            }
            console.log('[INSTALLER] Download resumed');
            return { success: true, message: 'Download resumed' };
        }
        return { success: false, message: 'No paused download to resume' };
    }

    /**
     * Cancel current download
     */
    cancelDownload() {
        if (this.downloadState.isDownloading) {
            this.downloadState.isCancelled = true;
            this.downloadState.isPaused = false;
            
            if (this.downloadState.currentRequest) {
                this.downloadState.currentRequest.destroy();
            }
            if (this.downloadState.currentStream) {
                this.downloadState.currentStream.destroy();
            }
            
            this.resetDownloadState();
            console.log('[INSTALLER] Download cancelled');
            return { success: true, message: 'Download cancelled' };
        }
        return { success: false, message: 'No active download to cancel' };
    }

    /**
     * Get current download status
     */
    getDownloadStatus() {
        return {
            isDownloading: this.downloadState.isDownloading,
            isPaused: this.downloadState.isPaused,
            isCancelled: this.downloadState.isCancelled
        };
    }

    /**
     * Reset download state
     */
    resetDownloadState() {
        this.downloadState = {
            isDownloading: false,
            isPaused: false,
            isCancelled: false,
            currentRequest: null,
            currentStream: null
        };
    }
}

export default new OllamaInstaller();