import React from 'react';
import { InfoIcon, CheckCircleIcon } from './icons';

interface AlertProps {
    children: React.ReactNode;
    variant?: 'default' | 'destructive' | 'success';
}

const variantStyles = {
    default: {
        container: 'bg-muted/50 border-border text-muted-foreground',
        icon: 'text-foreground'
    },
    destructive: {
        container: 'bg-destructive/10 border-destructive/30 text-destructive',
        icon: 'text-destructive'
    },
    success: {
        container: 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400',
        icon: 'text-green-600 dark:text-green-500'
    }
};

const Alert: React.FC<AlertProps> = ({ children, variant = 'default' }) => {
    const styles = variantStyles[variant];
    
    const IconComponent = variant === 'success' ? CheckCircleIcon : InfoIcon;

    return (
        <div role="alert" className={`p-4 border rounded-lg flex gap-3 text-sm animate-fade-in ${styles.container}`}>
            <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.icon}`} />
            <div>
                {children}
            </div>
        </div>
    );
};

export default Alert;