import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChatService {
    constructor() {
        this.chats = new Map(); // In-memory cache for active chats
        this.autoSaveIntervals = new Map(); // Track auto-save intervals
        
        // Storage configuration
        this.storageConfig = {
            baseDir: path.join(process.cwd(), 'chats-data'),
            chatsDir: path.join(process.cwd(), 'chats-data', 'chats'),
            backupsDir: path.join(process.cwd(), 'chats-data', 'backups'),
            metadataFile: path.join(process.cwd(), 'chats-data', 'metadata.json'),
            indexFile: path.join(process.cwd(), 'chats-data', 'index.json'),
            autoSaveInterval: 30000, // Auto-save every 30 seconds for active chats
            maxBackups: 10 // Maximum number of backups to keep
        };

        this.initialize();
    }

    async initialize() {
        try {
            console.log('[CHAT_SERVICE] Initializing chat storage system...');
            await this.initializeStorage();
            this.startMemoryCleanup();
            console.log('[CHAT_SERVICE] ✅ Chat storage system initialized successfully');
        } catch (error) {
            console.error('[CHAT_SERVICE] ❌ Failed to initialize storage system:', error);
        }
    }

    // Storage Management Methods
    async initializeStorage() {
        await this.ensureDirectoriesExist();
        await this.loadChatsFromStorage();
        await this.initializeMetadata();
    }

    async ensureDirectoriesExist() {
        const directories = [
            this.storageConfig.baseDir,
            this.storageConfig.chatsDir,
            this.storageConfig.backupsDir
        ];

        for (const dir of directories) {
            try {
                await fs.access(dir);
            } catch {
                await fs.mkdir(dir, { recursive: true });
                console.log(`[CHAT_SERVICE] Created directory: ${dir}`);
            }
        }
    }

    async initializeMetadata() {
        try {
            await fs.access(this.storageConfig.metadataFile);
        } catch {
            const metadata = {
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                totalChats: 0,
                totalMessages: 0
            };
            await fs.writeFile(this.storageConfig.metadataFile, JSON.stringify(metadata, null, 2));
            console.log('[CHAT_SERVICE] Created metadata file');
        }
    }

    async loadChatsFromStorage() {
        try {
            // Load chat index
            let chatIndex = {};
            try {
                const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
                chatIndex = JSON.parse(indexData);
            } catch {
                console.log('[CHAT_SERVICE] No existing chat index found, starting fresh');
            }

            // Load individual chat files (only active ones)
            let loadedCount = 0;
            let skippedInactive = 0;
            
            for (const [chatId, chatInfo] of Object.entries(chatIndex)) {
                try {
                    const chat = await this.loadChatFromFile(chatId);
                    if (chat) {
                        // Only load active chats into memory
                        if (chat.isActive) {
                            this.chats.set(chatId, chat);
                            loadedCount++;
                        } else {
                            skippedInactive++;
                        }
                    }
                } catch (error) {
                    console.error(`[CHAT_SERVICE] Failed to load chat ${chatId}:`, error);
                }
            }

            console.log(`[CHAT_SERVICE] Loaded ${loadedCount} active chats from storage, skipped ${skippedInactive} inactive chats`);
        } catch (error) {
            console.error('[CHAT_SERVICE] Error loading chats from storage:', error);
        }
    }

    async loadChatFromFile(chatId) {
        const filePath = path.join(this.storageConfig.chatsDir, `${chatId}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const chat = JSON.parse(data);
            
            // Convert date strings back to Date objects
            chat.createdAt = new Date(chat.createdAt);
            chat.updatedAt = new Date(chat.updatedAt);
            
            // Ensure messages array exists and convert timestamps
            if (chat.messages && Array.isArray(chat.messages)) {
                chat.messages.forEach(msg => {
                    msg.timestamp = new Date(msg.timestamp);
                });
            } else {
                chat.messages = [];
            }

            return chat;
        } catch (error) {
            console.error(`[CHAT_SERVICE] Failed to load chat file ${chatId}:`, error);
            return null;
        }
    }

    async saveChatToFile(chat) {
        const filePath = path.join(this.storageConfig.chatsDir, `${chat.id}.json`);
        try {
            // Create a serializable copy
            const chatData = {
                ...chat,
                createdAt: chat.createdAt.toISOString(),
                updatedAt: chat.updatedAt.toISOString(),
                messages: chat.messages.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp.toISOString()
                }))
            };

            await fs.writeFile(filePath, JSON.stringify(chatData, null, 2));
            await this.updateChatIndex(chat);
        } catch (error) {
            console.error(`[CHAT_SERVICE] Failed to save chat ${chat.id}:`, error);
            throw error;
        }
    }

    async updateChatIndex(chat) {
        try {
            let index = {};
            try {
                const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
                index = JSON.parse(indexData);
            } catch {
                // Index doesn't exist, start fresh
            }

            index[chat.id] = {
                title: chat.title,
                model: chat.model,
                createdAt: chat.createdAt.toISOString(),
                updatedAt: chat.updatedAt.toISOString(),
                messageCount: chat.messages.length,
                lastMessage: chat.messages.length > 0 ? 
                    chat.messages[chat.messages.length - 1].content.substring(0, 100) + '...' : 
                    'No messages'
            };

            await fs.writeFile(this.storageConfig.indexFile, JSON.stringify(index, null, 2));
        } catch (error) {
            console.error('[CHAT_SERVICE] Failed to update chat index:', error);
        }
    }

    async deleteChatFromStorage(chatId) {
        try {
            // Delete chat file
            const filePath = path.join(this.storageConfig.chatsDir, `${chatId}.json`);
            await fs.unlink(filePath);

            // Update index
            let index = {};
            try {
                const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
                index = JSON.parse(indexData);
                delete index[chatId];
                await fs.writeFile(this.storageConfig.indexFile, JSON.stringify(index, null, 2));
            } catch (error) {
                console.error('[CHAT_SERVICE] Failed to update index after deletion:', error);
            }

            console.log(`[CHAT_SERVICE] Deleted chat ${chatId} from storage`);
        } catch (error) {
            console.error(`[CHAT_SERVICE] Failed to delete chat ${chatId}:`, error);
        }
    }

    // Chat Management Methods
    async createChat(model, title = null) {
        const chatId = this.generateChatId();
        const now = new Date();
        
        const chat = {
            id: chatId,
            title: title || `Chat with ${model}`,
            model: model,
            messages: [],
            createdAt: now,
            updatedAt: now,
            isActive: true
        };

        this.chats.set(chatId, chat);
        
        // Save to file immediately (but don't wait for it to complete)
        this.saveChatToFile(chat).catch(error => {
            console.error('[CHAT_SERVICE] Failed to save new chat:', error);
        });

        // Start auto-save for this chat
        this.startAutoSave(chatId);

        console.log(`[CHAT_SERVICE] Created new chat: ${chatId} with model: ${model}`);
        return chat;
    }

    async addMessage(chatId, role, content) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            throw new Error(`Chat ${chatId} not found`);
        }

        const message = {
            id: this.generateMessageId(),
            role: role, // 'user' or 'assistant'
            content: content,
            timestamp: new Date()
        };

        chat.messages.push(message);
        chat.updatedAt = new Date();

        // Auto-generate title from first user message
        if (chat.messages.length === 1 && role === 'user' && chat.title.startsWith('Chat with')) {
            chat.title = content.length > 50 ? content.substring(0, 50) + '...' : content;
        }

        // Save to file (but don't wait for it to complete)
        this.saveChatToFile(chat).catch(error => {
            console.error('[CHAT_SERVICE] Failed to save chat during message addition:', error);
        });

        return message;
    }

    async updateMessage(chatId, messageId, content) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            throw new Error(`Chat ${chatId} not found`);
        }

        const message = chat.messages.find(m => m.id === messageId);
        if (!message) {
            throw new Error(`Message ${messageId} not found in chat ${chatId}`);
        }

        message.content = content;
        chat.updatedAt = new Date();

        // Save to file (but don't wait for it to complete)
        this.saveChatToFile(chat).catch(error => {
            console.error('[CHAT_SERVICE] Failed to save chat during message update:', error);
        });

        return message;
    }

    async deleteChat(chatId) {
        // Try to get chat from memory first, then verify it exists in storage
        let chat = this.chats.get(chatId);
        if (!chat) {
            // Try to load from storage to verify it exists
            try {
                chat = await this.loadChatFromFile(chatId);
                if (!chat) {
                    throw new Error(`Chat ${chatId} not found`);
                }
            } catch (error) {
                throw new Error(`Chat ${chatId} not found`);
            }
        }

        // Stop auto-save
        this.stopAutoSave(chatId);

        // Remove from memory
        this.chats.delete(chatId);

        // Delete from storage
        await this.deleteChatFromStorage(chatId);

        console.log(`[CHAT_SERVICE] Deleted chat: ${chatId}`);
        return true;
    }

    async getChat(chatId) {
        const chat = this.chats.get(chatId);
        
        // If chat exists in memory and is active, return it directly
        if (chat && chat.isActive) {
            return chat;
        }
        
        // For inactive chats or chats not in memory, always load from storage
        console.log(`[CHAT_SERVICE] Loading chat ${chatId} from storage (inactive or not in memory)`);
        try {
            const storedChat = await this.loadChatFromFile(chatId);
            if (storedChat) {
                console.log(`[CHAT_SERVICE] Successfully loaded chat from storage: ${storedChat.messages ? storedChat.messages.length : 0} messages`);
                
                // If this is an inactive chat, don't store it back in memory
                if (!storedChat.isActive) {
                    return storedChat;
                } else {
                    // If it's active, update memory for active management
                    this.chats.set(chatId, storedChat);
                    return storedChat;
                }
            }
        } catch (error) {
            console.error(`[CHAT_SERVICE] Failed to load chat ${chatId} from storage:`, error);
        }
        
        // Fallback to memory version if storage load failed
        return chat || null;
    }

    async getAllChats() {
        const chats = [];
        
        // Add chats from memory (active chats)
        for (const chat of this.chats.values()) {
            chats.push({
                id: chat.id,
                title: chat.title,
                model: chat.model,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
                messageCount: chat.messages.length,
                isActive: chat.isActive,
                lastMessage: chat.messages.length > 0 ? 
                    chat.messages[chat.messages.length - 1].content.substring(0, 100) + '...' : 
                    'No messages'
            });
        }
        
        // Add inactive chats from storage index
        try {
            const indexData = await fs.readFile(this.storageConfig.indexFile, 'utf8');
            const index = JSON.parse(indexData);
            
            for (const [chatId, indexEntry] of Object.entries(index)) {
                // Only add if not already in memory
                if (!this.chats.has(chatId)) {
                    chats.push({
                        id: chatId,
                        title: indexEntry.title,
                        model: indexEntry.model,
                        createdAt: new Date(indexEntry.createdAt),
                        updatedAt: new Date(indexEntry.updatedAt),
                        messageCount: indexEntry.messageCount,
                        isActive: false,
                        lastMessage: indexEntry.lastMessage
                    });
                }
            }
        } catch (error) {
            console.error('[CHAT_SERVICE] Failed to load chats from index:', error);
        }
        
        return chats.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async getChatHistory(chatId, limit = 50) {
        const chat = await this.getChat(chatId);
        if (!chat) {
            throw new Error(`Chat ${chatId} not found`);
        }

        const messages = chat.messages ? chat.messages.slice(-limit) : [];
        return messages;
    }

    // Auto-save functionality
    startAutoSave(chatId) {
        // Clear existing interval if any
        this.stopAutoSave(chatId);

        const interval = setInterval(async () => {
            const chat = this.chats.get(chatId);
            if (chat && chat.isActive) {
                try {
                    await this.saveChatToFile(chat);
                } catch (error) {
                    console.error(`[CHAT_SERVICE] Auto-save failed for chat ${chatId}:`, error);
                }
            } else {
                // Chat is no longer active, stop auto-save
                this.stopAutoSave(chatId);
            }
        }, this.storageConfig.autoSaveInterval);

        this.autoSaveIntervals.set(chatId, interval);
    }

    stopAutoSave(chatId) {
        const interval = this.autoSaveIntervals.get(chatId);
        if (interval) {
            clearInterval(interval);
            this.autoSaveIntervals.delete(chatId);
        }
    }

    async deactivateChat(chatId) {
        const chat = this.chats.get(chatId);
        if (chat) {
            chat.isActive = false;
            this.stopAutoSave(chatId);
            
            // Final save
            await this.saveChatToFile(chat);
            
            // Remove from memory - it will be loaded from storage when needed
            this.chats.delete(chatId);
            console.log(`[CHAT_SERVICE] Deactivated and removed chat ${chatId} from memory`);
        }
    }

    // Backup and maintenance
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(this.storageConfig.backupsDir, `backup-${timestamp}`);
            
            await fs.mkdir(backupDir, { recursive: true });
            
            // Copy all chat files
            const chatFiles = await fs.readdir(this.storageConfig.chatsDir);
            for (const file of chatFiles) {
                if (file.endsWith('.json')) {
                    const srcPath = path.join(this.storageConfig.chatsDir, file);
                    const destPath = path.join(backupDir, file);
                    await fs.copyFile(srcPath, destPath);
                }
            }
            
            // Copy metadata and index
            await fs.copyFile(this.storageConfig.metadataFile, path.join(backupDir, 'metadata.json'));
            await fs.copyFile(this.storageConfig.indexFile, path.join(backupDir, 'index.json'));
            
            console.log(`[CHAT_SERVICE] Created backup: ${backupDir}`);
            
            // Cleanup old backups
            await this.cleanupOldBackups();
            
            return backupDir;
        } catch (error) {
            console.error('[CHAT_SERVICE] Failed to create backup:', error);
            throw error;
        }
    }

    async cleanupOldBackups() {
        try {
            const backups = await fs.readdir(this.storageConfig.backupsDir);
            const backupDirs = backups.filter(name => name.startsWith('backup-'));
            
            if (backupDirs.length > this.storageConfig.maxBackups) {
                // Sort by creation time (oldest first)
                backupDirs.sort();
                
                const toDelete = backupDirs.slice(0, backupDirs.length - this.storageConfig.maxBackups);
                
                for (const backupDir of toDelete) {
                    const backupPath = path.join(this.storageConfig.backupsDir, backupDir);
                    await fs.rm(backupPath, { recursive: true, force: true });
                    console.log(`[CHAT_SERVICE] Deleted old backup: ${backupDir}`);
                }
            }
        } catch (error) {
            console.error('[CHAT_SERVICE] Failed to cleanup old backups:', error);
        }
    }

    async getStorageInfo() {
        try {
            const stats = {
                totalChats: this.chats.size,
                totalMessages: 0,
                storageSize: 0,
                backupCount: 0,
                lastBackup: null
            };

            // Count total messages
            for (const chat of this.chats.values()) {
                stats.totalMessages += chat.messages.length;
            }

            // Calculate storage size
            try {
                const chatFiles = await fs.readdir(this.storageConfig.chatsDir);
                for (const file of chatFiles) {
                    const filePath = path.join(this.storageConfig.chatsDir, file);
                    const stat = await fs.stat(filePath);
                    stats.storageSize += stat.size;
                }
            } catch (error) {
                console.error('[CHAT_SERVICE] Error calculating storage size:', error);
            }

            // Count backups
            try {
                const backups = await fs.readdir(this.storageConfig.backupsDir);
                const backupDirs = backups.filter(name => name.startsWith('backup-'));
                stats.backupCount = backupDirs.length;
                
                if (backupDirs.length > 0) {
                    backupDirs.sort();
                    stats.lastBackup = backupDirs[backupDirs.length - 1];
                }
            } catch (error) {
                console.error('[CHAT_SERVICE] Error counting backups:', error);
            }

            return stats;
        } catch (error) {
            console.error('[CHAT_SERVICE] Error getting storage info:', error);
            throw error;
        }
    }

    async exportChatData(chatId, format = 'json') {
        const chat = await this.getChat(chatId);
        if (!chat) {
            throw new Error(`Chat ${chatId} not found`);
        }

        if (format === 'json') {
            return {
                id: chat.id,
                title: chat.title,
                model: chat.model,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
                messages: chat.messages
            };
        } else if (format === 'txt') {
            let text = `Chat: ${chat.title}\n`;
            text += `Model: ${chat.model}\n`;
            text += `Created: ${chat.createdAt.toLocaleString()}\n`;
            text += `Updated: ${chat.updatedAt.toLocaleString()}\n`;
            text += `Messages: ${chat.messages.length}\n\n`;
            text += '=' .repeat(50) + '\n\n';

            for (const message of chat.messages) {
                text += `[${message.timestamp.toLocaleString()}] ${message.role.toUpperCase()}:\n`;
                text += `${message.content}\n\n`;
            }

            return text;
        } else {
            throw new Error(`Unsupported export format: ${format}`);
        }
    }

    // Utility methods
    generateChatId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Memory management - clean up inactive chats from memory
    cleanupMemory() {
        const inactiveChats = [];
        for (const [chatId, chat] of this.chats.entries()) {
            if (!chat.isActive) {
                // Save before removing from memory
                this.saveChatToFile(chat).then(() => {
                    console.log(`[CHAT_SERVICE] Saved and removed inactive chat ${chatId} from memory`);
                }).catch(error => {
                    console.error(`[CHAT_SERVICE] Failed to save chat ${chatId} before memory cleanup:`, error);
                });
                
                // Remove from memory - it will be loaded from storage when needed
                this.chats.delete(chatId);
                inactiveChats.push(chatId);
            }
        }
        
        if (inactiveChats.length > 0) {
            console.log(`[CHAT_SERVICE] Removed ${inactiveChats.length} inactive chats from memory`);
        }
    }

    // Start periodic memory cleanup
    startMemoryCleanup() {
        setInterval(() => {
            this.cleanupMemory();
        }, 300000); // Clean up every 5 minutes
        
        console.log('[CHAT_SERVICE] Started periodic memory cleanup');
    }

    // Cleanup method for graceful shutdown
    async cleanup() {
        console.log('[CHAT_SERVICE] Cleaning up chat service...');
        
        // Stop all auto-save intervals
        for (const [chatId, interval] of this.autoSaveIntervals) {
            clearInterval(interval);
        }
        this.autoSaveIntervals.clear();

        // Save all active chats
        const savePromises = [];
        for (const chat of this.chats.values()) {
            if (chat.isActive) {
                chat.isActive = false;
                savePromises.push(this.saveChatToFile(chat));
            }
        }

        await Promise.all(savePromises);
        console.log('[CHAT_SERVICE] Cleanup completed');
    }
}

// Create singleton instance
const chatService = new ChatService();

export default chatService; 