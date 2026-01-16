export const calculateHumanDelay = (messageLength: number): number => {
    // Base typing speed: ~40 words per minute
    // Average word length: 5 characters -> 200 chars/min -> ~3.3 chars/sec

    const charsPerSecond = 3.5;
    const baseTypingTime = (messageLength / charsPerSecond) * 1000;

    // "Thinking" time: Random between 2 and 5 seconds
    const thinkingTime = Math.random() * 3000 + 2000;

    // Total delay
    const total = baseTypingTime + thinkingTime;

    // Add some randomness (+/- 10%)
    const variance = total * 0.1 * (Math.random() > 0.5 ? 1 : -1);

    return Math.floor(total + variance);
};

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
