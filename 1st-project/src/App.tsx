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
import InputForm from './components/InputForm';
import SubmissionsList from './components/SubmissionsList';
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

/** Represents a file received via P2P connection */
interface ReceivedFile {
  name: string;
  data: Blob;
  timestamp: number;
}

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
  const [transferProgress, setTransferProgress] = useState<number>(0);
  const [error, setError] = useState<string>('');

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
      host: window.location.hostname,
      port:
        import.meta.env.PROD && window.location.hostname !== 'localhost'
          ? 443
          : Number(window.location.port) || 80,
      path: '/peerjs',
      secure: window.location.protocol === 'https:',
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
     * The data is automatically deserialized based on the
     * connection's serialization format (default: BinaryPack).
     *
     * BinaryPack allows sending complex objects including ArrayBuffers,
     * which is ideal for file transfer.
     *
     * @param data - The received data, automatically deserialized
     */
    conn.on('data', (data: unknown) => {
      const fileData = data as {
        name: string;
        type: string;
        data: ArrayBuffer;
      };
      if (fileData.name && fileData.data) {
        const blob = new Blob([fileData.data], { type: fileData.type });
        setReceivedFiles((prev) => [
          ...prev,
          { name: fileData.name, data: blob, timestamp: Date.now() },
        ]);
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
   * Send a file to the connected peer
   *
   * dataConnection.send(data) transmits data to the remote peer.
   *
   * With default BinaryPack serialization, you can send:
   * - Strings, numbers, booleans, null
   * - Objects and arrays (will be serialized)
   * - ArrayBuffer, TypedArrays, Blob, File
   *
   * For file transfer, we convert File to ArrayBuffer because:
   * 1. ArrayBuffer is more universally supported
   * 2. Allows progress tracking on the sender side
   * 3. Easier to reconstruct as Blob on receiver
   *
   * Note: Large files may need chunking for reliability.
   * PeerJS handles chunking internally for data > 16KB.
   *
   * @see https://peerjs.com/docs/#dataconnection-send
   */
  const sendFile = async () => {
    if (!connectionRef.current || !selectedFile) {
      setError('No connection or file selected');
      return;
    }

    setTransferProgress(10);
    // Convert File to ArrayBuffer for transmission
    const arrayBuffer = await selectedFile.arrayBuffer();
    setTransferProgress(50);

    // Send file metadata along with data for reconstruction on receiver
    connectionRef.current.send({
      name: selectedFile.name,
      type: selectedFile.type,
      data: arrayBuffer,
    });

    setTransferProgress(100);
    setTimeout(() => setTransferProgress(0), 1000);
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

  const handleSubmitSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

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

          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
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
                connectionStatus.startsWith('Connected') ? 'success' : 'default'
              }
            />
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

          {transferProgress > 0 && (
            <LinearProgress
              variant="determinate"
              value={transferProgress}
              sx={{ mb: 2 }}
            />
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
