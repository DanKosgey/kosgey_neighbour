import { geminiService } from '../ai/gemini';

type ContentType = 'quote' | 'joke' | 'prediction' | 'fact' | 'riddle' | 'wisdom';

interface RandomContent {
    type: ContentType;
    content: string;
}

class RandomContentService {
    private static instance: RandomContentService;
    private lastContentType: ContentType | null = null;

    private constructor() { }

    public static getInstance(): RandomContentService {
        if (!RandomContentService.instance) {
            RandomContentService.instance = new RandomContentService();
        }
        return RandomContentService.instance;
    }

    /**
     * Get a random content type, ensuring variety (no repeats)
     */
    private getRandomContentType(): ContentType {
        const types: ContentType[] = ['quote', 'joke', 'prediction', 'fact', 'riddle', 'wisdom'];

        // Filter out the last type to ensure variety
        const availableTypes = this.lastContentType
            ? types.filter(t => t !== this.lastContentType)
            : types;

        const selected = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        this.lastContentType = selected;
        return selected;
    }

    /**
     * Get time-aware context for AI generation
     */
    private getTimeContext(): string {
        const hour = new Date().getHours();

        if (hour >= 5 && hour < 12) {
            return 'morning (energetic, fresh start vibes)';
        } else if (hour >= 12 && hour < 17) {
            return 'afternoon (productive, focused energy)';
        } else if (hour >= 17 && hour < 21) {
            return 'evening (winding down, reflective)';
        } else {
            return 'late night (calm, thoughtful, maybe mysterious)';
        }
    }

    /**
     * Generate random content using AI
     */
    public async generateRandomContent(): Promise<RandomContent> {
        const type = this.getRandomContentType();
        const timeContext = this.getTimeContext();

        const prompts: Record<ContentType, string> = {
            quote: `Generate a SHORT, powerful motivational quote (1-2 sentences max).
                    Time: ${timeContext}
                    Make it punchy, memorable, and inspiring. No author attribution needed.
                    Format: Just the quote, nothing else.`,

            joke: `Generate a SHORT, clever joke or witty one-liner (1-2 sentences max).
                   Time: ${timeContext}
                   Make it smart, clean, and genuinely funny. Could be a pun, observation, or quick story.
                   Format: Just the joke, no setup labels.`,

            prediction: `Generate a SHORT, fun "prediction" or fortune (1-2 sentences max).
                        Time: ${timeContext}
                        Make it playful, slightly mysterious, and positive. Like a fortune cookie but cooler.
                        Format: Start with "🔮" then the prediction.`,

            fact: `Generate a SHORT, mind-blowing fact (1-2 sentences max).
                   Time: ${timeContext}
                   Make it surprising, interesting, and true. Could be about science, history, nature, or psychology.
                   Format: Start with "💡" then the fact.`,

            riddle: `Generate a SHORT riddle with answer (2-3 sentences total).
                    Time: ${timeContext}
                    Make it clever but not too hard. Format: "Riddle: [question] ... Answer: [answer]"`,

            wisdom: `Generate a SHORT piece of life wisdom or insight (1-2 sentences max).
                    Time: ${timeContext}
                    Make it thought-provoking and practical. Like advice from a wise friend.
                    Format: Start with "💭" then the wisdom.`
        };

        try {
            const content = await geminiService.generateText(prompts[type]);
            return {
                type,
                content: content.trim()
            };
        } catch (error) {
            console.error('Failed to generate random content:', error);
            // Fallback content
            return {
                type: 'quote',
                content: '💫 "The best time to start was yesterday. The next best time is now."'
            };
        }
    }

    /**
     * Format content for WhatsApp with emoji and styling
     */
    public formatForWhatsApp(randomContent: RandomContent): string {
        const typeEmojis: Record<ContentType, string> = {
            quote: '✨',
            joke: '😄',
            prediction: '🔮',
            fact: '🧠',
            riddle: '🤔',
            wisdom: '🌟'
        };

        const emoji = typeEmojis[randomContent.type];
        const typeLabel = randomContent.type.charAt(0).toUpperCase() + randomContent.type.slice(1);

        return `${emoji} *${typeLabel} of the Hour*\n\n${randomContent.content}`;
    }
}

export const randomContentService = RandomContentService.getInstance();
