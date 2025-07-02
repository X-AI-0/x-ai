import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import modelRoutes from './routes/modelRoutes.js';
import discussionRoutes from './routes/discussionRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import gpuRoutes from './routes/gpuRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import socialRoutes from './routes/socialRoutes.js';
import { setupWebSocket } from './services/websocketService.js';
import gpuConfigService from './services/gpuConfigService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/models', modelRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/gpu', gpuRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/social', socialRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });
}

// Create HTTP server
const server = createServer(app);

// Setup WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}/ws`);
  
  // Verify GPU configuration on startup
  console.log('');
  console.log('🔧 Starting GPU Configuration Verification...');
  console.log('=====================================');
  
  try {
    const gpuConfig = gpuConfigService.getConfig();
    console.log('📋 Current GPU Configuration:');
    console.log(`   GPU Enabled: ${gpuConfig.enableGPU ? '✅' : '❌'}`);
    console.log(`   Force GPU: ${gpuConfig.forceGPU ? '✅' : '❌'}`);
    console.log(`   Selected GPU ID: ${gpuConfig.selectedGPU === -1 ? 'Auto' : gpuConfig.selectedGPU}`);
    console.log(`   GPU Memory Fraction: ${gpuConfig.gpuMemoryFraction || 0.95}`);
    
    if (gpuConfig.availableGPUs && gpuConfig.availableGPUs.length > 0) {
      console.log('🎯 Available GPUs:');
      gpuConfig.availableGPUs.forEach((gpu, i) => {
        const symbol = gpu.isNVIDIA ? '🚀' : '📱';
        const status = gpu.isNVIDIA ? '(NVIDIA - RECOMMENDED)' : '';
        console.log(`   ${symbol} GPU ${gpu.id}: ${gpu.name} ${status}`);
      });
      
      const nvidiaGPUs = gpuConfig.availableGPUs.filter(gpu => gpu.isNVIDIA);
      if (nvidiaGPUs.length > 0) {
        console.log(`✨ NVIDIA GPU Priority Active! Found ${nvidiaGPUs.length} NVIDIA GPU(s)`);
        console.log('⚡ All AI operations will use NVIDIA GPU acceleration');
      } else {
        console.log('⚠️  No NVIDIA GPUs detected - performance may be limited');
      }
    } else {
      console.log('🔍 Detecting GPUs for the first time...');
      await gpuConfigService.detectGPUs();
    }
    
    const ollamaOptions = gpuConfigService.getOllamaOptions();
    console.log('🛠️  Ollama GPU Options:');
    Object.entries(ollamaOptions).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
    
  } catch (error) {
    console.error('❌ GPU Configuration Error:', error.message);
  }
  
  console.log('=====================================');
  console.log('🚀 Server startup complete!');
  console.log('');
}); 