import { useState, useEffect, useRef } from 'react';
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Chip,
  Paper,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Alert,
} from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import SendIcon from '@mui/icons-material/Send';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import InputForm from './components/InputForm';
import SubmissionsList from './components/SubmissionsList';
import ManualLocalhostP2PFileTransfer from './components/ManualLocalhostP2PFileTransfer';
import { useOnlineStatus } from './hooks/useOnlineStatus';
/**
 * PeerJS - Simple peer-to-peer with WebRTC
 *
 * PeerJS wraps the browser's WebRTC implementation to provide a complete,
 * configurable, and easy-to-use peer-to-peer connection API.
 *
 * Key classes:
 * - Peer: Main class for creating a peer that can connect to other peers
 * - DataConnection: Represents a data channel connection between two peers
 * - MediaConnection: Represents a media stream connection (audio/video)
 *
 * @see https://peerjs.com/docs/ - Official PeerJS Documentation
 * @see https://github.com/peers/peerjs - GitHub Repository
 */
import Peer, { DataConnection } from 'peerjs';
enum LogLevel {
  None = 0,
  Error = 1,
  Warning = 2,
  All = 3,
}
/** Represents a file received via P2P connection */
interface ReceivedFile {
  name: string;
  data: Blob;
  timestamp: number;
}

/** Message types for chunked file transfer */
interface FileStartMessage {
  type: 'file-start';
  name: string;
  fileType: string;
  totalChunks: number;
  totalSize: number;
}

interface FileChunkMessage {
  type: 'file-chunk';
  index: number;
  data: ArrayBuffer;
}

interface FileEndMessage {
  type: 'file-end';
}

type TransferMessage = FileStartMessage | FileChunkMessage | FileEndMessage;

/** Tracks an incoming file transfer in progress */
interface IncomingTransfer {
  name: string;
  fileType: string;
  totalChunks: number;
  totalSize: number;
  chunks: ArrayBuffer[];
  receivedCount: number;
}

/** Chunk size: 64KB for good balance between progress updates and efficiency */
const CHUNK_SIZE = 64 * 1024;

function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const isOnline = useOnlineStatus();

  /**
   * P2P State Management
   *
   * PeerJS requires tracking several pieces of state:
   * - myPeerId: Unique identifier assigned by PeerServer (via peer.id property)
   * - remotePeerId: The peer ID we want to connect to
   * - connectionStatus: Current state of the peer/connection
   */
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [connectionStatus, setConnectionStatus] =
    useState<string>('Disconnected');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [transferStatus, setTransferStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isServerDisconnected, setIsServerDisconnected] = useState(false);

  /**
   * Refs for PeerJS objects
   *
   * peerRef: The Peer instance - main object for P2P functionality
   * connectionRef: Active DataConnection to a remote peer
   *
   * Using refs instead of state because:
   * 1. These objects have their own internal state and event system
   * 2. We don't want React re-renders when internal peer state changes
   * 3. We need stable references for event handlers
   */
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const incomingTransferRef = useRef<IncomingTransfer | null>(null);

  /**
   * Initialize PeerJS connection on component mount
   *
   * Creates a new Peer instance that connects to our PeerServer.
   * The Peer constructor accepts optional id and configuration options.
   *
   * @see https://peerjs.com/docs/#peer
   */
  useEffect(() => {
    /**
     * new Peer([id], [options])
     *
     * Configuration options:
     * - host: PeerServer hostname (default: '0.peerjs.com' for cloud)
     * - port: PeerServer port (default: 443)
     * - path: PeerServer path (default: '/')
     * - secure: Use SSL/TLS (default: true if host is not localhost)
     * - key: API key for cloud PeerServer (default: 'peerjs')
     * - debug: Log level 0-3 (default: 0)
     * - config: RTCPeerConnection config for ICE/TURN servers
     *
     * If no id is provided, PeerServer generates a unique brokering ID
     */
    const peer = new Peer({
      debug: LogLevel.All as number,
      logFunction: (level, message, rest) => {
        console.log(
          `[PeerJS][${LogLevel[level]}]: ${message} Rest:`,
          rest ? rest : 'none'
        );
      },
      // key: 'peerjs', // Using our own PeerServer, so no API key needed
      // host: window.location.hostname,
      // port:
      //   import.meta.env.PROD && window.location.hostname !== 'localhost'
      //     ? 443
      //     : Number(window.location.port) || 80,
      // path: '/peerjs',
      // secure: window.location.protocol === 'https:',
    });

    /**
     * Event: 'open'
     *
     * Fired when the connection to the PeerServer is established.
     * The callback receives the peer's brokering ID as a parameter.
     * This ID is what other peers use to connect to us.
     *
     * @param id - The unique peer ID assigned by PeerServer
     */
    peer.on('open', (id) => {
      setMyPeerId(id);
      setConnectionStatus('Ready');
      setIsServerDisconnected(false);
    });

    /**
     * Event: 'connection'
     *
     * Triggered when a remote peer initiates a data connection to us.
     * The callback receives a DataConnection object for bidirectional
     * data transfer with the connecting peer.
     *
     * @param conn - DataConnection object for the incoming connection
     */
    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    /**
     * Event: 'error'
     *
     * Fired on errors. Errors on the Peer are almost always fatal.
     *
     * Error types:
     * - 'browser-incompatible': Browser doesn't support WebRTC
     * - 'disconnected': Already disconnected from server
     * - 'invalid-id': ID contains illegal characters
     * - 'invalid-key': API key is invalid
     * - 'network': Lost connection to signaling server
     * - 'peer-unavailable': Peer ID doesn't exist
     * - 'ssl-unavailable': PeerServer requires SSL
     * - 'server-error': Unable to reach PeerServer
     * - 'socket-error': Socket error
     * - 'socket-closed': Socket closed unexpectedly
     * - 'unavailable-id': ID is already taken
     * - 'webrtc': Native WebRTC errors
     */
    peer.on('error', (err) => {
      setError(`Peer error: ${err.message}`);
      setConnectionStatus('Error');
    });

    /**
     * Event: 'disconnected'
     *
     * Fired when the peer is disconnected from the signaling server.
     * Existing data connections remain active, but no new connections
     * can be established until reconnected.
     *
     * Use peer.reconnect() to attempt reconnection with the same ID.
     * The peer's connections property still contains active connections.
     */
    peer.on('disconnected', () => {
      setIsServerDisconnected(true);
      setConnectionStatus('Server Disconnected');
    });

    peerRef.current = peer;

    /**
     * Cleanup: peer.destroy()
     *
     * Close the connection to the server and terminate all connections.
     * This cannot be undone - the Peer object is no longer usable.
     * After destroy(), peer.destroyed becomes true.
     */
    return () => {
      alert('Destroying peer connection');
      peer.destroy();
    };
  }, []);

  /**
   * Setup DataConnection event handlers
   *
   * DataConnection represents a connection to a remote peer for data transfer.
   * It wraps WebRTC's RTCDataChannel with a simple API.
   *
   * Key properties:
   * - conn.peer: Remote peer's ID
   * - conn.open: Boolean indicating if connection is ready
   * - conn.label: Unique connection identifier
   * - conn.reliable: Whether delivery is guaranteed (default: true)
   * - conn.serialization: Data format ('binary', 'json', 'none')
   *
   * PeerJS uses BinaryPack serialization by default, which supports:
   * - JSON types (objects, arrays, strings, numbers, booleans)
   * - Binary data (ArrayBuffer, Blob, TypedArrays)
   *
   * @see https://peerjs.com/docs/#dataconnection
   */
  const setupConnection = (conn: DataConnection) => {
    connectionRef.current = conn;

    /**
     * Event: 'open'
     *
     * Fired when the data connection is ready for use.
     * You should wait for this event before calling conn.send().
     */
    conn.on('open', () => {
      setConnectionStatus(`Connected to ${conn.peer}`);
      setError('');
    });

    /**
     * Event: 'data'
     *
     * Fired when data is received from the remote peer.
     * Handles chunked file transfer protocol:
     * 1. 'file-start': Initialize transfer with metadata
     * 2. 'file-chunk': Receive and store each chunk, update progress
     * 3. 'file-end': Assemble chunks into final file
     *
     * @param data - The received data, automatically deserialized
     */
    conn.on('data', (data: unknown) => {
      const message = data as TransferMessage;

      if (message.type === 'file-start') {
        // Initialize incoming transfer
        incomingTransferRef.current = {
          name: message.name,
          fileType: message.fileType,
          totalChunks: message.totalChunks,
          totalSize: message.totalSize,
          chunks: new Array(message.totalChunks),
          receivedCount: 0,
        };
        setDownloadProgress(0);
        setTransferStatus(`Receiving: ${message.name}`);
      } else if (message.type === 'file-chunk' && incomingTransferRef.current) {
        // Store chunk and update progress
        const transfer = incomingTransferRef.current;
        transfer.chunks[message.index] = message.data;
        transfer.receivedCount++;

        const progress = Math.round(
          (transfer.receivedCount / transfer.totalChunks) * 100
        );
        setDownloadProgress(progress);
      } else if (message.type === 'file-end' && incomingTransferRef.current) {
        // Assemble final file from chunks
        const transfer = incomingTransferRef.current;
        const blob = new Blob(transfer.chunks, { type: transfer.fileType });

        setReceivedFiles((prev) => [
          ...prev,
          { name: transfer.name, data: blob, timestamp: Date.now() },
        ]);

        incomingTransferRef.current = null;
        setDownloadProgress(0);
        setTransferStatus('');
      }
    });

    /**
     * Event: 'close'
     *
     * Fired when the connection is closed by either peer.
     * Use this to clean up resources and update UI state.
     */
    conn.on('close', () => {
      setConnectionStatus('Disconnected');
      connectionRef.current = null;
    });

    /**
     * Event: 'error'
     *
     * Fired on connection-specific errors.
     * Unlike Peer errors, these are usually recoverable.
     */
    conn.on('error', (err) => {
      setError(`Connection error: ${err.message}`);
    });
  };

  /**
   * Initiate a connection to a remote peer
   *
   * peer.connect(id, [options]) creates a DataConnection to the specified peer.
   *
   * Connection options:
   * - label: Unique identifier for this connection (auto-generated if omitted)
   * - metadata: Arbitrary data to send with the connection request
   * - serialization: 'binary' (default), 'json', 'none'
   * - reliable: Use reliable data channel (default: true)
   *   - true: Guarantees delivery order (like TCP)
   *   - false: May lose/reorder packets (like UDP, lower latency)
   *
   * The connection is not immediately open - wait for 'open' event.
   *
   * @see https://peerjs.com/docs/#peerconnect
   */
  const connectToPeer = () => {
    if (!peerRef.current || !remotePeerId.trim()) return;

    const conn = peerRef.current.connect(remotePeerId.trim(), {
      reliable: true, // Ensures ordered, guaranteed delivery (important for files)
    });
    setupConnection(conn);
  };

  /**
   * Send a file to the connected peer using chunked transfer
   *
   * Implements a chunked file transfer protocol:
   * 1. Send 'file-start' with metadata (name, type, total chunks)
   * 2. Send each chunk with index for ordered reassembly
   * 3. Send 'file-end' to signal completion
   *
   * Benefits of chunking:
   * - Real progress tracking for both sender and receiver
   * - Better handling of large files
   * - Allows for future features like pause/resume
   *
   * @see https://peerjs.com/docs/#dataconnection-send
   */
  const sendFile = async () => {
    if (!connectionRef.current || !selectedFile) {
      setError('No connection or file selected');
      return;
    }

    const conn = connectionRef.current;
    const file = selectedFile;

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

    setUploadProgress(0);
    setTransferStatus(`Sending: ${file.name}`);

    // Send file-start message with metadata
    conn.send({
      type: 'file-start',
      name: file.name,
      fileType: file.type,
      totalChunks,
      totalSize: arrayBuffer.byteLength,
    } as FileStartMessage);

    // Send chunks with progress updates
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
      const chunk = arrayBuffer.slice(start, end);

      conn.send({
        type: 'file-chunk',
        index: i,
        data: chunk,
      } as FileChunkMessage);

      // Update progress after each chunk
      const progress = Math.round(((i + 1) / totalChunks) * 100);
      setUploadProgress(progress);

      // Small delay to prevent overwhelming the connection
      if (i < totalChunks - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    // Send file-end message
    conn.send({ type: 'file-end' } as FileEndMessage);

    // Reset state after short delay to show 100%
    setTimeout(() => {
      setUploadProgress(0);
      setTransferStatus('');
    }, 1000);
    setSelectedFile(null);
  };

  /**
   * Trigger browser download for a received file
   *
   * Creates a temporary object URL from the Blob and triggers
   * a download via a dynamically created anchor element.
   */
  const downloadFile = (file: ReceivedFile) => {
    const url = URL.createObjectURL(file.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const disconnectFromServer = () => {
    if (!peerRef.current) return;

    peerRef.current.disconnect();
    // setConnectionStatus('Disconnected from Server');
  };

  /**
   * Reconnect to PeerServer after disconnection
   *
   * peer.reconnect() attempts to reconnect to the signaling server
   * using the same peer ID. This preserves existing data connections.
   *
   * Note: If peer.destroyed is true, reconnect() will fail.
   * In that case, a new Peer instance must be created.
   *
   * @see https://peerjs.com/docs/#peerreconnect
   */
  const reconnectToServer = () => {
    if (!peerRef.current) return;

    if (peerRef.current.destroyed) {
      setError('Peer was destroyed. Please refresh the page.');
      return;
    }

    setConnectionStatus('Reconnecting...');
    peerRef.current.reconnect();
  };

  const handleSubmitSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  console.log(peerRef.current?.connections);
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            PWA Form App
          </Typography>
          <Chip
            icon={isOnline ? <WifiIcon /> : <WifiOffIcon />}
            label={isOnline ? 'Online' : 'Offline'}
            color={isOnline ? 'success' : 'warning'}
            size="small"
          />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        {/* P2P File Transfer Section */}
        <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
          <Typography variant="h5" gutterBottom>
            P2P File Transfer
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Box
            sx={{
              display: 'flex',
              gap: 2,
              mb: 2,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <TextField
              label="Your Peer ID"
              value={myPeerId}
              slotProps={{ input: { readOnly: true } }}
              size="small"
              sx={{ minWidth: 280 }}
            />
            <Chip
              label={connectionStatus}
              color={
                connectionStatus.startsWith('Connected')
                  ? 'success'
                  : isServerDisconnected
                  ? 'error'
                  : 'default'
              }
            />
            {isServerDisconnected && (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={reconnectToServer}
              >
                Reconnect
              </Button>
            )}
            <Button
              variant="outlined"
              color="warning"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={disconnectFromServer}
            >
              Disconnect
            </Button>
          </Box>

          <Box
            sx={{
              display: 'flex',
              gap: 2,
              mb: 2,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <TextField
              label="Remote Peer ID"
              value={remotePeerId}
              onChange={(e) => setRemotePeerId(e.target.value)}
              size="small"
              sx={{ minWidth: 280 }}
            />
            <Button
              variant="contained"
              onClick={connectToPeer}
              disabled={!myPeerId}
            >
              Connect
            </Button>
          </Box>

          <Box
            sx={{
              display: 'flex',
              gap: 2,
              mb: 2,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Button variant="outlined" component="label">
              Select File
              <input
                type="file"
                hidden
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </Button>
            {selectedFile && (
              <Typography variant="body2">{selectedFile.name}</Typography>
            )}
            <Button
              variant="contained"
              color="primary"
              startIcon={<SendIcon />}
              onClick={sendFile}
              disabled={!selectedFile || !connectionRef.current}
            >
              Send
            </Button>
          </Box>

          {/* Upload Progress */}
          {uploadProgress > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: 0.5,
                }}
              >
                <Typography variant="body2" color="primary">
                  Uploading: {transferStatus.replace('Sending: ', '')}
                </Typography>
                <Typography variant="body2" color="primary">
                  {uploadProgress}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={uploadProgress}
                color="primary"
              />
            </Box>
          )}

          {/* Download Progress */}
          {downloadProgress > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: 0.5,
                }}
              >
                <Typography variant="body2" color="secondary">
                  Downloading: {transferStatus.replace('Receiving: ', '')}
                </Typography>
                <Typography variant="body2" color="secondary">
                  {downloadProgress}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={downloadProgress}
                color="secondary"
              />
            </Box>
          )}

          {receivedFiles.length > 0 && (
            <>
              <Typography variant="h6" sx={{ mt: 2 }}>
                Received Files
              </Typography>
              <List dense>
                {receivedFiles.map((file) => (
                  <ListItem
                    key={file.timestamp}
                    secondaryAction={
                      <Button
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => downloadFile(file)}
                      >
                        Download
                      </Button>
                    }
                  >
                    <ListItemText primary={file.name} />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Paper>

        {/* Manual LAN P2P File Transfer (No Server) */}
        <ManualLocalhostP2PFileTransfer />

        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Submit Your Message
          </Typography>
          <InputForm onSubmitSuccess={handleSubmitSuccess} />
        </Box>

        <Box>
          <SubmissionsList refresh={refreshKey} />
        </Box>
      </Container>
    </>
  );
}

export default App;
