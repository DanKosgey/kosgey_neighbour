/**
 * Phone Number Formatting Utilities
 * Handles WhatsApp JID to readable phone number conversion
 */

/**
 * Formats a WhatsApp JID into a readable phone number
 * Handles both standard JIDs (@s.whatsapp.net) and LIDs (@lid)
 * 
 * Examples:
 * - "254745026933@s.whatsapp.net" -> "+254745026933"
 * - "178795612995751:25@lid" -> "+25" (extracts phone after colon)
 * - "254729989107824@lid" -> "+254729989107824"
 * 
 * @param jid WhatsApp JID string
 * @returns Formatted phone number with + prefix
 */
export function formatPhoneNumber(jid: string): string {
    if (!jid) return 'Unknown';

    // Remove the domain part (@s.whatsapp.net or @lid)
    const localPart = jid.split('@')[0];

    // Handle LID format: "lid:phone" or just "phone"
    let phoneNumber: string;
    if (localPart.includes(':')) {
        // LID format: extract the part after the colon
        const parts = localPart.split(':');
        phoneNumber = parts[parts.length - 1]; // Get last part (phone number)
    } else {
        phoneNumber = localPart;
    }

    // Clean any non-numeric characters
    phoneNumber = phoneNumber.replace(/\D/g, '');

    // Add + prefix if not empty
    return phoneNumber ? `+${phoneNumber}` : 'Unknown';
}
