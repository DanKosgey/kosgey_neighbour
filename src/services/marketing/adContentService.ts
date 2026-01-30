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

    private getRandomVisualScenario(isService: boolean): string {
        const productScenarios = [
            "Macro Detail: Extreme close-up of the product texture/material. Shallow depth of field.",
            "In-Context Action: The product being used in its natural environment by a person (hands/partial view).",
            "Studio Hero: The product floating or placed on a minimal podium with dramatic lighting.",
            "Knolling: Top-down flat lay arrangement of the product with related high-end accessories.",
            "Natural Light: The product placed on a table/surface near a window with beautiful shadows.",
            "Splash/Dynamic: The product in motion, with dynamic elements (water splash, dust, speed lines) if applicable."
        ];

        const serviceScenarios = [
            "Professional Interaction: A warm, high-quality shot of a professional meeting or consultation.",
            "Result Visualization: A conceptual representation of the 'After' state or success metric.",
            "Human Connection: Close-up of happy clients/people shaking hands or smiling authentically.",
            "Abstract Concept: A clean, modern 3D render representing growth, security, or efficiency.",
            "Workspace: A messy but aesthetic creative workspace showing the 'process' or tools of the trade.",
            "Team Hero: A confident, diverse team standing together in a modern office or relevant location."
        ];

        const set = isService ? serviceScenarios : productScenarios;
        return set[Math.floor(Math.random() * set.length)];
    }

    private constructImagePrompt(profile: any, style: VisualStyle, timeContext: TimeOfDay, visualScenario: string): string {
        const isService = this.detectServiceBusiness(profile.productInfo);
        const subjectType = isService ? "SERVICE/CONCEPT" : "PHYSICAL PRODUCT";

        return `Professional Commercial Photography ($8k resolution, highly detailed).
        Subject Type: ${subjectType}
        Subject Description: "${profile.productInfo}"
        
        VISUAL SCENARIO: ${visualScenario}
        
        Detailed Context: ${profile.uniqueSellingPoint}.
        Target Audience: ${profile.targetAudience} (Use for styling/ambiance only).
        
        Visual Style: ${this.styleGuides[style]}
        Lighting/Mood: ${this.timeInfluence[timeContext]}
        
        CRITICAL VISUAL GUIDELINES:
        - PHOTOREALISTIC: Use 8k resolution, highly detailed textures.
        - COMPOSITION: Rule-of-thirds or centered hero shot based on scenario.
        - NO TEXT: Use absolutely NO text, logos, or watermarks in the image.
        - NO DEFORMITIES: Fix hands/faces if human subjects are present.
        - Make it look like a real advertisement from a premium magazine.`;
    }

    private detectServiceBusiness(info: string): boolean {
        const lower = info.toLowerCase();
        const keywords = ['service', 'consulting', 'agency', 'coaching', 'training', 'design', 'development', 'writer', 'assistant', 'cleaning', 'repair', 'legal', 'law', 'account'];
        return keywords.some(k => lower.includes(k));
    }

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
        const adCopy = await this.generateAdCopy(profile, style, timeContext, framework, customInstructions, campaign.name);

        // 6. Generate Image
        // visual scenario engine
        const isService = this.detectServiceBusiness(profile.productInfo);
        const visualScenario = this.getRandomVisualScenario(isService);

        const imagePrompt = this.constructImagePrompt(profile, style, timeContext, visualScenario);
        let imagePath: string | undefined;

        try {
            console.log(`🎨 Generating visual (Style: ${style}, Scenario: ${visualScenario})...`);
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

    /**
     * Creativity Engine: Defines distinct personas for the AI to adopt
     */
    private getRandomCreativeAngle(): { persona: string, angle: string } {
        const angles = [
            { persona: "The Storyteller", angle: "Start with a micro-story or scenario. Focus on the 'before' state." },
            { persona: "The Best Friend", angle: "Casual, intimate, strictly 1-on-1 tone. candid advice." },
            { persona: "The Provocateur", angle: "Start with a controversial or surprising statement. Challenge a common belief." },
            { persona: "The Minimalist", angle: "Extremely punchy, short sentences. Focus effectively on the Result only." },
            { persona: "The Insider", angle: "Use 'Behind the scenes' or 'Secret' framing. Make them feel part of an exclusive club." },
            { persona: "The Analyst", angle: "Focus on logic, numbers, and efficiency. 'Why waste X when you can Y?'" },
            { persona: "The Visionary", angle: "Focus on the 'Dream Outcome'. Paint a vivid picture of the future self." },
            { persona: "The Urgent Messenger", angle: "Strictly focus on 'Why Now'. Create immediate but authentic scarcity." },
            { persona: "The Artisan", angle: "Focus on craftsmanship, materials, and intricate details. Appreciation of quality." },
            { persona: "The Coach", angle: "Empowering, encouraging, and instructional. 'You can do this, here is how'." },
            { persona: "The Skeptic turned Believer", angle: "Start with doubt ('I was unsure if...'), then reveal the convincing proof." }
        ];
        return angles[Math.floor(Math.random() * angles.length)];
    }

    private async generateAdCopy(profile: any, style: VisualStyle, timeContext: TimeOfDay, framework: PitchFramework, customInstructions?: string, campaignName?: string): Promise<any> {
        const shopContext = `Brand: ${profile.productInfo}, Industry: ${profile.targetAudience}. USP: ${profile.uniqueSellingPoint}. Voice: ${profile.brandVoice}`;

        const frameworkInstructions = this.getFrameworkInstructions(framework);
        const { persona, angle } = this.getRandomCreativeAngle();
        const campContext = campaignName ? `Campaign Theme: "${campaignName}"` : "";

        let instructionBlock = "";
        if (customInstructions) {
            instructionBlock = `
            CRITICAL OVERRIDE INSTRUCTIONS:
            The user has explicitly requested: "${customInstructions}".
            You MUST IGNORE the standard style/framework rules if they conflict with this.
            Focus ENTIRELY on fulfilling this specific request while maintaining the brand voice.
            `;
        }

        const prompt = `You are a World-Class Copywriter adopting the persona of '${persona}'. ${shopContext}
        
        Generate a WhatsApp ad variant for:
        Product/Focus: ${profile.productInfo}
        Audience: ${profile.targetAudience}
        Tone: ${profile.brandVoice}
        ${campContext}
        Time Context: ${timeContext} (${this.timeInfluence[timeContext]})
        Style: ${style}
        Framework: ${framework}
        
        CREATIVE ANGLE: ${angle}
        
        ${frameworkInstructions}

        ${instructionBlock}
 
        Guidelines:
        - 🎯 PRODUCT ISOLATION: Focus strictly on the 'Product/Focus' described above. Do not mix with generic brand info unless relevant. Treat this as a unique campaign.
        - 🛑 DO NOT start with "Are you..." or "Do you...". This is banned.
        - 🛑 DO NOT use the phrase "Unlock your potential" or "Elevate your business".
        - Start with a Hook that fits the '${persona}' persona.
        - Adapt hooks for the ${timeContext} mindset.
        - Include high-impact emojis, but don't overdo it.
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



    private formatAdOutput(adJson: any): string {
        if (typeof adJson === 'string') return adJson;

        let output = `*${adJson.headline || 'Special Offer'}*\n\n`;
        output += `${adJson.body}\n\n`;
        output += `👉 ${adJson.cta || 'Reply to learn more!'}`;
        return output;
    }
}

export const adContentService = AdContentService.getInstance();
