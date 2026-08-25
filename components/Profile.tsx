import React, { useState, useEffect } from 'react';
import Card from './Card';
import { ArrowLeftIcon } from './icons';
import { dataService } from '../services/dataService';
import type { User, AiPersonality, AiProvider, Gender } from '../types';

interface ProfileProps {
    navigateToDashboard: () => void;
}

const AiPersonalityOption: React.FC<{
    value: AiPersonality,
    label: string,
    description: string,
    current: AiPersonality | undefined,
    onChange: (value: AiPersonality) => void
}> = ({ value, label, description, current, onChange }) => (
    <label
        htmlFor={`personality-${value}`}
        className={`
            flex items-start p-4 rounded-lg border cursor-pointer transition-all 
            ${current === value ? 'bg-primary/10 border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:bg-accent'}
        `}
    >
        <input 
            type="radio" 
            id={`personality-${value}`}
            name="ai-personality" 
            value={value} 
            checked={current === value} 
            onChange={() => onChange(value)}
            className="w-4 h-4 mt-1 text-primary bg-background border-muted-foreground focus:ring-primary focus:ring-offset-0"
        />
        <div className="ml-4">
            <h4 className="font-semibold text-foreground">{label}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    </label>
);

const AiProviderOption: React.FC<{
    value: AiProvider,
    label: string,
    description: string,
    current: AiProvider | undefined,
    onChange: (value: AiProvider) => void
}> = ({ value, label, description, current, onChange }) => (
    <label
        htmlFor={`provider-${value}`}
        className={`
            flex items-start p-4 rounded-lg border cursor-pointer transition-all 
            ${current === value ? 'bg-primary/10 border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:bg-accent'}
        `}
    >
        <input 
            type="radio" 
            id={`provider-${value}`}
            name="ai-provider" 
            value={value} 
            checked={current === value} 
            onChange={() => onChange(value)}
            className="w-4 h-4 mt-1 text-primary bg-background border-muted-foreground focus:ring-primary focus:ring-offset-0"
        />
        <div className="ml-4">
            <h4 className="font-semibold text-foreground">{label}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    </label>
);


const Profile: React.FC<ProfileProps> = ({ navigateToDashboard }) => {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        setUser(dataService.getUser());
    }, []);
    
    const handleUserUpdate = (field: keyof User, value: any) => {
         if (user) {
            const updatedUser = { ...user, [field]: value };
            setUser(updatedUser); // Optimistic UI update
            dataService.updateUser({ [field]: value });
        }
    }
    
    const formatGender = (gender?: Gender) => {
        if (!gender) return 'Not specified';
        const map: Record<Gender, string> = {
            'male': 'Male',
            'female': 'Female',
            'other': 'Other',
            'prefer_not_to_say': 'Prefer not to say'
        };
        return map[gender];
    };
    
    if (!user) {
        return <div className="flex-1 flex items-center justify-center">Loading...</div>;
    }

    return (
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-muted/50 animate-fade-in">
            <div className="max-w-2xl mx-auto">
                <button onClick={navigateToDashboard} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-semibold">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Back to Library
                </button>
                <div className="space-y-8">
                    <Card title="User Profile">
                        <div className="flex flex-col items-center md:flex-row md:items-start gap-8 animate-fade-in-up" style={{ animationDelay: '100ms', opacity: 0 }}>
                            <img 
                                src={user.avatarUrl}
                                alt="User avatar"
                                className="w-32 h-32 rounded-full border-4 border-background shadow-lg ring-2 ring-primary"
                            />
                            <div className="text-center md:text-left flex-1">
                                <h2 className="text-3xl font-bold text-foreground">{user.name}</h2>
                                <p className="text-lg text-primary mt-1">{user.email}</p>
                                <div className="text-sm text-muted-foreground mt-4 flex items-center justify-center md:justify-start gap-4">
                                    {user.age && <span>{user.age} years old</span>}
                                    {user.gender && <span>{formatGender(user.gender)}</span>}
                                </div>
                                <p className="text-muted-foreground mt-4">
                                    Member of the Aurenex community. Committed to organizing knowledge and fostering insight.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card title="AI Personality">
                        <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '300ms', opacity: 0 }}>
                            <p className="text-muted-foreground text-sm">Choose how AurePal should interact with you.</p>
                            <AiPersonalityOption
                                value="aurepal"
                                label="AurePal (Default)"
                                description="A concise and insightful AI assistant for direct answers."
                                current={user.aiPersonality}
                                onChange={(value) => handleUserUpdate('aiPersonality', value)}
                            />
                            <AiPersonalityOption
                                value="muse"
                                label="Creative Muse"
                                description="An imaginative partner for brainstorming and inspiration."
                                current={user.aiPersonality}
                                onChange={(value) => handleUserUpdate('aiPersonality', value)}
                            />
                            <AiPersonalityOption
                                value="socrates"
                                label="Socratic Teacher"
                                description="A questioning guide to challenge thinking and deepen understanding."
                                current={user.aiPersonality}
                                onChange={(value) => handleUserUpdate('aiPersonality', value)}
                            />
                             <AiPersonalityOption
                                value="jarvis"
                                label="J.A.R.V.I.S. Persona"
                                description="A sophisticated, precise, and highly capable AI assistant."
                                current={user.aiPersonality}
                                onChange={(value) => handleUserUpdate('aiPersonality', value)}
                            />
                             <AiPersonalityOption
                                value="exampal"
                                label="ExamPal"
                                description="A focused study partner for creating high-quality exam questions and flashcards."
                                current={user.aiPersonality}
                                onChange={(value) => handleUserUpdate('aiPersonality', value)}
                            />
                             <AiPersonalityOption
                                value="ocr"
                                label="OCR Specialist"
                                description="Precise document reconstruction and visual content extraction."
                                current={user.aiPersonality}
                                onChange={(value) => handleUserUpdate('aiPersonality', value)}
                            />
                            <AiPersonalityOption
                                value="auremed"
                                label="AureMed"
                                description="Medical research expert with access to 550+ specialized skills for literature review, study design, data analysis, and academic writing."
                                current={user.aiPersonality}
                                onChange={(value) => handleUserUpdate('aiPersonality', value)}
                            />
                        </div>
                    </Card>
                    
                    <Card title="AI Provider">
                        <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '400ms', opacity: 0 }}>
                            <p className="text-muted-foreground text-sm">Choose the engine that powers AurePal.</p>
                            <AiProviderOption
                                value="gemini"
                                label="Live AI (Gemini)"
                                description="Connects to Google for powerful, context-aware responses. Requires internet."
                                current={user.aiProvider}
                                onChange={(value) => handleUserUpdate('aiProvider', value)}
                            />
                             <AiProviderOption
                                value="mock"
                                label="Mock AI (Offline)"
                                description="A simple, instant, offline-only assistant for basic tasks and development."
                                current={user.aiProvider}
                                onChange={(value) => handleUserUpdate('aiProvider', value)}
                            />
                        </div>
                    </Card>
                </div>
            </div>
        </main>
    );
};

export default Profile;