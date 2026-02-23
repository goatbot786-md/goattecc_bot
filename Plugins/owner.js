const { cmd } = require('../command');
const config = require('../config');
const db = require('../lib/database');
const func = require('../lib/functions');

// Owner Command
cmd({
    pattern: "owner",
    desc: "Show owner information",
    category: "owner",
    react: "👑",
    fromMe: true
},
async(socket, msg, { from, reply, isOwner }) => {
    try {
        if (!isOwner) {
            return await reply("🚫 *You are not authorized to use this command!*");
        }
        
        const ownerNumber = config.OWNER_NUMBER;
        const ownerName = 'Inconnu Boy';
        const waid = ownerNumber.replace('+', '');
        
        const vcard =
            'BEGIN:VCARD\n' +
            'VERSION:1.0\n' +
            `FN:${ownerName}\n` +
            `ORG:${config.BOT_NAME};\n` +
            `TEL;type=CELL;waid=${waid}:${ownerNumber}\n` +
            'END:VCARD';

        // Send contact
        await socket.sendMessage(from, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard }]
            }
        });

        const ownerText = `
─── Owner Information ───

Name : ${ownerName}
Number : wa.me/${waid}
Team : ${config.BOT_NAME}

Maintained by GOAT TECC 
`;

        await socket.sendMessage(from, {
            text: ownerText,
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'Menu' }, type: 1 },
                { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: 'Ping' }, type: 1 }
            ],
            headerType: 1,
            footer: '© 2025 Mini GOAT TECC Network'
        }, { quoted: msg });
        
    } catch (err) {
        console.error('Owner command error:', err);
        reply("Error while sending owner information.");
    }
});

// Broadcast Command
cmd({
    pattern: "bc",
    desc: "Broadcast message to all users",
    category: "owner",
    react: "📢",
    fromMe: true
},
async(socket, msg, { from, q, reply, isOwner }) => {
    try {
        if (!isOwner) return;
        
        if (!q) {
            return reply("Please provide a message to broadcast.\nUsage: .bc <message>");
        }
        
        const numbers = await db.getAllNumbersFromMongoDB();
        if (numbers.length === 0) {
            return reply("No users found to broadcast.");
        }
        
        await reply(`Broadcasting to ${numbers.length} users...`);
        
        let success = 0, failed = 0;
        
        for (const number of numbers) {
            try {
                const userJid = `${number}@s.whatsapp.net`;
                await socket.sendMessage(userJid, {
                    text: `*📢 BROADCAST*\n\n${q}\n\n${config.BOT_FOOTER}`
                });
                success++;
                await func.delay(500); // Pour éviter le spam
            } catch (error) {
                failed++;
                console.error(`Failed to send to ${number}:`, error);
            }
        }
        
        await reply(`✅ Broadcast completed!\nSuccess: ${success}\nFailed: ${failed}`);
        
    } catch (error) {
        console.error('Broadcast error:', error);
        reply("Error during broadcast.");
    }
});
