const config = require('../config');
const db = require('./database');
const moment = require('moment-timezone');
const { getContentType } = require('@whiskeysockets/baileys');

async function checkPermission(isOwner, number, senderNumber) {
    return isOwner || await db.isSudoUser(number, senderNumber);
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function createSerial(size) {
    const crypto = require('crypto');
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

async function oneViewmeg(socket, isOwner, msg, sender) {
    if (isOwner) {  
        try {
            const quot = msg;
            if (quot) {
                if (quot.imageMessage?.viewOnce) {
                    let cap = quot.imageMessage?.caption || "";
                    let anu = await socket.downloadAndSaveMediaMessage(quot.imageMessage);
                    await socket.sendMessage(sender, { image: { url: anu }, caption: cap });
                } else if (quot.videoMessage?.viewOnce) {
                    let cap = quot.videoMessage?.caption || "";
                    let anu = await socket.downloadAndSaveMediaMessage(quot.videoMessage);
                    await socket.sendMessage(sender, { video: { url: anu }, caption: cap });
                } else if (quot.audioMessage?.viewOnce) {
                    let cap = quot.audioMessage?.caption || "";
                    let anu = await socket.downloadAndSaveMediaMessage(quot.audioMessage);
                    await socket.sendMessage(sender, { audio: { url: anu }, caption: cap });
                } else if (quot.viewOnceMessageV2?.message?.imageMessage) {
                    let cap = quot.viewOnceMessageV2?.message?.imageMessage?.caption || "";
                    let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.imageMessage);
                    await socket.sendMessage(sender, { image: { url: anu }, caption: cap });
                } else if (quot.viewOnceMessageV2?.message?.videoMessage) {
                    let cap = quot.viewOnceMessageV2?.message?.videoMessage?.caption || "";
                    let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.videoMessage);
                    await socket.sendMessage(sender, { video: { url: anu }, caption: cap });
                } else if (quot.viewOnceMessageV2Extension?.message?.audioMessage) {
                    let cap = quot.viewOnceMessageV2Extension?.message?.audioMessage?.caption || "";
                    let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2Extension.message.audioMessage);
                    await socket.sendMessage(sender, { audio: { url: anu }, caption: cap });
                }
            }        
        } catch (error) {
            console.error('Error in oneViewmeg:', error);
        }
    }
}

async function extractMessageInfo(socket, msg) {
    const type = getContentType(msg.message);
    let body = '';
    
    try {
        if (type === 'conversation') {
            body = msg.message.conversation || '';
        } else if (type === 'extendedTextMessage') {
            body = msg.message.extendedTextMessage?.text || '';
        } else if (type === 'imageMessage') {
            body = msg.message.imageMessage?.caption || '';
        } else if (type === 'videoMessage') {
            body = msg.message.videoMessage?.caption || '';
        } else if (type === 'buttonsResponseMessage') {
            body = msg.message.buttonsResponseMessage?.selectedButtonId || '';
        } else if (type === 'listResponseMessage') {
            body = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
        }
        
        body = String(body || '');
    } catch (error) {
        console.error('Error extracting message body:', error);
        body = '';
    }
    
    const from = msg.key.remoteJid;
    const sender = msg.key.fromMe ? socket.user.id : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = sender.split('@')[0];
    const isGroup = from.endsWith("@g.us");
    const isChannel = from.endsWith('@newsletter');
    const isCmd = body.startsWith(config.PREFIX);
    const command = isCmd ? body.slice(config.PREFIX.length).trim().split(' ').shift().toLowerCase() : '';
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(' ');
    
    return {
        body,
        from,
        sender,
        senderNumber,
        isGroup,
        isChannel,
        isCmd,
        command,
        args,
        q,
        type
    };
}

async function isGroupAdmin(socket, jid, user) {
    try {
        const groupMetadata = await socket.groupMetadata(jid);
        const participant = groupMetadata.participants.find(p => p.id === user);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin' || false;
    } catch (error) {
        console.error('Error checking group admin status:', error);
        return false;
    }
}

module.exports = {
    checkPermission,
    formatMessage,
    generateOTP,
    getSriLankaTimestamp,
    capital,
    createSerial,
    oneViewmeg,
    extractMessageInfo,
    isGroupAdmin
};
