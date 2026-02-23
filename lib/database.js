const mongoose = require('mongoose');
const config = require('../config');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    }
}

// Schemas
const sessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true },
    creds: { type: Object, required: true },
    config: { type: Object, default: config },
    sudoUsers: { type: Array, default: [] },
    bannedUsers: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const numberSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const otpSchema = new mongoose.Schema({
    number: { type: String, required: true },
    otp: { type: String, required: true },
    newConfig: { type: Object },
    expiry: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Models
const Session = mongoose.model('Session', sessionSchema);
const BotNumber = mongoose.model('BotNumber', numberSchema);
const OTP = mongoose.model('OTP', otpSchema);

// Session Management
async function saveSessionToMongoDB(number, creds, userConfig = null) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const existingSession = await Session.findOne({ number: sanitizedNumber });
        
        if (existingSession) {
            await Session.findOneAndUpdate(
                { number: sanitizedNumber },
                { 
                    creds: creds,
                    updatedAt: new Date()
                }
            );
            console.log(`🔄 Session credentials updated for ${sanitizedNumber}`);
        } else {
            const sessionData = {
                number: sanitizedNumber,
                creds: creds,
                config: userConfig || config,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await Session.findOneAndUpdate(
                { number: sanitizedNumber },
                sessionData,
                { upsert: true, new: true }
            );
            console.log(`✅ NEW Session saved to MongoDB for ${sanitizedNumber}`);
        }
    } catch (error) {
        console.error('❌ Failed to save/update session in MongoDB:', error);
        throw error;
    }
}

async function getSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        return session ? session.creds : null;
    } catch (error) {
        console.error('❌ Failed to get session from MongoDB:', error);
        return null;
    }
}

async function getUserConfigFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        return session ? session.config : { ...config };
    } catch (error) {
        console.error('❌ Failed to get user config from MongoDB:', error);
        return { ...config };
    }
}

async function updateUserConfigInMongoDB(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            { 
                config: newConfig,
                updatedAt: new Date()
            }
        );
        console.log(`✅ Config updated in MongoDB for ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to update config in MongoDB:', error);
        throw error;
    }
}

async function addNumberToMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await BotNumber.findOneAndUpdate(
            { number: sanitizedNumber },
            { number: sanitizedNumber, active: true },
            { upsert: true }
        );
        console.log(`✅ Number ${sanitizedNumber} added to MongoDB`);
    } catch (error) {
        console.error('❌ Failed to add number to MongoDB:', error);
        throw error;
    }
}

async function getAllNumbersFromMongoDB() {
    try {
        const numbers = await BotNumber.find({ active: true });
        return numbers.map(n => n.number);
    } catch (error) {
        console.error('❌ Failed to get numbers from MongoDB:', error);
        return [];
    }
}

// Sudo System
async function loadSudoUsers(number) {
    const userConfig = await getUserConfigFromMongoDB(number);
    return userConfig.sudoUsers || [];
}

async function saveSudoUsers(number, sudoList) {
    const userConfig = await getUserConfigFromMongoDB(number);
    userConfig.sudoUsers = sudoList;
    await updateUserConfigInMongoDB(number, userConfig);
}

async function isSudoUser(number, targetNumber) {
    const sudoList = await loadSudoUsers(number);
    return sudoList.includes(targetNumber);
}

async function addSudoUser(number, newSudoNumber) {
    const sudoList = await loadSudoUsers(number);
    if (!sudoList.includes(newSudoNumber)) {
        sudoList.push(newSudoNumber);
        await saveSudoUsers(number, sudoList);
        return true;
    }
    return false;
}

async function removeSudoUser(number, sudoNumber) {
    const sudoList = await loadSudoUsers(number);
    const index = sudoList.indexOf(sudoNumber);
    if (index > -1) {
        sudoList.splice(index, 1);
        await saveSudoUsers(number, sudoList);
        return true;
    }
    return false;
}

// Ban System
async function loadBannedUsers(number) {
    const userConfig = await getUserConfigFromMongoDB(number);
    return userConfig.bannedUsers || [];
}

async function saveBannedUsers(number, banList) {
    const userConfig = await getUserConfigFromMongoDB(number);
    userConfig.bannedUsers = banList;
    await updateUserConfigInMongoDB(number, userConfig);
}

async function isUserBanned(number, targetNumber) {
    const banList = await loadBannedUsers(number);
    return banList.includes(targetNumber);
}

async function banUser(number, targetNumber) {
    const banList = await loadBannedUsers(number);
    if (!banList.includes(targetNumber)) {
        banList.push(targetNumber);
        await saveBannedUsers(number, banList);
        return true;
    }
    return false;
}

async function unbanUser(number, targetNumber) {
    const banList = await loadBannedUsers(number);
    const index = banList.indexOf(targetNumber);
    if (index > -1) {
        banList.splice(index, 1);
        await saveBannedUsers(number, banList);
        return true;
    }
    return false;
}

module.exports = {
    connectDB,
    saveSessionToMongoDB,
    getSessionFromMongoDB,
    getUserConfigFromMongoDB,
    updateUserConfigInMongoDB,
    addNumberToMongoDB,
    getAllNumbersFromMongoDB,
    loadSudoUsers,
    saveSudoUsers,
    isSudoUser,
    addSudoUser,
    removeSudoUser,
    loadBannedUsers,
    saveBannedUsers,
    isUserBanned,
    banUser,
    unbanUser,
    Session,
    BotNumber,
    OTP
};
