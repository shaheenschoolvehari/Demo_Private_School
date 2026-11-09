/**
 * Multi-Provider LLM Integration Service
 * Supports: Google Gemini, OpenAI, Anthropic Claude, OpenRouter, Grok (xAI), Kimi (Moonshot), Groq, Custom.
 */

const PROVIDER_METADATA = {
    gemini: {
        id: 'gemini',
        name: 'Google Gemini',
        icon: 'bi-google',
        badge: 'Recommended',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        defaultModel: 'gemini-2.0-flash',
        keyPlaceholder: 'AIzaSy...',
        docUrl: 'https://aistudio.google.com/app/apikey'
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        icon: 'bi-robot',
        badge: 'Industry Standard',
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        keyPlaceholder: 'sk-proj-...',
        docUrl: 'https://platform.openai.com/api-keys'
    },
    claude: {
        id: 'claude',
        name: 'Anthropic Claude',
        icon: 'bi-chat-heart',
        badge: 'High Reasoning',
        defaultBaseUrl: 'https://api.anthropic.com/v1',
        defaultModel: 'claude-3-5-sonnet-20241022',
        keyPlaceholder: 'sk-ant-...',
        docUrl: 'https://console.anthropic.com/settings/keys'
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter (All-in-One)',
        icon: 'bi-cpu',
        badge: '200+ Models',
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'google/gemini-2.0-flash-exp:free',
        keyPlaceholder: 'sk-or-v1-...',
        docUrl: 'https://openrouter.ai/keys'
    },
    grok: {
        id: 'grok',
        name: 'xAI Grok',
        icon: 'bi-lightning-charge',
        badge: 'xAI',
        defaultBaseUrl: 'https://api.x.ai/v1',
        defaultModel: 'grok-2-mini',
        keyPlaceholder: 'xai-...',
        docUrl: 'https://console.x.ai/'
    },
    kimi: {
        id: 'kimi',
        name: 'Kimi (Moonshot AI)',
        icon: 'bi-moon-stars',
        badge: 'Long Context',
        defaultBaseUrl: 'https://api.moonshot.cn/v1',
        defaultModel: 'moonshot-v1-32k',
        keyPlaceholder: 'sk-...',
        docUrl: 'https://platform.moonshot.cn/console/api-keys'
    },
    groq: {
        id: 'groq',
        name: 'Groq (Ultra-Fast Llama)',
        icon: 'bi-speedometer2',
        badge: 'Sub-second',
        defaultBaseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        keyPlaceholder: 'gsk_...',
        docUrl: 'https://console.groq.com/keys'
    },
    custom: {
        id: 'custom',
        name: 'Custom (OpenAI-Compatible)',
        icon: 'bi-hdd-network',
        badge: 'Self-Hosted / Local',
        defaultBaseUrl: 'http://localhost:11434/v1',
        defaultModel: 'llama3',
        keyPlaceholder: 'Optional API Key',
        docUrl: ''
    }
};

/**
 * Dynamically fetches available models from the chosen provider using the supplied API key.
 */
async function fetchModelsForProvider(provider, apiKey, customBaseUrl = '') {
    if (!apiKey && provider !== 'custom') {
        throw new Error('API key is required to fetch models');
    }

    const cleanProvider = (provider || 'openai').toLowerCase();

    // 1. Google Gemini
    if (cleanProvider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini API returned status ${res.status}`);
        }
        const data = await res.json();
        const models = (data.models || [])
            .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map(m => {
                const id = m.name.replace('models/', '');
                const isRec = id.includes('2.0-flash') || id.includes('1.5-flash');
                return {
                    id,
                    name: m.displayName || id,
                    description: m.description || '',
                    recommended: isRec
                };
            });

        // Sort recommended models first
        models.sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
        return {
            provider: 'gemini',
            recommendedModel: models.find(m => m.recommended)?.id || 'gemini-2.0-flash',
            models
        };
    }

    // 2. Anthropic Claude
    if (cleanProvider === 'claude') {
        try {
            const res = await fetch('https://api.anthropic.com/v1/models', {
                headers: {
                    'x-api-key': apiKey.trim(),
                    'anthropic-version': '2023-06-01'
                },
                signal: AbortSignal.timeout(10000)
            });
            if (res.ok) {
                const data = await res.json();
                const models = (data.data || []).map(m => ({
                    id: m.id,
                    name: m.display_name || m.id,
                    recommended: m.id.includes('claude-3-5-sonnet') || m.id.includes('claude-3-5-haiku')
                }));
                if (models.length > 0) {
                    models.sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
                    return {
                        provider: 'claude',
                        recommendedModel: models.find(m => m.recommended)?.id || 'claude-3-5-sonnet-20241022',
                        models
                    };
                }
            }
        } catch (e) {}

        // Standard Anthropic model fallback
        const standardClaude = [
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Latest)', recommended: true },
            { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast)', recommended: true },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Deep Analysis)', recommended: false }
        ];
        return {
            provider: 'claude',
            recommendedModel: 'claude-3-5-sonnet-20241022',
            models: standardClaude
        };
    }

    // 3. OpenAI, OpenRouter, Grok, Kimi, Groq, Custom (All use OpenAI /v1/models standard format)
    let baseUrl = customBaseUrl?.trim();
    if (!baseUrl) {
        if (cleanProvider === 'openai') baseUrl = 'https://api.openai.com/v1';
        else if (cleanProvider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
        else if (cleanProvider === 'grok') baseUrl = 'https://api.x.ai/v1';
        else if (cleanProvider === 'kimi') baseUrl = 'https://api.moonshot.cn/v1';
        else if (cleanProvider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
        else baseUrl = 'https://api.openai.com/v1';
    }

    const headers = {};
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    if (cleanProvider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://shaheenschool.edu';
        headers['X-Title'] = 'SMS Role-Aware AI Agent';
    }

    const res = await fetch(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `${PROVIDER_METADATA[cleanProvider]?.name || 'Provider'} returned error status ${res.status}`);
    }

    const data = await res.json();
    const rawList = data.data || data.models || [];

    let models = rawList.map(m => {
        const id = m.id || m.name;
        let isRec = false;
        if (cleanProvider === 'openai') isRec = id === 'gpt-4o-mini' || id === 'gpt-4o';
        else if (cleanProvider === 'openrouter') isRec = id.includes('gemini-2.0-flash') || id.includes('claude-3.5-sonnet') || id.includes('llama-3.3-70b');
        else if (cleanProvider === 'grok') isRec = id.includes('grok-2');
        else if (cleanProvider === 'kimi') isRec = id.includes('moonshot-v1-32k') || id.includes('moonshot-v1-8k');
        else if (cleanProvider === 'groq') isRec = id.includes('llama-3.3-70b');

        return {
            id,
            name: m.name || id,
            recommended: isRec
        };
    });

    // Filter relevant chat models for OpenAI (filter out embedding/whisper/dall-e/tts)
    if (cleanProvider === 'openai') {
        models = models.filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('chatgpt'));
    }

    models.sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));

    const defaultRec = models.find(m => m.recommended)?.id || (models[0] ? models[0].id : PROVIDER_METADATA[cleanProvider]?.defaultModel || 'gpt-4o-mini');

    return {
        provider: cleanProvider,
        recommendedModel: defaultRec,
        models
    };
}

/**
 * Executes chat completion against the configured provider.
 */
async function generateLLMResponse({
    provider,
    apiKey,
    model,
    customBaseUrl,
    temperature = 0.3,
    systemPrompt,
    userMessage,
    conversationHistory = []
}) {
    const cleanProvider = (provider || 'openai').toLowerCase();

    // 1. Google Gemini Native
    if (cleanProvider === 'gemini') {
        const selectedModel = model || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey.trim()}`;

        const contents = [];
        // Add past conversation turns
        for (const turn of conversationHistory.slice(-4)) {
            contents.push({
                role: turn.sender === 'user' ? 'user' : 'model',
                parts: [{ text: turn.text }]
            });
        }
        contents.push({
            role: 'user',
            parts: [{ text: userMessage }]
        });

        const payload = {
            contents,
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            generationConfig: {
                temperature: Number(temperature) || 0.3,
                maxOutputTokens: 1024
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini generation error (${res.status})`);
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated from Gemini.';
        return { text, provider: 'gemini', model: selectedModel };
    }

    // 2. Anthropic Claude
    if (cleanProvider === 'claude') {
        const selectedModel = model || 'claude-3-5-sonnet-20241022';
        const messages = [];

        for (const turn of conversationHistory.slice(-4)) {
            messages.push({
                role: turn.sender === 'user' ? 'user' : 'assistant',
                content: turn.text
            });
        }
        messages.push({
            role: 'user',
            content: userMessage
        });

        const payload = {
            model: selectedModel,
            max_tokens: 1024,
            temperature: Number(temperature) || 0.3,
            system: systemPrompt,
            messages
        };

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey.trim(),
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Claude generation error (${res.status})`);
        }

        const data = await res.json();
        const text = data.content?.[0]?.text || 'No response generated from Claude.';
        return { text, provider: 'claude', model: selectedModel };
    }

    // 3. OpenAI, OpenRouter, Grok, Kimi, Groq, Custom (Standard /chat/completions)
    let baseUrl = customBaseUrl?.trim();
    if (!baseUrl) {
        if (cleanProvider === 'openai') baseUrl = 'https://api.openai.com/v1';
        else if (cleanProvider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
        else if (cleanProvider === 'grok') baseUrl = 'https://api.x.ai/v1';
        else if (cleanProvider === 'kimi') baseUrl = 'https://api.moonshot.cn/v1';
        else if (cleanProvider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
        else baseUrl = 'https://api.openai.com/v1';
    }

    const messages = [{ role: 'system', content: systemPrompt }];
    for (const turn of conversationHistory.slice(-4)) {
        messages.push({
            role: turn.sender === 'user' ? 'user' : 'assistant',
            content: turn.text
        });
    }
    messages.push({ role: 'user', content: userMessage });

    const selectedModel = model || PROVIDER_METADATA[cleanProvider]?.defaultModel || 'gpt-4o-mini';

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    if (cleanProvider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://shaheenschool.edu';
        headers['X-Title'] = 'SMS Role-Aware AI Agent';
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: selectedModel,
            messages,
            temperature: Number(temperature) || 0.3,
            max_tokens: 1024
        }),
        signal: AbortSignal.timeout(25000)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `${cleanProvider} chat error (${res.status})`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || 'No response returned from model.';
    return { text, provider: cleanProvider, model: selectedModel };
}

module.exports = {
    PROVIDER_METADATA,
    fetchModelsForProvider,
    generateLLMResponse
};
