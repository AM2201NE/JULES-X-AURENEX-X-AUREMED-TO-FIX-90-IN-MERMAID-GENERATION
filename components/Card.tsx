import React from 'react';

interface CardProps {
  title?: string;
  className?: string;
  children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ title, children, className }) => {
  return (
    <div className={`
      bg-card text-card-foreground 
      rounded-lg border border-border
      p-6
      transition-all duration-300
      glow-on-hover
      ${className}
    `}>
      {title && <h3 className="text-xl font-semibold mb-4 text-foreground">{title}</h3>}
      {children}
    </div>
  );
};

export default Card;