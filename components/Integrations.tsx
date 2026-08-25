import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import { ArrowLeftIcon, LinkIcon, NotionIcon, TrashIcon, CloudIcon, SparklesIcon, Loader2Icon as LoaderIcon } from './icons';
import { dataService } from '../services/dataService';
import { notionService } from '../services/notionService';
import { localFileService } from '../services/localFileService';
import { googleDriveService } from '../services/googleDriveService';
import { generateDriveFileTags } from '../services/geminiService';
import { generateNotionEmbeddings, generateDriveEmbeddings, generateLocalEmbeddings, generateAllEmbeddings } from '../services/autoEmbeddings';
import type { Integrations as IntegrationsType, Block } from '../types';
import { BlockType } from '../types';
import Alert from './Alert';
import { v4 as uuidv4 } from 'uuid';

interface IntegrationsProps {
    navigateToDashboard: () => void;
}

const Integrations: React.FC<IntegrationsProps> = ({ navigateToDashboard }) => {
    const [integrations, setIntegrations] = useState<IntegrationsType | null>(null);
    const [notionApiKey, setNotionApiKey] = useState('');
    const [showNotionForm, setShowNotionForm] = useState(false);
    
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [showGeminiForm, setShowGeminiForm] = useState(false);
    
    const [isVerifying, setIsVerifying] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    
    const [isConnectingDrive, setIsConnectingDrive] = useState(false);
    const [driveFiles, setDriveFiles] = useState<any[]>([]);
    const [isFetchingDriveFiles, setIsFetchingDriveFiles] = useState(false);
    const [currentDriveFolderId, setCurrentDriveFolderId] = useState('root');
    const [driveFolderHistory, setDriveFolderHistory] = useState<{id: string, name: string}[]>([{id: 'root', name: 'My Drive'}]);
    const [selectedDriveFiles, setSelectedDriveFiles] = useState<any[]>([]);
    const [showDriveBrowser, setShowDriveBrowser] = useState(false);

    // Embedding generation state
    const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
    const [embeddingProgress, setEmbeddingProgress] = useState<string>('');
    const [embeddingStats, setEmbeddingStats] = useState<{ notion: number; drive: number; local: number } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        const currentIntegrations = dataService.getIntegrations();
        setIntegrations(currentIntegrations);
        if (!currentIntegrations.notion.apiKey) {
            setShowNotionForm(true);
        }
        if (currentIntegrations.googleDrive?.selectedFiles) {
            setSelectedDriveFiles(currentIntegrations.googleDrive.selectedFiles);
        }
        try {
            const customGeminiKey = localStorage.getItem('AURENEX_CUSTOM_API_KEY');
            if (customGeminiKey) {
                setGeminiApiKey(customGeminiKey);
            }
        } catch (e) {
            console.warn("Could not access localStorage for Gemini API Key", e);
        }
        googleDriveService.loadScripts().catch(console.error);
    }, []);

    const handleConnectNotion = () => {
        setShowNotionForm(true);
        setSuccessMessage(null);
        setErrorMessage(null);
    };

    const handleSaveNotionKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!notionApiKey.trim()) {
            setErrorMessage("API Key cannot be empty.");
            return;
        }
        
        setIsVerifying(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        const result = await notionService.validateApiKey(notionApiKey);

        if (result.isValid) {
            dataService.saveNotionApiKey(notionApiKey);
            setSuccessMessage("API Key verified. Syncing your workspace, this may take a moment...");

            await notionService.syncAllAccessiblePages(notionApiKey);

            setIntegrations(dataService.getIntegrations());
            setShowNotionForm(false);
            setNotionApiKey('');
            setSuccessMessage("Notion connected and workspace synced successfully!");
            
            // Auto-generate embeddings for Notion
            await generateEmbeddingsForSource('notion');
        } else {
            setErrorMessage(result.error || "Invalid API Key. Please check the key and try again.");
        }
        setIsVerifying(false);
    };

    const handleDisconnectNotion = async () => {
        dataService.disconnectNotion();
        await dataService.clearNotionPagesCache();
        setIntegrations(dataService.getIntegrations());
        setSuccessMessage("Notion has been disconnected.");
        setErrorMessage(null);
        setShowNotionForm(true);
    };

    const handleSaveGeminiKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);
        
        try {
            if (!geminiApiKey.trim()) {
                localStorage.removeItem('AURENEX_CUSTOM_API_KEY');
                setSuccessMessage("Custom Google AI Studio API key removed. Using default.");
                setShowGeminiForm(false);
                return;
            }

            localStorage.setItem('AURENEX_CUSTOM_API_KEY', geminiApiKey.trim());
            setSuccessMessage("Custom Google AI Studio API key saved! It will be used for all AI generation.");
            setShowGeminiForm(false);
            // Force refresh the page to re-initialize Gemini client
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            setErrorMessage("Could not save to local storage. Are cookies/site data blocked?");
        }
    };

    const handleDisconnectGemini = () => {
        try {
            localStorage.removeItem('AURENEX_CUSTOM_API_KEY');
            setGeminiApiKey('');
            setSuccessMessage("Custom Google AI Studio API key removed.");
            setErrorMessage(null);
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            setErrorMessage("Could not modify local storage.");
        }
    };

    const fetchDriveFiles = async (folderId: string, accessToken: string) => {
        setIsFetchingDriveFiles(true);
        try {
            const files = await googleDriveService.getFiles(accessToken, folderId);
            setDriveFiles(files);
        } catch (error: any) {
            const errStr = String(error.message || error);
            if (errStr.includes("expired") || errStr.includes("401")) {
                dataService.disconnectGoogleDrive();
                setIntegrations(dataService.getIntegrations());
                setShowDriveBrowser(false);
                setErrorMessage("Google Drive connection expired. Please reconnect.");
            } else {
                console.error("Failed to fetch Drive files:", error);
                setErrorMessage("Failed to fetch Google Drive files.");
            }
        } finally {
            setIsFetchingDriveFiles(false);
        }
    };

    const handleConnectGoogleDrive = async () => {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
        const appId = import.meta.env.VITE_GOOGLE_APP_ID;

        if (!clientId || !apiKey || !appId) {
            setErrorMessage("Google Drive configuration is missing. Please check your .env file.");
            return;
        }

        setIsConnectingDrive(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            await googleDriveService.loadScripts();
            const accessToken = await googleDriveService.authenticate(clientId);
            dataService.saveGoogleDriveIntegration(accessToken, selectedDriveFiles);
            setIntegrations(dataService.getIntegrations());
            setShowDriveBrowser(true);
            await fetchDriveFiles('root', accessToken);
            
            // Auto-generate embeddings for Drive
            await generateEmbeddingsForSource('drive');
        } catch (error: any) {
            console.error("Google Drive connection failed:", error);
            setErrorMessage("Failed to connect to Google Drive. See console for details.");
        } finally {
            setIsConnectingDrive(false);
        }
    };

    const handleOpenDriveBrowser = async () => {
        if (!integrations?.googleDrive?.accessToken) return;
        setShowDriveBrowser(true);
        if (driveFiles.length === 0) {
            await fetchDriveFiles(currentDriveFolderId, integrations.googleDrive.accessToken);
        }
    };

    const handleNavigateDriveFolder = async (folderId: string, folderName: string) => {
        if (!integrations?.googleDrive?.accessToken) return;
        setCurrentDriveFolderId(folderId);
        setDriveFolderHistory([...driveFolderHistory, { id: folderId, name: folderName }]);
        await fetchDriveFiles(folderId, integrations.googleDrive.accessToken);
    };

    const handleNavigateDriveBack = async () => {
        if (!integrations?.googleDrive?.accessToken || driveFolderHistory.length <= 1) return;
        const newHistory = [...driveFolderHistory];
        newHistory.pop();
        const prevFolder = newHistory[newHistory.length - 1];
        setDriveFolderHistory(newHistory);
        setCurrentDriveFolderId(prevFolder.id);
        await fetchDriveFiles(prevFolder.id, integrations.googleDrive.accessToken);
    };

    const toggleDriveFileSelection = async (file: any) => {
        const isSelected = selectedDriveFiles.some(f => f.id === file.id);
        let newSelection;
        if (isSelected) {
            newSelection = selectedDriveFiles.filter(f => f.id !== file.id);
        } else {
            const currentPath = driveFolderHistory.map(f => f.name).join(' / ');
            const fileWithPath = { ...file, path: currentPath };
            newSelection = [...selectedDriveFiles, fileWithPath];
            if (integrations?.googleDrive?.accessToken) {
                const db = dataService.getDb();
                if (!db.integrations.googleDrive.fileTags) {
                    db.integrations.googleDrive.fileTags = {};
                }
                if (!db.integrations.googleDrive.fileTags[file.id]) {
                    try {
                        const content = await googleDriveService.getFileContent(file.id, file.mimeType, integrations.googleDrive.accessToken);
                        const tags = await generateDriveFileTags(file, content);
                        db.integrations.googleDrive.fileTags[file.id] = tags;
                        dataService.updateUser({}); // Trigger save
                    } catch (e) {
                        console.error("Failed to generate tags for Drive file", e);
                    }
                }
            }
        }
        setSelectedDriveFiles(newSelection);
        if (integrations?.googleDrive?.accessToken) {
            dataService.saveGoogleDriveIntegration(integrations.googleDrive.accessToken, newSelection);
            setIntegrations(dataService.getIntegrations());
        }
    };

    const handleDisconnectGoogleDrive = () => {
        dataService.disconnectGoogleDrive();
        setIntegrations(dataService.getIntegrations());
        setSuccessMessage("Google Drive has been disconnected.");
        setErrorMessage(null);
    };

    // Embedding generation functions
    const generateEmbeddingsForSource = async (sourceType: 'notion' | 'drive' | 'local') => {
        setIsGeneratingEmbeddings(true);
        setEmbeddingProgress(`Starting ${sourceType} embedding generation...`);
        setEmbeddingStats(null);
        
        try {
            let result;
            if (sourceType === 'notion') {
                const integrations = dataService.getIntegrations();
                if (integrations.notion?.apiKey) {
                    result = await generateNotionEmbeddings(integrations.notion.apiKey, (progress) => {
                        setEmbeddingProgress(progress.message);
                    });
                }
            } else if (sourceType === 'drive') {
                const integrations = dataService.getIntegrations();
                if (integrations.googleDrive?.accessToken && integrations.googleDrive.selectedFiles?.length > 0) {
                    result = await generateDriveEmbeddings(
                        integrations.googleDrive.accessToken,
                        integrations.googleDrive.selectedFiles,
                        (progress) => {
                            setEmbeddingProgress(progress.message);
                        }
                    );
                }
            } else if (sourceType === 'local') {
                result = await generateLocalEmbeddings((progress) => {
                    setEmbeddingProgress(progress.message);
                });
            }
            
            if (result) {
                setEmbeddingStats({
                    notion: result.success,
                    drive: result.success,
                    local: result.success
                });
                setSuccessMessage(`${sourceType} embeddings generated: ${result.success} succeeded, ${result.failed} failed`);
            }
        } catch (error) {
            console.error(`Failed to generate ${sourceType} embeddings:`, error);
            setErrorMessage(`Failed to generate ${sourceType} embeddings: ${error}`);
        } finally {
            setIsGeneratingEmbeddings(false);
        }
    };

    const generateAllEmbeddingsForAllSources = async () => {
        setIsGeneratingEmbeddings(true);
        setEmbeddingProgress('Starting full embedding generation...');
        setEmbeddingStats(null);
        
        try {
            const results = await generateAllEmbeddings((progress: any) => {
                setEmbeddingProgress(progress.message);
            });
            
            setEmbeddingStats({
                notion: results.notion.success,
                drive: results.drive.success,
                local: results.local.success
            });
            
            setSuccessMessage(`All embeddings generated: Notion ${results.notion.success}, Drive ${results.drive.success}, Local ${results.local.success}`);
        } catch (error) {
            console.error('Failed to generate all embeddings:', error);
            setErrorMessage(`Failed to generate embeddings: ${error}`);
        } finally {
            setIsGeneratingEmbeddings(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setIsUploading(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        
        let successCount = 0;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const textContent = await localFileService.parseFile(file);
                if (textContent) {
                    const blocks: Block[] = textContent.split('\n\n').filter(t => t.trim()).map(text => ({
                        id: uuidv4(),
                        type: BlockType.P,
                        content: text.trim()
                    }));
                    
                    dataService.createPage(file.name, blocks);
                    successCount++;
                }
            } catch (err: any) {
                console.error(`Failed to process ${file.name}:`, err);
                setErrorMessage(`Failed to process ${file.name}: ${err.message}`);
            }
        }
        
        if (successCount > 0) {
            setSuccessMessage(`Successfully imported ${successCount} document(s) to your library.`);
        }
        
        setIsUploading(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const isNotionConnected = !!integrations?.notion.apiKey;
    const hasDriveToken = !!integrations?.googleDrive?.accessToken;
    const isGoogleDriveExpired = integrations?.googleDrive?.expiresAt ? Date.now() > integrations.googleDrive.expiresAt : false;
    const isGoogleDriveConnected = hasDriveToken && !isGoogleDriveExpired;

    return (
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-muted/50 animate-fade-in">
            <div className="max-w-3xl mx-auto">
                <button onClick={navigateToDashboard} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-semibold">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Back to Library
                </button>
                
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground">Integrations & Imports</h1>
                    <p className="text-muted-foreground mt-2">
                        Connect Aurenex to other apps or import local files to empower your AI assistant.
                    </p>
                </div>
                
                <Card title="Available Integrations" className="animate-fade-in-up">
                    <div className="space-y-6">
                        {/* Gemini / AI Studio Integration */}
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-background border rounded-lg">
                                <SparklesIcon className="w-8 h-8 text-foreground"/>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-foreground">Google AI Studio API Key</h3>
                                <p className="text-muted-foreground text-sm mb-3">
                                    Provide your own Google AI Studio API key to power Aurenex's AI features instead of using the default one.
                                </p>
                                {geminiApiKey ? (
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-medium text-green-600 dark:text-green-400">Custom Key Active</span>
                                        <button onClick={handleDisconnectGemini} className="flex items-center gap-1.5 text-xs px-2 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-md">
                                            <TrashIcon className="w-3 h-3"/> Remove Key
                                        </button>
                                        <button onClick={() => setShowGeminiForm(!showGeminiForm)} className="flex items-center gap-1.5 text-xs px-2 py-1 bg-secondary/80 hover:bg-secondary text-secondary-foreground rounded-md">
                                            Update Key
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowGeminiForm(true)} className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                                        <LinkIcon className="w-4 h-4"/> Set Custom Key
                                    </button>
                                )}
                            </div>
                        </div>

                        {showGeminiForm && (
                             <form onSubmit={handleSaveGeminiKey} className="ml-16 mt-4 p-4 bg-muted rounded-lg border animate-fade-in">
                                 <label htmlFor="gemini-key" className="block text-sm font-medium text-foreground mb-2">AI Studio API Key</label>
                                 <input
                                     id="gemini-key"
                                     type="password"
                                     value={geminiApiKey}
                                     onChange={e => setGeminiApiKey(e.target.value)}
                                     placeholder="AIza..."
                                     className="w-full bg-input border rounded-md py-2 px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                 />
                                  <div className="my-4">
                                    <Alert>
                                        <h5 className="font-semibold text-foreground mb-1">Security Note</h5>
                                        <p className="font-semibold">This API key is stored exclusively in your browser's local storage.</p>
                                    </Alert>
                                  </div>

                                 <div className="flex gap-2 mt-4">
                                    <button type="submit" className="text-sm font-semibold px-4 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                                        Save Key & Reload
                                    </button>
                                    <button type="button" onClick={() => setShowGeminiForm(false)} className="text-sm font-semibold px-4 py-1.5 bg-secondary text-secondary-foreground rounded-md hover:bg-accent">Cancel</button>
                                 </div>
                             </form>
                        )}

                        <hr className="border-border" />

                        {/* Notion Integration */}
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-background border rounded-lg">
                                <NotionIcon className="w-8 h-8 text-foreground"/>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-foreground">Notion</h3>
                                <p className="text-muted-foreground text-sm mb-3">
                                    Allow AurePal to search your Notion pages and databases.
                                </p>
                                {isNotionConnected ? (
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-medium text-green-600 dark:text-green-400">Connected</span>
                                        <button onClick={handleDisconnectNotion} className="flex items-center gap-1.5 text-xs px-2 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-md">
                                            <TrashIcon className="w-3 h-3"/> Disconnect
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={handleConnectNotion} className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                                        <LinkIcon className="w-4 h-4"/> Connect
                                    </button>
                                )}
                            </div>
                        </div>

                        {showNotionForm && !isNotionConnected && (
                             <form onSubmit={handleSaveNotionKey} className="ml-16 mt-4 p-4 bg-muted rounded-lg border animate-fade-in">
                                 <label htmlFor="notion-key" className="block text-sm font-medium text-foreground mb-2">Notion API Key</label>
                                 <input
                                     id="notion-key"
                                     type="password"
                                     value={notionApiKey}
                                     onChange={e => setNotionApiKey(e.target.value)}
                                     placeholder="secret_..."
                                     className="w-full bg-input border rounded-md py-2 px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                 />
                                  <div className="my-4">
                                    <Alert>
                                        <h5 className="font-semibold text-foreground mb-1">Security Note</h5>
                                        <p className="font-semibold">Your API key is stored exclusively in your browser's local storage. It is never sent to any server. All communication happens directly from your browser to Notion.</p>
                                    </Alert>
                                  </div>

                                 <div className="flex gap-2 mt-4">
                                    <button type="submit" disabled={isVerifying} className="text-sm font-semibold px-4 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {isVerifying ? 'Verifying & Syncing...' : 'Save Key'}
                                    </button>
                                    <button type="button" onClick={() => setShowNotionForm(false)} className="text-sm font-semibold px-4 py-1.5 bg-secondary text-secondary-foreground rounded-md hover:bg-accent">Cancel</button>
                                 </div>
                             </form>
                        )}

                        <hr className="border-border" />

                         {/* Local Files Import */}
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-background border rounded-lg">
                                <CloudIcon className="w-8 h-8 text-foreground"/>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-foreground">Local Documents</h3>
                                <p className="text-muted-foreground text-sm mb-3">
                                    Import PDF, DOCX, TXT, or MD files directly into your Aurenex library.
                                </p>
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    multiple
                                    accept=".pdf,.docx,.txt,.md,.csv"
                                />
                                <button 
                                    onClick={() => fileInputRef.current?.click()} 
                                    disabled={isUploading}
                                    className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                                >
                                    <LinkIcon className="w-4 h-4"/> {isUploading ? 'Importing...' : 'Select Files'}
                                </button>
                            </div>
                        </div>

                        <hr className="border-border" />

                        {/* Google Drive Integration */}
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-background border rounded-lg">
                                <svg className="w-8 h-8 text-foreground" viewBox="0 0 87.3 127.3" xmlns="http://www.w3.org/2000/svg"><path d="m62.7 103.5-21.8-37.8L19.1 103.5h43.6z" fill="#0066da"/><path d="m21.8 37.8-21.8 37.8 21.8 37.8 21.8-37.8z" fill="#00ac47"/><path d="m65.5 37.8-21.8 37.8 21.8 37.8 21.8-37.8z" fill="#ea4335"/><path d="M21.8 37.8 43.6 0l21.8 37.8z" fill="#00832d"/><path d="M65.5 37.8 87.3 0 43.6 0z" fill="#2684fc"/><path d="M21.8 37.8 0 75.6 43.6 75.6z" fill="#ffba00"/></svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-foreground">Google Drive</h3>
                                <p className="text-muted-foreground text-sm mb-3">
                                    Sign in with your Google account to select files and folders to use in RAG.
                                </p>
                                {isGoogleDriveConnected ? (
                                    <div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-sm font-medium text-green-600 dark:text-green-400">Connected</span>
                                            <button onClick={handleDisconnectGoogleDrive} className="flex items-center gap-1.5 text-xs px-2 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-md">
                                                <TrashIcon className="w-3 h-3"/> Disconnect
                                            </button>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {integrations?.googleDrive?.selectedFiles?.length || 0} file(s) selected.
                                            <button onClick={handleOpenDriveBrowser} className="ml-2 text-primary hover:underline">Select more files</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {isGoogleDriveExpired && (
                                            <div className="text-sm text-orange-500 font-medium">Session expired (tokens last 1 hour). Please reconnect to restore automatic file access.</div>
                                        )}
                                        <button onClick={handleConnectGoogleDrive} disabled={isConnectingDrive} className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                                            <LinkIcon className="w-4 h-4"/> {isConnectingDrive ? 'Connecting...' : (isGoogleDriveExpired ? 'Reconnect to Drive' : 'Connect & Select Files')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {showDriveBrowser && isGoogleDriveConnected && (
                            <div className="ml-16 mt-4 p-4 bg-muted rounded-lg border animate-fade-in">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={handleNavigateDriveBack} 
                                            disabled={driveFolderHistory.length <= 1}
                                            className="p-1 rounded hover:bg-background disabled:opacity-50"
                                        >
                                            <ArrowLeftIcon className="w-4 h-4" />
                                        </button>
                                        <span className="font-medium text-sm">
                                            {driveFolderHistory[driveFolderHistory.length - 1].name}
                                        </span>
                                    </div>
                                    <button onClick={() => setShowDriveBrowser(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
                                </div>
                                
                                {isFetchingDriveFiles ? (
                                    <div className="text-center py-8 text-sm text-muted-foreground">Loading files...</div>
                                ) : (
                                    <div className="max-h-64 overflow-y-auto border rounded-md bg-background">
                                        {driveFiles.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-muted-foreground">No files found in this folder.</div>
                                        ) : (
                                            <ul className="divide-y">
                                                {driveFiles.map(file => {
                                                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                                                    const isSelected = selectedDriveFiles.some(f => f.id === file.id);
                                                    return (
                                                        <li key={file.id} className="flex items-center justify-between p-2 hover:bg-muted/50">
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <span className="text-muted-foreground">
                                                                    {isFolder ? '📁' : '📄'}
                                                                </span>
                                                                <span className="text-sm truncate" title={file.name}>{file.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {isFolder ? (
                                                                    <button 
                                                                        onClick={() => handleNavigateDriveFolder(file.id, file.name)}
                                                                        className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded hover:bg-accent"
                                                                    >
                                                                        Open
                                                                    </button>
                                                                ) : null}
                                                                <button 
                                                                    onClick={() => toggleDriveFileSelection(file)}
                                                                    className={`text-xs px-2 py-1 rounded border ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground hover:bg-muted'}`}
                                                                >
                                                                    {isSelected ? 'Selected' : 'Select'}
                                                                </button>
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {errorMessage && <Alert variant="destructive">{errorMessage}</Alert>}
                        {successMessage && <Alert variant="success">{successMessage}</Alert>}

                        <hr className="border-border" />

                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-background border rounded-lg">
                                <SparklesIcon className="w-8 h-8 text-foreground"/>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-foreground">Auto Scope Preferences</h3>
                                <p className="text-muted-foreground text-sm mb-3">
                                    Choose which integrations are included when using the "Auto" search scope.
                                </p>
                                <select 
                                    value={integrations?.autoScopePreference || 'both'}
                                    onChange={(e) => {
                                        const val = e.target.value as 'notion' | 'drive' | 'both';
                                        dataService.saveAutoScopePreference(val);
                                        setIntegrations(dataService.getIntegrations());
                                    }}
                                    className="w-full bg-input border rounded-md py-2 px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="both">Both Notion & Google Drive</option>
                                    <option value="notion">Notion Only</option>
                                    <option value="drive">Google Drive Only</option>
                                </select>
                            </div>
                        </div>

                        <hr className="border-border" />

                        {/* Embedding Generation */}
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-background border rounded-lg">
                                <LoaderIcon className="w-8 h-8 text-foreground animate-spin"/>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-foreground">Vector Embeddings</h3>
                                <p className="text-muted-foreground text-sm mb-3">
                                    Generate local vector embeddings for connected sources. This enables semantic search and RAG without sending data to external APIs. Embeddings are stored locally in your browser.
                                </p>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button 
                                            onClick={() => generateEmbeddingsForSource('notion')}
                                            disabled={isGeneratingEmbeddings || !integrations?.notion?.apiKey}
                                            className="text-xs px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isGeneratingEmbeddings ? 'Generating...' : 'Generate Notion Embeddings'}
                                        </button>
                                        <button 
                                            onClick={() => generateEmbeddingsForSource('drive')}
                                            disabled={isGeneratingEmbeddings || !integrations?.googleDrive?.accessToken || !integrations?.googleDrive?.selectedFiles?.length}
                                            className="text-xs px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isGeneratingEmbeddings ? 'Generating...' : 'Generate Drive Embeddings'}
                                        </button>
                                        <button 
                                            onClick={() => generateEmbeddingsForSource('local')}
                                            disabled={isGeneratingEmbeddings}
                                            className="text-xs px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isGeneratingEmbeddings ? 'Generating...' : 'Generate Local Embeddings'}
                                        </button>
                                        <button 
                                            onClick={generateAllEmbeddingsForAllSources}
                                            disabled={isGeneratingEmbeddings}
                                            className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isGeneratingEmbeddings ? 'Generating All...' : 'Generate All Embeddings'}
                                        </button>
                                    </div>
                                    {isGeneratingEmbeddings && (
                                        <div className="text-xs text-muted-foreground font-mono">
                                            {embeddingProgress}
                                        </div>
                                    )}
                                    {embeddingStats && (
                                        <div className="text-xs text-green-600 dark:text-green-400">
                                            Last run: Notion {embeddingStats.notion} • Drive {embeddingStats.drive} • Local {embeddingStats.local} embeddings stored
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </Card>
            </div>
        </main>
    );
};

export default Integrations;