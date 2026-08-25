import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import AiChatWindow from './components/AiChatWindow';
import ErrorBoundary from './components/ErrorBoundary';
import PageEditor from './components/PageEditor';
import Profile from './components/Profile';
import Integrations from './components/Integrations';
import NotionPageViewer from './components/NotionPageViewer';
import NotionLibrary from './components/NotionLibrary';
import DriveLibrary from './components/DriveLibrary';
import DrivePageViewer from './components/DrivePageViewer';
import { useResponsive } from './hooks/useResponsive';
import PdfViewer from './components/PdfViewer';
import type { View } from './types';
import { dataService } from './services/dataService';
import AiChatBubble from './components/AiChatBubble';


interface PdfViewerState {
  isOpen: boolean;
  url: string | null;
}

const App: React.FC = () => {
  const { isMobile } = useResponsive();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'modal' | 'split'>('modal');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [pdfViewerState, setPdfViewerState] = useState<PdfViewerState>({ isOpen: false, url: null });
  
  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);
  
  useEffect(() => {
    let theme = null;
    try {
      theme = localStorage.getItem('aurenex-theme');
    } catch (e) {}

    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
    
    // Keep-alive ping to prevent the backend container from scaling to 0 on idle
    // This stops the platform from dropping connections and triggering unexpected reloads
    const keepAliveInterval = setInterval(() => {
      fetch('/').catch(() => {});
    }, 60000); // Ping every minute
    
    return () => clearInterval(keepAliveInterval);
  }, []);

  const toggleTheme = useCallback(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      try { localStorage.setItem('aurenex-theme', 'light'); } catch (e) {}
    } else {
      document.documentElement.classList.add('dark');
      try { localStorage.setItem('aurenex-theme', 'dark'); } catch(e) {}
    }
    setIsDarkMode(!isDarkMode);
  }, [isDarkMode]);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);
  
  const openPdfViewer = (url: string) => setPdfViewerState({ isOpen: true, url });

  const closePdfViewer = () => setPdfViewerState({ isOpen: false, url: null });
  
  const navigateToPage = (pageId: string, blockId?: string, fromAi?: boolean, snippet?: string) => {
    dataService.recordPageAccess(pageId);
    setView({ name: 'page', props: { pageId, highlightBlockId: blockId, fromAi: fromAi || false, snippet } });
    if (fromAi) {
      setChatMode('split');
      setIsChatOpen(true);
      setIsSidebarOpen(false);
    } else if (isChatOpen && chatMode === 'modal') {
      setIsChatOpen(false);
    }
  };
  const navigateToDashboard = () => setView({ name: 'dashboard' });
  const navigateToProfile = () => setView({ name: 'profile' });
  const navigateToIntegrations = () => setView({ name: 'integrations' });
  const navigateToNotionLibrary = () => setView({ name: 'notion_library' });
  const navigateToDriveLibrary = () => setView({ name: 'drive_library' });
  const navigateToNotionPage = (pageId: string, blockId?: string, fromAi?: boolean, timestamp?: number, snippet?: string) => {
    setView({ name: 'notion_page', props: { pageId, highlightBlockId: blockId, fromAi: fromAi || false, timestamp, snippet } });
    if (fromAi) {
      setChatMode('split');
      setIsChatOpen(true);
      setIsSidebarOpen(false);
    } else if (isChatOpen && chatMode === 'modal') {
      setIsChatOpen(false);
    }
  };
  const navigateToDriveFile = (fileId: string, mimeType: string, snippet?: string) => {
    setView({ name: 'drive_page', props: { fileId, mimeType, snippet } });
    if (snippet) {
      setChatMode('split');
      setIsChatOpen(true);
      setIsSidebarOpen(false);
    } else if (isChatOpen && chatMode === 'modal') {
      setIsChatOpen(false);
    }
  };

  const renderCurrentView = () => {
    switch (view.name) {
      case 'page': return <PageEditor pageId={view.props.pageId} highlightBlockId={view.props.highlightBlockId} fromAi={view.props.fromAi} snippet={view.props.snippet} navigateToDashboard={navigateToDashboard} />;
      case 'profile': return <Profile navigateToDashboard={navigateToDashboard} />;
      case 'integrations': return <Integrations navigateToDashboard={navigateToDashboard} />;
      case 'notion_library': return <NotionLibrary navigateToDashboard={navigateToDashboard} navigateToNotionPage={(id) => navigateToNotionPage(id, undefined, false, undefined)} />;
      case 'drive_library': return <DriveLibrary navigateToDashboard={navigateToDashboard} navigateToDriveFile={(id, mimeType) => navigateToDriveFile(id, mimeType)} />;
      case 'notion_page': return <NotionPageViewer pageId={view.props.pageId} navigateToDashboard={navigateToDashboard} navigateToNotionPage={(id, bId, t) => navigateToNotionPage(id, bId, false, t)} navigateToPage={navigateToPage} highlightBlockId={view.props.highlightBlockId} timestamp={view.props.timestamp} fromAi={view.props.fromAi} snippet={view.props.snippet} openPdfViewer={openPdfViewer} />;
      case 'drive_page': return <DrivePageViewer fileId={view.props.fileId} mimeType={view.props.mimeType} navigateToDashboard={navigateToDashboard} highlightSnippet={view.props.snippet} />;
      case 'dashboard':
      default: return <MainContent navigateToPage={navigateToPage} navigateToNotionPage={(id) => navigateToNotionPage(id, undefined, false, undefined)} navigateToIntegrations={navigateToIntegrations} navigateToNotionLibrary={navigateToNotionLibrary} navigateToDriveLibrary={navigateToDriveLibrary} />;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground font-sans antialiased">
      <Header 
        onMenuClick={toggleSidebar}
        onThemeToggle={toggleTheme}
        isDarkMode={isDarkMode}
        navigateToDashboard={navigateToDashboard}
        navigateToProfile={navigateToProfile}
      />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
          navigateToDashboard={navigateToDashboard}
          navigateToIntegrations={navigateToIntegrations}
          navigateToNotionLibrary={navigateToNotionLibrary}
          navigateToDriveLibrary={navigateToDriveLibrary}
        />
        
        {/* Main Content Area - Handles Split Layout */}
        <div className={`flex flex-1 overflow-hidden relative ${isChatOpen && chatMode === 'split' ? 'flex-col md:flex-row' : 'flex-col'}`}>
          <div className={`flex flex-col flex-1 overflow-hidden transition-all duration-300 ${isChatOpen && chatMode === 'split' ? 'min-w-0 min-h-0 border-b md:border-b-0 md:border-r border-border' : 'w-full h-full'}`}>
            {renderCurrentView()}
          </div>
          
          {isChatOpen && (
            <div className={chatMode === 'split' ? 'flex-1 min-w-0 min-h-0 relative flex overflow-hidden' : ''}>
              <ErrorBoundary componentName="AI Chat Window">
                <AiChatWindow
                  onClose={() => { setIsChatOpen(false); setChatMode('modal'); }}
                  navigateToPage={navigateToPage}
                  navigateToNotionPage={navigateToNotionPage}
                  navigateToDriveFile={navigateToDriveFile}
                  openPdfViewer={openPdfViewer}
                  chatMode={chatMode}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </div>
      
      {!isChatOpen && (
        <AiChatBubble onOpen={() => { setIsChatOpen(true); setChatMode('modal'); }} />
      )}

      <PdfViewer 
        isOpen={pdfViewerState.isOpen}
        url={pdfViewerState.url}
        onClose={closePdfViewer}
      />
    </div>
  );
};

export default App;