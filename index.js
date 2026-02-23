const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const axios = require('axios');

// Config
const config = require('./config');
const db = require('./lib/database');
const func = require('./lib/functions');
const handlers = require('./lib/handlers');
const group = require('./lib/group');

// Baileys
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

// Telegram (optionnel)
const TelegramBot = require('node-telegram-bot-api');
let telegramBot = null;
if (config.TELEGRAM_BOT_TOKEN) {
    telegramBot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: false });
}

// Variables globales
const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const cleanupLocks = new Set();

// Créer le dossier session si nécessaire
if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Connexion MongoDB
db.connectDB();

// ========== FONCTIONS PRINCIPALES ========== //

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    // Vérifier si déjà connecté
    if (activeSockets.has(sanitizedNumber)) {
        const status = getConnectionStatus(sanitizedNumber);
        if (!res.headersSent) {
            res.send({ 
                status: 'already_connected', 
                message: 'Number is already connected',
                connectionTime: status.connectionTime,
                uptime: `${status.uptime} seconds`
            });
        }
        return;
    }

    // Vérifier le verrou de connexion
    const connectionLockKey = `connecting_${sanitizedNumber}`;
    if (global[connectionLockKey]) {
        if (!res.headersSent) {
            res.send({ 
                status: 'connection_in_progress', 
                message: 'Number is currently being connected'
            });
        }
        return;
    }
    
    global[connectionLockKey] = true;
    
    try {
        // Double vérification
        if (activeSockets.has(sanitizedNumber)) {
            if (!res.headersSent) {
                res.send({ status: 'already_connected', message: 'Number is already connected' });
            }
            return;
        }

        // Restaurer la session depuis MongoDB
        const existingSession = await db.Session.findOne({ number: sanitizedNumber });
        if (existingSession) {
            const restoredCreds = await db.getSessionFromMongoDB(sanitizedNumber);
            if (restoredCreds) {
                fs.ensureDirSync(sessionPath);
                fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
                console.log(`🔄 Restored session from MongoDB for ${sanitizedNumber}`);
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        activeSockets.set(sanitizedNumber, socket);

        // Setup handlers
        setupManualUnlinkDetection(socket, sanitizedNumber);
        handlers.setupCallHandlers(socket, sanitizedNumber);
        handlers.setupStatusHandlers(socket, sanitizedNumber);
        handlers.setupMessageHandlers(socket, sanitizedNumber);
        handlers.setupAutoRestart(socket, sanitizedNumber);
        handlers.setupNewsletterHandlers(socket);
        group.setupGroupHandlers(socket, sanitizedNumber);
        setupCommandHandler(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            console.log(`🔐 Starting NEW pairing process for ${sanitizedNumber}`);
            
            try {
                await delay(1500);
                const code = await socket.requestPairingCode(sanitizedNumber);
                
                if (!res.headersSent) {
                    res.send({ code, status: 'new_pairing' });
                }
            } catch (error) {
                console.error(`Failed to request pairing code:`, error.message);
                
                if (!res.headersSent) {
                    res.status(500).send({ 
                        error: 'Failed to get pairing code',
                        status: 'error',
                        message: error.message
                    });
                }
                throw error;
            }
        } else {
            console.log(`✅ Using existing session for ${sanitizedNumber}`);
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            const creds = JSON.parse(fileContent);
            
            const existingSession = await db.Session.findOne({ number: sanitizedNumber });
            const isNewSession = !existingSession;
            
            await db.saveSessionToMongoDB(sanitizedNumber, creds);
            
            if (isNewSession) {
                console.log(`🎉 NEW user ${sanitizedNumber} successfully registered!`);
            }
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);

                    // Ajouter au nombre actif
                    await db.addNumberToMongoDB(sanitizedNumber);

                    // Joindre le groupe
                    const groupResult = await joinGroup(socket);
                    
                    if (groupResult.status === 'failed') {
                        console.log(`⚠️ Group: ${groupResult.error}`);
                    }

                    // Suivre les newsletters
                    try {
                        for (const jid of config.NEWSLETTER_JID) {
                            try {
                                await socket.newsletterFollow(jid);
                            } catch (err) {}
                        }
                        console.log('✅ Auto-followed newsletter');
                    } catch (error) {}

                    // Envoyer message de bienvenue
                    const sessionData = await db.Session.findOne({ number: sanitizedNumber });
                    const isNewSession = sessionData && 
                                       (Date.now() - new Date(sessionData.createdAt).getTime() < 60000);
                    
                    const welcomeMessage = isNewSession 
                        ? func.formatMessage(
                            'Mini GOAT TECC V1',
                            `✅ sᴜᴄᴄᴇssғᴜʟʟʏ ᴄᴏɴɴᴇᴄᴛᴇᴅ!\n\n🔢 ɴᴜᴍʙᴇʀ: ${sanitizedNumber}\n\n> ғᴏʟʟᴏᴡ ᴄʜᴀɴɴᴇʟ :- ${config.CHANNEL_LINK}\n`,
                            'Mᴀᴅᴇ ʙʏ GOAT TECC'
                          )
                        : func.formatMessage(
                            'Mini GOAT TECC V1',
                            `✅ sᴜᴄᴄᴇssғᴜʟʟʏ ʀᴇᴄᴏɴɴᴇᴄᴛᴇᴅ!\n\n🔢 ɴᴜᴍʙᴇʀ: ${sanitizedNumber}\n\n> ʏᴏᴜʀ sᴇᴛᴛɪɴɢs ʜᴀᴠᴇ ʙᴇᴇɴ ʀᴇsᴛᴏʀᴇᴅ.`,
                            'Mᴀᴅᴇ ʙʏ GOAT TECC'
                          );

                    await socket.sendMessage(userJid, {
                        image: { url: config.IMAGE_PATH },
                        caption: welcomeMessage
                    });

                    console.log(`🎉 ${sanitizedNumber} successfully ${isNewSession ? 'NEW connection' : 'reconnected'}!`);

                } catch (error) {
                    console.error('Connection setup error:', error);
                }
            }
        });

    } catch (error) {
        console.error('Pairing error:', error);
        socketCreationTime.delete(sanitizedNumber);
        activeSockets.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable', details: error.message });
        }
    } finally {
        global[connectionLockKey] = false;
    }
}

// ========== FONCTIONS UTILITAIRES ========== //

function setupManualUnlinkDetection(socket, number) {
    let unlinkDetected = false;
    
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close' && !unlinkDetected) {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message;
            
            if (statusCode === 401 || errorMessage?.includes('401')) {
                unlinkDetected = true;
                console.log(`🔐 Manual unlink detected for ${number}`);
            }
        }
    });
}

function getConnectionStatus(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const isConnected = activeSockets.has(sanitizedNumber);
    const connectionTime = socketCreationTime.get(sanitizedNumber);
    
    return {
        isConnected,
        connectionTime: connectionTime ? new Date(connectionTime).toLocaleString() : null,
        uptime: connectionTime ? Math.floor((Date.now() - connectionTime) / 1000) : 0
    };
}

async function joinGroup(socket) {
    console.log('🔄 Checking group membership...');
    
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    
    const inviteCode = inviteCodeMatch[1];
    let retries = 3;

    try {
        const groupInfo = await socket.groupGetInviteInfo(inviteCode);
        if (groupInfo && groupInfo.id) {
            try {
                const groupMetadata = await socket.groupMetadata(groupInfo.id);
                const isMember = groupMetadata.participants?.some(p => p.id === socket.user.id);
                
                if (isMember) {
                    return { status: 'already_member', gid: groupInfo.id };
                }
            } catch (metaError) {}
        }
    } catch (infoError) {
        return { status: 'failed', error: 'Cannot access group' };
    }

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            
            if (response?.gid) {
                console.log(`✅ Joined group: ${response.gid}`);
                return { status: 'success', gid: response.gid };
            }
            
            await delay(2000);
            
            try {
                const groupInfo = await socket.groupGetInviteInfo(inviteCode);
                if (groupInfo && groupInfo.id) {
                    return { status: 'success', gid: groupInfo.id };
                }
            } catch (verifyError) {}
            
            retries--;
            if (retries > 0) await delay(2000);
            
        } catch (error) {
            retries--;
            
            if (error.message.includes('conflict') || error.message.includes('already')) {
                return { status: 'already_member', error: 'Already member' };
            }
            
            if (retries === 0) {
                return { status: 'failed', error: error.message };
            }
            
            await delay(2000);
        }
    }
    
    return { status: 'failed', error: 'Max retries reached' };
}

// ========== HANDLER DE COMMANDES ========== //

function setupCommandHandler(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message) return;
            
            const info = await func.extractMessageInfo(socket, msg);
            if (!info.isCmd) return;
            
            // Charger la config utilisateur
            const userConfig = await db.getUserConfigFromMongoDB(number);
            const isOwner = info.senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            
            // Vérifier le type de travail
            if (!isOwner) {
                if (userConfig.WORK_TYPE === "private") return;
                if (info.isGroup && userConfig.WORK_TYPE === "inbox") return;
                if (!info.isGroup && userConfig.WORK_TYPE === "groups") return;
            }
            
            // Vérifier si banni
            if (!isOwner && await db.isUserBanned(number, info.senderNumber)) {
                await socket.sendMessage(info.from, { 
                    text: "🚫 *You are banned from using this bot!*" 
                });
                return;
            }
            
            // Vérifier les permissions
            if (info.command === 'ban' || info.command === 'unban' || 
                info.command === 'sudoadd' || info.command === 'sudodel') {
                if (!isOwner) {
                    await socket.sendMessage(info.from, { 
                        text: "🚫 *You are not authorized to use this command!*" 
                    });
                    return;
                }
            }
            
            // Gérer l'antilink pour les groupes
            if (info.isGroup) {
                const isSenderGroupAdmin = await func.isGroupAdmin(socket, info.from, info.sender);
                const antilinkHandled = await group.handleAntilink(socket, msg, isSenderGroupAdmin);
                if (antilinkHandled) return;
            }
            
            // Charger les plugins
            requirePlugins();
            
            // Chercher la commande
            const { commands } = require('./command');
            const cmd = commands.find(c => 
                c.pattern === info.command || 
                (c.alias && c.alias.includes(info.command))
            );
            
            if (cmd) {
                // Vérifier fromMe
                if (cmd.fromMe && !isOwner) return;
                
                // Ajouter une réaction
                await socket.sendMessage(info.from, { 
                    react: { text: cmd.react || '✅', key: msg.key } 
                });
                
                // Exécuter la commande
                const context = {
                    from: info.from,
                    sender: info.sender,
                    senderNumber: info.senderNumber,
                    isGroup: info.isGroup,
                    isChannel: info.isChannel,
                    isCmd: info.isCmd,
                    command: info.command,
                    args: info.args,
                    q: info.q,
                    isOwner: isOwner,
                    isSudo: await db.isSudoUser(number, info.senderNumber),
                    reply: async (text, options = {}) => {
                        return await socket.sendMessage(info.from, { text }, { quoted: msg, ...options });
                    }
                };
                
                await cmd.function(socket, msg, context);
            }
            
        } catch (error) {
            console.error('Command handler error:', error);
        }
    });
}

function requirePlugins() {
    // Charger tous les plugins
    const pluginsPath = path.join(__dirname, 'plugins');
    const plugins = fs.readdirSync(pluginsPath);
    
    plugins.forEach(plugin => {
        if (plugin.endsWith('.js')) {
            try {
                require(path.join(pluginsPath, plugin));
            } catch (error) {
                console.error(`Failed to load plugin ${plugin}:`, error);
            }
        }
    });
}

// ========== ROUTES API ========== //

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const connectionStatus = getConnectionStatus(number);
    
    if (connectionStatus.isConnected) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected',
            connectionTime: connectionStatus.connectionTime,
            uptime: `${connectionStatus.uptime} seconds`
        });
    }

    await EmpirePair(number, res);
});

router.get('/status', async (req, res) => {
    const { number } = req.query;
    
    if (!number) {
        const activeConnections = Array.from(activeSockets.keys()).map(num => {
            const status = getConnectionStatus(num);
            return {
                number: num,
                status: 'connected',
                connectionTime: status.connectionTime,
                uptime: `${status.uptime} seconds`
            };
        });
        
        return res.status(200).send({
            totalActive: activeSockets.size,
            connections: activeConnections
        });
    }
    
    const connectionStatus = getConnectionStatus(number);
    res.status(200).send(connectionStatus);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: '🌌 Mini GOAT TECC is running',
        activesession: activeSockets.size
    });
});

router.get('/reconnect', async (req, res) => {
    try {
        const numbers = await db.getAllNumbersFromMongoDB();
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

// Auto reconnect au démarrage
async function autoReconnect() {
    try {
        const numbers = await db.getAllNumbersFromMongoDB();
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                await delay(1000);
            }
        }
    } catch (error) {
        console.error('Auto reconnect error:', error);
    }
}

setTimeout(autoReconnect, 5000);

module.exports = router;
