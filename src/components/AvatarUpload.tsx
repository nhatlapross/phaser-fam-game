// src/components/AvatarUpload.tsx
import React, { useState, useRef } from 'react';
import { IPFSService } from '../services/ipfsService';
import { UserService } from '../game/UserService';

interface AvatarUploadProps {
  currentAvatar?: string | null;
  onSuccess?: (avatarUrl: string) => void;
  onError?: (error: string) => void;
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatar,
  onSuccess,
  onError,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatar || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ipfsUrl, setIpfsUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to IPFS
    setUploading(true);
    try {
      const url = await IPFSService.uploadImage(file);
      setIpfsUrl(url);
      onError?.('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
      onError?.(errorMessage);
      setPreviewUrl(currentAvatar || null);
      setIpfsUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!ipfsUrl) {
      onError?.('No image uploaded');
      return;
    }

    setSaving(true);
    try {
      const updatedUser = await UserService.updateUser({ avatar: ipfsUrl });
      
      if (updatedUser) {
        onSuccess?.(ipfsUrl);
      } else {
        onError?.('Failed to update profile');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save avatar';
      onError?.(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPreviewUrl(currentAvatar || null);
    setIpfsUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.avatarContainer}>
        {previewUrl ? (
          <img src={previewUrl} alt="Avatar" style={styles.avatar} />
        ) : (
          <div style={styles.placeholder}>No Avatar</div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={styles.fileInput}
        disabled={uploading || saving}
      />

      <div style={styles.buttonGroup}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || saving}
          style={styles.button}
        >
          {uploading ? 'Uploading...' : 'Choose Image'}
        </button>

        {ipfsUrl && (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ ...styles.button, ...styles.saveButton }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              style={{ ...styles.button, ...styles.cancelButton }}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {ipfsUrl && (
        <div style={styles.urlDisplay}>
          <small>IPFS URL: {ipfsUrl}</small>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
  },
  avatarContainer: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    overflow: 'hidden',
    border: '3px solid #4CAF50',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
  },
  avatar: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  placeholder: {
    color: '#999',
    fontSize: '14px',
    textAlign: 'center',
  },
  fileInput: {
    display: 'none',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    borderRadius: '5px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#4CAF50',
    color: 'white',
    transition: 'background-color 0.3s',
  },
  saveButton: {
    backgroundColor: '#2196F3',
  },
  cancelButton: {
    backgroundColor: '#f44336',
  },
  urlDisplay: {
    maxWidth: '100%',
    wordBreak: 'break-all',
    textAlign: 'center',
    color: '#666',
  },
};
