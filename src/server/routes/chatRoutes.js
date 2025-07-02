import express from 'express';
import ollamaService from '../services/ollamaService.js';
import chatService from '../services/chatService.js';
import modelProviderService from '../services/modelProviderService.js';

const router = express.Router();

/**
 * POST /api/chat
 * Send a message to a model and get a response
 */
router.post('/', async (req, res) => {
  try {
    const { modelName, messages, providerId } = req.body;

    // Validation
    if (!modelName) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required and cannot be empty'
      });
    }

    // Determine provider - use provided or active provider
    const activeProvider = providerId || modelProviderService.getActiveProvider();
    
    console.log(`[CHAT] Sending message to ${modelName} via ${activeProvider}`);
    
    if (activeProvider === 'ollama') {
      console.log('[CHAT] 🚀 NVIDIA ACCELERATION - Using NVIDIA GPU for enhanced performance');
    } else {
      console.log(`[CHAT] ☁️ Using ${activeProvider} cloud service`);
    }

    // Send message via appropriate provider
    let response;
    if (activeProvider === 'ollama') {
      response = await ollamaService.chat(modelName, messages);
    } else {
      // Use model provider service for other providers
      const result = await modelProviderService.generateResponse(activeProvider, modelName, messages);
      response = {
        message: result.message,
        model: modelName,
        created_at: new Date().toISOString(),
        done: true,
        usage: result.usage
      };
    }

    res.json({
      success: true,
      data: {
        message: response.message,
        model: response.model,
        created_at: response.created_at,
        done: response.done,
        usage: response.usage,
        provider: activeProvider
      }
    });

  } catch (error) {
    console.error('[CHAT] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chat/stream
 * Send a message to a model and get a streaming response
 */
router.post('/stream', async (req, res) => {
  try {
    const { modelName, messages, providerId } = req.body;

    // Validation
    if (!modelName) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required and cannot be empty'
      });
    }

    // Determine provider - use provided or active provider
    const activeProvider = providerId || modelProviderService.getActiveProvider();
    
    console.log(`[CHAT] Starting streaming chat with ${modelName} via ${activeProvider}`);
    
    if (activeProvider === 'ollama') {
      console.log('[CHAT] 🚀 NVIDIA ACCELERATION - Using NVIDIA GPU for streaming');
    } else {
      console.log(`[CHAT] ☁️ Using ${activeProvider} cloud streaming`);
    }

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    let tokenCount = 0;

    try {
      if (activeProvider === 'ollama') {
        // Stream response from Ollama
        await ollamaService.chatStream(modelName, messages, (chunk) => {
          // Only log completion to reduce spam
          if (chunk.done) {
            console.log(`[CHAT] ✅ Streaming completed for ${modelName}`);
            if (chunk.eval_count && chunk.eval_duration) {
              const tokensPerSec = (chunk.eval_count / (chunk.eval_duration / 1000000000)).toFixed(2);
              console.log(`[CHAT] 🚀 Performance: ${tokensPerSec} tokens/second`);
            }
          }
          
          if (chunk.message && chunk.message.content) {
            tokenCount++;
            
            // Send chunk as Server-Sent Event
            const data = JSON.stringify({
              message: chunk.message,
              model: chunk.model,
              created_at: chunk.created_at,
              done: chunk.done || false,
              tokenCount: tokenCount,
              provider: activeProvider
            });
            
            res.write(`data: ${data}\n\n`);
          }

          // End stream when done
          if (chunk.done) {
            console.log(`[CHAT] 📊 Final metrics for ${modelName}: ${tokenCount} tokens generated`);
            
            // Send final done message with performance metrics
            const finalData = JSON.stringify({
              message: { content: '' },
              model: modelName,
              created_at: new Date().toISOString(),
              done: true,
              tokenCount: tokenCount,
              provider: activeProvider,
              // Include performance metrics from Ollama
              eval_count: chunk.eval_count,
              eval_duration: chunk.eval_duration,
              load_duration: chunk.load_duration,
              prompt_eval_count: chunk.prompt_eval_count,
              prompt_eval_duration: chunk.prompt_eval_duration,
              total_duration: chunk.total_duration
            });
            
            res.write(`data: ${finalData}\n\n`);
            res.end();
          }
        });
      } else {
        // Stream response from other providers
        await modelProviderService.generateResponseStream(activeProvider, modelName, messages, (chunk) => {
          if (chunk.content) {
            tokenCount++;
            
            // Send chunk as Server-Sent Event
            const data = JSON.stringify({
              message: { content: chunk.content },
              model: modelName,
              created_at: new Date().toISOString(),
              done: chunk.done || false,
              tokenCount: tokenCount,
              provider: activeProvider
            });
            
            res.write(`data: ${data}\n\n`);
          }

          // End stream when done
          if (chunk.done) {
            console.log(`[CHAT] ✅ Streaming completed for ${modelName} via ${activeProvider}`);
            console.log(`[CHAT] 📊 Final metrics for ${modelName}: ${tokenCount} tokens generated`);
            
            // Send final done message
            const finalData = JSON.stringify({
              message: { content: '' },
              model: modelName,
              created_at: new Date().toISOString(),
              done: true,
              tokenCount: tokenCount,
              provider: activeProvider,
              usage: chunk.usage
            });
            
            res.write(`data: ${finalData}\n\n`);
            res.end();
          }
        });
      }

      // If the stream doesn't end naturally, close it
      if (!res.headersSent) {
        console.log(`[CHAT] Stream ended without done signal for ${modelName}`);
        const finalData = JSON.stringify({
          message: { content: '' },
          model: modelName,
          created_at: new Date().toISOString(),
          done: true,
          tokenCount: tokenCount
        });
        
        res.write(`data: ${finalData}\n\n`);
        res.end();
      }

    } catch (streamError) {
      console.error(`[CHAT] Streaming error for ${modelName}:`, streamError);
      
      // Send error as final chunk
      const errorData = JSON.stringify({
        error: streamError.message,
        done: true
      });
      
      res.write(`data: ${errorData}\n\n`);
      res.end();
    }

  } catch (error) {
    console.error('[CHAT] Stream setup error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    } else {
      // If headers already sent, send error as SSE
      const errorData = JSON.stringify({
        error: error.message,
        done: true
      });
      
      res.write(`data: ${errorData}\n\n`);
      res.end();
    }
  }
});

/**
 * GET /api/chats
 * Get all chats
 */
router.get('/', async (req, res) => {
  try {
    const chats = await chatService.getAllChats();
    res.json({
      success: true,
      data: chats
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error getting chats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chats
 * Create a new chat
 */
router.post('/create', async (req, res) => {
  try {
    const { model, title } = req.body;

    if (!model) {
      return res.status(400).json({
        success: false,
        error: 'Model is required'
      });
    }

    const chat = await chatService.createChat(model, title);
    
    res.json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error creating chat:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chats/:chatId
 * Get a specific chat
 */
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await chatService.getChat(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found'
      });
    }

    res.json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error getting chat:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chats/:chatId/messages
 * Add a message to a chat
 */
router.post('/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { role, content } = req.body;

    if (!role || !content) {
      return res.status(400).json({
        success: false,
        error: 'Role and content are required'
      });
    }

    const message = await chatService.addMessage(chatId, role, content);
    
    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error adding message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/chats/:chatId/messages/:messageId
 * Update a message in a chat
 */
router.put('/:chatId/messages/:messageId', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    const message = await chatService.updateMessage(chatId, messageId, content);
    
    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error updating message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/chats/:chatId
 * Delete a chat
 */
router.delete('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    await chatService.deleteChat(chatId);
    
    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error deleting chat:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chats/:chatId/deactivate
 * Deactivate a chat (stop auto-save)
 */
router.post('/:chatId/deactivate', async (req, res) => {
  try {
    const { chatId } = req.params;
    await chatService.deactivateChat(chatId);
    
    res.json({
      success: true,
      message: 'Chat deactivated successfully'
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error deactivating chat:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/chats/:chatId/export
 * Export chat data
 */
router.get('/:chatId/export', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { format = 'json' } = req.query;
    
    const data = await chatService.exportChatData(chatId, format);
    
    if (format === 'txt') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="chat-${chatId}.txt"`);
      res.send(data);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="chat-${chatId}.json"`);
      res.json(data);
    }
  } catch (error) {
    console.error('[CHAT_ROUTES] Error exporting chat:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Storage Management Routes
/**
 * GET /api/chats/storage/info
 * Get storage information
 */
router.get('/storage/info', async (req, res) => {
  try {
    const info = await chatService.getStorageInfo();
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error getting storage info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chats/storage/backup
 * Create a backup
 */
router.post('/storage/backup', async (req, res) => {
  try {
    const backupPath = await chatService.createBackup();
    res.json({
      success: true,
      data: { backupPath }
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error creating backup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/chats/storage/cleanup
 * Cleanup old backups
 */
router.post('/storage/cleanup', async (req, res) => {
  try {
    await chatService.cleanupOldBackups();
    res.json({
      success: true,
      message: 'Cleanup completed successfully'
    });
  } catch (error) {
    console.error('[CHAT_ROUTES] Error during cleanup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router; 