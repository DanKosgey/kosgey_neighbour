/**
 * Web Scraper Service
 * Fetches and extracts content from URLs for AI consumption
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    TIMEOUT_MS: 10000,              // 10 second timeout
    MAX_CONTENT_LENGTH: 5000,       // Max characters to return
    USER_AGENT: 'Mozilla/5.0 (compatible; AIAgent/1.0)',
    MAX_REQUESTS_PER_MINUTE: 10,    // Rate limit
} as const;

// ============================================================================
// RATE LIMITING
// ============================================================================

class RateLimiter {
    private requests: number[] = [];
    private readonly maxRequests: number;
    private readonly windowMs: number;

    constructor(maxRequests: number, windowMs: number = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    canMakeRequest(): boolean {
        const now = Date.now();
        // Remove old requests outside the window
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        return this.requests.length < this.maxRequests;
    }

    recordRequest(): void {
        this.requests.push(Date.now());
    }

    getWaitTime(): number {
        if (this.requests.length === 0) return 0;
        const oldestRequest = this.requests[0];
        const waitTime = this.windowMs - (Date.now() - oldestRequest);
        return Math.max(0, waitTime);
    }
}

// ============================================================================
// WEB SCRAPER CLASS
// ============================================================================

export class WebScraper {
    private rateLimiter: RateLimiter;

    constructor() {
        this.rateLimiter = new RateLimiter(CONFIG.MAX_REQUESTS_PER_MINUTE);
    }

    /**
     * Intelligently search the web based on a query
     * Determines the best URL to visit based on the query and category
     */
    async searchWeb(query: string, category?: string): Promise<string> {
        const url = this.determineSearchUrl(query, category);
        console.log(`🔍 Searching for: "${query}" → ${url}`);
        return await this.scrapeUrl(url, 'summary');
    }

    /**
     * Determine the best URL to visit based on query and category
     */
    private determineSearchUrl(query: string, category?: string): string {
        const lowerQuery = query.toLowerCase();

        // Category-based URL selection
        if (category) {
            switch (category.toLowerCase()) {
                case 'news':
                    return 'https://www.bbc.com/news';
                case 'tech':
                    return 'https://techcrunch.com';
                case 'sports':
                    return 'https://www.espn.com';
                case 'finance':
                    if (lowerQuery.includes('bitcoin') || lowerQuery.includes('crypto')) {
                        return 'https://coinmarketcap.com';
                    }
                    // Bloomberg is too heavy (causes memory crashes), use Reuters instead
                    return 'https://www.reuters.com/markets';
                case 'weather':
                    return 'https://weather.com';
            }
        }

        // Query-based intelligent URL selection
        if (lowerQuery.includes('weather')) {
            return 'https://weather.com';
        }
        if (lowerQuery.includes('bitcoin') || lowerQuery.includes('crypto') || lowerQuery.includes('ethereum')) {
            return 'https://coinmarketcap.com';
        }
        if (lowerQuery.includes('stock') || lowerQuery.includes('market') || lowerQuery.includes('finance')) {
            return 'https://www.bloomberg.com';
        }
        if (lowerQuery.includes('sport') || lowerQuery.includes('football') || lowerQuery.includes('soccer') ||
            lowerQuery.includes('basketball') || lowerQuery.includes('tennis')) {
            return 'https://www.espn.com';
        }
        if (lowerQuery.includes('tech') || lowerQuery.includes('ai') || lowerQuery.includes('startup')) {
            return 'https://techcrunch.com';
        }
        if (lowerQuery.includes('news') || lowerQuery.includes('world') || lowerQuery.includes('politics')) {
            return 'https://www.bbc.com/news';
        }

        // Default to BBC News for general queries
        return 'https://www.bbc.com/news';
    }

    /**
     * Scrape content from a URL
     */
    async scrapeUrl(url: string, extractType: 'full' | 'summary' | 'metadata' = 'summary'): Promise<string> {
        // 1. Validate URL
        if (!this.isValidUrl(url)) {
            throw new Error('Invalid URL format');
        }

        // 2. Check rate limit
        if (!this.rateLimiter.canMakeRequest()) {
            const waitTime = Math.ceil(this.rateLimiter.getWaitTime() / 1000);
            throw new Error(`Rate limit exceeded. Please wait ${waitTime} seconds.`);
        }

        try {
            // 3. Fetch HTML
            console.log(`🌐 Fetching URL: ${url}`);
            const html = await this.fetchHtml(url);

            // 4. Parse and extract
            const content = this.extractContent(html, extractType);

            // 5. Record request
            this.rateLimiter.recordRequest();

            return content;
        } catch (error: any) {
            console.error('Web scraping error:', error.message);
            throw new Error(`Failed to fetch URL: ${error.message}`);
        }
    }

    /**
     * Validate URL format and safety
     */
    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            // Only allow http and https
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return false;
            }
            // Block localhost and private IPs
            if (parsed.hostname === 'localhost' ||
                parsed.hostname.startsWith('127.') ||
                parsed.hostname.startsWith('192.168.') ||
                parsed.hostname.startsWith('10.')) {
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Fetch HTML from URL
     */
    private async fetchHtml(url: string): Promise<string> { // Fetch the URL with strict size limits to prevent memory overflow
        const response = await axios.get(url, {
            timeout: CONFIG.TIMEOUT_MS,
            headers: {
                'User-Agent': CONFIG.USER_AGENT,
            },
            maxContentLength: 2 * 1024 * 1024, // 2MB max (prevents Bloomberg/large sites from crashing)
            maxBodyLength: 2 * 1024 * 1024,    // 2MB max
            maxRedirects: 5,
            validateStatus: (status) => status < 500 // Accept 4xx but not 5xx
        });

        return response.data;
    }

    /**
     * Extract content from HTML
     */
    private extractContent(html: string, extractType: 'full' | 'summary' | 'metadata'): string {
        const $ = cheerio.load(html);

        // Remove unwanted elements
        $('script, style, nav, header, footer, aside, iframe, noscript').remove();

        // Extract based on type
        switch (extractType) {
            case 'metadata':
                return this.extractMetadata($);

            case 'summary':
                return this.extractSummary($);

            case 'full':
                return this.extractFullContent($);

            default:
                return this.extractSummary($);
        }
    }

    /**
     * Extract only metadata (title, description)
     */
    private extractMetadata($: cheerio.Root): string {
        const title = $('title').text().trim() ||
            $('meta[property="og:title"]').attr('content') ||
            'No title';

        const description = $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') ||
            'No description';

        return `Title: ${title}\n\nDescription: ${description}`;
    }

    /**
     * Extract summary (title + first few paragraphs)
     */
    private extractSummary($: cheerio.Root): string {
        const title = $('title').text().trim() || 'No title';

        // Get main content
        const mainContent = $('article, main, .content, .post, .entry-content').first();
        const contentArea = mainContent.length > 0 ? mainContent : $('body');

        // Extract first few paragraphs
        const paragraphs: string[] = [];
        contentArea.find('p, h1, h2, h3').each((_, elem) => {
            const text = $(elem).text().trim();
            if (text.length > 20) { // Skip very short paragraphs
                paragraphs.push(text);
            }
        });

        const content = paragraphs.slice(0, 5).join('\n\n');
        const truncated = this.truncateContent(`Title: ${title}\n\n${content}`);

        return truncated;
    }

    /**
     * Extract full page content
     */
    private extractFullContent($: cheerio.Root): string {
        const title = $('title').text().trim() || 'No title';

        // Get all text content
        const bodyText = $('body').text()
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .trim();

        const content = `Title: ${title}\n\n${bodyText}`;
        return this.truncateContent(content);
    }

    /**
     * Truncate content to max length
     */
    private truncateContent(content: string): string {
        if (content.length <= CONFIG.MAX_CONTENT_LENGTH) {
            return content;
        }

        const truncated = content.substring(0, CONFIG.MAX_CONTENT_LENGTH);
        return truncated + '\n\n[Content truncated - original was longer]';
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const webScraper = new WebScraper();
