"use client";
import React, { useState, useRef, useCallback } from 'react';
import { 
    generateMangaPage, 
    MangaStyle, 
    MangaStory, 
    MangaPage,
    MANGA_STYLES 
} from '@/services/geminiService';
import { uploadToShelby, listShelbyImages, ShelbyBlob } from '@/services/shelbyService';

type View = 'home' | 'create' | 'gallery' | 'viewer';

// Separate MangaViewer component to properly use useState
interface MangaViewerProps {
    story: MangaStory;
    username: string;
    onContinue: () => void;
    onHome: () => void;
}

const MangaViewer: React.FC<MangaViewerProps> = ({ story, username, onContinue, onHome }) => {
    const [pageIndex, setPageIndex] = useState(story.pages.length - 1);
    const [isRevealing, setIsRevealing] = useState(true);
    const [revealProgress, setRevealProgress] = useState(0);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFilename, setUploadFilename] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; url?: string } | null>(null);
    const [uploadedPages, setUploadedPages] = useState<Set<string>>(new Set()); // Track uploaded pages
    const currentPage = story.pages[pageIndex];
    const isCurrentPageUploaded = uploadedPages.has(currentPage.id);

    // Hiệu ứng vẽ từng phần khi chuyển trang hoặc load lần đầu
    React.useEffect(() => {
        setIsRevealing(true);
        setRevealProgress(0);
        
        const duration = 2000; // 2 giây
        const steps = 50;
        const stepTime = duration / steps;
        let currentStep = 0;
        
        const interval = setInterval(() => {
            currentStep++;
            setRevealProgress((currentStep / steps) * 100);
            
            if (currentStep >= steps) {
                clearInterval(interval);
                setIsRevealing(false);
            }
        }, stepTime);
        
        return () => clearInterval(interval);
    }, [pageIndex, currentPage.id]);

    const handleUpload = async () => {
        if (!uploadFilename.trim()) return;
        
        setIsUploading(true);
        setUploadResult(null);
        
        // Add extension if not present
        let filename = uploadFilename.trim();
        if (!filename.match(/\.(png|jpg|jpeg)$/i)) {
            filename += '.png';
        }
        
        const result = await uploadToShelby(currentPage.imageBase64, username, filename);
        
        setIsUploading(false);
        if (result.success) {
            setUploadedPages(prev => new Set(prev).add(currentPage.id)); // Mark as uploaded
            setUploadResult({ 
                success: true, 
                message: 'Uploaded successfully!',
                url: result.explorerUrl 
            });
        } else {
            setUploadResult({ 
                success: false, 
                message: result.error || 'Upload failed' 
            });
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', alignItems: 'center' }}>
            <h3 style={{ color: '#FFD700', fontSize: '14px', margin: 0, textAlign: 'center' }}>
                {story.title}
            </h3>

            {/* Manga Image với hiệu ứng reveal */}
            <div style={{
                width: '100%',
                maxWidth: '350px',
                aspectRatio: '3/4',
                background: '#1a1a2e',
                borderRadius: '8px',
                border: '2px solid #5D4037',
                overflow: 'hidden',
                position: 'relative',
            }}>
                <img
                    src={currentPage.imageBase64}
                    alt={`Page ${pageIndex + 1}`}
                    style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'contain',
                    }}
                />
                
                {/* Overlay che ảnh - reveal từ trên xuống */}
                {isRevealing && (
                    <div style={{
                        position: 'absolute',
                        top: `${revealProgress}%`,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(to bottom, rgba(26, 26, 46, 0.3) 0%, #1a1a2e 5%, #1a1a2e 100%)',
                        pointerEvents: 'none',
                        transition: 'top 40ms linear',
                    }} />
                )}
                
                {/* Hiệu ứng bút vẽ */}
                {isRevealing && (
                    <div style={{
                        position: 'absolute',
                        top: `${revealProgress}%`,
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: '24px',
                        filter: 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.8))',
                        animation: 'pencilWiggle 0.1s ease-in-out infinite',
                        pointerEvents: 'none',
                    }}>
                        ✏️
                    </div>
                )}
            </div>
            
            {/* Progress bar khi đang reveal */}
            {isRevealing && (
                <div style={{
                    width: '100%',
                    maxWidth: '350px',
                    height: '4px',
                    background: '#3D1A1A',
                    borderRadius: '2px',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${revealProgress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #FFD700, #FFA500)',
                        transition: 'width 40ms linear',
                    }} />
                </div>
            )}

            {/* Page Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                    onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                    disabled={pageIndex === 0 || isRevealing}
                    style={{ ...smallButtonStyle, opacity: (pageIndex === 0 || isRevealing) ? 0.5 : 1 }}
                >
                    ←
                </button>
                <span style={{ color: '#AAA', fontSize: '12px' }}>
                    {pageIndex + 1} / {story.pages.length}
                </span>
                <button
                    onClick={() => setPageIndex(Math.min(story.pages.length - 1, pageIndex + 1))}
                    disabled={pageIndex === story.pages.length - 1 || isRevealing}
                    style={{ ...smallButtonStyle, opacity: (pageIndex === story.pages.length - 1 || isRevealing) ? 0.5 : 1 }}
                >
                    →
                </button>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={onContinue} disabled={isRevealing} style={{...buttonStyle, opacity: isRevealing ? 0.5 : 1}}>
                    ➕ Add Page
                </button>
                <button 
                    onClick={() => setShowUploadModal(true)} 
                    disabled={isRevealing || isCurrentPageUploaded} 
                    style={{
                        ...smallButtonStyle, 
                        background: isCurrentPageUploaded ? '#4caf50' : '#1976d2', 
                        opacity: (isRevealing || isCurrentPageUploaded) ? 0.7 : 1
                    }}
                >
                    {isCurrentPageUploaded ? '✓ Uploaded' : '☁️ Upload'}
                </button>
                <button onClick={onHome} disabled={isRevealing} style={{ ...smallButtonStyle, opacity: isRevealing ? 0.5 : 1 }}>
                    🏠 Home
                </button>
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: '#2D1B1B',
                        border: '3px solid #5D4037',
                        borderRadius: '12px',
                        padding: '20px',
                        width: '90%',
                        maxWidth: '320px',
                    }}>
                        <h4 style={{ color: '#FFD700', margin: '0 0 16px', textAlign: 'center' }}>
                            ☁️ Upload to Shelby
                        </h4>
                        
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ color: '#FFD700', fontSize: '11px', display: 'block', marginBottom: '6px' }}>
                                File name
                            </label>
                            <input
                                type="text"
                                value={uploadFilename}
                                onChange={(e) => setUploadFilename(e.target.value)}
                                placeholder="my-manga-page"
                                style={{
                                    width: '100%',
                                    background: '#1a1a2e',
                                    border: '2px solid #5D4037',
                                    borderRadius: '6px',
                                    padding: '10px',
                                    color: 'white',
                                    fontFamily: 'PixelFont, Arial, sans-serif',
                                    fontSize: '12px',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                            <div style={{ color: '#888', fontSize: '10px', marginTop: '4px' }}>
                                Will be saved as: {username}/images/{uploadFilename || 'filename'}.png
                            </div>
                        </div>

                        {uploadResult && (
                            <div style={{
                                padding: '8px',
                                borderRadius: '6px',
                                marginBottom: '12px',
                                background: uploadResult.success ? '#1b5e20' : '#b71c1c',
                                color: 'white',
                                fontSize: '11px',
                                textAlign: 'center',
                            }}>
                                {uploadResult.message}
                                {uploadResult.url && (
                                    <div style={{ marginTop: '4px', wordBreak: 'break-all' }}>
                                        <a href={uploadResult.url} target="_blank" rel="noopener noreferrer" style={{ color: '#90caf9' }}>
                                            View on Shelby →
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button
                                onClick={handleUpload}
                                disabled={isUploading || !uploadFilename.trim()}
                                style={{
                                    ...buttonStyle,
                                    opacity: (isUploading || !uploadFilename.trim()) ? 0.5 : 1,
                                    maxWidth: '140px',
                                }}
                            >
                                {isUploading ? '⏳ Uploading...' : '☁️ Upload'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowUploadModal(false);
                                    setUploadResult(null);
                                    setUploadFilename('');
                                }}
                                style={{ ...smallButtonStyle }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* CSS Animation cho bút vẽ */}
            <style>{`
                @keyframes pencilWiggle {
                    0%, 100% { transform: translate(-50%, -50%) rotate(-5deg); }
                    50% { transform: translate(-50%, -50%) rotate(5deg); }
                }
            `}</style>
        </div>
    );
};

const MangaStudio: React.FC<{ username?: string }> = ({ username = 'anonymous' }) => {
    const [view, setView] = useState<View>('home');
    const [selectedStyle, setSelectedStyle] = useState<MangaStyle>('shounen');
    const [characterImage, setCharacterImage] = useState<string | null>(null);
    const [characterDesc, setCharacterDesc] = useState('');
    const [storyContext, setStoryContext] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentStory, setCurrentStory] = useState<MangaStory | null>(null);
    const [galleryImages, setGalleryImages] = useState<ShelbyBlob[]>([]);
    const [isLoadingGallery, setIsLoadingGallery] = useState(false);
    const [previewImage, setPreviewImage] = useState<ShelbyBlob | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 500;

    // Load images from Shelby
    const loadGallery = useCallback(async () => {
        if (isLoadingGallery) return; // Prevent duplicate calls
        setIsLoadingGallery(true);
        const result = await listShelbyImages(username);
        if (result.success && result.blobs) {
            setGalleryImages(result.blobs);
        }
        setIsLoadingGallery(false);
    }, [username, isLoadingGallery]);

    // Handle image upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setCharacterImage(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    // Generate manga page
    const handleGenerate = async () => {
        if (!storyContext.trim()) {
            setError('Please enter a story context');
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            const imageBase64 = await generateMangaPage({
                characterImage: characterImage || undefined,
                characterDescription: characterDesc,
                storyContext: storyContext,
                style: selectedStyle,
                previousPages: currentStory?.pages.map(p => p.imageBase64),
            });

            const newPage: MangaPage = {
                id: `page_${Date.now()}`,
                imageBase64,
                prompt: storyContext,
                timestamp: Date.now(),
            };

            let story: MangaStory;
            if (currentStory) {
                story = {
                    ...currentStory,
                    pages: [...currentStory.pages, newPage],
                    updatedAt: Date.now(),
                };
            } else {
                story = {
                    id: `story_${Date.now()}`,
                    title: storyContext.substring(0, 30) + '...',
                    style: selectedStyle,
                    pages: [newPage],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
            }

            // Story chỉ giữ trong memory, user upload lên Shelby khi muốn lưu
            setCurrentStory(story);
            setView('viewer');
            setStoryContext(''); // Clear for next page
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate manga');
        } finally {
            setIsGenerating(false);
        }
    };

    // Continue story
    const handleContinue = () => {
        setView('create');
    };

    // Render home view
    const renderHome = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎨</div>
            <h2 style={{ color: '#FFD700', fontSize: '20px', margin: 0, textShadow: '2px 2px 0 #000' }}>
                Manga Studio
            </h2>
            <p style={{ color: '#AAA', fontSize: '12px', textAlign: 'center', margin: 0 }}>
                Create your own manga with AI!
            </p>
            
            <button
                onClick={() => { setCurrentStory(null); setView('create'); }}
                style={buttonStyle}
            >
                ✨ Create New Manga
            </button>
            
            <button
                onClick={() => { loadGallery(); setView('gallery'); }}
                style={{ ...buttonStyle, background: '#5D4037' }}
            >
                📚 My Gallery
            </button>
        </div>
    );

    // Render create view
    const renderCreate = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            <h3 style={{ color: '#FFD700', fontSize: '16px', margin: 0, textAlign: 'center' }}>
                {currentStory ? `Continue: ${currentStory.title}` : 'Create New Manga'}
            </h3>

            {/* Character Image Upload */}
            {!currentStory && (
                <div style={sectionStyle}>
                    <label style={labelStyle}>Character Image (optional)</label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                    />
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            ...inputStyle,
                            height: '80px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            backgroundImage: characterImage ? `url(${characterImage})` : 'none',
                            backgroundSize: 'contain',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                        }}
                    >
                        {!characterImage && <span style={{ color: '#888' }}>📷 Tap to upload</span>}
                    </div>
                    {characterImage && (
                        <button 
                            onClick={() => setCharacterImage(null)}
                            style={{ ...smallButtonStyle, background: '#c62828' }}
                        >
                            Remove Image
                        </button>
                    )}
                </div>
            )}

            {/* Character Description */}
            {!currentStory && (
                <div style={sectionStyle}>
                    <label style={labelStyle}>Character Description</label>
                    <input
                        type="text"
                        value={characterDesc}
                        onChange={(e) => setCharacterDesc(e.target.value)}
                        placeholder="e.g., A young ninja with spiky hair..."
                        style={inputStyle}
                    />
                </div>
            )}

            {/* Style Selection */}
            {!currentStory && (
                <div style={sectionStyle}>
                    <label style={labelStyle}>Manga Style</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {MANGA_STYLES.map(style => (
                            <button
                                key={style.id}
                                onClick={() => setSelectedStyle(style.id)}
                                style={{
                                    ...smallButtonStyle,
                                    background: selectedStyle === style.id ? '#7BC043' : '#3D1A1A',
                                    border: selectedStyle === style.id ? '2px solid #5D9B3A' : '2px solid #5D4037',
                                }}
                            >
                                {style.emoji} {style.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Story Context */}
            <div style={sectionStyle}>
                <label style={labelStyle}>
                    {currentStory ? 'What happens next?' : 'Story / Scene'}
                </label>
                <textarea
                    value={storyContext}
                    onChange={(e) => setStoryContext(e.target.value)}
                    placeholder={currentStory 
                        ? "Describe what happens in the next page..."
                        : "e.g., The hero discovers a hidden temple in the forest..."
                    }
                    style={{ ...inputStyle, height: '80px', resize: 'none' }}
                />
            </div>

            {/* Error message */}
            {error && (
                <div style={{ color: '#ff5252', fontSize: '12px', textAlign: 'center' }}>
                    {error}
                </div>
            )}

            {/* Generate Button - centered with loading effect */}
            <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                gap: '12px',
                marginTop: '8px',
            }}>
                {isGenerating && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <div style={{
                            fontSize: '32px',
                            animation: 'pencilDraw 0.5s ease-in-out infinite',
                        }}>
                            ✏️
                        </div>
                        <div style={{
                            color: '#FFD700',
                            fontSize: '12px',
                            textAlign: 'center',
                        }}>
                            AI is drawing your manga...
                        </div>
                        <div style={{
                            width: '200px',
                            height: '6px',
                            background: '#3D1A1A',
                            borderRadius: '3px',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                width: '30%',
                                height: '100%',
                                background: 'linear-gradient(90deg, #FFD700, #FFA500)',
                                borderRadius: '3px',
                                animation: 'loadingBar 1.5s ease-in-out infinite',
                            }} />
                        </div>
                    </div>
                )}
                
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    style={{
                        ...buttonStyle,
                        opacity: isGenerating ? 0.5 : 1,
                        cursor: isGenerating ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isGenerating ? '⏳ Generating...' : '🎨 Generate Manga Page'}
                </button>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes pencilDraw {
                    0%, 100% { transform: rotate(-10deg) translateY(0); }
                    25% { transform: rotate(5deg) translateY(-3px); }
                    50% { transform: rotate(-5deg) translateY(0); }
                    75% { transform: rotate(10deg) translateY(-3px); }
                }
                @keyframes loadingBar {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(250%); }
                    100% { transform: translateX(-100%); }
                }
            `}</style>

            <button
                onClick={() => setView(currentStory ? 'viewer' : 'home')}
                style={{ ...smallButtonStyle, alignSelf: 'center' }}
            >
                ← Back
            </button>
        </div>
    );

    // Download image helper
    const handleDownload = async (blob: ShelbyBlob) => {
        try {
            const response = await fetch(blob.url);
            const data = await response.blob();
            const url = window.URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = blob.name.split('/').pop() || 'manga.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download failed:', err);
        }
    };

    // Render gallery view - images from Shelby
    const renderGallery = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            <h3 style={{ color: '#FFD700', fontSize: '16px', margin: 0, textAlign: 'center' }}>
                📚 My Gallery
            </h3>

            {isLoadingGallery ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                    Loading...
                </div>
            ) : galleryImages.length === 0 ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                    No images uploaded yet. Create manga and upload to Shelby!
                </div>
            ) : (
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: '8px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                }}>
                    {galleryImages.map(blob => {
                        const filename = blob.name.split('/').pop() || blob.name;
                        return (
                            <div
                                key={blob.name}
                                onClick={() => setPreviewImage(blob)}
                                style={{
                                    background: '#3D1A1A',
                                    border: '2px solid #5D4037',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                }}
                            >
                                <img 
                                    src={blob.url} 
                                    alt={filename}
                                    style={{ 
                                        width: '100%', 
                                        aspectRatio: '3/4',
                                        objectFit: 'cover',
                                    }}
                                />
                                <div style={{ 
                                    padding: '6px', 
                                    color: '#FFD700', 
                                    fontSize: '10px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}>
                                    {filename}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Image Preview Modal */}
            {previewImage && (
                <div 
                    onClick={() => setPreviewImage(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.9)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '20px',
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            maxWidth: '90%',
                            maxHeight: '80%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '12px',
                        }}
                    >
                        <img 
                            src={previewImage.url} 
                            alt={previewImage.name}
                            style={{ 
                                maxWidth: '100%',
                                maxHeight: 'calc(80vh - 60px)',
                                objectFit: 'contain',
                                borderRadius: '8px',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => handleDownload(previewImage)}
                                style={{ ...buttonStyle, maxWidth: '150px' }}
                            >
                                ⬇️ Download
                            </button>
                            <button
                                onClick={() => setPreviewImage(null)}
                                style={{ ...smallButtonStyle }}
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <button
                onClick={() => setView('home')}
                style={{ ...smallButtonStyle, alignSelf: 'center' }}
            >
                ← Back
            </button>
        </div>
    );

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: 'white',
            padding: isMobile ? '12px' : '16px',
            width: '100%',
            maxWidth: '400px',
            fontFamily: 'PixelFont, Arial, sans-serif',
        }}>
            {view === 'home' && renderHome()}
            {view === 'create' && renderCreate()}
            {view === 'gallery' && renderGallery()}
            {view === 'viewer' && currentStory && (
                <MangaViewer 
                    story={currentStory}
                    username={username}
                    onContinue={handleContinue}
                    onHome={() => { setCurrentStory(null); setView('home'); }}
                />
            )}
        </div>
    );
};

// Styles
const buttonStyle: React.CSSProperties = {
    background: '#7BC043',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '8px',
    border: '2px solid #5D9B3A',
    cursor: 'pointer',
    fontFamily: 'PixelFont, Arial, sans-serif',
    fontSize: '14px',
    touchAction: 'manipulation',
    width: '100%',
    maxWidth: '250px',
};

const smallButtonStyle: React.CSSProperties = {
    background: '#3E2723',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '2px solid #5D4037',
    cursor: 'pointer',
    fontFamily: 'PixelFont, Arial, sans-serif',
    fontSize: '11px',
    touchAction: 'manipulation',
};

const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
};

const labelStyle: React.CSSProperties = {
    color: '#FFD700',
    fontSize: '11px',
};

const inputStyle: React.CSSProperties = {
    background: '#1a1a2e',
    border: '2px solid #5D4037',
    borderRadius: '6px',
    padding: '10px',
    color: 'white',
    fontFamily: 'PixelFont, Arial, sans-serif',
    fontSize: '12px',
    outline: 'none',
};

export default MangaStudio;
