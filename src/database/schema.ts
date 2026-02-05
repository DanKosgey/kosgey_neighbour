import { pgTable, text, serial, timestamp, boolean, varchar, integer, jsonb, index } from 'drizzle-orm/pg-core'; // Added index import

// 1. Contacts: The Rolodex with Identity Validation
export const contacts = pgTable('contacts', {
    id: serial('id').primaryKey(),
    phone: varchar('phone', { length: 50 }).notNull().unique(), // +254...

    // Identity fields
    originalPushname: text('original_pushname'), // Name from WhatsApp (for reference)
    confirmedName: text('confirmed_name'), // Name the user actually gave
    isVerified: boolean('is_verified').default(false), // Has identity been confirmed?

    // Legacy field (keeping for backward compatibility)
    name: text('name'), // Will be synced with confirmedName

    // Profile & Context
    contextSummary: text('context_summary'), // "John's brother", "Client from Nairobi", etc.
    summary: text('summary'), // AI-generated detailed profile
    trustLevel: integer('trust_level').default(0), // 0-10
    platform: varchar('platform', { length: 20 }).default('whatsapp'), // 'whatsapp' | 'telegram'

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    lastSeenAt: timestamp('last_seen_at').defaultNow(),
}, (table) => {
    return {
        phoneIdx: index('phone_idx').on(table.phone), // Optimize lookup by phone
        platformIdx: index('platform_idx').on(table.platform),
    };
});

// 2. Message History: The Memory
export const messageLogs = pgTable('message_logs', {
    id: serial('id').primaryKey(),
    contactPhone: varchar('contact_phone', { length: 50 }).references(() => contacts.phone),
    role: varchar('role', { length: 10 }).notNull(), // 'agent' | 'user'
    content: text('content').notNull(),
    type: varchar('type', { length: 20 }).default('text'), // 'text' | 'image' | 'voice' | 'document' | 'location'
    platform: varchar('platform', { length: 20 }).default('whatsapp'), // 'whatsapp' | 'telegram'
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        contactPhoneIdx: index('contact_phone_idx').on(table.contactPhone), // Optimize history lookup
        createdAtIdx: index('created_at_idx').on(table.createdAt), // Optimize resizing/sorting
        platformIdx: index('message_platform_idx').on(table.platform),
    };
});

// 3. Auth Credentials: session persistence
export const authCredentials = pgTable('auth_credentials', {
    key: text('key').primaryKey(),
    value: text('value').notNull(), // JSON stringified auth data
});

// 4. Session Lock: Prevent multiple instances from connecting
export const sessionLock = pgTable('session_lock', {
    id: serial('id').primaryKey(),
    sessionName: varchar('session_name', { length: 100 }).notNull().unique(),
    instanceId: text('instance_id').notNull(), // Unique ID for this process
    lockedAt: timestamp('locked_at').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(), // Auto-expire after 5 minutes
});

// 5. Conversations: The Smart Snitch Sessions
export const conversations = pgTable('conversations', {
    id: serial('id').primaryKey(),
    contactPhone: varchar('contact_phone', { length: 50 }).references(() => contacts.phone),
    status: varchar('status', { length: 20 }).default('active'), // 'active' | 'completed'
    urgency: varchar('urgency', { length: 10 }), // 'red' | 'yellow' | 'green'
    summary: text('summary'), // The "Traffic Light" report content
    startedAt: timestamp('started_at').defaultNow(),
    endedAt: timestamp('ended_at'),
    unreadByOwner: boolean('unread_by_owner').default(true),
});

// 6. AI Profile: Agent Customization
export const aiProfile = pgTable('ai_profile', {
    id: serial('id').primaryKey(),

    // Agent Identity
    agentName: varchar('agent_name', { length: 100 }).default('Representative'),
    agentRole: text('agent_role').default('Personal Assistant'),

    // Personality & Behavior
    personalityTraits: text('personality_traits').default('Professional, helpful, and efficient'),
    communicationStyle: text('communication_style').default('Friendly yet professional'),

    // Custom System Prompts
    systemPrompt: text('system_prompt'), // Main system prompt override
    greetingMessage: text('greeting_message'), // Custom greeting for new contacts

    // Behavior Settings
    responseLength: varchar('response_length', { length: 20 }).default('short'), // short, medium, long
    useEmojis: boolean('use_emojis').default(true),
    formalityLevel: integer('formality_level').default(5), // 1-10 scale

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// 7. User Profile: Boss/Owner Information
export const userProfile = pgTable('user_profile', {
    id: serial('id').primaryKey(),

    // Personal Information
    fullName: varchar('full_name', { length: 100 }),
    preferredName: varchar('preferred_name', { length: 50 }),
    title: varchar('title', { length: 100 }), // CEO, Manager, etc.
    company: varchar('company', { length: 200 }),

    // Contact Information
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    location: varchar('location', { length: 200 }),
    timezone: varchar('timezone', { length: 50 }),

    // Professional Context
    industry: varchar('industry', { length: 100 }),
    role: text('role'), // Detailed role description
    responsibilities: text('responsibilities'), // What they do

    // Preferences
    workingHours: text('working_hours'), // e.g., "9 AM - 5 PM EST"
    availability: text('availability'), // When they're available
    priorities: text('priorities'), // What matters most to them

    // AI Context
    backgroundInfo: text('background_info'), // Additional context for AI
    communicationPreferences: text('communication_preferences'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// 8. Message Queue: Advanced Queue System for Concurrent Processing
export const messageQueue = pgTable('message_queue', {
    id: serial('id').primaryKey(),
    jid: varchar('jid', { length: 255 }).notNull(), // WhatsApp JID
    messageData: jsonb('message_data').notNull(), // Array of messages
    priority: integer('priority').default(2).notNull(), // 0=CRITICAL, 1=HIGH, 2=NORMAL, 3=LOW
    status: varchar('status', { length: 50 }).default('pending').notNull(), // pending, processing, completed, failed
    retryCount: integer('retry_count').default(0).notNull(),
    workerId: varchar('worker_id', { length: 100 }), // Which worker is processing this
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow(),
    processedAt: timestamp('processed_at'),
}, (table) => {
    return {
        statusPriorityIdx: index('status_priority_idx').on(table.status, table.priority, table.createdAt),
        jidIdx: index('jid_idx').on(table.jid),
        workerIdx: index('worker_idx').on(table.workerId),
    };
});

// 9. Queue Metrics: Performance Monitoring
export const queueMetrics = pgTable('queue_metrics', {
    id: serial('id').primaryKey(),
    timestamp: timestamp('timestamp').defaultNow(),
    queueDepth: integer('queue_depth').notNull(),
    activeWorkers: integer('active_workers').notNull(),
    messagesProcessed: integer('messages_processed').notNull(),
    avgProcessingTimeMs: integer('avg_processing_time_ms'),
    errorCount: integer('error_count').default(0),
}, (table) => {
    return {
        timestampIdx: index('timestamp_idx').on(table.timestamp),
    };
});

// 10. Report Queue: Async conversation report generation
export const reportQueue = pgTable('report_queue', {
    id: serial('id').primaryKey(),
    contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
    contactName: text('contact_name'),
    conversationId: integer('conversation_id').references(() => conversations.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
    retryCount: integer('retry_count').default(0),
    lastAttempt: timestamp('last_attempt'),
    lastMessageTime: timestamp('last_message_time'), // When user last messaged
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        statusIdx: index('report_queue_status_idx').on(table.status),
    };
});

// 11. Marketing: Business Profile (Onboarding Data)
export const businessProfile = pgTable('business_profile', {
    id: serial('id').primaryKey(),
    productInfo: text('product_info').notNull(), // "What do you sell?"
    targetAudience: text('target_audience').notNull(), // "Who is it for?"
    uniqueSellingPoint: text('unique_selling_point').notNull(), // "Why you?"
    brandVoice: text('brand_voice').default('professional'), // "Casual", "Luxury", etc.
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// 12. Marketing: Random Facts Library
export const facts = pgTable('facts', {
    id: serial('id').primaryKey(),
    content: text('content').notNull(), // The actual fact text
    category: varchar('category', { length: 50 }).notNull(), // 'product_adjacent', 'audience_interest', 'universal'
    tier: varchar('tier', { length: 20 }).notNull(), // 'tier1', 'tier2', 'tier3'
    tags: jsonb('tags'), // Array of keywords
    source: text('source'), // Optional source citation
    usedCount: integer('used_count').default(0), // How many times posted
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        categoryIdx: index('fact_category_idx').on(table.category),
        tierIdx: index('fact_tier_idx').on(table.tier),
    };
});

// 13. Marketing: Campaigns
export const marketingCampaigns = pgTable('marketing_campaigns', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(), // e.g., "Weekly Automation"
    status: varchar('status', { length: 20 }).default('active'), // 'active', 'paused', 'completed'
    startDate: timestamp('start_date').defaultNow(),
    endDate: timestamp('end_date'),

    // Posting Times (configurable via UI)
    morningTime: varchar('morning_time', { length: 5 }).default('07:00'), // HH:MM format
    afternoonTime: varchar('afternoon_time', { length: 5 }).default('13:00'),
    eveningTime: varchar('evening_time', { length: 5 }).default('19:00'),

    // Target Groups (JSON array of JIDs) - Updated 2026-01-30
    targetGroups: jsonb('target_groups'),

    // Business Context (Overrides global profile)
    businessDescription: text('business_description'), // AI-enhanced comprehensive business context
    productInfo: text('product_info'),
    targetAudience: text('target_audience'),
    uniqueSellingPoint: text('unique_selling_point'),
    brandVoice: text('brand_voice'),
    visualStyle: text('visual_style').default('minimalist'),
    companyLink: text('company_link'),

    // Content source: 'existing' = use product from shop/career, 'ai' = AI-generated photos
    contentSource: varchar('content_source', { length: 20 }).default('ai'),
    selectedProductId: integer('selected_product_id'), // Single product when contentSource='existing'
    selectedShopId: integer('selected_shop_id'), // Entire shop: rotate through all products (shop or career)

    settings: jsonb('settings'), // { lastRotatedProductIndex: number } for shop rotation
    createdAt: timestamp('created_at').defaultNow(),
});

// 14. Marketing: Scheduled Posts (Queue)
export const scheduledPosts = pgTable('scheduled_posts', {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id').references(() => marketingCampaigns.id),
    type: varchar('type', { length: 20 }).notNull(), // 'ad', 'fact_text', 'fact_image'
    content: text('content').notNull(), // The ad copy or fact text
    mediaUrl: text('media_url'), // Local path or URL for images
    scheduledTime: timestamp('scheduled_time').notNull(),
    status: varchar('status', { length: 20 }).default('pending'), // 'pending', 'sent', 'failed'
    platform: varchar('platform', { length: 20 }).default('whatsapp'), // Target platform
    metadata: jsonb('metadata'), // Store framework used, fact ID, etc.
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        statusTimeIdx: index('sched_status_time_idx').on(table.status, table.scheduledTime),
    };
});

// 15. Marketing: Content Templates (Ad Frameworks)
export const contentTemplates = pgTable('content_templates', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(), // 'PAS', 'AIDA', 'Story'
    structure: text('structure').notNull(), // Description of structure for AI
    examples: text('examples'), // Few-shot examples
    createdAt: timestamp('created_at').defaultNow(),
});

// 16. System Settings: Dynamic Configuration
export const systemSettings = pgTable('system_settings', {
    key: varchar('key', { length: 100 }).primaryKey(),
    value: text('value').notNull(), // JSON stringifiable value
    description: text('description'),
    updatedAt: timestamp('updated_at').defaultNow(),
});


// 17. ShopFlow: Shops
export const shops = pgTable('shops', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    emoji: varchar('emoji', { length: 10 }).default('🏪'),
    type: varchar('type', { length: 20 }).default('shop'), // 'shop' | 'career'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// 18. ShopFlow: Products
export const products = pgTable('products', {
    id: serial('id').primaryKey(),
    shopId: integer('shop_id').references(() => shops.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    price: integer('price').default(0), // Storing as simple number (or could be real)
    stock: integer('stock').default(0),
    imageUrl: text('image_url'), // Data URL or file path
    imageUrls: jsonb('image_urls'), // Array of image URLs for career items (multiple photos)
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        shopIdx: index('product_shop_idx').on(table.shopId),
    };
});

// 19. Analytics: Groups Metadata
export const groups = pgTable('groups', {
    jid: varchar('jid', { length: 100 }).primaryKey(),
    subject: text('subject'),
    description: text('description'),
    creationTime: timestamp('creation_time'),
    ownerJid: varchar('owner_jid', { length: 50 }),
    totalMembers: integer('total_members').default(0),
    adminsCount: integer('admins_count').default(0),
    isAnnounce: boolean('is_announce').default(false), // Only admins can send
    isRestricted: boolean('is_restricted').default(false), // Only admins can edit info
    metadata: jsonb('metadata'), // Extra raw data
    botJoinedAt: timestamp('bot_joined_at').defaultNow(), // When the bot was added or first synced
    updatedAt: timestamp('updated_at').defaultNow(),
});

// 20. Analytics: Group Members (for Admin tracking)
export const groupMembers = pgTable('group_members', {
    id: serial('id').primaryKey(),
    groupJid: varchar('group_jid', { length: 100 }).references(() => groups.jid, { onDelete: 'cascade' }).notNull(),
    phone: varchar('phone', { length: 50 }).notNull(),
    role: varchar('role', { length: 20 }).default('participant'), // 'admin', 'superadmin', 'participant'
    isAdmin: boolean('is_admin').default(false),
    joinedAt: timestamp('joined_at'),
    lastSeen: timestamp('last_seen'), // Updated via presence
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        groupMemberIdx: index('group_member_pair_idx').on(table.groupJid, table.phone),
        roleIdx: index('member_role_idx').on(table.role),
    };
});

// 21. Analytics: Ad Engagements
export const adEngagements = pgTable('ad_engagements', {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id').references(() => marketingCampaigns.id),
    groupJid: varchar('group_jid', { length: 100 }), // Optional, linking to group
    userPhone: varchar('user_phone', { length: 50 }), // Who engaged
    messageId: varchar('message_id', { length: 100 }), // The specific message ID
    type: varchar('type', { length: 20 }).notNull(), // 'delivered', 'read', 'reply'
    context: jsonb('context'), // Extra context (e.g., reply text)
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        campTypeIdx: index('eng_camp_type_idx').on(table.campaignId, table.type),
        msgIdx: index('eng_msg_idx').on(table.messageId),
    };
});
