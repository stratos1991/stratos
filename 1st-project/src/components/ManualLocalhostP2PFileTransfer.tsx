import { useState, useRef, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Alert,
  Divider,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

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

/**
 * ManualLocalhostP2PFileTransfer
 *
 * A WebRTC-based P2P file transfer component that works on LAN without internet.
 * Uses manual signaling (copy-paste SDP) instead of a signaling server.
 *
 * How it works:
 * 1. Peer A creates an offer and copies the SDP
 * 2. Peer B pastes the offer, creates an answer, and copies the SDP
 * 3. Peer A pastes the answer to complete the connection
 * 4. Files can now be sent between peers
 */
export default function ManualLocalhostP2PFileTransfer() {
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'creating-offer' | 'awaiting-answer' | 'connected'
  >('disconnected');
  const [localSdp, setLocalSdp] = useState<string>('');
  const [remoteSdp, setRemoteSdp] = useState<string>('');
  const [error, setError] = useState<string>('');

  // File transfer state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [transferStatus, setTransferStatus] = useState<string>('');

  // WebRTC refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const incomingTransferRef = useRef<IncomingTransfer | null>(null);

  /**
   * Setup data channel event handlers
   */
  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      setConnectionStatus('connected');
      setError('');
    };

    channel.onclose = () => {
      setConnectionStatus('disconnected');
      dataChannelRef.current = null;
    };

    channel.onerror = (event) => {
      setError(`Data channel error: ${event}`);
    };

    channel.onmessage = (event) => {
      // Handle string messages (JSON metadata)
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data) as TransferMessage;
        handleTransferMessage(message);
      }
      // Handle binary data (file chunks)
      else if (event.data instanceof ArrayBuffer) {
        handleChunkData(event.data);
      }
    };
  }, []);

  /**
   * Handle transfer protocol messages
   */
  const handleTransferMessage = (message: TransferMessage) => {
    if (message.type === 'file-start') {
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
    } else if (message.type === 'file-end' && incomingTransferRef.current) {
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
  };

  /**
   * Handle incoming chunk data
   */
  const handleChunkData = (data: ArrayBuffer) => {
    if (!incomingTransferRef.current) return;

    const transfer = incomingTransferRef.current;
    transfer.chunks[transfer.receivedCount] = data;
    transfer.receivedCount++;

    const progress = Math.round(
      (transfer.receivedCount / transfer.totalChunks) * 100
    );
    setDownloadProgress(progress);
  };

  /**
   * Create RTCPeerConnection with LAN-only configuration
   * No STUN/TURN servers needed for local network
   */
  const createPeerConnection = useCallback(() => {
    // Empty ICE servers for LAN-only operation
    const pc = new RTCPeerConnection({
      iceServers: [],
    });

    pc.onicecandidate = (event) => {
      // Update local SDP when ICE gathering completes
      if (event.candidate === null && pc.localDescription) {
        setLocalSdp(JSON.stringify(pc.localDescription));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setConnectionStatus('disconnected');
      }
    };

    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    pcRef.current = pc;
    return pc;
  }, [setupDataChannel]);

  /**
   * Create offer (initiator side)
   */
  const createOffer = async () => {
    try {
      setError('');
      const pc = createPeerConnection();

      // Create data channel before creating offer
      const channel = pc.createDataChannel('file-transfer', {
        ordered: true,
      });
      setupDataChannel(channel);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setConnectionStatus('creating-offer');
      // SDP will be set via onicecandidate when gathering completes
    } catch (err) {
      setError(`Failed to create offer: ${err}`);
    }
  };

  /**
   * Handle received offer and create answer (responder side)
   */
  const handleOffer = async () => {
    if (!remoteSdp.trim()) {
      setError('Please paste the remote offer first');
      return;
    }

    try {
      setError('');
      const pc = createPeerConnection();

      const offer = JSON.parse(remoteSdp) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      setConnectionStatus('awaiting-answer');
      // SDP will be set via onicecandidate when gathering completes
    } catch (err) {
      setError(`Failed to create answer: ${err}`);
    }
  };

  /**
   * Set remote answer (initiator side)
   */
  const handleAnswer = async () => {
    if (!pcRef.current || !remoteSdp.trim()) {
      setError('Please paste the remote answer first');
      return;
    }

    try {
      setError('');
      const answer = JSON.parse(remoteSdp) as RTCSessionDescriptionInit;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      setError(`Failed to set remote answer: ${err}`);
    }
  };

  /**
   * Copy local SDP to clipboard
   */
  const copyLocalSdp = async () => {
    if (localSdp) {
      await navigator.clipboard.writeText(localSdp);
    }
  };

  /**
   * Paste SDP from clipboard
   */
  const pasteRemoteSdp = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRemoteSdp(text);
    } catch (err) {
      setError('Failed to read clipboard. Please paste manually.');
    }
  };

  /**
   * Send file using chunked transfer
   */
  const sendFile = async () => {
    if (!dataChannelRef.current || !selectedFile) {
      setError('No connection or file selected');
      return;
    }

    const channel = dataChannelRef.current;
    if (channel.readyState !== 'open') {
      setError('Data channel is not open');
      return;
    }

    const file = selectedFile;
    const arrayBuffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

    setUploadProgress(0);
    setTransferStatus(`Sending: ${file.name}`);

    // Send file-start message
    channel.send(
      JSON.stringify({
        type: 'file-start',
        name: file.name,
        fileType: file.type || 'application/octet-stream',
        totalChunks,
        totalSize: arrayBuffer.byteLength,
      } as FileStartMessage)
    );

    // Send chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
      const chunk = arrayBuffer.slice(start, end);

      // Wait for buffer to drain if needed
      while (channel.bufferedAmount > CHUNK_SIZE * 4) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      channel.send(chunk);

      const progress = Math.round(((i + 1) / totalChunks) * 100);
      setUploadProgress(progress);
    }

    // Send file-end message
    channel.send(JSON.stringify({ type: 'file-end' } as FileEndMessage));

    setTimeout(() => {
      setUploadProgress(0);
      setTransferStatus('');
    }, 1000);
    setSelectedFile(null);
  };

  /**
   * Download received file
   */
  const downloadFile = (file: ReceivedFile) => {
    const url = URL.createObjectURL(file.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Close connection and reset state
   */
  const disconnect = () => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setConnectionStatus('disconnected');
    setLocalSdp('');
    setRemoteSdp('');
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'success';
      case 'creating-offer':
      case 'awaiting-answer':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusLabel = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'creating-offer':
        return 'Offer Created - Share with peer';
      case 'awaiting-answer':
        return 'Answer Created - Share with peer';
      default:
        return 'Disconnected';
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
      <Typography variant="h5" gutterBottom>
        Manual LAN P2P File Transfer (No Server)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        WebRTC file transfer for local networks. No internet or signaling server required.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Chip label={getStatusLabel()} color={getStatusColor()} />
        {connectionStatus !== 'disconnected' && (
          <Button variant="outlined" color="error" size="small" onClick={disconnect}>
            Disconnect
          </Button>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Step 1: Create Offer or Handle Offer */}
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        Step 1: Initiate or Join Connection
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Button
          variant="contained"
          onClick={createOffer}
          disabled={connectionStatus !== 'disconnected'}
        >
          Create Offer (Initiator)
        </Button>
        <Button
          variant="outlined"
          onClick={handleOffer}
          disabled={connectionStatus !== 'disconnected' || !remoteSdp}
        >
          Create Answer (Responder)
        </Button>
      </Box>

      {/* Local SDP */}
      <TextField
        label="Local SDP (copy and share with peer)"
        multiline
        rows={3}
        fullWidth
        value={localSdp}
        slotProps={{ input: { readOnly: true } }}
        sx={{ mb: 1 }}
      />
      <Button
        size="small"
        startIcon={<ContentCopyIcon />}
        onClick={copyLocalSdp}
        disabled={!localSdp}
        sx={{ mb: 2 }}
      >
        Copy Local SDP
      </Button>

      <Divider sx={{ mb: 2 }} />

      {/* Step 2: Paste Remote SDP */}
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        Step 2: Paste Remote SDP
      </Typography>
      <TextField
        label="Remote SDP (paste from peer)"
        multiline
        rows={3}
        fullWidth
        value={remoteSdp}
        onChange={(e) => setRemoteSdp(e.target.value)}
        sx={{ mb: 1 }}
      />
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button size="small" startIcon={<ContentPasteIcon />} onClick={pasteRemoteSdp}>
          Paste from Clipboard
        </Button>
        {connectionStatus === 'creating-offer' && (
          <Button
            variant="contained"
            onClick={handleAnswer}
            disabled={!remoteSdp}
          >
            Set Remote Answer
          </Button>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Step 3: File Transfer */}
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        Step 3: Transfer Files
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="outlined" component="label" disabled={connectionStatus !== 'connected'}>
          Select File
          <input
            type="file"
            hidden
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />
        </Button>
        {selectedFile && <Typography variant="body2">{selectedFile.name}</Typography>}
        <Button
          variant="contained"
          color="primary"
          startIcon={<SendIcon />}
          onClick={sendFile}
          disabled={!selectedFile || connectionStatus !== 'connected'}
        >
          Send
        </Button>
      </Box>

      {/* Upload Progress */}
      {uploadProgress > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="primary">
              Uploading: {transferStatus.replace('Sending: ', '')}
            </Typography>
            <Typography variant="body2" color="primary">
              {uploadProgress}%
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={uploadProgress} color="primary" />
        </Box>
      )}

      {/* Download Progress */}
      {downloadProgress > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="secondary">
              Downloading: {transferStatus.replace('Receiving: ', '')}
            </Typography>
            <Typography variant="body2" color="secondary">
              {downloadProgress}%
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={downloadProgress} color="secondary" />
        </Box>
      )}

      {/* Received Files */}
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
  );
}
