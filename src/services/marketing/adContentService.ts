import fs from 'fs';
import path from 'path';
import { geminiService } from '../ai/gemini';
import { googleImageGenerationService } from '../googleImageGeneration';
import { db } from '../../database';
import { businessProfile, marketingCampaigns, products } from '../../database/schema';
import { eq, and, asc } from 'drizzle-orm';

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
            "Studio Hero: The product floating or placed on a minimal podium with dramatic lighting.",
            "Lifestyle Context: Product being used in a beautiful, aspirational real-world setting.",
            "Close-up Detail: Extreme macro shot highlighting craftsmanship, texture, or unique features.",
            "Flat Lay: Overhead shot with complementary items arranged artistically around the product.",
            "Action Shot: Product in motion or being actively used, frozen in a dynamic moment.",
            "Minimalist Zen: Product alone on a solid color background with perfect shadows and reflections.",
            "Nature Integration: Product harmoniously placed in a natural outdoor environment.",
            "Urban Edge: Product in a modern city setting with architecture and street vibes."
        ];

        const serviceScenarios = [
            "Professional Interaction: A warm, high-quality shot of a professional meeting or consultation.",
            "Result Visualization: A conceptual representation of the 'After' state or success metric.",
            "Human Connection: Close-up of happy clients/people shaking hands or smiling authentically.",
            "Abstract Concept: A clean, modern 3D render representing growth, security, or efficiency.",
            "Workspace: A messy but aesthetic creative workspace showing the 'process' or tools of the trade.",
            "Team Hero: A confident, diverse team standing together in a modern office or relevant location.",
            "Digital Interface: Sleek UI/dashboard mockup showing the service in action on screens.",
            "Metaphorical Visual: Creative metaphor (e.g., rocket for growth, shield for security, bridge for connection)."
        ];

        const set = isService ? serviceScenarios : productScenarios;
        return set[Math.floor(Math.random() * set.length)];
    }

    private constructImagePrompt(profile: any, style: VisualStyle, timeContext: TimeOfDay, visualScenario: string): string {
        // Prioritize enhanced businessDescription if available
        const businessContext = profile.businessDescription || profile.productInfo || 'innovative product';

        // Simple color palettes for eye-catching visuals
        const colorPalettes = [
            'vibrant gradient (purple to pink)',
            'bold solid color (electric blue or neon green)',
            'warm sunset tones (orange, coral, yellow)',
            'cool minimalist (white, light gray, soft blue)',
            'energetic contrast (black and bright yellow)',
            'fresh and clean (mint green and white)',
            'modern tech (dark blue and cyan)',
            'playful pop (hot pink and turquoise)'
        ];

        const randomColor = colorPalettes[Math.floor(Math.random() * colorPalettes.length)];

        // Simple visual concepts
        const simpleVisuals = [
            'floating 3D icon or symbol',
            'abstract geometric shapes',
            'minimalist illustration',
            'bold typography design',
            'simple product mockup',
            'clean flat design',
            'modern gradient background',
            'eye-catching pattern'
        ];

        const randomVisual = simpleVisuals[Math.floor(Math.random() * simpleVisuals.length)];

        return `Create a SIMPLE, EYE-CATCHING image for: "${businessContext}"

STYLE: ${randomVisual} with ${randomColor} background

RULES:
- SIMPLE & CLEAN: Minimal elements, maximum impact
- EYE-CATCHING: Bold colors, strong contrast, immediately grabs attention
- NO TEXT: Absolutely no words, letters, or text in the image
- CONTEXTUAL: Relates to the business but stays abstract and simple
- MODERN: Contemporary design, not cluttered or busy
- HIGH QUALITY: Sharp, professional, polished look

Think: Instagram-worthy, scroll-stopping visual that makes people LOOK.
Less is more. Bold and simple beats complex and detailed.`;
    }

    private detectServiceBusiness(info: string): boolean {
        const lower = info.toLowerCase();
        const keywords = ['service', 'consulting', 'agency', 'coaching', 'training', 'design', 'development', 'writer', 'assistant', 'cleaning', 'repair', 'legal', 'law', 'account'];
        return keywords.some(k => lower.includes(k));
    }

    /**
     * Resolve product image to a file path (handles data URLs and file paths)
     */
    private resolveProductImageToPath(imageUrl: string | null | undefined): string | undefined {
        if (!imageUrl) return undefined;
        if (imageUrl.startsWith('data:')) {
            const match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!match) return undefined;
            const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            const filePath = path.join(tempDir, `product_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
            fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
            return filePath;
        }
        if (fs.existsSync(imageUrl)) return imageUrl;
        return undefined;
    }

    /**
     * Get image from product (supports imageUrl, imageUrls array for career multi-photo)
     */
    private getProductImage(product: any, imageIndex: number = 0): string | undefined {
        const urls = product.imageUrls && Array.isArray(product.imageUrls) && product.imageUrls.length > 0
            ? product.imageUrls
            : product.imageUrl ? [product.imageUrl] : [];
        const url = urls[imageIndex % urls.length];
        return url ? this.resolveProductImageToPath(url) : undefined;
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

        // If campaign uses entire shop: rotate through all products
        if (campaign.contentSource === 'existing' && campaign.selectedShopId) {
            const shopProducts = await db.select().from(products).where(eq(products.shopId, campaign.selectedShopId)).orderBy(asc(products.id));
            if (shopProducts.length > 0) {
                const settings = (campaign.settings as Record<string, unknown>) || {};
                const lastIndex = (settings.lastRotatedProductIndex as number) ?? 0;
                const nextIndex = lastIndex % shopProducts.length;
                const product = shopProducts[nextIndex];
                const productInfo = product.description || `${product.name}: ${product.description || ''}`.trim();
                profile = { ...profile, productInfo: profile.productInfo || productInfo };
                const productImagePath = this.getProductImage(product, nextIndex);
                if (productImagePath) {
                    console.log(`📦 Rotating shop: using product ${nextIndex + 1}/${shopProducts.length} "${product.name}"`);
                    const adCopy = await this.generateAdCopy(profile, this.getRotatedStyle(campaign.startDate!), this.extractTimeContext(styleHint), this.getRotatedFramework(campaign.startDate!), customInstructions, campaign.name, campaign.businessDescription, campaign.companyLink);
                    const newIndex = (nextIndex + 1) % shopProducts.length;
                    await db.update(marketingCampaigns).set({ settings: { ...settings, lastRotatedProductIndex: newIndex } }).where(eq(marketingCampaigns.id, campaignId));
                    return { text: this.formatAdOutput(adCopy, campaign.companyLink), imagePath: productImagePath };
                }
                console.log(`📦 Product "${product.name}" has no image, using AI to generate ad visual`);
                await db.update(marketingCampaigns).set({ settings: { ...settings, lastRotatedProductIndex: (nextIndex + 1) % shopProducts.length } }).where(eq(marketingCampaigns.id, campaignId));
            }
        }

        // If campaign uses single product
        if (campaign.contentSource === 'existing' && campaign.selectedProductId) {
            const product = await db.query.products.findFirst({
                where: eq(products.id, campaign.selectedProductId)
            });
            if (product) {
                const productInfo = product.description || `${product.name}: ${product.description || ''}`.trim();
                profile = { ...profile, productInfo: profile.productInfo || productInfo };
                const productImagePath = this.getProductImage(product);
                if (productImagePath) {
                    console.log(`📦 Using existing product image for "${product.name}"`);
                    const adCopy = await this.generateAdCopy(profile, this.getRotatedStyle(campaign.startDate!), this.extractTimeContext(styleHint), this.getRotatedFramework(campaign.startDate!), customInstructions, campaign.name, campaign.businessDescription, campaign.companyLink);
                    return { text: this.formatAdOutput(adCopy, campaign.companyLink), imagePath: productImagePath };
                }
                console.log(`📦 Product "${product.name}" has no image, using AI to generate ad visual`);
            }
        }

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

        // 5. Generate Copy (with framework and business description)
        const adCopy = await this.generateAdCopy(profile, style, timeContext, framework, customInstructions, campaign.name, campaign.businessDescription, campaign.companyLink);

        // 6. Generate Image (AI-generated when contentSource is 'ai' or product has no image)
        const isService = this.detectServiceBusiness(profile.productInfo);
        const visualScenario = this.getRandomVisualScenario(isService);
        const imagePrompt = this.constructImagePrompt(profile, style, timeContext, visualScenario);
        let imagePath: string | undefined;

        try {
            console.log(`🎨 Generating AI visual (Style: ${style}, Scenario: ${visualScenario})...`);
            imagePath = await googleImageGenerationService.generateImage(imagePrompt);
        } catch (e) {
            console.error("Failed to generate ad image:", e);
        }

        return { text: this.formatAdOutput(adCopy, campaign.companyLink), imagePath };
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

    private async generateAdCopy(profile: any, style: VisualStyle, timeContext: TimeOfDay, framework: PitchFramework, customInstructions?: string, campaignName?: string, businessDescription?: string | null, companyLink?: string | null): Promise<any> {
        // Prioritize businessDescription as the primary context
        const businessContext = businessDescription || `Brand: ${profile.productInfo}, Industry: ${profile.targetAudience}. USP: ${profile.uniqueSellingPoint}. Voice: ${profile.brandVoice}`;

        const frameworkInstructions = this.getFrameworkInstructions(framework);
        const { persona, angle } = this.getRandomCreativeAngle();
        const campContext = campaignName ? `Campaign Theme: "${campaignName}"` : "";

        const linkInstruction = companyLink ? `\n        CONTEXT: The company website is: ${companyLink}. Ensure the CTA drives traffic there.` : "";

        let instructionBlock = "";
        if (customInstructions) {
            instructionBlock = `
            CRITICAL OVERRIDE INSTRUCTIONS:
            The user has explicitly requested: "${customInstructions}".
            You MUST IGNORE the standard style/framework rules if they conflict with this.
            Focus ENTIRELY on fulfilling this specific request while maintaining the brand voice.
            `;
        }

        const prompt = `You are a World-Class Copywriter adopting the persona of '${persona}'.
        
        BUSINESS CONTEXT (PRIMARY):
        ${businessContext}
        ${linkInstruction}
        
        Task: Write a *hypershort*, edgy WhatsApp ad.
        ${campContext}
        Time: ${timeContext}
        
        CRITICAL RULES (STRICT):
        1. **LENGTH**: MAXIMUM 1-2 SENTENCES total for the body. This is a hard limit.
        2. **STYLE**: "Random cool shit". Be punchy, witty, unexpected, and high energy.
        3. **NO FLUFF**: No "Good morning", no "Hello", no "Attention". Jump straight into the hook.
        4. **FORMAT**: 
           - Headline: 4 words max. Punchy.
           - Body: 1-2 short, impactful sentences.
           - CTA: Short and direct.
        
        CREATIVE ANGLE: ${angle}
        
        ${frameworkInstructions}
        
        ${instructionBlock}

        Guidelines:
        - 🎯 BUSINESS-FIRST: Use the Business Context above.
        - 🛑 STRICTLY 1-2 SENTENCES. Less is more.
        - Include 1-2 relevant emojis.
        - Return a SINGLE JSON object with keys: 'headline', 'body', 'cta'.
        - Do NOT wrap in markdown code blocks. Just raw JSON if possible.`;

        const raw = await geminiService.generateText(prompt);
        try {
            // Attempt to clean markdown
            const jsonStr = raw.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(jsonStr);
            // Attach link to result for formatter
            if (companyLink) result.companyLink = companyLink;
            return result;
        } catch (e) {
            // Fallback if AI returns plain text
            return { headline: "New Offer!", body: raw, cta: "Shop Now", companyLink };
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



    private formatAdOutput(adJson: any, companyLink?: string | null): string {
        if (typeof adJson === 'string') {
            // If AI returned plain text, append DM and link at the end
            let plainOutput = adJson;
            plainOutput += `\n\n📩 DM me to book a call or for details`;
            if (companyLink) {
                plainOutput += `\n🔗 ${companyLink}`;
            }
            return plainOutput;
        }

        let output = `*${adJson.headline || 'Special Offer'}*\n\n`;
        output += `${adJson.body}\n\n`;

        let cta = `👉 ${adJson.cta || 'Reply to learn more!'}`;
        cta += `\n📩 DM me to book a call or for details`; // Updated instruction
        if (companyLink) {
            cta += `\n🔗 ${companyLink}`;
        }
        output += cta;
        return output;
    }
}

export const adContentService = AdContentService.getInstance();
