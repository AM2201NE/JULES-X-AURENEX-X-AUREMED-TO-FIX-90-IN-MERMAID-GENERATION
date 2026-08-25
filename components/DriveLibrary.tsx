import React, { useState, useEffect } from 'react';
import { ArrowLeftIcon, FileIcon, SearchIcon } from './icons';
import { dataService } from '../services/dataService';
import { googleDriveService, DriveFile } from '../services/googleDriveService';
import { useDebounce } from 'use-debounce';

interface DriveLibraryProps {
    navigateToDashboard: () => void;
    navigateToDriveFile: (fileId: string, mimeType: string) => void;
}

const DriveIcon = ({ mimeType }: { mimeType: string }) => {
    if (mimeType === 'application/vnd.google-apps.folder') {
        return (
            <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
        );
    }
    if (mimeType.includes('document')) {
        return (
            <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
        );
    }
    return <FileIcon className="w-6 h-6 text-muted-foreground"/>;
};

const DriveLibrary: React.FC<DriveLibraryProps> = ({ navigateToDashboard, navigateToDriveFile }) => {
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<DriveFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
    const [folderStack, setFolderStack] = useState<{id: string, name: string}[]>([{id: 'root', name: 'My Drive'}]);
    const [uniqueTags, setUniqueTags] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const currentFolderId = folderStack[folderStack.length - 1].id;

    useEffect(() => {
        const integration = dataService.getGoogleDriveIntegration();
        if (!integration?.accessToken) {
            setError("Google Drive is not connected.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        
        const processFiles = (fetchedFiles: DriveFile[]) => {
            setFiles(fetchedFiles);
            setFilteredFiles(fetchedFiles);
            
            const db = dataService.getDb();
            const fileTags = db.integrations.googleDrive?.fileTags || {};
            const tagsSet = new Set<string>();
            fetchedFiles.forEach(file => {
                const tags = fileTags[file.id] || [];
                tags.forEach(tag => tagsSet.add(tag));
            });
            setUniqueTags(Array.from(tagsSet));
        };

        if (currentFolderId === 'root') {
            // At root, only show the files/folders the user explicitly selected in Integrations
            processFiles(integration.selectedFiles || []);
            setIsLoading(false);
        } else {
            googleDriveService.getFiles(integration.accessToken, currentFolderId)
                .then(fetchedFiles => {
                    processFiles(fetchedFiles);
                })
                .catch((err: any) => {
                    console.error(err);
                    setError(err.message || "Failed to fetch Google Drive content.");
                })
                .finally(() => setIsLoading(false));
        }
    }, [currentFolderId]);

    useEffect(() => {
        let filtered = files;
        if (debouncedSearchTerm) {
            const lowercasedFilter = debouncedSearchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.name.toLowerCase().includes(lowercasedFilter)
            );
        }
        
        if (selectedTags.length > 0) {
            const db = dataService.getDb();
            const fileTags = db.integrations.googleDrive?.fileTags || {};
            filtered = filtered.filter(item => {
                const aiTags = fileTags[item.id] || [];
                return selectedTags.every(tag => aiTags.includes(tag));
            });
        }
        
        setFilteredFiles(filtered);
    }, [debouncedSearchTerm, selectedTags, files]);

    const handleTagClick = (tag: string) => {
        setSelectedTags(current => 
            current.includes(tag) 
                ? current.filter(t => t !== tag) 
                : [...current, tag]
        );
    };

    const handleItemClick = (item: DriveFile) => {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            setFolderStack([...folderStack, { id: item.id, name: item.name }]);
        } else {
            navigateToDriveFile(item.id, item.mimeType);
        }
    };

    const handleNavigateUp = (index: number) => {
        setFolderStack(folderStack.slice(0, index + 1));
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center text-muted-foreground">Loading your Drive workspace...</div>;
        if (error) return <div className="text-center text-destructive">{error}</div>;
        if (filteredFiles.length === 0) return <div className="text-center text-muted-foreground">No files found.</div>;

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFiles.map(item => (
                    <button key={item.id} onClick={() => handleItemClick(item)}
                            className="w-full text-left p-4 rounded-lg border bg-card hover:bg-accent transition-colors flex items-center gap-4 group animate-fade-in-up">
                        <DriveIcon mimeType={item.mimeType}/>
                        <span className="font-semibold text-foreground truncate">{item.name}</span>
                    </button>
                ))}
            </div>
        );
    };

    return (
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-muted/50 animate-fade-in">
            <div className="max-w-6xl mx-auto">
                <button onClick={navigateToDashboard} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-semibold">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Back to Dashboard
                </button>
                
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground">Google Drive Library</h1>
                    <div className="flex items-center gap-2 text-muted-foreground mt-2 text-sm">
                        {folderStack.map((folder, index) => (
                            <React.Fragment key={folder.id}>
                                <button 
                                    onClick={() => handleNavigateUp(index)}
                                    className="hover:text-foreground hover:underline"
                                >
                                    {folder.name}
                                </button>
                                {index < folderStack.length - 1 && <span>/</span>}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="relative mb-8">
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search current folder..." 
                        className="w-full bg-background border rounded-md py-2 px-4 pl-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    />
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                </div>
                
                {uniqueTags.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Filter by Tags</h3>
                        <div className="flex flex-wrap gap-2">
                            {uniqueTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => handleTagClick(tag)}
                                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                                        selectedTags.includes(tag)
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                {renderContent()}
            </div>
        </main>
    );
};

export default DriveLibrary;
