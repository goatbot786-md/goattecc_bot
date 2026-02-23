require('dotenv').config();

const config = {
    BOT_NAME: process.env.BOT_NAME || 'Mini GOAT TECC V1',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '50942315138',
    DEV_MODE: process.env.DEV_MODE === 'true',
    MONGODB_URI: process.env.MONGODB_URI,
    PREFIX: '.',
    BOT_FOOTER: '> © Mᴀᴅᴇ ʙʏ GOAT TECC',
    IMAGE_PATH: 'https://files.catbox.moe/2dyiq6.jpg',
    WORK_TYPE: "public",
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_READ_MESSAGE: 'off',
    ANTI_CALL: "off",

    AUTO_LIKE_EMOJI: ['🖤','🍬','💫','🎈','💚','🎶','❤️','🧫','⚽'],

    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/EhFU7g19rYR6vW30BCKoak?mode=gi_t',

    NEWSLETTER_JID: [
        '120363406443981835@newsletter',
        '120363406443981835@newsletter',
        '120363406443981835@newsletter',
        '120363406443981835@newsletter'
    ],

    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb7V4gu8qIzrdRufdh1n',

    MAX_RETRIES: 3,
    OTP_EXPIRY: 300000,

    ADMIN_LIST_PATH: './admin.json',

    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID
};

module.exports = config;
