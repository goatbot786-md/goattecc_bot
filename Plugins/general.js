const { cmd } = require('../command');
const config = require('../config');
const utils = require('../lib/utils');

// Ping Command
cmd({
    pattern: "ping",
    desc: "Check bot latency",
    category: "general",
    react: "⚡"
},
async(socket, msg, { from, reply }) => {
    try {
        const startTime = Date.now();
        const message = await socket.sendMessage(from, { text: '*_⚡️ ᴘɪɴɢɪɴɢ ᴛᴏ sᴇʀᴠᴇʀ..._*' }, { quoted: msg });
        const endTime = Date.now();
        const ping = endTime - startTime;
        
        let quality = '', emoji = '';
        if (ping < 100) { quality = 'Excellent'; emoji = '🟢'; }
        else if (ping < 300) { quality = 'Good'; emoji = '🟡'; }
        else if (ping < 600) { quality = 'Fair'; emoji = '🟠'; }
        else { quality = 'Poor'; emoji = '🔴'; }
        
        await socket.sendMessage(from, { 
            text: `🏓 *Pong!*\n\n⚡ *Speed:* ${ping}ms\n${emoji} *Quality:* ${quality}` 
        }, { quoted: message });
    } catch (e) {
        console.log(e);
        reply(`Error: ${e.message}`);
    }
});

// Alive Command
cmd({
    pattern: "alive",
    desc: "Check if bot is alive",
    category: "general",
    react: "💫"
},
async(socket, msg, { from, reply }) => {
    try {
        await socket.sendMessage(from, { 
            image: { url: config.IMAGE_PATH },
            caption: `*${config.BOT_NAME}*\n\n> ${config.BOT_FOOTER}`
        }, { quoted: msg });
    } catch (e) {
        reply("Error: " + e.message);
    }
});

// Menu Command
cmd({
    pattern: "menu",
    desc: "Show command list",
    category: "general",
    react: "📋"
},
async(socket, msg, { from, reply }) => {
    try {
        const { commands } = require('../command');
        
        // Grouper les commandes par catégorie
        const categories = {};
        commands.forEach(cmd => {
            if (!cmd.dontAddCommandList) {
                if (!categories[cmd.category]) {
                    categories[cmd.category] = [];
                }
                categories[cmd.category].push(cmd.pattern);
            }
        });
        
        let menuText = `*${config.BOT_NAME} - Command List*\n\n`;
        menuText += `Prefix: ${config.PREFIX}\n\n`;
        
        for (const [category, cmds] of Object.entries(categories)) {
            menuText += `*${category.toUpperCase()}*\n`;
            menuText += cmds.map(cmd => `• ${config.PREFIX}${cmd}`).join('\n');
            menuText += '\n\n';
        }
        
        menuText += `Total Commands: ${commands.length}\n\n${config.BOT_FOOTER}`;
        
        await socket.sendMessage(from, { 
            image: { url: config.IMAGE_PATH },
            caption: menuText
        }, { quoted: msg });
    } catch (e) {
        reply("Error: " + e.message);
    }
});
