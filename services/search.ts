import { getSettings } from './settings';
import { SearchOverrides } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const processQuery = async (
    query: string,
    _knowledgeBase: any[], // Ignored in server mode
    onProgress: any,
    categoryFilter?: string,
    temperatureOverride?: number, 
    useWebSearch = false, // Ignored or handled by backend if implemented
    history: any[] = [],
    searchOverrides: SearchOverrides = {},
    isAdvisorMode = false 
) => {
    onProgress?.({ step: 'searching' });
    
    try {
        const settings = getSettings();
        
        // Merge overrides
        const finalSettings = {
            ...settings,
            ...searchOverrides,
            temperature: searchOverrides.temperature ?? temperatureOverride ?? settings.temperature,
            minConfidence: searchOverrides.minConfidence ?? settings.minConfidence,
            vectorWeight: searchOverrides.vectorWeight ?? settings.vectorWeight,
        };

        const response = await fetch(`${API_URL}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': settings.userId || 'anonymous'
            },
            body: JSON.stringify({
                query,
                categoryFilter,
                settings: finalSettings,
                history, // Pass history if backend needs it for context
                isAdvisorMode
            })
        });

        if (!response.ok) {
            throw new Error(`Server Error: ${response.statusText}`);
        }

        const result = await response.json();
        
        onProgress?.({ step: 'generating' }); // Or completed

        // Backend returns { text, sources, debugInfo }
        // We need to return { text, sources, isAmbiguous, options, debugInfo }
        
        return {
            text: result.text,
            sources: result.sources || [],
            isAmbiguous: result.isAmbiguous || false,
            options: result.options || [],
            debugInfo: result.debugInfo
        };

    } catch (error: any) {
        console.error("Search API Error", error);
        return { 
            text: "خطا در ارتباط با سرور مرکزی.",
            sources: [],
            isAmbiguous: false,
            options: [],
            error: error.message
        };
    }
};
