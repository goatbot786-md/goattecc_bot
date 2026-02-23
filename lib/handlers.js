const config = require('../config');
const db = require('./database');
const func = require('./functions');
const group = require('./group');
const { getContentType, delay } = require('@whiskeysockets/baileys');

// Status Handlers
async function setupStatusHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            const userConfig = await db.getUserConfigFromMongoDB(number);
            
            if (userConfig.AUTO_VIEW_STATUS === 'true') {
                let retries = 3;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000);
                    }
                }
            }

            if (userConfig.AUTO_LIKE_STATUS === 'true') {
                const userEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
                const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
                
                let retries = 3;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000);
                    }
                }
            }
        } catch (error) {
            console.error(`Status handler error for ${number}:`, error);
        }
    });
}

// Call Handlers
async function setupCallHandlers(socket, number) {
    socket.ev.on('call', async (calls) => {
        try {
            const userConfig = await db.getUserConfigFromMongoDB(number);
            if (userConfig.ANTI_CALL === 'off') return;

            for (const call of calls) {
                if (call.status !== 'offer') continue;

                const id = call.id;
                const from = call.from;

                await socket.rejectCall(id, from);
                await socket.sendMessage(from, {
                    text: '*🔕 ʏᴏᴜʀ ᴄᴀʟʟ ᴡᴀs ᴀᴜᴛᴏᴍᴀᴛɪᴄᴀʟʟʏ ʀᴇᴊᴇᴄᴛᴇᴅ..!*'
                });
            }
        } catch (err) {
            console.error(`Anti-call error for ${number}:`, err);
        }
    });
}

// Message Handlers
async function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const userConfig = await db.getUserConfigFromMongoDB(number);
        
        if (userConfig.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
            } catch (error) {
                console.error(`Failed to set recording presence:`, error);
            }
        }
    });
}

// Auto Restart Handler
function setupAutoRestart(socket, number) {
    let restartAttempts = 0;
    const maxRestartAttempts = 3;
    
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message;
            
            if (statusCode === 401) {
                console.log(`🔐 Manual unlink detected for ${number}`);
                return;
            }
            
            if (statusCode === 408) {
                console.log(`ℹ️ Normal connection closure for ${number}`);
                return;
            }
            
            if (restartAttempts < maxRestartAttempts) {
                restartAttempts++;
                console.log(`🔄 Reconnecting ${number} (${restartAttempts}/${maxRestartAttempts})...`);
                await delay(10000);
                // Reconnection logic here
            }
        }
        
        if (connection === 'open') {
            console.log(`✅ Connection established for ${number}`);
            restartAttempts = 0;
        }
    });
}

// Newsletter Handlers
async function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const jid = message.key.remoteJid;
        if (!config.NEWSLETTER_JID.includes(jid)) return;

        try {
            const emojis = ['💜', '🔥', '💫', '👍', '🧧'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) return;

            let retries = 3;
            while (retries-- > 0) {
                try {
                    await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
                    console.log(`✅ Reacted to newsletter ${jid} with ${randomEmoji}`);
                    break;
                } catch (err) {
                    await delay(1500);
                }
            }
        } catch (error) {
            console.error('Newsletter reaction handler failed:', error);
        }
    });
}

module.exports = {
    setupStatusHandlers,
    setupCallHandlers,
    setupMessageHandlers,
    setupAutoRestart,
    setupNewsletterHandlers
};
