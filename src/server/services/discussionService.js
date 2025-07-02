import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import ollamaService from './ollamaService.js';
import modelProviderService from './modelProviderService.js';
import { broadcastToClients } from './websocketService.js';

class DiscussionService {
  constructor() {
    this.discussions = new Map(); // Keep in-memory cache for active discussions
    this.activeDiscussions = new Set();
    this.runningModels = new Set(); // Track which models are currently running
    this.debugMode = false; // Disable debug logging to reduce noise
    this.ollamaService = ollamaService; // Initialize ollama service
    
    // Add performance optimization caches
    this.contextCache = new Map(); // Cache prepared contexts
    this.tokenCountCache = new Map(); // Cache token count calculations
    this.similarityCache = new Map(); // Cache similarity calculations
    
    // Storage configuration
    this.storageConfig = {
      baseDir: path.join(process.cwd(), 'discussions-data'),
      discussionsDir: path.join(process.cwd(), 'discussions-data', 'discussions'),
      backupsDir: path.join(process.cwd(), 'discussions-data', 'backups'),
      metadataFile: path.join(process.cwd(), 'discussions-data', 'metadata.json'),
      indexFile: path.join(process.cwd(), 'discussions-data', 'discussions', 'index.json'),
      autoSaveInterval: 30000, // Auto-save every 30 seconds for active discussions
      maxBackups: 10 // Keep last 10 backups
    };
    
    // Performance configuration - optimized for multi-round discussions
    this.config = {
      // Minimal delay between model responses (ms)
      modelDelay: 50, // Reduced from 100ms for faster flow
      // Enable streaming responses for faster feedback
      enableStreaming: true,
      // Maximum context messages to consider for processing - adaptive based on round
      maxContextMessages: 8, // Reduced from 10 for better performance
      // Legacy maximum context length in characters (now superseded by token-aware limits)
      maxContextLength: 2500, // Reduced from 3000
      // Ensure only one model runs at a time (temporarily disabled for debugging)
      singleModelMode: false,
      // Maximum retry attempts per model
      maxRetries: 2,
      // Minimum acceptable response length
      minResponseLength: 20,
      // Token estimation settings - more aggressive for performance
      tokenEstimation: {
        // Average characters per token (varies by language and model) - more conservative
        charsPerToken: 2.8, // Reduced from 3.0 for tighter estimates
        // Average tokens per word (English approximation) - more conservative  
        tokensPerWord: 1.4 // Increased from 1.3 for safety
      },
      // Performance optimization settings
      performance: {
        // Cache settings
        maxCacheSize: 1000, // Maximum number of cached items
        cacheCleanupInterval: 300000, // Clean cache every 5 minutes
        // Context optimization
        adaptiveContextSize: true, // Reduce context size as rounds increase
        contextReductionFactor: 0.8, // Reduce context by 20% every 5 rounds
        maxRoundsBeforeReduction: 5, // Start reducing context after 5 rounds
        // Memory management
        memoryCleanupInterval: 60000, // Clean memory every minute
        maxMemoryUsage: 500 * 1024 * 1024, // 500MB memory limit
        // Broadcasting optimization
        tokenBroadcastThrottle: 10, // Broadcast every 10 tokens instead of every token
        streamingUpdateInterval: 200, // Update UI every 200ms instead of every token
      }
    };

    // Initialize storage and load existing discussions
    this.initializeStorage();
    
    // Start performance optimization tasks
    this.startPerformanceOptimization();
  }

  /**
   * Initialize persistent storage system
   */
  async initializeStorage() {
    try {
      // Ensure directories exist
      await this.ensureDirectoriesExist();
      
      // Load existing discussions from storage
      await this.loadDiscussionsFromStorage();
      
      // Start auto-save interval for active discussions
      this.startAutoSave();
      
      console.log('[STORAGE] Discussion storage system initialized successfully');
    } catch (error) {
      console.error('[STORAGE] Failed to initialize storage system:', error);
      // Continue with in-memory storage as fallback
    }
  }

  /**
   * Ensure all required directories exist
   */
  async ensureDirectoriesExist() {
    const directories = [
      this.storageConfig.baseDir,
      this.storageConfig.discussionsDir,
      this.storageConfig.backupsDir
    ];

    for (const dir of directories) {
      try {
        await fs.access(dir);
      } catch (error) {
        if (error.code === 'ENOENT') {
          await fs.mkdir(dir, { recursive: true });
          console.log(`[STORAGE] Created directory: ${dir}`);
        } else {
          throw error;
        }
      }
    }

    // Initialize metadata file if it doesn't exist
    try {
      await fs.access(this.storageConfig.metadataFile);
    } catch (error) {
      if (error.code === 'ENOENT') {
        const metadata = {
          totalDiscussions: 0,
          lastBackup: null,
          storageVersion: "1.0.0",
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        await fs.writeFile(this.storageConfig.metadataFile, JSON.stringify(metadata, null, 2));
        console.log('[STORAGE] Created metadata file');
      }
    }

    // Initialize index file if it doesn't exist
    try {
      await fs.access(this.storageConfig.indexFile);
    } catch (error) {
      if (error.code === 'ENOENT') {
        const index = {
          discussions: {},
          lastUpdated: new Date().toISOString(),
          version: "1.0.0"
        };
        await fs.writeFile(this.storageConfig.indexFile, JSON.stringify(index, null, 2));
        console.log('[STORAGE] Created index file');
      }
    }
  }

  /**
   * Load existing discussions from storage into memory (only non-completed ones)
   */
  async loadDiscussionsFromStorage() {
    try {
      const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
      const index = JSON.parse(indexData);
      
      let loadedCount = 0;
      let skippedCompleted = 0;
      
      for (const [discussionId, discussionInfo] of Object.entries(index.discussions)) {
        try {
          // Skip completed discussions - they will be loaded on demand
          if (discussionInfo.status === 'completed') {
            skippedCompleted++;
            continue;
          }
          
          const discussion = await this.loadDiscussionFromFile(discussionId);
          if (discussion) {
            this.discussions.set(discussionId, discussion);
            loadedCount++;
            
            // If discussion was running when server stopped, mark it as stopped
            if (discussion.status === 'running' || discussion.status === 'summarizing') {
              discussion.status = 'stopped';
              discussion.updatedAt = new Date();
              await this.saveDiscussionToFile(discussion);
            }
          }
        } catch (error) {
          console.error(`[STORAGE] Failed to load discussion ${discussionId}:`, error);
        }
      }
      
      console.log(`[STORAGE] Loaded ${loadedCount} active discussions from storage, skipped ${skippedCompleted} completed discussions`);
    } catch (error) {
      console.error('[STORAGE] Failed to load discussions from storage:', error);
    }
  }

  /**
   * Load a single discussion from file
   */
  async loadDiscussionFromFile(discussionId) {
    try {
      const filePath = path.join(this.storageConfig.discussionsDir, `${discussionId}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      const discussion = JSON.parse(data);
      
      // Convert date strings back to Date objects
      discussion.createdAt = new Date(discussion.createdAt);
      discussion.updatedAt = new Date(discussion.updatedAt);
      if (discussion.completedAt) {
        discussion.completedAt = new Date(discussion.completedAt);
      }
      
      // Convert message timestamps
      if (discussion.messages && Array.isArray(discussion.messages)) {
        discussion.messages.forEach(msg => {
          msg.timestamp = new Date(msg.timestamp);
        });
      }
      
      // Convert summary timestamp if exists
      if (discussion.summary && discussion.summary.generatedAt) {
        discussion.summary.generatedAt = new Date(discussion.summary.generatedAt);
      }
      
      return discussion;
    } catch (error) {
      console.error(`[STORAGE] Failed to load discussion ${discussionId}:`, error);
      return null;
    }
  }

  /**
   * Save a discussion to file
   */
  async saveDiscussionToFile(discussion) {
    try {
      const filePath = path.join(this.storageConfig.discussionsDir, `${discussion.id}.json`);
      
      // Create a serializable copy
      const discussionData = {
        ...discussion,
        createdAt: discussion.createdAt.toISOString(),
        updatedAt: discussion.updatedAt.toISOString(),
        completedAt: discussion.completedAt ? discussion.completedAt.toISOString() : null,
        messages: discussion.messages.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString()
        })),
        summary: discussion.summary ? {
          ...discussion.summary,
          generatedAt: discussion.summary.generatedAt.toISOString()
        } : null
      };
      
      await fs.writeFile(filePath, JSON.stringify(discussionData, null, 2));
      
      // Update index
      await this.updateDiscussionIndex(discussion);
      
      console.log(`[STORAGE] Saved discussion ${discussion.id} to file`);
    } catch (error) {
      console.error(`[STORAGE] Failed to save discussion ${discussion.id}:`, error);
    }
  }

  /**
   * Update the discussion index
   */
  async updateDiscussionIndex(discussion) {
    try {
      const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
      const index = JSON.parse(indexData);
      
      index.discussions[discussion.id] = {
        topic: discussion.topic,
        status: discussion.status,
        models: discussion.models,
        summaryModel: discussion.summaryModel,
        messageCount: discussion.messages ? discussion.messages.length : 0,
        createdAt: discussion.createdAt.toISOString(),
        updatedAt: discussion.updatedAt.toISOString(),
        completedAt: discussion.completedAt ? discussion.completedAt.toISOString() : null
      };
      
      index.lastUpdated = new Date().toISOString();
      
      await fs.writeFile(this.storageConfig.indexFile, JSON.stringify(index, null, 2));
    } catch (error) {
      console.error('[STORAGE] Failed to update discussion index:', error);
    }
  }

  /**
   * Delete discussion from storage
   */
  async deleteDiscussionFromStorage(discussionId) {
    try {
      // Delete discussion file
      const filePath = path.join(this.storageConfig.discussionsDir, `${discussionId}.json`);
      await fs.unlink(filePath);
      
      // Update index
      const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
      const index = JSON.parse(indexData);
      delete index.discussions[discussionId];
      index.lastUpdated = new Date().toISOString();
      await fs.writeFile(this.storageConfig.indexFile, JSON.stringify(index, null, 2));
      
      console.log(`[STORAGE] Deleted discussion ${discussionId} from storage`);
    } catch (error) {
      console.error(`[STORAGE] Failed to delete discussion ${discussionId}:`, error);
    }
  }

  /**
   * Start auto-save interval for active discussions
   */
  startAutoSave() {
    setInterval(async () => {
      for (const discussionId of this.activeDiscussions) {
        const discussion = this.discussions.get(discussionId);
        if (discussion) {
          await this.saveDiscussionToFile(discussion);
        }
      }
    }, this.storageConfig.autoSaveInterval);
  }

  /**
   * Create backup of all discussions
   */
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(this.storageConfig.backupsDir, `backup-${timestamp}`);
      
      await fs.mkdir(backupDir, { recursive: true });
      
      // Copy all discussion files
      const files = await fs.readdir(this.storageConfig.discussionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sourcePath = path.join(this.storageConfig.discussionsDir, file);
          const destPath = path.join(backupDir, file);
          await fs.copyFile(sourcePath, destPath);
        }
      }
      
      // Update metadata
      const metadataData = await fs.readFile(this.storageConfig.metadataFile, 'utf8');
      const metadata = JSON.parse(metadataData);
      metadata.lastBackup = new Date().toISOString();
      metadata.lastUpdated = new Date().toISOString();
      await fs.writeFile(this.storageConfig.metadataFile, JSON.stringify(metadata, null, 2));
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      console.log(`[STORAGE] Created backup: ${backupDir}`);
      return backupDir;
    } catch (error) {
      console.error('[STORAGE] Failed to create backup:', error);
      throw error;
    }
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups() {
    try {
      const backups = await fs.readdir(this.storageConfig.backupsDir);
      const backupDirs = backups.filter(name => name.startsWith('backup-')).sort().reverse();
      
      if (backupDirs.length > this.storageConfig.maxBackups) {
        const toDelete = backupDirs.slice(this.storageConfig.maxBackups);
        for (const backupDir of toDelete) {
          const backupPath = path.join(this.storageConfig.backupsDir, backupDir);
          await fs.rm(backupPath, { recursive: true, force: true });
          console.log(`[STORAGE] Deleted old backup: ${backupDir}`);
        }
      }
    } catch (error) {
      console.error('[STORAGE] Failed to cleanup old backups:', error);
    }
  }

  /**
   * Create a new discussion
   */
  createDiscussion(config) {
    const discussionId = uuidv4();
    const discussion = {
      id: discussionId,
      topic: config.topic,
      models: config.models,
      summaryModel: config.summaryModel,
      maxRounds: config.maxRounds,
      currentRound: 0,
      currentModelIndex: 0,
      status: 'created',
      messages: [],
      summary: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.discussions.set(discussionId, discussion);
    
    // Save to file immediately
    this.saveDiscussionToFile(discussion).catch(error => {
      console.error('[STORAGE] Failed to save new discussion:', error);
    });
    
    return discussion;
  }

  /**
   * Start a discussion
   */
  async startDiscussion(discussionId) {
    const discussion = this.discussions.get(discussionId);
    if (!discussion) {
      throw new Error('Discussion not found');
    }

    if (this.activeDiscussions.has(discussionId)) {
      throw new Error('Discussion is already running');
    }

    discussion.status = 'running';
    discussion.updatedAt = new Date();
    this.activeDiscussions.add(discussionId);

    // Add initial system message
    const initialMessage = {
      id: uuidv4(),
      role: 'system',
      content: `Discussion Topic: ${discussion.topic}\n\nParticipating models: ${discussion.models.join(', ')}\nSummary will be provided by: ${discussion.summaryModel}\n\nLet's begin the discussion!`,
      timestamp: new Date(),
      modelName: 'system'
    };

    discussion.messages.push(initialMessage);

    // Save to file immediately (but don't wait for it to complete)
    this.saveDiscussionToFile(discussion).catch(error => {
      console.error('[STORAGE] Failed to save discussion during start:', error);
    });

    // Broadcast initial message
    this.broadcastDiscussionUpdate(discussionId, {
      type: 'discussion_started',
      discussion: this.getDiscussionSummary(discussion)
    });

    // Start the discussion loop immediately without waiting
    setImmediate(() => this.runDiscussionLoop(discussionId));

    return discussion;
  }

  /**
   * Run the main discussion loop
   */
  async runDiscussionLoop(discussionId) {
    const discussion = this.discussions.get(discussionId);
    if (!discussion) return;

    try {
      while (discussion.currentRound < discussion.maxRounds && 
             discussion.status === 'running' && 
             this.activeDiscussions.has(discussionId)) {
        
        console.log(`[DISCUSSION] Loop iteration - Round: ${discussion.currentRound}/${discussion.maxRounds}, Status: ${discussion.status}, Active: ${this.activeDiscussions.has(discussionId)}, Model Index: ${discussion.currentModelIndex}`);
        
        const currentModel = discussion.models[discussion.currentModelIndex];
        
        // Ensure only one model runs at a time
        if (this.config.singleModelMode) {
          // Wait for any other models to finish with timeout
          let waitCount = 0;
          const maxWaitTime = 60; // Maximum 30 seconds wait
          
          while (this.runningModels.size > 0 && waitCount < maxWaitTime) {
            console.log(`[DISCUSSION] Waiting for running models: ${Array.from(this.runningModels).join(', ')} (${waitCount}/${maxWaitTime})`);
            await new Promise(resolve => setTimeout(resolve, 500));
            waitCount++;
          }
          
          // If we've waited too long, force clear the running models
          if (waitCount >= maxWaitTime) {
            console.warn(`[DISCUSSION] Force clearing stuck running models: ${Array.from(this.runningModels).join(', ')}`);
            this.runningModels.clear();
          }
          
          // Mark this model as running
          this.runningModels.add(currentModel);
          console.log(`[DISCUSSION] ${currentModel} marked as running. Total running: ${this.runningModels.size}`);
        }
        
        // Prepare context for the current model
        const context = this.prepareModelContext(discussion, currentModel);
        
        // Broadcast that model is thinking
        this.broadcastDiscussionUpdate(discussionId, {
          type: 'model_thinking',
          modelName: currentModel,
          round: discussion.currentRound + 1,
          runningModels: Array.from(this.runningModels)
        });

        // Get response from current model with streaming for faster response
        const messageId = uuidv4();
        const message = {
          id: messageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          modelName: currentModel,
          round: discussion.currentRound + 1
        };

        // Add placeholder message immediately
        discussion.messages.push(message);
        discussion.updatedAt = new Date();

        // Save to file after adding message (but don't wait for it to complete)
        this.saveDiscussionToFile(discussion).catch(error => {
          console.error('[STORAGE] Failed to save discussion during message creation:', error);
        });

        // Broadcast that response is starting
        this.broadcastDiscussionUpdate(discussionId, {
          type: 'message_started',
          message: {
            ...message,
            discussionId: discussionId
          },
          discussion: this.getDiscussionSummary(discussion)
        });

        try {
          console.log(`[DISCUSSION] ${currentModel} starting response for round ${discussion.currentRound + 1}`);
          
          // Use enhanced retry mechanism
          const result = await this.getModelResponseWithRetry(currentModel, context, message, discussionId);
          
          message.content = result.content;
          const tokenCount = result.tokenCount;
          
          if (result.success) {
            console.log(`[DISCUSSION] ${currentModel} completed successfully (${tokenCount} tokens): "${result.content.substring(0, 100)}..."`);
          } else {
            console.log(`[DISCUSSION] ${currentModel} failed after all retries`);
          }
          
          // Final update with complete message
          this.broadcastDiscussionUpdate(discussionId, {
            type: 'message_complete',
            message: message,
            tokenCount: tokenCount,
            discussion: this.getDiscussionSummary(discussion)
          });

        } catch (error) {
          console.error(`[DISCUSSION] Unexpected error for ${currentModel}:`, error);
          message.content = `[Error: ${currentModel} encountered an unexpected error - ${error.message}]`;
          
          this.broadcastDiscussionUpdate(discussionId, {
            type: 'message_complete',
            message: message,
            tokenCount: 0,
            discussion: this.getDiscussionSummary(discussion)
          });
        } finally {
          // Always remove model from running set
          if (this.config.singleModelMode) {
            const wasRunning = this.runningModels.has(currentModel);
            this.runningModels.delete(currentModel);
            console.log(`[DISCUSSION] ${currentModel} finished (was running: ${wasRunning}), remaining running models: ${Array.from(this.runningModels).join(', ') || 'none'}`);
            
            // Double-check: if this was the only model and it's still in the set, force remove it
            if (wasRunning && this.runningModels.has(currentModel)) {
              console.warn(`[DISCUSSION] Force removing stuck model: ${currentModel}`);
              this.runningModels.delete(currentModel);
            }
          }
        }

        // Move to next model
        const previousModelIndex = discussion.currentModelIndex;
        const previousModel = discussion.models[previousModelIndex];
        discussion.currentModelIndex = (discussion.currentModelIndex + 1) % discussion.models.length;
        const nextModel = discussion.models[discussion.currentModelIndex];
        
        console.log(`[DISCUSSION] Model transition: ${previousModel} (index ${previousModelIndex}) -> ${nextModel} (index ${discussion.currentModelIndex})`);
        
        // If we've completed a full round
        if (discussion.currentModelIndex === 0) {
          discussion.currentRound++;
          console.log(`[DISCUSSION] Round completed: ${discussion.currentRound - 1} -> ${discussion.currentRound} (max: ${discussion.maxRounds})`);
          
          this.broadcastDiscussionUpdate(discussionId, {
            type: 'round_completed',
            round: discussion.currentRound,
            totalRounds: discussion.maxRounds
          });
        }

        // Use configurable delay for optimal performance
        console.log(`[DISCUSSION] Waiting ${this.config.modelDelay}ms before next model...`);
        await new Promise(resolve => setTimeout(resolve, this.config.modelDelay));
      }

      // Generate summary
      await this.generateSummary(discussionId);

    } catch (error) {
      console.error(`Error in discussion ${discussionId}:`, error);
      discussion.status = 'error';
      discussion.error = error.message;
      discussion.updatedAt = new Date();
      this.activeDiscussions.delete(discussionId);
      
      // Save error state to file
      await this.saveDiscussionToFile(discussion);
      
      // Clean up any stuck running models
      if (this.config.singleModelMode) {
        const stuckModels = Array.from(this.runningModels);
        if (stuckModels.length > 0) {
          console.warn(`[DISCUSSION] Cleaning up stuck models after error: ${stuckModels.join(', ')}`);
          this.runningModels.clear();
        }
      }
      
      this.broadcastDiscussionUpdate(discussionId, {
        type: 'discussion_error',
        error: error.message
      });
    }
  }

  /**
   * Prepare context for a model based on discussion history with optimized token limits and caching
   */
  prepareModelContext(discussion, currentModel) {
    // Create cache key for context
    const cacheKey = `${discussion.id}-${currentModel}-${discussion.currentRound}-${discussion.messages ? discussion.messages.length : 0}`;
    
    // Check cache first
    if (this.contextCache.has(cacheKey)) {
      const cached = this.contextCache.get(cacheKey);
      console.log(`[PERFORMANCE] Using cached context for ${currentModel}`);
      return cached;
    }
    
    const limits = this.getModelTokenLimits(currentModel);
    
    // Adaptive context size based on round number
    let adaptiveMaxContextTokens = limits.maxContextTokens;
    let adaptiveMaxMessages = this.config.maxContextMessages;
    
    if (this.config.performance.adaptiveContextSize && discussion.currentRound >= this.config.performance.maxRoundsBeforeReduction) {
      const reductionRounds = Math.floor((discussion.currentRound - this.config.performance.maxRoundsBeforeReduction) / 5);
      const reductionFactor = Math.pow(this.config.performance.contextReductionFactor, reductionRounds);
      
      adaptiveMaxContextTokens = Math.floor(limits.maxContextTokens * reductionFactor);
      adaptiveMaxMessages = Math.max(3, Math.floor(this.config.maxContextMessages * reductionFactor));
      
      console.log(`[PERFORMANCE] Adaptive context for round ${discussion.currentRound}: ${adaptiveMaxContextTokens} tokens, ${adaptiveMaxMessages} messages`);
    }

    // Enhanced system message for collaborative discussion
    const otherModels = discussion.models.filter(m => m !== currentModel);
    const discussionPhase = this.getDiscussionPhase(discussion);
    const isFirstRound = discussion.currentRound === 0;
    
    const systemMessage = {
      role: 'system',
      content: isFirstRound ? 
        `You are participating in a multi-round discussion about "${discussion.topic}". 

This is Round 1 (Initial Viewpoints) of ${discussion.maxRounds} total rounds.

Your role in this first round: Share your initial perspective and thoughts on the topic. Present your viewpoint clearly and comprehensively, as this will form the foundation for the collaborative discussion in subsequent rounds.

Other participants: ${otherModels.join(', ')} will also share their initial viewpoints.

Guidelines for this round:
- ${discussionPhase.guidelines}
- Present your thoughts clearly and thoroughly
- Explain your reasoning and key considerations
- Don't worry about referencing others yet - focus on your own perspective
- Be substantive but concise in your initial viewpoint` :
        
        `You are participating in a collaborative discussion about "${discussion.topic}". 

Your role: Engage in true discussion by building upon, challenging, or synthesizing the ideas presented by other participants (${otherModels.join(', ')}). This is not about expressing individual viewpoints, but about working together to reach meaningful conclusions.

Discussion Phase: ${discussionPhase.description}
Round ${discussion.currentRound + 1} of ${discussion.maxRounds}

Guidelines:
- ${discussionPhase.guidelines}
- Reference and build upon specific points made by others
- Challenge ideas constructively when you disagree
- Propose synthesis or compromise when appropriate
- Focus on reaching actionable conclusions, not just sharing opinions
- Be concise but substantive in your contributions`
    };

    // Get all valid discussion messages with optimized filtering
    const allMessages = this.getValidMessages(discussion);
    
    // Use more aggressive message selection for later rounds
    const maxMessagesToConsider = Math.min(allMessages.length, adaptiveMaxMessages * 2);
    const recentMessages = allMessages.slice(-maxMessagesToConsider);
    
    // Remove duplicate messages with caching
    const uniqueMessages = this.removeDuplicateMessagesOptimized(recentMessages);
    
    // Calculate token usage for context optimization
    let currentTokenCount = this.estimateTokenCountCached(systemMessage.content);
    const maxContextTokens = adaptiveMaxContextTokens;
    const maxMessageTokens = limits.maxMessageTokens;
    
    const selectedMessages = [];
    let totalContentLength = 0;

    if (uniqueMessages.length > 0) {
      // Process messages from most recent to oldest, staying within limits
      for (let i = uniqueMessages.length - 1; i >= 0; i--) {
        const msg = uniqueMessages[i];
        
        // Truncate message content if it exceeds maxMessageTokens
        let messageContent = msg.content;
        const estimatedMessageTokens = this.estimateTokenCountCached(messageContent);
        
        if (estimatedMessageTokens > maxMessageTokens) {
          // Calculate character limit based on token limit (approximate)
          const charLimit = Math.floor(maxMessageTokens * 2.8); // Use updated chars per token
          messageContent = this.truncateMessage(messageContent, charLimit);
        }
        
        // Enhanced message formatting for collaborative discussion
        const formattedMessage = `${msg.modelName} contributed: ${messageContent}`;
        const messageTokens = this.estimateTokenCountCached(formattedMessage);
        
        // Check if adding this message would exceed context limit
        const userPromptEstimate = 200; // Increased for more detailed prompt
        if (currentTokenCount + messageTokens + userPromptEstimate > maxContextTokens) {
          console.log(`[DISCUSSION] Context limit reached for ${currentModel}. Including ${selectedMessages.length} of ${uniqueMessages.length} messages`);
          break;
        }
        
        selectedMessages.unshift(formattedMessage);
        currentTokenCount += messageTokens;
        totalContentLength += messageContent.length;
      }

      if (selectedMessages.length > 0) {
        // Create collaborative discussion prompt
        const historyContent = selectedMessages.join('\n\n');
        const discussionPrompt = this.generateDiscussionPrompt(discussion, discussionPhase, historyContent);
        
        const userPrompt = {
          role: 'user',
          content: discussionPrompt
        };
        
        const userPromptTokens = this.estimateTokenCountCached(userPrompt.content);
        if (currentTokenCount + userPromptTokens <= maxContextTokens) {
          const context = [systemMessage, userPrompt];
          
          // Cache the result
          this.contextCache.set(cacheKey, context);
          
          console.log(`[DISCUSSION] Optimized context for ${currentModel}: ${selectedMessages.length}/${uniqueMessages.length} messages, ${currentTokenCount}/${maxContextTokens} tokens (${((currentTokenCount / maxContextTokens) * 100).toFixed(1)}%)`);
          
          return context;
        }
      }
    }

    // Fallback context with phase-appropriate prompt
    const fallbackPrompt = {
      role: 'user',
      content: `Round ${discussion.currentRound + 1} discussion about "${discussion.topic}". 

${discussionPhase.description}

${discussionPhase.fallbackPrompt}`
    };

    const fallbackContext = [systemMessage, fallbackPrompt];
    this.contextCache.set(cacheKey, fallbackContext);
    
    console.log(`[DISCUSSION] Using fallback context for ${currentModel}`);
    return fallbackContext;
  }

  /**
   * Determine the current phase of discussion based on round progress
   */
  getDiscussionPhase(discussion) {
    const currentRound = discussion.currentRound;
    const maxRounds = discussion.maxRounds;
    
    // First round: Initial viewpoints
    if (currentRound === 0) {
      return {
        name: 'initial',
        description: 'Initial Viewpoints - Each participant shares their perspective',
        guidelines: 'Share your initial thoughts and perspective on the topic clearly and comprehensively',
        fallbackPrompt: 'Share your initial perspective and thoughts on this topic. What is your viewpoint and reasoning?'
      };
    }
    
    // Calculate progress for remaining rounds (excluding first round)
    const discussionProgress = (currentRound - 1) / (maxRounds - 1);
    
    if (discussionProgress < 0.4) {
      return {
        name: 'exploration',
        description: 'Exploration Phase - Building upon initial viewpoints and exploring deeper',
        guidelines: 'Build upon the initial viewpoints shared, explore different angles, and identify key considerations for discussion',
        fallbackPrompt: 'Based on the initial viewpoints shared, what aspects deserve deeper exploration? Build upon or challenge the points already raised.'
      };
    } else if (discussionProgress < 0.7) {
      return {
        name: 'analysis',
        description: 'Analysis Phase - Deep dive into specific points and trade-offs',
        guidelines: 'Analyze the points raised by others, identify trade-offs, explore implications, and engage in constructive debate',
        fallbackPrompt: 'Analyze the key considerations that have been raised. What are the trade-offs and implications we should consider?'
      };
    } else if (discussionProgress < 0.9) {
      return {
        name: 'synthesis',
        description: 'Synthesis Phase - Finding common ground and building consensus',
        guidelines: 'Look for common ground, propose compromises, synthesize different viewpoints, and work toward consensus',
        fallbackPrompt: 'Work toward finding common ground and building consensus. What points can we agree on, and where might compromise be possible?'
      };
    } else {
      return {
        name: 'conclusion',
        description: 'Conclusion Phase - Finalizing decisions and actionable outcomes',
        guidelines: 'Focus on reaching final conclusions, summarizing agreements, and identifying actionable next steps',
        fallbackPrompt: 'Help finalize the conclusions of this discussion. What are the key decisions and actionable outcomes we can agree upon?'
      };
    }
  }

  /**
   * Generate phase-appropriate discussion prompt
   */
  generateDiscussionPrompt(discussion, phase, historyContent) {
    const isFirstRound = discussion.currentRound === 0;
    
    // First round: Simple initial viewpoint prompt
    if (isFirstRound) {
      return `Please share your initial perspective on "${discussion.topic}". What are your thoughts, viewpoint, and key considerations on this topic?`;
    }
    
    // Subsequent rounds: Collaborative discussion prompts
    const basePrompt = `Discussion history for "${discussion.topic}":\n\n${historyContent}\n\n`;
    
    switch (phase.name) {
      case 'exploration':
        return basePrompt + `Based on the initial viewpoints shared, what aspects deserve deeper exploration? Build upon or challenge the points already raised. What key considerations should we focus on?`;
        
      case 'analysis':
        return basePrompt + `Looking at the points raised so far, what are your thoughts on the trade-offs and implications? Do you agree with the analysis presented, or do you see it differently? Engage constructively with the ideas presented.`;
        
      case 'synthesis':
        return basePrompt + `Based on our discussion, where do you see opportunities for common ground or compromise? How can we synthesize the different viewpoints into a coherent position? What can we agree upon?`;
        
      case 'conclusion':
        return basePrompt + `As we conclude this discussion, what specific conclusions and actionable outcomes do you propose? Help us finalize the key decisions and next steps based on our collaborative discussion.`;
        
      default:
        return basePrompt + `Continue the discussion by building upon the points raised. What are your thoughts, and how do they relate to what others have contributed?`;
    }
  }

  /**
   * Get valid messages with optimized filtering
   */
  getValidMessages(discussion) {
    return discussion.messages
      .filter(msg => 
        msg.role !== 'system' && 
        msg.content && 
        msg.content.trim().length > 0 &&
        !msg.content.includes('[Error:') &&
        !msg.content.includes('<think>')
      )
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Remove duplicate messages with caching for better performance
   */
  removeDuplicateMessagesOptimized(messages) {
    const uniqueMessages = [];
    const seenContent = new Set();

    for (const msg of messages) {
      // Create a simplified version for comparison
      const simplified = msg.content
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Use cache for similarity calculations
      const cacheKey = `similarity-${simplified.substring(0, 50)}`;
      let isDuplicate = false;
      
      if (this.similarityCache.has(cacheKey)) {
        isDuplicate = this.similarityCache.get(cacheKey);
      } else {
        // Check if we've seen very similar content
        for (const seen of seenContent) {
          if (this.calculateSimilarityOptimized(simplified, seen) > 0.8) {
            isDuplicate = true;
            break;
          }
        }
        this.similarityCache.set(cacheKey, isDuplicate);
      }

      if (!isDuplicate) {
        uniqueMessages.push(msg);
        seenContent.add(simplified);
      }
    }

    return uniqueMessages;
  }

  /**
   * Optimized similarity calculation with early termination
   */
  calculateSimilarityOptimized(str1, str2) {
    // Quick length check for early termination
    const lengthDiff = Math.abs(str1.length - str2.length);
    if (lengthDiff > Math.max(str1.length, str2.length) * 0.5) {
      return 0; // Too different in length
    }
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    // Use a more efficient algorithm for similarity
    const editDistance = this.levenshteinDistanceOptimized(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Optimized Levenshtein distance with early termination
   */
  levenshteinDistanceOptimized(str1, str2) {
    // Early termination for very different strings
    if (Math.abs(str1.length - str2.length) > Math.min(str1.length, str2.length)) {
      return Math.max(str1.length, str2.length);
    }
    
    const matrix = [];
    const maxDistance = Math.max(str1.length, str2.length) * 0.5;
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
        
        // Early termination if distance is too high
        if (matrix[i][j] > maxDistance) {
          return maxDistance;
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Truncate message to specified length
   */
  truncateMessage(content, maxLength) {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * Check if content is repetitive or low quality
   */
  isRepetitiveContent(content) {
    if (!content || content.length < 50) return true;
    
    // Check for excessive repetition of words or phrases
    const words = content.toLowerCase().split(/\s+/);
    const wordCount = {};
    
    for (const word of words) {
      if (word.length > 3) { // Only count meaningful words
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    }
    
    // Check if any word appears too frequently
    const totalWords = words.length;
    for (const [word, count] of Object.entries(wordCount)) {
      if (count / totalWords > 0.15) { // More than 15% repetition
        console.log(`[DISCUSSION] Detected repetitive word: "${word}" (${count}/${totalWords})`);
        return true;
      }
    }
    
    // Check for repeated phrases
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 1) {
      for (let i = 0; i < sentences.length - 1; i++) {
        for (let j = i + 1; j < sentences.length; j++) {
          if (this.calculateSimilarity(sentences[i].trim(), sentences[j].trim()) > 0.8) {
            console.log(`[DISCUSSION] Detected repetitive sentences`);
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Enhanced model response with retry, validation and optimized broadcasting
   */
  async getModelResponseWithRetry(currentModel, context, message, discussionId) {
    const maxRetries = this.config.maxRetries;
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`[DISCUSSION] Retry attempt ${retryCount} for ${currentModel}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Reduced delay
        }

        let fullContent = '';
        let tokenCount = 0;
        let hasReceivedContent = false;
        let streamingSuccessful = false;
        let lastBroadcastTime = 0;
        let tokensSinceLastBroadcast = 0;

        // Try streaming first with optimized broadcasting using multi-provider service
        try {
          // Parse model name to determine provider and model
          const { providerId, modelName } = this.parseModelName(currentModel);
          
          await modelProviderService.generateResponseStream(providerId, modelName, context, (chunk) => {
            // Handle different chunk formats from different providers
            const newContent = chunk.content || (chunk.message && chunk.message.content);
            if (newContent) {
              fullContent += newContent;
              tokenCount++;
              hasReceivedContent = true;
              tokensSinceLastBroadcast++;
              
              const now = Date.now();
              const shouldBroadcast = 
                tokensSinceLastBroadcast >= this.config.performance.tokenBroadcastThrottle ||
                (now - lastBroadcastTime) >= this.config.performance.streamingUpdateInterval ||
                chunk.done;
              
              if (shouldBroadcast) {
                // Emit real-time updates with throttling
                this.broadcastDiscussionUpdate(discussionId, {
                  type: 'message_token',
                  messageId: message.id,
                  token: newContent,
                  fullContent: fullContent,
                  tokenCount: tokenCount,
                  modelName: currentModel
                });
                
                // Periodic full updates for UI consistency
                this.broadcastDiscussionUpdate(discussionId, {
                  type: 'message_streaming',
                  messageId: message.id,
                  content: fullContent,
                  modelName: currentModel,
                  isComplete: chunk.done || false
                });
                
                lastBroadcastTime = now;
                tokensSinceLastBroadcast = 0;
              }
            }
          });
          
          streamingSuccessful = true;
        } catch (streamError) {
          console.warn(`[DISCUSSION] Streaming attempt ${retryCount + 1} failed for ${currentModel}:`, streamError.message);
          streamingSuccessful = false;
        }

        // Check streaming success and content quality
        if (!streamingSuccessful || !hasReceivedContent || fullContent.trim().length < this.config.minResponseLength) {
          console.log(`[DISCUSSION] ${currentModel} streaming unsuccessful, trying fallback...`);
          
          // Fallback to regular chat with potentially shorter context
          let fallbackContext = context;
          if (retryCount > 0 && context[1]?.content?.length > 1500) { // Reduced threshold
            // Use shorter context for retries
            fallbackContext = [
              context[0], // Keep system message
              {
                role: 'user',
                content: `Round ${context[0].content.match(/round (\d+)/i)?.[1] || '1'} discussion. Provide your perspective concisely.`
              }
            ];
          }
          
          // Parse model name to determine provider and model
          const { providerId: fallbackProviderId, modelName: fallbackModelName } = this.parseModelName(currentModel);
          
          const response = await modelProviderService.generateResponse(fallbackProviderId, fallbackModelName, fallbackContext);
          
          if (response && response.message && response.message.content) {
            fullContent = response.message.content;
            tokenCount = fullContent.split(/\s+/).length;
            console.log(`[DISCUSSION] ${currentModel} fallback successful (${tokenCount} tokens)`);
          } else {
            throw new Error('No content in fallback response');
          }
        }

        // Validate content quality
        if (fullContent.trim().length < this.config.minResponseLength) {
          throw new Error(`Response too short (${fullContent.trim().length} < ${this.config.minResponseLength} chars)`);
        }

        if (this.isRepetitiveContentOptimized(fullContent)) {
          if (retryCount < maxRetries) {
            console.log(`[DISCUSSION] Detected repetitive content from ${currentModel}, retrying...`);
            retryCount++;
            continue;
          } else {
            console.log(`[DISCUSSION] ${currentModel} still producing repetitive content after retries, accepting it`);
          }
        }

        // Success - return the response
        return {
          content: fullContent.trim(),
          tokenCount: tokenCount,
          success: true
        };

      } catch (error) {
        console.error(`[DISCUSSION] Attempt ${retryCount + 1} failed for ${currentModel}:`, error.message);
        
        if (retryCount === maxRetries) {
          return {
            content: `[Error: ${currentModel} failed to respond after ${maxRetries + 1} attempts - ${error.message}]`,
            tokenCount: 0,
            success: false
          };
        }
        
        retryCount++;
      }
    }
  }

  /**
   * Optimized repetitive content detection
   */
  isRepetitiveContentOptimized(content) {
    if (!content || content.length < 50) return true;
    
    // Use cached result if available
    const cacheKey = `repetitive-${content.substring(0, 100)}`;
    if (this.similarityCache.has(cacheKey)) {
      return this.similarityCache.get(cacheKey);
    }
    
    // Quick word frequency check
    const words = content.toLowerCase().split(/\s+/);
    const wordCount = {};
    let maxFrequency = 0;
    
    for (const word of words) {
      if (word.length > 3) {
        wordCount[word] = (wordCount[word] || 0) + 1;
        maxFrequency = Math.max(maxFrequency, wordCount[word]);
      }
    }
    
    const isRepetitive = maxFrequency / words.length > 0.15;
    this.similarityCache.set(cacheKey, isRepetitive);
    
    return isRepetitive;
  }

  /**
   * Get model-specific token limits for summary generation
   */
  getModelTokenLimits(modelName) {
    // Default limits (conservative estimates for unknown models)
    const defaultLimits = {
      maxInputTokens: 8000,
      maxContextTokens: 6000,
      maxMessageTokens: 400
    };

    // Model-specific token limits based on architecture and capabilities
    const modelLimits = {
      // Llama models
      'llama3.3:70b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 800 },
      'llama3.2:3b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 500 },
      'llama3.2:1b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 400 },
      'llama3.1:8b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 600 },
      'llama3.1:70b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 800 },
      'llama3:8b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 500 },
      'llama3:70b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 600 },
      'llama2:7b': { maxInputTokens: 3500, maxContextTokens: 3000, maxMessageTokens: 400 },
      'llama2:13b': { maxInputTokens: 3500, maxContextTokens: 3000, maxMessageTokens: 450 },
      'llama2:70b': { maxInputTokens: 3500, maxContextTokens: 3000, maxMessageTokens: 500 },
      
      // Qwen models
      'qwen3:0.6b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 400 },
      'qwen3:1.7b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 450 },
      'qwen3:4b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 500 },
      'qwen3:8b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 600 },
      'qwen3:14b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 650 },
      'qwen3:30b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 700 },
      'qwen3:32b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 700 },
      'qwen2.5:0.5b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 400 },
      'qwen2.5:1.5b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 450 },
      'qwen2.5:3b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 500 },
      'qwen2.5:7b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 600 },
      'qwen2.5:14b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 650 },
      'qwen2.5:32b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 700 },
      'qwen2.5:72b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 800 },
      'qwen2:0.5b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 400 },
      'qwen2:1.5b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 450 },
      'qwen2:7b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 600 },
      'qwen2:72b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 800 },
      'qwq:32b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 700 },
      
      // Gemma models
      'gemma3:1b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 400 },
      'gemma3:4b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 500 },
      'gemma3:12b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 650 },
      'gemma3:27b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 700 },
      'gemma2:2b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 400 },
      'gemma2:9b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 550 },
      'gemma2:27b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 650 },
      'gemma:2b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 400 },
      'gemma:7b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 550 },
      
      // Mistral models
      'mistral:7b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 600 },
      'mistral-nemo:12b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 650 },
      'mistral-small3.1:24b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 700 },
      'mistral-small:22b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 700 },
      'mistral-small:24b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 700 },
      'mistral-large:123b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 800 },
      'mistrallite:7b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 600 },
      'mixtral:8x7b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 700 },
      'mixtral:8x22b': { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 800 },
      
      // DeepSeek models
      'deepseek-r1:1.5b': { maxInputTokens: 60000, maxContextTokens: 50000, maxMessageTokens: 400 },
      'deepseek-r1:7b': { maxInputTokens: 60000, maxContextTokens: 50000, maxMessageTokens: 600 },
      'deepseek-r1:8b': { maxInputTokens: 60000, maxContextTokens: 50000, maxMessageTokens: 600 },
      'deepseek-r1:14b': { maxInputTokens: 60000, maxContextTokens: 50000, maxMessageTokens: 650 },
      'deepseek-r1:32b': { maxInputTokens: 60000, maxContextTokens: 50000, maxMessageTokens: 700 },
      'deepseek-r1:70b': { maxInputTokens: 60000, maxContextTokens: 50000, maxMessageTokens: 800 },
      'deepseek-r1:671b': { maxInputTokens: 60000, maxContextTokens: 50000, maxMessageTokens: 900 },
      'deepseek-v3:671b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 900 },
      'deepseek-v2:16b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 650 },
      'deepseek-v2:236b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 800 },
      'deepseek-coder-v2:16b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 650 },
      'deepseek-coder-v2:236b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 800 },
      'deepseek-coder:1.3b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 400 },
      'deepseek-coder:6.7b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 550 },
      'deepseek-coder:33b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 700 },
      
      // Phi models
      'phi4:14b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 650 },
      'phi4-mini:3.8b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 500 },
      'phi3:3.8b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 500 },
      'phi3:14b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 650 },
      'phi3.5:3.8b': { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 500 },
      'phi:2.7b': { maxInputTokens: 2000, maxContextTokens: 1800, maxMessageTokens: 400 },
      
      // Code-specific models
      'codellama:7b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 600 },
      'codellama:13b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 650 },
      'codellama:34b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 700 },
      'codellama:70b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 800 },
      'starcoder2:3b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 500 },
      'starcoder2:7b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 600 },
      'starcoder2:15b': { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 650 },
      'codegemma:2b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 400 },
      'codegemma:7b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 600 },
      
      // Other models
      'tinyllama:1.1b': { maxInputTokens: 2000, maxContextTokens: 1800, maxMessageTokens: 400 },
      'smollm2:135m': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 300 },
      'smollm2:360m': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 350 },
      'smollm2:1.7b': { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 400 },
      'yi:6b': { maxInputTokens: 3500, maxContextTokens: 3000, maxMessageTokens: 500 },
      'yi:9b': { maxInputTokens: 3500, maxContextTokens: 3000, maxMessageTokens: 550 },
      'yi:34b': { maxInputTokens: 3500, maxContextTokens: 3000, maxMessageTokens: 650 }
    };

    // Find exact match or best fuzzy match
    let limits = modelLimits[modelName];
    
    if (!limits) {
      // Try fuzzy matching for model names without size specification
      const baseModelName = modelName.split(':')[0];
      const availableModels = Object.keys(modelLimits);
      const fuzzyMatch = availableModels.find(model => model.startsWith(baseModelName + ':'));
      
      if (fuzzyMatch) {
        limits = modelLimits[fuzzyMatch];
        console.log(`[DISCUSSION] Using fuzzy match for ${modelName}: ${fuzzyMatch}`);
      } else {
        // Try to infer from model family patterns
        if (baseModelName.includes('llama3.3') || baseModelName.includes('llama3.1')) {
          limits = { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 700 };
        } else if (baseModelName.includes('llama3.2') || baseModelName.includes('llama3')) {
          limits = { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 600 };
        } else if (baseModelName.includes('qwen2.5')) {
          limits = { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 600 };
        } else if (baseModelName.includes('qwen3') || baseModelName.includes('qwen2')) {
          limits = { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 600 };
        } else if (baseModelName.includes('gemma3')) {
          limits = { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 600 };
        } else if (baseModelName.includes('gemma2') || baseModelName.includes('gemma')) {
          limits = { maxInputTokens: 6000, maxContextTokens: 5000, maxMessageTokens: 500 };
        } else if (baseModelName.includes('mistral') && baseModelName.includes('nemo')) {
          limits = { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 650 };
        } else if (baseModelName.includes('mistral')) {
          limits = { maxInputTokens: 28000, maxContextTokens: 24000, maxMessageTokens: 600 };
        } else if (baseModelName.includes('deepseek')) {
          limits = { maxInputTokens: 60000, maxContextTokens: 50000, maxMessageTokens: 600 };
        } else if (baseModelName.includes('phi4')) {
          limits = { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 600 };
        } else if (baseModelName.includes('phi3')) {
          limits = { maxInputTokens: 120000, maxContextTokens: 100000, maxMessageTokens: 500 };
        } else if (baseModelName.includes('phi')) {
          limits = { maxInputTokens: 2000, maxContextTokens: 1800, maxMessageTokens: 400 };
        } else if (baseModelName.includes('code') || baseModelName.includes('coder')) {
          limits = { maxInputTokens: 14000, maxContextTokens: 12000, maxMessageTokens: 600 };
        } else {
          limits = defaultLimits;
          console.log(`[DISCUSSION] Using default limits for unknown model: ${modelName}`);
        }
      }
    }

    console.log(`[DISCUSSION] Token limits for ${modelName}:`, limits);
    return limits;
  }

  /**
   * Prepare optimized summary context based on model capabilities
   */
  prepareSummaryContext(discussion, summaryModel) {
    const limits = this.getSummaryTokenLimits(summaryModel);
    
    // Enhanced system message for conclusion-focused summary
    const systemMessage = {
      role: 'system',
      content: `You are tasked with summarizing the conclusions reached in a collaborative discussion about "${discussion.topic}".

Your goal: Extract and present the key conclusions, decisions, and actionable outcomes that emerged from the discussion. Focus on what was collectively agreed upon, decided, or concluded rather than listing individual viewpoints.

Format your summary to highlight:
1. Main conclusions reached
2. Key decisions made
3. Areas of consensus
4. Actionable outcomes or next steps
5. Any remaining open questions

Keep the summary concise and focused on results rather than the discussion process.`
    };

    // Get all valid discussion messages (exclude system messages and errors)
    const allMessages = discussion.messages
      .filter(msg => msg.role !== 'system' && msg.content && msg.content.trim().length > 0)
      .filter(msg => !msg.content.includes('[Error:'))
      .filter(msg => !msg.content.includes('<think>'))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Sort by timestamp

    console.log(`[DISCUSSION] Total valid messages for summary: ${allMessages.length}`);

    // For summary, be very conservative to avoid timeouts
    const maxMessagesForSummary = Math.min(allMessages.length, 5); // Reduced from 8 to 5
    const recentMessages = allMessages.slice(-maxMessagesForSummary);
    
    // Calculate token usage for context optimization - using conservative summary limits
    let currentTokenCount = this.estimateTokenCount(systemMessage.content);
    const maxContextTokens = limits.maxContextTokens; // Already conservative from getSummaryTokenLimits
    const maxMessageTokens = limits.maxMessageTokens; // Already conservative from getSummaryTokenLimits
    
    const selectedMessages = [];
    let totalContentLength = 0;

    // Process messages from most recent to oldest, staying within limits
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      
      // Truncate message content more aggressively for summary
      let messageContent = msg.content;
      const estimatedMessageTokens = this.estimateTokenCount(messageContent);
      
      if (estimatedMessageTokens > maxMessageTokens) {
        // More aggressive truncation for summary
        const charLimit = Math.floor(maxMessageTokens * 2.5); // Reduced from 3.0 to 2.5
        messageContent = this.truncateMessage(messageContent, charLimit);
        console.log(`[DISCUSSION] Truncated summary message from ${msg.modelName} (${estimatedMessageTokens} -> ${this.estimateTokenCount(messageContent)} tokens)`);
      }
      
      // Enhanced format for summary context to show collaborative discussion
      const formattedMessage = `${msg.modelName} contributed: ${messageContent}`;
      const messageTokens = this.estimateTokenCount(formattedMessage);
      
      // Check if adding this message would exceed context limit
      const finalPromptEstimate = 100; // Reduced estimate
      if (currentTokenCount + messageTokens + finalPromptEstimate > maxContextTokens) {
        console.log(`[DISCUSSION] Summary context limit reached. Including ${selectedMessages.length} of ${recentMessages.length} recent messages`);
        break;
      }
      
      selectedMessages.unshift({ // Add to beginning since we're processing in reverse
          role: 'user',
        content: formattedMessage
      });
      
      currentTokenCount += messageTokens;
      totalContentLength += messageContent.length;
    }

    // Build final context
    const summaryContext = [systemMessage, ...selectedMessages];
    
    // Add conclusion-focused final prompt
    const finalPrompt = {
      role: 'user',
      content: `Based on the discussion above, provide a concise summary focusing on:

1. What conclusions were reached?
2. What decisions were made?
3. Where did the participants find consensus?
4. What actionable outcomes emerged?
5. What questions remain unresolved?

Focus on the results and outcomes of the discussion, not the individual contributions or process.`
    };
    
    const finalPromptTokens = this.estimateTokenCount(finalPrompt.content);
    if (currentTokenCount + finalPromptTokens <= maxContextTokens) {
      summaryContext.push(finalPrompt);
      currentTokenCount += finalPromptTokens;
    }

    console.log(`[DISCUSSION] Summary context for ${summaryModel}:`);
    console.log(`  - Total context messages: ${summaryContext.length}`);
    console.log(`  - Selected discussion messages: ${selectedMessages.length}/${allMessages.length}`);
    console.log(`  - Estimated total tokens: ${currentTokenCount}/${maxContextTokens}`);
    console.log(`  - Total content length: ${totalContentLength} characters`);
    console.log(`  - Context utilization: ${((currentTokenCount / maxContextTokens) * 100).toFixed(1)}%`);

    return summaryContext;
  }

  /**
   * Estimate token count for text (improved approximation)
   */
  estimateTokenCount(text) {
    if (!text) return 0;
    
    const { charsPerToken, tokensPerWord } = this.config.tokenEstimation;
    
    // Multiple estimation methods for better accuracy
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    const charCount = text.length;
    
    // Character-based estimate (more reliable for longer texts)
    const charBasedEstimate = Math.ceil(charCount / charsPerToken);
    
    // Word-based estimate (better for typical prose)
    const wordBasedEstimate = Math.ceil(wordCount / tokensPerWord);
    
    // Use the more conservative (higher) estimate to avoid token limit overruns
    const estimate = Math.max(charBasedEstimate, wordBasedEstimate);
    
    // Add larger buffer for tokenization overhead and safety margin (15% instead of 5%)
    const safeEstimate = Math.ceil(estimate * 1.15);
    
    // For very short texts, ensure minimum token count
    return Math.max(safeEstimate, Math.min(wordCount, 1));
  }

  /**
   * Generate summary of the discussion with streaming support and optimized context
   */
  async generateSummary(discussionId) {
    const discussion = this.discussions.get(discussionId);
    if (!discussion) return;

    try {
      discussion.status = 'summarizing';
      
      this.broadcastDiscussionUpdate(discussionId, {
        type: 'generating_summary',
        summaryModel: discussion.summaryModel
      });

      // Prepare optimized summary context based on model capabilities
      const summaryContext = this.prepareSummaryContext(discussion, discussion.summaryModel);

      // Create summary message with streaming support
      const summaryMessageId = uuidv4();
      const summaryMessage = {
        id: summaryMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        modelName: discussion.summaryModel,
        isSummary: true
      };

      // Initialize summary object for streaming
      discussion.summary = {
        id: summaryMessageId,
        content: '',
        generatedBy: discussion.summaryModel,
        generatedAt: new Date(),
        streaming: true
      };

      // Broadcast that summary generation started
      this.broadcastDiscussionUpdate(discussionId, {
        type: 'summary_started',
        summary: discussion.summary,
        message: {
          ...summaryMessage,
          discussionId: discussionId
        }
      });

      let fullSummaryContent = '';
      let tokenCount = 0;
      let hasReceivedContent = false;
      let summaryGenerated = false;

      // Try multiple approaches with progressively simpler contexts and shorter timeouts
      const approaches = [
        { name: 'streaming', timeout: 60000 },  // 1 minute for streaming
        { name: 'regular', timeout: 45000 },    // 45 seconds for regular chat
        { name: 'simple', timeout: 30000 },     // 30 seconds for simple summary
        { name: 'minimal', timeout: 20000 }     // 20 seconds for minimal summary
      ];

      for (const approach of approaches) {
        if (summaryGenerated) break;

        try {
          console.log(`[DISCUSSION] Trying ${approach.name} approach for summary generation (${approach.timeout/1000}s timeout)...`);

          if (approach.name === 'streaming') {
            // Try streaming first with timeout
            // Parse summary model name to determine provider and model
            const { providerId: summaryProviderId, modelName: summaryModelName } = this.parseModelName(discussion.summaryModel);
            
            const streamingPromise = modelProviderService.generateResponseStream(summaryProviderId, summaryModelName, summaryContext, (chunk) => {
          // Handle different chunk formats from different providers
          const newContent = chunk.content || (chunk.message && chunk.message.content);
          if (newContent) {
            fullSummaryContent += newContent;
            tokenCount++;
            hasReceivedContent = true;
            
            // Update summary content
            discussion.summary.content = fullSummaryContent;
            
            // Emit real-time summary updates
            this.broadcastDiscussionUpdate(discussionId, {
              type: 'summary_token',
              summaryId: summaryMessageId,
              token: newContent,
              fullContent: fullSummaryContent,
              tokenCount: tokenCount,
              modelName: discussion.summaryModel
            });
            
            // Periodic full updates for UI consistency
            if (tokenCount % 5 === 0 || chunk.done) {
              this.broadcastDiscussionUpdate(discussionId, {
                type: 'summary_streaming',
                summaryId: summaryMessageId,
                content: fullSummaryContent,
                modelName: discussion.summaryModel,
                isComplete: chunk.done || false
              });
            }
          }
            });

            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`Streaming timeout after ${approach.timeout/1000} seconds`)), approach.timeout);
            });

            await Promise.race([streamingPromise, timeoutPromise]);
            
            if (hasReceivedContent && fullSummaryContent.trim().length > 20) {
              summaryGenerated = true;
              console.log(`[DISCUSSION] Streaming summary successful (${tokenCount} tokens)`);
            }

          } else if (approach.name === 'regular') {
            // Fallback to regular chat with timeout
            console.log(`[DISCUSSION] Streaming failed, trying regular chat...`);
            
            // Parse summary model name to determine provider and model
            const { providerId: regularProviderId, modelName: regularModelName } = this.parseModelName(discussion.summaryModel);
            
            const chatPromise = modelProviderService.generateResponse(regularProviderId, regularModelName, summaryContext);
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`Regular chat timeout after ${approach.timeout/1000} seconds`)), approach.timeout);
            });

            const summaryResponse = await Promise.race([chatPromise, timeoutPromise]);
            
            if (summaryResponse && summaryResponse.message && summaryResponse.message.content) {
              fullSummaryContent = summaryResponse.message.content;
              tokenCount = fullSummaryContent.split(/\s+/).length;
              summaryGenerated = true;
              console.log(`[DISCUSSION] Regular chat summary successful (${tokenCount} tokens)`);
            }

          } else if (approach.name === 'simple') {
            // Simple summary context with fewer messages
            console.log(`[DISCUSSION] Regular chat failed, trying simple summary...`);
            
            const simpleContext = [
              {
                role: 'system',
                content: `Summarize the discussion about "${discussion.topic}" in 2-3 sentences.`
              },
              {
                role: 'user',
                content: `The discussion involved ${discussion.models.join(', ')} discussing "${discussion.topic}". Provide a brief summary.`
              }
            ];

            // Parse summary model name to determine provider and model
            const { providerId: simpleProviderId, modelName: simpleModelName } = this.parseModelName(discussion.summaryModel);
            
            const chatPromise = modelProviderService.generateResponse(simpleProviderId, simpleModelName, simpleContext);
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`Simple summary timeout after ${approach.timeout/1000} seconds`)), approach.timeout);
            });

            const summaryResponse = await Promise.race([chatPromise, timeoutPromise]);
            
            if (summaryResponse && summaryResponse.message && summaryResponse.message.content) {
              fullSummaryContent = summaryResponse.message.content;
              tokenCount = fullSummaryContent.split(/\s+/).length;
              summaryGenerated = true;
              console.log(`[DISCUSSION] Simple summary successful (${tokenCount} tokens)`);
            }

          } else if (approach.name === 'minimal') {
            // Minimal summary - just the topic and basic info
            console.log(`[DISCUSSION] Simple summary failed, trying minimal summary...`);
            
            const minimalContext = [
              {
                role: 'user',
                content: `Summarize: "${discussion.topic}". Keep it brief.`
              }
            ];

            // Parse summary model name to determine provider and model
            const { providerId: minimalProviderId, modelName: minimalModelName } = this.parseModelName(discussion.summaryModel);
            
            const chatPromise = modelProviderService.generateResponse(minimalProviderId, minimalModelName, minimalContext);
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`Minimal summary timeout after ${approach.timeout/1000} seconds`)), approach.timeout);
            });

            const summaryResponse = await Promise.race([chatPromise, timeoutPromise]);
            
            if (summaryResponse && summaryResponse.message && summaryResponse.message.content) {
              fullSummaryContent = summaryResponse.message.content;
              tokenCount = fullSummaryContent.split(/\s+/).length;
              summaryGenerated = true;
              console.log(`[DISCUSSION] Minimal summary successful (${tokenCount} tokens)`);
            }
          }

        } catch (approachError) {
          console.warn(`[DISCUSSION] ${approach.name} approach failed:`, approachError.message);
          // Continue to next approach
        }
      }

      if (!summaryGenerated || !fullSummaryContent.trim()) {
        throw new Error('All summary generation approaches failed');
      }

        // Finalize summary
        discussion.summary = {
          id: summaryMessageId,
        content: fullSummaryContent.trim(),
          generatedBy: discussion.summaryModel,
          generatedAt: new Date(),
          streaming: false,
          tokenCount: tokenCount
        };

        discussion.status = 'completed';
        discussion.completedAt = new Date();
        discussion.updatedAt = new Date();
        this.activeDiscussions.delete(discussionId);

        // Save completed discussion to file
        await this.saveDiscussionToFile(discussion);

        // Broadcast summary completion
        this.broadcastDiscussionUpdate(discussionId, {
          type: 'summary_complete',
          summary: discussion.summary,
          tokenCount: tokenCount
        });

        // Broadcast discussion completion
        this.broadcastDiscussionUpdate(discussionId, {
          type: 'discussion_completed',
          summary: discussion.summary,
          discussion: this.getDiscussionSummary(discussion)
        });

        // Remove completed discussion from memory immediately (it will be loaded from storage when needed)
        this.discussions.delete(discussionId);
        console.log(`[DISCUSSION] Removed completed discussion ${discussionId} from memory - will be loaded from storage when needed`);

      console.log(`[DISCUSSION] Summary generation completed successfully for ${discussionId}`);

    } catch (error) {
      console.error(`Error generating summary for discussion ${discussionId}:`, error);
        
      // Create a fallback summary
      const fallbackSummary = {
        id: uuidv4(),
        content: `Discussion about "${discussion.topic}" completed with ${discussion.messages ? discussion.messages.length : 0} messages from models: ${discussion.models.join(', ')}. Summary generation encountered technical difficulties.`,
        generatedBy: 'system',
          generatedAt: new Date(),
        streaming: false,
        tokenCount: 0,
        fallback: true
        };

      discussion.summary = fallbackSummary;
        discussion.status = 'completed';
        discussion.completedAt = new Date();
        discussion.updatedAt = new Date();
      discussion.error = `Summary generation failed: ${error.message}`;
        this.activeDiscussions.delete(discussionId);

      // Save error state to file
        await this.saveDiscussionToFile(discussion);

      // Broadcast completion with fallback summary
        this.broadcastDiscussionUpdate(discussionId, {
          type: 'discussion_completed',
        summary: fallbackSummary,
        discussion: this.getDiscussionSummary(discussion),
        warning: 'Summary generated using fallback method due to technical issues'
      });

      // Remove completed discussion from memory immediately (even with error)
      this.discussions.delete(discussionId);
      console.log(`[DISCUSSION] Removed completed discussion ${discussionId} from memory (with fallback summary)`);

      console.log(`[DISCUSSION] Used fallback summary for ${discussionId} due to error: ${error.message}`);
    }
  }

  /**
   * Stop a running discussion
   */
  async stopDiscussion(discussionId) {
    const discussion = this.discussions.get(discussionId);
    if (!discussion) {
      throw new Error('Discussion not found');
    }

    if (discussion.status === 'running' || discussion.status === 'summarizing') {
      discussion.status = 'stopped';
      discussion.updatedAt = new Date();
      this.activeDiscussions.delete(discussionId);

      // Save stopped state to file
      await this.saveDiscussionToFile(discussion);

      this.broadcastDiscussionUpdate(discussionId, {
        type: 'discussion_stopped'
      });
    }

    return discussion;
  }

  /**
   * Get discussion by ID
   */
  async getDiscussion(discussionId) {
    const discussion = this.discussions.get(discussionId);
    
    // If discussion exists in memory and is not completed, return it directly
    if (discussion && discussion.status !== 'completed') {
      return discussion;
    }
    
    // For completed discussions or discussions not in memory, always load from storage
    console.log(`[DISCUSSION] Loading discussion ${discussionId} from storage (completed or not in memory)`);
    try {
      const storedDiscussion = await this.loadDiscussionFromFile(discussionId);
      if (storedDiscussion) {
        console.log(`[DISCUSSION] Successfully loaded discussion from storage: ${storedDiscussion.messages ? storedDiscussion.messages.length : 0} messages`);
        
        // If this is a completed discussion, don't store it back in memory
        if (storedDiscussion.status === 'completed') {
          return storedDiscussion;
        } else {
          // If it's not completed, update memory for active management
          this.discussions.set(discussionId, storedDiscussion);
          return storedDiscussion;
        }
      }
    } catch (error) {
      console.error(`[DISCUSSION] Failed to load discussion ${discussionId} from storage:`, error);
    }
    
    // Fallback to memory version if storage load failed
    return discussion || null;
  }

  /**
   * Get all discussions (from memory and storage index)
   */
  async getAllDiscussions() {
    const discussions = [];
    
    // Add discussions from memory (active/running discussions)
    for (const discussion of this.discussions.values()) {
      discussions.push(this.getDiscussionSummary(discussion));
    }
    
    // Add completed discussions from storage index
    try {
      const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
      const index = JSON.parse(indexData);
      
      for (const [id, indexEntry] of Object.entries(index.discussions)) {
        // Only add if not already in memory
        if (!this.discussions.has(id)) {
          discussions.push({
            id: id,
            topic: indexEntry.topic,
            models: indexEntry.models,
            summaryModel: indexEntry.summaryModel,
            status: indexEntry.status,
            messageCount: indexEntry.messageCount,
            createdAt: indexEntry.createdAt,
            updatedAt: indexEntry.updatedAt,
            completedAt: indexEntry.completedAt
          });
        }
      }
    } catch (error) {
      console.error('[DISCUSSION] Failed to load discussions from index:', error);
    }
    
    return discussions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get discussion summary (without full message history)
   */
  getDiscussionSummary(discussion) {
    const phase = this.getDiscussionPhase(discussion);
    
    return {
      id: discussion.id,
      topic: discussion.topic,
      models: discussion.models,
      summaryModel: discussion.summaryModel,
      maxRounds: discussion.maxRounds,
      currentRound: discussion.currentRound,
      status: discussion.status,
      messageCount: discussion.messages ? discussion.messages.length : 0,
      createdAt: discussion.createdAt,
      updatedAt: discussion.updatedAt,
      summary: discussion.summary,
      phase: {
        name: phase.name,
        description: phase.description,
        progress: Math.round((discussion.currentRound / discussion.maxRounds) * 100)
      }
    };
  }

  /**
   * Broadcast discussion updates to connected clients
   */
  broadcastDiscussionUpdate(discussionId, data) {
    broadcastToClients({
      type: 'discussion_update',
      discussionId: discussionId,
      ...data
    });
  }

  /**
   * Delete a discussion
   */
  async deleteDiscussion(discussionId) {
    // Try to get discussion from memory first, then from storage
    let discussion = this.discussions.get(discussionId);
    if (!discussion) {
      // Try to load from storage to verify it exists
      try {
        discussion = await this.loadDiscussionFromFile(discussionId);
        if (!discussion) {
          throw new Error('Discussion not found');
        }
      } catch (error) {
        throw new Error('Discussion not found');
      }
    }

    // Force stop the discussion if it's running
    if (discussion.status === 'running' || discussion.status === 'summarizing' || this.activeDiscussions.has(discussionId)) {
      console.log(`[DISCUSSION] Force stopping discussion ${discussionId} before deletion`);
      discussion.status = 'stopped';
      discussion.updatedAt = new Date();
      this.activeDiscussions.delete(discussionId);
      
      // Remove any running models for this discussion
      discussion.models.forEach(model => {
        this.runningModels.delete(model);
      });
      
      // Broadcast stop event
      this.broadcastDiscussionUpdate(discussionId, {
        type: 'discussion_stopped',
        reason: 'deleted'
      });
    }

    // Remove from memory
    this.discussions.delete(discussionId);
    
    // Delete from storage
    await this.deleteDiscussionFromStorage(discussionId);
    
    // Broadcast deletion event
    this.broadcastDiscussionUpdate(discussionId, {
      type: 'discussion_deleted',
      discussionId: discussionId
    });
    
    return { success: true, message: 'Discussion stopped and deleted successfully' };
  }

  /**
   * Update performance configuration for faster discussions
   */
  updatePerformanceConfig(newConfig) {
    // Deep merge the configuration
    if (newConfig.performance) {
      this.config.performance = { ...this.config.performance, ...newConfig.performance };
      delete newConfig.performance;
    }
    
    this.config = { ...this.config, ...newConfig };
    console.log('[DISCUSSION] Performance config updated:', this.config);
    return this.config;
  }

  /**
   * Get current performance configuration
   */
  getPerformanceConfig() {
    return { ...this.config };
  }

  /**
   * Get performance statistics and recommendations
   */
  async getPerformanceStats() {
    const discussions = Array.from(this.discussions.values());
    const activeDiscussions = discussions.filter(d => this.activeDiscussions.has(d.id));
    const completedDiscussions = discussions.filter(d => d.status === 'completed');
    
    // Calculate average response times and token counts
    let totalMessages = 0;
    let totalTokens = 0;
    let totalRounds = 0;
    let averageResponseTime = 0;
    
    completedDiscussions.forEach(discussion => {
      totalMessages += discussion.messages ? discussion.messages.length : 0;
      totalRounds += discussion.currentRound;
      
      discussion.messages.forEach(msg => {
        if (msg.tokenCount) {
          totalTokens += msg.tokenCount;
        }
      });
    });
    
    const averageMessagesPerDiscussion = completedDiscussions.length > 0 
      ? totalMessages / completedDiscussions.length 
      : 0;
    
    const averageTokensPerMessage = totalMessages > 0 
      ? totalTokens / totalMessages 
      : 0;
    
    const averageRoundsPerDiscussion = completedDiscussions.length > 0 
      ? totalRounds / completedDiscussions.length 
      : 0;
    
    // Memory usage statistics
    const memoryStats = {
      discussionsInMemory: this.discussions.size,
      activeDiscussions: this.activeDiscussions.size,
      contextCacheSize: this.contextCache.size,
      tokenCountCacheSize: this.tokenCountCache.size,
      similarityCacheSize: this.similarityCache.size,
      runningModels: this.runningModels.size
    };
    
    // Performance recommendations
    const recommendations = [];
    
    if (averageMessagesPerDiscussion > 20) {
      recommendations.push({
        type: 'context_optimization',
        message: 'Consider enabling adaptive context size for better performance with long discussions',
        suggestion: 'Set adaptiveContextSize to true and reduce contextReductionFactor'
      });
    }
    
    if (this.activeDiscussions.size > 3) {
      recommendations.push({
        type: 'concurrent_discussions',
        message: 'Multiple active discussions detected. Consider reducing model delay for faster processing',
        suggestion: 'Reduce modelDelay to 25-50ms for faster model switching'
      });
    }
    
    if (averageTokensPerMessage > 500) {
      recommendations.push({
        type: 'token_optimization',
        message: 'High token usage detected. Consider reducing context messages',
        suggestion: 'Reduce maxContextMessages to 5-8 for better performance'
      });
    }
    
    if (this.contextCache.size > 500) {
      recommendations.push({
        type: 'cache_cleanup',
        message: 'Large cache size detected. Consider more frequent cleanup',
        suggestion: 'Reduce cacheCleanupInterval to 2-3 minutes'
      });
    }
    
    // System resource recommendations
    if (process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const memUsageMB = memUsage.heapUsed / 1024 / 1024;
      
      if (memUsageMB > 200) {
        recommendations.push({
          type: 'memory_usage',
          message: `High memory usage detected: ${memUsageMB.toFixed(1)}MB`,
          suggestion: 'Consider enabling more aggressive memory cleanup or reducing cache sizes'
        });
      }
    }
    
    return {
      overview: {
        totalDiscussions: discussions.length,
        activeDiscussions: this.activeDiscussions.size,
        completedDiscussions: completedDiscussions.length,
        runningModels: this.runningModels.size
      },
      performance: {
        averageMessagesPerDiscussion: Math.round(averageMessagesPerDiscussion * 100) / 100,
        averageTokensPerMessage: Math.round(averageTokensPerMessage * 100) / 100,
        averageRoundsPerDiscussion: Math.round(averageRoundsPerDiscussion * 100) / 100,
        totalMessages,
        totalTokens
      },
      memory: memoryStats,
      configuration: this.config,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset running models state (emergency cleanup)
   */
  resetRunningModels() {
    const previousRunning = Array.from(this.runningModels);
    this.runningModels.clear();
    console.log(`[DISCUSSION] Emergency reset: cleared running models: ${previousRunning.join(', ') || 'none'}`);
    return { cleared: previousRunning };
  }

  /**
   * Get current running models status
   */
  getRunningModelsStatus() {
    return {
      runningModels: Array.from(this.runningModels),
      count: this.runningModels.size,
      singleModelMode: this.config.singleModelMode
    };
  }

  /**
   * Get storage system information
   */
  async getStorageInfo() {
    try {
      const metadataData = await fs.readFile(this.storageConfig.metadataFile, 'utf8');
      const metadata = JSON.parse(metadataData);
      
      const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
      const index = JSON.parse(indexData);
      
      // Get directory sizes
      const discussionsFiles = await fs.readdir(this.storageConfig.discussionsDir);
      const backupDirs = await fs.readdir(this.storageConfig.backupsDir);
      
      // Calculate storage usage
      let totalSize = 0;
      for (const file of discussionsFiles) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.storageConfig.discussionsDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
      
      return {
        metadata: metadata,
        totalDiscussions: Object.keys(index.discussions).length,
        activeDiscussions: this.activeDiscussions.size,
        storageSize: totalSize,
        backupCount: backupDirs.filter(name => name.startsWith('backup-')).length,
        storageConfig: {
          autoSaveInterval: this.storageConfig.autoSaveInterval,
          maxBackups: this.storageConfig.maxBackups
        },
        directories: {
          base: this.storageConfig.baseDir,
          discussions: this.storageConfig.discussionsDir,
          backups: this.storageConfig.backupsDir
        }
      };
    } catch (error) {
      console.error('[STORAGE] Failed to get storage info:', error);
      throw error;
    }
  }

  /**
   * Clean up storage and optimize
   */
  async cleanupStorage() {
    try {
      const result = {
        backupsRemoved: 0,
        orphanedFilesRemoved: 0,
        spaceSaved: 0
      };
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      // Check for orphaned discussion files
      const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
      const index = JSON.parse(indexData);
      const validDiscussionIds = new Set(Object.keys(index.discussions));
      
      const discussionFiles = await fs.readdir(this.storageConfig.discussionsDir);
      for (const file of discussionFiles) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const discussionId = file.replace('.json', '');
          if (!validDiscussionIds.has(discussionId)) {
            const filePath = path.join(this.storageConfig.discussionsDir, file);
            const stats = await fs.stat(filePath);
            await fs.unlink(filePath);
            result.orphanedFilesRemoved++;
            result.spaceSaved += stats.size;
            console.log(`[STORAGE] Removed orphaned file: ${file}`);
          }
        }
      }
      
      // Update metadata
      const metadataData = await fs.readFile(this.storageConfig.metadataFile, 'utf8');
      const metadata = JSON.parse(metadataData);
      metadata.lastCleanup = new Date().toISOString();
      metadata.lastUpdated = new Date().toISOString();
      await fs.writeFile(this.storageConfig.metadataFile, JSON.stringify(metadata, null, 2));
      
      console.log('[STORAGE] Storage cleanup completed:', result);
      return result;
    } catch (error) {
      console.error('[STORAGE] Failed to cleanup storage:', error);
      throw error;
    }
  }

  /**
   * Export discussion data for external use
   */
  async exportDiscussionData(discussionId, format = 'json') {
    const discussion = await this.getDiscussion(discussionId);
    if (!discussion) {
      throw new Error('Discussion not found');
    }

    const exportData = {
      id: discussion.id,
      topic: discussion.topic,
      status: discussion.status,
      models: discussion.models,
      summaryModel: discussion.summaryModel,
      maxRounds: discussion.maxRounds,
      currentRound: discussion.currentRound,
      createdAt: discussion.createdAt.toISOString(),
      updatedAt: discussion.updatedAt.toISOString(),
      completedAt: discussion.completedAt ? discussion.completedAt.toISOString() : null,
      messages: (discussion.messages || []).map(msg => ({
        id: msg.id,
        modelName: msg.modelName,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        round: msg.round,
        tokenCount: msg.tokenCount
      })),
      summary: discussion.summary ? {
        content: discussion.summary.content,
        generatedBy: discussion.summary.generatedBy,
        generatedAt: discussion.summary.generatedAt.toISOString(),
        tokenCount: discussion.summary.tokenCount
      } : null,
      exportedAt: new Date().toISOString()
    };

    if (format === 'txt') {
      let textContent = `AI Model Discussion Export\n`;
      textContent += `${'='.repeat(50)}\n\n`;
      textContent += `Topic: ${discussion.topic}\n`;
      textContent += `Status: ${discussion.status}\n`;
      textContent += `Models: ${discussion.models.join(', ')}\n`;
      textContent += `Summary Model: ${discussion.summaryModel}\n`;
      textContent += `Rounds: ${discussion.currentRound} / ${discussion.maxRounds}\n`;
      textContent += `Created: ${discussion.createdAt.toLocaleString()}\n`;
      if (discussion.completedAt) {
        textContent += `Completed: ${discussion.completedAt.toLocaleString()}\n`;
      }
      textContent += `Exported: ${new Date().toLocaleString()}\n\n`;
      
      textContent += `Discussion Messages (${discussion.messages ? discussion.messages.length : 0})\n`;
      textContent += `${'-'.repeat(30)}\n\n`;
      
      (discussion.messages || []).forEach((msg, index) => {
        textContent += `Message ${index + 1} - ${msg.modelName}`;
        if (msg.round) textContent += ` (Round ${msg.round})`;
        textContent += `\n`;
        textContent += `Time: ${msg.timestamp.toLocaleString()}\n`;
        if (msg.tokenCount) textContent += `Tokens: ${msg.tokenCount}\n`;
        textContent += `${'-'.repeat(20)}\n`;
        textContent += `${msg.content}\n\n`;
      });
      
      if (discussion.summary) {
        textContent += `Discussion Summary\n`;
        textContent += `${'-'.repeat(20)}\n`;
        textContent += `Generated by: ${discussion.summary.generatedBy}\n`;
        textContent += `Generated at: ${discussion.summary.generatedAt.toLocaleString()}\n`;
        if (discussion.summary.tokenCount) {
          textContent += `Tokens: ${discussion.summary.tokenCount}\n`;
        }
        textContent += `\n${discussion.summary.content}\n`;
      }
      
      return textContent;
    }

    return exportData;
  }

  /**
   * Get conservative token limits specifically for summary generation
   */
  getSummaryTokenLimits(modelName) {
    const baseLimits = this.getModelTokenLimits(modelName);
    
    // Apply conservative multipliers for summary generation to ensure reliability
    const summaryLimits = {
      maxInputTokens: Math.floor(baseLimits.maxInputTokens * 0.4), // Use only 40% of max input
      maxContextTokens: Math.floor(baseLimits.maxContextTokens * 0.4), // Use only 40% of max context
      maxMessageTokens: Math.floor(baseLimits.maxMessageTokens * 0.6) // Use only 60% of max message
    };
    
    // Ensure minimum viable limits
    summaryLimits.maxInputTokens = Math.max(summaryLimits.maxInputTokens, 1000);
    summaryLimits.maxContextTokens = Math.max(summaryLimits.maxContextTokens, 800);
    summaryLimits.maxMessageTokens = Math.max(summaryLimits.maxMessageTokens, 100);
    
    console.log(`[DISCUSSION] Conservative summary limits for ${modelName}:`, summaryLimits);
    return summaryLimits;
  }

  /**
   * Start performance optimization tasks
   */
  startPerformanceOptimization() {
    // Cache cleanup interval
    setInterval(() => {
      this.cleanupCaches();
    }, this.config.performance.cacheCleanupInterval);
    
    // Memory cleanup interval
    setInterval(() => {
      this.cleanupMemory();
    }, this.config.performance.memoryCleanupInterval);
    
    console.log('[PERFORMANCE] Performance optimization tasks started');
  }

  /**
   * Clean up caches to prevent memory leaks
   */
  cleanupCaches() {
    const maxSize = this.config.performance.maxCacheSize;
    
    // Clean context cache
    if (this.contextCache.size > maxSize) {
      const entries = Array.from(this.contextCache.entries());
      const toDelete = entries.slice(0, entries.length - maxSize);
      toDelete.forEach(([key]) => this.contextCache.delete(key));
      console.log(`[PERFORMANCE] Cleaned ${toDelete.length} context cache entries`);
    }
    
    // Clean token count cache
    if (this.tokenCountCache.size > maxSize) {
      const entries = Array.from(this.tokenCountCache.entries());
      const toDelete = entries.slice(0, entries.length - maxSize);
      toDelete.forEach(([key]) => this.tokenCountCache.delete(key));
      console.log(`[PERFORMANCE] Cleaned ${toDelete.length} token count cache entries`);
    }
    
    // Clean similarity cache
    if (this.similarityCache.size > maxSize) {
      const entries = Array.from(this.similarityCache.entries());
      const toDelete = entries.slice(0, entries.length - maxSize);
      toDelete.forEach(([key]) => this.similarityCache.delete(key));
      console.log(`[PERFORMANCE] Cleaned ${toDelete.length} similarity cache entries`);
    }
  }

  /**
   * Clean up memory and optimize performance
   */
  cleanupMemory() {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('[PERFORMANCE] Forced garbage collection');
    }
    
    // Completely remove completed discussions from memory (they will be loaded from storage when needed)
    const completedDiscussions = [];
    for (const [id, discussion] of this.discussions.entries()) {
      if (discussion.status === 'completed' && !this.activeDiscussions.has(id)) {
        // Ensure the discussion is saved to storage before removing from memory
        this.saveDiscussionToFile(discussion).then(() => {
          console.log(`[PERFORMANCE] Saved and removed completed discussion ${id} from memory`);
        }).catch(error => {
          console.error(`[PERFORMANCE] Failed to save discussion ${id} before memory cleanup:`, error);
        });
        
        // Remove completely from memory - it will be loaded from storage when needed
        this.discussions.delete(id);
        completedDiscussions.push(id);
      }
    }
    
    if (completedDiscussions.length > 0) {
      console.log(`[PERFORMANCE] Removed ${completedDiscussions.length} completed discussions from memory`);
    }
  }

  /**
   * Estimate token count with caching for better performance
   */
  estimateTokenCountCached(text) {
    if (!text) return 0;
    
    // Use cache for frequently calculated texts
    const cacheKey = text.length < 200 ? text : text.substring(0, 200) + '...' + text.length;
    
    if (this.tokenCountCache.has(cacheKey)) {
      return this.tokenCountCache.get(cacheKey);
    }
    
    const { charsPerToken, tokensPerWord } = this.config.tokenEstimation;
    
    // Multiple estimation methods for better accuracy
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    const charCount = text.length;
    
    // Character-based estimate (more reliable for longer texts)
    const charBasedEstimate = Math.ceil(charCount / charsPerToken);
    
    // Word-based estimate (better for typical prose)
    const wordBasedEstimate = Math.ceil(wordCount / tokensPerWord);
    
    // Use the more conservative (higher) estimate to avoid token limit overruns
    const estimate = Math.max(charBasedEstimate, wordBasedEstimate);
    
    // Add buffer for tokenization overhead and safety margin
    const safeEstimate = Math.ceil(estimate * 1.1); // Reduced from 1.15 to 1.1
    
    // For very short texts, ensure minimum token count
    const finalEstimate = Math.max(safeEstimate, Math.min(wordCount, 1));
    
    // Cache the result
    this.tokenCountCache.set(cacheKey, finalEstimate);
    
    return finalEstimate;
  }

  /**
   * Original estimateTokenCount method for backward compatibility
   */
  estimateTokenCount(text) {
    return this.estimateTokenCountCached(text);
  }

  /**
   * Parse model name to determine provider and model name
   */
  parseModelName(fullModelName) {
    if (!fullModelName) {
      throw new Error('Model name is required');
    }

    // Check if it's an OpenRouter model (contains '/')
    if (fullModelName.includes('/')) {
      return {
        providerId: 'openrouter',
        modelName: fullModelName
      };
    }

    // Otherwise, assume it's an Ollama model
    return {
      providerId: 'ollama',
      modelName: fullModelName
    };
  }
}

export default new DiscussionService(); 