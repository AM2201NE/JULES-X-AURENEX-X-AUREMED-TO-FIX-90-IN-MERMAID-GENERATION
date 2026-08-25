import React from 'react';
import { useResponsive } from '../hooks/useResponsive';
import { BellIcon, UserIcon, MenuIcon, SearchIcon, AurenexLogoIcon } from './icons';

interface HeaderProps {
  onMenuClick: () => void;
  onThemeToggle: () => void;
  isDarkMode: boolean;
  navigateToProfile: () => void;
  navigateToDashboard: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onThemeToggle, isDarkMode, navigateToProfile, navigateToDashboard }) => {
  const { isMobile } = useResponsive();

  const Logo = () => (
    <button onClick={navigateToDashboard} className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md p-1 group">
        <AurenexLogoIcon className="w-7 h-7 text-foreground group-hover:text-primary transition-colors"/>
        <span className="text-xl font-bold tracking-tight text-foreground">Aurenex</span>
    </button>
  );

  return (
    <header className="bg-background/80 backdrop-blur-sm border-b border-border p-3 sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={onMenuClick} className="p-2 rounded-md hover:bg-accent text-muted-foreground"><MenuIcon className="w-5 h-5"/></button>
          <Logo />
        </div>
        
        {!isMobile && (
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search anything..." 
                className="w-full bg-secondary border border-transparent rounded-md py-2 px-4 pl-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background transition-all" 
              />
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
           <button onClick={onThemeToggle} className="p-2 rounded-md hover:bg-accent text-muted-foreground" aria-label="Toggle theme">
             {isDarkMode ? '☀️' : '🌙'}
           </button>
          <button className="p-2 rounded-md hover:bg-accent text-muted-foreground" aria-label="Notifications"><BellIcon className="w-5 h-5" /></button>
          <button onClick={navigateToProfile} className="p-2 rounded-md hover:bg-accent text-muted-foreground" aria-label="Profile"><UserIcon className="w-5 h-5" /></button>
        </div>

      </div>
    </header>
  );
};

export default Header;