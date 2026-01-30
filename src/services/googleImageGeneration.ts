import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export class GoogleImageGenerationService {
    private static instance: GoogleImageGenerationService;
    private recentVariations: Set<string> = new Set();
    private readonly MAX_RECENT_TRACKING = 10;

    private constructor() {
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
    }

    public static getInstance(): GoogleImageGenerationService {
        if (!GoogleImageGenerationService.instance) {
            GoogleImageGenerationService.instance = new GoogleImageGenerationService();
        }
        return GoogleImageGenerationService.instance;
    }

    /**
     * Adds random variation modifiers to create diverse images
     * Uses history tracking to avoid immediate repetition
     */
    private getRandomVariations(): string {
        const styles = [
            'photorealistic style',
            'artistic interpretation',
            'professional photography',
            'digital art style',
            'cinematic composition',
            'natural lighting',
            'dramatic lighting',
            'soft lighting',
            'studio lighting',
            '4k architectural',
            'macro photography'
        ];

        const perspectives = [
            'eye-level view',
            'slightly elevated angle',
            'close-up perspective',
            'wide shot',
            'medium shot',
            'dynamic angle',
            'low angle',
            'detailed macro zoom'
        ];

        const moods = [
            'vibrant colors',
            'natural colors',
            'warm tones',
            'cool tones',
            'high contrast',
            'soft contrast',
            'atmospheric glow',
            'clean and minimal'
        ];

        let variations: string;
        let attempts = 0;

        // Try to generate a unique combination not used recently
        do {
            const randomStyle = styles[Math.floor(Math.random() * styles.length)];
            const randomPerspective = perspectives[Math.floor(Math.random() * perspectives.length)];
            const randomMood = moods[Math.floor(Math.random() * moods.length)];

            variations = `${randomStyle}, ${randomPerspective}, ${randomMood}`;
            attempts++;
        } while (this.recentVariations.has(variations) && attempts < 20);

        // Track this variation
        this.recentVariations.add(variations);
        if (this.recentVariations.size > this.MAX_RECENT_TRACKING) {
            // Remove the oldest inserted item (Set iteration order is insertion order)
            const first = this.recentVariations.values().next().value;
            if (first) this.recentVariations.delete(first);
        }

        return variations;
    }

    /**
     * Enhances the user's prompt to be more specific and detailed
     */
    private enhancePrompt(userPrompt: string): string {
        const cleanPrompt = userPrompt.trim();

        // Add random variations to ensure different outputs
        const variations = this.getRandomVariations();

        const qualityModifiers = 'high quality, detailed, accurate representation, 8k resolution';

        // Combine: user prompt + quality + random variations
        return `${cleanPrompt}, ${qualityModifiers}, ${variations}`;
    }

    /**
     * Generates a random seed for image generation
     */
    private getRandomSeed(): number {
        return Math.floor(Math.random() * 1000000000);
    }

    public async generateImage(prompt: string): Promise<string> {
        try {
            console.log(`🎨 Original prompt: ${prompt}`);

            // Enhance the prompt for better accuracy and variety
            const enhancedPrompt = this.enhancePrompt(prompt);
            console.log(`✨ Enhanced prompt: ${enhancedPrompt}`);

            // Generate random seed for uniqueness
            const seed = this.getRandomSeed();
            console.log(`🎲 Using seed: ${seed}`);

            // Pollinations.ai API with 'flux' model, enhancement, and seed
            const encodedPrompt = encodeURIComponent(enhancedPrompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&model=flux&enhance=true&seed=${seed}`;

            // Download the image
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 90000, // Increased timeout for flux model
                headers: {
                    'Cache-Control': 'no-cache',
                }
            });

            const buffer = Buffer.from(response.data);
            const fileName = `img_${uuidv4()}.jpg`;
            const filePath = path.join(process.cwd(), 'temp', fileName);

            fs.writeFileSync(filePath, buffer);
            console.log(`✅ Image saved to ${filePath}`);

            return filePath;

        } catch (error: any) {
            console.error('❌ Image Generation Error:', error.message);
            throw new Error('QUOTA_EXCEEDED');
        }
    }

    /**
     * Generate multiple variations of the same prompt
     */
    public async generateImageVariations(prompt: string, count: number = 3): Promise<string[]> {
        const images: string[] = [];

        for (let i = 0; i < count; i++) {
            try {
                console.log(`\n🎨 Generating variation ${i + 1}/${count}...`);
                const imagePath = await this.generateImage(prompt);
                images.push(imagePath);

                // Small delay between requests
                if (i < count - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (error) {
                console.error(`Failed to generate variation ${i + 1}`);
            }
        }

        return images;
    }
}

export const googleImageGenerationService = GoogleImageGenerationService.getInstance();