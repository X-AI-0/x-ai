import express from 'express';
import discussionService from '../services/discussionService.js';

const router = express.Router();

/**
 * POST /api/discussions
 * Create a new discussion
 */
router.post('/', async (req, res) => {
  try {
    const { topic, models, summaryModel, maxRounds } = req.body;

    // Validation
    if (!topic || !models || !summaryModel || !maxRounds) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: topic, models, summaryModel, maxRounds'
      });
    }

    if (!Array.isArray(models) || models.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 models are required for a discussion'
      });
    }

    if (maxRounds < 1 || maxRounds > 20) {
      return res.status(400).json({
        success: false,
        error: 'Max rounds must be between 1 and 20'
      });
    }

    const discussion = discussionService.createDiscussion({
      topic,
      models,
      summaryModel,
      maxRounds
    });

    res.status(201).json({
      success: true,
      data: discussion
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions
 * Get all discussions
 */
router.get('/', async (req, res) => {
  try {
    const discussions = await discussionService.getAllDiscussions();
    res.json({
      success: true,
      data: discussions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/:id
 * Get a specific discussion with full details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const discussion = await discussionService.getDiscussion(id);
    
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'Discussion not found'
      });
    }

    res.json({
      success: true,
      data: discussion
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/discussions/:id/start
 * Start a discussion
 */
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const discussion = await discussionService.startDiscussion(id);
    
    res.json({
      success: true,
      data: discussionService.getDiscussionSummary(discussion),
      message: 'Discussion started successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/discussions/:id/stop
 * Stop a running discussion
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const discussion = await discussionService.stopDiscussion(id);
    
    res.json({
      success: true,
      data: discussionService.getDiscussionSummary(discussion),
      message: 'Discussion stopped successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/discussions/:id
 * Delete a discussion
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await discussionService.deleteDiscussion(id);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/:id/messages
 * Get messages from a specific discussion
 */
router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const discussion = await discussionService.getDiscussion(id);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'Discussion not found'
      });
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const messages = discussion.messages ? discussion.messages.slice(startIndex, endIndex) : [];

    res.json({
      success: true,
      data: {
        messages: messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: discussion.messages ? discussion.messages.length : 0,
          totalPages: Math.ceil((discussion.messages ? discussion.messages.length : 0) / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/:id/summary
 * Get the summary of a completed discussion
 */
router.get('/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const discussion = await discussionService.getDiscussion(id);
    
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'Discussion not found'
      });
    }

    if (!discussion.summary) {
      return res.status(404).json({
        success: false,
        error: 'Summary not available yet'
      });
    }

    res.json({
      success: true,
      data: discussion.summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/stats/overview
 * Get discussion statistics
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const discussions = await discussionService.getAllDiscussions();
    
    const stats = {
      total: discussions.length,
      running: discussions.filter(d => d.status === 'running').length,
      completed: discussions.filter(d => d.status === 'completed').length,
      stopped: discussions.filter(d => d.status === 'stopped').length,
      error: discussions.filter(d => d.status === 'error').length,
      totalMessages: discussions.reduce((sum, d) => sum + (d.messages ? d.messages.length : 0), 0),
      averageRounds: discussions.length > 0 
        ? discussions.reduce((sum, d) => sum + d.currentRound, 0) / discussions.length 
        : 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/performance/config
 * Get current performance configuration
 */
router.get('/performance/config', async (req, res) => {
  try {
    const config = discussionService.getPerformanceConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/discussions/performance/config
 * Update performance configuration for faster discussions
 */
router.put('/performance/config', async (req, res) => {
  try {
    const { 
      modelDelay, 
      enableStreaming, 
      maxContextMessages, 
      adaptiveContextSize,
      contextReductionFactor,
      maxRoundsBeforeReduction,
      tokenBroadcastThrottle,
      streamingUpdateInterval
    } = req.body;
    
    const newConfig = {};
    
    // Validate and set basic performance settings
    if (typeof modelDelay === 'number' && modelDelay >= 0 && modelDelay <= 5000) {
      newConfig.modelDelay = modelDelay;
    }
    if (typeof enableStreaming === 'boolean') {
      newConfig.enableStreaming = enableStreaming;
    }
    if (typeof maxContextMessages === 'number' && maxContextMessages >= 1 && maxContextMessages <= 20) {
      newConfig.maxContextMessages = maxContextMessages;
    }
    
    // Validate and set advanced performance settings
    if (typeof adaptiveContextSize === 'boolean') {
      if (!newConfig.performance) newConfig.performance = {};
      newConfig.performance.adaptiveContextSize = adaptiveContextSize;
    }
    if (typeof contextReductionFactor === 'number' && contextReductionFactor >= 0.1 && contextReductionFactor <= 1.0) {
      if (!newConfig.performance) newConfig.performance = {};
      newConfig.performance.contextReductionFactor = contextReductionFactor;
    }
    if (typeof maxRoundsBeforeReduction === 'number' && maxRoundsBeforeReduction >= 1 && maxRoundsBeforeReduction <= 20) {
      if (!newConfig.performance) newConfig.performance = {};
      newConfig.performance.maxRoundsBeforeReduction = maxRoundsBeforeReduction;
    }
    if (typeof tokenBroadcastThrottle === 'number' && tokenBroadcastThrottle >= 1 && tokenBroadcastThrottle <= 100) {
      if (!newConfig.performance) newConfig.performance = {};
      newConfig.performance.tokenBroadcastThrottle = tokenBroadcastThrottle;
    }
    if (typeof streamingUpdateInterval === 'number' && streamingUpdateInterval >= 50 && streamingUpdateInterval <= 1000) {
      if (!newConfig.performance) newConfig.performance = {};
      newConfig.performance.streamingUpdateInterval = streamingUpdateInterval;
    }
    
    const updatedConfig = discussionService.updatePerformanceConfig(newConfig);
    
    res.json({
      success: true,
      data: updatedConfig,
      message: 'Performance configuration updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/discussions/performance/optimize
 * Apply automatic performance optimization based on system resources
 */
router.post('/performance/optimize', async (req, res) => {
  try {
    const { mode = 'balanced' } = req.body; // 'fast', 'balanced', 'quality'
    
    let optimizedConfig = {};
    
    switch (mode) {
      case 'fast':
        optimizedConfig = {
          modelDelay: 25,
          maxContextMessages: 5,
          performance: {
            adaptiveContextSize: true,
            contextReductionFactor: 0.7,
            maxRoundsBeforeReduction: 3,
            tokenBroadcastThrottle: 15,
            streamingUpdateInterval: 300
          }
        };
        break;
      case 'balanced':
        optimizedConfig = {
          modelDelay: 50,
          maxContextMessages: 8,
          performance: {
            adaptiveContextSize: true,
            contextReductionFactor: 0.8,
            maxRoundsBeforeReduction: 5,
            tokenBroadcastThrottle: 10,
            streamingUpdateInterval: 200
          }
        };
        break;
      case 'quality':
        optimizedConfig = {
          modelDelay: 100,
          maxContextMessages: 12,
          performance: {
            adaptiveContextSize: false,
            contextReductionFactor: 0.9,
            maxRoundsBeforeReduction: 8,
            tokenBroadcastThrottle: 5,
            streamingUpdateInterval: 100
          }
        };
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid optimization mode. Use "fast", "balanced", or "quality"'
        });
    }
    
    const updatedConfig = discussionService.updatePerformanceConfig(optimizedConfig);
    
    res.json({
      success: true,
      data: updatedConfig,
      message: `Performance optimized for ${mode} mode`,
      mode: mode
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/performance/stats
 * Get performance statistics and recommendations
 */
router.get('/performance/stats', async (req, res) => {
  try {
    const stats = await discussionService.getPerformanceStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/debug/running-models
 * Get current running models status (for debugging)
 */
router.get('/debug/running-models', async (req, res) => {
  try {
    const status = discussionService.getRunningModelsStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/discussions/debug/reset-running-models
 * Reset running models state (emergency cleanup)
 */
router.post('/debug/reset-running-models', async (req, res) => {
  try {
    const result = discussionService.resetRunningModels();
    res.json({
      success: true,
      data: result,
      message: 'Running models state reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/discussions/storage/backup
 * Create a backup of all discussions
 */
router.post('/storage/backup', async (req, res) => {
  try {
    const backupPath = await discussionService.createBackup();
    
    res.json({
      success: true,
      data: {
        backupPath: backupPath,
        timestamp: new Date().toISOString()
      },
      message: 'Backup created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/storage/info
 * Get storage system information
 */
router.get('/storage/info', async (req, res) => {
  try {
    const info = await discussionService.getStorageInfo();
    
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/discussions/storage/cleanup
 * Clean up old backups and optimize storage
 */
router.post('/storage/cleanup', async (req, res) => {
  try {
    const result = await discussionService.cleanupStorage();
    
    res.json({
      success: true,
      data: result,
      message: 'Storage cleanup completed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/discussions/:id/export
 * Export a completed discussion as a downloadable file
 */
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;
    
    const discussion = await discussionService.getDiscussion(id);
    
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'Discussion not found'
      });
    }

    // Only allow export of completed discussions
    if (discussion.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Only completed discussions can be exported'
      });
    }

    const exportData = await discussionService.exportDiscussionData(id, format);

    if (format === 'json') {
      const filename = `discussion_${discussion.topic.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(exportData);
    } else if (format === 'txt') {
      const filename = `discussion_${discussion.topic.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported format. Use "json" or "txt"'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router; 