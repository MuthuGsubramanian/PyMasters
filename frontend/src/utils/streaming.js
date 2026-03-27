/**
 * Shared SSE streaming utilities for Vaathiyaar chat.
 * Replaces the duplicated, fragile extractMessage() parsers.
 */

export function parseSSELine(line) {
    if (!line.startsWith('data: ')) return null;
    try {
        return JSON.parse(line.slice(6));
    } catch {
        return null;
    }
}

export function extractMessageFromJSON(rawText) {
    try {
        const parsed = JSON.parse(rawText);
        if (typeof parsed === 'object' && parsed.message) return parsed.message;
        if (typeof parsed === 'string') return parsed;
        return JSON.stringify(parsed);
    } catch {
        const lastBrace = rawText.lastIndexOf('}');
        if (lastBrace === -1) return null;
        const firstBrace = rawText.lastIndexOf('{', lastBrace);
        if (firstBrace === -1) return null;
        try {
            const parsed = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
            return parsed.message || null;
        } catch {
            return null;
        }
    }
}
