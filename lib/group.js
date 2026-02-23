const config = require('../config');
const db = require('./database');

// Welcome/Goodbye System
const welcomeSettings = new Map();
const antilinkSettings = new Map();

async function loadWelcomeSettings(groupJid) {
    return welcomeSettings.get(groupJid) || { 
        enabled: true, 
        type: 'both',
        customWelcome: null,
        customGoodbye: null,
        lastWelcomeTime: new Map()
    };
}

async function saveWelcomeSettings(groupJid, settings) {
    welcomeSettings.set(groupJid, settings);
}

async function sendWelcomeMessage(socket, groupJid, participant) {
    try {
        const settings = await loadWelcomeSettings(groupJid);
        
        if (!settings.enabled || (settings.type !== 'welcome' && settings.type !== 'both')) {
            return;
        }
        
        const now = Date.now();
        const lastTime = settings.lastWelcomeTime?.get(participant) || 0;
        
        if (now - lastTime < 30000) {
            console.log(`⏩ Duplicate welcome for ${participant}, skipping...`);
            return;
        }
        
        if (!settings.lastWelcomeTime) settings.lastWelcomeTime = new Map();
        settings.lastWelcomeTime.set(participant, now);
        
        const groupMetadata = await socket.groupMetadata(groupJid);
        let welcomeMessage = settings.customWelcome || `
╭───────────────⊷
│👋 *WELCOME* 
│*User:* @${participant.split('@')[0]}
│*Group:* ${groupMetadata.subject}
│*Members:* ${groupMetadata.participants.length}
│*Read the group rules!*
╰───────────────⊷
        `.trim();

        welcomeMessage = welcomeMessage
            .replace(/{user}/g, `@${participant.split('@')[0]}`)
            .replace(/{group}/g, groupMetadata.subject)
            .replace(/{members}/g, groupMetadata.participants.length);

        await socket.sendMessage(groupJid, {
            image: { url: config.IMAGE_PATH },
            caption: welcomeMessage,
            mentions: [participant]
        });
        
        console.log(`✅ Welcome sent to ${participant} in ${groupJid}`);
    } catch (error) {
        console.error('Error sending welcome message:', error);
    }
}

async function sendGoodbyeMessage(socket, groupJid, participant) {
    try {
        const settings = await loadWelcomeSettings(groupJid);
        
        if (!settings.enabled || (settings.type !== 'goodbye' && settings.type !== 'both')) {
            return;
        }
        
        const groupMetadata = await socket.groupMetadata(groupJid);
        let goodbyeMessage = settings.customGoodbye || `
╭───────────────⊷
│👋 *GOODBYE* 
│*User:* @${participant.split('@')[0]}
│*Group:* ${groupMetadata.subject}
│*Members Left:* ${groupMetadata.participants.length}
│ *User has left the group*
╰───────────────⊷
        `.trim();

        goodbyeMessage = goodbyeMessage
            .replace(/{user}/g, `@${participant.split('@')[0]}`)
            .replace(/{group}/g, groupMetadata.subject)
            .replace(/{members}/g, groupMetadata.participants.length);

        await socket.sendMessage(groupJid, {
            image: { url: config.IMAGE_PATH },
            caption: goodbyeMessage,
            mentions: [participant]
        });
        
        console.log(`✅ Goodbye sent to ${participant} in ${groupJid}`);
    } catch (error) {
        console.error('Error sending goodbye message:', error);
    }
}

// Antilink System
async function loadAntilinkSettings(groupJid) {
    return antilinkSettings.get(groupJid) || { enabled: false, action: 'warn' };
}

async function saveAntilinkSettings(groupJid, settings) {
    antilinkSettings.set(groupJid, settings);
}

async function handleAntilink(socket, msg, isSenderGroupAdmin) {
    try {
        const groupJid = msg.key.remoteJid;
        const settings = await loadAntilinkSettings(groupJid);
        
        if (!settings.enabled || isSenderGroupAdmin) return false;

        let body = '';
        const { getContentType } = require('@whiskeysockets/baileys');
        const type = getContentType(msg.message);
        
        if (type === 'conversation') {
            body = msg.message.conversation || '';
        } else if (type === 'extendedTextMessage') {
            body = msg.message.extendedTextMessage?.text || '';
        }

        const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|whatsapp\.com\/[^\s]+)/gi;
        const hasLink = linkRegex.test(body);

        if (hasLink) {
            const sender = msg.key.participant || msg.key.remoteJid;
            
            switch (settings.action) {
                case 'warn':
                    await socket.sendMessage(groupJid, {
                        text: `⚠️ *ANTI-LINK WARNING*\n@${sender.split('@')[0]} - Don't share links in this group!`,
                        mentions: [sender]
                    });
                    break;
                
                case 'kick':
                    try {
                        await socket.groupParticipantsUpdate(groupJid, [sender], 'remove');
                        await socket.sendMessage(groupJid, {
                            text: `🚫 *USER KICKED*\n@${sender.split('@')[0]} was removed for sharing links.`,
                            mentions: [sender]
                        });
                    } catch (kickError) {
                        console.error('Failed to kick user:', kickError);
                    }
                    break;
                
                case 'remove':
                    try {
                        await socket.sendMessage(groupJid, { delete: msg.key });
                        await socket.sendMessage(groupJid, {
                            text: `🗑️ *MESSAGE REMOVED*\nLink message from @${sender.split('@')[0]} has been deleted.`,
                            mentions: [sender]
                        });
                    } catch (deleteError) {
                        console.error('Failed to delete message:', deleteError);
                    }
                    break;
            }
            return true;
        }
    } catch (error) {
        console.error('Antilink handler error:', error);
    }
    return false;
}

// Group Event Handlers
async function setupGroupHandlers(socket, number) {
    socket.ev.on('group-participants.update', async (update) => {
        try {
            const { id, participants, action } = update;
            
            if (action === 'add') {
                for (const participant of participants) {
                    await sendWelcomeMessage(socket, id, participant);
                }
            } else if (action === 'remove') {
                for (const participant of participants) {
                    await sendGoodbyeMessage(socket, id, participant);
                }
            }
        } catch (error) {
            console.error('Group participants update error:', error);
        }
    });
}

module.exports = {
    loadWelcomeSettings,
    saveWelcomeSettings,
    sendWelcomeMessage,
    sendGoodbyeMessage,
    loadAntilinkSettings,
    saveAntilinkSettings,
    handleAntilink,
    setupGroupHandlers
};
