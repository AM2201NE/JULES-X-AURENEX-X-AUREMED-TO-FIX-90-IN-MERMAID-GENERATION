import React from 'react';
import { BookOpenIcon, StarIcon, LinkIcon, FileIcon, NotionIcon } from './icons';
import { dataService } from '../services/dataService';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  navigateToDashboard: () => void;
  navigateToIntegrations: () => void;
  navigateToNotionLibrary: () => void;
  navigateToDriveLibrary?: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  action?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, action }) => (
  <button 
    onClick={action} 
    className="w-full flex items-center gap-3 px-3 py-2 text-foreground/80 hover:bg-accent hover:text-foreground rounded-md transition-all duration-200 ease-in-out text-left group active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    <div className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors">{icon}</div>
    <span className="font-medium">{label}</span>
  </button>
);

const DriveIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M7.71 3.5L1.15 15l3.43 6 6.55-11.5M9.73 3.5h13.12l-3.43 6H6.3M15.66 17.17l-3.43 6h-6.86l3.43-6" />
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, navigateToDashboard, navigateToIntegrations, navigateToNotionLibrary, navigateToDriveLibrary }) => {
  const isNotionConnected = !!dataService.getNotionApiKey();
  const isDriveConnected = !!dataService.getGoogleDriveIntegration()?.accessToken;

  return (
    <aside className={`relative top-0 left-0 h-full bg-transparent text-foreground z-40 transition-all duration-300 ease-in-out frosted-ui flex-shrink-0 border-r border-border/10
      ${isOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
      <div className="p-4 h-full overflow-y-auto w-64">
        <div className="mb-8">
          <h4 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workspace</h4>
          <ul>
            <li><NavItem icon={<BookOpenIcon />} label="Dashboard" action={() => { navigateToDashboard(); }}/></li>
            <li><NavItem icon={<FileIcon />} label="All Pages" /></li>
            {isNotionConnected && (
              <li><NavItem icon={<NotionIcon className="w-5 h-5" />} label="Notion Library" action={() => { navigateToNotionLibrary(); }}/></li>
            )}
            {isDriveConnected && navigateToDriveLibrary && (
              <li><NavItem icon={<DriveIcon className="w-5 h-5" />} label="Drive Library" action={() => { navigateToDriveLibrary(); }}/></li>
            )}
            <li><NavItem icon={<StarIcon />} label="Favorites" /></li>
          </ul>
        </div>
        <div className="mb-8">
          <h4 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settings</h4>
          <ul>
            <li><NavItem icon={<LinkIcon />} label="Integrations" action={() => { navigateToIntegrations(); }}/></li>
          </ul>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;