import { geminiService } from '../ai/gemini';
import { googleImageGenerationService } from '../googleImageGeneration';
import { db } from '../../database';
import { businessProfile, marketingCampaigns } from '../../database/schema';
import { eq } from 'drizzle-orm';

// --- Types based on User Idea ---
export enum VisualStyle {
    HERO = "Product Hero Shots",
    LIFESTYLE = "Lifestyle Integration",
    BEFORE_AFTER = "Before/After Transformations",
    CUSTOMER_STORY = "Customer Stories",
    INFOGRAPHIC = "Infographic Style",
    MINIMALIST = "Minimalist Design",
    VIBRANT = "Vibrant & Energetic",
    LUXURY = "Luxury Premium",
    UGC = "User-Generated Content Style",
    SEASONAL = "Seasonal/Trending"
}

export enum PitchFramework {
    PAS = "Problem-Agitate-Solution",
    AIDA = "Attention-Interest-Desire-Action",
    STORY = "Story-Based",
    FOMO = "Urgency-Driven (FOMO)",
    VALUE = "Value Comparison",
    SOCIAL_PROOF = "Social Proof",
    EDUCATIONAL = "Educational",
    EMOTIONAL = "Emotional Appeal",
    CHALLENGE = "Challenge-Based",
    QUESTION = "Question-Led"
}

export enum TimeOfDay {
    MORNING = "Morning",
    AFTERNOON = "Afternoon",
    EVENING = "Evening"
}

export class AdContentService {
    private static instance: AdContentService;

    private constructor() { }

    public static getInstance(): AdContentService {
        if (!AdContentService.instance) {
            AdContentService.instance = new AdContentService();
        }
        return AdContentService.instance;
    }

    /**
     * Get rotated visual style based on campaign start date (rotates every 3 days)
     */
    private getRotatedStyle(campaignStartDate: Date): VisualStyle {
        const styles = Object.values(VisualStyle);
        const daysSinceStart = Math.floor((Date.now() - campaignStartDate.getTime()) / (1000 * 60 * 60 * 24));
        const styleIndex = Math.floor(daysSinceStart / 3) % styles.length;
        return styles[styleIndex] as VisualStyle;
    }

    /**
     * Get rotated pitch framework (rotates daily)
     */
    private getRotatedFramework(campaignStartDate: Date): PitchFramework {
        const frameworks = Object.values(PitchFramework);
        const daysSinceStart = Math.floor((Date.now() - campaignStartDate.getTime()) / (1000 * 60 * 60 * 24));
        const frameworkIndex = daysSinceStart % frameworks.length;
        return frameworks[frameworkIndex] as PitchFramework;
    }

    private styleGuides: Record<VisualStyle, string> = {
        [VisualStyle.HERO]: "Studio hero shot, extremely sharp focus, crisp professional lighting, floating product, high-end commercial aesthetic, neutral gradient background.",
        [VisualStyle.LIFESTYLE]: "Cinematic lifestyle photography, product in natural use by people, shallow depth of field, warm inviting colors, authentic surroundings.",
        [VisualStyle.BEFORE_AFTER]: "Split-screen comparison, dramatic transformation, clear problem vs solution contrast, professional before/after documentation style.",
        [VisualStyle.CUSTOMER_STORY]: "Authentic testimonial aesthetic, real customer using product, genuine emotion, relatable setting, documentary photography style.",
        [VisualStyle.INFOGRAPHIC]: "Clean top-down view, labeled features with subtle aesthetic lines, organized layout, modern technical illustration style.",
        [VisualStyle.MINIMALIST]: "Clean minimalist art, flat matte colors, geometric balance, soft diffused lighting, no clutter, Scandinavian design influence.",
        [VisualStyle.VIBRANT]: "Explosion of color, dynamic motion blur, high energy, pop-art saturation, fun and youthful aesthetic.",
        [VisualStyle.LUXURY]: "Moody premium lighting, gold and silver highlights, velvet and marble textures, sophisticated shadows, elite boutique photography.",
        [VisualStyle.UGC]: "Shot on iPhone style, authentic raw lighting, handheld feel, relatable everyday background, non-commercial vibe.",
        [VisualStyle.SEASONAL]: "Seasonal theme integration, holiday decorations or current event context, trending aesthetic, timely cultural relevance."
    };

    private timeInfluence = {
        [TimeOfDay.MORNING]: "Bright morning sunlight, crisp white highlights, fresh airy atmosphere. Mindset: energetic, productive, fresh start.",
        [TimeOfDay.AFTERNOON]: "Natural midday light, clear shadows, high clarity and detail. Mindset: busy, solution-focused, quick.",
        [TimeOfDay.EVENING]: "Golden hour lighting, long warm shadows, cozy atmospheric glow. Mindset: relaxed, reflective, reward-seeking."
    };

    /**
     * Generate complete ad content (Text + Image URL/Path)
     */
    public async generateAd(campaignId: number, styleHint: string = 'balanced', customInstructions?: string): Promise<{ text: string, imagePath?: string }> {
        // 1. Fetch Campaign
        const campaign = await db.query.marketingCampaigns.findFirst({
            where: eq(marketingCampaigns.id, campaignId)
        });
        if (!campaign) throw new Error("Campaign not found.");

        // 2. Determine Business Profile (Campaign specific OR Global Fallback)
        let profile: any = campaign;

        // If campaign lacks specific product info, fall back to global business profile
        if (!campaign.productInfo) {
            const globalProfile = await db.query.businessProfile.findFirst();
            if (!globalProfile) throw new Error("No business profile found. Please run onboarding or configure campaign details.");
            profile = globalProfile;
        }

        // 3. Calculate rotated style and framework
        const style = this.getRotatedStyle(campaign.startDate!);
        const framework = this.getRotatedFramework(campaign.startDate!);

        // 4. Determine time context from styleHint
        const timeContext = this.extractTimeContext(styleHint);

        // 5. Generate Copy (with framework)
        const adCopy = await this.generateAdCopy(profile, style, timeContext, framework, customInstructions);

        // 6. Generate Image
        // If Custom Instructions are present, maybe modify image prompt too?
        // For now, let's keep image consistent with product unless instructions explicitly ask (complex).
        // We'll stick to standard image generation for stability, or append a note.
        // Let's just trust the product context for image.
        const imagePrompt = this.constructImagePrompt(profile, style, timeContext);
        let imagePath: string | undefined;

        try {
            console.log(`🎨 Generating visual for ad (Style: ${style}, Time: ${timeContext}, Framework: ${framework})...`);
            imagePath = await googleImageGenerationService.generateImage(imagePrompt);
        } catch (e) {
            console.error("Failed to generate ad image:", e);
        }

        return { text: this.formatAdOutput(adCopy), imagePath };
    }

    private extractTimeContext(styleHint: string): TimeOfDay {
        const lowerHint = styleHint.toLowerCase();
        if (lowerHint.includes('afternoon')) return TimeOfDay.AFTERNOON;
        if (lowerHint.includes('evening')) return TimeOfDay.EVENING;
        return TimeOfDay.MORNING;
    }

    private mapStyleToEnums(styleHint: string): { style: VisualStyle, timeContext: TimeOfDay } {
        let style = VisualStyle.HERO;
        let timeContext = TimeOfDay.MORNING;

        const lowerHint = styleHint.toLowerCase();

        // Map Time
        if (lowerHint.includes('afternoon')) timeContext = TimeOfDay.AFTERNOON;
        else if (lowerHint.includes('evening')) timeContext = TimeOfDay.EVENING;

        // Map Style
        if (lowerHint.includes('energetic') || lowerHint.includes('vibrant')) style = VisualStyle.VIBRANT;
        else if (lowerHint.includes('practical') || lowerHint.includes('clean')) style = VisualStyle.MINIMALIST;
        else if (lowerHint.includes('relaxed') || lowerHint.includes('lifestyle')) style = VisualStyle.LIFESTYLE;
        else if (lowerHint.includes('luxury')) style = VisualStyle.LUXURY;

        return { style, timeContext };
    }

    private async generateAdCopy(profile: any, style: VisualStyle, timeContext: TimeOfDay, framework: PitchFramework, customInstructions?: string): Promise<any> {
        const shopContext = `Brand: ${profile.productInfo}, Industry: ${profile.targetAudience}. USP: ${profile.uniqueSellingPoint}. Voice: ${profile.brandVoice}`;

        const frameworkInstructions = this.getFrameworkInstructions(framework);

        let instructionBlock = "";
        if (customInstructions) {
            instructionBlock = `
            CRITICAL OVERRIDE INSTRUCTIONS:
            The user has explicitly requested: "${customInstructions}".
            You MUST IGNORE the standard style/framework rules if they conflict with this.
            Focus ENTIRELY on fulfilling this specific request while maintaining the brand voice.
            `;
        }

        const prompt = `You are a Senior Creative Director. ${shopContext}
        Generate a WhatsApp ad variant for:
        Product: ${profile.productInfo}
        Audience: ${profile.targetAudience}
        Tone: ${profile.brandVoice}
        Time Context: ${timeContext} (${this.timeInfluence[timeContext]})
        Style: ${style}
        Framework: ${framework}
        
        ${frameworkInstructions}

        ${instructionBlock}
 
        Guidelines:
        - Adapt hooks for the ${timeContext} mindset.
        - Include high-impact emojis.
        - Return a SINGLE JSON object with keys: 'headline', 'body', 'cta'.
        - Do NOT wrap in markdown code blocks. Just raw JSON if possible, or simple text I can parse.`;

        const raw = await geminiService.generateText(prompt);
        try {
            // Attempt to clean markdown
            const jsonStr = raw.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (e) {
            // Fallback if AI returns plain text
            return { headline: "New Offer!", body: raw, cta: "Shop Now" };
        }
    }

    private getFrameworkInstructions(framework: PitchFramework): string {
        const instructions: Record<PitchFramework, string> = {
            [PitchFramework.PAS]: "Use Problem-Agitate-Solution: Start with the pain point, intensify it, then offer your product as the relief.",
            [PitchFramework.AIDA]: "Use Attention-Interest-Desire-Action: Grab attention, build interest, create desire, end with clear action.",
            [PitchFramework.STORY]: "Tell a customer journey story: Before they found you, the transformation, the happy ending.",
            [PitchFramework.FOMO]: "Create urgency: Limited time, scarcity, exclusive offer, fear of missing out.",
            [PitchFramework.VALUE]: "Show value comparison: Price justification, what they get vs competitors, ROI focus.",
            [PitchFramework.SOCIAL_PROOF]: "Lead with social proof: Reviews, testimonials, number of happy customers, popularity.",
            [PitchFramework.EDUCATIONAL]: "Educate first: Share tips, how-tos, insights, then subtly introduce product as solution.",
            [PitchFramework.EMOTIONAL]: "Appeal to identity and emotion: Belonging, status, self-image, aspirations.",
            [PitchFramework.CHALLENGE]: "Start with a challenge or surprising statement: 'Can you believe...', 'Most people don't know...'",
            [PitchFramework.QUESTION]: "Lead with engaging questions that make them think, then answer with your product."
        };
        return instructions[framework];
    }

    private constructImagePrompt(profile: any, style: VisualStyle, timeContext: TimeOfDay): string {
        return `High-end commercial product photography of "${profile.productInfo}". 
        The image must prominently feature the product/service itself in a realistic setting.
        
        Detailed Context: ${profile.uniqueSellingPoint}.
        Target Audience: ${profile.targetAudience}.
        
        Visual Style: ${this.styleGuides[style]}
        Lighting/Mood: ${this.timeInfluence[timeContext]}
        
        CRITICAL VISUAL GUIDELINES:
        - PHOTOREALISTIC: Use 8k resolution, highly detailed textures, depth of field.
        - FOCUS ON SUBJECT: Show the actual product or service result. Avoid generic abstract AI shapes.
        - COMPOSITION: Professional rule-of-thirds or centered hero shot.
        - NO text, NO logos, NO watermarks, NO distorted faces or hands.
        - Make it look like a real advertisement from a premium magazine.`;
    }

    private formatAdOutput(adJson: any): string {
        if (typeof adJson === 'string') return adJson;

        let output = `*${adJson.headline || 'Special Offer'}*\n\n`;
        output += `${adJson.body}\n\n`;
        output += `👉 ${adJson.cta || 'Reply to learn more!'}`;
        return output;
    }
}

export const adContentService = AdContentService.getInstance();
