const { cmd } = require('../command');
const config = require('../config');
const group = require('../lib/group');
const func = require('../lib/functions');

// Welcome Command
cmd({
    pattern: "welcome",
    desc: "Manage welcome system",
    category: "group",
    react: "👋"
},
async(socket, msg, { from, command, args, q, isGroup, reply, isOwner }) => {
    try {
        if (!isGroup) return await reply("❌ *This command can only be used in groups!*");
        
        const action = args[0]?.toLowerCase();
        const currentSettings = await group.loadWelcomeSettings(from);
        
        if (action === 'on') {
            currentSettings.enabled = true;
            const type = args[1]?.toLowerCase() || 'both';
            if (['welcome', 'goodbye', 'both'].includes(type)) {
                currentSettings.type = type;
                await group.saveWelcomeSettings(from, currentSettings);
                await reply(`✅ *Welcome system enabled (${type})*`);
            } else {
                await reply("❌ *Invalid type!*\nOptions: welcome, goodbye, both");
            }
            
        } else if (action === 'off') {
            currentSettings.enabled = false;
            await group.saveWelcomeSettings(from, currentSettings);
            await reply("✅ *Welcome system disabled*");
            
        } else if (action === 'status') {
            const statusEmoji = currentSettings.enabled ? '🟢' : '🔴';
            const typeText = {
                'welcome': 'Welcome only',
                'goodbye': 'Goodbye only', 
                'both': 'Welcome & Goodbye'
            };
            
            await reply(`👋 *Welcome System Status*\n\n` +
                       `${statusEmoji} *Enabled:* ${currentSettings.enabled ? 'Yes' : 'No'}\n` +
                       `📝 *Type:* ${typeText[currentSettings.type] || currentSettings.type}\n` +
                       `💬 *Custom Welcome:* ${currentSettings.customWelcome ? 'Yes' : 'No'}\n` +
                       `👋 *Custom Goodbye:* ${currentSettings.customGoodbye ? 'Yes' : 'No'}`);
            
        } else {
            await reply(`👋 *Welcome System Commands*\n\n` +
                       `*${config.PREFIX}welcome on* - Enable system\n` +
                       `*${config.PREFIX}welcome off* - Disable system\n` +
                       `*${config.PREFIX}welcome status* - Check status\n` +
                       `\n📝 *Custom Messages:*\n` +
                       `*${config.PREFIX}setwelcome <text>* - Set welcome message\n` +
                       `*${config.PREFIX}setgoodbye <text>* - Set goodbye message`);
        }
        
    } catch (e) {
        console.error('Welcome command error:', e);
        await reply("*❌ Error updating welcome settings!*");
    }
});

// Antilink Command
cmd({
    pattern: "antilink",
    desc: "Manage antilink system",
    category: "group",
    react: "🔗"
},
async(socket, msg, { from, command, args, q, isGroup, reply }) => {
    try {
        if (!isGroup) return await reply("❌ *This command can only be used in groups!*");
        
        const action = args[0]?.toLowerCase();
        const validActions = ['on', 'off', 'warn', 'kick', 'remove'];
        
        if (!action || !validActions.includes(action)) {
            return await reply(`🔗 *Antilink Settings*\n\nUsage: ${config.PREFIX}antilink <option>\n\nOptions:\n• on - Enable\n• off - Disable\n• warn - Warn users\n• kick - Kick users\n• remove - Remove messages`);
        }

        const currentSettings = await group.loadAntilinkSettings(from);
        
        if (action === 'on' || action === 'off') {
            currentSettings.enabled = action === 'on';
            await group.saveAntilinkSettings(from, currentSettings);
            await reply(`✅ *Antilink ${action === 'on' ? 'enabled' : 'disabled'}*`);
        } else {
            currentSettings.action = action;
            currentSettings.enabled = true;
            await group.saveAntilinkSettings(from, currentSettings);
            await reply(`✅ *Antilink action set to: ${action.toUpperCase()}*`);
        }
    } catch (e) {
        console.error('Antilink command error:', e);
        await reply("*❌ Error updating antilink settings!*");
    }
});
