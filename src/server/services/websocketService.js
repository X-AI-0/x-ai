let clients = new Set();

/**
 * Setup WebSocket server
 */
export function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection established');
    clients.add(ws);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection_established',
      message: 'Connected to Ollama Discussion System',
      timestamp: new Date().toISOString()
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleWebSocketMessage(ws, message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      clients.delete(ws);
    });

    // Handle connection error
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  console.log('WebSocket server setup complete');
}

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case 'ping':
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      break;

    case 'subscribe_discussion':
      // Client wants to subscribe to a specific discussion
      ws.discussionId = message.discussionId;
      ws.send(JSON.stringify({
        type: 'subscribed',
        discussionId: message.discussionId
      }));
      break;

    case 'unsubscribe_discussion':
      // Client wants to unsubscribe from discussion updates
      delete ws.discussionId;
      ws.send(JSON.stringify({
        type: 'unsubscribed'
      }));
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`
      }));
  }
}

/**
 * Broadcast message to all connected clients
 */
export function broadcastToClients(data) {
  const message = JSON.stringify({
    ...data,
    timestamp: new Date().toISOString()
  });

  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending message to client:', error);
        clients.delete(client);
      }
    } else {
      clients.delete(client);
    }
  });
}

/**
 * Broadcast message to clients subscribed to a specific discussion
 */
export function broadcastToDiscussionClients(discussionId, data) {
  const message = JSON.stringify({
    ...data,
    timestamp: new Date().toISOString()
  });

  clients.forEach(client => {
    if (client.readyState === 1 && client.discussionId === discussionId) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending message to client:', error);
        clients.delete(client);
      }
    }
  });
}

/**
 * Get number of connected clients
 */
export function getConnectedClientsCount() {
  return clients.size;
}

/**
 * Send message to specific client
 */
export function sendToClient(client, data) {
  if (client.readyState === 1) {
    try {
      client.send(JSON.stringify({
        ...data,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error sending message to specific client:', error);
      clients.delete(client);
    }
  }
} 